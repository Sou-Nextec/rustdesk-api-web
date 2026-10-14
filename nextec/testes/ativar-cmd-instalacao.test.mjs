// Ativar-Nextec-<ID>.cmd autossuficiente: pacote embutido, instalação em pasta simulada de %ProgramData%, agente antigo,
// dados sujos do registro/serviços. Roda o PowerShell 5.1 real (só Windows). Sem elevação: a ACL é trocada por uma que
// inclui o usuário atual (a forma SYSTEM+Administradores é a do Coordenar, coberta por test_coordinator.ps1).
// Ativar-Nextec-<ID>.cmd autossuficiente: pacote embutido, instalação em pasta simulada de %ProgramData%, agente antigo,
// dados sujos do registro/serviços. Roda o PowerShell 5.1 real (só Windows). Sem elevação: a ACL é trocada por uma que
// inclui o usuário atual (a forma SYSTEM+Administradores é a do Coordenar, coberta por test_coordinator.ps1).
// Os dublês (tarefas, identidade local, coordenador) ficam em ativar-harness.mjs; a atomicidade (preflight e rollback)
// é coberta em ativar-cmd-atomicidade.test.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildActivationCmd } from '../../src/nextec/activation-cmd.mjs'
import { buildAgentPackage, readAgentPackage, AGENT_PACKAGE_FILES } from '../../src/nextec/agent-package.mjs'
import { pacoteReal, lerScripts } from './pacote-agente.mjs'
import { PS51, skip, bundle, NOW, sha, psq, runPs, prepararCmd, found, withDir } from './ativar-harness.mjs'

// ---------- (a) o script embutido interpreta sem erros ----------
test('PS 5.1 (a): o script embutido no .cmd passa no ParseInput sem erros', { skip }, async () => {
  await withDir(async (d) => {
    const { text } = await prepararCmd(d)
    const ps = text.slice(text.indexOf('rem #PS-BEGIN#'))
    const out = runPs(`$t = [IO.File]::ReadAllText(${psq(join(d, 'Ativar-Nextec-536822159.cmd'))})
$i = $t.IndexOf('#PS' + '-BEGIN#')
$e = $null; $tk = $null
[void][Management.Automation.Language.Parser]::ParseInput($t.Substring($i), [ref]$tk, [ref]$e)
Out-Result @{ errors = @($e | ForEach-Object { $_.Message + ' @' + $_.Extent.StartLineNumber }); chars = ($t.Length - $i) }`)
    assert.equal(out.status, 0, out.stderr)
    assert.deepEqual(out.json.errors, [])
    assert.ok(out.json.chars > 5000 && ps.length > 5000)
  })
})

// ---------- (b) montagem do pacote ----------
test('pacote: round-trip gzip/base64/hash devolve os bytes exatos (BOM incluso) e 1 byte alterado falha', async () => {
  const scripts = lerScripts()
  const pkg = await pacoteReal()
  const cmd = buildActivationCmd(bundle, NOW, pkg)
  const lido = await readAgentPackage(cmd)
  assert.deepEqual(Object.keys(lido).sort(), [...AGENT_PACKAGE_FILES].sort())
  for (const n of AGENT_PACKAGE_FILES) {
    const original = Buffer.from(scripts[n], 'utf8')
    assert.equal(Buffer.compare(Buffer.from(lido[n]), original), 0, n)
    assert.equal(pkg.shas[n], sha(original))
    assert.deepEqual([...original.subarray(0, 3)], [0xEF, 0xBB, 0xBF], `${n} começa com BOM UTF-8`)
  }
  // 1 byte do conteúdo alterado: o hash declarado deixa de conferir
  const adulterado = { ...scripts, 'Coordenar-Agente-Nextec.ps1': scripts['Coordenar-Agente-Nextec.ps1'].replace('Receber', 'Receber ') }
  const pkg2 = await buildAgentPackage(adulterado)
  const cmd2 = cmd.replace(/rem NXPKG .*\r\n/g, '').replace('rem #PS-BEGIN#', pkg2.parts.map(p => `rem NXPKG ${p}`).join('\r\n') + '\r\nrem #PS-BEGIN#')
  await assert.rejects(readAgentPackage(cmd2), /Hash divergente: Coordenar/)
  // partes fora de ordem ou trocadas corrompem o pacote
  const partes = cmd.split('\r\n').filter(l => l.startsWith('rem NXPKG '))
  assert.ok(partes.length >= 2)
  const trocado = cmd.replace(partes[0], 'rem NXPKG ' + partes[0].slice(10).split('').reverse().join(''))
  await assert.rejects(readAgentPackage(trocado))
})

test('PS 5.1 (b): Get-NxPackage devolve os mesmos bytes e falha com 1 byte adulterado, hash trocado ou pacote ausente', { skip }, async () => {
  await withDir(async (d) => {
    const { text, path } = await prepararCmd(d)
    const linhas = text.split('\r\n')
    const idx = linhas.findIndex(l => l.startsWith('rem NXPKG '))
    // 1 caractere do base64 trocado (meio da primeira parte)
    const p = linhas[idx]; const meio = 10 + Math.floor((p.length - 10) / 2)
    const adulterada = [...linhas]; adulterada[idx] = p.slice(0, meio) + (p[meio] === 'A' ? 'B' : 'A') + p.slice(meio + 1)
    writeFileSync(join(d, 'base64.cmd'), adulterada.join('\r\n'), 'latin1')
    // hash de um script trocado por outro valor hex
    const hashTrocado = linhas.map(l => l.startsWith('rem NXSHA Provisionar') ? l.replace(/ [0-9a-f]{64}$/, ' ' + '0'.repeat(64)) : l)
    writeFileSync(join(d, 'hash.cmd'), hashTrocado.join('\r\n'), 'latin1')
    // pacote removido
    writeFileSync(join(d, 'semPacote.cmd'), linhas.filter(l => !l.startsWith('rem NXPKG ')).join('\r\n'), 'latin1')
    const out = runPs(`
function Tentar($arquivo) { try { [void](Get-NxPackage -Lines ([IO.File]::ReadAllLines($arquivo))); return 'ok' } catch { return [string]$_.Exception.Message } }
$files = Get-NxPackage -Lines ([IO.File]::ReadAllLines(${psq(path)}))
$h = @{}
foreach ($k in $files.Keys) { $b = $files[$k]; $s = [Security.Cryptography.SHA256]::Create(); $h[$k] = ([BitConverter]::ToString($s.ComputeHash($b)) -replace '-', '').ToLowerInvariant(); $h[$k + '#len'] = $b.Length; $h[$k + '#bom'] = ($b[0] -eq 239 -and $b[1] -eq 187 -and $b[2] -eq 191) }
Out-Result @{ hashes = $h; base64 = (Tentar ${psq(join(d, 'base64.cmd'))}); hash = (Tentar ${psq(join(d, 'hash.cmd'))}); semPacote = (Tentar ${psq(join(d, 'semPacote.cmd'))}) }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const scripts = lerScripts()
    for (const n of AGENT_PACKAGE_FILES) {
      assert.equal(out.json.hashes[n], sha(Buffer.from(scripts[n], 'utf8')), n)
      assert.equal(out.json.hashes[n + '#bom'], true)
    }
    assert.match(out.json.base64, /package_invalid|package_hash/)
    assert.equal(out.json.hash, 'package_hash')
    assert.equal(out.json.semPacote, 'package_invalid')
  })
})

// ---------- (c) servidor do dono: agente antigo, app Client-Nextec-Connect sem scripts ----------
test('PS 5.1 (c): agente antigo é preservado em backup, scripts novos gravados e -SubstituirAgenteAntigo passado', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'ProgramData', 'Nextec', 'Acesso')
    mkdirSync(root, { recursive: true })
    const antigo = '\ufeff# agente antigo de 11/10 (cofre inicial)\r\n'
    const cfg = '{"painel":"https://painel-remoto.nex.tec.br","id":"536822159","token":"TOKEN-ANTIGO-DPAPI-AAAA"}'
    writeFileSync(join(root, 'Agente-Senha-Nextec.ps1'), antigo, 'utf8')
    writeFileSync(join(root, 'agente-senha.json'), cfg, 'utf8')
    writeFileSync(join(root, 'Instalar-Nextec.ps1'), '# atualizador', 'utf8')
    const out = runPs(`
$lines = [IO.File]::ReadAllLines(${psq(path)})
$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()
$code = Invoke-NxActivation -Root ${psq(root)} -Lines $lines -DataB64 $b64 -Found ${found(d)} -M $M -Run $run -Say $say -Now ([DateTime]::SpecifyKind([DateTime]'2026-10-13T12:00:00', 'Utc')) -WaitSeconds 0
Out-Result @{ code = $code; runs = @($script:runs); calls = @($script:calls); said = @($script:said); payload = $script:payloadSeen }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.code, 0, JSON.stringify(j.said))
    // scripts novos gravados, iguais aos oficiais
    const scripts = lerScripts()
    for (const n of AGENT_PACKAGE_FILES) {
      assert.equal(Buffer.compare(readFileSync(join(root, n)), Buffer.from(scripts[n], 'utf8')), 0, n)
    }
    // backup do agente antigo: script e cadastro (o token continua inteiro; o original só sai com a decisão do coordenador)
    const arquivos = readdirSync(root)
    const bkScript = arquivos.find(f => f.startsWith('Agente-Senha-Nextec.ps1.antigo-20261013-120000'))
    const bkCfg = arquivos.find(f => f.startsWith('agente-senha.json.antigo-20261013-120000'))
    assert.ok(bkScript && bkCfg, arquivos.join(','))
    assert.equal(readFileSync(join(root, bkScript), 'utf8'), antigo)
    assert.equal(readFileSync(join(root, bkCfg), 'utf8'), cfg)
    assert.equal(readFileSync(join(root, 'agente-senha.json'), 'utf8'), cfg)
    assert.equal(readFileSync(join(root, 'Instalar-Nextec.ps1'), 'utf8'), '# atualizador')
    // tarefa antiga parada e desativada; coordenador registrado e depois autorização entregue com o parâmetro novo
    assert.deepEqual(j.calls.slice(0, 2), ['stop:Nextec Acesso - Senha', 'disable:Nextec Acesso - Senha'])
    assert.equal(j.runs.length, 2)
    assert.equal(j.runs[0].Script, 'Coordenar-Agente-Nextec.ps1')
    assert.match(j.runs[0].Args, /^-Registrar -PastaDados /)
    assert.match(j.runs[1].Args, /^-Receber -ArquivoAutorizacao .*bootstrap\.json -PastaDados .* -SubstituirAgenteAntigo$/)
    assert.deepEqual(JSON.parse(j.payload), bundle)
    assert.ok(j.calls.includes('start:Nextec Acesso - Cadastro de agente'))
    // temporário de uso único removido e log sem segredos
    assert.ok(!arquivos.some(f => f.startsWith('ativar-') && !f.endsWith('.log')), 'pasta temporária removida')
    const log = readFileSync(join(root, 'ativar.log'), 'utf8')
    assert.match(log, /pacote_ok/)
    for (const segredo of [bundle.bootstrap, bundle.uuid, 'TOKEN-ANTIGO', Buffer.from(JSON.stringify(bundle)).toString('base64')]) assert.ok(!log.includes(segredo), 'segredo no log')
  })
})

// ---------- (d) máquina sem agente antigo ----------
test('PS 5.1 (d): sem agente antigo instala tudo, não passa -SubstituirAgenteAntigo e confirma a ativação', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'ProgramData', 'Nextec', 'Acesso')   // nem existe ainda
    const out = runPs(`
$script:receberCreates = ${psq(join(root, 'agente-senha.json'))}
$lines = [IO.File]::ReadAllLines(${psq(path)})
$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()
$code = Invoke-NxActivation -Root ${psq(root)} -Lines $lines -DataB64 $b64 -Found ${found(d)} -M $M -Run $run -Say $say -WaitSeconds 6 -Sleep { param($s) }
Out-Result @{ code = $code; runs = @($script:runs); calls = @($script:calls); said = @($script:said) }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.code, 0)
    assert.equal(j.runs.length, 2)
    assert.ok(!/SubstituirAgenteAntigo/.test(j.runs[1].Args))
    assert.ok(!j.calls.some(c => c.startsWith('stop:') || c.startsWith('disable:')), 'não mexe na tarefa de senha sem agente antigo')
    assert.deepEqual(j.said, ['Pronto: m\u00e1quina ativada. Pode fechar.'])
    const arquivos = readdirSync(root)
    assert.ok(!arquivos.some(f => f.includes('.antigo-')), 'sem backup quando não havia agente antigo')
    for (const n of AGENT_PACKAGE_FILES) assert.ok(existsSync(join(root, n)))
    // painel gravado no marcador para o coordenador (so o host, nada de segredo)
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'nextec-marker.json'), 'utf8')), { painel: bundle.painel })
  })
})

test('PS 5.1: scripts já instalados e tarefa registrada não são regravados nem registrados de novo; versão mais nova é mantida', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    mkdirSync(root, { recursive: true })
    const scripts = lerScripts()
    for (const n of AGENT_PACKAGE_FILES) writeFileSync(join(root, n), scripts[n], 'utf8')
    const maisNovo = scripts['Coordenar-Agente-Nextec.ps1'] + '\n# versao futura com SubstituirAgenteAntigo\n'
    writeFileSync(join(root, 'Coordenar-Agente-Nextec.ps1'), maisNovo, 'utf8')
    const out = runPs(`
$script:tasks[$script:coord] = 'Ready'
$lines = [IO.File]::ReadAllLines(${psq(path)})
$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()
$code = Invoke-NxActivation -Root ${psq(root)} -Lines $lines -DataB64 $b64 -Found ${found(d)} -M $M -Run $run -Say $say -WaitSeconds 0
Out-Result @{ code = $code; runs = @($script:runs); said = @($script:said) }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.runs.length, 1, 'só entrega a autorização')
    assert.match(out.json.runs[0].Args, /^-Receber /)
    assert.equal(readFileSync(join(root, 'Coordenar-Agente-Nextec.ps1'), 'utf8'), maisNovo)
    assert.ok(!readdirSync(root).some(f => f.includes('.antigo-')))
  })
})

test('PS 5.1: pacote adulterado ou app ausente falham antes de gravar qualquer script', { skip }, async () => {
  await withDir(async (d) => {
    const { text } = await prepararCmd(d)
    const linhas = text.split('\r\n')
    const ruim = linhas.map(l => l.startsWith('rem NXSHA Agente-Senha') ? l.replace(/ [0-9a-f]{64}$/, ' ' + 'f'.repeat(64)) : l)
    const arqRuim = join(d, 'ruim.cmd'); writeFileSync(arqRuim, ruim.join('\r\n'), 'latin1')
    const arqBom = join(d, 'bom.cmd'); writeFileSync(arqBom, text, 'latin1')
    const root1 = join(d, 'A', 'Acesso'); const root2 = join(d, 'B', 'Acesso')
    const out = runPs(`
$b64 = 'e30='
$lines = [IO.File]::ReadAllLines(${psq(arqRuim)})
$c1 = Invoke-NxActivation -Root ${psq(root1)} -Lines $lines -DataB64 $b64 -Found ${found(d)} -M $M -Run $run -Say $say -WaitSeconds 0
$said1 = @($script:said); $script:said.Clear()
$lines = [IO.File]::ReadAllLines(${psq(arqBom)})
$none = [pscustomobject]@{ Script = ''; App = ''; AppPath = ''; Searched = @('a', 'b') }
$c2 = Invoke-NxActivation -Root ${psq(root2)} -Lines $lines -DataB64 $b64 -Found $none -M $M -Run $run -Say $say -WaitSeconds 0
Out-Result @{ c1 = $c1; said1 = $said1; c2 = $c2; said2 = @($script:said); runs = @($script:runs).Count }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.c1, 1); assert.equal(j.c2, 1); assert.equal(j.runs, 0, 'nada foi executado')
    assert.equal(j.said1.length, 1); assert.match(j.said1[0], /corrompido/)
    assert.match(j.said2[0], /n\u00e3o est\u00e1 instalado/)
    assert.ok(j.said2[0].includes('Procurei em: a; b'))
    const gravados = existsSync(root1) ? readdirSync(root1).filter(f => f.endsWith('.ps1')) : []
    assert.deepEqual(gravados, [])
  })
})

// ---------- (e) dados sujos reais do registro e dos serviços ----------
test('PS 5.1 (e): dados sujos (aspas, %VAR%, drive inexistente, UNC, nulos, tipos errados) não geram exceção', { skip }, async () => {
  await withDir(async (d) => {
    const app = join(d, 'PF', 'Client-Nextec-Connect'); mkdirSync(app, { recursive: true })
    const exe = join(app, 'Client-Nextec-Connect.exe'); writeFileSync(exe, 'MZ')
    const pf = join(d, 'PF')
    const out = runPs(`
$env:NX_TEST_PF = ${psq(pf)}
$entries = @(
  $null,
  [pscustomobject]@{ DisplayName = $null; InstallLocation = $null },
  [pscustomobject]@{ DisplayName = 'Aspas'; InstallLocation = '"Z:\\Nao\\Existe\\App"' },
  [pscustomobject]@{ DisplayName = 'Simples'; InstallLocation = "'Q:\\x\\y'" },
  [pscustomobject]@{ DisplayName = 'Unc'; InstallLocation = '\\\\127.0.0.1\\nx-sem-share\\app' },
  [pscustomobject]@{ DisplayName = 'Array'; InstallLocation = @('C:\\a', 'C:\\b') },
  [pscustomobject]@{ DisplayName = 'Numero'; InstallLocation = 42 },
  [pscustomobject]@{ DisplayName = 'Relativo'; InstallLocation = 'app\\relativo' },
  [pscustomobject]@{ DisplayName = 'CharInvalido'; InstallLocation = ('C:\\a' + [char]0 + 'b') },
  [pscustomobject]@{ DisplayName = 'Longo'; InstallLocation = ('C:\\' + ('x' * 700)) },
  [pscustomobject]@{ DisplayName = 'Env'; InstallLocation = '%NX_TEST_PF%\\Nao-Tem-Script' }
)
$services = @(
  $null,
  [pscustomobject]@{ Name = 'Sem'; PathName = $null },
  [pscustomobject]@{ Name = 'Outro'; PathName = 'C:\\Windows\\System32\\svchost.exe -k netsvcs' },
  [pscustomobject]@{ Name = 'Z'; PathName = '"Z:\\nao\\existe\\rd.exe" --service' },
  [pscustomobject]@{ Name = 'Unc'; PathName = '\\\\127.0.0.1\\nx-sem-share\\rd.exe --service' },
  [pscustomobject]@{ Name = 'Aspas'; PathName = '"C:\\x\\y.exe --service' },
  [pscustomobject]@{ Name = 'Cru'; PathName = 'C:\\Arquivos de Programas\\r d\\rd.exe --service' },
  [pscustomobject]@{ Name = 'Client-Nextec-Connect'; PathName = '"%NX_TEST_PF%\\Client-Nextec-Connect\\Client-Nextec-Connect.exe" --service' }
)
$marker = [pscustomobject]@{ InstallDir = ''; AppName = '' }
$markerSujo = [pscustomobject]@{ InstallDir = '"X:\\nada"'; AppName = 'Client-Nextec-Connect' }
$taskArgs = @($null, '-File', '-File "Z:\\x\\y.ps1" -Executar', '-File ""', "-File 'C:\\a.ps1'")
$r = Find-NextecAgent -DataRoot ${psq(join(d, 'PD', 'Nextec', 'Acesso'))} -ProgramRoots @($null, '', 'Z:\\', '"C:\\nao-existe-xyz"', ${psq(pf)}) -Entries $entries -TaskArgs $taskArgs -Marker $marker -Services $services
$r2 = Find-NextecAgent -DataRoot ${psq(join(d, 'PD', 'Nextec', 'Acesso'))} -ProgramRoots @() -Entries @() -TaskArgs $taskArgs -Marker $markerSujo -Services $services
Out-Result @{ script = [string]$r.Script; app = [string]$r.App; appPath = [string]$r.AppPath; searched = $r.Searched.Count; sujoScript = [string]$r2.Script; sujoApp = [string]$r2.App }`, { NX_TEST_PF: pf })
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.script, '', 'não há Coordenar em lugar nenhum')
    assert.equal(out.json.app, 'Client-Nextec-Connect')
    assert.equal(out.json.appPath.toLowerCase(), app.toLowerCase(), 'o app sem agente é identificado pela pasta do serviço')
    assert.ok(out.json.searched >= 3)
    assert.equal(out.json.sujoScript, '')
    assert.equal(out.json.sujoApp, 'Client-Nextec-Connect', 'marcador com caminho sujo ainda informa o nome do app')
  })
})

test('PS 5.1 (e): o .cmd completo roda o localizador real do registro sem exceção e apaga nada quando vencido', { skip }, async () => {
  await withDir(async (d) => {
    const vencido = await buildActivationCmd(bundle, Date.UTC(2020, 0, 1), await pacoteReal())
    const arq = join(d, 'Ativar-Nextec-536822159.cmd')
    writeFileSync(arq, vencido, 'latin1')
    const script = vencido.slice(vencido.indexOf('#PS-BEGIN#'))
    const ps1 = join(d, 'run.ps1')
    writeFileSync(ps1, '\ufeff' + script, 'utf8')
    const r = spawnSync(PS51, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8', env: { ...process.env, NX_SELF: arq } })
    assert.equal(r.status, 3, r.stderr + r.stdout)
    assert.match(r.stdout, /prazo de 15 minutos/)
    assert.ok(existsSync(arq))
  })
})

// ---------- a tela entrega o pacote real ao gerador ----------
test('o painel importa os scripts oficiais no build (?raw) e passa o pacote ao gerador do .cmd', () => {
  const fonte = readFileSync(new URL('../../src/nextec/agent-package-sources.js', import.meta.url), 'utf8')
  for (const n of AGENT_PACKAGE_FILES) assert.ok(fonte.includes(`nextec/atualizacao/${n}?raw`), n)
  const tela = readFileSync(new URL('../../src/nextec/views/SecretsPanel.vue', import.meta.url), 'utf8')
  assert.match(tela, /import \{ getAgentPackage \} from '@\/nextec\/agent-package-sources\.js'/)
  assert.match(tela, /buildActivationCmd\(bundle, Date\.now\(\), pkg\)/)
  const wf = readFileSync(new URL('../../.github/workflows/nextec-imagem.yml', import.meta.url), 'utf8')
  assert.ok(!/paths-ignore:[\s\S]*nextec\/atualizacao\/\*\*[\s\S]*workflow_dispatch/.test(wf), 'script do agente muda o .cmd: a imagem precisa ser reconstruida')
})
