// Regressão do Ativar-Nextec-<ID>.cmd com dados do mundo real (bug em produção: InstallLocation entre aspas
// derrubava o script com "Cannot find drive '"C'"). Roda o PowerShell GERADO, não só o JS:
//  - parse do bloco PowerShell embutido (Parser::ParseInput sem erros) no 5.1 (Windows) ou no pwsh (Linux do CI);
//  - Find-NextecAgent alimentado com uma tabela de entradas sujas (registro, marcador, serviços, tarefas, Program Files);
//  - Find-NextecAgent lendo os dados reais desta máquina (só leitura) sem exceção;
//  - fumaça do .cmd completo (bloco #PS-BEGIN#) com caminhos temporários: termina com mensagem clara, nunca com exceção.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildActivationCmd, FIND_AGENT_PS } from '../../src/nextec/activation-cmd.mjs'

const AGENT = 'Coordenar-Agente-Nextec.ps1'
const PS51 = process.platform === 'win32' ? 'powershell.exe' : null
const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0
const PARSER = PS51 || (hasPwsh ? 'pwsh' : null)
// bootstrap fictício só para montar o arquivo de teste (não é código real)
const bundle = { painel: 'https://painel.exemplo.com.br', id: '536822159', uuid: 'abc-123', bootstrap: 'B'.repeat(43) }

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'"
const tmp = () => mkdtempSync(join(realpathSync.native(tmpdir()), 'nxreal-'))

function runPs(exe, script, env = {}) {
  return spawnSync(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000,
  })
}

// Executa Find-NextecAgent e devolve {Script, App, AppPath, Searched[]} (JSON em base64 para não depender da página de código).
function find(args, env = {}) {
  const script = `${FIND_AGENT_PS}
$ErrorActionPreference = 'Stop'
$r = Find-NextecAgent ${args}
$o = [pscustomobject]@{ Script = [string]$r.Script; App = [string]$r.App; AppPath = [string]$r.AppPath; Searched = @($r.Searched | ForEach-Object { [string]$_ }) }
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($o | ConvertTo-Json -Compress -Depth 3)))
`
  const r = runPs(PS51, script, env)
  assert.equal(r.status, 0, `PowerShell terminou com erro:\n${r.stderr}\n${r.stdout}`)
  assert.equal(r.stderr.trim(), '', `saída de erro inesperada:\n${r.stderr}`)
  const o = JSON.parse(Buffer.from(r.stdout.trim().split(/\r?\n/).pop(), 'base64').toString('utf8'))
  o.Searched = [].concat(o.Searched || [])
  return o
}

const psObj = (o) => '[pscustomobject]@{' + Object.entries(o).map(([k, v]) => `${k}=${v === null ? '$null' : q(v)}`).join(';') + '}'
const psArr = (items) => '@(' + items.map(psObj).join(',') + ')'
const ignored = (o) => o.Searched.filter((s) => s.startsWith('ignorado: '))

// ---------- 1) o PowerShell embutido passa no parser ----------
test('o PowerShell embutido no .cmd passa no Parser::ParseInput sem erros', { skip: !PARSER }, () => {
  const t = buildActivationCmd(bundle, Date.now())
  const ps = t.slice(t.indexOf('#PS-BEGIN#'))
  const d = tmp()
  try {
    for (const [nome, texto] of [['bloco.ps1', ps], ['localizador.ps1', FIND_AGENT_PS]]) {
      const f = join(d, nome); writeFileSync(f, texto, 'utf8')
      const r = runPs(PARSER, `$e = $null; [void][Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText(${q(f)}), [ref]$null, [ref]$e); 'erros=' + @($e).Count; foreach ($x in @($e)) { $x.Extent.StartLineNumber.ToString() + ': ' + $x.Message }`)
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /erros=0/, `${nome}:\n${r.stdout}`)
    }
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// ---------- 2) tabela de entradas sujas reais ----------
test('PS 5.1: InstallLocation sujo do registro nunca derruba a busca e o agente válido é achado', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const vazio = join(d, 'vazio')
    const app = join(d, 'PF', 'Nextec Conexão Cliente'); mkdirSync(app, { recursive: true })
    writeFileSync(join(app, AGENT), '#')
    const want = join(app, AGENT)
    const base = `-DataRoot ${q(vazio)} -ProgramRoots @() -TaskArgs @() -Services @() -Marker ([pscustomobject]@{InstallDir='';AppName=''})`
    // [valor de InstallLocation, acha o agente?, quantos "ignorado"]
    const casos = [
      [`"${app}\\"`, true, 0], // aspas + barra final (o caso de produção)
      [`"${app}"`, true, 0], // só aspas
      [`  "${app}\\\\"  `, true, 0], // espaços, aspas e barra final duplicada
      [`${app}\\\\`, true, 0], // barra final duplicada
      ['%NX_TESTE_PF%\\Nextec Conexão Cliente', true, 0], // variável de ambiente
      ['', false, 0], // vazio: não é pista, nem conta como ignorado
      ['    ', false, 0], // só espaços
      ['Q:\\x', false, 0], // drive inexistente: formato válido, só não existe
      ['"Q:\\x\\"', false, 0],
      ['\\\\srv-nao-existe.invalid\\x', false, 1], // UNC
      ['C:\\a<b', false, 1], // caractere inválido
      ['C:\\a|b\\"', false, 1],
      ['%NX_NAO_DEFINIDA_123%\\x', false, 1], // variável sem valor
      ['Program Files\\X', false, 1], // relativo
      ['C:\\x\\a:b', false, 1], // dois-pontos fora do drive
    ]
    for (const [loc, acha, nIgn] of casos) {
      const o = find(`${base} -Entries ${psArr([{ DisplayName: 'Qualquer', InstallLocation: loc }])}`, { NX_TESTE_PF: join(d, 'PF') })
      assert.equal(o.Script, acha ? want : '', `InstallLocation=[${loc}]`)
      assert.equal(ignored(o).length, nIgn, `InstallLocation=[${loc}] Searched=${JSON.stringify(o.Searched)}`)
    }
    // entrada sem a propriedade InstallLocation e entrada nula
    let o = find(`${base} -Entries @([pscustomobject]@{DisplayName='Sem local'}, $null)`)
    assert.equal(o.Script, '')
    // o agente válido vem DEPOIS de várias entradas ruins: tem de ser achado
    o = find(`${base} -Entries ${psArr([
      { DisplayName: 'A', InstallLocation: '"Q:\\x\\"' },
      { DisplayName: 'B', InstallLocation: '\\\\srv\\x' },
      { DisplayName: 'C', InstallLocation: 'C:\\a<b' },
      { DisplayName: 'D', InstallLocation: '' },
      { DisplayName: 'E', InstallLocation: '   ' },
      { DisplayName: 'F', InstallLocation: null },
      { DisplayName: 'G', InstallLocation: '%NX_NAO_DEFINIDA_123%\\x' },
      { DisplayName: 'Nextec Conexão Cliente', InstallLocation: `"${app}\\"` },
    ])}`)
    assert.equal(o.Script, want)
    assert.equal(o.App, 'Nextec Conexão Cliente')
    assert.equal(o.AppPath, app, 'AppPath sem aspas nem barra final')
    assert.equal(ignored(o).length, 3, JSON.stringify(o.Searched))
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: marcador (registro e nextec-marker.json) com caminho sujo ou JSON quebrado não derruba a busca', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const vazio = join(d, 'vazio')
    const app = join(d, 'PF', 'Meu App'); mkdirSync(app, { recursive: true })
    writeFileSync(join(app, AGENT), '#')
    const want = join(app, AGENT)
    const rest = '-ProgramRoots @() -Entries @() -TaskArgs @() -Services @()'
    let o = find(`-DataRoot ${q(vazio)} ${rest} -Marker ([pscustomobject]@{InstallDir=${q(`"${app}\\"`)};AppName='Meu App'})`)
    assert.equal(o.Script, want)
    assert.equal(o.AppPath, app)
    o = find(`-DataRoot ${q(vazio)} ${rest} -Marker ([pscustomobject]@{InstallDir='"Q:\\x\\"';AppName='Meu App'})`)
    assert.equal(o.Script, '')
    assert.equal(o.App, 'Meu App')
    o = find(`-DataRoot ${q(vazio)} ${rest} -Marker ([pscustomobject]@{InstallDir='\\\\srv\\x';AppName=''})`)
    assert.equal(ignored(o).length, 1)
    // arquivo de marcador com aspas no caminho e outro com JSON inválido
    const pd = join(d, 'PD'); mkdirSync(pd, { recursive: true })
    writeFileSync(join(pd, 'm1.json'), JSON.stringify({ app_name: 'Meu App', install_dir: `"${app}\\"` }))
    o = find(`-DataRoot ${q(pd)} ${rest} -MarkerFile ${q(join(pd, 'm1.json'))}`)
    assert.equal(o.Script, want)
    writeFileSync(join(pd, 'm2.json'), '{ isto não é json')
    o = find(`-DataRoot ${q(pd)} ${rest} -MarkerFile ${q(join(pd, 'm2.json'))}`)
    assert.equal(o.Script, '')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: PathName de serviço e argumentos de tarefa estranhos não derrubam a busca', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const vazio = join(d, 'vazio')
    const app = join(d, 'PF', 'X y Conexão'); mkdirSync(app, { recursive: true })
    writeFileSync(join(app, AGENT), '#')
    const want = join(app, AGENT)
    const base = `-DataRoot ${q(vazio)} -ProgramRoots @() -Entries @() -Marker ([pscustomobject]@{InstallDir='';AppName=''})`
    const svc = (pn) => find(`${base} -TaskArgs @() -Services @([pscustomobject]@{Name='Svc';PathName=${pn === null ? '$null' : q(pn)}})`)
    // sem aspas, com espaços no caminho
    assert.equal(svc(`${join(app, 'app.exe')} --service`).Script, want)
    // com aspas e argumentos depois
    assert.equal(svc(`"${join(app, 'app.EXE')}" --service --outro "a b"`).Script, want)
    // ruins: drive inexistente, caractere inválido, UNC, sem .exe, nulo
    for (const pn of ['"Q:\\x\\app.exe" --service', '"C:\\a<b\\app.exe" --service', '"\\\\srv\\x\\app.exe" --service', 'rundll32 --service', null]) {
      const o = svc(pn)
      assert.equal(o.Script, '', `PathName=[${pn}]`)
    }
    assert.equal(ignored(svc('"\\\\srv\\x\\app.exe" --service')).length, 1)
    const task = (a) => find(`${base} -Services @() -TaskArgs @(${a.map(q).join(',')})`)
    // -File com aspas e espaços (o caso real), aspas simples e minúsculas, sem aspas com espaços
    assert.equal(task([`-NoProfile -ExecutionPolicy Bypass -File "${want}" -Executar`]).Script, want)
    assert.equal(task([`-NoProfile -file '${join(app, 'Outro.ps1')}'`]).Script, want)
    assert.equal(task([`-File ${join(app, 'Outro.ps1')} -Executar`]).Script, want)
    // ruins antes do válido
    const o = task(['-File "Q:\\x\\a.ps1"', '-File "C:\\a<b\\a.ps1"', '-File "\\\\srv\\x\\a.ps1"', '', '-Command x', `-File "${want}"`])
    assert.equal(o.Script, want)
    assert.equal(ignored(o).length, 2, JSON.stringify(o.Searched))
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: Program Files ausente, nulo, entre aspas ou inexistente não derruba a varredura', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const pf = join(d, 'Program Files'); const app = join(pf, 'Conexão App', 'bin'); mkdirSync(app, { recursive: true })
    writeFileSync(join(app, AGENT), '#')
    const base = `-DataRoot ${q(join(d, 'vazio'))} -Entries @() -TaskArgs @() -Services @() -Marker ([pscustomobject]@{InstallDir='';AppName=''})`
    const o = find(`${base} -ProgramRoots @($null, '', '   ', 'Q:\\x', '\\\\srv\\x', ${q(`"${pf}\\"`)})`)
    assert.equal(o.Script, join(app, AGENT))
    assert.equal(o.App, 'Conexão App')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// ---------- app instalado SEM o agente (caso real: C:\Program Files\Client-Nextec-Connect e Suporte Nextec) ----------
test('PS 5.1: app instalado sem o agente é reconhecido (registro, serviço, varredura) e preenche App/AppPath', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const pf = join(d, 'Program Files')
    const cli = join(pf, 'Client-Nextec-Connect'); mkdirSync(cli, { recursive: true })
    writeFileSync(join(cli, 'librustdesk.dll'), ''); writeFileSync(join(cli, 'Client-Nextec-Connect.exe'), '')
    const sup = join(pf, 'Suporte Nextec'); mkdirSync(sup, { recursive: true })
    writeFileSync(join(sup, 'librustdesk.dll'), '')
    mkdirSync(join(pf, 'Outro Programa'), { recursive: true }) // sem RustDesk: não é app Nextec
    const base = `-DataRoot ${q(join(d, 'vazio'))} -TaskArgs @() -Marker ([pscustomobject]@{InstallDir='';AppName=''})`
    // 1) só varredura: os dois apps com RustDesk são listados, o outro programa não
    let o = find(`${base} -ProgramRoots @(${q(pf)}) -Entries @() -Services @()`)
    assert.equal(o.Script, '')
    assert.equal(o.App, 'Client-Nextec-Connect ou Suporte Nextec')
    assert.equal(o.AppPath, cli)
    // 2) serviço --service cujo exe existe: só ele (o app de suporte avulso não instala serviço)
    o = find(`${base} -ProgramRoots @(${q(pf)}) -Entries @() -Services @([pscustomobject]@{Name='Client-Nextec-Connect';PathName=${q(`"${join(cli, 'Client-Nextec-Connect.exe')}" --service`)}})`)
    assert.equal(o.App, 'Client-Nextec-Connect')
    assert.equal(o.AppPath, cli)
    // 3) entrada de desinstalação com InstallLocation entre aspas e barra final
    o = find(`${base} -ProgramRoots @() -Services @() -Entries ${psArr([{ DisplayName: 'Client-Nextec-Connect', InstallLocation: `"${cli}\\"` }])}`)
    assert.equal(o.App, 'Client-Nextec-Connect')
    assert.equal(o.AppPath, cli)
    // 4) serviço de outro programa (exe inexistente) não vira app
    o = find(`${base} -ProgramRoots @() -Entries @() -Services @([pscustomobject]@{Name='X';PathName='"C:\\nao\\existe\\x.exe" --service'})`)
    assert.equal(o.App, '')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: Searched não repete caminhos (registro 64/32 bits, serviço e varredura apontando para a mesma pasta)', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const pf = join(d, 'PF'); const app = join(pf, 'App X'); mkdirSync(app, { recursive: true })
    const o = find(`-DataRoot ${q(join(d, 'vazio'))} -TaskArgs @('-File "${join(app, 'a.ps1')}"') -Marker ([pscustomobject]@{InstallDir=${q(app)};AppName=''}) -ProgramRoots @(${q(pf)}, ${q(pf + '\\')}) -Services @([pscustomobject]@{Name='S';PathName=${q(`"${join(app, 'x.exe')}" --service`)}}) -Entries ${psArr([
      { DisplayName: 'App X', InstallLocation: app },
      { DisplayName: 'App X', InstallLocation: `"${app}\\"` },
      { DisplayName: 'App X (x86)', InstallLocation: `${app.toUpperCase()}\\\\` },
    ])}`)
    const lower = o.Searched.map((s) => s.toLowerCase())
    assert.equal(new Set(lower).size, lower.length, JSON.stringify(o.Searched))
    assert.deepEqual(o.Searched, [join(d, 'vazio', AGENT), join(app, AGENT)])
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// ---------- 3) dados reais desta máquina (só leitura) ----------
test('PS 5.1: com os dados reais da máquina (registro, serviços, tarefas, Program Files) a busca termina sem exceção', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map(q).join(',')
    const o = find(`-DataRoot ${q(join(d, 'vazio'))} -ProgramRoots @(${pf}) -MarkerFile ${q(join(d, 'nao-existe.json'))}`)
    assert.ok(o.Searched.length >= 1)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// ---------- 4) fumaça do .cmd completo ----------
// Executa o bloco #PS-BEGIN# como o próprio .cmd faz, trocando só o necessário para não tocar na máquina:
// administrador simulado, pasta de dados temporária e fontes de busca injetadas (sujas).
function smoke(d, { dropNxid = false, services = null } = {}) {
  let t = buildActivationCmd(bundle, Date.now())
  if (dropNxid) t = t.replace(/rem NXID \d+\r\n/, '')
  const cmdFile = join(d, 'Ativar-Nextec-536822159.cmd'); writeFileSync(cmdFile, t, 'latin1')
  const pfDir = join(d, 'PF'); mkdirSync(join(pfDir, 'Outro App'), { recursive: true })
  let ps = t.slice(t.indexOf('#PS-BEGIN#'))
  const swaps = [
    [/^\$admin = .*$/m, '$admin = $true'],
    [/^\$root = .*$/m, `$root = ${q(join(d, 'PD', 'Nextec', 'Acesso'))}`],
    [/^\$pf = .*$/m, `$pf = @($null, '', '"Q:\\x"', ${q(pfDir)})`],
    [/-ProgramRoots \$pf\b/, `-ProgramRoots $pf -Entries ${psArr([
      { DisplayName: 'A', InstallLocation: '"C:\\Program Files\\X\\"' },
      { DisplayName: 'B', InstallLocation: '"Q:\\x\\"' },
      { DisplayName: 'C', InstallLocation: '\\\\srv\\x' },
      { DisplayName: 'D', InstallLocation: 'C:\\a<b' },
      { DisplayName: 'E', InstallLocation: '%NX_NAO_DEFINIDA_123%\\x' },
    ])} -Services ${services || `@([pscustomobject]@{Name='S';PathName='"C:\\a<b\\x.exe" --service'})`} -TaskArgs @('-File "Q:\\x y\\Coordenar-Agente-Nextec.ps1"') -Marker ([pscustomobject]@{InstallDir='"Q:\\x\\"';AppName=''})`],
  ]
  for (const [re, val] of swaps) {
    assert.match(ps, re, `trecho esperado no .cmd: ${re}`)
    ps = ps.replace(re, () => val)
  }
  const psFile = join(d, 'bloco.txt'); writeFileSync(psFile, ps, 'utf8')
  return runPs(PS51, "$t=[IO.File]::ReadAllText($env:NX_BLOCO); & ([scriptblock]::Create($t))", { NX_SELF: cmdFile, NX_BLOCO: psFile })
}

const LOG = 'Ativar-Nextec-536822159-busca.log'
const semExcecao = (r) => {
  assert.equal(r.stderr.trim(), '', `exceção não tratada:\n${r.stderr}`)
  assert.doesNotMatch(r.stdout, /Exception|CategoryInfo|Cannot find drive|FullyQualifiedErrorId/)
  assert.ok(!r.stdout.includes('B'.repeat(43)), 'o código nunca aparece na saída')
}

test('PS 5.1: fumaça do .cmd com dados sujos termina com "não encontrado", lista curta na tela e completa no arquivo', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const r = smoke(d)
    assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`)
    semExcecao(r)
    const linha = r.stdout.slice(r.stdout.indexOf('Procurei em: '))
    assert.match(linha, /Procurei em: /)
    const mostrados = linha.slice('Procurei em: '.length).split(/ e outros \d+\./)[0].split('; ')
    assert.ok(mostrados.length <= 5, `no máximo 5 caminhos na tela: ${linha}`)
    assert.match(linha, / e outros \d+\./)
    assert.ok(r.stdout.includes('Lista completa em: ' + join(d, LOG)), r.stdout)
    const log = readFileSync(join(d, LOG), 'utf8')
    assert.match(log, /ignorado: .*caminho de rede/)
    assert.match(log, /ignorado: .*caractere proibido/)
    assert.ok(!log.includes('B'.repeat(43)) && !log.includes('NXDATA'), 'o log não leva o código')
    const linhas = log.trim().split(/\r?\n/).slice(3)
    assert.equal(new Set(linhas.map((x) => x.toLowerCase())).size, linhas.length, 'sem repetição no log')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: fumaça do caso do servidor: Client-Nextec-Connect e Suporte Nextec sem agente pedem o MESMO nome do app', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const pf = join(d, 'PF')
    const cli = join(pf, 'Client-Nextec-Connect'); mkdirSync(cli, { recursive: true })
    writeFileSync(join(cli, 'librustdesk.dll'), ''); writeFileSync(join(cli, 'Client-Nextec-Connect.exe'), '')
    const sup = join(pf, 'Suporte Nextec'); mkdirSync(sup, { recursive: true }); writeFileSync(join(sup, 'librustdesk.dll'), '')
    let r = smoke(d, { services: `@([pscustomobject]@{Name='Client-Nextec-Connect';PathName=${q(`"${join(cli, 'Client-Nextec-Connect.exe')}" --service`)}})` })
    assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`)
    semExcecao(r)
    assert.match(r.stdout, /MESMO nome do app \(Client-Nextec-Connect\)/)
    // sem serviço: lista os dois
    r = smoke(d, { services: '@()' })
    semExcecao(r)
    assert.match(r.stdout, /MESMO nome do app \(Client-Nextec-Connect ou Suporte Nextec\)/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1: fumaça do .cmd com arquivo corrompido (sem NXID) mostra falha clara, sem exceção', { skip: !PS51 }, () => {
  const d = tmp()
  try {
    const r = smoke(d, { dropNxid: true })
    assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`)
    assert.equal(r.stderr.trim(), '', `exceção não tratada:\n${r.stderr}`)
    assert.doesNotMatch(r.stdout, /Exception|CategoryInfo|FullyQualifiedErrorId/)
    assert.match(r.stdout, /Gere uma nova autoriza/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})
