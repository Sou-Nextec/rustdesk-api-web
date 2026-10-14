<template>
  <section class="nx-gen" aria-label="Gerar cliente">
    <div class="nx-card">
      <div class="nx-card-head">
        <div>
          <h2 class="nx-h2">Gerar cliente</h2>
          <p class="nx-sub">Cria o instalador do app já configurado com o servidor, a chave e a identidade da Nextec.</p>
        </div>
        <el-button class="nx-open" @click="open">
          <el-icon aria-hidden="true"><el-icon-TopRight/></el-icon><span>Abrir em outra aba</span>
        </el-button>
      </div>
      <el-tabs v-model="tab" class="nx-generator-tabs"><el-tab-pane label="Novo instalador" name="new"/><el-tab-pane label="Itens gerados" name="generated"/></el-tabs>
      <ol class="nx-gen-flow" aria-label="Etapas para gerar e publicar um cliente">
        <li :class="{ 'is-current': tab === 'new' }" :aria-current="tab === 'new' ? 'step' : undefined"><span>1</span><strong>Gerar</strong><small>Preencha e gere o instalador.</small></li>
        <li :class="{ 'is-current': tab === 'generated' }" :aria-current="tab === 'generated' ? 'step' : undefined"><span>2</span><strong>Conferir</strong><small>Baixe e teste em uma máquina.</small></li>
        <li><span>3</span><strong>Atualizar</strong><small>Envie, autorize e publique.</small></li>
      </ol>
      <GeneratedClients v-if="tab === 'generated'" @create="tab = 'new'" />
      <div v-show="tab === 'new'">
        <el-collapse v-model="guide" class="nx-gen-guide">
          <el-collapse-item name="guide">
            <template #title><span class="nx-guide-title">O que preencher e o que já vem pronto</span></template>
            <div class="nx-guide-grid">
              <div>
                <h3>Você escolhe</h3>
                <ul>
                  <li><strong>Plataforma:</strong> Windows 64 ou Linux.</li>
                  <li><strong>Cliente do painel:</strong> a máquina que instalar este arquivo aparece já nesse cliente, com a senha automática, sem atribuir nada.</li>
                  <li><strong>Nome dos arquivos e do aplicativo:</strong> <code>Nextec-Connect</code>, só letras, números e hífen. Para o app de suporte, use <code>Suporte-Nextec</code>.</li>
                </ul>
              </div>
              <div>
                <h3>Deixe em branco</h3>
                <ul><li>Ícone, logo e senha permanente. O ícone e o logo da Nextec já são o padrão.</li></ul>
              </div>
              <div>
                <h3><el-icon aria-hidden="true"><el-icon-Lock/></el-icon> Já vem travado</h3>
                <ul><li>Servidor, porta, chave e API. Não podem ser alterados aqui.</li></ul>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
        <div v-if="!frameReady" class="nx-frame-status" role="status" aria-live="polite">
          <template v-if="frameDelayed">
            <p><strong>O gerador ainda não respondeu.</strong> Abra em outra aba para verificar o acesso ou tente novamente.</p>
            <div class="nx-frame-actions">
              <el-button type="primary" @click="reloadFrame">Tentar novamente</el-button>
              <el-button @click="open">Abrir em outra aba</el-button>
            </div>
          </template>
          <template v-else><el-skeleton :rows="3" animated /><p>Carregando o gerador…</p></template>
        </div>
        <div class="nx-frame-wrap">
          <iframe ref="frame" :key="frameKey" :src="frameSrc" title="Gerador de clientes Nextec"
            class="nx-generator-frame" :class="{ 'is-pending': !frameReady }" :style="{ height: frameHeight + 'px' }" @load="syncTheme" />
        </div>
      </div>
    </div>

    <el-collapse class="nx-gen-options">
      <el-collapse-item name="options">
        <template #title><span class="nx-guide-title">Avançado: protocolo do botão Conectar</span></template>
        <p class="nx-note">
          Define o endereço que o botão Conectar do painel abre no computador. O app gerado com o nome <code>Nextec-Connect</code>
          usa <code>nextec-connect://</code> (o nome em minúsculas). O RustDesk oficial usa <code>rustdesk://</code>.
          Se o Windows pedir para “obter um aplicativo para abrir este link”, o protocolo salvo aqui não é o do app instalado.
        </p>
        <div class="nx-scheme">
          <el-input v-model="scheme" class="nx-scheme-input" maxlength="32" placeholder="rustdesk" aria-label="Protocolo do app"
                    :disabled="loadingScheme" @keyup.enter="saveScheme">
            <template #append>://</template>
          </el-input>
          <el-button type="primary" :loading="savingScheme" @click="saveScheme">Salvar protocolo</el-button>
        </div>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>

<script setup>
  import { onMounted, onBeforeUnmount, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { ElMessage } from 'element-plus'
  import { connectScheme, connectSchemeSave } from '@/nextec/api'
  import { generatorHeight } from '@/nextec/generator-frame.mjs'
  import { generationEvent } from '@/nextec/generation-catalog.mjs'
  import GeneratedClients from './GeneratedClients.vue'
  const tab = ref('new')
  const guide = ref(typeof window !== 'undefined' && window.innerWidth >= 768 ? ['guide'] : [])

  // "Baixar instalador deste cliente" (tela Clientes) chega com ?cliente=<id>: o gerador já abre com o cliente escolhido.
  const route = useRoute()
  const clienteId = /^\d{1,10}$/.test(String(route.query.cliente || '')) ? String(route.query.cliente) : ''
  const frameSrc = '/gerador/' + (clienteId ? '?cliente=' + clienteId : '')

  const open = () => { window.open(frameSrc, '_blank', 'noopener') }
  const frame = ref(null)
  const frameKey = ref(0)
  const frameReady = ref(false)
  const frameDelayed = ref(false)
  const frameHeight = ref(720)
  let frameTimer
  let themeObserver
  const syncTheme = () => frame.value?.contentWindow?.postMessage({
    type: 'nextec-generator-theme', dark: document.documentElement.classList.contains('dark')
  }, window.location.origin)
  const receiveFrame = (event) => {
    if (generationEvent(event, window.location.origin, frame.value?.contentWindow)) {
      tab.value = 'generated'
      reloadFrame()
      return
    }
    const height = generatorHeight(event, window.location.origin, frame.value?.contentWindow)
    if (height === null) return
    frameHeight.value = height
    frameReady.value = true
    frameDelayed.value = false
    clearTimeout(frameTimer)
    syncTheme()
  }
  const startTimer = () => {
    clearTimeout(frameTimer)
    frameTimer = setTimeout(() => { if (!frameReady.value) frameDelayed.value = true }, 15000)
  }
  const reloadFrame = () => {
    frameReady.value = false
    frameDelayed.value = false
    frameKey.value++
    startTimer()
  }

  const scheme = ref('rustdesk')
  const loadingScheme = ref(true)
  const savingScheme = ref(false)

  onMounted(async () => {
    window.addEventListener('message', receiveFrame)
    themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    startTimer()
    const res = await connectScheme().catch(() => false)
    if (res && res.data && res.data.scheme) scheme.value = res.data.scheme
    loadingScheme.value = false
  })
  onBeforeUnmount(() => {
    window.removeEventListener('message', receiveFrame)
    themeObserver?.disconnect()
    clearTimeout(frameTimer)
  })

  const saveScheme = async () => {
    savingScheme.value = true
    const res = await connectSchemeSave(scheme.value.trim()).catch(() => false)
    savingScheme.value = false
    if (res && res.data) {
      scheme.value = res.data.scheme
      ElMessage.success('Protocolo salvo. O botão Conectar já usa ' + res.data.scheme + '://')
    }
  }
</script>

<style scoped lang="scss">
  .nx-gen { width: 100%; }
  .nx-generator-tabs { padding: 0 20px; }
  .nx-gen-flow { list-style: none; display: flex; gap: 8px; margin: 0 20px 6px; padding: 0; }
  .nx-gen-flow li { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; flex: 1 1 0; min-width: 0; padding: 4px 0; color: var(--nx-text-subtle); }
  .nx-gen-flow li > span { grid-row: span 2; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--nx-border); font-size: 12px; font-weight: 700; }
  .nx-gen-flow strong { font-size: 13px; color: var(--nx-text-muted); }
  .nx-gen-flow small { font-size: 12px; line-height: 1.35; color: var(--nx-text-subtle); }
  .nx-gen-flow li.is-current > span { background: var(--nx-accent); border-color: var(--nx-accent); color: #fff; }
  .nx-gen-flow li.is-current strong { color: var(--nx-text); }
  .nx-gen-guide { margin: 8px 20px 4px; border: 1px solid var(--nx-border); border-radius: 14px; overflow: hidden; --el-collapse-header-height: 46px; }
  .nx-gen-guide :deep(.el-collapse-item__header) { height: auto; min-height: 46px; line-height: 1.4; padding: 10px 16px; background: var(--nx-surface); border-bottom: 0; }
  .nx-gen-guide :deep(.el-collapse-item__wrap) { border-bottom: 0; background: var(--nx-surface); }
  .nx-gen-guide :deep(.el-collapse-item__content) { padding: 0 16px 16px; }
  .nx-guide-title { font-size: 14px; font-weight: 600; color: var(--nx-text); }
  .nx-guide-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .nx-guide-grid h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 13px; color: var(--nx-text); }
  .nx-guide-grid ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: var(--nx-text-muted); li + li { margin-top: 6px; } strong { color: var(--nx-text); } }
  .nx-frame-wrap { position: relative; }
  .nx-generator-frame { display: block; border: 0; width: 100%; background: var(--nx-bg); }
  .nx-generator-frame.is-pending { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
  .nx-frame-status { margin: 12px 20px; padding: 16px 18px; border-radius: 14px; background: var(--nx-bg); color: var(--nx-text-muted); p { margin: 0 0 12px; font-size: 14px; line-height: 1.5; strong { color: var(--nx-text); } } }
  .nx-frame-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-gen-options { margin-top: 4px; border: 0; --el-collapse-header-height: 48px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-gen-options :deep(.el-collapse-item__header) { height: auto; min-height: 48px; line-height: 1.4; padding: 10px 22px; background: transparent; border-bottom: 0; }
  .nx-gen-options :deep(.el-collapse-item__wrap) { background: transparent; border-bottom: 0; }
  .nx-gen-options :deep(.el-collapse-item__content) { padding: 0 22px 18px; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; padding: 18px 22px 8px; }
  .nx-open { margin: 0; }
  .nx-h2 { font-size: 18px; margin: 0; color: var(--nx-text); }
  .nx-sub { margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-scheme { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .nx-scheme-input { max-width: 340px; }
  .nx-note { margin: 0 0 12px; font-size: 13px; line-height: 1.55; color: var(--nx-text-muted); }
  code { padding: 1px 6px; border-radius: 6px; background: var(--nx-field); font-size: 13px; }
  @media (max-width: 900px) {
    .nx-guide-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  }
  @media (max-width: 560px) {
    .nx-card-head { padding: 16px 16px 6px; }
    .nx-generator-tabs { padding: 0 16px; }
    .nx-gen-flow { margin: 0 16px 6px; gap: 4px; }
    .nx-gen-flow small { display: none; }
    .nx-gen-guide { margin: 8px 14px 4px; }
    .nx-frame-status { margin: 12px 14px; }
    .nx-open { width: 100%; }
    .nx-gen-options :deep(.el-collapse-item__header) { padding: 10px 16px; }
    .nx-gen-options :deep(.el-collapse-item__content) { padding: 0 16px 16px; }
    .nx-scheme-input { max-width: none; }
  }
</style>
