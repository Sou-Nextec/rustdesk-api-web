<template>
  <section v-if="!loaded || enabled" class="nx-wait" aria-labelledby="nx-wait-title">
    <div class="nx-card-head">
      <div>
        <h2 id="nx-wait-title" class="nx-h2">Aguardando atendimento</h2>
        <p class="nx-sub">Quem abre o app de suporte aparece aqui na hora.</p>
      </div>
      <div class="nx-head-actions">
        <el-button :disabled="!hasApp" @click="copy(link, 'Link copiado.')">Copiar link de suporte</el-button>
        <el-button :disabled="!hasApp" type="primary" @click="copy(message, 'Mensagem copiada.')">Copiar mensagem</el-button>
      </div>
    </div>

    <el-alert v-if="loaded && !hasApp" type="warning" show-icon :closable="false" class="nx-alert"
              title="O app de suporte ainda não foi enviado.">
      <template #default>
        <router-link v-if="isAdmin" to="/user/support" class="nx-link">Enviar o app em Dispositivos &gt; Suporte avulso</router-link>
        <span v-else>Peça a um administrador para enviar o app em Dispositivos &gt; Suporte avulso.</span>
      </template>
    </el-alert>

    <div v-if="!loaded" class="nx-pad"><el-skeleton animated :rows="2"/></div>
    <el-empty v-else-if="!list.length && hasApp" :image-size="56" description="Ninguém aguardando agora.">
      <p class="nx-empty-hint">Mande o link ao cliente. Quando ele abrir o app, a máquina aparece aqui para você conectar.</p>
    </el-empty>
    <ul v-else class="nx-wlist" aria-live="polite">
      <li v-for="p in list" :key="p.id">
        <span class="nx-dot is-on" aria-hidden="true"></span>
        <span class="nx-wtext">
          <strong>{{ p.alias || p.hostname || 'Computador sem nome' }}</strong>
          <span>{{ [p.username, osShort(p.os), fmtId(p.id), 'abriu ' + timeAgo(p.created_at * 1000)].filter(Boolean).join(' · ') }}</span>
        </span>
        <el-button size="small" type="primary" @click="connectDevice(p.id)">Conectar</el-button>
      </li>
    </ul>
    <p v-if="loaded && list.length" class="nx-note">Ao conectar, a pessoa precisa clicar em Aceitar no app. Depois, vincule a máquina a um cliente em Dispositivos, se for atender de novo.</p>
  </section>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { fmtId, rawId } from '@/nextec/id'
  import { ElMessage } from 'element-plus'
  import { timeAgo } from '@/utils/time'
  import { useUserStore } from '@/store/user'
  import { connectDevice } from '@/nextec/connect'
  import { supportWaiting } from '@/nextec/api'

  const userStore = useUserStore()
  const isAdmin = computed(() => (userStore.route_names || []).includes('*'))
  const list = ref([])
  const hasApp = ref(false)
  const enabled = ref(true) // o servidor decide quem vê; sem permissão ele nem manda a lista
  const loaded = ref(false)
  let timer = null

  const link = computed(() => `${window.location.origin}/suporte`)
  const message = computed(() => `Olá! Para o atendimento remoto, abra este link, baixe o aplicativo de suporte da Nextec e me avise quando ele estiver aberto: ${link.value}`)
  const osShort = (os) => String(os || '').split('/')[0].trim()

  const load = async () => {
    const res = await supportWaiting().catch(() => false)
    if (res) {
      list.value = res.data.list || []
      hasApp.value = !!res.data.has_app
      enabled.value = res.data.enabled !== false
    }
    loaded.value = true
  }
  // atualiza a cada 10 s enquanto a aba está visível
  const tick = () => { if (!document.hidden) load() }
  onMounted(() => { load(); timer = setInterval(tick, 10000) })
  onBeforeUnmount(() => clearInterval(timer))

  defineExpose({ refresh: load })

  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); ElMessage.success(msg) } catch (e) { ElMessage.error('Não foi possível copiar.') }
  }
</script>

<style scoped lang="scss">
  .nx-wait { margin-bottom: 16px; background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px 16px; flex-wrap: wrap; padding: 18px 22px; border-bottom: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-sub { margin: 2px 0 0; font-size: 12px; color: var(--nx-text-muted); }
  .nx-head-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-alert { margin: 14px 16px 0; border-radius: 12px; }
  .nx-link { color: var(--el-color-primary); font-weight: 600; }
  .nx-pad { padding: 18px 22px; }
  .nx-empty-hint { margin: 0; color: var(--nx-text-muted); font-size: 13px; max-width: 380px; }
  .nx-wlist { list-style: none; margin: 0; padding: 6px 8px; }
  .nx-wlist li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; &:hover { background: var(--nx-tint); } }
  .nx-wtext {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
    strong { font-size: 14px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    span { font-size: 12px; color: var(--nx-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }
  .nx-note { margin: 0; padding: 4px 22px 16px; font-size: 12px; color: var(--nx-text-muted); }
  .nx-dot {
    flex: none; width: 8px; height: 8px; border-radius: 50%;
    &.is-on { background: #0F7B55; box-shadow: 0 0 0 3px #D1FAE5; }
  }
  html.dark .nx-dot.is-on { background: #4CC38A; box-shadow: 0 0 0 3px rgba(76, 195, 138, 0.22); }
  @media (max-width: 560px) { .nx-head-actions { width: 100%; .el-button { flex: 1 1 auto; } } }
</style>
