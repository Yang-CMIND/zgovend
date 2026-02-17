# 智購販賣機 LIFF App

LINE Front-end Framework (LIFF) 行動管理介面，支援多角色、多營運商管理。

## 技術棧

- **Frontend**: Vue 3 + TypeScript + Vite (hash-mode router)
- **Backend**: Apollo Server GraphQL → MongoDB
- **Projector**: Node-RED (MQTT → MongoDB projections)
- **Production**: nginx 靜態 serve build 產物

## 架構

```
LIFF App (Vue 3)
    ↓ GraphQL
ebus-eventlog API (Apollo Server, port 4000)
    ↓ Mongoose
MongoDB (ebus database)
    ↑ projections
Node-RED (MQTT trigger/transition → sessions/orders/transactions)
```

## LIFF 設定

- **LIFF ID**: `2009020003-RmX9NLbV`
- **Endpoint URL**: `https://honeypie.zgovend.com:8443/liff/`（結尾 `/` 必要）
- **Vite base**: `/liff/`

## 部署

```bash
cd zgovend/liff/app
npx vite build          # nginx 自動 serve dist/ (volume mount)
```

GraphQL API 重建：
```bash
cd ebus-eventlog
docker compose build api && docker compose up -d api
```

## 權限模型

- **isAdmin** (Boolean) — 全域系統管理，不分營運商
- **operatorRoles** — 每個營運商獨立的角色：
  - `operator` — 營運管理（商品、營收、機台狀態）
  - `replenisher` — 巡補員（撿貨、巡補作業）
- **consumer** — 所有登入使用者預設擁有

## 路由結構

```
/                                    首頁（角色導航）
├── /consumer                        消費者服務
│   ├── /tickets/new                 問題回報
│   ├── /tickets                     我的問題單
│   └── /tickets/:id                 問題單詳情
├── /operator/:operatorId            營運管理（帶營運商參數）
│   ├── /products                    📦 商品主檔 (CRUD)
│   ├── /machine-status              📡 機台狀態（唯讀，from heartbeats）
│   ├── /revenue                     💰 營收與訂單（日期+機台篩選）
│   └── /preset-stock                📋 庫存預約設定 (stub)
├── /replenisher/:vmid               巡補員（帶機台參數）
│   ├── /picklist                    📋 撿貨清單 (stub)
│   └── /session                     🔧 巡補作業 (stub)
└── /admin                           系統管理
    ├── /users                       👤 使用者管理（角色指派）
    ├── /operators                   🏢 營運商管理 (CRUD)
    ├── /hids                        🏭 機碼設定 (CRUD)
    └── /machines                    🖥️ 機台管理 (CRUD)
```

## 首頁行為

- **營運管理**：列出使用者有 `operator` 角色的各營運商，點擊進入
- **巡補員**：列出使用者有 `replenisher` 角色的營運商所屬啟用機台，點擊進入
- **系統管理**：僅 `isAdmin=true` 可見

## GraphQL Schema Modules

| Module | Collection | 說明 |
|--------|-----------|------|
| `users.js` | users | 使用者 (LINE login upsert, isAdmin + operatorRoles) |
| `operators.js` | operators | 營運商 CRUD |
| `hids.js` | hids | 機碼 CRUD + `availableHids` (active 且未綁定) |
| `vms.js` | vms | 機台 CRUD (vmid, hidCode, operatorId) |
| `products.js` | products | 商品主檔 CRUD (per operator, code unique) |
| `heartbeats.js` | heartbeats | 機台心跳 (Node-RED upsert, per deviceId) |
| `zgovend.js` | sessions/orders/transactions | 販賣機交易 (Node-RED projection) |

## UI 元件

- **PageHeader** (`components/PageHeader.vue`) — 通用 breadcrumb 導航：`🏠 / 上層 / 當前頁`，每層可點擊跳轉

## 資料流

### 交易記錄
```
機台 → MQTT (devices/{hid}/events/trigger)
  → Node-RED projector → MongoDB (sessions, orders, transactions)
  → GraphQL vendTransactionSummaries
  → LIFF 營收與訂單頁
```

### 機台心跳
```
機台 → MQTT (devices/{hid}/events/heartbeat)  [尚未設定]
  → Node-RED → MongoDB (heartbeats collection, upsert by deviceId)
  → GraphQL heartbeats
  → LIFF 機台狀態頁
```

## 目前狀態

### 已完成 ✅
- 使用者管理（全域 admin + 營運商角色）
- 營運商管理 CRUD
- 機碼設定 CRUD（含 available HIDs 邏輯）
- 機台管理 CRUD（admin 層級）
- 商品主檔 CRUD（per operator，demo 已匯入 27 筆）
- 機台狀態頁（唯讀，從 heartbeats 讀取，目前顯示全離線）
- 營收與訂單（日期範圍 + 機台多選篩選，交易 list）
- Breadcrumb 導航
- LIFF 登入 + 角色載入
- Replay 工具 (`tools/replay-to-mqtt.sh`)

### Stub（尚未實作）
- 消費者：問題回報 / 問題單
- 巡補員：撿貨清單 / 巡補作業
- 庫存預約設定

### 待辦
- Node-RED 心跳 flow（heartbeat projection）
- GraphQL auth guards（server-side 角色驗證）
- 商品圖片改用自有 server（目前 Airtable thumbnail URL 有時效）
