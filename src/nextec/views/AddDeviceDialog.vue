<template>
  <el-dialog :model-value="modelValue" title="Adicionar" width="min(780px, 94vw)" align-center :close-on-click-modal="false" @update:model-value="$emit('update:modelValue', $event)" @opened="load">
    <el-tabs v-model="tab" class="nx-add-tabs">
      <el-tab-pane label="Convite de instalação" name="invite" />
      <el-tab-pane label="Em lote" name="batch" />
      <el-tab-pane label="Suporte rápido" name="support" />
      <el-tab-pane label="Pelo ID" name="manual" />
    </el-tabs>

    <el-alert v-if="loaded && !release && (tab === 'invite' || tab === 'batch')" type="warning" show-icon :closable="false" class="nx-add-alert"
              title="Nenhuma versão está publicada para todos."
              description="O convite entrega o MSI publicado. Publique uma versão em Atualizações do app e volte aqui." />

    <!-- convite individual -->
    <section v-show="tab === 'invite'" class="nx-add-pane">
      <p class="nx-add-lead">O cliente baixa o instalador, instala como qualquer programa e a máquina já entra no cliente certo. Ou você cola o comando silencioso.</p>
      <div class="nx-add-grid">
        <el-form-item label="Apelido da máquina (opcional)">
          <el-input v-model="one.alias" maxlength="64" placeholder="ex.: Servidor" :disabled="busy" />
        </el-form-item>
        <el-form-item label="Descrição (quem vai instalar)" required>
          <el-input v-model="one.label" maxlength="120" placeholder="ex.: Cartório Mariinha, servidor" :disabled="busy" />
        </el-form-item>
      </div>
      <InviteOptions :model="one" :clients="clients" :disabled="busy" />
      <p v-if="error" class="nx-add-error" role="alert">{{ error }}</p>
      <el-button type="primary" :loading="busy" :disabled="!release || !one.client_id || !one.label.trim()" @click="createOne">Criar convite</el-button>

      <div v-if="fresh" class="nx-add-fresh" role="status">
        <strong>Convite criado para {{ fresh.label }}</strong>
        <div class="nx-add-out">
          <span class="nx-add-tag">Link para o cliente</span>
          <code>{{ linkOf(fresh.code) }}</code>
          <div class="nx-add-actions">
            <el-button size="small" type="primary" @click="copy(linkOf(fresh.code), 'Link copiado.')">Copiar link</el-button>
            <el-button size="small" @click="copy(msgOf(fresh), 'Mensagem copiada.')">Copiar mensagem</el-button>
          </div>
        </div>
        <div class="nx-add-out">
          <span class="nx-add-tag">Comando PowerShell silencioso (administrador)</span>
          <code class="nx-add-cmd">{{ cmdOf(fresh.code) }}</code>
          <div class="nx-add-actions"><el-button size="small" @click="copy(cmdOf(fresh.code), 'Comando copiado.')">Copiar comando</el-button></div>
        </div>
      </div>
    </section>

    <!-- lote -->
    <section v-show="tab === 'batch'" class="nx-add-pane">
      <p class="nx-add-lead">Uma linha por máquina: <code>apelido; descrição</code> (a descrição é opcional). Cada linha vira um convite de uso único.</p>
      <el-input v-model="batchText" type="textarea" :rows="6" :disabled="busy" placeholder="PC-01; Mesa 1&#10;PC-02; Mesa 2&#10;Servidor; Servidor principal" aria-label="Linhas do lote" />
      <InviteOptions :model="many" :clients="clients" :disabled="busy" batch />
      <p v-if="batchError" class="nx-add-error" role="alert">{{ batchError }}</p>
      <el-button type="primary" :loading="busy" :disabled="!release || !many.client_id || !batchText.trim()" @click="createBatch">Criar convites</el-button>

      <div v-if="batchOut.length" class="nx-add-fresh" role="status">
        <strong>{{ batchOut.length }} convites criados</strong>
        <div class="nx-add-actions">
          <el-button size="small" type="primary" @click="downloadCsv">Baixar CSV (links e comandos)</el-button>
          <el-button size="small" @click="copy(batchOut.map(r => (r.alias || r.label) + '\t' + linkOf(r.code)).join('\n'), 'Links copiados.')">Copiar links</el-button>
        </div>
        <ul class="nx-add-list">
          <li v-for="r in batchOut" :key="r.code"><span>{{ r.alias || r.label }}</span><code>{{ linkOf(r.code) }}</code></li>
        </ul>
      </div>
    </section>

    <!-- suporte rápido -->
    <section v-if="tab === 'support'" class="nx-add-pane nx-add-narrow">
      <p class="nx-add-lead">Para atendimento pontual, sem instalar nada: o cliente baixa o aplicativo de suporte e a máquina aparece na fila.</p>
      <QuickSupportForm @done="close" />
    </section>

    <!-- manual -->
    <section v-show="tab === 'manual'" class="nx-add-pane">
      <p class="nx-add-lead">Já tem o ID do dispositivo? Cadastre à mão, com apelido, cliente e notas.</p>
      <el-button type="primary" @click="manual">Cadastrar pelo ID</el-button>
    </section>

    <!-- convites existentes -->
    <section v-if="(tab === 'invite' || tab === 'batch') && rows.length" class="nx-add-existing">
      <h3>Convites</h3>
      <ul class="nx-add-invites">
        <li v-for="r in rows" :key="r.id">
          <div class="nx-add-main">
            <strong>{{ r.alias || r.label }}</strong>
            <span class="nx-small nx-muted">{{ r.client_name }} · {{ r.kind === 'server' ? 'servidor' : 'estação' }} · {{ r.rule === 'peer' ? 'senha automática' : 'sem senha automática' }} · usos {{ r.uses }}/{{ r.max_uses }} · vale até {{ fmt(r.expires_at) }}</span>
          </div>
          <el-tag size="small" :type="tone(r.status)" disable-transitions>{{ statusLabel(r.status) }}</el-tag>
          <div class="nx-add-actions">
            <el-button v-if="r.code" size="small" @click="copy(linkOf(r.code), 'Link copiado.')">Copiar link</el-button>
            <el-button v-if="r.code && release" size="small" @click="copy(cmdOf(r.code), 'Comando copiado.')">Copiar comando</el-button>
            <el-button v-if="r.status === 'active'" size="small" @click="revoke(r)"><span class="nx-add-danger">Cancelar</span></el-button>
          </div>
        </li>
      </ul>
    </section>
  </el-dialog>
</template>

<script setup>
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { invitesList, inviteCreate, inviteBatch, inviteRevoke } from '@/nextec/api'
  import { inviteLink, inviteCommand, inviteMessage, inviteBatchCsv, parseBatchLines } from '@/nextec/invite-command.mjs'
  import InviteOptions from '@/nextec/views/InviteOptions.vue'
  import QuickSupportForm from '@/nextec/views/QuickSupportForm.vue'

  const props = defineProps({ modelValue: Boolean, clients: { type: Array, default: () => [] } })
  const emit = defineEmits(['update:modelValue', 'manual'])

  const tab = ref('invite')
  const busy = ref(false)
  const loaded = ref(false)
  const release = ref(null)
  const rows = ref([])
  const error = ref('')
  const batchError = ref('')
  const fresh = ref(null)
  const batchOut = ref([])
  const batchText = ref('')
  const base = () => ({ client_id: null, kind: 'server', auto_password: true, interval_minutes: 15, mode: 'single', max_uses: 10, hours: 24 })
  const one = reactive({ ...base(), alias: '', label: '' })
  const many = reactive(base())
  let timer = null

  const origin = computed(() => window.location.origin)
  const linkOf = (code) => inviteLink(origin.value, code)
  const cmdOf = (code) => inviteCommand({ origin: origin.value, code, release: release.value })
  const msgOf = (f) => inviteMessage({ origin: origin.value, code: f.code, label: f.label })
  const fmt = (ts) => new Date(ts * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const statusLabel = (s) => ({ active: 'Ativo', used: 'Usado', expired: 'Vencido', revoked: 'Cancelado' }[s] || s)
  const tone = (s) => ({ active: 'success', used: 'info', expired: 'info', revoked: 'info' }[s] || 'info')

  const load = async () => {
    const res = await invitesList().catch(() => false)
    if (res && res.data) { rows.value = res.data.list || []; release.value = res.data.release || null }
    loaded.value = true
  }
  watch(() => props.modelValue, (open) => {
    clearInterval(timer)
    if (open) { tab.value = 'invite'; fresh.value = null; batchOut.value = []; load(); timer = setInterval(() => { if (!document.hidden) load() }, 15000) }
  })
  onBeforeUnmount(() => clearInterval(timer))

  const payload = (o) => ({ client_id: o.client_id, kind: o.kind, auto_password: o.auto_password, interval_minutes: o.auto_password ? o.interval_minutes : 0, mode: o.mode, max_uses: o.mode === 'client' ? o.max_uses : 1, hours: o.hours })

  const createOne = async () => {
    error.value = ''
    busy.value = true
    const res = await inviteCreate({ ...payload(one), label: one.label.trim(), alias: one.alias.trim() }).catch(() => false)
    busy.value = false
    if (res && res.code === 0 && res.data) {
      release.value = res.data.release || release.value
      fresh.value = { code: res.data.code, label: res.data.invite.label }
      one.alias = ''; one.label = ''
      await load()
    } else {
      error.value = (res && res.message) || 'Não foi possível criar o convite.'
    }
  }
  const createBatch = async () => {
    batchError.value = ''
    let items
    try { items = parseBatchLines(batchText.value) } catch (e) { batchError.value = e.message; return }
    if (!items.length) { batchError.value = 'Escreva ao menos uma linha.'; return }
    busy.value = true
    const res = await inviteBatch({ ...payload(many), items }).catch(() => false)
    busy.value = false
    if (res && res.code === 0 && res.data) {
      release.value = res.data.release || release.value
      batchOut.value = (res.data.list || []).map(x => ({ code: x.code, alias: x.invite.alias, label: x.invite.label }))
      batchText.value = ''
      await load()
    } else {
      batchError.value = (res && res.message) || 'Não foi possível criar o lote.'
    }
  }
  const downloadCsv = () => {
    const csv = inviteBatchCsv({ origin: origin.value, release: release.value, rows: batchOut.value })
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'convites-nextec.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success(msg) } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
  const revoke = async (r) => {
    const ok = await ElMessageBox.confirm(`Cancelar o convite de ${r.alias || r.label}? O link e o comando deixam de funcionar.`, 'Cancelar convite',
      { confirmButtonText: 'Cancelar convite', cancelButtonText: 'Voltar', type: 'warning' }).catch(() => false)
    if (!ok) return
    const res = await inviteRevoke(r.id).catch(() => false)
    if (res) await load()
  }
  const close = () => emit('update:modelValue', false)
  const manual = () => { close(); emit('manual') }
</script>

<style scoped lang="scss">
  .nx-add-tabs { margin-top: -8px; }
  .nx-add-alert { margin-bottom: 12px; }
  .nx-add-pane { display: grid; gap: 4px; }
  .nx-add-narrow { max-width: 420px; }
  .nx-add-lead { margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-add-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
  .nx-add-error { margin: 0 0 8px; padding: 10px 12px; border-radius: 10px; font-size: 13px; background: #FDECEA; color: #8C1D18; }
  html.dark .nx-add-error { background: rgba(255, 138, 128, 0.14); color: #FFB4AB; }
  .nx-add-fresh { display: grid; gap: 10px; margin-top: 14px; padding: 14px 16px; border-radius: 14px; background: var(--nx-tint, #E9DDFF); strong { color: var(--nx-text); } }
  .nx-add-out { display: grid; gap: 6px; code { display: block; padding: 8px 10px; border-radius: 10px; background: var(--nx-surface); font-size: 12.5px; overflow-wrap: anywhere; } }
  .nx-add-cmd { max-height: 110px; overflow: auto; }
  .nx-add-tag { font-size: 12px; font-weight: 700; color: var(--nx-text); }
  .nx-add-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-add-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 180px; overflow: auto; li { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: center; font-size: 13px; } code { font-size: 12px; overflow-wrap: anywhere; } }
  .nx-add-existing { margin-top: 18px; h3 { margin: 0 0 8px; font-size: 14px; color: var(--nx-text); } }
  .nx-add-invites { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 260px; overflow: auto; }
  .nx-add-invites li { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: var(--nx-field); }
  .nx-add-main { flex: 1 1 260px; min-width: 0; display: grid; gap: 2px; strong { color: var(--nx-text); overflow-wrap: anywhere; } }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-muted); }
  .nx-add-danger { color: #BA1A1A; }
  html.dark .nx-add-danger { color: #FF9C93; }
  @media (max-width: 640px) { .nx-add-grid { grid-template-columns: 1fr; } .nx-add-list li { grid-template-columns: 1fr; } }
</style>
