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
        <div class="nx-stat-body">
          <div class="nx-stat-label">{{ s.label }}</div>
          <el-skeleton v-if="loading && !loaded" animated :rows="0" style="width:60px">
            <template #template><el-skeleton-item variant="h1" style="width:60px"/></template>
          </el-skeleton>
          <div v-else class="nx-stat-value">{{ s.value }}</div>
          <div v-if="s.hint" class="nx-stat-hint">{{ s.hint }}</div>
        </div>
      </router-link>
    </div>

    <el-card class="nx-card" shadow="never">
      <template #header>
        <div class="nx-card-head">
          <h2 class="nx-h2">{{ T('NxRecentConnections') }}</h2>
          <router-link to="/auditConn" class="nx-link">{{ T('NxViewAll') }}
            <el-icon><el-icon-ArrowRight/></el-icon>
          </router-link>
        </div>
      </template>

      <el-skeleton v-if="loading && !loaded" animated :rows="4"/>
      <el-empty v-else-if="!recent.length" :description="T('NxRecentEmpty')">
        <p class="nx-empty-hint">{{ T('NxRecentEmptyHint') }}</p>
      </el-empty>
      <el-table v-else :data="recent" class="nx-table" :aria-label="T('NxRecentConnections')">
        <el-table-column :label="T('NxConnStarted')" min-width="150">
          <template #default="{ row }">
            <div>{{ row.created_at }}</div>
            <div class="nx-muted">{{ ago(row.created_at) }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="T('NxConnOrigin')" min-width="150">
          <template #default="{ row }">{{ row.from_name || row.from_peer || '-' }}</template>
        </el-table-column>
        <el-table-column :label="T('NxConnTarget')" prop="peer_id" min-width="120"/>
        <el-table-column :label="T('Ip')" prop="ip" min-width="120"/>
        <el-table-column :label="T('NxConnType')" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.type === 1" type="warning">{{ T('File') }}</el-tag>
            <el-tag v-else type="primary">{{ T('Common') }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { T } from '@/utils/i18n'
  import { timeAgo } from '@/utils/time'
  import { list as peerList } from '@/api/peer'
  import { list as userList } from '@/api/user'
  import { list as connList } from '@/api/audit'

  const ONLINE_WINDOW_S = 60

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
      key: 'peers', icon: 'Monitor', tone: 'base', to: '/user/peer',
      label: T('NxDevicesTotal'), value: peers.value.total,
    },
    {
      key: 'users', icon: 'UserFilled', tone: 'base', to: '/user/index',
      label: T('NxUsersTotal'), value: users.value,
    },
    {
      key: 'today', icon: 'Tickets', tone: 'support', to: '/auditConn',
      label: T('NxConnectionsToday'), value: (todayCapped.value ? '99+' : today.value),
    },
  ])

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
  .nx-home { max-width: 1180px; margin: 0 auto; }
  .nx-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .nx-h1 { font-size: 26px; margin: 0; color: var(--nx-text); }
  .nx-sub { margin: 4px 0 0; color: var(--nx-text-muted); font-size: 14px; }
  .nx-head-actions { display: flex; align-items: center; gap: 12px; }
  .nx-updated { color: var(--nx-text-muted); font-size: 13px; }
  .nx-alert { margin-bottom: 16px; }

  .nx-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
  .nx-stat {
    display: flex; gap: 14px; align-items: flex-start; padding: 18px;
    background: var(--nx-surface); border: 1px solid var(--nx-border); border-radius: 12px;
    text-decoration: none; color: inherit; transition: box-shadow .15s, border-color .15s;
    &:hover { border-color: var(--nx-accent); box-shadow: 0 4px 14px rgba(13, 0, 53, .08); }
  }
  .nx-stat-icon {
    width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; flex: none;
    &.is-accent { background: var(--nx-accent); color: #fff; }
    &.is-base { background: var(--el-color-primary-light-9); color: var(--el-color-primary-dark-2); }
    &.is-support { background: var(--el-color-primary-light-9); color: var(--nx-support); }
  }
  .nx-stat-label { font-size: 13px; font-weight: 600; color: var(--nx-text-muted); }
  .nx-stat-value { font-family: var(--nx-font-title); font-size: 32px; font-weight: 800; line-height: 1.2; color: var(--nx-text); }
  .nx-stat-hint { font-size: 12px; color: var(--nx-text-muted); margin-top: 2px; }

  .nx-card { border-radius: 12px; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; }
  .nx-h2 { font-size: 18px; margin: 0; }
  .nx-link { display: inline-flex; align-items: center; gap: 4px; color: var(--el-color-primary); font-weight: 600; text-decoration: none; &:hover { text-decoration: underline; } }
  .nx-muted { color: var(--nx-text-muted); font-size: 12px; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; }

  @media (max-width: 1024px) { .nx-stats { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .nx-stats { grid-template-columns: 1fr; } .nx-h1 { font-size: 22px; } }
</style>
