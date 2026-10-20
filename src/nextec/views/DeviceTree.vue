<template>
  <nav class="nx-tree" :class="{ 'is-closed': !open }" aria-label="Clientes e subgrupos">
    <div class="nx-tree-head">
      <span v-if="open" class="nx-tree-title">Clientes</span>
      <button type="button" class="nx-tree-toggle nx-tree-fold" :aria-expanded="open" :aria-label="open ? 'Ocultar árvore de clientes' : 'Mostrar árvore de clientes'"
              :title="open ? 'Ocultar' : 'Clientes'" @click="$emit('toggle')">
        <el-icon><component :is="open ? 'el-icon-DArrowLeft' : 'el-icon-DArrowRight'"/></el-icon>
      </button>
    </div>
    <ul v-show="open">
      <li v-for="r in visible" :key="r.key">
        <div class="nx-tree-row" :class="{ 'is-on': active(r) }" :style="{ paddingLeft: 8 + r.depth * 14 + 'px' }">
          <button v-if="r.kids" type="button" class="nx-tree-toggle" :aria-expanded="isOpen(r)" :aria-label="(isOpen(r) ? 'Recolher ' : 'Expandir ') + r.label"
                  @click="toggle(r)">
            <el-icon><component :is="isOpen(r) ? 'el-icon-ArrowDown' : 'el-icon-ArrowRight'"/></el-icon>
          </button>
          <span v-else class="nx-tree-gap" aria-hidden="true"></span>
          <button type="button" class="nx-tree-pick" :aria-current="active(r) ? 'true' : undefined" @click="$emit('select', treeSelection(r))">
            <span class="nx-tree-name">{{ r.label }}</span>
            <span class="nx-tree-count">{{ r.total }}</span>
          </button>
        </div>
      </li>
    </ul>
  </nav>
</template>

<script setup>
  // Árvore de clientes e subgrupos da lateral de Dispositivos. Clicar escolhe o filtro; a contagem vem do servidor.
  import { computed, reactive } from 'vue'
  import { treeRows, treeSelection, treeActive } from '@/nextec/device-query.mjs'

  const props = defineProps({
    nodes: { type: Array, default: () => [] },
    all: { type: Number, default: 0 },
    noClient: { type: Number, default: 0 },
    client: { default: null },
    sub: { default: null },
    open: { type: Boolean, default: true },
  })
  defineEmits(['select', 'toggle'])

  const closed = reactive({})
  const rows = computed(() => [
    { key: 'all', kind: 'all', label: 'Todos', total: props.all, depth: 0, kids: 0 },
    { key: 'none', kind: 'none', label: 'Sem cliente', total: props.noClient, depth: 0, kids: 0 },
    ...treeRows(props.nodes).map(r => ({ ...r, key: 'g' + r.group_id })),
  ])
  const isOpen = r => !closed[r.group_id]
  const toggle = r => { closed[r.group_id] = isOpen(r) }
  // some quando algum ancestral está recolhido (a linha seguinte de menor profundidade fecha o ramo)
  const visible = computed(() => {
    const out = []
    let hideBelow = null
    for (const r of rows.value) {
      if (hideBelow !== null && r.depth > hideBelow) continue
      hideBelow = null
      out.push(r)
      if (r.kids && !isOpen(r)) hideBelow = r.depth
    }
    return out
  })
  const active = r => treeActive(r, props.client, props.sub)
</script>

<style scoped lang="scss">
  .nx-tree { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); padding: 8px 6px; max-height: calc(100vh - 220px); overflow-y: auto; }
  .nx-tree-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 6px 12px; }
  .nx-tree-title { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--nx-text-muted); }
  .nx-tree.is-closed { padding: 8px 2px; }
  .nx-tree.is-closed .nx-tree-head { justify-content: center; padding: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  .nx-tree-row { display: flex; align-items: center; gap: 2px; border-radius: 10px; min-height: 34px; &:hover { background: var(--nx-bg); } &.is-on { background: var(--nx-bg); box-shadow: inset 3px 0 0 #613CB3; } }
  .nx-tree-toggle, .nx-tree-pick { border: 0; background: transparent; color: var(--nx-text); cursor: pointer; font: inherit; }
  .nx-tree-toggle { width: 22px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: var(--nx-text-muted); }
  .nx-tree-gap { width: 22px; flex: 0 0 22px; }
  .nx-tree-pick { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 6px 2px; text-align: left; font-size: 13px; }
  .nx-tree-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nx-tree-count { flex: 0 0 auto; font-size: 12px; color: var(--nx-text-muted); }
  .nx-tree-row.is-on .nx-tree-name { font-weight: 600; }
  button:focus-visible { outline: 2px solid #613CB3; outline-offset: 1px; border-radius: 8px; }
</style>
