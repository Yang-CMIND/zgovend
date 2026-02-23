<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

// ECharts tree-shaken imports
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, DataZoomComponent])

const route = useRoute()
const router = useRouter()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)

interface TxSummary {
  txno: string
  deviceId: string
  startedAt: string
  status: string
  productName: string
  price: number
  paymentMethod: string
  dispenseSuccess: boolean | null
  dispenseChannel: string
  dispenseElapsed: number | null
}

interface VmInfo {
  vmid: string
  hidCode: string
  locationName: string
}

const transactions = ref<TxSummary[]>([])
const vmList = ref<VmInfo[]>([])
const vmMap = ref<Map<string, VmInfo>>(new Map())
const loading = ref(true)

// Filters
const selectedDevices = ref<string[]>([])
const dateFrom = ref('')
const dateTo = ref('')

function initDateRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  dateTo.value = `${y}-${m}-${d}`
  // Default: last 30 days
  const from = new Date(now.getTime() - 30 * 86400000)
  const fy = from.getFullYear()
  const fm = String(from.getMonth() + 1).padStart(2, '0')
  const fd = String(from.getDate()).padStart(2, '0')
  dateFrom.value = `${fy}-${fm}-${fd}`
}

async function loadData() {
  loading.value = true
  try {
    const vmData = await gql(`query($opId: String!) {
      vms(operatorId: $opId) { vmid hidCode locationName }
    }`, { opId: operatorId })
    vmList.value = vmData.vms || []
    const map = new Map<string, VmInfo>()
    for (const vm of vmList.value) {
      if (vm.hidCode) map.set(vm.hidCode, vm)
    }
    vmMap.value = map
    await Promise.all([loadTransactions(), loadDailyRevenue()])
  } catch (e: any) {
    console.error('loadData failed:', e)
  } finally {
    loading.value = false
  }
}

async function loadTransactions() {
  try {
    // Build date range as epoch ms
    let fromMs = 0
    let toMs = 0
    if (dateFrom.value) {
      fromMs = new Date(dateFrom.value + 'T00:00:00+08:00').getTime()
    }
    if (dateTo.value) {
      toMs = new Date(dateTo.value + 'T23:59:59+08:00').getTime()
    }

    const args: string[] = []
    if (fromMs) args.push(`from: ${fromMs}`)
    if (toMs) args.push(`to: ${toMs}`)
    args.push('limit: 500')

    const data = await gql(`{
      vendTransactionSummaries(${args.join(', ')}) {
        txno deviceId startedAt status productName price paymentMethod dispenseSuccess dispenseChannel dispenseElapsed
      }
    }`)

    let list: TxSummary[] = data.vendTransactionSummaries || []

    // Client-side filter by selected devices
    if (selectedDevices.value.length > 0) {
      const deviceSet = new Set(selectedDevices.value)
      list = list.filter(t => deviceSet.has(t.deviceId))
    }

    transactions.value = list
  } catch (e: any) {
    console.error('loadTransactions failed:', e)
  }
}

function vmName(deviceId: string) {
  const vm = vmMap.value.get(deviceId)
  return vm ? vm.vmid : deviceId
}

function parseTs(ts: string): Date {
  if (!ts) return new Date(NaN)
  const n = Number(ts)
  if (!isNaN(n) && n > 1e12) return new Date(n)
  return new Date(ts)
}

function formatTime(ts: string) {
  const d = parseTs(ts)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function payResult(tx: TxSummary) {
  if (tx.dispenseSuccess) return '✅'
  if (tx.status === 'cancelled') return '❌'
  if (tx.status === 'active') return '⏳'
  return '❌'
}

function dispResult(tx: TxSummary) {
  if (tx.dispenseSuccess === true) return '✅'
  if (tx.dispenseSuccess === false) return '❌'
  return '-'
}

function methodLabel(m: string) {
  const map: Record<string, string> = {
    'cash': '現金',
    'creditcard': '信用卡',
    'linepay': 'LINE Pay',
    'jkopay': '街口',
  }
  return map[m] || m || '-'
}

function toggleDevice(hidCode: string) {
  const idx = selectedDevices.value.indexOf(hidCode)
  if (idx >= 0) selectedDevices.value.splice(idx, 1)
  else selectedDevices.value.push(hidCode)
  loadTransactions()
  loadDailyRevenue()
}

function onFilterChange() {
  loadTransactions()
  loadDailyRevenue()
}

const totalRevenue = computed(() =>
  transactions.value
    .filter(t => t.dispenseSuccess)
    .reduce((s, t) => s + (t.price || 0), 0)
)

const successCount = computed(() =>
  transactions.value.filter(t => t.dispenseSuccess).length
)

// Daily revenue chart data (from projector-aggregated daily_stats)
interface DailyPoint { date: string; revenue: number }

const dailyRevenue = ref<DailyPoint[]>([])

async function loadDailyRevenue() {
  try {
    // daily_stats stores MQTT deviceId which could be hidCode or vmid
    // Send both vmid and hidCode to cover all cases
    let deviceIds: string[]
    if (selectedDevices.value.length > 0) {
      // selectedDevices contains hidCodes; also include matching vmids
      const selected = new Set(selectedDevices.value)
      deviceIds = [...selectedDevices.value]
      for (const vm of vmList.value) {
        if (selected.has(vm.hidCode) && vm.vmid && !selected.has(vm.vmid)) {
          deviceIds.push(vm.vmid)
        }
      }
    } else {
      deviceIds = vmList.value.flatMap(v => [v.hidCode, v.vmid].filter(Boolean))
    }
    if (deviceIds.length === 0) { dailyRevenue.value = []; return }

    const data = await gql(`query($deviceIds: [String!], $from: String, $to: String) {
      dailyRevenue(deviceIds: $deviceIds, from: $from, to: $to) { date revenue txCount successCount }
    }`, { deviceIds, from: dateFrom.value, to: dateTo.value })

    const statsMap = new Map<string, number>()
    for (const pt of (data.dailyRevenue || [])) {
      statsMap.set(pt.date, pt.revenue)
    }

    // Fill missing dates
    const result: DailyPoint[] = []
    if (dateFrom.value && dateTo.value) {
      const cur = new Date(dateFrom.value + 'T00:00:00+08:00')
      const end = new Date(dateTo.value + 'T00:00:00+08:00')
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10)
        result.push({ date: key, revenue: statsMap.get(key) || 0 })
        cur.setDate(cur.getDate() + 1)
      }
    }
    dailyRevenue.value = result
  } catch (e: any) {
    console.error('loadDailyRevenue failed:', e)
  }
}

// ECharts option
const chartOption = computed(() => {
  const points = dailyRevenue.value
  if (points.length === 0) return null
  const dates = points.map(p => p.date.slice(5)) // MM-DD
  const values = points.map(p => p.revenue)
  const showZoom = points.length > 14

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const d = params[0]
        return `<b>${d.name}</b><br/>營業額：$${d.value.toLocaleString()}`
      },
      textStyle: { fontSize: 13 },
    },
    grid: {
      left: 45,
      right: 12,
      top: 10,
      bottom: showZoom ? 56 : 28,
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        color: '#999',
        interval: points.length <= 15 ? 0 : Math.floor(points.length / 8),
        rotate: points.length > 20 ? 45 : 0,
      },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
        color: '#aaa',
        formatter: (v: number) => v >= 1000 ? (v / 1000) + 'k' : String(v),
      },
      splitLine: { lineStyle: { color: '#f5f5f5' } },
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: {
        color: '#4a90d9',
        borderRadius: [3, 3, 0, 0],
      },
      emphasis: {
        itemStyle: { color: '#e67e22' },
      },
      barMaxWidth: 24,
    }],
    ...(showZoom ? {
      dataZoom: [{
        type: 'slider',
        start: Math.max(0, 100 - (14 / points.length * 100)),
        end: 100,
        height: 22,
        bottom: 4,
        borderColor: '#ddd',
        fillerColor: 'rgba(74,144,217,0.15)',
        handleSize: '60%',
        textStyle: { fontSize: 10 },
      }, {
        type: 'inside',
      }]
    } : {}),
  }
})

onMounted(async () => {
  initDateRange()
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  loadData()
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '營收與訂單' },
    ]" />

    <div v-if="loading" class="placeholder">載入中…</div>
    <template v-else>
      <!-- 篩選區 -->
      <div class="filter-section">
        <!-- 日期範圍 -->
        <div class="date-row">
          <label class="date-field">
            <span>起</span>
            <input type="date" v-model="dateFrom" @change="onFilterChange" />
          </label>
          <span class="date-sep">～</span>
          <label class="date-field">
            <span>迄</span>
            <input type="date" v-model="dateTo" @change="onFilterChange" />
          </label>
        </div>
        <!-- 機台多選 -->
        <div class="device-chips" v-if="vmList.length > 0">
          <button
            v-for="vm in vmList"
            :key="vm.hidCode"
            :class="['chip', { active: selectedDevices.includes(vm.hidCode) }]"
            @click="toggleDevice(vm.hidCode)"
          >{{ vm.vmid }}</button>
          <span v-if="selectedDevices.length === 0" class="chip-hint">全部機台</span>
        </div>
      </div>

      <!-- 摘要 -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-value revenue">${{ totalRevenue }}</span>
          <span class="summary-label">出貨營收</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{{ transactions.length }}</span>
          <span class="summary-label">交易數</span>
        </div>
        <div class="summary-item">
          <span class="summary-value success">{{ successCount }}</span>
          <span class="summary-label">出貨成功</span>
        </div>
      </div>

      <!-- 每日營業額柱狀圖 (ECharts) -->
      <div v-if="chartOption" class="chart-section">
        <div class="chart-title">每日營業額</div>
        <v-chart :option="chartOption" autoresize class="revenue-chart" />
      </div>

      <div v-if="transactions.length === 0" class="placeholder">尚無交易紀錄</div>

      <ul v-else class="tx-list">
        <li v-for="tx in transactions" :key="tx.txno" class="tx-item" @click="router.push(`/operator/${operatorId}/transaction/${tx.txno}`)">
          <div class="tx-row-main">
            <span class="tx-time">{{ formatTime(tx.startedAt) }}</span>
            <span class="tx-price">${{ tx.price || 0 }}</span>
          </div>
          <div class="tx-row-detail">
            <span class="tx-product">{{ tx.productName || '(未知)' }}</span>
            <span class="tx-method">{{ methodLabel(tx.paymentMethod) }}</span>
          </div>
          <div class="tx-row-status">
            <span>支付 {{ payResult(tx) }}</span>
            <span>出貨 {{ dispResult(tx) }}</span>
            <span v-if="tx.dispenseChannel">貨道 {{ tx.dispenseChannel }}</span>
            <span v-if="tx.dispenseElapsed">{{ tx.dispenseElapsed }}秒</span>
            <span class="tx-device">{{ vmName(tx.deviceId) }}</span>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.filter-section {
  padding: 10px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
}
.date-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.date-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.date-field span {
  font-size: 13px;
  color: #888;
  white-space: nowrap;
}
.date-field input[type="date"] {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
}
.date-sep {
  color: #ccc;
  font-size: 14px;
}
.device-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}
.chip {
  padding: 4px 12px;
  border: 1px solid #ddd;
  border-radius: 16px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}
.chip.active {
  background: #4a90d9;
  color: #fff;
  border-color: #4a90d9;
}
.chip-hint {
  font-size: 12px;
  color: #aaa;
}
.summary-bar {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}
.summary-item { display: flex; flex-direction: column; align-items: center; }
.summary-value { font-size: 20px; font-weight: 700; }
.summary-value.revenue { color: #e67e22; }
.summary-value.success { color: #2e7d32; }
.summary-label { font-size: 12px; color: #888; margin-top: 2px; }
.tx-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.tx-item {
  padding: 10px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.tx-row-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tx-time { font-size: 13px; color: #888; }
.tx-price { font-size: 16px; font-weight: 600; color: #e67e22; }
.tx-row-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}
.tx-product { font-size: 15px; font-weight: 500; }
.tx-method {
  font-size: 13px;
  color: #666;
  background: #f0f0f0;
  padding: 1px 8px;
  border-radius: 4px;
}
.tx-row-status {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  color: #888;
  flex-wrap: wrap;
}
.tx-device { margin-left: auto; color: #aaa; }

/* ECharts */
.chart-section {
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}
.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}
.revenue-chart {
  width: 100%;
  height: 220px;
}
</style>
