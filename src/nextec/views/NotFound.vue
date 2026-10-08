<template>
  <main class="nx-404" aria-labelledby="nx-404-title">
    <section class="nx-404-card">
      <img :src="logo" alt="Nextec" class="nx-404-logo">
      <p class="nx-404-code" aria-hidden="true">404</p>
      <h1 id="nx-404-title" class="nx-404-title">Página não encontrada</h1>
      <p class="nx-404-text">O endereço pode estar incorreto ou a página foi removida. Volte ao início para continuar.</p>
      <el-button type="primary" @click="goHome">Voltar ao início</el-button>
    </section>
  </main>
</template>

<script setup>
  import { useRouter } from 'vue-router'
  import logo from '../assets/logo-dark.png'

  const router = useRouter()
  const goHome = () => router.replace('/')
</script>

<style scoped lang="scss">
  .nx-404 {
    min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    background-color: var(--nx-neutral);
    background-image: radial-gradient(55% 45% at 100% 0%, rgba(97, 60, 179, .16) 0%, rgba(97, 60, 179, 0) 70%);
  }
  .nx-404-card {
    max-width: 420px; width: 100%; text-align: center; padding: 40px 32px;
    background: var(--nx-surface); border-radius: 24px; box-shadow: var(--nx-shadow-card);
  }
  .nx-404-logo { width: 150px; height: auto; margin-bottom: 20px; }
  .nx-404-code { font-family: var(--nx-font-title); font-size: 64px; font-weight: 800; line-height: 1; margin: 0; color: var(--nx-accent); }
  .nx-404-title { font-size: 22px; margin: 12px 0 8px; color: var(--nx-text); }
  .nx-404-text { margin: 0 0 24px; color: var(--nx-text-muted); font-size: 14px; line-height: 1.6; }
</style>
