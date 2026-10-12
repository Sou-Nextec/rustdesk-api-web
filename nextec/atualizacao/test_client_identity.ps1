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
      Get-NextecInstalledClient -Services @($a.Service, $b.Service) -ProfileRootBase $base `
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

  Invoke-Test 'Identity_AnyDeskServiceIsNotAnotherRustDeskInstall' {
    $base = Join-Path $temp 'with-anydesk'
    $fixture = New-TestClient -Root $base -AppName 'Nextec-Connect'
    $otherExe = Join-Path $base 'AnyDesk.exe'
    New-Item -ItemType File -Path $otherExe -Force | Out-Null
    $other = New-TestService -Name 'AnyDesk' -ExePath $otherExe
    $client = Get-NextecInstalledClient -Services @($other,$fixture.Service) -ProfileRootBase $base -PeerIdReader { '812345678' }
    Assert-True ($client.ServiceName -eq 'Nextec-Connect') 'AnyDesk deve ser ignorado pela descoberta RustDesk'
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
      catch { $failed = $_.Exception.Message -match 'password_apply_failed' }
      Assert-True $failed "saída ambígua ou falha deveria ser recusada: ExitCode=$($result.ExitCode), Output=$($result.Output)"
    }
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
