<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)

// 超過此分鐘數視為離線
const OFFLINE_THRESHOLD_MIN = 10

interface MachineState {
  vmid: string
  hidCode: string
  locationName: string
  // heartbeat data (may be null if no heartbeat yet)
  temperature: number | null
  screenshotUrl: string
  lastHeartbeat: string | null
  online: boolean
}

const machines = ref<MachineState[]>([])
const loading = ref(true)
const previewUrl = ref<string | null>(null)

async function loadStatus() {
  loading.value = true
  try {
    // 取得此營運商的所有機台
    const data = await gql(`query($opId: String!) {
      vms(operatorId: $opId, status: "active") { vmid hidCode locationName }
      heartbeats { deviceId temperature screenshotUrl receivedAt }
    }`, { opId: operatorId })

    const hbMap = new Map<string, any>()
    for (const hb of data.heartbeats || []) {
      hbMap.set(hb.deviceId, hb)
    }

    machines.value = (data.vms || []).map((vm: any) => {
      // 用 hidCode 匹配 heartbeat 的 deviceId
      const hb = vm.hidCode ? hbMap.get(vm.hidCode) : null
      let online = false
      let lastHeartbeat: string | null = null
      if (hb?.receivedAt) {
        lastHeartbeat = hb.receivedAt
        const diffMin = (Date.now() - new Date(Number(hb.receivedAt)).getTime()) / 60000
        online = diffMin < OFFLINE_THRESHOLD_MIN
      }
      return {
        vmid: vm.vmid,
        hidCode: vm.hidCode || '',
        locationName: vm.locationName || '',
        temperature: hb?.temperature ?? null,
        screenshotUrl: hb?.screenshotUrl || '',
        lastHeartbeat,
        online,
      }
    })
  } catch (e: any) {
    console.error('loadStatus failed:', e)
  } finally {
    loading.value = false
  }
}

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

const onlineCount = computed(() => machines.value.filter(m => m.online).length)

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  loadStatus()
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '機台狀態' },
    ]">
      <button class="header-action" @click="loadStatus" :disabled="loading">🔄</button>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <template v-else>
      <!-- 摘要 -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-value">{{ machines.length }}</span>
          <span class="summary-label">機台</span>
        </div>
        <div class="summary-item">
          <span class="summary-value online">{{ onlineCount }}</span>
          <span class="summary-label">在線</span>
        </div>
        <div class="summary-item">
          <span class="summary-value offline">{{ machines.length - onlineCount }}</span>
          <span class="summary-label">離線</span>
        </div>
      </div>

      <div v-if="machines.length === 0" class="placeholder">尚無機台</div>

      <ul class="machine-list">
        <li v-for="m in machines" :key="m.vmid" class="machine-card">
          <div class="mc-header">
            <span class="mc-status">{{ m.online ? '✅' : '❌' }}</span>
            <span class="mc-name">{{ m.vmid }}</span>
          </div>
          <div v-if="m.locationName" class="mc-location">📍 {{ m.locationName }}</div>
          <div class="mc-details">
            <span v-if="m.temperature !== null" class="mc-temp">🌡️ {{ m.temperature }}°C</span>
            <span class="mc-heartbeat">💓 {{ formatHeartbeat(m.lastHeartbeat) }}</span>
          </div>
          <div v-if="m.screenshotUrl" class="mc-screenshot-row">
            <button class="btn-screenshot" @click="previewUrl = m.screenshotUrl">📸 畫面截圖</button>
          </div>
        </li>
      </ul>
    </template>

    <!-- 截圖預覽 -->
    <div v-if="previewUrl" class="overlay" @click="previewUrl = null">
      <div class="preview-modal" @click.stop>
        <img :src="previewUrl" class="preview-img" />
        <button class="btn-close-preview" @click="previewUrl = null">✕ 關閉</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-bar {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #eee;
}
.summary-item { display: flex; flex-direction: column; align-items: center; }
.summary-value { font-size: 20px; font-weight: 700; }
.summary-value.online { color: #2e7d32; }
.summary-value.offline { color: #c62828; }
.summary-label { font-size: 12px; color: #888; margin-top: 2px; }
.machine-list {
  list-style: none;
  padding: 8px 16px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.machine-card {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.mc-header { display: flex; align-items: center; gap: 8px; }
.mc-status { font-size: 18px; }
.mc-name { font-size: 16px; font-weight: 600; flex: 1; }
.mc-location { font-size: 13px; color: #888; margin-top: 4px; }
.mc-details { display: flex; gap: 16px; margin-top: 6px; font-size: 13px; color: #666; }
.mc-screenshot-row { margin-top: 8px; }
.btn-screenshot {
  padding: 4px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  color: #4a90d9;
}
.preview-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 95vw;
  max-height: 90vh;
}
.preview-img {
  max-width: 100%;
  max-height: 80vh;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.btn-close-preview {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: rgba(255,255,255,0.9);
  font-size: 15px;
  cursor: pointer;
}
</style>
