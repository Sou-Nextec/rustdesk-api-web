// Alguns textos do upstream estão fixos no template (sem passar por T()): títulos de coluna
// e os cartões da tela "Comandos do servidor". Em vez de editar essas telas, traduzimos o texto
// exato aqui. Se o upstream passar a usar T() nesses pontos, o mapa deixa de ter efeito sem causar erro.
const TABLE_HEADERS = {
  client: 'Cliente',
  uuid: 'UUID',
  ip: 'IP',
  type: 'Tipo',
  id: 'ID',
  'Platform/UA': 'Plataforma/Agente',
  // uso do relay (Comandos do servidor)
  TIME: 'Tempo',
  TOTAL: 'Total',
  HIGHEST: 'Pico',
  AVG: 'Média',
  SPEED: 'Velocidade',
  // comandos avançados (Ajustes do servidor)
  cmd: 'Comando',
  alias: 'Atalho',
  option: 'Parâmetros',
  explain: 'Descrição',
  actions: 'Ações',
}

const CARD_TITLES = {
  RELAY_SERVERS: 'Servidores de relay',
  ALWAYS_USE_RELAY: 'Sempre usar relay',
  MUST_LOGIN: 'Exigir login no cliente',
  USAGE: 'Uso do relay',
  BLOCK_LIST: 'IPs bloqueados (blocklist)',
  BLACK_LIST: 'IPs na lista negra (blacklist)',
}

// rótulos de formulário fixos no template (Login externo, Endereços e Meus dados)
const FORM_LABELS = {
  Type: 'Tipo',
  IdP: 'Nome do provedor',
  Issuer: 'Emissor (issuer)',
  Scopes: 'Escopos',
  ClientId: 'Client ID',
  ClientSecret: 'Client secret',
  RedirectUrl: 'URL de retorno (copie para o provedor)',
  PkceEnable: 'Ativar PKCE',
  PkceMethod: 'Método PKCE',
  OIDC: 'Logins externos',
  'rdp端口': 'Porta RDP',
  'rdp用户名': 'Usuário RDP',
  '在线': 'Online',
  cmd: 'Comando',
  alias: 'Atalho',
  option: 'Parâmetros',
  target: 'Destino',
  explain: 'Descrição',
}

// textos de exemplo e opções fixos no template
const PLACEHOLDERS = {
  'Select PKCE Method': 'Selecione o método PKCE',
}
const OPTIONS = {
  'S256 (Recommended)': 'S256 (recomendado)',
  Plain: 'Plain (simples)',
}

function translateInputs (root) {
  root.querySelectorAll('input[placeholder]').forEach(el => {
    const pt = PLACEHOLDERS[el.getAttribute('placeholder')]
    if (pt) el.setAttribute('placeholder', pt)
  })
  root.querySelectorAll('.el-select__placeholder span').forEach(el => {
    const pt = PLACEHOLDERS[el.textContent.trim()]
    if (pt) el.textContent = pt
  })
}

// o diálogo de troca de senha do upstream não tem título
function titleUntitledDialogs (root) {
  root.querySelectorAll('.el-dialog').forEach(dialog => {
    const title = dialog.querySelector('.el-dialog__title')
    if (!title || title.textContent.trim()) return
    const labels = [...dialog.querySelectorAll('.el-form-item__label')].map(l => l.textContent.trim())
    if (labels.includes('Senha atual')) title.textContent = 'Alterar senha'
  })
}

function replaceExact (root, selector, map) {
  root.querySelectorAll(selector).forEach(el => {
    if (el.children.length) return
    const text = el.textContent.trim()
    const pt = map[text]
    if (pt && pt !== text) el.textContent = pt
  })
}

// Mensagens de validação do servidor: vêm do validador em inglês com o nome do campo em chinês,
// sem passar pelo i18n do backend (ex.: "用户名 is a required field").
const FIELD_NAMES = {
  用户名: 'Usuário', 密码: 'Senha', 旧密码: 'Senha atual', 新密码: 'Nova senha', 确认密码: 'Confirmação da senha',
  邮箱: 'E-mail', 昵称: 'Nome de exibição', 名称: 'Nome', 验证码: 'Código de verificação', 备注: 'Observação',
  Id: 'ID', 分组: 'Grupo', 颜色: 'Cor', 标签: 'Etiqueta', 地址簿: 'Catálogo', 状态: 'Situação', 类型: 'Tipo',
}
const field = name => FIELD_NAMES[name] || name
const SERVER_MESSAGES = [
  [/^(.+?) is a required field$/, (m, f) => `Preencha o campo ${field(f)}.`],
  [/^(.+?) must be at least (\d+) characters? in length$/, (m, f, n) => `${field(f)}: use pelo menos ${n} caracteres.`],
  [/^(.+?) must be a maximum of (\d+) characters? in length$/, (m, f, n) => `${field(f)}: use no máximo ${n} caracteres.`],
  [/^(.+?) must be a valid email address$/, (m, f) => `${field(f)}: informe um e-mail válido.`],
  [/^(.+?) must be one of \[(.+)\]$/, (m, f, v) => `${field(f)}: escolha uma das opções (${v}).`],
  [/^Network Error$/, () => 'Sem conexão com o servidor. Verifique a rede e tente de novo.'],
  [/^Connection Time Out!$/, () => 'O servidor demorou para responder. Tente de novo.'],
  [/^Request failed with status code (\d+)$/, (m, c) => `O servidor respondeu com erro (${c}). Tente de novo.`],
]

function translateMessages (root) {
  root.querySelectorAll('.el-message__content').forEach(el => {
    const text = el.textContent.trim()
    for (const [re, fn] of SERVER_MESSAGES) {
      const m = text.match(re)
      if (m) { el.textContent = fn(...m); break }
    }
  })
}

function translate (root) {
  translateMessages(root)
  replaceExact(root, '.el-table th .cell', TABLE_HEADERS)
  replaceExact(root, '.el-card__header .card-header span, .el-card__header .card-header', CARD_TITLES)
  // rótulos com sufixo de dois-pontos chinês (label-suffix="："): troca pelo dois-pontos comum
  root.querySelectorAll('.el-form-item__label').forEach(el => {
    if (el.children.length) return
    const text = el.textContent.trim()
    if (!text.endsWith('：')) return
    const base = text.slice(0, -1)
    el.textContent = (FORM_LABELS[base] || base) + ':'
  })
  replaceExact(root, '.el-form-item__label', FORM_LABELS)
  // "Salvar em uma lista": no formulário reaproveitado do upstream, o "Responsável" é o dono da lista
  replaceExact(root, '.nx-ab-dialog .el-form-item__label', { Responsável: 'Dono da lista', Catálogo: 'Lista' })
  // "Grupo" muda de sentido conforme a tela: em dispositivos é o cliente, em usuários é a equipe
  const hash = location.hash
  const groupAs = /^#\/(user|my)\/peer/.test(hash) ? 'Cliente'
    : /^#\/user\/(index|add|edit)/.test(hash) ? 'Equipe' : null
  if (groupAs) {
    replaceExact(root, '.el-table th .cell, .el-form-item__label', { Grupo: groupAs })
  }
  replaceExact(root, '.el-select-dropdown__item span', OPTIONS)
  translateInputs(root)
  titleUntitledDialogs(root)
  // em Sessões ativas, "Sair" encerra a sessão de outra pessoa (o botão já foi renomeado em button.js)
  if (location.hash.startsWith('#/userToken')) {
    root.querySelectorAll('.el-message-box__message p').forEach(el => {
      if (el.textContent.trim() === 'Confirmar ação: Sair?') el.textContent = 'Encerrar esta sessão? A pessoa precisará entrar de novo.'
    })
  }
}

export function translateHardcodedHeaders () {
  const observer = new MutationObserver(() => translate(document))
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder'] })
}
