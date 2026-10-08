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
