<template>
  <el-dialog :model-value="modelValue" :title="title" width="880px" append-to-body destroy-on-close @update:model-value="v => emit('update:modelValue', v)" @open="load">
    <div v-loading="loading">
      <p class="nx-muted nx-intro">{{ intro }}</p>

      <el-table :data="rows" size="small" border empty-text="Nenhum acesso concedido ainda.">
        <el-table-column label="Tipo" width="112">
          <template #default="{ row }"><el-tag size="small" :type="row.kind === 'client' ? 'primary' : 'warning'">{{ row.kind === 'client' ? 'Cliente' : 'Máquina' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="label" label="Nome" min-width="190" show-overflow-tooltip/>
        <el-table-column label="Máquinas" width="92" align="center"><template #default="{ row }">{{ row.machines }}</template></el-table-column>
        <el-table-column label="Nível" width="150">
          <template #default="{ row }">
            <el-select v-if="canChange(row)" :model-value="row.rule" size="small" @change="v => changeRule(row, v)">
              <el-option label="Somente ver" :value="1"/>
              <el-option label="Controle total" :value="2"/>
            </el-select>
            <span v-else>{{ ruleText(row.rule) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="isUser" label="Origem" width="165"><template #default="{ row }">{{ originText(row.origin) }}</template></el-table-column>
        <el-table-column label="" width="96" align="center">
          <template #default="{ row }">
            <el-button v-if="canChange(row)" size="small" type="danger" link @click="remove(row)">Remover</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-divider content-position="left">Conceder acesso</el-divider>
      <el-radio-group v-model="add.scope" size="small" class="nx-scope">
        <el-radio-button value="client">Cliente ou subgrupo</el-radio-button>
        <el-radio-button value="machine">Máquina avulsa</el-radio-button>
      </el-radio-group>
      <el-form label-width="90px" @submit.prevent>
        <template v-if="add.scope === 'client'">
          <GroupPicker v-model="add.groupId" :groups="groups" required placeholder="Escolha o cliente"/>
        </template>
        <el-form-item v-else label="Máquina">
          <el-select v-model="add.peerId" filterable remote clearable :remote-method="searchPeers" :loading="searching"
                     placeholder="Digite o nome ou o ID da máquina" style="width: 100%">
            <el-option v-for="p in peers" :key="p.id" :value="p.id" :label="peerLabel(p)"/>
          </el-select>
        </el-form-item>
        <el-form-item label="Nível">
          <el-radio-group v-model="add.rule">
            <el-radio :value="1">Somente ver</el-radio>
            <el-radio :value="2">Controle total</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" :disabled="!canAdd" @click="grant">Conceder</el-button>
          <span v-if="add.scope === 'machine'" class="nx-muted nx-note">A pessoa passa a ver só essa máquina, sem enxergar o resto do cliente.</span>
        </el-form-item>
      </el-form>
    </div>
  </el-dialog>
</template>

<script setup>
  // Concede e tira acesso de uma equipe (targetType 2) ou de uma pessoa (1) a clientes, subgrupos e máquinas avulsas.
  // As regras são as da tela Permissões por cliente (a lista "Cliente: X" é do admin que concede); o servidor faz tudo em uma chamada.
  import { computed, reactive, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { list as groupList } from '@/api/device_group'
  import { accessGrant, accessTeam, accessUser, devicesList } from '@/nextec/api'
  import GroupPicker from '@/nextec/views/GroupPicker.vue'
  import { TARGET_USER, TARGET_TEAM, ruleText, originText, splitItems, grantPayload, removableOnUser } from '@/nextec/access-items.mjs'
  import { fmtId } from '@/nextec/id'

  const props = defineProps({
    modelValue: { type: Boolean, default: false },
    targetType: { type: Number, default: TARGET_TEAM },
    targetId: { type: Number, default: 0 },
    name: { type: String, default: '' },
  })
  const emit = defineEmits(['update:modelValue', 'changed'])

  const isUser = computed(() => props.targetType === TARGET_USER)
  const title = computed(() => (isUser.value ? 'Acesso de ' : 'Acesso da equipe ') + props.name)
  const intro = computed(() => (isUser.value
    ? 'O acesso efetivo soma o que foi dado direto à pessoa e o que vem da equipe dela. Aqui só se tira o acesso direto.'
    : 'Todos da equipe passam a ver o que está nesta lista, no app RustDesk (aba Lista de endereços).'))

  const loading = ref(false)
  const saving = ref(false)
  const items = ref([])
  const groups = ref([])
  const rows = computed(() => { const s = splitItems(items.value); return [...s.clients, ...s.machines, ...s.other] })
  const add = reactive({ scope: 'client', groupId: null, peerId: '', rule: 1 })

  const canAdd = computed(() => (add.scope === 'client' ? add.groupId > 0 : !!add.peerId))
  // na tela da pessoa só o acesso direto muda; na da equipe, tudo o que está na lista
  const canChange = (row) => (isUser.value ? removableOnUser(row) : row.kind !== 'other')

  const load = async () => {
    if (!props.targetId) return
    loading.value = true
    const [r, g] = await Promise.all([
      (isUser.value ? accessUser(props.targetId) : accessTeam(props.targetId)).catch(() => false),
      groupList({ page: 1, page_size: 999 }).catch(() => false),
    ])
    loading.value = false
    if (r) items.value = r.data.items || []
    if (g) groups.value = g.data.list || []
    Object.assign(add, { scope: 'client', groupId: null, peerId: '', rule: 1 })
  }

  const send = async (p) => {
    const res = await accessGrant(grantPayload({ targetType: props.targetType, targetId: props.targetId, ...p })).catch(() => false)
    if (res) emit('changed')
    return res
  }

  const grant = async () => {
    saving.value = true
    const res = await send({ scope: add.scope, groupId: add.groupId, peerId: add.peerId, rule: add.rule })
    saving.value = false
    if (!res) return
    ElMessage.success(res.data.changed ? 'Acesso concedido.' : 'Já tinha esse acesso.')
    await load()
  }

  const changeRule = async (row, rule) => {
    if (await send({ scope: row.kind, groupId: row.group_id, peerId: row.peer_id, rule })) { ElMessage.success('Nível alterado.'); load() }
  }

  const remove = async (row) => {
    const r = await ElMessageBox.confirm(`Tirar o acesso a ${row.label}?`, 'Remover acesso', { type: 'warning', confirmButtonText: 'Remover', cancelButtonText: 'Cancelar' }).catch(() => 'no')
    if (r === 'no') return
    if (await send({ scope: row.kind, groupId: row.group_id, peerId: row.peer_id, rule: row.rule, remove: true })) { ElMessage.success('Acesso removido.'); load() }
  }

  // busca de máquinas no servidor (a lista inteira não vem para o navegador)
  const peers = ref([])
  const searching = ref(false)
  let seq = 0
  const searchPeers = async (q) => {
    const mine = ++seq
    searching.value = true
    const r = await devicesList({ q: String(q || '').trim(), page: 1, page_size: 20, sort: 'name' }).catch(() => false)
    if (mine !== seq) return
    searching.value = false
    peers.value = r ? (r.data.list || []) : []
  }
  const peerLabel = (p) => `${p.alias || p.hostname || p.id} (${fmtId(p.id)})`
</script>

<style scoped>
  .nx-muted { color: var(--nx-text-muted, #6b7280); }
  .nx-intro { margin: 0 0 12px; font-size: 13px; }
  .nx-scope { margin-bottom: 14px; }
  .nx-note { margin-left: 12px; font-size: 12px; }
</style>
