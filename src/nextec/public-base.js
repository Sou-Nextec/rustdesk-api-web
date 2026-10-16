import { computed, ref } from 'vue'
import { supportPublicUrl } from '@/nextec/api'
import { publicBase } from '@/nextec/public-links.mjs'

// Endereço público dos links (configurado no painel). Estado explícito: uma falha de carga NÃO vira "endereço vazio",
// senão links sairiam com o endereço do painel e o campo de configuração apagaria o valor salvo.
const configured = ref('')
const state = ref('idle') // idle | loading | ready | failed
let loading = null

export const publicBaseReady = computed(() => state.value === 'ready')
export const publicBaseFailed = computed(() => state.value === 'failed')
export const configuredBase = configured

// Resolve true quando o valor foi lido com sucesso; false em falha (a próxima chamada tenta de novo).
export function loadPublicBase (force = false) {
  if (state.value === 'ready' && !force) return Promise.resolve(true)
  if (loading) return loading
  state.value = 'loading'
  loading = supportPublicUrl()
    .then((res) => {
      if (res && res.code === 0 && res.data) {
        configured.value = res.data.public_url || ''
        state.value = 'ready'
        return true
      }
      state.value = 'failed'
      return false
    })
    .catch(() => { state.value = 'failed'; return false })
    .finally(() => { loading = null })
  return loading
}

export function setConfiguredBase (value) {
  configured.value = value || ''
  state.value = 'ready'
}

// Base para montar links: o endereço configurado ou o endereço em que o painel foi aberto.
export function usePublicBase () {
  loadPublicBase()
  return computed(() => publicBase(configured.value, window.location.origin))
}
