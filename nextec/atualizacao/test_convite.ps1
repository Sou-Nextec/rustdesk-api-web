#requires -version 5.1
# Convite de instalacao: o coordenador tira o codigo do nome do MSI e o provisionador o apresenta ao painel.
$ErrorActionPreference = 'Stop'
foreach ($source in @('Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1')) {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $source), [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw "syntax invalid: $source" }
  foreach ($f in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) { . ([scriptblock]::Create($f.Extent.Text)) }
}
$script:NextecPainelFixo = 'https://painel-remoto.nex.tec.br'
function Assert($value, [string]$message) { if (-not $value) { throw $message } }
# Sem ACL, DPAPI nem disco protegido: mesmos duples dos outros testes.
function Assert-NextecProvisionPath { param($Path) }
function Assert-NextecProvisionFileAcl { param($Path) }
function Assert-NextecCoordinatorPath { param($Path) }
function New-NextecCoordinatorAcl { param([switch]$Directory) $null }
function Set-Acl { param($LiteralPath, $AclObject) }
function Protect-NextecProvisionValue { param($Value) return 'dpapi:' + $Value }
function Unprotect-NextecProvisionValue { param($Value) return $Value.Substring(6) }
function Write-NextecProvisionLog { param($Code,$Root) $script:logs.Add([string]$Code) | Out-Null }

$CODE = 'K7M2QX9P4TA8B3C5D6E2'
$root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-convite-' + [Guid]::NewGuid().ToString('N'))
$script:logs = New-Object System.Collections.Generic.List[string]
$t0 = [DateTime]::SpecifyKind([DateTime]'2026-10-16T12:00:00', [DateTimeKind]::Utc)
function New-Root {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  $script:logs.Clear()
}
function Write-Invite($Data) {
  [IO.File]::WriteAllText((Join-Path $root 'convite.json'), ($Data | ConvertTo-Json -Compress))
}
try {
  # codigo no nome: aceito, com sufixo de download repetido e caixa baixa; tudo mais e recusado
  Assert ((Get-NextecInviteCode -Origem "C:\Users\x\Downloads\Cliente-Nextec-Connect-$CODE.msi") -ceq $CODE) 'codigo no nome nao lido'
  Assert ((Get-NextecInviteCode -Origem "C:\d\Cliente-$CODE (1).msi") -ceq $CODE) 'sufixo (1) nao aceito'
  Assert ((Get-NextecInviteCode -Origem "C:\d\Cliente-$($CODE.ToLower()).msi") -ceq $CODE) 'caixa baixa nao normalizada'
  foreach ($bad in @('', 'C:\d\Cliente.msi', 'C:\d\Cliente-CURTO.msi', "C:\d\Cliente-${CODE}0.msi", 'C:\d\Cliente-IIIIIIIIIIIIIIIIIIII.msi', "C:\d\$CODE.exe", "C:\$CODE\Cliente.msi")) {
    Assert ((Get-NextecInviteCode -Origem $bad) -ceq '') "nome indevido aceito: $bad"
  }
  Write-Host 'PASS Invite_CodeFromFileName'

  # coordenador: grava convite.json so quando ha codigo
  New-Root
  Assert (-not (Save-NextecInvite -Root $root -Origem 'C:\d\Cliente.msi')) 'gravou convite sem codigo'
  Assert (-not (Test-Path -LiteralPath (Join-Path $root 'convite.json'))) 'convite.json criado sem codigo'
  Assert (Save-NextecInvite -Root $root -Origem "C:\d\Cliente-$CODE.msi") 'nao gravou convite com codigo'
  $saved = Get-Content -LiteralPath (Join-Path $root 'convite.json') -Raw | ConvertFrom-Json
  Assert ($saved.codigo -ceq $CODE) 'codigo gravado diferente'
  Write-Host 'PASS Invite_CoordinatorWritesOnlyWithCode'

  $paths = Get-NextecProvisionPaths -Root $root
  function Write-NextecProtectedJson { param($Path,$Value) $Value | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $Path -Encoding UTF8 }
  function Add-Credential {
    Write-NextecProtectedJson -Path $paths.AgentConfig -Value ([pscustomobject]@{ painel = $script:NextecPainelFixo; id = '536822159'; token = (Protect-NextecProvisionValue 'tok-teste') })
  }
  function Invoke-Claim([int]$Status) {
    $script:posted = $null
    $script:answer = $Status
    Invoke-NextecInviteClaim -Root $root -Now $t0 -PostInvite { param($panel, $body) $script:posted = $body; $script:answer }
  }

  # aceito (200): apresenta id/token/codigo e apaga o arquivo
  New-Root; Add-Credential; Write-Invite @{ codigo = $CODE; criado_utc = $t0.ToString('o') }
  Assert ((Invoke-Claim 200) -eq 'claimed') 'convite aceito nao concluiu'
  Assert ($script:posted.id -eq '536822159' -and $script:posted.token -ceq 'tok-teste' -and $script:posted.code -ceq $CODE) 'corpo do convite incorreto'
  Assert (-not (Test-Path -LiteralPath $paths.Invite)) 'convite aceito continua no disco'
  Assert ($script:logs -contains 'invite_claimed') 'log invite_claimed ausente'
  Write-Host 'PASS Invite_ClaimedAndRemoved'

  # falhas temporarias mantem o arquivo; respostas definitivas apagam
  foreach ($temp in @(0, 401, 429, 500, 503)) {
    New-Root; Add-Credential; Write-Invite @{ codigo = $CODE; criado_utc = $t0.ToString('o') }
    Assert ((Invoke-Claim $temp) -eq 'retry') "status $temp deveria tentar de novo"
    Assert (Test-Path -LiteralPath $paths.Invite) "status $temp apagou o convite"
  }
  # 403 (convite recusado) e 409 (maquina de outro cliente) nao apagam o convite: o motivo fica gravado e a nova tentativa so
  # acontece depois de 6 h (detalhes em test_convite_resultado.ps1)
  foreach ($final in @(@{ s = 403; r = 'rejected' }, @{ s = 409; r = 'conflict' })) {
    New-Root; Add-Credential; Write-Invite @{ codigo = $CODE; criado_utc = $t0.ToString('o') }
    Assert ((Invoke-Claim $final.s) -eq $final.r) "status $($final.s) deveria registrar $($final.r)"
    Assert (Test-Path -LiteralPath $paths.Invite) "status $($final.s) apagou o convite"
  }
  Write-Host 'PASS Invite_RetryAndKeepRules'

  # sem credencial: espera sem chamar o painel; vencido (72 h), codigo invalido e data no futuro: descarta sem rede
  New-Root; Write-Invite @{ codigo = $CODE; criado_utc = $t0.ToString('o') }
  Assert ((Invoke-Claim 200) -eq 'waiting' -and $null -eq $script:posted) 'sem credencial deveria esperar sem chamar o painel'
  $cases = @(
    @{ codigo = $CODE; criado_utc = $t0.AddHours(-73).ToString('o') },
    @{ codigo = 'curto'; criado_utc = $t0.ToString('o') },
    @{ codigo = $CODE; criado_utc = $t0.AddHours(5).ToString('o') },
    @{ codigo = $CODE; criado_utc = 'ontem' }
  )
  foreach ($case in $cases) {
    New-Root; Add-Credential; Write-Invite $case
    Assert ((Invoke-Claim 200) -eq 'discarded' -and $null -eq $script:posted) 'convite invalido/vencido deveria ser descartado sem rede'
    Assert (-not (Test-Path -LiteralPath $paths.Invite)) 'convite descartado continua no disco'
  }
  New-Root
  Assert ((Invoke-Claim 200) -eq 'none') 'sem convite deveria ser none'
  Write-Host 'PASS Invite_WaitingExpiredAndInvalid'

  # o POST real so fala com o painel configurado (https) ou com o servidor falso local
  $threw = $false; try { Invoke-NextecInvitePost -Panel 'https://outro.exemplo.com' -Body @{} | Out-Null } catch { $threw = $true }
  Assert $threw 'POST aceitou painel diferente do configurado'
  $threw = $false; try { Invoke-NextecInvitePost -Panel $script:NextecPainelFixo -Body @{} -TestOrigin 'http://example.com:80' | Out-Null } catch { $threw = $true }
  Assert $threw 'TestOrigin fora de 127.0.0.1 aceito'
  Write-Host 'PASS Invite_PostTargetsOnlyThePanel'
  Write-Host 'PASS: convite de instalacao'
} finally {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
}
