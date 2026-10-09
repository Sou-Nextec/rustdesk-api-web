// Favoritos e recentes do técnico. Ficam no navegador (um conjunto por usuário), são só conveniência:
// se o armazenamento estiver bloqueado, o painel funciona igual, só não lembra.
import { reactive } from 'vue'
import { useUserStore } from '@/store/user'

const MAX_RECENTS = 8
const state = reactive({ owner: null, favorites: [], recents: [] })

const storageKey = () => `nx-quick-${useUserStore().username || 'anon'}`

function ensureLoaded () {
  const owner = storageKey()
  if (state.owner === owner) return
  state.owner = owner
  state.favorites = []
  state.recents = []
  try {
    const saved = JSON.parse(localStorage.getItem(owner) || '{}')
    if (Array.isArray(saved.favorites)) state.favorites = saved.favorites.filter(x => x && x.id)
    if (Array.isArray(saved.recents)) state.recents = saved.recents.filter(x => x && x.id)
  } catch (e) { /* sem armazenamento: começa vazio */ }
}

function persist () {
  try {
    localStorage.setItem(state.owner, JSON.stringify({ favorites: state.favorites, recents: state.recents }))
  } catch (e) { /* sem armazenamento: vale só nesta sessão */ }
}

const cleanId = id => String(id || '').replace(/\s+/g, '')

export function useQuickAccess () {
  ensureLoaded()
  return {
    state,
    isFavorite: id => state.favorites.some(f => f.id === cleanId(id)),
    toggleFavorite (id, label = '') {
      ensureLoaded()
      id = cleanId(id)
      const i = state.favorites.findIndex(f => f.id === id)
      if (i >= 0) state.favorites.splice(i, 1)
      else state.favorites.unshift({ id, label })
      persist()
      return i < 0
    },
    // chamado ao conectar: o mais recente fica no topo, sem repetir
    touch (id, label = '') {
      ensureLoaded()
      id = cleanId(id)
      if (!id) return
      const old = state.recents.find(r => r.id === id)
      state.recents = [{ id, label: label || old?.label || '', at: Date.now() }, ...state.recents.filter(r => r.id !== id)].slice(0, MAX_RECENTS)
      persist()
    },
  }
}
