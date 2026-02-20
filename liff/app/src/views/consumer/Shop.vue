<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()
const products = ref<any[]>([])
const loading = ref(true)
const opMap = ref<Record<string, string>>({})

// Cart stored in localStorage
const cart = ref<Record<string, { product: any; qty: number }>>({})

onMounted(async () => {
  // Load cart from localStorage
  try {
    const saved = localStorage.getItem('shop_cart')
    if (saved) cart.value = JSON.parse(saved)
  } catch {}

  try {
    const data = await gql(`query { shopProducts { productCode operatorId productName imageUrl price availableQty } operators(limit:200) { code name } }`)
    products.value = data.shopProducts || []
    for (const op of (data.operators || [])) opMap.value[op.code] = op.name
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})

function opName(code: string) { return opMap.value[code] || code }

function saveCart() {
  localStorage.setItem('shop_cart', JSON.stringify(cart.value))
}

function cartKey(p: any) {
  return `${p.operatorId}::${p.productCode}`
}

function addToCart(p: any) {
  const key = cartKey(p)
  if (cart.value[key]) {
    cart.value[key].qty++
  } else {
    cart.value[key] = { product: p, qty: 1 }
  }
  saveCart()
}

function getCartQty(p: any) {
  return cart.value[cartKey(p)]?.qty || 0
}

const totalItems = computed(() => Object.values(cart.value).reduce((s, c) => s + c.qty, 0))
const totalAmount = computed(() => Object.values(cart.value).reduce((s, c) => s + c.product.price * c.qty, 0))

function goCart() {
  router.push('/consumer/cart')
}
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '線上訂購' },
    ]" />

    <div class="content">
      <div v-if="loading" class="loading">載入中…</div>
      <div v-else-if="!products.length" class="empty">目前沒有可購買的商品</div>
      <div v-else class="product-grid">
        <div v-for="p in products" :key="cartKey(p)" class="product-card">
          <img :src="p.imageUrl || `https://honeypie.zgovend.com:8443/s3/products/${p.productCode}.png`" :alt="p.productName" class="product-img" />
          <div class="product-info">
            <div class="product-name">{{ p.productName }}</div>
            <div class="product-operator">{{ opName(p.operatorId) }}</div>
            <div class="product-meta">庫存 {{ p.availableQty }}</div>
            <div class="product-price">NT$ {{ p.price }}</div>
          </div>
          <div class="product-actions">
            <span v-if="getCartQty(p)" class="in-cart-badge">已加 {{ getCartQty(p) }}</span>
            <button class="add-btn" @click="addToCart(p)" :disabled="getCartQty(p) >= p.availableQty">加入購物車</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Cart footer -->
    <div v-if="totalItems > 0" class="cart-footer" @click="goCart">
      <span class="cart-badge">🛒 {{ totalItems }} 件商品</span>
      <span class="cart-total">NT$ {{ totalAmount }}</span>
      <span class="cart-go">前往結帳 →</span>
    </div>
  </div>
</template>

<style scoped>
.content { padding: 16px; max-width: 480px; margin: 0 auto; padding-bottom: 80px; }
.loading, .empty { text-align: center; padding: 40px 0; color: #888; }
.product-grid { display: flex; flex-direction: column; gap: 12px; }
.product-card {
  background: #fff; border-radius: 14px; padding: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  display: flex; align-items: center; gap: 12px;
}
.product-img {
  width: 64px; height: 64px; border-radius: 10px; object-fit: cover;
  background: #f5f5f5; flex-shrink: 0;
}
.product-info { flex: 1; min-width: 0; }
.product-name { font-size: 15px; font-weight: 600; color: #333; }
.product-operator { font-size: 12px; color: #667eea; font-weight: 500; }
.product-meta { font-size: 12px; color: #999; margin-top: 2px; }
.product-price { font-size: 16px; font-weight: 700; color: #667eea; margin-top: 4px; }
.product-actions { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
.in-cart-badge { font-size: 11px; color: #38a169; font-weight: 600; }
.add-btn {
  padding: 8px 14px; border: none; border-radius: 10px;
  background: #667eea; color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
}
.add-btn:disabled { opacity: 0.4; }
.add-btn:active { opacity: 0.8; }

.cart-footer {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #667eea; color: #fff; padding: 14px 20px;
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; z-index: 100;
  -webkit-tap-highlight-color: transparent;
}
.cart-badge { font-size: 14px; font-weight: 600; }
.cart-total { font-size: 18px; font-weight: 700; }
.cart-go { font-size: 14px; font-weight: 600; }
</style>
