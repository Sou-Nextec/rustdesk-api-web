<template>
  <section class="nx-sec" aria-label="Senhas dos servidores">
    <div class="nx-bar">
      <el-input v-model="q" class="nx-search" clearable placeholder="Buscar máquina, ID ou cliente" aria-label="Buscar máquina">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button @click="rules.visible = true">Regras</el-button>
        <el-button @click="openAudit">Auditoria</el-button>
        <el-button @click="openAgent">Cadastrar máquina</el-button>
        <el-button type="primary" @click="openAdd"><el-icon><el-icon-Plus/></el-icon><span>Ligar em uma máquina</span></el-button>
      </div>
    </div>

    <div class="nx-card">
      <el-table :data="pageRows" v-loading="loading" row-key="peer_id" aria-label="Máquinas com senha automática" empty-text=" ">
        <el-table-column label="Máquina" min-width="190">
          <template #default="{ row }">
            <div class="nx-name">{{ row.alias || row.hostname || row.peer_id }}</div>
            <div class="nx-muted nx-small nx-mono">{{ row.peer_id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Cliente" min-width="150">
          <template #default="{ row }">
            <el-tag v-if="groupName(row.group_id)" disable-transitions>{{ groupName(row.group_id) }}</el-tag>
            <span v-else class="nx-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="Senha automática" min-width="150">
          <template #default="{ row }">
            <span v-if="row.managed"><span class="nx-dot is-on" aria-hidden="true"></span>Ligada, troca a cada {{ every(row.interval_minutes) }}</span>
            <span v-else class="nx-muted"><span class="nx-dot is-off" aria-hidden="true"></span>Desligada</span>
          </template>
        </el-table-column>
        <el-table-column label="Agente" min-width="150">
          <template #default="{ row }">
            <template v-if="row.enrolled">
              <span class="nx-dot" :class="seenRecently(row) ? 'is-on' : 'is-warn'" aria-hidden="true"></span>
              <span>{{ seenRecently(row) ? 'Ativo' : 'Sem contato' }}</span>
              <div class="nx-muted nx-small">visto {{ ago(row.last_seen_at) }}</div>
            </template>
            <span v-else class="nx-warn-text">Não instalado</span>
          </template>
        </el-table-column>
        <el-table-column label="Senha" min-width="170">
          <template #default="{ row }">
            <template v-if="row.has_password">
              <div>Versão {{ row.version }}, trocada {{ ago(row.active_at) }}</div>
              <div class="nx-muted nx-small">{{ row.managed ? 'próxima ' + until(row.next_rotation_at) : 'regra desligada' }}</div>
            </template>
            <span v-else class="nx-muted">{{ row.enrolled && row.managed ? 'Aguardando a primeira troca' : 'Sem senha ainda' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Ações" width="200" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" :disabled="!row.has_password && !row.pending" @click="reveal(row)">Ver senha</el-button>
              <el-button size="small" :disabled="!row.enrolled || !row.managed" @click="rotate(row)">Trocar agora</el-button>
              <el-dropdown trigger="click" @command="cmd => onRow(cmd, row)">
                <el-button size="small" aria-label="Mais ações"><el-icon><el-icon-MoreFilled/></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="!row.managed" command="on">Ligar nesta máquina</el-dropdown-item>
                    <el-dropdown-item v-else command="off">Desligar nesta máquina</el-dropdown-item>
                    <el-dropdown-item v-if="row.enrolled" command="unenroll" divided><span class="nx-danger-text">Remover agente</span></el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filtered.length" :image-size="72"
                :description="devices.length ? 'Nenhuma máquina encontrada.' : 'Nenhuma máquina com senha automática ainda.'">
        <p v-if="!devices.length">Ligue a regra em um grupo (por exemplo, Servidores de cada cliente) ou em uma máquina e instale o agente nela.</p>
        <el-button v-if="!devices.length" type="primary" @click="rules.visible = true">Abrir regras</el-button>
      </el-empty>
      <div v-if="filtered.length > pageSize" class="nx-pager">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" layout="total, prev, pager, next" :total="filtered.length" background/>
      </div>
    </div>

    <!-- ver senha -->
    <el-dialog v-model="show.visible" class="nx-dlg" title="Senha atual" width="460px">
      <p class="nx-help nx-help-top">{{ show.name }}. Esta consulta fica registrada na auditoria. A senha vale só para liberar a conexão pelo RustDesk, não é a senha do Windows.</p>
      <div class="nx-pw">
        <code>{{ show.password || 'ainda não confirmada' }}</code>
        <el-button v-if="show.password" size="small" @click="copy(show.password)">Copiar</el-button>
      </div>
      <p v-if="show.pending" class="nx-help">Há uma troca em andamento (senha pendente): <code>{{ show.pending }}</code>. Se a atual não funcionar, tente esta.</p>
      <template #footer><el-button type="primary" @click="show.visible = false">Fechar</el-button></template>
    </el-dialog>

    <!-- regras por grupo -->
    <el-dialog v-model="rules.visible" class="nx-dlg" title="Regras de senha automática" width="680px">
      <p class="nx-help nx-help-top">Máquinas dos grupos ligados abaixo passam a trocar a senha sozinhas, no intervalo escolhido. Uma regra na própria máquina vale mais que a do grupo.</p>
      <el-table :data="groupPolicies" empty-text="Nenhum grupo ligado ainda." aria-label="Regras por grupo">
        <el-table-column label="Grupo" min-width="200">
          <template #default="{ row }">{{ groupName(Number(row.ref)) || 'grupo ' + row.ref }}</template>
        </el-table-column>
        <el-table-column label="Ligada" width="90">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" aria-label="Ligada" @change="savePolicy(row)"/>
          </template>
        </el-table-column>
        <el-table-column label="Trocar a cada" width="150">
          <template #default="{ row }">
            <el-select v-model="row.interval_minutes" aria-label="Intervalo" @change="savePolicy(row)">
              <el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="" width="90">
          <template #default="{ row }"><el-button size="small" text type="danger" @click="removePolicy(row)">Remover</el-button></template>
        </el-table-column>
      </el-table>
      <div class="nx-add-group">
        <el-select v-model="rules.group" filterable placeholder="Escolha um grupo (cliente ou subgrupo) para ligar" aria-label="Grupo">
          <el-option v-for="g in groups.filter(g => !groupPolicies.some(p => Number(p.ref) === g.id))" :key="g.id" :label="g.name" :value="g.id"/>
        </el-select>
        <el-select v-model="rules.interval" aria-label="Intervalo" style="width: 150px">
          <el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/>
        </el-select>
        <el-button type="primary" :disabled="!rules.group" @click="addGroupRule">Ligar</el-button>
      </div>
      <template #footer><el-button type="primary" @click="rules.visible = false">Fechar</el-button></template>
    </el-dialog>

    <!-- ligar em uma máquina -->
    <el-dialog v-model="add.visible" class="nx-dlg" title="Ligar em uma máquina" width="520px">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Máquina" required class="is-required">
          <el-select v-model="add.peer" filterable remote :remote-method="searchPeers" :loading="add.loading" placeholder="Busque por ID, apelido ou nome">
            <el-option v-for="p in add.options" :key="p.id" :label="`${p.alias || p.hostname || p.id} (${p.id})`" :value="p.id"/>
          </el-select>
        </el-form-item>
        <el-form-item label="Trocar a cada">
          <el-select v-model="add.interval"><el-option v-for="o in intervals" :key="o.value" :label="o.label" :value="o.value"/></el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="add.visible = false">Cancelar</el-button>
        <el-button type="primary" :disabled="!add.peer" @click="saveAdd">Ligar</el-button>
      </template>
    </el-dialog>

    <!-- cadastrar máquina (agente) -->
    <el-dialog v-model="agent.visible" class="nx-dlg" title="Cadastrar máquina" width="720px">
      <p class="nx-help nx-help-top">Em cada servidor, rode o comando abaixo no PowerShell como administrador. Ele instala o agente, que troca a senha sozinho. A chave vale para qualquer máquina nova; gere outra quando terminar para invalidar a anterior.</p>
      <el-button type="primary" :loading="agent.loading" @click="newKey">{{ agent.key ? 'Gerar outra chave' : 'Gerar chave de cadastro' }}</el-button>
      <template v-if="agent.key">
        <div class="nx-cmd">
          <code>{{ agentCommand }}</code>
          <el-button size="small" @click="copy(agentCommand)">Copiar comando</el-button>
        </div>
        <p class="nx-help">Esta chave aparece só agora. Pré-requisito: o RustDesk precisa estar instalado como serviço (instalação completa).</p>
      </template>
      <template #footer><el-button type="primary" @click="agent.visible = false">Fechar</el-button></template>
    </el-dialog>

    <!-- auditoria -->
    <el-dialog v-model="audit.visible" class="nx-dlg" title="Auditoria das senhas" width="820px">
      <el-table :data="audit.list" v-loading="audit.loading" max-height="420" empty-text="Nenhum evento." aria-label="Auditoria">
        <el-table-column label="Quando" width="170"><template #default="{ row }">{{ when(row.at) }}</template></el-table-column>
        <el-table-column label="Quem" width="160"><template #default="{ row }">{{ row.username || 'agente' }}</template></el-table-column>
        <el-table-column label="O quê" width="170"><template #default="{ row }">{{ actionText[row.action] || row.action }}</template></el-table-column>
        <el-table-column label="Máquina" prop="peer_id" min-width="130"/>
        <el-table-column label="Origem" prop="ip" min-width="120"/>
      </el-table>
      <template #footer><el-button type="primary" @click="audit.visible = false">Fechar</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { list as groupList } from '@/api/device_group'
  import { list as peerList } from '@/api/peer'
  import { timeAgo } from '@/utils/time'
  import { secretsOverview, secretsPolicy, secretsRotate, secretsReveal, secretsUnenroll, secretsAgentKey, secretsAudit } from '@/nextec/api'
  import '../list-page.scss'

  const loading = ref(false)
  const q = ref('')
  const devices = ref([])
  const policies = ref([])
  const groups = ref([])
  const agentKeySet = ref(false)

  const intervals = [
    { value: 15, label: '15 minutos' }, { value: 60, label: '1 hora' }, { value: 180, label: '3 horas' },
    { value: 360, label: '6 horas' }, { value: 720, label: '12 horas' }, { value: 1440, label: '24 horas' },
  ]
  const every = (m) => (m % 60 === 0 ? (m / 60 === 1 ? 'hora' : `${m / 60} h`) : `${m} min`)

  const load = async () => {
    loading.value = true
    const [ov, g] = await Promise.all([secretsOverview().catch(() => false), groupList({ page: 1, page_size: 9999 }).catch(() => false)])
    loading.value = false
    if (ov) {
      devices.value = ov.data.devices || []
      policies.value = (ov.data.policies || []).map(p => ({ ...p }))
      agentKeySet.value = !!ov.data.agent_key_set
    }
    if (g) groups.value = g.data.list || []
  }
  onMounted(load)

  const groupName = id => (id && groups.value.find(g => g.id === id)?.name) || ''
  const groupPolicies = computed(() => policies.value.filter(p => p.kind === 'group'))

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = computed(() => {
    const t = norm(q.value.trim())
    return devices.value.filter(d => !t || [d.peer_id, d.alias, d.hostname, groupName(d.group_id)].some(v => norm(v).includes(t)))
      .sort((a, b) => String(a.alias || a.hostname || a.peer_id).localeCompare(String(b.alias || b.hostname || b.peer_id), 'pt-BR'))
  })
  const page = ref(1)
  const pageSize = ref(20)
  const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

  const ago = (t) => (t ? timeAgo(t * 1000) : 'nunca')
  const seenRecently = d => d.last_seen_at && (Date.now() / 1000 - d.last_seen_at) < 20 * 60
  const until = (t) => {
    if (!t) return 'em breve'
    const m = Math.round((t - Date.now() / 1000) / 60)
    if (m <= 0) return 'na próxima verificação'
    return m < 90 ? `em ${m} min` : `em ${Math.round(m / 60)} h`
  }
  const when = (t) => new Date(t * 1000).toLocaleString('pt-BR')
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success('Copiado.') } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }

  // ---------- ver senha ----------
  const show = reactive({ visible: false, name: '', password: '', pending: '' })
  const reveal = async (row) => {
    const c = await ElMessageBox.confirm('Ver a senha desta máquina fica registrado na auditoria, com o seu nome. Continuar?', 'Ver senha',
      { confirmButtonText: 'Ver senha', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const r = await secretsReveal(row.peer_id).catch(() => false)
    if (r) Object.assign(show, { visible: true, name: row.alias || row.hostname || row.peer_id, password: r.data.password || '', pending: r.data.pending || '' })
  }
  const rotate = async (row) => {
    const r = await secretsRotate(row.peer_id).catch(() => false)
    if (r) ElMessage.success('A senha será trocada na próxima verificação do agente (até 5 minutos).')
  }

  // ---------- regras ----------
  const rules = reactive({ visible: false, group: null, interval: 180 })
  const savePolicy = async (p) => {
    const r = await secretsPolicy({ kind: p.kind, ref: p.ref, enabled: p.enabled, interval_minutes: p.interval_minutes }).catch(() => false)
    if (r) { ElMessage.success('Regra salva.'); load() }
  }
  const addGroupRule = async () => {
    const r = await secretsPolicy({ kind: 'group', ref: String(rules.group), enabled: true, interval_minutes: rules.interval }).catch(() => false)
    if (r) { rules.group = null; ElMessage.success('Grupo ligado.'); load() }
  }
  const removePolicy = async (p) => {
    const r = await secretsPolicy({ kind: p.kind, ref: p.ref, remove: true }).catch(() => false)
    if (r) { ElMessage.success('Regra removida.'); load() }
  }
  const onRow = async (cmd, row) => {
    if (cmd === 'on' || cmd === 'off') {
      const r = await secretsPolicy({ kind: 'peer', ref: row.peer_id, enabled: cmd === 'on', interval_minutes: row.interval_minutes || 180 }).catch(() => false)
      if (r) { ElMessage.success(cmd === 'on' ? 'Senha automática ligada.' : 'Senha automática desligada.'); load() }
    }
    if (cmd === 'unenroll') {
      const c = await ElMessageBox.confirm('Remove o agente e apaga as senhas guardadas desta máquina. A senha que está nela continua valendo até você trocá-la ou reinstalar o agente.',
        'Remover agente', { confirmButtonText: 'Remover', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
      if (!c) return
      if (await secretsUnenroll(row.peer_id).catch(() => false)) { ElMessage.success('Agente removido.'); load() }
    }
  }

  // ---------- ligar em uma máquina ----------
  const add = reactive({ visible: false, peer: null, interval: 180, options: [], loading: false })
  const openAdd = () => { Object.assign(add, { visible: true, peer: null, interval: 180, options: [] }); searchPeers('') }
  const searchPeers = async (term) => {
    add.loading = true
    const r = await peerList({ page: 1, page_size: 30, id: term || undefined }).catch(() => false)
    add.loading = false
    add.options = r ? (r.data.list || []) : []
  }
  const saveAdd = async () => {
    const r = await secretsPolicy({ kind: 'peer', ref: add.peer, enabled: true, interval_minutes: add.interval }).catch(() => false)
    if (r) { add.visible = false; ElMessage.success('Senha automática ligada. Instale o agente na máquina, se ainda não instalou.'); load() }
  }

  // ---------- agente ----------
  const agent = reactive({ visible: false, loading: false, key: '' })
  const openAgent = () => { agent.visible = true }
  const newKey = async () => {
    agent.loading = true
    const r = await secretsAgentKey().catch(() => false)
    agent.loading = false
    if (r) agent.key = r.data.key
  }
  const SCRIPT_URL = 'https://raw.githubusercontent.com/Sou-Nextec/rustdesk-api-web/master/nextec/atualizacao/Agente-Senha-Nextec.ps1'
  const agentCommand = computed(() =>
    `$a="$env:TEMP\\agente-senha.ps1"; Invoke-WebRequest -UseBasicParsing "${SCRIPT_URL}" -OutFile $a; powershell -NoProfile -ExecutionPolicy Bypass -File $a -Instalar -Painel "${window.location.origin}" -ChaveAgente "${agent.key}"`)

  // ---------- auditoria ----------
  const actionText = {
    connect: 'Conectou com a senha', reveal: 'Viu a senha', rotated: 'Senha trocada', rotate_now: 'Pediu troca imediata',
    policy_set: 'Mudou a regra', policy_remove: 'Removeu a regra', unenroll: 'Removeu o agente', agent_enroll: 'Agente cadastrado',
    agent_key_new: 'Gerou chave de cadastro',
  }
  const audit = reactive({ visible: false, loading: false, list: [] })
  const openAudit = async () => {
    audit.visible = true
    audit.loading = true
    const r = await secretsAudit().catch(() => false)
    audit.loading = false
    audit.list = r ? (r.data.list || []) : []
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
  .nx-name { font-weight: 600; color: var(--nx-text); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
  .nx-warn-text { color: #8A5300; }
  .nx-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-off { background: #9A97AD; }
    &.is-warn { background: #9A5B00; box-shadow: 0 0 0 3px #FEF3C7; }
  }
  .nx-row-actions { display: flex; gap: 6px; flex-wrap: nowrap; .el-button { margin: 0 !important; } }
  .nx-pager { padding: 12px 18px; border-top: 1px solid var(--nx-divider); display: flex; justify-content: flex-end; }
  .nx-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-help-top { margin: 0 0 14px; font-size: 13px; }
  .nx-pw { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 12px; background: var(--nx-field);
    code { flex: 1; font-size: 16px; letter-spacing: .04em; word-break: break-all; color: var(--nx-text); } }
  .nx-add-group { display: flex; gap: 8px; margin-top: 14px; .el-select:first-child { flex: 1; min-width: 0; } .el-button { margin: 0; } }
  .nx-cmd { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: var(--nx-field); display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
    code { font-size: 12px; line-height: 1.5; word-break: break-all; color: var(--nx-text); } }
  .nx-form :deep(.el-select) { width: 100%; }
  @media (max-width: 768px) {
    .nx-search { max-width: none; flex: 1 1 100%; }
    .nx-bar-right { margin-left: 0; width: 100%; }
    .nx-add-group { flex-direction: column; }
  }
  html.dark .nx-warn-text { color: #FCD38A; }
</style>
