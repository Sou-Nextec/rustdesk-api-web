#requires -version 5.1
$ErrorActionPreference = 'Stop'
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Instalar-Nextec.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Updater syntax invalid'}
foreach($name in @('Get-NextecServiceExecutablePath','Get-NextecServiceProfileRoot','Get-NextecPeerId','Get-NextecInstalledClient','IdDoRustDesk')){
 $f=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 if(-not $f){throw "Updater missing canonical discovery: $name"}
 . ([scriptblock]::Create($f.Extent.Text))
}
function Get-NextecInstalledClient { [pscustomobject]@{PeerId='536822159'} }
if((IdDoRustDesk) -ne '536822159'){throw 'Updater did not use service identity'}
function Get-NextecInstalledClient { throw 'identity_conflict: multiple services' }
$blocked=$false
try {IdDoRustDesk | Out-Null} catch {$blocked=$_.Exception.Message -match 'identity_conflict'}
if(-not $blocked){throw 'Updater swallowed conflicting identity'}
function Get-NextecInstalledClient { throw 'identity_conflict: nenhum serviço instalado do RustDesk/Nextec foi encontrado.' }
if((IdDoRustDesk) -ne ''){throw 'First installation must allow no installed client'}
'Updater canonical identity: PASS'
