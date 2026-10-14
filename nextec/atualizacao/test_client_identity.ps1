#requires -version 5.1
$ErrorActionPreference = 'Stop'

$agentScript = Join-Path $PSScriptRoot 'Agente-Senha-Nextec.ps1'
$tokens = $null
$parseErrors = $null
$agentAst = [System.Management.Automation.Language.Parser]::ParseFile($agentScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Agente-Senha-Nextec.ps1 não compilou: $($parseErrors[0].Message)" }
$functionAsts = $agentAst.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
foreach ($functionAst in $functionAsts) { . ([scriptblock]::Create($functionAst.Extent.Text)) }
$script:capturedAclCalls = New-Object System.Collections.ArrayList
$script:forcedReparsePath = ''
$script:legacyAclFixture = $null
function Set-Acl {
  param([string]$LiteralPath, $AclObject)
  [void]$script:capturedAclCalls.Add([pscustomobject]@{ Path = [IO.Path]::GetFullPath($LiteralPath); Acl = $AclObject; PriorAcl = $script:legacyAclFixture })
}
function Get-Item {
  [CmdletBinding()]
  param([string]$LiteralPath, [switch]$Force)
  if ($script:forcedReparsePath -and [IO.Path]::GetFullPath($LiteralPath) -ieq [IO.Path]::GetFullPath($script:forcedReparsePath)) {
    return [pscustomobject]@{ FullName = $LiteralPath; Attributes = [IO.FileAttributes]::ReparsePoint; PSIsContainer = $true }
  }
  Microsoft.PowerShell.Management\Get-Item -LiteralPath $LiteralPath -Force:$Force
}

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERT: $Message" }
}

function New-TestService([string]$Name, [string]$ExePath, [string]$Account = 'NT AUTHORITY\LocalService') {
  [pscustomobject]@{
    Name = $Name
    DisplayName = "$Name Service"
    PathName = '"{0}" --service' -f $ExePath
    StartName = $Account
    State = 'Running'
  }
}

function New-TestClient([string]$Root, [string]$AppName, [string]$PeerId = '812345678') {
  $exe = Join-Path $Root ($AppName + '.exe')
  New-Item -ItemType File -Path $exe -Force | Out-Null
  $config = Join-Path $Root ('LocalService\AppData\Roaming\' + $AppName + '\config')
  New-Item -ItemType Directory -Path $config -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $config ($AppName + '.toml')) -Value "" -Encoding UTF8
  [pscustomobject]@{
    Exe = $exe
    Service = New-TestService -Name $AppName -ExePath $exe
    PeerId = $PeerId
  }
}

function Invoke-Test {
  param([string]$Name, [scriptblock]$Body)
  & $Body
  Write-Host "PASS $Name"
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ('nextec-identity-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
try {
  Invoke-Test 'Identity_ServiceProfile' {
    $profileBase = Join-Path $temp 'profile with spaces'
    $fixture = New-TestClient -Root $profileBase -AppName 'Nextec-Connect'
    $client = Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase $profileBase `
      -PeerIdReader { param($service, $exe) $fixture.PeerId }
    $expected = Join-Path (Join-Path $profileBase 'LocalService\AppData\Roaming') 'Nextec-Connect\config'
    Assert-True ($client.ServiceName -eq 'Nextec-Connect') 'serviço selecionado incorretamente'
    Assert-True ($client.ServiceAccount -eq 'NT AUTHORITY\LocalService') 'conta do serviço não foi preservada'
    Assert-True ($client.ConfigRoot -eq $expected) 'perfil do serviço não foi resolvido'
    Assert-True ($client.PeerId -eq $fixture.PeerId) 'PeerId do serviço não foi retornado'
    Assert-True ($client.ExePath -eq $fixture.Exe) 'executável do serviço não foi retornado'
    Assert-True ($null -ne $client.PSObject.Properties['ComponentVersion']) 'versão do componente ausente'
  }

  Invoke-Test 'Identity_MultipleInstalls' {
    $base = Join-Path $temp 'multiple'
    $a = New-TestClient -Root $base -AppName 'Nextec-Connect'
    $b = New-TestClient -Root $base -AppName 'RustDesk'
    $failure = ''
    try {
      Get-NextecInstalledClient -Services @($a.Service, $b.Service) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = '' }) `
        -PeerIdReader { param($service, $exe) '812345678' } | Out-Null
    } catch { $failure = $_.Exception.Message }
    Assert-True ($failure -match 'múltiplos serviços/instalações encontrados' -and $failure -match 'Nextec-Connect' -and $failure -match 'RustDesk') 'o teste precisa encontrar duas instalações reais no mesmo perfil e rejeitá-las como múltiplas'
  }

  Invoke-Test 'Identity_CustomAppName' {
    $fixture = New-TestClient -Root (Join-Path $temp 'custom') -AppName 'Suporte-Nextec'
    $client = Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase (Join-Path $temp 'custom') `
      -PeerIdReader { param($service, $exe) $fixture.PeerId }
    Assert-True ($client.ConfigRoot -match 'Suporte-Nextec\\config$') 'nome personalizado do executável não determinou o perfil'
  }

  foreach ($appName in @('XPTO', 'Nextec-Connect', 'Client-Nextec-Connect')) {
    Invoke-Test "Identity_MarkerChoosesApp_$appName" {
      $base = Join-Path $temp ('marker-' + $appName)
      $mine = New-TestClient -Root $base -AppName $appName -PeerId '711111111'
      $other = New-TestClient -Root $base -AppName 'RustDesk' -PeerId '722222222'
      # sem marcador: duas instalações são ambíguas
      $failure = ''
      try { Get-NextecInstalledClient -Services @($other.Service, $mine.Service) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '711111111' } | Out-Null } catch { $failure = $_.Exception.Message }
      Assert-True ($failure -match 'múltiplos serviços') 'sem marcador deveria ser ambíguo'
      # marcador AppName escolhe o serviço certo, qualquer que seja o nome
      $client = Get-NextecInstalledClient -Services @($other.Service, $mine.Service) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = $appName }) -PeerIdReader { '711111111' }
      Assert-True ($client.ServiceName -eq $appName) "marcador deveria escolher $appName"
      Assert-True ($client.ConfigRoot -match ([regex]::Escape($appName) + '\\config$')) 'pasta de config deve derivar do AppName'
      # marcador em arquivo nextec-marker.json (app_name)
      $mf = Join-Path $base 'nextec-marker.json'
      [IO.File]::WriteAllText($mf, (@{ app_name = $appName; install_dir = $base } | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
      $client = Get-NextecInstalledClient -Services @($other.Service, $mine.Service) -ProfileRootBase $base -MarkerFile $mf -PeerIdReader { '711111111' }
      Assert-True ($client.ServiceName -eq $appName) "arquivo de marcador deveria escolher $appName"
    }
  }

  Invoke-Test 'Identity_NoneFoundListsWhatWasSearched' {
    $failure = ''
    try { Get-NextecInstalledClient -Services @() -Marker ([pscustomobject]@{ AppName = 'XPTO' }) | Out-Null } catch { $failure = $_.Exception.Message }
    Assert-True ($failure -match '^identity_conflict: nenhum serviço instalado do RustDesk/Nextec foi encontrado' -and $failure -match 'Procurado' -and $failure -match 'XPTO') 'mensagem deve listar o que foi procurado'
  }

  Invoke-Test 'Identity_AnyDeskServiceIsNotAnotherRustDeskInstall' {
    $base = Join-Path $temp 'with-anydesk'
    $fixture = New-TestClient -Root $base -AppName 'Nextec-Connect'
    $otherExe = Join-Path $base 'AnyDesk.exe'
    New-Item -ItemType File -Path $otherExe -Force | Out-Null
    $other = New-TestService -Name 'AnyDesk' -ExePath $otherExe
    $client = Get-NextecInstalledClient -Services @($other,$fixture.Service) -ProfileRootBase $base -PeerIdReader { '812345678' }
    Assert-True ($client.ServiceName -eq 'Nextec-Connect') 'AnyDesk deve ser ignorado pela descoberta RustDesk'
  }

  # Layout real do RustDesk: serviço como LocalSystem, config em ServiceProfiles\LocalService (hbb_common, patch()).
  function New-RealClient([string]$Root, [string]$AppName, [string]$ConfigUnder = 'LocalService') {
    $dir = Join-Path $Root ('Program Files\' + $AppName)
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $exe = Join-Path $dir ($AppName + '.exe')
    New-Item -ItemType File -Path $exe -Force | Out-Null
    if ($ConfigUnder) {
      $config = Join-Path $Root ($ConfigUnder + '\AppData\Roaming\' + $AppName + '\config')
      New-Item -ItemType Directory -Path $config -Force | Out-Null
      Set-Content -LiteralPath (Join-Path $config ($AppName + '.toml')) -Value "id = '536822159'" -Encoding UTF8
    }
    [pscustomobject]@{ Dir = $dir; Exe = $exe; Service = (New-TestService -Name $AppName -ExePath $exe -Account 'LocalSystem') }
  }

  Invoke-Test 'Identity_LocalSystemUsesServiceProfilesLocalService' {
    $base = Join-Path $temp 'real-localsystem'
    $fixture = New-RealClient -Root $base -AppName 'Client-Nextec-Connect'
    $client = Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '536822159' }
    Assert-True ($client.ServiceName -eq 'Client-Nextec-Connect') 'serviço LocalSystem com config em LocalService deveria ser encontrado'
    Assert-True ($client.ConfigRoot -eq (Join-Path $base 'LocalService\AppData\Roaming\Client-Nextec-Connect\config')) 'config do serviço LocalSystem fica em ServiceProfiles\LocalService'
    Assert-True ($client.PeerId -eq '536822159') 'PeerId não retornado'
  }

  Invoke-Test 'Identity_LocalSystemLegacySystemProfileStillWorks' {
    $base = Join-Path $temp 'real-systemprofile'
    $fixture = New-RealClient -Root $base -AppName 'Nextec-Connect' -ConfigUnder 'SystemProfile'
    $client = Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '812345678' }
    Assert-True ($client.ConfigRoot -eq (Join-Path $base 'SystemProfile\AppData\Roaming\Nextec-Connect\config')) 'config em systemprofile continua aceita'
  }

  # Revisao #86 P1: layout REAL do Windows (WindowsDirectory), sem ProfileRootBase. O serviço RustDesk roda como
  # LocalSystem ou LocalService e a config fica em <Windows>\ServiceProfiles\LocalService\AppData\Roaming\<App>\config
  # (ou, em instalação antiga, <Windows>\System32\config\systemprofile\AppData\Roaming\<App>\config).
  function New-WindowsLayoutClient([string]$Win, [string]$AppName, [string]$Account, [string]$ProfileRel) {
    $dir = Join-Path $Win ('Program Files\' + $AppName)
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $exe = Join-Path $dir ($AppName + '.exe')
    New-Item -ItemType File -Path $exe -Force | Out-Null
    $config = Join-Path $Win ($ProfileRel + '\AppData\Roaming\' + $AppName + '\config')
    New-Item -ItemType Directory -Path $config -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $config ($AppName + '.toml')) -Value "id = '536822159'" -Encoding UTF8
    [pscustomobject]@{ Dir = $dir; Service = (New-TestService -Name $AppName -ExePath $exe -Account $Account); Config = $config }
  }
  Invoke-Test 'Identity_RealWindowsLayout_LocalServiceProfile' {
    foreach ($account in @('LocalSystem', 'NT AUTHORITY\LocalService')) {
      $win = Join-Path $temp ('win-ls-' + ($account -replace '[^A-Za-z]', ''))
      $fixture = New-WindowsLayoutClient -Win $win -AppName 'Client-Nextec-Connect' -Account $account -ProfileRel 'ServiceProfiles\LocalService'
      $client = Get-NextecInstalledClient -Services @($fixture.Service) -WindowsDirectory $win -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '536822159' }
      Assert-True ($client.ConfigRoot -eq $fixture.Config) "layout real ($account): config esperada em ServiceProfiles\LocalService"
      Assert-True ($client.PeerId -eq '536822159' -and $client.ServiceAccount -eq $account) "layout real ($account): identidade do serviço"
    }
  }
  Invoke-Test 'Identity_RealWindowsLayout_SystemProfileFallback' {
    $win = Join-Path $temp 'win-sys'
    $fixture = New-WindowsLayoutClient -Win $win -AppName 'Nextec-Connect' -Account 'LocalSystem' -ProfileRel 'System32\config\systemprofile'
    $client = Get-NextecInstalledClient -Services @($fixture.Service) -WindowsDirectory $win -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '812345678' }
    Assert-True ($client.ConfigRoot -eq $fixture.Config) 'layout real: config em system32\config\systemprofile continua aceita para LocalSystem'
    # LocalService nunca olha o systemprofile: sem marcador o serviço não é reconhecido (não confunde com outro app)
    $ls = New-TestService -Name 'Nextec-Connect' -ExePath (Join-Path $win 'Program Files\Nextec-Connect\Nextec-Connect.exe') -Account 'NT AUTHORITY\LocalService'
    $failure = ''
    try { Get-NextecInstalledClient -Services @($ls) -WindowsDirectory $win -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '812345678' } | Out-Null } catch { $failure = $_.Exception.Message }
    Assert-True ($failure -match '^identity_conflict') 'LocalService sem config em ServiceProfiles\LocalService não é reconhecido sem marcador'
  }

  Invoke-Test 'Identity_FreshInstallFoundByMarkerInstallDir' {
    $base = Join-Path $temp 'real-fresh'
    $fixture = New-RealClient -Root $base -AppName 'XPTO' -ConfigUnder ''
    $failure = ''
    try { Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '812345678' } | Out-Null } catch { $failure = $_.Exception.Message }
    Assert-True ($failure -match '^identity_conflict: nenhum serviço') 'sem marcador e sem config o serviço não é reconhecido'
    $client = Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = 'XPTO'; InstallDir = $fixture.Dir }) -PeerIdReader { '812345678' }
    Assert-True ($client.ServiceName -eq 'XPTO') 'instalação nova (sem config ainda) é achada pela pasta do marcador'
    Assert-True ($client.ConfigRoot -eq (Join-Path $base 'LocalService\AppData\Roaming\XPTO\config')) 'config esperada aponta para ServiceProfiles\LocalService'
  }

  Invoke-Test 'Identity_MarkerInstallDirBeatsOtherRustDesk' {
    $base = Join-Path $temp 'real-two'
    $mine = New-RealClient -Root $base -AppName 'Client-Nextec-Connect'
    $other = New-RealClient -Root $base -AppName 'RustDesk'
    $marker = [pscustomobject]@{ AppName = ''; InstallDir = ('"' + $mine.Dir + '\" ') }
    $client = Get-NextecInstalledClient -Services @($other.Service, $mine.Service) -ProfileRootBase $base -Marker $marker -PeerIdReader { '711111111' }
    Assert-True ($client.ServiceName -eq 'Client-Nextec-Connect') 'pasta do marcador (com aspas e barra final) escolhe o serviço certo'
  }

  Invoke-Test 'Identity_BrokenServiceEntriesAreIgnored' {
    $base = Join-Path $temp 'real-dirty'
    $fixture = New-RealClient -Root $base -AppName 'Nextec-Connect'
    $broken = @(
      [pscustomobject]@{ Name = 'Quebrado1'; PathName = '"Z:\nao\existe\x.exe" --service'; StartName = 'LocalSystem' },
      [pscustomobject]@{ Name = 'Quebrado2'; PathName = $null; StartName = $null },
      [pscustomobject]@{ Name = 'Quebrado3'; PathName = '"C:\a<b>\x.exe" --service'; StartName = 'LocalSystem' },
      [pscustomobject]@{ Name = 'Estranho'; PathName = ('"' + $fixture.Exe + '" --service'); StartName = 'DOMINIO\usuario' }
    )
    $client = Get-NextecInstalledClient -Services (@($broken) + @($fixture.Service)) -ProfileRootBase $base -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { '812345678' }
    Assert-True ($client.ServiceName -eq 'Nextec-Connect') 'entradas de serviço quebradas não podem derrubar a descoberta'
  }

  Invoke-Test 'Identity_PeerIdCliOutput' {
    $mock = Join-Path $temp 'peer-valid.cmd'
    @('@echo off', 'echo 812345678', 'exit /b 0') | Set-Content -LiteralPath $mock -Encoding ASCII
    Assert-True ((Get-NextecPeerId -ExePath $mock) -eq '812345678') 'CLI deveria retornar o PeerId inteiro'
  }

  Invoke-Test 'Identity_PeerIdMustBeWholeOutputLine' {
    $mock = Join-Path $temp 'peer-error.cmd'
    @('@echo off', 'echo erro 812345678', 'exit /b 0') | Set-Content -LiteralPath $mock -Encoding ASCII
    $failed = $false
    try { Get-NextecPeerId -ExePath $mock | Out-Null }
    catch { $failed = $_.Exception.Message -match 'PeerId'; $failureMessage = $_.Exception.Message }
    Assert-True $failed "um número dentro de mensagem de erro não pode virar PeerId: $failureMessage"
  }

  Invoke-Test 'PasswordApply_RequiresExplicitSuccess' {
    Assert-NextecPasswordApplied -Result ([pscustomobject]@{ ExitCode = 0; Output = 'Done!' })
    foreach ($result in @(
      [pscustomobject]@{ ExitCode = 0; Output = 'Settings are disabled!' },
      [pscustomobject]@{ ExitCode = 0; Output = 'IPC connection failed' },
      [pscustomobject]@{ ExitCode = 0; Output = '' },
      [pscustomobject]@{ ExitCode = 7; Output = 'Done!' }
    )) {
      $failed = $false
      try { Assert-NextecPasswordApplied -Result $result }
      catch {
        # cliente com disable-settings tem codigo proprio (client_settings_locked); o resto segue password_apply_failed
        $expected = if ($result.Output -ceq 'Settings are disabled!') { '^client_settings_locked:' } else { 'password_apply_failed' }
        $failed = $_.Exception.Message -match $expected
      }
      Assert-True $failed "saída ambígua ou falha deveria ser recusada: ExitCode=$($result.ExitCode), Output=$($result.Output)"
    }
    # a resposta do cliente aparece no erro (diagnostico de campo), limitada e so ASCII
    $msg = ''
    try { Assert-NextecPasswordApplied -Result ([pscustomobject]@{ ExitCode = 0; Output = "linha
Installation and administrative privileges required!" }) } catch { $msg = $_.Exception.Message }
    Assert-True ($msg -match 'resposta: Installation and administrative privileges required!') 'a resposta do cliente deve acompanhar o erro'
    $msg = ''
    try { Assert-NextecPasswordApplied -Result ([pscustomobject]@{ ExitCode = 0; Output = ('x' * 400) }) } catch { $msg = $_.Exception.Message }
    Assert-True ($msg.Length -lt 260) 'a resposta do cliente precisa ser truncada'
  }

  Invoke-Test 'AgentAcl_ReplacesExplicitUsersRules' {
    $root = Join-Path $temp 'agent-acl'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $script:PastaDados = $root
    $script:Config = Join-Path $root 'agente-senha.json'
    $script:Log = Join-Path $root 'agente-senha.log'
    Set-Content -LiteralPath $script:Config -Value '{}' -Encoding UTF8
    Set-Content -LiteralPath $script:Log -Value 'test' -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $root 'Agente-Senha-Nextec.ps1') -Value '# script' -Encoding UTF8

    $usersSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')
    $legacyAcl = New-NextecSecureAcl -Directory
    $legacyRule = [Security.AccessControl.FileSystemAccessRule]::new($usersSid, [Security.AccessControl.FileSystemRights]::Write, [Security.AccessControl.InheritanceFlags]::ContainerInherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    [void]$legacyAcl.AddAccessRule($legacyRule)
    $legacyRules = $legacyAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    Assert-True (@($legacyRules | Where-Object { $_.IdentityReference.Value -eq 'S-1-5-32-545' }).Count -eq 1) 'fixture deveria conter ACE Users explícita'

    $script:capturedAclCalls.Clear()
    $script:legacyAclFixture = $legacyAcl
    ProtegerPastaAgente
    $script:legacyAclFixture = $null
    Assert-True ($script:capturedAclCalls.Count -eq 4) 'raiz e os três arquivos gerenciados existentes devem receber DACLs novas'
    Assert-True ($script:capturedAclCalls[0].Path -eq [IO.Path]::GetFullPath($root)) 'a raiz precisa ser protegida antes dos arquivos'
    foreach ($call in $script:capturedAclCalls) {
      $acl = $call.Acl
      $priorRules = $call.PriorAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
      $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
      $sids = @($rules | ForEach-Object { $_.IdentityReference.Value } | Sort-Object -Unique)
      Assert-True (@($priorRules | Where-Object { $_.IdentityReference.Value -eq 'S-1-5-32-545' }).Count -eq 1) 'fixture antigo deveria ter Users explícito'
      Assert-True (@($rules | Where-Object { $_.IdentityReference.Value -eq 'S-1-5-32-545' }).Count -eq 0) 'ACE Users não foi removida da DACL nova'
      Assert-True ($acl.AreAccessRulesProtected) 'herança antiga não foi removida'
      Assert-True (($sids -join ',') -eq 'S-1-5-18,S-1-5-32-544') 'DACL deve conter somente SYSTEM e Administrators'
      Assert-True (@($rules | Where-Object { $_.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow }).Count -eq 2) 'somente SYSTEM e Administrators devem ter FullControl'
    }
  }

  Invoke-Test 'AgentAcl_RejectsReparseChildBeforeAclWrites' {
    $root = Join-Path $temp 'agent-acl-reparse'
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $script:PastaDados = $root
    $script:Config = Join-Path $root 'agente-senha.json'
    $script:Log = Join-Path $root 'agente-senha.log'
    $scriptFile = Join-Path $root 'Agente-Senha-Nextec.ps1'
    Set-Content -LiteralPath $scriptFile -Value '# reparse fixture' -Encoding UTF8
    $script:forcedReparsePath = $scriptFile
    $script:capturedAclCalls.Clear()
    $failed = $false
    try { ProtegerPastaAgente }
    catch { $failed = $_.Exception.Message -match 'redirecionado' }
    finally { $script:forcedReparsePath = '' }
    Assert-True $failed 'ponto de redirecionamento em script gerenciado deve interromper a proteção'
    Assert-True ($script:capturedAclCalls.Count -eq 0) 'nenhuma ACL deve ser alterada após detectar reparse point'
    Assert-True (-not (Test-Path -LiteralPath $script:Config)) 'nenhuma configuração deve ser criada após detectar reparse point'
  }

  Invoke-Test 'Repair_PreserveIdentity' {
    $fixture = New-TestClient -Root (Join-Path $temp 'preserve') -AppName 'Nextec-Connect' -PeerId '987654321'
    $configFile = Join-Path (Join-Path $temp 'preserve\LocalService\AppData\Roaming\Nextec-Connect') 'config\Nextec-Connect.toml'
    $configHash = (Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash
    $reader = { param($service, $exe) $fixture.PeerId }.GetNewClosure()
    $before = Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase (Join-Path $temp 'preserve') -PeerIdReader $reader
    $after = Get-NextecInstalledClient -Services @($fixture.Service) -ProfileRootBase (Join-Path $temp 'preserve') -PeerIdReader $reader
    Assert-True ($before.PeerId -eq $after.PeerId) 'descoberta/reparo alterou a identidade'
    Assert-True ($before.PeerId -eq '987654321') 'identidade original não foi mantida'
    Assert-True ((Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash -eq $configHash) 'descoberta alterou a configuração existente'
  }
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Todos os testes de identidade passaram.'
