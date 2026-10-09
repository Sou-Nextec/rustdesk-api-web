<template>
  <section class="nx-sup" aria-label="Suporte avulso">
    <WaitingList ref="waiting"/>

    <div class="nx-card">
      <div class="nx-card-head">
        <h2 class="nx-h2">Aplicativo de suporte</h2>
        <div class="nx-actions">
          <el-button v-if="app" @click="openPage">Ver a página do cliente</el-button>
          <el-button type="primary" @click="openUpload"><el-icon><el-icon-Upload/></el-icon><span>{{ app ? 'Trocar o aplicativo' : 'Enviar o aplicativo' }}</span></el-button>
        </div>
      </div>

      <div v-if="loading && !loaded" class="nx-pad"><el-skeleton animated :rows="2"/></div>
      <div v-else-if="app" class="nx-app">
        <span class="nx-dot is-on" aria-hidden="true"></span>
        <div>
          <strong>Publicado: Suporte-Nextec.exe</strong>
          <div class="nx-small nx-muted">{{ size(app.size) }} · enviado em {{ fmt(app.uploaded_at) }}{{ app.uploaded_by ? ' por ' + app.uploaded_by : '' }}</div>
          <div class="nx-small nx-muted nx-mono" :title="app.sha256">SHA-256 {{ app.sha256.slice(0, 16) }}</div>
        </div>
        <el-button class="nx-remove" @click="remove"><span class="nx-danger-text">Tirar do ar</span></el-button>
      </div>
      <el-empty v-else :image-size="64" description="Nenhum aplicativo de suporte publicado.">
        <p class="nx-empty-hint">Gere o aplicativo no rdgen (passo a passo abaixo) e envie aqui. A página do cliente só funciona depois disso.</p>
      </el-empty>
    </div>

    <div class="nx-card">
      <div class="nx-card-head"><h2 class="nx-h2">Quem vê a fila Aguardando atendimento</h2></div>
      <div class="nx-who">
        <el-radio-group v-model="waitingMode" :disabled="savingMode" aria-label="Quem vê a fila" @change="saveMode">
          <el-radio-button value="off">Ninguém (desligada)</el-radio-button>
          <el-radio-button value="admins">Só administradores</el-radio-button>
          <el-radio-button value="all">Todos os usuários</el-radio-button>
        </el-radio-group>
        <p class="nx-help nx-help-in">A fila mostra máquinas novas que acabaram de abrir o app de suporte. A regra vale no servidor, não só na tela. A conexão sempre depende de a pessoa aceitar no app.</p>
      </div>
    </div>

    <div class="nx-card">
      <div class="nx-card-head"><h2 class="nx-h2">Como gerar o aplicativo no rdgen</h2></div>
      <ol class="nx-steps">
        <li>No rdgen, gere um cliente <strong>Windows (.exe)</strong> com o servidor e a chave da Nextec.</li>
        <li>Escolha a opção que <strong>não instala</strong> (portátil) e deixe a senha em branco: a conexão é liberada pela pessoa clicando em <strong>Aceitar</strong>.</li>
        <li>Se o rdgen oferecer, deixe o modo de aprovação em <strong>clique</strong> e desligue o início junto com o Windows.</li>
        <li>Baixe o <code>.exe</code> gerado e envie aqui. O cliente recebe com o nome Suporte-Nextec.exe.</li>
      </ol>
      <p class="nx-help">O Windows pode mostrar um aviso azul porque o aplicativo ainda não é assinado digitalmente. A página do cliente já explica como continuar.</p>
    </div>

    <el-dialog v-model="up.visible" title="Enviar aplicativo de suporte" width="min(520px, 92vw)" :close-on-click-modal="false" :before-close="beforeClose">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Aplicativo (.exe gerado pelo rdgen)" required class="is-required">
          <input type="file" accept=".exe" class="nx-file" :disabled="up.busy" @change="onFile">
          <p v-if="up.file" class="nx-help">{{ up.file.name }} · {{ size(up.file.size) }}</p>
        </el-form-item>
        <el-progress v-if="up.busy" :percentage="up.progress" :stroke-width="10" aria-label="Progresso do envio"/>
        <p v-if="up.error" class="nx-error" role="alert">{{ up.error }}</p>
      </el-form>
      <template #footer>
        <el-button :disabled="up.busy" @click="up.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="up.busy" :disabled="!up.file" @click="send">Enviar</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import WaitingList from '@/nextec/views/WaitingList.vue'
  import { supportInfo, supportDelete, supportSettings } from '@/nextec/api'
  import { uploadFile } from '@/nextec/upload'

  const waiting = ref(null)
  const waitingMode = ref('admins')
  const savingMode = ref(false)
  const app = ref(null)
  const maxSize = ref(300 * 1024 * 1024)
  const loading = ref(false)
  const loaded = ref(false)
  const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleString('pt-BR') : '-')
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

  const load = async () => {
    loading.value = true
    const res = await supportInfo().catch(() => false)
    loading.value = false
    loaded.value = true
    if (res) { app.value = res.data.app || null; maxSize.value = res.data.max_size || maxSize.value; waitingMode.value = res.data.waiting_mode || 'admins' }
    if (waiting.value) waiting.value.refresh()
  }
  onMounted(load)

  const saveMode = async (v) => {
    savingMode.value = true
    const res = await supportSettings(v).catch(() => false)
    savingMode.value = false
    if (res) { ElMessage.success('Ajuste salvo.'); if (waiting.value) waiting.value.refresh() } else { load() }
  }

  const openPage = () => window.open('/suporte', '_blank', 'noopener')

  const up = reactive({ visible: false, busy: false, progress: 0, file: null, error: '' })
  const openUpload = () => Object.assign(up, { visible: true, busy: false, progress: 0, file: null, error: '' })
  const beforeClose = (done) => { if (!up.busy) done() }
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]
    up.error = ''
    if (!f) { up.file = null; return }
    if (!/\.exe$/i.test(f.name)) { up.file = null; up.error = 'Escolha o aplicativo .exe gerado pelo rdgen.'; return }
    if (f.size > maxSize.value) { up.file = null; up.error = `O arquivo passa do limite de ${size(maxSize.value)}.`; return }
    up.file = f
  }
  const send = async () => {
    up.busy = true; up.progress = 0; up.error = ''
    const r = await uploadFile('/nextec/support/upload', {}, up.file, (p) => { up.progress = p })
    up.busy = false
    if (r.ok) { up.visible = false; ElMessage.success('Aplicativo publicado. O link de suporte já funciona.'); load() } else { up.error = r.message }
  }
  const remove = async () => {
    const c = await ElMessageBox.confirm('Tirar o aplicativo do ar? O link de suporte deixa de funcionar até você enviar outro.', 'Tirar do ar',
      { confirmButtonText: 'Tirar do ar', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await supportDelete().catch(() => false)
    if (res) { ElMessage.success('Aplicativo removido.'); load() }
  }
</script>

<style scoped lang="scss">
  .nx-sup { max-width: 1000px; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-pad { padding: 18px 22px; }
  .nx-app { display: flex; align-items: center; gap: 14px; padding: 18px 22px; strong { color: var(--nx-text); } .nx-remove { margin-left: auto; } }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-muted); }
  .nx-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; max-width: 420px; }
  .nx-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; } }
  html.dark .nx-dot.is-on { background: #4CC38A; box-shadow: 0 0 0 3px rgba(76, 195, 138, 0.22); }
  .nx-danger-text { color: #BA1A1A; }
  html.dark .nx-danger-text { color: #FF9C93; }
  .nx-steps { margin: 0; padding: 16px 22px 4px 44px; font-size: 14px; line-height: 1.6; color: var(--nx-text); li { margin-bottom: 8px; } code { font-size: 12px; } }
  .nx-who { padding: 16px 22px 6px; }
  .nx-help-in { padding: 10px 0 12px !important; }
  .nx-help { margin: 0; padding: 0 22px 18px; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-form .nx-help { padding: 0; margin: 6px 0 0; }
  .nx-file { width: 100%; font: inherit; font-size: 13px; color: var(--nx-text); }
  .nx-error { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; background: #FDECEA; color: #8C1D18; }
  html.dark .nx-error { background: rgba(255, 138, 128, 0.14); color: #FFB4AB; }
  @media (max-width: 560px) { .nx-app { flex-wrap: wrap; .nx-remove { margin-left: 0; } } }
</style>
