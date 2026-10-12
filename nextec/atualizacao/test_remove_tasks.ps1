#requires -version 5.1
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'Coordenar-Agente-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Coordinator syntax invalid' }
$functionAst = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Remove-NextecCoordinatorTasks' }, $true)
if (-not $functionAst) { throw 'Removal function missing' }
. ([scriptblock]::Create($functionAst.Extent.Text))

$script:stopped = New-Object System.Collections.Generic.List[string]
$script:removed = New-Object System.Collections.Generic.List[string]
function Stop-ScheduledTask {
  param([string]$TaskName, [string]$ErrorAction)
  $script:stopped.Add($TaskName) | Out-Null
}
function Unregister-ScheduledTask {
  param([string]$TaskName, [switch]$Confirm, [string]$ErrorAction)
  if ($Confirm) { throw 'Removal must not prompt for confirmation' }
  $script:removed.Add($TaskName) | Out-Null
}
function Assert([bool]$Value, [string]$Message) { if (-not $Value) { throw $Message } }

$dataRoot = Join-Path ([IO.Path]::GetTempPath()) ('nextec-remove-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
$config = Join-Path $dataRoot 'agent-config.json'
$identity = Join-Path $dataRoot 'identity.json'
Set-Content -LiteralPath $config -Value '{"token":"sentinel"}' -NoNewline
Set-Content -LiteralPath $identity -Value '{"uuid":"sentinel"}' -NoNewline
$configBefore = (Get-Content -Raw -LiteralPath $config)
$identityBefore = (Get-Content -Raw -LiteralPath $identity)
try {
  Remove-NextecCoordinatorTasks | Out-Null
  $expected = @('Nextec Acesso - Cadastro de agente', 'Nextec Acesso - Senha')
  Assert (($script:stopped -join '|') -ceq ($expected -join '|')) 'Not all Nextec tasks were stopped in the expected order'
  Assert (($script:removed -join '|') -ceq ($expected -join '|')) 'Not all Nextec tasks were unregistered in the expected order'
  Assert ((Get-Content -Raw -LiteralPath $config) -ceq $configBefore) 'Agent config was modified by task removal'
  Assert ((Get-Content -Raw -LiteralPath $identity) -ceq $identityBefore) 'Identity file was modified by task removal'
  Write-Host 'PASS RemoveTasks_StopsAndUnregistersOnlyTasksPreservingIdentity'
} finally {
  Remove-Item -LiteralPath $dataRoot -Recurse -Force
}
