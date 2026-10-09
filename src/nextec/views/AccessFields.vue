<template>
  <div class="nx-af">
    <el-select v-model="model.teams" multiple filterable collapse-tags collapse-tags-tooltip placeholder="Equipes" aria-label="Equipes">
      <el-option v-for="g in teams" :key="g.id" :label="g.name" :value="g.id"/>
    </el-select>
    <el-select v-model="model.users" multiple filterable collapse-tags collapse-tags-tooltip placeholder="Pessoas" aria-label="Pessoas">
      <el-option v-for="u in users" :key="u.id" :label="u.nickname && u.nickname !== u.username ? `${u.nickname} (${u.username})` : u.username" :value="u.id"/>
    </el-select>
    <el-select v-model="model.rule" aria-label="O que podem fazer">
      <el-option label="Ver e conectar" :value="1"/>
      <el-option label="Ver, conectar e editar a lista" :value="2"/>
    </el-select>
  </div>
</template>

<script setup>
  // Escolha de equipes, pessoas e nível de acesso (usada nos modelos e nos subgrupos em lote)
  defineProps({
    model: { type: Object, required: true }, // { teams: [], users: [], rule: 1 }
    teams: { type: Array, default: () => [] },
    users: { type: Array, default: () => [] },
  })
</script>

<style scoped lang="scss">
  .nx-af { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; width: 100%; }
  @media (max-width: 768px) { .nx-af { grid-template-columns: minmax(0, 1fr); } }
</style>
