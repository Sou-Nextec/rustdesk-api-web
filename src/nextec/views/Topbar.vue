<template>
  <div class="nx-topbar">
    <!-- pesquisa global de dispositivos -->
    <el-button class="nx-gsearch-toggle" circle aria-label="Buscar dispositivo" @click="openCompact">
      <el-icon><el-icon-Search/></el-icon>
    </el-button>
    <div class="nx-gsearch" :class="{ 'is-open': compactOpen }" ref="box">
      <el-input ref="input" v-model="q" class="nx-gsearch-input" clearable placeholder="Buscar dispositivo (Ctrl+K)"
                aria-label="Buscar dispositivo" @focus="open" @input="open" @keydown.enter.prevent="seeAll"
                @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.esc="close">
        <template #prefix><el-icon><el-icon-Search/></el-icon></template>
      </el-input>
      <div v-if="visible && q.trim()" class="nx-gsearch-pop" role="listbox" aria-label="Resultados">
        <div v-if="loading && !items.length" class="nx-gs-empty">Carregando...</div>
        <div v-else-if="!results.length" class="nx-gs-empty">Nenhum dispositivo encontrado.</div>
        <div v-for="(r, i) in results" :key="r.key" class="nx-gs-item" :class="{ 'is-active': i === active }"
             role="option" :aria-selected="i === active" @mouseenter="active = i" @mousedown.prevent>
          <span v-if="r.online !== null" class="nx-dot" :class="r.online ? 'is-on' : 'is-off'" aria-hidden="true"></span>
          <el-icon v-else class="nx-gs-icon" aria-hidden="true"><el-icon-Monitor/></el-icon>
          <div class="nx-gs-text">
            <div class="nx-gs-name">{{ r.name || r.id }}</div>
            <div class="nx-gs-sub">{{ [r.name ? r.id : '', r.sub].filter(Boolean).join(' · ') || 'Dispositivo' }}</div>
          </div>
          <el-button size="small" type="primary" @click="connect(r.id)">Conectar</el-button>
        </div>
        <button v-if="q.trim()" type="button" class="nx-gs-all" @mousedown.prevent @click="seeAll">
          Ver todos os resultados na lista
        </button>
      </div>
    </div>

    <!-- conexão rápida por ID -->
    <el-popover v-model:visible="quick.visible" placement="bottom-end" :width="300" trigger="click">
      <template #reference>
        <el-button type="primary" class="nx-quick-btn" aria-label="Conectar por ID">
          <el-icon><el-icon-Plus/></el-icon><span class="nx-quick-label">Conectar</span>
        </el-button>
      </template>
      <form class="nx-quick" @submit.prevent="quickConnect">
        <label for="nx-quick-id">ID do dispositivo</label>
        <el-input id="nx-quick-id" ref="quickInput" v-model="quick.id" placeholder="ex.: 123456789" inputmode="numeric"/>
        <p>Abre o app RustDesk instalado neste computador.</p>
        <el-button type="primary" native-type="submit" :disabled="!quick.id.trim()">Conectar</el-button>
      </form>
    </el-popover>

    <!-- ajuda da tela atual -->
    <el-button v-if="help" circle class="nx-help-btn" aria-label="Como funciona esta tela" @click="helpVisible = true">
      <el-icon><el-icon-QuestionFilled/></el-icon>
    </el-button>
    <el-drawer v-model="helpVisible" title="Como funciona" size="420px" append-to-body>
      <div class="nx-help-body">
        <p v-for="(p, i) in help" :key="i">{{ p }}</p>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { T } from '@/utils/i18n'
  import { useUserStore } from '@/store/user'
  import { connectDevice as connectByClient } from '@/nextec/connect'
  import { list as adminPeers } from '@/api/peer'
  import { list as deviceGroups } from '@/api/device_group'
  import { list as myPeers } from '@/api/my/peer'
  import { list as myAddressBook } from '@/api/my/address_book'
  import { sharedAddressBooks, sharedCollections, sharedStatus } from '@/nextec/api'

  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const isAdmin = computed(() => (userStore.route_names || []).includes('*'))

  // ---------- ajuda (chave NxHelp<NomeDaRota> no pt_BR.json, parágrafos separados por linha em branco) ----------
  const helpVisible = ref(false)
  const help = computed(() => {
    const key = 'NxHelp' + String(route.name || '')
    const text = T(key)
    return text === key ? null : text.split(/\n\s*\n/)
  })

  // ---------- pesquisa ----------
  const q = ref('')
  const visible = ref(false)
  const loading = ref(false)
  const items = ref([])
  const active = ref(0)
  const input = ref()
  const box = ref()
  let loadedAt = 0

  const isOnline = t => !!(t && (Date.now() / 1000 - t) < 60)
  const load = async () => {
    if (loading.value || Date.now() - loadedAt < 60000) return
    loading.value = true
    const all = async (fn) => {
      const res = await fn({ page: 1, page_size: 10000 }).catch(() => false)
      return res ? (res.data.list || []) : []
    }
    if (isAdmin.value) {
      const [peers, groups] = await Promise.all([all(adminPeers), all(deviceGroups)])
      const gName = id => groups.find(g => g.id === id)?.name || ''
      items.value = peers.map(p => ({
        key: 'p' + p.row_id, id: p.id, name: p.alias || p.hostname, online: isOnline(p.last_online_time),
        sub: [gName(p.group_id), p.username].filter(Boolean).join(' · '),
        text: [p.id, p.alias, p.hostname, p.username, gName(p.group_id)].join(' '),
      }))
    } else {
      const [peers, saved, shared] = await Promise.all([
        all(myPeers), all(myAddressBook),
        sharedAddressBooks({ collection_id: 0 }).then(r => r.data.list || []).catch(() => []),
      ])
      // situação dos acessos salvos (patch 0003); sem ela, mostra o ícone em vez da bolinha
      const st = saved.length ? await sharedStatus({ ids: saved.map(a => a.id) }).then(r => r.data.list || []).catch(() => null) : []
      const seen = st ? Object.fromEntries(st.map(x => [x.id, x.last_online_time])) : null
      const map = new Map()
      const add = (key, a, sub, online) => {
        if (map.has(a.id)) return
        map.set(a.id, { key, id: a.id, name: a.alias || a.hostname, online, sub,
          text: [a.id, a.alias, a.hostname, a.username, sub, ...(a.tags || [])].join(' ') })
      }
      saved.forEach(a => add('a' + a.row_id, a, a.username || '', seen ? isOnline(seen[a.id]) : null))
      const sharedCols = await sharedCollections().then(r => r.data.list || []).catch(() => [])
      const clientOf = id => String(sharedCols.find(c => c.id === id)?.name || '').replace(/^Cliente:\s*/, '')
      shared.forEach(a => add('s' + a.collection_id + '-' + a.row_id, a, [clientOf(a.collection_id), a.username].filter(Boolean).join(' · '), isOnline(a.last_online_time)))
      peers.forEach(p => add('p' + p.row_id, p, p.username || '', isOnline(p.last_online_time)))
      items.value = [...map.values()]
    }
    loadedAt = Date.now()
    loading.value = false
  }

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const results = computed(() => {
    const term = norm(q.value.trim())
    if (!term) return []
    return items.value.filter(i => norm(i.text).includes(term))
      .sort((a, b) => Number(b.online) - Number(a.online))
      .slice(0, 8)
  })
  watch(q, () => { active.value = 0 })

  const open = () => { visible.value = true; load() }
  const close = () => { visible.value = false; compactOpen.value = false }
  // telas estreitas: a busca vira um botão e abre por cima do topo
  const compactOpen = ref(false)
  const openCompact = () => { compactOpen.value = true; nextTick(() => input.value?.focus()) }
  const move = (d) => {
    if (!results.value.length) return
    active.value = (active.value + d + results.value.length) % results.value.length
  }
  const connect = (id) => { close(); connectByClient(id) }
  // Enter: abre a lista completa já filtrada
  const seeAll = () => {
    const term = q.value.trim()
    if (!term) return
    close()
    q.value = ''
    input.value?.blur()
    router.push({ path: isAdmin.value ? '/user/peer' : '/my/shared', query: { q: term } })
  }

  const onDocClick = (e) => { if (box.value && !box.value.contains(e.target)) close() }
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCompact() }
  }
  onMounted(() => { document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onKey) })
  onBeforeUnmount(() => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) })

  // ---------- conexão rápida ----------
  const quick = reactive({ visible: false, id: '' })
  const quickInput = ref()
  watch(() => quick.visible, v => { if (v) nextTick(() => quickInput.value?.focus()) })
  const quickConnect = () => {
    const id = quick.id.replace(/\s/g, '')
    if (!id) return
    quick.visible = false
    quick.id = ''
    connectByClient(id)
  }
</script>

<style scoped lang="scss">
  .nx-topbar { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-left: 16px; }
  .nx-gsearch { position: relative; flex: 0 1 420px; min-width: 0; margin-right: auto; margin-left: auto; }
  .nx-gsearch-input :deep(.el-input__wrapper) { border-radius: 12px; }
  .nx-gsearch-pop {
    position: absolute; top: calc(100% + 6px); left: 0; min-width: max(100%, 380px); z-index: 2000; padding: 6px;
    background: var(--nx-surface); border-radius: 14px; box-shadow: 0 12px 32px rgba(13, 0, 53, .18);
    max-height: 420px; overflow: auto;
  }
  .nx-gs-empty { padding: 14px 12px; font-size: 13px; color: var(--nx-text-muted); }
  .nx-gs-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; cursor: default;
    &.is-active { background: var(--nx-tint); }
  }
  .nx-gs-text { flex: 1; min-width: 0; }
  .nx-gs-icon { flex: none; color: var(--nx-text-subtle); }
  .nx-gs-name { font-size: 13px; font-weight: 600; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-gs-sub { font-size: 12px; color: var(--nx-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nx-gs-all {
    display: block; width: 100%; margin-top: 4px; padding: 9px 10px; border: none; border-top: 1px solid var(--nx-divider);
    background: transparent; text-align: left; font: inherit; font-size: 13px; font-weight: 600; color: var(--el-color-primary); cursor: pointer;
    border-radius: 0 0 10px 10px; &:hover { background: var(--nx-tint); }
  }
  .nx-dot {
    flex: none; width: 8px; height: 8px; border-radius: 50%;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
    &.is-off { background: #9A97AD; }
  }
  .nx-quick-btn { flex: none; .nx-quick-label { margin-left: 4px; } }
  .nx-help-btn { flex: none; margin-left: 0 !important; }
  .nx-quick {
    display: flex; flex-direction: column; gap: 8px;
    label { font-size: 13px; font-weight: 600; color: var(--nx-text); }
    p { margin: 0; font-size: 12px; color: var(--nx-text-muted); }
    .el-button { align-self: flex-end; }
  }
  .nx-help-body p { margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: var(--nx-text); }

  .nx-gsearch-toggle { display: none; flex: none; margin: 0 0 0 auto !important; }
  @media (max-width: 1180px) {
    .nx-gsearch-toggle { display: inline-flex; }
    .nx-gsearch { display: none; }
    .nx-gsearch.is-open {
      display: block; position: fixed; top: 10px; left: 16px; right: 16px; margin: 0 auto; max-width: 560px; z-index: 2100;
      box-shadow: 0 12px 32px rgba(13, 0, 53, .25); border-radius: 12px;
    }
  }
  @media (max-width: 768px) {
    .nx-topbar { margin-left: 4px; gap: 6px; }
    .nx-quick-btn .nx-quick-label { display: none; }
  }
</style>
