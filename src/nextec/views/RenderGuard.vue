<template>
  <el-alert
    v-if="failed"
    type="error"
    :closable="false"
    show-icon
    title="Não foi possível montar esta tela."
    description="Recarregue a página. Se continuar, avise o suporte informando a tela e o horário."
    class="nx-render-guard"
  >
    <el-button size="small" @click="reload">Recarregar</el-button>
  </el-alert>
  <slot v-else/>
</template>

<script setup>
  import { onErrorCaptured, ref } from 'vue'

  // Erro de renderização ou de setup de um componente filho não derruba a tela em silêncio: mostra o aviso acima.
  const failed = ref(false)
  onErrorCaptured((err, _inst, info) => {
    failed.value = true
    console.error('[nextec] falha ao montar a tela', info, err)
    return false
  })
  const reload = () => window.location.reload()
</script>

<style scoped>
  .nx-render-guard { margin: 12px 0; }
</style>
