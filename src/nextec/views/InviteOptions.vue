<template>
  <el-form label-position="top" class="nx-io" @submit.prevent>
    <div class="nx-io-grid">
      <el-form-item label="Cliente" required>
        <el-select v-model="model.client_id" filterable placeholder="Escolha o cliente" :disabled="disabled" aria-label="Cliente">
          <el-option v-for="g in clients" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="Tipo da máquina">
        <el-radio-group v-model="model.kind" :disabled="disabled" @change="onKind">
          <el-radio-button value="server">Servidor</el-radio-button>
          <el-radio-button value="workstation">Estação</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </div>

    <div class="nx-io-grid">
      <el-form-item label="Senha automática">
        <div class="nx-io-row">
          <el-switch v-model="model.auto_password" :disabled="disabled" aria-label="Senha automática" />
          <el-select v-if="model.auto_password" v-model="model.interval_minutes" :disabled="disabled" class="nx-io-interval" aria-label="Trocar a senha a cada">
            <el-option v-for="m in intervals" :key="m.v" :label="'Troca a cada ' + m.t" :value="m.v" />
          </el-select>
        </div>
        <p class="nx-io-help">{{ model.auto_password ? 'A máquina já nasce em Senhas dos servidores, com a senha trocando sozinha.' : 'Sem troca automática: a conexão pede a senha do app.' }}</p>
      </el-form-item>
      <el-form-item label="Validade do convite">
        <el-select v-model="model.hours" :disabled="disabled" aria-label="Validade do convite">
          <el-option :value="8" label="8 horas" />
          <el-option :value="24" label="1 dia" />
          <el-option :value="72" label="3 dias" />
          <el-option :value="168" label="7 dias" />
        </el-select>
      </el-form-item>
    </div>

    <el-form-item label="Quantas máquinas usam este convite">
      <div class="nx-io-row">
        <el-radio-group v-model="model.mode" :disabled="disabled">
          <el-radio-button value="client">Várias máquinas (um link só)</el-radio-button>
          <el-radio-button value="single">Uma máquina</el-radio-button>
        </el-radio-group>
        <el-input-number v-if="model.mode === 'client'" v-model="model.max_uses" :min="2" :max="100" :disabled="disabled" aria-label="Máximo de máquinas" />
      </div>
      <p class="nx-io-help">{{ model.mode === 'client'
        ? 'Mande o mesmo link a quem for instalar: cada máquina cai direto neste cliente até o link vencer ou chegar ao limite. Cancele o convite se o link vazar.'
        : 'O convite vale para uma máquina e se encerra quando ela se inscreve.' }}</p>
    </el-form-item>
  </el-form>
</template>

<script setup>
  const props = defineProps({ model: { type: Object, required: true }, clients: { type: Array, default: () => [] }, disabled: Boolean })

  const intervals = [
    { v: 15, t: '15 min' }, { v: 30, t: '30 min' }, { v: 60, t: '1 hora' }, { v: 120, t: '2 horas' },
    { v: 360, t: '6 horas' }, { v: 720, t: '12 horas' }, { v: 1440, t: '24 horas' },
  ]
  // servidor nasce com senha automática ligada; estação, desligada (o administrador pode trocar)
  const onKind = (kind) => { props.model.auto_password = kind === 'server' }
</script>

<style scoped lang="scss">
  .nx-io-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
  .nx-io-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .nx-io-interval { flex: 1 1 190px; min-width: 190px; }
  .nx-io-help { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-muted); }
  @media (max-width: 640px) { .nx-io-grid { grid-template-columns: 1fr; } }
</style>
