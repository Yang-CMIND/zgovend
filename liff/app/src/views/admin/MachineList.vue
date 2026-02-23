<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

interface Machine {
  id: string
  vmid: string
  hidCode: string
  operatorId: string
  locationName: string
  locationInfo: string
  status: string
  notes: string
}

const items = ref<Machine[]>([])
const availableHids = ref<{ code: string }[]>([])
const operatorList = ref<{ code: string; name: string }[]>([])
const loading = ref(true)
const editing = ref<Partial<Machine> | null>(null)
const isNew = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await gql(`{
      vms { id vmid hidCode operatorId locationName locationInfo status notes }
      operators { code name }
    }`)
    items.value = data.vms
    operatorList.value = data.operators
  } finally {
    loading.value = false
  }
}

async function loadAvailableHids(excludeVmId?: string) {
  const vars = excludeVmId ? `(excludeVmId: "${excludeVmId}")` : ''
  const data = await gql(`{ availableHids${vars} { code } }`)
  availableHids.value = data.availableHids
}

function startNew() {
  isNew.value = true
  editing.value = { vmid: '', hidCode: '', operatorId: '', locationName: '', locationInfo: '', status: 'active', notes: '' }
  loadAvailableHids()
}

function startEdit(item: Machine) {
  isNew.value = false
  editing.value = { ...item }
  loadAvailableHids(item.id)
}

function cancel() { editing.value = null }

async function save() {
  if (!editing.value) return
  saving.value = true
  try {
    if (isNew.value) {
      const { id, ...input } = editing.value as any
      await gql(`mutation($input: CreateVmInput!) { createVm(input: $input) { id } }`, { input })
    } else {
      const { id, vmid, ...input } = editing.value as any
      await gql(`mutation($id: ID!, $input: UpdateVmInput!) { updateVm(id: $id, input: $input) { id } }`, { id, input })
    }
    editing.value = null
    await load()
  } catch (e: any) {
    alert('儲存失敗：' + e.message)
  } finally {
    saving.value = false
  }
}

async function remove(item: Machine) {
  if (!confirm(`確定刪除機台「${item.vmid}」？`)) return
  try {
    await gql(`mutation($id: ID!) { deleteVm(id: $id) }`, { id: item.id })
    await load()
  } catch (e: any) {
    alert('刪除失敗：' + e.message)
  }
}

function opName(code: string) {
  const op = operatorList.value.find(o => o.code === code)
  return op ? op.name : code || '-'
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
      { label: '機台管理' },
    ]">
      <button class="header-action" @click="startNew">＋新增</button>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <div v-else-if="items.length === 0" class="placeholder">尚無機台</div>

    <ul v-else class="user-list">
      <li v-for="item in items" :key="item.id" class="user-item">
        <div class="user-info-col" @click="startEdit(item)">
          <div class="user-name">{{ item.vmid }}</div>
          <div class="user-roles">
            {{ item.hidCode ? 'HID: ' + item.hidCode + ' · ' : '' }}{{ opName(item.operatorId) }} · {{ statusLabel(item.status) }}
          </div>
          <div v-if="item.locationName" class="user-meta">📍 {{ item.locationName }}{{ item.locationInfo ? ' — ' + item.locationInfo : '' }}</div>
        </div>
        <button class="btn-delete" @click.stop="remove(item)">刪除</button>
      </li>
    </ul>

    <div v-if="editing" class="overlay">
      <div class="modal">
        <h2>{{ isNew ? '新增機台' : '編輯機台' }}</h2>
        <div class="form-fields">
          <label class="form-label">
            <span>VMID *</span>
            <input v-model="editing.vmid" :disabled="!isNew" placeholder="機台識別碼" />
          </label>
          <label class="form-label">
            <span>綁定 HID</span>
            <select v-model="editing.hidCode">
              <option value="">未綁定</option>
              <option v-for="h in availableHids" :key="h.code" :value="h.code">{{ h.code }}</option>
            </select>
          </label>
          <label class="form-label">
            <span>營運商</span>
            <select v-model="editing.operatorId">
              <option value="">未指定</option>
              <option v-for="op in operatorList" :key="op.code" :value="op.code">{{ op.name }} ({{ op.code }})</option>
            </select>
          </label>
          <label class="form-label">
            <span>狀態</span>
            <select v-model="editing.status">
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </label>
          <label class="form-label">
            <span>地點名稱</span>
            <input v-model="editing.locationName" placeholder="例如：台北信義店" />
          </label>
          <label class="form-label">
            <span>地點資訊</span>
            <textarea v-model="editing.locationInfo" rows="2" placeholder="地址或其他位置說明"></textarea>
          </label>
          <label class="form-label">
            <span>備註</span>
            <textarea v-model="editing.notes" rows="2" placeholder="備註"></textarea>
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-text" @click="cancel">取消</button>
          <button class="btn-primary-sm" :disabled="saving || !editing.vmid" @click="save">
            {{ saving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
