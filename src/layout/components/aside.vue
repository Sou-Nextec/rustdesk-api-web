<template>
  <div class="aside-box">
    <!-- só esta área rola; o rodapé abaixo fica fora dela e nada o cobre -->
    <el-scrollbar class="scroll-sidebar">
      <menus></menus>
    </el-scrollbar>
    <div class="nx-aside-version" :class="{ 'is-collapsed': collapsed }" :title="fullTitle">
      <span class="nx-aside-version-main">{{ collapsed ? shortLabel : 'Painel ' + shortLabel }}</span>
      <span v-if="build && !collapsed" class="nx-aside-version-build">master-{{ build }}</span>
    </div>
  </div>
</template>
<script>
  import Menus from '@/layout/components/menu/index.vue'
  import { defineComponent, computed } from 'vue'
  import { useAppStore } from '@/store/app'
  import { NEXTEC_VERSION_LABEL, NEXTEC_BUILD } from '@/nextec/version'

  export default defineComponent({
    name: 'GAside',
    components: { Menus },
    setup () {
      const app = useAppStore()
      const collapsed = computed(() => !!app.setting.sideIsCollapse)
      const build = NEXTEC_BUILD
      const shortLabel = NEXTEC_VERSION_LABEL
      const fullTitle = 'Painel ' + NEXTEC_VERSION_LABEL + (build ? ' (master-' + build + ')' : '')
      return { collapsed, build, shortLabel, fullTitle }
    },
  })
</script>

<style scoped lang="scss">
.aside-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: #2d3a4b;
}
.scroll-sidebar {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  background-color: #2d3a4b;
}
.nx-aside-version {
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: text;
}
.nx-aside-version-build { font-size: 10px; color: rgba(255, 255, 255, 0.55); }
</style>
