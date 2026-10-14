// Gera o arquivo Ativar-Nextec-<ID>.cmd: UM CLIQUE no servidor, como administrador. O arquivo traz dentro de si
// o pacote do agente (scripts oficiais do painel, gzip + base64 + SHA-256 de cada um), instala o que faltar em
// %ProgramData%\Nextec\Acesso, substitui um agente antigo ou quebrado e entrega a autorização individual ao
// Coordenar-Agente-Nextec.ps1 -Receber, sem diálogo de arquivo e sem baixar código da internet.
// Módulo puro (sem DOM). O arquivo é só ASCII: acentos viram [char]0x.. no PowerShell, então não dependem da página
// de código do console. O código de ativação vai em base64 numa linha `rem` (nunca na linha de comando nem em log) e
// só depois de ativar o arquivo é apagado. A janela de 15 minutos é conferida no servidor e, antes, no próprio script.

import { AGENT_PACKAGE_FILES } from './agent-package.mjs'

const ID_RE = /^\d{6,64}$/
const B64_RE = /^[A-Za-z0-9+/=]+$/

export const ACTIVATION_WINDOW_SECONDS = 15 * 60
export const ACTIVATION_MAX_BYTES = 300 * 1024

export function activationFileName(id) {
  if (!ID_RE.test(String(id))) throw new Error('ID da máquina inválido para gerar o arquivo.')
  return `Ativar-Nextec-${id}.cmd`
}

// Texto ASCII para uma string simples do PowerShell: acentos viram [char]0x.., aspas simples são duplicadas.
export function psText(text) {
  let out = ''
  let open = false
  const close = () => { if (open) { out += "'"; open = false } }
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    if (code > 126 || code < 32) {
      close()
      out += `${out ? '+' : ''}[char]0x${code.toString(16).toUpperCase()}`
    } else {
      if (!open) { out += `${out ? '+' : ''}'`; open = true }
      out += ch === "'" ? "''" : ch
    }
  }
  close()
  return out || "''"
}

function toBase64(text) {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64')
  return btoa(unescape(encodeURIComponent(text)))
}

// Localiza o agente sem depender do nome do app (qualquer nome serve: Nextec-Connect, Client-Nextec-Connect, XPTO...).
// Ordem: 1) pasta de dados fixa; 2) MARCADOR de instalação (HKLM\SOFTWARE\Nextec\Agente {InstallDir,AppName} e
// nextec-marker.json na pasta de dados); 3) entrada de desinstalação cuja pasta contém o Coordenar-*.ps1 (qualquer
// DisplayName); 4) serviço RustDesk (--service) cujo exe vizinho contém o Coordenar-*.ps1, e tarefa agendada Nextec;
// 5) varredura limitada (até 2 níveis, 300 pastas) de %ProgramFiles%. Nada aqui depende de nome literal.
// $Marker/$Entries/$Services/$TaskArgs podem ser injetados (testes); sem eles lê o registro, os serviços e as tarefas reais.
// Dado externo é sujo (InstallLocation entre aspas, %VAR%, UNC, drive inexistente, caractere inválido): todo caminho
// passa por ConvertTo-NextecPath e cada candidato fica num try/catch próprio. Entrada ruim vira "ignorado: ... (motivo)"
// em Searched e a busca continua; nunca Join-Path/Split-Path em dado externo. Só ASCII aqui (o .cmd é ASCII).
export const FIND_AGENT_PS = String.raw`function ConvertTo-NextecPath {
  param($Value)
  $trim = [char[]]@(32, 9, 10, 13, 34, 39)
  $v = ([string]$Value).Trim($trim)
  if (-not $v) { throw 'vazio' }
  if ($v.IndexOf('%') -ge 0) { $v = ([Environment]::ExpandEnvironmentVariables($v)).Trim($trim) }
  if ($v -match '%[^%\\]+%') { throw '%VAR% sem valor' }
  $v = $v.Replace('/', '\')
  if ($v.StartsWith('\\')) { throw 'caminho de rede' }
  if ($v -notmatch '^[A-Za-z]:\\') { throw 'fora do formato X:\' }
  if ($v.IndexOfAny([IO.Path]::GetInvalidPathChars()) -ge 0 -or $v.IndexOfAny([char[]]@(42, 63)) -ge 0 -or $v.IndexOf(':', 2) -ge 0) { throw 'caractere proibido' }
  $v = $v.Substring(0, 3) + ($v.Substring(3) -replace '\\{2,}', '\')
  try { $v = [IO.Path]::GetFullPath($v) } catch { throw 'formato recusado' }
  if ($v.Length -gt 3) { $v = $v.TrimEnd('\') }
  if ($v -notmatch '^[A-Za-z]:\\') { throw 'fora do formato X:\' }
  return $v
}
function Add-NextecIgnored {
  param($List, $Raw, $Why)
  $t = (([string]$Raw) -replace '[\x00-\x1F]', ' ').Trim()
  if ($t.Length -gt 160) { $t = $t.Substring(0, 160) + '...' }
  [void]$List.Add('ignorado: ' + $t + ' (' + [string]$Why + ')')
}
function Test-NextecFile {
  param([string]$Path)
  try { return [IO.File]::Exists($Path) } catch { return $false }
}
function Test-NextecRustDeskDir {
  param([string]$Dir, [string]$Hint)
  try {
    if (-not [IO.Directory]::Exists($Dir)) { return $false }
    foreach ($f in @('librustdesk.dll', 'rustdesk.exe')) { if ([IO.File]::Exists([IO.Path]::Combine($Dir, $f))) { return $true } }
    $exes = New-Object System.Collections.ArrayList
    if ($Hint) { try { [void]$exes.Add([IO.Path]::Combine($Dir, $Hint + '.exe')) } catch { } }
    [void]$exes.Add([IO.Path]::Combine($Dir, [IO.Path]::GetFileName($Dir) + '.exe'))
    foreach ($x in $exes) {
      if (-not [IO.File]::Exists($x)) { continue }
      $vi = [Diagnostics.FileVersionInfo]::GetVersionInfo($x)
      if ((@($vi.ProductName, $vi.OriginalFilename, $vi.InternalName, $vi.FileDescription, $vi.CompanyName) -join ' ') -match '(?i)rustdesk') { return $true }
    }
  } catch { }
  return $false
}
function Add-NextecApp {
  param($Apps, [string]$Name, [string]$Path, [bool]$Service)
  $Name = $Name.Trim()
  if (-not $Name) { $Name = [IO.Path]::GetFileName($Path) }
  foreach ($x in $Apps) { if ($x.Path -ieq $Path) { if ($Service) { $x.Service = $true }; return } }
  [void]$Apps.Add([pscustomobject]@{ Name = $Name; Path = $Path; Service = $Service })
}
# Fachada: Searched sem repeticao (registro 64/32 bits, servico e varredura repetem caminhos).
function Find-NextecAgent {
  param([string]$DataRoot, [string[]]$ProgramRoots, $Entries, $TaskArgs, $Marker, $Services, [string]$MarkerFile)
  $r = Find-NextecAgentCore @PSBoundParameters
  $u = New-Object System.Collections.ArrayList
  $seen = @{}
  foreach ($x in $r.Searched) {
    $k = ([string]$x).ToLowerInvariant()
    if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; [void]$u.Add([string]$x) }
  }
  $r.Searched = $u
  return $r
}
# App instalado SEM o agente (desinstalacao, servico --service ou pasta com RustDesk): preenche App/AppPath para a
# mensagem "gere com o MESMO nome". Havendo servico, so os apps com servico (o suporte avulso nao instala servico).
function Set-NextecAppGuess {
  param($R, $Apps)
  if ($R.App -or $Apps.Count -eq 0) { return $R }
  $pick = New-Object System.Collections.ArrayList
  foreach ($x in $Apps) { if ($x.Service) { [void]$pick.Add($x) } }
  if ($pick.Count -eq 0) { foreach ($x in $Apps) { [void]$pick.Add($x) } }
  $names = New-Object System.Collections.ArrayList
  foreach ($x in $pick) { if ($names.Count -lt 3 -and -not ($names -icontains $x.Name)) { [void]$names.Add($x.Name) } }
  $R.App = ($names.ToArray()) -join ' ou '
  if (-not $R.AppPath) { $R.AppPath = $pick[0].Path }
  return $R
}
function Find-NextecAgentCore {
  param([string]$DataRoot, [string[]]$ProgramRoots, $Entries, $TaskArgs, $Marker, $Services, [string]$MarkerFile)
  $name = 'Coordenar-Agente-Nextec.ps1'
  $searched = New-Object System.Collections.ArrayList
  $apps = New-Object System.Collections.ArrayList
  $r = [pscustomobject]@{ Script = ''; App = ''; AppPath = ''; Searched = $searched }
  $c = ''
  try { $DataRoot = ConvertTo-NextecPath $DataRoot; $c = [IO.Path]::Combine($DataRoot, $name); [void]$searched.Add($c) }
  catch { Add-NextecIgnored $searched $DataRoot ('pasta de dados: ' + $_.Exception.Message); $DataRoot = '' }
  if ($null -eq $Marker) {
    $Marker = [pscustomobject]@{ InstallDir = ''; AppName = '' }
    try {
      $reg = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Nextec\Agente' -ErrorAction Stop
      $Marker.InstallDir = [string]$reg.InstallDir; $Marker.AppName = [string]$reg.AppName
    } catch { }
    if (-not $Marker.InstallDir -and -not $Marker.AppName) {
      try {
        $mp = $MarkerFile
        if (-not $mp -and $DataRoot) { $mp = [IO.Path]::Combine($DataRoot, 'nextec-marker.json') }
        if ($mp) {
          $mp = ConvertTo-NextecPath $mp
          if (Test-NextecFile $mp) {
            $mj = [IO.File]::ReadAllText($mp) | ConvertFrom-Json
            if ($mj.InstallDir) { $Marker.InstallDir = [string]$mj.InstallDir } elseif ($mj.install_dir) { $Marker.InstallDir = [string]$mj.install_dir }
            if ($mj.AppName) { $Marker.AppName = [string]$mj.AppName } elseif ($mj.app_name) { $Marker.AppName = [string]$mj.app_name }
          }
        }
      } catch { }
    }
  }
  $mDir = ''; $mApp = ''
  try { $mDir = [string]$Marker.InstallDir; $mApp = [string]$Marker.AppName } catch { }
  if ($mApp) { $r.App = $mApp.Trim() }
  if ($c -and (Test-NextecFile $c)) { $r.Script = $c; return $r }
  if ($mDir.Trim()) {
    try {
      $md = ConvertTo-NextecPath $mDir
      $r.AppPath = $md
      $p = [IO.Path]::Combine($md, $name)
      [void]$searched.Add($p)
      if (Test-NextecFile $p) { $r.Script = $p; return $r }
    } catch { Add-NextecIgnored $searched $mDir ('marcador: ' + $_.Exception.Message) }
  }
  if ($null -eq $Entries) {
    $Entries = New-Object System.Collections.ArrayList
    foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
      $keys = @()
      try { $keys = @(Get-ChildItem -LiteralPath $k -ErrorAction SilentlyContinue) } catch { $keys = @() }
      foreach ($key in $keys) {
        try { [void]$Entries.Add((Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction Stop)) } catch { }
      }
    }
  }
  foreach ($e in $Entries) {
    if ($null -eq $e) { continue }
    $raw = ''
    try {
      $raw = [string]$e.InstallLocation
      if (-not $raw.Trim()) { continue }
      $loc = ConvertTo-NextecPath $raw
      $p = [IO.Path]::Combine($loc, $name)
      $dn = ([string]$e.DisplayName).Trim()
      [void]$searched.Add($p)
      if (Test-NextecFile $p) {
        if ($dn -and -not $r.App) { $r.App = $dn }
        if (-not $r.AppPath) { $r.AppPath = $loc }
        $r.Script = $p; return $r
      }
      if ($r.App -and $dn -and ($dn -ieq $r.App) -and -not $r.AppPath) { $r.AppPath = $loc }
      if (Test-NextecRustDeskDir $loc $dn) { Add-NextecApp $apps $dn $loc $false }
    } catch { Add-NextecIgnored $searched $raw $_.Exception.Message }
  }
  if ($null -eq $Services) {
    $Services = @()
    try { $Services = @(Get-CimInstance -ClassName Win32_Service -ErrorAction Stop) }
    catch { try { $Services = @(Get-WmiObject -Class Win32_Service -ErrorAction Stop) } catch { $Services = @() } }
  }
  foreach ($s in $Services) {
    if ($null -eq $s) { continue }
    $pn = ''
    try {
      $pn = [string]$s.PathName
      if ($pn -notmatch '(?i)(?:^|\s)--service(?:\s|$)') { continue }
      $m = [regex]::Match($pn, '(?i)^\s*"([^"]+?\.exe)"')
      if (-not $m.Success) { $m = [regex]::Match($pn, '(?i)^\s*([^\s"].*?\.exe)(?=\s|$)') }
      if (-not $m.Success) { throw 'PathName sem .exe' }
      $exe = ConvertTo-NextecPath $m.Groups[1].Value
      $dir = [IO.Path]::GetDirectoryName($exe)
      if (-not $dir) { throw 'PathName sem pasta' }
      $p = [IO.Path]::Combine($dir, $name)
      [void]$searched.Add($p)
      if (Test-NextecFile $p) {
        if (-not $r.App) { $r.App = [string]$s.Name }
        if (-not $r.AppPath) { $r.AppPath = $dir }
        $r.Script = $p; return $r
      }
      if (Test-NextecFile $exe) { Add-NextecApp $apps ([string]$s.Name) $dir $true }
    } catch { Add-NextecIgnored $searched $pn $_.Exception.Message }
  }
  if ($null -eq $TaskArgs) {
    $TaskArgs = @()
    try {
      if (Get-Command -Name Get-ScheduledTask -ErrorAction SilentlyContinue) {
        $TaskArgs = @(Get-ScheduledTask -TaskName 'Nextec*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Actions } | ForEach-Object { [string]$_.Arguments })
      }
    } catch { $TaskArgs = @() }
  }
  foreach ($a in $TaskArgs) {
    $raw = ''
    try {
      $raw = [string]$a
      $m = [regex]::Match($raw, '(?i)(?:^|\s)-File\s+(?:"([^"]+)"|''([^'']+)''|([^\s"''].*?\.ps1)(?=\s|$))')
      if (-not $m.Success) { continue }
      $f = ''
      foreach ($g in 1, 2, 3) { if ($m.Groups[$g].Success) { $f = $m.Groups[$g].Value } }
      $f = ConvertTo-NextecPath $f
      $dir = [IO.Path]::GetDirectoryName($f)
      if (-not $dir) { throw 'tarefa sem pasta' }
      $p = [IO.Path]::Combine($dir, $name)
      [void]$searched.Add($p)
      if (Test-NextecFile $p) { $r.Script = $p; return $r }
    } catch { Add-NextecIgnored $searched $raw ('tarefa: ' + $_.Exception.Message) }
  }
  $budget = 300
  $seenRoots = @{}
  foreach ($root0 in @($ProgramRoots)) {
    $root = ''
    try {
      if (-not ([string]$root0).Trim()) { continue }
      $root = ConvertTo-NextecPath $root0
    } catch { Add-NextecIgnored $searched $root0 ('Program Files: ' + $_.Exception.Message); continue }
    if ($seenRoots.ContainsKey($root.ToLowerInvariant())) { continue }
    $seenRoots[$root.ToLowerInvariant()] = $true
    try { if (-not [IO.Directory]::Exists($root)) { continue } } catch { continue }
    $dirs = @()
    try { $dirs = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue) } catch { $dirs = @() }
    foreach ($d in $dirs) {
      if ($budget -le 0) { break }
      $budget--
      try {
        $cands = New-Object System.Collections.ArrayList
        [void]$cands.Add([IO.Path]::Combine($d.FullName, $name))
        $subs = @()
        try { $subs = @(Get-ChildItem -LiteralPath $d.FullName -Directory -ErrorAction SilentlyContinue) } catch { $subs = @() }
        foreach ($sub in $subs) { $budget--; [void]$cands.Add([IO.Path]::Combine($sub.FullName, $name)) }
        foreach ($p in $cands) {
          if (Test-NextecFile $p) {
            if (-not $r.App) { $r.App = $d.Name }
            if (-not $r.AppPath) { $r.AppPath = $d.FullName }
            [void]$searched.Add($p)
            $r.Script = $p; return $r
          }
        }
        [void]$searched.Add($cands[0])
        if (Test-NextecRustDeskDir $d.FullName $d.Name) { Add-NextecApp $apps $d.Name $d.FullName $false }
      } catch { Add-NextecIgnored $searched $d.FullName $_.Exception.Message }
    }
  }
  return (Set-NextecAppGuess $r $apps)
}`

// Instalação do pacote embutido, agente antigo e orquestração do fluxo. Roda elevado (o .cmd se reabre por UAC).
// Pontos que os testes (PowerShell 5.1) substituem por definição de função de mesmo nome: New-NxAcl, Set-Acl,
// Stop-ScheduledTask, Disable-ScheduledTask, Get-ScheduledTask, Start-ScheduledTask.
export const INSTALL_AGENT_PS = String.raw`function New-NxAcl {
  param([switch]$Directory, [switch]$WithOwner)
  $sys = [Security.Principal.SecurityIdentifier]::new('S-1-5-18'); $adm = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  if ($Directory) { $acl = [Security.AccessControl.DirectorySecurity]::new() } else { $acl = [Security.AccessControl.FileSecurity]::new() }
  $acl.SetAccessRuleProtection($true, $false)
  if ($WithOwner) { $acl.SetOwner($adm) }
  if ($Directory) { $inh = 'ContainerInherit,ObjectInherit' } else { $inh = 'None' }
  foreach ($s in @($sys, $adm)) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s, 'FullControl', $inh, 'None', 'Allow')) }
  return $acl
}
function Assert-NxSafePath {
  param([Parameter(Mandatory)][string]$Path)
  $cur = [IO.Path]::GetFullPath($Path)
  while ($cur) {
    if ([IO.File]::Exists($cur) -or [IO.Directory]::Exists($cur)) {
      if (([int]([IO.File]::GetAttributes($cur)) -band [int][IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'unsafe_path' }
    }
    $parent = [IO.Path]::GetDirectoryName($cur.TrimEnd([char]92, [char]47))
    if (-not $parent -or $parent -eq $cur) { break }
    $cur = $parent
  }
}
function Initialize-NxRoot {
  param([Parameter(Mandatory)][string]$Root)
  Assert-NxSafePath -Path $Root
  if (-not [IO.Directory]::Exists($Root)) {
    [void][IO.Directory]::CreateDirectory($Root, (New-NxAcl -Directory))
  } else {
    Set-Acl -LiteralPath $Root -AclObject (New-NxAcl -Directory -WithOwner)
  }
}
function New-NxProtectedFile {
  param([Parameter(Mandatory)][string]$Path, [byte[]]$Bytes)
  Assert-NxSafePath -Path $Path
  if ($null -eq $Bytes) { $Bytes = New-Object byte[] 0 }
  $fs = $null
  try { $fs = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew, [Security.AccessControl.FileSystemRights]::Write, [IO.FileShare]::None, 4096, [IO.FileOptions]::None, (New-NxAcl -WithOwner)) }
  catch {
    if ([IO.File]::Exists($Path)) { throw }
    $fs = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew, [Security.AccessControl.FileSystemRights]::Write, [IO.FileShare]::None, 4096, [IO.FileOptions]::None, (New-NxAcl))
  }
  try { $fs.Write($Bytes, 0, $Bytes.Length) } finally { $fs.Dispose() }
}
function Write-NxLog {
  # ativar.log: so codigos e nomes de etapa (sem segredo, sem saida bruta). Falha de log nunca derruba a ativacao.
  param([string]$Root, [string]$Text)
  try {
    $p = [IO.Path]::Combine($Root, 'ativar.log')
    if ([IO.File]::Exists($p) -and ([IO.FileInfo]::new($p)).Length -gt 262144) { [IO.File]::Delete($p) }
    if (-not [IO.File]::Exists($p)) { New-NxProtectedFile -Path $p }
    $clean = [regex]::Replace([string]$Text, '[^A-Za-z0-9 _=.:/,;()-]', '?')
    $line = ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $clean) + [char]13 + [char]10
    $fs = [IO.File]::Open($p, [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try { $b = [Text.Encoding]::ASCII.GetBytes($line); $fs.Write($b, 0, $b.Length) } finally { $fs.Dispose() }
  } catch { }
}
function Get-NxPackage {
  # Le o pacote embutido (rem NXPKG), descomprime e confere o SHA-256 de cada script ANTES de qualquer gravacao.
  param([AllowEmptyString()][string[]]$Lines)
  $parts = @($Lines | Where-Object { $_ -like 'rem NXPKG *' } | ForEach-Object { $_.Substring(10).Trim() })
  $shas = @{}
  foreach ($l in $Lines) { if ($l -match '^rem NXSHA (\S+) ([0-9a-f]{64})$') { $shas[$Matches[1]] = $Matches[2] } }
  if ($parts.Count -lt 1 -or $shas.Count -lt 1) { throw 'package_invalid' }
  try { $gz = [Convert]::FromBase64String(($parts -join '')) } catch { throw 'package_invalid' }
  $out = New-Object IO.MemoryStream
  try {
    $ms = New-Object IO.MemoryStream (,$gz)
    $gs = New-Object IO.Compression.GZipStream ($ms, [IO.Compression.CompressionMode]::Decompress)
    try {
      $buf = New-Object byte[] 8192
      while (($n = $gs.Read($buf, 0, $buf.Length)) -gt 0) {
        $out.Write($buf, 0, $n)
        if ($out.Length -gt 1048576) { throw 'package_invalid' }
      }
    } finally { $gs.Dispose() }
  } catch { throw 'package_invalid' }
  $raw = $out.ToArray()
  $files = @{}
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $pos = 0
    while ($pos -lt $raw.Length) {
      $nl = [Array]::IndexOf($raw, [byte]10, $pos)
      if ($nl -lt 0 -or ($nl - $pos) -gt 100) { throw 'package_invalid' }
      $m = [regex]::Match([Text.Encoding]::ASCII.GetString($raw, $pos, $nl - $pos), '^([A-Za-z0-9][A-Za-z0-9._-]{0,63}) ([0-9]{1,7})$')
      if (-not $m.Success) { throw 'package_invalid' }
      $len = [int]$m.Groups[2].Value
      if ($nl + 1 + $len -gt $raw.Length) { throw 'package_invalid' }
      $bytes = New-Object byte[] $len
      [Array]::Copy($raw, $nl + 1, $bytes, 0, $len)
      $hash = ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLowerInvariant()
      $fname = $m.Groups[1].Value
      if (-not $shas.ContainsKey($fname) -or $shas[$fname] -cne $hash) { throw 'package_hash' }
      $files[$fname] = $bytes
      $pos = $nl + 1 + $len
    }
  } finally { $sha.Dispose() }
  foreach ($need in @('Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1')) {
    if (-not $files.ContainsKey($need)) { throw 'package_invalid' }
  }
  return $files
}
function Get-NxBytesHash {
  param([byte[]]$Bytes)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes)) -replace '-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Get-NxInstallPlan {
  # Quais scripts gravar: ausentes, ou diferentes do embutido e sem o recurso novo (versao antiga). Versao com o
  # recurso e mantida (pode ser mais nova que a embutida). OldAgentScript = Agente-Senha antigo no disco.
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)]$Files)
  $markers = [ordered]@{ 'Coordenar-Agente-Nextec.ps1' = 'SubstituirAgenteAntigo'; 'Provisionar-Agente-Nextec.ps1' = 'SubstituirAgenteAntigo'; 'Agente-Senha-Nextec.ps1' = 'Get-NextecInstalledClient' }
  $todo = @()
  $oldScript = $false
  foreach ($name in $markers.Keys) {
    $dest = [IO.Path]::Combine($Root, $name)
    if (-not [IO.File]::Exists($dest)) { $todo += $name; continue }
    $cur = [IO.File]::ReadAllBytes($dest)
    if ((Get-NxBytesHash $cur) -ceq (Get-NxBytesHash $Files[$name])) { continue }
    $text = [Text.Encoding]::UTF8.GetString($cur)
    if ($text.Contains($markers[$name])) { continue }
    $todo += $name
    if ($name -ceq 'Agente-Senha-Nextec.ps1') { $oldScript = $true }
  }
  return [pscustomobject]@{ Install = $todo; OldAgentScript = $oldScript }
}
function Set-NxScript {
  # Grava via arquivo temporario CreateNew com ACL protegida; o anterior vai para <nome>.antigo-<data> (nao se apaga).
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][byte[]]$Bytes, [Parameter(Mandatory)][string]$Stamp)
  $dest = [IO.Path]::Combine($Root, $Name)
  $tmp = [IO.Path]::Combine($Root, '.nx-' + [Guid]::NewGuid().ToString('N') + '.tmp')
  Assert-NxSafePath -Path $dest
  try {
    New-NxProtectedFile -Path $tmp -Bytes $Bytes
    if ([IO.File]::Exists($dest)) {
      $bak = $dest + '.antigo-' + $Stamp
      $n = 1
      while ([IO.File]::Exists($bak)) { $n++; $bak = $dest + '.antigo-' + $Stamp + '-' + $n }
      [IO.File]::Move($dest, $bak)
    }
    [IO.File]::Move($tmp, $dest)
  } finally { if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) } }
}
function Backup-NxFile {
  # Copia protegida (o original fica; quem decide trocar e o coordenador, depois de o painel recusar o token).
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Stamp)
  if (-not [IO.File]::Exists($Path)) { return '' }
  $dest = $Path + '.antigo-' + $Stamp
  $n = 1
  while ([IO.File]::Exists($dest)) { $n++; $dest = $Path + '.antigo-' + $Stamp + '-' + $n }
  New-NxProtectedFile -Path $dest -Bytes ([IO.File]::ReadAllBytes($Path))
  return $dest
}
function Get-NxLogLines {
  param([string]$Path)
  try {
    if (-not [IO.File]::Exists($Path)) { return @() }
    $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try { $sr = New-Object IO.StreamReader ($fs); try { $text = $sr.ReadToEnd() } finally { $sr.Dispose() } } finally { $fs.Dispose() }
    return @($text -split '\r?\n' | Where-Object { $_ })
  } catch { return @() }
}
function Wait-NxEnrollment {
  # Espera o coordenador (tarefa SYSTEM) cadastrar. Devolve activated, pending ou o codigo de falha do log.
  param([string]$Root, [int]$LogLines0, [int]$Seconds, [scriptblock]$Sleep)
  $failCodes = 'already_enrolled|manual_authorization_required|identity_conflict|invalid_input|invalid_panel|invalid_identity|invalid_bootstrap|protocol_error|unsafe_path|component_missing'
  $config = [IO.Path]::Combine($Root, 'agente-senha.json')
  $inputFile = [IO.Path]::Combine($Root, 'bootstrap.json')
  $journal = [IO.Path]::Combine($Root, 'provisionamento-agente.json')
  $log = [IO.Path]::Combine($Root, 'provisionamento-agente.log')
  $waited = 0
  while ($true) {
    if ([IO.File]::Exists($config) -and -not [IO.File]::Exists($inputFile) -and -not [IO.File]::Exists($journal)) { return 'activated' }
    $new = @(Get-NxLogLines -Path $log | Select-Object -Skip $LogLines0)
    foreach ($l in $new) {
      if ($l -match ('\s(' + $failCodes + ')$')) { return $Matches[1] }
      if ($l -match '\s(complete|already_configured)$') { return 'activated' }
    }
    if ($waited -ge $Seconds) { return 'pending' }
    & $Sleep 3
    $waited += 3
  }
}
function Invoke-NxActivation {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Root,
    [AllowEmptyString()][string[]]$Lines = @(),
    [Parameter(Mandatory)][string]$DataB64,
    [Parameter(Mandatory)]$Found,
    [Parameter(Mandatory)]$M,
    [Parameter(Mandatory)][scriptblock]$Run,
    [Parameter(Mandatory)][scriptblock]$Say,
    [DateTime]$Now = [DateTime]::UtcNow,
    [int]$WaitSeconds = 90,
    [scriptblock]$Sleep = { param($s) Start-Sleep -Seconds $s }
  )
  $stamp = $Now.ToUniversalTime().ToString('yyyyMMdd-HHmmss')
  $coord = [IO.Path]::Combine($Root, 'Coordenar-Agente-Nextec.ps1')
  $taskName = 'Nextec Acesso - Cadastro de agente'
  $dir = ''
  try {
    Initialize-NxRoot -Root $Root
    Write-NxLog $Root 'inicio'
    $app = [string]$Found.App
    $appThere = $false
    try { $appThere = ([bool]$Found.Script) -or ([bool][string]$Found.App) -or ([bool]$Found.AppPath -and [IO.Directory]::Exists([string]$Found.AppPath)) } catch { $appThere = $false }
    if (-not $appThere) {
      Write-NxLog $Root 'app_nao_encontrado'
      & $Say ($M.notInstalled + $M.searched + (@($Found.Searched) -join '; '))
      return 1
    }
    Write-NxLog $Root ('app_encontrado agente_no_app=' + [bool]$Found.Script)

    # 1) pacote embutido: hash conferido antes de gravar qualquer coisa
    try { $files = Get-NxPackage -Lines $Lines }
    catch { Write-NxLog $Root ('pacote_invalido ' + $_.Exception.Message); & $Say $M.packageInvalid; return 1 }
    Write-NxLog $Root 'pacote_ok'

    # 2) agente antigo: script antigo ou cadastro local presente
    $plan = Get-NxInstallPlan -Root $Root -Files $files
    $hadConfig = [IO.File]::Exists([IO.Path]::Combine($Root, 'agente-senha.json'))
    $replace = ($hadConfig -or $plan.OldAgentScript)
    if ($hadConfig) {
      [void](Backup-NxFile -Path ([IO.Path]::Combine($Root, 'agente-senha.json')) -Stamp $stamp)
      Write-NxLog $Root 'backup_cadastro_antigo'
    }
    if ($plan.OldAgentScript) {
      try { Stop-ScheduledTask -TaskName 'Nextec Acesso - Senha' -ErrorAction SilentlyContinue } catch { }
      try { Disable-ScheduledTask -TaskName 'Nextec Acesso - Senha' -ErrorAction SilentlyContinue | Out-Null } catch { }
      Write-NxLog $Root 'agente_antigo tarefa_senha_parada'
    }

    # 3) instala o que faltar (Coordenar, Provisionar, Agente-Senha) e registra a tarefa do coordenador
    foreach ($name in @($plan.Install)) { Set-NxScript -Root $Root -Name $name -Bytes $files[$name] -Stamp $stamp }
    Write-NxLog $Root ('instalado=' + (@($plan.Install) -join ',') + ' substituir=' + $replace)
    # scripts que ja estavam la (versao igual ou mais nova) tambem ficam com dono e ACL do coordenador
    foreach ($name in @('Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1')) {
      $path = [IO.Path]::Combine($Root, $name)
      if ([IO.File]::Exists($path)) { try { Set-Acl -LiteralPath $path -AclObject (New-NxAcl -WithOwner) } catch { } }
    }
    $taskOk = $false
    try { $taskOk = [bool](Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) } catch { $taskOk = $false }
    if (@($plan.Install).Count -gt 0 -or -not $taskOk) {
      $r = & $Run $coord @('-Registrar', '-PastaDados', $Root)
      Write-NxLog $Root ('registrar exit=' + $r.Code)
      if ($r.Code -ne 0) {
        if ([string]$r.Out -match 'unsafe_path') { & $Say $M.unsafe } else { & $Say $M.installFailed }
        return 1
      }
    }

    # sem inscricao.json nem marcador: o coordenador le o host do painel do nextec-marker.json (so o painel; nada de segredo)
    try {
      $payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($DataB64)) | ConvertFrom-Json
      $panel = [string]$payload.painel
      $markerFile = [IO.Path]::Combine($Root, 'nextec-marker.json')
      $enrollFile = [IO.Path]::Combine($Root, 'inscricao.json')
      if ($panel -cmatch '^https://[a-z0-9.-]{1,253}$' -and -not [IO.File]::Exists($markerFile) -and -not [IO.File]::Exists($enrollFile)) {
        New-NxProtectedFile -Path $markerFile -Bytes ([Text.Encoding]::UTF8.GetBytes('{"painel":"' + $panel + '"}'))
        Write-NxLog $Root 'marcador_painel_gravado'
      }
    } catch { Write-NxLog $Root 'marcador_painel_falhou' }

    # 4) entrega a autorizacao ao coordenador (arquivo temporario de uso unico, apagado no fim)
    $dir = [IO.Path]::Combine($Root, 'ativar-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($dir, (New-NxAcl -Directory))
    $file = [IO.Path]::Combine($dir, 'bootstrap.json')
    New-NxProtectedFile -Path $file -Bytes ([Convert]::FromBase64String($DataB64))
    $logLines0 = @(Get-NxLogLines -Path ([IO.Path]::Combine($Root, 'provisionamento-agente.log'))).Count
    $argList = @('-Receber', '-ArquivoAutorizacao', $file, '-PastaDados', $Root)
    if ($replace) { $argList += '-SubstituirAgenteAntigo' }
    $r = & $Run $coord $argList
    $out = [string]$r.Out
    Write-NxLog $Root ('receber exit=' + $r.Code)
    if ($r.Code -ne 0) {
      $why = 'failed'
      if ($out -match 'identity_conflict:\s') { $why = 'client' }
      elseif ($out -match 'identity_conflict') { $why = 'otherMachine' }
      elseif ($out -match 'component_missing') { $why = 'client' }
      elseif ($out -match 'pending_authorization') { $why = 'pending' }
      elseif ($out -match 'administrator_required') { $why = 'notAdmin' }
      elseif ($out -match 'unsafe_path') { $why = 'unsafe' }
      elseif ($out -match 'already_enrolled') { $why = 'agentKept' }
      elseif ($out -match 'panel_unreachable') { $why = 'panelUnreachable' }
      elseif ($out -match 'invalid_|protocol_error') { $why = 'invalid' }
      Write-NxLog $Root ('receber_falhou motivo=' + $why)
      & $Say $M[$why]
      return 1
    }

    # 5) aciona o coordenador agora e confirma o cadastro (senao a tarefa conclui em ate 5 minutos)
    try { Start-ScheduledTask -TaskName $taskName -ErrorAction Stop } catch { Write-NxLog $Root 'tarefa_nao_iniciada' }
    $state = Wait-NxEnrollment -Root $Root -LogLines0 $logLines0 -Seconds $WaitSeconds -Sleep $Sleep
    Write-NxLog $Root ('cadastro=' + $state)
    if ($state -eq 'activated') { & $Say $M.ok; return 0 }
    if ($state -eq 'pending') { & $Say $M.receivedPending; return 0 }
    $why = 'failed'
    if ($state -eq 'already_enrolled') { $why = 'agentRefused' }
    elseif ($state -eq 'identity_conflict') { $why = 'otherMachine' }
    elseif ($state -eq 'manual_authorization_required') { $why = 'invalid' }
    elseif ($state -match 'invalid_|protocol_error') { $why = 'invalid' }
    elseif ($state -eq 'unsafe_path') { $why = 'unsafe' }
    elseif ($state -eq 'component_missing') { $why = 'client' }
    & $Say $M[$why]
    return 1
  } catch {
    $code = [string]$_.Exception.Message
    if ($code -match '^(unsafe_path|package_invalid|package_hash)') { $code = $Matches[1] } else { $code = 'erro' }
    Write-NxLog $Root ('excecao ' + $code)
    if ($code -eq 'unsafe_path') { & $Say $M.unsafe } else { & $Say $M.failed }
    return 1
  } finally {
    if ($dir -and (Test-Path -LiteralPath $dir)) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue }
  }
}`

export const MESSAGES = {
  expired: 'O prazo de 15 minutos venceu. Gere uma nova autorização no painel.',
  notInstalled: 'O app Nextec não está instalado nesta máquina (nenhum serviço RustDesk foi encontrado). Instale o app gerado pelo painel e execute este arquivo de novo.',
  searched: ' Procurei em: ',
  others: ' e outros {0}.',
  fullList: ' Lista completa em: ',
  otherMachine: 'Este arquivo é de outra máquina (o ID não confere). Gere a autorização para esta máquina.',
  client: 'Não foi possível identificar o ID do app instalado nesta máquina (serviço não encontrado ou sem resposta). Confirme que o app está instalado e em execução e tente de novo. Detalhes em ativar.log.',
  pending: 'Já existe uma ativação em andamento nesta máquina. Aguarde até 5 minutos.',
  invalid: 'A autorização é inválida, vencida ou já usada. Gere outra no painel.',
  notAdmin: 'Execute como administrador. Clique com o botão direito no arquivo e escolha Executar como administrador.',
  unsafe: 'A pasta do agente não está protegida como esperado. Contate o suporte Nextec.',
  packageInvalid: 'O arquivo está corrompido (conferência de integridade falhou). Baixe de novo no painel.',
  installFailed: 'Não foi possível instalar o agente nesta máquina. Detalhes em ativar.log.',
  agentKept: 'O agente desta máquina já está cadastrado e o painel o reconhece. Não é preciso ativar de novo.',
  agentRefused: 'O painel já tem um agente cadastrado para esta máquina e recusou um novo. No painel, use Remover agente e gere uma nova autorização.',
  panelUnreachable: 'Não foi possível falar com o painel agora. Confira a internet do servidor e tente de novo dentro dos 15 minutos.',
  receivedPending: 'Autorização recebida. A ativação termina sozinha em até 5 minutos; confira em Senhas dos servidores no painel.',
  failed: 'Não foi possível ativar. Gere uma nova autorização no painel e tente de novo. Detalhes em ativar.log.',
  ok: 'Pronto: máquina ativada. Pode fechar.',
}

// `bundle` é o resultado de activationBundle(): { painel, id, uuid, bootstrap }.
// `pkg` é o resultado de buildAgentPackage(): { names, parts, shas }.
// `now` em milissegundos (injetável nos testes). `options.root` só existe para testes (pasta de dados simulada).
// Exit codes: 0 ativada (ou autorização recebida), 3 prazo vencido, 1 outro erro.
export function buildActivationCmd(bundle, now = Date.now(), pkg, options = {}) {
  const id = String(bundle && bundle.id)
  if (!ID_RE.test(id)) throw new Error('ID da máquina inválido para gerar o arquivo.')
  if (!bundle.bootstrap || !/^[A-Za-z0-9_-]{43}$/.test(bundle.bootstrap)) throw new Error('Autorização inválida.')
  if (!pkg || !Array.isArray(pkg.parts) || !pkg.parts.length || !pkg.shas) throw new Error('Pacote do agente ausente.')
  for (const name of AGENT_PACKAGE_FILES) {
    if (!/^[0-9a-f]{64}$/.test(String(pkg.shas[name]))) throw new Error('Pacote do agente incompleto.')
  }
  if (!pkg.parts.every(p => /^[A-Za-z0-9+/=]{1,7000}$/.test(p))) throw new Error('Pacote do agente inválido.')
  const json = JSON.stringify({ painel: bundle.painel, id, uuid: bundle.uuid, bootstrap: bundle.bootstrap })
  const data = toBase64(json)
  if (!B64_RE.test(data)) throw new Error('Autorização inválida.')
  const expires = Math.floor(now / 1000) + ACTIVATION_WINDOW_SECONDS
  const m = Object.fromEntries(Object.entries(MESSAGES).map(([k, v]) => [k, psText(v)]))
  const messages = Object.keys(MESSAGES).filter(k => k !== 'expired').map(k => `  '${k}' = (${m[k]})`)

  const ps = [
    "$ErrorActionPreference = 'Stop'",
    // rede de segurança: nenhum erro inesperado (arquivo corrompido, ambiente estranho) termina com exceção crua
    'trap { Write-Host (' + m.failed + '); exit 1 }',
    "$self = $env:NX_SELF",
    "$lines = [IO.File]::ReadAllLines($self)",
    "$id = ($lines | Where-Object { $_ -like 'rem NXID *' } | Select-Object -First 1).Substring(9).Trim()",
    "$exp = [int64](($lines | Where-Object { $_ -like 'rem NXEXP *' } | Select-Object -First 1).Substring(10).Trim())",
    "$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()",
    "$rootLine = $lines | Where-Object { $_ -like 'rem NXROOT *' } | Select-Object -First 1",
    'function Say($t) { Write-Host $t }',
    'if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -gt $exp) { Say (' + m.expired + '); exit 3 }',
    '$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    'if (-not $admin) {',
    '  try { Start-Process -FilePath $env:ComSpec -ArgumentList (\'/c ""\' + $self + \'""\') -Verb RunAs; exit 5 }',
    '  catch { Say (' + m.notAdmin + '); exit 1 }',
    '}',
    "$pd = [string]$env:ProgramData; if (-not $pd.Trim()) { $pd = [string]$env:SystemDrive + '\ProgramData' }",
    "$root = [IO.Path]::Combine($pd, 'Nextec\Acesso')",
    "if ($rootLine) { $root = $rootLine.Substring(10).Trim() }",
    ...FIND_AGENT_PS.split('\n'),
    ...INSTALL_AGENT_PS.split('\n'),
    '$M = @{',
    ...messages,
    '}',
    '$psexe = Join-Path $env:SystemRoot \'System32\WindowsPowerShell\v1.0\powershell.exe\'',
    '$run = {',
    '  param($script, $argList)',
    "  $ErrorActionPreference = 'Continue'",
    '  $o = & $psexe -NoProfile -ExecutionPolicy Bypass -File $script @argList 2>&1 | Out-String',
    '  [pscustomobject]@{ Code = $LASTEXITCODE; Out = $o }',
    '}',
    '$pf = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramW6432)',
    'try { $found = Find-NextecAgent -DataRoot $root -ProgramRoots $pf }',
    "catch { $found = [pscustomobject]@{ Script = ''; App = ''; AppPath = ''; Searched = @($root, ('busca interrompida: ' + $_.Exception.Message)) } }",
    // nenhum app: ao usuário, no máximo 5 caminhos; a lista inteira vai para um arquivo ao lado do .cmd (ou no TEMP)
    '$appThere = $false',
    'try { $appThere = ([bool]$found.Script) -or ([bool][string]$found.App) -or ([bool]$found.AppPath -and [IO.Directory]::Exists([string]$found.AppPath)) } catch { $appThere = $false }',
    'if (-not $appThere) {',
    "  $all = New-Object System.Collections.ArrayList; foreach ($x in @($found.Searched)) { [void]$all.Add([string]$x) }",
    "  $short = New-Object System.Collections.ArrayList; foreach ($x in $all) { if ($short.Count -lt 5) { [void]$short.Add($x) } }",
    "  $where = " + m.searched + " + ($short.ToArray() -join '; ')",
    "  if ($all.Count -gt 5) { $where += (" + m.others + ").Replace('{0}', [string]($all.Count - 5)) }",
    "  $logName = 'Ativar-Nextec-' + ([string]$id -replace '[^0-9]', '') + '-busca.log'",
    "  $logText = @(('Ativar Nextec: busca do agente em ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')), ('App: ' + [string]$found.App), ('Pasta do app: ' + [string]$found.AppPath)) + $all.ToArray()",
    "  $log = ''",
    '  $logDirs = New-Object System.Collections.ArrayList',
    '  try { [void]$logDirs.Add([IO.Path]::GetDirectoryName($self)) } catch { }',
    '  try { [void]$logDirs.Add([IO.Path]::GetTempPath()) } catch { }',
    '  foreach ($dirLog in $logDirs) {',
    '    if ($log -or -not $dirLog) { continue }',
    '    try { $try = [IO.Path]::Combine($dirLog, $logName); [IO.File]::WriteAllLines($try, [string[]]$logText); $log = $try } catch { }',
    '  }',
    '  if ($log) { $where += (' + m.fullList + ') + $log }',
    '  Say (' + m.notInstalled + ' + $where)',
    '  exit 1',
    '}',
    '$code = @(Invoke-NxActivation -Root $root -Lines $lines -DataB64 $b64 -Found $found -M $M -Run $run -Say { param($t) Write-Host $t })[-1]',
    'exit ([int]$code)',
  ]

  const cmd = [
    '@echo off',
    'setlocal',
    'title Ativar Nextec',
    'set "NX_SELF=%~f0"',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:NX_SELF); $i=$t.IndexOf(\'#PS\'+\'-BEGIN#\'); & ([scriptblock]::Create($t.Substring($i)))"',
    'set "NX_RC=%errorlevel%"',
    // 5 = a janela foi reaberta como administrador: esta cópia não-elevada só encerra
    'if "%NX_RC%"=="5" exit /b 0',
    'echo.',
    'pause',
    // ativada ou vencida: o arquivo (que contém o código de uso único) se apaga
    'if "%NX_RC%"=="0" ( (goto) 2>nul & del /f /q "%~f0" )',
    'if "%NX_RC%"=="3" ( (goto) 2>nul & del /f /q "%~f0" )',
    'exit /b %NX_RC%',
    `rem NXID ${id}`,
    `rem NXEXP ${expires}`,
    `rem NXDATA ${data}`,
    ...(options.root ? [`rem NXROOT ${options.root}`] : []),
    ...AGENT_PACKAGE_FILES.map(n => `rem NXSHA ${n} ${pkg.shas[n]}`),
    ...pkg.parts.map(p => `rem NXPKG ${p}`),
    'rem #PS-BEGIN#',
    ...ps,
  ]
  const text = cmd.join('\r\n') + '\r\n'
  if (text.length > ACTIVATION_MAX_BYTES) throw new Error('Arquivo de ativação grande demais.')
  return text
}

export function downloadActivationCmd(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-msdownload' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
