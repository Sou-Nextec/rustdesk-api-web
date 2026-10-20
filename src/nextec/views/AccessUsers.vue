<template>
  <div class="nx-access">
    <el-card shadow="hover" class="nx-bar">
      <el-input v-model="q" clearable placeholder="Buscar por usuário, nome ou equipe" style="max-width: 360px" aria-label="Buscar pessoas"/>
      <span class="nx-muted nx-count">{{ shown.length }} de {{ users.length }} pessoas</span>
      <el-button class="nx-reload" @click="load">Atualizar</el-button>
    </el-card>

    <el-card shadow="hover">
      <el-table :data="shown" v-loading="loading" border empty-text="Nenhuma pessoa encontrada.">
        <el-table-column prop="username" label="Usuário" min-width="130"/>
        <el-table-column prop="nickname" label="Nome" min-width="150"/>
        <el-table-column label="Equipe" min-width="140"><template #default="{ row }">{{ row.team || 'Sem equipe' }}</template></el-table-column>
        <el-table-column label="Clientes" width="100" align="center"><template #default="{ row }">{{ row.is_admin ? 'Todos' : row.clients }}</template></el-table-column>
        <el-table-column label="Máquinas avulsas" width="140" align="center"><template #default="{ row }">{{ row.is_admin ? '-' : row.machines }}</template></el-table-column>
        <el-table-column label="Situação" width="100" align="center">
          <template #default="{ row }"><el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? 'Ativo' : 'Desativado' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="" width="120" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain :disabled="row.is_admin" :title="row.is_admin ? 'Administrador vê tudo' : ''" @click="open(row)">Ver acesso</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <AccessDialog v-model="dlg.visible" :target-type="1" :target-id="dlg.id" :name="dlg.name" @changed="load"/>
  </div>
</template>

<script setup>
  // Usuários e Permissões: o que cada pessoa enxerga (clientes e máquinas avulsas), com a origem (direto ou pela equipe).
  // Conceder uma máquina avulsa cria uma lista própria só com ela (caso do técnico que só atende um servidor).
  import { computed, onActivated, onMounted, reactive, ref } from 'vue'
  import { accessUsers } from '@/nextec/api'
  import AccessDialog from '@/nextec/views/AccessDialog.vue'
  import { filterUsers } from '@/nextec/access-items.mjs'

  const users = ref([])
  const loading = ref(false)
  const q = ref('')
  const shown = computed(() => filterUsers(users.value, q.value))
  const dlg = reactive({ visible: false, id: 0, name: '' })

  const load = async () => {
    loading.value = true
    const r = await accessUsers().catch(() => false)
    loading.value = false
    if (r) users.value = r.data.list || []
  }
  const open = (row) => { dlg.id = row.user_id; dlg.name = row.nickname || row.username; dlg.visible = true }

  onMounted(load)
  onActivated(load)
</script>

<style scoped>
  .nx-access { display: grid; gap: 12px; }
  .nx-bar :deep(.el-card__body) { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .nx-count { font-size: 13px; }
  .nx-muted { color: var(--nx-text-muted, #6b7280); }
  .nx-reload { margin-left: auto; }
</style>
