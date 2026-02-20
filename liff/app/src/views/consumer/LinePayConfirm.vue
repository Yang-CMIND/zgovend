<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const status = ref<'confirming' | 'success'>('confirming')
const orderId = ref('')
const txId = ref('')

onMounted(() => {
  orderId.value = (route.query.orderId as string) || 'DEMO-' + Date.now()
  txId.value = (route.query.transactionId as string) || '20260220' + Date.now()

  // Simulate confirmation delay
  setTimeout(() => {
    status.value = 'success'
  }, 1800)
})

function formatTime() {
  const d = new Date()
  return d.toLocaleString('zh-TW', { 
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  })
}
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: 'LINE Pay Demo', to: '/consumer/linepay' },
      { label: '付款結果' },
    ]" />

    <div class="content">
      <!-- Confirming -->
      <div v-if="status === 'confirming'" class="card confirming">
        <div class="spinner-wrap">
          <div class="spinner" />
        </div>
        <h2>付款確認中…</h2>
        <p class="sub">正在與 LINE Pay 確認交易</p>
      </div>

      <!-- Success -->
      <div v-else class="card success">
        <div class="check-circle">
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill="#06C755" />
            <path d="M14 24l7 7 13-13" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <animate attributeName="stroke-dasharray" from="0 40" to="40 0" dur="0.5s" fill="freeze" />
            </path>
          </svg>
        </div>
        <h2>付款成功！</h2>
        <p class="sub">感謝您使用 LINE Pay</p>

        <div class="receipt">
          <div class="receipt-row">
            <span class="label">商店</span>
            <span class="val">智購小幫手</span>
          </div>
          <div class="receipt-row">
            <span class="label">商品</span>
            <span class="val">測試商品</span>
          </div>
          <div class="receipt-row">
            <span class="label">金額</span>
            <span class="val amount">NT$ 1</span>
          </div>
          <div class="receipt-divider" />
          <div class="receipt-row">
            <span class="label">訂單編號</span>
            <span class="val mono">{{ orderId }}</span>
          </div>
          <div class="receipt-row">
            <span class="label">交易編號</span>
            <span class="val mono">{{ txId }}</span>
          </div>
          <div class="receipt-row">
            <span class="label">付款方式</span>
            <span class="val">LINE Pay</span>
          </div>
          <div class="receipt-row">
            <span class="label">時間</span>
            <span class="val">{{ formatTime() }}</span>
          </div>
        </div>

        <router-link to="/consumer/linepay" class="back-btn">
          ← 回到 LINE Pay Demo
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.content {
  padding: 20px 16px;
  max-width: 400px;
  margin: 0 auto;
}
.card {
  background: #fff;
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

/* Confirming */
.confirming h2 { color: #666; margin: 16px 0 4px; font-size: 18px; }
.confirming .sub { color: #aaa; font-size: 13px; margin: 0; }
.spinner-wrap { margin-bottom: 8px; }
.spinner {
  width: 48px; height: 48px; margin: 0 auto;
  border: 3px solid #e8e8e8; border-top-color: #06C755;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Success */
.success .check-circle { margin-bottom: 12px; }
.success h2 { color: #06C755; margin: 0 0 4px; font-size: 22px; }
.success .sub { color: #888; font-size: 14px; margin: 0 0 20px; }

.receipt {
  background: #fafafa;
  border-radius: 12px;
  padding: 16px;
  text-align: left;
}
.receipt-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}
.receipt-divider {
  height: 1px;
  background: #e8e8e8;
  margin: 4px 0;
}
.label {
  font-size: 13px;
  color: #888;
  flex-shrink: 0;
}
.val {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}
.val.amount {
  color: #06C755;
  font-weight: 700;
  font-size: 16px;
}
.val.mono {
  font-family: monospace;
  font-size: 11px;
  color: #666;
}

.back-btn {
  display: inline-block;
  margin-top: 24px;
  padding: 12px 24px;
  background: #f5f5f5;
  border-radius: 12px;
  color: #555;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s;
}
.back-btn:active { background: #eee; }
</style>
