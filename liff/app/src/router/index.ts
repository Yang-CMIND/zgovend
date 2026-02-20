import { createRouter, createWebHashHistory } from 'vue-router'
import { useLiff } from '../composables/useLiff'
import { gql } from '../composables/useGraphQL'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
    },
    // === 消費者 ===
    {
      path: '/consumer',
      children: [
        { path: '', name: 'consumer-home', component: () => import('../views/consumer/Index.vue') },
        { path: 'tickets', name: 'consumer-tickets', component: () => import('../views/consumer/TicketList.vue') },
        { path: 'tickets/new', name: 'consumer-ticket-new', component: () => import('../views/consumer/TicketNew.vue') },
        { path: 'tickets/:id', name: 'consumer-ticket-detail', component: () => import('../views/consumer/TicketDetail.vue') },
        { path: 'shop', name: 'consumer-shop', component: () => import('../views/consumer/Shop.vue') },
        { path: 'cart', name: 'consumer-cart', component: () => import('../views/consumer/Cart.vue') },
        { path: 'orders', name: 'consumer-orders', component: () => import('../views/consumer/OrderList.vue') },
        { path: 'orders/:id', name: 'consumer-order-detail', component: () => import('../views/consumer/OrderDetail.vue') },
      ],
    },
    // === 營運者（帶 operatorId）===
    {
      path: '/operator/:operatorId',
      children: [
        { path: '', name: 'operator-home', component: () => import('../views/operator/Index.vue') },
        { path: 'products', name: 'operator-products', component: () => import('../views/operator/ProductList.vue') },
        { path: 'machine-status', name: 'operator-machine-status', component: () => import('../views/operator/MachineStatus.vue') },
        { path: 'machines/:id', name: 'operator-machine-detail', component: () => import('../views/operator/MachineDetail.vue') },
        { path: 'revenue', name: 'operator-revenue', component: () => import('../views/operator/Revenue.vue') },
        { path: 'transaction/:txno', name: 'TransactionDetail', component: () => import('../views/operator/TransactionDetail.vue') },
        { path: 'tickets', name: 'operator-tickets', component: () => import('../views/operator/Tickets.vue') },
        { path: 'online-orders', name: 'operator-online-orders', component: () => import('../views/operator/OnlineOrders.vue') },
        { path: 'preset-stock', name: 'operator-preset-stock', component: () => import('../views/operator/PresetStockList.vue') },
        { path: 'preset-stock/:id', name: 'operator-preset-stock-edit', component: () => import('../views/operator/PresetStockEdit.vue') },
      ],
    },
    // === 巡補員 ===
    {
      path: '/replenisher/picklist',
      name: 'replenisher-picklist-global',
      component: () => import('../views/replenisher/Picklist.vue'),
    },
    {
      path: '/replenisher/:vmid',
      children: [
        { path: '', name: 'replenisher-home', component: () => import('../views/replenisher/Index.vue') },
        { path: 'picklist', name: 'replenisher-picklist', component: () => import('../views/replenisher/Picklist.vue') },
        { path: 'session', name: 'replenisher-session', component: () => import('../views/replenisher/Session.vue') },
      ],
    },
    // === 系統管理 ===
    {
      path: '/admin',
      children: [
        { path: '', name: 'admin-home', component: () => import('../views/admin/Index.vue') },
        { path: 'users', name: 'admin-users', component: () => import('../views/admin/UserList.vue') },
        { path: 'operators', name: 'admin-operators', component: () => import('../views/admin/OperatorList.vue') },
        { path: 'hids', name: 'admin-hids', component: () => import('../views/admin/HidList.vue') },
        { path: 'machines', name: 'admin-machines', component: () => import('../views/admin/MachineList.vue') },
        { path: 'online-orders', name: 'admin-online-orders', component: () => import('../views/admin/OnlineOrders.vue') },
      ],
    },
    // Catch-all
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  // Clean LIFF token params
  if (to.fullPath.includes('context_token=') || to.fullPath.includes('access_token=')) {
    return '/'
  }

  // Guard: /replenisher/:vmid — must have replenisher role for VM's operator (or admin)
  // Skip guard for global picklist route (no vmid)
  if (to.path.startsWith('/replenisher/') && to.name !== 'replenisher-picklist-global') {
    const vmid = to.params.vmid as string
    if (!vmid) return '/'

    const { refreshRoles, operatorRoles, init } = useLiff()
    await init()
    // Always fresh-check roles from DB
    await refreshRoles()

    // Look up VM's operatorId
    try {
      const data = await gql(`query($vmid: String!) { vmByVmid(vmid: $vmid) { operatorId } }`, { vmid })
      const operatorId = data.vmByVmid?.operatorId
      if (!operatorId) return '/'

      const hasRole = operatorRoles.value.some(
        or => or.operatorId === operatorId && or.roles.includes('replenisher')
      )
      if (!hasRole) {
        alert('您沒有此機台的巡補員權限')
        return '/'
      }
    } catch {
      return '/'
    }
  }
})

export default router
