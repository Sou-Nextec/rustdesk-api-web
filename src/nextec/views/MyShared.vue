<template>
  <section class="nx-listpage" aria-label="Clientes liberados">
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar por ID, apelido, computador, usuário ou etiqueta"
                aria-label="Buscar dispositivo" @input="page = 1">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <el-select v-model="listFilter" class="nx-filter" placeholder="Todos os clientes" clearable filterable aria-label="Filtrar por cliente" @change="page = 1">
        <el-option v-for="c in collections" :key="c.id" :label="clientName(c)" :value="c.id"/>
      </el-select>
      <el-select v-model="statusFilter" class="nx-filter-sm" placeholder="Situação" clearable aria-label="Filtrar por situação" @change="page = 1">
        <el-option label="Online" value="online"/>
        <el-option label="Offline" value="offline"/>
      </el-select>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
      </div>
    </div>

    <div class="nx-summary">
      <span>{{ filtered.length }} de {{ all.length }} dispositivos</span>
      <span class="nx-sep">·</span>
      <span><span class="nx-dot is-on"></span>{{ onlineCount }} online</span>
      <span class="nx-sep">·</span>
      <span>{{ collections.length }} {{ collections.length === 1 ? 'cliente liberado' : 'clientes liberados' }}</span>
    </div>

    <div class="nx-card">
      <el-table :data="pageRows" v-loading="loading" row-key="key" aria-label="Clientes liberados" empty-text=" ">
        <el-table-column label="ID" min-width="140">
          <template #default="{ row }">
            <span class="nx-id">{{ row.id }}</span>
            <button type="button" class="nx-copy" :aria-label="'Copiar ID ' + row.id" @click="copy(row.id)">
              <el-icon><el-icon-CopyDocument/></el-icon>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="Apelido" min-width="130">
          <template #default="{ row }"><span v-if="row.alias">{{ row.alias }}</span><span v-else class="nx-muted">-</span></template>
        </el-table-column>
        <el-table-column label="Nome do computador" prop="hostname" min-width="140"/>
        <el-table-column label="Usuário" prop="username" min-width="110"/>
        <el-table-column label="Cliente" min-width="140">
          <template #default="{ row }"><el-tag disable-transitions>{{ row.client }}</el-tag></template>
        </el-table-column>
        <el-table-column label="Última vez online" min-width="140">
          <template #default="{ row }">
            <span class="nx-dot" :class="isOnline(row) ? 'is-on' : 'is-off'" aria-hidden="true"></span>
            <span>{{ lastSeen(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="160">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="connectByClient(row.id)">Conectar</el-button>
              <el-dropdown v-if="appStore.setting.appConfig.web_client" trigger="click" @command="() => toWebClientLink(row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu><el-dropdown-item command="web">Abrir no navegador</el-dropdown-item></el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filtered.length" :image-size="72"
                :description="all.length ? 'Nenhum dispositivo encontrado com esses filtros.' : 'Nenhum cliente liberado para você ainda.'">
        <p v-if="!all.length">Peça ao administrador para liberar os clientes que você atende, em Permissões por cliente.</p>
        <el-button v-else @click="clearFilters">Limpar filtros</el-button>
      </el-empty>
      <div v-if="filtered.length > pageSize || pageSize !== 20" class="nx-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]"
                       layout="total, prev, pager, next, sizes" :total="filtered.length" background/>
      </div>
    </div>
  </section>
</template>

<script setup>
  import { computed, onActivated, onMounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { sharedCollections, sharedAddressBooks } from '@/nextec/api'
  import { useAppStore } from '@/store/app'
  import { timeAgo } from '@/utils/time'
  import { connectDevice as connectByClient } from '@/nextec/connect'
  import { toWebClientLink } from '@/utils/webclient'
  import '../list-page.scss'

  const appStore = useAppStore()
  const all = ref([])
  const collections = ref([])
  const loading = ref(false)
  // as listas criadas em Permissões por cliente se chamam "Cliente: <nome>"
  const clientName = c => String(c?.name || '').replace(/^Cliente:\s*/, '')

  const load = async () => {
    loading.value = true
    const [cols, ab] = await Promise.all([
      sharedCollections().catch(() => false),
      sharedAddressBooks({ collection_id: 0 }).catch(() => false),
    ])
    collections.value = cols ? (cols.data.list || []).sort((a, b) => clientName(a).localeCompare(clientName(b), 'pt-BR')) : []
    const byId = Object.fromEntries(collections.value.map(c => [c.id, c]))
    all.value = (ab ? (ab.data.list || []) : []).map(r => ({ ...r, key: r.collection_id + '-' + r.row_id, client: clientName(byId[r.collection_id]) }))
    loading.value = false
  }
  onMounted(load)
  onActivated(load)

  const isOnline = r => !!(r.last_online_time && (Date.now() / 1000 - r.last_online_time) < 60)
  const lastSeen = r => isOnline(r) ? 'Online agora' : (r.last_online_time ? timeAgo(r.last_online_time * 1000) : 'Nunca')
  const onlineCount = computed(() => all.value.filter(isOnline).length)

  const q = ref('')
  const listFilter = ref(null)
  const statusFilter = ref(null)
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = computed(() => {
    const term = norm(q.value.trim())
    return all.value.filter(r => {
      if (listFilter.value !== null && listFilter.value !== '' && r.collection_id !== listFilter.value) return false
      if (statusFilter.value === 'online' && !isOnline(r)) return false
      if (statusFilter.value === 'offline' && isOnline(r)) return false
      return !term || [r.id, r.alias, r.hostname, r.username, r.client, ...(r.tags || [])].some(v => norm(v).includes(term))
    }).sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || String(a.alias || a.hostname || a.id).localeCompare(String(b.alias || b.hostname || b.id), 'pt-BR'))
  })
  const clearFilters = () => { q.value = ''; listFilter.value = null; statusFilter.value = null }
  // atalhos: ?q= (pesquisa do topo) e ?list= (cartão do Início)
  const route = useRoute()
  watch(() => [route.query.q, route.query.list], ([qq, list]) => {
    if (qq || list) clearFilters()
    if (qq) q.value = String(qq)
    if (list) listFilter.value = Number(list)
  }, { immediate: true })

  const page = ref(1)
  const pageSize = ref(20)
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success('ID copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
</script>
