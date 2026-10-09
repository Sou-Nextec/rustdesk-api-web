<template>
  <el-dialog v-model="visible" title="Novidades" width="min(560px, 92vw)" align-center class="nx-whatsnew" :close-on-click-modal="true">
    <div class="nx-whatsnew-version">Painel {{ NEXTEC_VERSION_LABEL }}<template v-if="NEXTEC_BUILD"> · build {{ NEXTEC_BUILD }}</template></div>
    <!-- conteúdo do CHANGELOG.md do próprio repositório (texto nosso, gerado no build) -->
    <div class="nx-whatsnew-body" v-html="html"/>
    <template #footer>
      <el-button type="primary" @click="visible = false">Entendi</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
  import { computed } from 'vue'
  import { marked } from 'marked'
  import changelog from '../../../CHANGELOG.md?raw'
  import { NEXTEC_VERSION_LABEL, NEXTEC_BUILD } from '../version'

  const visible = defineModel({ type: Boolean, default: false })
  // tira o título geral e a frase de apresentação; o diálogo já tem título
  const html = computed(() => marked.parse(changelog.replace(/^# .*\n+[^\n#]*\n+/, '')))
</script>

<style lang="scss">
  .nx-whatsnew {
    .nx-whatsnew-version { font-size: 13px; color: var(--nx-text-muted); margin-bottom: 8px; }
    .nx-whatsnew-body {
      max-height: min(60vh, 460px); overflow: auto; padding-right: 6px; font-size: 14px; line-height: 1.55;
      h2 { font-family: 'Open Sans', sans-serif; font-variant-numeric: tabular-nums; font-size: 16px; margin: 18px 0 6px; &:first-child { margin-top: 0; } }
      ul { margin: 4px 0 0; padding-left: 20px; }
      li { margin: 3px 0; }
      p { margin: 4px 0; }
    }
  }
</style>
