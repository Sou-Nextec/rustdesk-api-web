// Ativar-Nextec-<ID>.cmd, achados da revisão do PR #86:
//  P1  o pacote embutido é SEMPRE o dos scripts da árvore (byte a byte, hash conferido no build) e o preflight/agente
//      funcionam no layout REAL do Windows (perfil do serviço em ServiceProfiles\LocalService).
//  P2  script existente que diverge do embutido (truncado, vazio, corrompido, versão antiga) é substituído de forma
//      atômica; só o idêntico fica. Falha ou interrupção deixa o anterior no lugar.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildActivationCmd } from '../../src/nextec/activation-cmd.mjs'
import { AGENT_PACKAGE_FILES, buildAgentPackage, readAgentPackage, verifyAgentPackage } from '../../src/nextec/agent-package.mjs'
import { agentPackageTreeShas, agentPackagePlugin } from '../../vite-plugin-agent-package.mjs'
import { lerScripts, pacoteReal, PASTA_ATUALIZACAO } from './pacote-agente.mjs'
import {
  skip, bundle, GUID, NOW, TAREFA_COORD, TAREFA_SENHA, sha, psq, runPs, prepararCmd, found, withDir, estado,
} from './ativar-harness.mjs'

const raiz = new URL('../../', import.meta.url)
const raizDir = fileURLToPath(raiz)
const doDisco = (n) => readFileSync(new URL(n, PASTA_ATUALIZACAO))

// ---------- P1: o pacote embutido é a árvore, byte a byte ----------
test('o pacote embutido no .cmd é idêntico, byte a byte, aos scripts do repositório (BOM incluso)', async () => {
  const cmd = buildActivationCmd(bundle, NOW, await pacoteReal())
  const embutido = await readAgentPackage(cmd)
  assert.deepEqual(Object.keys(embutido).sort(), [...AGENT_PACKAGE_FILES].sort())
  for (const n of AGENT_PACKAGE_FILES) {
    assert.equal(Buffer.compare(Buffer.from(embutido[n]), doDisco(n)), 0, `${n} diverge do arquivo do repositório`)
  }
  assert.equal(await verifyAgentPackage(await pacoteReal(), lerScripts()), true)
})

test('o gerador recusa pacote que diverge da árvore (arquivo antigo, truncado ou ausente)', async () => {
  const arvore = lerScripts()
  const antigo = { ...arvore, 'Agente-Senha-Nextec.ps1': arvore['Agente-Senha-Nextec.ps1'].slice(0, 4000) }
  const pkgAntigo = await buildAgentPackage(antigo)
  await assert.rejects(() => verifyAgentPackage(pkgAntigo, arvore), /diverge do script do painel: Agente-Senha-Nextec\.ps1/)
  // um byte diferente, mesmo tamanho
  const umByte = { ...arvore, 'Coordenar-Agente-Nextec.ps1': arvore['Coordenar-Agente-Nextec.ps1'].replace('Nextec', 'Nextez') }
  const pkgUmByte = await buildAgentPackage(umByte)
  await assert.rejects(() => verifyAgentPackage(pkgUmByte, arvore), /diverge do script do painel: Coordenar-Agente-Nextec\.ps1/)
  // hash declarado que não é o do conteúdo
  const pkg = await pacoteReal()
  const adulterado = { ...pkg, shas: { ...pkg.shas, 'Provisionar-Agente-Nextec.ps1': '0'.repeat(64) } }
  await assert.rejects(() => verifyAgentPackage(adulterado, arvore), /não confere/)
  await assert.rejects(() => verifyAgentPackage(pkg, { ...arvore, 'Provisionar-Agente-Nextec.ps1': undefined }), /ausente na árvore/)
})

test('a lista do pacote cobre todo script que o coordenador copia da própria pasta', () => {
  const coord = readFileSync(new URL('Coordenar-Agente-Nextec.ps1', PASTA_ATUALIZACAO), 'utf8')
  const usados = [...coord.matchAll(/Join-Path \$SourceRoot '([^']+\.ps1)'/g)].map(m => m[1])
  assert.ok(usados.length >= 3)
  for (const n of usados) assert.ok(AGENT_PACKAGE_FILES.includes(n), `${n} é exigido pelo fluxo e falta no pacote embutido`)
  for (const n of AGENT_PACKAGE_FILES) assert.ok(readFileSync(new URL(n, PASTA_ATUALIZACAO)).length > 64, n)
})

test('o build calcula os hashes direto do disco e o gerador compara com eles', async () => {
  const shas = agentPackageTreeShas(raizDir)
  const pkg = await pacoteReal()
  for (const n of AGENT_PACKAGE_FILES) {
    assert.equal(shas[n], sha(doDisco(n)), `${n}: hash do build diferente do arquivo`)
    assert.equal(pkg.shas[n], shas[n], `${n}: pacote embutido diferente do arquivo da árvore`)
  }
  const cfg = agentPackagePlugin(raizDir).config()
  assert.deepEqual(JSON.parse(cfg.define.__NX_AGENT_TREE_SHAS__), shas)
  const fonte = readFileSync(new URL('src/nextec/agent-package-sources.js', raiz), 'utf8')
  assert.match(fonte, /__NX_AGENT_TREE_SHAS__/)
  assert.match(fonte, /verifyAgentPackage/)
  assert.match(readFileSync(new URL('vite.config.js', raiz), 'utf8'), /agentPackagePlugin/)
})

// ---------- helpers de PowerShell ----------
const SENHA_ATIVA = `$script:tasks[$script:senha] = 'Ready'\n`
const fluxo = (root, path, d, { pre = '', wait = 0, sleep = false } = {}) => `
${pre}
$lines = [IO.File]::ReadAllLines(${psq(path)})
$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()
$code = Invoke-NxActivation -Root ${psq(root)} -Lines $lines -DataB64 $b64 -Found ${found(d)} -M $M -Run $run -Say $say -Now ([DateTime]::SpecifyKind([DateTime]'2026-10-13T12:00:00', 'Utc')) -WaitSeconds ${wait} ${sleep ? '-Sleep { param($s) }' : ''}
Out-Result @{ code = $code; runs = @($script:runs); calls = @($script:calls); said = @($script:said); tasks = $script:tasks }`

// Identidade com o layout REAL do Windows: <Windows>\ServiceProfiles\LocalService\AppData\Roaming\XPTO\config
// (WindowsDirectory, sem ProfileRootBase).
const layoutReal = (win, conta, segmentos) => `
$win = ${psq(win)}
$exe = [IO.Path]::Combine($win, 'Program Files', 'XPTO', 'XPTO.exe')
[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($exe)); [IO.File]::WriteAllText($exe, 'MZ')
$cfg = [IO.Path]::Combine($win, ${segmentos.map(psq).join(', ')}, 'AppData', 'Roaming', 'XPTO', 'config')
[void][IO.Directory]::CreateDirectory($cfg); [IO.File]::WriteAllText([IO.Path]::Combine($cfg, 'RustDesk.toml'), 'x')
$svc = [pscustomobject]@{ Name = 'XPTO'; PathName = ('"' + $exe + '" --service'); StartName = ${psq(conta)} }
$script:NxIdHooks = @{
  Services = @($svc); WindowsDirectory = $win
  PeerIdReader = { param($s, $e) return ${psq(bundle.id)} }
  GuidReader = { return ${psq(GUID)} }
}
`

test('preflight e identidade no layout real: serviço LocalSystem/LocalService com config em ServiceProfiles\\LocalService', { skip }, async () => {
  const casos = [
    { nome: 'LocalSystem + ServiceProfiles\\LocalService', conta: 'LocalSystem', seg: ['ServiceProfiles', 'LocalService'] },
    { nome: 'NT AUTHORITY\\LocalService + ServiceProfiles\\LocalService', conta: 'NT AUTHORITY\\LocalService', seg: ['ServiceProfiles', 'LocalService'] },
    { nome: 'LocalSystem + System32\\config\\systemprofile (instalação antiga)', conta: 'LocalSystem', seg: ['System32', 'config', 'systemprofile'] },
  ]
  for (const c of casos) {
    await withDir(async (d) => {
      const { path } = await prepararCmd(d)
      const root = join(d, 'PD', 'Nextec', 'Acesso')
      const out = runPs(`
${layoutReal(join(d, 'Windows'), c.conta, c.seg)}
$lines = [IO.File]::ReadAllLines(${psq(path)})
$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()
$files = Get-NxPackage -Lines $lines
$id = Get-NxLocalIdentity -Files $files -Root ${psq(root)} -PanelDefault 'https://painel-remoto.nex.tec.br'
$pf = Invoke-NxPreflight -Root ${psq(root)} -Lines $lines -DataB64 $b64 -Found ${found(d)} -Now ([DateTime]::UtcNow) -ReadIdentity { param($f, $p, $r) Get-NxLocalIdentity -Files $f -Root $r -PanelDefault $p.painel }
Out-Result @{ id = $id.Id; uuid = $id.Uuid; ok = [bool]$pf.Ok; why = [string]$pf.Why; detail = [string]$pf.Detail; existe = [IO.Directory]::Exists(${psq(root)}) }`)
      assert.equal(out.status, 0, c.nome + '\n' + out.stderr + out.stdout)
      assert.equal(out.json.id, bundle.id, c.nome)
      assert.equal(out.json.uuid, bundle.uuid, c.nome)
      assert.equal(out.json.ok, true, `${c.nome}: preflight recusou (${out.json.why} ${out.json.detail})`)
      assert.equal(out.json.existe, false, 'o preflight não cria a pasta de dados')
    })
  }
})

test('o agente embutido (Agente-Senha) acha o serviço no layout real do Windows', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const out = runPs(`
${layoutReal(join(d, 'Windows'), 'LocalSystem', ['ServiceProfiles', 'LocalService'])}
$lines = [IO.File]::ReadAllLines(${psq(path)})
$files = Get-NxPackage -Lines $lines
# as MESMAS funcoes do agente embutido (ja conferido por hash), carregadas em memoria
$mod = New-NxIdentityModule -Files $files
$c = & $mod { param($s, $w) Get-NextecInstalledClient -Services $s -WindowsDirectory $w -Marker ([pscustomobject]@{ AppName = '' }) -PeerIdReader { return '${bundle.id}' } } $script:NxIdHooks.Services ${psq(join(d, 'Windows'))}
Out-Result @{ peer = $c.PeerId; cfg = $c.ConfigRoot; conta = $c.ServiceAccount }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.peer, bundle.id)
    assert.equal(out.json.cfg.toLowerCase(), join(d, 'Windows', 'ServiceProfiles', 'LocalService', 'AppData', 'Roaming', 'XPTO', 'config').toLowerCase())
  })
})

test('o pacote lido pelo PowerShell do .cmd tem os mesmos bytes (SHA-256) dos arquivos da árvore', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const out = runPs(`
$lines = [IO.File]::ReadAllLines(${psq(path)})
$files = Get-NxPackage -Lines $lines
$h = @{}
foreach ($k in $files.Keys) { $h[$k] = Get-NxBytesHash $files[$k] }
Out-Result $h`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    for (const n of AGENT_PACKAGE_FILES) assert.equal(out.json[n], sha(doDisco(n)), n)
  })
})

// ---------- P2: plano de instalação por tamanho e SHA-256 ----------
test('plano: truncado, vazio, corrompido (mesmo tamanho) e versão antiga são substituídos; idêntico não', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'plano')
    const out = runPs(`
$lines = [IO.File]::ReadAllLines(${psq(path)})
$files = Get-NxPackage -Lines $lines
$root = ${psq(root)}
[void][IO.Directory]::CreateDirectory($root)
function Gravar($n, [byte[]]$b) { [IO.File]::WriteAllBytes([IO.Path]::Combine($root, $n), $b) }
function Metade([byte[]]$b) { $m = New-Object byte[] ([int]($b.Length / 2)); [Array]::Copy($b, $m, $m.Length); return ,$m }
$c = 'Coordenar-Agente-Nextec.ps1'; $p = 'Provisionar-Agente-Nextec.ps1'; $a = 'Agente-Senha-Nextec.ps1'
# tudo divergente: coordenador truncado (ainda traz o texto do recurso novo), provisionador vazio, agente antigo
Gravar $c (Metade $files[$c]); Gravar $p (New-Object byte[] 0); Gravar $a ([Text.Encoding]::UTF8.GetBytes("# agente antigo"))
$ruim = Get-NxInstallPlan -Root $root -Files $files
# tudo identico
foreach ($n in @($c, $p, $a)) { Gravar $n $files[$n] }
$igual = Get-NxInstallPlan -Root $root -Files $files
# um byte trocado, mesmo tamanho, em um unico script
$b = [byte[]]$files[$p].Clone(); $b[$b.Length - 1] = [byte]([int]$b[$b.Length - 1] -bxor 1)
Gravar $p $b
$umByte = Get-NxInstallPlan -Root $root -Files $files
# ausente
[IO.File]::Delete([IO.Path]::Combine($root, $c))
$ausente = Get-NxInstallPlan -Root $root -Files $files
Out-Result @{ ruim = @($ruim.Install); ruimOld = $ruim.OldAgentScript; igual = @($igual.Install); igualOld = $igual.OldAgentScript
  umByte = @($umByte.Install); umByteOld = $umByte.OldAgentScript; ausente = @($ausente.Install) }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.deepEqual([...j.ruim].sort(), [...AGENT_PACKAGE_FILES].sort())
    assert.equal(j.ruimOld, true)
    assert.deepEqual(j.igual, [])
    assert.equal(j.igualOld, false)
    assert.deepEqual(j.umByte, ['Provisionar-Agente-Nextec.ps1'])
    assert.equal(j.umByteOld, false)
    assert.deepEqual([...j.ausente].sort(), ['Coordenar-Agente-Nextec.ps1', 'Provisionar-Agente-Nextec.ps1'])
  })
})

// ---------- P2: troca atômica ----------
test('Set-NxScript: troca atômica com cópia do anterior, sem temporário; falha ou interrupção mantém o anterior', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'troca')
    const out = runPs(`
$lines = [IO.File]::ReadAllLines(${psq(path)})
$files = Get-NxPackage -Lines $lines
$root = ${psq(root)}
[void][IO.Directory]::CreateDirectory($root)
$n = 'Coordenar-Agente-Nextec.ps1'
$dest = [IO.Path]::Combine($root, $n)
$novo = [byte[]]$files[$n]
function Estado { @{ hash = $(if ([IO.File]::Exists($dest)) { Get-NxBytesHash ([IO.File]::ReadAllBytes($dest)) } else { '' })
  tmp = @([IO.Directory]::GetFiles($root, '.nx-*.tmp')).Count; bak = @([IO.Directory]::GetFiles($root, $n + '.antigo-*')).Count } }
function Tentar($b) { try { & $b; return 'ok' } catch { return [string]$_.Exception.Message } }
$velho = [Text.Encoding]::UTF8.GetBytes('# versao velha truncada')
$hVelho = Get-NxBytesHash $velho
$hNovo = Get-NxBytesHash $novo
$r = @{}
# 1) troca normal sobre arquivo existente
[IO.File]::WriteAllBytes($dest, $velho)
Set-NxScript -Root $root -Name $n -Bytes $novo -Stamp 'T1'
$r.normal = Estado
$r.backupOk = ((Get-NxBytesHash ([IO.File]::ReadAllBytes($dest + '.antigo-T1'))) -ceq $hVelho)
# 2) arquivo ausente: cria
[IO.File]::Delete($dest)
Set-NxScript -Root $root -Name $n -Bytes $novo -Stamp 'T2'
$r.novo = Estado
# 3) interrupcao no meio da escrita do temporario (disco cheio / processo morto)
[IO.File]::WriteAllBytes($dest, $velho)
foreach ($f in [IO.Directory]::GetFiles($root, $n + '.antigo-*')) { [IO.File]::Delete($f) }
$orig = \${function:New-NxProtectedFile}
function New-NxProtectedFile { param($Path, [byte[]]$Bytes) $fs = [IO.File]::Create($Path); $fs.Write($Bytes, 0, 5); $fs.Dispose(); throw 'disco_cheio' }
$r.msgInterrompida = Tentar { Set-NxScript -Root $root -Name $n -Bytes $novo -Stamp 'T3' }
$r.interrompida = Estado
# 4) gravacao que nao confere (bytes diferentes dos esperados) nao e trocada
function New-NxProtectedFile { param($Path, [byte[]]$Bytes) $c = [byte[]]$Bytes.Clone(); $c[0] = [byte]([int]$c[0] -bxor 255); [IO.File]::WriteAllBytes($Path, $c) }
$r.msgInvalida = Tentar { Set-NxScript -Root $root -Name $n -Bytes $novo -Stamp 'T4' }
$r.invalida = Estado
Set-Item -Path function:New-NxProtectedFile -Value $orig
# 5) troca que falha (destino aberto por outro processo): anterior intacto, temporario e copia removidos
$h = [IO.File]::Open($dest, 'Open', 'Read', 'Read')
try { $r.msgTravada = Tentar { Set-NxScript -Root $root -Name $n -Bytes $novo -Stamp 'T5' } } finally { $h.Dispose() }
$r.travada = Estado
$r.hVelho = $hVelho; $r.hNovo = $hNovo
Out-Result $r`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const r = out.json
    assert.equal(r.normal.hash, r.hNovo); assert.equal(r.normal.tmp, 0); assert.equal(r.normal.bak, 1); assert.equal(r.backupOk, true)
    assert.equal(r.novo.hash, r.hNovo); assert.equal(r.novo.tmp, 0)
    assert.equal(r.interrompida.hash, r.hVelho, 'interrupção: o anterior continua'); assert.equal(r.interrompida.tmp, 0); assert.equal(r.interrompida.bak, 0)
    assert.match(r.msgInterrompida, /disco_cheio/)
    assert.equal(r.invalida.hash, r.hVelho, 'gravação inválida não é trocada'); assert.equal(r.invalida.tmp, 0); assert.equal(r.invalida.bak, 0)
    assert.match(r.msgInvalida, /script_gravacao_invalida/)
    assert.equal(r.travada.hash, r.hVelho, 'troca que falha mantém o anterior'); assert.equal(r.travada.tmp, 0); assert.equal(r.travada.bak, 0)
    assert.notEqual(r.msgTravada, 'ok')
  })
})

// ---------- P2: fluxo completo ----------
function scriptsDivergentes(root) {
  const t = lerScripts()
  mkdirSync(root, { recursive: true })
  const meio = (s) => s.slice(0, Math.floor(s.length / 2))
  writeFileSync(join(root, 'Coordenar-Agente-Nextec.ps1'), meio(t['Coordenar-Agente-Nextec.ps1']), 'utf8')   // truncado, ainda com o texto do recurso
  writeFileSync(join(root, 'Provisionar-Agente-Nextec.ps1'), '', 'utf8')                                   // zero byte
  writeFileSync(join(root, 'Agente-Senha-Nextec.ps1'), meio(t['Agente-Senha-Nextec.ps1']), 'utf8')         // truncado
  writeFileSync(join(root, 'agente-senha.log'), 'Senha trocada\r\n', 'utf8')
}

test('fluxo: scripts truncados, vazios ou antigos viram os da árvore (com cópia do anterior) e a ativação conclui', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    scriptsDivergentes(root)
    const pre = SENHA_ATIVA + `$script:receberCreates = ${psq(join(root, 'agente-senha.json'))}\n`
    const out = runPs(fluxo(root, path, d, { pre, wait: 6, sleep: true }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 0, JSON.stringify(out.json.said))
    for (const n of AGENT_PACKAGE_FILES) {
      assert.equal(Buffer.compare(readFileSync(join(root, n)), doDisco(n)), 0, `${n} não foi substituído pelo da árvore`)
    }
    const arq = readdirSync(root)
    for (const n of AGENT_PACKAGE_FILES) assert.ok(arq.some(f => f.startsWith(n + '.antigo-')), `sem cópia do anterior de ${n}`)
    assert.ok(!arq.some(f => f.startsWith('.nx-')), 'temporário sobrou')
    assert.ok(out.json.runs.some(x => /^-Registrar /.test(x.Args)))
  })
})

test('fluxo: recusa do painel restaura os scripts truncados exatamente como estavam (rollback do preflight)', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    scriptsDivergentes(root)
    const antes = estado(root)
    const pre = SENHA_ATIVA + "$script:receberMutate = $true\n$script:receberCode = 1; $script:receberOut = 'manual_authorization_required'\n"
    const out = runPs(fluxo(root, path, d, { pre }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 1, JSON.stringify(out.json.said))
    assert.ok(out.json.runs.some(x => /^-Registrar /.test(x.Args)), 'a instalação chegou a ocorrer')
    assert.deepEqual(estado(root), antes, 'scripts truncados voltaram byte a byte, sem sobras')
    assert.equal(out.json.tasks[TAREFA_SENHA], 'Ready')
    assert.ok(!(TAREFA_COORD in out.json.tasks))
  })
})

test('fluxo: scripts idênticos ao embutido não são regravados nem copiados', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    mkdirSync(root, { recursive: true })
    const antiga = new Date('2026-01-02T03:04:05Z')
    for (const n of AGENT_PACKAGE_FILES) { writeFileSync(join(root, n), doDisco(n)); utimesSync(join(root, n), antiga, antiga) }
    const pre = SENHA_ATIVA + `$script:tasks[$script:coord] = 'Ready'\n$script:receberCreates = ${psq(join(root, 'agente-senha.json'))}\n`
    const out = runPs(fluxo(root, path, d, { pre, wait: 6, sleep: true }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 0, JSON.stringify(out.json.said))
    for (const n of AGENT_PACKAGE_FILES) {
      assert.equal(Buffer.compare(readFileSync(join(root, n)), doDisco(n)), 0)
      assert.equal(statSync(join(root, n)).mtime.toISOString(), antiga.toISOString(), `${n} foi regravado`)
    }
    assert.ok(!readdirSync(root).some(f => f.includes('.antigo-')), 'cópia desnecessária')
    assert.ok(!out.json.runs.some(x => /^-Registrar /.test(x.Args)), 'sem script novo e com tarefa pronta, não registra de novo')
  })
})
