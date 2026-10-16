// Estado do agente derivado de CONTATO REAL, nunca do cadastro. Módulo puro (sem Vue nem rede), testado em
// nextec/testes/agent-state.test.mjs. A API devolve `last_sync_at` (última consulta /agent/sync autenticada) e
// `last_seen_at` (qualquer escrita, inclusive o cadastro). Só `last_sync_at` prova que o agente está vivo.
//
// Estados: ativo | parado | pendente_aprovacao | sem_agente. FONTE ÚNICA: o servidor decide em `agent_state` com a
// janela do intervalo REAL de cada agente (3 intervalos informados no sync, de 180 a 900 s; agente antigo sem o campo
// vale 5 min, ou seja, 900 s) e a tela só exibe, sem recalcular janela (a lista é recarregada a cada minuto).
// Só um servidor anterior ao campo `agent_state` cai na regra local, com a janela legada de 900 s.
// Nada aqui libera acesso: a autorização de reinstalar é decidida pelo backend.

// Janela legada (agente de 5 minutos x 3), usada apenas quando o servidor não manda agent_state/active_window_seconds.
export const LEGACY_ACTIVE_WINDOW_SECONDS = 900

// A máquina conta como desligada ou sem internet quando o servidor do RustDesk não a vê há mais que isto (o app avisa a cada
// ~15 s). Sem o dado (`peer_last_online` ausente), nada é presumido: vale o diagnóstico antigo.
export const MACHINE_OFFLINE_SECONDS = 180

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

// Janela de "ativo" desta máquina como o servidor a calculou (só para textos de espera, nunca para decidir o estado).
export function activeWindowSeconds(d) {
  const w = d && typeof d === 'object' ? seconds(d.active_window_seconds) : 0
  return w > 0 ? w : LEGACY_ACTIVE_WINDOW_SECONDS
}

// true só quando sabemos a última vez que o app da máquina falou com o servidor e ela passou da janela.
export function machineOffline(d, now = Date.now() / 1000) {
  const at = d && typeof d === 'object' ? seconds(d.peer_last_online) : 0
  return at > 0 && now - at > MACHINE_OFFLINE_SECONDS
}

export function agentState(d, now = Date.now() / 1000) {
  if (!d || typeof d !== 'object') return AGENT_STATE.NONE
  if (d.state === 'pending') return AGENT_STATE.PENDING
  if (!d.enrolled) return AGENT_STATE.NONE
  if (KNOWN.has(d.agent_state)) return d.agent_state
  const last = lastContactAt(d)
  if (last > 0 && now - last < LEGACY_ACTIVE_WINDOW_SECONDS) return AGENT_STATE.ACTIVE
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

// Último erro do agente (`last_error`, código estável que o agente manda no sync). O servidor limpa quando uma rodada
// termina sem erro ou a troca é confirmada. Código desconhecido ainda aparece, com orientação genérica.
export const AGENT_ERRORS = Object.freeze({
  client_settings_locked: {
    message: 'as configurações do app nesta máquina estão bloqueadas, então o agente não consegue gravar a senha.',
    action: 'Gere o instalador de novo e instale por cima.',
  },
  password_apply_failed: {
    message: 'o app recusou aplicar a senha nova.',
    action: 'Confira se o app está instalado e em execução. Se continuar, reinstale o agente.',
  },
  exe_not_found: {
    message: 'o agente não encontrou o app instalado nesta máquina.',
    action: 'Instale de novo o app gerado pelo painel.',
  },
})

export function agentError(d) {
  const code = d && typeof d.last_error === 'string' ? d.last_error.trim() : ''
  if (!code) return null
  const known = AGENT_ERRORS[code]
  const info = known || {
    message: `o agente informou o erro ${code}.`,
    action: 'Veja o log do agente na máquina, em %ProgramData%\\Nextec\\Acesso.',
  }
  return { code, at: seconds(d.last_error_at), text: `A troca de senha está falhando: ${info.message}`, ...info }
}

// Texto de situação de uma máquina, pronto para a tela.
// { state, tone: 'ok' | 'warn' | 'off', headline, detail, lastAt, waitingFirst }
export function agentContact(d, now = Date.now() / 1000) {
  const state = agentState(d, now)
  const lastAt = lastContactAt(d)
  if (state === AGENT_STATE.ACTIVE) {
    return { state, tone: 'ok', headline: 'Agente ativo', detail: `última consulta há ${quietFor(now - lastAt)}`, lastAt, waitingFirst: false }
  }
  if (state === AGENT_STATE.STALLED) {
    // Agente quieto porque a máquina está desligada ou sem internet: o agente volta sozinho, reinstalar não adianta.
    if (machineOffline(d, now)) {
      return {
        state, tone: 'off', lastAt, waitingFirst: false, offline: true,
        headline: `Máquina offline há ${quietFor(now - seconds(d.peer_last_online))}.`,
        detail: 'Desligada ou sem internet. O agente volta sozinho quando ela ligar; não precisa reinstalar.',
      }
    }
    if (lastAt > 0) {
      return {
        state, tone: 'warn', lastAt, waitingFirst: false,
        headline: `Agente cadastrado, mas sem contato há ${quietFor(now - lastAt)}.`, detail: REINSTALL_HINT,
      }
    }
    // Cadastrado e nunca consultou. Logo depois do cadastro ainda é normal esperar a primeira consulta.
    const enrolledAt = seconds(d && d.enrolled_at)
    const window = activeWindowSeconds(d)
    const waitingFirst = enrolledAt > 0 && now - enrolledAt < window
    return {
      state, tone: 'warn', lastAt: 0, waitingFirst,
      headline: waitingFirst
        ? 'Agente cadastrado, aguardando a primeira consulta.'
        : 'Agente cadastrado, mas nunca consultou o painel.',
      detail: waitingFirst ? `Se não consultar em até ${Math.max(1, Math.round(window / 60))} min, reinstale o agente.` : REINSTALL_HINT,
    }
  }
  if (state === AGENT_STATE.PENDING) {
    return { state, tone: 'warn', headline: 'Aguardando aprovação', detail: '', lastAt, waitingFirst: false }
  }
  return { state, tone: 'off', headline: 'Agente não cadastrado', detail: '', lastAt: 0, waitingFirst: false }
}
