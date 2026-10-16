<template>
  <div class="nx-sgl">
    <el-skeleton v-if="loading" animated :rows="2"/>
    <ul v-else-if="items.length" class="nx-sgl-list" aria-label="Aplicativos gerados">
      <li v-for="item in items" :key="item.uuid + item.name">
        <div class="nx-sgl-text">
          <strong>{{ item.label }}</strong>
          <span class="nx-small nx-muted">{{ item.name }}{{ item.looksLikeSupport ? ' · parece o app de suporte' : '' }}</span>
        </div>
        <el-button size="small" type="primary" :loading="using === item.uuid + item.name" :disabled="busy" @click="$emit('use', item)">Usar este</el-button>
      </li>
    </ul>
    <p v-else-if="error" class="nx-sgl-note">{{ error }}</p>
    <p v-else-if="hasMore" class="nx-sgl-note">Nenhum .exe entre os {{ rows.length }} itens mais recentes. Use "Carregar mais" para buscar nos mais antigos.</p>
    <p v-else class="nx-sgl-note">Nenhum .exe gerado ainda. Gere o app de suporte em Gerar cliente (nome Suporte-Nextec).</p>
    <div v-if="!loading && (hasMore || (error && rows.length))" class="nx-sgl-more">
      <el-button size="small" :loading="loadingMore" :disabled="busy || !hasMore" @click="loadMore">Carregar mais</el-button>
      <span class="nx-small nx-muted">{{ rows.length }} de {{ count }} itens consultados</span>
    </div>
  </div>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { supportCandidates } from '@/nextec/support-source.mjs'

  defineProps({ busy: { type: Boolean, default: false }, using: { type: String, default: '' } })
  defineEmits(['use'])

  // Lista paginada do gerador: "Carregar mais" busca a próxima página e reavalia todos os itens já carregados.
  const PAGE_SIZE = 50
  const loading = ref(false)
  const loadingMore = ref(false)
  const rows = ref([])
  const page = ref(0)
  const count = ref(0)
  const error = ref('')
  const items = computed(() => supportCandidates(rows.value))
  const hasMore = computed(() => rows.value.length < count.value)

  const fetchPage = async (n) => {
    const response = await fetch(`/gerador/nextec/geracoes/?page=${n}&page_size=${PAGE_SIZE}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Não foi possível consultar os itens gerados agora.')
    return response.json()
  }
  const reload = async () => {
    loading.value = true; error.value = ''
    rows.value = []; page.value = 0; count.value = 0
    try {
      const data = await fetchPage(1)
      rows.value = Array.isArray(data.results) ? data.results : []
      count.value = Number(data.count) || rows.value.length
      page.value = 1
    } catch (e) { error.value = e.message || 'Não foi possível consultar os itens gerados agora.' }
    finally { loading.value = false }
  }
  const loadMore = async () => {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true; error.value = ''
    try {
      const data = await fetchPage(page.value + 1)
      const more = Array.isArray(data.results) ? data.results : []
      rows.value = rows.value.concat(more)
      page.value += 1
      if (!more.length) count.value = rows.value.length
    } catch (e) { error.value = e.message || 'Não foi possível carregar mais itens.' }
    finally { loadingMore.value = false }
  }
  onMounted(reload)
  defineExpose({ reload })
</script>

<style scoped lang="scss">
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-muted); }
  .nx-sgl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 280px; overflow: auto; }
  .nx-sgl-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--nx-field); }
  .nx-sgl-text { min-width: 0; display: grid; gap: 2px; strong { color: var(--nx-text); overflow-wrap: anywhere; } }
  .nx-sgl-note { margin: 0; font-size: 13px; color: var(--nx-text-muted); }
  .nx-sgl-more { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
</style>
