// Testes de montagem do painel (navegação entre telas) em jsdom. Os testes antigos (node --test) não passam por aqui.
import { defineConfig } from 'vitest/config'
import * as path from 'path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  define: { 'import.meta.env.VITE_SERVER_API': JSON.stringify('/api') },
  css: { preprocessorOptions: { scss: { javascriptEnabled: true } } },
  test: {
    environment: 'jsdom',
    include: ['nextec/testes/*.spec.mjs'],
    css: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    server: { deps: { inline: [/element-plus/] } },
  },
})
