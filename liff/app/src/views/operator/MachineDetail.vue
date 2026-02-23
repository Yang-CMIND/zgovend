<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

// ECharts tree-shaken imports
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent])

const route = useRoute()
const operatorId = route.params.operatorId as string
const vmid = route.params.id as string
const hidCode = (route.query.hid as string) || ''

const operatorName = ref(operatorId)
const loading = ref(true)

// VM info
const vm = ref<any>(null)

// Current heartbeat
const currentHb = ref<any>(null)

// Temperature history
const tempHistory = ref<{ temperature: number | null; receivedAt: string }[]>([])

// Stock
const stock = ref<any>(null)

// Products (for name lookup)
const products = ref<any[]>([])

const OFFLINE_THRESHOLD_MIN = 10

const isOnline = computed(() => {
  if (!currentHb.value?.receivedAt) return false
  const diffMin = (Date.now() - Number(currentHb.value.receivedAt)) / 60000
  return diffMin < OFFLINE_THRESHOLD_MIN
})

const statLabel = computed(() => {
  const stat = currentHb.value?.stat
  if (!stat) return null
  const map: Record<string, { label: string; color: string }> = {
    OPERATION: { label: '銷售中', color: '#2e7d32' },
    ADMIN: { label: '巡補中', color: '#e65100' },
    SUSPEND: { label: '暫停', color: '#c62828' },
    INIT: { label: '啟動中', color: '#757575' },
  }
  return map[stat] || { label: stat, color: '#757575' }
})

const errFlags = computed(() => {
  const flags = currentHb.value?.content
  if (!flags || flags === '') return null
  return flags
})

// Stock channels sorted by chid, enriched with product name
const stockChannels = computed(() => {
  if (!stock.value?.channels) return []
  const productMap = new Map<string, string>()
  for (const p of products.value) {
    productMap.set(p.code, p.name)
  }
  return stock.value.channels
    .map((ch: any) => ({
      ...ch,
      productName: productMap.get(ch.p_id) || ch.p_id,
      pct: ch.max > 0 ? Math.round((ch.quantity / ch.max) * 100) : 0,
    }))
    .sort((a: any, b: any) => a.chid.localeCompare(b.chid))
})

const stockSummary = computed(() => {
  const chs = stockChannels.value
  if (chs.length === 0) return null
  const total = chs.reduce((s: number, c: any) => s + (c.quantity || 0), 0)
  const totalMax = chs.reduce((s: number, c: any) => s + (c.max || 0), 0)
  return { total, totalMax, pct: totalMax > 0 ? Math.round((total / totalMax) * 100) : 0 }
})

function formatHeartbeat(ts: string | null) {
  if (!ts) return '尚無心跳'
  const d = new Date(Number(ts))
  if (isNaN(d.getTime())) return '尚無心跳'
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  const timeStr = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
  if (diffMin < 1) return `${timeStr}（剛剛）`
  if (diffMin < 60) return `${timeStr}（${diffMin} 分鐘前）`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${timeStr}（${diffH} 小時前）`
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
}

// ECharts option for temperature history
const chartOption = computed(() => {
  const points = tempHistory.value
    .filter(p => p.temperature !== null)
    .map(p => ({
      time: new Date(Number(p.receivedAt)),
      temp: p.temperature as number,
    }))
    .sort((a, b) => a.time.getTime() - b.time.getTime())

  if (points.length === 0) return null

  const times = points.map(p =>
    p.time.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  )
  const temps = points.map(p => p.temp)
  const showZoom = points.length > 60

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const d = params[0]
        return `<b>${d.name}</b><br/>溫度：${d.value}°C`
      },
      textStyle: { fontSize: 13 },
    },
    grid: {
      left: 40,
      right: 12,
      top: 10,
      bottom: showZoom ? 56 : 28,
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: times,
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        color: '#999',
        interval: Math.max(Math.floor(points.length / 6) - 1, 0),
        rotate: points.length > 20 ? 45 : 0,
      },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#aaa', formatter: '{value}°C' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [{
      type: 'line',
      data: temps,
      smooth: true,
      symbol: points.length > 100 ? 'none' : 'circle',
      symbolSize: 4,
      lineStyle: { color: '#4a90d9', width: 2 },
      itemStyle: { color: '#4a90d9' },
      areaStyle: { color: 'rgba(74,144,217,0.08)' },
    }],
    ...(showZoom ? {
      dataZoom: [{
        type: 'slider',
        start: Math.max(0, 100 - (60 / points.length) * 100),
        end: 100,
        height: 20,
        bottom: 6,
      }],
    } : {}),
  }
})

async function loadDetail() {
  loading.value = true
  try {
    const deviceId = hidCode
    if (!deviceId) {
      const vmData = await gql(`query($vmid: String!) { vmByVmid(vmid: $vmid) { vmid hidCode locationName operatorId } }`, { vmid })
      vm.value = vmData.vmByVmid
      if (vm.value?.hidCode) {
        await loadHeartbeatData(vm.value.hidCode)
      }
    } else {
      const data = await gql(`query($vmid: String!, $deviceId: String!, $limit: Int, $opId: String) {
        vmByVmid(vmid: $vmid) { vmid hidCode locationName operatorId }
        heartbeat(deviceId: $deviceId) { deviceId status content payload receivedAt }
        tempHistory(deviceId: $deviceId, limit: $limit) { temperature receivedAt }
        stock(deviceId: $deviceId) { deviceId channels { chid p_id quantity max } updatedAt }
        products(operatorId: $opId, status: "active") { code name }
      }`, { vmid, deviceId, limit: 1440, opId: operatorId })

      vm.value = data.vmByVmid
      currentHb.value = data.heartbeat
      tempHistory.value = data.tempHistory || []
      stock.value = data.stock
      products.value = data.products || []
    }
  } catch (e: any) {
    console.error('loadDetail failed:', e)
  } finally {
    loading.value = false
  }
}

async function loadHeartbeatData(deviceId: string) {
  const data = await gql(`query($deviceId: String!, $limit: Int) {
    heartbeat(deviceId: $deviceId) { deviceId status content payload receivedAt }
    tempHistory(deviceId: $deviceId, limit: $limit) { temperature receivedAt }
    stock(deviceId: $deviceId) { deviceId channels { chid p_id quantity max } updatedAt }
  }`, { deviceId, limit: 1440 })
  currentHb.value = data.heartbeat
  tempHistory.value = data.tempHistory || []
  stock.value = data.stock
}

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  loadDetail()
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '機台狀態', to: `/operator/${operatorId}/machine-status` },
      { label: vmid },
    ]">
      <button class="header-action" @click="loadDetail" :disabled="loading">🔄</button>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <template v-else>
      <!-- 狀態卡片 -->
      <div class="status-card">
        <div class="sc-row">
          <span class="sc-online" :class="{ online: isOnline, offline: !isOnline }">
            {{ isOnline ? '● 在線' : '● 離線' }}
          </span>
          <span v-if="statLabel" class="sc-stat-badge" :style="{ background: statLabel.color }">
            {{ statLabel.label }}
          </span>
        </div>

        <div class="sc-row sc-sub">
          <span>💓 {{ formatHeartbeat(currentHb?.receivedAt) }}</span>
        </div>

        <div v-if="tempHistory.length > 0 && tempHistory[0]?.temperature != null" class="sc-row sc-sub">
          <span>🌡️ {{ tempHistory[0].temperature }}°C</span>
        </div>

        <div v-if="vm?.locationName" class="sc-row sc-sub">
          <span>📍 {{ vm.locationName }}</span>
        </div>

        <div v-if="errFlags" class="sc-row sc-err">
          <span>⚠️ {{ errFlags }}</span>
        </div>
      </div>

      <!-- 溫度歷史圖表 -->
      <div class="chart-section">
        <h3 class="section-title">溫度歷史</h3>
        <div v-if="chartOption" class="chart-wrap">
          <VChart :option="chartOption" autoresize style="height: 240px;" />
        </div>
        <div v-else class="placeholder">尚無溫度資料</div>
      </div>

      <!-- 庫存 -->
      <div class="chart-section" v-if="stockChannels.length > 0">
        <h3 class="section-title">
          庫存
          <span v-if="stockSummary" class="stock-summary">
            {{ stockSummary.total }} / {{ stockSummary.totalMax }}（{{ stockSummary.pct }}%）
          </span>
        </h3>
        <div class="stock-list">
          <div v-for="ch in stockChannels" :key="ch.chid" class="stock-item">
            <div class="stock-info">
              <span class="stock-chid">{{ ch.chid }}</span>
              <span class="stock-name">{{ ch.productName }}</span>
              <span class="stock-qty">{{ ch.quantity }} / {{ ch.max }}</span>
            </div>
            <div class="stock-bar-track">
              <div
                class="stock-bar-fill"
                :style="{ width: ch.pct + '%', background: ch.pct <= 20 ? '#c62828' : ch.pct <= 50 ? '#e65100' : '#2e7d32' }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.status-card {
  margin: 12px 16px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.sc-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sc-row.sc-sub {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}
.sc-row.sc-err {
  margin-top: 8px;
  font-size: 13px;
  color: #c62828;
}
.sc-online {
  font-size: 15px;
  font-weight: 600;
}
.sc-online.online { color: #2e7d32; }
.sc-online.offline { color: #c62828; }
.sc-stat-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.chart-section {
  margin: 16px 16px 24px;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 10px 0;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}
.stock-summary {
  font-size: 13px;
  font-weight: 400;
  color: #888;
}
.chart-wrap {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 12px 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
/* Stock */
.stock-list {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.stock-item {
  padding: 6px 0;
}
.stock-item + .stock-item {
  border-top: 1px solid #f5f5f5;
}
.stock-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 4px;
}
.stock-chid {
  color: #999;
  font-family: monospace;
  min-width: 32px;
}
.stock-name {
  flex: 1;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stock-qty {
  color: #666;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.stock-bar-track {
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}
.stock-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
</style>
