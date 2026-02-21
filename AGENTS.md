# Repository Guidelines

本文件為貢獻者指南，聚焦於 zgovend 的文件與規格資產，請依規範提交一致、可追溯的變更。

## Project Structure & Module Organization
- `docs/` 規格與設計文件（含 `docs/architecture/`, `docs/api/`, `docs/flows/`, `docs/decisions/`）。
- `specs/` 規格草稿與定稿（`specs/drafts/`, `specs/final/`）。
- `src/` 程式碼區（`src/liff/`, `src/bot/`, `src/api/`, `src/shared/`）。
- `test/` 測試資料與案例（`test/data/`, `test/cases/`, `test/mocks/`, `test/reports/`）。
- `env/` 執行與測試環境（`env/docker/`, `env/scripts/`, `env/configs/`）。
- `assets/` 圖片與流程圖原檔，`notes/` 會議紀錄，`tools/` 工具腳本。

## Build, Test, and Development Commands
目前未提供統一的 build/test 指令與腳本。請先檢查 `env/scripts/` 是否已有團隊腳本；若新增流程，請在此段補上範例指令與用途說明（例如啟動環境、產生測試資料）。

## Coding Style & Naming Conventions
- 對人閱讀的內容使用繁體中文；程式碼變數與檔名使用英文。
- 檔名以英文為主，避免混用語言。
- 程式碼註解使用中文。
- 尚未設定格式化或 lint 工具；若導入（如 Go/Node/Python），請補充縮排規則與格式化指令。

## Testing Guidelines
尚未指定測試框架與覆蓋率門檻。測試相關內容集中於 `test/`；新增案例時請描述案例目的、輸入輸出與關聯規格（建議在檔頭註明對應的 `docs/` 或 `specs/`）。

## Commit & Pull Request Guidelines
- 近期提交訊息以簡短英文動詞開頭（例：`Add architecture, API, and consolidated flow docs`）。
- 請保持單一主題、清楚描述變更範圍與影響。
- PR 需提供：變更摘要、關聯議題/需求連結、涉及圖檔或流程圖時的預覽截圖，並標註更新的文件路徑。

## Security & Configuration Tips
範例設定檔集中於 `env/configs/`，請勿提交敏感資訊或憑證。若需新增環境變數，請同步更新對應文件與範例設定。

---

## 巡補功能系統全景與開發測試架構

### 三大部分

#### 1. 巡補員手機 — LIFF App（`liff/app/`）
- **運行環境：** LINE 內建瀏覽器（手機）
- **技術：** Vue 3 + TypeScript + Vite
- **連接目標：** honeypie nginx :8443
  - GraphQL（`/graphql`）— 帶 LINE access token 做角色查詢
  - MQTT（`/mqtt` WSS）— 簽到認證 nonce 交換 + 傳送 accessToken
- **部署：** `npx vite build` → nginx serve `/liff/`

#### 2. IPC 販賣機系統（demo-stack/zgovend instance）
實體販賣機的 IPC 控制器，開發階段以 Docker 容器群模擬，運行於 honeypie。

| 容器 | 功能 | 對外端口 |
|------|------|---------|
| **mq** | Mosquitto MQTT broker，IPC 內部事件匯流排 | :14003 (TCP), :14004 (WS) |
| **smc** | 狀態機控制器 (Node.js)，販賣機核心邏輯 | — |
| **mw** | Middleware (Perl)，ebus event handler | — |
| **rest** | RESTful API (nginx + CGI)，機台資料/媒體 | :14001 |
| **cron** | 定時任務（LTMS 佈署等） | — |
| **gateway** | HAProxy，跨 instance 路由 | — |
| **LocalDB** | SQLite (Docker volume)，即時庫存/交易 | — |

**前端 GUI：**
- **銷售 GUI**（`gui/zgovend/`）— frontend nginx 提供，`http://honeypie:8088/demo/zgovend/`
- **巡補 GUI**（`/home/mozo/gui-replenish/`）— **尚未放入 frontend**，目前在筆電 `npm run serve` 執行，連接 honeypie 的 REST(:14001) + MQTT(:14004) + GraphQL(:8443)

⚠️ **兩個不同的 MQTT broker：**
- **ebus-eventlog 的 Mosquitto**（nginx :8443/mqtt → :9001）— 雲端，LIFF 簽到認證用
- **demo-stack/zgovend 的 Mosquitto**（:14003/:14004）— IPC 內部，機台事件用
- gui-replenish 兩邊都要連

#### 3. 雲端後端（ebus-eventlog + 周邊，運行於 honeypie）
- **GraphQL API** (:4000) — 使用者/營運商/機台/商品/交易 CRUD + RBAC
- **MongoDB** (:27017) — DB=`ebus`，auth=admin/ebus2026
- **Node-RED** (:1880) — MQTT → MongoDB projector（交易、心跳）
- **nginx** (:8443 HTTPS) — 統一入口 reverse proxy
- **MinIO** (:9100) — 商品圖片物件儲存

### 認證協議
詳見 `docs/mqtt-auth-protocol.md`，涵蓋：
- GraphQL API LINE access token 驗證 + RBAC
- MQTT 兩階段簽到認證（nonce → 角色查驗 → accessToken 傳遞）

### 開發測試分工

**筆電 (VS Code + Claude Code) 為主：**
- 改 gui-replenish、LIFF App 前端程式碼
- `npm run serve` 跑 gui-replenish dev server
- 瀏覽器開 GUI 操作測試（銷售 GUI: `honeypie:8088/demo/zgovend/`、巡補 GUI: `localhost:8080`）
- 手機 LIFF 真機掃碼測試

**honeypie (OpenClaw + Claude Code) 為輔：**
- 改 ebus-eventlog（GraphQL API、auth.js）、Node-RED flow
- `docker restart` / `docker cp` 重啟後端服務
- MQTT 監聽/模擬事件（`mosquitto_pub` / `smock.sh zgovend <event>`）
- MongoDB 資料查驗（`docker exec ebus-mongo mongosh`）
- `vite build` LIFF App → nginx 部署
- 模擬 LIFF 簽到流程（不需真機，script 直接 publish MQTT 訊息）

**程式碼同步：** 兩邊都有 clone，透過 `git push` / `git pull` 同步。改完後 push，另一邊 pull。
