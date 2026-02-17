<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

interface OperatorRole {
  operatorId: string
  roles: string[]
}

interface User {
  id: string
  lineUserId: string
  displayName: string
  pictureUrl: string
  isAdmin: boolean
  operatorRoles: OperatorRole[]
  lastLoginAt: string
}

interface Operator {
  code: string
  name: string
}

const users = ref<User[]>([])
const operators = ref<Operator[]>([])
const loading = ref(true)
const editingUser = ref<User | null>(null)
const editAdmin = ref(false)
const editRoles = ref<OperatorRole[]>([])
const saving = ref(false)

const OP_ROLE_OPTIONS = [
  { value: 'operator', label: '營運管理' },
  { value: 'replenisher', label: '巡補員' },
]

async function loadUsers() {
  loading.value = true
  try {
    const data = await gql(`{
      users(limit: 200) {
        id lineUserId displayName pictureUrl isAdmin operatorRoles { operatorId roles } lastLoginAt
      }
      operators(limit: 200) { code name }
    }`)
    users.value = data.users
    operators.value = data.operators
  } catch (e) {
    console.error('loadUsers failed:', e)
  } finally {
    loading.value = false
  }
}

function startEdit(user: User) {
  editingUser.value = user
  editAdmin.value = user.isAdmin
  editRoles.value = user.operatorRoles.map(or => ({
    operatorId: or.operatorId,
    roles: [...or.roles],
  }))
}

function cancelEdit() {
  editingUser.value = null
}

function addOperator() {
  const assigned = new Set(editRoles.value.map(or => or.operatorId))
  const available = operators.value.find(op => !assigned.has(op.code))
  if (available) {
    editRoles.value.push({ operatorId: available.code, roles: [] })
  }
}

function removeOperator(idx: number) {
  editRoles.value.splice(idx, 1)
}

function toggleRole(orIdx: number, role: string) {
  const or = editRoles.value[orIdx]
  const ri = or.roles.indexOf(role)
  if (ri >= 0) or.roles.splice(ri, 1)
  else or.roles.push(role)
}

async function saveRoles() {
  if (!editingUser.value) return
  saving.value = true
  try {
    const cleaned = editRoles.value.filter(or => or.roles.length > 0)
    const data = await gql(`mutation($input: UpdateUserOperatorRolesInput!) {
      updateUserOperatorRoles(input: $input) { lineUserId isAdmin operatorRoles { operatorId roles } }
    }`, {
      input: {
        lineUserId: editingUser.value.lineUserId,
        isAdmin: editAdmin.value,
        operatorRoles: cleaned.map(or => ({ operatorId: or.operatorId, roles: or.roles })),
      }
    })
    const u = users.value.find(u => u.lineUserId === editingUser.value!.lineUserId)
    if (u && data.updateUserOperatorRoles) {
      u.isAdmin = data.updateUserOperatorRoles.isAdmin
      u.operatorRoles = data.updateUserOperatorRoles.operatorRoles
    }
    editingUser.value = null
  } catch (e: any) {
    console.error('saveRoles failed:', e)
    alert('儲存失敗：' + e.message)
  } finally {
    saving.value = false
  }
}

function opName(code: string) {
  return operators.value.find(o => o.code === code)?.name || code
}

function summaryText(user: User) {
  const parts: string[] = []
  if (user.isAdmin) parts.push('系統管理')
  for (const or of user.operatorRoles) {
    const rLabels = or.roles.map(r => OP_ROLE_OPTIONS.find(o => o.value === r)?.label || r).join('+')
    parts.push(`${opName(or.operatorId)}：${rLabels}`)
  }
  return parts.length > 0 ? parts.join('；') : '消費者'
}

function assignedOperatorIds() {
  return new Set(editRoles.value.map(or => or.operatorId))
}

function hasAvailableOperators() {
  const assigned = assignedOperatorIds()
  return operators.value.some(op => !assigned.has(op.code))
}

function formatTime(ts: string) {
  if (!ts) return '-'
  const d = new Date(Number(ts))
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
}

onMounted(loadUsers)
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '系統管理', to: '/admin' },
      { label: '使用者管理' },
    ]">
      <span class="header-badge">{{ users.length }}</span>
    </PageHeader>

    <div v-if="loading" class="placeholder">載入中…</div>
    <div v-else-if="users.length === 0" class="placeholder">尚無使用者</div>

    <ul v-else class="user-list">
      <li v-for="user in users" :key="user.lineUserId" class="user-item" @click="startEdit(user)">
        <img v-if="user.pictureUrl" :src="user.pictureUrl" class="avatar" />
        <div v-else class="avatar avatar-placeholder">👤</div>
        <div class="user-info-col">
          <div class="user-name">{{ user.displayName }}</div>
          <div class="user-roles">{{ summaryText(user) }}</div>
          <div class="user-meta">最後登入：{{ formatTime(user.lastLoginAt) }}</div>
        </div>
        <span class="chevron">›</span>
      </li>
    </ul>

    <!-- 編輯角色 overlay -->
    <div v-if="editingUser" class="overlay">
      <div class="modal modal-wide">
        <h2>{{ editingUser.displayName }}</h2>

        <label class="admin-checkbox">
          <input type="checkbox" v-model="editAdmin" />
          <span>系統管理（全域）</span>
        </label>

        <hr class="divider" />

        <p class="section-title">所屬營運商與角色</p>

        <div v-if="editRoles.length === 0" class="placeholder" style="padding: 8px 0; font-size: 14px;">
          尚未指派營運商
        </div>

        <div v-for="(or, idx) in editRoles" :key="idx" class="operator-role-card">
          <div class="or-header">
            <select v-model="or.operatorId" class="or-select">
              <option v-for="op in operators" :key="op.code" :value="op.code"
                :disabled="op.code !== or.operatorId && assignedOperatorIds().has(op.code)">
                {{ op.name }} ({{ op.code }})
              </option>
            </select>
            <button class="btn-delete-sm" @click="removeOperator(idx)" title="移除">✕</button>
          </div>
          <div class="role-checkboxes">
            <label v-for="opt in OP_ROLE_OPTIONS" :key="opt.value" class="role-checkbox">
              <input
                type="checkbox"
                :checked="or.roles.includes(opt.value)"
                @change="toggleRole(idx, opt.value)"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <button
          v-if="hasAvailableOperators()"
          class="btn-add-operator"
          @click="addOperator"
        >＋ 新增營運商</button>

        <div class="modal-actions">
          <button class="btn-text" @click="cancelEdit">取消</button>
          <button class="btn-primary-sm" :disabled="saving" @click="saveRoles">
            {{ saving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-wide { max-width: 420px; }
.admin-checkbox { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 15px; font-weight: 500; }
.admin-checkbox input[type="checkbox"] { width: 18px; height: 18px; }
.divider { border: none; border-top: 1px solid #eee; margin: 8px 0; }
.section-title { font-size: 13px; color: #888; margin: 4px 0 8px; }
.operator-role-card { background: #f7f7f7; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.or-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.or-select { flex: 1; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; background: #fff; }
.btn-delete-sm { background: none; border: none; color: #e74c3c; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.btn-add-operator { display: block; width: 100%; padding: 10px; margin-top: 4px; margin-bottom: 12px; border: 2px dashed #ccc; border-radius: 8px; background: none; color: #666; font-size: 14px; cursor: pointer; }
</style>
