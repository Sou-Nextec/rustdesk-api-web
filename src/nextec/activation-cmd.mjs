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

// Localiza o agente sem depender do nome do app (Nextec-Connect, Client-Nextec-Connect, ...). Ordem: pasta de dados
// fixa, entrada de desinstalação com "Nextec-Connect" no nome, tarefa agendada Nextec, varredura de %ProgramFiles%\*Nextec*.
// $Entries/$TaskArgs podem ser injetados (testes); sem eles lê o registro e as tarefas reais.
export const FIND_AGENT_PS = String.raw`function Find-NextecAgent {
  param([string]$DataRoot, [string[]]$ProgramRoots, $Entries, $TaskArgs)
  $name = 'Coordenar-Agente-Nextec.ps1'
  $searched = New-Object System.Collections.ArrayList
  $r = [pscustomobject]@{ Script = ''; App = ''; AppPath = ''; Searched = $searched }
  $c = Join-Path $DataRoot $name
  [void]$searched.Add($c)
  if (Test-Path -LiteralPath $c -PathType Leaf) { $r.Script = $c; return $r }
  if ($null -eq $Entries) {
    $Entries = New-Object System.Collections.ArrayList
    foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
      foreach ($i in @(Get-ItemProperty -Path ($k + '\*') -ErrorAction SilentlyContinue)) { [void]$Entries.Add($i) }
    }
  }
  foreach ($e in @($Entries)) {
    if ($e.DisplayName -and ($e.DisplayName -like '*Nextec-Connect*')) {
      if (-not $r.App) { $r.App = [string]$e.DisplayName }
      $loc = [string]$e.InstallLocation
      if ($loc) {
        if (-not $r.AppPath) { $r.AppPath = $loc }
        $p = Join-Path $loc $name
        [void]$searched.Add($p)
        if (Test-Path -LiteralPath $p -PathType Leaf) { $r.Script = $p; return $r }
      }
    }
  }
  if ($null -eq $TaskArgs) {
    $TaskArgs = @()
    try { $TaskArgs = @(Get-ScheduledTask -TaskName 'Nextec*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Actions } | ForEach-Object { [string]$_.Arguments }) } catch { $TaskArgs = @() }
  }
  foreach ($a in @($TaskArgs)) {
    $m = [regex]::Match($a, '-File\s+"?([^"]+\.ps1)"?')
    if ($m.Success) {
      $p = Join-Path (Split-Path -Parent $m.Groups[1].Value) $name
      [void]$searched.Add($p)
      if (Test-Path -LiteralPath $p -PathType Leaf) { $r.Script = $p; return $r }
    }
  }
  foreach ($root in @($ProgramRoots)) {
    if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) { continue }
    foreach ($d in @(Get-ChildItem -LiteralPath $root -Directory -Filter '*Nextec*' -ErrorAction SilentlyContinue)) {
      if (-not $r.App) { $r.App = $d.Name }
      if (-not $r.AppPath) { $r.AppPath = $d.FullName }
      $cands = @((Join-Path $d.FullName $name))
      foreach ($sub in @(Get-ChildItem -LiteralPath $d.FullName -Directory -ErrorAction SilentlyContinue)) { $cands += (Join-Path $sub.FullName $name) }
      foreach ($p in $cands) {
        [void]$searched.Add($p)
        if (Test-Path -LiteralPath $p -PathType Leaf) { $r.Script = $p; return $r }
      }
    }
  }
  return $r
}`

export const MESSAGES = {
  expired: 'O prazo de 15 minutos venceu. Gere uma nova autorização no painel.',
  notInstalled: 'O agente Nextec não está instalado nesta máquina e nenhum app Nextec foi encontrado. Instale o Nextec-Connect gerado pelo painel e tente de novo.',
  appWithoutAgent: 'O app instalado ({0}) não contém o agente Nextec. Gere o instalador no gerador com o MESMO nome do app ({0}) e instale por cima: o ID e o cliente são mantidos. Depois execute este arquivo de novo.',
  appUnknown: 'O app instalado não contém o agente Nextec. Gere o instalador no gerador com o MESMO nome do app instalado e instale por cima: o ID e o cliente são mantidos. Depois execute este arquivo de novo.',
  searched: ' Procurei em: ',
  otherMachine: 'Este arquivo é de outra máquina (o ID não confere). Gere a autorização para esta máquina.',
  pending: 'Já existe uma ativação em andamento nesta máquina. Aguarde até 5 minutos.',
  invalid: 'A autorização é inválida. Gere outra no painel.',
  notAdmin: 'Execute como administrador. Clique com o botão direito no arquivo e escolha Executar como administrador.',
  unsafe: 'A pasta do agente não está protegida como esperado. Reinstale o Nextec-Connect.',
  failed: 'Não foi possível ativar. Gere uma nova autorização no painel e tente de novo.',
  ok: 'Pronto: máquina ativada. Pode fechar.',
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
    "$root = Join-Path $env:ProgramData 'Nextec\\Acesso'",
    "$coord = Join-Path $root 'Coordenar-Agente-Nextec.ps1'",
    ...FIND_AGENT_PS.split('\n'),
    '$pf = @($env:ProgramFiles, ${env:ProgramFiles(x86)})',
    '$found = Find-NextecAgent -DataRoot $root -ProgramRoots $pf',
    'if ($found.Script -and ($found.Script -ine $coord)) {',
    "  try { & (Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $found.Script -Registrar | Out-Null } catch { }",
    '}',
    'if (-not (Test-Path -LiteralPath $coord -PathType Leaf)) {',
    '  $where = (' + m.searched + " + ($found.Searched -join '; '))",
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
