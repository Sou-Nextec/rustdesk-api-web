<template>
  <div class="nx-steps">
    <ol class="nx-steps-list" :aria-label="`Etapas da máquina. ${info.caption}`">
      <li v-for="s in info.steps" :key="s.key" class="nx-step" :class="`is-${s.status}`" :aria-current="s.status === 'current' ? 'step' : null">
        <span class="nx-step-dot" aria-hidden="true">{{ s.status === 'done' ? '✓' : s.number }}</span>
        <span class="nx-sr">{{ s.label }}: {{ statusText[s.status] }}</span>
      </li>
    </ol>
    <span class="nx-steps-caption">{{ info.caption }}</span>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { machineSteps } from '@/nextec/secrets-flow.mjs'

  const props = defineProps({ device: { type: Object, default: () => ({}) } })
  const info = computed(() => machineSteps(props.device))
  const statusText = { done: 'concluída', current: 'etapa atual', todo: 'pendente' }
</script>

<style scoped lang="scss">
  .nx-steps { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .nx-steps-list { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; }
  .nx-step { display: flex; align-items: center; }
  .nx-step + .nx-step::before { content: ''; display: block; width: 14px; height: 2px; background: var(--nx-border); margin: 0 3px; }
  .nx-step.is-done + .nx-step::before { background: #0F7B55; }
  .nx-step-dot {
    display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%;
    font-size: 12px; font-weight: 700; line-height: 1; border: 2px solid var(--nx-text-subtle); color: var(--nx-text-subtle); background: transparent;
  }
  .is-done .nx-step-dot { background: #0F7B55; border-color: #0F7B55; color: #fff; }
  .is-current .nx-step-dot { background: #613CB3; border-color: #613CB3; color: #fff; box-shadow: 0 0 0 3px #E9DDFF; }
  .nx-steps-caption { font-size: 12px; font-weight: 600; color: var(--nx-text-muted); }
  .nx-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  html.dark .is-done .nx-step-dot { background: #34D399; border-color: #34D399; color: #052E1F; }
  html.dark .nx-step.is-done + .nx-step::before { background: #34D399; }
  html.dark .is-current .nx-step-dot { background: #B79CFF; border-color: #B79CFF; color: #1B1233; box-shadow: 0 0 0 3px #3A2F5C; }
</style>
