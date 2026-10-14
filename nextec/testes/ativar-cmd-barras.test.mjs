// Regressão do 2.11.19: barras invertidas perdidas no PowerShell que o gerador monta.
// Bug real (servidor): em strings JS comuns o JS lê "\A" como "A", "\W" como "W", "\v" como TAB e "\p" como "p". O
// .cmd saía com 'NextecAcesso' (pasta errada) e 'System32WindowsPowerShell<TAB>1.0powershell.exe' (sem PowerShell).
// Os testes antigos passavam porque trocavam a linha do $root ou usavam doubles; aqui o .cmd é gerado pela função
// pública, SEM override NXROOT, e conferido no texto, na fonte e na execução (PowerShell 5.1) com variáveis de ambiente.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync, mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildActivationCmd, FIND_AGENT_PS, INSTALL_AGENT_PS } from '../../src/nextec/activation-cmd.mjs'
import { pacoteReal } from './pacote-agente.mjs'

const PS51 = process.platform === 'win32' ? 'powershell.exe' : null
const skip = !PS51
const bundle = { painel: 'https://painel-remoto.nex.tec.br', id: '536822159', uuid: 'abc-123', bootstrap: 'A'.repeat(43) }
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const gerar = async (now = NOW) => buildActivationCmd(bundle, now, await pacoteReal())
const MARCA = '#PS-BEGIN#'
const barras = (s) => (s.match(/\\/g) || []).length

// Oráculo: os literais de caminho do orquestrador, escritos com String.raw (a barra invertida é só uma barra invertida).
const LITERAIS = [
  String.raw`'\ProgramData'`,
  String.raw`'Nextec\Acesso'`,
  String.raw`'System32\WindowsPowerShell\v1.0\powershell.exe'`,
]
const LINHAS_ORACULO = [
  String.raw`$pd = [string]$env:ProgramData; if (-not $pd.Trim()) { $pd = [string]$env:SystemDrive + '\ProgramData' }`,
  String.raw`$root = [IO.Path]::Combine($pd, 'Nextec\Acesso')`,
  String.raw`$psexe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'`,
]

// ---------- (a) texto gerado ----------
test('(a) o .cmd gerado traz os caminhos com barra invertida e nenhum caractere de controle', async () => {
  const t = await gerar()
  assert.ok(!/^rem NXROOT /m.test(t), 'sem override NXROOT: o teste cobre o caminho padrão')
  for (const lit of LITERAIS) assert.ok(t.includes(lit), `literal ausente ou corrompido: ${lit}`)
  for (const linha of LINHAS_ORACULO) assert.ok(t.includes('\r\n' + linha + '\r\n'), `linha ausente ou corrompida: ${linha}`)
  assert.ok(t.includes(String.raw`System32\WindowsPowerShell\v1.0\powershell.exe`))
  assert.ok(!/NextecAcesso/.test(t), 'a pasta de dados nunca é NextecAcesso')
  assert.ok(!/System32WindowsPowerShell/.test(t))
  const ruim = t.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/)
  assert.equal(ruim, null, `caractere de controle 0x${ruim ? ruim[0].charCodeAt(0).toString(16) : ''} no arquivo`)
})

// ---------- (b) lint: barras do texto gerado = barras do oráculo ----------
test('(b) lint do texto gerado: mesmas barras invertidas e mesmos caminhos do oráculo String.raw', async () => {
  const t = await gerar()
  const i = t.indexOf(MARCA)
  assert.ok(i > 0)
  assert.equal(barras(t.slice(0, i)), 0, 'o cabeçalho do .cmd (e o pacote base64) não tem barra invertida')
  const ps = t.slice(i)
  // o bloco inteiro de FIND e INSTALL entra byte a byte
  for (const [nome, bloco] of [['FIND_AGENT_PS', FIND_AGENT_PS], ['INSTALL_AGENT_PS', INSTALL_AGENT_PS]]) {
    assert.ok(ps.includes(bloco.split('\n').join('\r\n')), `${nome} alterado na montagem`)
  }
  const esperado = barras(FIND_AGENT_PS) + barras(INSTALL_AGENT_PS) + LITERAIS.reduce((n, s) => n + barras(s), 0)
  assert.equal(barras(ps), esperado, 'barras invertidas perdidas (ou sobrando) no PowerShell gerado')
  // cada literal de caminho X:\... ou \Nextec... do oráculo existe, na mesma quantidade
  const caminhos = (s) => (s.match(/[A-Za-z]:\\[^\s'"]*|\\Nextec[^\s'"]*/g) || []).sort()
  assert.deepEqual(caminhos(ps), caminhos(FIND_AGENT_PS + '\n' + INSTALL_AGENT_PS + '\n' + LITERAIS.join('\n')))
})

// Fonte: nenhuma sequência de escape "inútil" (\A \W \v \p ...) em string JS comum dos módulos do painel. Em String.raw e
// em regex a barra é literal e fica fora da checagem. Se alguém voltar a escrever '\ProgramData' sem String.raw, falha aqui.
const PERMITIDOS = new Set(['\\', "'", '"', 'n', 'r', 't', 'u', 'x', '`', '$', '\n'])
function escapesSuspeitos(src) {
  const ruins = []
  let i = 0
  const linha = (p) => src.slice(0, p).split('\n').length
  const checa = (c) => { if (!PERMITIDOS.has(c)) ruins.push(`linha ${linha(i)}: \\${c === '\r' ? 'CR' : c}`) }
  const str = (q) => {
    i++
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') { checa(src[i + 1]); i += 2; continue }
      i++
    }
    i++
  }
  const modelo = (cru) => {
    i++
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { if (!cru) checa(src[i + 1]); i += 2; continue }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; codigo(true); continue }
      i++
    }
    i++
  }
  const regex = () => {
    i++
    let classe = false
    while (i < src.length) {
      const c = src[i]
      if (c === '\\') { i += 2; continue }
      if (c === '[') classe = true
      else if (c === ']') classe = false
      else if (c === '/' && !classe) { i++; break }
      i++
    }
    while (/[a-z]/i.test(src[i] || '')) i++
  }
  function codigo(emModelo) {
    let prof = 0
    let prev = ''
    while (i < src.length) {
      const c = src[i]
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue }
      if (c === "'" || c === '"') { str(c); prev = 'x'; continue }
      if (c === '`') { modelo(/String\.raw$/.test(src.slice(Math.max(0, i - 10), i))); prev = 'x'; continue }
      if (c === '/') {
        const palavra = /(?:return|typeof|case|in|of)\s*$/.test(src.slice(Math.max(0, i - 8), i))
        if (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || palavra) { regex(); prev = 'x'; continue }
      }
      if (c === '{') prof++
      if (c === '}') { if (emModelo && prof === 0) { i++; return } prof-- }
      if (!/\s/.test(c)) prev = c
      i++
    }
  }
  codigo(false)
  return ruins
}

test('(b) lint da fonte: nenhuma barra invertida perdida em string JS comum dos módulos do painel', () => {
  const pasta = new URL('../../src/nextec/', import.meta.url)
  const arquivos = readdirSync(pasta).filter(f => /\.(mjs|js)$/.test(f))
  assert.ok(arquivos.includes('activation-cmd.mjs'))
  const falhas = []
  for (const f of arquivos) {
    for (const r of escapesSuspeitos(readFileSync(new URL(f, pasta), 'utf8'))) falhas.push(`src/nextec/${f} ${r}`)
  }
  const plugin = readFileSync(new URL('../../vite-plugin-agent-package.mjs', import.meta.url), 'utf8')
  for (const r of escapesSuspeitos(plugin)) falhas.push(`vite-plugin-agent-package.mjs ${r}`)
  assert.deepEqual(falhas, [], 'use String.raw ou \\\\ nestes literais')
})

test('(b) o próprio lint enxerga o bug: "\\ProgramData" em string comum é recusado e String.raw é aceito', () => {
  assert.ok(escapesSuspeitos(String.raw`const a = '\ProgramData'`).length > 0)
  assert.ok(escapesSuspeitos(String.raw`const a = "Nextec\Acesso"`).length > 0)
  assert.ok(escapesSuspeitos(String.raw`const a = 'System32\WindowsPowerShell\v1.0'`).length >= 2)
  assert.deepEqual(escapesSuspeitos(String.raw`const a = String.raw` + '`Nextec\\Acesso`' + String.raw`; const b = 'x\\y'; const c = /\d+\.\w/.test(a)`), [])
})

// ---------- (c) execução no Windows PowerShell 5.1, sem NXROOT ----------
// Roda o bloco #PS-BEGIN# do .cmd gerado como o próprio .cmd faz. Só duas trocas, ambas fora do que se quer provar:
// $admin (não reabrir por UAC) e a linha $pf, onde o bloco para depois de definir $root, $psexe e $run (o que se
// mede). Tudo antes dela é o código gerado, sem alteração. ProgramData, SystemRoot e SystemDrive vêm do ambiente; as
// três são ajustadas dentro do processo (com SystemRoot falso o próprio Windows PowerShell nem inicia).
const PROLOGO = String.raw`Import-Module Microsoft.PowerShell.Utility, Microsoft.PowerShell.Management, Microsoft.PowerShell.Security
foreach ($k in 'ProgramData', 'SystemRoot', 'SystemDrive') {
  $v = [Environment]::GetEnvironmentVariable('NXT_' + $k)
  if ($null -ne $v) { [Environment]::SetEnvironmentVariable($k, $(if ($v -eq '<remover>') { $null } else { $v })) }
}
$t = [IO.File]::ReadAllText($env:NX_BLOCO); & ([scriptblock]::Create($t))`
const SAIDA = String.raw`
$filho = [IO.Path]::Combine($env:NX_TMP, 'filho.ps1')
[IO.File]::WriteAllText($filho, 'Write-Output ''FILHO-OK''; exit 7')
$code = -1; $out = ''
try { $r = & $run $filho @(); $code = [int]$r.Code; $out = ([string]$r.Out).Trim() } catch { $out = 'excecao: ' + $_.Exception.Message }
Write-Output ('NXK:root=' + [string]$root)
Write-Output ('NXK:psexe=' + [string]$psexe)
Write-Output ('NXK:existe=' + [IO.File]::Exists([string]$psexe))
Write-Output ('NXK:code=' + $code)
Write-Output ('NXK:out=' + ($out -replace '\s+', ' '))
exit 0`

async function rodar(d, env) {
  const t = await gerar(Date.now())   // o prazo de 15 minutos é conferido no relógio de verdade
  assert.ok(!/^rem NXROOT /m.test(t))
  const cmdFile = join(d, 'Ativar-Nextec-536822159.cmd')
  writeFileSync(cmdFile, t, 'latin1')
  let ps = t.slice(t.indexOf(MARCA))
  for (const [re, val] of [[/^\$admin = .*$/m, '$admin = $true'], [/^\$pf = .*$/m, SAIDA]]) {
    assert.match(ps, re, `trecho esperado no .cmd: ${re}`)
    ps = ps.replace(re, () => val)
  }
  const arq = join(d, 'bloco.txt')
  writeFileSync(arq, ps, 'utf8')
  const nxt = {}
  for (const [k, v] of Object.entries(env)) nxt['NXT_' + k] = v === '' ? '<remover>' : v
  const r = spawnSync(PS51, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', PROLOGO], {
    encoding: 'utf8',
    env: { ...process.env, ...nxt, NX_SELF: cmdFile, NX_BLOCO: arq, NX_TMP: d },
  })
  const o = {}
  for (const l of r.stdout.split(/\r?\n/)) { const m = l.match(/^NXK:(\w+)=(.*)$/); if (m) o[m[1]] = m[2] }
  assert.ok('root' in o, `sem saída do bloco:\n${r.stdout}\n${r.stderr}`)
  return { root: o.root, psexe: o.psexe, psexeExiste: o.existe === 'True', runCode: Number(o.code), runOut: o.out }
}

const tmp = () => mkdtempSync(join(realpathSync.native(tmpdir()), 'nxbarras-'))
const SYSROOT = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows'
const PSEXE_REAL = join(SYSROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

test('PS 5.1 (c): sem NXROOT a raiz é <ProgramData>\\Nextec\\Acesso e o powershell.exe resolvido existe e roda', { skip }, async () => {
  const d = tmp()
  try {
    const pd = join(d, 'PD'); mkdirSync(pd)
    const o = await rodar(d, { ProgramData: pd, SystemRoot: SYSROOT })
    assert.equal(o.root, join(pd, 'Nextec', 'Acesso'))
    assert.notEqual(o.root, join(pd, 'NextecAcesso'))
    assert.equal(o.psexe, PSEXE_REAL)
    assert.equal(o.psexeExiste, true, `não existe: ${o.psexe}`)
    assert.equal(o.runCode, 7, o.runOut)
    assert.match(o.runOut, /FILHO-OK/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1 (c): SystemRoot e ProgramData temporários: o executável vem de <SystemRoot>\\System32\\WindowsPowerShell\\v1.0', { skip }, async () => {
  const d = tmp()
  try {
    const pd = join(d, 'Dados com espaco'); mkdirSync(pd)
    const dir = join(d, 'Win', 'System32', 'WindowsPowerShell', 'v1.0'); mkdirSync(dir, { recursive: true })
    const copia = join(dir, 'powershell.exe')
    copyFileSync(PSEXE_REAL, copia)
    const o = await rodar(d, { ProgramData: pd, SystemRoot: join(d, 'Win') })
    assert.equal(o.root, join(pd, 'Nextec', 'Acesso'))
    assert.equal(o.psexe, copia)
    assert.ok(!/[\x00-\x1F]/.test(o.psexe), 'sem caractere de controle (\\v virava TAB)')
    assert.equal(o.psexeExiste, true)
    assert.ok(existsSync(o.psexe))
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('PS 5.1 (c): sem ProgramData a raiz cai em <SystemDrive>\\ProgramData\\Nextec\\Acesso', { skip }, async () => {
  const d = tmp()
  try {
    const o = await rodar(d, { ProgramData: '', SystemDrive: 'Q:', SystemRoot: SYSROOT })
    assert.equal(o.root, 'Q:\\ProgramData\\Nextec\\Acesso')
    assert.equal(o.psexeExiste, true)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// ---------- (d) nenhuma suíte esconde o caminho padrão atrás do override ----------
test('(d) nenhuma suíte usa o override NXROOT (options.root) sem o caminho padrão coberto aqui', () => {
  const pasta = new URL('./', import.meta.url)
  const usam = []
  for (const f of readdirSync(pasta)) {
    if (!/\.(mjs|ps1)$/.test(f) || f === 'ativar-cmd-barras.test.mjs') continue
    const texto = readFileSync(new URL(f, pasta), 'utf8')
    // override: "rem NXROOT" ou { root: ... } passado a buildActivationCmd/prepararCmd/gerar
    if (/NXROOT/.test(texto) || /(?:buildActivationCmd|prepararCmd|gerar)\([^)]*\{\s*root\s*:/.test(texto)) usam.push(f)
  }
  assert.deepEqual(usam, [], 'estas suítes usam o override da raiz; o caminho padrão só é provado em ativar-cmd-barras.test.mjs')
  // e quem troca a linha $root do bloco (fumaça) é coberto pelos testes (c) acima
  const fumaca = readFileSync(new URL('./activation-cmd-dados-reais.test.mjs', import.meta.url), 'utf8')
  assert.match(fumaca, /ativar-cmd-barras\.test\.mjs/, 'a fumaça que troca a linha $root deve apontar para o teste do caminho padrão')
})
