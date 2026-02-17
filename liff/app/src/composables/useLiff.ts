import liff from '@line/liff'
import { ref, readonly, computed } from 'vue'
import { gql } from './useGraphQL'

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string
const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID as string
const DEV_DISPLAY_NAME = import.meta.env.VITE_DEV_DISPLAY_NAME as string || 'Dev User'

const isReady = ref(false)
const isLoggedIn = ref(false)
const isInClient = ref(false)
const profile = ref<any>(null)
const idToken = ref<string | null>(null)
const error = ref<string | null>(null)

export interface OperatorRole {
  operatorId: string
  roles: string[]
}

const _isAdmin = ref(false)
const operatorRoles = ref<OperatorRole[]>([])

let initPromise: Promise<void> | null = null

async function init() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      // Dev mode: skip LIFF, use mock profile + real DB roles
      if (DEV_MODE) {
        console.log('🔧 Dev mode: skipping LIFF login')
        profile.value = {
          userId: DEV_USER_ID,
          displayName: DEV_DISPLAY_NAME,
          pictureUrl: '',
        }
        isLoggedIn.value = true
        isReady.value = true

        // Fetch real roles from DB via upsert
        try {
          const data = await gql(`mutation($input: UpsertUserInput!) {
            upsertUser(input: $input) { lineUserId isAdmin operatorRoles { operatorId roles } }
          }`, {
            input: {
              lineUserId: DEV_USER_ID,
              displayName: DEV_DISPLAY_NAME,
              pictureUrl: '',
            }
          })
          _isAdmin.value = data.upsertUser?.isAdmin || false
          operatorRoles.value = data.upsertUser?.operatorRoles || []
        } catch (e) {
          console.warn('Dev mode: upsertUser failed, using full access fallback')
          _isAdmin.value = true
          operatorRoles.value = []
        }
        return
      }

      // Production: normal LIFF flow
      if (!LIFF_ID) {
        error.value = '缺少 VITE_LIFF_ID 環境變數'
        return
      }

      await liff.init({ liffId: LIFF_ID })

      isInClient.value = liff.isInClient()
      isLoggedIn.value = liff.isLoggedIn()

      if (!liff.isLoggedIn() && liff.isInClient()) {
        liff.login()
        return
      }

      if (liff.isLoggedIn()) {
        try {
          profile.value = await liff.getProfile()
        } catch (e) {
          console.warn('getProfile failed:', e)
        }
        try {
          idToken.value = liff.getIDToken()
        } catch { /* noop */ }

        if (profile.value) {
          try {
            const data = await gql(`mutation($input: UpsertUserInput!) {
              upsertUser(input: $input) { lineUserId isAdmin operatorRoles { operatorId roles } }
            }`, {
              input: {
                lineUserId: profile.value.userId,
                displayName: profile.value.displayName,
                pictureUrl: profile.value.pictureUrl || '',
              }
            })
            _isAdmin.value = data.upsertUser?.isAdmin || false
            operatorRoles.value = data.upsertUser?.operatorRoles || []
          } catch (e) {
            console.warn('upsertUser failed:', e)
          }
        }
      }

      isReady.value = true
    } catch (e: any) {
      console.error('LIFF init error:', e)
      error.value = e?.message || String(e)
    }
  })()
  return initPromise
}

function login() {
  if (DEV_MODE) return
  const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/')
  liff.login({ redirectUri: baseUrl })
}

function logout() {
  if (DEV_MODE) {
    location.reload()
    return
  }
  liff.logout()
  if (liff.isInClient()) {
    liff.closeWindow()
  } else {
    location.reload()
  }
}

// 判斷是否在任一營運商有指定角色
const hasOperatorRole = (role: string) => operatorRoles.value.some(or => or.roles.includes(role))

// 取得有指定角色的營運商 ID 列表
const operatorIdsWithRole = (role: string) =>
  operatorRoles.value.filter(or => or.roles.includes(role)).map(or => or.operatorId)

const isAdmin = computed(() => _isAdmin.value)
const isOperator = computed(() => hasOperatorRole('operator'))
const isReplenisher = computed(() => hasOperatorRole('replenisher'))

export function useLiff() {
  return {
    init,
    login,
    logout,
    liff,
    isReady: readonly(isReady),
    isLoggedIn: readonly(isLoggedIn),
    isInClient: readonly(isInClient),
    profile: readonly(profile),
    idToken: readonly(idToken),
    error: readonly(error),
    operatorRoles: readonly(operatorRoles),
    hasOperatorRole,
    operatorIdsWithRole,
    isAdmin,
    isOperator,
    isReplenisher,
  }
}
