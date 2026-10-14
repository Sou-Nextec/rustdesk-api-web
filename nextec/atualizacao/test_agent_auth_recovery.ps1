#requires -version 5.1
# Caso de campo (13/10/2026): agente antigo com credencial que o painel nao reconhece recebia 401 a cada 5 minutos,
# para sempre, e bloqueava o cadastro novo. Agora 3 recusas seguidas aposentam a credencial e o cadastro recomeca.
$ErrorActionPreference = 'Stop'
$agentScript = Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($agentScript, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw "Agente-Senha-Nextec.ps1 nao compilou: $($errors[0].Message)" }
foreach ($name in @('Get-NextecHttpStatus', 'Register-NextecAuthFailure', 'Update-NextecAuthFailures')) {
  $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  if (-not $definition) { throw "Funcao ausente: $name" }
  . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "ASSERT: $Message" } }

$root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-auth-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
  # status HTTP real de uma WebException (painel falso local respondendo 401)
  $port = Get-Random -Minimum 30000 -Maximum 45000
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://127.0.0.1:$port/")
  $listener.Start()
  $ps = [PowerShell]::Create()
  [void]$ps.AddScript({
    param($listener)
    while ($listener.IsListening) {
      try { $ctx = $listener.GetContext() } catch { break }
      $ctx.Response.StatusCode = 401
      $ctx.Response.Close()
    }
  }).AddArgument($listener)
  $handle = $ps.BeginInvoke()
  try {
    $status = 0
    try { Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/nextec/agent/sync" -Method Post -Body '{}' -UseBasicParsing -TimeoutSec 10 | Out-Null }
    catch { $status = Get-NextecHttpStatus $_.Exception }
    Assert ($status -eq 401) "status HTTP lido da excecao foi $status, esperado 401"
  } finally {
    $listener.Stop(); $listener.Close()
    try { $ps.EndInvoke($handle) } catch {}
    $ps.Dispose()
  }
  Assert ((Get-NextecHttpStatus ([Exception]::new('sem resposta'))) -eq 0) 'erro sem resposta HTTP deve dar status 0'
  Write-Host 'PASS AuthRecovery_ReadsHttpStatus'

  $config = Join-Path $root 'agente-senha.json'
  $counter = Join-Path $root 'agente-senha.falhas'
  $selfState = Join-Path $root 'inscricao-estado.json'
  Set-Content -LiteralPath $config -Value '{"painel":"https://painel-remoto.nex.tec.br","id":"536822159","token":"x"}' -Encoding UTF8
  Set-Content -LiteralPath $selfState -Value '{}' -Encoding UTF8
  Assert (-not (Register-NextecAuthFailure -CounterPath $counter -ConfigPath $config -DataRoot $root)) '1o 401 nao pode aposentar a credencial'
  Assert (-not (Register-NextecAuthFailure -CounterPath $counter -ConfigPath $config -DataRoot $root)) '2o 401 nao pode aposentar a credencial'
  Assert (Test-Path -LiteralPath $config) 'credencial sumiu antes do limite'
  Assert (Register-NextecAuthFailure -CounterPath $counter -ConfigPath $config -DataRoot $root) '3o 401 seguido deve aposentar a credencial'
  Assert (-not (Test-Path -LiteralPath $config)) 'credencial morta continuou ativa'
  Assert (Test-Path -LiteralPath ($config + '.anterior')) 'credencial morta nao foi guardada ao lado'
  Assert (-not (Test-Path -LiteralPath $selfState)) 'estado de inscricao antigo nao foi limpo'
  Assert (-not (Test-Path -LiteralPath $counter)) 'contador nao zerou'
  Write-Host 'PASS AuthRecovery_ThreeConsecutive401RetireCredential'

  # "tres SEGUIDAS": 401, 503, 401, 401 nao aposenta (a sequencia foi interrompida); mais um 401 completa tres seguidas.
  Set-Content -LiteralPath $config -Value '{"id":"536822159"}' -Encoding UTF8
  Remove-Item -LiteralPath $counter -Force -ErrorAction SilentlyContinue
  foreach ($status in @(401, 503, 401, 401)) {
    Assert (-not (Update-NextecAuthFailures -Status $status -CounterPath $counter -ConfigPath $config -DataRoot $root)) "status $status nao pode aposentar (sequencia 401,503,401,401)"
  }
  Assert (Test-Path -LiteralPath $config) 'credencial aposentada sem tres 401 seguidos'
  Assert (Update-NextecAuthFailures -Status 401 -CounterPath $counter -ConfigPath $config -DataRoot $root) 'terceiro 401 seguido deve aposentar'
  Assert (-not (Test-Path -LiteralPath $config)) 'credencial continuou ativa depois de tres 401 seguidos'
  Remove-Item -LiteralPath ($config + '.anterior') -Force -ErrorAction SilentlyContinue
  foreach ($status in @(401, 401, 0, 401, 401)) {
    Set-Content -LiteralPath $config -Value '{}' -Encoding UTF8
    [void](Update-NextecAuthFailures -Status $status -CounterPath $counter -ConfigPath $config -DataRoot $root)
  }
  Assert (Test-Path -LiteralPath $config) 'falha de rede (status 0) no meio nao interrompe a sequencia'
  Write-Host 'PASS AuthRecovery_OnlyConsecutive401Count'

  # contador corrompido nao derruba nada
  Set-Content -LiteralPath $config -Value '{}' -Encoding UTF8
  Set-Content -LiteralPath $counter -Value 'lixo' -Encoding UTF8
  Assert (-not (Register-NextecAuthFailure -CounterPath $counter -ConfigPath $config -DataRoot $root)) 'contador corrompido deve recomecar do zero'
  Write-Host 'PASS AuthRecovery_CorruptCounterRestarts'

  # o -Executar sai sem erro quando nao ha credencial (cadastro em andamento)
  $source = [IO.File]::ReadAllText($agentScript)
  Assert ($source -match 'if \(-not \(Test-Path -LiteralPath \$Config -PathType Leaf\)\) \{ return \}') 'Executar sem credencial deve sair em silencio'
  Write-Host 'PASS AuthRecovery_NoCredentialIsQuiet'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host 'Todos os testes de recuperacao de credencial passaram.'
