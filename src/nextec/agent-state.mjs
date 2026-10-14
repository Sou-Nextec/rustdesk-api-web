// Estado do agente derivado de CONTATO REAL, nunca do cadastro. Módulo puro (sem Vue nem rede), testado em
// nextec/testes/agent-state.test.mjs. A API devolve `last_sync_at` (última consulta /agent/sync autenticada) e
// `last_seen_at` (qualquer escrita, inclusive o cadastro). Só `last_sync_at` prova que o agente está vivo.
//
// Estados: ativo | parado | pendente_aprovacao | sem_agente. O servidor calcula o mesmo valor em `agent_state`;
// a tela repete a regra com o relógio dela para o estado envelhecer entre duas atualizações da lista.
// Nada aqui libera acesso: a autorização de reinstalar é decidida pelo backend.
import { AGENT_CYCLE_SECONDS } from './agent-cycle.mjs'

export const ACTIVE_CYCLES = 3
export const ACTIVE_WINDOW_SECONDS = AGENT_CYCLE_SECONDS * ACTIVE_CYCLES

export const AGENT_STATE = Object.freeze({
  ACTIVE: 'ativo',
  STALLED: 'parado',
  PENDING: 'pendente_aprovacao',
  NONE: 'sem_agente',
})
const KNOWN = new Set(Object.values(AGENT_STATE))

const seconds = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const has = (v) => v !== undefined && v !== null

// Instante (segundos) da última consulta real. Servidor sem `last_sync_at` (versão anterior do painel) cai em
// `last_seen_at`, que era o melhor dado que existia.
export function lastContactAt(d = {}) {
  if (!d || typeof d !== 'object') return 0
  return has(d.last_sync_at) ? seconds(d.last_sync_at) : seconds(d.last_seen_at)
}

export function agentState(d, now = Date.now() / 1000) {
  if (!d || typeof d !== 'object') return AGENT_STATE.NONE
  if (d.state === 'pending') return AGENT_STATE.PENDING
  if (!d.enrolled) return AGENT_STATE.NONE
  if (!has(d.last_sync_at) && KNOWN.has(d.agent_state)) return d.agent_state
  const last = lastContactAt(d)
  if (last > 0 && now - last < ACTIVE_WINDOW_SECONDS) return AGENT_STATE.ACTIVE
  return AGENT_STATE.STALLED
}

// "há 3 min", "há 2 h", "há 4 dias". Sem número de segundos exato: a tela só precisa da ordem de grandeza.
export function quietFor(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  if (s < 60) return 'menos de 1 min'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h`
  return `${Math.floor(h / 24)} dias`
}

export const REINSTALL_HINT = 'Reinstale o agente.'
export const ACTIVE_AGENT_NOTICE = 'O agente desta máquina está ativo e consultando o painel. Não é preciso reinstalar. Para trocá-lo, use Remover agente e gere uma nova autorização.'
export const REMOVE_AGENT_HELP = 'Remover agente apaga o cadastro e as senhas guardadas desta máquina. A senha que está nela continua valendo até você trocá-la ou reinstalar o agente.'

// Texto de situação de uma máquina, pronto para a tela.
// { state, tone: 'ok' | 'warn' | 'off', headline, detail, lastAt, waitingFirst }
export function agentContact(d, now = Date.now() / 1000) {
  const state = agentState(d, now)
  const lastAt = lastContactAt(d)
  if (state === AGENT_STATE.ACTIVE) {
    return { state, tone: 'ok', headline: 'Agente ativo', detail: `última consulta há ${quietFor(now - lastAt)}`, lastAt, waitingFirst: false }
  }
  if (state === AGENT_STATE.STALLED) {
    if (lastAt > 0) {
      return {
        state, tone: 'warn', lastAt, waitingFirst: false,
        headline: `Agente cadastrado, mas sem contato há ${quietFor(now - lastAt)}.`, detail: REINSTALL_HINT,
      }
    }
    // Cadastrado e nunca consultou. Logo depois do cadastro ainda é normal esperar a primeira consulta.
    const enrolledAt = seconds(d && d.enrolled_at)
    const waitingFirst = enrolledAt > 0 && now - enrolledAt < ACTIVE_WINDOW_SECONDS
    return {
      state, tone: 'warn', lastAt: 0, waitingFirst,
      headline: waitingFirst
        ? 'Agente cadastrado, aguardando a primeira consulta.'
        : 'Agente cadastrado, mas nunca consultou o painel.',
      detail: waitingFirst ? `Se não consultar em até ${Math.round(ACTIVE_WINDOW_SECONDS / 60)} min, reinstale o agente.` : REINSTALL_HINT,
    }
  }
  if (state === AGENT_STATE.PENDING) {
    return { state, tone: 'warn', headline: 'Aguardando aprovação', detail: '', lastAt, waitingFirst: false }
  }
  return { state, tone: 'off', headline: 'Agente não cadastrado', detail: '', lastAt: 0, waitingFirst: false }
}
