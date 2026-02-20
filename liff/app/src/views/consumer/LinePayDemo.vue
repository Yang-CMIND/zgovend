<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()
const loading = ref(false)
const step = ref<'idle' | 'processing' | 'password'>('idle')
const password = ref('')
const passwordError = ref('')
const dots = ref<boolean[]>([false, false, false, false, false, false])

function startPayment() {
  step.value = 'processing'
  // Simulate LINE Pay loading
  setTimeout(() => {
    step.value = 'password'
  }, 1200)
}

function onDotClick(i: number) {
  // Fill next empty dot
  const filled = dots.value.filter(d => d).length
  if (filled < 6) {
    dots.value[filled] = true
    password.value += String(i)
  }
  if (password.value.length === 6) {
    // Auto submit
    setTimeout(() => confirmPayment(), 400)
  }
}

function deleteDot() {
  const filled = dots.value.filter(d => d).length
  if (filled > 0) {
    dots.value[filled - 1] = false
    password.value = password.value.slice(0, -1)
  }
}

function confirmPayment() {
  loading.value = true
  passwordError.value = ''
  // Simulate confirm
  setTimeout(() => {
    const orderId = 'DEMO-' + Date.now()
    const txId = '2026' + Date.now()
    router.push({
      path: '/consumer/linepay/confirm',
      query: { orderId, transactionId: txId, mock: '1' }
    })
  }, 1500)
}

const numpad = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del']
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: 'LINE Pay Demo' },
    ]" />

    <!-- Step 1: Payment card -->
    <div v-if="step === 'idle'" class="content">
      <div class="card">
        <div class="icon">💚</div>
        <h2>LINE Pay 支付測試</h2>
        <p class="desc">模擬環境 · 支付 NT$1 測試商品</p>

        <div class="amount">
          <span class="currency">NT$</span>
          <span class="value">1</span>
        </div>

        <button class="pay-btn" @click="startPayment">
          用 LINE Pay 付款
        </button>
      </div>

      <div class="info">
        <h3>📌 說明</h3>
        <ul>
          <li>這是 LINE Pay <strong>模擬</strong> Demo 環境</li>
          <li>不會產生真實扣款</li>
          <li>模擬完整付款流程（含密碼輸入）</li>
        </ul>
      </div>
    </div>

    <!-- Step 2: Loading -->
    <div v-else-if="step === 'processing'" class="linepay-screen">
      <div class="lp-header">
        <span class="lp-logo-text">LINE Pay</span>
      </div>
      <div class="lp-loading">
        <div class="spinner-lg" />
        <p>正在連線至 LINE Pay…</p>
      </div>
    </div>

    <!-- Step 3: Password input (LINE Pay style) -->
    <div v-else-if="step === 'password'" class="linepay-screen">
      <div class="lp-header">
        <span class="lp-logo-text">LINE Pay</span>
      </div>

      <div class="lp-body">
        <div class="lp-merchant">智購小幫手</div>
        <div class="lp-amount-row">
          <span class="lp-amount">NT$ 1</span>
        </div>

        <div class="lp-divider" />

        <p class="lp-prompt">請輸入 LINE Pay 密碼</p>
        <p class="lp-hint">（輸入任意 6 位數）</p>

        <div class="dot-row">
          <div v-for="(filled, i) in dots" :key="i" :class="['dot', { filled }]" />
        </div>

        <div v-if="loading" class="lp-confirming">
          <div class="spinner-sm" />
          <span>付款處理中…</span>
        </div>

        <div v-if="passwordError" class="lp-error">{{ passwordError }}</div>

        <div class="numpad">
          <template v-for="(key, i) in numpad" :key="i">
            <div v-if="key === null" class="numpad-empty" />
            <button v-else-if="key === 'del'" class="numpad-btn del" @click="deleteDot" :disabled="loading">
              ⌫
            </button>
            <button v-else class="numpad-btn" @click="onDotClick(key as number)" :disabled="loading">
              {{ key }}
            </button>
          </template>
        </div>
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
.icon { font-size: 48px; margin-bottom: 8px; }
h2 { margin: 0 0 4px; font-size: 20px; color: #333; }
.desc { color: #888; font-size: 13px; margin: 0 0 24px; }
.amount {
  margin: 16px 0 24px;
  display: flex; align-items: baseline; justify-content: center; gap: 4px;
}
.currency { font-size: 18px; color: #666; }
.value { font-size: 48px; font-weight: 700; color: #06C755; }
.pay-btn {
  width: 100%; padding: 14px; border: none; border-radius: 12px;
  background: #06C755; color: #fff; font-size: 17px; font-weight: 600;
  cursor: pointer; transition: opacity 0.2s;
}
.pay-btn:active { opacity: 0.8; }
.info {
  margin-top: 24px; padding: 16px; background: #f9f9f9;
  border-radius: 12px; font-size: 14px;
}
.info h3 { margin: 0 0 8px; font-size: 15px; }
.info ul { margin: 0; padding-left: 20px; }
.info li { margin-bottom: 4px; color: #666; }

/* LINE Pay screen */
.linepay-screen {
  min-height: 100vh;
  background: #fff;
}
.lp-header {
  background: #fff;
  padding: 16px 20px;
  border-bottom: 1px solid #e8e8e8;
  display: flex; align-items: center;
}
.lp-logo-text {
  font-size: 20px; font-weight: 700; color: #06C755;
  letter-spacing: -0.5px;
}
.lp-loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding-top: 120px; color: #888;
}
.lp-loading p { margin-top: 16px; font-size: 14px; }
.spinner-lg {
  width: 40px; height: 40px;
  border: 3px solid #e8e8e8; border-top-color: #06C755;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
.spinner-sm {
  width: 16px; height: 16px;
  border: 2px solid #e8e8e8; border-top-color: #06C755;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.lp-body {
  padding: 24px 20px;
  text-align: center;
  max-width: 360px;
  margin: 0 auto;
}
.lp-merchant {
  font-size: 16px; font-weight: 600; color: #333; margin-bottom: 4px;
}
.lp-amount-row { margin-bottom: 16px; }
.lp-amount {
  font-size: 28px; font-weight: 700; color: #06C755;
}
.lp-divider {
  height: 1px; background: #e8e8e8; margin: 16px 0;
}
.lp-prompt {
  font-size: 15px; color: #333; margin: 0 0 4px; font-weight: 500;
}
.lp-hint {
  font-size: 12px; color: #aaa; margin: 0 0 20px;
}

.dot-row {
  display: flex; justify-content: center; gap: 12px; margin-bottom: 24px;
}
.dot {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid #ccc; background: #fff; transition: all 0.15s;
}
.dot.filled {
  background: #06C755; border-color: #06C755;
}

.lp-confirming {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; color: #06C755; font-size: 14px; margin-bottom: 16px;
}
.lp-error {
  color: #e74c3c; font-size: 13px; margin-bottom: 16px;
}

.numpad {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 8px; max-width: 280px; margin: 0 auto;
}
.numpad-btn {
  height: 56px; border: none; border-radius: 12px;
  background: #f5f5f5; font-size: 22px; font-weight: 500;
  color: #333; cursor: pointer; transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.numpad-btn:active { background: #e0e0e0; }
.numpad-btn:disabled { opacity: 0.4; }
.numpad-btn.del { font-size: 20px; color: #888; }
.numpad-empty { height: 56px; }
</style>
