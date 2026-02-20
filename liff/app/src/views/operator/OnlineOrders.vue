<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)
const orders = ref<any[]>([])
const loading = ref(true)
const filterStatus = ref('')
const detail = ref<any>(null)

const statusLabel: Record<string, string> = {
  pending: '待付款', paid: '已付款', ready: '可取貨', picked_up: '已取貨', cancelled: '已取消'
}
const statusColor: Record<string, string> = {
  pending: '#f59e0b', paid: '#667eea', ready: '#38a169', picked_up: '#888', cancelled: '#e53e3e'
}
const statuses = ['', 'paid', 'ready', 'picked_up', 'cancelled']

async function load() {
  loading.value = true
  try {
    const vars: any = { operatorId, limit: 200 }
    if (filterStatus.value) vars.status = filterStatus.value
    const data = await gql(`query($operatorId: String!, $status: String, $limit: Int) {
      operatorByCode(code: $operatorId) { name }
      operatorOnlineOrders(operatorId: $operatorId, status: $status, limit: $limit) {
        orderId status pickupCode createdAt totalAmount displayName
        items { productCode productName qty price imageUrl pickedUp }
      }
    }`, vars)
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
    orders.value = data.operatorOnlineOrders || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

onMounted(load)

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function itemCount(o: any) { return o.items.reduce((s: number, i: any) => s + i.qty, 0) }
function pickedCount(o: any) { return o.items.filter((i: any) => i.pickedUp).length }
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '營運管理', to: '/' },
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '線上訂單' },
    ]" />
    <div class="content">
      <div class="filter-row">
        <button v-for="s in statuses" :key="s" :class="['chip', { active: filterStatus === s }]"
          @click="filterStatus = s; load()">
          {{ s ? statusLabel[s] : '全部' }}
        </button>
      </div>

      <div v-if="loading" class="center-msg"><p>載入中…</p></div>
      <div v-else-if="!orders.length" class="center-msg"><p>沒有訂單</p></div>
      <div v-else class="order-list">
        <div v-for="o in orders" :key="o.orderId" class="order-card" @click="detail = detail?.orderId === o.orderId ? null : o">
          <div class="order-top">
            <span class="order-id">{{ o.orderId }}</span>
            <span class="badge" :style="{ background: statusColor[o.status] }">{{ statusLabel[o.status] }}</span>
          </div>
          <div v-if="o.displayName" class="order-buyer">👤 {{ o.displayName }}</div>
          <div class="order-mid">
            <span>取貨碼 <strong>{{ o.pickupCode }}</strong></span>
            <span class="pick-tag">{{ pickedCount(o) }}/{{ o.items.length }} 已取</span>
          </div>
          <div class="order-bottom">
            <span>{{ formatDate(o.createdAt) }}</span>
            <span>{{ itemCount(o) }} 件</span>
            <span class="amount">NT$ {{ o.totalAmount }}</span>
          </div>

          <!-- Expandable detail -->
          <div v-if="detail?.orderId === o.orderId" class="item-list">
            <div v-for="(item, i) in o.items" :key="i" class="item-row">
              <img :src="item.imageUrl || `https://honeypie.zgovend.com:8443/s3/products/${item.productCode}.png`" class="item-img" />
              <div class="item-info">
                <div class="item-name">{{ item.productName }} x{{ item.qty }}</div>
                <div class="item-price">NT$ {{ item.price * item.qty }}</div>
              </div>
              <span class="pick-status" :class="item.pickedUp ? 'picked' : 'unpicked'">
                {{ item.pickedUp ? '✅ 已取' : '⏳ 未取' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.content { padding: 12px; max-width: 480px; margin: 0 auto; }
.center-msg { text-align: center; padding: 40px 0; color: #888; }
.filter-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.chip {
  padding: 5px 12px; border-radius: 16px; font-size: 13px; border: 1px solid #ddd;
  background: #fff; color: #666; cursor: pointer;
}
.chip.active { background: #667eea; color: #fff; border-color: #667eea; }
.order-list { display: flex; flex-direction: column; gap: 10px; }
.order-card {
  background: #fff; border-radius: 14px; padding: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06); cursor: pointer;
}
.order-card:active { opacity: 0.85; }
.order-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.order-id { font-size: 13px; font-weight: 600; color: #333; }
.badge { font-size: 11px; color: #fff; padding: 2px 10px; border-radius: 10px; font-weight: 600; }
.order-buyer { font-size: 13px; color: #555; margin-bottom: 2px; }
.order-mid { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #555; margin-bottom: 4px; }
.pick-tag { font-size: 12px; color: #38a169; font-weight: 600; }
.order-bottom { display: flex; gap: 12px; font-size: 12px; color: #888; }
.amount { margin-left: auto; font-size: 15px; font-weight: 700; color: #667eea; }

.item-list { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f0f0f0; display: flex; flex-direction: column; gap: 8px; }
.item-row { display: flex; align-items: center; gap: 8px; }
.item-img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; background: #f5f5f5; }
.item-info { flex: 1; }
.item-name { font-size: 13px; font-weight: 600; color: #333; }
.item-price { font-size: 12px; color: #667eea; font-weight: 600; }
.pick-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 8px; }
.pick-status.picked { background: #e6ffed; color: #38a169; }
.pick-status.unpicked { background: #fff8e6; color: #d69e2e; }
</style>
