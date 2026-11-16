# 雲端即時投票系統 (W10 × W11 高級整合版)

本專案融合 **W10 投票板業務場景與概念架構** 與 **W11 現代雲端全端技術棧（Supabase Auth + PostgreSQL RLS + Cloudflare Workers / Pages）**，將原先依賴 Google 試算表（並行衝突、無會員制、無防灌票）的簡易投票，重構為具備資料庫級安全門禁與即時統計動態長條圖的現代化投票平台。

---

## 系統演化架構比較

| 評比維度 | W10 原型（Google 試算表） | W11 高級版（Supabase + 現代前端） |
|---|---|---|
| **畫面與託管** | Google Apps Script `/exec` 網址 | Cloudflare 全球邊緣網路（CDN） |
| **資料儲存體** | Google 試算表（易並行鎖定） | PostgreSQL 關聯式資料庫 |
| **會員與認證** | 無（訪客匿名送出） | Supabase Auth（Email + 密碼身分驗證） |
| **防灌票門禁** | 無法防禦（同一人可狂刷） | 資料庫 `UNIQUE (poll_id, user_id)` + RLS 嚴格一人一票 |
| **資料視覺化** | 純靜態送出文字提示 | 即時動態長條圖（百分比、票數統計、自選標記） |
| **互動彈性** | 固定單一題目 | 支援多個主題、個人投票篩選、登入者發起新投票 |

---

## 核心檔案結構

- **`index.html`**：響應式現代化投票介面，包含導覽狀態列、即時動態得票進度條、身分驗證面板與新投票表單。
- **`style.css`**：現代極簡設計風格，流暢進度長條動畫 (`cubic-bezier`)、嚴謹的排版層次與觸控友善元件。
- **`app.js`**：負責 Supabase Client 初始化、Auth 狀態監聽、一人一票切換邏輯、新投票發起；使用者輸入與標題全數以 `textContent` 渲染，阻絕 XSS 漏洞。
- **`schema.sql`**：包含 `polls`、`poll_options`、`poll_votes` 三張關聯資料表之 DDL、外鍵級聯刪除、RLS 存取原則及 W10 經典投票種子資料。
- **`config.js`**：僅存放公開連線設定（`SUPABASE_URL` 與 `SUPABASE_KEY`），無任何密鑰洩漏風險。

---

## 部署與上線步驟

### 1. Supabase 設定
1. 進入專案之 **SQL Editor**，複製 [schema.sql](schema.sql) 全文貼上並點擊 **Run**。
2. 進入 **Authentication** → **Sign In / Providers**，將 **Confirm email** 開關關閉（便於立即註冊與登入測試）。
3. 至專案首頁取得 **Project URL** 與 **Publishable key**（以 `sb_publishable_` 開頭），貼入 [config.js](config.js)。

### 2. 本機測試與驗證
- 開啟 `index.html`：
  - 訪客可直接查閱各選項目前得票比例與總票數。
  - 登入帳號 A 投給「找不到部署按鈕」，得票比例即時動態拉伸。
  - 開啟無痕視窗或更換帳號 B 登入，投給「同學的手機打不開」，驗證兩帳號投票互不干擾、每人每題嚴格限投一票。
  - 可隨時點擊「撤回投票」重新選擇。

### 3. 推送至 GitHub 與 Cloudflare 部署
1. 推送代碼至 GitHub 儲存庫。
2. 在 Cloudflare Workers & Pages 連結此 GitHub 儲存庫，Build command 留空，即可自動上線取得全球訪問網址。
