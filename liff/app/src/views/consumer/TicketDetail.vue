<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const { init, profile } = useLiff()
const ticket = ref<any>(null)
const loading = ref(true)
const replyText = ref('')
const sending = ref(false)

const statusLabel: Record<string, string> = {
  open: '待處理', in_progress: '處理中', resolved: '已解決', closed: '已結案'
}
const statusColor: Record<string, string> = {
  open: '#f59e0b', in_progress: '#667eea', resolved: '#38a169', closed: '#888'
}
const categoryLabel: Record<string, string> = {
  product_issue: '商品問題', machine_issue: '機台問題', payment_issue: '付款問題', other: '其他'
}

function formatTime(ts: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function loadTicket() {
  const data = await gql(`query($id: String!) { ticket(ticketId: $id) {
    ticketId subject description status operatorId vmid category createdAt updatedAt
    messages { from displayName text createdAt }
  } }`, { id: route.params.id as string })
  ticket.value = data.ticket
}

onMounted(async () => {
  await init()
  try { await loadTicket() } finally { loading.value = false }
})

async function sendReply() {
  if (!replyText.value.trim()) return
  sending.value = true
  try {
    await gql(`mutation($id: String!, $from: String!, $name: String!, $text: String!) {
      replyTicket(ticketId: $id, from: $from, displayName: $name, text: $text) { ticketId }
    }`, {
      id: ticket.value.ticketId,
      from: 'consumer',
      name: profile.value?.displayName || '消費者',
      text: replyText.value.trim(),
    })
    replyText.value = ''
    await loadTicket()
    await nextTick()
    const el = document.querySelector('.messages')
    if (el) el.scrollTop = el.scrollHeight
  } finally { sending.value = false }
}

const canReply = () => ticket.value && ['open', 'in_progress'].includes(ticket.value.status)
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '我的問題單', to: '/consumer/tickets' },
      { label: ticket?.ticketId || '...' },
    ]" />
    <div v-if="loading" class="loading">載入中...</div>
    <template v-else-if="ticket">
      <div class="info-card">
        <div class="info-top">
          <span class="subject">{{ ticket.subject }}</span>
          <span class="badge" :style="{ background: statusColor[ticket.status] }">{{ statusLabel[ticket.status] }}</span>
        </div>
        <div class="info-meta">
          <span>{{ categoryLabel[ticket.category] }}</span>
          <span>營運商: {{ ticket.operatorId }}</span>
          <span v-if="ticket.vmid">機台: {{ ticket.vmid }}</span>
        </div>
        <div class="info-date">{{ formatTime(ticket.createdAt) }}</div>
      </div>

      <div class="messages">
        <div v-for="(msg, i) in ticket.messages" :key="i"
          :class="['msg', msg.from === 'consumer' ? 'msg-right' : 'msg-left']">
          <div class="msg-name">{{ msg.displayName }}</div>
          <div class="msg-bubble">{{ msg.text }}</div>
          <div class="msg-time">{{ formatTime(msg.createdAt) }}</div>
        </div>
      </div>

      <div v-if="canReply()" class="reply-bar">
        <input v-model="replyText" placeholder="輸入回覆..." @keyup.enter="sendReply" />
        <button @click="sendReply" :disabled="sending">送出</button>
      </div>
      <div v-else class="closed-hint">此問題單已{{ statusLabel[ticket.status] }}，無法回覆</div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 480px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; min-height: 80vh; }
.loading { text-align: center; color: #888; padding: 40px 0; }
.info-card { background: #fff; border-radius: 10px; padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.08); margin-bottom: 12px; }
.info-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.subject { font-weight: 700; font-size: 16px; }
.badge { color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 10px; }
.info-meta { display: flex; gap: 12px; font-size: 13px; color: #666; margin-bottom: 4px; }
.info-date { font-size: 12px; color: #999; }
.messages { flex: 1; overflow-y: auto; padding: 8px 0; }
.msg { margin-bottom: 12px; max-width: 80%; }
.msg-right { margin-left: auto; text-align: right; }
.msg-left { margin-right: auto; text-align: left; }
.msg-name { font-size: 11px; color: #999; margin-bottom: 2px; }
.msg-bubble { display: inline-block; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; word-break: break-word; }
.msg-right .msg-bubble { background: #667eea; color: #fff; border-bottom-right-radius: 4px; }
.msg-left .msg-bubble { background: #f0f0f0; color: #333; border-bottom-left-radius: 4px; }
.msg-time { font-size: 11px; color: #bbb; margin-top: 2px; }
.reply-bar { display: flex; gap: 8px; padding: 12px 0; }
.reply-bar input { flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
.reply-bar button { padding: 10px 16px; background: #667eea; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
.reply-bar button:disabled { opacity: 0.6; }
.closed-hint { text-align: center; color: #999; padding: 16px; font-size: 14px; }
</style>
