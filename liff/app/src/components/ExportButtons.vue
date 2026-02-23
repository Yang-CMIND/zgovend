<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { downloadCsv, printPage } from '../composables/useExport'

const props = defineProps<{
  filename: string
  headers: string[]
  rows: () => string[][]
}>()

const isDesktop = ref(false)

onMounted(() => {
  isDesktop.value = window.innerWidth >= 768 && !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
})

function onCsv() {
  downloadCsv(props.filename + '.csv', props.headers, props.rows())
}
</script>

<template>
  <template v-if="isDesktop">
    <button class="export-btn" @click="onCsv" title="下載 CSV">📥</button>
    <button class="export-btn" @click="printPage" title="列印">🖨️</button>
  </template>
</template>

<style scoped>
.export-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.export-btn:hover { opacity: 1; }
</style>
