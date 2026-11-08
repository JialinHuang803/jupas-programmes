# 選科資料冊 · The Programme Edit

米白與深綠色的香港八校 JUPAS 課程檢索靜態網站，使用原生 HTML、CSS、JavaScript 及離線 JSON，無後端與執行時第三方依賴。

網站：<https://JialinHuang803.github.io/jupas-programmes/>

## 收錄範圍與資料

截至 2026-11-08，官方完整列表共有 **345 個獨立 JS 申請編號**，對應 **2027/28 入學年度**。
入學年度依官方當期申請日程核對，並非把歷年申請統計的年份當作入學年度。

| 院校 | 官方列表 | JS 編號數 |
| --- | --- | ---: |
| 香港城市大學 | <https://www.jupas.edu.hk/tc/programme/cityuhk/> | 60 |
| 香港浸會大學 | <https://www.jupas.edu.hk/tc/programme/hkbu/> | 23 |
| 嶺南大學 | <https://www.jupas.edu.hk/tc/programme/lingnanu/> | 23 |
| 香港中文大學 | <https://www.jupas.edu.hk/tc/programme/cuhk/> | 73 |
| 香港教育大學 | <https://www.jupas.edu.hk/tc/programme/eduhk/> | 26 |
| 香港理工大學 | <https://www.jupas.edu.hk/tc/programme/polyu/> | 47 |
| 香港科技大學 | <https://www.jupas.edu.hk/tc/programme/hkust/> | 34 |
| 香港大學 | <https://www.jupas.edu.hk/tc/programme/hku/> | 59 |

每個編號包含官方中英文名稱、院校、資助類別、縮寫、中文速覽及 JUPAS 官方詳情連結。
課程組合、學院或學系招生，以及同一編號下的多個學位選項，只計作一個申請編號；不代表八校所有非 JUPAS 課程或每個分流專業的總數。
不收錄香港都會大學與其他 SSSDP 院校。
目前八校列表的資助類別均為 UGC-funded。

**中文速覽是非官方的名稱摘要，不是官方 Short Description 的翻譯。**
它只整理官方名稱中明示的方向、學位組合與選項，不推測教學內容、就業前景、修讀年期或錄取要求。
某些院校以學院、學系或組合形式招生，具體分流規則須閱讀官方頁面。
若要了解完整課程簡介、入學要求、費用及院校網站，使用每張卡片的「官方詳情」。
如 JUPAS 與院校網站資料有差異，以院校網站所載為準。
本工具非 JUPAS 或任何院校的官方或獲認可網站，不提供升學保證。

完整採集時間、各校來源及入學年度來源存放於 `data/programmes.json`，亦可在頁面「關於資料」查看。
網站提供當次快照，不聲稱即時同步。

## 搜尋與使用

可搜尋繁體中文名稱、英文名稱、中文速覽、課程縮寫、院校名稱或 JS 編號，不分英文字母大小寫。
以空格分隔的關鍵字會取交集；例如 `business management`。
可同時使用院校與資助類別篩選，檢視結果數量、清空篩選，以及每次載入 24 個結果。
所有課程都在快照內；分批顯示只為減少初次頁面負擔，不會截斷收錄範圍。
鍵盤按 `/` 聚焦搜尋，Tab 可切換控制項及官方連結。
支援手機排版、減少動態效果偏好、載入失敗重試、無結果狀態及螢幕閱讀器結果提示。
搜尋篩選保存在網址參數，可複製網址分享；不使用瀏覽器本機持久儲存。

## 本機啟動與驗證

需要 Node.js 22 或更新版本，無需安裝 npm 套件。

```powershell
npm test
npm start
```

開啟 <http://127.0.0.1:4173/jupas-programmes/>，直接用 `file:` 開啟 HTML 無法載入資料。
本機伺服器僅綁定 `127.0.0.1`，供開發預覽使用。

```powershell
npm run build
```

將 HTML、靜態資產與資料複製至忽略版本控制的 `dist`，不包含 Git、測試或採集腳本。
所有資產和 JSON 使用相對路徑，適用 GitHub Pages 的儲存庫子路徑。
單元測試涵蓋 345 筆資料完整性、八校數量、每筆中英文搜尋、摘要一致性、官方連結、篩選交集及官方 HTML 解析異常。

## 更新資料

```powershell
npm run update-data
npm test
```

採集腳本檢查 `robots.txt`，若不存在（404）則繼續；如出現限制性規則則停止，要求人工核對，不嘗試繞過。
腳本只依序讀取官方申請日程及八校完整列表，院校請求間隔 1.5 秒，不抓取全站或 345 份詳情長文，不使用並行請求。
資料失敗、官方結構改變、中文名稱缺失、重複編號、無法核對入學年度或列表中有未解析編號時，明確報錯並保留原 JSON。
中文名稱缺失時需維護者先人工審閱翻譯，不生成虛構替代資料。
成功後才原子替換 `data/programmes.json`。
更新後應核對資料差異、摘要及官方來源；若官方年度或課程數量改變，需同步更新本 README 和測試內當期快照預期。
確認無誤後再提交與推送，不設自動採集或定時部署。

## GitHub Pages 部署

儲存庫的 **Settings → Pages → Build and deployment → Source** 使用 **GitHub Actions**。
`.github/workflows/pages.yml` 在推送 `main` 或手動觸發時執行測試、準備靜態檔案，再透過官方 `configure-pages`、`upload-pages-artifact` 及 `deploy-pages` 發布。
失敗的驗證不會進入部署。
不需要 PR、API 密鑰、自訂伺服器或付費服務。

## 私隱與來源使用

搜尋在瀏覽器本機完成，不把查詢傳送到資料服務，不設 cookies、分析追蹤、第三方字型或外部腳本。
查詢保存在網址中，分享網址或瀏覽器歷史亦包含它；網址請勿放入敏感個人資料。
GitHub Pages 託管及外部官方網站仍受各自私隱政策約束：<https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>。
官方名稱、編號及連結僅用作課程索引；沒有複製官方長篇簡介、院校標誌或招生圖片。
