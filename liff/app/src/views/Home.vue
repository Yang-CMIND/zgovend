<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLiff } from '../composables/useLiff'
import { useMqttAuth } from '../composables/useMqttAuth'
const { submitNonceAndWait, publishAuthResult } = useMqttAuth()
import { gql } from '../composables/useGraphQL'

const router = useRouter()
const { profile, logout, isAdmin, isOperator, isReplenisher, operatorIdsWithRole, liff, refreshRoles } = useLiff()
// useMqttAuth destructured above

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string

interface Operator { code: string; name: string }
interface VmStatus { online: number; offline: number }
interface DailyRevenue { revenue: number; txCount: number }
const operatorMap = ref<Record<string, Operator>>({})
const vmStatusMap = ref<Record<string, VmStatus>>({})
const revenueMap = ref<Record<string, DailyRevenue>>({})
const adminCounts = ref({ users: 0, operators: 0, hids: 0, vms: 0 })
const loaded = ref(false)
const refreshing = ref(false)

// 巡補掃碼狀態
const checkinStatus = ref<'' | 'scanning' | 'processing' | 'done' | 'error'>('')
const checkinError = ref('')

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000 // 5 分鐘內有心跳視為上線

async function loadData() {
  try {
    const data = await gql(`{
      operators(limit: 200) { code name }
      vms(limit: 500) { vmid hidCode operatorId status }
      heartbeats { deviceId receivedAt }
      dailyRevenueByOperator { operatorId revenue txCount }
      userCount
      operatorCount
      hidCount
      vmCount
    }`)
    const map: Record<string, Operator> = {}
    for (const op of data.operators) map[op.code] = op
    operatorMap.value = map

    // 建立 heartbeat lookup: deviceId(hidCode) → receivedAt
    const hbMap: Record<string, string> = {}
    for (const hb of (data.heartbeats || [])) {
      hbMap[hb.deviceId] = hb.receivedAt
    }

    // 計算每個營運商的上線/斷線數
    const now = Date.now()
    const statusMap: Record<string, VmStatus> = {}
    for (const vm of (data.vms || [])) {
      if (vm.status !== 'active') continue
      if (!statusMap[vm.operatorId]) statusMap[vm.operatorId] = { online: 0, offline: 0 }
      const receivedAt = hbMap[vm.hidCode]
      const isOnline = receivedAt && (now - new Date(receivedAt).getTime()) < HEARTBEAT_TIMEOUT_MS
      if (isOnline) statusMap[vm.operatorId].online++
      else statusMap[vm.operatorId].offline++
    }
    vmStatusMap.value = statusMap

    // 當日營收
    const revMap: Record<string, DailyRevenue> = {}
    for (const r of (data.dailyRevenueByOperator || [])) {
      revMap[r.operatorId] = { revenue: r.revenue, txCount: r.txCount }
    }
    revenueMap.value = revMap

    adminCounts.value = {
      users: data.userCount || 0,
      operators: data.operatorCount || 0,
      hids: data.hidCount || 0,
      vms: data.vmCount || 0,
    }
  } catch (e) {
    console.warn('loadData failed:', e)
  }
  loaded.value = true
}

function opName(code: string) {
  return operatorMap.value[code]?.name || code
}

async function refresh() {
  refreshing.value = true
  try {
    await loadData()
  } finally {
    refreshing.value = false
  }
}

/** 巡補作業：掃碼 → 認證 → 進入 session */
async function startReplenishScan() {
  checkinStatus.value = 'scanning'
  checkinError.value = ''

  try {
    const result = await liff.scanCodeV2()
    const text = result?.value
    if (!text) {
      checkinStatus.value = ''
      return
    }

    // 解析 QR Code: {LIFF_ID}:{hid}:{nonce}
    const parts = text.split(':')
    if (parts.length !== 3 || parts[0] !== LIFF_ID) {
      checkinStatus.value = 'error'
      checkinError.value = '無效的 QR Code'
      return
    }

    const [, hid, nonce] = parts
    await handleCheckin(hid, nonce)
  } catch (e: any) {
    console.error('[Scan]', e)
    checkinStatus.value = 'error'
    checkinError.value = e?.message || '掃碼失敗'
  }
}

async function handleCheckin(hid: string, nonce: string) {
  const brokerUrl = import.meta.env.VITE_MQTT_BROKER_URL || `wss://${window.location.host}/mqtt`

  // 第一階段：提交 nonce，等待 gui-replenish 驗證
  checkinStatus.value = 'processing'
  try {
    const nonceResult = await submitNonceAndWait(brokerUrl, hid, nonce)
    if (!nonceResult.accepted) {
      checkinStatus.value = 'error'
      checkinError.value = nonceResult.error || 'QR Code 已過期'
      return
    }
  } catch (e: any) {
    checkinStatus.value = 'error'
    checkinError.value = e?.message || '等待機台確認失敗'
    return
  }

  // 第二階段：nonce 通過，查詢 GraphQL 角色 + 機台
  try {
    const [userData, vmData] = await Promise.all([
      gql<{ upsertUser: { isAdmin: boolean, operatorRoles: Array<{ operatorId: string, roles: string[] }> } }>(
        `mutation($input: UpsertUserInput!) {
          upsertUser(input: $input) { isAdmin operatorRoles { operatorId roles } }
        }`, {
          input: {
            lineUserId: profile.value.userId,
            displayName: profile.value.displayName,
            pictureUrl: profile.value.pictureUrl || '',
          }
        }
      ),
      gql<{ vms: Array<{ vmid: string; hidCode: string; operatorId: string }> }>(
        `{ vms(limit: 500) { vmid hidCode operatorId } }`
      ),
    ])

    const user = userData.upsertUser
    const vm = vmData.vms.find(v => v.hidCode === hid)

    if (!vm) {
      const errMsg = `找不到 HID ${hid} 對應的機台`
      try { await publishAuthResult(brokerUrl, hid, { authenticated: false, error: errMsg }) } catch (e) { console.error('[Checkin] MQTT publish failed:', e) }
      checkinStatus.value = 'error'
      checkinError.value = errMsg
      return
    }

    const hasReplenisher = user?.operatorRoles?.some(
      or => or.operatorId === vm.operatorId && or.roles.includes('replenisher')
    )
    if (!hasReplenisher) {
      const errMsg = '您沒有此機台的巡補員權限'
      try { await publishAuthResult(brokerUrl, hid, { authenticated: false, error: errMsg }) } catch (e) { console.error('[Checkin] MQTT publish failed:', e) }
      checkinStatus.value = 'error'
      checkinError.value = errMsg
      return
    }

    // 認證成功
    try { await publishAuthResult(brokerUrl, hid, {
      authenticated: true,
      lineUserId: profile.value.userId,
      displayName: profile.value.displayName,
      accessToken: liff.getAccessToken() || undefined,
    }) } catch (e) { console.error('[Checkin] MQTT publish failed:', e) }

    checkinStatus.value = 'done'
    router.push(`/replenisher/${vm.vmid}/session`)
  } catch (e: any) {
    const errMsg = e?.message || '簽到失敗'
    console.error('[Checkin]', e)
    try { await publishAuthResult(brokerUrl, hid, { authenticated: false, error: errMsg }) } catch (mqttErr) { console.error('[Checkin] MQTT publish failed:', mqttErr) }
    checkinStatus.value = 'error'
    checkinError.value = errMsg
  }
}

onMounted(async () => { await Promise.all([refreshRoles(), loadData()]) })
</script>

<template>
  <div class="page">
    <header class="header">
      <h1>智購小幫手</h1>
      <div class="header-right">
        <button class="refresh-btn" @click="refresh" :disabled="refreshing" title="重新整理">
          <span :class="{ spinning: refreshing }">🔄</span>
        </button>
        <div v-if="profile" class="user-info">
          <img v-if="profile.pictureUrl" :src="profile.pictureUrl" class="avatar" />
          <span>{{ profile.displayName }}</span>
        </div>
      </div>
    </header>

    <nav class="role-nav">
      <!-- 消費者 -->
      <div class="section-header">🛒 消費者</div>
      <router-link to="/consumer/shop" class="role-card role-card-sub">
        <span class="role-icon">🛒</span>
        <span class="role-label">線上訂購</span>
        <span class="role-desc">瀏覽商品、加入購物車</span>
      </router-link>
      <router-link to="/consumer/orders" class="role-card role-card-sub">
        <span class="role-icon">📦</span>
        <span class="role-label">我的訂單</span>
        <span class="role-desc">查看訂單與取貨碼</span>
      </router-link>
      <router-link to="/consumer/tickets/new" class="role-card role-card-sub">
        <span class="role-icon">📝</span>
        <span class="role-label">問題回報</span>
        <span class="role-desc">回報機台或商品問題</span>
      </router-link>
      <router-link to="/consumer/tickets" class="role-card role-card-sub">
        <span class="role-icon">📋</span>
        <span class="role-label">我的問題單</span>
        <span class="role-desc">查詢處理進度</span>
      </router-link>

      <!-- 營運管理：列出可管理的營運商 -->
      <template v-if="isOperator || isAdmin">
        <div class="section-header">📊 營運管理</div>
        <router-link
          v-for="opId in operatorIdsWithRole('operator')"
          :key="opId"
          :to="`/operator/${opId}`"
          class="role-card role-card-sub"
        >
          <span class="role-icon">🏢</span>
          <span class="role-label">{{ opName(opId) }}({{ opId }})</span>
          <span class="role-desc">
            <template v-if="vmStatusMap[opId]">
              <span style="color:#22c55e">●&nbsp;上線&nbsp;{{ vmStatusMap[opId].online }}</span>
              <span v-if="vmStatusMap[opId].offline" style="color:#999; margin-left:6px">●&nbsp;斷線&nbsp;{{ vmStatusMap[opId].offline }}</span>
            </template>
            <template v-if="revenueMap[opId]">
              <span style="margin-left:6px; color:#e67e22">💰 ${{ revenueMap[opId].revenue }} ({{ revenueMap[opId].txCount }}筆)</span>
            </template>
            <template v-else>
              <span style="margin-left:6px; color:#ccc">💰 $0</span>
            </template>
          </span>
        </router-link>
      </template>

      <!-- 巡補員 -->
      <template v-if="isReplenisher">
        <div class="section-header">🔧 巡補員</div>
        <router-link to="/replenisher/picklist" class="role-card role-card-sub">
          <span class="role-icon">📋</span>
          <span class="role-label">檢貨清單</span>
          <span class="role-desc">查看待補貨機台</span>
        </router-link>
        <a class="role-card role-card-sub" @click.prevent="startReplenishScan" style="cursor:pointer">
          <span class="role-icon">📷</span>
          <span class="role-label">巡補作業</span>
          <span class="role-desc">
            <template v-if="checkinStatus === 'scanning'">開啟掃碼中…</template>
            <template v-else-if="checkinStatus === 'processing'">身分查驗中…</template>
            <template v-else-if="checkinStatus === 'error'">{{ checkinError }}</template>
            <template v-else>掃描機台 QR Code 開始巡補</template>
          </span>
        </a>
      </template>

      <!-- 系統管理 -->
      <template v-if="isAdmin">
        <div class="section-header">⚙️ 系統管理</div>
        <router-link to="/admin/users" class="role-card role-card-sub">
          <span class="role-icon">👥</span>
          <span class="role-label">使用者 <span class="count-badge">{{ adminCounts.users }}</span></span>
          <span class="role-desc">管理使用者與角色</span>
        </router-link>
        <router-link to="/admin/operators" class="role-card role-card-sub">
          <span class="role-icon">🏢</span>
          <span class="role-label">營運商 <span class="count-badge">{{ adminCounts.operators }}</span></span>
          <span class="role-desc">營運商設定</span>
        </router-link>
        <router-link to="/admin/hids" class="role-card role-card-sub">
          <span class="role-icon">🔖</span>
          <span class="role-label">機碼 <span class="count-badge">{{ adminCounts.hids }}</span></span>
          <span class="role-desc">HID 管理</span>
        </router-link>
        <router-link to="/admin/machines" class="role-card role-card-sub">
          <span class="role-icon">🏭</span>
          <span class="role-label">機台 <span class="count-badge">{{ adminCounts.vms }}</span></span>
          <span class="role-desc">機台設定與狀態</span>
        </router-link>
        <router-link to="/admin/online-orders" class="role-card role-card-sub">
          <span class="role-icon">📦</span>
          <span class="role-label">取貨單管理</span>
          <span class="role-desc">查看與處理線上訂單</span>
        </router-link>
      </template>
    </nav>

    <footer class="footer">
      <button class="btn-text" @click="logout()">登出</button>
    </footer>
  </div>
</template>

<style scoped>
.section-header {
  font-size: 14px;
  font-weight: 600;
  color: #555;
  padding: 12px 4px 4px;
}
.role-card-sub {
  margin-left: 8px;
  border-left: 3px solid #4a90d9;
}
.count-badge {
  display: inline-block;
  background: #e0e7ef;
  color: #4a5568;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: 4px;
  vertical-align: middle;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.refresh-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.refresh-btn:hover {
  opacity: 1;
}
.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
