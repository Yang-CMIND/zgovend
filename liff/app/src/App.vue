<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useLiff } from './composables/useLiff'
import { useMqttAuth } from './composables/useMqttAuth'
import { gql } from './composables/useGraphQL'
import { useRoute, useRouter } from 'vue-router'

const { init, isReady, isLoggedIn, isInClient, error, login, profile } = useLiff()
const { publishCheckin } = useMqttAuth()
const route = useRoute()
const router = useRouter()
const showDebug = ref(false)
const checkinStatus = ref('')  // '', 'processing', 'done', 'error'
const checkinError = ref('')

onMounted(async () => {
  await init()

  // 攔截機台簽到 action
  const params = new URLSearchParams(window.location.search)
  const action = params.get('action')
  const hid = params.get('hid')
  const nonce = params.get('nonce')

  if (action === 'checkin' && hid && nonce && isLoggedIn.value && profile.value) {
    await handleCheckin(hid, nonce)
  }
})

async function handleCheckin(hid: string, nonce: string) {
  const brokerUrl = `wss://${window.location.host}/mqtt`

  // 先通知機台：已掃碼，正在查驗身分
  checkinStatus.value = 'processing'
  try { await publishCheckin(brokerUrl, hid, { authenticated: false, nonce, status: 'verifying' }) } catch {}

  try {
    // 即時查詢角色（透過 upsertUser 取得最新角色）與機台
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
      gql<{ vms: Array<{ vmid: string, hidCode: string }> }>(
        `{ vms(limit: 500) { vmid hidCode } }`
      ),
    ])

    const user = userData.upsertUser
    const hasReplenisher = user?.operatorRoles?.some(or => or.roles.includes('replenisher'))
    if (!hasReplenisher && !user?.isAdmin) {
      const errMsg = '您沒有巡補員權限'
      checkinStatus.value = 'error'
      checkinError.value = errMsg
      try { await publishCheckin(brokerUrl, hid, { authenticated: false, nonce, error: errMsg }) } catch {}
      return
    }

    const vm = (vmData.vms as Array<{ vmid: string; hidCode: string }>)
      .find(v => v.hidCode === hid)

    if (!vm) {
      const errMsg = `找不到 HID ${hid} 對應的機台`
      checkinStatus.value = 'error'
      checkinError.value = errMsg
      try { await publishCheckin(brokerUrl, hid, { authenticated: false, nonce, error: errMsg }) } catch {}
      return
    }

    // Publish 認證成功訊息（帶 nonce）
    await publishCheckin(brokerUrl, hid, {
      authenticated: true,
      nonce,
      lineUserId: profile.value.userId,
      displayName: profile.value.displayName,
    })

    checkinStatus.value = 'done'
    // 導航至巡補作業頁
    router.replace(`/replenisher/${vm.vmid}/session`)
  } catch (e: any) {
    const errMsg = e?.message || '簽到失敗'
    checkinStatus.value = 'error'
    checkinError.value = errMsg
    console.error('[Checkin]', e)
    // 嘗試通知機台端（MQTT 本身失敗則無法通知）
    try { await publishCheckin(brokerUrl, hid, { authenticated: false, nonce, error: errMsg }) } catch {}
  }
}
</script>

<template>
  <div class="app">
    <!-- Debug 面板（開發期間，點擊可關閉） -->
    <div v-if="showDebug" class="debug-panel" @click="showDebug = false">
      <small>
        ready={{ isReady }} | loggedIn={{ isLoggedIn }} | inClient={{ isInClient }}
        | err={{ error }} | name={{ profile?.displayName || '-' }}
        | path={{ route.fullPath }}
      </small>
    </div>

    <!-- LIFF 初始化中 -->
    <div v-if="!isReady && !error" class="loading">
      <p>載入中…</p>
    </div>

    <!-- LIFF 初始化失敗 -->
    <div v-else-if="error" class="error-page">
      <h2>初始化失敗</h2>
      <p>{{ error }}</p>
    </div>

    <!-- 未登入（僅外部瀏覽器會看到） -->
    <div v-else-if="!isLoggedIn" class="login-page">
      <h1>智購販賣機</h1>
      <p>請先登入 LINE 帳號</p>
      <button class="btn-primary" @click="login()">登入</button>
    </div>

    <!-- 機台簽到處理中 -->
    <div v-else-if="checkinStatus === 'processing'" class="loading">
      <p>正在簽到中…</p>
    </div>

    <!-- 機台簽到失敗 -->
    <div v-else-if="checkinStatus === 'error'" class="error-page">
      <h2>簽到失敗</h2>
      <p>{{ checkinError }}</p>
      <button class="btn-primary" @click="router.push('/')">返回首頁</button>
    </div>

    <!-- 已登入 → 路由 -->
    <router-view v-else />
  </div>
</template>
