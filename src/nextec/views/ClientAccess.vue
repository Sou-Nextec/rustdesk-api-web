<template>
  <section class="nx-ca" aria-label="Permissões por cliente">
    <div class="nx-explain">
      <el-icon :size="18"><el-icon-InfoFilled/></el-icon>
      <div>
        <p><strong>Como funciona:</strong> para cada cliente, o painel mantém uma lista de acessos chamada <code>{{ PREFIX }}nome do cliente</code> com todos os dispositivos daquele cliente, e compartilha essa lista só com as equipes e pessoas escolhidas. No app RustDesk, cada técnico enxerga em <strong>Lista de endereços</strong> apenas os clientes liberados para ele.</p>
        <p class="nx-muted">Isso controla quem <strong>vê</strong> os dispositivos. Para impedir acesso de quem conhece a senha por fora, use senha permanente forte nas máquinas e salve a senha só nas listas. Se precisar de grupos menores (ex.: Diretoria do cliente X), crie um cliente separado em Dispositivos &gt; Clientes.</p>
      </div>
    </div>

    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar cliente" aria-label="Buscar cliente">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button type="primary" :loading="syncingAll" :disabled="!managedCount" @click="syncAll">Sincronizar dispositivos de todos</el-button>
      </div>
    </div>

    <div class="nx-card">
      <el-table :data="rows" v-loading="loading" aria-label="Permissões por cliente" empty-text=" ">
        <el-table-column label="Cliente" min-width="140">
          <template #default="{ row }">
            <div class="nx-client">{{ row.name }}</div>
            <div class="nx-muted nx-small">{{ row.peerCount }} dispositivo(s)</div>
          </template>
        </el-table-column>
        <el-table-column label="Quem acessa" min-width="200">
          <template #default="{ row }">
            <div v-if="row.rules.length" class="nx-who">
              <el-tag v-for="r in row.rules" :key="r.id" :type="r.type === 2 ? 'primary' : 'info'">
                {{ r.type === 2 ? 'Equipe' : 'Pessoa' }}: {{ targetName(r) }}{{ r.rule > 1 ? ' (edita)' : '' }}
              </el-tag>
            </div>
            <span v-else-if="row.collection" class="nx-muted">Ninguém além do admin</span>
            <span v-else class="nx-muted">Ainda não configurado</span>
          </template>
        </el-table-column>
        <el-table-column label="Lista no app" min-width="150">
          <template #default="{ row }">
            <template v-if="row.collection">
              <span class="nx-dot" :class="row.missing ? 'is-warn' : 'is-ok'" aria-hidden="true"></span>
              <span>{{ row.missing ? `${row.missing} dispositivo(s) fora da lista` : 'Em dia' }}</span>
            </template>
            <span v-else class="nx-muted">Sem lista</span>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="210">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="openEdit(row)">Definir acesso</el-button>
              <el-button v-if="row.collection" size="small" :loading="row.syncing" @click="syncOne(row)">Sincronizar</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" :image-size="72"
                :description="clients.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado. Crie em Dispositivos > Clientes e vincule os dispositivos.'"/>
    </div>

    <el-dialog v-model="edit.visible" :title="`Quem acessa ${edit.row?.name || ''}`" width="600px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Equipes">
          <el-select v-model="edit.groups" multiple filterable placeholder="Nenhuma equipe" style="width: 100%">
            <el-option v-for="g in userGroups" :key="g.id" :label="g.name" :value="g.id"/>
          </el-select>
          <p class="nx-help">Todos os membros da equipe passam a ver este cliente no app.</p>
        </el-form-item>
        <el-form-item label="Pessoas">
          <el-select v-model="edit.users" multiple filterable placeholder="Ninguém individualmente" style="width: 100%">
            <el-option v-for="u in otherUsers" :key="u.id" :label="u.nickname && u.nickname !== u.username ? `${u.nickname} (${u.username})` : u.username" :value="u.id"/>
          </el-select>
          <p class="nx-help">Para liberar alguém fora das equipes escolhidas.</p>
        </el-form-item>
        <el-form-item label="O que podem fazer">
          <el-radio-group v-model="edit.rule">
            <el-radio :value="1">Ver e conectar</el-radio>
            <el-radio :value="2">Ver, conectar e editar a lista</el-radio>
          </el-radio-group>
          <p class="nx-help">"Editar a lista" permite mudar apelidos, etiquetas e senhas salvas pelo app RustDesk.</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="edit.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="edit.saving" @click="saveEdit">Salvar e aplicar</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { list as peerList } from '@/api/peer'
  import { list as deviceGroupList } from '@/api/device_group'
  import { list as userGroupList } from '@/api/group'
  import { list as collectionList, create as collectionCreate, update as collectionUpdate } from '@/api/address_book_collection'
  import { list as ruleList, create as ruleCreate, update as ruleUpdate, remove as ruleRemove } from '@/api/address_book_collection_rule'
  import { list as abList, batchCreateFromPeers } from '@/api/address_book'
  import { loadAllUsers } from '@/global'
  import { useUserStore } from '@/store/user'

  // nome das listas mantidas por esta tela: "Cliente: <nome do cliente>"
  const PREFIX = 'Cliente: '
  const RULE_USER = 1
  const RULE_GROUP = 2

  const userStore = useUserStore()

  const loading = ref(false)
  const syncingAll = ref(false)
  const q = ref('')
  const clients = ref([])        // grupos de dispositivos
  const peers = ref([])
  const userGroups = ref([])
  const collections = ref([])    // listas do admin
  const rulesByCollection = ref({})
  const entriesByCollection = ref({})
  const { allUsers, getAllUsers } = loadAllUsers()
  // as listas desta tela pertencem ao admin logado
  const ownerId = computed(() => userStore.id || allUsers.value.find(u => u.username === userStore.username)?.id)
  const otherUsers = computed(() => allUsers.value.filter(u => u.id !== ownerId.value))

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

  const collectionFor = (client) =>
    collections.value.find(c => c.name === PREFIX + client.name) ||
    collections.value.find(c => c.name.toLowerCase() === (PREFIX + client.name).toLowerCase())

  const syncState = reactive({})
  const rows = computed(() => {
    const term = q.value.trim().toLowerCase()
    return clients.value
      .filter(c => !term || c.name.toLowerCase().includes(term))
      .map(c => {
        const collection = collectionFor(c)
        const clientPeers = peers.value.filter(p => p.group_id === c.id)
        const inList = new Set((collection && entriesByCollection.value[collection.id] || []).map(e => e.id))
        return {
          ...c,
          collection,
          peerCount: clientPeers.length,
          peers: clientPeers,
          missing: collection ? clientPeers.filter(p => !inList.has(p.id)).length : 0,
          rules: collection ? (rulesByCollection.value[collection.id] || []) : [],
          syncing: !!syncState[c.id],
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  })
  const managedCount = computed(() => rows.value.filter(r => r.collection).length)

  const targetName = (r) => r.type === RULE_GROUP
    ? (userGroups.value.find(g => g.id === r.to_id)?.name || `equipe ${r.to_id}`)
    : (allUsers.value.find(u => u.id === r.to_id)?.username || `pessoa ${r.to_id}`)

  // ---------- aplicar ----------
  const ensureCollection = async (row) => {
    if (row.collection) {
      // mantém o nome alinhado com o cliente (ex.: cliente renomeado só na caixa das letras)
      if (row.collection.name !== PREFIX + row.name) {
        await collectionUpdate({ id: row.collection.id, user_id: ownerId.value, name: PREFIX + row.name }).catch(() => false)
      }
      return row.collection.id
    }
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
    if (!quiet) ok ? ElMessage.success(`Lista de ${row.name} sincronizada.`) : ElMessage.error('Não foi possível sincronizar.')
    if (!quiet) load()
    return ok
  }
  const syncAll = async () => {
    syncingAll.value = true
    const results = await Promise.all(rows.value.filter(r => r.collection).map(r => syncOne(r, true)))
    syncingAll.value = false
    results.every(Boolean) ? ElMessage.success('Listas sincronizadas.') : ElMessage.warning('Algumas listas não foram sincronizadas.')
    load()
  }

  const edit = reactive({ visible: false, saving: false, row: null, groups: [], users: [], rule: 1 })
  const openEdit = (row) => {
    edit.row = row
    edit.groups = row.rules.filter(r => r.type === RULE_GROUP).map(r => r.to_id)
    edit.users = row.rules.filter(r => r.type === RULE_USER).map(r => r.to_id)
    edit.rule = row.rules.some(r => r.rule > 1) ? 2 : 1
    edit.visible = true
  }

  const saveEdit = async () => {
    edit.saving = true
    const row = edit.row
    const collectionId = await ensureCollection(row)
    if (!collectionId) {
      edit.saving = false
      return ElMessage.error('Não foi possível criar a lista do cliente.')
    }
    const peersOk = await syncPeers(collectionId, row)

    const current = row.collection ? (rulesByCollection.value[collectionId] || []) : []
    const wanted = [
      ...edit.groups.map(id => ({ type: RULE_GROUP, to_id: id })),
      ...edit.users.map(id => ({ type: RULE_USER, to_id: id })),
    ]
    const key = r => `${r.type}:${r.to_id}`
    const wantedKeys = new Set(wanted.map(key))
    const ops = []
    for (const r of current) {
      if (!wantedKeys.has(key(r))) ops.push(ruleRemove({ id: r.id }))
      else if (r.rule !== edit.rule) ops.push(ruleUpdate({ ...r, rule: edit.rule }))
    }
    const currentKeys = new Set(current.map(key))
    for (const w of wanted) {
      if (!currentKeys.has(key(w))) {
        ops.push(ruleCreate({ user_id: ownerId.value, collection_id: collectionId, rule: edit.rule, type: w.type, to_id: w.to_id }))
      }
    }
    const results = await Promise.all(ops.map(p => p.catch(() => false)))
    edit.saving = false
    if (peersOk && results.every(Boolean)) {
      ElMessage.success(`Acesso de ${row.name} atualizado.`)
      edit.visible = false
    } else {
      ElMessage.warning('Parte das alterações não foi aplicada. Confira e tente de novo.')
    }
    load()
  }
</script>

<style scoped lang="scss">
  .nx-explain {
    display: flex; gap: 10px; align-items: flex-start; padding: 14px 16px; margin-bottom: 14px; border-radius: var(--nx-radius-card);
    background: var(--nx-tint); color: var(--nx-text);
    .el-icon { color: var(--nx-accent); flex: none; margin-top: 2px; }
    p { margin: 0 0 6px; font-size: 13px; line-height: 1.55; &:last-child { margin: 0; } }
    code { font-size: 12px; background: rgba(255, 255, 255, .6); padding: 1px 6px; border-radius: 6px; }
  }
  .nx-bar {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 16px 18px; margin-bottom: 12px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
  }
  .nx-search { flex: 1 1 260px; max-width: 360px; }
  .nx-bar-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; .el-button + .el-button { margin-left: 0; } }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-client { font-weight: 600; color: var(--nx-text); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-who { display: flex; flex-wrap: wrap; gap: 6px; :deep(.el-tag) { text-transform: none; letter-spacing: 0; height: auto; min-height: 24px; white-space: normal; text-align: left; } }
  .nx-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
    &.is-ok { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-warn { background: #9A5B00; box-shadow: 0 0 0 3px #FEF3C7; }
  }
  .nx-row-actions { display: flex; gap: 6px; .el-button { margin: 0 !important; } }
  .nx-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-form :deep(.el-radio) { display: flex; margin: 0 0 6px; }
  .nx-form :deep(.el-radio-group) { display: block; }
  @media (max-width: 768px) {
    .nx-search { max-width: none; flex: 1 1 100%; }
    .nx-bar-right { margin-left: 0; width: 100%; }
  }
  html.dark .nx-explain code { background: rgba(0, 0, 0, .3); }
</style>
