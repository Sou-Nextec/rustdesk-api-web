// Reorganiza o menu em grupos lógicos sem tocar em src/router/index.js.
// As rotas filhas (nomes, caminhos e componentes) são as mesmas do upstream; só mudamos
// em qual grupo cada uma aparece. Assim, rotas novas do upstream continuam funcionando
// (caem em "Servidor" se não estiverem mapeadas aqui) e os merges seguem simples.
import { asyncRoutes } from '@/router'

const layout = () => import('@/layout/index.vue')

// nome da rota filha -> grupo do menu
const GROUPS = [
  { name: 'NxGroupDevices', title: 'NxGroupDevices', icon: 'Monitor', children: ['Peer', 'DeviceGroup'] },
  { name: 'NxGroupPeople', title: 'NxGroupPeople', icon: 'UserFilled', children: ['UserList', 'UserAdd', 'UserEdit', 'UserGroup'] },
  { name: 'NxGroupAddressBook', title: 'NxGroupAddressBook', icon: 'Notebook', children: ['UserAddressBookName', 'UserAddressBook', 'UserTag'] },
  { name: 'NxGroupAccess', title: 'NxGroupAccess', icon: 'Lock', children: ['NxClientAccess', 'Oauth', 'UserToken', 'ShareRecord'] },
  { name: 'NxGroupAudit', title: 'NxGroupAudit', icon: 'Tickets', children: ['LoginLog', 'AuditConn', 'AuditFile'] },
  { name: 'NxGroupServer', title: 'NxGroupServer', icon: 'Setting', children: ['ServerCmd'] },
]

export function applyNextecRoutes () {
  const system = asyncRoutes.find(r => r.name === 'User')
  if (!system) return // estrutura do upstream mudou: mantém o menu original

  // Permissões por cliente: tela nova da Nextec (só admin; usa as APIs de listas e regras do upstream)
  system.children.push({
    path: '/user/clientAccess',
    name: 'NxClientAccess',
    meta: { title: 'NxClientAccess', icon: 'Key' },
    component: () => import('./views/ClientAccess.vue'),
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
  asyncRoutes.splice(0, asyncRoutes.length, home, ...groups.filter(g => g.children.length), ...(my ? [my] : []))
}
