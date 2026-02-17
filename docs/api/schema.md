# API Schema（草案）

本檔案依據 `docs/api/mock-api-list.md` 的「可直接用 CRUD 保存」資源自動推定欄位。
用於 NocoDB 建表的初始設計，先以可運作的最小欄位為主，後續可依需求調整。

## NocoDB 建表腳本
本專案已提供可重複執行的建表腳本：`src/api/nocodb_bootstrap.py`。

環境變數：
- `NOCODB_BASE_URL`
- `NOCODB_API_KEY`
- `NOCODB_PROJECT_ID`

腳本會建立表與 Links 關聯欄位（如 `operator_link`、`template_link`、`product_link`）。
NocoDB 會自動補齊系統欄位與實體外鍵欄位（例如 `operators_id`）。

## Airtable 匯入對照
使用 `src/api/airtable_to_nocodb.py` 匯入「販賣機 / 商品」到 NocoDB。  
預設寫入 `operator_id`（`operator=zgo`）。如需寫入 `operator_link`，請設定 `USE_OPERATOR_LINK=1`。

### 販賣機 -> machines
- 機號 -> `code`
- 型號(連結) -> `type`
- 所在門市(連結) -> `area`
- 門市.地址 -> `address`
- 最後心跳 -> `last_sync_at`、`updated_at`
- 狀態：若有最後心跳則 `active`，否則 `inactive`
- 其餘資訊（hid/心跳/溫度/今日營收/庫存/畫面截圖） -> `notes`（JSON 字串）

### 商品 -> products
- 商品編號 -> `sku`
- 商品名稱 -> `name`
- 售價 -> `price`
- Status -> `status`
- barcode -> `barcode`
- 商品圖檔 -> `image_url`（取第一張）
- modified -> `updated_at`
- Airtable createdTime -> `created_at`

## 共通欄位約定
- `id`：主鍵（建議 UUID）
- `operator_id`：營運商 ID（資料隔離用，非必填；全系統唯一）
- `created_at`：建立時間
- `updated_at`：更新時間
- 可選：`deleted_at`（軟刪）

## operators（營運商）
用途：全系統資料的歸屬與隔離

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| id | UUID | Y | 主鍵 |
| code | string | Y | 營運商代碼 |
| name | string | Y | 營運商名稱 |
| status | string | Y | 例：active/inactive |
| contact_name | string | N | 聯絡人 |
| contact_email | string | N | 聯絡信箱 |
| contact_phone | string | N | 聯絡電話 |
| notes | text | N | 備註 |
| created_at | datetime | Y | 建立時間 |
| updated_at | datetime | Y | 更新時間 |

## support_tickets（客服問題單）
用途：對應 API `/support/tickets`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| id | UUID | Y | 主鍵 |
| operator_id | UUID | N | 營運商 |
| user_id | UUID | Y | 建單使用者 |
| category | string | Y | 問題分類 |
| subject | string | N | 標題 |
| description | text | Y | 問題描述 |
| status | string | Y | 例：open/in_progress/closed |
| priority | string | N | 例：low/normal/high |
| attachments | json/text | N | 附件 URL 或 metadata |
| contact_channel | string | N | 例：line/email/phone |
| created_at | datetime | Y | 建立時間 |
| updated_at | datetime | Y | 更新時間 |
| closed_at | datetime | N | 結案時間 |

## products（商品主檔）
用途：對應 API `/products`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| id | UUID | Y | 主鍵 |
| operator_id | UUID | N | 營運商 |
| sku | string | Y | 商品代碼 |
| name | string | Y | 商品名稱 |
| description | text | N | 商品描述 |
| category | string | N | 分類 |
| barcode | string | N | 條碼 |
| unit | string | N | 單位（瓶/包/盒） |
| price | number | Y | 售價 |
| cost | number | N | 成本 |
| status | string | Y | 例：active/inactive |
| image_url | string | N | 圖片連結 |
| tags | json/text | N | 標籤 |
| created_at | datetime | Y | 建立時間 |
| updated_at | datetime | Y | 更新時間 |

## machines（機台）
用途：對應 API `/machines`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| id | UUID | Y | 主鍵 |
| operator_id | UUID | N | 營運商 |
| code | string | Y | 機台代碼 |
| name | string | N | 機台名稱 |
| type | string | N | 機台類型 |
| status | string | Y | 例：active/inactive/maintenance |
| area | string | N | 區域（城市/區） |
| address | string | N | 地址 |
| latitude | number | N | 緯度 |
| longitude | number | N | 經度 |
| last_sync_at | datetime | N | 最近同步時間 |
| notes | text | N | 備註 |
| created_at | datetime | Y | 建立時間 |
| updated_at | datetime | Y | 更新時間 |

## preset_stock_templates（庫存預約設定檔）
用途：對應 API `/preset-stock`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| id | UUID | Y | 主鍵 |
| operator_id | UUID | N | 營運商 |
| name | string | Y | 設定檔名稱 |
| source_type | string | Y | 例：blank/machine/template |
| source_id | UUID/string | N | 對應來源（機台或模板） |
| status | string | N | 例：draft/active |
| created_by | UUID | N | 建立者 |
| created_at | datetime | Y | 建立時間 |
| updated_at | datetime | Y | 更新時間 |

## preset_stock_channels（庫存預約貨道明細）
用途：對應 API `/preset-stock/{templateId}/channels`

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| id | UUID | Y | 主鍵 |
| operator_id | UUID | N | 營運商 |
| template_id | UUID | Y | 對應設定檔 |
| channel_no | string | Y | 貨道編號 |
| product_id | UUID | N | 商品 ID |
| par_level | number | Y | 滿倉量 |
| stock_level | number | Y | 目前庫存 |
| created_at | datetime | Y | 建立時間 |
| updated_at | datetime | Y | 更新時間 |

## 關聯與索引建議
- `operator_id` 作為資料隔離鍵（允許為空）
- `support_tickets.operator_id` -> `operators.id`
- `products.operator_id` -> `operators.id`
- `machines.operator_id` -> `operators.id`
- `preset_stock_templates.operator_id` -> `operators.id`
- `preset_stock_channels.operator_id` -> `operators.id`
- `preset_stock_channels.template_id` -> `preset_stock_templates.id`
- `preset_stock_channels.product_id` -> `products.id`
- `support_tickets.user_id` -> 使用者表（目前未定義）
- `machines.code`, `products.sku` 建議唯一索引

## 待確認事項
- 多營運商資料隔離：`operator_id` 目前設計為可選
- 是否需要軟刪欄位 `deleted_at`
- `support_tickets` 的客服回覆是否要拆成獨立表（messages）
- `machines` 是否需要機台分區/群組表
- 產品價格是否需要幣別欄位
