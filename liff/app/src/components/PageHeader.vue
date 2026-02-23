<script setup lang="ts">
import { ref } from 'vue'

export interface Crumb {
  label: string
  to?: string  // 沒有 to 代表當前頁（不可點）
}

const props = defineProps<{
  crumbs: Crumb[]
  onRefresh?: () => Promise<void> | void
}>()

const refreshing = ref(false)

async function handleRefresh() {
  if (!props.onRefresh || refreshing.value) return
  refreshing.value = true
  try {
    await props.onRefresh()
  } finally {
    refreshing.value = false
  }
}
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
    <div class="header-actions">
      <button v-if="onRefresh" class="refresh-btn" @click="handleRefresh" :disabled="refreshing" title="重新整理">
        <span :class="{ spinning: refreshing }">🔄</span>
      </button>
      <slot />
    </div>
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
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}
.refresh-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.refresh-btn:hover {
  opacity: 1;
}
.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.3;
}
.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
