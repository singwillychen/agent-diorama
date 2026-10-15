# 09 · 實作路線圖

| 階段 | 內容 | 完成定義 |
|---|---|---|
| **P0 協定先行** | ADEP 事件協定、Agent Manifest、Theme Schema；模擬事件產生器；Claude Agent SDK adapter | 能用 JSONL 劇本驅動一個最簡 2D 預覽 |
| **P1 單場景 MVP** | 新創辦公室場景（素材最易取得）、60° 鏡頭、狀態動畫、文字泡泡系統、4 個核心面板 | 真實 Claude agent 團隊可在場景中被觀看 |
| **P2 角色系統** | 模組化 Q 版角色、換裝、表情、跨主題身分 | 同一 agent 換主題保留臉孔 |
| **P3 擴充場景** | CIC、修仙山門；面板換皮；音效 | 三主題一鍵切換 |
| **P4 開放生態** | 其他框架 adapter、OTel 接入、主題繼承與 SDK、回放與精華 | 第三方可發布自己的主題與面板 |

## 建議技術選型

| 層 | 選型 | 理由 |
|---|---|---|
| 渲染 | React Three Fiber（Three.js） | 網頁可嵌入、與面板 UI 同一技術棧 |
| UI / 面板 | React + 可拖曳格線版面 | 外掛化容易 |
| 狀態 | Zustand / 事件溯源 | 天然支援回放 |
| 事件中樞 | TypeScript（Node）或 Python | 兩者皆有成熟 agent SDK |
| 傳輸 | WebSocket + SSE + REST | 推送與寫入兼顧 |
| 設定驗證 | JSON Schema（Ajv） | 跨語言 |
| 3D 資產 | glTF/GLB；AI 生成（Meshy、Tripo）＋人工修整，或外包 | 依精緻度需求 |

## 待決事項

- [ ] 平台：純網頁 or 桌面 App（Tauri / Electron）？
- [ ] 規模：同時 agent 數量（5–10 vs 50+）
- [ ] 3D 素材來源與預算
- [ ] 第一個實作場景
- [ ] 既有 agent 框架（決定第一個 adapter）
- [ ] 授權條款（開源 / 私有）
