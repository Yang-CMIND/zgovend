<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'

const { init, profile } = useLiff()
const tickets = ref<any[]>([])
const loading = ref(true)

const statusLabel: Record<string, string> = {
  open: '待處理', in_progress: '處理中', resolved: '已解決', closed: '已結案'
}
const statusColor: Record<string, string> = {
  open: '#f59e0b', in_progress: '#667eea', resolved: '#38a169', closed: '#888'
}
const categoryLabel: Record<string, string> = {
  product_issue: '商品問題', machine_issue: '機台問題', payment_issue: '付款問題', other: '其他'
}

function timeAgo(ts: number) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}分鐘前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}小時前`
  const days = Math.floor(hrs / 24)
  return `${days}天前`
}

onMounted(async () => {
  await init()
  try {
    const data = await gql(`query($uid: String!) { myTickets(lineUserId: $uid) {
      ticketId subject status operatorId category updatedAt
    } }`, { uid: profile.value?.userId || '' })
    tickets.value = data.myTickets || []
  } finally { loading.value = false }
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '我的問題單' },
    ]" />
    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="!tickets.length" class="empty">尚無問題單</div>
    <router-link v-for="t in tickets" :key="t.ticketId" :to="`/consumer/tickets/${t.ticketId}`" class="card">
      <div class="card-top">
        <span class="ticket-id">{{ t.ticketId }}</span>
        <span class="badge" :style="{ background: statusColor[t.status] }">{{ statusLabel[t.status] }}</span>
      </div>
      <div class="subject">{{ t.subject }}</div>
      <div class="meta">
        <span>{{ categoryLabel[t.category] || t.category }}</span>
        <span>{{ t.operatorId }}</span>
        <span>{{ timeAgo(t.updatedAt) }}</span>
      </div>
    </router-link>
  </div>
</template>

<style scoped>
.page { max-width: 480px; margin: 0 auto; padding: 16px; }
.loading, .empty { text-align: center; color: #888; padding: 40px 0; }
.card {
  display: block; padding: 14px; margin-bottom: 10px; background: #fff;
  border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.08); text-decoration: none; color: inherit;
}
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.ticket-id { font-size: 12px; color: #999; }
.badge { color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 10px; }
.subject { font-weight: 600; font-size: 15px; margin-bottom: 6px; }
.meta { display: flex; gap: 12px; font-size: 12px; color: #888; }
</style>
