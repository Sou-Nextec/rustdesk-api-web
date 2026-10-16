<template>
  <el-dialog :model-value="modelValue" title="Suporte rápido" width="460px" align-center destroy-on-close
             :close-on-click-modal="false" @update:model-value="$emit('update:modelValue', $event)">
    <QuickSupportForm @done="$emit('update:modelValue', false)" />
  </el-dialog>
</template>

<script setup>
  import QuickSupportForm from '@/nextec/views/QuickSupportForm.vue'

  defineProps({ modelValue: Boolean })
  defineEmits(['update:modelValue'])
</script>
