<template>
  <section class="nx-generated" aria-label="Itens gerados">
    <div class="nx-generated-head"><div><h3>Itens gerados</h3><p>Instaladores desta equipe. Os arquivos permanecem aqui depois da geração.</p></div><el-button :loading="loading" @click="load">Atualizar</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-empty v-if="!loading && !rows.length && !error" description="Nenhum instalador gerado ainda." />
    <article v-for="row in rows" :key="row.uuid" class="nx-generation">
      <div class="nx-generation-head"><strong>{{ row.client_name || (row.profile === 'analysts' ? 'Analistas' : 'Cliente padrão') }}</strong><el-tag :type="generationState(row).tone">{{ generationState(row).label }}</el-tag></div>
      <p class="nx-generation-meta">{{ row.filename || 'Instalador' }} · {{ row.platform || 'Plataforma não informada' }} · {{ date(row.created_at) }}</p>
      <dl><div><dt>Pacote Nextec</dt><dd>{{ row.package_version || 'Não informado' }}</dd></div><div><dt>Base RustDesk</dt><dd>{{ row.rustdesk_version || 'Não informada' }}</dd></div></dl>
      <p v-if="row.notes" class="nx-generation-notes">{{ row.notes }}</p>
      <template v-if="activeGeneration(row)"><el-progress :percentage="row.progress?.percent || 0" :indeterminate="row.progress?.percent == null" /><p class="nx-generation-meta">{{ row.progress?.stage || 'Aguardando informações da geração' }} · progresso por etapas, aproximado</p></template>
      <el-alert v-if="row.submission_error || row.missing_files?.length" :title="row.submission_error || ('Arquivos faltantes: ' + row.missing_files.join(', '))" type="warning" :closable="false" />
      <div class="nx-generation-actions">
        <a v-for="file in row.files || []" :key="file.name" :href="generationDownload(file.url) || undefined" class="nx-download">Baixar {{ file.name }}</a>
        <el-button v-if="msi(row)" type="primary" :loading="importing === row.uuid" :disabled="!!importing || row.status !== 'success'" @click="sendToUpdates(row)">Enviar para Atualizações</el-button>
        <el-button v-if="row.github_run_id || row.log_url" @click="refreshRow(row)">Consultar andamento</el-button>
      </div>
    </article>
    <el-pagination v-if="count > 20" :current-page="page" :page-size="20" :total="count" layout="prev, pager, next" @current-change="changePage" />
    <p class="nx-generation-meta">Enviar para Atualizações prepara a versão. Autorizar com assinatura e publicar são os próximos passos.</p>
  </section>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { generationDownload, generationState, activeGeneration, validGenerationId } from '@/nextec/generation-catalog.mjs'
import { importGeneratedRelease } from '@/nextec/api'
const rows = ref([]), count = ref(0), page = ref(1), loading = ref(false), error = ref(''), importing = ref('')
const router = useRouter()
let timer, disposed = false, busy = false, cursor = 0
const date = value => value ? new Date(value).toLocaleString('pt-BR') : 'Data não informada'
const msi = row => row.files?.find(file => file.name.endsWith('.msi'))
async function get(path) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch('/gerador/nextec/geracoes/' + path, { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error(response.status === 403 ? 'Entre com uma conta autorizada a gerar clientes.' : 'Não foi possível consultar o histórico. Tente novamente.')
    return await response.json()
  } finally { clearTimeout(timeout) }
}
async function load() {
  loading.value = true; error.value = ''
  try { const data = await get(`?page=${page.value}&page_size=20`); rows.value = data.results; count.value = data.count }
  catch (e) { error.value = e.message }
  finally { loading.value = false; schedule() }
}
async function refreshRow(row) {
  if (!validGenerationId(row.uuid)) return
  const fresh = await get(row.uuid + '/').catch(e => { error.value = e.message; return null })
  if (fresh) rows.value = rows.value.map(item => item.uuid === row.uuid ? fresh : item)
}
function schedule() { clearTimeout(timer); if (!disposed) timer = setTimeout(poll, 15000) }
async function poll() {
  if (disposed) return
  if (!document.hidden && !loading.value && !busy) {
    busy = true
    try {
      const active = rows.value.filter(activeGeneration)
      for (let i = 0; i < Math.min(2, active.length); i++) await refreshRow(active[(cursor + i) % active.length])
      cursor = active.length ? (cursor + 2) % active.length : 0
    }
    finally { busy = false }
  }
  schedule()
}
const changePage = value => { page.value = value; load() }
async function sendToUpdates(row) {
  if (!row.package_version) { ElMessage.warning('Esta geração antiga não tem versão de pacote. Gere uma versão identificada para publicar.'); return }
  try { await ElMessageBox.confirm(`Preparar o pacote ${row.package_version} em Atualizações? Ele ainda precisará ser autorizado e publicado.`, 'Enviar instalador', { confirmButtonText: 'Enviar', cancelButtonText: 'Cancelar' }) } catch { return }
  importing.value = row.uuid
  try {
    const result = await importGeneratedRelease(row.uuid)
    if (result?.data) { ElMessage.success('Pacote preparado. Autorize com o manifesto assinado antes de publicar.'); router.push('/user/updates') }
  } catch { ElMessage.error('Não foi possível preparar o pacote. Confira a configuração da integração no servidor e tente novamente.') }
  finally { importing.value = '' }
}
function visible() { if (!document.hidden) poll() }
onMounted(() => { load(); document.addEventListener('visibilitychange', visible) })
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible) })
defineExpose({ reload: load })
</script>
<style scoped>
.nx-generated{padding:16px 20px;min-width:0}.nx-generated-head,.nx-generation-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.nx-generated-head h3{margin:0}.nx-generated-head p,.nx-generation-meta{color:var(--nx-text-muted);font-size:13px;line-height:1.5}.nx-generation{border:1px solid var(--nx-divider);border-radius:14px;padding:16px;margin:16px 0;overflow-wrap:anywhere}.nx-generation dl{display:flex;gap:24px;flex-wrap:wrap}.nx-generation dt{font-size:12px;color:var(--nx-text-muted)}.nx-generation dd{margin:4px 0;font-weight:600}.nx-generation-notes{white-space:pre-wrap}.nx-generation-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}.nx-generation-actions .el-button{margin:0;white-space:normal;min-height:42px;height:auto;padding:10px 14px}.nx-download{border:1px solid var(--nx-divider);padding:10px 14px;border-radius:10px;color:var(--nx-purple);text-decoration:none;max-width:100%;overflow-wrap:anywhere}@media(max-width:900px){.nx-generated{padding:12px}.nx-generation{padding:12px}.nx-generation-actions>*{width:100%;box-sizing:border-box;text-align:center}}
</style>
