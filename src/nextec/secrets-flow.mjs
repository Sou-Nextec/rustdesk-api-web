// Fluxo guiado da tela "Senhas dos servidores": em que etapa cada máquina está e qual é o próximo passo.
// Módulo puro (sem Vue nem rede), testado em nextec/testes/secrets-flow.test.mjs.
// Etapas: 1 Cliente, 2 Agente, 3 Senha automática. Nada aqui libera acesso: aprovação, identidade (UUID) e regras
// continuam sendo decididas pelo backend; este módulo só escolhe o texto e o botão certos para cada estado.
// A etapa 2 só conta como concluída com CONTATO REAL do agente (agent-state.mjs): cadastro sem consulta é "parado".
import { agentState, AGENT_STATE, ACTIVE_AGENT_NOTICE, machineOffline } from './agent-state.mjs'

export const STEPS = [
  { key: 'client', label: 'Cliente' },
  { key: 'agent', label: 'Agente' },
  { key: 'rule', label: 'Senha automática' },
]

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const hasClient = (d = {}) => Number(d.group_id) > 0
export const isPending = (d = {}) => d.state === 'pending'

const nowSeconds = () => Date.now() / 1000

// Etapa atual: 'client' | 'agent' | 'rule' | 'ready'. Agente parado volta à etapa 2; "ready" exige consulta real.
export function machineStage(d = {}, now = nowSeconds()) {
  if (isPending(d) || !hasClient(d)) return 'client'
  const st = agentState(d, now)
  if (st === AGENT_STATE.PENDING) return 'client'
  if (st !== AGENT_STATE.ACTIVE) return 'agent'
  if (!d.managed) return 'rule'
  return 'ready'
}

export const isStalled = (d = {}, now = nowSeconds()) => agentState(d, now) === AGENT_STATE.STALLED

// Agente quieto porque a máquina está desligada ou sem internet: nada a reinstalar, é só esperar ela ligar.
export const isOfflineStall = (d = {}, now = nowSeconds()) => isStalled(d, now) && machineOffline(d, now)

// Três etapas com estado 'done' | 'current' | 'todo' e o rótulo da etapa atual para o stepper compacto.
export function machineSteps(d = {}, now = nowSeconds()) {
  const stage = machineStage(d, now)
  const at = stage === 'ready' ? STEPS.length : STEPS.findIndex(s => s.key === stage)
  const steps = STEPS.map((s, i) => ({ ...s, number: i + 1, status: i < at ? 'done' : i === at ? 'current' : 'todo' }))
  const current = steps.find(s => s.status === 'current')
  return {
    stage,
    steps,
    caption: current
      ? `Etapa ${current.number} de ${STEPS.length}: ${current.label}${stage === 'agent' && isOfflineStall(d, now) ? ' (máquina offline)' : stage === 'agent' && isStalled(d, now) ? ' parado' : ''}`
      : 'Tudo pronto',
    doneCount: steps.filter(s => s.status === 'done').length,
  }
}

const NEXT = {
  client: { action: 'choose-client', label: 'Escolher cliente', hint: 'Diga de qual cliente é esta máquina.' },
  agent: { action: 'install-agent', label: 'Instalar agente', hint: 'Baixe a autorização e dê duplo clique no servidor.' },
  rule: { action: 'enable-rule', label: 'Ligar senha automática', hint: 'Ligue a troca automática da senha nesta máquina.' },
  ready: { action: 'connect', label: 'Conectar', hint: 'Pronta. Conecte sem digitar a senha.' },
}

const NEXT_OFFLINE = {
  action: 'wait-machine',
  label: 'Aguardando a máquina',
  hint: 'A máquina está desligada ou sem internet. O agente volta sozinho quando ela ligar.',
}

const NEXT_STALLED = {
  action: 'reinstall-agent',
  label: 'Reinstalar agente',
  hint: 'O agente está cadastrado, mas parou de consultar o painel. Reinstale com o mesmo arquivo de ativação.',
}

// Um único botão primário por máquina. Pronta: Conectar, com "Trocar agora" como ação secundária.
export function nextStep(d = {}, now = nowSeconds()) {
  const stage = machineStage(d, now)
  const base = { stage, ...(stage === 'agent' && isOfflineStall(d, now) ? NEXT_OFFLINE : stage === 'agent' && isStalled(d, now) ? NEXT_STALLED : NEXT[stage]) }
  if (stage === 'ready') return { ...base, secondary: { action: 'rotate', label: 'Trocar agora' } }
  return { ...base, secondary: null }
}

// Resumo da lista inteira: contagens por etapa e um único CTA contextual para o topo da tela.
export function overallSummary(devices = [], now = nowSeconds()) {
  const rows = devices.filter(d => d && typeof d === 'object')
  const c = { client: 0, agent: 0, rule: 0, ready: 0 }
  let stalled = 0
  let offline = 0
  for (const d of rows) {
    const stage = machineStage(d, now)
    c[stage]++
    if (stage === 'agent' && isOfflineStall(d, now)) offline++
    else if (stage === 'agent' && isStalled(d, now)) stalled++
  }
  const total = rows.length
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  let cta = null
  let text
  if (!total) {
    text = 'Nenhuma máquina ainda. Instale o app gerado pelo painel em um servidor e aguarde 1 minuto.'
    cta = { action: 'show-key', label: 'Ver credencial de inscrição' }
  } else if (c.client) {
    text = `Você tem ${plural(c.client, 'máquina sem cliente', 'máquinas sem cliente')}.`
    cta = { action: 'choose-client', label: 'Escolher cliente' }
  } else if (stalled) {
    text = `${plural(stalled, 'máquina com agente parado', 'máquinas com agente parado')}. Reinstale o agente.`
    cta = { action: 'reinstall-agent', label: 'Reinstalar agente' }
  } else if (offline && offline === c.agent) {
    text = `${plural(offline, 'máquina offline', 'máquinas offline')}. O agente volta sozinho quando ligar.`
  } else if (c.agent) {
    text = `${plural(c.agent, 'máquina precisa', 'máquinas precisam')} do agente.`
    cta = { action: 'install-agent', label: 'Instalar agente' }
  } else if (c.rule) {
    text = `${plural(c.rule, 'máquina está', 'máquinas estão')} com a senha automática desligada.`
    cta = { action: 'enable-rule', label: 'Ligar senha automática' }
  } else {
    text = `Tudo pronto: ${plural(c.ready, 'máquina troca', 'máquinas trocam')} a senha sozinha.`
  }
  return { total, counts: c, stalled, offline, text, cta }
}

// Primeira máquina que ainda precisa da etapa pedida (ordem da lista recebida), para o CTA do topo.
// stage 'stalled' pede a primeira máquina com agente cadastrado porém parado.
export function firstNeeding(devices = [], stage, now = nowSeconds()) {
  if (stage === 'stalled') return devices.find(d => d && machineStage(d, now) === 'agent' && isStalled(d, now) && !isOfflineStall(d, now)) || null
  return devices.find(d => d && machineStage(d, now) === stage) || null
}

export const OFFLINE_AGENT_NOTICE = 'A máquina está desligada ou sem internet. O agente volta sozinho quando ela ligar; não é preciso reinstalar.'
export const NEEDS_CLIENT_NOTICE = 'Esta máquina ainda não tem cliente. Escolha o cliente para continuar.'
export const AGENT_EMPTY_NOTICE = 'Nenhuma máquina encontrada. Instale o app gerado pelo painel na máquina e aguarde 1 minuto.'

// Autorização individual: lista TODAS as máquinas. As sem cliente aparecem com selo e levam a "Escolher cliente agora".
// Agente ATIVO não precisa de novo arquivo (o backend recusa): a tela explica em vez de oferecer o download.
export function agentOptions(devices = [], now = nowSeconds()) {
  return devices
    .filter(d => d && d.peer_id)
    .map(d => {
      const needsClient = machineStage(d, now) === 'client'
      const st = agentState(d, now)
      const active = !needsClient && st === AGENT_STATE.ACTIVE
      const offline = !needsClient && isOfflineStall(d, now)
      const stalled = !needsClient && st === AGENT_STATE.STALLED && !offline
      return {
        peer_id: d.peer_id,
        name: d.alias || d.hostname || 'Máquina',
        needsClient,
        agentActive: active,
        agentStalled: stalled,
        agentOffline: offline,
        badge: needsClient ? 'sem cliente' : active ? 'agente ativo' : offline ? 'máquina offline' : stalled ? 'agente parado' : '',
        // máquina desligada: reinstalar não adianta, o agente volta sozinho quando ela ligar
        canAuthorize: !needsClient && !active && !offline,
        notice: active ? ACTIVE_AGENT_NOTICE : offline ? OFFLINE_AGENT_NOTICE : '',
      }
    })
    .sort((a, b) => Number(b.needsClient) - Number(a.needsClient) || a.name.localeCompare(b.name, 'pt-BR'))
}

// Busca de cliente no seletor: sem acento, sem diferenciar maiúsculas.
export function filterClients(groups = [], term = '') {
  const t = norm(term)
  return groups.filter(g => g && g.name && (!t || norm(g.name).includes(t)))
}

// Nome exato (sem acento e caixa) já existente: evita criar cliente duplicado.
export function findClientByName(groups = [], name = '') {
  const t = norm(name)
  return t ? groups.find(g => g && norm(g.name) === t) || null : null
}

// Valida o nome digitado para um cliente novo. Devolve { ok, name, error, existing? }.
export function newClientName(raw = '', groups = []) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim()
  if (name.length < 2) return { ok: false, name, error: 'Digite o nome do cliente (mínimo 2 letras).' }
  if (name.length > 60) return { ok: false, name, error: 'Use até 60 caracteres no nome do cliente.' }
  const existing = findClientByName(groups, name)
  if (existing) return { ok: false, name, error: 'Já existe um cliente com este nome. Escolha-o na lista.', existing }
  return { ok: true, name, error: '' }
}

// Corpo do POST /peer/update (mesmo contrato do "Mover para um cliente" em Dispositivos): o cadastro completo da
// máquina volta com o novo group_id. Sem row_id não há como mover.
const PEER_FIELDS = { id: '', alias: '', username: '', hostname: '', os: '', version: '', cpu: '', memory: '', uuid: '' }
export function movePayload(peerRow, groupId) {
  if (!peerRow || !peerRow.row_id || !(Number(groupId) > 0)) return null
  const body = { row_id: peerRow.row_id, group_id: Number(groupId) }
  for (const k of Object.keys(PEER_FIELDS)) body[k] = peerRow[k] ?? PEER_FIELDS[k]
  return body
}

// Regra padrão ao atribuir uma pendente: a do cliente se estiver ligada; senão 'group-enable', que liga a regra do
// cliente junto com a atribuição (o servidor faz as duas coisas na mesma transação). O operador não precisa passar
// por Regras antes.
export function defaultAssignRule(groupRuleOn) {
  return groupRuleOn ? 'group' : 'group-enable'
}

// O que fazer logo depois de vincular o cliente: segue para a próxima etapa da máquina já atualizada.
export function afterClientStep(device) {
  const n = nextStep(device)
  return n.stage === 'client' ? { action: 'stay', label: '' } : { action: n.action, label: n.label }
}

export function friendlyError(err, fallback) {
  const m = err && err.message ? String(err.message) : ''
  return m && m.length < 220 ? m : fallback
}
