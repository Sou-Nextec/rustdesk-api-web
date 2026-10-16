<template>
  <section class="nx-sup" aria-label="Suporte avulso">
    <!-- link para mandar ao cliente (todos os usuários) -->
    <div class="nx-card">
      <div class="nx-card-head">
        <div>
          <h2 class="nx-h2">Link de suporte</h2>
          <p class="nx-sub">Mande ao cliente que ainda não tem o app. Ele baixa, abre e avisa você.</p>
        </div>
      </div>
      <div class="nx-link-row">
        <code class="nx-link-text" :aria-label="'Link de suporte: ' + link">{{ link }}</code>
        <div class="nx-actions">
          <el-button :disabled="!hasApp" @click="copy(link, 'Link copiado.')">Copiar link</el-button>
          <el-button type="primary" :disabled="!hasApp" @click="copy(message, 'Mensagem copiada.')">Copiar mensagem</el-button>
        </div>
      </div>
      <p v-if="loadedApp && !hasApp" class="nx-warn" role="status">
        O aplicativo de suporte ainda não foi publicado, então o link está indisponível.
        {{ isAdmin ? 'Escolha o aplicativo no cartão "Aplicativo de suporte" abaixo.' : 'Peça a um administrador para publicá-lo.' }}
      </p>
    </div>

    <SupportLinks/>

    <WaitingList ref="waiting" compact/>

    <!-- só administradores -->
    <template v-if="isAdmin">
      <div class="nx-card">
        <div class="nx-card-head">
          <div>
            <h2 class="nx-h2">Endereço dos links</h2>
            <p class="nx-sub">Domínio que aparece nos links de instalador e de atendimento enviados aos clientes.</p>
          </div>
        </div>
        <form class="nx-url" @submit.prevent="savePublicUrl">
          <label for="nx-public-url">Domínio público</label>
          <div class="nx-url-row">
            <el-input id="nx-public-url" v-model="publicUrl" placeholder="https://suporte.empresa.com.br" :disabled="savingUrl || !publicBaseReady" aria-describedby="nx-public-url-help" @input="urlError = ''" />
            <el-button type="primary" native-type="submit" :loading="savingUrl" :disabled="!publicBaseReady">Salvar</el-button>
          </div>
          <p v-if="publicBaseFailed" class="nx-warn" role="alert">Não foi possível carregar o endereço salvo. <el-button link type="primary" @click="retryPublicUrl">Tentar de novo</el-button></p>
          <p v-if="urlError" class="nx-warn" role="alert">{{ urlError }}</p>
          <p id="nx-public-url-help" class="nx-small nx-muted">
            Os links ficam <code>{{ exampleBase }}/instalador/&lt;código&gt;</code> e <code>{{ exampleBase }}/atendimento/&lt;código&gt;</code>.
            Deixe em branco para usar o endereço em que o painel está aberto. O domínio precisa encaminhar esses dois caminhos ao painel (proxy ou Cloudflare).
          </p>
        </form>
      </div>

      <div class="nx-card">
        <div class="nx-card-head">
          <h2 class="nx-h2">Aplicativo de suporte</h2>
          <div class="nx-actions">
            <el-button v-if="app" @click="openPage">Ver a página do cliente</el-button>
            <el-button type="primary" @click="openUpload"><el-icon><el-icon-Upload/></el-icon><span>{{ app ? 'Trocar o aplicativo' : 'Enviar arquivo .exe' }}</span></el-button>
          </div>
        </div>

        <div v-if="loading && !loaded" class="nx-pad"><el-skeleton animated :rows="2"/></div>
        <div v-else-if="app" class="nx-app">
          <span class="nx-dot is-on" aria-hidden="true"></span>
          <div class="nx-app-text">
            <strong>Publicado: Suporte-Nextec.exe</strong>
            <div class="nx-small nx-muted">{{ size(app.size) }} · enviado em {{ fmt(app.uploaded_at) }}{{ app.uploaded_by ? ' por ' + app.uploaded_by : '' }}</div>
            <div class="nx-small nx-muted nx-mono" :title="app.sha256">SHA-256 {{ app.sha256.slice(0, 16) }}</div>
          </div>
          <el-button class="nx-remove" @click="remove"><span class="nx-danger-text">Tirar do ar</span></el-button>
        </div>
        <div v-else class="nx-pick">
          <p class="nx-pick-lead"><strong>Nenhum aplicativo de suporte publicado.</strong> Escolha abaixo um aplicativo que já foi gerado em Gerar cliente; o link de suporte funciona assim que você publicar.</p>
          <SupportGeneratedList :busy="up.busy" :using="gen.using" @use="useGenerated"/>
          <el-progress v-if="up.busy && !up.visible" class="nx-pick-progress" :percentage="up.progress" :stroke-width="10" aria-label="Progresso da publicação"/>
          <p v-if="up.error && !up.visible" class="nx-error nx-pick-error" role="alert">{{ up.error }}</p>
          <p class="nx-pick-or"><el-button link type="primary" @click="openUpload">Prefiro enviar um arquivo .exe</el-button></p>
        </div>
      </div>

      <div class="nx-card">
        <div class="nx-card-head"><h2 class="nx-h2">Quem vê a fila Aguardando atendimento</h2></div>
        <div class="nx-who">
          <el-radio-group v-model="waitingMode" :disabled="savingMode" aria-label="Quem vê a fila" class="nx-modes" @change="saveMode">
            <el-radio-button value="off">Ninguém (desligada)</el-radio-button>
            <el-radio-button value="admins">Só administradores</el-radio-button>
            <el-radio-button value="all">Todos os usuários</el-radio-button>
          </el-radio-group>
          <p class="nx-help nx-help-in">A fila mostra máquinas novas que acabaram de abrir o app de suporte. A regra vale no servidor, não só na tela. A conexão sempre depende de a pessoa aceitar no app.</p>
        </div>
      </div>
    </template>

    <el-dialog v-model="up.visible" title="Enviar aplicativo de suporte" width="min(520px, 92vw)" align-center :close-on-click-modal="false" :before-close="beforeClose">
      <div class="nx-gen">
        <p class="nx-gen-title">Usar um aplicativo já gerado</p>
        <SupportGeneratedList v-if="up.visible" :busy="up.busy" :using="gen.using" @use="useGenerated"/>
        <p class="nx-gen-title nx-gen-or">Ou envie um arquivo</p>
      </div>
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-form-item label="Aplicativo (.exe)" required class="is-required">
          <input type="file" accept=".exe" class="nx-file" :disabled="up.busy" @change="onFile">
          <p v-if="up.file" class="nx-help-form">{{ up.file.name }} · {{ size(up.file.size) }}</p>
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
  import { computed, onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import WaitingList from '@/nextec/views/WaitingList.vue'
  import SupportLinks from '@/nextec/views/SupportLinks.vue'
  import { useUserStore } from '@/store/user'
  import { supportInfo, supportDelete, supportSettings, supportWaiting, supportPublicUrlSave } from '@/nextec/api'
  import { loadPublicBase, setConfiguredBase, configuredBase, publicBaseReady, publicBaseFailed } from '@/nextec/public-base'
  import { checkPublicUrl, publicBase } from '@/nextec/public-links.mjs'
  import { uploadFile } from '@/nextec/upload'
  import SupportGeneratedList from '@/nextec/views/SupportGeneratedList.vue'
  import { publishGeneratedApp } from '@/nextec/support-source.mjs'

  const userStore = useUserStore()
  const isAdmin = computed(() => (userStore.route_names || []).includes('*'))
  const waiting = ref(null)
  const waitingMode = ref('admins')
  const savingMode = ref(false)
  const app = ref(null)
  const hasApp = ref(false)
  const loadedApp = ref(false)
  const maxSize = ref(300 * 1024 * 1024)
  const loading = ref(false)
  const loaded = ref(false)
  const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleString('pt-BR') : '-')
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

  const link = computed(() => `${window.location.origin}/suporte`)
  const message = computed(() => `Olá! Para o atendimento remoto, abra este link, baixe o aplicativo de suporte da Nextec e me avise quando ele estiver aberto: ${link.value}`)
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success(msg) } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }

  const load = async () => {
    // qualquer usuário sabe se o app está publicado (a página de suporte é pública)
    const w = await supportWaiting().catch(() => false)
    if (w) hasApp.value = !!w.data.has_app
    loadedApp.value = true
    if (isAdmin.value) {
      loading.value = true
      const res = await supportInfo().catch(() => false)
      loading.value = false
      loaded.value = true
      if (res) {
        app.value = res.data.app || null
        hasApp.value = !!app.value
        maxSize.value = res.data.max_size || maxSize.value
        waitingMode.value = res.data.waiting_mode || 'admins'
      }
    }
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

  // endereço público dos links (instalador e atendimento)
  const publicUrl = ref('')
  const savingUrl = ref(false)
  const urlError = ref('')
  const exampleBase = computed(() => publicBase(checkPublicUrl(publicUrl.value).value, window.location.origin) || window.location.origin)
  const fillPublicUrl = (ok) => { if (ok) publicUrl.value = configuredBase.value }
  loadPublicBase().then(fillPublicUrl)
  const retryPublicUrl = () => loadPublicBase(true).then(fillPublicUrl)
  const savePublicUrl = async () => {
    // nunca grava sem ter lido o valor salvo: uma falha de carga não pode virar "limpar o endereço"
    if (!publicBaseReady.value) { urlError.value = 'O endereço salvo ainda não foi carregado. Tente carregar de novo antes de salvar.'; return }
    const check = checkPublicUrl(publicUrl.value)
    if (!check.ok) { urlError.value = check.message; return }
    savingUrl.value = true
    const res = await supportPublicUrlSave(check.value).catch(() => false)
    savingUrl.value = false
    if (res && res.code === 0) {
      setConfiguredBase((res.data && res.data.public_url) || '')
      publicUrl.value = (res.data && res.data.public_url) || ''
      ElMessage.success('Endereço salvo. Os próximos links já saem com ele.')
    } else {
      urlError.value = (res && res.message) || 'Não foi possível salvar o endereço. Tente de novo.'
    }
  }

  const up = reactive({ visible: false, busy: false, progress: 0, file: null, error: '' })
  const gen = reactive({ using: '' })
  const openUpload = () => {
    Object.assign(up, { visible: true, busy: false, progress: 0, file: null, error: '' })
  }
  // Baixa o .exe gerado (download autorizado do próprio gerador) e publica pelo mesmo envio de sempre.
  const useGenerated = async (item) => {
    up.error = ''
    gen.using = item.uuid + item.name
    up.busy = true; up.progress = 0
    const r = await publishGeneratedApp({
      item, maxSize: maxSize.value, sizeLabel: size,
      upload: (file, onProgress) => uploadFile('/nextec/support/upload', {}, file, onProgress),
      onProgress: (p) => { up.progress = p },
    })
    up.busy = false; gen.using = ''
    if (r.ok) {
      up.visible = false
      ElMessage.success('Aplicativo publicado. O link de suporte já funciona.')
      load()
      return
    }
    up.error = r.message
    // com o diálogo fechado (fluxo inline) o erro precisa aparecer onde o usuário está olhando
    if (!up.visible) ElMessage.error(r.message)
  }
  const beforeClose = (done) => { if (!up.busy) done() }
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]
    up.error = ''
    if (!f) { up.file = null; return }
    if (!/\.exe$/i.test(f.name)) { up.file = null; up.error = 'Escolha um arquivo .exe.'; return }
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
  .nx-sup { width: 100%; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-sub { margin: 2px 0 0; font-size: 12px; color: var(--nx-text-muted); }
  .nx-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-url { display: grid; gap: 8px; padding: 16px 22px; }
  .nx-url label { font-size: 13px; font-weight: 600; }
  .nx-url-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .nx-url-row .el-input { flex: 1 1 280px; min-width: 0; }
  .nx-url code { word-break: break-all; }
  .nx-link-row { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; padding: 16px 22px; }
  .nx-link-text {
    flex: 1 1 280px; min-width: 0; padding: 10px 14px; border-radius: 12px; background: var(--nx-field); color: var(--nx-text);
    font-size: 13px; overflow-wrap: anywhere;
  }
  .nx-warn { margin: 0; padding: 0 22px 16px; font-size: 13px; line-height: 1.5; color: #8A5300; }
  html.dark .nx-warn { color: #FCD38A; }
  .nx-pad { padding: 18px 22px; }
  .nx-app { display: flex; align-items: center; gap: 14px; padding: 18px 22px; strong { color: var(--nx-text); } .nx-remove { margin-left: auto; } }
  .nx-app-text { min-width: 0; }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-muted); }
  .nx-mono { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; max-width: 420px; }
  .nx-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; } }
  html.dark .nx-dot.is-on { background: #4CC38A; box-shadow: 0 0 0 3px rgba(76, 195, 138, 0.22); }
  .nx-danger-text { color: #BA1A1A; }
  html.dark .nx-danger-text { color: #FF9C93; }
  .nx-who { padding: 16px 22px 6px; }
  .nx-modes { display: flex; flex-wrap: wrap; }
  .nx-help { margin: 0; padding: 0 22px 18px; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-help-in { padding: 10px 0 12px !important; }
  .nx-help-form { margin: 6px 0 0; font-size: 12px; color: var(--nx-text-muted); }
  .nx-gen { margin-bottom: 14px; }
  .nx-gen-title { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: var(--nx-text); }
  .nx-gen-or { margin-top: 16px; }
  .nx-pick { padding: 18px 22px; }
  .nx-pick-lead { margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: var(--nx-text-muted); strong { color: var(--nx-text); } }
  .nx-pick-or { margin: 12px 0 0; }
  .nx-pick-progress { margin-top: 12px; }
  .nx-pick-error { margin-top: 12px; }
  .nx-file { width: 100%; font: inherit; font-size: 13px; color: var(--nx-text); }
  .nx-error { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; background: #FDECEA; color: #8C1D18; }
  html.dark .nx-error { background: rgba(255, 138, 128, 0.14); color: #FFB4AB; }
  @media (max-width: 560px) {
    .nx-app { flex-wrap: wrap; .nx-remove { margin-left: 0; } }
    .nx-actions { width: 100%; .el-button { flex: 1 1 auto; } }
  }
</style>
