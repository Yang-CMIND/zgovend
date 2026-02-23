<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()
const products = ref<any[]>([])
const loading = ref(true)
const opMap = ref<Record<string, string>>({})

// Search / Filter / Sort state
const search = ref('')
const selectedOp = ref('')
const selectedLoc = ref('')
const sortBy = ref('default') // default | price_asc | price_desc | stock_desc | stock_asc

// Cart stored in localStorage
const cart = ref<Record<string, { product: any; qty: number }>>({})

async function loadProducts() {
  loading.value = true
  try {
    const data = await gql(`query { shopProducts { productCode operatorId productName imageUrl price availableQty locations } operators(limit:200) { code name } }`)
    products.value = data.shopProducts || []
    for (const op of (data.operators || [])) opMap.value[op.code] = op.name
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // Load cart from localStorage
  try {
    const saved = localStorage.getItem('shop_cart')
    if (saved) cart.value = JSON.parse(saved)
  } catch {}
  await loadProducts()
})

// Distinct operators / locations from loaded data
const operatorOptions = computed(() => {
  const ids = [...new Set(products.value.map(p => p.operatorId))]
  return ids.map(id => ({ code: id, name: opMap.value[id] || id })).sort((a, b) => a.name.localeCompare(b.name))
})

const locationOptions = computed(() => {
  const locs = [...new Set(products.value.flatMap(p => p.locations || []))]
  return locs.sort()
})

// Client-side filtered + sorted products
const filteredProducts = computed(() => {
  let list = products.value

  // Text search (product name)
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase()
    list = list.filter(p => p.productName.toLowerCase().includes(q))
  }

  // Operator filter
  if (selectedOp.value) {
    list = list.filter(p => p.operatorId === selectedOp.value)
  }

  // Location filter
  if (selectedLoc.value) {
    list = list.filter(p => (p.locations || []).includes(selectedLoc.value))
  }

  // Sort
  const sorted = [...list]
  switch (sortBy.value) {
    case 'price_asc': sorted.sort((a, b) => a.price - b.price); break
    case 'price_desc': sorted.sort((a, b) => b.price - a.price); break
    case 'stock_desc': sorted.sort((a, b) => b.availableQty - a.availableQty); break
    case 'stock_asc': sorted.sort((a, b) => a.availableQty - b.availableQty); break
  }
  return sorted
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

function clearFilters() {
  search.value = ''
  selectedOp.value = ''
  selectedLoc.value = ''
  sortBy.value = 'default'
}

const hasFilters = computed(() => search.value || selectedOp.value || selectedLoc.value || sortBy.value !== 'default')
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '線上訂購' },
    ]" :onRefresh="loadProducts" />

    <div class="content">
      <!-- Search & Filter Bar -->
      <div class="filter-bar">
        <input
          v-model="search"
          type="text"
          class="search-input"
          placeholder="搜尋商品名稱…"
        />
        <div class="filter-row">
          <select v-model="selectedOp" class="filter-select">
            <option value="">全部營運商</option>
            <option v-for="op in operatorOptions" :key="op.code" :value="op.code">{{ op.name }}</option>
          </select>
          <select v-model="selectedLoc" class="filter-select">
            <option value="">全部地點</option>
            <option v-for="loc in locationOptions" :key="loc" :value="loc">{{ loc }}</option>
          </select>
        </div>
        <div class="sort-row">
          <button
            v-for="s in [
              { key: 'default', label: '預設' },
              { key: 'price_asc', label: '價低' },
              { key: 'price_desc', label: '價高' },
              { key: 'stock_desc', label: '庫存多' },
              { key: 'stock_asc', label: '庫存少' },
            ]" :key="s.key"
            class="sort-btn"
            :class="{ active: sortBy === s.key }"
            @click="sortBy = s.key"
          >{{ s.label }}</button>
        </div>
        <div v-if="hasFilters" class="filter-status">
          <span>{{ filteredProducts.length }} / {{ products.length }} 件商品</span>
          <button class="clear-btn" @click="clearFilters">清除篩選</button>
        </div>
      </div>

      <div v-if="loading" class="loading">載入中…</div>
      <div v-else-if="!products.length" class="empty">目前沒有可購買的商品</div>
      <div v-else-if="!filteredProducts.length" class="empty">沒有符合條件的商品</div>
      <div v-else class="product-grid">
        <div v-for="p in filteredProducts" :key="cartKey(p)" class="product-card">
          <img :src="p.imageUrl || `https://honeypie.zgovend.com:8443/s3/products/${p.productCode}.png`" :alt="p.productName" class="product-img" />
          <div class="product-info">
            <div class="product-name">{{ p.productName }}</div>
            <div class="product-operator">{{ opName(p.operatorId) }}</div>
            <div class="product-loc" v-if="p.locations?.length">{{ p.locations.join('、') }}</div>
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

/* Filter bar */
.filter-bar {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: #fff;
  transition: border-color 0.2s;
}
.search-input:focus { border-color: #667eea; }
.search-input::placeholder { color: #bbb; }
.filter-row {
  display: flex;
  gap: 8px;
}
.filter-select {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  font-size: 13px;
  background: #fff;
  color: #333;
  outline: none;
  appearance: auto;
}
.filter-select:focus { border-color: #667eea; }
.sort-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sort-btn {
  padding: 5px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  font-size: 12px;
  background: #fff;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.sort-btn.active {
  background: #667eea;
  color: #fff;
  border-color: #667eea;
}
.sort-btn:active { opacity: 0.7; }
.filter-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #888;
}
.clear-btn {
  border: none;
  background: none;
  color: #667eea;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  font-weight: 500;
}

/* Product grid */
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
.product-loc { font-size: 11px; color: #999; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
