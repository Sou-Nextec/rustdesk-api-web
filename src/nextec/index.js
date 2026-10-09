// Camada de personalização Nextec. É o único ponto de entrada do que é nosso:
// importado uma vez em src/main.js. Não altera a lógica das telas do upstream.
import './theme.scss'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/600.css'
import '@fontsource/open-sans/700.css'
import markUrl from './assets/mark.png'
import { applyNextecRoutes } from './routes'
import { translateHardcodedHeaders } from './labels'
import tableColumn from './table-column'
import button from './button'
import { guardRequiredFields } from './required-guard'
import { enterToSubmit } from './enter-submit'
import { router, asyncRoutes } from '@/router'
import { pinia } from '@/store'
import { useAppStore } from '@/store/app'
import { useUserStore } from '@/store/user'
import { useRouteStore } from '@/store/router'
import { T } from '@/utils/i18n'

// Tema claro por padrão (o escuro continua disponível no botão do cabeçalho)
try {
  if (!localStorage.getItem('vueuse-color-scheme')) localStorage.setItem('vueuse-color-scheme', 'light')
} catch (e) { /* storage indisponível: segue o padrão do navegador */ }

// 0. Visby CF (títulos): usa os .woff2 que existirem em src/nextec/fonts. Sem eles, cai em Open Sans.
const visby = import.meta.glob('./fonts/VisbyCF-*.woff2', { eager: true, query: '?url', import: 'default' })
const WEIGHTS = { Medium: 500, Bold: 700, ExtraBold: 800 }
const faces = Object.entries(visby).map(([file, url]) => {
  const weight = WEIGHTS[file.match(/VisbyCF-(\w+)\.woff2$/)?.[1]] || 700
  return `@font-face{font-family:'Visby CF';font-weight:${weight};font-style:normal;font-display:swap;src:url('${url}') format('woff2')}`
})
if (faces.length) {
  const style = document.createElement('style')
  style.textContent = faces.join('\n')
  document.head.appendChild(style)
}

// 0b. Versão do painel (vem do build da imagem; "dev" fora dela). Aparece no rodapé do menu e no menu do usuário.
export const NEXTEC_VERSION = import.meta.env.VITE_NEXTEC_VERSION || 'dev'
document.documentElement.style.setProperty('--nx-version', JSON.stringify('Painel ' + NEXTEC_VERSION))

// 1. Logo e título da marca
const appStore = useAppStore(pinia)
appStore.setting.logo = markUrl
appStore.replaceAdminTitle = function (newTitle) {
  // O título vindo do backend (padrão "RustDesk API Admin") é trocado pela marca,
  // a menos que o administrador tenha definido um título próprio no servidor.
  const generic = !newTitle || /rustdesk/i.test(newTitle)
  const title = generic ? 'Nextec' : newTitle
  document.title = document.title.replace(`- ${this.setting.title}`, `- ${title}`)
  this.setting.title = title
}

// Boas-vindas de "Meus dados": se o servidor ainda usa o texto padrão (em chinês), mostramos o nosso.
// A imagem Nextec já troca o arquivo no servidor (nextec/conf/hello.html); isto cobre servidores sem a imagem.
const HELLO_PT = '### Olá, **{{username}}**\n\nEste é o painel de acesso remoto da Nextec. Use o menu ao lado para cuidar dos seus dispositivos, acessos salvos e etiquetas.'
appStore.$subscribe(() => {
  const hello = appStore.setting.hello || ''
  if (/欢迎使用|RustDesk API\]/.test(hello)) {
    appStore.setting.hello = HELLO_PT.replace('{{username}}', useUserStore(pinia).username || '')
  }
})

// 1b. Títulos de coluna fixos no upstream
translateHardcodedHeaders()

// 1c. Campos obrigatórios: bloqueia o envio de formulários com campo * vazio
guardRequiredFields()

// 1d. Enter envia os diálogos
enterToSubmit()

// 2. Menu agrupado e tela inicial
applyNextecRoutes()

// 2b. Página 404 da Nextec no lugar do "404" sem estilo do upstream (mesma rota, só troca o componente)
const notFound = router.getRoutes().find(r => r.path === '/404')
if (notFound) notFound.components.default = () => import('./views/NotFound.vue')

// 3. Todos aterrissam no Início ao entrar (após o login ou ao abrir o painel); a tela muda conforme o perfil.
// O servidor só libera para usuário comum as rotas de Minha conta; o Início e Clientes liberados são acrescentados aqui.
// Clicar em "Meus dados" (que também usa o caminho /) continua abrindo a tela original.
const routeStore = useRouteStore(pinia)
const addRoutes = routeStore.addRoutes
// Usuário comum só tem a Minha área: em vez de um grupo que precisa ser aberto (e que vira um ícone
// solto com o menu recolhido), cada tela aparece direto no menu, com o próprio ícone.
function flattenMyMenu () {
  const i = asyncRoutes.findIndex(r => r.name === 'My')
  if (i < 0) return
  const my = asyncRoutes[i]
  const singles = my.children.map(child => ({
    path: my.path,
    name: 'NxMy_' + child.name,
    meta: { ...child.meta },
    component: my.component,
    children: [child],
  }))
  asyncRoutes.splice(i, 1, ...singles)
}
routeStore.addRoutes = (names = []) => {
  const admin = names.includes('*')
  // Clientes liberados não faz sentido para o admin, que já vê tudo em Dispositivos
  const shared = asyncRoutes.find(r => r.name === 'My')?.children?.find(c => c.name === 'NxMyShared')
  if (shared) shared.meta = { ...shared.meta, hide: admin }
  if (!admin) flattenMyMenu()
  return addRoutes.call(routeStore, admin ? names : [...names, 'NxHome', 'NxMyShared'])
}
router.beforeEach((to, from) => {
  const entering = !from.name || from.path === '/login' || from.path.startsWith('/oauth')
  if (to.path === '/' && entering && useUserStore(pinia).route_names.length) {
    return { path: '/home', replace: true }
  }
  // o login volta para a tela em que a sessão anterior terminou (?redirect=). Se quem entrou agora
  // não tem acesso a ela (ex.: tela de admin e login de técnico), vai para o Início em vez do 404.
  if (to.path === '/404' && entering && useUserStore(pinia).route_names.length) {
    return { path: '/home', replace: true }
  }
})

// 4. Celular: o menu começa recolhido e fecha ao navegar
const mobile = window.matchMedia('(max-width: 768px)')
if (mobile.matches) appStore.setting.sideIsCollapse = true
// ao girar o aparelho ou redimensionar a janela, o menu acompanha (recolhido no celular, aberto no desktop)
mobile.addEventListener('change', e => { appStore.setting.sideIsCollapse = e.matches })
router.afterEach(() => {
  if (mobile.matches) appStore.setting.sideIsCollapse = true
})

// 5. Título da página na topbar (lido pelo CSS em --nx-page-title)
router.afterEach((to) => {
  const title = to.meta?.title ? T(to.meta.title) : ''
  // rotas sem título (ex.: 404) deixavam "undefined - Nextec" na aba do navegador
  if (!title) document.title = (to.path === '/404' ? 'Página não encontrada - ' : '') + appStore.setting.title
  document.documentElement.style.setProperty('--nx-page-title', JSON.stringify(title))
  // frase de ajuda da tela (chave NxHint<NomeDaRota> no pt_BR.json); vazia se não houver
  const key = 'NxHint' + String(to.name || '')
  const hint = T(key)
  document.documentElement.style.setProperty('--nx-page-hint', hint === key ? 'none' : JSON.stringify(hint))
})

// Plugin registrado em src/main.js depois do Element Plus
export default {
  install (app) {
    app.use(tableColumn)
    app.use(button)
  },
}
