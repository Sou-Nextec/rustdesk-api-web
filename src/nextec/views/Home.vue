<template>
  <section class="nx-home" aria-labelledby="nx-home-title">
    <header class="nx-head">
      <div>
        <h1 id="nx-home-title" class="nx-h1">{{ T('NxHomeTitle') }}</h1>
        <p class="nx-sub">{{ T('NxHomeSubtitle') }}</p>
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
        <el-empty v-else-if="!recent.length" :description="T('NxRecentEmpty')">
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
          <el-table-column :label="T('NxConnTarget')" prop="peer_id" min-width="110"/>
          <el-table-column :label="T('Ip')" prop="ip" min-width="110"/>
          <el-table-column :label="T('NxConnType')" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.type === 1" type="warning">{{ T('File') }}</el-tag>
              <el-tag v-else>{{ T('Common') }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <aside class="nx-highlight" :aria-label="T('NxServerData')">
        <div class="nx-eyebrow">{{ T('NxServerData') }}</div>
        <div class="nx-hl-title">{{ T('NxServerDataTitle') }}</div>
        <dl class="nx-kv">
          <template v-for="item in serverItems" :key="item.key">
            <dt>{{ item.label }}</dt>
            <dd>
              <code>{{ item.value || '-' }}</code>
              <button v-if="item.value" type="button" class="nx-copy" :aria-label="T('NxCopy') + ' ' + item.label"
                      @click="copy(item.value)">
                <el-icon><el-icon-Document/></el-icon>
              </button>
            </dd>
          </template>
        </dl>
      </aside>
    </div>
  </section>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { T } from '@/utils/i18n'
  import { timeAgo } from '@/utils/time'
  import { useAppStore } from '@/store/app'
  import { list as peerList } from '@/api/peer'
  import { list as userList } from '@/api/user'
  import { list as connList } from '@/api/audit'

  const ONLINE_WINDOW_S = 60
  const appStore = useAppStore()

  const loading = ref(false)
  const loaded = ref(false)
  const error = ref(false)
  const updatedAt = ref('')
  const peers = ref({ total: 0, online: 0 })
  const users = ref(0)
  const today = ref(0)
  const todayCapped = ref(false)
  const recent = ref([])

  const pad = n => String(n).padStart(2, '0')
  const ago = s => timeAgo(s.replace(' ', 'T'))

  const stats = computed(() => [
    {
      key: 'online', icon: 'Connection', tone: 'accent', to: '/user/peer',
      label: T('NxDevicesOnline'), value: peers.value.online,
      hint: T('NxOnlineHint'),
    },
    {
      key: 'peers', icon: 'Monitor', tone: 'soft', to: '/user/peer',
      label: T('NxDevicesTotal'), value: peers.value.total,
    },
    {
      key: 'users', icon: 'UserFilled', tone: 'soft', to: '/user/index',
      label: T('NxUsersTotal'), value: users.value,
    },
    {
      key: 'today', icon: 'Tickets', tone: 'support', to: '/auditConn',
      label: T('NxConnectionsToday'), value: (todayCapped.value ? '99+' : today.value),
    },
  ])

  const serverItems = computed(() => {
    const c = appStore.setting.rustdeskConfig || {}
    return [
      { key: 'id', label: T('NxIdServer'), value: c.id_server },
      { key: 'relay', label: T('NxRelayServer'), value: c.relay_server },
      { key: 'api', label: T('NxApiServer'), value: c.api_server },
      { key: 'key', label: T('NxPublicKey'), value: c.key },
    ]
  })

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      ElMessage.success(T('CopySuccess'))
    } catch (e) {
      ElMessage.error(T('CopyFailed'))
    }
  }

  const load = async () => {
    loading.value = true
    error.value = false
    try {
      const [p, u, c] = await Promise.all([
        peerList({ page: 1, page_size: 5000 }),
        userList({ page: 1, page_size: 1 }),
        connList({ page: 1, page_size: 100 }),
      ])
      const nowS = Math.floor(Date.now() / 1000)
      const pl = p.data.list || []
      peers.value = {
        total: p.data.total,
        online: pl.filter(x => x.last_online_time && nowS - x.last_online_time < ONLINE_WINDOW_S).length,
      }
      users.value = u.data.total
      const conns = c.data.list || []
      const d = new Date()
      const prefix = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const todays = conns.filter(x => (x.created_at || '').startsWith(prefix))
      todayCapped.value = todays.length >= 100
      today.value = todays.length
      recent.value = conns.slice(0, 8)
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
    &:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(92, 80, 255, .14); }
  }
  .nx-stat-icon {
    width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; margin-bottom: 12px;
    &.is-accent { background: var(--nx-accent); color: #fff; }
    &.is-soft { background: var(--nx-tint); color: var(--nx-support); }
    &.is-support { background: #E3DFFF; color: var(--nx-support); }
  }
  .nx-stat-value { font-family: var(--nx-font-title); font-size: 36px; font-weight: 700; line-height: 1; color: var(--nx-text); }
  .nx-stat-hint { font-size: 11px; color: var(--nx-text-subtle); margin-top: 6px; }

  .nx-cols { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; align-items: start; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; }
  .nx-pad { padding: 20px 22px; }
  .nx-link { display: inline-flex; align-items: center; gap: 4px; color: var(--el-color-primary); font-size: 13px; font-weight: 600; text-decoration: none; &:hover { text-decoration: underline; } }
  .nx-muted { color: var(--nx-text-subtle); font-size: 12px; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; }

  .nx-highlight {
    padding: 22px 24px; border-radius: var(--nx-radius-card); color: #fff;
    background: linear-gradient(135deg, #5C50FF, #4901FA);
    box-shadow: 0 8px 24px rgba(92, 80, 255, .28);
  }
  .nx-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; opacity: .85; margin-bottom: 8px; }
  .nx-hl-title { font-family: var(--nx-font-title); font-size: 18px; font-weight: 700; margin-bottom: 14px; }
  .nx-kv { margin: 0; dt { font-size: 11px; opacity: .85; margin-top: 10px; } dd { margin: 2px 0 0; display: flex; align-items: center; gap: 8px; } }
  .nx-kv code {
    flex: 1; min-width: 0; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 12px;
    background: rgba(255, 255, 255, .16); border-radius: 8px; padding: 6px 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .nx-copy {
    flex: none; width: 30px; height: 30px; border: none; border-radius: 8px; cursor: pointer; color: #fff;
    background: rgba(255, 255, 255, .2); display: grid; place-items: center; transition: background .15s;
    &:hover { background: rgba(255, 255, 255, .32); }
    &:focus-visible { outline-color: #fff; }
  }

  @media (max-width: 1100px) { .nx-cols { grid-template-columns: 1fr; } }
  @media (max-width: 1024px) { .nx-stats { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .nx-stats { grid-template-columns: 1fr; } .nx-h1 { font-size: 22px; } }
</style>
