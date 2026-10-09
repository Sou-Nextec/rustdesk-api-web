<template>
  <section class="nx-listpage" aria-label="Meus dispositivos">
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar por ID, apelido, computador, usuário ou IP"
                aria-label="Buscar dispositivo" @input="page = 1">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <el-select v-model="statusFilter" class="nx-filter-sm" placeholder="Situação" clearable aria-label="Filtrar por situação" @change="page = 1">
        <el-option label="Online" value="online"/>
        <el-option label="Offline" value="offline"/>
      </el-select>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-dropdown trigger="click" @command="onToolbar">
          <el-button>Mais opções<el-icon class="el-icon--right"><el-icon-ArrowDown/></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="columns">Escolher colunas</el-dropdown-item>
              <el-dropdown-item command="export">Exportar lista (CSV)</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="nx-summary">
      <span>{{ filtered.length }} de {{ all.length }} dispositivos</span>
      <span class="nx-sep">·</span>
      <span><span class="nx-dot is-on"></span>{{ onlineCount }} online</span>
      <template v-if="selected.length">
        <span class="nx-sep">·</span>
        <strong>{{ selected.length }} selecionado(s)</strong>
        <el-button size="small" @click="openSave(null)">Salvar nos meus acessos</el-button>
      </template>
    </div>

    <div class="nx-card">
      <el-table :data="pageRows" v-loading="loading" row-key="row_id" aria-label="Meus dispositivos"
                @selection-change="v => selected = v" empty-text=" ">
        <el-table-column type="selection" width="44" reserve-selection/>
        <el-table-column label="ID" min-width="140">
          <template #default="{ row }">
            <span class="nx-id">{{ fmtId(row.id) }}</span>
            <button type="button" class="nx-copy" :aria-label="'Copiar ID ' + row.id" @click="copy(row.id)">
              <el-icon><el-icon-CopyDocument/></el-icon>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="Apelido" min-width="120">
          <template #default="{ row }"><span v-if="row.alias">{{ row.alias }}</span><span v-else class="nx-muted">-</span></template>
        </el-table-column>
        <el-table-column label="Nome do computador" prop="hostname" min-width="150"/>
        <el-table-column label="Usuário" prop="username" min-width="120"/>
        <el-table-column label="Última vez online" min-width="140">
          <template #default="{ row }">
            <span class="nx-dot" :class="isOnline(row) ? 'is-on' : 'is-off'" aria-hidden="true"></span>
            <span>{{ isOnline(row) ? 'Online agora' : (row.last_online_time ? timeAgo(row.last_online_time * 1000) : 'Nunca') }}</span>
          </template>
        </el-table-column>
        <template v-for="c in optionalColumns" :key="c.key">
          <el-table-column v-if="cols[c.key]" :label="c.label" :prop="c.key" :min-width="c.width" show-overflow-tooltip/>
        </template>
        <el-table-column label="Ações" width="160">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="connectByClient(row.id)">Conectar</el-button>
              <el-dropdown trigger="click" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="appStore.setting.appConfig.web_client" command="web">Abrir no navegador</el-dropdown-item>
                    <el-dropdown-item command="save">Salvar nos meus acessos</el-dropdown-item>
                    <el-dropdown-item command="view">Ver detalhes</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filtered.length" :image-size="72"
                :description="all.length ? 'Nenhum dispositivo encontrado com esses filtros.' : 'Nenhum computador com a sua conta ainda.'">
        <p v-if="!all.length" class="nx-muted">Entre com a sua conta no app RustDesk e o computador aparece aqui.</p>
        <el-button v-else @click="q = ''; statusFilter = null">Limpar filtros</el-button>
      </el-empty>
      <div v-if="filtered.length > pageSize || pageSize !== 20" class="nx-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]"
                       layout="total, prev, pager, next, sizes" :total="filtered.length" background/>
      </div>
    </div>

    <!-- salvar nos meus acessos -->
    <el-dialog v-model="save.visible" class="nx-dlg" width="560px"
               :title="save.row ? 'Salvar nos meus acessos' : `Salvar ${selected.length} dispositivo(s) nos meus acessos`">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Lista">
          <el-select v-model="save.collection_id" @change="loadTags">
            <el-option label="Lista pessoal" :value="0"/>
            <el-option v-for="c in collections" :key="c.id" :label="c.name" :value="c.id"/>
          </el-select>
        </el-form-item>
        <el-form-item v-if="save.row" label="Apelido">
          <el-input v-model="save.alias" placeholder="Como você reconhece (ex.: Notebook da recepção)"/>
        </el-form-item>
        <el-form-item label="Etiquetas">
          <el-select v-model="save.tags" multiple :placeholder="tags.length ? 'Nenhuma' : 'Esta lista não tem etiquetas'">
            <el-option v-for="t in tags" :key="t.name" :label="t.name" :value="t.name"/>
          </el-select>
        </el-form-item>
        <p class="nx-help">O dispositivo aparece em Meus acessos salvos e no app RustDesk, na aba Lista de endereços.</p>
      </el-form>
      <template #footer>
        <el-button @click="save.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="save.saving" @click="saveToList">Salvar</el-button>
      </template>
    </el-dialog>

    <!-- detalhes -->
    <el-dialog v-model="view.visible" class="nx-dlg" title="Detalhes do dispositivo" width="520px">
      <dl v-if="view.row" class="nx-kv">
        <template v-for="f in viewFields" :key="f.key">
          <dt>{{ f.label }}</dt><dd>{{ view.row[f.key] || '-' }}</dd>
        </template>
      </dl>
      <template #footer>
        <el-button type="primary" @click="view.visible = false">Fechar</el-button>
      </template>
    </el-dialog>

    <!-- colunas -->
    <el-dialog v-model="colsVisible" class="nx-dlg" title="Escolher colunas" width="420px">
      <p class="nx-help" style="margin: 0 0 12px">ID, Apelido, Nome do computador, Usuário e Última vez online aparecem sempre.</p>
      <div class="nx-listpage"><div class="nx-cols">
        <el-checkbox v-for="c in optionalColumns" :key="c.key" v-model="cols[c.key]" :label="c.label"/>
      </div></div>
      <template #footer><el-button type="primary" @click="saveCols">Pronto</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onActivated, onMounted, reactive, ref } from 'vue'
  import { fmtId, rawId } from '@/nextec/id'
  import { ElMessage } from 'element-plus'
  import { list } from '@/api/my/peer'
  import { list as collectionList } from '@/api/my/address_book_collection'
  import { list as tagList } from '@/api/my/tag'
  import { create as abCreate, batchCreateFromPeers } from '@/api/my/address_book'
  import { useAppStore } from '@/store/app'
  import { timeAgo } from '@/utils/time'
  import { connectDevice as connectByClient } from '@/nextec/connect'
  import { toWebClientLink } from '@/utils/webclient'
  import { downBlob, jsonToCsv } from '@/utils/file'
  import '../list-page.scss'

  const appStore = useAppStore()
  const all = ref([])
  const loading = ref(false)
  const load = async () => {
    loading.value = true
    const res = await list({ page: 1, page_size: 10000 }).catch(() => false)
    loading.value = false
    if (res) all.value = res.data.list || []
  }
  onMounted(load)
  onActivated(load)

  const isOnline = row => row.last_online_time && (Date.now() / 1000 - row.last_online_time) < 60
  const onlineCount = computed(() => all.value.filter(isOnline).length)

  const q = ref('')
  const statusFilter = ref(null)
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = computed(() => {
    const term = norm(q.value.trim())
    return all.value.filter(r => {
      if (statusFilter.value === 'online' && !isOnline(r)) return false
      if (statusFilter.value === 'offline' && isOnline(r)) return false
      return !term || [r.id, r.alias, r.hostname, r.username, r.last_online_ip].some(v => norm(v).includes(term))
    }).sort((a, b) => (b.last_online_time || 0) - (a.last_online_time || 0))
  })
  const page = ref(1)
  const pageSize = ref(20)
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  const selected = ref([])

  const optionalColumns = [
    { key: 'last_online_ip', label: 'Último IP', width: 120 },
    { key: 'os', label: 'Sistema operacional', width: 160 },
    { key: 'version', label: 'Versão do app', width: 100 },
    { key: 'cpu', label: 'Processador', width: 160 },
    { key: 'memory', label: 'Memória', width: 100 },
  ]
  const COLS_KEY = 'nx_mypeer_columns'
  const cols = reactive(Object.fromEntries(optionalColumns.map(c => [c.key, false])))
  try { Object.assign(cols, JSON.parse(localStorage.getItem(COLS_KEY) || '{}')) } catch (e) { /* preferência opcional */ }
  const colsVisible = ref(false)
  const saveCols = () => {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch (e) { /* preferência opcional */ }
    colsVisible.value = false
  }

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success('ID copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
  const exportCsv = () => {
    downBlob(jsonToCsv(filtered.value.map(r => ({
      id: r.id, alias: r.alias, hostname: r.hostname, username: r.username, os: r.os, version: r.version,
      last_online_ip: r.last_online_ip,
      last_online_time: r.last_online_time ? new Date(r.last_online_time * 1000).toLocaleString() : '-',
    }))), 'meus-dispositivos.csv')
  }
  const onToolbar = (cmd) => {
    if (cmd === 'columns') colsVisible.value = true
    if (cmd === 'export') exportCsv()
  }

  // detalhes
  const view = reactive({ visible: false, row: null })
  const viewFields = [
    { key: 'id', label: 'ID' }, { key: 'alias', label: 'Apelido' }, { key: 'hostname', label: 'Nome do computador' },
    { key: 'username', label: 'Usuário' }, { key: 'os', label: 'Sistema operacional' }, { key: 'version', label: 'Versão do app' },
    { key: 'cpu', label: 'Processador' }, { key: 'memory', label: 'Memória' }, { key: 'last_online_ip', label: 'Último IP' },
    { key: 'uuid', label: 'UUID' },
  ]

  // salvar nos meus acessos
  const collections = ref([])
  const tags = ref([])
  const save = reactive({ visible: false, saving: false, row: null, collection_id: 0, alias: '', tags: [] })
  const loadTags = async () => {
    save.tags = []
    const res = await tagList({ page: 1, page_size: 9999, collection_id: save.collection_id }).catch(() => false)
    tags.value = res ? (res.data.list || []) : []
  }
  const openSave = async (row) => {
    Object.assign(save, { visible: true, row, collection_id: 0, alias: row?.alias || '', tags: [] })
    const res = await collectionList({ page: 1, page_size: 9999 }).catch(() => false)
    collections.value = res ? (res.data.list || []) : []
    loadTags()
  }
  const PLATFORMS = { windows: 'Windows', linux: 'Linux', mac: 'Mac OS', android: 'Android' }
  const platformOf = os => Object.entries(PLATFORMS).find(([k]) => norm(os).includes(k))?.[1] || ''
  const saveToList = async () => {
    save.saving = true
    let res
    if (save.row) {
      const r = save.row
      res = await abCreate({ id: r.id, alias: save.alias, hostname: r.hostname, username: r.username, platform: platformOf(r.os),
        collection_id: save.collection_id, tags: save.tags }).catch(() => false)
    } else {
      res = await batchCreateFromPeers({ collection_id: save.collection_id, tags: save.tags, peer_ids: selected.value.map(r => r.row_id) }).catch(() => false)
    }
    save.saving = false
    if (res) { save.visible = false; ElMessage.success('Salvo nos seus acessos.') }
  }

  const onRow = (cmd, row) => {
    if (cmd === 'web') toWebClientLink(row)
    if (cmd === 'save') openSave(row)
    if (cmd === 'view') { view.row = row; view.visible = true }
  }
</script>
