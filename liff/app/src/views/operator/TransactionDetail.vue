<template>
  <div class="transaction-detail">
    <PageHeader
      :breadcrumbs="[
        { text: operatorName, link: `/operator/${operatorId}` },
        { text: '營收與訂單', link: `/operator/${operatorId}/revenue` },
        { text: '交易詳情' }
      ]"
    />

    <div v-if="loading" class="loading">載入中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="timeline">
      <!-- Transaction Summary Card -->
      <div class="summary-card">
        <div class="summary-row">
          <span class="label">商品</span>
          <span class="value">{{ timeline.transaction.productName || '-' }}</span>
        </div>
        <div class="summary-row">
          <span class="label">金額</span>
          <span class="value">NT$ {{ timeline.transaction.price || 0 }}</span>
        </div>
        <div class="summary-row">
          <span class="label">付款方式</span>
          <span class="value">{{ getPaymentMethodLabel(timeline.transaction.paymentMethod) }}</span>
        </div>
        <div class="summary-row">
          <span class="label">交易狀態</span>
          <span class="value" :class="getStatusClass(timeline.transaction.status)">
            {{ getStatusLabel(timeline.transaction.status) }}
          </span>
        </div>
        <div class="summary-row" v-if="timeline.transaction.dispenseSuccess !== null">
          <span class="label">出貨結果</span>
          <span class="value" :class="timeline.transaction.dispenseSuccess ? 'success' : 'failed'">
            {{ timeline.transaction.dispenseSuccess ? '✅ 成功' : '❌ 失敗' }}
          </span>
        </div>
      </div>

      <!-- Timeline -->
      <div class="timeline">
        <div 
          v-for="(event, index) in timeline.events" 
          :key="index"
          class="timeline-item"
        >
          <!-- Dot -->
          <div class="timeline-dot-wrapper">
            <div class="timeline-dot" :style="{ backgroundColor: getColor(event.stateMachine) }"></div>
            <div v-if="index < timeline.events.length - 1" class="timeline-line"></div>
          </div>

          <!-- Content -->
          <div class="timeline-content">
            <div class="timeline-time">{{ formatTime(event.receivedAt) }}</div>
            <div class="timeline-event">
              <span class="event-desc">{{ getEventDescription(event) }}</span>
              <span class="state-badge" :style="{ backgroundColor: getColor(event.stateMachine) }">
                {{ event.stateMachine }}
              </span>
            </div>
            <div v-if="event.state" class="timeline-state">狀態: {{ event.state }}</div>
            
            <!-- Elapsed time between events -->
            <div v-if="index < timeline.events.length - 1" class="elapsed">
              {{ getElapsed(event.receivedAt, timeline.events[index + 1].receivedAt) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import PageHeader from '../../components/PageHeader.vue'

const route = useRoute()
const operatorId = computed(() => route.params.operatorId as string)
const txno = computed(() => route.params.txno as string)

const loading = ref(true)
const error = ref('')
const timeline = ref<any>(null)
const operatorName = ref('營運商')

onMounted(async () => {
  try {
    const result = await gql(`
      query GetTimeline($txno: String!) {
        sessionTimeline(txno: $txno) {
          session {
            sid
            deviceId
            startedAt
            endedAt
            status
          }
          transaction {
            txno
            sid
            oid
            startedAt
            endedAt
            status
            productName
            price
            paymentMethod
            dispenseSuccess
            dispenseChannel
          }
          events {
            timestamp
            receivedAt
            event
            stateMachine
            trigger
            state
            arg
          }
        }
      }
    `, { txno: txno.value })

    timeline.value = result.sessionTimeline
    
    // Fetch operator name
    const opResult = await gql(`
      query GetOperator($code: String!) {
        operatorByCode(code: $code) {
          name
        }
      }
    `, { code: operatorId.value })
    
    if (opResult.operatorByCode) {
      operatorName.value = opResult.operatorByCode.name
    }
  } catch (e: any) {
    error.value = e.message || '載入失敗'
  } finally {
    loading.value = false
  }
})

const getColor = (stateMachine: string): string => {
  const colors: Record<string, string> = {
    sess: '#0097a7',
    order: '#1976d2',
    payment: '#388e3c',
    dispense: '#e67e22',
    reader: '#888',
    invoice: '#7b1fa2'
  }
  return colors[stateMachine] || '#888'
}

const getEventDescription = (event: any): string => {
  const translations: Record<string, string> = {
    'sess/session_begin': '會話開始',
    'sess/timeout': '會話逾時',
    'order/start': '訂單開始',
    'order/ordered': '商品選擇',
    'payment/hint': '付款資訊',
    'payment/input': '付款輸入',
    'payment/payment_begin': '開始付款',
    'payment/paid': '付款成功',
    'payment/cancelled': '付款取消',
    'payment/timeout': '付款逾時',
    'dispense/start': '出貨開始',
    'dispense/hint': '出貨資訊',
    'dispense/ready': '出貨準備',
    'dispense/prod_dispensed': '出貨完成 ✅',
    'dispense/failed': '出貨失敗 ❌',
    'reader/stop': '讀卡機停止'
  }

  let desc = translations[event.event] || event.event

  // Add arg details for specific events
  if (event.event === 'order/ordered' && event.arg?.p_id) {
    desc += ` (${event.arg.p_id})`
  } else if (event.event === 'payment/hint' && event.arg?.p_name) {
    desc += ` (${event.arg.p_name}, NT$${event.arg.price})`
  } else if (event.event === 'payment/input' && event.arg?.method) {
    desc += ` (${event.arg.method})`
  } else if (event.event === 'dispense/ready' && event.arg?.chid) {
    desc += ` (通道 ${event.arg.chid})`
  } else if (event.event === 'dispense/hint' && event.arg) {
    const details = []
    if (event.arg.lock !== undefined) details.push(`lock:${event.arg.lock}`)
    if (event.arg.elapsed !== undefined) details.push(`${event.arg.elapsed}ms`)
    if (details.length > 0) desc += ` (${details.join(', ')})`
  }

  return desc
}

const formatTime = (isoString: string): string => {
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

const getElapsed = (from: string, to: string): string => {
  const diff = new Date(to).getTime() - new Date(from).getTime()
  const seconds = Math.floor(diff / 1000)
  
  if (seconds < 60) {
    return `+${seconds}秒`
  }
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  return `+${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const getPaymentMethodLabel = (method: string): string => {
  const labels: Record<string, string> = {
    linepay: 'LINE Pay',
    ecpay: '綠界支付',
    cash: '現金',
    card: '信用卡'
  }
  return labels[method] || method || '-'
}

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    completed: '完成',
    failed: '失敗',
    cancelled: '取消',
    pending: '處理中'
  }
  return labels[status] || status || '-'
}

const getStatusClass = (status: string): string => {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return ''
}
</script>

<style scoped>
.transaction-detail {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.loading, .error {
  padding: 40px 16px;
  text-align: center;
  color: #666;
}

.error {
  color: #d32f2f;
}

.summary-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.summary-row:last-child {
  border-bottom: none;
}

.summary-row .label {
  color: #666;
  font-size: 14px;
}

.summary-row .value {
  font-weight: 600;
  font-size: 14px;
}

.summary-row .value.success {
  color: #388e3c;
}

.summary-row .value.failed {
  color: #d32f2f;
}

.summary-row .value.cancelled {
  color: #f57c00;
}

.timeline {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.timeline-item {
  display: flex;
  position: relative;
  padding-bottom: 16px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

.timeline-dot-wrapper {
  position: relative;
  margin-right: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid white;
  box-shadow: 0 0 0 2px currentColor;
}

.timeline-line {
  width: 2px;
  flex: 1;
  background: #e0e0e0;
  margin-top: 4px;
  min-height: 40px;
}

.timeline-content {
  flex: 1;
  padding-bottom: 8px;
}

.timeline-time {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.timeline-event {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.event-desc {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.state-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: white;
  font-weight: 600;
  text-transform: uppercase;
}

.timeline-state {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.elapsed {
  font-size: 11px;
  color: #999;
  margin-top: 8px;
  font-family: monospace;
}
</style>
