<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const operatorId = route.params.operatorId as string
const templateId = route.params.id as string
const operatorName = ref(operatorId)
const templateName = ref('')

const UNCHANGED = '__UNCHANGED__'
const UNCHANGED_NUM = -1

interface Channel {
  channelNo: string
  productId: string
  productName: string
  parLevel: number
  stockLevel: number
}

interface Product {
  id: string
  code: string
  name: string
}

const channels = ref<Channel[]>([])
const products = ref<Product[]>([])
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)

// Add channel dialog
const showAddDialog = ref(false)
const addChannelNo = ref('')

async function load() {
  loading.value = true
  try {
    const data = await gql(`query($id: ID!, $operatorId: String!) {
      presetStockTemplate(id: $id) {
        id name
        channels { channelNo productId productName parLevel stockLevel }
      }
      products(operatorId: $operatorId, status: "active", limit: 500) {
        id code name
      }
    }`, { id: templateId, operatorId })

    const t = data.presetStockTemplate
    if (!t) {
      alert('設定檔不存在')
      router.back()
      return
    }
    templateName.value = t.name
    channels.value = t.channels.map((c: any) => ({ ...c }))
    products.value = data.products || []
    dirty.value = false
  } finally {
    loading.value = false
  }
}

function addChannel() {
  const no = addChannelNo.value.trim()
  if (!no) return
  if (channels.value.some(c => c.channelNo === no)) {
    alert(`貨道 ${no} 已存在`)
    return
  }
  channels.value.push({
    channelNo: no,
    productId: UNCHANGED,
    productName: '',
    parLevel: UNCHANGED_NUM,
    stockLevel: UNCHANGED_NUM,
  })
  channels.value.sort((a, b) => a.channelNo.localeCompare(b.channelNo, undefined, { numeric: true }))
  addChannelNo.value = ''
  showAddDialog.value = false
  dirty.value = true
}

function removeChannel(idx: number) {
  channels.value.splice(idx, 1)
  dirty.value = true
}

function onProductChange(ch: Channel) {
  const p = products.value.find(p => p.id === ch.productId)
  ch.productName = p ? p.name : ''
  dirty.value = true
}

function onNumChange(ch: Channel, field: 'parLevel' | 'stockLevel', event: Event) {
  ch[field] = Number((event.target as HTMLSelectElement).value)
  dirty.value = true
}

function markDirty() {
  dirty.value = true
}

async function save() {
  saving.value = true
  try {
    const input = channels.value.map(c => ({
      channelNo: c.channelNo,
      productId: c.productId === UNCHANGED ? UNCHANGED : (c.productId || null),
      parLevel: c.parLevel,
      stockLevel: c.stockLevel,
    }))
    await gql(`mutation($templateId: ID!, $channels: [PresetStockChannelInput!]!) {
      updatePresetStockChannels(templateId: $templateId, channels: $channels) { id }
    }`, { templateId, channels: input })
    dirty.value = false
  } catch (e: any) {
    alert('儲存失敗：' + e.message)
  } finally {
    saving.value = false
  }
}

function fillAll() {
  for (const ch of channels.value) {
    if (ch.parLevel !== UNCHANGED_NUM && ch.stockLevel !== UNCHANGED_NUM) {
      ch.stockLevel = ch.parLevel
    }
  }
  dirty.value = true
}

function clearAll() {
  for (const ch of channels.value) {
    if (ch.stockLevel !== UNCHANGED_NUM) {
      ch.stockLevel = 0
    }
  }
  dirty.value = true
}

const totalParLevel = computed(() => channels.value.reduce((s, c) => s + (c.parLevel === UNCHANGED_NUM ? 0 : c.parLevel), 0))
const totalStockLevel = computed(() => channels.value.reduce((s, c) => s + (c.stockLevel === UNCHANGED_NUM ? 0 : c.stockLevel), 0))

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  load()
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '庫存預約', to: `/operator/${operatorId}/preset-stock` },
      { label: templateName || '…' },
    ]">
      <button class="header-action" :disabled="!dirty || saving" @click="save">
        {{ saving ? '儲存中…' : dirty ? '💾 儲存' : '已儲存' }}
      </button>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>

    <template v-else>
      <!-- Toolbar -->
      <div class="toolbar">
        <button class="btn-sm" @click="showAddDialog = true">＋貨道</button>
        <button class="btn-sm" @click="fillAll">補滿全部</button>
        <button class="btn-sm" @click="clearAll">清空全部</button>
        <span class="toolbar-stats">
          {{ channels.length }} 貨道 · 滿倉 {{ totalParLevel }} · 庫存 {{ totalStockLevel }}
        </span>
      </div>

      <div v-if="channels.length === 0" class="placeholder">
        <p>尚無貨道，點「＋貨道」新增</p>
      </div>

      <!-- Channel table -->
      <div v-else class="channel-list">
        <div class="channel-header">
          <span class="col-no">貨道</span>
          <span class="col-product">商品</span>
          <span class="col-num">滿倉</span>
          <span class="col-num">庫存</span>
          <span class="col-act"></span>
        </div>
        <div v-for="(ch, idx) in channels" :key="ch.channelNo" class="channel-row">
          <span class="col-no">{{ ch.channelNo }}</span>
          <select class="col-product" :value="ch.productId" @change="ch.productId = ($event.target as HTMLSelectElement).value; onProductChange(ch)">
            <option :value="UNCHANGED">（不變）</option>
            <option value="">（空）</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.code }} · {{ p.name }}</option>
          </select>
          <select class="col-num" :value="ch.parLevel" @change="onNumChange(ch, 'parLevel', $event)">
            <option :value="UNCHANGED_NUM">--</option>
            <option v-for="n in 31" :key="n-1" :value="n-1">{{ n-1 }}</option>
          </select>
          <select class="col-num" :value="ch.stockLevel" @change="onNumChange(ch, 'stockLevel', $event)">
            <option :value="UNCHANGED_NUM">--</option>
            <option v-for="n in 31" :key="n-1" :value="n-1">{{ n-1 }}</option>
          </select>
          <button class="col-act btn-icon btn-danger" @click="removeChannel(idx)">✕</button>
        </div>
      </div>
    </template>

    <!-- Add channel dialog -->
    <div v-if="showAddDialog" class="overlay">
      <div class="modal">
        <h2>新增貨道</h2>
        <div class="form-fields">
          <label class="form-label">
            <span>貨道編號 *</span>
            <input v-model="addChannelNo" placeholder="例如：01" @keyup.enter="addChannel" />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-text" @click="showAddDialog = false">取消</button>
          <button class="btn-primary-sm" :disabled="!addChannelNo.trim()" @click="addChannel">新增</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-wrap: wrap;
}
.btn-sm {
  padding: 4px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.btn-sm:active {
  background: #f0f0f0;
}
.toolbar-stats {
  margin-left: auto;
  font-size: 12px;
  color: #999;
}
.channel-list {
  padding: 0 8px;
}
.channel-header,
.channel-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
}
.channel-header {
  font-size: 12px;
  color: #999;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 48px;
  background: #fff;
  z-index: 5;
}
.channel-row {
  border-bottom: 1px solid #f8f8f8;
}
.col-no {
  width: 40px;
  flex-shrink: 0;
  font-weight: 600;
  font-size: 14px;
  text-align: center;
}
.col-product {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  padding: 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
}
.col-num {
  width: 52px;
  flex-shrink: 0;
  text-align: center;
  font-size: 13px;
  padding: 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
.col-act {
  width: 28px;
  flex-shrink: 0;
}
.btn-icon {
  background: none;
  border: none;
  font-size: 14px;
  padding: 2px;
  cursor: pointer;
}
.btn-danger {
  color: #c62828;
}
</style>
