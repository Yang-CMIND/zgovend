<script setup lang="ts">
export interface Crumb {
  label: string
  to?: string  // 沒有 to 代表當前頁（不可點）
}

defineProps<{
  crumbs: Crumb[]
}>()
</script>

<template>
  <header class="page-header">
    <router-link to="/" class="home-btn">🏠</router-link>
    <nav class="breadcrumbs">
      <template v-for="(crumb, i) in crumbs" :key="i">
        <span v-if="i > 0" class="sep">/</span>
        <router-link v-if="crumb.to" :to="crumb.to" class="crumb-link">{{ crumb.label }}</router-link>
        <span v-else class="crumb-current">{{ crumb.label }}</span>
      </template>
    </nav>
    <div class="header-slot"><slot /></div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 10;
}
.home-btn {
  text-decoration: none;
  font-size: 18px;
  flex-shrink: 0;
}
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  font-size: 15px;
}
.sep {
  color: #ccc;
  font-size: 13px;
}
.crumb-link {
  color: #4a90d9;
  text-decoration: none;
  font-weight: 400;
}
.crumb-link:active {
  opacity: 0.6;
}
.crumb-current {
  font-weight: 600;
  color: #333;
}
.header-slot {
  flex-shrink: 0;
  margin-left: auto;
}
</style>
