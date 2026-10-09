<template>
  <section class="nx-ses" aria-label="Conexões ativas">
    <div class="nx-bar">
      <p class="nx-bar-text">Quem está conectado agora em cada máquina. Desconectar derruba a sessão em alguns segundos. A lista atualiza sozinha.</p>
      <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
    </div>

    <div class="nx-card">
      <ul v-if="isMobile && list.length" class="nx-cards" aria-label="Conexões ativas">
        <li v-for="s in list" :key="s.peer_id + ':' + s.conn_id" class="nx-mcard">
          <div class="nx-mcard-top">
            <strong class="nx-mcard-title">{{ name(s) }}</strong>
            <el-tag v-if="s.pending" type="warning" disable-transitions>Desconectando</el-tag>
          </div>
          <div class="nx-small nx-muted">{{ s.peer_id }}{{ client(s) ? ' · ' + client(s) : '' }}</div>
          <div class="nx-small">{{ who(s) }} · {{ kind(s.type) }}{{ s.started_at ? ' · desde ' + ago(s.started_at) : '' }}</div>
          <el-button size="small" type="danger" :disabled="s.pending" @click="drop(s)">Desconectar</el-button>
        </li>
      </ul>
      <el-table v-else-if="!isMobile" :data="list" v-loading="loading && !loaded" row-key="rowKey" aria-label="Conexões ativas" empty-text=" ">
        <el-table-column label="Máquina" min-width="200">
          <template #default="{ row }">
            <div class="nx-name">{{ name(row) }}</div>
            <div class="nx-small nx-muted nx-mono">{{ row.peer_id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Cliente" min-width="150">
          <template #default="{ row }"><el-tag v-if="client(row)" disable-transitions>{{ client(row) }}</el-tag><span v-else class="nx-muted">-</span></template>
        </el-table-column>
        <el-table-column label="Quem conectou" min-width="190">
          <template #default="{ row }">
            <div>{{ who(row) }}</div>
            <div class="nx-small nx-muted">{{ row.ip || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Tipo" min-width="130"><template #default="{ row }">{{ kind(row.type) }}</template></el-table-column>
        <el-table-column label="Desde" min-width="130"><template #default="{ row }">{{ row.started_at ? ago(row.started_at) : '-' }}</template></el-table-column>
        <el-table-column label="Ações" width="150" fixed="right">
          <template #default="{ row }">
            <el-tag v-if="row.pending" type="warning" disable-transitions>Desconectando</el-tag>
            <el-button v-else size="small" type="danger" @click="drop(row)">Desconectar</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="loaded && !list.length" :image-size="72" description="Ninguém conectado agora.">
        <p class="nx-empty-hint">As conexões abertas aparecem aqui assim que o app da máquina avisa o servidor.</p>
      </el-empty>
    </div>
  </section>
</template>

<script setup>
  import { onBeforeUnmount, onMounted, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useMediaQuery } from '@vueuse/core'
  import { list as groupList } from '@/api/device_group'
  import { timeAgo } from '@/utils/time'
  import { sessionsList, sessionDisconnect } from '@/nextec/api'

  const isMobile = useMediaQuery('(max-width: 768px)')
  const loading = ref(false)
  const loaded = ref(false)
  const list = ref([])
  const groups = ref([])
  let timer = null

  const load = async () => {
    loading.value = true
    const res = await sessionsList().catch(() => false)
    loading.value = false
    loaded.value = true
    if (res) list.value = (res.data.list || []).map(s => ({ ...s, rowKey: `${s.peer_id}:${s.conn_id}` }))
  }
  onMounted(async () => {
    const g = await groupList({ page: 1, page_size: 999 }).catch(() => false)
    if (g) groups.value = g.data.list || []
    load()
    timer = setInterval(() => { if (!document.hidden) load() }, 8000)
  })
  onBeforeUnmount(() => clearInterval(timer))

  const name = (s) => s.alias || s.hostname || s.peer_id
  const client = (s) => (s.group_id ? groups.value.find(g => g.id === s.group_id)?.name || '' : '')
  const who = (s) => [s.from_name, s.from_peer ? `ID ${s.from_peer}` : ''].filter(Boolean).join(' · ') || 'Não identificado'
  const kind = (t) => ({ 0: 'Controle remoto', 1: 'Transferência de arquivos', 2: 'Túnel de portas', 3: 'Câmera', 4: 'Terminal' })[t] || 'Conexão'
  const ago = (ts) => timeAgo(ts * 1000)

  const drop = async (s) => {
    const c = await ElMessageBox.confirm(`Derrubar a conexão de ${who(s)} em ${name(s)}? A pessoa perde o acesso na hora e pode conectar de novo se tiver permissão.`, 'Desconectar',
      { confirmButtonText: 'Desconectar', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await sessionDisconnect(s.peer_id, s.conn_id).catch(() => false)
    if (res) { ElMessage.success('Pedido enviado. O app derruba em alguns segundos.'); load() }
  }
</script>

<style scoped lang="scss">
  .nx-ses { max-width: 1100px; }
  .nx-bar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 14px 18px; margin-bottom: 16px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); }
  .nx-bar-text { margin: 0; flex: 1 1 320px; font-size: 13px; color: var(--nx-text-muted); }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-name { font-weight: 600; color: var(--nx-text); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; max-width: 420px; }
  .nx-cards { list-style: none; margin: 0; padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
  .nx-mcard { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 14px; border-radius: 14px; background: var(--nx-bg); }
  .nx-mcard-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; }
  .nx-mcard-title { color: var(--nx-text); font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
</style>
