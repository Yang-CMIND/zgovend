<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { gql } from '../../composables/useGraphQL'
import { useLiff } from '../../composables/useLiff'
import PageHeader from '../../components/PageHeader.vue'
import ExportButtons from '../../components/ExportButtons.vue'

interface SummaryVm { vmid: string; currentQty: number; maxQty: number; needed: number }
interface SummaryRow {
  operatorId: string; productCode: string; productName: string; imageUrl: string; price: number
  vms: SummaryVm[]; totalCurrent: number; totalMax: number; totalNeeded: number
}

const { init, operatorRoles, refreshRoles, isAdmin } = useLiff()

const loading = ref(true)
const error = ref('')
const allVmids = ref<string[]>([])
const allRows = ref<SummaryRow[]>([])

// Filters — use array instead of Set for reliable Vue reactivity
const filterVmids = ref<string[]>([])
const filterProduct = ref('')

const filteredRows = computed(() => {
  let rows = allRows.value
  const sel = filterVmids.value
  if (sel.length > 0) {
    rows = rows.filter(r => r.vms.some(v => sel.includes(v.vmid) && v.needed > 0))
  }
  if (filterProduct.value) {
    const q = filterProduct.value.toLowerCase()
    rows = rows.filter(r => r.productName.toLowerCase().includes(q) || r.productCode.toLowerCase().includes(q))
  }
  return rows
})

const visibleVmids = computed(() => {
  if (filterVmids.value.length > 0) return [...filterVmids.value].sort()
  return allVmids.value
})

const grandTotal = computed(() => {
  let current = 0, max = 0, needed = 0
  const sel = filterVmids.value
  for (const r of filteredRows.value) {
    for (const v of r.vms) {
      if (sel.length > 0 && !sel.includes(v.vmid)) continue
      current += v.currentQty; max += v.maxQty; needed += v.needed
    }
  }
  return { current, max, needed }
})

function toggleVmFilter(vmid: string) {
  const idx = filterVmids.value.indexOf(vmid)
  if (idx >= 0) {
    filterVmids.value = filterVmids.value.filter(v => v !== vmid)
  } else {
    filterVmids.value = [...filterVmids.value, vmid]
  }
}

function getVmData(row: SummaryRow, vmid: string): SummaryVm {
  return row.vms.find(v => v.vmid === vmid) || { vmid, currentQty: 0, maxQty: 0, needed: 0 }
}

async function load() {
  try {
    loading.value = true; error.value = ''
    await init(); await refreshRoles()

    // Get all VMs user can access
    const vmData = await gql<{ vms: { vmid: string; operatorId: string }[] }>(`query { vms { vmid operatorId } }`)
    const myVmids = vmData.vms
      .filter(vm => operatorRoles.value.some(or => or.operatorId === vm.operatorId && or.roles.includes('replenisher')))
      .map(v => v.vmid)

    if (!myVmids.length) { allVmids.value = []; allRows.value = []; return }

    const data = await gql<{ picklistSummary: { vmids: string[]; rows: SummaryRow[] } }>(`
      query($vmids: [String!]) {
        picklistSummary(vmids: $vmids) {
          vmids
          rows { operatorId productCode productName imageUrl price totalCurrent totalMax totalNeeded
            vms { vmid currentQty maxQty needed } }
        }
      }
    `, { vmids: myVmids })
    allVmids.value = data.picklistSummary.vmids
    allRows.value = data.picklistSummary.rows
  } catch (e: any) {
    error.value = e.message || '載入失敗'
  } finally {
    loading.value = false
  }
}

onMounted(load)
function csvRows() {
  return filteredRows.value.map(r => [r.operatorId, r.productCode, r.productName, String(r.price), String(r.totalCurrent), String(r.totalMax), String(r.totalNeeded)])
}
const csvHeaders = ['營運商', '商品編號', '商品名稱', '售價', '目前庫存', '最大庫存', '需補數量']
</script>

<template>
  <div class="page">
    <PageHeader :crumbs="[{ label: '巡補員', to: '/' }, { label: '撿貨清單' }]">
      <ExportButtons filename="picklist" :headers="csvHeaders" :rows="csvRows" />
    </PageHeader>

    <div class="content">
      <!-- Loading -->
      <div v-if="loading" class="center-msg"><div class="spinner" /><p>載入中…</p></div>

      <!-- Error -->
      <div v-else-if="error" class="error-box"><p>{{ error }}</p><button @click="load" class="btn">重試</button></div>

      <!-- Empty -->
      <div v-else-if="allRows.length === 0" class="center-msg">
        <div class="icon">✅</div><h2>所有機台庫存充足</h2>
      </div>

      <template v-else>
        <!-- Filters -->
        <div class="filters">
          <div class="filter-section">
            <label>機台</label>
            <div class="chip-row">
              <button v-for="vm in allVmids" :key="vm"
                :class="['chip', { active: filterVmids.length === 0 || filterVmids.includes(vm) }]"
                @click="toggleVmFilter(vm)">{{ vm }}</button>
            </div>
          </div>
          <div class="filter-section">
            <label>商品搜尋</label>
            <input v-model="filterProduct" placeholder="名稱或編號…" class="search-input" />
          </div>
        </div>

        <!-- Summary -->
        <div class="summary-bar">
          <span><b>{{ filteredRows.length }}</b> 種商品</span>
          <span>缺補 <b class="red">{{ grandTotal.needed }}</b> 件</span>
        </div>

        <!-- Table -->
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="col-product" rowspan="2">商品</th>
                <th colspan="3" class="col-total">總計</th>
                <th v-for="vm in visibleVmids" :key="vm" colspan="3" class="col-vm">{{ vm }}</th>
              </tr>
              <tr>
                <th class="sub">存</th><th class="sub">滿</th><th class="sub red">缺</th>
                <template v-for="vm in visibleVmids" :key="'h2-'+vm">
                  <th class="sub">存</th><th class="sub">滿</th><th class="sub red">缺</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.productCode">
                <td class="col-product">
                  <div class="prod-cell">
                    <img v-if="row.imageUrl" :src="row.imageUrl" class="prod-img" @error="(e: any) => e.target.style.display='none'" />
                    <div>
                      <div class="prod-name">{{ row.productName }}</div>
                      <div class="prod-code">{{ row.operatorId }} · {{ row.productCode }}</div>
                    </div>
                  </div>
                </td>
                <td class="num bold">{{ row.totalCurrent }}</td>
                <td class="num dim bold">{{ row.totalMax }}</td>
                <td class="num red bold">{{ row.totalNeeded }}</td>
                <template v-for="vm in visibleVmids" :key="'d-'+vm+row.productCode">
                  <td class="num">{{ getVmData(row, vm).currentQty || '-' }}</td>
                  <td class="num dim">{{ getVmData(row, vm).maxQty || '-' }}</td>
                  <td class="num" :class="{ red: getVmData(row, vm).needed > 0 }">
                    {{ getVmData(row, vm).needed || '-' }}
                  </td>
                </template>
              </tr>
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td class="col-product"><b>合計</b></td>
                <td class="num bold">{{ grandTotal.current }}</td>
                <td class="num dim bold">{{ grandTotal.max }}</td>
                <td class="num red bold">{{ grandTotal.needed }}</td>
                <template v-for="vm in visibleVmids" :key="'t-'+vm">
                  <td class="num bold">{{ filteredRows.reduce((s, r) => s + getVmData(r, vm).currentQty, 0) }}</td>
                  <td class="num dim bold">{{ filteredRows.reduce((s, r) => s + getVmData(r, vm).maxQty, 0) }}</td>
                  <td class="num red bold">{{ filteredRows.reduce((s, r) => s + getVmData(r, vm).needed, 0) }}</td>
                </template>
              </tr>
            </tfoot>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; background: #f5f5f5; }
.content { padding: 12px; }

.center-msg { text-align: center; padding: 60px 16px; color: #888; }
.center-msg .icon { font-size: 48px; }
.center-msg h2 { font-size: 18px; color: #333; margin: 8px 0 0; }
.spinner {
  width: 32px; height: 32px; margin: 0 auto 12px;
  border: 3px solid #e8e8e8; border-top-color: #667eea;
  border-radius: 50%; animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-box { background: #fff0f0; border-radius: 12px; padding: 24px; text-align: center; }
.error-box p { color: #c33; margin: 0 0 12px; }
.btn { background: #667eea; color: #fff; border: none; border-radius: 8px; padding: 8px 20px; font-size: 14px; }

/* Filters */
.filters {
  background: #fff; border-radius: 12px; padding: 12px; margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.filter-section { margin-bottom: 10px; }
.filter-section:last-child { margin-bottom: 0; }
.filter-section label { font-size: 12px; color: #888; font-weight: 600; margin-bottom: 6px; display: block; }
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 5px 10px; border-radius: 16px; font-size: 12px; border: 1px solid #ddd;
  background: #f5f5f5; color: #999; cursor: pointer; transition: all .15s;
}
.chip.active { background: #667eea; color: #fff; border-color: #667eea; }
.search-input {
  width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 14px; outline: none; box-sizing: border-box;
}
.search-input:focus { border-color: #667eea; }

/* Summary bar */
.summary-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 4px; font-size: 13px; color: #666;
}

/* Table */
.table-wrap {
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
table { border-collapse: collapse; width: 100%; min-width: 500px; font-size: 12px; }
th, td { padding: 8px 6px; border-bottom: 1px solid #f0f0f0; white-space: nowrap; }
thead th { background: #fafafa; color: #666; font-weight: 600; text-align: center; position: sticky; top: 0; z-index: 2; }
thead th.col-vm { border-left: 1px solid #e8e8e8; }
thead th.col-total { border-left: 2px solid #667eea; background: #f0f3ff; }
th.sub { font-size: 11px; font-weight: 500; }
th.col-product { text-align: left; position: sticky; left: 0; z-index: 3; background: #fafafa; min-width: 120px; }

td.col-product { position: sticky; left: 0; background: #fff; z-index: 1; }
.prod-cell { display: flex; align-items: center; gap: 8px; }
.prod-img { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.prod-name { font-weight: 600; font-size: 12px; color: #333; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.prod-code { font-size: 10px; color: #aaa; }

td.num { text-align: center; font-variant-numeric: tabular-nums; }
.dim { color: #bbb; }
.red { color: #e53e3e; }
.bold { font-weight: 700; }

tfoot .total-row td { border-top: 2px solid #667eea; background: #f8f9ff; font-weight: 700; }
tfoot .total-row td.col-product { background: #f8f9ff; }
</style>
