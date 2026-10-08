<template>
  <section class="nx-dev" aria-label="Dispositivos">
    <!-- busca e filtros -->
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar por ID, apelido, computador, usuário ou IP"
                aria-label="Buscar dispositivo" @input="page = 1">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <el-select v-model="clientFilter" class="nx-filter" placeholder="Todos os clientes" clearable filterable
                 aria-label="Filtrar por cliente" @change="page = 1">
        <el-option label="Sem cliente" :value="0"/>
        <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id"/>
      </el-select>
      <el-select v-model="statusFilter" class="nx-filter-sm" placeholder="Situação" clearable aria-label="Filtrar por situação"
                 @change="page = 1">
        <el-option label="Online" value="online"/>
        <el-option label="Offline" value="offline"/>
      </el-select>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load">
          <el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span>
        </el-button>
        <el-dropdown trigger="click" @command="onToolbar">
          <el-button>Mais opções<el-icon class="el-icon--right"><el-icon-ArrowDown/></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="columns">Escolher colunas</el-dropdown-item>
              <el-dropdown-item command="export">Exportar lista (CSV)</el-dropdown-item>
              <el-dropdown-item command="import">Importar dispositivos (CSV)</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" @click="openForm()">
          <el-icon><el-icon-Plus/></el-icon><span>Adicionar</span>
        </el-button>
      </div>
    </div>

    <!-- resumo e ações em lote -->
    <div class="nx-summary">
      <span>{{ filtered.length }} de {{ all.length }} dispositivos</span>
      <span class="nx-sep">·</span>
      <span><span class="nx-dot is-on"></span>{{ onlineCount }} online</span>
      <template v-if="selected.length">
        <span class="nx-sep">·</span>
        <strong>{{ selected.length }} selecionado(s)</strong>
        <el-button size="small" @click="openBatchList">Salvar em uma lista</el-button>
        <el-button size="small" type="danger" @click="batchDelete">Excluir</el-button>
      </template>
    </div>

    <!-- tabela -->
    <div class="nx-card">
      <el-table :data="pageRows" v-loading="loading" row-key="row_id" aria-label="Dispositivos"
                @selection-change="v => selected = v" empty-text=" ">
        <el-table-column type="selection" width="44" reserve-selection/>
        <el-table-column label="ID" min-width="140">
          <template #default="{ row }">
            <span class="nx-id">{{ row.id }}</span>
            <button type="button" class="nx-copy" :aria-label="'Copiar ID ' + row.id" @click="copy(row.id)">
              <el-icon><el-icon-CopyDocument/></el-icon>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="Apelido" prop="alias" min-width="120">
          <template #default="{ row }">
            <span v-if="row.alias">{{ row.alias }}</span>
            <span v-else class="nx-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="Nome do computador" prop="hostname" min-width="150"/>
        <el-table-column label="Usuário" prop="username" min-width="120"/>
        <el-table-column label="Cliente" min-width="120">
          <template #default="{ row }">
            <el-tag v-if="groupName(row.group_id)">{{ groupName(row.group_id) }}</el-tag>
            <span v-else class="nx-muted">Sem cliente</span>
          </template>
        </el-table-column>
        <el-table-column label="Última vez online" min-width="140">
          <template #default="{ row }">
            <span class="nx-dot" :class="isOnline(row) ? 'is-on' : 'is-off'" aria-hidden="true"></span>
            <span>{{ isOnline(row) ? 'Online agora' : (row.last_online_time ? timeAgo(row.last_online_time * 1000) : 'Nunca') }}</span>
          </template>
        </el-table-column>
        <template v-for="c in optionalColumns" :key="c.key">
          <el-table-column v-if="cols[c.key]" :label="c.label" :prop="c.key" :min-width="c.width" show-overflow-tooltip/>
        </template>
        <el-table-column label="Ações" width="210" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="connectByClient(row.id)">Conectar</el-button>
              <el-button size="small" @click="openForm(row)">Editar</el-button>
              <el-dropdown trigger="click" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações">
                  <el-icon><el-icon-MoreFilled/></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="appStore.setting.appConfig.web_client" command="web">Abrir no navegador</el-dropdown-item>
                    <el-dropdown-item command="list">Salvar em uma lista</el-dropdown-item>
                    <el-dropdown-item command="delete" divided><span class="nx-danger">Excluir</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filtered.length" :image-size="72"
                :description="all.length ? 'Nenhum dispositivo encontrado com esses filtros.' : 'Nenhum dispositivo conectado a este servidor ainda.'">
        <el-button v-if="all.length" @click="clearFilters">Limpar filtros</el-button>
      </el-empty>
      <div v-if="filtered.length > pageSize || pageSize !== 20" class="nx-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]"
                       layout="total, prev, pager, next, sizes" :total="filtered.length" background/>
      </div>
    </div>

    <!-- editar / adicionar -->
    <el-dialog v-model="form.visible" :title="form.data.row_id ? 'Editar dispositivo' : 'Adicionar dispositivo'" width="640px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <div class="nx-form-grid">
          <el-form-item label="ID" required class="is-required">
            <el-input v-model="form.data.id" placeholder="ID do RustDesk (ex.: 123456789)"/>
          </el-form-item>
          <el-form-item label="Apelido">
            <el-input v-model="form.data.alias" placeholder="Como a equipe reconhece (ex.: Recepção)"/>
          </el-form-item>
          <el-form-item label="Cliente">
            <el-select v-model="form.data.group_id" filterable>
              <el-option label="Sem cliente" :value="0"/>
              <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id"/>
            </el-select>
          </el-form-item>
          <el-form-item label="Usuário">
            <el-input v-model="form.data.username"/>
          </el-form-item>
          <el-form-item label="Nome do computador">
            <el-input v-model="form.data.hostname"/>
          </el-form-item>
        </div>
        <el-collapse class="nx-tech">
          <el-collapse-item title="Dados técnicos (preenchidos pelo app RustDesk)" name="tech">
            <div class="nx-form-grid">
              <el-form-item label="Sistema operacional"><el-input v-model="form.data.os"/></el-form-item>
              <el-form-item label="Versão do app"><el-input v-model="form.data.version"/></el-form-item>
              <el-form-item label="Processador"><el-input v-model="form.data.cpu"/></el-form-item>
              <el-form-item label="Memória"><el-input v-model="form.data.memory"/></el-form-item>
              <el-form-item label="UUID"><el-input v-model="form.data.uuid"/></el-form-item>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="form.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="form.saving" @click="saveForm">Salvar</el-button>
      </template>
    </el-dialog>

    <!-- salvar em uma lista (um dispositivo) -->
    <el-dialog v-model="listForm.visible" title="Salvar em uma lista de acessos" width="720px" destroy-on-close class="nx-ab-dialog">
      <div class="nx-explain">
        <el-icon :size="18"><el-icon-InfoFilled/></el-icon>
        <p>O dispositivo passa a aparecer no <strong>app RustDesk</strong>, na aba <strong>Lista de endereços</strong>, de quem tem acesso à lista escolhida, com o apelido e as etiquetas abaixo. Isso facilita achar a máquina sem decorar o ID.<br>
          <span class="nx-muted">Em <strong>Dono da lista</strong>, escolha uma pessoa para usar uma lista dela. Se marcar várias, o dispositivo vai para a lista pessoal de cada uma.</span></p>
      </div>
      <createABForm v-if="listForm.visible" :peer="listForm.row" @success="listForm.visible = false; ok('Dispositivo salvo na lista.')"
                    @cancel="listForm.visible = false"/>
    </el-dialog>

    <!-- salvar em uma lista (vários) -->
    <el-dialog v-model="batchList.visible" title="Salvar selecionados em uma lista" width="560px">
      <div class="nx-explain">
        <el-icon :size="18"><el-icon-InfoFilled/></el-icon>
        <p>{{ selected.length }} dispositivo(s) vão aparecer no app RustDesk, na aba Lista de endereços, de quem tem acesso à lista escolhida.</p>
      </div>
      <el-form label-position="top" class="nx-form">
        <el-form-item label="Dono da lista" required class="is-required">
          <el-select v-model="batchList.user_id" filterable placeholder="Escolha a pessoa" @change="loadUserLists">
            <el-option v-for="u in allUsers" :key="u.id" :label="u.nickname ? `${u.nickname} (${u.username})` : u.username" :value="u.id"/>
          </el-select>
        </el-form-item>
        <el-form-item label="Lista" required class="is-required">
          <el-select v-model="batchList.collection_id" :disabled="!batchList.user_id">
            <el-option label="Lista pessoal (Minha lista de endereços)" :value="0"/>
            <el-option v-for="c in userLists" :key="c.id" :label="c.name" :value="c.id"/>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchList.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="batchList.saving" @click="saveBatchList">Salvar</el-button>
      </template>
    </el-dialog>

    <!-- colunas -->
    <el-dialog v-model="colsVisible" title="Escolher colunas" width="420px">
      <p class="nx-muted nx-cols-help">ID, Apelido, Nome do computador, Usuário, Cliente e Última vez online aparecem sempre.</p>
      <div class="nx-cols">
        <el-checkbox v-for="c in optionalColumns" :key="c.key" v-model="cols[c.key]" :label="c.label"/>
      </div>
      <template #footer>
        <el-button type="primary" @click="saveCols">Pronto</el-button>
      </template>
    </el-dialog>

    <!-- importar -->
    <el-dialog v-model="importVisible" title="Importar dispositivos" width="560px">
      <el-upload drag accept=".csv" :before-upload="parseCsv" :show-file-list="false">
        <el-icon class="el-icon--upload"><el-icon-UploadFilled/></el-icon>
        <div class="el-upload__text">Arraste o arquivo CSV aqui ou <em>clique para escolher</em></div>
        <template #tip>
          <p class="nx-muted">Colunas aceitas: <code>id, alias, hostname, username, group_id, os, version, cpu, memory, uuid</code>. Use um arquivo exportado como modelo.</p>
        </template>
      </el-upload>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { batchRemove, create, list, remove, update } from '@/api/peer'
  import { list as groupList } from '@/api/device_group'
  import { batchCreateFromPeers } from '@/api/address_book'
  import { list as collectionList } from '@/api/address_book_collection'
  import { loadAllUsers } from '@/global'
  import { useAppStore } from '@/store/app'
  import { timeAgo } from '@/utils/time'
  import { connectByClient } from '@/utils/peer'
  import { toWebClientLink } from '@/utils/webclient'
  import { downBlob, jsonToCsv } from '@/utils/file'
  import createABForm from '@/views/peer/createABForm.vue'

  const appStore = useAppStore()
  const ok = (m = 'Operação concluída.') => ElMessage.success(m)

  // ---------- dados ----------
  const all = ref([])
  const groups = ref([])
  const loading = ref(false)
  const load = async () => {
    loading.value = true
    const [p, g] = await Promise.all([
      list({ page: 1, page_size: 10000 }).catch(() => false),
      groupList({ page: 1, page_size: 999 }).catch(() => false),
    ])
    loading.value = false
    if (p) all.value = p.data.list || []
    if (g) groups.value = g.data.list || []
  }
  onMounted(load)
  onActivated(load)
  const groupName = id => (id && groups.value.find(g => g.id === id)?.name) || ''
  // subgrupos usam o nome "Cliente / Subgrupo": filtrar pelo cliente inclui os subgrupos dele
  const inClient = (groupId, filterId) => {
    if (groupId === filterId) return true
    const parent = groupName(filterId)
    return !!parent && groupName(groupId).startsWith(parent + ' / ')
  }

  const isOnline = row => row.last_online_time && (Date.now() / 1000 - row.last_online_time) < 60
  const onlineCount = computed(() => all.value.filter(isOnline).length)

  // ---------- filtros ----------
  const q = ref('')
  const clientFilter = ref(null)
  const statusFilter = ref(null)
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = computed(() => {
    const term = norm(q.value.trim())
    return all.value.filter(r => {
      if (clientFilter.value !== null && clientFilter.value !== '' && !inClient(r.group_id || 0, clientFilter.value)) return false
      if (statusFilter.value === 'online' && !isOnline(r)) return false
      if (statusFilter.value === 'offline' && isOnline(r)) return false
      if (!term) return true
      return [r.id, r.alias, r.hostname, r.username, r.last_online_ip, groupName(r.group_id)].some(v => norm(v).includes(term))
    }).sort((a, b) => (b.last_online_time || 0) - (a.last_online_time || 0))
  })
  const clearFilters = () => { q.value = ''; clientFilter.value = null; statusFilter.value = null }
  // pesquisa do topo: Enter abre esta tela com ?q=
  const route = useRoute()
  watch(() => route.query.q, v => { if (v) { clearFilters(); q.value = String(v) } }, { immediate: true })
  // atalho do Início: ?client=0 lista os dispositivos sem cliente
  watch(() => route.query.client, v => { if (v !== undefined && v !== '') { clearFilters(); clientFilter.value = Number(v) } }, { immediate: true })

  const page = ref(1)
  const pageSize = ref(20)
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  const selected = ref([])

  // ---------- colunas opcionais ----------
  const optionalColumns = [
    { key: 'last_online_ip', label: 'Último IP', width: 120 },
    { key: 'os', label: 'Sistema operacional', width: 160 },
    { key: 'version', label: 'Versão do app', width: 100 },
    { key: 'cpu', label: 'Processador', width: 160 },
    { key: 'memory', label: 'Memória', width: 100 },
    { key: 'uuid', label: 'UUID', width: 140 },
    { key: 'created_at', label: 'Cadastrado em', width: 150 },
    { key: 'updated_at', label: 'Atualizado em', width: 150 },
  ]
  const COLS_KEY = 'nx_peer_columns'
  const cols = reactive(Object.fromEntries(optionalColumns.map(c => [c.key, false])))
  try { Object.assign(cols, JSON.parse(localStorage.getItem(COLS_KEY) || '{}')) } catch (e) { /* preferência opcional */ }
  const colsVisible = ref(false)
  const saveCols = () => {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch (e) { /* preferência opcional */ }
    colsVisible.value = false
  }

  // ---------- ações ----------
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ok('ID copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
  const onToolbar = (cmd) => {
    if (cmd === 'columns') colsVisible.value = true
    if (cmd === 'export') exportCsv()
    if (cmd === 'import') importVisible.value = true
  }
  const onRow = (cmd, row) => {
    if (cmd === 'web') toWebClientLink(row)
    if (cmd === 'list') { listForm.row = row; listForm.visible = true }
    if (cmd === 'delete') delOne(row)
  }

  const empty = () => ({ row_id: 0, id: '', alias: '', group_id: 0, username: '', hostname: '', os: '', version: '', cpu: '', memory: '', uuid: '' })
  const form = reactive({ visible: false, saving: false, data: empty() })
  const openForm = (row) => {
    form.data = row ? { ...empty(), ...Object.fromEntries(Object.keys(empty()).map(k => [k, row[k] ?? empty()[k]])) } : empty()
    form.visible = true
  }
  const saveForm = async () => {
    if (!String(form.data.id).trim()) return ElMessage.warning('Informe o ID do dispositivo.')
    form.saving = true
    const api = form.data.row_id ? update : create
    const res = await api({ ...form.data, id: String(form.data.id).trim() }).catch(() => false)
    form.saving = false
    if (res) { form.visible = false; ok(form.data.row_id ? 'Dispositivo atualizado.' : 'Dispositivo adicionado.'); load() }
  }

  const delOne = async (row) => {
    const label = row.alias || row.hostname || row.id
    const c = await ElMessageBox.confirm(`Excluir o dispositivo "${label}"? Se o app RustDesk dele continuar ativo, ele volta a aparecer na próxima conexão.`,
      'Excluir dispositivo', { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await remove({ row_id: row.row_id }).catch(() => false)
    if (res) { ok('Dispositivo excluído.'); load() }
  }
  const batchDelete = async () => {
    const c = await ElMessageBox.confirm(`Excluir ${selected.value.length} dispositivo(s)?`, 'Excluir selecionados',
      { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await batchRemove({ row_ids: selected.value.map(r => r.row_id) }).catch(() => false)
    if (res) { ok('Dispositivos excluídos.'); selected.value = []; load() }
  }

  // salvar em lista
  const listForm = reactive({ visible: false, row: {} })
  const { allUsers, getAllUsers } = loadAllUsers()
  onMounted(getAllUsers)
  const batchList = reactive({ visible: false, saving: false, user_id: null, collection_id: 0 })
  const userLists = ref([])
  const openBatchList = () => { batchList.user_id = null; batchList.collection_id = 0; userLists.value = []; batchList.visible = true }
  const loadUserLists = async (uid) => {
    batchList.collection_id = 0
    const res = await collectionList({ page: 1, page_size: 9999, user_id: uid }).catch(() => false)
    userLists.value = res ? (res.data.list || []) : []
  }
  const saveBatchList = async () => {
    if (!batchList.user_id) return ElMessage.warning('Escolha o dono da lista.')
    batchList.saving = true
    const res = await batchCreateFromPeers({ user_id: batchList.user_id, collection_id: batchList.collection_id, tags: [],
      peer_ids: selected.value.map(r => r.row_id) }).catch(() => false)
    batchList.saving = false
    if (res) { batchList.visible = false; ok('Dispositivos salvos na lista.') }
  }

  // exportar / importar
  const exportCsv = () => {
    const rows = filtered.value.map(r => ({
      id: r.id, alias: r.alias, hostname: r.hostname, username: r.username, group_id: r.group_id,
      cliente: groupName(r.group_id), os: r.os, version: r.version, cpu: r.cpu, memory: r.memory, uuid: r.uuid,
      last_online_ip: r.last_online_ip,
      last_online_time: r.last_online_time ? new Date(r.last_online_time * 1000).toLocaleString() : '-',
    }))
    downBlob(jsonToCsv(rows), 'dispositivos.csv')
  }
  const importVisible = ref(false)
  const IMPORT_KEYS = ['id', 'alias', 'hostname', 'username', 'group_id', 'os', 'version', 'cpu', 'memory', 'uuid']
  const parseCsv = (file) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const lines = String(e.target.result).split(/\r?\n/).filter(l => l.trim())
      const keys = lines[0].split(',').map(k => k.trim().replace(/^"|"$/g, ''))
      const items = lines.slice(1).map(line => {
        const obj = {}
        line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).forEach((v, i) => {
          const k = keys[i]
          if (IMPORT_KEYS.includes(k)) obj[k] = v.trim().replace(/^"|"$/g, '')
        })
        obj.group_id = parseInt(obj.group_id) || 0
        return obj
      }).filter(o => o.id)
      if (!items.length) return ElMessage.warning('Nenhum dispositivo com ID encontrado no arquivo.')
      const results = await Promise.all(items.map(i => create(i).catch(() => false)))
      const okCount = results.filter(Boolean).length
      ElMessage[okCount === items.length ? 'success' : 'warning'](`${okCount} de ${items.length} dispositivo(s) importado(s).`)
      importVisible.value = false
      load()
    }
    reader.readAsText(file)
    return false
  }
</script>

<style scoped lang="scss">
  .nx-bar {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 16px 18px; margin-bottom: 12px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
  }
  .nx-search { flex: 1 1 320px; max-width: 460px; }
  .nx-filter { width: 220px; }
  .nx-filter-sm { width: 150px; }
  .nx-bar-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; .el-button + .el-button { margin-left: 0; } }

  .nx-summary {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 4px 12px; font-size: 13px; color: var(--nx-text-muted);
    strong { color: var(--nx-text); }
    .el-button { margin-left: 0; }
  }
  .nx-sep { opacity: .5; }
  .nx-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-off { background: #9A97AD; }
  }

  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-id { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; font-size: 13px; white-space: nowrap; }
  :deep(td .cell:has(.nx-id)) { white-space: nowrap; }
  .nx-copy {
    margin-left: 6px; border: none; background: transparent; cursor: pointer; color: var(--nx-text-subtle); padding: 2px; border-radius: 6px;
    vertical-align: middle; &:hover { color: var(--nx-accent); background: var(--nx-tint); }
  }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-row-actions { display: flex; gap: 6px; flex-wrap: nowrap; .el-button { margin: 0 !important; } }
  .nx-danger { color: #BA1A1A; }
  .nx-pager { padding: 12px 18px; border-top: 1px solid var(--nx-divider); display: flex; justify-content: flex-end; }

  .nx-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; }
  .nx-form :deep(.el-select) { width: 100%; }
  .nx-tech { margin-top: 4px; border-top: 1px solid var(--nx-divider); border-bottom: none;
    :deep(.el-collapse-item__header) { font-weight: 600; font-size: 13px; color: var(--nx-text-muted); background: transparent; }
    :deep(.el-collapse-item__wrap) { background: transparent; border-bottom: none; }
  }
  .nx-explain {
    display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; margin-bottom: 16px; border-radius: 12px;
    background: var(--nx-tint); color: var(--nx-text);
    .el-icon { color: var(--nx-accent); flex: none; margin-top: 2px; }
    p { margin: 0; font-size: 13px; line-height: 1.55; }
  }
  .nx-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
  .nx-cols-help { margin: 0 0 12px; font-size: 13px; }

  @media (max-width: 768px) {
    .nx-search, .nx-filter, .nx-filter-sm { flex: 1 1 100%; max-width: none; width: 100%; }
    .nx-bar-right { margin-left: 0; width: 100%; }
    .nx-form-grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>
