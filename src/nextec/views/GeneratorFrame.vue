<template>
  <div>
    <div v-if="!frameReady" class="nx-frame-status" role="status" aria-live="polite">
      <template v-if="frameDelayed">
        <p><strong>O gerador ainda não respondeu.</strong> Abra em outra aba para verificar o acesso ou tente novamente.</p>
        <div class="nx-frame-actions">
          <el-button type="primary" @click="reload">Tentar novamente</el-button>
          <el-button @click="emit('open')">Abrir em outra aba</el-button>
        </div>
      </template>
      <template v-else><el-skeleton :rows="3" animated /><p>Carregando…</p></template>
    </div>
    <div class="nx-frame-wrap">
      <iframe ref="frame" :key="frameKey" :src="src" :title="title"
        class="nx-generator-frame" :class="{ 'is-pending': !frameReady }" :style="{ height: frameHeight + 'px' }" @load="syncTheme" />
    </div>
  </div>
</template>

<script setup>
  import { onMounted, onBeforeUnmount, ref } from 'vue'
  import { generatorHeight } from '@/nextec/generator-frame.mjs'
  import { generationEvent } from '@/nextec/generation-catalog.mjs'

  defineProps({ src: { type: String, required: true }, title: { type: String, default: '' } })
  const emit = defineEmits(['generated', 'open'])

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
  const startTimer = () => {
    clearTimeout(frameTimer)
    frameTimer = setTimeout(() => { if (!frameReady.value) frameDelayed.value = true }, 15000)
  }
  const reload = () => {
    frameReady.value = false
    frameDelayed.value = false
    frameKey.value++
    startTimer()
  }
  const receive = (event) => {
    if (generationEvent(event, window.location.origin, frame.value?.contentWindow)) {
      emit('generated')
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

  onMounted(() => {
    window.addEventListener('message', receive)
    themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    startTimer()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('message', receive)
    themeObserver?.disconnect()
    clearTimeout(frameTimer)
  })
  defineExpose({ reload })
</script>

<style scoped lang="scss">
  .nx-frame-wrap { position: relative; }
  .nx-generator-frame { display: block; border: 0; width: 100%; background: var(--nx-surface); }
  .nx-generator-frame.is-pending { position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; }
  .nx-frame-status { margin: 12px 20px; padding: 16px 18px; border-radius: 14px; background: var(--nx-bg); color: var(--nx-text-muted); p { margin: 0 0 12px; font-size: 14px; line-height: 1.5; strong { color: var(--nx-text); } } }
  .nx-frame-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  @media (max-width: 560px) { .nx-frame-status { margin: 12px 14px; } }
</style>
