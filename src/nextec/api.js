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
