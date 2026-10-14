// Apoio dos testes do Ativar-Nextec-<ID>.cmd (instalação e atomicidade). Roda o PowerShell 5.1 real (só Windows) com
// DUBLÊS no lugar do que toca a máquina: tarefas agendadas (Get/Start/Stop/Enable/Disable/Export/Register/Unregister),
// ACL (sem elevação), coordenador/painel (o bloco $run) e identidade local (serviço, CLI --get-id e MachineGuid, via
// $script:NxIdHooks). A raiz de dados é sempre uma pasta temporária: nada toca %ProgramData% nem as tarefas reais.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, statSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { buildActivationCmd, FIND_AGENT_PS, INSTALL_AGENT_PS, MESSAGES, psText } from '../../src/nextec/activation-cmd.mjs'
import { pacoteReal } from './pacote-agente.mjs'

export const PS51 = process.platform === 'win32' ? 'powershell.exe' : null
export const skip = !PS51
export const GUID = '3f2a1c9e-0000-4000-8000-000000000001'
export const UUID = Buffer.from(GUID, 'utf8').toString('base64')   // o que o RustDesk informa ao painel
export const bundle = { painel: 'https://painel-remoto.nex.tec.br', id: '536822159', uuid: UUID, bootstrap: 'B'.repeat(43) }
export const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
export const TAREFA_COORD = 'Nextec Acesso - Cadastro de agente'
export const TAREFA_SENHA = 'Nextec Acesso - Senha'
export const sha = (b) => createHash('sha256').update(b).digest('hex')
export const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'"

const messagesPs = '$M = @{\n' + Object.keys(MESSAGES).map(k => `  '${k}' = (${psText(MESSAGES[k])})`).join('\n') + '\n}'

export const HARNESS = `$ErrorActionPreference = 'Stop'
${FIND_AGENT_PS}
${INSTALL_AGENT_PS}
${messagesPs}
function New-NxAcl {
  param([switch]$Directory, [switch]$WithOwner)
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().User
  if ($Directory) { $acl = [Security.AccessControl.DirectorySecurity]::new() } else { $acl = [Security.AccessControl.FileSecurity]::new() }
  $acl.SetAccessRuleProtection($true, $false)
  if ($Directory) { $inh = 'ContainerInherit,ObjectInherit' } else { $inh = 'None' }
  foreach ($s in @([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'), $me)) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s, 'FullControl', $inh, 'None', 'Allow'))
  }
  return $acl
}
function Set-Acl { param($LiteralPath, $AclObject) }
$script:calls = New-Object System.Collections.ArrayList
$script:tasks = @{}
$script:coord = 'Nextec Acesso - Cadastro de agente'
$script:senha = 'Nextec Acesso - Senha'
function Stop-ScheduledTask { param($TaskName, $ErrorAction) [void]$script:calls.Add('stop:' + $TaskName) }
function Disable-ScheduledTask { param($TaskName, $ErrorAction) [void]$script:calls.Add('disable:' + $TaskName); if ($script:tasks.ContainsKey($TaskName)) { $script:tasks[$TaskName] = 'Disabled' } }
function Enable-ScheduledTask { param($TaskName, $ErrorAction) [void]$script:calls.Add('enable:' + $TaskName); if ($script:tasks.ContainsKey($TaskName)) { $script:tasks[$TaskName] = 'Ready' } }
function Start-ScheduledTask { param($TaskName, $ErrorAction) [void]$script:calls.Add('start:' + $TaskName) }
function Get-ScheduledTask { param($TaskName, $ErrorAction) if ($script:tasks.ContainsKey($TaskName)) { return [pscustomobject]@{ TaskName = $TaskName; State = $script:tasks[$TaskName] } } return $null }
function Export-ScheduledTask { param($TaskName, $ErrorAction) return ('<Task original="' + $TaskName + '" state="' + $script:tasks[$TaskName] + '"/>') }
function Register-ScheduledTask { param($TaskName, $Xml, [switch]$Force, $ErrorAction) [void]$script:calls.Add('register-xml:' + $TaskName); $script:tasks[$TaskName] = 'Ready'; $script:xmlRestored = $Xml }
function Unregister-ScheduledTask { param($TaskName, $Confirm, $ErrorAction) [void]$script:calls.Add('unregister:' + $TaskName); $script:tasks.Remove($TaskName) }
$script:xmlRestored = ''
$script:runs = New-Object System.Collections.ArrayList
$script:said = New-Object System.Collections.ArrayList
$script:payloadSeen = ''
$script:registrarCode = 0
$script:registrarOut = ''
$script:receberCode = 0
$script:receberOut = ''
$script:receberMutate = $false
$script:receberLog = ''
$script:receberCreates = ''
$run = {
  param($script, $argList)
  $a = @($argList)
  [void]$script:runs.Add([pscustomobject]@{ Script = [IO.Path]::GetFileName($script); Args = ($a -join ' ') })
  $rootArg = $a[[Array]::IndexOf($a, '-PastaDados') + 1]
  if ($a -contains '-Registrar') {
    # o Register-ScheduledTask real do coordenador: a tarefa passa a existir (mesmo que o -Registrar falhe depois)
    $script:tasks[$script:coord] = 'Ready'
    return [pscustomobject]@{ Code = $script:registrarCode; Out = $script:registrarOut }
  }
  if ($a -contains '-Receber') {
    $f = $a[[Array]::IndexOf($a, '-ArquivoAutorizacao') + 1]
    $script:payloadSeen = [IO.File]::ReadAllText($f)
    if ($script:receberMutate) {
      # o que o coordenador real faz antes de falhar: tira o cadastro antigo do caminho e deixa bootstrap/journal
      $cfg = [IO.Path]::Combine($rootArg, 'agente-senha.json')
      if ([IO.File]::Exists($cfg)) { [IO.File]::Delete($cfg) }
      [IO.File]::WriteAllText([IO.Path]::Combine($rootArg, 'bootstrap.json'), 'pendente')
      [IO.File]::WriteAllText([IO.Path]::Combine($rootArg, 'provisionamento-agente.json'), 'journal')
    }
    if ($script:receberLog) { [IO.File]::AppendAllText([IO.Path]::Combine($rootArg, 'provisionamento-agente.log'), '2026-10-13 12:00:00 ' + $script:receberLog + [Environment]::NewLine) }
    if ($script:receberCreates) { [IO.File]::WriteAllText($script:receberCreates, 'novo') }
    return [pscustomobject]@{ Code = $script:receberCode; Out = $script:receberOut }
  }
  [pscustomobject]@{ Code = 0; Out = '' }
}
$say = { param($t) [void]$script:said.Add([string]$t) }
function Out-Result {
  param($Value)
  $json = $Value | ConvertTo-Json -Depth 6 -Compress
  $json = [regex]::Replace($json, '[^\\x00-\\x7F]', { param($m) '\\u' + ([int][char]$m.Value).ToString('x4') })
  Write-Output ('NXJSON:' + $json)
}
# Identidade local de mentira: um servico XPTO (--service) com pasta de config, leitor de ID (o que o CLI --get-id devolve)
# e leitor de MachineGuid. Troca $script:TestPeer / $script:TestGuid / $script:TestPeerFail por teste.
function Set-TestIdentity {
  param([Parameter(Mandatory)][string]$Dir, [string]$PeerId, [string]$Guid)
  $exe = [IO.Path]::Combine($Dir, 'svc', 'XPTO.exe')
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($exe))
  [IO.File]::WriteAllText($exe, 'MZ')
  $base = [IO.Path]::Combine($Dir, 'sp')
  $cfg = [IO.Path]::Combine($base, 'SystemProfile', 'AppData', 'Roaming', 'XPTO', 'config')
  [void][IO.Directory]::CreateDirectory($cfg)
  [IO.File]::WriteAllText([IO.Path]::Combine($cfg, 'RustDesk.toml'), 'x')
  $svc = [pscustomobject]@{ Name = 'XPTO'; PathName = ('"' + $exe + '" --service'); StartName = 'LocalSystem' }
  $script:TestPeer = $PeerId; $script:TestGuid = $Guid; $script:TestPeerFail = $false
  $script:NxIdHooks = @{
    Services = @($svc); ProfileRootBase = $base
    PeerIdReader = { param($s, $e) if ($script:TestPeerFail) { throw 'identity_conflict: CLI sem resposta' }; return $script:TestPeer }
    GuidReader = { return $script:TestGuid }
  }
}
`

export function runPs(body, extraEnv = {}, ident = { peer: bundle.id, guid: GUID }) {
  const dir = mkdtempSync(join(realpathSync.native(tmpdir()), 'nxrun-'))
  try {
    const file = join(dir, 'h.ps1')
    const pre = `Set-TestIdentity -Dir $PSScriptRoot -PeerId ${psq(ident.peer)} -Guid ${psq(ident.guid)}\n`
    writeFileSync(file, '﻿' + HARNESS + pre + body, 'utf8')
    const r = spawnSync(PS51, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { encoding: 'utf8', env: { ...process.env, ...extraEnv } })
    const line = r.stdout.split(/\r?\n/).find(l => l.startsWith('NXJSON:'))
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: line ? JSON.parse(line.slice(7)) : null }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

export async function prepararCmd(dir, opcoes, b = bundle) {
  const t = buildActivationCmd(b, NOW, await pacoteReal(), opcoes)
  const p = join(dir, 'Ativar-Nextec-536822159.cmd')
  writeFileSync(p, t, 'latin1')
  return { text: t, path: p }
}

export const found = (dir) => "([pscustomobject]@{ Script = ''; App = 'Client-Nextec-Connect'; AppPath = '" + dir + "'; Searched = @('x') })"

export const withDir = async (fn) => {
  const d = mkdtempSync(join(realpathSync.native(tmpdir()), 'nxcmd-'))
  try { return await fn(d) } finally { rmSync(d, { recursive: true, force: true }) }
}

// Fotografia de uma pasta (recursiva): nome, tipo e SHA-256 do conteúdo. O ativar.log fica de fora (é o único rastro permitido).
export function estado(dir, base = dir) {
  const out = {}
  let nomes = []
  try { nomes = readdirSync(dir) } catch { return out }
  for (const n of nomes) {
    const p = join(dir, n)
    const rel = p.slice(base.length + 1).toLowerCase()
    if (rel === 'ativar.log') continue
    if (statSync(p).isDirectory()) { out[rel + '/'] = 'dir'; Object.assign(out, estado(p, base)) } else out[rel] = sha(readFileSync(p))
  }
  return out
}

export const pacoteScripts = ['Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1']
