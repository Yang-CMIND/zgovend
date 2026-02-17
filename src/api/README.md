# API 工具說明

本目錄包含用於初始化 NocoDB schema 的腳本。

## nocodb_bootstrap.py
用途：建立表與關聯（可重複執行）。

### 需要的環境變數
- `NOCODB_BASE_URL`：NocoDB base URL（例：`http://honeypie.zgovend.com:8080`）
- `NOCODB_API_KEY`：NocoDB API Key
- `NOCODB_PROJECT_ID`：Project ID（例如 `zgovend` 對應的 id）

### 執行方式
```bash
NOCODB_BASE_URL=... \
NOCODB_API_KEY=... \
NOCODB_PROJECT_ID=... \
python src/api/nocodb_bootstrap.py
```

### 建立內容
- 表：`operators`、`support_tickets`、`products`、`machines`、`preset_stock_templates`、`preset_stock_channels`
- 關聯：
  - `operator_link`（各表 -> `operators`）
  - `template_link`（`preset_stock_channels` -> `preset_stock_templates`）
  - `product_link`（`preset_stock_channels` -> `products`）

備註：NocoDB 會額外建立系統欄位與實體外鍵欄位（例如 `operators_id`）。

## airtable_to_nocodb.py
用途：從 Airtable 匯入「機台 / 商品」資料到 NocoDB（交易記錄不處理）。

### 需要的環境變數
- `AIRTABLE_BASE_ID`
- `AIRTABLE_API_KEY`
- `NOCODB_BASE_URL`
- `NOCODB_API_KEY`
- `NOCODB_PROJECT`（預設：`zgovend`）
- `OPERATOR_CODE`（預設：`zgo`）
- `DRY_RUN`（選用，`true/1` 只試跑不寫入）
- `USE_OPERATOR_LINK`（選用，`true/1` 才寫入 `operator_link` 關聯）

### 執行方式
```bash
AIRTABLE_BASE_ID=... \
AIRTABLE_API_KEY=... \
NOCODB_BASE_URL=... \
NOCODB_API_KEY=... \
NOCODB_PROJECT=zgovend \
OPERATOR_CODE=zgo \
python src/api/airtable_to_nocodb.py
```
