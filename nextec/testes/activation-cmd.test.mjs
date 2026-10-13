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
