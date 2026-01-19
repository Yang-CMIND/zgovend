# Mock API 清單（草案）

基礎路徑：`/api/v1`

## 身分驗證
- `POST /auth/liff/login`（所有角色）
  - 以 LIFF token 交換後端 session

## 客服問題（一般消費者）
- `POST /support/tickets`
  - 建立問題單（分類、描述、附件）
- `GET /support/tickets`
  - 查詢本人問題單清單與狀態
- `GET /support/tickets/{ticketId}`
  - 查詢問題單細節與回覆內容

## 商品主檔（營運者）
- `GET /products`
  - 取得商品清單
- `POST /products`
  - 建立商品
- `PATCH /products/{productId}`
  - 更新商品欄位
- `DELETE /products/{productId}`
  - 硬刪除商品

## 庫存預約設定（營運者）
- `GET /reservation-templates`
  - 取得設定檔清單
- `POST /reservation-templates`
  - 建立空白設定檔
- `POST /reservation-templates/{templateId}/copy-from-machine`
  - 由機台快照建立設定檔
- `POST /reservation-templates/{templateId}/copy-from-template`
  - 由既有設定檔建立複本
- `PATCH /reservation-templates/{templateId}`
  - 更名設定檔
- `DELETE /reservation-templates/{templateId}`
  - 硬刪除設定檔
- `PUT /reservation-templates/{templateId}/channels`
  - 更新貨道商品、清空商品、滿倉量

## 撿貨清單（巡補員）
- `POST /picklists`
  - 依選擇機台產生撿貨清單

## 巡補作業（巡補員）
- `POST /machines/{machineId}/checkin`
  - 現場簽到驗證
- `POST /replenishment/sessions`
  - 建立巡補 Session
- `POST /replenishment/sessions/{sessionId}/apply-template`
  - 套用預約設定檔（暫存）
- `PATCH /replenishment/sessions/{sessionId}/channels`
  - 更新貨道商品/庫存/滿倉量（暫存）
- `POST /replenishment/sessions/{sessionId}/complete`
  - 提交巡補結果並寫入機台

## 機台同步（系統）
- `POST /machine-sync/inventory`
  - 同步機台庫存快照
- `POST /machine-sync/events`
  - 同步機台事件或狀態
