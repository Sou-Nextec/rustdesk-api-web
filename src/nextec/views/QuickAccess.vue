<template>
  <section class="nx-quick" aria-labelledby="nx-quick-title">
    <div class="nx-card-head">
      <h2 id="nx-quick-title" class="nx-h2">Acesso rápido</h2>
      <div class="nx-tabs" role="tablist" aria-label="Acesso rápido">
        <button v-for="t in tabs" :key="t.key" type="button" role="tab" class="nx-tab" :class="{ 'is-on': tab === t.key }"
                :aria-selected="tab === t.key" @click="tab = t.key">
          {{ t.label }}<span class="nx-count">{{ t.count }}</span>
        </button>
      </div>
    </div>

    <el-empty v-if="!rows.length" :image-size="64"
              :description="tab === 'fav' ? 'Nenhum favorito ainda.' : 'Você ainda não conectou em nenhuma máquina.'">
      <p class="nx-empty-hint">
        <template v-if="tab === 'fav'">Marque a estrela de uma máquina em Dispositivos para tê-la aqui, a um clique.</template>
        <template v-else>As máquinas que você abrir com o botão Conectar aparecem aqui.</template>
      </p>
    </el-empty>
    <ul v-else class="nx-qlist">
      <li v-for="r in rows" :key="r.id">
        <button type="button" class="nx-star" :class="{ 'is-on': qa.isFavorite(r.id) }" :aria-pressed="qa.isFavorite(r.id)"
                :aria-label="(qa.isFavorite(r.id) ? 'Tirar dos favoritos: ' : 'Favoritar: ') + r.label" @click="qa.toggleFavorite(r.id, r.label)">
          <el-icon><component :is="qa.isFavorite(r.id) ? 'el-icon-StarFilled' : 'el-icon-Star'"/></el-icon>
        </button>
        <span class="nx-dot" :class="r.online ? 'is-on' : 'is-off'" aria-hidden="true"></span>
        <span class="nx-qtext">
          <strong>{{ r.label }}</strong>
          <span>{{ r.hint }}</span>
        </span>
        <el-button size="small" type="primary" @click="connectDevice(r.id)">Conectar</el-button>
      </li>
    </ul>
  </section>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { timeAgo } from '@/utils/time'
  import { connectDevice } from '@/nextec/connect'
  import { useQuickAccess } from '@/nextec/quick-access'

  const props = defineProps({
    labels: { type: Object, default: () => ({}) }, // id -> apelido ou nome do computador
    status: { type: Object, default: () => ({}) }, // id -> última comunicação (segundos)
  })

  const qa = useQuickAccess()
  const ONLINE_WINDOW_S = 60
  const tab = ref(qa.state.favorites.length || !qa.state.recents.length ? 'fav' : 'recent')
  const tabs = computed(() => [
    { key: 'fav', label: 'Favoritos', count: qa.state.favorites.length },
    { key: 'recent', label: 'Recentes', count: qa.state.recents.length },
  ])

  const rows = computed(() => (tab.value === 'fav' ? qa.state.favorites : qa.state.recents).map(x => {
    const ts = props.status[x.id]
    const online = !!(ts && (Date.now() / 1000 - ts) < ONLINE_WINDOW_S)
    const seen = online ? 'online agora' : (ts ? `visto ${timeAgo(ts * 1000)}` : '')
    return {
      id: x.id,
      label: props.labels[x.id] || x.label || x.id,
      online,
      hint: [x.id, tab.value === 'recent' && x.at ? `aberto ${timeAgo(x.at)}` : seen].filter(Boolean).join(' · '),
    }
  }))
</script>

<style scoped lang="scss">
  .nx-quick { margin-bottom: 16px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 18px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-tabs { display: inline-flex; gap: 4px; padding: 3px; border-radius: 12px; background: var(--nx-field); }
  .nx-tab {
    border: 0; background: transparent; color: var(--nx-text-muted); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    padding: 6px 12px; border-radius: 9px; display: inline-flex; align-items: center; gap: 6px;
    &.is-on { background: var(--nx-surface); color: var(--nx-text); box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
    &:focus-visible { outline: 2px solid var(--nx-focus); outline-offset: 2px; }
  }
  .nx-count { font-size: 11px; color: var(--nx-text-subtle); font-variant-numeric: tabular-nums; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; max-width: 360px; }

  .nx-qlist { list-style: none; margin: 0; padding: 6px 8px; }
  .nx-qlist li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; &:hover { background: var(--nx-tint); } }
  .nx-qtext {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
    strong { font-size: 14px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    span { font-size: 12px; color: var(--nx-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }
  .nx-star {
    flex: none; border: 0; background: transparent; cursor: pointer; color: var(--nx-text-subtle); padding: 4px; border-radius: 8px; display: grid; place-items: center;
    &:hover { color: #B7791F; background: var(--nx-field); }
    &.is-on { color: #D69E2E; }
    &:focus-visible { outline: 2px solid var(--nx-focus); outline-offset: 1px; }
  }
  .nx-dot {
    flex: none; width: 8px; height: 8px; border-radius: 50%;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-off { background: #9A97AD; }
  }
  html.dark .nx-dot.is-on { background: #4CC38A; box-shadow: 0 0 0 3px rgba(76, 195, 138, 0.22); }
  html.dark .nx-dot.is-off { background: #6E6E7A; }
</style>
