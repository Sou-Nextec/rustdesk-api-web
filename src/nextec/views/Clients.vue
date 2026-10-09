<template>
  <section class="nx-cl" aria-label="Clientes">
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar cliente ou subgrupo" aria-label="Buscar cliente">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button @click="tplList.visible = true">Modelos</el-button>
        <el-button type="primary" @click="openNew"><el-icon><el-icon-Plus/></el-icon><span>Novo cliente</span></el-button>
      </div>
    </div>

    <div class="nx-card">
      <el-table :data="rows" v-loading="loading" row-key="key" default-expand-all :tree-props="{ children: 'children' }"
                aria-label="Clientes" empty-text=" ">
        <el-table-column label="Cliente" min-width="220">
          <template #default="{ row }">
            <span class="nx-client" :class="{ 'is-sub': row.isSub }">
              <el-icon v-if="row.isSub" class="nx-sub-icon" aria-hidden="true"><el-icon-FolderOpened/></el-icon>
              <span class="nx-client-name">{{ row.label }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Dispositivos" width="130">
          <template #default="{ row }">{{ row.peerCount }}</template>
        </el-table-column>
        <el-table-column label="Criado em" min-width="150" prop="created_at"/>
        <el-table-column label="Ações" width="170">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" @click="openRename(row)">Editar</el-button>
              <el-dropdown trigger="click" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="!row.isSub" command="subs">Adicionar subgrupos</el-dropdown-item>
                    <el-dropdown-item command="devices">Ver dispositivos</el-dropdown-item>
                    <el-dropdown-item command="install">Comando de instalação</el-dropdown-item>
                    <el-dropdown-item command="delete" divided><span class="nx-danger-text">Excluir</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" :image-size="72" description="Nenhum cliente cadastrado ainda.">
        <el-button type="primary" @click="openNew">Novo cliente</el-button>
      </el-empty>
    </div>

    <!-- novo cliente -->
    <el-dialog v-model="nw.visible" class="nx-dlg" title="Novo cliente" width="620px" @opened="nwInput?.focus()">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Nome do cliente" required class="is-required">
          <el-input ref="nwInput" v-model="nw.name" maxlength="80" placeholder="ex.: Cartório Mariinha Noronha"/>
        </el-form-item>
        <el-form-item label="Modelo">
          <el-select v-model="nw.templateId" clearable placeholder="Sem modelo (só o cliente)">
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id"/>
          </el-select>
        </el-form-item>
        <div v-if="nwTemplate" class="nx-preview">
          <p class="nx-help">Serão criados {{ nwTemplate.subgroups.length }} subgrupo(s) com o acesso do modelo:</p>
          <ul>
            <li v-if="hasAccess(nwTemplate.root)"><strong>{{ nw.name || 'Cliente' }}</strong>: {{ accessText(nwTemplate.root) }}</li>
            <li v-for="s in nwTemplate.subgroups" :key="s.name"><strong>{{ s.name }}</strong>: {{ accessText(s) }}</li>
          </ul>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="nw.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="nw.saving" :disabled="!nw.name.trim()" @click="saveNew">Criar</el-button>
      </template>
    </el-dialog>

    <!-- editar nome -->
    <el-dialog v-model="rn.visible" class="nx-dlg" :title="`Editar ${rn.row?.label || ''}`" width="480px" @opened="rnInput?.focus()">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Nome" required class="is-required">
          <el-input ref="rnInput" v-model="rn.name" maxlength="80"/>
        </el-form-item>
        <p v-if="rn.row && !rn.row.isSub && rn.row.children.length" class="nx-help">Os {{ rn.row.children.length }} subgrupo(s) e as listas de acesso também recebem o nome novo.</p>
      </el-form>
      <template #footer>
        <el-button @click="rn.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="rn.saving" :disabled="!rn.name.trim()" @click="saveRename">Salvar</el-button>
      </template>
    </el-dialog>

    <!-- comando de instalação do cliente -->
    <el-dialog v-model="ins.visible" class="nx-dlg" :title="`Instalar em ${ins.name}`" width="min(680px, 92vw)">
      <p class="nx-help nx-help-top">Rode como administrador (PowerShell) na máquina do cliente. O script instala a versão publicada do app e coloca a máquina neste cliente sozinho.</p>
      <div v-loading="ins.loading" class="nx-cmd">
        <code>{{ ins.cmd || 'Gerando o comando...' }}</code>
        <el-button size="small" :disabled="!ins.cmd" @click="copyCmd"><el-icon><el-icon-CopyDocument/></el-icon><span>Copiar comando</span></el-button>
      </div>
      <p class="nx-help">A máquina só é colocada neste cliente se ainda não tiver cliente. Antes do primeiro uso, publique uma versão do app em Dispositivos &gt; Atualizações do app.</p>
      <p class="nx-help">Se este comando vazou ou foi para a pessoa errada, invalide: todos os comandos de instalação antigos deixam de valer (os novos se geram aqui de novo).</p>
      <template #footer>
        <el-button @click="revokeInstall"><span class="nx-danger-text">Invalidar comandos antigos</span></el-button>
        <el-button type="primary" @click="ins.visible = false">Fechar</el-button>
      </template>
    </el-dialog>

    <!-- subgrupos em lote -->
    <el-dialog v-model="sb.visible" class="nx-dlg" :title="`Adicionar subgrupos em ${sb.parent?.label || ''}`" width="640px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Subgrupos (um por linha)" required class="is-required">
          <el-input v-model="sb.text" type="textarea" :rows="5" placeholder="Servidores&#10;Diretoria&#10;Financeiro"/>
        </el-form-item>
        <el-form-item label="Quem acessa (opcional, igual para todos)">
          <AccessFields :model="sb.access" :teams="teams" :users="allUsers"/>
        </el-form-item>
        <p class="nx-help">Cada subgrupo vira "{{ sb.parent?.label }} / nome". Depois mova as máquinas para eles em Dispositivos.</p>
      </el-form>
      <template #footer>
        <el-button @click="sb.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="sb.saving" :disabled="!sbNames.length" @click="saveSubs">Criar {{ sbNames.length || '' }} subgrupo(s)</el-button>
      </template>
    </el-dialog>

    <!-- lista de modelos -->
    <el-dialog v-model="tplList.visible" class="nx-dlg" title="Modelos de cliente" width="680px">
      <p class="nx-help nx-help-top">Um modelo cria os subgrupos de um cliente já com as equipes e pessoas que acessam cada um.</p>
      <el-table :data="templates" empty-text="Nenhum modelo ainda." aria-label="Modelos de cliente">
        <el-table-column label="Modelo" min-width="160" prop="name"/>
        <el-table-column label="Subgrupos" min-width="220">
          <template #default="{ row }">{{ row.subgroups.map(s => s.name).join(', ') || '-' }}</template>
        </el-table-column>
        <el-table-column label="Ações" width="150">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" @click="openTemplate(row)">Editar</el-button>
              <el-button size="small" type="danger" @click="removeTemplate(row)">Excluir</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="tplList.visible = false">Fechar</el-button>
        <el-button type="primary" @click="openTemplate()">Novo modelo</el-button>
      </template>
    </el-dialog>

    <!-- editar modelo -->
    <el-dialog v-model="tp.visible" class="nx-dlg" :title="templates.some(t => t.id === tp.data.id) ? 'Editar modelo' : 'Novo modelo'" width="860px" @opened="tpInput?.focus()">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Nome do modelo" required class="is-required">
          <el-input ref="tpInput" v-model="tp.data.name" maxlength="60" placeholder="ex.: Cartório padrão"/>
        </el-form-item>
        <el-form-item label="Quem acessa o cliente em si (opcional)">
          <AccessFields :model="tp.data.root" :teams="teams" :users="allUsers"/>
        </el-form-item>
        <div class="nx-tp-head">
          <strong>Subgrupos</strong>
          <el-button size="small" @click="addTplSub"><el-icon><el-icon-Plus/></el-icon><span>Subgrupo</span></el-button>
        </div>
        <div v-for="(s, i) in tp.data.subgroups" :key="i" class="nx-tp-sub">
          <div class="nx-tp-row">
            <el-input v-model="s.name" maxlength="60" placeholder="Nome do subgrupo (ex.: Servidores)" aria-label="Nome do subgrupo"/>
            <el-button circle aria-label="Remover subgrupo" @click="tp.data.subgroups.splice(i, 1)"><el-icon><el-icon-Delete/></el-icon></el-button>
          </div>
          <AccessFields :model="s" :teams="teams" :users="allUsers"/>
        </div>
        <p v-if="!tp.data.subgroups.length" class="nx-help">Nenhum subgrupo. Clique em "Subgrupo" para acrescentar.</p>
      </el-form>
      <template #footer>
        <el-button @click="tp.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="tp.saving" :disabled="!tp.data.name.trim()" @click="saveTemplate">Salvar modelo</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { list as peerList } from '@/api/peer'
  import { list as groupList, create as groupCreate, update as groupUpdate, remove as groupRemove } from '@/api/device_group'
  import { list as teamList } from '@/api/group'
  import { list as collectionList, create as collectionCreate, update as collectionUpdate, remove as collectionRemove } from '@/api/address_book_collection'
  import { create as ruleCreate } from '@/api/address_book_collection_rule'
  import { loadAllUsers } from '@/global'
  import { useUserStore } from '@/store/user'
  import { getClientTemplates, saveClientTemplates, installToken, installRevoke } from '@/nextec/api'
  import AccessFields from './AccessFields.vue'

  // mesmas convenções de Permissões por cliente: lista "Cliente: <grupo>" e subgrupos "Cliente / Subgrupo"
  const PREFIX = 'Cliente: '
  const SEP = ' / '

  const router = useRouter()
  const userStore = useUserStore()
  const { allUsers, getAllUsers } = loadAllUsers()
  const ownerId = computed(() => userStore.id || allUsers.value.find(u => u.username === userStore.username)?.id)

  const loading = ref(false)
  const q = ref('')
  const groups = ref([])
  const peers = ref([])
  const teams = ref([])
  const collections = ref([])
  const templates = ref([])

  const all = async (fn, params) => {
    const res = await fn({ page: 1, page_size: 9999, ...params }).catch(() => false)
    return res ? (res.data.list || []) : []
  }

  const load = async () => {
    loading.value = true
    await getAllUsers()
    const [g, p, t, c, tpl] = await Promise.all([
      all(groupList), all(peerList), all(teamList),
      ownerId.value ? all(collectionList, { user_id: ownerId.value }) : [],
      getClientTemplates().then(r => (Array.isArray(r.data.templates) ? r.data.templates : [])).catch(() => []),
    ])
    groups.value = g
    peers.value = p
    teams.value = t
    collections.value = c.filter(x => x.user_id === ownerId.value && x.name.startsWith(PREFIX))
    templates.value = tpl.map(normalizeTemplate)
    loading.value = false
  }
  onMounted(load)

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const isChildOf = (g, parent) => g.name.startsWith(parent.name + SEP)
  const toRow = (g, parent) => ({
    ...g,
    key: 'g' + g.id,
    isSub: !!parent,
    label: parent ? g.name.slice(parent.name.length + SEP.length) : g.name,
    peerCount: peers.value.filter(p => p.group_id === g.id).length,
  })
  const rows = computed(() => {
    const term = norm(q.value.trim())
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR')
    const tops = groups.value.filter(g => !groups.value.some(p => p.id !== g.id && isChildOf(g, p))).sort(byName)
    return tops.map(top => ({
      ...toRow(top),
      children: groups.value.filter(g => g.id !== top.id && isChildOf(g, top)).sort(byName).map(g => toRow(g, top)),
    })).filter(r => !term || norm(r.name).includes(term) || r.children.some(c => norm(c.name).includes(term)))
  })

  // ---------- acesso (lista do admin + regras de compartilhamento) ----------
  const hasAccess = a => !!a && ((a.teams?.length || 0) + (a.users?.length || 0)) > 0
  const accessText = (a) => {
    if (!hasAccess(a)) return 'só o administrador'
    const names = [
      ...(a.teams || []).map(id => teams.value.find(t => t.id === id)?.name || `equipe ${id}`),
      ...(a.users || []).map(id => allUsers.value.find(u => u.id === id)?.username || `pessoa ${id}`),
    ]
    return `${names.join(', ')} (${a.rule > 1 ? 'edita a lista' : 'ver e conectar'})`
  }
  const createAccess = async (groupName, a) => {
    if (!hasAccess(a)) return true
    const owner = ownerId.value
    const made = await collectionCreate({ user_id: owner, name: PREFIX + groupName }).catch(() => false)
    if (!made) return false
    const col = (await all(collectionList, { user_id: owner })).find(c => c.name === PREFIX + groupName && c.user_id === owner)
    if (!col) return false
    const rule = a.rule || 1
    const ops = [
      ...(a.teams || []).map(id => ruleCreate({ user_id: owner, collection_id: col.id, rule, type: 2, to_id: id })),
      ...(a.users || []).map(id => ruleCreate({ user_id: owner, collection_id: col.id, rule, type: 1, to_id: id })),
    ]
    return (await Promise.all(ops.map(p => p.catch(() => false)))).every(Boolean)
  }
  const createGroup = async (name) => {
    const res = await groupCreate({ name, type: 1 }).catch(() => false)
    return !!res
  }

  // cria os subgrupos de um cliente, um a um; devolve o que foi criado e o que ficou de fora
  const createSubgroups = async (clientName, subs) => {
    const existing = new Set(groups.value.map(g => g.name.toLowerCase()))
    const out = { ok: 0, skipped: [], accessFailed: [] }
    for (const s of subs) {
      const name = String(s.name || '').trim()
      if (!name) continue
      const full = clientName + SEP + name
      if (existing.has(full.toLowerCase()) || !(await createGroup(full))) { out.skipped.push(name); continue }
      existing.add(full.toLowerCase())
      out.ok++
      if (!(await createAccess(full, s))) out.accessFailed.push(name)
    }
    return out
  }
  const reportSubs = (r, prefix = '') => {
    const parts = [`${r.ok} subgrupo(s) criado(s)`]
    if (r.skipped.length) parts.push(`já existiam ou falharam: ${r.skipped.join(', ')}`)
    if (r.accessFailed.length) parts.push(`acesso não aplicado em: ${r.accessFailed.join(', ')}`)
    ElMessage[r.skipped.length || r.accessFailed.length ? 'warning' : 'success'](prefix + parts.join('. ') + '.')
  }

  // ---------- novo cliente ----------
  const nwInput = ref()
  const nw = reactive({ visible: false, saving: false, name: '', templateId: null })
  const nwTemplate = computed(() => templates.value.find(t => t.id === nw.templateId))
  const openNew = () => { Object.assign(nw, { visible: true, name: '', templateId: null }) }
  const saveNew = async () => {
    const name = nw.name.trim()
    if (!name) return
    if (groups.value.some(g => g.name.toLowerCase() === name.toLowerCase())) return ElMessage.warning('Já existe um cliente com esse nome.')
    if (name.includes(SEP)) return ElMessage.warning('O nome não pode conter " / " (reservado para subgrupos).')
    nw.saving = true
    const ok = await createGroup(name)
    if (!ok) { nw.saving = false; return }
    const tpl = nwTemplate.value
    if (tpl) {
      const rootOk = await createAccess(name, tpl.root)
      const r = await createSubgroups(name, tpl.subgroups)
      if (!rootOk) r.accessFailed.push(name)
      nw.saving = false; nw.visible = false
      reportSubs(r, `Cliente ${name} criado. `)
    } else {
      nw.saving = false; nw.visible = false
      ElMessage.success(`Cliente ${name} criado.`)
    }
    load()
  }

  // ---------- editar nome (acompanha subgrupos e listas) ----------
  const rnInput = ref()
  const rn = reactive({ visible: false, saving: false, row: null, name: '' })
  const openRename = (row) => { Object.assign(rn, { visible: true, row, name: row.label }) }
  const saveRename = async () => {
    const row = rn.row
    const name = rn.name.trim()
    if (!name || name === row.label) { rn.visible = false; return }
    if (name.includes(SEP)) return ElMessage.warning('O nome não pode conter " / " (reservado para subgrupos).')
    const newFull = row.isSub ? row.name.slice(0, row.name.length - row.label.length) + name : name
    if (groups.value.some(g => g.id !== row.id && g.name.toLowerCase() === newFull.toLowerCase())) return ElMessage.warning('Já existe um item com esse nome.')
    rn.saving = true
    const targets = [{ g: row, to: newFull }, ...(row.isSub ? [] : row.children.map(c => ({ g: c, to: newFull + SEP + c.label })))]
    let fail = false
    for (const t of targets) {
      const r = await groupUpdate({ id: t.g.id, name: t.to, type: t.g.type || 1 }).catch(() => false)
      if (!r) { fail = true; continue }
      const col = collections.value.find(c => c.name === PREFIX + t.g.name)
      if (col) await collectionUpdate({ id: col.id, user_id: ownerId.value, name: PREFIX + t.to }).catch(() => { fail = true })
    }
    rn.saving = false
    rn.visible = false
    ElMessage[fail ? 'warning' : 'success'](fail ? 'Parte dos nomes não foi alterada. Confira a lista.' : 'Nome atualizado.')
    load()
  }

  // ---------- subgrupos em lote ----------
  const sb = reactive({ visible: false, saving: false, parent: null, text: '', access: { teams: [], users: [], rule: 1 } })
  const sbNames = computed(() => [...new Set(sb.text.split('\n').map(s => s.trim()).filter(Boolean))])
  const saveSubs = async () => {
    sb.saving = true
    const r = await createSubgroups(sb.parent.name, sbNames.value.map(name => ({ name, ...sb.access })))
    sb.saving = false
    sb.visible = false
    reportSubs(r)
    load()
  }

  // ---------- comando de instalação ----------
  const SCRIPT_URL = 'https://raw.githubusercontent.com/Sou-Nextec/rustdesk-api-web/master/nextec/atualizacao/Instalar-Nextec.ps1'
  const ins = reactive({ visible: false, loading: false, name: '', cmd: '' })
  const openInstall = async (row) => {
    Object.assign(ins, { visible: true, loading: true, name: row.name, cmd: '' })
    const res = await installToken(row.id).catch(() => false)
    ins.loading = false
    if (!res) { ins.visible = false; return }
    ins.cmd = `$a="$env:TEMP\\Instalar-Nextec.ps1"; Invoke-WebRequest -UseBasicParsing "${SCRIPT_URL}" -OutFile $a; powershell -NoProfile -ExecutionPolicy Bypass -File $a -UrlBase "${window.location.origin}/api/nextec/update" -GrupoId ${row.id} -ChaveCliente "${res.data.token}"`
  }
  const copyCmd = async () => {
    try { await navigator.clipboard.writeText(ins.cmd); ElMessage.success('Comando copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
  const revokeInstall = async () => {
    const c = await ElMessageBox.confirm('Invalidar todos os comandos de instalação já gerados? Quem ainda não rodou o comando precisará de um novo.', 'Invalidar comandos',
      { confirmButtonText: 'Invalidar', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await installRevoke().catch(() => false)
    if (res) { ElMessage.success('Comandos antigos invalidados.'); ins.visible = false }
  }

  // ---------- ações da linha ----------
  const onRow = async (cmd, row) => {
    if (cmd === 'subs') Object.assign(sb, { visible: true, parent: row, text: '', access: { teams: [], users: [], rule: 1 } })
    if (cmd === 'install') openInstall(row)
    if (cmd === 'devices') router.push({ path: '/user/peer', query: { client: String(row.id) } })
    if (cmd === 'delete') {
      const subs = row.isSub ? [] : row.children
      const msg = subs.length
        ? `Excluir o cliente "${row.label}" e os ${subs.length} subgrupo(s)? Os dispositivos ficam sem cliente.`
        : `Excluir "${row.label}"? Os dispositivos ficam sem cliente.`
      const c = await ElMessageBox.confirm(msg, 'Excluir', { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
      if (!c) return
      let fail = false
      for (const g of [...subs, row]) {
        const col = collections.value.find(x => x.name === PREFIX + g.name)
        if (col) await collectionRemove({ id: col.id }).catch(() => { fail = true })
        const r = await groupRemove({ id: g.id }).catch(() => false)
        if (!r) fail = true
      }
      ElMessage[fail ? 'warning' : 'success'](fail ? 'Parte não foi excluída.' : 'Excluído.')
      load()
    }
  }

  // ---------- modelos ----------
  const newId = () => Math.random().toString(36).slice(2, 10)
  const emptyAccess = () => ({ teams: [], users: [], rule: 1 })
  function normalizeTemplate (t) {
    return {
      id: t.id || newId(),
      name: t.name || '',
      root: { ...emptyAccess(), ...(t.root || {}) },
      subgroups: (t.subgroups || []).map(s => ({ ...emptyAccess(), ...s })),
    }
  }
  const tplList = reactive({ visible: false })
  const tpInput = ref()
  const tp = reactive({ visible: false, saving: false, data: normalizeTemplate({}) })
  const openTemplate = (t) => { tp.data = normalizeTemplate(t ? JSON.parse(JSON.stringify(t)) : {}); tp.visible = true }
  const addTplSub = () => tp.data.subgroups.push({ name: '', ...emptyAccess() })
  const persistTemplates = async (list) => {
    const res = await saveClientTemplates(list).catch(() => false)
    if (res) templates.value = list
    return !!res
  }
  const saveTemplate = async () => {
    const d = { ...tp.data, name: tp.data.name.trim(), subgroups: tp.data.subgroups.filter(s => s.name.trim()).map(s => ({ ...s, name: s.name.trim() })) }
    if (!d.name) return
    if (templates.value.some(t => t.id !== d.id && t.name.toLowerCase() === d.name.toLowerCase())) return ElMessage.warning('Já existe um modelo com esse nome.')
    if (new Set(d.subgroups.map(s => s.name.toLowerCase())).size !== d.subgroups.length) return ElMessage.warning('Há subgrupos repetidos no modelo.')
    tp.saving = true
    const list = templates.value.some(t => t.id === d.id) ? templates.value.map(t => (t.id === d.id ? d : t)) : [...templates.value, d]
    const ok = await persistTemplates(list)
    tp.saving = false
    if (ok) { tp.visible = false; ElMessage.success('Modelo salvo.') }
  }
  const removeTemplate = async (t) => {
    const c = await ElMessageBox.confirm(`Excluir o modelo "${t.name}"? Clientes já criados não mudam.`, 'Excluir modelo',
      { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    if (await persistTemplates(templates.value.filter(x => x.id !== t.id))) ElMessage.success('Modelo excluído.')
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
  .nx-client { display: inline-flex; align-items: center; gap: 8px; }
  .nx-client-name { font-weight: 600; color: var(--nx-text); }
  .nx-client.is-sub .nx-client-name { font-weight: 500; }
  .nx-sub-icon { color: var(--nx-accent); }
  .nx-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-help-top { margin: 0 0 12px; font-size: 13px; }
  .nx-form :deep(.el-select) { width: 100%; }
  .nx-preview { padding: 12px 14px; border-radius: 12px; background: var(--nx-tint);
    ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: var(--nx-text); } }
  .nx-tp-head { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
  .nx-tp-sub { padding: 12px; margin-bottom: 10px; border-radius: 12px; background: var(--nx-field); display: flex; flex-direction: column; gap: 8px; }
  .nx-tp-row { display: flex; gap: 8px; align-items: center; .el-button { margin: 0 !important; } }
  @media (max-width: 768px) {
    .nx-search { max-width: none; flex: 1 1 100%; }
    .nx-bar-right { margin-left: 0; width: 100%; }
  }
</style>
