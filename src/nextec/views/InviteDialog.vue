<template>
  <el-dialog :model-value="modelValue" title="Convite de instalação" width="720px" align-center :close-on-click-modal="false"
             @update:model-value="$emit('update:modelValue', $event)" @opened="load">
    <el-alert v-if="loaded && !release" type="warning" show-icon :closable="false" class="nx-add-alert"
              title="Nenhuma versão está publicada para todos."
              description="O convite entrega o MSI publicado. Publique uma versão em Atualizações do app e volte aqui." />

    <p class="nx-add-lead">Um link por cliente: quem abrir baixa o instalador, instala como qualquer programa e a máquina já entra no cliente certo. Ou você cola o comando silencioso.</p>

    <el-form label-position="top" class="nx-add-grid" @submit.prevent>
      <el-form-item label="Apelido da máquina (opcional)">
        <el-input v-model="one.alias" maxlength="64" placeholder="ex.: Servidor" :disabled="busy" />
      </el-form-item>
      <el-form-item label="Descrição (opcional)">
        <el-input v-model="one.label" maxlength="120" placeholder="Se vazio, usa o apelido ou o nome do cliente" :disabled="busy" />
      </el-form-item>
    </el-form>
    <InviteOptions :model="one" :clients="clients" :disabled="busy" />
    <p v-if="error" class="nx-add-error" role="alert">{{ error }}</p>
    <el-button type="primary" :loading="busy" :disabled="!release || !one.client_id" @click="createOne">Criar convite</el-button>

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
      <div v-if="fresh.release" class="nx-add-out">
        <span class="nx-add-tag">Comando PowerShell silencioso (administrador)</span>
        <code class="nx-add-cmd">{{ cmdOf(fresh.code, fresh.release) }}</code>
        <div class="nx-add-actions"><el-button size="small" @click="copy(cmdOf(fresh.code, fresh.release), 'Comando copiado.')">Copiar comando</el-button></div>
      </div>
      <p v-else class="nx-small nx-muted">O comando silencioso não está disponível: a versão deste convite não foi encontrada.</p>
    </div>

    <!-- convites existentes -->
    <section v-if="rows.length" class="nx-add-existing">
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
            <el-button v-if="r.code && r.release" size="small" @click="copy(cmdOf(r.code, r.release), 'Comando copiado.')">Copiar comando</el-button>
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
  import { invitesList, inviteCreate, inviteRevoke } from '@/nextec/api'
  import { inviteLink, inviteCommand, inviteMessage } from '@/nextec/invite-command.mjs'
  import InviteOptions from '@/nextec/views/InviteOptions.vue'
  import { usePublicBase, publicBaseReady, loadPublicBase } from '@/nextec/public-base'

  const props = defineProps({ modelValue: Boolean, clients: { type: Array, default: () => [] } })
  const emit = defineEmits(['update:modelValue'])

  const busy = ref(false)
  const loaded = ref(false)
  const release = ref(null)
  const rows = ref([])
  const error = ref('')
  const fresh = ref(null)
  // padrão: um link por cliente para várias máquinas (a ideia é mandar um link só e cada instalação entrar no cliente certo)
  const base = () => ({ client_id: null, kind: 'server', auto_password: true, interval_minutes: 15, mode: 'client', max_uses: 10, hours: 24 })
  const one = reactive({ ...base(), alias: '', label: '' })
  let timer = null

  const origin = usePublicBase()
  const linkOf = (code) => inviteLink(origin.value, code)
  // o comando usa o MSI fixado no próprio convite (hash dele), nunca a versão que estiver publicada agora
  const cmdOf = (code, rel) => inviteCommand({ origin: origin.value, code, release: rel })
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
    if (open) { fresh.value = null; error.value = ''; load(); timer = setInterval(() => { if (!document.hidden) load() }, 15000) }
  })
  onBeforeUnmount(() => clearInterval(timer))

  const payload = (o) => ({ client_id: o.client_id, kind: o.kind, auto_password: o.auto_password, interval_minutes: o.auto_password ? o.interval_minutes : 0, mode: o.mode, max_uses: o.mode === 'client' ? o.max_uses : 1, hours: o.hours })

  const createOne = async () => {
    error.value = ''
    busy.value = true
    const res = await inviteCreate({ ...payload(one), label: one.label.trim(), alias: one.alias.trim() }).catch(() => false)
    busy.value = false
    if (res && res.code === 0 && res.data) {
      fresh.value = { code: res.data.code, label: res.data.invite.label, release: res.data.release || null }
      one.alias = ''; one.label = ''
      await load()
    } else {
      error.value = (res && res.message) || 'Não foi possível criar o convite.'
    }
  }
  const copy = async (text, msg) => {
    if (!publicBaseReady.value) { loadPublicBase(true); ElMessage.warning('Ainda carregando o endereço dos links. Tente copiar de novo em instantes.'); return }
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
  defineExpose({ close })
</script>

<style scoped lang="scss">
  .nx-add-alert { margin-bottom: 12px; }
  .nx-add-lead { margin: 0 0 12px; font-size: 13px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-add-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
  .nx-add-error { margin: 0 0 8px; padding: 10px 12px; border-radius: 10px; font-size: 13px; background: #FDECEA; color: #8C1D18; }
  html.dark .nx-add-error { background: rgba(255, 138, 128, 0.14); color: #FFB4AB; }
  .nx-add-fresh { display: grid; gap: 10px; margin-top: 14px; padding: 14px 16px; border-radius: 14px; background: var(--nx-tint, #E9DDFF); strong { color: var(--nx-text); } }
  .nx-add-out { display: grid; gap: 6px; code { display: block; padding: 8px 10px; border-radius: 10px; background: var(--nx-surface); font-size: 12.5px; overflow-wrap: anywhere; } }
  .nx-add-cmd { max-height: 110px; overflow: auto; }
  .nx-add-tag { font-size: 12px; font-weight: 700; color: var(--nx-text); }
  .nx-add-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-add-existing { margin-top: 18px; h3 { margin: 0 0 8px; font-size: 14px; color: var(--nx-text); } }
  .nx-add-invites { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 260px; overflow: auto; }
  .nx-add-invites li { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: var(--nx-field); }
  .nx-add-main { flex: 1 1 260px; min-width: 0; display: grid; gap: 2px; strong { color: var(--nx-text); overflow-wrap: anywhere; } }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-muted); }
  .nx-add-danger { color: #BA1A1A; }
  html.dark .nx-add-danger { color: #FF9C93; }
  @media (max-width: 640px) { .nx-add-grid { grid-template-columns: 1fr; } }
</style>
