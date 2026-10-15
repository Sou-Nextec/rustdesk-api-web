<template>
  <section class="nx-gen" aria-label="Gerar cliente">
    <div class="nx-card">
      <div class="nx-tabs-row">
        <el-tabs v-model="tab" class="nx-generator-tabs">
          <el-tab-pane label="Novo instalador" name="new"/>
          <el-tab-pane label="Identidade visual" name="branding"/>
          <el-tab-pane label="Itens gerados" name="generated"/>
        </el-tabs>
        <el-button class="nx-open" @click="open">
          <el-icon aria-hidden="true"><el-icon-TopRight/></el-icon><span>Abrir em outra aba</span>
        </el-button>
      </div>
      <ol v-if="tab !== 'branding'" class="nx-gen-flow" aria-label="Etapas para gerar e publicar um cliente">
        <li :class="{ 'is-current': tab === 'new' }" :aria-current="tab === 'new' ? 'step' : undefined"><span>1</span><strong>Gerar</strong><small>Preencha e gere o instalador.</small></li>
        <li :class="{ 'is-current': tab === 'generated' }" :aria-current="tab === 'generated' ? 'step' : undefined"><span>2</span><strong>Conferir</strong><small>Baixe e teste em uma máquina.</small></li>
        <li><span>3</span><strong>Atualizar</strong><small>Envie, autorize e publique.</small></li>
      </ol>
      <GeneratedClients v-if="tab === 'generated'" @create="tab = 'new'" @retry="retry" />
      <div v-show="tab === 'new'">
        <el-collapse v-model="guide" class="nx-gen-guide">
          <el-collapse-item name="guide">
            <template #title><span class="nx-guide-title">O que preencher e o que já vem pronto</span></template>
            <div class="nx-guide-grid">
              <div>
                <h3>Você escolhe</h3>
                <ul>
                  <li><strong>Plataforma:</strong> Windows 64 ou Linux.</li>
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
        <GeneratorFrame ref="gen" :src="retryState.src" :nonce="retryState.nonce" title="Gerador de clientes Nextec" @generated="generated" @open="open" />
      </div>
      <div v-if="brandingSeen" v-show="tab === 'branding'">
        <GeneratorFrame src="/gerador/nextec/imagens/" title="Identidade visual do gerador" @open="open" />
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
  import { onMounted, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { connectScheme, connectSchemeSave } from '@/nextec/api'
  import GeneratedClients from './GeneratedClients.vue'
  import GeneratorFrame from './GeneratorFrame.vue'
  import { nextRetry } from '@/nextec/generator-retry.mjs'
  const tab = ref('new')
  const guide = ref([])
  const gen = ref(null)
  const brandingSeen = ref(false)
  watch(tab, (value) => { if (value === 'branding') brandingSeen.value = true })

  const open = () => { window.open(tab.value === 'branding' ? '/gerador/nextec/imagens/' : '/gerador/', '_blank', 'noopener') }
  // "Tentar de novo": reabre o formulario com os campos simples do item que falhou (ver generator-retry.mjs).
  const retryState = ref({ src: '/gerador/', nonce: 0 })
  const retry = (row) => {
    retryState.value = nextRetry(retryState.value, row)
    tab.value = 'new'
    if (!retryState.value.appKnown) {
      ElMessage.warning('Este item é anterior ao registro do nome do aplicativo. Confira o campo Nome do aplicativo antes de gerar.')
    }
  }
  const generated = () => { tab.value = 'generated'; gen.value?.reload() }

  const scheme = ref('rustdesk')
  const loadingScheme = ref(true)
  const savingScheme = ref(false)

  onMounted(async () => {
    const res = await connectScheme().catch(() => false)
    if (res && res.data && res.data.scheme) scheme.value = res.data.scheme
    loadingScheme.value = false
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
  .nx-tabs-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 6px 22px 0; }
  .nx-generator-tabs { flex: 1 1 auto; min-width: 0; }
  .nx-gen-flow { list-style: none; display: flex; gap: 8px; margin: 12px 22px 6px; padding: 0; }
  .nx-gen-flow li { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; flex: 1 1 0; min-width: 0; padding: 4px 0; color: var(--nx-text-subtle); }
  .nx-gen-flow li > span { grid-row: span 2; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--nx-border); font-size: 12px; font-weight: 700; }
  .nx-gen-flow strong { font-size: 13px; color: var(--nx-text-muted); }
  .nx-gen-flow small { font-size: 12px; line-height: 1.35; color: var(--nx-text-subtle); }
  .nx-gen-flow li.is-current > span { background: var(--nx-accent); border-color: var(--nx-accent); color: #fff; }
  .nx-gen-flow li.is-current strong { color: var(--nx-text); }
  .nx-gen-guide { margin: 8px 22px 4px; border: 1px solid var(--nx-border); border-radius: 14px; overflow: hidden; --el-collapse-header-height: 46px; }
  .nx-gen-guide :deep(.el-collapse-item__header) { height: auto; min-height: 46px; line-height: 1.4; padding: 10px 16px; background: var(--nx-surface); border-bottom: 0; }
  .nx-gen-guide :deep(.el-collapse-item__wrap) { border-bottom: 0; background: var(--nx-surface); }
  .nx-gen-guide :deep(.el-collapse-item__content) { padding: 0 16px 16px; }
  .nx-guide-title { font-size: 14px; font-weight: 600; color: var(--nx-text); }
  .nx-guide-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .nx-guide-grid h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 13px; color: var(--nx-text); }
  .nx-guide-grid ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: var(--nx-text-muted); li + li { margin-top: 6px; } strong { color: var(--nx-text); } }
  .nx-gen-options { margin-top: 4px; border: 0; --el-collapse-header-height: 48px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-gen-options :deep(.el-collapse-item__header) { height: auto; min-height: 48px; line-height: 1.4; padding: 10px 22px; background: transparent; border-bottom: 0; }
  .nx-gen-options :deep(.el-collapse-item__wrap) { background: transparent; border-bottom: 0; }
  .nx-gen-options :deep(.el-collapse-item__content) { padding: 0 22px 18px; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-open { margin: 0; }
  .nx-scheme { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .nx-scheme-input { max-width: 340px; }
  .nx-note { margin: 0 0 12px; font-size: 13px; line-height: 1.55; color: var(--nx-text-muted); }
  code { padding: 1px 6px; border-radius: 6px; background: var(--nx-field); font-size: 13px; }
  @media (max-width: 900px) {
    .nx-guide-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  }
  @media (max-width: 560px) {
    .nx-tabs-row { padding: 6px 16px 0; }
    .nx-gen-flow { margin: 12px 16px 6px; gap: 4px; }
    .nx-gen-flow small { display: none; }
    .nx-gen-guide { margin: 8px 14px 4px; }
    .nx-open { width: 100%; }
    .nx-gen-options :deep(.el-collapse-item__header) { padding: 10px 16px; }
    .nx-gen-options :deep(.el-collapse-item__content) { padding: 0 16px 16px; }
    .nx-scheme-input { max-width: none; }
  }
</style>
