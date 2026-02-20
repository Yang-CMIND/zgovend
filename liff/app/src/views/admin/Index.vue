<script setup lang="ts">
import PageHeader from '../../components/PageHeader.vue'
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[{ label: '系統管理' }]" />
    <nav class="menu">
      <router-link to="/admin/users" class="menu-item">👤 使用者管理</router-link>
      <router-link to="/admin/operators" class="menu-item">🏢 營運商管理</router-link>
      <router-link to="/admin/hids" class="menu-item">🏭 機碼設定</router-link>
      <router-link to="/admin/machines" class="menu-item">🖥️ 機台管理</router-link>
      <router-link to="/admin/online-orders" class="menu-item">📦 取貨單管理</router-link>
    </nav>
  </div>
</template>
