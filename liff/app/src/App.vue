<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useLiff } from './composables/useLiff'
import { useRoute } from 'vue-router'

const { init, isReady, isLoggedIn, isInClient, error, login, profile } = useLiff()
const route = useRoute()
const showDebug = ref(false)

onMounted(async () => {
  await init()
})
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

    <!-- 已登入 → 路由 -->
    <router-view v-else />
  </div>
</template>
