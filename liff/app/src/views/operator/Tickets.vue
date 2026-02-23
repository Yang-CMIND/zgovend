<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const operatorId = route.params.operatorId as string
const { init, profile } = useLiff()

const tickets = ref<any[]>([])
const loading = ref(true)
const filterStatus = ref('')
const expandedId = ref<string | null>(null)
const replyText = ref('')
const sending = ref(false)
const operatorName = ref(operatorId)

const statusLabel: Record<string, string> = {
  open: '待處理', in_progress: '處理中', resolved: '已解決', closed: '已結案'
}
const statusColor: Record<string, string> = {
  open: '#f59e0b', in_progress: '#667eea', resolved: '#38a169', closed: '#888'
}
const categoryLabel: Record<string, string> = {
  product_issue: '商品問題', machine_issue: '機台問題', payment_issue: '付款問題', other: '其他'
}
const statusFilters = [
  { value: '', label: '全部' },
  { value: 'open', label: '待處理' },
  { value: 'in_progress', label: '處理中' },
  { value: 'resolved', label: '已解決' },
  { value: 'closed', label: '已結案' },
]

function formatTime(ts: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function loadTickets() {
  const vars: any = { opId: operatorId }
  if (filterStatus.value) vars.status = filterStatus.value
  const data = await gql(`query($opId: String!, $status: String) {
    operatorTickets(operatorId: $opId, status: $status) {
      ticketId lineUserId displayName subject description status category vmid createdAt updatedAt
      messages { from displayName text createdAt }
    }
  }`, vars)
  tickets.value = data.operatorTickets || []
}

async function toggleExpand(ticketId: string) {
  expandedId.value = expandedId.value === ticketId ? null : ticketId
  replyText.value = ''
}

async function sendReply(ticketId: string) {
  if (!replyText.value.trim()) return
  sending.value = true
  try {
    await gql(`mutation($id: String!, $from: String!, $name: String!, $text: String!) {
      replyTicket(ticketId: $id, from: $from, displayName: $name, text: $text) { ticketId }
    }`, {
      id: ticketId,
      from: 'operator',
      name: profile.value?.displayName || '營運者',
      text: replyText.value.trim(),
    })
    replyText.value = ''
    await loadTickets()
  } finally { sending.value = false }
}

async function setStatus(ticketId: string, status: string) {
  await gql(`mutation($id: String!, $status: String!) {
    updateTicketStatus(ticketId: $id, status: $status) { ticketId }
  }`, { id: ticketId, status })
  await loadTickets()
}

onMounted(async () => {
  await init()
  try {
    const data = await gql(`query($code: String!) { operatorByCode(code: $code) { name } }`, { code: operatorId })
    if (data.operatorByCode?.name) operatorName.value = data.operatorByCode.name
  } catch {}
  try { await loadTickets() } finally { loading.value = false }
})

function onFilterChange(status: string) {
  filterStatus.value = status
  loadTickets()
}
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: operatorName, to: `/operator/${operatorId}` },
      { label: '消費者問題' },
    ]" :onRefresh="loadTickets" />

    <div class="filters">
      <button v-for="f in statusFilters" :key="f.value"
        :class="['chip', { active: filterStatus === f.value }]"
        @click="onFilterChange(f.value)">{{ f.label }}</button>
    </div>

    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="!tickets.length" class="empty">無問題單</div>

    <div v-for="t in tickets" :key="t.ticketId" class="card" @click="toggleExpand(t.ticketId)">
      <div class="card-header">
        <div>
          <div class="card-title">{{ t.subject }}</div>
          <div class="card-meta">
            {{ t.displayName }} · {{ categoryLabel[t.category] }} · {{ formatTime(t.updatedAt) }}
          </div>
        </div>
        <span class="badge" :style="{ background: statusColor[t.status] }">{{ statusLabel[t.status] }}</span>
      </div>

      <div v-if="expandedId === t.ticketId" class="detail" @click.stop>
        <div class="detail-info">
          <span>{{ t.ticketId }}</span>
          <span v-if="t.vmid">機台: {{ t.vmid }}</span>
        </div>

        <div class="messages">
          <div v-for="(msg, i) in t.messages" :key="i"
            :class="['msg', msg.from === 'consumer' ? 'msg-left' : 'msg-right']">
            <div class="msg-name">{{ msg.displayName }}</div>
            <div class="msg-bubble">{{ msg.text }}</div>
            <div class="msg-time">{{ formatTime(msg.createdAt) }}</div>
          </div>
        </div>

        <div class="actions">
          <button v-if="t.status === 'open'" class="btn-action" @click="setStatus(t.ticketId, 'in_progress')">📋 處理中</button>
          <button v-if="['open','in_progress'].includes(t.status)" class="btn-action btn-resolve" @click="setStatus(t.ticketId, 'resolved')">✅ 已解決</button>
          <button v-if="t.status !== 'closed'" class="btn-action btn-close" @click="setStatus(t.ticketId, 'closed')">🔒 結案</button>
        </div>

        <div v-if="['open','in_progress'].includes(t.status)" class="reply-bar">
          <input v-model="replyText" placeholder="輸入回覆..." @keyup.enter="sendReply(t.ticketId)" />
          <button @click="sendReply(t.ticketId)" :disabled="sending">送出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 480px; margin: 0 auto; padding: 16px; }
.filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.chip { padding: 6px 14px; border-radius: 16px; border: 1px solid #ddd; background: #fff; font-size: 13px; cursor: pointer; }
.chip.active { background: #667eea; color: #fff; border-color: #667eea; }
.loading, .empty { text-align: center; color: #888; padding: 40px 0; }
.card { background: #fff; border-radius: 10px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.08); cursor: pointer; }
.card-header { display: flex; justify-content: space-between; align-items: flex-start; }
.card-title { font-weight: 600; font-size: 15px; }
.card-meta { font-size: 12px; color: #888; margin-top: 4px; }
.badge { color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.detail { margin-top: 12px; border-top: 1px solid #eee; padding-top: 12px; }
.detail-info { display: flex; gap: 12px; font-size: 12px; color: #999; margin-bottom: 10px; }
.messages { max-height: 300px; overflow-y: auto; padding: 4px 0; }
.msg { margin-bottom: 10px; max-width: 80%; }
.msg-right { margin-left: auto; text-align: right; }
.msg-left { margin-right: auto; text-align: left; }
.msg-name { font-size: 11px; color: #999; margin-bottom: 2px; }
.msg-bubble { display: inline-block; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; word-break: break-word; }
.msg-right .msg-bubble { background: #667eea; color: #fff; border-bottom-right-radius: 4px; }
.msg-left .msg-bubble { background: #f0f0f0; color: #333; border-bottom-left-radius: 4px; }
.msg-time { font-size: 11px; color: #bbb; margin-top: 2px; }
.actions { display: flex; gap: 8px; margin: 10px 0; }
.btn-action { padding: 6px 12px; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; background: #667eea; color: #fff; }
.btn-resolve { background: #38a169; }
.btn-close { background: #888; }
.reply-bar { display: flex; gap: 8px; margin-top: 8px; }
.reply-bar input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
.reply-bar button { padding: 8px 14px; background: #667eea; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
.reply-bar button:disabled { opacity: 0.6; }
</style>
