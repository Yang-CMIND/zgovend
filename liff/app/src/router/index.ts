import { createRouter, createWebHashHistory } from 'vue-router'

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
        { path: 'preset-stock', name: 'operator-preset-stock', component: () => import('../views/operator/PresetStockList.vue') },
        { path: 'preset-stock/:id', name: 'operator-preset-stock-edit', component: () => import('../views/operator/PresetStockEdit.vue') },
      ],
    },
    // === 巡補員（帶 vmid）===
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
      ],
    },
    // Catch-all
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  if (to.fullPath.includes('context_token=') || to.fullPath.includes('access_token=')) {
    return '/'
  }
})

export default router
