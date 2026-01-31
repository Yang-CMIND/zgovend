# zgovend LIFF demo (Vite) — 登入 + 綁定 PoC

這是一個可跑的 LIFF PoC：
1) 在 LINE 內開啟 LIFF
2) 做 LIFF Login
3) 取得 profile / idToken
4) 把「綁定資訊」POST 到你自己的後端（示例 endpoint：`POST /liff/bind`）

> 這個 demo 的重點是「理解 LIFF 能提供什麼身份資訊，以及綁定流程的樣子」；
> 真正的綁定必須由後端驗證 `id_token` 後才寫入資料庫。

---

## 前置：建立 LIFF app
在 LINE Developers 建立 LIFF app，拿到 `liffId`。

注意：LIFF endpoint URL 需要 **HTTPS**。

---

## 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`：
- `VITE_LIFF_ID=...`（你的 liffId）
- `VITE_API_BASE=...`（你的後端 base url，例如 `https://api.example.com`）

---

## 本機開發

```bash
npm i
npm run dev
```

然後你需要把 Vite dev server 用 ngrok/cloudflared 暴露成 https，
並把該 https URL 設到 LIFF endpoint URL。

---

## 後端接口（示例）

demo 會呼叫：
- `POST {VITE_API_BASE}/liff/bind`

payload 會包含：
- `idToken`（建議後端用它做 OIDC 驗證）
- `accessToken`（可選）
- `profile`（僅供 UI 顯示，不應當作唯一可信身份）
- `bindType` / `bindCode` / `note`

---

## 下一步（你決定架構前可以先問自己）

- 綁定的最小資料模型是什麼？
  - `line_user_id` ↔ `operator_id` / `staff_id`
  - 以及：允許一個人綁多個 operator 或多個機台嗎？

- 綁定流程要不要雙向驗證？
  - 例如：後端發一次性 code 給營運商管理者，LIFF 端輸入 code 才能綁定。

如果你回答這些問題，我就可以把「zgovend 綁定 API」規格化到 `docs/api/` 或 `specs/`。
