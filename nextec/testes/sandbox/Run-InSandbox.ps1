#requires -version 5.1
<#
Roda DENTRO do Windows Sandbox (Windows PowerShell 5.1, administrador, rede desligada). Um cenario por sandbox novo.
Entrada somente leitura em C:\NxIn; saida em C:\NxOut (unica pasta gravavel do host).
  C1  caminho feliz: app instalado SEM o agente + Ativar-Nextec-<ID>.cmd => cadastro, senha aplicada de verdade e confirmada
  C2  cliente com disable-settings: "Settings are disabled!" => client_settings_locked, para de repetir, last_error no painel
  C3  agente antigo (11/10) + .cmd: recusa do painel desfaz tudo (byte a byte); depois sucesso com backup e substituicao
  C4  app com outro nome (simulado: pasta, exe e servico renomeados + marcador) repetindo o C1
O painel e FALSO (FakePanel.ps1, loopback). Nenhuma chave, token ou senha real: tudo de teste, gerado aqui.
#>
param(
  [Parameter(Mandatory)][ValidateSet('C1', 'C2', 'C3', 'C4')][string]$Cenario,
  [string]$In = 'C:\NxIn',
  [string]$Out = 'C:\NxOut'
)
$ErrorActionPreference = 'Stop'
$PanelHost = 'painel-sandbox.nextec.test'
$Work = 'C:\NxWork'
$Local = 'C:\NxState'
$Root = Join-Path $env:ProgramData 'Nextec\Acesso'
$TaskCoord = 'Nextec Acesso - Cadastro de agente'
$TaskSenha = 'Nextec Acesso - Senha'
$Scripts = @('Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1')
$script:Results = @()
$script:Notes = @()
$script:PanelProc = $null
$script:BootstrapToken = ''
New-Item -ItemType Directory -Force -Path $Work, $Local, $Out | Out-Null

function Log([string]$m) {
  $l = '{0:HH:mm:ss} {1}' -f (Get-Date), $m
  Write-Host $l
  try { [IO.File]::AppendAllText((Join-Path $Out 'execucao.log'), $l + "`r`n") } catch { }
}
function Check([string]$Name, [bool]$Ok, [string]$Detail = '') {
  $script:Results += [pscustomobject]@{ check = $Name; ok = $Ok; detail = $Detail }
  $tag = 'FALHOU'
  if ($Ok) { $tag = 'PASSOU' }
  Log ($tag + ': ' + $Name + $(if ($Detail) { ' | ' + $Detail } else { '' }))
}
function Note([string]$Text) { $script:Notes += $Text; Log ('NOTA: ' + $Text) }

$ExeHelperSrc = @'
function Invoke-Exe {
  # app RustDesk e GUI (subsistema Windows): `& exe` nao espera nem captura; aqui sim, com limite de tempo.
  param([string]$Exe, [string[]]$Arguments, [int]$TimeoutSec = 60)
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $Exe
  $psi.Arguments = ($Arguments -join ' ')
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [Diagnostics.Process]::Start($psi)
  $o = $p.StandardOutput.ReadToEndAsync()
  $e = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit($TimeoutSec * 1000)) { try { $p.Kill() } catch { }; return [pscustomobject]@{ Exit = -1; Output = 'timeout' } }
  $p.WaitForExit()
  return [pscustomobject]@{ Exit = [int]$p.ExitCode; Output = (([string]$o.Result + "`n" + [string]$e.Result).Trim()) }
}
'@
. ([scriptblock]::Create($ExeHelperSrc))

function Wait-Until([scriptblock]$Cond, [int]$Seconds, [int]$Step = 3) {
  $end = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $end) {
    try { if (& $Cond) { return $true } } catch { }
    Start-Sleep -Seconds $Step
  }
  return $false
}

function Invoke-AsSystem([string]$Code, [int]$TimeoutSec = 120) {
  $id = [Guid]::NewGuid().ToString('N').Substring(0, 8)
  $dir = Join-Path $Local 'sys'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $script = Join-Path $dir ($id + '.ps1')
  $outf = Join-Path $dir ($id + '.out')
  $body = $ExeHelperSrc + "`r`n" + '$ErrorActionPreference = ''Continue''' + "`r`n" +
    '$r = & { ' + $Code + ' } 2>&1 | Out-String' + "`r`n" +
    '[IO.File]::WriteAllText(''' + $outf + ''', $r)' + "`r`n" +
    '[IO.File]::WriteAllText(''' + $outf + '.done'', ''1'')' + "`r`n"
  [IO.File]::WriteAllText($script, $body, (New-Object Text.UTF8Encoding($true)))
  $name = 'NxSbx-' + $id
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $script + '"')
  Register-ScheduledTask -TaskName $name -Action $act -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
  try {
    Start-ScheduledTask -TaskName $name
    [void](Wait-Until { Test-Path -LiteralPath ($outf + '.done') } $TimeoutSec 1)
    if (Test-Path -LiteralPath $outf) { return ([IO.File]::ReadAllText($outf)).Trim() }
    return '(sem saida)'
  } finally { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue }
}

function Save-Screenshot([string]$Name) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object Drawing.Bitmap $b.Width, $b.Height
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size)
    $bmp.Save((Join-Path $Out ($Name + '.png')), [Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  } catch { Log ('captura de tela indisponivel: ' + $_.Exception.Message) }
}

function New-RandomToken([int]$Length) {
  $alphabet = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  $bytes = New-Object byte[] $Length
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

function Get-AppService {
  $all = @(Get-CimInstance -ClassName Win32_Service | Where-Object { [string]$_.PathName -match '(?i)(^|\s)--service(\s|$)' })
  foreach ($s in $all) {
    $m = [regex]::Match([string]$s.PathName, '^\s*"([^"]+\.exe)"')
    if (-not $m.Success) { $m = [regex]::Match([string]$s.PathName, '^\s*(\S+\.exe)') }
    if ($m.Success -and (Test-Path -LiteralPath $m.Groups[1].Value)) {
      return [pscustomobject]@{ Name = [string]$s.Name; Exe = $m.Groups[1].Value; State = [string]$s.State; Account = [string]$s.StartName; PathName = [string]$s.PathName }
    }
  }
  return $null
}

function Get-PeerId([string]$Exe, [int]$Seconds = 150) {
  $script:lastPeer = ''
  $script:tries = 0
  [void](Wait-Until {
      $script:tries++
      $o1 = (& $Exe --get-id 2>&1 | Out-String).Trim()
      $r = [pscustomobject]@{ Exit = $LASTEXITCODE; Output = $o1 }
      if (-not $o1) { $r = Invoke-Exe -Exe $Exe -Arguments @('--get-id') -TimeoutSec 30 }
      $line = (([string]$r.Output -split "`r?`n") | Where-Object { $_.Trim() } | Select-Object -Last 1)
      if ($script:tries -le 2 -or $script:tries % 6 -eq 0) { Log ('--get-id tentativa ' + $script:tries + ': codigo=' + $r.Exit + ' saida=' + (([string]$r.Output) -replace '\s+', ' ')) }
      if ([string]$line -match '^\d{6,}$') { $script:lastPeer = $line.Trim(); return $true }
      return $false
    } $Seconds 5)
  if (-not $script:lastPeer) {
    $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Nextec*' -or $_.ProcessName -like '*Nextec*' -or $_.ProcessName -like '*rustdesk*' } | ForEach-Object { $_.ProcessName + '#' + $_.Id + '@s' + $_.SessionId })
    Log ('processos do app: ' + ($procs -join ', '))
    $sys = Invoke-AsSystem ("(Invoke-Exe '" + $Exe + "' @('--get-id')).Output") 60
    Log ('--get-id como SYSTEM: ' + ($sys -replace '\s+', ' '))
    foreach ($b in @((Join-Path $env:WinDir 'ServiceProfiles\LocalService\AppData\Roaming'), (Join-Path $env:WinDir 'System32\config\systemprofile\AppData\Roaming'))) {
      Log ('config em ' + $b + ': ' + ((Get-ChildItem -LiteralPath $b -Recurse -Depth 3 -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*.toml' } | ForEach-Object { $_.FullName.Substring($b.Length) }) -join ', '))
    }
  }
  return $script:lastPeer
}

# O RustDesk deriva o ID do MAC da placa de rede; com Networking=Disable o sandbox nao tem nenhuma e o app nao gera ID
# ("Failed to generate ID", --get-id vazio). Cria-se o adaptador Microsoft KM-TEST Loopback (netloop.inf, incluso no
# Windows) pelo SetupAPI, o mesmo caminho do devcon: ele da um MAC e NENHUMA rota, entao nada sai do sandbox.
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class NxDev {
  [StructLayout(LayoutKind.Sequential)] public struct SP_DEVINFO_DATA { public uint cbSize; public Guid ClassGuid; public uint DevInst; public UIntPtr Reserved; }
  [DllImport("setupapi.dll", SetLastError=true)] static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid g, IntPtr h);
  [DllImport("setupapi.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool SetupDiCreateDeviceInfo(IntPtr s, string n, ref Guid g, string d, IntPtr h, uint f, ref SP_DEVINFO_DATA data);
  [DllImport("setupapi.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool SetupDiSetDeviceRegistryProperty(IntPtr s, ref SP_DEVINFO_DATA data, uint p, byte[] b, uint size);
  [DllImport("setupapi.dll", SetLastError=true)] static extern bool SetupDiCallClassInstaller(uint f, IntPtr s, ref SP_DEVINFO_DATA data);
  [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr s);
  [DllImport("newdev.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool UpdateDriverForPlugAndPlayDevices(IntPtr h, string hwid, string inf, uint flags, out bool reboot);
  public static string Install(string inf, string hwid) {
    Guid net = new Guid("4d36e972-e325-11ce-bfc1-08002be10318");
    IntPtr set = SetupDiCreateDeviceInfoList(ref net, IntPtr.Zero);
    if (set == (IntPtr)(-1)) return "CreateDeviceInfoList err=" + Marshal.GetLastWin32Error();
    SP_DEVINFO_DATA d = new SP_DEVINFO_DATA(); d.cbSize = (uint)Marshal.SizeOf(typeof(SP_DEVINFO_DATA));
    if (!SetupDiCreateDeviceInfo(set, "Net", ref net, null, IntPtr.Zero, 1, ref d)) return "CreateDeviceInfo err=" + Marshal.GetLastWin32Error();
    byte[] hw = System.Text.Encoding.Unicode.GetBytes(hwid + "\0\0");
    if (!SetupDiSetDeviceRegistryProperty(set, ref d, 1, hw, (uint)hw.Length)) return "SetHardwareId err=" + Marshal.GetLastWin32Error();
    if (!SetupDiCallClassInstaller(0x19, set, ref d)) return "Register err=" + Marshal.GetLastWin32Error();
    bool reboot;
    if (!UpdateDriverForPlugAndPlayDevices(IntPtr.Zero, hwid, inf, 1, out reboot)) return "UpdateDriver err=" + Marshal.GetLastWin32Error();
    SetupDiDestroyDeviceInfoList(set);
    return "ok reboot=" + reboot;
  }
}
'@
function Initialize-LoopbackAdapter {
  $has = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.MacAddress })
  if ($has.Count -eq 0) {
    Log ('adaptador loopback (SetupAPI): ' + [NxDev]::Install((Join-Path $env:WinDir 'INF\netloop.inf'), '*MSLOOP'))
    [void](Wait-Until { @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.MacAddress -and $_.Status -eq 'Up' }).Count -gt 0 } 90 3)
  }
  $ad = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.MacAddress })
  Log ('adaptadores: ' + (($ad | ForEach-Object { $_.InterfaceDescription + ' mac=' + $_.MacAddress + ' status=' + $_.Status }) -join '; '))
  Check 'adaptador loopback (sem rota) criado para o app poder gerar o ID' ($ad.Count -gt 0) ($ad.Count.ToString() + ' adaptador(es)')
  $routes = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
  Check 'isolamento: nenhuma rota padrao (sem saida de rede)' ($routes.Count -eq 0) ('rotas padrao: ' + $routes.Count)
}

function Install-App {
  Initialize-LoopbackAdapter
  $msi = Join-Path $Work 'app.msi'
  Copy-Item -LiteralPath (Join-Path $In 'app.msi') -Destination $msi -Force
  $log = Join-Path $Out 'msi-install.log'
  $p = Start-Process -FilePath msiexec.exe -ArgumentList ('/i "' + $msi + '" /qn /norestart INSTALLPRINTER=0 /l*v "' + $log + '"') -Wait -PassThru -WindowStyle Hidden
  Check 'MSI do app instalou (codigo 0 ou 3010)' ($p.ExitCode -in @(0, 3010)) ('codigo ' + $p.ExitCode)
  if ($p.ExitCode -notin @(0, 3010)) { throw 'msi_falhou' }
  $svc = $null
  [void](Wait-Until { $script:s = Get-AppService; [bool]$script:s } 90 3)
  $svc = $script:s
  if (-not $svc) { throw 'servico_nao_encontrado' }
  if ($svc.State -ne 'Running') { try { Start-Service -Name $svc.Name } catch { }; Start-Sleep -Seconds 5 }
  return (Get-AppService)
}

# ---------- painel falso ----------
function Start-FakePanel([string]$PeerId, [string]$Uuid) {
  $cert = New-SelfSignedCertificate -DnsName $PanelHost -CertStoreLocation Cert:\LocalMachine\My -NotAfter (Get-Date).AddDays(2)
  $cer = Join-Path $Local 'painel.cer'
  Export-Certificate -Cert $cert -FilePath $cer | Out-Null
  Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
  & netsh http delete sslcert ipport=0.0.0.0:443 2>&1 | Out-Null
  $n = & netsh http add sslcert ipport=0.0.0.0:443 certhash=$($cert.Thumbprint) appid='{6f0b5c1e-3b1a-4d63-9a3e-1f2f6a7a1c11}' 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('netsh sslcert falhou: ' + ($n | Out-String)) }
  $hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
  Add-Content -LiteralPath $hosts -Value ("`r`n127.0.0.1 " + $PanelHost) -Encoding ASCII
  Clear-DnsClientCache -ErrorAction SilentlyContinue
  $script:StateFile = Join-Path $Local 'painel-estado.json'
  $script:ModeFile = Join-Path $Local 'painel-modo.json'
  $script:SecretFile = Join-Path $Local 'segredo-senha.txt'
  [IO.File]::WriteAllText($script:ModeFile, '{"bootstrap":"accept"}')
  $cfg = @{ host = $PanelHost; bootstrap = $script:BootstrapToken; id = $PeerId; uuid = $Uuid
    state_file = $script:StateFile; mode_file = $script:ModeFile; log_file = (Join-Path $Out 'painel-chamadas.log'); secret_file = $script:SecretFile }
  $cfgFile = Join-Path $Local 'painel-config.json'
  [IO.File]::WriteAllText($cfgFile, ($cfg | ConvertTo-Json -Compress))
  $script:PanelProc = Start-Process -FilePath powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $In 'FakePanel.ps1') + '" -ConfigFile "' + $cfgFile + '"') -WindowStyle Hidden -PassThru
  $up = Wait-Until {
      if (-not (Test-Path -LiteralPath $script:StateFile)) { return $false }
      $c = New-Object Net.Sockets.TcpClient
      try { $c.Connect('127.0.0.1', 443); return $c.Connected } finally { $c.Close() }
    } 60 2
  Check 'painel falso no ar (HTTPS 443 em loopback)' $up
  # HTTPS de verdade com o certificado autoassinado confiado: sem excecao de certificado, um POST sem token tem de voltar 401
  $code = 0
  try { Invoke-WebRequest -Uri ('https://' + $PanelHost + '/api/nextec/agent/sync') -Method Post -ContentType 'application/json' -Body '{}' -UseBasicParsing | Out-Null } catch {
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } else { $code = -1 }
  }
  Check 'certificado do painel falso confiado (POST sem token responde 401)' ($code -eq 401) ('status ' + $code)
}
function Get-PanelState {
  for ($i = 0; $i -lt 8; $i++) {
    try { return ([IO.File]::ReadAllText($script:StateFile) | ConvertFrom-Json) } catch { Start-Sleep -Milliseconds 250 }
  }
  return $null
}
function Set-PanelMode([string]$Mode) { [IO.File]::WriteAllText($script:ModeFile, ('{"bootstrap":"' + $Mode + '"}')) }

# ---------- .cmd ----------
function Get-MachineUuid {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
  try { $k = $base.OpenSubKey('SOFTWARE\Microsoft\Cryptography'); try { $g = [string]$k.GetValue('MachineGuid') } finally { $k.Dispose() } } finally { $base.Dispose() }
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($g.Trim()))
}
function New-ActivationCmd([string]$PeerId, [string]$Dest) {
  $json = '{"painel":"https://' + $PanelHost + '","id":"' + $PeerId + '","uuid":"' + (Get-MachineUuid) + '","bootstrap":"' + $script:BootstrapToken + '"}'
  $data = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
  $exp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 900
  $text = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes((Join-Path $In 'Ativar-Modelo.cmd')))
  $lines = $text -split "`r`n"
  $changed = 0
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -like 'rem NXID *') { $lines[$i] = 'rem NXID ' + $PeerId; $changed++ }
    elseif ($lines[$i] -like 'rem NXEXP *') { $lines[$i] = 'rem NXEXP ' + $exp; $changed++ }
    elseif ($lines[$i] -like 'rem NXDATA *') { $lines[$i] = 'rem NXDATA ' + $data; $changed++ }
  }
  if ($changed -ne 3) { throw 'modelo_cmd_inesperado' }
  [IO.File]::WriteAllBytes($Dest, [Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n")))
}
function Invoke-ActivationCmd([string]$PeerId, [string]$Tag) {
  $cmd = Join-Path $Work ('Ativar-Nextec-' + $PeerId + '.cmd')
  New-ActivationCmd -PeerId $PeerId -Dest $cmd
  $o = Join-Path $Out ($Tag + '-saida-cmd.txt')
  $p = Start-Process -FilePath $env:ComSpec -ArgumentList ('/c ""' + $cmd + '" < NUL"') -RedirectStandardOutput $o -PassThru -WindowStyle Hidden
  $null = $p.Handle   # sem isso o ExitCode de um Start-Process -PassThru sem -Wait volta vazio
  # enquanto o .cmd roda, copia os logs do agente (o rollback apaga os logs novos; assim o motivo da falha fica registrado)
  while (-not $p.HasExited) {
    foreach ($n in @('provisionamento-agente.log', 'coordenador.log', 'agente-senha.log', 'ativar.log')) {
      $t = Read-RootLog $n
      if ($t) { try { [IO.File]::WriteAllText((Join-Path $Out ($Tag + '-vivo-' + $n)), $t) } catch { } }
    }
    Start-Sleep -Seconds 1
  }
  $p.WaitForExit()
  foreach ($n in @('provisionamento-agente.log', 'coordenador.log', 'agente-senha.log', 'ativar.log')) {
    $t = Read-RootLog $n
    if ($t) { try { [IO.File]::WriteAllText((Join-Path $Out ($Tag + '-vivo-' + $n)), $t) } catch { } }
  }
  $txt = ''
  try { $txt = [IO.File]::ReadAllText($o) } catch { }
  return [pscustomobject]@{ Exit = [int]$p.ExitCode; Output = $txt; Cmd = $cmd }
}

# ---------- verificacoes comuns ----------
function Get-ExpectedIntervals {
  $tokens = $null; $errs = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $In 'scripts\Agente-Senha-Nextec.ps1'), [ref]$tokens, [ref]$errs)
  $fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-NextecAgentIntervals' }, $true)
  . ([scriptblock]::Create($fn.Extent.Text))
  $t = Get-NextecAgentIntervals
  return [pscustomobject]@{ Coordinator = ('PT{0}M' -f [int]$t.CoordinatorMinutes); Password = ('PT{0}M' -f [int]$t.PasswordMinutes); PasswordMinutes = [int]$t.PasswordMinutes }
}
function Test-NoAgentInstalled([string]$Label) {
  $found = @()
  foreach ($n in $Scripts) { if (Test-Path -LiteralPath (Join-Path $Root $n)) { $found += $n } }
  Check ($Label + ': sem scripts do agente em ProgramData\Nextec\Acesso') ($found.Count -eq 0) ($found -join ',')
  $pf = @(Get-ChildItem -LiteralPath $env:ProgramFiles -Filter 'Agente-Senha-Nextec.ps1' -File -Recurse -ErrorAction SilentlyContinue)
  Check ($Label + ': sem Agente-Senha-Nextec.ps1 em Program Files') ($pf.Count -eq 0) ('encontrados ' + $pf.Count)
  foreach ($t in @($TaskCoord, $TaskSenha)) {
    Check ($Label + ': sem tarefa "' + $t + '"') (-not (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue))
  }
}
function Test-InstalledScripts {
  foreach ($n in $Scripts) {
    $dst = Join-Path $Root $n
    $ok = (Test-Path -LiteralPath $dst) -and ((Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath (Join-Path $In ('scripts\' + $n)) -Algorithm SHA256).Hash)
    Check ('script instalado com hash igual ao do pacote: ' + $n) $ok
  }
  $bad = @()
  foreach ($n in $Scripts) {
    $dst = Join-Path $Root $n
    if (-not (Test-Path -LiteralPath $dst)) { continue }
    foreach ($r in (Get-Acl -LiteralPath $dst).GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      if ($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin @('S-1-5-18', 'S-1-5-32-544')) { $bad += ($n + ':' + $r.IdentityReference.Value) }
    }
  }
  Check 'ACL dos scripts so SYSTEM e Administradores' ($bad.Count -eq 0) ($bad -join ',')
}
function Test-IsSystemAccount([string]$Name) {
  # o nome da conta e localizado (pt-BR: SISTEMA); a identidade e o SID S-1-5-18
  try { return ((New-Object Security.Principal.NTAccount($Name)).Translate([Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-18') } catch { return ($Name -eq 'S-1-5-18') }
}
function Test-Tasks($Exp) {
  $c = Get-ScheduledTask -TaskName $TaskCoord -ErrorAction SilentlyContinue
  $okc = $false; $dc = 'ausente'
  if ($c) { $dc = ('{0} {1}' -f $c.Principal.UserId, $c.Triggers[0].Repetition.Interval); $okc = ((Test-IsSystemAccount ([string]$c.Principal.UserId)) -and $c.Triggers[0].Repetition.Interval -eq $Exp.Coordinator) }
  Check ('tarefa de cadastro SYSTEM com repeticao ' + $Exp.Coordinator) $okc $dc
  $s = Get-ScheduledTask -TaskName $TaskSenha -ErrorAction SilentlyContinue
  $oks = $false; $ds = 'ausente'
  if ($s) { $ds = ('{0} {1} estado={2}' -f $s.Principal.UserId, $s.Triggers[0].Repetition.Interval, $s.State); $oks = ((Test-IsSystemAccount ([string]$s.Principal.UserId)) -and $s.Triggers[0].Repetition.Interval -eq $Exp.Password) }
  Check ('tarefa de senha SYSTEM com repeticao ' + $Exp.Password) $oks $ds
}
function Read-RootLog([string]$Name) {
  $p = Join-Path $Root $Name
  if (-not (Test-Path -LiteralPath $p)) { return '' }
  try {
    $fs = [IO.File]::Open($p, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try { $sr = New-Object IO.StreamReader($fs); return $sr.ReadToEnd() } finally { $fs.Dispose() }
  } catch { return '' }
}
function Copy-Evidence([string]$Tag) {
  $dir = Join-Path $Out ('evidencias-' + $Tag)
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  if (Test-Path -LiteralPath $Root) {
    foreach ($f in @(Get-ChildItem -LiteralPath $Root -Force -File -ErrorAction SilentlyContinue)) {
      if ($f.Name -like '*.log' -or $f.Name -in @('provisionamento-agente.json', 'agente-senha.bloqueio.json', 'agente-senha.ultimo-erro', 'nextec-marker.json', 'agente-senha.falhas')) {
        try { [IO.File]::WriteAllText((Join-Path $dir $f.Name), (Read-RootLog $f.Name)) } catch { }
      }
    }
    $lst = foreach ($f in @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue)) {
      $h = ''
      if (-not $f.PSIsContainer) { try { $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash } catch { } }
      '{0}  {1,8}  {2}  {3}' -f $f.LastWriteTimeUtc.ToString('s'), $(if ($f.PSIsContainer) { 0 } else { $f.Length }), $h, $f.Name
    }
    [IO.File]::WriteAllText((Join-Path $dir 'pasta-dados-listagem.txt'), (($lst | Out-String)))
  }
  try {
    $svcE = Get-AppService
    if ($svcE) {
      $appDir = Split-Path -Parent $svcE.Exe
      $al = foreach ($f in @(Get-ChildItem -LiteralPath $appDir -Force -ErrorAction SilentlyContinue)) { '{0,10}  {1}' -f $(if ($f.PSIsContainer) { '<dir>' } else { $f.Length }), $f.Name }
      [IO.File]::WriteAllText((Join-Path $dir 'pasta-do-app-listagem.txt'), (($al | Out-String)))
    }
  } catch { }
  $tl = foreach ($n in @($TaskCoord, $TaskSenha, 'Nextec Acesso - Atualizacao')) {
    $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
    if ($t) { '{0} | estado={1} | conta={2} | repeticao={3}' -f $n, $t.State, $t.Principal.UserId, $(if ($t.Triggers.Count) { $t.Triggers[0].Repetition.Interval } else { '' }) } else { $n + ' | ausente' }
  }
  [IO.File]::WriteAllText((Join-Path $dir 'tarefas.txt'), (($tl | Out-String)))
  $ps = Get-PanelState
  if ($ps) { [IO.File]::WriteAllText((Join-Path $dir 'painel-estado.json'), ($ps | ConvertTo-Json -Depth 4)) }
}
function Get-DirSnapshot([string]$Dir) {
  $h = @{}
  if (-not (Test-Path -LiteralPath $Dir)) { return $h }
  foreach ($f in @(Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue)) {
    if ($f.PSIsContainer) { $h[$f.Name.ToLowerInvariant() + '/'] = 'dir'; continue }
    if ($f.Name -like '*.log') { continue }
    $h[$f.Name.ToLowerInvariant()] = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash + ' ' + (Get-Acl -LiteralPath $f.FullName).Sddl
  }
  $h['<pasta>'] = (Get-Acl -LiteralPath $Dir).Sddl
  return $h
}
function Compare-Snapshot($A, $B) {
  $diff = @()
  foreach ($k in $A.Keys) { if (-not $B.ContainsKey($k)) { $diff += ('sumiu: ' + $k) } elseif ($A[$k] -cne $B[$k]) { $diff += ('mudou: ' + $k) } }
  foreach ($k in $B.Keys) { if (-not $A.ContainsKey($k)) { $diff += ('apareceu: ' + $k) } }
  return $diff
}
function Get-TaskSnapshot {
  $h = @{}
  foreach ($n in @($TaskCoord, $TaskSenha)) {
    $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
    if ($t) {
      $xml = [string](Export-ScheduledTask -TaskName $n)
      $sha = [Security.Cryptography.SHA256]::Create()
      $h[$n] = [string]$t.State + ' ' + [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($xml)))
    } else { $h[$n] = 'ausente' }
  }
  return $h
}

# Caminho feliz completo (C1 e C4): cmd, ativar.log, scripts, tarefas, cadastro, senha aplicada de verdade e confirmada.
function Test-HappyPath([string]$Tag, $Svc, [string]$PeerId) {
  $exp = Get-ExpectedIntervals
  $r = Invoke-ActivationCmd -PeerId $PeerId -Tag $Tag
  Check ('.cmd gerado pelo painel saiu com codigo 0 (' + $Tag + ')') ($r.Exit -eq 0) ('codigo ' + $r.Exit)
  Check '.cmd imprimiu "Pronto: maquina ativada"' ($r.Output -match 'Pronto: m.quina ativada|Pronto: m')
  $ativar = Read-RootLog 'ativar.log'
  Check 'ativar.log: cadastro=activated e sem rollback' (($ativar -match 'cadastro=activated') -and ($ativar -notmatch 'rollback|excecao|receber_falhou')) (($ativar -split "`r?`n" | Select-Object -Last 3) -join ' / ')
  Check 'ativar.log: instalou os tres scripts' ($ativar -match 'instalado=Coordenar-Agente-Nextec\.ps1,Provisionar-Agente-Nextec\.ps1,Agente-Senha-Nextec\.ps1')
  Test-InstalledScripts
  Test-Tasks $exp
  $st = Get-PanelState
  Check 'painel falso recebeu o bootstrap com ID e uuid do sandbox' ($st -and $st.bootstrap_accepted -ge 1 -and $st.bootstrap_id -eq $PeerId -and $st.bootstrap_uuid -eq (Get-MachineUuid)) ('aceitos=' + $st.bootstrap_accepted)
  Check 'cadastro local gravado (agente-senha.json) para o ID do app' ((Test-Path -LiteralPath (Join-Path $Root 'agente-senha.json')) -and ((Get-Content -LiteralPath (Join-Path $Root 'agente-senha.json') -Raw | ConvertFrom-Json).id -eq $PeerId))
  $done = Wait-Until { $s = Get-PanelState; $s -and $s.confirmed } 300 3
  $st = Get-PanelState
  Check 'troca de senha: proposta, aplicada pelo app real e confirmada no painel' $done ('propostas=' + $st.password_proposals + ' confirmacoes=' + $st.confirm_count + ' tamanho=' + $st.password_length)
  Check 'senha proposta tem 24 caracteres' ($st.password_length -eq 24) ('tamanho ' + $st.password_length)
  $senhaLog = Read-RootLog 'agente-senha.log'
  Check 'agente-senha.log registra senha aplicada e confirmada' ($senhaLog -match 'Senha aplicada e opera') ((($senhaLog -split "`r?`n") | Where-Object { $_.Trim() } | Select-Object -Last 3) -join ' / ')
  Check 'agente-senha.log limpo (sem ERRO, password_apply_failed ou client_settings_locked)' ($senhaLog -notmatch 'ERRO|password_apply_failed|client_settings_locked')
  Test-Tasks $exp
  # o ciclo continua: nova consulta sem nova troca
  $syncAntes = $st.sync_count
  $again = Wait-Until { $s = Get-PanelState; $s -and ($s.sync_count -ge ($syncAntes + 2)) } (($exp.PasswordMinutes * 60 * 3) + 60) 5
  $st = Get-PanelState
  Check 'agente repete a consulta no ritmo da tarefa (2+ syncs novos) sem trocar a senha de novo' ($again -and $st.password_proposals -eq 1) ('sync_count=' + $st.sync_count + ' propostas=' + $st.password_proposals)
  Check 'painel falso tem last_sync_at e o intervalo informado pelo agente' ([bool]$st.last_sync_at -and $st.interval_seconds -eq ($exp.PasswordMinutes * 60)) ('last_sync_at=' + $st.last_sync_at + ' interval_seconds=' + $st.interval_seconds + ' app_name=' + $st.app_name)
  # varias rodadas do coordenador (a cada CoordinatorMinutes): a tarefa de senha so deve ser registrada UMA vez
  $okRounds = Wait-Until { (@(((Read-RootLog 'provisionamento-agente.log') -split "`r?`n") | Where-Object { $_ -match 'already_configured' }).Count -ge 3) } 420 10
  $reg = @(((Read-RootLog 'agente-senha.log') -split "`r?`n") | Where-Object { $_ -match 'Tarefa de senha registrada' }).Count
  $rounds = @(((Read-RootLog 'provisionamento-agente.log') -split "`r?`n") | Where-Object { $_ -match 'already_configured' }).Count
  $uid = [string](Get-ScheduledTask -TaskName $TaskSenha -ErrorAction SilentlyContinue).Principal.UserId
  Check 'tarefa de senha NAO e recriada a cada rodada do coordenador (registrada so 1 vez)' ($reg -le 1) ('registros=' + $reg + ' rodadas_ja_configurado=' + $rounds + ' conta_da_tarefa=' + $uid)
  # estado real do app, lido como SYSTEM (a mesma conta do agente): opcoes aplicadas pelo agente
  $o1 = Invoke-AsSystem ("(Invoke-Exe '" + $Svc.Exe + "' @('--option','approve-mode')).Output")
  $o2 = Invoke-AsSystem ("(Invoke-Exe '" + $Svc.Exe + "' @('--option','verification-method')).Output")
  Check 'app real: approve-mode=password (lido como SYSTEM)' ($o1.Trim() -eq 'password') $o1
  Check 'app real: verification-method=use-permanent-password (lido como SYSTEM)' ($o2.Trim() -eq 'use-permanent-password') $o2
}

function Remove-SecretsFromOut {
  # varredura: nenhum token de autorizacao, token proposto ou senha pode estar nos arquivos de saida
  $needles = @($script:BootstrapToken)
  if ($script:SecretFile -and (Test-Path -LiteralPath $script:SecretFile)) { foreach ($l in @(Get-Content -LiteralPath $script:SecretFile)) { if ($l.Trim().Length -ge 20) { $needles += $l.Trim() } } }
  $hits = @()
  foreach ($f in @(Get-ChildItem -LiteralPath $Out -Recurse -File -ErrorAction SilentlyContinue)) {
    if ($f.Extension -eq '.png') { continue }
    $t = ''
    try { $t = [IO.File]::ReadAllText($f.FullName) } catch { continue }
    foreach ($n in $needles) { if ($n -and $t.Contains($n)) { $hits += $f.Name } }
  }
  Check 'varredura: nenhum segredo (autorizacao, token, senha) nos arquivos de saida' ($hits.Count -eq 0) ($hits -join ',')
}

# ---------- cenarios ----------
function Invoke-C1 {
  $svc = Install-App
  Log ('servico: ' + $svc.Name + ' exe=' + $svc.Exe + ' conta=' + $svc.Account)
  Test-NoAgentInstalled 'antes'
  $peer = Get-PeerId $svc.Exe
  Check 'ID do app obtido pelo CLI --get-id' ([bool]$peer) $peer
  if (-not $peer) { throw 'sem_id' }
  Start-FakePanel -PeerId $peer -Uuid (Get-MachineUuid)
  Test-HappyPath -Tag 'C1' -Svc $svc -PeerId $peer
}

function Set-DisableSettings($Svc) {
  # `disable-settings` e uma opcao "hard" do cliente: entra pelo custom.txt (raiz do JSON em base64), nao pelo toml.
  # O gerador (rdgenerator/views.py) grava decodedCustom['disable-settings']='Y' nesse mesmo arquivo; aqui o arquivo que
  # ja veio com o app ganha a mesma chave (ou, se nao houver, e criado so com ela).
  $appDir = Split-Path -Parent $Svc.Exe
  Stop-Service -Name $Svc.Name -Force
  Start-Sleep -Seconds 4
  $files = @(Get-ChildItem -LiteralPath $appDir -Force -File -Filter 'custom*.txt' -ErrorAction SilentlyContinue)
  $touched = @()
  if ($files.Count -eq 0) {
    $files = @()
    foreach ($n in @('custom.txt', 'custom_.txt')) { $touched += $n; [IO.File]::WriteAllText((Join-Path $appDir $n), [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('{"disable-settings":"Y"}'))) }
  } else {
    foreach ($f in $files) {
      $raw = ([IO.File]::ReadAllText($f.FullName)).Trim()
      try {
        $obj = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw)) | ConvertFrom-Json
        $obj | Add-Member -NotePropertyName 'disable-settings' -NotePropertyValue 'Y' -Force
        [IO.File]::WriteAllText($f.FullName, [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 6 -Compress))))
        $touched += $f.Name
      } catch { Log ('custom ilegivel: ' + $f.Name + ' ' + $_.Exception.Message) }
    }
  }
  Start-Service -Name $Svc.Name
  Start-Sleep -Seconds 6
  return $touched
}

function Invoke-C2 {
  $svc = Install-App
  $peer = Get-PeerId $svc.Exe
  Check 'ID do app obtido pelo CLI --get-id' ([bool]$peer) $peer
  if (-not $peer) { throw 'sem_id' }
  Test-NoAgentInstalled 'antes'
  $touched = Set-DisableSettings $svc
  Check 'disable-settings=Y gravado no custom.txt do app (mesma chave que o gerador injeta)' ($touched.Count -gt 0) ($touched -join '; ')
  Note 'C2: o app de teste NAO foi gerado com disable-settings; a chave foi gravada no custom.txt do app instalado, que e onde o gerador a injeta (HARD_SETTINGS).'
  $peer2 = Get-PeerId $svc.Exe 60
  Check 'app continua respondendo ao --get-id com o mesmo ID depois da opcao' ($peer2 -eq $peer) ($peer2)
  $code = '$r = Invoke-Exe ''' + $svc.Exe + ''' @(''--password'',''SenhaDeTesteDescartavel1''); ''exit='' + $r.Exit + '' saida='' + $r.Output'
  $sys = Invoke-AsSystem $code
  Check 'reproduzido: --password como SYSTEM responde "Settings are disabled!" com codigo 0' ($sys -match 'exit=0' -and $sys -match 'Settings are disabled!') $sys
  # o que o agente ANTES da correcao (e6d178b^) faria com essa resposta
  try {
    $tokens = $null; $errs = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $In 'antigo-pre-fix\Agente-Senha-Nextec.ps1'), [ref]$tokens, [ref]$errs)
    $fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Assert-NextecPasswordApplied' }, $true)
    . ([scriptblock]::Create($fn.Extent.Text))
    $msg = ''
    try { Assert-NextecPasswordApplied -Result ([pscustomobject]@{ ExitCode = 0; Output = 'Settings are disabled!' }) } catch { $msg = [string]$_.Exception.Message }
    Check 'agente anterior a correcao classificaria como password_apply_failed (comportamento antigo reproduzido)' ($msg -like 'password_apply_failed*') $msg
  } catch { Note ('C2: nao foi possivel carregar o agente pre-correcao: ' + $_.Exception.Message) }
  Start-FakePanel -PeerId $peer -Uuid (Get-MachineUuid)
  $r = Invoke-ActivationCmd -PeerId $peer -Tag 'C2'
  Check '.cmd ativa (o cadastro independe do bloqueio de configuracoes), codigo 0' ($r.Exit -eq 0) ('codigo ' + $r.Exit)
  Test-InstalledScripts
  $found = Wait-Until { $x = Read-RootLog 'agente-senha.log'; $x -match 'client_settings_locked' } 180 3
  Check 'agente classifica client_settings_locked no agente-senha.log' $found (((Read-RootLog 'agente-senha.log') -split "`r?`n") | Where-Object { $_ -match 'ERRO' } | Select-Object -First 1)
  $senhaLog = Read-RootLog 'agente-senha.log'
  Check 'agente nao registra password_apply_failed (a consulta --option ja detecta o bloqueio)' ($senhaLog -notmatch 'password_apply_failed')
  Check 'espera longa gravada (agente-senha.bloqueio.json com client_settings_locked)' ((Read-RootLog 'agente-senha.bloqueio.json') -match 'client_settings_locked')
  Check 'ultimo erro gravado para o painel (agente-senha.ultimo-erro)' ((Read-RootLog 'agente-senha.ultimo-erro').Trim() -eq 'client_settings_locked')
  $exp = Get-ExpectedIntervals
  $errosAntes = @(($senhaLog -split "`r?`n") | Where-Object { $_ -match 'ERRO' }).Count
  $st = Get-PanelState
  $syncAntes = $st.sync_count
  [void](Wait-Until { $s = Get-PanelState; $s -and ($s.sync_count -ge ($syncAntes + 3)) -and $s.last_error -eq 'client_settings_locked' } (($exp.PasswordMinutes * 60 * 4) + 90) 5)
  $st = Get-PanelState
  $senhaLog2 = Read-RootLog 'agente-senha.log'
  $errosDepois = @(($senhaLog2 -split "`r?`n") | Where-Object { $_ -match 'ERRO' }).Count
  Check 'agente para de repetir: nenhuma linha de ERRO nova em 3+ rodadas' ($errosDepois -eq $errosAntes) ('ERRO antes=' + $errosAntes + ' depois=' + $errosDepois + ' syncs=' + $st.sync_count)
  Check 'painel falso recebeu last_error=client_settings_locked no sync' ($st.last_error -eq 'client_settings_locked' -or $st.last_error_seen -ge 1) ('last_error=' + $st.last_error + ' vezes=' + $st.last_error_seen)
  Check 'o agente continua consultando o painel durante a espera (presenca)' ($st.sync_count -ge ($syncAntes + 3)) ('sync_count=' + $st.sync_count)
  Check 'nenhuma senha foi proposta nem confirmada' ($st.password_proposals -eq 0 -and -not $st.confirmed) ('propostas=' + $st.password_proposals)
}

function New-OldAgentState([string]$PeerId) {
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  Copy-Item -LiteralPath (Join-Path $In 'antigo-11-10\Agente-Senha-Nextec.ps1') -Destination (Join-Path $Root 'Agente-Senha-Nextec.ps1') -Force
  Add-Type -AssemblyName System.Security
  $tok = [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes('token-antigo-de-teste-sem-valor'), $null, 'LocalMachine'))
  $cfg = [pscustomobject]@{ painel = ('https://' + $PanelHost); id = $PeerId; token = $tok }
  [IO.File]::WriteAllText((Join-Path $Root 'agente-senha.json'), ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding($true)))
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Root 'Agente-Senha-Nextec.ps1') + '" -Executar')
  $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(30) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
  Register-ScheduledTask -TaskName $TaskSenha -Action $act -Trigger $trg -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
}

function Invoke-C3 {
  $svc = Install-App
  $peer = Get-PeerId $svc.Exe
  Check 'ID do app obtido pelo CLI --get-id' ([bool]$peer) $peer
  if (-not $peer) { throw 'sem_id' }
  Start-FakePanel -PeerId $peer -Uuid (Get-MachineUuid)
  New-OldAgentState -PeerId $peer
  $oldScriptHash = (Get-FileHash -LiteralPath (Join-Path $Root 'Agente-Senha-Nextec.ps1') -Algorithm SHA256).Hash
  $oldCfgHash = (Get-FileHash -LiteralPath (Join-Path $Root 'agente-senha.json') -Algorithm SHA256).Hash
  $newHash = (Get-FileHash -LiteralPath (Join-Path $In 'scripts\Agente-Senha-Nextec.ps1') -Algorithm SHA256).Hash
  Check 'estado inicial: script antigo de 11/10 difere do pacote e tarefa antiga de 5 min existe' (($oldScriptHash -ne $newHash) -and (Get-ScheduledTask -TaskName $TaskSenha -ErrorAction SilentlyContinue)) ('antigo=' + $oldScriptHash.Substring(0, 12) + ' novo=' + $newHash.Substring(0, 12))
  $snap0 = Get-DirSnapshot $Root
  $tasks0 = Get-TaskSnapshot
  # --- fase R: o painel recusa a autorizacao (401) => tudo volta como estava
  Set-PanelMode '401'
  $r = Invoke-ActivationCmd -PeerId $peer -Tag 'C3-recusa'
  Check '.cmd com painel recusando (401) termina com erro (codigo diferente de 0)' ($r.Exit -ne 0) ('codigo ' + $r.Exit)
  $ativar = Read-RootLog 'ativar.log'
  Check 'ativar.log registra rollback_ok' ($ativar -match 'rollback_ok') (($ativar -split "`r?`n" | Where-Object { $_ } | Select-Object -Last 4) -join ' / ')
  $snap1 = Get-DirSnapshot $Root
  $diff = Compare-Snapshot $snap0 $snap1
  Check 'rollback: pasta de dados identica byte a byte (SHA-256 e ACL), sem arquivos novos' ($diff.Count -eq 0) ($diff -join '; ')
  $tasks1 = Get-TaskSnapshot
  $tdiff = @(); foreach ($k in $tasks0.Keys) { if ($tasks0[$k] -cne $tasks1[$k]) { $tdiff += $k } }
  Check 'rollback: tarefas iguais as de antes (XML e estado)' ($tdiff.Count -eq 0) ($tdiff -join '; ')
  Check 'rollback: o script antigo continua o de 11/10' ((Get-FileHash -LiteralPath (Join-Path $Root 'Agente-Senha-Nextec.ps1') -Algorithm SHA256).Hash -eq $oldScriptHash)
  Check 'rollback: a credencial antiga continua no lugar' ((Get-FileHash -LiteralPath (Join-Path $Root 'agente-senha.json') -Algorithm SHA256).Hash -eq $oldCfgHash)
  Check 'rollback: nenhuma ativar-<guid> nem bootstrap.json sobrou' (-not (Test-Path -LiteralPath (Join-Path $Root 'bootstrap.json')) -and @(Get-ChildItem -LiteralPath $Root -Directory -Filter 'ativar-*' -ErrorAction SilentlyContinue).Count -eq 0)
  Copy-Evidence 'C3-apos-recusa'
  # --- fase S: o painel aceita => backup, substituicao e cadastro
  Set-PanelMode 'accept'
  $exp = Get-ExpectedIntervals
  $r2 = Invoke-ActivationCmd -PeerId $peer -Tag 'C3-sucesso'
  Check '.cmd com painel aceitando saiu com codigo 0' ($r2.Exit -eq 0) ('codigo ' + $r2.Exit)
  $ativar2 = Read-RootLog 'ativar.log'
  Check 'ativar.log: backup_cadastro_antigo, agente_antigo e cadastro=activated' (($ativar2 -match 'backup_cadastro_antigo') -and ($ativar2 -match 'agente_antigo') -and ($ativar2 -match 'cadastro=activated'))
  Test-InstalledScripts
  $bk = @(Get-ChildItem -LiteralPath $Root -Force -File -Filter 'Agente-Senha-Nextec.ps1.antigo-*' -ErrorAction SilentlyContinue)
  Check 'backup do script antigo (.antigo-<data>) com os bytes de 11/10' ($bk.Count -ge 1 -and (Get-FileHash -LiteralPath $bk[0].FullName -Algorithm SHA256).Hash -eq $oldScriptHash) ('backups=' + $bk.Count)
  $bkc = @(Get-ChildItem -LiteralPath $Root -Force -File -Filter 'agente-senha.json.antigo-*' -ErrorAction SilentlyContinue)
  Check 'backup do cadastro antigo guardado com os bytes de antes' ($bkc.Count -ge 1 -and (Get-FileHash -LiteralPath $bkc[0].FullName -Algorithm SHA256).Hash -eq $oldCfgHash) ('backups=' + $bkc.Count)
  Check 'agente-senha.json novo difere do antigo' ((Get-FileHash -LiteralPath (Join-Path $Root 'agente-senha.json') -Algorithm SHA256).Hash -ne $oldCfgHash)
  Test-Tasks $exp
  $done = Wait-Until { $s = Get-PanelState; $s -and $s.confirmed } 300 3
  $st = Get-PanelState
  Check 'senha trocada de verdade pelo agente novo e confirmada no painel' $done ('propostas=' + $st.password_proposals + ' confirmacoes=' + $st.confirm_count + ' bootstrap_recusados=' + $st.bootstrap_refused + ' bootstrap_aceitos=' + $st.bootstrap_accepted)
  Check 'agente-senha.log limpo apos a substituicao' ((Read-RootLog 'agente-senha.log') -notmatch 'password_apply_failed|client_settings_locked')
}

function Invoke-C4 {
  $svc = Install-App
  $peer0 = Get-PeerId $svc.Exe
  Check 'ID do app original obtido (antes do renomeio)' ([bool]$peer0) $peer0
  Note 'C4 e SIMULADO: o MSI compilado nao permite trocar o nome. Copiei a pasta do app para "Cliente Livre XPTO", renomeei o exe para XPTO.exe, reapontei o servico (ImagePath) e gravei o marcador HKLM\SOFTWARE\Nextec\Agente. O app compilado continua com o nome interno original (pasta de configuracao).'
  $oldDir = Split-Path -Parent $svc.Exe
  $newDir = Join-Path $env:ProgramFiles 'Cliente Livre XPTO'
  Stop-Service -Name $svc.Name -Force
  Start-Sleep -Seconds 4
  Copy-Item -LiteralPath $oldDir -Destination $newDir -Recurse -Force
  Rename-Item -LiteralPath (Join-Path $newDir (Split-Path -Leaf $svc.Exe)) -NewName 'XPTO.exe'
  $bin = '"' + (Join-Path $newDir 'XPTO.exe') + '" --service'
  Set-ItemProperty -Path ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $svc.Name) -Name 'ImagePath' -Value $bin
  New-Item -Path 'HKLM:\SOFTWARE\Nextec\Agente' -Force | Out-Null
  Set-ItemProperty -Path 'HKLM:\SOFTWARE\Nextec\Agente' -Name 'InstallDir' -Value $newDir
  Set-ItemProperty -Path 'HKLM:\SOFTWARE\Nextec\Agente' -Name 'AppName' -Value 'XPTO'
  Start-Service -Name $svc.Name
  Start-Sleep -Seconds 6
  $svc2 = Get-AppService
  Check 'servico reapontado para XPTO.exe em pasta com outro nome' ($svc2 -and $svc2.Exe -like '*XPTO.exe') ($svc2.PathName)
  $peer = Get-PeerId $svc2.Exe
  Check 'ID obtido pelo CLI do exe renomeado' ([bool]$peer) $peer
  if (-not $peer) { throw 'sem_id' }
  Test-NoAgentInstalled 'antes'
  Start-FakePanel -PeerId $peer -Uuid (Get-MachineUuid)
  Test-HappyPath -Tag 'C4' -Svc $svc2 -PeerId $peer
}

# ---------- execucao ----------
$start = Get-Date
$fatal = ''
try {
  $script:BootstrapToken = New-RandomToken 43
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  Log ('inicio ' + $Cenario + ' | PowerShell ' + $PSVersionTable.PSVersion + ' | administrador=' + $isAdmin + ' | ' + [Environment]::OSVersion.VersionString)
  Check 'sessao do sandbox e administrador' $isAdmin
  $net = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' })
  Note ('adaptadores de rede ativos: ' + $net.Count + ' (esperado 0 ou so loopback com Networking=Disable)')
  Save-Screenshot ($Cenario + '-00-inicio')
  switch ($Cenario) {
    'C1' { Invoke-C1 }
    'C2' { Invoke-C2 }
    'C3' { Invoke-C3 }
    'C4' { Invoke-C4 }
  }
} catch {
  $fatal = [string]$_.Exception.Message + ' @ ' + [string]$_.InvocationInfo.ScriptLineNumber
  Check ('execucao sem excecao (' + $Cenario + ')') $false $fatal
}
try { Copy-Evidence $Cenario } catch { Log ('evidencias: ' + $_.Exception.Message) }
try { Save-Screenshot ($Cenario + '-99-fim') } catch { }
try { Remove-SecretsFromOut } catch { Log ('varredura: ' + $_.Exception.Message) }
$failed = @($script:Results | Where-Object { -not $_.ok }).Count
$summary = [pscustomobject]@{
  cenario = $Cenario; inicio = $start.ToString('s'); fim = (Get-Date).ToString('s'); falhas = $failed; total = $script:Results.Count
  fatal = $fatal; notas = $script:Notes; resultados = $script:Results
}
[IO.File]::WriteAllText((Join-Path $Out 'resultado.json'), ($summary | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($true)))
[IO.File]::WriteAllText((Join-Path $Out 'fim.json'), ('{"cenario":"' + $Cenario + '","falhas":' + $failed + '}'))
Log ('fim ' + $Cenario + ': ' + ($script:Results.Count - $failed) + ' de ' + $script:Results.Count + ' verificacoes passaram')
Start-Sleep -Seconds 3
& shutdown.exe /s /t 5 /f | Out-Null
