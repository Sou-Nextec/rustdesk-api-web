import test from 'node:test'
import assert from 'node:assert/strict'
import { buildActivationCmd, activationFileName, psText, ACTIVATION_WINDOW_SECONDS, MESSAGES } from '../../src/nextec/activation-cmd.mjs'

const bundle = { painel: 'https://painel-remoto.nex.tec.br', id: '536822159', uuid: 'abc-123', bootstrap: 'A'.repeat(43) }
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)

test('o nome do arquivo usa o ID e recusa ID fora do padrão', () => {
  assert.equal(activationFileName('536822159'), 'Ativar-Nextec-536822159.cmd')
  for (const bad of ['', 'abc', '12', '../x', '536822159.cmd', '1 2 3 4 5 6 7']) assert.throws(() => activationFileName(bad))
})

test('o .cmd é ASCII puro, com CRLF, e carrega ID, prazo e código só em base64', () => {
  const t = buildActivationCmd(bundle, NOW)
  assert.match(t, /^[\x00-\x7F]*$/, 'sem caracteres fora do ASCII')
  assert.ok(t.split('\r\n').length > 20 && !/[^\r]\n/.test(t), 'toda quebra de linha é CRLF')
  assert.match(t, /\r\nrem NXID 536822159\r\n/)
  assert.match(t, new RegExp(`\r\nrem NXEXP ${Math.floor(NOW / 1000) + ACTIVATION_WINDOW_SECONDS}\r\n`))
  const data = t.match(/rem NXDATA (\S+)/)[1]
  assert.deepEqual(JSON.parse(Buffer.from(data, 'base64').toString('utf8')), bundle)
  assert.ok(!t.includes(bundle.bootstrap), 'o código não aparece em texto puro')
  assert.ok(!t.includes('uuid') && !t.includes(bundle.uuid))
})

test('o .cmd usa o coordenador instalado sem diálogo, eleva por UAC e apaga o temporário', () => {
  const t = buildActivationCmd(bundle, NOW)
  assert.match(t, /Coordenar-Agente-Nextec\.ps1/)
  assert.match(t, /-Receber -ArquivoAutorizacao \$file/)
  assert.match(t, /-Verb RunAs/)
  assert.match(t, /Remove-Item -LiteralPath \$dir -Recurse -Force/)
  assert.match(t, /S-1-5-18/)
  assert.match(t, /S-1-5-32-544/)
  assert.ok(!/OpenFileDialog|bootstrap\.json'\s*$/m.test(t.split('rem #PS-BEGIN#')[0]))
  assert.ok(!/Write-Host \$b64|Say \$b64|Say \$out/.test(t), 'o código e a saída bruta nunca são impressos')
})

test('as mensagens em português viram [char] e não dependem da página de código', () => {
  const t = buildActivationCmd(bundle, NOW)
  assert.match(psText(MESSAGES.ok), /^'Pronto: m'\+\[char\]0xE1\+'quina ativada\. Pode fechar\.'$/)
  assert.match(t, /\[char\]0xE1/)
  assert.equal(psText("it's"), "'it''s'")
  assert.equal(psText(''), "''")
  assert.equal(psText('ç'), '[char]0xE7')
})

test('o .cmd recusa dados fora do padrão em vez de injetar na linha de comando', () => {
  assert.throws(() => buildActivationCmd({ ...bundle, id: '1&calc' }, NOW))
  assert.throws(() => buildActivationCmd({ ...bundle, id: '536822159\r\nformat c:' }, NOW))
  assert.throws(() => buildActivationCmd({ ...bundle, bootstrap: 'x"&calc' }, NOW))
  assert.throws(() => buildActivationCmd(null, NOW))
})

test('os caminhos de saída têm códigos distintos: ativada (0), prazo (3) e reabertura elevada (5)', () => {
  const t = buildActivationCmd(bundle, NOW)
  assert.match(t, /exit 3/)
  assert.match(t, /exit 5/)
  assert.match(t, /if "%NX_RC%"=="0" \( \(goto\) 2>nul & del \/f \/q "%~f0" \)/)
  for (const k of ['expired', 'notInstalled', 'otherMachine']) assert.ok(MESSAGES[k].length > 10)
  assert.match(MESSAGES.expired, /15 minutos/)
  assert.match(MESSAGES.notInstalled, /não está instalado/)
  assert.match(MESSAGES.otherMachine, /ID/)
})

// --- localizador do agente: independente do nome do app (regressão do servidor com "Client-Nextec-Connect") ---
import { FIND_AGENT_PS } from '../../src/nextec/activation-cmd.mjs'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PS51 = process.platform === 'win32' ? 'powershell.exe' : null
const runFind = (body) => {
  const script = `${FIND_AGENT_PS}\n$ErrorActionPreference='Stop'\n${body}\n`
  const r = spawnSync(PS51, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

test('o .cmd embute o localizador e as três mensagens novas, sem acento cru', () => {
  const t = buildActivationCmd(bundle, NOW)
  assert.match(t, /function Find-NextecAgent/)
  assert.match(t, /Find-NextecAgent -DataRoot \$root/)
  assert.match(t, /-Registrar/)
  assert.match(MESSAGES.appWithoutAgent, /MESMO nome do app/)
  assert.match(MESSAGES.appUnknown, /MESMO nome/)
  assert.match(t, /\[char\]0xE3/)
  assert.match(t, /^[\x00-\x7F]*$/)
})

test('PS 5.1: app Client-Nextec-Connect sem agente é achado pelo registro e diz o que falta', { skip: !PS51 }, () => {
  const d = mkdtempSync(join(realpathSync.native(tmpdir()), 'nxfind-'))
  try {
    const pf = join(d, 'PF'); mkdirSync(join(pf, 'Client-Nextec-Connect'), { recursive: true })
    const out = runFind(`$r = Find-NextecAgent -DataRoot '${join(d, 'PD', 'Nextec', 'Acesso')}' -ProgramRoots @('${pf}') -Entries @([pscustomobject]@{DisplayName='Client-Nextec-Connect';InstallLocation='${join(pf, 'Client-Nextec-Connect')}'}) -TaskArgs @()
      'script=[' + $r.Script + '] app=[' + $r.App + '] n=' + $r.Searched.Count`)
    assert.match(out, /script=\[\] app=\[Client-Nextec-Connect\] n=3/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: acha o coordenador na pasta fixa, na instalação do app e por varredura de Program Files', { skip: !PS51 }, () => {
  const d = mkdtempSync(join(realpathSync.native(tmpdir()), 'nxfind-'))
  try {
    const data = join(d, 'PD', 'Nextec', 'Acesso'); mkdirSync(data, { recursive: true })
    writeFileSync(join(data, 'Coordenar-Agente-Nextec.ps1'), '#')
    let out = runFind(`(Find-NextecAgent -DataRoot '${data}' -ProgramRoots @() -Entries @() -TaskArgs @()).Script`)
    assert.equal(out, join(data, 'Coordenar-Agente-Nextec.ps1'))

    const app = join(d, 'PF', 'Client-Nextec-Connect'); mkdirSync(app, { recursive: true })
    writeFileSync(join(app, 'Coordenar-Agente-Nextec.ps1'), '#')
    out = runFind(`(Find-NextecAgent -DataRoot '${join(d, 'vazio')}' -ProgramRoots @() -Entries @([pscustomobject]@{DisplayName='Client-Nextec-Connect';InstallLocation='${app}'}) -TaskArgs @()).Script`)
    assert.equal(out, join(app, 'Coordenar-Agente-Nextec.ps1'))

    out = runFind(`(Find-NextecAgent -DataRoot '${join(d, 'vazio')}' -ProgramRoots @('${join(d, 'PF')}') -Entries @() -TaskArgs @()).Script`)
    assert.equal(out, join(app, 'Coordenar-Agente-Nextec.ps1'))

    out = runFind(`(Find-NextecAgent -DataRoot '${join(d, 'vazio')}' -ProgramRoots @() -Entries @() -TaskArgs @('-NoProfile -File "${join(app, 'Outro.ps1')}" -Executar')).Script`)
    assert.equal(out, join(app, 'Coordenar-Agente-Nextec.ps1'))
  } finally { rmSync(d, { recursive: true, force: true }) }
})
