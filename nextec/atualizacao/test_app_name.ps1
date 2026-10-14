#requires -version 5.1
# O agente informa ao painel o nome do app instalado (AppName do marcador) no sync, sem nome fixo no script:
# registro HKLM\SOFTWARE\Nextec\Agente (aqui uma chave de teste em HKCU) ou nextec-marker.json; nome invalido nao e enviado.
$ErrorActionPreference = 'Stop'
function Assert($value, [string]$message) { if (-not $value) { throw $message } }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('nextec-appname-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$regKey = 'HKCU:\Software\NextecTeste\' + [Guid]::NewGuid().ToString('N')

$script = Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors)
Assert ($errors.Count -eq 0) 'sintaxe invalida em Agente-Senha-Nextec.ps1'
function Import-Funcao([string]$nome) {
  $f = $ast.FindAll({ param($x) $x -is [Management.Automation.Language.FunctionDefinitionAst] -and $x.Name -ceq $nome }, $true) | Select-Object -First 1
  Assert $f "$nome ausente em Agente-Senha-Nextec.ps1"
  return $f.Extent.Text
}
. ([scriptblock]::Create((Import-Funcao 'Get-NextecAppName')))
$cicloTexto = Import-Funcao 'Invoke-NextecPasswordCycle'

try {
  $root = Join-Path $tmp 'dados'
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  New-Item -Path $regKey -Force | Out-Null
  $marcador = Join-Path $root 'nextec-marker.json'

  # sem marcador: vazio (o painel usa o protocolo global)
  Assert ((Get-NextecAppName -Root $root -RegistryKey $regKey) -ceq '') 'sem marcador deveria devolver vazio'

  # arquivo: AppName, app_name e app
  foreach ($campo in 'AppName', 'app_name', 'app') {
    @{ $campo = 'Client-Nextec-Connect' } | ConvertTo-Json -Compress | Set-Content -LiteralPath $marcador -Encoding UTF8
    Assert ((Get-NextecAppName -Root $root -RegistryKey $regKey) -ceq 'Client-Nextec-Connect') "marcador com $campo ignorado"
  }
  # registro vence o arquivo
  Set-ItemProperty -LiteralPath $regKey -Name AppName -Value 'Nome-Do-Registro'
  Assert ((Get-NextecAppName -Root $root -RegistryKey $regKey) -ceq 'Nome-Do-Registro') 'registro deveria vencer o arquivo'

  # nomes invalidos nao sao enviados (espaco, barra, vazio, longo, caractere de controle)
  Remove-ItemProperty -LiteralPath $regKey -Name AppName
  foreach ($ruim in 'Meu App', 'a/b', '', ('x' * 65), 'ab;cd', 'a:b') {
    @{ AppName = $ruim } | ConvertTo-Json -Compress | Set-Content -LiteralPath $marcador -Encoding UTF8
    Assert ((Get-NextecAppName -Root $root -RegistryKey $regKey) -ceq '') "nome invalido aceito: '$ruim'"
  }
  Set-Content -LiteralPath $marcador -Value '{nao json' -Encoding UTF8
  Assert ((Get-NextecAppName -Root $root -RegistryKey $regKey) -ceq '') 'json invalido deveria devolver vazio'

  # o sync leva app_name quando o marcador existe e nao leva quando nao existe
  @{ AppName = 'Client-Nextec-Connect' } | ConvertTo-Json -Compress | Set-Content -LiteralPath $marcador -Encoding UTF8
  function Revelar([string]$b64) { return 'token-de-teste' }
  function Chamar([string]$caminho, [hashtable]$corpo) { $script:corpoVisto = $corpo; $script:caminhoVisto = $caminho; throw 'PARADA_DO_TESTE' }
  $PastaDados = $root
  . ([scriptblock]::Create($cicloTexto))
  $cfg = [pscustomobject]@{ id = '123456789'; token = 'x' }
  $script:corpoVisto = $null
  try { Invoke-NextecPasswordCycle $cfg | Out-Null } catch { Assert ($_.Exception.Message -ceq 'PARADA_DO_TESTE') ('erro inesperado: ' + $_.Exception.Message) }
  Assert ($script:caminhoVisto -ceq '/api/nextec/agent/sync') 'o primeiro pedido nao e o sync'
  Assert ($script:corpoVisto.app_name -ceq 'Client-Nextec-Connect') 'sync sem app_name'
  Assert ($script:corpoVisto.id -ceq '123456789' -and $script:corpoVisto.token -ceq 'token-de-teste' -and @($script:corpoVisto.capabilities) -contains 'transaction_v1') 'campos antigos do sync mudaram'

  Remove-Item -LiteralPath $marcador -Force
  $script:corpoVisto = $null
  # sem marcador nem registro de producao nesta maquina de teste: o corpo nao pode carregar um nome inventado
  try { Invoke-NextecPasswordCycle $cfg | Out-Null } catch { }
  Assert ($null -ne $script:corpoVisto) 'o sync nao foi chamado'
  Assert ((-not $script:corpoVisto.ContainsKey('app_name')) -or ($script:corpoVisto.app_name -cmatch '^[A-Za-z0-9-]{1,64}$')) 'app_name invalido enviado'

  # nenhum nome de app fixo no script (principio: descobrir por dados)
  $texto = [IO.File]::ReadAllText($script, [Text.Encoding]::UTF8)
  $m = [regex]::Match((Import-Funcao 'Get-NextecAppName'), 'Client-Nextec|Nextec-Connect|rustdesk', 'IgnoreCase')
  Assert (-not $m.Success) ('nome de app fixo em Get-NextecAppName: ' + $m.Value)
  'test_app_name: PASS'
} finally {
  Remove-Item -LiteralPath $regKey -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
