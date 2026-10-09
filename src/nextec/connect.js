// Conectar por ID. Pede ao painel o link: em máquinas com senha automática ele já leva a senha vigente
// (rustdesk://<id>?password=...), então quem pode acessar a máquina só clica e entra.
// Sem permissão, sem rede ou em servidor sem o cofre, cai no link simples (rustdesk://<id>).
import { getToken } from '@/utils/auth'

function abrir (url) {
  // Link no DOM e clique real: o Chrome bloqueia (about:blank#blocked) o clique em link solto depois de um fetch
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => a.remove(), 1000)
}

export async function connectDevice (id) {
  const plain = `rustdesk://${encodeURIComponent(id)}`
  try {
    const res = await fetch(`${import.meta.env.VITE_SERVER_API}/my/connect-link?id=${encodeURIComponent(id)}`, {
      headers: { 'api-token': getToken() || '' },
    })
    const body = await res.json()
    abrir(body && body.code === 0 && body.data?.url ? body.data.url : plain)
  } catch (e) {
    abrir(plain)
  }
}
