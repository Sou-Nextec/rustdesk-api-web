#requires -version 5.1
# Log REAL do provisionador (provisionamento-agente.log), sem duble de Write-NextecProvisionLog: grava em arquivo e
# valida lendo o arquivo. So o que exige elevacao (Set-Acl e a conferencia de ACL) e substituido; lista de codigos,
# normalizacao e escrita sao as do script. Regressao do BUG 1 do Sandbox (old_agent_replace_* virava protocol_error).
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'Provisionar-Agente-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Provisioner syntax invalid' }
foreach ($function in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  . ([scriptblock]::Create($function.Extent.Text))
}
function Set-Acl { param($LiteralPath, $AclObject) }
function Assert-NextecProvisionFileAcl { param($Path) }
function Assert($value, [string]$message) { if (-not $value) { throw $message } }

$root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-log-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
$log = (Get-NextecProvisionPaths -Root $root).Log
function Read-LogCodes { if (-not (Test-Path -LiteralPath $log)) { return @() }; @(Get-Content -LiteralPath $log -Encoding UTF8 | ForEach-Object { ([string]$_) -replace '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ', '' }) }
try {
  $codes = @(Get-NextecProvisionLogCodes)
  Assert ($codes.Count -eq @($codes | Select-Object -Unique).Count) 'lista de codigos com repeticao'
  foreach ($c in @('old_agent_replace_formato_antigo','old_agent_replace_outro_id','old_agent_replace_token_recusado','old_agent_replace_agente_parado','agent_repaired','unknown_code','protocol_error','complete')) {
    Assert ($codes -ccontains $c) "codigo ausente da lista unica: $c"
  }

  # 1) cada codigo da lista chega ao arquivo exatamente como foi pedido
  foreach ($c in $codes) { Write-NextecProvisionLog -Code $c -Root $root }
  $got = Read-LogCodes
  Assert ($got.Count -eq $codes.Count) "linhas gravadas: $($got.Count) de $($codes.Count)"
  for ($i = 0; $i -lt $codes.Count; $i++) { Assert ($got[$i] -ceq $codes[$i]) "codigo $($codes[$i]) saiu como '$($got[$i])'" }
  Assert (-not ($got -ccontains 'protocol_error' -and ($got | Where-Object { $_ -ceq 'protocol_error' }).Count -gt 1)) 'protocol_error gravado alem do pedido'
  Write-Host 'PASS Log_EveryListedCodeIsWrittenVerbatim'

  # 2) codigo desconhecido: nao lanca, vira unknown_code com o texto, em uma linha so, sem confundir o .cmd
  Remove-Item -LiteralPath $log -Force
  Write-NextecProvisionLog -Code 'codigo_inventado' -Root $root
  Write-NextecProvisionLog -Code "linha1`r`nlinha2 protocol_error" -Root $root
  Write-NextecProvisionLog -Code 'termina_em_protocol_error' -Root $root
  Write-NextecProvisionLog -Code ('x' * 200) -Root $root
  Write-NextecProvisionLog -Code 'sensitive-bootstrap-secret-AbCdEf0123456789' -Root $root
  Write-NextecProvisionLog -Code 'Falha: acao invalida' -Root $root
  $got = Read-LogCodes
  Assert ($got.Count -eq 6) "esperava 6 linhas, havia $($got.Count)"
  Assert ($got[0] -ceq 'unknown_code [codigo_inventado]') "desconhecido: $($got[0])"
  Assert ($got[1] -cmatch '^unknown_code \[linha1\?\?linha2 protocol_error\]$') "quebra de linha nao neutralizada: $($got[1])"
  Assert ($got[2] -cmatch '\]$' -and $got[2] -cmatch '^unknown_code \[') "texto no fim da linha: $($got[2])"
  Assert ($got[3].Length -le 'unknown_code []'.Length + 48) "texto sem limite: $($got[3].Length)"
  Assert ($got[4] -ceq 'unknown_code [redigido]' -and $got[4] -notmatch 'secret|AbCdEf') "segredo vazou: $($got[4])"
  Assert ($got[5] -ceq 'unknown_code [Falha: acao invalida]') "texto livre: $($got[5])"
  foreach ($l in $got) { Assert ($l -cnotmatch '(protocol_error|complete|already_enrolled)$') "linha terminada em codigo conhecido: $l" }
  Write-Host 'PASS Log_UnknownCodeIsRecordedWithTextAndNeverThrows'

  # 3) validador por arquivo: toda linha do log real e codigo da lista ou unknown_code [texto]
  Remove-Item -LiteralPath $log -Force
  foreach ($c in @('old_agent_replace_formato_antigo','agent_repaired','qualquer coisa')) { Write-NextecProvisionLog -Code $c -Root $root }
  foreach ($l in (Read-LogCodes)) {
    Assert (($codes -ccontains $l) -or $l -cmatch '^unknown_code \[[^\]]*\]$') "linha fora do formato: $l"
    Assert ($l -cne 'protocol_error') 'codigo valido virou protocol_error'
  }
  Write-Host 'PASS Log_FileValidatesAgainstSingleList'
} finally {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}
