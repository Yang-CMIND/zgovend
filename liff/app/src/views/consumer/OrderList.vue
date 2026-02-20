<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()
const { init, profile } = useLiff()
const orders = ref<any[]>([])
const loading = ref(true)

const statusLabel: Record<string, string> = {
  pending: '待付款', paid: '已付款', ready: '可取貨', picked_up: '已取貨', cancelled: '已取消'
}
const statusColor: Record<string, string> = {
  pending: '#f59e0b', paid: '#667eea', ready: '#38a169', picked_up: '#888', cancelled: '#e53e3e'
}

onMounted(async () => {
  await init()
  try {
    const uid = profile.value?.userId
    if (!uid) return
    const data = await gql(`query($uid: String!) { myOrders(lineUserId: $uid) { orderId totalAmount status createdAt items { qty } } }`, { uid })
    orders.value = data.myOrders || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
})

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function itemCount(o: any) { return o.items.reduce((s: number, i: any) => s + i.qty, 0) }
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '我的訂單' },
    ]" />
    <div class="content">
      <div v-if="loading" class="loading">載入中…</div>
      <div v-else-if="!orders.length" class="empty">還沒有訂單</div>
      <div v-else class="order-list">
        <div v-for="o in orders" :key="o.orderId" class="order-card" @click="router.push(`/consumer/orders/${o.orderId}`)">
          <div class="order-top">
            <span class="order-id">{{ o.orderId }}</span>
            <span class="status-badge" :style="{ background: statusColor[o.status] || '#888' }">{{ statusLabel[o.status] || o.status }}</span>
          </div>
          <div class="order-bottom">
            <span class="order-date">{{ formatDate(o.createdAt) }}</span>
            <span class="order-meta">{{ itemCount(o) }} 件</span>
            <span class="order-amount">NT$ {{ o.totalAmount }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.content { padding: 16px; max-width: 480px; margin: 0 auto; }
.loading, .empty { text-align: center; padding: 40px 0; color: #888; }
.order-list { display: flex; flex-direction: column; gap: 10px; }
.order-card {
  background: #fff; border-radius: 14px; padding: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06); cursor: pointer;
}
.order-card:active { opacity: 0.8; }
.order-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.order-id { font-size: 14px; font-weight: 600; color: #333; }
.status-badge { font-size: 12px; color: #fff; padding: 2px 10px; border-radius: 10px; font-weight: 600; }
.order-bottom { display: flex; align-items: center; gap: 12px; font-size: 13px; color: #888; }
.order-amount { margin-left: auto; font-size: 16px; font-weight: 700; color: #667eea; }
</style>
