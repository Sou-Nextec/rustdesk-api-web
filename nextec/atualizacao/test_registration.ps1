$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'Instalar-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Invalid updater syntax' }
$function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'RegistrarAtualizador' }, $true)
if (-not $function) { throw 'Registration function missing' }
. ([scriptblock]::Create($function.Extent.Text))

# No elevation, real scheduled tasks, registry changes or network in this test.
function ProtegerPastaAtualizador { $script:protected = $true }
function Escrever { param($message) }
function New-ScheduledTaskAction {
  param($Execute, $Argument)
  if ($Execute -ne (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) { throw 'Unexpected executable' }
  if ($Argument -match '-Registrar' -or $Argument -notmatch '-Silencioso') { throw 'Task must check updates, not register again' }
  return @{ Execute = $Execute; Argument = $Argument }
}
function New-ScheduledTaskTrigger {
  param([switch]$Daily, $At, [TimeSpan]$RandomDelay)
  if ($RandomDelay -ne [TimeSpan]::FromHours(2)) { throw 'Random delay must be passed through the cmdlet for ISO-8601 encoding' }
  return @{ RandomDelay = 'PT2H' }
}
function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable, [switch]$AllowStartIfOnBatteries, [switch]$DontStopIfGoingOnBatteries, $ExecutionTimeLimit, $MultipleInstances) if ($MultipleInstances -ne 'IgnoreNew') { throw 'Concurrent task execution allowed' }; return @{} }
function Register-ScheduledTask {
  param($TaskName, $Action, $Trigger, $Settings, $User, $RunLevel, [switch]$Force)
  if (-not $script:protected -or $User -ne 'SYSTEM' -or $RunLevel -ne 'Highest') { throw 'Task security configuration invalid' }
  $script:registered++
}
$Pasta = Join-Path ([IO.Path]::GetTempPath()) ('connect-register-' + [Guid]::NewGuid().ToString('N'))
$SoVerificar = $false
$script:OrigemAtualizador = $source
$UrlBase = 'https://painel.exemplo/api/nextec/update'
$Tarefa = 'Nextec Acesso - Atualizacao'
$script:registered = 0
New-Item -ItemType Directory -Path $Pasta | Out-Null
try {
  RegistrarAtualizador
  if ((Get-FileHash $source).Hash -ne (Get-FileHash (Join-Path $Pasta 'Instalar-Nextec.ps1')).Hash) { throw 'Copied wrong script' }
  RegistrarAtualizador
  if ($script:registered -ne 2) { throw 'Registration is not repeatable' }
  $SoVerificar = $true
  $blocked = $false
  try { RegistrarAtualizador } catch { $blocked = $true }
  if (-not $blocked -or $script:registered -ne 2) { throw 'Verification mode registered task' }
  'Registration contract: PASS (mocked task and ACL)'
} finally {
  Remove-Item -LiteralPath (Join-Path $Pasta 'Instalar-Nextec.ps1') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Pasta -Force
}
