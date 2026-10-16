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
        <li class="is-link"><router-link to="/user/updates"><span>3</span><strong>Atualizar</strong><small>Envie, autorize e publique.</small></router-link></li>
      </ol>
      <GeneratedClients v-if="tab === 'generated'" @create="tab = 'new'" @retry="retry" />
      <div v-show="tab === 'new'">
        <GeneratorFrame ref="gen" :src="retryState.src" :nonce="retryState.nonce" title="Gerador de clientes Nextec" @generated="generated" @open="open" />
      </div>
      <div v-if="brandingSeen" v-show="tab === 'branding'">
        <GeneratorFrame src="/gerador/nextec/imagens/" title="Identidade visual do gerador" @open="open" />
      </div>
    </div>
  </section>
</template>

<script setup>
  import { ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import GeneratedClients from './GeneratedClients.vue'
  import GeneratorFrame from './GeneratorFrame.vue'
  import { nextRetry } from '@/nextec/generator-retry.mjs'
  const tab = ref('new')
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
      ElMessage.warning({ message: 'Item antigo: o nome do aplicativo não foi guardado. Confira o campo Nome do aplicativo antes de gerar.', duration: 8000, showClose: true })
    }
  }
  const generated = () => { tab.value = 'generated'; gen.value?.reload() }
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
  .nx-gen-flow li.is-link a { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; width: 100%; color: inherit; text-decoration: none; border-radius: 10px; }
  .nx-gen-flow li.is-link a:hover strong { color: var(--nx-accent); text-decoration: underline; }
  .nx-gen-flow li.is-link a:focus-visible { outline: 2px solid var(--nx-accent); outline-offset: 2px; }
  .nx-gen-flow li.is-current > span { background: var(--nx-accent); border-color: var(--nx-accent); color: #fff; }
  .nx-gen-flow li.is-current strong { color: var(--nx-text); }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-open { margin: 0; }
  @media (max-width: 560px) {
    .nx-tabs-row { padding: 6px 16px 0; }
    .nx-gen-flow { margin: 12px 16px 6px; gap: 4px; }
    .nx-gen-flow small { display: none; }
    .nx-open { width: 100%; }
  }
</style>
