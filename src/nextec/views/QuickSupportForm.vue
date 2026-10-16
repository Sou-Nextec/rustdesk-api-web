<template>
  <form class="nx-qs" @submit.prevent="create">
    <div class="nx-qs-id" role="status" aria-live="polite">
      <span class="nx-qs-id-label">Código do atendimento</span>
      <strong class="nx-qs-id-value">{{ fresh ? fresh.id : sessionId }}</strong>
      <el-button v-if="!fresh" text type="primary" size="small" :disabled="busy" @click="newId">Gerar outro código</el-button>
    </div>

    <template v-if="!fresh">
      <p class="nx-qs-lead">O cliente abre o link, baixa o aplicativo de suporte e a máquina aparece na fila identificada por este código.</p>

      <el-button v-if="!more" text type="primary" size="small" class="nx-qs-more" @click="more = true">Opções (chamado e validade)</el-button>
      <div v-else class="nx-qs-opts">
        <label for="nx-qs-label">Chamado ou cliente (opcional)</label>
        <el-input id="nx-qs-label" v-model="form.label" maxlength="90" placeholder="ex.: chamado 1234" :disabled="busy" />
        <label for="nx-qs-hours">Validade do link</label>
        <el-select id="nx-qs-hours" v-model="form.hours" :disabled="busy">
          <el-option :value="1" label="1 hora" />
          <el-option :value="2" label="2 horas" />
          <el-option :value="8" label="8 horas" />
          <el-option :value="24" label="24 horas" />
        </el-select>
      </div>

      <p v-if="error" class="nx-qs-error" role="alert">{{ error }}</p>
      <el-button type="primary" native-type="submit" :loading="busy">Gerar link</el-button>
    </template>

    <template v-else>
      <p class="nx-qs-copied" role="status">
        <el-icon><el-icon-Check/></el-icon>
        <span>{{ copied ? 'Link copiado para a área de transferência.' : 'Link gerado. Não consegui copiar sozinho: use Copiar link.' }}</span>
      </p>
      <code class="nx-qs-link">{{ link }}</code>
      <div class="nx-qs-actions">
        <el-button :type="copied ? 'default' : 'primary'" @click="copy(link, 'Link copiado.')">Copiar link</el-button>
        <el-button @click="copy(message, 'Mensagem copiada.')">Copiar mensagem</el-button>
      </div>
      <p>Vale até {{ until }}. Acompanhe em <router-link :to="supportPath" @click="$emit('done')">Suporte avulso</router-link>.</p>
      <el-button text type="primary" @click="reset">Gerar outro link</el-button>
    </template>
  </form>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { supportLinkCreate } from '@/nextec/api'
  import { useUserStore } from '@/store/user'
  import { usePublicBase, publicBaseReady, loadPublicBase } from '@/nextec/public-base'
  import { supportLinkUrl } from '@/nextec/public-links.mjs'
  import { randomSessionId, sessionLabel } from '@/nextec/quick-id.mjs'

  defineEmits(['done'])

  const form = reactive({ label: '', hours: 2 })
  const sessionId = ref(randomSessionId())
  const busy = ref(false)
  const error = ref('')
  const fresh = ref(null)
  const more = ref(false)
  const copied = ref(false)

  // administrador acompanha em Dispositivos > Suporte avulso; usuário comum, em Minha área (rota própria)
  const supportPath = computed(() => ((useUserStore().route_names || []).includes('*') ? '/user/support' : '/my/support'))
  const base = usePublicBase()
  const link = computed(() => (fresh.value ? supportLinkUrl(base.value, fresh.value.token) : ''))
  const message = computed(() => `Olá! Para o atendimento remoto (código ${fresh.value ? fresh.value.id : ''}), abra este link, baixe o aplicativo de suporte da Nextec e me avise quando ele estiver aberto: ${link.value}`)
  const until = computed(() => (fresh.value ? new Date(fresh.value.expires_at * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''))

  const newId = () => { sessionId.value = randomSessionId() }

  // Copia sem avisar quando o endereço dos links ainda não carregou (o link sairia no domínio errado).
  const writeClipboard = async (text) => {
    if (!publicBaseReady.value) return false
    try { await navigator.clipboard.writeText(text); return true } catch (e) { return false }
  }

  const create = async () => {
    error.value = ''
    busy.value = true
    await loadPublicBase()
    const id = sessionId.value
    const res = await supportLinkCreate({ label: sessionLabel(form.label, id), ticket: '', hours: form.hours }).catch(() => false)
    busy.value = false
    if (res && res.code === 0 && res.data) {
      fresh.value = { ...res.data, id }
      // já deixa o link na área de transferência: quem atende só precisa colar na conversa
      copied.value = await writeClipboard(supportLinkUrl(base.value, res.data.token))
      if (copied.value) ElMessage.success('Link copiado.')
    } else {
      error.value = (res && res.message) || 'Não foi possível gerar o link. Tente de novo.'
    }
  }
  const reset = () => { fresh.value = null; copied.value = false; form.label = ''; more.value = false; newId() }
  const copy = async (text, msg) => {
    if (!publicBaseReady.value) { loadPublicBase(true); ElMessage.warning('Ainda carregando o endereço dos links. Tente copiar de novo em instantes.'); return }
    try { await navigator.clipboard.writeText(text); copied.value = true; ElMessage.success(msg) } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
</script>

<style scoped lang="scss">
  .nx-qs { display: grid; gap: 10px; label { font-size: 13px; font-weight: 600; color: var(--nx-text); } p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--nx-text-muted); } }
  .nx-qs-id { display: grid; gap: 2px; justify-items: start; padding: 14px 16px; border-radius: 14px; background: var(--nx-tint, #E9DDFF); }
  .nx-qs-id-label { font-size: 12px; font-weight: 600; color: var(--nx-text-muted); }
  .nx-qs-id-value { font-size: 34px; letter-spacing: 0.1em; font-variant-numeric: tabular-nums; color: var(--nx-text); line-height: 1.2; }
  .nx-qs-more { justify-self: start; margin: 0 !important; padding: 0; }
  .nx-qs-opts { display: grid; gap: 8px; }
  .nx-qs-copied { display: flex; align-items: center; gap: 6px; color: var(--nx-text) !important; font-weight: 600; }
  .nx-qs-error { padding: 10px 12px; border-radius: 10px; background: #FDECEA; color: #8C1D18 !important; }
  html.dark .nx-qs-error { background: rgba(255, 138, 128, 0.14); color: #FFB4AB !important; }
  .nx-qs-link { display: block; padding: 10px 12px; border-radius: 10px; background: var(--nx-field); font-size: 13px; overflow-wrap: anywhere; }
  .nx-qs-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
</style>
