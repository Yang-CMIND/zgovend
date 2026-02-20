<script setup lang="ts">
import { ref, onMounted } from 'vue'
import QRCode from 'qrcode'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const orders = ref<any[]>([])
const loading = ref(true)
const filterStatus = ref('')
const detail = ref<any>(null)
const detailQr = ref('')

const statusLabel: Record<string, string> = {
  pending: '待付款', paid: '已付款', ready: '可取貨', picked_up: '已取貨', cancelled: '已取消'
}
const statusColor: Record<string, string> = {
  pending: '#f59e0b', paid: '#667eea', ready: '#38a169', picked_up: '#888', cancelled: '#e53e3e'
}
const statuses = ['', 'pending', 'paid', 'ready', 'picked_up', 'cancelled']

const ORDER_FIELDS = `orderId lineUserId displayName totalAmount status pickupCode createdAt items { productCode operatorId productName qty vmid price imageUrl pickedUp }`

async function loadOrders() {
  loading.value = true
  try {
    const vars: any = { limit: 200 }
    if (filterStatus.value) vars.status = filterStatus.value
    const data = await gql(`query($status: String, $limit: Int) { allOnlineOrders(status: $status, limit: $limit) { ${ORDER_FIELDS} } }`, vars)
    orders.value = data.allOnlineOrders || []
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

onMounted(loadOrders)

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function itemCount(o: any) { return o.items.reduce((s: number, i: any) => s + i.qty, 0) }
function pickedCount(o: any) { return o.items.filter((i: any) => i.pickedUp).length }

async function openDetail(o: any) {
  detail.value = o
  detailQr.value = ''
  if (o.pickupCode) {
    detailQr.value = await QRCode.toDataURL(o.pickupCode, { width: 160, margin: 2, color: { dark: '#333333', light: '#ffffff' } })
  }
}

async function updateStatus(orderId: string, status: string) {
  try {
    const data = await gql(`mutation($id: String!, $s: String!) { updateOnlineOrderStatus(orderId: $id, status: $s) { ${ORDER_FIELDS} } }`, { id: orderId, s: status })
    await loadOrders()
    if (detail.value?.orderId === orderId) detail.value = data.updateOnlineOrderStatus
  } catch (e: any) { alert('更新失敗: ' + e.message) }
}

async function toggleItemPickup(orderId: string, idx: number, pickedUp: boolean) {
  try {
    const data = await gql(`mutation($id: String!, $idx: Int!, $p: Boolean!) { toggleOrderItemPickup(orderId: $id, itemIndex: $idx, pickedUp: $p) { ${ORDER_FIELDS} } }`, { id: orderId, idx, p: pickedUp })
    const updated = data.toggleOrderItemPickup
    // Update in list
    const i = orders.value.findIndex(o => o.orderId === orderId)
    if (i >= 0) orders.value[i] = updated
    if (detail.value?.orderId === orderId) detail.value = updated
  } catch (e: any) { alert('更新失敗: ' + e.message) }
}
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[{ label: '系統管理', to: '/admin' }, { label: '取貨單管理' }]" />
    <div class="content">
      <!-- Filter -->
      <div class="filter-row">
        <button v-for="s in statuses" :key="s" :class="['filter-btn', { active: filterStatus === s }]"
          @click="filterStatus = s; loadOrders()">
          {{ s ? statusLabel[s] : '全部' }}
        </button>
      </div>

      <div v-if="loading" class="loading">載入中…</div>
      <div v-else-if="!orders.length" class="empty">沒有訂單</div>
      <div v-else class="order-list">
        <div v-for="o in orders" :key="o.orderId" class="order-card" @click="openDetail(o)">
          <div class="order-top">
            <span class="order-id">{{ o.orderId }}</span>
            <span class="status-badge" :style="{ background: statusColor[o.status] || '#888' }">{{ statusLabel[o.status] || o.status }}</span>
          </div>
          <div class="order-buyer" v-if="o.displayName">👤 {{ o.displayName }}</div>
          <div class="order-mid">
            <span>取貨碼: <strong>{{ o.pickupCode }}</strong></span>
            <span class="pick-progress">{{ pickedCount(o) }}/{{ o.items.length }} 已取</span>
          </div>
          <div class="order-bottom">
            <span>{{ formatDate(o.createdAt) }}</span>
            <span>{{ itemCount(o) }} 件</span>
            <span class="order-amount">NT$ {{ o.totalAmount }}</span>
          </div>
        </div>
      </div>

      <!-- Detail modal -->
      <div v-if="detail" class="modal-overlay" @click.self="detail = null">
        <div class="modal">
          <div class="modal-header">
            <span>{{ detail.orderId }}</span>
            <button class="close-btn" @click="detail = null">✕</button>
          </div>
          <div v-if="detail.displayName" class="detail-buyer">👤 {{ detail.displayName }}</div>
          <div class="qr-center">
            <img v-if="detailQr" :src="detailQr" class="qr-img" />
          </div>
          <div class="pickup-code-text">{{ detail.pickupCode }}</div>
          <div class="status-row">
            <span class="status-badge" :style="{ background: statusColor[detail.status] }">{{ statusLabel[detail.status] }}</span>
          </div>
          <div class="items-list">
            <div v-for="(item, i) in detail.items" :key="i" class="item-row">
              <img :src="item.imageUrl || `https://honeypie.zgovend.com:8443/s3/products/${item.productCode}.png`" class="item-img" />
              <div class="item-info">
                <div>{{ item.productName }} x{{ item.qty }}</div>
                <div class="item-meta">機台 {{ item.vmid }}</div>
              </div>
              <button class="pick-toggle" :class="item.pickedUp ? 'picked' : 'unpicked'"
                @click="toggleItemPickup(detail.orderId, i, !item.pickedUp)">
                {{ item.pickedUp ? '✅ 已取' : '⬜ 未取' }}
              </button>
            </div>
          </div>
          <div class="total-row">合計 <strong>NT$ {{ detail.totalAmount }}</strong></div>
          <div class="action-row">
            <button v-if="detail.status === 'paid'" class="action-btn ready" @click="updateStatus(detail.orderId, 'ready')">標記可取貨</button>
            <button v-if="detail.status !== 'cancelled' && detail.status !== 'picked_up'" class="action-btn cancel" @click="updateStatus(detail.orderId, 'cancelled')">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.content { padding: 16px; max-width: 480px; margin: 0 auto; }
.loading, .empty { text-align: center; padding: 40px 0; color: #888; }
.filter-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.filter-btn {
  padding: 6px 12px; border: 1px solid #ddd; border-radius: 20px; background: #fff;
  font-size: 13px; cursor: pointer; color: #666;
}
.filter-btn.active { background: #667eea; color: #fff; border-color: #667eea; }
.order-list { display: flex; flex-direction: column; gap: 10px; }
.order-card {
  background: #fff; border-radius: 14px; padding: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06); cursor: pointer;
}
.order-card:active { opacity: 0.8; }
.order-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.order-id { font-size: 13px; font-weight: 600; color: #333; }
.status-badge { font-size: 12px; color: #fff; padding: 2px 10px; border-radius: 10px; font-weight: 600; }
.order-buyer { font-size: 13px; color: #555; margin-bottom: 2px; }
.order-mid { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #555; margin-bottom: 4px; }
.pick-progress { font-size: 12px; color: #38a169; font-weight: 600; }
.order-bottom { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #888; }
.order-amount { margin-left: auto; font-size: 15px; font-weight: 700; color: #667eea; }

/* Modal */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4); z-index: 200; display: flex;
  align-items: center; justify-content: center; padding: 20px;
}
.modal {
  background: #fff; border-radius: 18px; padding: 20px; width: 100%;
  max-width: 400px; max-height: 80vh; overflow-y: auto;
}
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-weight: 600; }
.close-btn { border: none; background: none; font-size: 18px; cursor: pointer; color: #888; }
.detail-buyer { text-align: center; font-size: 15px; color: #333; font-weight: 600; margin-bottom: 8px; }
.qr-center { text-align: center; margin-bottom: 4px; }
.qr-img { width: 160px; height: 160px; border-radius: 8px; }
.pickup-code-text { text-align: center; font-size: 12px; color: #aaa; letter-spacing: 2px; margin-bottom: 8px; }
.status-row { text-align: center; margin-bottom: 16px; }
.items-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.item-row { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.item-img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; background: #f5f5f5; }
.item-info { flex: 1; }
.item-meta { font-size: 11px; color: #999; }
.pick-toggle {
  border: none; border-radius: 8px; padding: 4px 10px; font-size: 12px;
  font-weight: 600; cursor: pointer;
}
.pick-toggle.picked { background: #e6ffed; color: #38a169; }
.pick-toggle.unpicked { background: #f5f5f5; color: #999; }
.pick-toggle:active { opacity: 0.7; }
.total-row { text-align: right; font-size: 16px; color: #333; padding-top: 8px; border-top: 1px solid #eee; margin-bottom: 12px; }
.action-row { display: flex; gap: 8px; }
.action-btn {
  flex: 1; padding: 10px; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer; color: #fff;
}
.action-btn.ready { background: #38a169; }
.action-btn.cancel { background: #e53e3e; }
</style>
