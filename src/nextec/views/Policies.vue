<template>
  <section class="nx-pol" aria-label="Políticas do app">
    <div class="nx-bar">
      <p class="nx-bar-text">Defina o que o app RustDesk permite em cada cliente ou máquina. O app aplica sozinho, em alguns segundos. Sem regra, nada muda.</p>
      <div class="nx-bar-right">
        <el-button :loading="loading" @click="load"><el-icon><el-icon-Refresh/></el-icon><span>Atualizar</span></el-button>
        <el-button type="primary" @click="openForm()"><el-icon><el-icon-Plus/></el-icon><span>Nova regra</span></el-button>
      </div>
    </div>

    <div class="nx-card">
      <ul v-if="isMobile && rows.length" class="nx-cards" aria-label="Regras">
        <li v-for="r in rows" :key="r.id" class="nx-mcard">
          <div class="nx-mcard-top">
            <strong class="nx-mcard-title">{{ r.target }}</strong>
            <el-switch :model-value="r.enabled" :aria-label="'Regra ' + r.target + ' ligada'" @change="v => toggle(r, v)"/>
          </div>
          <div class="nx-small nx-muted">{{ r.kindLabel }}</div>
          <div class="nx-small">{{ r.summary }}</div>
          <div class="nx-mcard-actions">
            <el-button size="small" @click="openForm(r)">Editar</el-button>
            <el-button size="small" @click="remove(r)"><span class="nx-danger-text">Excluir</span></el-button>
          </div>
        </li>
      </ul>
      <el-table v-else-if="!isMobile" :data="rows" v-loading="loading" row-key="id" aria-label="Regras" empty-text=" ">
        <el-table-column label="Alvo" min-width="200">
          <template #default="{ row }">
            <div class="nx-name">{{ row.target }}</div>
            <div class="nx-small nx-muted">{{ row.kindLabel }}</div>
          </template>
        </el-table-column>
        <el-table-column label="O que muda" min-width="320"><template #default="{ row }">{{ row.summary }}</template></el-table-column>
        <el-table-column label="Ligada" width="100">
          <template #default="{ row }"><el-switch :model-value="row.enabled" :aria-label="'Regra ' + row.target + ' ligada'" @change="v => toggle(row, v)"/></template>
        </el-table-column>
        <el-table-column label="Ações" width="160" fixed="right">
          <template #default="{ row }">
            <div class="nx-row-actions">
              <el-button size="small" @click="openForm(row)">Editar</el-button>
              <el-button size="small" @click="remove(row)"><span class="nx-danger-text">Excluir</span></el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" :image-size="72" description="Nenhuma regra ainda.">
        <p class="nx-empty-hint">Exemplo: bloquear transferência de arquivos e terminal em um cliente sensível. A regra da máquina vale mais que a do cliente.</p>
        <el-button type="primary" @click="openForm()">Nova regra</el-button>
      </el-empty>
    </div>

    <el-dialog v-model="f.visible" :title="f.id ? 'Editar regra' : 'Nova regra'" width="min(640px, 92vw)" align-center class="nx-pol-dlg" :close-on-click-modal="false">
      <el-form label-position="top" class="nx-form" @submit.prevent>
        <el-radio-group v-model="f.kind" :disabled="!!f.id" class="nx-kind" @change="f.ref = null">
          <el-radio-button value="group">Cliente</el-radio-button>
          <el-radio-button value="peer">Máquina</el-radio-button>
        </el-radio-group>
        <el-form-item :label="f.kind === 'group' ? 'Cliente (vale também para os subgrupos)' : 'Máquina'" required class="is-required nx-target">
          <el-select v-model="f.ref" filterable :disabled="!!f.id" :placeholder="f.kind === 'group' ? 'Escolha o cliente' : 'Escolha a máquina'">
            <template v-if="f.kind === 'group'">
              <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="String(g.id)"/>
            </template>
            <template v-else>
              <el-option v-for="p in peers" :key="p.id" :label="(p.alias || p.hostname || p.id) + ' (' + p.id + ')'" :value="p.id"/>
            </template>
          </el-select>
        </el-form-item>

        <p class="nx-help">Para cada item, <strong>Padrão</strong> deixa como o app já está.</p>
        <div class="nx-opts">
          <div v-for="o in CATALOG" :key="o.key" class="nx-opt">
            <div class="nx-opt-text"><strong>{{ o.label }}</strong><span>{{ o.hint }}</span></div>
            <el-radio-group v-model="f.opts[o.key]" size="small" :aria-label="o.label">
              <el-radio-button value="">Padrão</el-radio-button>
              <el-radio-button value="Y">Permitir</el-radio-button>
              <el-radio-button value="N">Bloquear</el-radio-button>
            </el-radio-group>
          </div>
          <div class="nx-opt">
            <div class="nx-opt-text"><strong>Modo de acesso</strong><span>Somente visualizar bloqueia teclado, mouse e tudo mais.</span></div>
            <el-radio-group v-model="f.opts['access-mode']" size="small" aria-label="Modo de acesso">
              <el-radio-button value="">Padrão</el-radio-button>
              <el-radio-button value="view">Só visualizar</el-radio-button>
            </el-radio-group>
          </div>
        </div>
        <el-switch v-model="f.enabled" active-text="Regra ligada" class="nx-on"/>
        <el-alert type="info" show-icon :closable="false" class="nx-note"
                  title="O modo de aprovação e a senha do app ficam por conta da Senha dos servidores; esta tela não mexe neles."/>
      </el-form>
      <template #footer>
        <el-button @click="f.visible = false">Cancelar</el-button>
        <el-button type="primary" :loading="f.saving" :disabled="!f.ref" @click="save">Salvar</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useMediaQuery } from '@vueuse/core'
  import { list as peerList } from '@/api/peer'
  import { list as groupList } from '@/api/device_group'
  import { policiesList, policySave } from '@/nextec/api'

  const CATALOG = [
    { key: 'enable-file-transfer', label: 'Transferência de arquivos', hint: 'Enviar e baixar arquivos.' },
    { key: 'enable-clipboard', label: 'Área de transferência', hint: 'Copiar e colar entre os computadores.' },
    { key: 'enable-terminal', label: 'Terminal', hint: 'Linha de comando remota.' },
    { key: 'enable-keyboard', label: 'Teclado e mouse', hint: 'Controlar a máquina (sem isso, só vê a tela).' },
    { key: 'enable-audio', label: 'Áudio', hint: 'Ouvir o som da máquina.' },
    { key: 'enable-tunnel', label: 'Túnel de portas (TCP)', hint: 'Redirecionar portas pela conexão.' },
    { key: 'enable-remote-restart', label: 'Reiniciar a máquina', hint: 'Reiniciar o computador remotamente.' },
    { key: 'enable-record-session', label: 'Gravar a sessão', hint: 'Gravação da tela pelo técnico.' },
    { key: 'enable-block-input', label: 'Bloquear o usuário local', hint: 'Travar teclado e mouse de quem está na máquina.' },
    { key: 'enable-camera', label: 'Câmera', hint: 'Ver a câmera da máquina.' },
    { key: 'enable-remote-printer', label: 'Impressora remota', hint: 'Imprimir na máquina remota.' },
  ]
  const WORD = { Y: 'permite', N: 'bloqueia' }

  const isMobile = useMediaQuery('(max-width: 768px)')
  const loading = ref(false)
  const list = ref([])
  const peers = ref([])
  const groups = ref([])

  const load = async () => {
    loading.value = true
    const [o, p, g] = await Promise.all([
      policiesList().catch(() => false),
      peerList({ page: 1, page_size: 10000 }).catch(() => false),
      groupList({ page: 1, page_size: 999 }).catch(() => false),
    ])
    loading.value = false
    if (o) list.value = o.data.list || []
    if (p) peers.value = p.data.list || []
    if (g) groups.value = g.data.list || []
  }
  onMounted(load)

  const parse = (s) => { try { return JSON.parse(s || '{}') } catch (e) { return {} } }
  const rows = computed(() => list.value.map(p => {
    const opts = parse(p.options)
    const items = Object.entries(opts).map(([k, v]) => {
      if (k === 'access-mode') return v === 'view' ? 'só visualizar' : `modo de acesso ${v}`
      const c = CATALOG.find(x => x.key === k)
      return `${WORD[v] || v} ${c ? c.label.toLowerCase() : k}`
    })
    let target = p.ref
    if (p.kind === 'group') target = groups.value.find(g => String(g.id) === p.ref)?.name || `Cliente ${p.ref}`
    else { const m = peers.value.find(x => x.id === p.ref); target = m ? `${m.alias || m.hostname || m.id} (${m.id})` : p.ref }
    return { ...p, opts, target, kindLabel: p.kind === 'group' ? 'Cliente' : 'Máquina', summary: items.length ? items.join(', ') : 'Nada alterado (tudo no padrão)' }
  }))

  // ---------- editar ----------
  const emptyOpts = () => Object.fromEntries([...CATALOG.map(o => [o.key, '']), ['access-mode', '']])
  const f = reactive({ visible: false, saving: false, id: 0, kind: 'group', ref: null, enabled: true, opts: emptyOpts() })
  const openForm = (row) => {
    Object.assign(f, { visible: true, saving: false, id: row ? row.id : 0, kind: row ? row.kind : 'group', ref: row ? row.ref : null, enabled: row ? row.enabled : true,
      opts: { ...emptyOpts(), ...(row ? row.opts : {}) } })
  }
  const send = async (payload) => policySave(payload).catch(() => false)
  const save = async () => {
    f.saving = true
    const res = await send({ kind: f.kind, ref: String(f.ref), enabled: f.enabled, options: { ...f.opts } })
    f.saving = false
    if (res) { f.visible = false; ElMessage.success('Regra salva. O app aplica em alguns segundos.'); load() }
  }
  const toggle = async (row, v) => {
    const res = await send({ kind: row.kind, ref: row.ref, enabled: v, options: row.opts })
    if (res) { ElMessage.success(v ? 'Regra ligada.' : 'Regra desligada.'); load() }
  }
  const remove = async (row) => {
    const c = await ElMessageBox.confirm(`Excluir a regra de ${row.target}? Os apps voltam ao padrão em alguns segundos.`, 'Excluir regra',
      { confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', type: 'warning' }).catch(() => false)
    if (!c) return
    const res = await send({ kind: row.kind, ref: row.ref, enabled: false, options: {}, remove: true })
    if (res) { ElMessage.success('Regra excluída.'); load() }
  }
</script>

<style scoped lang="scss">
  .nx-pol { max-width: 1100px; }
  .nx-bar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 14px 18px; margin-bottom: 16px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); }
  .nx-bar-text { margin: 0; flex: 1 1 320px; font-size: 13px; color: var(--nx-text-muted); }
  .nx-bar-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; .el-button + .el-button { margin-left: 0; } }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-name { font-weight: 600; color: var(--nx-text); }
  .nx-small { font-size: 12px; }
  .nx-muted { color: var(--nx-text-subtle); }
  .nx-empty-hint { margin: 0 0 12px; color: var(--nx-text-muted); font-size: 13px; max-width: 420px; }
  .nx-danger-text { color: #BA1A1A; }
  html.dark .nx-danger-text { color: #FF9C93; }
  .nx-row-actions { display: flex; gap: 6px; flex-wrap: nowrap; .el-button { margin: 0 !important; } }
  .nx-cards { list-style: none; margin: 0; padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
  .nx-mcard { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 14px; background: var(--nx-bg); }
  .nx-mcard-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .nx-mcard-title { color: var(--nx-text); font-size: 15px; min-width: 0; overflow-wrap: anywhere; }
  .nx-mcard-actions { display: flex; gap: 8px; margin-top: 4px; .el-button { margin: 0; } }
  .nx-kind { margin-bottom: 14px; }
  .nx-help { margin: 0 0 8px; font-size: 12px; color: var(--nx-text-muted); }
  .nx-opts { display: flex; flex-direction: column; border: 1px solid var(--nx-border); border-radius: 14px; overflow: hidden; margin-bottom: 14px; }
  .nx-opt { display: flex; justify-content: space-between; align-items: center; gap: 12px 16px; flex-wrap: wrap; padding: 10px 14px; & + & { border-top: 1px solid var(--nx-divider); } }
  .nx-opt-text { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; strong { font-size: 14px; color: var(--nx-text); } span { font-size: 12px; color: var(--nx-text-muted); } }
  .nx-on { margin-bottom: 14px; }
  .nx-note { border-radius: 12px; }
  .nx-form :deep(.el-select) { width: 100%; }
  @media (max-width: 768px) { .nx-bar-right { margin-left: 0; width: 100%; } }
</style>

<style lang="scss">
  /* diálogos são teleportados: o corpo rola e os botões ficam sempre à vista */
  .nx-pol-dlg .el-dialog__body { max-height: 62vh; overflow-y: auto; }
</style>
