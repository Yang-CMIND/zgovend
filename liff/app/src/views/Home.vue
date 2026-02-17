<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useLiff } from '../composables/useLiff'
import { gql } from '../composables/useGraphQL'

const { profile, logout, isAdmin, isOperator, isReplenisher, operatorRoles, operatorIdsWithRole } = useLiff()

interface Operator { code: string; name: string }
interface Vm { id: string; vmid: string; hidCode: string; operatorId: string; locationName: string; status: string }

const operatorMap = ref<Record<string, Operator>>({})
const replenisherVms = ref<Vm[]>([])
const loaded = ref(false)

async function loadData() {
  try {
    // Load operators for name display
    const data = await gql(`{ operators(limit: 200) { code name } vms(limit: 500) { id vmid hidCode operatorId locationName status } }`)
    const map: Record<string, Operator> = {}
    for (const op of data.operators) map[op.code] = op
    operatorMap.value = map

    // Filter VMs for replenisher's operators
    const repIds = new Set(operatorIdsWithRole('replenisher'))
    replenisherVms.value = data.vms.filter((vm: Vm) => repIds.has(vm.operatorId) && vm.status === 'active')
  } catch (e) {
    console.warn('loadData failed:', e)
  }
  loaded.value = true
}

function opName(code: string) {
  return operatorMap.value[code]?.name || code
}

onMounted(loadData)
</script>

<template>
  <div class="page">
    <header class="header">
      <h1>智購販賣機</h1>
      <div v-if="profile" class="user-info">
        <img v-if="profile.pictureUrl" :src="profile.pictureUrl" class="avatar" />
        <span>{{ profile.displayName }}</span>
      </div>
    </header>

    <nav class="role-nav">
      <!-- 消費者：所有人都有 -->
      <router-link to="/consumer" class="role-card">
        <span class="role-icon">🛒</span>
        <span class="role-label">消費者</span>
        <span class="role-desc">客服回報 · 進度查詢</span>
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
          <span class="role-label">{{ opName(opId) }}</span>
          <span class="role-desc">商品 · 機台 · 營收 · 庫存設定</span>
        </router-link>
      </template>

      <!-- 巡補員：列出可管理的機台 -->
      <template v-if="isReplenisher || isAdmin">
        <div class="section-header">🔧 巡補員</div>
        <div v-if="loaded && replenisherVms.length === 0" class="placeholder" style="font-size:14px; padding: 8px 16px;">
          無可巡補的機台
        </div>
        <router-link
          v-for="vm in replenisherVms"
          :key="vm.id"
          :to="`/replenisher/${vm.vmid}`"
          class="role-card role-card-sub"
        >
          <span class="role-icon">🏭</span>
          <span class="role-label">{{ vm.vmid }}</span>
          <span class="role-desc">{{ opName(vm.operatorId) }}{{ vm.locationName ? ' · ' + vm.locationName : '' }}</span>
        </router-link>
      </template>

      <!-- 系統管理 -->
      <router-link v-if="isAdmin" to="/admin" class="role-card">
        <span class="role-icon">⚙️</span>
        <span class="role-label">系統管理</span>
        <span class="role-desc">使用者 · 營運商 · 機碼 · 機台</span>
      </router-link>
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
</style>
