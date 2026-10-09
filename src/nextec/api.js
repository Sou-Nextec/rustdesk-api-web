// Endpoints que só existem na API com os patches da Nextec (nextec/backend/*.patch)
import request from '@/utils/request'

// liga ou desliga o cliente web na hora; responde 404 em servidores sem o patch 0002
export function setWebClient (data) {
  return request({
    url: '/nextec/web-client',
    method: 'post',
    data,
  })
}

// patch 0003: listas compartilhadas com o usuário logado e situação online do que ele enxerga
export function sharedCollections () {
  return request({ url: '/my/shared/collections' })
}

export function sharedAddressBooks (params) {
  return request({ url: '/my/shared/address_book/list', params })
}

export function sharedStatus (data) {
  return request({ url: '/my/shared/status', method: 'post', data })
}

// patch 0004: foto de perfil do próprio usuário (data URL png/jpeg/webp de até 150 KB; vazio remove)
export function setAvatar (avatar) {
  return request({ url: '/my/profile/avatar', method: 'post', data: { avatar } })
}

// patch 0007: modelos de cliente (subgrupos e permissões) guardados no servidor, só admin
export function getClientTemplates () {
  return request({ url: '/nextec/client-templates' })
}

export function saveClientTemplates (templates) {
  return request({ url: '/nextec/client-templates', method: 'post', data: { templates } })
}

// patch 0008: cofre de senhas dos servidores (somente admin) e link de conexão
export const secretsOverview = () => request({ url: '/nextec/secrets' })
export const secretsPolicy = (data) => request({ url: '/nextec/secrets/policy', method: 'post', data })
export const secretsRotate = (id) => request({ url: '/nextec/secrets/rotate', method: 'post', data: { id } })
export const secretsReveal = (id) => request({ url: '/nextec/secrets/reveal', method: 'post', data: { id } })
export const secretsUnenroll = (id) => request({ url: '/nextec/secrets/unenroll', method: 'post', data: { id } })
export const secretsAgentKey = () => request({ url: '/nextec/secrets/agent-key', method: 'post', data: {} })
export const secretsAudit = () => request({ url: '/nextec/secrets/audit' })

// patch 0009: atualização do app pelo painel (somente admin)
export const updatesOverview = () => request({ url: '/nextec/updates' })
export const updatesRollout = (data) => request({ url: '/nextec/updates/rollout', method: 'post', data })
export const updatesDelete = (id) => request({ url: '/nextec/updates/delete', method: 'post', data: { id } })
// o envio do instalador usa XMLHttpRequest direto (progresso), em src/nextec/views/Updates.vue
