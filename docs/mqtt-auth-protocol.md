# 認證與存取控制協議

本文件涵蓋兩大認證機制：
1. **GraphQL API 存取控制** — LIFF App 與 gui-replenish 的 API 認證 + RBAC
2. **MQTT 巡補員簽到認證** — gui-replenish 與 LIFF 透過 MQTT 的現場掃碼認證

---

# 第一部分：GraphQL API 存取控制

## 概述

GraphQL API 支援兩種 client 存取，統一透過 LINE 身份驗證：

| Client | 環境 | 認證方式 |
|--------|------|----------|
| LIFF App (智購小幫手) | LINE 內瀏覽器 | LINE Access Token |
| gui-replenish (巡補員平板) | 販賣機現場平板瀏覽器 | MQTT 簽到認證（見第二部分）→ 取得 LINE Access Token → 直接存取 GraphQL |

兩者最終都解析為同一個 `user` 物件，RBAC 邏輯完全共用。

### 三層防護

| 層 | 機制 | 說明 |
|----|------|------|
| **Layer 1** | Nginx referer 白名單 | 擋掉非 LIFF/本站的直接 API 存取 |
| **Layer 2** | LINE Access Token 驗證 | 確認是 LINE 登入用戶 |
| **Layer 3** | RBAC resolver 權限檢查 | 用戶只能存取自己權限內的資料 |

## 認證方式：LINE Access Token（LIFF App）

### 流程
1. 用戶透過 LIFF 開啟 App，自動取得 LINE access token
2. 前端每次 GraphQL 請求帶 `Authorization: Bearer <LINE access token>`
3. 後端驗證 token（呼叫 LINE API `oauth2/v2.1/verify` + `v2/profile`）
4. 驗證通過 → 從 MongoDB `users` collection 查出 `isAdmin`、`operatorRoles`
5. 注入 `context.user` 供 resolver RBAC 使用
6. Token cache 5 分鐘，避免重複呼叫 LINE API

### 後端判斷邏輯
```
Authorization: Bearer <token>
→ 嘗試 LINE verify API
→ 成功 → 取得 user profile + DB 角色 → context.user
→ 失敗 → user = null（未認證）
```

## gui-replenish 的 GraphQL 存取

gui-replenish 透過 MQTT 簽到取得 LINE Access Token 後，直接存取 GraphQL API：
1. gui-replenish 顯示 QR Code
2. 巡補員用 LIFF App 掃碼
3. LIFF 端驗證身份後，透過 MQTT 傳送認證結果 **+ LINE Access Token**
4. gui-replenish 儲存 token，後續 GraphQL 請求帶 `Authorization: Bearer <token>`

### 流程
```
MQTT 簽到成功 → gui-replenish 收到 accessToken
→ 儲存至 authAccessToken
→ GraphQL fetch 自動帶 Authorization: Bearer <token>
→ 後端以同一套 LINE token 驗證 + RBAC 檢查
```

### 安全性
- MQTT broker 使用 WSS (TLS) 加密傳輸
- topic `devices/{hid}/auth` 為 device-specific，非公開廣播
- LINE access token 有效期長（一般 30 天），巡補員單次作業通常數十分鐘，足夠使用

## RBAC 權限模型

不論認證方式，最終 `context.user` 結構相同：

```ts
interface User {
  lineUserId: string
  displayName: string
  isAdmin: boolean
  operatorRoles: Array<{
    operatorId: string
    roles: string[]  // 'operator' | 'replenisher'
  }>
}
```

### 權限分級

| 層級 | 可存取 | 範例 |
|------|--------|------|
| **公開** | 不需認證 | shopProducts, operators, products, vms |
| **已登入** | 任何認證用戶 | myOrders, myTickets, createOnlineOrder |
| **營運商** | isAdmin 或 operatorRoles 含該 operatorId | operatorOnlineOrders, operatorTickets, dailyRevenue |
| **巡補員** | 營運商 + role 含 'replenisher' | vmInventory, replenishPicklist, updateVmInventory |
| **管理員** | isAdmin: true | users, allOnlineOrders, upsertUser |

### Auth Helper Functions

```js
requireAuth(user)                          // 已登入
requireAdmin(user)                         // 管理員
requireOperatorAccess(user, operatorId)    // 營運商存取
requireOperatorRole(user, operatorId, role) // 特定角色
```

## 實作狀態

- [x] Nginx referer 白名單（honeypie.zgovend.com, *.line.me）
- [x] LINE access token 驗證（auth.js）
- [x] Token cache（5 分鐘）
- [x] RBAC resolver 權限檢查（7 個 schema 檔案）
- [x] LIFF App 前端自動帶 token（useGraphQL.ts）
- [x] LIFF 簽到成功時傳送 accessToken（Home.vue handleCheckin）
- [x] gui-replenish 儲存 accessToken 並帶入 GraphQL 請求（App.vue）

---

# 第二部分：MQTT 巡補員簽到認證協議

## 概述

販賣機本地端 (gui-replenish) 與手機端 (LINE LIFF) 透過後端 MQTT Broker 進行巡補員身分認證。三方角色：

| 角色 | 說明 |
|------|------|
| **gui-replenish** | 販賣機本地瀏覽器，顯示 QR Code，訂閱 MQTT 驗證 nonce 並等待認證結果 |
| **LIFF** | 手機 LINE 內的 Web App，透過 `liff.scanCodeV2()` 掃描機台 QR Code，先提交 nonce 驗證，通過後執行 GraphQL 身分查驗 |
| **MQTT Broker** | 後端 WSS broker（如 `wss://honeypie.zgovend.com:8443/mqtt`） |

## MQTT Topic

```
devices/{hid}/auth
```

- `hid` = 機台硬體 ID（MAC address 去除冒號，如 `50af7343f553`）
- gui-replenish **subscribe + publish** 此 topic
- LIFF **publish + subscribe** 此 topic

## QR Code 格式

```
{LIFF_ID}:{hid}:{nonce}
```

短碼格式，以冒號分隔三個欄位。由 LIFF app 透過 `liff.scanCodeV2()` 掃描後解析。

- `LIFF_ID`：LINE LIFF app ID（如 `2009020003-RmX9NLbV`）
- `hid`：機台硬體 ID（MAC address 去除冒號，如 `50af7343f553`）
- `nonce`：gui-replenish 產生的 32 字元 hex 一次性驗證碼（`crypto.getRandomValues(Uint8Array(16))`）
- 每次產生新 QR Code 時 nonce 都不同，舊 QR Code 自動失效

LIFF app 掃碼解析後，直接呼叫 `handleCheckin(hid, nonce)` 進入認證流程。

## 訊息格式（JSON）

所有訊息都包含 `timestamp` 欄位（`Date.now()`，由 publish 端自動附加）。

### 1. Nonce 提交 — LIFF → MQTT

LIFF 掃碼解析後，**立即**發送 nonce 給 gui-replenish 驗證：

```json
{
  "stage": "nonce_submit",
  "nonce": "abc123...",
  "timestamp": 1739876543210
}
```

### 2. Nonce 驗證結果 — gui-replenish → MQTT

gui-replenish 收到 `nonce_submit` 後，比對 nonce 並回覆：

**Nonce 匹配（通過）：**
```json
{
  "stage": "nonce_verify",
  "nonce": "abc123...",
  "accepted": true,
  "timestamp": 1739876543210
}
```

**Nonce 不匹配（拒絕）：**
```json
{
  "stage": "nonce_verify",
  "nonce": "abc123...",
  "accepted": false,
  "error": "QR Code 已過期，請重新掃描",
  "timestamp": 1739876543210
}
```

### 3. 認證成功 — LIFF → MQTT

Nonce 通過後，LIFF 查詢 GraphQL 角色查驗通過（使用者具備 replenisher 角色）、HID 對應機台存在：

```json
{
  "authenticated": true,
  "lineUserId": "U1234567890abcdef",
  "displayName": "王小明",
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "timestamp": 1739876543210
}
```

### 4. 認證失敗 — LIFF → MQTT

GraphQL 查驗任何步驟失敗時，**必須** publish 失敗訊息，讓 gui-replenish 同步顯示錯誤：

```json
{
  "authenticated": false,
  "error": "錯誤訊息文字",
  "timestamp": 1739876543210
}
```

可能的錯誤訊息：
- `您沒有此機台的巡補員權限` — 使用者不具備 replenisher 角色（admin 不可繞過）
- `找不到 HID {hid} 對應的機台` — GraphQL 查無此 HID
- `簽到失敗` — 其他未預期錯誤（fallback）

## 兩階段認證流程

### 第一階段：Nonce 驗證（gui-replenish 端，快速）

LIFF 掃碼後立即提交 nonce，gui-replenish 比對是否為當前 QR Code 的 nonce。
- Nonce 匹配 → publish `nonce_verify accepted:true` → gui-replenish 顯示「身分查驗中」
- Nonce 不匹配 → publish `nonce_verify accepted:false` → gui-replenish 顯示錯誤，3 秒後 regenerate QR

**目的：fail fast，避免 nonce 已過期卻仍浪費 GraphQL 查詢時間。**

### 第二階段：身分查驗（LIFF 端，需網路）

LIFF 收到 `nonce_verify accepted:true` 後，透過 GraphQL 查詢使用者角色。
- **只看 replenisher 角色**，admin 不可繞過
- 必須即時查詢 DB（`upsertUser`），不可依賴快取
- 查驗結果（成功或失敗）publish 回 MQTT → gui-replenish 進入巡補模式或顯示錯誤

## 核心規則

### 規則 1：LIFF 端每個失敗路徑都必須通知 MQTT

LIFF 的 `handleCheckin` 流程，**每一步失敗都必須 publish 失敗訊息**：

```
掃碼 → publish nonce_submit → 等待 nonce_verify
     → nonce_verify accepted → 查詢 GraphQL 取得角色
     → 角色不符 → publish 失敗
     → 查詢 vms 比對 HID → 找不到 → publish 失敗
     → 全部通過 → publish 成功
     → 任何 exception → publish 失敗
     → nonce_verify rejected → 顯示錯誤（不需 publish，機台已知）
     → nonce_verify timeout → 顯示逾時錯誤（機台可能離線，無法 publish）
```

若 MQTT publish 本身失敗（網路斷線等），則無法通知機台端，此為不可避免的例外。

### 規則 2：gui-replenish 端的訊息處理策略

| 訊息類型 | nonce 檢查 | 回覆 MQTT | 動作 |
|----------|-----------|-----------|------|
| `stage === 'nonce_submit'` | **嚴格檢查** | ✅ publish `nonce_verify` | 匹配→顯示查驗中；不匹配→顯示錯誤 |
| `stage === 'nonce_verify'` | — | 忽略 | 自己 publish 的回覆，不處理 |
| `authenticated === true` | **不檢查** | 不回覆 | nonce 已在第一階段驗過，儲存 `accessToken`，進入巡補模式 |
| `authenticated === false` + error | **不檢查** | 不回覆 | 顯示錯誤 + 3 秒後 regenerate QR |

### 規則 3：nonce 不符視為認證失敗

nonce 與當前 QR Code 不一致時，gui-replenish：
1. publish `{ stage: "nonce_verify", accepted: false, error: "QR Code 已過期，請重新掃描" }`
2. 顯示紅字錯誤：「QR Code 已過期，請掃描新的 QR Code」
3. 3 秒後自動產生新 nonce + 新 QR Code

LIFF 收到 `accepted: false` 後顯示錯誤頁面，不進入巡補。

### 規則 4：所有認證失敗都走相同流程

無論失敗原因（nonce 過期、角色不符、HID 找不到），gui-replenish 一律：
1. 清除「身分查驗中」狀態
2. 以紅字顯示錯誤訊息
3. 3 秒後自動重新產生 QR Code（新 nonce）

不提供手動「重新產生」按鈕。若需完全重啟，關閉再開啟 gui-replenish。

### 規則 5：角色必須即時查詢，且只看 replenisher

- LIFF 在 checkin 時**不可依賴啟動時的角色快取**，必須即時取得最新角色
- **只檢查 replenisher 角色**，admin 身分不可繞過巡補員權限檢查
- 這確保後台移除角色後，下次掃碼立即生效

### 規則 6：LIFF 必須等待第一階段 nonce 確認才進行第二階段

LIFF publish `nonce_submit` 後，**不可直接進行 GraphQL 查詢**。必須：
1. Subscribe `devices/{hid}/auth` topic
2. 等待收到 `{ stage: "nonce_verify", nonce: <matching>, accepted: true }`
3. 確認通過後才進行 GraphQL 角色查驗
4. 若收到 `accepted: false` 或等待逾時（15 秒），顯示錯誤

## 時序圖

```
gui-replenish                    MQTT Broker                     LIFF (手機)
     |                               |                               |
     |-- subscribe devices/{hid}/auth -->|                           |
     |   顯示 QR Code (短碼含 nonce)   |                               |
     |                               |                               |
     |                               |  使用者開啟 LIFF，scanCodeV2 掃碼|
     |                               |                               |
     |                               |<-- publish: nonce_submit ------|
     |<-- message: nonce_submit -----|                               |
     |                               |                               |
     |   ┌─ nonce 匹配 ───────────┐  |                               |
     |-- | publish: nonce_verify  |-->|                               |
     |   | accepted: true         |   |-- message: nonce_verify ----->|
     |   └────────────────────────┘   |                               |
     |   QR 變灰，顯示「身分查驗中」    |          查詢 GraphQL 角色+機台 |
     |                               |                               |
     |   ┌─ nonce 不匹配 ─────────┐  |                               |
     |-- | publish: nonce_verify  |-->|                               |
     |   | accepted: false        |   |-- message: nonce_verify ----->|
     |   └────────────────────────┘   |          收到 rejected         |
     |   紅字錯誤，3秒後重新產生 QR     |          顯示錯誤頁面          |
     |                               |                               |
     |             （以下僅在 nonce 通過後發生）                         |
     |                               |                               |
     |                               |    ┌─ 角色查驗失敗 ──────────┐  |
     |                               |<-- | publish: auth failed    |--|
     |<-- message: auth failed ------|    └─────────────────────────┘  |
     |   紅字錯誤，3秒後重新產生 QR     |          顯示錯誤頁面          |
     |                               |                               |
     |                               |    ┌─ 角色查驗成功 ──────────┐  |
     |                               |<-- | publish: authenticated  |--|
     |                               |    | + accessToken           |  |
     |<-- message: authenticated ----|    └─────────────────────────┘  |
     |   儲存 accessToken             |          導航至巡補 session     |
     |   進入巡補模式                  |                               |
     |                               |                               |
     |   ─── 巡補模式中 ───           |                               |
     |   GraphQL fetch 帶             |                               |
     |   Authorization: Bearer token  |                               |
```

---

# 相關檔案

| 檔案 | 說明 |
|------|------|
| `/home/mozo/ebus-eventlog/api/src/auth.js` | GraphQL 認證模組（LINE token 驗證 + cache） |
| `/home/mozo/ebus-eventlog/api/src/index.js` | GraphQL server + context 注入 |
| `/home/mozo/zgovend/liff/app/src/composables/useGraphQL.ts` | LIFF App GraphQL helper（帶 token） |
| `/home/mozo/zgovend/liff/app/src/composables/useMqttAuth.ts` | MQTT publish + nonce 等待工具函式 |
| `/home/mozo/zgovend/liff/app/src/composables/useLiff.ts` | LINE LIFF 登入、角色管理、refreshRoles |
| `gui-replenish/src/App.vue` | 機台端：QR 產生、MQTT 訂閱、nonce 驗證、接收認證結果 |
| `/home/mozo/docker/nginx-line/conf.d/line.conf` | Nginx referer 白名單 |
| MongoDB `users` collection | 用戶身份、isAdmin、operatorRoles |
