<template>
  <section class="nx-gen" aria-label="Gerar cliente">
    <!-- abre o gerador de clientes (rdgen) no mesmo domínio; o login é o do Cloudflare Access -->
    <div class="nx-card">
      <div class="nx-card-head">
        <div>
          <h2 class="nx-h2">Gerar cliente</h2>
          <p class="nx-sub">Cria o instalador do app já configurado com o servidor, a chave e a identidade da Nextec.</p>
        </div>
        <div class="nx-actions">
          <el-button type="primary" size="large" @click="open">
            <el-icon><el-icon-TopRight/></el-icon><span>Abrir o gerador</span>
          </el-button>
        </div>
      </div>
      <p class="nx-note">
        Só administradores e pessoas autorizadas geram clientes. Se o gerador mostrar
        “Você não está autorizado”, peça a um administrador para incluir o seu e-mail na lista.
      </p>
    </div>

    <!-- protocolo que o botão Conectar do painel abre no computador do técnico -->
    <div class="nx-card">
      <div class="nx-card-head">
        <div>
          <h2 class="nx-h2">Botão Conectar do painel</h2>
          <p class="nx-sub">Protocolo do app instalado nos computadores da equipe.</p>
        </div>
      </div>
      <div class="nx-scheme">
        <el-input v-model="scheme" class="nx-scheme-input" maxlength="32" placeholder="rustdesk" aria-label="Protocolo do app"
                  :disabled="loadingScheme" @keyup.enter="saveScheme">
          <template #append>://</template>
        </el-input>
        <el-button type="primary" :loading="savingScheme" @click="saveScheme">Salvar</el-button>
      </div>
      <p class="nx-note nx-note-top">
        O app gerado com o nome <code>Nextec-Connect</code> usa o protocolo <code>nextec-connect</code> (o nome em minúsculas).
        O RustDesk oficial usa <code>rustdesk</code>. Se o Windows pedir para “obter um aplicativo para abrir este link”,
        o protocolo daqui não é o do app instalado.
      </p>
    </div>

    <div class="nx-card">
      <div class="nx-card-head">
        <h2 class="nx-h2">O que preencher</h2>
      </div>
      <ul class="nx-list">
        <li><strong>Plataforma:</strong> Windows 64 ou Linux.</li>
        <li><strong>Nome da configuração e nome do aplicativo:</strong> <code>Nextec-Connect</code> (só letras, números e hífen, sem espaços).
          Para o app de suporte, use <code>Suporte-Nextec</code>.</li>
        <li><strong>Deixe em branco:</strong> ícone, logo e senha permanente. O ícone e o logo da Nextec já são o padrão.</li>
        <li><strong>Servidor, porta, chave e API:</strong> já vêm preenchidos e travados. Não altere.</li>
      </ul>
    </div>

    <div class="nx-card">
      <div class="nx-card-head">
        <h2 class="nx-h2">Depois de gerar</h2>
      </div>
      <ul class="nx-list">
        <li>O build leva de 30 a 45 minutos. A página do gerador acompanha e mostra os links do <code>.exe</code> e do <code>.msi</code> no fim.</li>
        <li>Instale numa máquina de teste e confira se o app mostra <strong>Pronto</strong>. Ela deve aparecer em Dispositivos em até 1 minuto.</li>
        <li>Para atualizar as máquinas que já têm o app, envie o <code>.msi</code> em
          <router-link to="/user/updates">Atualizações do app</router-link>.</li>
      </ul>
    </div>
  </section>
</template>

<script setup>
  import { onMounted, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { connectScheme, connectSchemeSave } from '@/nextec/api'

  // o gerador responde em /gerador/ (túnel da Cloudflare); abre em nova aba para não perder o painel
  const open = () => { window.open('/gerador/', '_blank', 'noopener') }

  const scheme = ref('rustdesk')
  const loadingScheme = ref(true)
  const savingScheme = ref(false)

  onMounted(async () => {
    const res = await connectScheme().catch(() => false)
    if (res && res.data && res.data.scheme) scheme.value = res.data.scheme
    loadingScheme.value = false
  })

  const saveScheme = async () => {
    savingScheme.value = true
    const res = await connectSchemeSave(scheme.value.trim()).catch(() => false)
    savingScheme.value = false
    if (res && res.data) {
      scheme.value = res.data.scheme
      ElMessage.success('Protocolo salvo. O botão Conectar já usa ' + res.data.scheme + '://')
    }
  }
</script>

<style scoped lang="scss">
  .nx-gen { width: 100%; }
  .nx-card { background: var(--nx-surface); border-radius: var(--nx-radius-card); box-shadow: var(--nx-shadow-card); overflow: hidden; margin-bottom: 16px; }
  .nx-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 22px; }
  .nx-card-head + .nx-list, .nx-card-head + .nx-note { border-top: 1px solid var(--nx-divider); }
  .nx-h2 { font-size: 16px; margin: 0; color: var(--nx-text); }
  .nx-sub { margin: 2px 0 0; font-size: 12px; color: var(--nx-text-muted); }
  .nx-actions { display: flex; gap: 8px; flex-wrap: wrap; .el-button { margin: 0; } }
  .nx-scheme { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 14px 22px 4px; border-top: 1px solid var(--nx-divider); }
  .nx-scheme-input { max-width: 340px; }
  .nx-note-top { padding-top: 10px; }
  .nx-note { margin: 0; padding: 14px 22px 16px; font-size: 13px; line-height: 1.5; color: var(--nx-text-muted); }
  .nx-list { margin: 0; padding: 14px 22px 16px 40px; font-size: 14px; line-height: 1.6; color: var(--nx-text); li + li { margin-top: 6px; } }
  code { padding: 1px 6px; border-radius: 6px; background: var(--nx-field); font-size: 13px; }
  @media (max-width: 560px) {
    .nx-actions { width: 100%; .el-button { flex: 1 1 auto; } }
  }
</style>
