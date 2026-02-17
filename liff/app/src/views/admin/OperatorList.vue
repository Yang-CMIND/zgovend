<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

interface Operator {
  id: string
  code: string
  name: string
  status: string
  notes: string
}

const items = ref<Operator[]>([])
const loading = ref(true)
const editing = ref<Partial<Operator> | null>(null)
const isNew = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await gql(`{ operators { id code name status notes } }`)
    items.value = data.operators
  } finally {
    loading.value = false
  }
}

function startNew() {
  isNew.value = true
  editing.value = { code: '', name: '', status: 'active', notes: '' }
}

function startEdit(item: Operator) {
  isNew.value = false
  editing.value = { ...item }
}

function cancel() { editing.value = null }

async function save() {
  if (!editing.value) return
  saving.value = true
  try {
    if (isNew.value) {
      const { id, ...input } = editing.value as any
      await gql(`mutation($input: CreateOperatorInput!) { createOperator(input: $input) { id } }`, { input })
    } else {
      const { id, code, ...input } = editing.value as any
      await gql(`mutation($id: ID!, $input: UpdateOperatorInput!) { updateOperator(id: $id, input: $input) { id } }`, { id, input })
    }
    editing.value = null
    await load()
  } catch (e: any) {
    alert('儲存失敗：' + e.message)
  } finally {
    saving.value = false
  }
}

async function remove(item: Operator) {
  if (!confirm(`確定刪除營運商「${item.name}」？`)) return
  try {
    await gql(`mutation($id: ID!) { deleteOperator(id: $id) }`, { id: item.id })
    await load()
  } catch (e: any) {
    alert('刪除失敗：' + e.message)
  }
}

function statusLabel(s: string) {
  return s === 'active' ? '啟用' : '停用'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '系統管理', to: '/admin' },
      { label: '營運商管理' },
    ]">
      <button class="header-action" @click="startNew">＋新增</button>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <div v-else-if="items.length === 0" class="placeholder">尚無營運商</div>

    <ul v-else class="user-list">
      <li v-for="item in items" :key="item.id" class="user-item">
        <div class="user-info-col" @click="startEdit(item)">
          <div class="user-name">{{ item.name }} ({{ item.code }})</div>
          <div class="user-roles">{{ statusLabel(item.status) }}</div>
          <div v-if="item.notes" class="user-meta">{{ item.notes }}</div>
        </div>
        <button class="btn-delete" @click.stop="remove(item)">刪除</button>
      </li>
    </ul>

    <div v-if="editing" class="overlay">
      <div class="modal">
        <h2>{{ isNew ? '新增營運商' : '編輯營運商' }}</h2>
        <div class="form-fields">
          <label class="form-label">
            <span>代碼 *</span>
            <input v-model="editing.code" :disabled="!isNew" placeholder="營運商代碼" />
          </label>
          <label class="form-label">
            <span>名稱 *</span>
            <input v-model="editing.name" placeholder="營運商名稱" />
          </label>
          <label class="form-label">
            <span>狀態</span>
            <select v-model="editing.status">
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </label>
          <label class="form-label">
            <span>備註</span>
            <textarea v-model="editing.notes" rows="2" placeholder="備註"></textarea>
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-text" @click="cancel">取消</button>
          <button class="btn-primary-sm" :disabled="saving || !editing.code || !editing.name" @click="save">
            {{ saving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
