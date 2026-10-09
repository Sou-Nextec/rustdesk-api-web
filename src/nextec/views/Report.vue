<template>
  <section class="nx-rep" aria-label="Relatório mensal">
    <div class="nx-bar nx-noprint">
      <el-date-picker v-model="month" type="month" value-format="YYYY-MM" format="MM/YYYY" :clearable="false" :editable="false" placeholder="Mês" class="nx-month"
                      aria-label="Mês do relatório" @change="load"/>
      <el-select v-model="groupId" clearable filterable class="nx-client" placeholder="Todos os clientes" aria-label="Cliente" @change="load">
        <el-option v-for="g in clients" :key="g.id" :label="g.name" :value="g.id"/>
      </el-select>
      <div class="nx-bar-right">
        <el-button @click="settings.visible = true">Chamado na conexão</el-button>
        <el-button :disabled="!rows.length" @click="exportCsv">Exportar CSV</el-button>
        <el-button :disabled="!rows.length" type="primary" @click="print">Imprimir ou salvar em PDF</el-button>
      </div>
    </div>

    <header class="nx-print-head">
      <h1>Relatório de acessos remotos</h1>
      <p>{{ monthLabel }} · {{ groupId ? groupName(groupId) : 'Todos os clientes' }}</p>
    </header>

    <el-alert v-if="truncated" type="warning" show-icon :closable="false" class="nx-alert"
              title="O mês tem mais conexões do que o relatório mostra. Filtre por cliente para ver todas."/>

    <div class="nx-stats" role="list">
      <div class="nx-stat" role="listitem"><div class="nx-label">Conexões</div><div class="nx-stat-value">{{ rows.length }}</div></div>
      <div class="nx-stat" role="listitem"><div class="nx-label">Tempo total</div><div class="nx-stat-value">{{ hm(totalSeconds) }}</div><div class="nx-stat-hint">só conexões com fim registrado</div></div>
      <div class="nx-stat" role="listitem"><div class="nx-label">Máquinas</div><div class="nx-stat-value">{{ machines }}</div></div>
      <div class="nx-stat" role="listitem"><div class="nx-label">Chamados</div><div class="nx-stat-value">{{ tickets }}</div><div class="nx-stat-hint">{{ withoutTicket }} conexões sem chamado</div></div>
    </div>

    <div class="nx-card">
      <div class="nx-card-head"><h2 class="nx-h2">Por cliente</h2></div>
      <el-table :data="summary" v-loading="loading" row-key="client" aria-label="Resumo por cliente" empty-text=" ">
        <el-table-column label="Cliente" min-width="200" prop="client"/>
        <el-table-column label="Conexões" width="110" prop="count"/>
        <el-table-column label="Tempo" width="110"><template #default="{ row }">{{ hm(row.seconds) }}</template></el-table-column>
        <el-table-column label="Máquinas" width="110" prop="machines"/>
        <el-table-column label="Chamados" width="110" prop="tickets"/>
      </el-table>
    </div>

    <div class="nx-card">
      <div class="nx-card-head"><h2 class="nx-h2">Conexões do mês</h2></div>
      <ul v-if="isMobile && pageRows.length" class="nx-cards nx-noprint" aria-label="Conexões do mês">
        <li v-for="r in pageRows" :key="r.id" class="nx-mcard">
          <div class="nx-mcard-top"><strong>{{ r.machine }}</strong><span class="nx-small nx-muted">{{ r.client || 'Sem cliente' }}</span></div>
          <div class="nx-small">{{ when(r.started_at) }} · {{ dur(r) }}</div>
          <div class="nx-small">{{ r.tech || 'Técnico não identificado' }} · {{ kind(r.type) }}</div>
          <div v-if="r.ticket" class="nx-small"><a v-if="jira" :href="jira + r.ticket" target="_blank" rel="noopener">{{ r.ticket }}</a><span v-else>{{ r.ticket }}</span>{{ r.note ? ' · ' + r.note : '' }}</div>
        </li>
      </ul>
      <el-table v-else :data="isPrinting ? rows : pageRows" v-loading="loading" row-key="id" aria-label="Conexões do mês" empty-text=" " class="nx-detail">
        <el-table-column label="Início" min-width="150"><template #default="{ row }">{{ when(row.started_at) }}</template></el-table-column>
        <el-table-column label="Duração" width="100"><template #default="{ row }">{{ dur(row) }}</template></el-table-column>
        <el-table-column label="Cliente" min-width="150"><template #default="{ row }">{{ row.client || 'Sem cliente' }}</template></el-table-column>
        <el-table-column label="Máquina" min-width="170">
          <template #default="{ row }"><div>{{ row.machine }}</div><div class="nx-small nx-muted nx-mono">{{ row.peer_id }}</div></template>
        </el-table-column>
        <el-table-column label="Técnico" min-width="130"><template #default="{ row }">{{ row.tech || '-' }}</template></el-table-column>
        <el-table-column label="Tipo" min-width="130"><template #default="{ row }">{{ kind(row.type) }}</template></el-table-column>
        <el-table-column label="Chamado" min-width="170">
          <template #default="{ row }">
            <template v-if="row.ticket">
              <a v-if="jira" :href="jira + row.ticket" target="_blank" rel="noopener">{{ row.ticket }}</a><span v-else>{{ row.ticket }}</span>
              <div v-if="row.note" class="nx-small nx-muted">{{ row.note }}</div>
            </template>
            <span v-else class="nx-muted">-</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" :image-size="72" description="Nenhuma conexão neste mês.">
        <p class="nx-empty-hint">Escolha outro mês ou cliente. As conexões vêm da auditoria do servidor.</p>
      </el-empty>
      <div v-if="rows.length > pageSize" class="nx-pager nx-noprint">
        <el-pagination v-model:current-page="page" :page-size="pageSize" layout="total, prev, pager, next" :total="rows.length" background/>
      </div>
    </div>

    <el-dialog v-model="settings.visible" title="Chamado na conexão" width="min(520px, 92vw)">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Ao clicar em Conectar">
          <el-radio-group v-model="settings.mode" class="nx-modes">
            <el-radio-button value="off">Não perguntar</el-radio-button>
            <el-radio-button value="optional">Perguntar (opcional)</el-radio-button>
            <el-radio-button value="required">Exigir</el-radio-button>
          </el-radio-group>
          <p class="nx-help">O técnico informa o número do chamado e ele aparece neste relatório. O app RustDesk não pergunta nada, só o botão Conectar do painel.</p>
        </el-form-item>
        <el-form-item label="Endereço base do Jira (opcional)">
          <el-input v-model="settings.jira" placeholder="https://suaempresa.atlassian.net/browse/"/>
          <p class="nx-help">Com ele, o número do chamado vira um link para o Jira.</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settings.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="settings.saving" @click="saveSettings">Salvar</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useMediaQuery } from '@vueuse/core'
  import { list as groupList } from '@/api/device_group'
  import { reportMonth, ticketSettings, ticketSettingsSave } from '@/nextec/api'
  import { downBlob } from '@/utils/file'

  const TZ = 'America/Sao_Paulo'
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isPrinting = ref(false)
  const now = new Date()
  const month = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const groupId = ref(null)
  const clients = ref([])
  const rows = ref([])
  const truncated = ref(false)
  const loading = ref(false)
  const jira = ref('')
  const page = ref(1)
  const pageSize = 25
  const pageRows = computed(() => rows.value.slice((page.value - 1) * pageSize, page.value * pageSize))

  const groupName = (id) => clients.value.find(g => g.id === id)?.name || ''
  const monthLabel = computed(() => {
    const [y, m] = month.value.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  })
  const when = (ts) => (ts ? new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }) : '-')
  const hm = (s) => `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
  const dur = (r) => (r.closed_at ? (r.seconds < 60 ? 'menos de 1 min' : hm(r.seconds).replace('h', 'h ') + 'min') : 'sem fim registrado')
  const kind = (t) => ({ 0: 'Controle remoto', 1: 'Transferência de arquivos', 2: 'Túnel de portas', 3: 'Câmera', 4: 'Terminal' })[t] || 'Conexão'

  const totalSeconds = computed(() => rows.value.reduce((a, r) => a + (r.seconds || 0), 0))
  const machines = computed(() => new Set(rows.value.map(r => r.peer_id)).size)
  const tickets = computed(() => new Set(rows.value.filter(r => r.ticket).map(r => r.ticket)).size)
  const withoutTicket = computed(() => rows.value.filter(r => !r.ticket).length)
  const summary = computed(() => {
    const m = new Map()
    rows.value.forEach(r => {
      const k = r.client || 'Sem cliente'
      const e = m.get(k) || { client: k, count: 0, seconds: 0, mset: new Set(), tset: new Set() }
      e.count++; e.seconds += r.seconds || 0; e.mset.add(r.peer_id); if (r.ticket) e.tset.add(r.ticket)
      m.set(k, e)
    })
    return [...m.values()].map(e => ({ client: e.client, count: e.count, seconds: e.seconds, machines: e.mset.size, tickets: e.tset.size }))
      .sort((a, b) => b.seconds - a.seconds || b.count - a.count)
  })

  const load = async () => {
    loading.value = true
    page.value = 1
    const res = await reportMonth(month.value, groupId.value).catch(() => false)
    loading.value = false
    if (res) { rows.value = res.data.list || []; truncated.value = !!res.data.truncated }
  }
  onMounted(async () => {
    const [g, t] = await Promise.all([groupList({ page: 1, page_size: 999 }).catch(() => false), ticketSettings().catch(() => false)])
    if (g) clients.value = (g.data.list || []).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    if (t) { settings.mode = t.data.mode; settings.jira = t.data.jira_base || ''; jira.value = t.data.jira_base || '' }
    load()
  })

  // ---------- exportar ----------
  const exportCsv = () => {
    const head = ['Cliente', 'Máquina', 'ID', 'Início', 'Fim', 'Duração (min)', 'Técnico', 'Tipo', 'Chamado', 'Observação']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.value.map(r => [r.client || 'Sem cliente', r.machine, r.peer_id, when(r.started_at), r.closed_at ? when(r.closed_at) : '',
      r.seconds ? Math.round(r.seconds / 60) : '', r.tech, kind(r.type), r.ticket, r.note].map(esc).join(';'))
    // BOM para o Excel abrir os acentos; ponto e vírgula é o separador padrão do Excel em português
    const csv = '\uFEFF' + [head.map(esc).join(';'), ...lines].join('\r\n')
    downBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `relatorio-acessos-${month.value}.csv`)
  }
  const afterPrint = () => { isPrinting.value = false }
  onMounted(() => window.addEventListener('afterprint', afterPrint))
  onBeforeUnmount(() => window.removeEventListener('afterprint', afterPrint))
  const print = () => { isPrinting.value = true; setTimeout(() => window.print(), 150) }

  // ---------- chamado na conexão ----------
  const settings = reactive({ visible: false, saving: false, mode: 'off', jira: '' })
  const saveSettings = async () => {
    settings.saving = true
    const res = await ticketSettingsSave({ mode: settings.mode, jira_base: settings.jira.trim() }).catch(() => false)
    settings.saving = false
    if (res) { jira.value = res.data.jira_base || ''; settings.visible = false; ElMessage.success('Ajuste salvo.') }
  }
</script>

<style scoped lang="scss">
  .nx-rep { width: 100%; }
  .nx-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 18px; margin-bottom: 16px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); }
  .nx-month { width: 160px; }
  .nx-client { width: 260px; max-width: 100%; }
  .nx-bar-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; .el-button + .el-button { margin-left: 0; } }
  .nx-print-head { display: none; h1 { font-size: 20px; margin: 0; } p { margin: 4px 0 12px; text-transform: capitalize; } }
  .nx-alert { margin-bottom: 16px; border-radius: 12px; }
  .nx-label { font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--nx-text-subtle); margin-bottom: 8px; }
  .nx-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
  .nx-stat { padding: 18px 22px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); }
  .nx-stat-value { font-family: var(--nx-font-body); font-variant-numeric: tabular-nums; font-size: 30px; font-weight: 700; line-height: 1.1; color: var(--nx-text); }
  .nx-stat-hint { font-size: 12px; color: var(--nx-text-muted); margin-top: 6px; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-card-head { padding: 16px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; max-width: 420px; }
  .nx-pager { padding: 12px 18px; border-top: 1px solid var(--nx-divider); display: flex; justify-content: flex-end; }
  .nx-cards { list-style: none; margin: 0; padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
  .nx-mcard { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 14px; background: var(--nx-bg); }
  .nx-mcard-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; strong { color: var(--nx-text); overflow-wrap: anywhere; } }
  .nx-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-modes { display: flex; flex-wrap: wrap; }
  .nx-form :deep(.el-select) { width: 100%; }
  a { color: var(--el-color-primary); font-weight: 600; }
  @media (max-width: 1000px) { .nx-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 768px) { .nx-bar-right { margin-left: 0; width: 100%; } .nx-month, .nx-client { width: 100%; } }
  @media (max-width: 480px) { .nx-stats { grid-template-columns: minmax(0, 1fr); } }
  @media print {
    .nx-print-head { display: block; }
    .nx-card, .nx-stat { box-shadow: none; border: 1px solid #ccc; break-inside: avoid; }
  }
</style>
