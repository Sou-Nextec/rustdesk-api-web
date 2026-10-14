// Ativar-Nextec-<ID>.cmd: PREFLIGHT sem efeitos colaterais e ROLLBACK atômico (achado P1 do PR #86).
// Regra: ID/uuid incompatível, autorização vencida/inválida ou recusa do painel NÃO podem deixar nada em ProgramData nem
// tarefa registrada ou desativada. Só o sucesso mantém as alterações. Roda o fluxo completo (Invoke-NxActivation) no
// PowerShell 5.1 real, com raiz de dados temporária e dublês de tarefas, identidade local, coordenador e painel.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { INSTALL_AGENT_PS, buildActivationCmd } from '../../src/nextec/activation-cmd.mjs'
import { AGENT_PACKAGE_FILES } from '../../src/nextec/agent-package.mjs'
import { lerScripts, pacoteReal } from './pacote-agente.mjs'
import {
  skip, bundle, GUID, NOW, TAREFA_COORD, TAREFA_SENHA, sha, psq, runPs, prepararCmd, found, withDir, estado,
} from './ativar-harness.mjs'

const OUTRO_ID = '999000111'
const ANTIGO = '﻿# agente antigo de 11/10 (cofre inicial)\r\n'
const CFG = '{"painel":"https://painel-remoto.nex.tec.br","id":"536822159","token":"TOKEN-ANTIGO-DPAPI-AAAA"}'

// Servidor do dono: agente antigo (script do cofre e cadastro), coordenador/provisionador antigos, log e pasta de backup manual.
function montarAgenteAntigo(root) {
  mkdirSync(join(root, 'backup-manual'), { recursive: true })
  writeFileSync(join(root, 'Agente-Senha-Nextec.ps1'), ANTIGO, 'utf8')
  writeFileSync(join(root, 'Coordenar-Agente-Nextec.ps1'), '# coordenador antigo\r\n', 'utf8')
  writeFileSync(join(root, 'Provisionar-Agente-Nextec.ps1'), '# provisionador antigo\r\n', 'utf8')
  writeFileSync(join(root, 'agente-senha.json'), CFG, 'utf8')
  writeFileSync(join(root, 'Instalar-Nextec.ps1'), '# atualizador', 'utf8')
  writeFileSync(join(root, 'agente-senha.log'), 'Senha trocada\r\n', 'utf8')
  writeFileSync(join(root, 'backup-manual', 'cadastro.json'), '{}', 'utf8')
}

const SENHA_ATIVA = `$script:tasks[$script:senha] = 'Ready'\n`

// Corpo PowerShell do fluxo completo. `pre` roda antes (dublês), `extra` são parâmetros a mais de Invoke-NxActivation.
const fluxo = (root, path, d, { pre = '', wait = 0, extra = '', sleep = false } = {}) => `
${pre}
$lines = [IO.File]::ReadAllLines(${psq(path)})
$b64 = ($lines | Where-Object { $_ -like 'rem NXDATA *' } | Select-Object -First 1).Substring(11).Trim()
$code = Invoke-NxActivation -Root ${psq(root)} -Lines $lines -DataB64 $b64 -Found ${found(d)} -M $M -Run $run -Say $say -Now ([DateTime]::SpecifyKind([DateTime]'2026-10-13T12:00:00', 'Utc')) -WaitSeconds ${wait} ${sleep ? '-Sleep { param($s) }' : ''} ${extra}
Out-Result @{ code = $code; runs = @($script:runs); calls = @($script:calls); said = @($script:said); tasks = $script:tasks; xml = [string]$script:xmlRestored }`

const lerLog = (root) => (existsSync(join(root, 'ativar.log')) ? readFileSync(join(root, 'ativar.log'), 'utf8') : '')
const segredos = (extra = []) => [bundle.bootstrap, bundle.uuid, 'TOKEN-ANTIGO', Buffer.from(JSON.stringify(bundle)).toString('base64'), ...extra]
const semSegredoNoLog = (root) => { const l = lerLog(root); for (const s of segredos()) assert.ok(!l.includes(s), 'segredo no log') }

// ---------- 1) preflight: nada é alterado ----------
test('preflight: ID da autorização diferente do da máquina sai com erro claro e ZERO alterações (sem pasta e com agente antigo)', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    // máquina sem pasta de dados: a pasta nem chega a ser criada
    const root1 = join(d, 'A', 'Nextec', 'Acesso')
    let out = runPs(fluxo(root1, path, d), {}, { peer: OUTRO_ID, guid: GUID })
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /outra máquina/)
    assert.equal(out.json.runs.length, 0, 'coordenador nunca chamado')
    assert.deepEqual(out.json.calls, [], 'nenhuma tarefa parada, desativada ou iniciada')
    assert.deepEqual(out.json.tasks, {}, 'nenhuma tarefa registrada')
    assert.equal(existsSync(root1), false, 'a pasta de dados não foi criada')
    // servidor com agente antigo e tarefa de senha ativa
    const root2 = join(d, 'B', 'Nextec', 'Acesso')
    montarAgenteAntigo(root2)
    const antes = estado(root2)
    out = runPs(fluxo(root2, path, d, { pre: SENHA_ATIVA }), {}, { peer: OUTRO_ID, guid: GUID })
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /outra máquina/)
    assert.deepEqual(estado(root2), antes)
    assert.deepEqual(out.json.calls, [])
    assert.deepEqual(out.json.tasks, { [TAREFA_SENHA]: 'Ready' })
    assert.equal(readFileSync(join(root2, 'agente-senha.json'), 'utf8'), CFG)
    semSegredoNoLog(root2)
  })
})

test('preflight: uuid da autorização diferente do MachineGuid local sai com ZERO alterações', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)
    const antes = estado(root)
    const out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA }), {}, { peer: bundle.id, guid: 'outra-maquina-guid-9999' })
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /outra máquina/)
    assert.deepEqual(estado(root), antes)
    assert.deepEqual(out.json.calls, [])
    assert.deepEqual(out.json.runs, [])
    assert.deepEqual(out.json.tasks, { [TAREFA_SENHA]: 'Ready' })
    semSegredoNoLog(root)
  })
})

test('preflight: autorização vencida (NXEXP) sai com código 3 e ZERO alterações', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)
    const antes = estado(root)
    const venceu = Math.floor(NOW / 1000) - 1   // o relógio do teste é NOW: um segundo depois do prazo
    const out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA, extra: `-Expires ${venceu}` }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 3)
    assert.match(out.json.said[0], /15 minutos/)
    assert.deepEqual(estado(root), antes)
    assert.deepEqual(out.json.calls, [])
    assert.deepEqual(out.json.runs, [])
    // dentro do prazo o mesmo arquivo segue (a conferência é por segundo, no relógio injetado)
    const dentro = runPs(fluxo(join(d, 'Outro', 'Acesso'), path, d, { extra: `-Expires ${Math.floor(NOW / 1000) + 900}` }))
    assert.notEqual(dentro.json.code, 3)
  })
})

test('preflight: sem administrador, ID do app ilegível (CLI sem resposta) ou serviço ausente não alteram nada', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)
    const antes = estado(root)
    let out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA, extra: '-IsAdmin $false' }))
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /administrador/)
    out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA + '$script:TestPeerFail = $true\n' }))
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /Não foi possível identificar o ID/)
    out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA + '$script:NxIdHooks.Services = @()\n' }))
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /Não foi possível identificar o ID/)
    out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA + "$script:TestGuid = ''\n" }))
    assert.equal(out.json.code, 1)
    assert.deepEqual(estado(root), antes)
    assert.deepEqual(out.json.calls, [])
    assert.deepEqual(out.json.runs, [])
  })
})

test('preflight: NXDATA fora do formato, painel diferente do marcador e ativação já pendente não alteram nada', { skip }, async () => {
  await withDir(async (d) => {
    const { text } = await prepararCmd(d)
    const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o), 'utf8').toString('base64')
    const ruins = {
      campoExtra: b64({ ...bundle, extra: 'x' }),
      idCurto: b64({ ...bundle, id: '12' }),
      idComLetra: b64({ ...bundle, id: '5368221a9' }),
      painelHttp: b64({ ...bundle, painel: 'http://painel-remoto.nex.tec.br' }),
      bootstrapCurto: b64({ ...bundle, bootstrap: 'curto' }),
      uuidVazio: b64({ ...bundle, uuid: ' ' }),
      numero: b64({ ...bundle, id: 536822159 }),
      jsonQuebrado: b64('{"painel":'),
      naoBase64: 'isto nao e base64!!!',
      vazio: '',
      grande: b64({ ...bundle, uuid: 'u'.repeat(5000) }),
    }
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)
    const antes = estado(root)
    for (const [nome, dado] of Object.entries(ruins)) {
      const arq = join(d, `${nome}.cmd`)
      writeFileSync(arq, text.replace(/rem NXDATA \S+/, `rem NXDATA ${dado}`), 'latin1')
      const out = runPs(fluxo(root, arq, d, { pre: SENHA_ATIVA }))
      assert.equal(out.status, 0, `${nome}: ${out.stderr}${out.stdout}`)
      assert.equal(out.json.code, 1, nome)
      assert.match(out.json.said[0], /inválida/, nome)
      assert.deepEqual(estado(root), antes, nome)
      assert.deepEqual(out.json.calls, [], nome)
      assert.deepEqual(out.json.runs, [], nome)
    }
    // marcador com outro painel: o coordenador recusaria (invalid_panel); o preflight já recusa sem tocar em nada
    const { path } = await prepararCmd(d)
    writeFileSync(join(root, 'nextec-marker.json'), '{"painel":"https://outro.exemplo.com"}', 'utf8')
    const antesMarcador = estado(root)
    let out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA }))
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /inválida/)
    assert.deepEqual(estado(root), antesMarcador)
    assert.deepEqual(out.json.calls, [])
    // já existe uma ativação aguardando o coordenador
    writeFileSync(join(root, 'nextec-marker.json'), '{"painel":"https://painel-remoto.nex.tec.br"}', 'utf8')
    writeFileSync(join(root, 'bootstrap.json'), 'pendente', 'utf8')
    const antesPendente = estado(root)
    out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA }))
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /em andamento/)
    assert.deepEqual(estado(root), antesPendente)
    assert.deepEqual(out.json.calls, [])
    assert.deepEqual(out.json.runs, [])
  })
})

// ---------- 2) rollback: o painel (ou o coordenador) recusa depois de a instalação ter começado ----------
const RECUSAS = [
  { nome: 'identity_conflict (outro ID no coordenador)', pre: "$script:receberCode = 1; $script:receberOut = 'identity_conflict'", diz: /outra máquina/ },
  { nome: 'pending_authorization', pre: "$script:receberCode = 1; $script:receberOut = 'pending_authorization'", diz: /em andamento/ },
  { nome: 'invalid_input (arquivo recusado)', pre: "$script:receberCode = 1; $script:receberOut = 'invalid_input'", diz: /inválida/ },
  { nome: 'invalid_panel', pre: "$script:receberCode = 1; $script:receberOut = 'invalid_panel'", diz: /inválida/ },
  { nome: 'invalid_identity', pre: "$script:receberCode = 1; $script:receberOut = 'invalid_identity'", diz: /inválida/ },
  { nome: 'already_enrolled (token antigo reconhecido)', pre: "$script:receberCode = 1; $script:receberOut = 'already_enrolled'", diz: /já está cadastrado/ },
  { nome: 'panel_unreachable', pre: "$script:receberCode = 1; $script:receberOut = 'panel_unreachable'", diz: /falar com o painel/ },
  { nome: 'unsafe_path', pre: "$script:receberCode = 1; $script:receberOut = 'unsafe_path'", diz: /protegida/ },
  { nome: 'saída 1 sem código conhecido', pre: "$script:receberCode = 1; $script:receberOut = 'algo inesperado'", diz: /Não foi possível ativar/ },
  { nome: '401 do painel (manual_authorization_required no log)', pre: "$script:receberLog = 'manual_authorization_required'", diz: /inválida/ },
  { nome: 'identity_conflict no log do coordenador', pre: "$script:receberLog = 'identity_conflict'", diz: /outra máquina/ },
  { nome: '409 do painel (already_enrolled no log)', pre: "$script:receberLog = 'already_enrolled'", diz: /recusou um novo/ },
]
for (const r of RECUSAS) {
  test(`rollback: recusa "${r.nome}" com agente antigo restaura o estado original byte a byte`, { skip }, async () => {
    await withDir(async (d) => {
      const { path } = await prepararCmd(d)
      const root = join(d, 'PD', 'Nextec', 'Acesso')
      montarAgenteAntigo(root)
      const antes = estado(root)
      const hashCfg = sha(readFileSync(join(root, 'agente-senha.json')))
      const out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA + '$script:receberMutate = $true\n' + r.pre + '\n' }))
      assert.equal(out.status, 0, out.stderr + out.stdout)
      const j = out.json
      assert.equal(j.code, 1, JSON.stringify(j.said))
      assert.match(j.said[0], r.diz)
      assert.match(j.said[j.said.length - 1], /Nada foi mantido/)
      // o fluxo realmente começou (instalou, registrou, entregou) ...
      assert.ok(j.runs.some(x => /^-Registrar /.test(x.Args)), 'registrou o coordenador')
      assert.ok(j.runs.some(x => /^-Receber /.test(x.Args)), 'entregou a autorização')
      assert.ok(j.calls.includes('disable:' + TAREFA_SENHA), 'desativou a tarefa antiga')
      // ... e tudo foi desfeito
      assert.deepEqual(estado(root), antes, 'mesmos arquivos, mesmos SHA-256, mesmas pastas')
      assert.equal(sha(readFileSync(join(root, 'agente-senha.json'))), hashCfg, 'agente-senha.json byte a byte')
      assert.equal(readFileSync(join(root, 'Agente-Senha-Nextec.ps1'), 'utf8'), ANTIGO)
      assert.ok(!(TAREFA_COORD in j.tasks), 'a tarefa nova do coordenador foi desregistrada')
      assert.equal(j.tasks[TAREFA_SENHA], 'Ready', 'a tarefa antiga voltou a ficar ativa')
      assert.ok(j.calls.includes('enable:' + TAREFA_SENHA))
      assert.ok(!readdirSync(root).some(f => f.includes('.antigo-') || f.startsWith('ativar-') || f.startsWith('.nx-') || f === 'bootstrap.json' || f === 'nextec-marker.json'))
      assert.match(lerLog(root), /rollback_ok/)
      semSegredoNoLog(root)
    })
  })
}

test('rollback: falha ao registrar o coordenador (-Registrar) desfaz scripts, tarefa e backup', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)
    const antes = estado(root)
    const out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA + "$script:registrarCode = 1; $script:registrarOut = 'unsafe_path'\n" }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.code, 1)
    assert.match(j.said[0], /protegida/)
    assert.equal(j.runs.length, 1, 'a autorização nunca foi entregue')
    assert.deepEqual(estado(root), antes)
    assert.ok(!(TAREFA_COORD in j.tasks))
    assert.equal(j.tasks[TAREFA_SENHA], 'Ready')
    semSegredoNoLog(root)
  })
})

test('rollback parcial: falha no meio da gravação dos scripts deixa a pasta como estava', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)
    const antes = estado(root)
    const falhaNoSegundo = `$script:orig = \${function:Set-NxScript}
$script:nSet = 0
function Set-NxScript { param($Root, $Name, $Bytes, $Stamp) $script:nSet++; if ($script:nSet -eq 2) { throw 'falha_simulada_de_disco' }; & $script:orig -Root $Root -Name $Name -Bytes $Bytes -Stamp $Stamp }
`
    const out = runPs(fluxo(root, path, d, { pre: SENHA_ATIVA + falhaNoSegundo }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.code, 1)
    assert.match(j.said[0], /Não foi possível ativar/)
    assert.equal(j.runs.length, 0, 'nem registrou nem entregou')
    assert.deepEqual(estado(root), antes, 'o primeiro script gravado e o .antigo dele sumiram; o original voltou')
    assert.equal(readFileSync(join(root, 'Coordenar-Agente-Nextec.ps1'), 'utf8'), '# coordenador antigo\r\n')
    assert.equal(j.tasks[TAREFA_SENHA], 'Ready')
    assert.ok(!(TAREFA_COORD in j.tasks))
    semSegredoNoLog(root)
  })
})

test('rollback parcial em máquina sem pasta de dados: sobra só o ativar.log (sem scripts, sem tarefa)', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    const falhaNoTerceiro = `$script:orig = \${function:Set-NxScript}
$script:nSet = 0
function Set-NxScript { param($Root, $Name, $Bytes, $Stamp) $script:nSet++; if ($script:nSet -eq 3) { throw 'falha_simulada_de_disco' }; & $script:orig -Root $Root -Name $Name -Bytes $Bytes -Stamp $Stamp }
`
    const out = runPs(fluxo(root, path, d, { pre: falhaNoTerceiro }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 1)
    assert.deepEqual(readdirSync(root), ['ativar.log'])
    assert.deepEqual(out.json.tasks, {})
    assert.deepEqual(out.json.runs, [])
    assert.match(lerLog(root), /rollback_ok/)
  })
})

test('rollback: tarefa do coordenador que já existia é restaurada pelo XML de antes (não só removida)', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)   // scripts diferentes: o fluxo registra o coordenador de novo (-Force) antes de falhar
    const antes = estado(root)
    const pre = SENHA_ATIVA + `$script:tasks[$script:coord] = 'Ready'\n$script:receberMutate = $true; $script:receberCode = 1; $script:receberOut = 'identity_conflict'\n`
    const out = runPs(fluxo(root, path, d, { pre }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.code, 1)
    assert.ok(j.runs.some(x => /^-Registrar /.test(x.Args)))
    assert.ok(j.calls.includes('register-xml:' + TAREFA_COORD), 'recadastrou a tarefa com o XML exportado antes')
    assert.ok(!j.calls.includes('unregister:' + TAREFA_COORD))
    assert.equal(j.xml, `<Task original="${TAREFA_COORD}" state="Ready"/>`)
    assert.equal(j.tasks[TAREFA_COORD], 'Ready')
    assert.deepEqual(estado(root), antes)
  })
})

test('rollback: máquina nova (sem agente antigo) volta a não ter nada, e o log não leva segredos', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    const out = runPs(fluxo(root, path, d, { pre: "$script:receberCode = 1; $script:receberOut = 'identity_conflict'\n" }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.code, 1)
    assert.deepEqual(readdirSync(root), ['ativar.log'], 'scripts, marcador e pasta temporária desfeitos')
    assert.ok(!(TAREFA_COORD in j.tasks))
    assert.ok(!j.calls.some(c => c.startsWith('disable:')), 'sem agente antigo a tarefa de senha nem é tocada')
    semSegredoNoLog(root)
    assert.ok(!j.said.join('\n').includes(bundle.bootstrap))
  })
})

// ---------- 3) sucesso e idempotência ----------
test('sucesso: com agente antigo substituído, as alterações ficam (scripts, backup, tarefa) e nada é desfeito', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    montarAgenteAntigo(root)
    const pre = SENHA_ATIVA + `$script:receberCreates = ${psq(join(root, 'agente-senha.json'))}\n`
    const out = runPs(fluxo(root, path, d, { pre, wait: 6, sleep: true }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    const j = out.json
    assert.equal(j.code, 0, JSON.stringify(j.said))
    assert.deepEqual(j.said, ['Pronto: máquina ativada. Pode fechar.'])
    const scripts = lerScripts()
    for (const n of AGENT_PACKAGE_FILES) assert.equal(Buffer.compare(readFileSync(join(root, n)), Buffer.from(scripts[n], 'utf8')), 0, n)
    const arquivos = readdirSync(root)
    assert.ok(arquivos.some(f => f.startsWith('agente-senha.json.antigo-')), 'backup do cadastro antigo mantido')
    assert.ok(arquivos.some(f => f.startsWith('Agente-Senha-Nextec.ps1.antigo-')), 'backup do script antigo mantido')
    assert.equal(j.tasks[TAREFA_COORD], 'Ready')
    assert.equal(j.tasks[TAREFA_SENHA], 'Disabled', 'a tarefa antiga fica desativada (o agente novo a substitui)')
    assert.ok(!j.calls.includes('enable:' + TAREFA_SENHA))
    assert.doesNotMatch(lerLog(root), /rollback/)
  })
})

test('sucesso pendente (coordenador ainda não confirmou em WaitSeconds) mantém as alterações e sai com 0', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    const out = runPs(fluxo(root, path, d, { wait: 0 }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 0)
    assert.match(out.json.said[0], /Autorização recebida/)
    for (const n of AGENT_PACKAGE_FILES) assert.ok(existsSync(join(root, n)), n)
    assert.equal(out.json.tasks[TAREFA_COORD], 'Ready')
    assert.doesNotMatch(lerLog(root), /rollback/)
  })
})

test('idempotência: segunda execução com autorização já usada (painel recusa) não deixa nada persistente', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    // 1ª execução: máquina nova, ativa de verdade
    let out = runPs(fluxo(root, path, d, { pre: `$script:receberCreates = ${psq(join(root, 'agente-senha.json'))}\n`, wait: 6, sleep: true }))
    assert.equal(out.json.code, 0, JSON.stringify(out.json.said))
    const depoisDoPrimeiro = estado(root)
    assert.ok('agente-senha.json' in depoisDoPrimeiro)
    // 2ª execução (cópia do mesmo .cmd): preflight passa (mesma máquina), o painel reconhece o token e recusa
    const pre = `$script:tasks[$script:coord] = 'Ready'\n$script:receberCode = 1; $script:receberOut = 'already_enrolled'\n`
    out = runPs(fluxo(root, path, d, { pre }))
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.code, 1)
    assert.match(out.json.said[0], /já está cadastrado/)
    assert.deepEqual(estado(root), depoisDoPrimeiro, 'o backup feito na 2ª execução foi removido')
    assert.equal(out.json.tasks[TAREFA_COORD], 'Ready', 'a tarefa do coordenador (da 1ª execução) continua')
    assert.ok(!out.json.calls.includes('unregister:' + TAREFA_COORD))
    semSegredoNoLog(root)
    // 3ª execução com painel que recusa na confirmação (401 no log): idem
    out = runPs(fluxo(root, path, d, { pre: `$script:tasks[$script:coord] = 'Ready'\n$script:receberMutate = $true; $script:receberLog = 'manual_authorization_required'\n` }))
    assert.equal(out.json.code, 1)
    assert.deepEqual(estado(root), depoisDoPrimeiro)
  })
})

// ---------- 4) o leitor de identidade usa as funções oficiais do pacote, só leitura ----------
test('Read-NxLocalIdentity: devolve ID do serviço, uuid = base64(MachineGuid) e o painel configurado; ambíguo ou ausente recusa', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'nextec-marker.json'), '{"painel":"https://painel-remoto.nex.tec.br"}', 'utf8')
    const antes = estado(root)
    const out = runPs(`
$lines = [IO.File]::ReadAllLines(${psq(path)})
$files = Get-NxPackage -Lines $lines
$ok = Get-NxLocalIdentity -Files $files -Root ${psq(root)} -PanelDefault 'https://padrao.exemplo.com'
function Tentar($b) { try { [void](& $b); return 'ok' } catch { return [string]$_.Exception.Message } }
$h = $script:NxIdHooks
$semServico = Tentar { Read-NxLocalIdentity -Files $files -Root ${psq(root)} -Services @() -PeerIdReader $h.PeerIdReader -GuidReader $h.GuidReader }
$semGuid = Tentar { Read-NxLocalIdentity -Files $files -Root ${psq(root)} -Services $h.Services -ProfileRootBase $h.ProfileRootBase -PeerIdReader $h.PeerIdReader -GuidReader { return '   ' } }
$idRuim = Tentar { Read-NxLocalIdentity -Files $files -Root ${psq(root)} -Services $h.Services -ProfileRootBase $h.ProfileRootBase -PeerIdReader { return 'abc' } -GuidReader $h.GuidReader }
Out-Result @{ id = $ok.Id; uuid = $ok.Uuid; panel = $ok.Panel; semServico = $semServico; semGuid = $semGuid; idRuim = $idRuim }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(out.json.id, bundle.id)
    assert.equal(out.json.uuid, Buffer.from(GUID, 'utf8').toString('base64'))
    assert.equal(out.json.panel, 'https://painel-remoto.nex.tec.br', 'o marcador local vale mais que o padrão')
    assert.match(out.json.semServico, /identity_conflict/)
    assert.match(out.json.semGuid, /identity_conflict/)
    assert.match(out.json.idRuim, /identity_conflict/)
    assert.deepEqual(estado(root), antes, 'a descoberta de identidade não grava nada')
  })
})

test('PS 5.1: leitura real da máquina (sem dublês) termina com identidade ou erro e não grava nada', { skip }, async () => {
  await withDir(async (d) => {
    const { path } = await prepararCmd(d)
    const root = join(d, 'PD', 'Nextec', 'Acesso')
    const out = runPs(`
$script:NxIdHooks = $null
$lines = [IO.File]::ReadAllLines(${psq(path)})
$files = Get-NxPackage -Lines $lines
$r = 'ok'
try { [void](Get-NxLocalIdentity -Files $files -Root ${psq(root)} -PanelDefault 'https://painel-remoto.nex.tec.br') } catch { $r = [string]$_.Exception.Message }
Out-Result @{ r = $r; existe = [IO.Directory]::Exists(${psq(root)}) }`)
    assert.equal(out.status, 0, out.stderr + out.stdout)
    assert.equal(typeof out.json.r, 'string')
    assert.equal(out.json.existe, false)
  })
})

// ---------- 5) amarração do arquivo gerado ----------
test('o .cmd passa prazo e administrador ao fluxo e o preflight vem antes de qualquer gravação, tarefa ou registro', async () => {
  const text = buildActivationCmd(bundle, NOW, await pacoteReal())
  assert.match(text, /Invoke-NxActivation .* -Expires \$exp -IsAdmin \$admin\)\[-1\]/)
  assert.match(text, /'expired' = \(/, 'a mensagem de prazo vencido também chega ao fluxo')
  assert.match(text, /'rolledBack' = \(/)
  const corpo = INSTALL_AGENT_PS.slice(INSTALL_AGENT_PS.indexOf('function Invoke-NxActivation'))
  const pre = corpo.indexOf('Invoke-NxPreflight -Root')
  assert.ok(pre > 0)
  for (const efeito of ['Initialize-NxRoot -Root', 'Backup-NxFile -Path', 'Stop-ScheduledTask', 'Disable-ScheduledTask', 'Set-NxScript -Root', '& $Run $coord', 'New-NxProtectedFile', 'Write-NxLog $Root \'inicio\'']) {
    assert.ok(corpo.indexOf(efeito) > pre, `${efeito} só depois do preflight`)
  }
  // o preflight em si é só leitura: nenhuma função de escrita nele
  const ini = INSTALL_AGENT_PS.indexOf('function Invoke-NxPreflight')
  const fim = INSTALL_AGENT_PS.indexOf('function Get-NxSddl')
  const preflight = INSTALL_AGENT_PS.slice(ini, fim)
  assert.doesNotMatch(preflight, /New-NxProtectedFile|Set-NxScript|Initialize-NxRoot|Write-NxLog|Backup-NxFile|Set-Acl|ScheduledTask|WriteAll|CreateDirectory|Remove-Item|Out-File|Set-Content/)
})
