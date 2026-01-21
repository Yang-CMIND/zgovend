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
