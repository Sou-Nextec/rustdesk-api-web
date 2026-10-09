<template>
  <section class="nx-home" aria-labelledby="nx-home-title">
    <header class="nx-head">
      <div>
        <h1 id="nx-home-title" class="nx-h1">Olá, {{ firstName }}</h1>
        <p class="nx-sub">{{ isAdmin ? 'Resumo do acesso remoto da Nextec neste momento.' : 'Seus acessos remotos em um só lugar.' }}</p>
      </div>
      <div class="nx-head-actions">
        <span v-if="updatedAt" class="nx-updated" aria-live="polite">{{ T('NxUpdatedAt', { time: updatedAt }) }}</span>
        <el-button :loading="loading" @click="load">
          <el-icon><el-icon-Refresh/></el-icon>
          <span>{{ T('Refresh') }}</span>
        </el-button>
      </div>
    </header>

    <el-alert v-if="error" type="error" show-icon :closable="false" class="nx-alert"
              :title="T('NxLoadError')" :description="T('NxLoadErrorHint')">
      <template #default>
        <el-button size="small" type="primary" @click="load">{{ T('NxRetry') }}</el-button>
      </template>
    </el-alert>

    <!-- ================= administrador ================= -->
    <template v-if="isAdmin">
      <div class="nx-stats" role="list">
        <router-link v-for="s in stats" :key="s.key" :to="s.to" class="nx-stat" role="listitem">
          <div class="nx-stat-icon" :class="`is-${s.tone}`" aria-hidden="true">
            <el-icon :size="20"><component :is="`el-icon-${s.icon}`"/></el-icon>
          </div>
          <div class="nx-label">{{ s.label }}</div>
          <el-skeleton v-if="loading && !loaded" animated style="width:70px">
            <template #template><el-skeleton-item variant="h1" style="width:70px"/></template>
          </el-skeleton>
          <div v-else class="nx-stat-value">{{ s.value }}</div>
          <div v-if="s.hint" class="nx-stat-hint">{{ s.hint }}</div>
        </router-link>
      </div>

      <div class="nx-cols">
        <div class="nx-card">
          <div class="nx-card-head">
            <h2 class="nx-h2">{{ T('NxRecentConnections') }}</h2>
            <router-link to="/auditConn" class="nx-link">{{ T('NxViewAll') }}
              <el-icon><el-icon-ArrowRight/></el-icon>
            </router-link>
          </div>
          <div v-if="loading && !loaded" class="nx-pad"><el-skeleton animated :rows="4"/></div>
          <el-empty v-else-if="!recent.length" :image-size="72" :description="T('NxRecentEmpty')">
            <p class="nx-empty-hint">{{ T('NxRecentEmptyHint') }}</p>
          </el-empty>
          <el-table v-else :data="recent" :aria-label="T('NxRecentConnections')">
            <el-table-column :label="T('NxConnStarted')" min-width="150">
              <template #default="{ row }">
                <div>{{ row.created_at }}</div>
                <div class="nx-muted">{{ ago(row.created_at) }}</div>
              </template>
            </el-table-column>
            <el-table-column :label="T('NxConnOrigin')" min-width="140">
              <template #default="{ row }">{{ row.from_name || row.from_peer || '-' }}</template>
            </el-table-column>
            <el-table-column :label="T('NxConnTarget')" min-width="140">
              <template #default="{ row }">{{ peerLabel(row.peer_id) }}</template>
            </el-table-column>
            <el-table-column :label="T('NxConnType')" width="110">
              <template #default="{ row }">
                <el-tag v-if="row.type === 1" type="warning">{{ T('File') }}</el-tag>
                <el-tag v-else>{{ T('Common') }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- pendências que pedem ação -->
        <div class="nx-card">
          <div class="nx-card-head"><h2 class="nx-h2">Precisa de atenção</h2></div>
          <div v-if="loading && !loaded" class="nx-pad"><el-skeleton animated :rows="3"/></div>
          <ul v-else-if="todos.length" class="nx-todo">
            <li v-for="t in todos" :key="t.key">
              <router-link :to="t.to" class="nx-todo-item">
                <span class="nx-todo-count" :class="`is-${t.tone}`">{{ t.count }}</span>
                <span class="nx-todo-text">
                  <strong>{{ t.title }}</strong>
                  <span>{{ t.hint }}</span>
                </span>
                <el-icon class="nx-todo-arrow"><el-icon-ArrowRight/></el-icon>
              </router-link>
            </li>
          </ul>
          <div v-else class="nx-allgood">
            <el-icon :size="22"><el-icon-CircleCheckFilled/></el-icon>
            <span>Tudo em ordem: todos os dispositivos têm cliente e todos os clientes têm acesso definido.</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ================= técnico / usuário comum ================= -->
    <template v-else>
      <form class="nx-connect" @submit.prevent="quickConnect">
        <div>
          <h2 class="nx-h2">Conectar a um dispositivo</h2>
          <p class="nx-muted">Digite o ID do RustDesk. O app instalado neste computador abre a conexão.</p>
        </div>
        <div class="nx-connect-row">
          <el-input v-model="quickId" size="large" placeholder="ID do dispositivo (ex.: 123456789)" aria-label="ID do dispositivo" inputmode="numeric"/>
          <el-button type="primary" size="large" native-type="submit" :disabled="!quickId.trim()">Conectar</el-button>
        </div>
      </form>

      <div class="nx-card nx-clients-card">
        <div class="nx-card-head">
          <h2 class="nx-h2">Clientes liberados para você</h2>
          <router-link to="/my/shared" class="nx-link">{{ T('NxViewAll') }}
            <el-icon><el-icon-ArrowRight/></el-icon>
          </router-link>
        </div>
        <div v-if="loading && !loaded" class="nx-pad"><el-skeleton animated :rows="2"/></div>
        <el-empty v-else-if="!clientCards.length" :image-size="64" description="Nenhum cliente liberado para você ainda.">
          <p class="nx-empty-hint">O administrador libera os clientes em Permissões por cliente.</p>
        </el-empty>
        <div v-else class="nx-client-grid">
          <router-link v-for="c in clientCards" :key="c.id" :to="{ path: '/my/shared', query: { list: String(c.id) } }" class="nx-client-tile">
            <strong>{{ c.name }}</strong>
            <span>{{ c.total }} {{ c.total === 1 ? 'dispositivo' : 'dispositivos' }}</span>
            <span class="nx-client-online"><span class="nx-dot" :class="c.online ? 'is-on' : 'is-off'" aria-hidden="true"></span>{{ c.online }} online</span>
          </router-link>
        </div>
      </div>

      <div class="nx-cols">
        <div class="nx-card">
          <div class="nx-card-head">
            <h2 class="nx-h2">Meus acessos salvos</h2>
            <router-link to="/my/address_book" class="nx-link">{{ T('NxViewAll') }}
              <el-icon><el-icon-ArrowRight/></el-icon>
            </router-link>
          </div>
          <div v-if="loading && !loaded" class="nx-pad"><el-skeleton animated :rows="4"/></div>
          <el-empty v-else-if="!saved.length" :image-size="72" description="Você ainda não salvou nenhum acesso.">
            <p class="nx-empty-hint">Salve em Meus acessos salvos as máquinas que você usa com frequência.</p>
          </el-empty>
          <ul v-else class="nx-plist">
            <li v-for="s in saved.slice(0, 8)" :key="s.row_id">
              <span class="nx-dot" :class="isOnlineT(status[s.id]) ? 'is-on' : 'is-off'" aria-hidden="true"></span>
              <span class="nx-plist-text">
                <strong>{{ s.alias || s.hostname || s.id }}</strong>
                <span>{{ [s.id, isOnlineT(status[s.id]) ? 'online agora' : (status[s.id] ? timeAgo(status[s.id] * 1000) : '')].filter(Boolean).join(' · ') }}</span>
              </span>
              <el-button size="small" type="primary" @click="connectByClient(s.id)">Conectar</el-button>
            </li>
          </ul>
        </div>

        <div class="nx-card">
          <div class="nx-card-head">
            <h2 class="nx-h2">Meus dispositivos</h2>
            <router-link to="/my/peer" class="nx-link">{{ T('NxViewAll') }}
              <el-icon><el-icon-ArrowRight/></el-icon>
            </router-link>
          </div>
          <div v-if="loading && !loaded" class="nx-pad"><el-skeleton animated :rows="3"/></div>
          <el-empty v-else-if="!mine.length" :image-size="64" description="Nenhum computador com a sua conta ainda.">
            <p class="nx-empty-hint">Entre com a sua conta no app RustDesk e o computador aparece aqui.</p>
          </el-empty>
          <ul v-else class="nx-plist">
            <li v-for="p in mine.slice(0, 6)" :key="p.row_id">
              <span class="nx-dot" :class="isOnline(p) ? 'is-on' : 'is-off'" aria-hidden="true"></span>
              <span class="nx-plist-text">
                <strong>{{ p.alias || p.hostname || p.id }}</strong>
                <span>{{ p.id }} · {{ isOnline(p) ? 'online agora' : (p.last_online_time ? timeAgo(p.last_online_time * 1000) : 'nunca') }}</span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { T } from '@/utils/i18n'
  import { timeAgo } from '@/utils/time'
  import { useUserStore } from '@/store/user'
  import { connectDevice as connectByClient } from '@/nextec/connect'
  import { list as peerList } from '@/api/peer'
  import { list as userList } from '@/api/user'
  import { list as connList } from '@/api/audit'
  import { list as deviceGroupList } from '@/api/device_group'
  import { list as collectionList } from '@/api/address_book_collection'
  import { list as ruleList } from '@/api/address_book_collection_rule'
  import { list as myPeerList } from '@/api/my/peer'
  import { list as myAbList } from '@/api/my/address_book'
  import { sharedCollections, sharedAddressBooks, sharedStatus } from '@/nextec/api'

  const ONLINE_WINDOW_S = 60
  const CLIENT_PREFIX = 'Cliente: '
  const userStore = useUserStore()
  const isAdmin = computed(() => (userStore.route_names || []).includes('*'))
  const firstName = computed(() => String(userStore.nickname || userStore.username || '').split(' ')[0])

  const loading = ref(false)
  const loaded = ref(false)
  const error = ref(false)
  const updatedAt = ref('')
  const pad = n => String(n).padStart(2, '0')
  const ago = s => timeAgo(s.replace(' ', 'T'))
  const isOnline = p => p.last_online_time && (Date.now() / 1000 - p.last_online_time) < ONLINE_WINDOW_S

  // ---------- administrador ----------
  const peers = ref([])
  const users = ref(0)
  const today = ref(0)
  const todayCapped = ref(false)
  const recent = ref([])
  const clients = ref([])
  const clientsWithoutAccess = ref(0)

  const peerLabel = (id) => {
    const p = peers.value.find(x => x.id === id)
    return p ? `${p.alias || p.hostname || id}` : id
  }
  const stats = computed(() => [
    { key: 'online', icon: 'Connection', tone: 'accent', to: '/user/peer', label: T('NxDevicesOnline'),
      value: peers.value.filter(isOnline).length, hint: T('NxOnlineHint') },
    { key: 'peers', icon: 'Monitor', tone: 'soft', to: '/user/peer', label: T('NxDevicesTotal'), value: peers.value.length },
    { key: 'users', icon: 'UserFilled', tone: 'soft', to: '/user/index', label: T('NxUsersTotal'), value: users.value },
    { key: 'today', icon: 'Tickets', tone: 'support', to: '/auditConn', label: T('NxConnectionsToday'),
      value: (todayCapped.value ? '99+' : today.value) },
  ])
  const todos = computed(() => {
    const list = []
    const noClient = peers.value.filter(p => !p.group_id).length
    if (noClient) {
      list.push({ key: 'noclient', tone: 'warn', count: noClient, to: { path: '/user/peer', query: { client: '0' } },
        title: 'Dispositivos sem cliente', hint: 'Vincule a um cliente para entrarem nas permissões.' })
    }
    if (clientsWithoutAccess.value) {
      list.push({ key: 'noaccess', tone: 'warn', count: clientsWithoutAccess.value, to: '/user/clientAccess',
        title: 'Clientes sem acesso definido', hint: 'Escolha quais equipes atendem cada cliente.' })
    }
    return list
  })

  const all = async (fn, params) => {
    const res = await fn({ page: 1, page_size: 10000, ...params })
    return res.data.list || []
  }

  const loadAdmin = async () => {
    const [p, u, c, dg, cols] = await Promise.all([
      all(peerList), userList({ page: 1, page_size: 1 }), connList({ page: 1, page_size: 100 }),
      all(deviceGroupList), all(collectionList),
    ])
    peers.value = p
    users.value = u.data.total
    const conns = c.data.list || []
    const d = new Date()
    const prefix = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const todays = conns.filter(x => (x.created_at || '').startsWith(prefix))
    todayCapped.value = todays.length >= 100
    today.value = todays.length
    recent.value = conns.slice(0, 6)
    clients.value = dg
    // cliente "com acesso" = tem a lista "Cliente: <nome>" com pelo menos uma regra de compartilhamento
    const managed = cols.filter(col => col.name.startsWith(CLIENT_PREFIX))
    const rules = managed.length ? await all(ruleList) : []
    const withRules = new Set(rules.map(r => r.collection_id))
    clientsWithoutAccess.value = dg.filter(g => {
      const col = managed.find(m => m.name === CLIENT_PREFIX + g.name)
      return !col || !withRules.has(col.id)
    }).length
  }

  // ---------- usuário comum ----------
  const quickId = ref('')
  const quickConnect = () => {
    const id = quickId.value.replace(/\s/g, '')
    if (id) connectByClient(id)
  }
  const saved = ref([])
  const mine = ref([])
  // clientes liberados e situação online vêm do patch 0003 da API; sem ele, os cartões ficam vazios
  const clientCards = ref([])
  const status = ref({})
  const isOnlineT = t => !!(t && (Date.now() / 1000 - t) < ONLINE_WINDOW_S)
  const loadUser = async () => {
    const [ab, my, cols, shared] = await Promise.all([
      all(myAbList), all(myPeerList),
      sharedCollections().then(r => r.data.list || []).catch(() => []),
      sharedAddressBooks({ collection_id: 0 }).then(r => r.data.list || []).catch(() => []),
    ])
    const st = ab.length ? await sharedStatus({ ids: ab.map(a => a.id) }).then(r => r.data.list || []).catch(() => []) : []
    status.value = Object.fromEntries(st.map(x => [x.id, x.last_online_time]))
    saved.value = ab.sort((a, b) => Number(isOnlineT(status.value[b.id])) - Number(isOnlineT(status.value[a.id])) ||
      String(a.alias || a.hostname || a.id).localeCompare(String(b.alias || b.hostname || b.id), 'pt-BR'))
    mine.value = my.sort((a, b) => (b.last_online_time || 0) - (a.last_online_time || 0))
    clientCards.value = cols.map(c => ({
      id: c.id,
      name: String(c.name).replace(/^Cliente:\s*/, ''),
      total: c.total,
      online: shared.filter(e => e.collection_id === c.id && isOnlineT(e.last_online_time)).length,
    })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  const load = async () => {
    loading.value = true
    error.value = false
    try {
      await (isAdmin.value ? loadAdmin() : loadUser())
      const d = new Date()
      updatedAt.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      loaded.value = true
    } catch (e) {
      error.value = true
    } finally {
      loading.value = false
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .nx-home { max-width: 1240px; margin: 0 auto; }
  .nx-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .nx-h1 { font-size: 28px; margin: 0; color: var(--nx-text); }
  .nx-sub { margin: 4px 0 0; color: var(--nx-text-muted); font-size: 14px; }
  .nx-head-actions { display: flex; align-items: center; gap: 12px; }
  .nx-updated { color: var(--nx-text-subtle); font-size: 12px; }
  .nx-alert { margin-bottom: 16px; border-radius: 14px; }

  .nx-label { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--nx-text-subtle); margin-bottom: 8px; }
  .nx-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
  .nx-stat {
    display: block; padding: 20px 22px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
    text-decoration: none; color: inherit; transition: transform .15s, box-shadow .15s;
    &:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(97, 60, 179, .14); }
  }
  .nx-stat-icon {
    width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; margin-bottom: 12px;
    &.is-accent { background: var(--nx-accent); color: #fff; }
    &.is-soft { background: var(--nx-tint); color: var(--nx-accent); }
    &.is-support { background: #E3DFFF; color: var(--nx-support); }
  }
  html.dark .nx-stat-icon { &.is-soft, &.is-support { background: var(--nx-tint); color: #D8C2FF; } }
  .nx-stat-value { font-family: var(--nx-font-title); font-size: 36px; font-weight: 700; line-height: 1; color: var(--nx-text); }
  .nx-stat-hint { font-size: 11px; color: var(--nx-text-subtle); margin-top: 6px; }

  .nx-cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; min-width: 0; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-pad { padding: 20px 22px; }
  .nx-link { display: inline-flex; align-items: center; gap: 4px; color: var(--el-color-primary); font-size: 13px; font-weight: 600; text-decoration: none; &:hover { text-decoration: underline; } }
  .nx-muted { color: var(--nx-text-subtle); font-size: 12px; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; max-width: 360px; }
  .nx-card :deep(.el-table th.el-table__cell:first-child .cell),
  .nx-card :deep(.el-table td.el-table__cell:first-child .cell) { padding-left: 22px; }

  .nx-todo { list-style: none; margin: 0; padding: 8px; }
  .nx-todo-item {
    display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; text-decoration: none; color: inherit;
    &:hover { background: var(--nx-tint); }
  }
  .nx-todo-count {
    flex: none; min-width: 36px; height: 36px; padding: 0 8px; border-radius: 10px; display: grid; place-items: center;
    font-family: var(--nx-font-title); font-weight: 700; font-size: 16px;
    &.is-warn { background: #FEF3C7; color: #7A4A00; }
  }
  .nx-todo-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
    strong { font-size: 14px; color: var(--nx-text); } span { font-size: 12px; color: var(--nx-text-muted); } }
  .nx-todo-arrow { color: var(--nx-text-subtle); }
  .nx-allgood { display: flex; gap: 10px; align-items: flex-start; padding: 18px 22px; font-size: 13px; line-height: 1.5; color: var(--nx-text-muted);
    .el-icon { color: #0F7B55; flex: none; } }

  .nx-connect {
    display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
    padding: 22px 24px; margin-bottom: 20px; border-radius: var(--nx-radius-card);
    background: var(--nx-surface); box-shadow: var(--nx-shadow-card);
    .nx-muted { margin: 4px 0 0; font-size: 13px; }
  }
  .nx-connect-row { display: flex; gap: 10px; flex: 1 1 360px; max-width: 520px; .el-button { margin: 0; } }

  .nx-plist { list-style: none; margin: 0; padding: 6px 8px; }
  .nx-plist li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; &:hover { background: var(--nx-tint); } }
  .nx-plist-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
    strong { font-size: 14px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    span { font-size: 12px; color: var(--nx-text-muted); } }
  .nx-plist-icon { flex: none; color: var(--nx-text-subtle); }
  .nx-clients-card { margin-bottom: 16px; }
  .nx-client-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; padding: 16px 20px 20px; }
  .nx-client-tile {
    display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 14px; text-decoration: none;
    background: var(--nx-bg); color: var(--nx-text-muted); font-size: 12px; transition: background .15s;
    strong { font-size: 14px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    &:hover { background: var(--nx-tint); }
  }
  .nx-client-online { display: inline-flex; align-items: center; gap: 6px; }
  .nx-dot {
    flex: none; width: 8px; height: 8px; border-radius: 50%;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-off { background: #9A97AD; }
  }

  @media (max-width: 1100px) { .nx-cols { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 1024px) { .nx-stats { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .nx-stats { grid-template-columns: 1fr; } .nx-h1 { font-size: 22px; } .nx-connect-row { flex-wrap: wrap; } }
  html.dark .nx-todo-count.is-warn { background: rgba(254, 243, 199, .16); color: #FCD38A; }
</style>
