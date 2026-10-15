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

## 已決定（2026-10-15）

- [x] 平台：先做網頁平台版，保留轉桌面版的設定文件 → [10-desktop-migration.md](10-desktop-migration.md)
- [x] 規模：同時最多 10 個 agent（不需要 LOD 與樓層擴充，MVP 全部以完整細節呈現）
- [x] 3D 素材：先由 Claude 以程式生成 → [11-3d-assets.md](11-3d-assets.md)
- [x] 第一個場景：修仙山門
- [x] Adapter 順序：Claude（MVP）→ ChatGPT → MiniMax / Hermes Agent
- [x] GitHub：公開 repo

## 目前進度

- [x] P0 協定、事件中樞、示範劇本
- [x] P1 修仙山門場景、60° 鏡頭、狀態動畫、文字泡泡、6 個面板
- [x] Claude Code adapter
- [ ] ChatGPT / MiniMax / Hermes adapter
- [ ] CIC、新創辦公室 3D 場景
- [ ] 回放時間軸、音效

## 待決事項

- [ ] 授權條款（MIT / Apache-2.0 / 其他）
