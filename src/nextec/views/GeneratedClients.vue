<template>
  <section class="nx-generated" aria-label="Itens gerados">
    <div class="nx-generated-head">
      <div>
        <h3>Itens gerados</h3>
        <p>Os instaladores desta equipe ficam aqui depois da geração.</p>
      </div>
      <el-button :loading="loading" @click="load">
        <el-icon v-if="!loading" aria-hidden="true"><el-icon-Refresh /></el-icon><span>Atualizar lista</span>
      </el-button>
    </div>

    <div v-if="rows.length" class="nx-generated-bulk" role="toolbar" aria-label="Excluir itens gerados">
      <el-checkbox :model-value="allSelected" :indeterminate="someSelected && !allSelected" :disabled="!deletableRows.length || !!deleting"
        @change="toggleAll">Selecionar todos</el-checkbox>
      <span class="nx-generated-bulk-actions">
        <el-button v-if="selected.length" type="danger" plain :loading="deleting === 'selected'" :disabled="!!deleting" @click="removeSelected">
          Excluir selecionados ({{ selected.length }})
        </el-button>
        <el-button v-if="failedCount" :loading="deleting === 'failed'" :disabled="!!deleting" @click="clearFailed">
          Limpar falhas ({{ failedCount }})
        </el-button>
      </span>
    </div>

    <p v-if="activeCount" class="nx-generated-live" role="status" aria-live="polite">
      {{ activeCount === 1 ? '1 instalador está sendo gerado.' : activeCount + ' instaladores estão sendo gerados.' }}
      A lista confere o andamento sozinha a cada 15 segundos.
    </p>

    <el-alert v-if="error" type="error" :closable="false" show-icon class="nx-generated-alert">
      <template #title>{{ error }}</template>
      <el-button size="small" :loading="loading" @click="load">Tentar novamente</el-button>
    </el-alert>

    <div v-if="loading && !rows.length && !error" class="nx-generated-loading" role="status" aria-live="polite">
      <el-skeleton :rows="4" animated />
      <span class="nx-sr">Carregando os itens gerados.</span>
    </div>

    <div v-if="!loading && !rows.length && !error" class="nx-generated-empty">
      <el-empty description="Nenhum instalador gerado ainda.">
        <p class="nx-generated-empty-hint">Gere o primeiro em Novo instalador. Ele aparece aqui assim que o envio for aceito.</p>
        <el-button type="primary" @click="$emit('create')">Ir para Novo instalador</el-button>
      </el-empty>
    </div>

    <ul v-if="rows.length" class="nx-generation-list">
      <li v-for="row in rows" :key="row.uuid" class="nx-generation" :class="['is-' + generationState(row).tone, { 'is-selected': selected.includes(row.uuid) }]">
        <div class="nx-generation-head">
          <el-checkbox v-if="deletableGeneration(row)" :model-value="selected.includes(row.uuid)" :disabled="!!deleting"
            :aria-label="'Selecionar ' + (row.client_name || row.filename || 'item')" @change="toggle(row.uuid, $event)" />
          <div class="nx-generation-title">
            <strong>{{ row.client_name || (row.profile === 'analysts' ? 'Analistas' : 'Cliente padrão') }}</strong>
            <span class="nx-generation-meta">{{ platformLabel(row.platform) }} · {{ date(row.created_at) }}</span>
          </div>
          <el-tag :type="generationState(row).tone" effect="light">{{ generationState(row).label }}</el-tag>
        </div>

        <template v-if="activeGeneration(row)">
          <div class="nx-generation-progress">
            <el-progress :percentage="row.progress?.percent || 0" :indeterminate="row.progress?.percent == null"
              :show-text="row.progress?.percent != null" :stroke-width="10" />
            <p><strong>{{ row.progress?.stage || 'Aguardando informações da geração' }}</strong>
              <span>Andamento aproximado, por etapas.</span></p>
          </div>
        </template>

        <el-alert v-if="row.submission_error" :title="'Não foi possível gerar: ' + row.submission_error"
          type="error" :closable="false" show-icon />
        <el-alert v-else-if="row.missing_files?.length" type="warning" :closable="false" show-icon
          :title="'Faltam arquivos neste item: ' + row.missing_files.join(', ')"
          description="Baixe o que estiver disponível ou gere novamente." />

        <p v-if="row.notes" class="nx-generation-notes">{{ row.notes }}</p>

        <div v-if="(row.files && row.files.length) || msi(row) || row.github_run_id || row.log_url || deletableGeneration(row)" class="nx-generation-actions">
          <a v-for="file in row.files || []" :key="file.name" :href="generationDownload(file.url) || undefined"
            class="nx-download" :aria-label="'Baixar ' + file.name" :title="file.name">
            <el-icon aria-hidden="true"><el-icon-Download /></el-icon><span>Baixar {{ fileKind(file.name) }}</span>
          </a>
          <el-button v-if="row.github_run_id || row.log_url" @click="refreshRow(row)">
            {{ activeGeneration(row) ? 'Consultar andamento' : 'Atualizar situação' }}
          </el-button>
          <el-button v-if="msi(row)" type="primary" class="nx-send" :loading="importing === row.uuid"
            :disabled="!!importing || row.status !== 'success'" @click="sendToUpdates(row)">
            <el-icon v-if="importing !== row.uuid" aria-hidden="true"><el-icon-Upload /></el-icon><span>Enviar para Atualizações</span>
          </el-button>
          <el-button v-if="deletableGeneration(row)" text type="danger" class="nx-remove" :loading="deleting === row.uuid" :disabled="!!deleting" @click="removeOne(row)">
            <el-icon v-if="deleting !== row.uuid" aria-hidden="true"><el-icon-Delete /></el-icon><span>Excluir</span>
          </el-button>
        </div>

        <div v-if="failedGeneration(row)" class="nx-generation-retry">
          <el-button type="primary" plain @click="$emit('retry', row)">
            <el-icon aria-hidden="true"><el-icon-RefreshRight /></el-icon><span>Tentar de novo</span>
          </el-button>
        </div>

        <p class="nx-generation-tech">
          Pacote Nextec {{ row.package_version || 'sem versão' }} · Base RustDesk {{ row.rustdesk_version || 'não informada' }}
          <template v-if="row.filename"> · {{ row.filename }}</template>
        </p>
      </li>
    </ul>

    <el-pagination v-if="count > 20" :current-page="page" :page-size="20" :total="count" layout="prev, pager, next" @current-change="changePage" />

    <aside v-if="rows.length" class="nx-generated-next" aria-label="Depois de gerar">
      <h4>Depois de gerar</h4>
      <ol>
        <li><strong>Baixe e teste.</strong> Instale em uma máquina de teste e confira se o app mostra <em>Pronto</em>. Ela deve aparecer em Dispositivos em até 1 minuto.</li>
        <li><strong>Envie para Atualizações.</strong> Use o botão do item pronto. Isso apenas prepara a versão.</li>
        <li><strong>Autorize e publique.</strong> Em <router-link to="/user/updates">Atualizações do app</router-link>, autorize o manifesto assinado e publique para os destinos escolhidos.</li>
      </ol>
    </aside>
  </section>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { generationDownload, generationState, activeGeneration, validGenerationId, failedGeneration, deletableGeneration, deletionPrompt, deleteGeneration, deleteGenerations } from '@/nextec/generation-catalog.mjs'
import { importGeneratedRelease } from '@/nextec/api'
defineEmits(['create', 'retry'])
const rows = ref([]), count = ref(0), page = ref(1), loading = ref(false), error = ref(''), importing = ref('')
const router = useRouter()
const selected = ref([]), deleting = ref('')
const deletableRows = computed(() => rows.value.filter(deletableGeneration))
const failedCount = computed(() => rows.value.filter(row => failedGeneration(row) && deletableGeneration(row)).length)
const allSelected = computed(() => deletableRows.value.length > 0 && deletableRows.value.every(row => selected.value.includes(row.uuid)))
const someSelected = computed(() => selected.value.length > 0)
const toggle = (id, on) => { selected.value = on ? [...new Set([...selected.value, id])] : selected.value.filter(item => item !== id) }
const toggleAll = on => { selected.value = on ? deletableRows.value.map(row => row.uuid) : [] }
let timer, disposed = false, busy = false, cursor = 0
const activeCount = computed(() => rows.value.filter(activeGeneration).length)
const date = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data não informada'
const platformLabel = value => {
  const text = String(value || '').toLowerCase()
  if (!text) return 'Plataforma não informada'
  if (text.includes('win')) return 'Windows'
  if (text.includes('linux')) return 'Linux'
  return value
}
const fileKind = name => /\.msi$/i.test(name) ? 'MSI' : /\.exe$/i.test(name) ? 'EXE' : name
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
function afterDelete(ids) {
  const gone = new Set(ids)
  rows.value = rows.value.filter(row => !gone.has(row.uuid))
  selected.value = selected.value.filter(id => !gone.has(id))
  count.value = Math.max(0, count.value - ids.length)
  if (!rows.value.length && page.value > 1) page.value -= 1
  if (!rows.value.length) load()
}
async function confirmDelete(message, title = 'Excluir item', confirmButtonText = 'Excluir') {
  try { await ElMessageBox.confirm(message, title, { confirmButtonText, cancelButtonText: 'Cancelar', type: 'warning', confirmButtonClass: 'el-button--danger' }); return true }
  catch { return false }
}
async function removeOne(row) {
  const prompt = deletionPrompt(row)
  if (!await confirmDelete(prompt.message, prompt.title, prompt.confirmText)) return
  deleting.value = row.uuid
  try {
    try { await deleteGeneration(row.uuid, { confirmImported: prompt.confirmImported }) }
    catch (e) {
      // Lista desatualizada: o servidor ainda pede a confirmação extra. Mostra o aviso dele antes de repetir.
      if (e.code !== 'imported' || prompt.confirmImported) throw e
      if (!await confirmDelete(e.message, 'Item já enviado para Atualizações', 'Excluir mesmo assim')) return
      await deleteGeneration(row.uuid, { confirmImported: true })
    }
    ElMessage.success('Item excluído.'); afterDelete([row.uuid])
  } catch (e) { ElMessage.error(e.message || 'Não foi possível excluir.'); load() }
  finally { deleting.value = '' }
}
async function bulk(payload, label) {
  deleting.value = label
  try {
    let result = await deleteGenerations(payload)
    const imported = (result.blocked || []).filter(item => item.code === 'imported')
    const names = imported.map(item => { const row = rows.value.find(r => r.uuid === item.uuid); return row?.client_name || row?.filename || item.uuid.slice(0, 8) })
    if (imported.length && await confirmDelete(`${imported.length === 1 ? '1 item já foi enviado' : imported.length + ' itens já foram enviados'} para Atualizações (${names.join(', ')}). Excluir remove só os arquivos de download; a versão preparada no painel não é afetada. Excluir mesmo assim?`, 'Itens enviados para Atualizações', 'Excluir mesmo assim')) {
      const more = await deleteGenerations({ uuids: imported.map(item => item.uuid), confirmImported: true })
      result = { deleted: [...result.deleted, ...more.deleted], blocked: [...(result.blocked || []).filter(item => item.code !== 'imported'), ...more.blocked] }
    }
    const kept = (result.blocked || []).length
    if (result.deleted.length) ElMessage.success(result.deleted.length === 1 ? '1 item excluído.' : result.deleted.length + ' itens excluídos.')
    if (kept) ElMessage.warning(kept === 1 ? '1 item não foi excluído: ' + result.blocked[0].reason : kept + ' itens não foram excluídos (em andamento ou já enviados).')
    if (!result.deleted.length && !kept) ElMessage.info('Nada para excluir.')
    selected.value = []; await load()
  } catch (e) { ElMessage.error(e.message || 'Não foi possível excluir.') }
  finally { deleting.value = '' }
}
async function removeSelected() {
  if (!selected.value.length) return
  if (!await confirmDelete(`Excluir ${selected.value.length === 1 ? '1 item selecionado' : selected.value.length + ' itens selecionados'}? Os arquivos gerados também serão apagados.`, 'Excluir selecionados')) return
  await bulk({ uuids: [...selected.value] }, 'selected')
}
async function clearFailed() {
  if (!await confirmDelete(`Excluir todos os itens com falha${count.value > 20 ? ', inclusive de outras páginas' : ''}? Itens prontos e em andamento ficam.`, 'Limpar falhas')) return
  await bulk({ scope: 'failed' }, 'failed')
}
function visible() { if (!document.hidden) poll() }
onMounted(() => { load(); document.addEventListener('visibilitychange', visible) })
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible) })
defineExpose({ reload: load })
</script>
<style scoped lang="scss">
.nx-generated { padding: 8px 20px 20px; min-width: 0; }
.nx-generated-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; h3 { margin: 0; font-size: 16px; color: var(--nx-text); } p { margin: 2px 0 0; color: var(--nx-text-muted); font-size: 13px; line-height: 1.5; } .el-button { margin: 0; } }
.nx-generated-live { margin: 12px 0 0; padding: 8px 12px; border-radius: 10px; background: var(--nx-tint); color: var(--nx-text); font-size: 13px; line-height: 1.5; }
.nx-generated-alert { margin-top: 14px; }
.nx-generated-loading { margin-top: 16px; }
.nx-generated-empty { margin-top: 8px; }
.nx-generated-empty-hint { margin: 0 0 14px; max-width: 420px; color: var(--nx-text-muted); font-size: 13px; line-height: 1.5; text-align: center; }
.nx-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.nx-generation-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 12px; }
.nx-generation { position: relative; display: grid; gap: 12px; border: 1px solid var(--nx-border); border-left: 4px solid var(--nx-border); border-radius: 14px; padding: 14px 16px; background: var(--nx-surface); min-width: 0; overflow-wrap: anywhere;
  &.is-success { border-left-color: var(--el-color-success); }
  &.is-warning { border-left-color: var(--el-color-warning); }
  &.is-danger { border-left-color: var(--el-color-danger); }
}
.nx-generation-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.nx-generated-bulk { display: flex; justify-content: space-between; align-items: center; gap: 8px 12px; flex-wrap: wrap; margin-top: 14px; padding: 6px 12px; border: 1px solid var(--nx-divider); border-radius: 12px; background: var(--nx-bg);
  .nx-generated-bulk-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } } }
.nx-generation.is-selected { border-color: var(--nx-focus); box-shadow: 0 0 0 1px var(--nx-focus); }
.nx-generation-head > .el-checkbox { height: auto; margin-top: 2px; }
.nx-generation-retry { display: flex; justify-content: flex-end; .el-button { margin: 0; } }
.nx-generation-title { display: grid; gap: 2px; min-width: 0; flex: 1 1 260px; strong { font-size: 15px; line-height: 1.35; color: var(--nx-text); } }
.nx-generation-meta { color: var(--nx-text-muted); font-size: 13px; }
.nx-generation-progress { p { margin: 6px 0 0; font-size: 13px; color: var(--nx-text); span { margin-left: 8px; color: var(--nx-text-muted); } } }
.nx-generation-notes { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--nx-field); color: var(--nx-text); font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
.nx-generation-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--nx-divider);
  .el-button { margin: 0; } .nx-send { margin-left: auto; } .nx-remove { margin-left: auto; } .nx-send + .nx-remove { margin-left: 0; } }
.nx-generation :deep(.el-checkbox__inner), .nx-generated-bulk :deep(.el-checkbox__inner) { border-color: var(--nx-text-subtle); }
.nx-generation-actions :deep(.el-button) { height: 36px; }
.nx-generation-actions :deep(.el-button:not(.el-button--primary):not(.is-text)) { background: var(--nx-surface); border: 1px solid var(--nx-border); color: var(--nx-text); &:hover { background: var(--nx-field); } }
.nx-download { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 1px solid var(--nx-border); border-radius: var(--nx-radius-btn); color: var(--nx-text); background: var(--nx-surface); font-size: 13px; font-weight: 600; text-decoration: none; box-sizing: border-box;
  &:hover { background: var(--nx-field); } }
.nx-generation-tech { margin: 0; color: var(--nx-text-subtle); font-size: 12px; line-height: 1.5; }
.nx-generated-next { margin-top: 18px; padding: 14px 16px; border-radius: 14px; background: var(--nx-bg); border: 1px solid var(--nx-divider);
  h4 { margin: 0 0 8px; font-size: 14px; color: var(--nx-text); }
  ol { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6; color: var(--nx-text-muted); li + li { margin-top: 4px; } strong { color: var(--nx-text); } a { color: var(--nx-focus); } } }
@media (max-width: 560px) {
  .nx-generated { padding: 8px 14px 16px; }
  .nx-generated-head .el-button { width: 100%; }
  .nx-generation { padding: 12px; }
  .nx-generated-bulk-actions { width: 100%; .el-button { flex: 1 1 100%; } }
  .nx-generation-actions > * { flex: 1 1 100%; justify-content: center; box-sizing: border-box; }
  .nx-generation-actions .nx-send { order: -1; margin-left: 0; }
  .nx-generation-actions .el-button { white-space: normal; height: auto; min-height: 40px; }
}
</style>
