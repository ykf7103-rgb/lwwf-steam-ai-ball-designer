# AI球類設計師 Web

五年級數體STEAM跨科活動學生網站。

## 正式網址

- Worker 網址：https://lwwf-steam-ai-ball-designer.lwwfaiteams.workers.dev
- GitHub repo：https://github.com/ykf7103-rgb/lwwf-steam-ai-ball-designer

## 內容

- `public/index.html`：學生使用的主頁
- `src/worker.js`：Cloudflare Worker 上載端點
- `wrangler.toml`：Cloudflare 部署設定
- `public/assets/hero-ai-ball-designer.png`：AI 生成主視覺
- `public/assets/teaching-slide-student-journey.png`：16:9 學生流程教學簡報圖
- `public/assets/teaching-slide-teacher-dashboard.png`：16:9 老師檢視教學簡報圖
- `public/assets/lwwf-logo.png`：學校校章

## 班別學號

- 5A：1 至 26 號
- 5B：1 至 21 號
- 5C：1 至 28 號
- 5D：1 至 20 號

## 本機預覽

```powershell
cd "D:\Google drive sync with T7 Shield\LWWF\Claude code\數跨科\ai-ball-designer-web"
wrangler dev
```

## 正式上載設定

已建立 Cloudflare KV namespace：

```text
STEAM_UPLOADS_KV = c72ba94c393f4fd2bfbcb43448b0f52f
```

部署：

```powershell
wrangler deploy
```

學生作品會存到 KV key：

```text
steam-ai-ball-designer/2025-26/班別/學號/
```

例如：

```text
steam-ai-ball-designer/2025-26/5A/01/
```

目前使用 KV 儲存檔案和 metadata，學生作品大小限制為 10MB。Cloudflare 帳戶日後啟用 R2 後，可再轉成 R2 儲存。

## 老師檢視

老師在網頁輸入密碼後，可按 `5A`、`5B`、`5C`、`5D` 查看交件情況、未交學號和作品清單。老師密碼已以 Cloudflare Secret `TEACHER_PW` 儲存，不寫入前端程式碼。
