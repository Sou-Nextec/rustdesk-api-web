<template>
  <el-dialog :model-value="modelValue" title="Foto de perfil" width="440px" append-to-body @update:model-value="v => emit('update:modelValue', v)">
    <div class="nx-pp">
      <div class="nx-pp-preview" :class="{ 'is-empty': !preview }" aria-hidden="true">
        <img v-if="preview" :src="preview" alt="">
        <span v-else>{{ initial }}</span>
      </div>
      <div class="nx-pp-info">
        <p>Esta foto aparece no app RustDesk de quem você acessa, na janela que pede permissão para a sessão, no lugar da inicial do seu nome.</p>
        <input ref="file" type="file" accept="image/png,image/jpeg,image/webp" class="nx-pp-file" @change="onFile">
        <el-button @click="file.click()">Escolher foto</el-button>
        <el-button v-if="preview" text type="danger" @click="clear">Remover</el-button>
        <p v-if="error" class="nx-pp-error" role="alert">{{ error }}</p>
        <p class="nx-pp-hint">A imagem é recortada em quadrado e reduzida automaticamente.</p>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">Cancelar</el-button>
      <el-button type="primary" :loading="saving" :disabled="!changed" @click="save">Salvar</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { useUserStore } from '@/store/user'
  import { setAvatar } from '@/nextec/api'

  const props = defineProps({ modelValue: Boolean })
  const emit = defineEmits(['update:modelValue'])
  const userStore = useUserStore()
  const file = ref()
  const preview = ref('')
  const original = ref('')
  const saving = ref(false)
  const error = ref('')
  const initial = computed(() => String(userStore.nickname || userStore.username || '?').trim().charAt(0).toUpperCase())
  const changed = computed(() => preview.value !== original.value)

  watch(() => props.modelValue, v => {
    if (v) { preview.value = original.value = userStore.avatar || ''; error.value = '' }
  })

  // recorta no centro, reduz para 128 x 128 e codifica em JPEG (cabe folgado nos 150 KB da API)
  const onFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    error.value = ''
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { error.value = 'Use uma imagem PNG, JPEG ou WebP.'; return }
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const c = document.createElement('canvas')
      c.width = c.height = 128
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 128, 128)
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 128, 128)
      preview.value = c.toDataURL('image/jpeg', 0.9)
      URL.revokeObjectURL(url)
    }
    img.onerror = () => { error.value = 'Não foi possível ler essa imagem.'; URL.revokeObjectURL(url) }
    img.src = url
  }
  const clear = () => { preview.value = ''; error.value = '' }

  const save = async () => {
    saving.value = true
    const res = await setAvatar(preview.value).catch(() => false)
    saving.value = false
    if (res) {
      userStore.avatar = preview.value
      ElMessage.success(preview.value ? 'Foto atualizada.' : 'Foto removida.')
      emit('update:modelValue', false)
    }
  }
</script>

<style scoped lang="scss">
  .nx-pp { display: flex; gap: 20px; align-items: flex-start; }
  .nx-pp-preview {
    flex: none; width: 96px; height: 96px; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
    background: var(--nx-accent); color: #fff; font-family: var(--nx-font-title); font-size: 40px; font-weight: 700;
    img { width: 100%; height: 100%; object-fit: cover; }
  }
  .nx-pp-info { min-width: 0; p { margin: 0 0 12px; font-size: 13px; line-height: 1.5; color: var(--nx-text-muted); } }
  .nx-pp-file { display: none; }
  .nx-pp-error { color: #BA1A1A !important; margin-top: 10px !important; }
  .nx-pp-hint { margin-top: 12px !important; font-size: 12px !important; }
  @media (max-width: 480px) { .nx-pp { flex-direction: column; align-items: center; text-align: center; } }
  html.dark .nx-pp-error { color: #FF9C93 !important; }
</style>
