<template>
  <section class="nx-listpage" aria-label="Meus acessos salvos">
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar por ID, apelido, computador, usuário ou etiqueta"
                aria-label="Buscar acesso" @input="page = 1">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <el-select v-model="listFilter" class="nx-filter" placeholder="Todas as listas" clearable aria-label="Filtrar por lista" @change="page = 1">
        <el-option label="Lista pessoal" :value="0"/>
        <el-option v-for="c in collections" :key="c.id" :label="c.name" :value="c.id"/>
      </el-select>
      <el-select v-if="hasStatus" v-model="statusFilter" class="nx-filter-sm" placeholder="Situação" clearable aria-label="Filtrar por situação" @change="page = 1">
        <el-option label="Online" value="online"/>
        <el-option label="Offline" value="offline"/>
      </el-select>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button type="primary" @click="openForm()"><el-icon><el-icon-Plus/></el-icon><span>Adicionar</span></el-button>
      </div>
    </div>

    <div class="nx-summary">
      <span>{{ filtered.length }} de {{ all.length }} acessos</span>
      <template v-if="hasStatus">
        <span class="nx-sep">·</span>
        <span><span class="nx-dot is-on"></span>{{ onlineCount }} online</span>
      </template>
      <template v-if="selected.length">
        <span class="nx-sep">·</span>
        <strong>{{ selected.length }} selecionado(s)</strong>
        <el-button size="small" @click="openBatchTags">Editar etiquetas</el-button>
        <el-button size="small" type="danger" @click="batchDelete">Excluir</el-button>
      </template>
    </div>

    <div class="nx-card">
      <el-table :data="pageRows" v-loading="loading" row-key="row_id" aria-label="Meus acessos salvos"
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
        <el-table-column label="Apelido" min-width="130">
          <template #default="{ row }"><span v-if="row.alias">{{ row.alias }}</span><span v-else class="nx-muted">-</span></template>
        </el-table-column>
        <el-table-column label="Nome do computador" prop="hostname" min-width="140"/>
        <el-table-column label="Usuário" prop="username" min-width="110"/>
        <el-table-column label="Lista" min-width="130">
          <template #default="{ row }">{{ listName(row.collection_id) }}</template>
        </el-table-column>
        <el-table-column label="Etiquetas" min-width="130">
          <template #default="{ row }">
            <div v-if="row.tags?.length" class="nx-tags"><el-tag v-for="t in row.tags" :key="t" type="info" size="small">{{ t }}</el-tag></div>
            <span v-else class="nx-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="hasStatus" label="Última vez online" min-width="140">
          <template #default="{ row }">
            <span class="nx-dot" :class="isOnline(row) ? 'is-on' : 'is-off'" aria-hidden="true"></span>
            <span>{{ lastSeen(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="210">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="connectByClient(row.id)">Conectar</el-button>
              <el-button size="small" @click="openForm(row)">Editar</el-button>
              <el-dropdown trigger="click" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="appStore.setting.appConfig.web_client" command="web">Abrir no navegador</el-dropdown-item>
                    <el-dropdown-item v-if="appStore.setting.appConfig.web_client" command="share">Compartilhar pelo navegador</el-dropdown-item>
                    <el-dropdown-item command="delete" divided><span class="nx-danger">Excluir</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filtered.length" :image-size="72"
                :description="all.length ? 'Nenhum acesso encontrado com esses filtros.' : 'Você ainda não salvou nenhum acesso.'">
        <el-button v-if="all.length" @click="clearFilters">Limpar filtros</el-button>
        <el-button v-else type="primary" @click="openForm()">Adicionar acesso</el-button>
      </el-empty>
      <div v-if="filtered.length > pageSize || pageSize !== 20" class="nx-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]"
                       layout="total, prev, pager, next, sizes" :total="filtered.length" background/>
      </div>
    </div>

    <!-- adicionar / editar -->
    <el-dialog v-model="form.visible" class="nx-dlg" :title="form.data.row_id ? 'Editar acesso' : 'Adicionar acesso'" width="640px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <div class="nx-form-grid">
          <el-form-item label="ID" required class="is-required">
            <el-input v-model="form.data.id" placeholder="ID do RustDesk (ex.: 123456789)"/>
          </el-form-item>
          <el-form-item label="Apelido">
            <el-input v-model="form.data.alias" placeholder="Como você reconhece (ex.: Recepção)"/>
          </el-form-item>
          <el-form-item label="Lista">
            <el-select v-model="form.data.collection_id" @change="loadFormTags(true)">
              <el-option label="Lista pessoal" :value="0"/>
              <el-option v-for="c in collections" :key="c.id" :label="c.name" :value="c.id"/>
            </el-select>
          </el-form-item>
          <el-form-item label="Etiquetas">
            <el-select v-model="form.data.tags" multiple :placeholder="formTags.length ? 'Nenhuma' : 'Esta lista não tem etiquetas'">
              <el-option v-for="t in formTags" :key="t.name" :label="t.name" :value="t.name"/>
            </el-select>
          </el-form-item>
          <el-form-item label="Usuário"><el-input v-model="form.data.username"/></el-form-item>
          <el-form-item label="Nome do computador"><el-input v-model="form.data.hostname"/></el-form-item>
        </div>
        <el-collapse class="nx-tech">
          <el-collapse-item title="Mais dados" name="tech">
            <div class="nx-form-grid">
              <el-form-item label="Sistema">
                <el-select v-model="form.data.platform" clearable>
                  <el-option v-for="p in platforms" :key="p" :label="p" :value="p"/>
                </el-select>
              </el-form-item>
              <el-form-item label="Senha salva (hash)">
                <el-input v-model="form.data.hash" placeholder="Preenchida pelo app RustDesk"/>
              </el-form-item>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="form.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="form.saving" @click="saveForm">Salvar</el-button>
      </template>
    </el-dialog>

    <!-- etiquetas em lote -->
    <el-dialog v-model="batchTags.visible" class="nx-dlg" :title="`Etiquetas de ${selected.length} acesso(s)`" width="520px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Etiquetas">
          <el-select v-model="batchTags.tags" multiple placeholder="Sem etiquetas">
            <el-option v-for="t in allTags" :key="t" :label="t" :value="t"/>
          </el-select>
          <p class="nx-help">Substitui as etiquetas atuais dos acessos selecionados.</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchTags.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="batchTags.saving" @click="saveBatchTags">Salvar</el-button>
      </template>
    </el-dialog>

    <!-- compartilhar pelo navegador (componente do upstream) -->
    <el-dialog v-model="share.visible" class="nx-dlg" title="Compartilhar pelo navegador" width="720px" :close-on-click-modal="false" destroy-on-close>
      <shareByWebClient v-if="share.visible" :id="share.id" :hash="share.hash" @cancel="share.visible = false" @success="share.visible = false"/>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'
  import { fmtId, rawId } from '@/nextec/id'
  import { useRoute } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { list, create, update, remove, batchUpdateTags } from '@/api/my/address_book'
  import { list as collectionList } from '@/api/my/address_book_collection'
  import { list as tagList } from '@/api/my/tag'
  import { list as peerList } from '@/api/peer'
  import { sharedStatus } from '@/nextec/api'
  import { useUserStore } from '@/store/user'
  import { useAppStore } from '@/store/app'
  import { timeAgo } from '@/utils/time'
  import { connectDevice as connectByClient } from '@/nextec/connect'
  import { toWebClientLink } from '@/utils/webclient'
  import shareByWebClient from '@/views/address_book/components/shareByWebClient.vue'
  import '../list-page.scss'

  const appStore = useAppStore()
  const isAdmin = computed(() => (useUserStore().route_names || []).includes('*'))
  // a coluna aparece quando o servidor informa a situação (admin ou API com o patch 0003)
  const hasStatus = ref(false)
  const all = ref([])
  const collections = ref([])
  const loading = ref(false)
  const load = async () => {
    loading.value = true
    const [ab, cols] = await Promise.all([
      list({ page: 1, page_size: 10000 }).catch(() => false),
      collectionList({ page: 1, page_size: 9999 }).catch(() => false),
    ])
    if (cols) collections.value = cols.data.list || []
    const rows = ab ? (ab.data.list || []) : []
    // situação online: o admin lê o cadastro de dispositivos; os demais usam /my/shared/status (patch 0003),
    // que só responde pelos IDs que a pessoa enxerga. Sem o patch, a coluna fica oculta.
    const ids = rows.map(r => r.id)
    if (ids.length) {
      const sd = isAdmin.value
        ? await peerList({ page: 1, page_size: 10000 }).catch(() => false)
        : await sharedStatus({ ids }).catch(() => false)
      hasStatus.value = !!sd
      const peers = sd ? (sd.data.list || []) : []
      rows.forEach(r => { r.peer = peers.find(p => p.id === r.id) })
    }
    all.value = rows
    loading.value = false
  }
  onMounted(load)
  onActivated(load)

  const listName = id => (id ? collections.value.find(c => c.id === id)?.name || '-' : 'Lista pessoal')
  const isOnline = r => !!(r.peer?.last_online_time && (Date.now() / 1000 - r.peer.last_online_time) < 60)
  const lastSeen = r => isOnline(r) ? 'Online agora' : (r.peer?.last_online_time ? timeAgo(r.peer.last_online_time * 1000) : 'Sem registro')
  const onlineCount = computed(() => all.value.filter(isOnline).length)
  const allTags = computed(() => [...new Set(all.value.flatMap(r => r.tags || []))].sort())

  const q = ref('')
  const listFilter = ref(null)
  const statusFilter = ref(null)
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = computed(() => {
    const term = norm(q.value.trim())
    return all.value.filter(r => {
      if (listFilter.value !== null && listFilter.value !== '' && (r.collection_id || 0) !== listFilter.value) return false
      if (statusFilter.value === 'online' && !isOnline(r)) return false
      if (statusFilter.value === 'offline' && isOnline(r)) return false
      return !term || [r.id, r.alias, r.hostname, r.username, ...(r.tags || [])].some(v => norm(v).includes(term))
    }).sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || String(a.alias || a.hostname || a.id).localeCompare(String(b.alias || b.hostname || b.id), 'pt-BR'))
  })
  const clearFilters = () => { q.value = ''; listFilter.value = null; statusFilter.value = null }
  // pesquisa do topo: Enter abre esta tela com ?q=
  const route = useRoute()
  watch(() => route.query.q, v => { if (v) { clearFilters(); q.value = String(v) } }, { immediate: true })

  const page = ref(1)
  const pageSize = ref(20)
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  const selected = ref([])

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success('ID copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }

  // ---------- adicionar / editar ----------
  const platforms = ['Windows', 'Linux', 'Mac OS', 'Android']
  const empty = () => ({ row_id: 0, id: '', alias: '', collection_id: 0, tags: [], username: '', hostname: '', platform: '', hash: '' })
  const form = reactive({ visible: false, saving: false, data: empty() })
  const formTags = ref([])
  const loadFormTags = async (reset) => {
    if (reset) form.data.tags = []
    const res = await tagList({ page: 1, page_size: 9999, collection_id: form.data.collection_id }).catch(() => false)
    formTags.value = res ? (res.data.list || []) : []
  }
  const openForm = (row) => {
    form.data = row ? { ...row, tags: [...(row.tags || [])] } : empty()
    form.visible = true
    loadFormTags(false)
  }
  const saveForm = async () => {
    if (!String(form.data.id).trim()) return ElMessage.warning('Informe o ID do dispositivo.')
    form.saving = true
    const { peer, ...data } = form.data
    const res = await (data.row_id ? update : create)({ ...data, id: String(data.id).trim() }).catch(() => false)
    form.saving = false
    if (res) { form.visible = false; ElMessage.success(data.row_id ? 'Acesso atualizado.' : 'Acesso adicionado.'); load() }
  }

  // ---------- lote ----------
  const batchTags = reactive({ visible: false, saving: false, tags: [] })
  const openBatchTags = () => { batchTags.tags = []; batchTags.visible = true }
  const saveBatchTags = async () => {
    batchTags.saving = true
    const res = await batchUpdateTags({ row_ids: selected.value.map(r => r.row_id), tags: batchTags.tags }).catch(() => false)
    batchTags.saving = false
    if (res) { batchTags.visible = false; ElMessage.success('Etiquetas atualizadas.'); load() }
  }
  const delOne = async (row) => {
    const c = await ElMessageBox.confirm(`Excluir o acesso "${row.alias || row.hostname || row.id}" das suas listas? O dispositivo continua cadastrado.`,
      'Excluir acesso', { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await remove({ row_id: row.row_id }).catch(() => false)
    if (res) { ElMessage.success('Acesso excluído.'); load() }
  }
  const batchDelete = async () => {
    const c = await ElMessageBox.confirm(`Excluir ${selected.value.length} acesso(s) das suas listas?`, 'Excluir selecionados',
      { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const results = await Promise.all(selected.value.map(r => remove({ row_id: r.row_id }).catch(() => false)))
    ElMessage[results.every(Boolean) ? 'success' : 'warning'](`${results.filter(Boolean).length} acesso(s) excluído(s).`)
    selected.value = []
    load()
  }

  // ---------- navegador ----------
  const share = reactive({ visible: false, id: '', hash: '' })
  const onRow = (cmd, row) => {
    if (cmd === 'web') toWebClientLink(row)
    if (cmd === 'share') Object.assign(share, { visible: true, id: row.id, hash: row.hash || '' })
    if (cmd === 'delete') delOne(row)
  }
</script>
