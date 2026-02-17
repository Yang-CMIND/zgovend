<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const vmid = route.params.vmid as string
const vmInfo = ref<{ locationName?: string; operatorId?: string }>({})

onMounted(async () => {
  try {
    const data = await gql(`query($vmid: String!) { vmByVmid(vmid: $vmid) { locationName operatorId } }`, { vmid })
    if (data.vmByVmid) vmInfo.value = data.vmByVmid
  } catch { /* noop */ }
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '巡補員', to: '/' },
      { label: vmid },
    ]" />
    <p v-if="vmInfo.locationName" style="padding: 0 16px; color: #888; font-size: 14px;">📍 {{ vmInfo.locationName }}</p>
    <nav class="menu">
      <router-link :to="`/replenisher/${vmid}/picklist`" class="menu-item">📋 撿貨清單</router-link>
      <router-link :to="`/replenisher/${vmid}/session`" class="menu-item">🔧 巡補作業</router-link>
    </nav>
  </div>
</template>
