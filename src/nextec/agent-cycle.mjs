// Feedback do ciclo do agente: o Nextec-Connect consulta o painel a cada minuto (intervalo único do agente,
// Get-NextecAgentIntervals em Agente-Senha-Nextec.ps1). A partir de `last_seen_at` (segundos, já devolvido pela API)
// estima quando vem a próxima verificação. Módulo puro, testado em nextec/testes/agent-cycle.test.mjs. É uma estimativa
// de exibição: nada aqui decide acesso ou senha.

export const AGENT_CYCLE_SECONDS = 60
// Agentes ainda no ritmo antigo (5 minutos) até o coordenador migrar a tarefa deles: não são tratados como atrasados.
export const LEGACY_AGENT_CYCLE_SECONDS = 300
// Depois de tanto tempo sem contato o agente é tratado como parado (o painel já mostra "sem contato").
export const AGENT_STALLED_SECONDS = 1200

export function nextCheck(lastSeenAt, nowSec = Date.now() / 1000, cycle = AGENT_CYCLE_SECONDS) {
  const seen = Number(lastSeenAt)
  if (!Number.isFinite(seen) || seen <= 0) return { state: 'unknown', minutes: null, text: 'Ainda sem contato do agente.' }
  const elapsed = Math.max(0, nowSec - seen)
  if (elapsed >= AGENT_STALLED_SECONDS) {
    return { state: 'stalled', minutes: null, text: 'Sem contato do agente. Confira se a máquina está ligada e com rede.' }
  }
  if (elapsed >= Math.max(cycle, LEGACY_AGENT_CYCLE_SECONDS)) return { state: 'late', minutes: 0, text: 'Verificação atrasada, deve ocorrer em instantes.' }
  if (elapsed >= cycle) return { state: 'due', minutes: 0, text: 'Próxima verificação em instantes.' }
  const minutes = Math.max(1, Math.ceil((cycle - elapsed) / 60))
  return { state: 'waiting', minutes, text: `Próxima verificação em ~${minutes} min.` }
}

// Atualização leve e pausável: `onTick` renova o relógio da tela (contagem regressiva) e `onRefresh` recarrega a lista
// a cada `refreshMs`. Com a aba oculta não há timer; ao voltar, recarrega na hora. stop() limpa timer e listener.
export function createAutoRefresh({
  onTick = () => {}, onRefresh = () => {}, tickMs = 30000, refreshMs = 60000,
  doc = typeof document !== 'undefined' ? document : null,
  setIntervalFn = (f, ms) => setInterval(f, ms), clearIntervalFn = (h) => clearInterval(h),
} = {}) {
  let handle = null
  let ticks = 0
  let started = false
  const every = Math.max(1, Math.round(refreshMs / tickMs))
  const hidden = () => Boolean(doc && doc.visibilityState === 'hidden')
  const arm = () => {
    if (handle !== null) return
    handle = setIntervalFn(() => {
      ticks++
      onTick()
      if (ticks % every === 0) onRefresh()
    }, tickMs)
  }
  const disarm = () => {
    if (handle === null) return
    clearIntervalFn(handle)
    handle = null
  }
  const onVisibility = () => {
    if (!started) return
    if (hidden()) disarm()
    else {
      onTick()
      onRefresh()
      ticks = 0
      arm()
    }
  }
  return {
    start () {
      if (started) return
      started = true
      if (doc) doc.addEventListener('visibilitychange', onVisibility)
      if (!hidden()) arm()
    },
    stop () {
      started = false
      disarm()
      if (doc) doc.removeEventListener('visibilitychange', onVisibility)
    },
    get running () { return handle !== null },
  }
}
