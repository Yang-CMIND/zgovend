# MQTT 巡補員簽到認證協議

## 概述

販賣機本地端 (gui-replenish) 與手機端 (LINE LIFF) 透過後端 MQTT Broker 進行巡補員身分認證。三方角色：

| 角色 | 說明 |
|------|------|
| **gui-replenish** | 販賣機本地瀏覽器，顯示 QR Code，訂閱 MQTT 等待認證結果，驗證 nonce 後回覆確認 |
| **LIFF** | 手機 LINE 內的 Web App，透過 `liff.scanCodeV2()` 掃描機台 QR Code，解析後執行身分查驗並發布結果，等待機台 nonce 確認 |
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

LIFF app 掃碼解析後，等同於過去的 URL 方式帶入 `hid` + `nonce`，直接呼叫 `handleCheckin(hid, nonce)` 進入認證流程。

## 訊息格式（JSON）

所有訊息都包含 `timestamp` 欄位（`Date.now()`，由 publish 端自動附加）。

### 1. 查驗中（verifying）— LIFF → MQTT

LIFF 掃碼後、開始查驗身分前，**立即**發送：

```json
{
  "authenticated": false,
  "nonce": "abc123...",
  "status": "verifying",
  "timestamp": 1739876543210
}
```

### 2. 認證成功 — LIFF → MQTT

角色查驗通過（使用者具備 replenisher 角色）、HID 對應機台存在：

```json
{
  "authenticated": true,
  "nonce": "abc123...",
  "lineUserId": "U1234567890abcdef",
  "displayName": "王小明",
  "timestamp": 1739876543210
}
```

### 3. 認證失敗 — LIFF → MQTT

任何查驗步驟失敗時，**必須** publish 失敗訊息，讓 gui-replenish 同步顯示錯誤：

```json
{
  "authenticated": false,
  "nonce": "abc123...",
  "error": "錯誤訊息文字",
  "timestamp": 1739876543210
}
```

可能的錯誤訊息：
- `您沒有巡補員權限` — 使用者不具備 replenisher 角色（admin 不可繞過）
- `找不到 HID {hid} 對應的機台` — GraphQL 查無此 HID
- `簽到失敗` — 其他未預期錯誤（fallback）

### 4. Nonce 驗證結果 — gui-replenish → MQTT

gui-replenish 收到認證結果（成功或失敗以外的 `authenticated: true`）後，比對 nonce 並 publish 驗證結果：

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

## 雙向認證流程

認證分為兩階段：

### 第一階段：身分查驗（LIFF 端）
LIFF 透過 GraphQL 查詢使用者角色，判斷是否具備 replenisher 權限。
- **只看 replenisher 角色**，admin 不可繞過
- 必須即時查詢 DB（`refreshRoles` / `upsertUser`），不可依賴快取

### 第二階段：Nonce 驗證（gui-replenish 端）
gui-replenish 收到 LIFF 的認證成功訊息後，比對 nonce 是否為當前 QR Code 的 nonce。
- Nonce 匹配 → publish `nonce_verify accepted:true` → LIFF 收到後才進入巡補 session
- Nonce 不匹配 → publish `nonce_verify accepted:false` → LIFF 顯示錯誤，不進入巡補

**LIFF 必須等待第二階段完成才能導航至巡補頁面。**

## 核心規則

### 規則 1：LIFF 端每個失敗路徑都必須通知 MQTT

LIFF 的 `handleCheckin` 有以下查驗步驟，**每一步失敗都必須 publish 失敗訊息**：

```
掃碼 → publish verifying
     → 查詢 GraphQL 取得角色 → 角色不符 → publish 失敗
     → 查詢 vms 比對 HID → 找不到 → publish 失敗
     → 全部通過 → publish 成功 → 等待 nonce 確認
     → nonce 確認通過 → 進入巡補 session
     → nonce 確認失敗 → 顯示錯誤
     → 任何 exception → publish 失敗
```

若 MQTT publish 本身失敗（網路斷線等），則無法通知機台端，此為不可避免的例外。

### 規則 2：gui-replenish 端的 nonce 驗證策略

| 訊息類型 | nonce 檢查 | 回覆 MQTT | 原因 |
|----------|-----------|-----------|------|
| `status === 'verifying'` | **不檢查** | 不回覆 | 有人掃碼即應顯示回饋 |
| `authenticated === true` | **嚴格檢查** | ✅ publish `nonce_verify` | LIFF 等待此回覆才決定是否進入巡補 |
| `authenticated === false` + error | **不檢查** | 不回覆 | LIFF 端已判定失敗，直接顯示錯誤 |
| `stage === 'nonce_verify'` | — | 忽略 | 自己 publish 的回覆，不處理 |

### 規則 3：nonce 不符視為認證失敗

認證結果的 nonce 與當前 QR Code 的 nonce 不一致時，gui-replenish：
1. publish `{ stage: "nonce_verify", accepted: false, error: "QR Code 已過期，請重新掃描" }`
2. 顯示紅字錯誤：「QR Code 已過期，請掃描新的 QR Code」
3. 移除 QR Code 圖片與提示文字
4. 3 秒後自動產生新 nonce + 新 QR Code

LIFF 收到 `accepted: false` 後顯示錯誤頁面，不進入巡補。

### 規則 4：所有認證失敗都走相同流程

無論失敗原因（角色不符、HID 找不到、nonce 過期），gui-replenish 一律：
1. 清除「身分查驗中」狀態
2. 以紅字顯示錯誤訊息，同時移除 QR Code 圖片
3. 3 秒後自動重新產生 QR Code（新 nonce）

不提供手動「重新產生」按鈕。若需完全重啟，關閉再開啟 gui-replenish。

### 規則 5：角色必須即時查詢，且只看 replenisher

- LIFF 在 checkin 時**不可依賴啟動時的角色快取**，必須即時取得最新角色
- **只檢查 replenisher 角色**，admin 身分不可繞過巡補員權限檢查
- 這確保後台移除角色後，下次掃碼立即生效

### 規則 6：LIFF 必須等待機台端 nonce 確認

LIFF publish 認證成功訊息後，**不可直接導航至巡補頁面**。必須：
1. Subscribe `devices/{hid}/auth` topic
2. 等待收到 `{ stage: "nonce_verify", nonce: <matching>, accepted: true }` 
3. 確認通過後才導航至巡補 session
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
     |                               |<-- publish: verifying ---------|
     |<-- message: verifying --------|                               |
     |   QR 變灰，顯示「身分查驗中」    |                               |
     |                               |          查詢 GraphQL 角色+機台 |
     |                               |                               |
     |                               |    ┌─ 角色查驗失敗 ──────────┐  |
     |                               |<-- | publish: error          |--|
     |<-- message: error ------------|    └─────────────────────────┘  |
     |   紅字錯誤，3秒後重新產生 QR     |          顯示錯誤頁面          |
     |                               |                               |
     |                               |    ┌─ 角色查驗成功 ──────────┐  |
     |                               |<-- | publish: authenticated  |--|
     |<-- message: authenticated ----|    | + subscribe 等待確認     |  |
     |                               |    └─────────────────────────┘  |
     |   檢查 nonce...               |                               |
     |                               |                               |
     |   ┌─ nonce 匹配 ───────────┐  |                               |
     |-- | publish: nonce_verify  |-->|                               |
     |   | accepted: true         |   |-- message: nonce_verify ----->|
     |   └────────────────────────┘   |          收到 accepted:true    |
     |   進入巡補模式                  |          導航至巡補 session     |
     |                               |                               |
     |   ┌─ nonce 不匹配 ─────────┐  |                               |
     |-- | publish: nonce_verify  |-->|                               |
     |   | accepted: false        |   |-- message: nonce_verify ----->|
     |   └────────────────────────┘   |          收到 accepted:false   |
     |   紅字錯誤，3秒後重新產生 QR     |          顯示錯誤頁面          |
```

## 相關檔案

| 檔案 | 角色 |
|------|------|
| `gui-replenish/src/App.vue` | 機台端：QR 產生、MQTT 訂閱、nonce 驗證、nonce 結果 publish |
| `liff/app/src/App.vue` | 手機端：掃碼攔截、角色查驗、MQTT 發布、等待 nonce 確認 |
| `liff/app/src/composables/useMqttAuth.ts` | MQTT publish + publishAndWaitNonce 工具函式 |
| `liff/app/src/composables/useGraphQL.ts` | GraphQL client |
| `liff/app/src/composables/useLiff.ts` | LINE LIFF 登入、角色管理、refreshRoles |
