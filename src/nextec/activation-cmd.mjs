// Gera o arquivo Ativar-Nextec-<ID>.cmd: um duplo clique no servidor, como administrador, entrega a autorização
// individual ao Coordenar-Agente-Nextec.ps1 -Receber já instalado, sem diálogo de arquivo.
// Módulo puro (sem DOM). O arquivo é só ASCII: acentos viram [char]0x.. no PowerShell, então não dependem da página
// de código do console. O código de ativação vai em base64 numa linha `rem` (nunca na linha de comando nem em log) e
// só depois de ativar o arquivo é apagado. A janela de 15 minutos é conferida no servidor e, antes, no próprio script.

const ID_RE = /^\d{6,64}$/
const B64_RE = /^[A-Za-z0-9+/=]+$/

export const ACTIVATION_WINDOW_SECONDS = 15 * 60

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

export const MESSAGES = {
  expired: 'O prazo de 15 minutos venceu. Gere uma nova autorização no painel.',
  notInstalled: 'O agente Nextec não está instalado nesta máquina e nenhum app Nextec foi encontrado. Instale o app gerado pelo painel (com o agente) e tente de novo.',
  appWithoutAgent: 'O app instalado ({0}) não contém o agente Nextec. Gere o instalador no gerador com o MESMO nome do app ({0}) e instale por cima: o ID e o cliente são mantidos. Depois execute este arquivo de novo.',
  appUnknown: 'O app instalado não contém o agente Nextec. Gere o instalador no gerador com o MESMO nome do app instalado e instale por cima: o ID e o cliente são mantidos. Depois execute este arquivo de novo.',
  searched: ' Procurei em: ',
  others: ' e outros {0}.',
  fullList: ' Lista completa em: ',
  otherMachine: 'Este arquivo é de outra máquina (o ID não confere). Gere a autorização para esta máquina.',
  pending: 'Já existe uma ativação em andamento nesta máquina. Aguarde até 5 minutos.',
  invalid: 'A autorização é inválida. Gere outra no painel.',
  notAdmin: 'Execute como administrador. Clique com o botão direito no arquivo e escolha Executar como administrador.',
  unsafe: 'A pasta do agente não está protegida como esperado. Reinstale o app gerado pelo painel.',
  failed: 'Não foi possível ativar. Gere uma nova autorização no painel e tente de novo.',
  ok: 'Pronto: autorização entregue e cadastro iniciado. A máquina aparece como ativa no painel em até 1 minuto. Pode fechar.',
}

// `bundle` é o resultado de activationBundle(): { painel, id, uuid, bootstrap }.
// `now` em milissegundos (injetável nos testes). Exit codes: 0 ativada, 3 prazo vencido, 1 outro erro.
export function buildActivationCmd(bundle, now = Date.now()) {
  const id = String(bundle && bundle.id)
  if (!ID_RE.test(id)) throw new Error('ID da máquina inválido para gerar o arquivo.')
  if (!bundle.bootstrap || !/^[A-Za-z0-9_-]{43}$/.test(bundle.bootstrap)) throw new Error('Autorização inválida.')
  const json = JSON.stringify({ painel: bundle.painel, id, uuid: bundle.uuid, bootstrap: bundle.bootstrap })
  const data = toBase64(json)
  if (!B64_RE.test(data)) throw new Error('Autorização inválida.')
  const expires = Math.floor(now / 1000) + ACTIVATION_WINDOW_SECONDS
  const m = Object.fromEntries(Object.entries(MESSAGES).map(([k, v]) => [k, psText(v)]))

  const ps = [
    "$ErrorActionPreference = 'Stop'",
    // rede de segurança: nenhum erro inesperado (arquivo corrompido, ambiente estranho) termina com exceção crua
    'trap { Write-Host (' + m.failed + '); exit 1 }',
    "$self = $env:NX_SELF",
    "$lines = [IO.File]::ReadAllLines($self)",
    "$id = ($lines | Where-Object { $_ -like 'rem NXID *' } | Select-Object -First 1).Substring(9).Trim()",
    "$exp = [int64](($lines | Where-Object { $_ -like 'rem NXEXP *' } | Select-Object -First 1).Substring(10).Trim())",
    "$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()",
    'function Say($t) { Write-Host $t }',
    'if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -gt $exp) { Say (' + m.expired + '); exit 3 }',
    '$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    'if (-not $admin) {',
    '  try { Start-Process -FilePath $env:ComSpec -ArgumentList (\'/c ""\' + $self + \'""\') -Verb RunAs; exit 5 }',
    '  catch { Say (' + m.notAdmin + '); exit 1 }',
    '}',
    "$pd = [string]$env:ProgramData; if (-not $pd.Trim()) { $pd = [string]$env:SystemDrive + '\\ProgramData' }",
    "$root = [IO.Path]::Combine($pd, 'Nextec\\Acesso')",
    "$coord = [IO.Path]::Combine($root, 'Coordenar-Agente-Nextec.ps1')",
    ...FIND_AGENT_PS.split('\n'),
    '$pf = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramW6432)',
    'try { $found = Find-NextecAgent -DataRoot $root -ProgramRoots $pf }',
    "catch { $found = [pscustomobject]@{ Script = ''; App = ''; AppPath = ''; Searched = @($root, ('busca interrompida: ' + $_.Exception.Message)) } }",
    'if ($found.Script -and ($found.Script -ine $coord)) {',
    "  try { & (Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $found.Script -Registrar | Out-Null } catch { }",
    '}',
    'if (-not (Test-Path -LiteralPath $coord -PathType Leaf)) {',
    // ao usuário, no máximo 5 caminhos; a lista inteira vai para um arquivo ao lado do .cmd (ou no TEMP)
    "  $all = New-Object System.Collections.ArrayList; foreach ($x in @($found.Searched)) { [void]$all.Add([string]$x) }",
    "  $short = New-Object System.Collections.ArrayList; foreach ($x in $all) { if ($short.Count -lt 5) { [void]$short.Add($x) } }",
    "  $where = " + m.searched + " + ($short.ToArray() -join '; ')",
    "  if ($all.Count -gt 5) { $where += (" + m.others + ").Replace('{0}', [string]($all.Count - 5)) }",
    "  $logName = 'Ativar-Nextec-' + ([string]$id -replace '[^0-9]', '') + '-busca.log'",
    "  $logText = @(('Ativar Nextec: busca do agente em ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')), ('App: ' + [string]$found.App), ('Pasta do app: ' + [string]$found.AppPath)) + $all.ToArray()",
    '  $log = \'\'',
    '  $logDirs = New-Object System.Collections.ArrayList',
    '  try { [void]$logDirs.Add([IO.Path]::GetDirectoryName($self)) } catch { }',
    '  try { [void]$logDirs.Add([IO.Path]::GetTempPath()) } catch { }',
    '  foreach ($dirLog in $logDirs) {',
    "    if ($log -or -not $dirLog) { continue }",
    "    try { $try = [IO.Path]::Combine($dirLog, $logName); [IO.File]::WriteAllLines($try, [string[]]$logText); $log = $try } catch { }",
    '  }',
    '  if ($log) { $where += ' + m.fullList + ' + $log }',
    "  if ($found.App) { Say ((" + m.appWithoutAgent + ").Replace('{0}', $found.App) + $where) }",
    '  else { Say (' + m.notInstalled + ' + $where) }',
    '  exit 1',
    '}',
    "$dir = Join-Path $root ('ativar-' + [guid]::NewGuid().ToString('N'))",
    '$code = 1',
    'try {',
    '  $sys = [Security.Principal.SecurityIdentifier]::new(\'S-1-5-18\'); $adm = [Security.Principal.SecurityIdentifier]::new(\'S-1-5-32-544\')',
    '  $dacl = [Security.AccessControl.DirectorySecurity]::new(); $dacl.SetAccessRuleProtection($true, $false)',
    '  foreach ($s in @($sys, $adm)) { $dacl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s, \'FullControl\', \'ContainerInherit,ObjectInherit\', \'None\', \'Allow\')) }',
    '  [IO.Directory]::CreateDirectory($dir, $dacl) | Out-Null',
    "  $file = Join-Path $dir 'bootstrap.json'",
    '  $fs = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)',
    '  try { $bytes = [Convert]::FromBase64String($b64); $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Dispose() }',
    '  $out = & (Join-Path $env:SystemRoot \'System32\\WindowsPowerShell\\v1.0\\powershell.exe\') -NoProfile -ExecutionPolicy Bypass -File $coord -Receber -ArquivoAutorizacao $file 2>&1 | Out-String',
    '  if ($LASTEXITCODE -eq 0) { Say (' + m.ok + '); $code = 0 }',
    '  else {',
    "    if ($out -match 'identity_conflict') { Say (" + m.otherMachine + ') }',
    "    elseif ($out -match 'component_missing') { Say (" + m.appUnknown + ') }',
    "    elseif ($out -match 'pending_authorization') { Say (" + m.pending + ') }',
    "    elseif ($out -match 'administrator_required') { Say (" + m.notAdmin + ') }',
    "    elseif ($out -match 'unsafe_path') { Say (" + m.unsafe + ') }',
    "    elseif ($out -match 'invalid_|protocol_error') { Say (" + m.invalid + ') }',
    '    else { Say (' + m.failed + ') }',
    '  }',
    '} catch { Say (' + m.failed + '); $code = 1 }',
    'finally { if ($dir -and (Test-Path -LiteralPath $dir)) { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue } }',
    'exit $code',
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
    'rem #PS-BEGIN#',
    ...ps,
  ]
  return cmd.join('\r\n') + '\r\n'
}

export function downloadActivationCmd(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-msdownload' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
