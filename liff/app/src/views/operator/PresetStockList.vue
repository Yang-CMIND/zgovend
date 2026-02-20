<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const operatorId = route.params.operatorId as string
const operatorName = ref(operatorId)

interface Template {
  id: string
  name: string
  sourceType: string
  updatedAt: string
  channels: { channelNo: string }[]
}

const items = ref<Template[]>([])
const loading = ref(true)

// Dialogs
const showCreateDialog = ref(false)
const createMode = ref<'blank' | 'machine' | 'template'>('blank')
const newName = ref('')
const selectedMachineId = ref('')
const selectedTemplateId = ref('')
const machines = ref<{ id: string; vmid: string; name: string }[]>([])
const creating = ref(false)

// Rename
const renaming = ref<Template | null>(null)
const renameName = ref('')
const renameSaving = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await gql(`{
      presetStockTemplates(operatorId: "${operatorId}") {
        id name sourceType updatedAt
        channels { channelNo }
      }
    }`)
    items.value = data.presetStockTemplates
  } finally {
    loading.value = false
  }
}

async function loadMachines() {
  try {
    const data = await gql(`{ vms(operatorId: "${operatorId}", limit: 500) { id vmid name } }`)
    machines.value = data.vms || []
  } catch {}
}

function openCreate(mode: 'blank' | 'machine' | 'template') {
  createMode.value = mode
  newName.value = ''
  selectedMachineId.value = ''
  selectedTemplateId.value = ''
  showCreateDialog.value = true
  if (mode === 'machine') loadMachines()
}

async function doCreate() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    if (createMode.value === 'blank') {
      await gql(`mutation($input: CreatePresetStockTemplateInput!) {
        createPresetStockTemplate(input: $input) { id }
      }`, { input: { operatorId, name: newName.value.trim() } })
    } else if (createMode.value === 'machine') {
      if (!selectedMachineId.value) return
      await gql(`mutation($operatorId: String!, $name: String!, $machineId: ID!) {
        copyPresetStockFromMachine(operatorId: $operatorId, name: $name, machineId: $machineId) { id }
      }`, { operatorId, name: newName.value.trim(), machineId: selectedMachineId.value })
    } else {
      if (!selectedTemplateId.value) return
      await gql(`mutation($operatorId: String!, $name: String!, $sourceTemplateId: ID!) {
        copyPresetStockFromTemplate(operatorId: $operatorId, name: $name, sourceTemplateId: $sourceTemplateId) { id }
      }`, { operatorId, name: newName.value.trim(), sourceTemplateId: selectedTemplateId.value })
    }
    showCreateDialog.value = false
    await load()
  } catch (e: any) {
    alert('建立失敗：' + e.message)
  } finally {
    creating.value = false
  }
}

function startRename(item: Template) {
  renaming.value = item
  renameName.value = item.name
}

async function doRename() {
  if (!renaming.value || !renameName.value.trim()) return
  renameSaving.value = true
  try {
    await gql(`mutation($id: ID!, $name: String!) {
      renamePresetStockTemplate(id: $id, name: $name) { id }
    }`, { id: renaming.value.id, name: renameName.value.trim() })
    renaming.value = null
    await load()
  } catch (e: any) {
    alert('重命名失敗：' + e.message)
  } finally {
    renameSaving.value = false
  }
}

async function doDelete(item: Template) {
  if (!confirm(`確定刪除「${item.name}」？`)) return
  try {
    await gql(`mutation($id: ID!) { deletePresetStockTemplate(id: $id) }`, { id: item.id })
    await load()
  } catch (e: any) {
    alert('刪除失敗：' + e.message)
  }
}

function goEdit(item: Template) {
  router.push(`/operator/${operatorId}/preset-stock/${item.id}`)
}

function sourceLabel(s: string) {
  if (s === 'machine') return '📋 機台快照'
  if (s === 'template') return '📄 複製'
  return '✨ 空白'
}

function timeAgo(iso: string) {
  if (!iso) return ''
  const d = /^\d+$/.test(iso) ? new Date(Number(iso)) : new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60000) return '剛剛'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分鐘前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小時前'
  return d.toLocaleDateString('zh-TW')
}

onMounted(async () => {
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  load()
})
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '庫存預約設定' },
    ]">
      <button class="header-action" @click="openCreate('blank')">＋新增</button>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <div v-else-if="items.length === 0" class="placeholder">
      <p>尚無設定檔</p>
      <div class="empty-actions">
        <button class="btn-outline" @click="openCreate('blank')">✨ 建立空白</button>
        <button class="btn-outline" @click="openCreate('machine')">📋 從機台複製</button>
      </div>
    </div>

    <ul v-else class="list">
      <li v-for="item in items" :key="item.id" class="list-item" @click="goEdit(item)">
        <div class="item-info">
          <div class="item-name">{{ item.name }}</div>
          <div class="item-meta">
            <span>{{ sourceLabel(item.sourceType) }}</span>
            <span>{{ item.channels.length }} 貨道</span>
            <span>{{ timeAgo(item.updatedAt) }}</span>
          </div>
        </div>
        <div class="item-actions" @click.stop>
          <button class="btn-icon" @click="startRename(item)" title="重命名">✏️</button>
          <button class="btn-icon" @click="openCreate('template'); selectedTemplateId = item.id; newName = item.name + ' (複本)'" title="複製">📄</button>
          <button class="btn-icon btn-danger" @click="doDelete(item)" title="刪除">🗑️</button>
        </div>
      </li>
    </ul>

    <!-- 新增 / 複製 Dialog -->
    <div v-if="showCreateDialog" class="overlay">
      <div class="modal">
        <h2>{{ createMode === 'blank' ? '新增空白設定檔' : createMode === 'machine' ? '從機台快照建立' : '複製設定檔' }}</h2>
        <div class="form-fields">
          <label class="form-label">
            <span>設定檔名稱 *</span>
            <input v-model="newName" placeholder="例如：標準配置A" />
          </label>
          <label v-if="createMode === 'machine'" class="form-label">
            <span>選擇機台 *</span>
            <select v-model="selectedMachineId">
              <option value="">-- 請選擇 --</option>
              <option v-for="m in machines" :key="m.id" :value="m.id">{{ m.vmid }} {{ m.name ? `(${m.name})` : '' }}</option>
            </select>
          </label>
          <label v-if="createMode === 'template'" class="form-label">
            <span>來源設定檔 *</span>
            <select v-model="selectedTemplateId">
              <option value="">-- 請選擇 --</option>
              <option v-for="t in items" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-text" @click="showCreateDialog = false">取消</button>
          <button class="btn-primary-sm" :disabled="creating || !newName.trim()" @click="doCreate">
            {{ creating ? '建立中…' : '建立' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 重命名 Dialog -->
    <div v-if="renaming" class="overlay">
      <div class="modal">
        <h2>重命名設定檔</h2>
        <div class="form-fields">
          <label class="form-label">
            <span>新名稱</span>
            <input v-model="renameName" />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-text" @click="renaming = null">取消</button>
          <button class="btn-primary-sm" :disabled="renameSaving || !renameName.trim()" @click="doRename">
            {{ renameSaving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.list-item:active {
  background: #f8f8f8;
}
.item-info {
  flex: 1;
  min-width: 0;
}
.item-name {
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
  color: #999;
}
.item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.btn-icon {
  background: none;
  border: none;
  font-size: 16px;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
}
.btn-icon:active {
  background: #eee;
}
.btn-danger {
  color: #c62828;
}
.empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: center;
}
.btn-outline {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.btn-outline:active {
  background: #f0f0f0;
}
</style>
