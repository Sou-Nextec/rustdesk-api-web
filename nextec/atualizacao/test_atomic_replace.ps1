#requires -version 5.1
# Regressão: gravar duas vezes sobre o mesmo caminho não pode falhar no Windows PowerShell 5.1
# ([IO.File]::Replace com $null vira "" e lança "The path is not of a legal form").
$ErrorActionPreference = 'Stop'
function Assert($value, [string]$message) { if (-not $value) { throw $message } }
function Get-FunctionText([string]$File, [string]$Name) {
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $File), [ref]$tokens, [ref]$errors)
  if ($errors.Count) { throw "$File syntax invalid" }
  $fn = $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $Name }, $true) | Select-Object -First 1
  if (-not $fn) { throw "$Name not found in $File" }
  $fn.Extent.Text
}
# Duplos: sem ACL real nem verificação de caminho protegido.
function Assert-NextecProvisionPath { param($Path) }
function New-NextecProvisionAcl { return $null }
function Set-Acl { param($LiteralPath, $AclObject) }
function Assert-NextecNoReparsePoints { param($Path) }

$root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-replace-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
  . ([scriptblock]::Create((Get-FunctionText 'Provisionar-Agente-Nextec.ps1' 'Write-NextecProtectedJson')))
  $p = Join-Path $root 'journal.json'
  Write-NextecProtectedJson -Path $p -Value ([ordered]@{ n = 1 })
  Write-NextecProtectedJson -Path $p -Value ([ordered]@{ n = 2 })
  Assert ((Get-Content -LiteralPath $p -Raw | ConvertFrom-Json).n -eq 2) 'Provisionar: segunda gravação não substituiu o arquivo'
  Assert (@(Get-ChildItem -LiteralPath $root -Force | Where-Object Name -like '.provision-*').Count -eq 0) 'Provisionar: temporário sobrou'

  . ([scriptblock]::Create((Get-FunctionText 'Agente-Senha-Nextec.ps1' 'Save-NextecAgentState')))
  $PastaDados = $root
  $Config = Join-Path $root 'agente-state.json'
  Save-NextecAgentState ([pscustomobject]@{ n = 1 })
  Save-NextecAgentState ([pscustomobject]@{ n = 2 })
  Assert ((Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json).n -eq 2) 'Agente-Senha: segunda gravação não substituiu o arquivo'
  Assert (@(Get-ChildItem -LiteralPath $root -Force | Where-Object Name -like 'agente-state-*.tmp').Count -eq 0) 'Agente-Senha: temporário sobrou'
  Write-Host 'test_atomic_replace: OK'
} finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
