// Camada de personalização Nextec. É o único ponto de entrada do que é nosso:
// importado uma vez em src/main.js. Não altera a lógica das telas do upstream.
import './theme.scss'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/600.css'
import '@fontsource/open-sans/700.css'
import markUrl from './assets/mark.svg'
import { applyNextecRoutes } from './routes'
import { translateHardcodedHeaders } from './labels'
import { router } from '@/router'
import { pinia } from '@/store'
import { useAppStore } from '@/store/app'
import { useUserStore } from '@/store/user'

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

// 1b. Títulos de coluna fixos no upstream
translateHardcodedHeaders()

// 2. Menu agrupado e tela inicial
applyNextecRoutes()

// 3. Administradores aterrissam na visão geral; os demais seguem no fluxo original
router.beforeEach((to) => {
  if (to.path === '/' && useUserStore(pinia).route_names.includes('*')) {
    return { path: '/home', replace: true }
  }
})
