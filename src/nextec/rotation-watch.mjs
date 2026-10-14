// Acompanha uma troca pedida em "Trocar agora" (ou a primeira troca depois de ligar a senha automática) até a senha
// mudar, sem o administrador precisar recarregar a tela. O agente consulta o painel a cada minuto, então a troca costuma
// aparecer em até 1 a 2 minutos. Módulo puro, testado em nextec/testes/rotation-watch.test.mjs.
//
// Leve por construção: um único timer para todas as máquinas observadas, uma recarga da lista por rodada, nenhuma
// recarga com a aba oculta (a rodada é pulada, não acumulada) e desistência depois de `maxMs`.

export const ROTATION_NOTICE = 'A troca começa em até 1 minuto. A tela se atualiza sozinha.'
export const ROTATION_WAIT_MS = 15000
export const ROTATION_GIVE_UP_MS = 180000

export function createRotationWatch ({
  reload = async () => {},
  versionOf = () => 0,
  onSettled = () => {},
  onGiveUp = () => {},
  intervalMs = ROTATION_WAIT_MS,
  maxMs = ROTATION_GIVE_UP_MS,
  doc = typeof document !== 'undefined' ? document : null,
  now = () => Date.now(),
  setTimeoutFn = (f, ms) => setTimeout(f, ms),
  clearTimeoutFn = (h) => clearTimeout(h),
} = {}) {
  const watched = new Map()
  let handle = null
  let busy = false
  let stopped = false
  const hidden = () => Boolean(doc && doc.visibilityState === 'hidden')

  const schedule = () => {
    if (stopped || handle !== null || watched.size === 0) return
    handle = setTimeoutFn(round, intervalMs)
  }

  async function round () {
    handle = null
    if (stopped || watched.size === 0) return
    if (!hidden() && !busy) {
      busy = true
      try { await reload() } catch (e) { /* a próxima rodada tenta de novo */ } finally { busy = false }
      for (const [peerId, entry] of [...watched]) {
        if (Number(versionOf(peerId)) > entry.baseline) {
          watched.delete(peerId)
          onSettled(peerId)
        } else if (now() - entry.startedAt >= maxMs) {
          watched.delete(peerId)
          onGiveUp(peerId)
        }
      }
    } else {
      // aba oculta: nada de recarga; só encerra o que passou do prazo
      for (const [peerId, entry] of [...watched]) {
        if (now() - entry.startedAt >= maxMs) { watched.delete(peerId); onGiveUp(peerId) }
      }
    }
    schedule()
  }

  return {
    // baseline: versão da senha que a tela mostrava quando a troca foi pedida
    watch (peerId, baseline = 0) {
      if (!peerId) return
      stopped = false
      watched.set(String(peerId), { baseline: Number(baseline) || 0, startedAt: now() })
      schedule()
    },
    stop () {
      stopped = true
      watched.clear()
      if (handle !== null) { clearTimeoutFn(handle); handle = null }
    },
    has: (peerId) => watched.has(String(peerId)),
    get size () { return watched.size },
    get running () { return handle !== null },
  }
}
