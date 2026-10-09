<template>
  <section class="nx-upd" aria-label="Atualizações do app">
    <!-- resumo -->
    <div class="nx-stats" role="list">
      <div class="nx-stat" role="listitem">
        <div class="nx-label">Versão publicada</div>
        <div class="nx-stat-value">{{ publishedLabel }}</div>
        <div class="nx-stat-hint">{{ modeHint }}</div>
      </div>
      <div class="nx-stat" role="listitem">
        <div class="nx-label">Na versão publicada</div>
        <div class="nx-stat-value">{{ summary.updated }}</div>
        <div class="nx-stat-hint">de {{ summary.reporting }} {{ summary.reporting === 1 ? 'máquina que checou' : 'máquinas que checaram' }}</div>
      </div>
      <div class="nx-stat" role="listitem">
        <div class="nx-label">Aguardando atualizar</div>
        <div class="nx-stat-value">{{ summary.pending }}</div>
        <div class="nx-stat-hint">atualizam na próxima checagem diária</div>
      </div>
    </div>

    <div class="nx-bar">
      <p class="nx-bar-text">Envie o instalador, escolha quem recebe e as máquinas se atualizam sozinhas.</p>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button @click="installVisible = true">Instalar em uma máquina</el-button>
        <el-button type="primary" @click="openUpload"><el-icon><el-icon-Upload/></el-icon><span>Enviar nova versão</span></el-button>
      </div>
    </div>

    <!-- versões enviadas -->
    <div class="nx-card">
      <div class="nx-card-head"><h2 class="nx-h2">Versões enviadas</h2></div>
      <ul v-if="isMobile && releases.length" class="nx-cards" aria-label="Versões enviadas">
        <li v-for="row in releases" :key="row.id" class="nx-mcard">
          <div class="nx-mcard-top">
            <strong class="nx-ver nx-mcard-title">{{ row.version }}</strong>
            <el-tag v-if="isPublished(row)" :type="rollout.mode === 'all' ? 'success' : 'warning'" disable-transitions>{{ publishedTag }}</el-tag>
            <span v-else class="nx-muted nx-small">Não publicada</span>
          </div>
          <div class="nx-small nx-muted">{{ fmt(row.created_at) }}{{ row.uploaded_by ? ' · ' + row.uploaded_by : '' }} · {{ size(row.size) }}</div>
          <div v-if="row.notes" class="nx-small">{{ row.notes }}</div>
          <div class="nx-mcard-actions">
            <el-button size="small" type="primary" @click="openPublish(row)">{{ isPublished(row) ? 'Alterar' : 'Publicar' }}</el-button>
            <el-button size="small" :disabled="isPublished(row)" @click="del(row)"><span :class="{ 'nx-danger-text': !isPublished(row) }">Excluir</span></el-button>
          </div>
        </li>
      </ul>
      <el-table v-else-if="!isMobile" :data="releases" v-loading="loading" row-key="id" aria-label="Versões enviadas" empty-text=" ">
        <el-table-column label="Versão" min-width="110">
          <template #default="{ row }"><strong class="nx-ver">{{ row.version }}</strong></template>
        </el-table-column>
        <el-table-column label="Situação" min-width="190">
          <template #default="{ row }">
            <el-tag v-if="isPublished(row)" :type="rollout.mode === 'all' ? 'success' : 'warning'" disable-transitions>{{ publishedTag }}</el-tag>
            <span v-else class="nx-muted">Não publicada</span>
          </template>
        </el-table-column>
        <el-table-column label="Enviada" min-width="150">
          <template #default="{ row }">
            <div>{{ fmt(row.created_at) }}</div>
            <div class="nx-muted nx-small">{{ row.uploaded_by ? 'por ' + row.uploaded_by : '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Arquivo" min-width="150">
          <template #default="{ row }">
            <div>{{ size(row.size) }}</div>
            <div class="nx-muted nx-small nx-mono" :title="row.sha256">SHA-256 {{ row.sha256.slice(0, 10) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Notas" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span :class="{ 'nx-muted': !row.notes }">{{ row.notes || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="Ações" width="200" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" type="primary" @click="openPublish(row)">{{ isPublished(row) ? 'Alterar' : 'Publicar' }}</el-button>
              <el-button size="small" :disabled="isPublished(row)" @click="del(row)"><span :class="{ 'nx-danger-text': !isPublished(row) }">Excluir</span></el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !releases.length" :image-size="72" description="Nenhuma versão enviada ainda.">
        <p class="nx-empty-hint">Envie o instalador (.msi) aqui. Depois, publique para um grupo piloto e, se estiver tudo certo, para todos.</p>
        <el-button type="primary" @click="openUpload">Enviar nova versão</el-button>
      </el-empty>
    </div>

    <!-- máquinas -->
    <div class="nx-card">
      <div class="nx-card-head">
        <h2 class="nx-h2">Máquinas</h2>
        <el-input v-model="q" class="nx-search" clearable placeholder="Buscar máquina ou ID" aria-label="Buscar máquina">
          <template #prefix><el-icon><el-icon-Search/></el-icon></template>
        </el-input>
      </div>
      <ul v-if="isMobile && pageRows.length" class="nx-cards" aria-label="Situação das máquinas">
        <li v-for="row in pageRows" :key="row.peer_id" class="nx-mcard">
          <div class="nx-mcard-top">
            <strong class="nx-mcard-title">{{ row.name }}</strong>
            <span class="nx-small"><span class="nx-dot" :class="'is-' + row.state.tone" aria-hidden="true"></span>{{ row.state.label }}</span>
          </div>
          <div class="nx-small nx-muted nx-mono">{{ row.peer_id }}{{ row.client ? ' · ' + row.client : '' }}</div>
          <div class="nx-small">Instalada: <span class="nx-ver">{{ row.version || 'não informou' }}</span> · Oferecida: <span class="nx-ver">{{ row.target || 'nenhuma' }}</span></div>
          <div class="nx-small nx-muted">Checou {{ ago(row.seen_at) }}</div>
        </li>
      </ul>
      <el-table v-else-if="!isMobile" :data="pageRows" v-loading="loading" row-key="peer_id" aria-label="Situação das máquinas" empty-text=" ">
        <el-table-column label="Máquina" min-width="190">
          <template #default="{ row }">
            <div class="nx-name">{{ row.name }}</div>
            <div class="nx-muted nx-small nx-mono">{{ row.peer_id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Cliente" min-width="150">
          <template #default="{ row }">
            <el-tag v-if="row.client" disable-transitions>{{ row.client }}</el-tag>
            <span v-else class="nx-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="Instalada" min-width="110">
          <template #default="{ row }"><span v-if="row.version" class="nx-ver">{{ row.version }}</span><span v-else class="nx-muted">não informou</span></template>
        </el-table-column>
        <el-table-column label="Oferecida" min-width="110">
          <template #default="{ row }"><span v-if="row.target" class="nx-ver">{{ row.target }}</span><span v-else class="nx-muted">nenhuma</span></template>
        </el-table-column>
        <el-table-column label="Situação" min-width="160">
          <template #default="{ row }">
            <span class="nx-dot" :class="'is-' + row.state.tone" aria-hidden="true"></span>{{ row.state.label }}
          </template>
        </el-table-column>
        <el-table-column label="Última checagem" min-width="150">
          <template #default="{ row }">{{ ago(row.seen_at) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" :image-size="64" description="Nenhuma máquina checou atualização ainda.">
        <p class="nx-empty-hint">As máquinas aparecem aqui depois de rodar o script Instalar-Nextec. Use Instalar em uma máquina para ver o comando.</p>
      </el-empty>
      <div v-if="rows.length > pageSize" class="nx-pager">
        <el-pagination v-model:current-page="page" :page-size="pageSize" layout="total, prev, pager, next" :total="rows.length" background/>
      </div>
    </div>

    <!-- enviar versão -->
    <el-dialog v-model="up.visible" title="Enviar nova versão" width="min(520px, 92vw)" :close-on-click-modal="false" :before-close="beforeCloseUpload">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Número da versão" required class="is-required">
          <el-input v-model="up.version" placeholder="Ex.: 2.0.1" :disabled="up.busy"/>
          <p class="nx-help">Use números separados por ponto. Cada versão é enviada uma vez.</p>
        </el-form-item>
        <el-form-item label="Instalador (.msi)" required class="is-required">
          <input ref="fileInput" type="file" accept=".msi,.exe" class="nx-file" :disabled="up.busy" @change="onFile">
          <p v-if="up.file" class="nx-help">{{ up.file.name }} · {{ size(up.file.size) }}</p>
        </el-form-item>
        <el-form-item label="Notas (opcional)">
          <el-input v-model="up.notes" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="O que mudou nesta versão" :disabled="up.busy"/>
        </el-form-item>
        <el-progress v-if="up.busy" :percentage="up.progress" :stroke-width="10" aria-label="Progresso do envio"/>
        <p v-if="up.error" class="nx-error" role="alert">{{ up.error }}</p>
      </el-form>
      <template #footer>
        <el-button :disabled="up.busy" @click="up.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="up.busy" :disabled="!up.version || !up.file" @click="sendUpload">Enviar</el-button>
      </template>
    </el-dialog>

    <!-- publicar -->
    <el-dialog v-model="pub.visible" :title="'Publicar ' + (pub.release ? pub.release.version : '')" width="min(560px, 92vw)">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-radio-group v-model="pub.mode" class="nx-modes">
          <el-radio-button value="pilot">Grupo piloto</el-radio-button>
          <el-radio-button value="all">Todos</el-radio-button>
          <el-radio-button value="off">Suspender</el-radio-button>
        </el-radio-group>
        <p class="nx-help nx-mode-help">{{ modeHelp }}</p>
        <template v-if="pub.mode === 'pilot'">
          <el-form-item label="Clientes do piloto">
            <el-select v-model="pub.clients" multiple filterable collapse-tags collapse-tags-tooltip placeholder="Escolha clientes ou subgrupos">
              <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id"/>
            </el-select>
          </el-form-item>
          <el-form-item label="Máquinas do piloto">
            <el-select v-model="pub.peers" multiple filterable collapse-tags collapse-tags-tooltip placeholder="Escolha máquinas">
              <el-option v-for="p in peers" :key="p.id" :label="(p.alias || p.hostname || p.id) + ' (' + p.id + ')'" :value="p.id"/>
            </el-select>
          </el-form-item>
        </template>
        <el-alert v-if="pub.mode === 'all'" type="warning" show-icon :closable="false"
                  title="Todas as máquinas com o script instalado vão atualizar na próxima checagem. Confirme que o piloto funcionou."/>
      </el-form>
      <template #footer>
        <el-button @click="pub.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="pub.busy" @click="savePublish">{{ pub.mode === 'off' ? 'Suspender publicação' : 'Publicar' }}</el-button>
      </template>
    </el-dialog>

    <!-- como instalar -->
    <el-dialog v-model="installVisible" title="Instalar em uma máquina" width="min(640px, 92vw)">
      <p class="nx-help nx-help-top">Rode como administrador (PowerShell) na máquina. O script instala a versão publicada para ela e cria uma tarefa que confere todo dia.</p>
      <div class="nx-cmd">
        <code>{{ installCmd }}</code>
        <el-button size="small" @click="copy(installCmd)"><el-icon><el-icon-CopyDocument/></el-icon><span>Copiar comando</span></el-button>
      </div>
      <p class="nx-help">Sem versão publicada, o script só cria a tarefa e espera. Para forçar a reinstalação, acrescente <code>-Forcar</code>.</p>
      <template #footer><el-button type="primary" @click="installVisible = false">Fechar</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useMediaQuery } from '@vueuse/core'
  import { list as peerList } from '@/api/peer'
  import { list as groupList } from '@/api/device_group'
  import { uploadFile } from '@/nextec/upload'
  import { timeAgo } from '@/utils/time'
  import { updatesOverview, updatesRollout, updatesDelete } from '@/nextec/api'

  const SCRIPT_URL = 'https://raw.githubusercontent.com/Sou-Nextec/rustdesk-api-web/master/nextec/atualizacao/Instalar-Nextec.ps1'
  const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(\.\d{1,4})?$/
  const ok = (m) => ElMessage.success(m)

  const isMobile = useMediaQuery('(max-width: 768px)')
  const loading = ref(false)
  const releases = ref([])
  const installs = ref([])
  const rollout = ref({ version: '', mode: 'off', groups: [], peers: [] })
  const peers = ref([])
  const groups = ref([])
  const maxSize = ref(300 * 1024 * 1024)

  const load = async () => {
    loading.value = true
    const [o, p, g] = await Promise.all([
      updatesOverview().catch(() => false),
      peerList({ page: 1, page_size: 10000 }).catch(() => false),
      groupList({ page: 1, page_size: 999 }).catch(() => false),
    ])
    loading.value = false
    if (o) {
      releases.value = o.data.releases || []
      installs.value = o.data.installs || []
      rollout.value = o.data.rollout || rollout.value
      maxSize.value = o.data.max_size || maxSize.value
    }
    if (p) peers.value = p.data.list || []
    if (g) groups.value = g.data.list || []
  }
  onMounted(load)

  // ---------- apresentação ----------
  const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleString('pt-BR') : '-')
  const ago = (ts) => (ts ? timeAgo(ts * 1000) : '-')
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
  const groupName = (id) => groups.value.find(g => g.id === id)?.name || ''
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ok('Copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }

  const active = computed(() => rollout.value.mode !== 'off' && !!rollout.value.version)
  const publishedLabel = computed(() => (active.value ? rollout.value.version : 'Nenhuma'))
  const modeHint = computed(() => {
    if (!active.value) return 'Ninguém está sendo atualizado'
    if (rollout.value.mode === 'all') return 'Para todas as máquinas'
    const g = rollout.value.groups.length
    const m = rollout.value.peers.length
    return `Piloto: ${[g && `${g} ${g === 1 ? 'grupo' : 'grupos'}`, m && `${m} ${m === 1 ? 'máquina' : 'máquinas'}`].filter(Boolean).join(' e ')}`
  })
  const publishedTag = computed(() => (rollout.value.mode === 'all' ? 'Publicada para todos' : 'Em piloto'))
  const isPublished = (r) => active.value && r.version === rollout.value.version

  // máquinas e situação
  const inPilot = (row) => rollout.value.peers.includes(row.peer_id) || (!!row.group_id && rollout.value.groups.includes(row.group_id))
  const rows = computed(() => installs.value.map(i => {
    const p = peers.value.find(x => x.id === i.peer_id)
    const row = { ...i, name: p ? (p.alias || p.hostname || i.peer_id) : i.peer_id, group_id: p ? p.group_id : 0, client: p ? groupName(p.group_id) : '' }
    let state = { label: 'Sem versão publicada', tone: 'off' }
    if (active.value) {
      if (i.version && i.version === rollout.value.version) state = { label: 'Atualizada', tone: 'on' }
      else if (i.target === rollout.value.version) state = { label: 'Aguardando atualizar', tone: 'warn' }
      else if (rollout.value.mode === 'pilot') state = { label: 'Fora do piloto', tone: 'off' }
      else state = { label: 'Aguardando a próxima checagem', tone: 'warn' }
    }
    return { ...row, state }
  }))
  const summary = computed(() => ({
    reporting: rows.value.length,
    updated: active.value ? rows.value.filter(r => r.state.tone === 'on').length : 0,
    pending: active.value ? rows.value.filter(r => r.state.tone === 'warn').length : 0,
  }))
  const q = ref('')
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = computed(() => {
    const t = norm(q.value.trim())
    return rows.value.filter(r => !t || [r.peer_id, r.name, r.client].some(v => norm(v).includes(t)))
  })
  const page = ref(1)
  const pageSize = 15
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
  watch(q, () => { page.value = 1 })

  // ---------- enviar ----------
  const fileInput = ref(null)
  const up = reactive({ visible: false, busy: false, progress: 0, version: '', notes: '', file: null, error: '' })
  const openUpload = () => { Object.assign(up, { visible: true, busy: false, progress: 0, version: '', notes: '', file: null, error: '' }) }
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]
    up.error = ''
    if (!f) { up.file = null; return }
    if (!/\.(msi|exe)$/i.test(f.name)) { up.file = null; up.error = 'Escolha o instalador .msi (ou .exe).'; return }
    if (f.size > maxSize.value) { up.file = null; up.error = `O arquivo passa do limite de ${size(maxSize.value)}.`; return }
    up.file = f
  }
  const beforeCloseUpload = (done) => { if (!up.busy) done() }
  const sendUpload = async () => {
    if (!VERSION_RE.test(up.version.trim())) { up.error = 'Versão inválida. Use números separados por ponto, como 2.0.1.'; return }
    up.busy = true; up.progress = 0; up.error = ''
    const r = await uploadFile('/nextec/updates/upload', { version: up.version.trim(), notes: up.notes }, up.file, (p) => { up.progress = p })
    up.busy = false
    if (r.ok) {
      up.visible = false
      ok(`Versão ${up.version.trim()} enviada. Publique para um grupo piloto quando quiser.`)
      load()
    } else {
      up.error = r.message
    }
  }

  // ---------- publicar ----------
  const pub = reactive({ visible: false, busy: false, release: null, mode: 'pilot', clients: [], peers: [] })
  const modeHelp = computed(() => ({
    pilot: 'Só as máquinas escolhidas recebem. Use para testar antes de liberar para todos.',
    all: 'Todas as máquinas com o script instalado recebem na próxima checagem diária.',
    off: 'Ninguém atualiza mais. As máquinas ficam na versão em que estão.',
  })[pub.mode])
  const openPublish = (r) => {
    pub.release = r
    pub.busy = false
    if (isPublished(r)) {
      pub.mode = rollout.value.mode
      pub.clients = [...rollout.value.groups]
      pub.peers = [...rollout.value.peers]
    } else {
      pub.mode = 'pilot'; pub.clients = []; pub.peers = []
    }
    pub.visible = true
  }
  // escolher um cliente inclui os subgrupos dele (nomes "Cliente / Subgrupo")
  const expandGroups = (ids) => {
    const out = new Set(ids)
    ids.forEach(id => {
      const n = groupName(id)
      if (n) groups.value.filter(g => g.name.startsWith(n + ' / ')).forEach(g => out.add(g.id))
    })
    return [...out]
  }
  const savePublish = async () => {
    if (pub.mode === 'pilot' && !pub.clients.length && !pub.peers.length) { ElMessage.warning('Escolha ao menos um cliente ou uma máquina para o piloto.'); return }
    if (pub.mode === 'all') {
      const c = await ElMessageBox.confirm(`Publicar a versão ${pub.release.version} para todas as máquinas?`, 'Publicar para todos',
        { confirmButtonText: 'Publicar para todos', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
      if (!c) return
    }
    pub.busy = true
    const res = await updatesRollout({
      version: pub.release.version, mode: pub.mode, groups: pub.mode === 'pilot' ? expandGroups(pub.clients) : [], peers: pub.mode === 'pilot' ? pub.peers : [],
    }).catch(() => false)
    pub.busy = false
    if (res) { pub.visible = false; ok(pub.mode === 'off' ? 'Publicação suspensa.' : 'Publicação salva.'); load() }
  }

  const del = async (r) => {
    const c = await ElMessageBox.confirm(`Excluir a versão ${r.version}? O arquivo é apagado do servidor.`, 'Excluir versão',
      { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await updatesDelete(r.id).catch(() => false)
    if (res) { ok('Versão excluída.'); load() }
  }

  // ---------- instalar ----------
  const installVisible = ref(false)
  const installCmd = computed(() =>
    `$a="$env:TEMP\\Instalar-Nextec.ps1"; Invoke-WebRequest -UseBasicParsing "${SCRIPT_URL}" -OutFile $a; powershell -NoProfile -ExecutionPolicy Bypass -File $a -UrlBase "${window.location.origin}/api/nextec/update"`)
</script>

<style scoped lang="scss">
  .nx-upd { width: 100%; }
  .nx-label { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--nx-text-subtle); margin-bottom: 8px; }
  .nx-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
  .nx-stat { padding: 18px 22px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); }
  .nx-stat-value { font-family: var(--nx-font-body); font-variant-numeric: tabular-nums; font-size: 30px; font-weight: 700; line-height: 1.1; color: var(--nx-text); }
  .nx-stat-hint { font-size: 12px; color: var(--nx-text-muted); margin-top: 6px; }

  .nx-bar {
    display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 14px 18px; margin-bottom: 16px;
    background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card);
  }
  .nx-bar-text { margin: 0; flex: 1 1 280px; font-size: 13px; color: var(--nx-text-muted); }
  .nx-bar-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; .el-button + .el-button { margin-left: 0; } }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-search { width: 280px; max-width: 100%; }
  .nx-name { font-weight: 600; color: var(--nx-text); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
  .nx-ver { font-variant-numeric: tabular-nums; font-weight: 600; }
  .nx-empty-hint { margin: 0 0 12px; color: var(--nx-text-muted); font-size: 13px; max-width: 420px; }
  .nx-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-off { background: #9A97AD; }
    &.is-warn { background: #9A5B00; box-shadow: 0 0 0 3px #FEF3C7; }
  }
  html.dark .nx-dot.is-on { background: #4CC38A; box-shadow: 0 0 0 3px rgba(76, 195, 138, 0.22); }
  html.dark .nx-dot.is-off { background: #6E6E7A; }
  html.dark .nx-dot.is-warn { background: #F0B24A; box-shadow: 0 0 0 3px rgba(240, 178, 74, 0.2); }
  .nx-danger-text { color: #BA1A1A; }
  html.dark .nx-danger-text { color: #FF9C93; }
  .nx-row-actions { display: flex; gap: 6px; flex-wrap: nowrap; .el-button { margin: 0 !important; } }
  .nx-cards { list-style: none; margin: 0; padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
  .nx-mcard { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 14px; background: var(--nx-bg); }
  .nx-mcard-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .nx-mcard-title { color: var(--nx-text); font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
  .nx-mcard-actions { display: flex; gap: 8px; margin-top: 4px; .el-button { margin: 0; } }
  .nx-pager { padding: 12px 18px; border-top: 1px solid var(--nx-divider); display: flex; justify-content: flex-end; }
  .nx-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); code { font-size: 12px; } }
  .nx-help-top { margin: 0 0 14px; font-size: 13px; }
  .nx-mode-help { margin: 10px 0 16px; }
  .nx-modes { display: flex; }
  .nx-file { width: 100%; font: inherit; font-size: 13px; color: var(--nx-text); }
  .nx-error { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; background: #FDECEA; color: #8C1D18; }
  html.dark .nx-error { background: rgba(255, 138, 128, 0.14); color: #FFB4AB; }
  .nx-cmd { margin-top: 4px; padding: 12px 14px; border-radius: 12px; background: var(--nx-field); display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
    code { font-size: 12px; line-height: 1.5; word-break: break-all; color: var(--nx-text); } }
  .nx-form :deep(.el-select) { width: 100%; }
  @media (max-width: 900px) { .nx-stats { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 768px) {
    .nx-bar-right { margin-left: 0; width: 100%; }
    .nx-search { width: 100%; }
  }
</style>
