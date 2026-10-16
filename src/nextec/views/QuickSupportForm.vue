<template>
  <form class="nx-qs" @submit.prevent="create">
    <template v-if="!fresh">
      <label for="nx-qs-label">Cliente ou chamado</label>
      <el-input id="nx-qs-label" ref="labelInput" v-model="form.label" maxlength="120" placeholder="ex.: Cartório Mariinha" :disabled="busy" />
      <label for="nx-qs-hours">Validade do link</label>
      <el-select id="nx-qs-hours" v-model="form.hours" :disabled="busy">
        <el-option :value="1" label="1 hora" />
        <el-option :value="2" label="2 horas" />
        <el-option :value="8" label="8 horas" />
        <el-option :value="24" label="24 horas" />
      </el-select>
      <p>O cliente abre o link, baixa o aplicativo de suporte (sem instalar) e a máquina aparece na fila já identificada.</p>
      <p v-if="error" class="nx-qs-error" role="alert">{{ error }}</p>
      <el-button type="primary" native-type="submit" :loading="busy" :disabled="!form.label.trim()">Gerar link</el-button>
    </template>
    <template v-else>
      <strong class="nx-qs-title">Link para {{ fresh.label }}</strong>
      <code class="nx-qs-link">{{ link }}</code>
      <div class="nx-qs-actions">
        <el-button type="primary" @click="copy(link, 'Link copiado.')">Copiar link</el-button>
        <el-button @click="copy(message, 'Mensagem copiada.')">Copiar mensagem</el-button>
      </div>
      <p>Vale até {{ until }}. Acompanhe em <router-link to="/user/support" @click="$emit('done')">Suporte avulso</router-link>.</p>
      <el-button text type="primary" @click="reset">Gerar outro</el-button>
    </template>
  </form>
</template>

<script setup>
  import { computed, nextTick, onMounted, reactive, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { supportLinkCreate } from '@/nextec/api'

  defineEmits(['done'])

  const form = reactive({ label: '', hours: 2 })
  const busy = ref(false)
  const error = ref('')
  const fresh = ref(null)
  const labelInput = ref()

  const link = computed(() => (fresh.value ? `${window.location.origin}/s/${fresh.value.token}` : ''))
  const message = computed(() => `Olá! Para o atendimento remoto, abra este link, baixe o aplicativo de suporte da Nextec e me avise quando ele estiver aberto: ${link.value}`)
  const until = computed(() => (fresh.value ? new Date(fresh.value.expires_at * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''))

  const create = async () => {
    error.value = ''
    busy.value = true
    const res = await supportLinkCreate({ label: form.label.trim(), ticket: '', hours: form.hours }).catch(() => false)
    busy.value = false
    if (res && res.code === 0 && res.data) {
      fresh.value = res.data
    } else {
      error.value = (res && res.message) || 'Não foi possível gerar o link. Tente de novo.'
    }
  }
  const reset = () => { fresh.value = null; form.label = ''; nextTick(() => labelInput.value?.focus()) }
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success(msg) } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
  onMounted(() => nextTick(() => labelInput.value?.focus()))
</script>

<style scoped lang="scss">
  .nx-qs { display: grid; gap: 8px; label { font-size: 13px; font-weight: 600; color: var(--nx-text); } p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); } }
  .nx-qs-title { color: var(--nx-text); font-size: 14px; }
  .nx-qs-link { display: block; padding: 8px 10px; border-radius: 10px; background: var(--nx-field); font-size: 12.5px; overflow-wrap: anywhere; }
  .nx-qs-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-qs-error { color: #8C1D18 !important; }
  html.dark .nx-qs-error { color: #FFB4AB !important; }
</style>
