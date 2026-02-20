<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const order = ref<any>(null)
const loading = ref(true)
const qrDataUrl = ref('')

const statusLabel: Record<string, string> = {
  pending: '待付款', paid: '已付款', ready: '可取貨', picked_up: '已取貨', cancelled: '已取消'
}
const statusColor: Record<string, string> = {
  pending: '#f59e0b', paid: '#667eea', ready: '#38a169', picked_up: '#888', cancelled: '#e53e3e'
}

onMounted(async () => {
  try {
    const data = await gql(`query($id: String!) { onlineOrder(orderId: $id) {
      orderId lineUserId totalAmount status paymentMethod pickupCode createdAt
      items { productCode operatorId productName imageUrl price qty vmid pickedUp }
    } }`, { id: route.params.id as string })
    order.value = data.onlineOrder
    if (order.value?.pickupCode) {
      qrDataUrl.value = await QRCode.toDataURL(order.value.pickupCode, {
        width: 200, margin: 2, color: { dark: '#333333', light: '#ffffff' }
      })
    }
  } catch (e) { console.error(e) }
  finally { loading.value = false }
})

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('zh-TW')
}
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '我的訂單', to: '/consumer/orders' },
      { label: order?.orderId || '訂單詳情' },
    ]" />
    <div class="content">
      <div v-if="loading" class="loading">載入中…</div>
      <div v-else-if="!order" class="empty">找不到訂單</div>
      <template v-else>
        <!-- Pickup QR code -->
        <div class="pickup-card">
          <div class="pickup-label">取貨碼</div>
          <img v-if="qrDataUrl" :src="qrDataUrl" class="qr-img" />
          <div class="pickup-code-text">{{ order.pickupCode }}</div>
          <span class="status-badge" :style="{ background: statusColor[order.status] || '#888' }">{{ statusLabel[order.status] || order.status }}</span>
        </div>

        <!-- Order info -->
        <div class="info-card">
          <div class="info-row"><span>訂單編號</span><span>{{ order.orderId }}</span></div>
          <div class="info-row"><span>建立時間</span><span>{{ formatDate(order.createdAt) }}</span></div>
          <div class="info-row"><span>付款方式</span><span>LINE Pay</span></div>
        </div>

        <!-- Items with pickup status -->
        <div class="section-title">商品明細</div>
        <div class="items-list">
          <div v-for="(item, i) in order.items" :key="i" class="item-row">
            <img :src="item.imageUrl || `https://honeypie.zgovend.com:8443/s3/products/${item.productCode}.png`" class="item-img" />
            <div class="item-info">
              <div class="item-name">{{ item.productName }}</div>
              <div class="item-meta">x{{ item.qty }} · 機台 {{ item.vmid }}</div>
            </div>
            <div class="item-right">
              <div class="item-price">NT$ {{ item.price * item.qty }}</div>
              <span class="item-status" :class="item.pickedUp ? 'picked' : 'pending'">
                {{ item.pickedUp ? '✅ 已取' : '⏳ 未取' }}
              </span>
            </div>
          </div>
        </div>

        <div class="total-row">
          <span>合計</span>
          <span class="total-amount">NT$ {{ order.totalAmount }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.content { padding: 16px; max-width: 480px; margin: 0 auto; }
.loading, .empty { text-align: center; padding: 40px 0; color: #888; }
.pickup-card {
  background: #fff; border-radius: 16px; padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  text-align: center; margin-bottom: 16px;
}
.pickup-label { font-size: 13px; color: #888; margin-bottom: 8px; }
.qr-img { width: 200px; height: 200px; margin: 0 auto 8px; display: block; border-radius: 8px; }
.pickup-code-text { font-size: 13px; color: #aaa; letter-spacing: 2px; margin-bottom: 12px; }
.status-badge { font-size: 13px; color: #fff; padding: 4px 14px; border-radius: 12px; font-weight: 600; }

.info-card {
  background: #fff; border-radius: 14px; padding: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-bottom: 16px;
}
.info-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #555; }

.section-title { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 8px; }
.items-list { display: flex; flex-direction: column; gap: 8px; }
.item-row {
  background: #fff; border-radius: 12px; padding: 10px 12px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.05);
  display: flex; align-items: center; gap: 10px;
}
.item-img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: #f5f5f5; }
.item-info { flex: 1; }
.item-name { font-size: 14px; font-weight: 600; color: #333; }
.item-meta { font-size: 12px; color: #999; }
.item-right { text-align: right; }
.item-price { font-size: 14px; font-weight: 700; color: #667eea; }
.item-status { font-size: 11px; font-weight: 600; display: inline-block; padding: 2px 8px; border-radius: 8px; margin-top: 2px; }
.item-status.picked { background: #e6ffed; color: #38a169; }
.item-status.pending { background: #fff8e6; color: #d69e2e; }

.total-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 0; margin-top: 12px; border-top: 1px solid #eee;
  font-size: 16px; font-weight: 600; color: #333;
}
.total-amount { font-size: 22px; font-weight: 700; color: #667eea; }
</style>
