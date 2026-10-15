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
function Invoke-RestMethod { param($Uri,$Method,$ContentType,$Body,$TimeoutSec,$MaximumRedirection,$UserAgent) $script:httpCall=[pscustomobject]@{Uri=$Uri;Method=$Method;MaximumRedirection=$MaximumRedirection;UserAgent=$UserAgent;Body=$Body}; return [pscustomobject]@{token='token-ack'} }
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
  Assert ($script:loggedValues.Count -eq 1 -and $script:loggedValues[0] -match ' unknown_code \[redigido\]$' -and $script:loggedValues[0] -notmatch 'sensitive-bootstrap-secret') 'Provision log did not redact secret-shaped values as unknown_code'
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

  # Campo: agente antigo com credencial morta (401) e autorizacao nova do painel. O painel so emite autorizacao
  # para maquina sem agente ativo, entao a credencial local e velha: vai para .anterior e o cadastro segue.
  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'existing-token'
  Add-AuthorizationFile
  $result = Invoke-TestProvision
  Assert ($result -eq 'complete') 'Explicit authorization did not replace the stale agent credential'
  Assert ($script:postCalls.Count -eq 1) 'Bootstrap was not sent after replacing the stale credential'
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') 'New token was not saved'
  Assert (Test-Path -LiteralPath ($paths.AgentConfig + '.anterior')) 'Stale credential was not kept aside'
  Assert ($script:logs -contains 'agent_config_replaced') 'Replacement was not logged'
  Assert (-not (Test-Path -LiteralPath $paths.Input)) 'Authorization file stayed on disk'
  Write-Host 'PASS StaleAgent_ReplacedByExplicitAuthorization'

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '111111111' -Token 'old-id-token'
  $result = Invoke-TestProvision
  Assert ($result -eq 'manual_authorization_required') 'Credential of another ID should be retired and fall back to enrollment'
  Assert (-not (Test-Path -LiteralPath $paths.AgentConfig)) 'Credential of another ID stayed active'
  Assert (Test-Path -LiteralPath ($paths.AgentConfig + '.anterior')) 'Credential of another ID was not kept aside'
  Assert ($script:logs -contains 'identity_changed') 'ID change was not logged'
  Write-Host 'PASS ChangedId_RetiresCredentialInsteadOfLoopingForever'

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Set-Content -LiteralPath $paths.AgentConfig -Value '{ formato antigo quebrado' -Encoding UTF8
  $result = Invoke-TestProvision
  Assert (-not (Test-Path -LiteralPath $paths.AgentConfig)) 'Unreadable credential stayed in place'
  Assert ($script:logs -contains 'agent_config_unreadable') 'Unreadable credential was not logged'
  Write-Host 'PASS UnreadableCredential_IsRetired'

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'good-token'
  $result = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null } -AgentTaskReady { param($r) $true }
  Assert ($result -eq 'already_configured' -and $script:registerCalls.Count -eq 0) 'Ready password task must not be re-registered every cycle'
  $result = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null } -AgentTaskReady { param($r) $false }
  Assert ($result -eq 'already_configured' -and $script:registerCalls.Count -eq 1) 'Missing password task must be registered'
  Write-Host 'PASS ConfiguredAgent_RegistersTaskOnlyWhenMissing'

  # Migracao para o intervalo unico (1 minuto): a tarefa de senha ja instalada com repeticao de 5 minutos e re-registrada
  # pelo coordenador (validador completo da tarefa); a de 1 minuto fica como esta. O limite vem de Get-NextecAgentIntervals
  # no script do agente da pasta de dados, nao de um literal do Provisionar.
  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'good-token'
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1') -Destination $paths.AgentScript -Force
  $migrationExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $migrationArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $paths.AgentScript + '" -Executar'
  function global:Get-ScheduledTask { param($TaskName, $ErrorAction) $script:migrationTask }
  foreach ($case in @(@{ Interval = 'PT5M'; Registers = 1; Name = 'tarefa antiga de 5 minutos' }, @{ Interval = 'PT1M'; Registers = 0; Name = 'tarefa de 1 minuto' })) {
    $script:registerCalls.Clear()
    $script:migrationTask = [pscustomobject]@{
      State = 'Ready'
      Principal = [pscustomobject]@{ UserId = 'SYSTEM'; RunLevel = 'Highest' }
      Actions = @([pscustomobject]@{ Execute = $migrationExe; Arguments = $migrationArgs })
      Triggers = @([pscustomobject]@{ Repetition = [pscustomobject]@{ Interval = $case.Interval } })
    }
    $result = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null }
    Assert ($result -eq 'already_configured') "migracao: resultado inesperado ($($case.Name))"
    Assert ($script:registerCalls.Count -eq $case.Registers) "migracao: $($case.Name) deveria registrar $($case.Registers) vez(es), registrou $($script:registerCalls.Count)"
  }
  Remove-Item Function:\Get-ScheduledTask -ErrorAction SilentlyContinue
  Write-Host 'PASS ConfiguredAgent_FiveMinuteTaskMigratesToSingleInterval'

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Add-AuthorizationFile
  $failure = ''
  try { Invoke-TestProvision -Id '999999999' | Out-Null } catch { $failure = $_.Exception.Message }
  Assert ($failure -eq 'identity_conflict') 'Authorization of another machine must be refused'
  Assert (-not (Test-Path -LiteralPath $paths.Input)) 'Refused authorization stayed on disk and would block the next ones'
  Write-Host 'PASS WrongMachineAuthorization_IsDiscarded'

  # Revisao #87 P1: a credencial existente so e aposentada DEPOIS de o servidor aceitar o cadastro novo.
  foreach ($falha in @(
      @{ Nome = 'recusa 401'; Status = 401 },
      @{ Nome = 'conflito 409'; Status = 409 },
      @{ Nome = 'rede'; Status = 0 })) {
    New-CaseRoot
    $paths = Get-NextecProvisionPaths -Root $script:root
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-que-funciona'
    Add-AuthorizationFile
    $status = $falha.Status
    $post = {
      param($panel, $body)
      $script:postCalls.Add([pscustomobject]@{ panel = $panel; body = $body }) | Out-Null
      if ($status -eq 0) { throw [Net.WebException]::new('sem rede') }
      $ex = [Net.WebException]::new('http ' + $status)
      $resp = [pscustomobject]@{ StatusCode = $status }
      $ex | Add-Member -NotePropertyName Response -NotePropertyValue $resp -Force
      throw $ex
    }.GetNewClosure()
    try { Invoke-TestProvision -Post $post | Out-Null } catch { }
    Assert (Test-Path -LiteralPath $paths.AgentConfig) "credencial existente sumiu depois de $($falha.Nome)"
    Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'token-que-funciona') "credencial existente foi alterada depois de $($falha.Nome)"
    Assert (-not (Test-Path -LiteralPath ($paths.AgentConfig + '.anterior'))) "credencial foi guardada em .anterior sem o servidor aceitar ($($falha.Nome))"
  }
  Write-Host 'PASS StaleAgent_KeptUntilServerAcceptsNewEnrollment'

  # Revisao #87 P2: tarefa de senha so vale com conta SYSTEM, powershell.exe do sistema, script e -Executar certos e 5 minutos.
  $rootTask = 'C:\ProgramData\Nextec\Acesso'
  $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  function New-FakeTask($user = 'SYSTEM', $exe = $psExe, $args2 = '-NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\Nextec\Acesso\Agente-Senha-Nextec.ps1" -Executar', $interval = 'PT5M', $state = 'Ready', $runLevel = 'Highest', $actionCount = 1, $triggerCount = 1) {
    $repetition = [pscustomobject]@{ Interval = $interval }
    $acts = @(); for ($k = 0; $k -lt $actionCount; $k++) { $acts += [pscustomobject]@{ Execute = $exe; Arguments = $args2 } }
    $trigs = @(); for ($k = 0; $k -lt $triggerCount; $k++) { $trigs += [pscustomobject]@{ Repetition = $repetition } }
    [pscustomobject]@{
      State = $state
      Principal = [pscustomobject]@{ UserId = $user; RunLevel = $runLevel }
      Actions = $acts
      Triggers = $trigs
    }
  }
  Assert (Test-NextecAgentTaskShape -Task (New-FakeTask) -Root $rootTask) 'tarefa correta foi recusada'
  Assert (Test-NextecAgentTaskShape -Task (New-FakeTask -user 'S-1-5-18') -Root $rootTask) 'SID do SYSTEM deve valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -user 'BUILTIN\Users') -Root $rootTask)) 'conta comum nao pode valer'
  # BUG 2 (Sandbox pt-BR): o nome da conta e localizado. Identidade e o SID, nunca o texto 'SYSTEM'.
  $sysNtLocal = (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')).Translate([Security.Principal.NTAccount]).Value
  $sysShortLocal = $sysNtLocal.Substring($sysNtLocal.LastIndexOf('\') + 1)
  Assert (Test-NextecAgentTaskShape -Task (New-FakeTask -user $sysShortLocal) -Root $rootTask) "conta localizada curta ($sysShortLocal) deve valer"
  Assert (Test-NextecAgentTaskShape -Task (New-FakeTask -user $sysNtLocal) -Root $rootTask) "conta localizada completa ($sysNtLocal) deve valer"
  $sisOk = $false
  try { $sisOk = ((New-Object Security.Principal.NTAccount('SISTEMA')).Translate([Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-18') } catch {}
  if ($sisOk) { Assert (Test-NextecAgentTaskShape -Task (New-FakeTask -user 'SISTEMA') -Root $rootTask) 'SISTEMA (pt-BR) deve valer' }
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -user 'Administradores') -Root $rootTask)) 'grupo Administradores nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -user 'conta-que-nao-existe-xyz') -Root $rootTask)) 'conta inexistente nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -user '') -Root $rootTask)) 'conta vazia nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -user 'S-1-5-19') -Root $rootTask)) 'LocalService nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -exe 'C:\Temp\powershell.exe') -Root $rootTask)) 'executavel diferente nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -args2 '-NoProfile -File "C:\ProgramData\Nextec\Acesso\Agente-Senha-Nextec.ps1"') -Root $rootTask)) 'sem -Executar nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -args2 '-File "C:\Outro\Agente-Senha-Nextec.ps1" -Executar') -Root $rootTask)) 'script em outra pasta nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -interval 'PT1H') -Root $rootTask)) 'periodicidade diferente nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -state 'Disabled') -Root $rootTask)) 'tarefa desabilitada nao pode valer'
  # Achado 4 (revisao #45): configuracao completa da tarefa de senha
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -runLevel 'Limited') -Root $rootTask)) 'RunLevel diferente de Highest nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -args2 '-NoProfile "C:\ProgramData\Nextec\Acesso\Agente-Senha-Nextec.ps1" -Executar') -Root $rootTask)) 'sem -File nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -args2 '-NoProfile -Command "& C:\ProgramData\Nextec\Acesso\Agente-Senha-Nextec.ps1" -Executar -File "C:\Outro\x.ps1"') -Root $rootTask)) 'script esperado fora do -File nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -interval 'PT10M') -Root $rootTask)) 'repeticao maior que 5 minutos nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -interval '') -Root $rootTask)) 'gatilho sem repeticao nao pode valer'
  Assert (Test-NextecAgentTaskShape -Task (New-FakeTask -interval 'PT1M') -Root $rootTask) 'repeticao menor ou igual a 5 minutos deve valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -actionCount 2) -Root $rootTask)) 'duas acoes nao podem valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -triggerCount 0) -Root $rootTask)) 'sem gatilho nao pode valer'
  Assert (-not (Test-NextecAgentTaskShape -Task (New-FakeTask -exe 'C:\Windows\System32\cmd.exe') -Root $rootTask)) 'cmd.exe nao pode valer'
  Write-Host 'PASS AgentTask_ShapeIsFullyValidated'


  New-CaseRoot
  $script:taskRegistration=$null
  function New-ScheduledTaskAction { param($Execute,$Argument) if ($Argument -match '(?i)bootstrap|proposed_token|secret') { throw 'Secret was placed in task arguments' }; [pscustomobject]@{Execute=$Execute;Argument=$Argument} }
  function New-ScheduledTaskTrigger { param([DateTime]$At,[TimeSpan]$RepetitionInterval,[TimeSpan]$RepetitionDuration) if ($RepetitionInterval -ne [TimeSpan]::FromMinutes((Get-NextecCoordinatorMinutes -AgentScript (Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1')))) { throw 'Coordinator interval is not the single configured interval' }; [pscustomobject]@{Interval=$RepetitionInterval} }
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

  # Caso de campo: agente antigo deixou Agente-Senha-Nextec.ps1 com permissao herdada em ProgramData.
  # Antes o registro lancava unsafe_path e o MSI desfazia a instalacao inteira (1603). Agora o arquivo e trocado.
  New-CaseRoot
  $legacyRoot = Join-Path $script:root 'legado'
  New-Item -ItemType Directory -Path $legacyRoot -Force | Out-Null
  $legacyAgent = Join-Path $legacyRoot 'Agente-Senha-Nextec.ps1'
  Set-Content -LiteralPath $legacyAgent -Value '# agente antigo de 11/10' -Encoding UTF8
  $script:failAclPath = $legacyAgent
  $script:copyCount = 0
  Register-NextecCoordinatorTask -Root $legacyRoot -SourceRoot $PSScriptRoot | Out-Null
  Assert ($script:copyCount -eq 3) 'Registration stopped on a legacy file with unexpected ACL'
  Assert ((Get-Content -LiteralPath $legacyAgent -Raw) -match 'transaction_v1|Get-NextecInstalledClient') 'Legacy agent script was not replaced by the packaged one'
  $script:failAclPath = $null
  Write-Host 'PASS Coordinator_ReplacesLegacyFileWithUnexpectedAcl'

  # Revisao #45 P1: inscricao.json anterior nao sobrevive a um instalador de OUTRO painel; marcador vai para a pasta de dados.
  foreach ($caso in @(
      @{ Nome = 'outro painel'; NovoPainel = 'https://novo.example'; VelhoPainel = 'https://velho.example'; Mantem = $false },
      @{ Nome = 'mesmo painel'; NovoPainel = 'https://velho.example'; VelhoPainel = 'https://velho.example'; Mantem = $true },
      @{ Nome = 'marcador sem painel'; NovoPainel = ''; VelhoPainel = 'https://velho.example'; Mantem = $true })) {
    New-CaseRoot
    $src = Join-Path $script:root 'origem'
    $dst = Join-Path $script:root 'dados'
    New-Item -ItemType Directory -Path $src, $dst -Force | Out-Null
    foreach ($name in @('Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1')) {
      Microsoft.PowerShell.Management\Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $src $name)
    }
    $marker = [ordered]@{ v = 1; app = 'XPTO'; upgrade_code = 'x' }
    if ($caso.NovoPainel) { $marker.painel = $caso.NovoPainel }
    [IO.File]::WriteAllText((Join-Path $src 'nextec-marker.json'), ($marker | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $dst 'inscricao.json'), (@{ v = 1; painel = $caso.VelhoPainel; chave = 'nx1.1.AbCdEf0123456789AbCdEf' } | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $dst 'inscricao-estado.json'), '{}', (New-Object Text.UTF8Encoding($false)))
    $script:NextecReplacedFiles = @()
    Register-NextecCoordinatorTask -Root $dst -SourceRoot $src | Out-Null
    $kept = Test-Path -LiteralPath (Join-Path $dst 'inscricao.json')
    Assert ($kept -eq $caso.Mantem) "politica da inscricao anterior errada ($($caso.Nome)): mantida=$kept"
    Assert ($kept -eq (Test-Path -LiteralPath (Join-Path $dst 'inscricao-estado.json'))) "estado da inscricao deve seguir o arquivo ($($caso.Nome))"
    Assert (Test-Path -LiteralPath (Join-Path $dst 'nextec-marker.json')) "marcador nao foi copiado para a pasta de dados ($($caso.Nome))"
  }
  Write-Host 'PASS Coordinator_StaleEnrollmentPolicyAndMarkerCopy'
  # Achado 1 (revisao #45): comparacao pelo host normalizado, credencial/estado do painel antigo saem, decisao no log sem segredo.
  function New-PolicyCase {
    param([string]$OldEnroll, [string]$NewEnroll, [string]$NewMarker, [string]$CredentialPanel)
    New-CaseRoot
    $src = Join-Path $script:root 'origem'; $dst = Join-Path $script:root 'dados'
    New-Item -ItemType Directory -Path $src, $dst -Force | Out-Null
    foreach ($name in @('Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1')) {
      Microsoft.PowerShell.Management\Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $src $name)
    }
    $utf8 = New-Object Text.UTF8Encoding($false)
    if ($NewMarker) { [IO.File]::WriteAllText((Join-Path $src 'nextec-marker.json'), (@{ v = 1; app = 'XPTO'; upgrade_code = 'x'; painel = $NewMarker } | ConvertTo-Json -Compress), $utf8) }
    if ($NewEnroll) { [IO.File]::WriteAllText((Join-Path $src 'inscricao.json'), (@{ v = 1; painel = $NewEnroll; chave = 'nx1.1.AbCdEf0123456789AbCdEf' } | ConvertTo-Json -Compress), $utf8) }
    if ($OldEnroll) {
      [IO.File]::WriteAllText((Join-Path $dst 'inscricao.json'), (@{ v = 1; painel = $OldEnroll; chave = 'nx1.1.AbCdEf0123456789AbCdEf' } | ConvertTo-Json -Compress), $utf8)
      [IO.File]::WriteAllText((Join-Path $dst 'inscricao-estado.json'), '{}', $utf8)
    }
    if ($CredentialPanel) { [IO.File]::WriteAllText((Join-Path $dst 'agente-senha.json'), (@{ painel = $CredentialPanel; id = '536822159'; token = 'protegido' } | ConvertTo-Json -Compress), $utf8) }
    $script:NextecReplacedFiles = @()
    Register-NextecCoordinatorTask -Root $dst -SourceRoot $src | Out-Null
    return $dst
  }
  $d = New-PolicyCase -OldEnroll 'https://velho.example' -NewMarker 'https://VELHO.example:443/'
  Assert (Test-Path -LiteralPath (Join-Path $d 'inscricao.json')) 'mesmo host com caixa, porta padrao e barra foi tratado como outro painel'
  Assert (($script:NextecDecisions -join '|') -match 'mantida \(mesmo painel') 'decisao de manter nao foi registrada'
  $d = New-PolicyCase -OldEnroll 'https://velho.example' -NewEnroll 'https://novo.example' -CredentialPanel 'https://velho.example'
  Assert (Test-Path -LiteralPath (Join-Path $d 'inscricao.json')) 'inscricao do instalador nao entrou'
  Assert (-not (Test-Path -LiteralPath (Join-Path $d 'inscricao-estado.json'))) 'estado da inscricao do painel antigo ficou depois de nova inscricao de outro painel'
  Assert ((-not (Test-Path -LiteralPath (Join-Path $d 'agente-senha.json'))) -and (Test-Path -LiteralPath (Join-Path $d 'agente-senha.json.anterior'))) 'credencial do painel antigo ficou ativa com a inscricao de outro painel'
  $d = New-PolicyCase -OldEnroll 'https://velho.example' -NewEnroll 'https://velho.example' -CredentialPanel 'https://velho.example'
  Assert (Test-Path -LiteralPath (Join-Path $d 'agente-senha.json')) 'credencial compativel (mesmo painel) foi descartada'
  Assert (Test-Path -LiteralPath (Join-Path $d 'inscricao-estado.json')) 'estado do mesmo painel foi descartado'
  $d = New-PolicyCase -OldEnroll 'https://velho.example' -NewMarker 'https://novo.example' -CredentialPanel 'https://velho.example'
  Assert (-not (Test-Path -LiteralPath (Join-Path $d 'inscricao.json'))) 'instalador sem inscricao de outro painel herdou a inscricao antiga'
  Assert ((-not (Test-Path -LiteralPath (Join-Path $d 'agente-senha.json'))) -and (Test-Path -LiteralPath (Join-Path $d 'agente-senha.json.anterior'))) 'credencial do painel antigo continuou valendo'
  Assert (($script:NextecDecisions -join '|') -match 'removida') 'decisao de remover nao foi registrada'
  Assert (($script:NextecDecisions -join '|') -notmatch 'nx1\.|protegido') 'decisao do log carrega segredo'
  $d = New-PolicyCase -OldEnroll 'https://velho.example' -CredentialPanel 'https://velho.example'
  Assert ((Test-Path -LiteralPath (Join-Path $d 'inscricao.json')) -and (Test-Path -LiteralPath (Join-Path $d 'agente-senha.json'))) 'sem painel no instalador nada deve ser descartado'
  Write-Host 'PASS Coordinator_PanelPolicyCredentialAndLog'

  # Achado 1, lado do provisionador: credencial gravada para OUTRO painel nao e reaproveitada quando o painel e configurado.
  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  $oldFixo = $script:NextecPainelFixo; $oldOrigin = $script:NextecPainelOrigem
  try {
    $script:NextecPainelFixo = 'https://novo.example'; $script:NextecPainelOrigem = 'C:\inscricao.json'
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel 'https://velho.example' -Id '536822159' -Token 'token-do-painel-antigo'
    try { Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -RegisterAgent { param($path) } -AgentTaskReady { param($r) $true } | Out-Null } catch { }
    Assert ($script:logs -contains 'panel_changed') 'credencial de outro painel nao foi aposentada'
    Assert (Test-Path -LiteralPath ($paths.AgentConfig + '.anterior')) 'credencial de outro painel nao foi guardada ao lado'
    New-CaseRoot
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel 'https://novo.example' -Id '536822159' -Token 'token-do-mesmo-painel'
    $same = Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -RegisterAgent { param($path) } -AgentTaskReady { param($r) $true }
    Assert ($same -eq 'already_configured' -and $script:logs -notcontains 'panel_changed') 'credencial compativel (mesmo painel) foi aposentada'
    New-CaseRoot
    $script:NextecPainelOrigem = 'padrao'
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel 'https://velho.example' -Id '536822159' -Token 'token-sem-config'
    Assert ((Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -RegisterAgent { param($path) } -AgentTaskReady { param($r) $true }) -eq 'already_configured') 'sem painel configurado nada deve ser comparado (compat)'
  } finally { $script:NextecPainelFixo = $oldFixo; $script:NextecPainelOrigem = $oldOrigin }
  Write-Host 'PASS Provisioner_CredentialOfOtherPanelIsRetired'


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

  # --- agente antigo ou quebrado: so o .cmd do painel (-SubstituirAgenteAntigo) pode tira-lo do caminho ---
  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-antigo-secreto'
  $script:probeCalls = 0
  Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -ProbeToken { param($p,$i,$t) $script:probeCalls++; 401 } | Out-Null
  Assert ($script:probeCalls -eq 0) 'Probe ran without -SubstituirAgenteAntigo'
  Assert (Test-Path -LiteralPath $paths.AgentConfig -PathType Leaf) 'Normal receive removed the existing agent config'
  Assert (@(Get-ChildItem -LiteralPath $script:root -Filter '*.antigo-*' -ErrorAction SilentlyContinue).Count -eq 0) 'Normal receive made a backup'
  # Fluxo normal (sem o .cmd): a autorizacao segue ao painel (comportamento do #87); o painel recusa duplicata com 409
  # e a credencial existente fica intacta (so e aposentada depois de o servidor aceitar o cadastro novo).
  $rejected = $false
  $post409 = {
    param($panel, $body)
    $script:postCalls.Add([pscustomobject]@{ panel = $panel; body = $body }) | Out-Null
    $ex = [Net.WebException]::new('http 409')
    $ex | Add-Member -NotePropertyName Response -NotePropertyValue ([pscustomobject]@{ StatusCode = 409 }) -Force
    throw $ex
  }
  try { Invoke-TestProvision -Post $post409 } catch { $rejected = ($_.Exception.Message -eq 'already_enrolled') }
  Assert ($rejected -and $script:postCalls.Count -eq 1) 'Normal flow no longer refuses a duplicate enrollment'
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'token-antigo-secreto') 'Normal flow changed the existing token'
  Write-Host 'PASS OldAgent_NormalFlowStillRefusesDuplicate'

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-antigo-secreto'
  Set-Content -LiteralPath $paths.Journal -Value '{"formato":"antigo"}' -Encoding UTF8
  $script:probeCalls = 0; $script:probeToken = ''
  Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -SubstituirAgenteAntigo -ProbeToken { param($p,$i,$t) $script:probeCalls++; $script:probeToken = $t; [pscustomobject]@{ status = 401; agent_state = '' } } | Out-Null
  Assert ($script:probeCalls -eq 1 -and $script:probeToken -eq 'token-antigo-secreto') 'Refused token was not probed once with the stored token'
  # Achado P1 (#93): a credencial antiga so sai do lugar depois de o painel aceitar o token novo.
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'token-antigo-secreto') 'Old credential was removed before the new token was accepted'
  Assert (-not (Test-Path -LiteralPath $paths.Journal)) 'Old journal stayed in place'
  Assert (@(Get-ChildItem -LiteralPath $script:root -Filter 'provisionamento-agente.json.antigo-*').Count -eq 1) 'Old journal was not preserved'
  Assert (Test-Path -LiteralPath $paths.Input -PathType Leaf) 'Authorization input not written for the refused old agent'
  Assert ($script:logs -contains 'old_agent_replace_token_recusado') 'Replacement was not logged'
  $result = Invoke-TestProvision
  Assert ($result -eq 'complete' -and $script:postCalls.Count -eq 1) "Re-enrollment after replacement did not complete: $result"
  $fresh = Read-NextecAgentTokenConfig -Path $paths.AgentConfig
  Assert ($fresh.token -eq $script:postCalls[0].body.proposed_token -and $fresh.token -ne 'token-antigo-secreto') 'New agent config does not carry the new token'
  Assert ((Get-Content -LiteralPath ($paths.AgentConfig + '.anterior') -Raw) -match 'token-antigo-secreto') 'Old token was not preserved in .anterior after acceptance'
  Assert (@($script:logs | Where-Object { $_ -match 'token-|secret' }).Count -eq 0) 'Secret-looking value in logs'
  Write-Host 'PASS OldAgent_RefusedTokenIsReplacedOnlyAfterAcceptance'

  # Recusa do bootstrap (409/401) depois de decidir substituir: a credencial antiga continua valendo.
  foreach ($refusal in @(409, 401)) {
    New-CaseRoot
    $paths = Get-NextecProvisionPaths -Root $script:root
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-antigo-secreto'
    Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -SubstituirAgenteAntigo -ProbeToken { param($p,$i,$t) [pscustomobject]@{ status = 401; agent_state = '' } } | Out-Null
    $script:refusalStatus = $refusal
    $postRefused = {
      param($panel, $body)
      $script:postCalls.Add([pscustomobject]@{ panel = $panel; body = $body }) | Out-Null
      $ex = [Net.WebException]::new('http refused')
      $ex | Add-Member -NotePropertyName Response -NotePropertyValue ([pscustomobject]@{ StatusCode = $script:refusalStatus }) -Force
      throw $ex
    }
    try { Invoke-TestProvision -Post $postRefused | Out-Null } catch { }
    Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'token-antigo-secreto') ("Refused bootstrap ($refusal) lost the old credential")
    Assert (-not (Test-Path -LiteralPath ($paths.AgentConfig + '.anterior'))) ("Refused bootstrap ($refusal) moved the old credential aside")
    Write-Host ('PASS OldAgent_RefusedBootstrapKeepsCredential_' + $refusal)
  }

  # Credencial valida (200) e instalacao local quebrada: repara com a credencial existente, sem bootstrap e sem recusar.
  foreach ($broken in @('TaskMissing', 'ScriptMissing')) {
    New-CaseRoot
    $paths = Get-NextecProvisionPaths -Root $script:root
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-vivo'
    if ($broken -eq 'TaskMissing') { Set-Content -LiteralPath $paths.AgentScript -Value '# agente' -Encoding ASCII }
    $script:taskReadyCalls = 0
    $out = Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -SubstituirAgenteAntigo `
      -ProbeToken { param($p,$i,$t) [pscustomobject]@{ status = 200; agent_state = 'parado' } } `
      -AgentTaskReady { param($r) $script:taskReadyCalls++; $false } `
      -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null }
    Assert ([string]$out -match 'reparado') ('Repair did not report success: ' + $broken)
    Assert ($script:registerCalls.Count -eq 1 -and $script:registerCalls[0] -eq $paths.AgentScript) ('Task was not re-registered: ' + $broken)
    Assert (-not (Test-Path -LiteralPath $paths.Input)) ('Repair wrote a bootstrap authorization: ' + $broken)
    Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'token-vivo') ('Repair changed the credential: ' + $broken)
    Assert ($script:logs -contains 'agent_repaired' -and -not ($script:logs -contains 'old_agent_kept')) ('Repair not logged: ' + $broken)
    Write-Host ('PASS OldAgent_ValidCredentialBrokenInstallIsRepaired_' + $broken)
  }

  # Credencial valida, instalacao boa e painel dizendo "parado": substituicao pelo bootstrap (credencial fica ate aceitar).
  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-parado'
  Set-Content -LiteralPath $paths.AgentScript -Value '# agente' -Encoding ASCII
  Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -SubstituirAgenteAntigo `
    -ProbeToken { param($p,$i,$t) [pscustomobject]@{ status = 200; agent_state = 'parado' } } -AgentTaskReady { param($r) $true } `
    -RegisterAgent { param($path) throw 'register must not run' } | Out-Null
  Assert (Test-Path -LiteralPath $paths.Input -PathType Leaf) 'Stalled agent did not get a replacement authorization'
  Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'token-parado') 'Stalled agent credential removed before acceptance'
  Assert ($script:logs -contains 'old_agent_replace_agente_parado') 'Stalled replacement not logged'
  Write-Host 'PASS OldAgent_StalledInPanelIsReplaced'

  foreach ($case in @(
      @{ Name='Recognized'; Status=200; State='ativo'; Expect='already_enrolled'; Log='old_agent_kept' },
      @{ Name='RecognizedOldPanel'; Status=200; State=''; Expect='already_enrolled'; Log='old_agent_kept' },
      @{ Name='OtherStatus'; Status=403; State=''; Expect='already_enrolled'; Log='old_agent_kept' },
      @{ Name='Unreachable'; Status=0; State=''; Expect='panel_unreachable'; Log='panel_unreachable' }
    )) {
    New-CaseRoot
    $paths = Get-NextecProvisionPaths -Root $script:root
    Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-vivo'
    Set-Content -LiteralPath $paths.AgentScript -Value '# agente' -Encoding ASCII
    $script:probeAnswer = [pscustomobject]@{ status = $case.Status; agent_state = $case.State }
    $rejected = $false
    try { Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -SubstituirAgenteAntigo -ProbeToken { param($p,$i,$t) $script:probeAnswer } -AgentTaskReady { param($r) $true } | Out-Null }
    catch { $rejected = ($_.Exception.Message -eq $case.Expect) }
    Assert $rejected ('Switch replaced or mis-reported an agent the panel does not refuse: ' + $case.Name)
    Assert ((Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq 'token-vivo') 'Recognized agent token changed'
    Assert (-not (Test-Path -LiteralPath $paths.Input)) 'Authorization written although the agent was kept'
    Assert ($script:logs -contains $case.Log) ('Missing log code ' + $case.Log)
    Write-Host ('PASS OldAgent_Kept_' + $case.Name)
  }

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Set-Content -LiteralPath $paths.AgentConfig -Value 'isto nao e json {{{' -Encoding UTF8
  $script:probeCalls = 0
  Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -SubstituirAgenteAntigo -ProbeToken { param($p,$i,$t) $script:probeCalls++; 200 } | Out-Null
  Assert ($script:probeCalls -eq 0 -and (Test-Path -LiteralPath $paths.AgentConfig) -and (Test-Path -LiteralPath $paths.Input)) 'Unreadable old config was not replaced without asking the panel'
  $result = Invoke-TestProvision
  Assert ($result -eq 'complete' -and (Read-NextecAgentTokenConfig -Path $paths.AgentConfig).token -eq $script:postCalls[0].body.proposed_token) 'Unreadable old config was not replaced after acceptance'
  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '999999999' -Token 'token-de-outro-id'
  $script:probeCalls = 0
  Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '536822159' } -SubstituirAgenteAntigo -ProbeToken { param($p,$i,$t) $script:probeCalls++; 200 } | Out-Null
  Assert ($script:probeCalls -eq 0 -and (Test-Path -LiteralPath $paths.AgentConfig) -and (Test-Path -LiteralPath $paths.Input)) 'Config of another ID was not replaced'
  Write-Host 'PASS OldAgent_UnreadableOrOtherIdIsReplaced'

  New-CaseRoot
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecAgentTokenConfig -Path $paths.AgentConfig -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-antigo-secreto'
  $script:probeCalls = 0
  $rejected = $false
  try { Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { $script:json } -DiscoverId { '111111111' } -SubstituirAgenteAntigo -ProbeToken { param($p,$i,$t) $script:probeCalls++; 401 } | Out-Null } catch { $rejected = ($_.Exception.Message -eq 'identity_conflict') }
  Assert ($rejected -and $script:probeCalls -eq 0 -and (Test-Path -LiteralPath $paths.AgentConfig)) 'Authorization for another machine touched the existing agent'
  $rejected = $false
  try { Receive-NextecBootstrapAuthorization -Root $script:root -ReadInput { '{"painel":"https://outro.exemplo"}' } -DiscoverId { '536822159' } -SubstituirAgenteAntigo -ProbeToken { param($p,$i,$t) $script:probeCalls++; 401 } | Out-Null } catch { $rejected = $true }
  Assert ($rejected -and $script:probeCalls -eq 0 -and (Test-Path -LiteralPath $paths.AgentConfig)) 'Invalid authorization touched the existing agent'
  Write-Host 'PASS OldAgent_InvalidAuthorizationNeverTouchesExistingAgent'

  New-CaseRoot
  $coordinatorText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Coordenar-Agente-Nextec.ps1') -Raw -Encoding UTF8
  $workerText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Provisionar-Agente-Nextec.ps1') -Raw -Encoding UTF8
  Assert ($coordinatorText -match '\[switch\]\$SubstituirAgenteAntigo' -and $workerText -match '\[switch\]\$SubstituirAgenteAntigo') 'Scripts lack -SubstituirAgenteAntigo'
  Assert ($coordinatorText -match 'SubstituirAgenteAntigo -and -not \$Receber') 'Coordinator allows -SubstituirAgenteAntigo without -Receber'
  Write-Host 'PASS OldAgent_SwitchOnlyWithReceive'

  New-CaseRoot
  $realProbe = (Get-Command Invoke-NextecAgentTokenProbe).ScriptBlock
  $script:httpCall = $null
  $status = & $realProbe -Panel $script:NextecPainelFixo -Id '536822159' -Token 'token-nao-logado'
  Assert ($status.status -eq 200 -and $script:httpCall.Uri -eq 'https://painel-remoto.nex.tec.br/api/nextec/agent/sync' -and $script:httpCall.MaximumRedirection -eq 0) 'Probe did not use the fixed HTTPS sync endpoint without redirects'
  Assert (($script:httpCall.Body | ConvertFrom-Json).probe -eq $true) 'Probe did not send probe:true (it would count as a real sync)'
  $script:httpCall = $null
  $status = & $realProbe -Panel 'https://outro-host.exemplo' -Id '536822159' -Token 'token-nao-logado'
  Assert ($status.status -eq 0 -and $null -eq $script:httpCall) 'Probe sent the token to a host other than the configured panel'
  Write-Host 'PASS OldAgent_ProbeUsesOnlyConfiguredPanel'

  # Achado P2 (revisao do PR #90): pendente do painel anterior nao bloqueia a inscricao no painel atual.
  $script:chaveInscricao = 'C' * 43
  function Add-Enrollment {
    $paths = Get-NextecProvisionPaths -Root $script:root
    @{ v = 1; painel = $script:NextecPainelFixo; chave = $script:chaveInscricao } | ConvertTo-Json -Compress | Set-Content -LiteralPath $paths.Enroll -Encoding UTF8
  }
  function Add-PendingJournal([string]$Panel, [string]$State = 'pending', [int]$AgeMinutes = 1) {
    $paths = Get-NextecProvisionPaths -Root $script:root
    $journal = [pscustomobject]@{
      painel=$Panel; id='536822159'; uuid='device-uuid-1'; bootstrap='Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      proposed_token='Zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'; created_utc=$script:current.AddMinutes(-$AgeMinutes); state=$State
    }
    Save-NextecProvisionJournal -Journal $journal -Path $paths.Journal
  }
  function Invoke-WithSelfEnroll([scriptblock]$BootstrapPost = { param($p,$b) throw 'network unavailable' }) {
    $script:selfPosts = New-Object System.Collections.Generic.List[object]
    $selfPost = { param($panel,$body) $script:selfPosts.Add([pscustomobject]@{ panel=$panel; body=$body }) | Out-Null; [pscustomobject]@{ status=200; token=$body.proposed_token; state='pending' } }
    Invoke-NextecProvisioning -Root $script:root -DiscoverId { '536822159' } -Now $script:current -NewToken { New-NextecProposedToken } `
      -PostBootstrap $BootstrapPost -PostSelfEnroll $selfPost -GetUuid { 'uuid-b64' } -RegisterAgent { param($path) $script:registerCalls.Add($path) | Out-Null }
  }

  # painel diferente: o journal pendente do painel A e descartado e a inscricao segue no painel atual
  New-CaseRoot; Add-Enrollment
  $paths = Get-NextecProvisionPaths -Root $script:root
  Add-PendingJournal -Panel 'https://painel-antigo.exemplo.com.br'
  $result = Invoke-WithSelfEnroll
  Assert ($result -eq 'complete') "Pending journal of another panel blocked the enrollment: $result"
  Assert (-not (Test-Path -LiteralPath $paths.Journal)) 'Journal of another panel was kept'
  Assert ($script:logs -contains 'pending_other_panel') 'Discard of the other panel pending was not logged'
  Assert ($script:selfPosts.Count -eq 1 -and $script:selfPosts[0].panel -ceq $script:NextecPainelFixo) 'Enrollment did not go to the current panel'
  Assert (($script:logs -join ',') -notmatch 'Zzzz|Bbbb') 'Secret value reached the log'
  Write-Host 'PASS PendingOtherPanel_IsDiscardedAndEnrollsInCurrentPanel'

  # mesmo painel (host normalizado: caixa e barra final) e dentro do prazo: mantem a espera, sem reinscrever
  New-CaseRoot; Add-Enrollment
  $paths = Get-NextecProvisionPaths -Root $script:root
  Add-PendingJournal -Panel $script:NextecPainelFixo
  $result = Invoke-WithSelfEnroll
  Assert ($result -eq 'network_retry') "Pending journal of the same panel did not keep waiting: $result"
  Assert (Test-Path -LiteralPath $paths.Journal -PathType Leaf) 'Journal of the same panel was discarded early'
  Assert ($script:selfPosts.Count -eq 0) 'Same panel pending triggered a new enrollment'
  Assert ($script:logs -notcontains 'pending_other_panel') 'Same panel was treated as another panel'
  Write-Host 'PASS PendingSamePanel_KeepsWaiting'

  # pendente expirado do mesmo painel: reinscreve (nunca espera para sempre)
  New-CaseRoot; Add-Enrollment
  $paths = Get-NextecProvisionPaths -Root $script:root
  Add-PendingJournal -Panel $script:NextecPainelFixo -AgeMinutes 30
  $result = Invoke-WithSelfEnroll
  Assert ($result -eq 'complete') "Expired pending did not re-enroll: $result"
  Assert (-not (Test-Path -LiteralPath $paths.Journal) -and $script:logs -contains 'pending_expired') 'Expired pending was not discarded and logged'
  Assert ($script:selfPosts.Count -eq 1) 'Expired pending did not enroll again'
  Write-Host 'PASS PendingExpired_ReEnrolls'

  # recusa manual: dentro de 24 h espera; depois de 24 h reinscreve
  New-CaseRoot; Add-Enrollment
  Add-PendingJournal -Panel $script:NextecPainelFixo -State 'manual' -AgeMinutes (23 * 60)
  $result = Invoke-WithSelfEnroll
  Assert ($result -eq 'manual_authorization_required' -and $script:selfPosts.Count -eq 0) 'Manual journal inside 24 h should keep waiting'
  New-CaseRoot; Add-Enrollment
  Add-PendingJournal -Panel $script:NextecPainelFixo -State 'manual' -AgeMinutes (25 * 60)
  $result = Invoke-WithSelfEnroll
  Assert ($result -eq 'complete' -and $script:selfPosts.Count -eq 1) 'Manual journal older than 24 h did not re-enroll'
  Write-Host 'PASS ManualPending_ExpiresAfter24Hours'

  # estado de inscricao propria criado contra outro painel: descartado, novo token, painel atual gravado
  New-CaseRoot; Add-Enrollment
  $paths = Get-NextecProvisionPaths -Root $script:root
  $keyHash = Get-NextecSha256Hex -Value $script:chaveInscricao
  Save-NextecSelfState -Path $paths.SelfState -State ([pscustomobject]@{ state='manual'; chave_sha256=$keyHash; proposed_token='Yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'; attempts=0; next_try_utc=($script:current.AddHours(5).Ticks); blocked_until_utc=0L; painel='https://painel-antigo.exemplo.com.br' })
  $result = Invoke-WithSelfEnroll
  Assert ($result -eq 'complete') "Self state of another panel blocked the enrollment: $result"
  Assert ($script:selfPosts.Count -eq 1 -and $script:selfPosts[0].body.proposed_token -ceq 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') 'Self state of another panel reused its token'
  Assert ($script:logs -contains 'pending_other_panel') 'Self state discard was not logged'
  # estado do mesmo painel dentro do prazo continua em espera
  New-CaseRoot; Add-Enrollment
  $paths = Get-NextecProvisionPaths -Root $script:root
  Save-NextecSelfState -Path $paths.SelfState -State ([pscustomobject]@{ state='manual'; chave_sha256=$keyHash; proposed_token='Yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'; attempts=0; next_try_utc=($script:current.AddHours(5).Ticks); blocked_until_utc=0L; painel=$script:NextecPainelFixo })
  $result = Invoke-WithSelfEnroll
  Assert ($result -eq 'manual_authorization_required' -and $script:selfPosts.Count -eq 0) 'Self state of the same panel did not keep waiting'
  Write-Host 'PASS SelfStateOtherPanel_IsDiscarded'
} finally {
  if (Test-Path -LiteralPath $script:root) { Remove-Item -LiteralPath $script:root -Recurse -Force }
}
