<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()
const { init, profile, liff } = useLiff()

const vmid = ref('')
const vmVerified = ref<null | { vmid: string; operatorId: string; operatorName: string }>(null)
const vmError = ref('')
const form = ref({
  category: 'machine_issue',
  subject: '',
  description: '',
})
const submitting = ref(false)
const scanning = ref(false)

const categories = [
  { value: 'product_issue', label: '🍬 商品問題' },
  { value: 'machine_issue', label: '🏭 機台問題' },
  { value: 'payment_issue', label: '💳 付款問題' },
  { value: 'other', label: '📌 其他' },
]

onMounted(async () => {
  await init()
})

async function verifyVmid() {
  vmVerified.value = null
  vmError.value = ''
  const id = vmid.value.trim()
  if (!id) { vmError.value = '請輸入機台編號'; return }
  try {
    const data = await gql(`query($vmid: String!) {
      vmByVmid(vmid: $vmid) { vmid operatorId }
      operators { code name }
    }`, { vmid: id })
    if (!data.vmByVmid) { vmError.value = `找不到機台「${id}」`; return }
    const opName = data.operators?.find((o: any) => o.code === data.vmByVmid.operatorId)?.name || data.vmByVmid.operatorId
    vmVerified.value = { vmid: data.vmByVmid.vmid, operatorId: data.vmByVmid.operatorId, operatorName: opName }
  } catch (e: any) {
    vmError.value = e.message || '查詢失敗'
  }
}

async function scanQR() {
  scanning.value = true
  try {
    const result = await liff.scanCodeV2()
    const text = result?.value?.trim()
    if (text) {
      // QR code might be just vmid, or a URL containing vmid
      // Try to extract vmid — support formats: plain "demo_vm01" or "vmid:demo_vm01"
      const match = text.match(/^(?:vmid:)?(\S+)$/)
      if (match) {
        vmid.value = match[1]
        await verifyVmid()
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('scanCodeV2')) {
      // Not in LIFF client
      vmError.value = '掃碼功能僅支援 LINE App 內使用'
    } else {
      vmError.value = e?.message || '掃碼失敗'
    }
  } finally {
    scanning.value = false
  }
}

async function submit() {
  if (!vmVerified.value || !form.value.subject || !form.value.description) return
  submitting.value = true
  try {
    const data = await gql(`mutation($input: CreateTicketInput!) { createTicket(input: $input) { ticketId } }`, {
      input: {
        lineUserId: profile.value?.userId || 'anonymous',
        displayName: profile.value?.displayName || '匿名',
        vmid: vmVerified.value.vmid,
        category: form.value.category,
        subject: form.value.subject,
        description: form.value.description,
      }
    })
    router.push(`/consumer/tickets/${data.createTicket.ticketId}`)
  } catch (e: any) {
    alert('提交失敗: ' + e.message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[
      { label: '消費者服務', to: '/consumer' },
      { label: '問題回報' },
    ]" />
    <div class="content">
      <!-- Step 1: Machine identification -->
      <div class="section-card">
        <div class="section-label">① 機台識別</div>

        <div v-if="!vmVerified" class="vm-input-area">
          <button class="scan-btn" @click="scanQR" :disabled="scanning">
            {{ scanning ? '掃碼中…' : '📷 掃描機台 QR Code' }}
          </button>
          <div class="or-divider"><span>或手動輸入</span></div>
          <div class="vm-row">
            <input v-model="vmid" placeholder="機台編號 (例: demo_vm01)" class="vm-input"
              @keyup.enter="verifyVmid" />
            <button class="verify-btn" @click="verifyVmid">查詢</button>
          </div>
          <div v-if="vmError" class="error-msg">{{ vmError }}</div>
        </div>

        <div v-else class="vm-verified">
          <div class="vm-info">
            <span class="vm-icon">✅</span>
            <div>
              <div class="vm-name">{{ vmVerified.vmid }}</div>
              <div class="vm-op">{{ vmVerified.operatorName }}</div>
            </div>
          </div>
          <button class="change-btn" @click="vmVerified = null; vmError = ''">更換</button>
        </div>
      </div>

      <!-- Step 2: Issue details (only after VM verified) -->
      <template v-if="vmVerified">
        <div class="section-card">
          <div class="section-label">② 問題說明</div>

          <label>問題類別</label>
          <div class="category-grid">
            <button v-for="c in categories" :key="c.value"
              :class="['cat-btn', { active: form.category === c.value }]"
              @click="form.category = c.value">
              {{ c.label }}
            </button>
          </div>

          <label>主旨 <span class="required">*</span></label>
          <input v-model="form.subject" placeholder="簡述問題" required maxlength="100" class="field" />

          <label>詳細描述 <span class="required">*</span></label>
          <textarea v-model="form.description" placeholder="請描述遇到的問題，例如：哪個商品、什麼情況…" required rows="5" class="field"></textarea>
        </div>

        <button class="submit-btn" @click="submit"
          :disabled="submitting || !form.subject || !form.description">
          {{ submitting ? '提交中…' : '提交問題' }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.content { padding: 16px; max-width: 480px; margin: 0 auto; }

.section-card {
  background: #fff; border-radius: 14px; padding: 16px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-bottom: 14px;
}
.section-label { font-size: 15px; font-weight: 700; color: #333; margin-bottom: 12px; }

/* VM scan/input */
.scan-btn {
  width: 100%; padding: 14px; border: 2px dashed #667eea; border-radius: 12px;
  background: #f8f9ff; color: #667eea; font-size: 16px; font-weight: 600;
  cursor: pointer; transition: all .15s;
}
.scan-btn:active { background: #eef1ff; }
.scan-btn:disabled { opacity: 0.6; }
.or-divider {
  text-align: center; margin: 12px 0; position: relative;
  color: #bbb; font-size: 12px;
}
.or-divider::before, .or-divider::after {
  content: ''; position: absolute; top: 50%; width: 35%; height: 1px; background: #e0e0e0;
}
.or-divider::before { left: 0; }
.or-divider::after { right: 0; }
.vm-row { display: flex; gap: 8px; }
.vm-input {
  flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 15px; outline: none;
}
.vm-input:focus { border-color: #667eea; }
.verify-btn {
  padding: 10px 16px; background: #667eea; color: #fff; border: none;
  border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.error-msg { color: #e53e3e; font-size: 13px; margin-top: 8px; }

/* VM verified */
.vm-verified {
  display: flex; align-items: center; justify-content: space-between;
  background: #f0fff4; border-radius: 10px; padding: 12px;
}
.vm-info { display: flex; align-items: center; gap: 10px; }
.vm-icon { font-size: 24px; }
.vm-name { font-size: 15px; font-weight: 700; color: #333; }
.vm-op { font-size: 13px; color: #38a169; }
.change-btn {
  padding: 6px 14px; border: 1px solid #ddd; border-radius: 8px;
  background: #fff; font-size: 13px; color: #666; cursor: pointer;
}

/* Form fields */
label { display: block; font-size: 14px; font-weight: 600; color: #555; margin: 12px 0 6px; }
.required { color: #e53e3e; }
.field {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 15px; outline: none; box-sizing: border-box;
}
.field:focus { border-color: #667eea; }
textarea.field { resize: vertical; font-family: inherit; }

/* Category grid */
.category-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cat-btn {
  padding: 10px; border: 1px solid #e0e0e0; border-radius: 10px;
  background: #fff; font-size: 14px; cursor: pointer; text-align: center;
  transition: all .15s;
}
.cat-btn.active { background: #667eea; color: #fff; border-color: #667eea; }

/* Submit */
.submit-btn {
  width: 100%; padding: 14px; background: #667eea; color: #fff;
  border: none; border-radius: 12px; font-size: 16px; font-weight: 700;
  cursor: pointer; margin-top: 4px;
}
.submit-btn:disabled { opacity: 0.5; }
.submit-btn:active { opacity: 0.8; }
</style>
