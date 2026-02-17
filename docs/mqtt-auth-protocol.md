# MQTT 巡補員簽到認證協議

## 概述

販賣機本地端 (gui-replenish) 與手機端 (LINE LIFF) 透過後端 MQTT Broker 進行巡補員身分認證。三方角色：

| 角色 | 說明 |
|------|------|
| **gui-replenish** | 販賣機本地瀏覽器，顯示 QR Code，訂閱 MQTT 等待認證結果 |
| **LIFF** | 手機 LINE 內的 Web App，掃碼後執行身分查驗並發布結果 |
| **MQTT Broker** | 後端 WSS broker（如 `wss://honeypie.zgovend.com:8443/mqtt`） |

## MQTT Topic

```
devices/{hid}/auth
```

- `hid` = 機台硬體 ID（MAC address 去除冒號，如 `50af7343f553`）
- gui-replenish **subscribe** 此 topic
- LIFF **publish** 至此 topic

## QR Code 格式

```
https://liff.line.me/{LIFF_ID}?action=checkin&hid={hid}&nonce={nonce}
```

- `nonce`：gui-replenish 產生的 32 字元 hex 一次性驗證碼（`crypto.getRandomValues(Uint8Array(16))`）
- 每次產生新 QR Code 時 nonce 都不同，舊 QR Code 自動失效

## 訊息格式（JSON）

所有訊息都包含 `timestamp` 欄位（`Date.now()`，由 publish 端自動附加）。

### 1. 查驗中（verifying）

LIFF 掃碼後、開始查驗身分前，**立即**發送：

```json
{
  "authenticated": false,
  "nonce": "abc123...",
  "status": "verifying",
  "timestamp": 1739876543210
}
```

### 2. 認證成功

角色查驗通過、HID 對應機台存在：

```json
{
  "authenticated": true,
  "nonce": "abc123...",
  "lineUserId": "U1234567890abcdef",
  "displayName": "王小明",
  "timestamp": 1739876543210
}
```

### 3. 認證失敗

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
- `您沒有巡補員權限` — 使用者不具備 replenisher 角色且非 admin
- `找不到 HID {hid} 對應的機台` — GraphQL 查無此 HID
- `簽到失敗` — 其他未預期錯誤（fallback）

## 核心規則

### 規則 1：LIFF 端每個失敗路徑都必須通知 MQTT

LIFF 的 `handleCheckin` 有以下查驗步驟，**每一步失敗都必須 publish 失敗訊息**：

```
掃碼 → publish verifying
     → 查詢 GraphQL 取得角色 → 角色不符 → publish 失敗
     → 查詢 vms 比對 HID → 找不到 → publish 失敗
     → 全部通過 → publish 成功
     → 任何 exception → publish 失敗
```

若 MQTT publish 本身失敗（網路斷線等），則無法通知機台端，此為不可避免的例外。採用 `try { await publish(...) } catch {}` 靜默處理。

### 規則 2：gui-replenish 端的 nonce 驗證策略

| 訊息類型 | nonce 檢查 | 原因 |
|----------|-----------|------|
| `status === 'verifying'` | **不檢查** | 有人掃碼即應顯示回饋，無論新舊 QR |
| 認證結果（成功/失敗） | **嚴格檢查** | 防止舊 QR Code 重放攻擊 |

### 規則 3：nonce 不符視為認證失敗

認證結果的 nonce 與當前 QR Code 的 nonce 不一致時：
1. 顯示紅字錯誤：「QR Code 已過期，請掃描新的 QR Code」
2. 移除 QR Code 圖片與提示文字
3. 3 秒後自動產生新 nonce + 新 QR Code

### 規則 4：所有認證失敗都走相同流程

無論失敗原因（角色不符、HID 找不到、nonce 過期），gui-replenish 一律：
1. 清除「身分查驗中」狀態
2. 以紅字顯示錯誤訊息，同時移除 QR Code 圖片
3. 3 秒後自動重新產生 QR Code（新 nonce）

不提供手動「重新產生」按鈕。若需完全重啟，關閉再開啟 gui-replenish。

### 規則 5：角色必須即時查詢

LIFF 在 checkin 時**不可依賴啟動時的角色快取**，必須透過 GraphQL `upsertUser` mutation 即時取得最新角色。這確保後台移除角色後，下次掃碼立即生效。

## 時序圖

```
gui-replenish                    MQTT Broker                     LIFF (手機)
     |                               |                               |
     |-- subscribe devices/{hid}/auth -->|                           |
     |   顯示 QR Code (含 nonce)      |                               |
     |                               |                               |
     |                               |          使用者掃碼，LIFF 開啟  |
     |                               |                               |
     |                               |<-- publish: verifying ---------|
     |<-- message: verifying --------|                               |
     |   QR 變灰，顯示「身分查驗中」    |                               |
     |                               |          查詢 GraphQL 角色+機台 |
     |                               |                               |
     |                               |    ┌─ 成功 ─────────────────┐  |
     |                               |<-- | publish: authenticated  |--|
     |<-- message: authenticated ----|    └────────────────────────┘  |
     |   進入巡補畫面                  |          導航至巡補作業頁       |
     |                               |                               |
     |                               |    ┌─ 失敗 ─────────────────┐  |
     |                               |<-- | publish: error         |--|
     |<-- message: error ------------|    └────────────────────────┘  |
     |   紅字錯誤，3秒後重新產生 QR     |          顯示錯誤頁面          |
```

## 相關檔案

| 檔案 | 角色 |
|------|------|
| `gui-replenish/src/App.vue` | 機台端：QR 產生、MQTT 訂閱、訊息處理 |
| `liff/app/src/App.vue` | 手機端：掃碼攔截、角色查驗、MQTT 發布 |
| `liff/app/src/composables/useMqttAuth.ts` | MQTT publish 工具函式 |
| `liff/app/src/composables/useGraphQL.ts` | GraphQL client |
| `liff/app/src/composables/useLiff.ts` | LINE LIFF 登入、角色管理 |
