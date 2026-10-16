<template>
  <section class="nx-sl" aria-labelledby="nx-sl-title">
    <div class="nx-card-head">
      <div>
        <h2 id="nx-sl-title" class="nx-h2">Link por atendimento</h2>
        <p class="nx-sub">Um link para cada cliente ou chamado. Quando a pessoa abrir o app, a máquina aparece aqui já identificada.</p>
      </div>
    </div>

    <p v-if="loaded && !hasApp" class="nx-warn" role="status">
      O aplicativo de suporte ainda não foi publicado, então não é possível criar links. Peça a um administrador para publicá-lo.
    </p>

    <form v-else class="nx-sl-form" @submit.prevent="create">
      <el-input v-model="form.label" class="nx-sl-label" maxlength="120" placeholder="Cliente ou chamado (ex.: Cartório Mariinha)"
                aria-label="Cliente ou chamado" :disabled="creating" />
      <el-input v-model="form.ticket" class="nx-sl-ticket" maxlength="40" placeholder="Nº do chamado (opcional)"
                aria-label="Número do chamado" :disabled="creating" />
      <el-select v-model="form.hours" class="nx-sl-hours" aria-label="Validade do link" :disabled="creating">
        <el-option :value="1" label="Vale 1 hora" />
        <el-option :value="2" label="Vale 2 horas" />
        <el-option :value="8" label="Vale 8 horas" />
        <el-option :value="24" label="Vale 24 horas" />
      </el-select>
      <el-button type="primary" native-type="submit" :loading="creating" :disabled="!form.label.trim()">Criar link</el-button>
    </form>
    <p v-if="error" class="nx-error" role="alert">{{ error }}</p>

    <div v-if="fresh" class="nx-sl-fresh" role="status">
      <div class="nx-sl-fresh-text">
        <strong>Link criado para {{ fresh.label }}</strong>
        <code>{{ linkOf(fresh) }}</code>
      </div>
      <div class="nx-sl-actions">
        <el-button @click="copy(linkOf(fresh), 'Link copiado.')">Copiar link</el-button>
        <el-button type="primary" @click="copy(messageOf(fresh), 'Mensagem copiada.')">Copiar mensagem</el-button>
      </div>
    </div>

    <el-skeleton v-if="!loaded" class="nx-pad" animated :rows="2" />
    <el-empty v-else-if="!rows.length" :image-size="48" description="Nenhum link criado ainda." />
    <ul v-else class="nx-sl-list" aria-live="polite">
      <li v-for="row in rows" :key="row.id">
        <div class="nx-sl-main">
          <strong>{{ row.label }}</strong>
          <span class="nx-small nx-muted">{{ meta(row) }}</span>
        </div>
        <el-tag :type="tone(row.status)" size="small" disable-transitions>{{ statusLabel(row) }}</el-tag>
        <div class="nx-sl-actions">
          <el-button v-if="row.status === 'connected' && row.peer_id" size="small" type="primary" @click="connectDevice(row.peer_id)">Conectar</el-button>
          <el-button v-if="canCopy(row)" size="small" @click="copy(linkOf(row), 'Link copiado.')">Copiar link</el-button>
          <el-button v-if="canRevoke(row)" size="small" @click="revoke(row)"><span class="nx-danger-text">Cancelar</span></el-button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { supportLinks, supportLinkCreate, supportLinkRevoke } from '@/nextec/api'
  import { connectDevice } from '@/nextec/connect'
  import { fmtId } from '@/nextec/id'

  const rows = ref([])
  const loaded = ref(false)
  const hasApp = ref(true)
  const creating = ref(false)
  const error = ref('')
  const fresh = ref(null)
  const form = reactive({ label: '', ticket: '', hours: 2 })
  let timer = null

  const origin = computed(() => window.location.origin)
  const linkOf = (row) => `${origin.value}/s/${row.token}`
  const messageOf = (row) => `Olá! Para o atendimento remoto${row.ticket ? ' (chamado ' + row.ticket + ')' : ''}, abra este link, baixe o aplicativo de suporte da Nextec e me avise quando ele estiver aberto: ${linkOf(row)}`
  const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')

  const statusLabel = (row) => ({
    waiting: 'Aguardando o cliente abrir o link',
    downloaded: 'Baixado, aguardando abrir o app',
    connected: row.online ? (row.matched_by === 'time' ? 'Na fila (provável)' : 'Na fila agora') : 'App aberto, fora da fila',
    expired: 'Vencido',
    revoked: 'Cancelado',
  }[row.status] || row.status)
  const tone = (s) => ({ connected: 'success', downloaded: 'warning', waiting: 'info', expired: 'info', revoked: 'info' }[s] || 'info')
  const meta = (row) => [row.ticket ? 'Chamado ' + row.ticket : '', row.peer_id ? fmtId(row.peer_id) + (row.peer_name ? ' · ' + row.peer_name : '') : '',
    'criado ' + fmt(row.created_at), row.status === 'waiting' || row.status === 'downloaded' ? 'vale até ' + fmt(row.expires_at) : ''].filter(Boolean).join(' · ')
  const canCopy = (row) => row.status === 'waiting' || row.status === 'downloaded'
  const canRevoke = (row) => row.status === 'waiting' || row.status === 'downloaded'

  const load = async () => {
    const res = await supportLinks().catch(() => false)
    if (res && res.data) {
      rows.value = res.data.list || []
      hasApp.value = res.data.has_app !== false
    }
    loaded.value = true
  }
  const create = async () => {
    error.value = ''
    creating.value = true
    const res = await supportLinkCreate({ label: form.label.trim(), ticket: form.ticket.trim(), hours: form.hours }).catch(() => false)
    creating.value = false
    if (res && res.code === 0 && res.data) {
      fresh.value = res.data
      form.label = ''
      form.ticket = ''
      await load()
    } else if (res && res.message) {
      error.value = res.message
    }
  }
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success(msg) } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
  const revoke = async (row) => {
    const c = await ElMessageBox.confirm(`Cancelar o link de ${row.label}? Quem abrir depois verá que o link venceu.`, 'Cancelar link',
      { confirmButtonText: 'Cancelar link', cancelButtonText: 'Voltar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await supportLinkRevoke(row.id).catch(() => false)
    if (res) { if (fresh.value && fresh.value.id === row.id) fresh.value = null; await load() }
  }

  const tick = () => { if (!document.hidden) load() }
  onMounted(() => { load(); timer = setInterval(tick, 10000) })
  onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped lang="scss">
  .nx-sl { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-card-head { padding: 16px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-sub { margin: 2px 0 0; font-size: 12px; color: var(--nx-text-muted); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-muted); }
  .nx-pad { padding: 18px 22px; }
  .nx-warn { margin: 0; padding: 16px 22px; font-size: 13px; line-height: 1.5; color: #8A5300; }
  html.dark .nx-warn { color: #FCD38A; }
  .nx-sl-form { display: flex; gap: 10px; flex-wrap: wrap; padding: 16px 22px; }
  .nx-sl-label { flex: 2 1 260px; min-width: 0; }
  .nx-sl-ticket { flex: 1 1 170px; min-width: 0; }
  .nx-sl-hours { flex: 0 0 150px; }
  .nx-error { margin: 0 22px 12px; padding: 10px 12px; border-radius: 10px; font-size: 13px; background: #FDECEA; color: #8C1D18; }
  html.dark .nx-error { background: rgba(255, 138, 128, 0.14); color: #FFB4AB; }
  .nx-sl-fresh { display: flex; justify-content: space-between; align-items: center; gap: 12px 16px; flex-wrap: wrap; margin: 0 22px 14px; padding: 14px 16px; border-radius: 14px; background: var(--nx-tint, #E9DDFF); }
  .nx-sl-fresh-text { min-width: 0; display: grid; gap: 4px; strong { color: var(--nx-text); } code { overflow-wrap: anywhere; font-size: 13px; } }
  .nx-sl-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-sl-list { list-style: none; margin: 0; padding: 0 22px 14px; display: grid; gap: 8px; }
  .nx-sl-list li { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: var(--nx-field); }
  .nx-sl-main { flex: 1 1 220px; min-width: 0; display: grid; gap: 2px; strong { color: var(--nx-text); overflow-wrap: anywhere; } }
  .nx-danger-text { color: #BA1A1A; }
  html.dark .nx-danger-text { color: #FF9C93; }
  @media (max-width: 560px) { .nx-sl-hours { flex: 1 1 100%; } }
</style>
