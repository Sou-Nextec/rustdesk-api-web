#requires -version 5.1
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'Provisionar-Agente-Nextec.ps1'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Provisioner syntax invalid' }
foreach ($function in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  . ([scriptblock]::Create($function.Extent.Text))
}
$script:realNewProvisionAcl = (Get-Command New-NextecProvisionAcl).ScriptBlock
$script:realInvokeBootstrapPost = (Get-Command Invoke-NextecBootstrapPost).ScriptBlock
$script:realWriteProvisionLog = (Get-Command Write-NextecProvisionLog).ScriptBlock
$script:realAssertProvisionFileAcl = (Get-Command Assert-NextecProvisionFileAcl).ScriptBlock
$script:NextecPainelFixo = 'https://painel-remoto.nex.tec.br'
$script:NextecProvisionScriptRoot = $PSScriptRoot
$coordinatorSource = Join-Path $PSScriptRoot 'Coordenar-Agente-Nextec.ps1'
$coordinatorAst = [Management.Automation.Language.Parser]::ParseFile($coordinatorSource, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Coordinator syntax invalid' }
foreach ($function in $coordinatorAst.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  . ([scriptblock]::Create($function.Extent.Text))
}
$script:realAssertCoordinatorPath = (Get-Command Assert-NextecCoordinatorPath).ScriptBlock
$script:realAssertCoordinatorFileAcl = (Get-Command Assert-NextecCoordinatorFileAcl).ScriptBlock
function Assert-NextecCoordinatorFileAcl { param($Path) $script:coordinatorAclChecks += $Path; if ($script:failAclPath -and $Path -eq $script:failAclPath) { throw 'unsafe_path' } }

function Assert($value, [string]$message) { if (-not $value) { throw $message } }
function Assert-ProtectedAclShape($acl) {
  $allowed = @('S-1-5-18','S-1-5-32-544')
  Assert $acl.AreAccessRulesProtected 'File ACL inherits permissions'
  Assert ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -in $allowed) 'File ACL owner is not SYSTEM or Administrators'
  $rules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  Assert ($rules.Count -eq 2) 'File ACL has unexpected principals'
  foreach ($rule in $rules) {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    Assert ($sid -in $allowed -and -not $rule.IsInherited -and $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) 'File ACL grants an unexpected principal'
    Assert (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) 'Allowed principal lacks full control'
  }
}
function Initialize-NextecProvisionDirectory { param($Root) $script:directoryInitialized = $true; New-Item -ItemType Directory -Path $Root -Force | Out-Null }
function New-NextecProvisionAcl { param([switch]$Directory) return 'mock-acl' }
function New-NextecCoordinatorAcl { param([switch]$Directory) return 'mock-acl' }
function Assert-NextecProvisionPath { param($Path) }
function Assert-NextecProvisionFileAcl { param($Path) }
function Assert-NextecCoordinatorPath { param($Path) if ($script:blockedCoordinatorPath -and ([IO.Path]::GetFullPath($Path) -ieq [IO.Path]::GetFullPath($script:blockedCoordinatorPath))) { throw 'unsafe_path' }; & $script:realAssertCoordinatorPath -Path $Path }
function Set-Acl { param($LiteralPath,$AclObject) $script:aclPaths += $LiteralPath }
function Write-NextecProtectedJson { param($Path,$Value) $Value | ConvertTo-Json -Depth 6 -Compress | Set-Content -LiteralPath $Path -Encoding UTF8 }
function Protect-NextecProvisionValue { param($Value) return $Value }
function Unprotect-NextecProvisionValue { param($Value) return $Value }
function Write-NextecProvisionLog { param($Code,$Root) $script:logs.Add([string]$Code) | Out-Null }
function New-NextecProposedToken { return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }
function Invoke-NextecBootstrapPost { param($Panel,$Body) throw 'mock is injected through parameter' }
function Invoke-NextecAgentRegistration { param($ScriptPath) throw 'mock is injected through parameter' }
function Invoke-RestMethod { param($Uri,$Method,$ContentType,$Body,$TimeoutSec,$MaximumRedirection,$UserAgent) $script:httpCall=[pscustomobject]@{Uri=$Uri;Method=$Method;MaximumRedirection=$MaximumRedirection;UserAgent=$UserAgent}; return [pscustomobject]@{token='token-ack'} }
function Add-Content { param($LiteralPath,$Value,$Encoding) $script:addContentCalls++; $script:loggedValues += [string]$Value }

$script:root = Join-Path ([IO.Path]::GetTempPath()) ('nextec-coordinator-' + [Guid]::NewGuid().ToString('N'))
$script:logs = New-Object System.Collections.Generic.List[string]
$script:aclPaths = @()
$script:current = [DateTime]::SpecifyKind([DateTime]'2026-10-12T12:00:00', [DateTimeKind]::Utc)
$script:json = @{ painel=$script:NextecPainelFixo; id='536822159'; uuid='device-uuid-1'; bootstrap='Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } | ConvertTo-Json -Compress
$script:postCalls = New-Object System.Collections.Generic.List[object]
$script:registerCalls = New-Object System.Collections.Generic.List[string]
$script:coordinatorAclChecks = @()
$script:copyCount = 0
$script:addContentCalls = 0
$script:loggedValues = @()
function global:Get-CimInstance { param($ClassName,$ErrorAction) $script:cimCalls++; if ($ClassName -ne 'Win32_Service') { throw 'Unexpected CIM query' }; return $script:testServices }
function Copy-Item {
  [CmdletBinding()]
  param([string]$LiteralPath,[string]$Destination,[switch]$Force)
  $script:copyCount++
  Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
}
function New-CaseRoot {
  if (Test-Path -LiteralPath $script:root) { Remove-Item -LiteralPath $script:root -Recurse -Force }
  New-Item -ItemType Directory -Path $script:root -Force | Out-Null
  $script:current = [DateTime]::SpecifyKind([DateTime]'2026-10-12T12:00:00', [DateTimeKind]::Utc)
  $script:logs.Clear(); $script:postCalls.Clear(); $script:registerCalls.Clear(); $script:aclPaths=@(); $script:coordinatorAclChecks=@(); $script:copyCount=0; $script:failAclPath=$null; $script:addContentCalls=0; $script:loggedValues=@()
}
function Add-AuthorizationFile {
  $paths = Get-NextecProvisionPaths -Root $script:root
  Set-Content -LiteralPath $paths.Input -Value $script:json -Encoding UTF8
}
function Invoke-TestProvision {
  param([string]$Id='536822159',[DateTime]$Now=$script:current,[scriptblock]$Post)
  $discoverId = [scriptblock]::Create("'" + $Id + "'")
  if (-not $Post) {
    $Post = {
      param($panel,$body)
      $script:postCalls.Add([pscustomobject]@{panel=$panel;body=$body}) | Out-Null
      [pscustomobject]@{token=$body.proposed_token}
    }
  }
  Invoke-NextecProvisioning -Root $script:root -DiscoverId $discoverId -Now $Now -NewToken { New-NextecProposedToken } -PostBootstrap $Post -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null }
}

try {
  New-CaseRoot
  $bad = $script:json | ConvertFrom-Json
  $bad | Add-Member extra 'forbidden'
  $rejected = $false
  try { ConvertFrom-NextecStrictBootstrapJson ($bad | ConvertTo-Json -Compress) } catch { $rejected=$true }
  Assert $rejected 'Extra input property accepted'
  Assert-ProtectedAclShape (& $script:realNewProvisionAcl)
  Assert-ProtectedAclShape (& $script:realNewProvisionAcl -Directory)
  Write-Host 'PASS Input_RejectsExtraFields'

  New-CaseRoot
  $unprotectedFile = Join-Path $script:root 'unprotected.json'
  New-Item -ItemType File -Path $unprotectedFile -Force | Out-Null
  $rejectedProvisionAcl=$false; $rejectedCoordinatorAcl=$false
  try { & $script:realAssertProvisionFileAcl -Path $unprotectedFile } catch { $rejectedProvisionAcl=$true }
  try { & $script:realAssertCoordinatorFileAcl -Path $unprotectedFile } catch { $rejectedCoordinatorAcl=$true }
  Assert ($rejectedProvisionAcl -and $rejectedCoordinatorAcl) 'A non-protected script/data file passed ACL validation'
  Write-Host 'PASS FileAcl_RejectsUnprotectedExistingFile'

  $script:httpCall=$null
  & $script:realInvokeBootstrapPost -Panel $script:NextecPainelFixo -Body @{bootstrap='not-logged';id='536822159';uuid='device';proposed_token='not-logged'} | Out-Null
  Assert ($script:httpCall.Uri -eq 'https://painel-remoto.nex.tec.br/api/nextec/agent/bootstrap' -and $script:httpCall.Method -eq 'Post') 'Bootstrap request escaped the fixed HTTPS endpoint'
  Assert ($script:httpCall.MaximumRedirection -eq 0 -and $script:httpCall.UserAgent -eq 'Nextec-Connect-Agent/1') 'Bootstrap request can follow redirects or lacks client identity'
  Write-Host 'PASS Http_BootstrapDoesNotFollowRedirects'

  New-CaseRoot
  & $script:realWriteProvisionLog -Code 'sensitive-bootstrap-secret' -Root $script:root
  Assert ($script:loggedValues.Count -eq 1 -and $script:loggedValues[0] -match ' protocol_error$' -and $script:loggedValues[0] -notmatch 'sensitive-bootstrap-secret') 'Provision log did not sanitize secret-shaped values'
  $logPath = (Get-NextecProvisionPaths -Root $script:root).Log
  Remove-Item -LiteralPath $logPath -Force
  New-Item -ItemType Directory -Path $logPath -Force | Out-Null
  $rejected = $false
  try { & $script:realWriteProvisionLog -Code 'complete' -Root $script:root } catch { $rejected=$true }
  Assert ($rejected -and $script:addContentCalls -eq 1) 'Provision log appended when target was not a leaf file'
  Write-Host 'PASS Log_SanitizesCodeAndRefusesNonLeafTarget'

  New-CaseRoot
  $received = Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' }
  $paths = Get-NextecProvisionPaths -Root $script:root
  Assert (Test-Path -LiteralPath $paths.Input -PathType Leaf) 'Secure receive did not persist authorization'
  Assert ($script:aclPaths -contains $paths.Input) 'Authorization file did not receive a protected ACL'
  Assert ($received -notmatch $script:json) 'Receive response echoed authorization secret'
  Write-Host 'PASS Receive_PersistsProtectedAuthorizationWithoutEcho'

  New-CaseRoot
  $oldWinDir = $env:WinDir
  try {
    $env:WinDir = Join-Path $script:root 'windows'
    $exe = Join-Path $script:root 'rdclient.exe'
    New-Item -ItemType File -Path $exe -Force | Out-Null
    $configRoot = Join-Path (Join-Path (Join-Path $env:WinDir 'System32\config\systemprofile\AppData\Roaming') 'rdclient') 'config'
    New-Item -ItemType Directory -Path $configRoot -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $configRoot 'RustDesk.toml') -Force | Out-Null
    $script:testServices = @([pscustomobject]@{ Name='rdclient'; StartName='LocalSystem'; PathName='"' + $exe + '" --service' })
    $reader = { param($service,$exePath) $script:peerReaderCalls++; if ($exePath -cne $script:expectedExe) { throw 'Unexpected executable passed to CLI' }; '536822159' }
    $script:expectedExe = [IO.Path]::GetFullPath($exe)
    $script:cimCalls=0; $script:peerReaderCalls=0
    Import-NextecIdentityFunctions
    $directClient = Get-NextecInstalledClient -Services $script:testServices -PeerIdReader $reader -WindowsDirectory $env:WinDir
    $script:peerReaderCalls=0
    $discovered = Get-NextecProvisionLocalId -PeerIdReader $reader
    Assert ($discovered -eq '536822159') "Real installed-client discovery returned wrong PeerId: $discovered; cim=$script:cimCalls cli=$script:peerReaderCalls; funcs=$((Get-Command Get-NextecInstalledClient -ErrorAction SilentlyContinue).Name)"
    Assert (Get-Command Get-NextecInstalledClient -ErrorAction SilentlyContinue) 'Imported discovery function disappeared after return'
    Write-Host 'PASS Discovery_RealFunctionsWithCimAndCliDoubles'
  } finally { $env:WinDir = $oldWinDir }

  New-CaseRoot; Add-AuthorizationFile
  $result = Invoke-TestProvision
  $paths = Get-NextecProvisionPaths -Root $script:root
  Assert ($result -eq 'complete') ("Provision did not finish: $result; logs=$($script:logs -join ','); postCount=$($script:postCalls.Count)")
  Assert ($script:postCalls.Count -eq 1) 'Bootstrap API not called once'
  Assert ($script:postCalls[0].body.id -eq '536822159' -and $script:postCalls[0].body.uuid -eq 'device-uuid-1') 'Identity payload changed'
  Assert ($script:postCalls[0].body.proposed_token -eq 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') 'Proposed token mismatch'
  Assert (-not (Test-Path $paths.Input) -and -not (Test-Path $paths.Journal)) 'Transient files not cleaned after completion'
  $stored = Read-NextecAgentTokenConfig -Path $paths.AgentConfig
  Assert ($stored.token -eq $script:postCalls[0].body.proposed_token) 'Agent config token does not match acknowledged token'
  Assert ($script:registerCalls.Count -eq 1) 'Existing agent registrar not called once'
  Assert ($script:logs -notcontains $script:json -and $script:logs -notcontains $stored.token) 'Secret entered logs'
  Write-Host 'PASS Bootstrap_SavesProtectedTokenAndRegisters'

  New-CaseRoot; Add-AuthorizationFile
  $rejected = $false
  try { Invoke-TestProvision -Id '000000000' } catch { $rejected = ($_.Exception.Message -eq 'identity_conflict') }
  Assert ($rejected -and $script:postCalls.Count -eq 0) 'Mismatched service ID reached API'
  Assert ($script:logs -contains 'identity_conflict') 'Mismatch not diagnosed safely'
  Write-Host 'PASS Identity_MismatchDeniedBeforeNetwork'

  New-CaseRoot; Add-AuthorizationFile
  $post = { param($panel,$body) $script:postCalls.Add([pscustomobject]@{panel=$panel;body=$body}) | Out-Null; throw 'network unavailable' }
  $result1 = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -NewToken { New-NextecProposedToken } -PostBootstrap $post -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null }
  $firstToken = $script:postCalls[0].body.proposed_token
  $post = { param($panel,$body) $script:postCalls.Add([pscustomobject]@{panel=$panel;body=$body}) | Out-Null; [pscustomobject]@{token=$body.proposed_token} }
  $script:current = $script:current.AddMinutes(4)
  $result2 = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -NewToken { throw 'Token must not be regenerated' } -PostBootstrap $post -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null }
  Assert ($result1 -eq 'network_retry' -and $result2 -eq 'complete') ("Network retry did not recover: $result1/$result2; calls=$($script:postCalls.Count); logs=$($script:logs -join ',')")
  Assert ($script:postCalls.Count -eq 2 -and $script:postCalls[1].body.proposed_token -eq $firstToken) 'Retry changed the proposed token'
  Assert ($script:postCalls[1].body.bootstrap -eq $script:postCalls[0].body.bootstrap) 'Retry changed bootstrap code'
  Write-Host 'PASS NetworkRetry_ReusesSameAuthorizationAndToken'

  New-CaseRoot; $script:current = [DateTime]::SpecifyKind([DateTime]'2026-10-12T12:00:00', [DateTimeKind]::Utc); Add-AuthorizationFile
  $callsBefore = $script:postCalls.Count
  $result = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -NewToken { New-NextecProposedToken } -PostBootstrap { param($p,$b) throw 'network unavailable' } -RegisterAgent { param($path) }
  $script:current = $script:current.AddMinutes(16)
  $result = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -PostBootstrap { param($p,$b) throw 'must not call expired code' } -RegisterAgent { param($path) }
  Assert ($result -eq 'manual_authorization_required') 'Expired bootstrap kept retrying'
  Write-Host 'PASS ExpiredBootstrapRequiresManualAuthorization'

  New-CaseRoot; Add-AuthorizationFile
  $network = { param($panel,$body) throw 'network unavailable' }
  $first = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -NewToken { New-NextecProposedToken } -PostBootstrap $network -RegisterAgent { param($path) }
  Assert ($first -eq 'network_retry') 'Initial network loss did not preserve pending journal'
  $oldJson = $script:json
  try {
    $newAuthorization = @{ painel=$script:NextecPainelFixo; id='536822159'; uuid='device-uuid-1'; bootstrap='Ccccccccccccccccccccccccccccccccccccccccccc' }
    $script:json = $newAuthorization | ConvertTo-Json -Compress
    Add-AuthorizationFile
    $script:current = $script:current.AddMinutes(16)
    $sent = $null
    $result = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -NewToken { New-NextecProposedToken } -PostBootstrap { param($panel,$body) $script:sent=$body; [pscustomobject]@{token=$body.proposed_token} } -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null }
    Assert ($result -eq 'complete' -and $script:sent.bootstrap -eq $newAuthorization.bootstrap) 'New authorization could not replace an expired pending journal'
    Assert ($script:sent.proposed_token -eq 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') 'Replacement did not use the newly proposed token'
    Write-Host 'PASS ExpiredJournal_ExplicitNewAuthorizationCanRecover'
  } finally { $script:json = $oldJson }

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'existing-token'
  Add-AuthorizationFile
  $rejected=$false
  try { Invoke-TestProvision } catch { $rejected=($_.Exception.Message -eq 'already_enrolled') }
  Assert $rejected 'Existing agent token was overwritten'
  Assert ($script:postCalls.Count -eq 0) 'Bootstrap issued for an already configured agent'
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'existing-token') 'Existing token changed'
  Write-Host 'PASS ExistingAgent_NeverReenrolled'

  New-CaseRoot
  $script:taskRegistration=$null
  function New-ScheduledTaskAction { param($Execute,$Argument) if ($Argument -match '(?i)bootstrap|proposed_token|secret') { throw 'Secret was placed in task arguments' }; [pscustomobject]@{Execute=$Execute;Argument=$Argument} }
  function New-ScheduledTaskTrigger { param([DateTime]$At,[TimeSpan]$RepetitionInterval,[TimeSpan]$RepetitionDuration) if ($RepetitionInterval -ne [TimeSpan]::FromMinutes(5)) { throw 'Coordinator interval is not 5 minutes' }; [pscustomobject]@{Interval=$RepetitionInterval} }
  function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,$ExecutionTimeLimit,$MultipleInstances) if ($MultipleInstances -ne 'IgnoreNew') { throw 'Concurrent coordinators allowed' }; return @{} }
  function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Settings,$User,$RunLevel,[switch]$Force) if ($User -ne 'SYSTEM' -or $RunLevel -ne 'Highest' -or -not $Force) { throw 'Coordinator not scheduled as SYSTEM' }; $script:taskRegistration=[pscustomobject]@{TaskName=$TaskName;Action=$Action;Trigger=$Trigger} }
  Register-NextecCoordinatorTask -Root $script:root -SourceRoot $PSScriptRoot | Out-Null
  Assert ($script:taskRegistration.TaskName -eq 'Nextec Acesso - Cadastro de agente') 'Unexpected coordinator task name'
  Assert ($script:taskRegistration.Action.Argument -match '-Executar') 'Scheduled coordinator does not run without UI'
  Assert ($script:copyCount -eq 3) 'Coordinator components were not copied after validation'
  Write-Host 'PASS CoordinatorTask_SystemFiveMinuteNoSecretsInArgs'

  New-CaseRoot
  $sameRoot = Join-Path $script:root 'same'
  New-Item -ItemType Directory -Path $sameRoot -Force | Out-Null
  foreach ($name in @('Coordenar-Agente-Nextec.ps1','Provisionar-Agente-Nextec.ps1','Agente-Senha-Nextec.ps1')) {
    Microsoft.PowerShell.Management\Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $sameRoot $name)
  }
  $script:copyCount = 0
  Register-NextecCoordinatorTask -Root $sameRoot -SourceRoot $sameRoot | Out-Null
  Assert ($script:copyCount -eq 0) 'Source equal to destination was copied over itself'
  Write-Host 'PASS Coordinator_SourceEqualsDestinationIsIdempotent'

  New-CaseRoot
  $enrollSource = Join-Path $script:root 'msi'
  New-Item -ItemType Directory -Path $enrollSource -Force | Out-Null
  foreach ($name in @('Coordenar-Agente-Nextec.ps1','Provisionar-Agente-Nextec.ps1','Agente-Senha-Nextec.ps1')) {
    Microsoft.PowerShell.Management\Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $enrollSource $name)
  }
  Set-Content -LiteralPath (Join-Path $enrollSource 'inscricao.json') -Value '{"v":1,"painel":"https://painel-remoto.nex.tec.br","chave":"ChaveGlobalDeTesteNaoSecreta0123456789"}' -Encoding UTF8
  $dataRoot = Join-Path $script:root 'dados'
  $script:copyCount = 0; $script:aclPaths = @()
  Register-NextecCoordinatorTask -Root $dataRoot -SourceRoot $enrollSource | Out-Null
  Assert ($script:copyCount -eq 4 -and (Test-Path -LiteralPath (Join-Path $dataRoot 'inscricao.json') -PathType Leaf)) 'inscricao.json from the MSI folder was not copied to the data folder'
  Assert ($script:aclPaths -contains (Join-Path $dataRoot 'inscricao.json')) 'inscricao.json did not receive the protected ACL'
  Write-Host 'PASS Coordinator_CopiesEnrollmentFileWhenPresent'

  New-CaseRoot
  $maliciousDestination = Join-Path $script:root 'Provisionar-Agente-Nextec.ps1'
  $script:blockedCoordinatorPath = $maliciousDestination
  $rejected = $false
  try { Register-NextecCoordinatorTask -Root $script:root -SourceRoot $PSScriptRoot | Out-Null } catch { $rejected = ($_.Exception.Message -eq 'unsafe_path') }
  Assert ($rejected -and $script:copyCount -eq 0 -and $script:aclPaths.Count -eq 0) 'Reparse destination was not rejected before any copy or ACL change'
  $script:blockedCoordinatorPath = $null
  Write-Host 'PASS Coordinator_ReparseDestinationRejectedBeforeAnyCopy'

  New-CaseRoot
  $coordinatorPath = Join-Path $PSScriptRoot 'Coordenar-Agente-Nextec.ps1'
  $workerPath = Join-Path $script:root 'Provisionar-Agente-Nextec.ps1'
  New-Item -ItemType File -Path $workerPath -Force | Out-Null
  $script:failAclPath = $workerPath
  $rejected = $false
  try { Invoke-NextecCoordinator -Root $script:root -CoordinatorPath $coordinatorPath } catch { $rejected = ($_.Exception.Message -eq 'unsafe_path') }
  Assert ($rejected -and $script:coordinatorAclChecks.Count -eq 2 -and $script:coordinatorAclChecks[0] -eq $coordinatorPath -and $script:coordinatorAclChecks[1] -eq $workerPath) 'Coordinator did not validate both protected scripts before execution'
  Write-Host 'PASS Coordinator_ProtectedScriptsValidatedBeforeWorker'

  New-CaseRoot
  $selected = Join-Path $script:root 'bootstrap.json'
  Set-Content -LiteralPath $selected -Value '{"bootstrap":"not-logged"}' -Encoding UTF8
  $selectedPath = Select-NextecBootstrapFilePath -PickFile { $selected }
  Assert ($selectedPath -eq [IO.Path]::GetFullPath($selected)) 'Bootstrap picker did not return the selected protected-file input path'
  $wrongName = Join-Path $script:root 'other.json'
  Set-Content -LiteralPath $wrongName -Value '{}'
  $rejected = $false
  try { Select-NextecBootstrapFilePath -PickFile { $wrongName } | Out-Null } catch { $rejected = ($_.Exception.Message -eq 'invalid_authorization_file') }
  Assert $rejected 'Bootstrap picker accepted a file with a different name'
  Write-Host 'PASS Receive_SelectsBootstrapFileWithoutEchoingContents'

  New-CaseRoot
  $given = Join-Path $script:root 'bootstrap.json'
  Set-Content -LiteralPath $given -Value '{"bootstrap":"not-logged"}' -Encoding UTF8
  function Show-NextecBootstrapFileDialog { throw 'dialog must not open when a file is given' }
  $viaParam = Get-NextecBootstrapSelection -Path $given
  Assert ($viaParam -eq [IO.Path]::GetFullPath($given)) 'Given authorization file was not used directly'
  $badName = Join-Path $script:root 'qualquer.json'
  Set-Content -LiteralPath $badName -Value '{}'
  $rejected = $false
  try { Get-NextecBootstrapSelection -Path $badName | Out-Null } catch { $rejected = ($_.Exception.Message -eq 'invalid_authorization_file') }
  Assert $rejected 'Given authorization file with another name was accepted'
  $rejected = $false
  try { Get-NextecBootstrapSelection | Out-Null } catch { $rejected = ($_.Exception.Message -eq 'dialog must not open when a file is given') }
  Assert $rejected 'Without a file the picker dialog is not used'
  $coordinatorText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Coordenar-Agente-Nextec.ps1') -Raw -Encoding UTF8
  Assert ($coordinatorText -match '\[string\]\$ArquivoAutorizacao' -and $coordinatorText -match 'Remove-Item -LiteralPath \$selectedPath') 'Coordinator lacks -ArquivoAutorizacao or temp file cleanup'
  Write-Host 'PASS Receive_UsesGivenFileWithoutDialogAndRemovesIt'
} finally {
  if (Test-Path -LiteralPath $script:root) { Remove-Item -LiteralPath $script:root -Recurse -Force }
}
