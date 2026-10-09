// Reorganiza o menu em grupos lógicos sem tocar em src/router/index.js.
// As rotas filhas (nomes, caminhos e componentes) são as mesmas do upstream; só mudamos
// em qual grupo cada uma aparece. Assim, rotas novas do upstream continuam funcionando
// (caem em "Servidor" se não estiverem mapeadas aqui) e os merges seguem simples.
import { asyncRoutes } from '@/router'

const layout = () => import('@/layout/index.vue')

// nome da rota filha -> grupo do menu
const GROUPS = [
  { name: 'NxGroupDevices', title: 'NxGroupDevices', icon: 'Monitor', children: ['Peer', 'DeviceGroup', 'NxSupport', 'NxUpdates'] },
  { name: 'NxGroupPeople', title: 'NxGroupPeople', icon: 'UserFilled', children: ['UserList', 'UserAdd', 'UserEdit', 'UserGroup'] },
  // quem acessa o quê: permissões por cliente e as listas que aparecem no app RustDesk
  { name: 'NxGroupAddressBook', title: 'NxGroupAddressBook', icon: 'Key', children: ['NxClientAccess', 'UserAddressBookName', 'UserAddressBook', 'UserTag'] },
  { name: 'NxGroupAccess', title: 'NxGroupAccess', icon: 'Lock', children: ['NxSecrets', 'NxPolicies', 'NxSessions', 'Oauth', 'UserToken', 'ShareRecord'] },
  { name: 'NxGroupAudit', title: 'NxGroupAudit', icon: 'Tickets', children: ['NxReport', 'LoginLog', 'AuditConn', 'AuditFile'] },
  { name: 'NxGroupServer', title: 'NxGroupServer', icon: 'Setting', children: ['ServerCmd'] },
]

export function applyNextecRoutes () {
  const system = asyncRoutes.find(r => r.name === 'User')
  if (!system) return // estrutura do upstream mudou: mantém o menu original

  // Permissões por cliente: tela nova da Nextec (só admin; usa as APIs de listas e regras do upstream)
  system.children.push({
    path: '/user/clientAccess',
    name: 'NxClientAccess',
    meta: { title: 'NxClientAccess', icon: 'Share' },
    component: () => import('./views/ClientAccess.vue'),
  })
  // Senhas dos servidores: cofre com troca automática da senha do RustDesk (só admin; patch 0008 da API)
  system.children.push({
    path: '/user/secrets',
    name: 'NxSecrets',
    meta: { title: 'NxSecrets', icon: 'Key' },
    component: () => import('./views/Secrets.vue'),
  })
  // Suporte avulso: link público para o cliente baixar o app de suporte e lista de quem aguarda atendimento (só admin; patch 0010)
  system.children.push({
    path: '/user/support',
    name: 'NxSupport',
    meta: { title: 'NxSupport', icon: 'Service' },
    component: () => import('./views/Support.vue'),
  })
  // Atualizações do app: envio do instalador e publicação para todos ou para um piloto (só admin; patch 0009 da API)
  system.children.push({
    path: '/user/updates',
    name: 'NxUpdates',
    meta: { title: 'NxUpdates', icon: 'Upload' },
    component: () => import('./views/Updates.vue'),
  })
  // Políticas do app (o que o RustDesk permite por cliente ou máquina) e Conexões ativas com desconectar (só admin; patch 0012)
  system.children.push({
    path: '/user/policies',
    name: 'NxPolicies',
    meta: { title: 'NxPolicies', icon: 'Setting' },
    component: () => import('./views/Policies.vue'),
  })
  system.children.push({
    path: '/user/sessions',
    name: 'NxSessions',
    meta: { title: 'NxSessions', icon: 'Connection' },
    component: () => import('./views/Sessions.vue'),
  })
  // Relatório mensal de acessos por cliente, com chamado e exportação (só admin; patch 0013)
  system.children.push({
    path: '/user/report',
    name: 'NxReport',
    meta: { title: 'NxReport', icon: 'Tickets' },
    component: () => import('./views/Report.vue'),
  })
  const byName = new Map(system.children.map(c => [c.name, c]))
  const used = new Set()
  const groups = GROUPS.map(g => {
    const children = g.children.filter(n => byName.has(n)).map(n => {
      used.add(n)
      return byName.get(n)
    })
    return {
      path: '/user', // mesmo prefixo do upstream: mantém os caminhos relativos (ex.: /user/peer)
      name: g.name,
      meta: { title: g.title, icon: g.icon },
      component: layout,
      children,
    }
  })

  // rotas que o upstream venha a adicionar e que ainda não mapeamos
  const rest = system.children.filter(c => !used.has(c.name))
  const server = groups.find(g => g.name === 'NxGroupServer')
  server.children.push(...rest)

  groups[0].redirect = '/user/peer'

  // Ajustes do servidor: tela própria da Nextec (a original segue disponível na aba Comandos avançados)
  // Dispositivos: tela própria da Nextec (busca geral, filtro por cliente, colunas enxutas)
  const peer = byName.get('Peer')
  if (peer) peer.component = () => import('./views/Devices.vue')

  // Clientes: tela própria (subgrupos em lote e modelos de cliente)
  const deviceGroup = byName.get('DeviceGroup')
  if (deviceGroup) deviceGroup.component = () => import('./views/Clients.vue')

  const serverCmd = byName.get('ServerCmd')
  if (serverCmd) serverCmd.component = () => import('./views/ServerSettings.vue')

  const home = {
    path: '/home',
    name: 'NxHomeRoot',
    meta: { title: 'NxHome', icon: 'HomeFilled' },
    component: layout,
    children: [
      {
        path: '/home',
        name: 'NxHome',
        meta: { title: 'NxHome', icon: 'HomeFilled' },
        component: () => import('./views/Home.vue'),
      },
    ],
  }

  // Início, administração agrupada e, por último, Minha conta (único grupo do usuário comum)
  const my = asyncRoutes.find(r => r.name === 'My')
  // em Minha conta, títulos no possessivo para não confundir com as telas de administração
  const MY_TITLES = {
    MyAddressBookCollection: 'NxMyCatalogs',
    MyAddressBookList: 'NxMyAddresses',
    MyTagList: 'NxMyTags',
    MyShareRecordList: 'NxMyShares',
    MyLoginLog: 'NxMyLogins',
  }
  my?.children?.forEach(c => {
    if (MY_TITLES[c.name]) c.meta = { ...c.meta, title: MY_TITLES[c.name] }
  })
  if (my) {
    // Meus dados e Meus logins ficam no menu do usuário (canto superior direito); o menu lateral
    // fica só com o que se usa no dia a dia, na ordem de uso
    // clientes que o admin liberou para a pessoa (patch 0003 da API); só usuário comum, o admin vê tudo em Dispositivos
    my.children.push({
      path: 'shared',
      name: 'NxMyShared',
      meta: { title: 'NxMyShared', icon: 'OfficeBuilding' },
      component: () => import('./views/MyShared.vue'),
    })
    const ORDER = ['NxMyShared', 'MyPeer', 'MyAddressBookList', 'MyAddressBookCollection', 'MyTagList', 'MyShareRecordList']
    my.meta = { ...my.meta, title: 'NxGroupMine' }
    my.children.forEach(c => {
      if (c.name === 'MyInfo' || c.name === 'MyLoginLog') c.meta = { ...c.meta, hide: true }
    })
    my.children.sort((a, b) => (ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99))
    // telas próprias no padrão da tela Dispositivos
    const myPeer = my.children.find(c => c.name === 'MyPeer')
    if (myPeer) myPeer.component = () => import('./views/MyDevices.vue')
    const myAb = my.children.find(c => c.name === 'MyAddressBookList')
    if (myAb) myAb.component = () => import('./views/MySaved.vue')
  }
  asyncRoutes.splice(0, asyncRoutes.length, home, ...groups.filter(g => g.children.length), ...(my ? [my] : []))
}
