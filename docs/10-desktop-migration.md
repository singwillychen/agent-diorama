# 10 · 轉往桌面版的設定與路線

目前先做 **網頁平台版**（Vite + React Three Fiber + Node 事件中樞）。以下約定讓之後包成桌面 App 時不需要重寫。

## 現在就遵守的約定

| 約定 | 原因 |
|---|---|
| 前端只透過 `VITE_DIORAMA_HUB` / `?hub=` 取得中樞位址，不寫死 | 桌面版可改成內建 sidecar 的本機埠 |
| 前端不使用任何 Node 專屬 API | 同一份 `web/dist` 可直接被 Tauri / Electron 載入 |
| 中樞是零相依的單檔 Node 程式（`server/index.mjs`） | 可用 Node SEA / `bun build --compile` 打包成單一執行檔當 sidecar |
| 使用者偏好只放 `localStorage`，且讀寫都包 try/catch | 桌面 WebView 也能用；之後可換成 Tauri store |
| 所有資產用相對路徑 | `file://` / `tauri://` 協定下也能載入 |
| 事件持久化在 `data/events.jsonl` | 桌面版改放到 OS 的 app data 目錄即可 |

## 建議方案：Tauri 2

| 項目 | Tauri 2 | Electron |
|---|---|---|
| 安裝包大小 | ~10 MB | ~100 MB+ |
| 記憶體 | 低（系統 WebView） | 高（內建 Chromium） |
| WebGL / WebGPU 一致性 | 依系統 WebView（macOS WebKit、Windows WebView2） | Chromium 一致 |
| 中樞 sidecar | `externalBin` 內建支援 | `child_process` |

**預設選 Tauri 2**；若遇到 macOS WebKit 的 WebGL 效能或後處理相容性問題，再退回 Electron。兩者都直接吃 `web/dist`。

## 遷移步驟

1. `npm create tauri-app` 於 `desktop/`，以 [`desktop/tauri.conf.example.json`](../desktop/tauri.conf.example.json) 為範本。
2. 將 `server/index.mjs` 打包成單一執行檔放到 `desktop/binaries/diorama-hub-<target-triple>`，於 Tauri 啟動時以 sidecar 啟動。
3. 前端在桌面環境下把 hub 位址指向 sidecar（`VITE_DIORAMA_HUB=http://127.0.0.1:4319`）。
4. 桌面版專屬功能（以 Tauri 外掛實作，網頁版自動略過）：
   - 系統通知：agent 請示時推播
   - 系統匣常駐、開機啟動
   - 透明置頂的「禪模式」小視窗（第二螢幕水族箱）
   - 一鍵安裝 Claude Code hooks（呼叫 `adapters/claude-code/install.mjs`）
5. 簽章與自動更新：macOS notarization、Windows code signing、Tauri updater。

## 待決事項

- [ ] 目標作業系統優先順序（macOS / Windows / Linux）
- [ ] 是否需要離線字型（目前 Noto Serif TC 由 Google Fonts 載入）
- [ ] 桌面版是否允許多個工作區同時開啟
