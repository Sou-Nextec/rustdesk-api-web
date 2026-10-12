#requires -version 5.1
$ErrorActionPreference='Stop'
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1'),[ref]$null,[ref]$null)
$fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Register-NextecPasswordTask'},$true)
if(!$fn){throw 'Registration helper missing'}
. ([scriptblock]::Create($fn.Extent.Text))
$PastaDados='C:\ProgramData\Nextec\Acesso'; $env:SystemRoot='C:\Windows'; $Exe=''; $Tarefa='Nextec Acesso - Senha'
$script:copies=0; $script:checked=@(); $script:task=$null
function Assert-NextecNoReparsePoints($Path){$script:checked+= $Path; if($Path -eq $script:badPath){throw 'unsafe_path'}}
function Copy-Item {param($LiteralPath,$Destination,[switch]$Force) $script:copies++}
function Set-Acl {param($LiteralPath,$AclObject)}
function New-NextecSecureAcl{return 'ACL'}
function New-ScheduledTaskAction {param($Execute,$Argument) [pscustomobject]@{Execute=$Execute;Argument=$Argument}}
function New-ScheduledTaskTrigger {param([switch]$Once,$At,$RepetitionInterval,$RepetitionDuration) [pscustomobject]@{Interval=$RepetitionInterval}}
function New-ScheduledTaskSettingsSet {param([switch]$StartWhenAvailable,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,$ExecutionTimeLimit,$MultipleInstances) [pscustomobject]@{Instances=$MultipleInstances}}
function Register-ScheduledTask {param($TaskName,$Action,$Trigger,$Settings,$User,$RunLevel,[switch]$Force) $script:task=[pscustomobject]@{Name=$TaskName;Action=$Action;Trigger=$Trigger;Settings=$Settings;User=$User;RunLevel=$RunLevel}}
Register-NextecPasswordTask -Source 'C:\Program Files\Nextec-Connect\Agente-Senha-Nextec.ps1'
if($task.User -ne 'SYSTEM' -or $task.Settings.Instances -ne 'IgnoreNew' -or $task.Trigger.Interval.TotalMinutes -ne 5){throw 'Unsafe task registration'}
if($task.Action.Argument -notmatch '-Executar' -or $task.Action.Argument -match 'token|bootstrap|ChaveAgente'){throw 'Credential in task arguments'}
$script:badPath=Join-Path $PastaDados 'Agente-Senha-Nextec.ps1'; $script:copies=0
try {Register-NextecPasswordTask -Source 'C:\Program Files\Nextec-Connect\Agente-Senha-Nextec.ps1'; throw 'expected refusal'} catch {if($_.Exception.Message -ne 'unsafe_path'){throw}}
if($copies -ne 0){throw 'Unsafe destination was copied before validation'}
$script:badPath=$null; $script:copies=0
Register-NextecPasswordTask -Source (Join-Path $PastaDados 'Agente-Senha-Nextec.ps1')
if($copies -ne 0){throw 'Repair copied a file onto itself'}
Write-Host 'PASS agent SYSTEM registration, protected destination and idempotent repair'
