<template>
  <div class="nx-render-guard-root">
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
  </div>
</template>

<script setup>
  import { onErrorCaptured, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'

  // A raiz do template é um único elemento (sem comentário ao lado): o <transition mode="out-in"> do layout não conclui a
  // saída de uma raiz sem elemento (slot/fragmento) e a tela seguinte nunca entrava, deixando o painel em branco até o F5.
  // Erro de renderização ou de setup de um componente filho não derruba a tela em silêncio: mostra o aviso acima.
  const failed = ref(false)
  onErrorCaptured((err, _inst, info) => {
    failed.value = true
    console.error('[nextec] falha ao montar a tela', info, err)
    return false
  })
  // o estado de erro não atravessa telas: ao trocar de rota (ou reativar do cache) o guarda recomeça limpo
  const route = useRoute()
  watch(() => route.fullPath, () => { failed.value = false })
  const reload = () => window.location.reload()
</script>

<style scoped>
  .nx-render-guard { margin: 12px 0; }
</style>
