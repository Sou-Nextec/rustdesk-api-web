import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getToken, removeToken } from '@/utils/auth'
import { useUserStore } from '@/store/user'
import { pinia } from '@/store'
import { useAppStore } from '@/store/app'

// Texto claro para erros de rede/HTTP (o axios devolve frases em inglês como "Network Error").
function friendlyError (error) {
  const status = error.response && error.response.status
  if (error.code === 'ECONNABORTED' || (error.message || '').indexOf('timeout') > -1) {
    return 'O painel demorou demais para responder. Tente de novo em instantes.'
  }
  if (!error.response && error.message === 'Network Error') {
    return 'Sem conexão com o painel. Confira sua internet e tente de novo.'
  }
  if (status === 401) return 'Sua sessão expirou. Entre de novo.'
  if (status === 403) return 'Você não tem permissão para fazer isso.'
  if (status === 404) return 'Não encontramos o que você pediu. A página pode ter mudado; recarregue.'
  if (status === 413) return 'O arquivo é grande demais para enviar.'
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.'
  if (status === 502 || status === 503 || status === 504) {
    return 'O painel está indisponível agora (atualizando ou reiniciando). Tente de novo em instantes.'
  }
  if (status >= 500) return 'O painel teve um problema ao processar o pedido. Tente de novo; se continuar, avise o suporte.'
  return error.message || 'Não foi possível concluir o pedido.'
}

// create an axios instance
const service = axios.create({
  baseURL: import.meta.env.VITE_SERVER_API,
  withCredentials: true, // send cookies when cross-domain requests
  timeout: 50000, // request timeout
})

// request interceptor
service.interceptors.request.use(
  config => {
    if (!config.headers) {
      config.headers = {}
    }
    const userStore = useUserStore(pinia)

    const token = userStore.token || getToken()
    if (token) {
      config.headers['api-token'] = token
    }

    const app = useAppStore()
    const lang = app.setting.lang
    if (lang) {
      // console.log('lang', lang)
      config.headers['Accept-Language'] = lang
    }

    return config
  },
  error => {
    // do something with request error
    return Promise.reject(error)
  },
)

// response interceptor
service.interceptors.response.use(
  /**
   * If you want to get http information such as headers or status
   * Please return  response => response
   */

  /**
   * Determine the request status by custom code
   * Here is just an example
   * You can also judge the status by HTTP Status Code
   */
  response => {
    const res = response.data

    // for the endpoint /login-options
    // I'm not sure if this is a good idea
    if (Array.isArray(res)) {
      return res;
    }

    // if the custom code is not 20000, it is judged as an error.
    if (res.code !== 0) {
      // silent: a tela mostra o próprio estado (por exemplo, "Sem resposta" nos ajustes do servidor)
      if (!(response.config && response.config.silent)) {
        ElMessage({
          message: res.message || 'Não foi possível concluir o pedido.',
          type: 'error',
          duration: 5 * 1000,
        })
      }

      if (res.code === 403) {
        removeToken()
        window.location.reload()
      }
      return Promise.reject(res)
    } else {
      return res
    }
  },
  error => {
    error.message = friendlyError(error)
    if (!(error.config && error.config.silent)) {
      ElMessage({
        message: error.message,
        type: 'error',
        duration: 5 * 1000,
      })
    }
    return Promise.reject(error)
  },
)

export default service
