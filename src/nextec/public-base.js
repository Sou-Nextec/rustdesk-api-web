import { computed, ref } from 'vue'
import { supportPublicUrl } from '@/nextec/api'
import { publicBase } from '@/nextec/public-links.mjs'

// Endereço público dos links (configurado no painel). Uma consulta por sessão; quem altera chama setConfiguredBase.
const configured = ref('')
let loading = null

export function loadPublicBase (force = false) {
  if (!loading || force) {
    loading = supportPublicUrl()
      .then((res) => { configured.value = (res && res.data && res.data.public_url) || '' })
      .catch(() => { loading = null })
  }
  return loading
}

export function setConfiguredBase (value) {
  configured.value = value || ''
}

// Base para montar links: o endereço configurado ou o endereço em que o painel foi aberto.
export function usePublicBase () {
  loadPublicBase()
  return computed(() => publicBase(configured.value, window.location.origin))
}

export const configuredBase = configured
