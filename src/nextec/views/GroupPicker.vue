<template>
  <el-form-item label="Cliente">
    <el-select :model-value="pick.client" filterable :placeholder="placeholder" @change="onClient">
      <el-option v-if="!required" label="Sem cliente" :value="0"/>
      <el-option v-for="c in clients" :key="c.value" :label="c.label" :value="c.value"/>
    </el-select>
  </el-form-item>
  <el-form-item label="Subgrupo">
    <el-select :model-value="pick.sub" :disabled="!pick.client" filterable @change="onSub">
      <el-option label="Raiz do cliente (sem subgrupo)" :value="0"/>
      <el-option v-for="s in subs" :key="s.value" :label="s.label" :value="s.value"/>
    </el-select>
  </el-form-item>
</template>

<script setup>
  // Dois selects (Cliente e Subgrupo) que juntos escolhem UM grupo. v-model é o id desse grupo: o subgrupo, o próprio cliente
  // ("raiz") ou 0 (sem cliente). Com required e valor null nada está escolhido ainda (troca em lote).
  import { computed } from 'vue'
  import { clientsOf, subsOf, pickOf, groupIdOf, keepSub } from '@/nextec/group-picker.mjs'

  const props = defineProps({
    modelValue: { type: Number, default: 0 },
    groups: { type: Array, default: () => [] },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: 'Sem cliente' },
  })
  const emit = defineEmits(['update:modelValue'])

  const empty = computed(() => props.modelValue === null || props.modelValue === undefined)
  const pick = computed(() => (empty.value ? { client: null, sub: 0 } : pickOf(props.groups, props.modelValue)))
  const clients = computed(() => clientsOf(props.groups))
  const subs = computed(() => subsOf(props.groups, pick.value.client))

  const onClient = (client) => emit('update:modelValue', groupIdOf(client, keepSub(props.groups, client, pick.value.sub)))
  const onSub = (sub) => emit('update:modelValue', groupIdOf(pick.value.client, sub))
</script>
