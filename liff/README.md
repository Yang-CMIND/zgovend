# LIFF（LINE Front-end Framework）評估筆記（zgovend）

這個目錄是**獨立的 LIFF 評估區**：先理解 LIFF 是什麼、能做什麼、典型應用場景是哪些；等你確定需求後，再把成品整合進 `src/liff/` 或改成獨立部署。

> LIFF 的本質：**在 LINE App 內建瀏覽器裡運行的一個 Web App**。
> 你用一般前端技術（HTML/JS/React/Vue…）做 UI，然後透過 LIFF SDK 取得使用者資訊、觸發 LINE 的能力（登入、發訊息、掃碼、開相機…）。

---

## LIFF 最典型的應用場景（你可以用 zgovend 的語境想）

### 1) 會員/身份綁定入口（Login + 綁定）
**目標**：讓使用者在 LINE 裡完成登入與綁定，後端拿到可驗證的 `userId`（或 id_token）。
- zgovend 對應：營運商/補貨員/維修員登入、綁定特定公司/角色
- 常見功能：顯示 profile、同意條款、綁定手機、綁定機台/門市

### 2) 掃碼（QR / Barcode）→ 進入特定流程
**目標**：使用者掃機台貼紙/工單 QR，直接進入對應頁面。
- zgovend 對應：掃機台 code → 顯示機台狀態、補貨清單、報修表單
- 常見功能：`liff.scanCodeV2()`（依 LIFF/LINE client 支援情況）

### 3) 表單（報修/補貨/盤點/回報）
**目標**：以「小流程」完成資料提交，降低安裝 App 的阻力。
- zgovend 對應：
  - 補貨回報：補了哪些商品、數量、異常照片
  - 報修：故障類型、描述、照片、定位
- 常見功能：表單 + 上傳圖片（前端上傳到後端或物件儲存）

### 4) 深連結互動（從 Bot 卡片/選單點進 LIFF）
**目標**：Bot 負責「通知/導流」，LIFF 負責「完成任務」。
- zgovend 對應：
  - Bot 推播「某台機台缺貨」→ 點開 LIFF 直接看到補貨任務
  - Bot 推播「工單待處理」→ 點開 LIFF 回覆處理結果

### 5) 在 LINE 內發訊息（LIFF → Bot/聊天室）
**目標**：LIFF 做完某件事後，把訊息送回聊天室（例如確認/回報）。
- 典型：提交表單後，`liff.sendMessages([{type:'text', text:'已回報完成'}])`
- 注意：`sendMessages` 通常只在 `liff.isInClient() === true` 時可用

---

## 架構選項（先理解，之後再決定 zgovend 怎麼放）

### 選項 A：LIFF 純前端（最輕量）
- 前端：LIFF 頁面（靜態站）
- 後端：用既有 API（或暫時沒有）
- 適合：驗證概念、快速 PoC

### 選項 B：LIFF + 後端驗證（比較正規）
- LIFF 前端取得 `id_token` 或 `accessToken`
- 後端驗證 token → 建立 session / 發 JWT → 再打 zgovend API
- 適合：需要權限/角色控管（營運商/補貨/維修）

### 選項 C：LIFF 作為「任務 UI」，Bot 作為「事件入口」
- Bot：提醒、推播、派工
- LIFF：查看工單/填表/確認
- 適合：營運場景（派工、補貨、報修）

---

## 開發/設定你一定會遇到的關鍵點

1) **必須 HTTPS**（LIFF endpoint URL）
2) **liffId 由 LINE Developers 產生**（不是你自己編）
3) **登入/是否在 LINE 內**
   - `liff.isLoggedIn()` / `liff.login()`
   - `liff.isInClient()`（在 LINE 內才有部分能力）
4) **安全性**：不要只信任前端傳的 userId
   - 後端應驗證 `id_token`（OIDC）或 access token

---

## 這個目錄提供的範例

- `examples/basic/`：最小 HTML 範例（無框架）
- `examples/vite/`：Vite 最小專案骨架（可選）

你要進一步評估的話，我可以把 `examples/vite/` 補成可直接 `npm i && npm run dev` 的版本。
