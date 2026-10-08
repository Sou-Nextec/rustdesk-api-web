<template>
  <section class="nx-ca" aria-label="Permissões por cliente">
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar cliente ou subgrupo" aria-label="Buscar cliente">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button :loading="syncingAll" :disabled="!managedCount" @click="syncAll">Sincronizar todos</el-button>
      </div>
    </div>

    <div class="nx-card">
      <el-table :data="rows" v-loading="loading" row-key="key" default-expand-all :tree-props="{ children: 'children' }"
                aria-label="Permissões por cliente" empty-text=" ">
        <el-table-column label="Cliente" min-width="170">
          <template #default="{ row }">
            <span class="nx-client" :class="{ 'is-sub': row.isSub }">
              <el-icon v-if="row.isSub" class="nx-sub-icon" aria-hidden="true"><el-icon-FolderOpened/></el-icon>
              <span>
                <span class="nx-client-name">{{ row.label }}</span>
                <span class="nx-muted nx-small">{{ row.peerCount }} {{ row.peerCount === 1 ? 'dispositivo' : 'dispositivos' }}</span>
              </span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Quem acessa" min-width="190">
          <template #default="{ row }">
            <div v-if="row.rules.length" class="nx-who">
              <el-tag v-for="r in row.rules" :key="r.id" :type="r.type === 2 ? 'primary' : 'info'" disable-transitions>
                {{ r.type === 2 ? 'Equipe' : 'Pessoa' }}: {{ targetName(r) }}{{ r.rule > 1 ? ' (edita)' : '' }}
              </el-tag>
            </div>
            <span v-else-if="row.collection" class="nx-muted">Só o administrador</span>
            <span v-else class="nx-warn-text">Ainda não definido</span>
          </template>
        </el-table-column>
        <el-table-column label="Lista no app" min-width="130">
          <template #default="{ row }">
            <template v-if="row.collection">
              <span class="nx-dot" :class="row.missing ? 'is-warn' : 'is-ok'" aria-hidden="true"></span>
              <span>{{ row.missing ? `${row.missing} fora da lista` : 'Em dia' }}</span>
            </template>
            <span v-else class="nx-muted">Sem lista</span>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="190" class-name="nx-actions-col">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="openEdit(row)">Definir acesso</el-button>
              <el-dropdown trigger="click" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="!row.isSub" command="sub">Novo subgrupo</el-dropdown-item>
                    <el-dropdown-item command="devices">Ver dispositivos</el-dropdown-item>
                    <el-dropdown-item v-if="row.collection" command="sync">Sincronizar dispositivos</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" :image-size="72"
                :description="clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'">
        <el-button v-if="!clients.length" type="primary" @click="$router.push('/user/deviceGroup')">Cadastrar clientes</el-button>
      </el-empty>
    </div>

    <!-- definir acesso -->
    <el-dialog v-model="edit.visible" :title="`Quem acessa ${edit.row?.label || ''}`" width="600px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <p v-if="edit.row?.isSub" class="nx-help nx-help-top">Vale só para os dispositivos do subgrupo <strong>{{ edit.row.label }}</strong>. Quem acessa o cliente <strong>{{ edit.row.parentName }}</strong> não vê este subgrupo, a menos que esteja aqui também.</p>
        <el-form-item label="Equipes">
          <el-select v-model="edit.groups" multiple filterable placeholder="Nenhuma equipe" style="width: 100%">
            <el-option v-for="g in userGroups" :key="g.id" :label="g.name" :value="g.id"/>
          </el-select>
          <p class="nx-help">Todos os membros da equipe passam a ver estes dispositivos no app.</p>
        </el-form-item>
        <el-form-item label="Pessoas">
          <el-select v-model="edit.users" multiple filterable placeholder="Ninguém individualmente" style="width: 100%">
            <el-option v-for="u in otherUsers" :key="u.id" :label="userLabel(u)" :value="u.id"/>
          </el-select>
          <p class="nx-help">Para liberar alguém fora das equipes escolhidas.</p>
        </el-form-item>
        <el-form-item label="O que podem fazer">
          <el-radio-group v-model="edit.rule">
            <el-radio :value="1">Ver e conectar</el-radio>
            <el-radio :value="2">Ver, conectar e editar a lista</el-radio>
          </el-radio-group>
          <p class="nx-help">Editar a lista permite mudar apelidos, etiquetas e senhas salvas pelo app RustDesk.</p>
        </el-form-item>
        <el-checkbox v-if="edit.row && !edit.row.isSub && edit.row.children?.length" v-model="edit.cascade">
          Aplicar o mesmo acesso aos subgrupos ({{ edit.row.children.map(c => c.label).join(', ') }})
        </el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="edit.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="edit.saving" @click="saveEdit">Salvar e aplicar</el-button>
      </template>
    </el-dialog>

    <!-- novo subgrupo -->
    <el-dialog v-model="sub.visible" :title="`Novo subgrupo em ${sub.parent?.label || ''}`" width="480px" @opened="subInput?.focus()">
      <el-form label-position="top" class="nx-form" @submit.prevent="saveSub">
        <el-form-item label="Nome do subgrupo" required class="is-required">
          <el-input ref="subInput" v-model="sub.name" placeholder="ex.: Servidores, Diretoria" maxlength="60"/>
        </el-form-item>
        <p class="nx-help">Depois, em <strong>Dispositivos</strong>, edite cada máquina e escolha <strong>{{ sub.parent?.label }} / {{ sub.name || 'subgrupo' }}</strong> no campo Cliente. Em seguida defina aqui quem acessa o subgrupo.</p>
      </el-form>
      <template #footer>
        <el-button @click="sub.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="sub.saving" :disabled="!sub.name.trim()" @click="saveSub">Criar subgrupo</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { list as peerList } from '@/api/peer'
  import { list as deviceGroupList, create as deviceGroupCreate } from '@/api/device_group'
  import { list as userGroupList } from '@/api/group'
  import { list as collectionList, create as collectionCreate } from '@/api/address_book_collection'
  import { list as ruleList, create as ruleCreate, update as ruleUpdate, remove as ruleRemove } from '@/api/address_book_collection_rule'
  import { list as abList, batchCreateFromPeers } from '@/api/address_book'
  import { loadAllUsers } from '@/global'
  import { useUserStore } from '@/store/user'

  // listas mantidas por esta tela: "Cliente: <nome do grupo>" (subgrupos: "Cliente: Cliente X / Servidores")
  const PREFIX = 'Cliente: '
  // subgrupos são grupos de dispositivos com o nome "Cliente / Subgrupo"
  const SEP = ' / '
  const RULE_USER = 1
  const RULE_GROUP = 2

  const router = useRouter()
  const userStore = useUserStore()
  const loading = ref(false)
  const syncingAll = ref(false)
  const q = ref('')
  const clients = ref([])        // grupos de dispositivos (clientes e subgrupos)
  const peers = ref([])
  const userGroups = ref([])
  const collections = ref([])
  const rulesByCollection = ref({})
  const entriesByCollection = ref({})
  const { allUsers, getAllUsers } = loadAllUsers()
  // as listas desta tela pertencem ao admin logado
  const ownerId = computed(() => userStore.id || allUsers.value.find(u => u.username === userStore.username)?.id)
  const otherUsers = computed(() => allUsers.value.filter(u => u.id !== ownerId.value))
  const userLabel = u => (u.nickname && u.nickname !== u.username ? `${u.nickname} (${u.username})` : u.username)

  const all = async (fn, params) => {
    const res = await fn({ page: 1, page_size: 9999, ...params }).catch(() => false)
    return res ? (res.data.list || []) : []
  }

  const load = async () => {
    loading.value = true
    await getAllUsers()
    if (!ownerId.value) { loading.value = false; return }
    const [dg, p, ug, cols] = await Promise.all([
      all(deviceGroupList), all(peerList), all(userGroupList), all(collectionList, { user_id: ownerId.value }),
    ])
    clients.value = dg
    peers.value = p
    userGroups.value = ug
    collections.value = cols.filter(c => c.user_id === ownerId.value && c.name.startsWith(PREFIX))
    const rules = {}
    const entries = {}
    await Promise.all(collections.value.map(async c => {
      rules[c.id] = (await all(ruleList, { collection_id: c.id, user_id: ownerId.value })).filter(r => r.collection_id === c.id)
      entries[c.id] = await all(abList, { collection_id: c.id, user_id: ownerId.value })
    }))
    rulesByCollection.value = rules
    entriesByCollection.value = entries
    loading.value = false
  }
  onMounted(load)

  const collectionFor = (group) =>
    collections.value.find(c => c.name === PREFIX + group.name) ||
    collections.value.find(c => c.name.toLowerCase() === (PREFIX + group.name).toLowerCase())

  const syncState = reactive({})
  const toRow = (g, parent) => {
    const collection = collectionFor(g)
    const groupPeers = peers.value.filter(p => p.group_id === g.id)
    const inList = new Set((collection && entriesByCollection.value[collection.id] || []).map(e => e.id))
    return {
      ...g,
      key: 'g' + g.id,
      isSub: !!parent,
      parentName: parent?.name || '',
      label: parent ? g.name.slice(parent.name.length + SEP.length) : g.name,
      collection,
      peerCount: groupPeers.length,
      peers: groupPeers,
      missing: collection ? groupPeers.filter(p => !inList.has(p.id)).length : 0,
      rules: collection ? (rulesByCollection.value[collection.id] || []) : [],
      syncing: !!syncState[g.id],
    }
  }
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const rows = computed(() => {
    const term = norm(q.value.trim())
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR')
    const isChildOf = (g, p) => g.name.startsWith(p.name + SEP)
    // cliente = grupo que não é subgrupo de outro grupo existente
    const tops = clients.value.filter(g => !clients.value.some(p => p.id !== g.id && isChildOf(g, p))).sort(byName)
    return tops.map(top => {
      const row = toRow(top)
      const children = clients.value.filter(g => g.id !== top.id && isChildOf(g, top)).sort(byName).map(g => toRow(g, top))
      return { ...row, children }
    }).filter(r => !term || norm(r.name).includes(term) || r.children.some(c => norm(c.name).includes(term)))
  })
  const flat = computed(() => rows.value.flatMap(r => [r, ...r.children]))
  const managedCount = computed(() => flat.value.filter(r => r.collection).length)

  const targetName = (r) => r.type === RULE_GROUP
    ? (userGroups.value.find(g => g.id === r.to_id)?.name || `equipe ${r.to_id}`)
    : (allUsers.value.find(u => u.id === r.to_id)?.username || `pessoa ${r.to_id}`)

  // ---------- aplicar ----------
  const ensureCollection = async (row) => {
    if (row.collection) return row.collection.id
    const res = await collectionCreate({ user_id: ownerId.value, name: PREFIX + row.name }).catch(() => false)
    if (!res) return null
    const cols = await all(collectionList, { user_id: ownerId.value })
    return cols.find(c => c.name === PREFIX + row.name && c.user_id === ownerId.value)?.id || null
  }

  const syncPeers = async (collectionId, row) => {
    if (!row.peers.length) return true
    // o servidor ignora os que já estão na lista
    const res = await batchCreateFromPeers({
      collection_id: collectionId, user_id: ownerId.value, tags: [], peer_ids: row.peers.map(p => p.row_id),
    }).catch(() => false)
    return !!res
  }

  const syncOne = async (row, quiet = false) => {
    syncState[row.id] = true
    const ok = await syncPeers(row.collection.id, row)
    syncState[row.id] = false
    if (!quiet) {
      ok ? ElMessage.success(`Lista de ${row.label} sincronizada.`) : ElMessage.error('Não foi possível sincronizar.')
      load()
    }
    return ok
  }
  const syncAll = async () => {
    syncingAll.value = true
    const results = await Promise.all(flat.value.filter(r => r.collection).map(r => syncOne(r, true)))
    syncingAll.value = false
    results.every(Boolean) ? ElMessage.success('Listas sincronizadas.') : ElMessage.warning('Algumas listas não foram sincronizadas.')
    load()
  }

  // aplica equipes, pessoas e nível em um cliente ou subgrupo
  const applyAccess = async (row, groups, users, rule) => {
    const collectionId = await ensureCollection(row)
    if (!collectionId) return false
    const peersOk = await syncPeers(collectionId, row)
    const current = row.collection ? (rulesByCollection.value[collectionId] || []) : []
    const wanted = [
      ...groups.map(id => ({ type: RULE_GROUP, to_id: id })),
      ...users.map(id => ({ type: RULE_USER, to_id: id })),
    ]
    const key = r => `${r.type}:${r.to_id}`
    const wantedKeys = new Set(wanted.map(key))
    const currentKeys = new Set(current.map(key))
    const ops = []
    for (const r of current) {
      if (!wantedKeys.has(key(r))) ops.push(ruleRemove({ id: r.id }))
      else if (r.rule !== rule) ops.push(ruleUpdate({ ...r, rule }))
    }
    for (const w of wanted) {
      if (!currentKeys.has(key(w))) ops.push(ruleCreate({ user_id: ownerId.value, collection_id: collectionId, rule, type: w.type, to_id: w.to_id }))
    }
    const results = await Promise.all(ops.map(p => p.catch(() => false)))
    return peersOk && results.every(Boolean)
  }

  const edit = reactive({ visible: false, saving: false, row: null, groups: [], users: [], rule: 1, cascade: false })
  const openEdit = (row) => {
    edit.row = row
    edit.groups = row.rules.filter(r => r.type === RULE_GROUP).map(r => r.to_id)
    edit.users = row.rules.filter(r => r.type === RULE_USER).map(r => r.to_id)
    edit.rule = row.rules.some(r => r.rule > 1) ? 2 : 1
    edit.cascade = false
    edit.visible = true
  }
  const saveEdit = async () => {
    edit.saving = true
    const targets = [edit.row, ...(edit.cascade ? edit.row.children : [])]
    const results = []
    for (const t of targets) results.push(await applyAccess(t, edit.groups, edit.users, edit.rule))
    edit.saving = false
    if (results.every(Boolean)) {
      ElMessage.success(`Acesso de ${edit.row.label} atualizado.`)
      edit.visible = false
    } else {
      ElMessage.warning('Parte das alterações não foi aplicada. Confira e tente de novo.')
    }
    load()
  }

  // ---------- subgrupos ----------
  const sub = reactive({ visible: false, saving: false, parent: null, name: '' })
  const subInput = ref()
  const saveSub = async () => {
    const name = sub.name.trim()
    if (!name) return
    const full = sub.parent.name + SEP + name
    if (clients.value.some(g => g.name.toLowerCase() === full.toLowerCase())) return ElMessage.warning('Esse subgrupo já existe.')
    sub.saving = true
    const res = await deviceGroupCreate({ name: full, type: 1 }).catch(() => false)
    sub.saving = false
    if (res) {
      sub.visible = false
      ElMessage.success(`Subgrupo ${name} criado. Agora mova os dispositivos para ele em Dispositivos.`)
      load()
    }
  }

  const onRow = (cmd, row) => {
    if (cmd === 'sub') { sub.parent = row; sub.name = ''; sub.visible = true }
    if (cmd === 'devices') router.push({ path: '/user/peer', query: { client: String(row.id) } })
    if (cmd === 'sync') syncOne(row)
  }
</script>

<style scoped lang="scss">
  .nx-bar {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 16px 18px; margin-bottom: 12px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
  }
  .nx-search { flex: 1 1 260px; max-width: 360px; }
  .nx-bar-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; .el-button + .el-button { margin-left: 0; } }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-client { display: inline-flex; align-items: flex-start; gap: 8px; vertical-align: top;
    > span { display: flex; flex-direction: column; gap: 2px; } }
  .nx-client-name { font-weight: 600; color: var(--nx-text); }
  .nx-client.is-sub .nx-client-name { font-weight: 500; }
  .nx-sub-icon { color: var(--nx-accent); margin-top: 2px; }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-warn-text { color: #8A5300; }
  .nx-who { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0;
    :deep(.el-tag) { text-transform: none; letter-spacing: 0; height: auto; min-height: 24px; white-space: normal; text-align: left; } }
  .nx-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
    &.is-ok { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-warn { background: #9A5B00; box-shadow: 0 0 0 3px #FEF3C7; }
  }
  .nx-row-actions { display: flex; gap: 6px; .el-button { margin: 0 !important; } }
  .nx-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-help-top { margin: 0 0 16px; font-size: 13px; }
  .nx-form :deep(.el-radio) { display: flex; margin: 0 0 6px; }
  .nx-form :deep(.el-radio-group) { display: block; }
  @media (max-width: 768px) {
    .nx-search { max-width: none; flex: 1 1 100%; }
    .nx-bar-right { margin-left: 0; width: 100%; }
  }
  html.dark .nx-warn-text { color: #FCD38A; }
</style>
