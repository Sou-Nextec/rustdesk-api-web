import test from 'node:test'
import assert from 'node:assert/strict'
import { buildActivationCmd, activationFileName, psText, ACTIVATION_WINDOW_SECONDS, ACTIVATION_MAX_BYTES, MESSAGES } from '../../src/nextec/activation-cmd.mjs'
import { pacoteReal } from './pacote-agente.mjs'

const bundle = { painel: 'https://painel-remoto.nex.tec.br', id: '536822159', uuid: 'abc-123', bootstrap: 'A'.repeat(43) }
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const gerar = async (b = bundle, now = NOW, opcoes) => buildActivationCmd(b, now, await pacoteReal(), opcoes)

test('o nome do arquivo usa o ID e recusa ID fora do padrão', () => {
  assert.equal(activationFileName('536822159'), 'Ativar-Nextec-536822159.cmd')
  for (const bad of ['', 'abc', '12', '../x', '536822159.cmd', '1 2 3 4 5 6 7']) assert.throws(() => activationFileName(bad))
})

test('o .cmd é ASCII puro, com CRLF, e carrega ID, prazo e código só em base64', async () => {
  const t = await gerar()
  assert.match(t, /^[\x00-\x7F]*$/, 'sem caracteres fora do ASCII')
  assert.ok(t.split('\r\n').length > 20 && !/[^\r]\n/.test(t), 'toda quebra de linha é CRLF')
  assert.match(t, /\r\nrem NXID 536822159\r\n/)
  assert.match(t, new RegExp(`\r\nrem NXEXP ${Math.floor(NOW / 1000) + ACTIVATION_WINDOW_SECONDS}\r\n`))
  const data = t.match(/rem NXDATA (\S+)/)[1]
  assert.deepEqual(JSON.parse(Buffer.from(data, 'base64').toString('utf8')), bundle)
  assert.ok(!t.includes(bundle.bootstrap), 'o código não aparece em texto puro')
  // o preflight compara o uuid pelo nome do campo, então a palavra aparece no script; o VALOR nunca aparece em texto puro
  assert.ok(!t.includes(bundle.uuid) && !t.includes('"uuid"'), 'o uuid da autorização só existe dentro do NXDATA (base64)')
})

test('o .cmd usa o coordenador sem diálogo, eleva por UAC, substitui agente antigo e apaga o temporário', async () => {
  const t = await gerar()
  assert.match(t, /Coordenar-Agente-Nextec\.ps1/)
  assert.match(t, /'-Receber', '-ArquivoAutorizacao', \$file/)
  assert.match(t, /'-SubstituirAgenteAntigo'/)
  assert.match(t, /-Verb RunAs/)
  assert.match(t, /Remove-Item -LiteralPath \$dir -Recurse -Force/)
  assert.match(t, /S-1-5-18/)
  assert.match(t, /S-1-5-32-544/)
  assert.ok(!/OpenFileDialog|bootstrap\.json'\s*$/m.test(t.split('rem #PS-BEGIN#')[0]))
  assert.ok(!/Write-Host \$b64|Say \$b64|Say \$out|Write-Host \$out/.test(t), 'o código e a saída bruta nunca são impressos')
  assert.ok(!/Invoke-WebRequest|Invoke-RestMethod|DownloadString|DownloadFile|Net\.WebClient|Start-BitsTransfer|curl |wget /i.test(t.split('rem #PS-BEGIN#')[1]), 'o .cmd não baixa código da internet')
})

test('as mensagens em português viram [char] e não dependem da página de código', async () => {
  const t = await gerar()
  assert.match(psText(MESSAGES.ok), /^'Pronto: m'\+\[char\]0xE1\+'quina ativada\. Pode fechar\.'$/)
  assert.match(t, /\[char\]0xE1/)
  assert.equal(psText("it's"), "'it''s'")
  assert.equal(psText(''), "''")
  assert.equal(psText('ç'), '[char]0xE7')
})

test('o .cmd recusa dados fora do padrão em vez de injetar na linha de comando', async () => {
  const pkg = await pacoteReal()
  assert.throws(() => buildActivationCmd({ ...bundle, id: '1&calc' }, NOW, pkg))
  assert.throws(() => buildActivationCmd({ ...bundle, id: '536822159\r\nformat c:' }, NOW, pkg))
  assert.throws(() => buildActivationCmd({ ...bundle, bootstrap: 'x"&calc' }, NOW, pkg))
  assert.throws(() => buildActivationCmd(null, NOW, pkg))
  assert.throws(() => buildActivationCmd(bundle, NOW), /Pacote do agente ausente/)
  assert.throws(() => buildActivationCmd(bundle, NOW, { ...pkg, parts: [pkg.parts[0] + '"&calc'] }))
  assert.throws(() => buildActivationCmd(bundle, NOW, { ...pkg, shas: { ...pkg.shas, 'Coordenar-Agente-Nextec.ps1': 'zz' } }))
})

test('os caminhos de saída têm códigos distintos: ativada (0), prazo (3) e reabertura elevada (5)', async () => {
  const t = await gerar()
  assert.match(t, /exit 3/)
  assert.match(t, /exit 5/)
  assert.match(t, /if "%NX_RC%"=="0" \( \(goto\) 2>nul & del \/f \/q "%~f0" \)/)
  for (const k of ['expired', 'notInstalled', 'otherMachine', 'agentKept', 'agentRefused', 'packageInvalid']) assert.ok(MESSAGES[k].length > 10)
  assert.match(MESSAGES.expired, /15 minutos/)
  assert.match(MESSAGES.notInstalled, /não está instalado/)
  assert.match(MESSAGES.otherMachine, /ID/)
})

test('o arquivo gerado traz o pacote em partes de até 7000 caracteres e fica abaixo do limite', async () => {
  const t = await gerar()
  assert.ok(t.length < ACTIVATION_MAX_BYTES, `arquivo com ${t.length} bytes`)
  const pkgLines = t.split('\r\n').filter(l => l.startsWith('rem NXPKG '))
  assert.ok(pkgLines.length >= 2 && pkgLines.every(l => l.length <= 7010), 'partes de até 7000 caracteres')
  for (const n of ['Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1', 'Agente-Senha-Nextec.ps1']) {
    assert.ok(t.includes(`\r\nrem NXSHA ${n} `), n)
  }
  assert.ok(!/rem NXSHA Instalar-Nextec/.test(t), 'o atualizador não é necessário e não entra no pacote')
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

test('o .cmd embute o localizador, instala o agente sozinho e não pede mais outro instalador', async () => {
  const t = await gerar()
  assert.match(t, /function Find-NextecAgent/)
  assert.match(t, /function ConvertTo-NextecPath/)
  assert.match(t, /Find-NextecAgent -DataRoot \$root/)
  assert.match(t, /function Get-NxPackage/)
  assert.match(t, /'-Registrar'/)
  assert.ok(!('appWithoutAgent' in MESSAGES) && !('appUnknown' in MESSAGES), 'não manda mais gerar/instalar outro app')
  assert.match(t, /\[char\]0xE3/)
  assert.match(t, /^[\x00-\x7F]*$/)
})

test('PS 5.1: app Client-Nextec-Connect sem agente é achado pelo registro e diz o que falta', { skip: !PS51 }, () => {
  const d = mkdtempSync(join(realpathSync.native(tmpdir()), 'nxfind-'))
  try {
    const pf = join(d, 'PF'); mkdirSync(join(pf, 'Client-Nextec-Connect'), { recursive: true })
    const out = runFind(`$r = Find-NextecAgent -DataRoot '${join(d, 'PD', 'Nextec', 'Acesso')}' -ProgramRoots @('${pf}') -Entries @() -TaskArgs @() -Services @() -Marker ([pscustomobject]@{InstallDir='${join(pf, 'Client-Nextec-Connect')}';AppName='Client-Nextec-Connect'})
      'script=[' + $r.Script + '] app=[' + $r.App + '] n=' + $r.Searched.Count`)
    assert.match(out, /script=\[\] app=\[Client-Nextec-Connect\] n=2/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: acha o coordenador na pasta fixa, na instalação do app e por varredura de Program Files', { skip: !PS51 }, () => {
  const d = mkdtempSync(join(realpathSync.native(tmpdir()), 'nxfind-'))
  try {
    const data = join(d, 'PD', 'Nextec', 'Acesso'); mkdirSync(data, { recursive: true })
    writeFileSync(join(data, 'Coordenar-Agente-Nextec.ps1'), '#')
    let out = runFind(`(Find-NextecAgent -DataRoot '${data}' -ProgramRoots @() -Entries @() -TaskArgs @() -Marker $nm -Services @()).Script`)
    assert.equal(out, join(data, 'Coordenar-Agente-Nextec.ps1'))

    const app = join(d, 'PF', 'Client-Nextec-Connect'); mkdirSync(app, { recursive: true })
    writeFileSync(join(app, 'Coordenar-Agente-Nextec.ps1'), '#')
    out = runFind(`(Find-NextecAgent -DataRoot '${join(d, 'vazio')}' -ProgramRoots @() -Entries @([pscustomobject]@{DisplayName='Client-Nextec-Connect';InstallLocation='${app}'}) -TaskArgs @() -Marker $nm -Services @()).Script`)
    assert.equal(out, join(app, 'Coordenar-Agente-Nextec.ps1'))

    out = runFind(`(Find-NextecAgent -DataRoot '${join(d, 'vazio')}' -ProgramRoots @('${join(d, 'PF')}') -Entries @() -TaskArgs @() -Marker $nm -Services @()).Script`)
    assert.equal(out, join(app, 'Coordenar-Agente-Nextec.ps1'))

    out = runFind(`(Find-NextecAgent -DataRoot '${join(d, 'vazio')}' -ProgramRoots @() -Entries @() -TaskArgs @('-NoProfile -File "${join(app, 'Outro.ps1')}" -Executar') -Marker $nm -Services @()).Script`)
    assert.equal(out, join(app, 'Coordenar-Agente-Nextec.ps1'))
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// --- nome livre: qualquer nome de app (XPTO, Nextec-Connect, Client-Nextec-Connect) é achado pelo marcador e por pistas não nominais ---
for (const appName of ['XPTO', 'Nextec-Connect', 'Client-Nextec-Connect']) {
  test(`PS 5.1: app "${appName}" é achado por marcador (registro/arquivo), entrada, serviço e varredura`, { skip: !PS51 }, () => {
    const d = mkdtempSync(join(realpathSync.native(tmpdir()), 'nxfind-'))
    try {
      const vazio = join(d, 'vazio')
      const app = join(d, 'PF', appName); mkdirSync(app, { recursive: true })
      writeFileSync(join(app, 'Coordenar-Agente-Nextec.ps1'), '#')
      const want = join(app, 'Coordenar-Agente-Nextec.ps1')
      // 1) marcador (InstallDir + AppName), sem qualquer outra pista
      let out = runFind(`$r = Find-NextecAgent -DataRoot '${vazio}' -ProgramRoots @() -Entries @() -TaskArgs @() -Services @() -Marker ([pscustomobject]@{InstallDir='${app}';AppName='${appName}'})
        $r.Script + '|' + $r.App`)
      assert.equal(out, `${want}|${appName}`)
      // 2) marcador em arquivo nextec-marker.json (chaves AppName/InstallDir e app_name/install_dir)
      const data = join(d, 'PD'); mkdirSync(data, { recursive: true })
      writeFileSync(join(data, 'nextec-marker.json'), JSON.stringify({ app_name: appName, install_dir: app }))
      out = runFind(`$r = Find-NextecAgent -DataRoot '${data}' -ProgramRoots @() -Entries @() -TaskArgs @() -Services @() -MarkerFile '${join(data, 'nextec-marker.json')}'
        $r.Script + '|' + $r.App`)
      assert.equal(out, `${want}|${appName}`)
      // 3) entrada de desinstalação com DisplayName qualquer (só a presença do script conta)
      out = runFind(`(Find-NextecAgent -DataRoot '${vazio}' -ProgramRoots @() -Entries @([pscustomobject]@{DisplayName='Qualquer Coisa';InstallLocation='${app}'}) -TaskArgs @() -Marker $nm -Services @()).Script`)
      assert.equal(out, want)
      // 4) serviço RustDesk (--service) cujo exe vizinho tem o coordenador
      out = runFind(`$r = Find-NextecAgent -DataRoot '${vazio}' -ProgramRoots @() -Entries @() -TaskArgs @() -Marker $nm -Services @([pscustomobject]@{Name='${appName}';PathName='"${join(app, appName + '.exe')}" --service'})
        $r.Script + '|' + $r.App`)
      assert.equal(out, `${want}|${appName}`)
      // 5) varredura limitada de Program Files, sem 'Nextec' obrigatório no nome
      out = runFind(`(Find-NextecAgent -DataRoot '${vazio}' -ProgramRoots @('${join(d, 'PF')}') -Entries @() -TaskArgs @() -Marker $nm -Services @()).Script`)
      assert.equal(out, want)
      // 6) nada encontrado: a mensagem do .cmd lista o que foi procurado
      out = runFind(`$r = Find-NextecAgent -DataRoot '${vazio}' -ProgramRoots @('${join(d, 'nada')}') -Entries @() -TaskArgs @() -Marker $nm -Services @()
        'script=[' + $r.Script + '] n=' + $r.Searched.Count`)
      assert.match(out, /script=\[\] n=1/)
    } finally { rmSync(d, { recursive: true, force: true }) }
  })
}
