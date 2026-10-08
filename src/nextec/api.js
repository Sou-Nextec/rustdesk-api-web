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
