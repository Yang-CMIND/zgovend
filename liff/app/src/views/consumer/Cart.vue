<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()
const { init, profile } = useLiff()
const cart = ref<Record<string, { product: any; qty: number }>>({})
const step = ref<'cart' | 'processing' | 'password'>('cart')
const loading = ref(false)
const password = ref('')
const dots = ref<boolean[]>([false, false, false, false, false, false])

onMounted(async () => {
  await init()
  try {
    const saved = localStorage.getItem('shop_cart')
    if (saved) cart.value = JSON.parse(saved)
  } catch {}
})

function saveCart() {
  localStorage.setItem('shop_cart', JSON.stringify(cart.value))
}

const items = computed(() => Object.values(cart.value).filter(c => c.qty > 0))
const totalAmount = computed(() => items.value.reduce((s, c) => s + c.product.price * c.qty, 0))
const totalItems = computed(() => items.value.reduce((s, c) => s + c.qty, 0))

function changeQty(key: string, delta: number) {
  const c = cart.value[key]
  if (!c) return
  c.qty = Math.max(0, c.qty + delta)
  if (c.qty === 0) delete cart.value[key]
  saveCart()
}

function removeItem(key: string) {
  delete cart.value[key]
  saveCart()
}

function startPayment() {
  if (!items.value.length) return
  step.value = 'processing'
  setTimeout(() => { step.value = 'password' }, 1200)
}

function onDotClick(n: number) {
  const filled = dots.value.filter(d => d).length
  if (filled < 6) {
    dots.value[filled] = true
    password.value += String(n)
  }
  if (password.value.length === 6) {
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

async function confirmPayment() {
  loading.value = true
  try {
    const orderItems = items.value.map(c => ({
      productCode: c.product.productCode,
      operatorId: c.product.operatorId,
      qty: c.qty,
    }))
    const data = await gql(`mutation($input: CreateOnlineOrderInput!) {
      createOnlineOrder(input: $input) { orderId pickupCode status totalAmount }
    }`, {
      input: {
        lineUserId: profile.value?.userId || 'unknown',
        displayName: profile.value?.displayName || '',
        items: orderItems,
        paymentMethod: 'linepay',
      }
    })
    // Clear cart
    localStorage.removeItem('shop_cart')
    cart.value = {}
    // Navigate to order detail
    router.push(`/consumer/orders/${data.createOnlineOrder.orderId}`)
  } catch (e: any) {
    alert('訂單建立失敗: ' + (e.message || e))
    step.value = 'cart'
    password.value = ''
    dots.value = [false, false, false, false, false, false]
  } finally {
    loading.value = false
  }
}

const numpad = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del']
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '線上訂購', to: '/consumer/shop' },
      { label: '購物車' },
    ]" />

    <!-- Cart view -->
    <div v-if="step === 'cart'" class="content">
      <div v-if="!items.length" class="empty">
        <div class="empty-icon">🛒</div>
        <p>購物車是空的</p>
        <router-link to="/consumer/shop" class="back-link">去逛逛 →</router-link>
      </div>
      <template v-else>
        <div class="cart-list">
          <div v-for="(c, key) in cart" :key="key" class="cart-item">
            <img :src="c.product.imageUrl || `https://honeypie.zgovend.com:8443/s3/products/${c.product.productCode}.png`" class="item-img" />
            <div class="item-info">
              <div class="item-name">{{ c.product.productName }}</div>
              <div class="item-price">NT$ {{ c.product.price }}</div>
            </div>
            <div class="qty-ctrl">
              <button @click="changeQty(key as string, -1)">−</button>
              <span>{{ c.qty }}</span>
              <button @click="changeQty(key as string, 1)">+</button>
            </div>
            <div class="item-subtotal">NT$ {{ c.product.price * c.qty }}</div>
          </div>
        </div>
        <div class="total-bar">
          <span>合計 {{ totalItems }} 件</span>
          <span class="total-amount">NT$ {{ totalAmount }}</span>
        </div>
        <button class="pay-btn" @click="startPayment">💚 LINE Pay 結帳</button>
      </template>
    </div>

    <!-- LINE Pay processing -->
    <div v-else-if="step === 'processing'" class="linepay-screen">
      <div class="lp-header"><span class="lp-logo-text">LINE Pay</span></div>
      <div class="lp-loading"><div class="spinner-lg" /><p>正在連線至 LINE Pay…</p></div>
    </div>

    <!-- LINE Pay password -->
    <div v-else-if="step === 'password'" class="linepay-screen">
      <div class="lp-header"><span class="lp-logo-text">LINE Pay</span></div>
      <div class="lp-body">
        <div class="lp-merchant">智購小幫手</div>
        <div class="lp-amount">NT$ {{ totalAmount }}</div>
        <div class="lp-divider" />
        <p class="lp-prompt">請輸入 LINE Pay 密碼</p>
        <p class="lp-hint">（輸入任意 6 位數）</p>
        <div class="dot-row">
          <div v-for="(filled, i) in dots" :key="i" :class="['dot', { filled }]" />
        </div>
        <div v-if="loading" class="lp-confirming"><div class="spinner-sm" /><span>付款處理中…</span></div>
        <div class="numpad">
          <template v-for="(key, i) in numpad" :key="i">
            <div v-if="key === null" class="numpad-empty" />
            <button v-else-if="key === 'del'" class="numpad-btn del" @click="deleteDot" :disabled="loading">⌫</button>
            <button v-else class="numpad-btn" @click="onDotClick(key as number)" :disabled="loading">{{ key }}</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.content { padding: 16px; max-width: 480px; margin: 0 auto; }
.empty { text-align: center; padding: 60px 0; color: #888; }
.empty-icon { font-size: 48px; margin-bottom: 8px; }
.back-link { color: #667eea; text-decoration: none; font-weight: 600; }
.cart-list { display: flex; flex-direction: column; gap: 10px; }
.cart-item {
  background: #fff; border-radius: 14px; padding: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  display: flex; align-items: center; gap: 10px;
}
.item-img { width: 50px; height: 50px; border-radius: 8px; object-fit: cover; background: #f5f5f5; }
.item-info { flex: 1; min-width: 0; }
.item-name { font-size: 14px; font-weight: 600; color: #333; }
.item-price { font-size: 12px; color: #999; }
.qty-ctrl { display: flex; align-items: center; gap: 8px; }
.qty-ctrl button {
  width: 28px; height: 28px; border: 1px solid #ddd; border-radius: 8px;
  background: #fff; font-size: 16px; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
}
.qty-ctrl span { font-size: 15px; font-weight: 600; min-width: 20px; text-align: center; }
.item-subtotal { font-size: 14px; font-weight: 700; color: #667eea; white-space: nowrap; }

.total-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 0; margin-top: 12px; border-top: 1px solid #eee;
  font-size: 15px; color: #333;
}
.total-amount { font-size: 22px; font-weight: 700; color: #667eea; }
.pay-btn {
  width: 100%; padding: 14px; border: none; border-radius: 12px;
  background: #06C755; color: #fff; font-size: 17px; font-weight: 600;
  cursor: pointer; margin-top: 12px;
}
.pay-btn:active { opacity: 0.8; }

/* LINE Pay styles */
.linepay-screen { min-height: 100vh; background: #fff; }
.lp-header { padding: 16px 20px; border-bottom: 1px solid #e8e8e8; }
.lp-logo-text { font-size: 20px; font-weight: 700; color: #06C755; }
.lp-loading { display: flex; flex-direction: column; align-items: center; padding-top: 120px; color: #888; }
.lp-loading p { margin-top: 16px; font-size: 14px; }
.spinner-lg { width: 40px; height: 40px; border: 3px solid #e8e8e8; border-top-color: #06C755; border-radius: 50%; animation: spin 0.8s linear infinite; }
.spinner-sm { width: 16px; height: 16px; border: 2px solid #e8e8e8; border-top-color: #06C755; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.lp-body { padding: 24px 20px; text-align: center; max-width: 360px; margin: 0 auto; }
.lp-merchant { font-size: 16px; font-weight: 600; color: #333; margin-bottom: 4px; }
.lp-amount { font-size: 28px; font-weight: 700; color: #06C755; margin-bottom: 16px; }
.lp-divider { height: 1px; background: #e8e8e8; margin: 16px 0; }
.lp-prompt { font-size: 15px; color: #333; margin: 0 0 4px; font-weight: 500; }
.lp-hint { font-size: 12px; color: #aaa; margin: 0 0 20px; }
.dot-row { display: flex; justify-content: center; gap: 12px; margin-bottom: 24px; }
.dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #ccc; background: #fff; transition: all 0.15s; }
.dot.filled { background: #06C755; border-color: #06C755; }
.lp-confirming { display: flex; align-items: center; justify-content: center; gap: 8px; color: #06C755; font-size: 14px; margin-bottom: 16px; }
.numpad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 280px; margin: 0 auto; }
.numpad-btn { height: 56px; border: none; border-radius: 12px; background: #f5f5f5; font-size: 22px; font-weight: 500; color: #333; cursor: pointer; }
.numpad-btn:active { background: #e0e0e0; }
.numpad-btn:disabled { opacity: 0.4; }
.numpad-btn.del { font-size: 20px; color: #888; }
.numpad-empty { height: 56px; }
</style>
