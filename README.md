# Agent Diorama（代理人微縮劇場）

一套 **可切換主題的 Multi-Agent 模擬工作環境**：把你的 AI agents 依職位放進 3D 微縮場景中，以 60° 俯角透視觀看他們工作、溝通，並透過可自選的 Mod 面板掌握系統狀態。

> 目前階段：**MVP**：網頁平台版、修仙山門場景、Claude Code 接入。

## 快速開始

```bash
npm install
npm run dev          # 啟動事件中樞 (http://127.0.0.1:4319) + 畫面 (http://localhost:5173)
```

- 沒有任何 agent 連進來時，畫面會自動播放 **內建示範**（7 位 Claude 弟子協作修 bug），也可以用 `?demo=1` 強制開啟。
- 想把示範事件送進中樞（例如測試多個視窗同時觀看）：`npm run sim`。
- **讓你自己的 Claude Code 出現在山門中**：`node adapters/claude-code/install.mjs`，詳見 [adapters/README.md](adapters/README.md)。

| 操作 | 方式 |
|---|---|
| 旋轉、平移、縮放 | 左鍵拖曳、右鍵拖曳、滾輪（俯角鎖定在 60° 左右，水平旋轉 ±30°） |
| 跟隨某個 agent | 點擊角色或名冊中的名字 |
| 核准 / 駁回請示 | 「請示宗主」面板的「准 / 駁」 |
| 切換面板、泡泡種類、熱鬧度、展示模式 | 右上「模組」選單 |
| 版面預設 | 指揮官 / 除錯 / 老闆 / 禪 |

## 專案結構

```
server/        零相依的 Node 事件中樞（HTTP 寫入、SSE 推送、指令佇列、JSONL 存檔）
web/           React Three Fiber 前端（場景、角色、泡泡引擎、Mod 面板）
adapters/      各家 agent 接入：claude-code（MVP）、通用 Python / JS client
sim/           示範劇本（網頁示範與 npm run sim 共用）
themes/        主題設定與台詞（資料驅動，改設定即可微調）
spec/          ADEP 事件協定、Agent Manifest、Theme 的 JSON Schema
desktop/       桌面版（Tauri）設定範本
docs/          設計文件
```

## 三個預設場景

| 場景 | 角色服裝 | 氛圍 | 狀態 |
|---|---|---|---|
| ⛰️ 修仙山門（參考《凡人修仙傳》氛圍） | 仙風道骨道袍 | 雲海、仙氣、宗門 | ✅ 3D 已實作 |
| ⚓ CIC 戰情中心 | 軍服、耳麥、肩章 | 昏暗、戰術、紀律 | 設定檔完成，3D 待做 |
| 💻 新創公司辦公室 | 休閒上班族 | 明亮、開放、輕鬆 | 設定檔完成，3D 待做 |

## Agent 接入

| Agent | 狀態 |
|---|---|
| Claude（Claude Code hooks） | ✅ MVP |
| ChatGPT、MiniMax、Hermes Agent | ⏳ 已規劃，見 [adapters/README.md](adapters/README.md) |

畫風：**寫實材質 + 3–4 頭身 Q 版比例**（「公仔實拍感」），角色全身呈現。

## 設計文件

| # | 文件 | 內容 |
|---|---|---|
| 01 | [願景與視覺規格](docs/01-vision.md) | 設計原則、鏡頭、畫風、角色系統 |
| 02 | [角色與狀態](docs/02-roles-and-states.md) | 通用職能分類、跨場景映射、狀態語言 |
| 03 | [三大場景](docs/03-scenes.md) | CIC／辦公室／修仙山門詳細設計 |
| 04 | [對話文字泡泡](docs/04-speech-bubbles.md) | 事件驅動泡泡、閒置台詞、密度與優先序 |
| 05 | [Mod 面板系統](docs/05-mod-panels.md) | 面板清單、換皮、版面預設 |
| 06 | [開放接入協定](docs/06-integration-protocol.md) | 事件協定、Adapter、雙向控制 |
| 07 | [擴充與微調彈性](docs/07-extensibility.md) | 資料驅動、覆寫層級、場景/角色 SDK |
| 08 | [延伸構想](docs/08-extra-ideas.md) | 回放、化身、迴圈偵測、隱私等 |
| 09 | [實作路線圖](docs/09-roadmap.md) | 分階段計畫與待決事項 |
| 10 | [轉往桌面版](docs/10-desktop-migration.md) | 現在遵守的約定、Tauri 遷移步驟 |
| 11 | [3D 素材策略](docs/11-3d-assets.md) | 程式生成 → 專業模型的替換路線 |

## 規格與範例設定

```
spec/
  event-protocol.schema.json   # 事件協定 JSON Schema
  agent-manifest.schema.json   # Agent 入職描述 Schema
  theme.schema.json            # 場景主題 Schema
examples/
  agent-manifest.example.json
  events.example.jsonl
themes/
  _base/                       # 所有主題共用的預設值
  cic/  startup-office/  xianxia/
    theme.json                 # 角色映射、區域、狀態視覺、面板皮膚 token
    bubbles.zh-TW.json         # 對話泡泡台詞池
```

## 核心原則

1. **事件驅動，不演戲**：工作動畫必對應真實事件；閒置台詞在視覺上與工作泡泡明確區分。
2. **一份資料，三種皮**：同一事件流可在任何主題呈現；同一 agent 跨主題保有相同臉孔。
3. **框架中立**：Claude、OpenAI、LangGraph、CrewAI、AutoGen 或自製 agent 皆可透過協定接入。
4. **資料驅動、可覆寫**：場景、角色、台詞、面板外觀皆以設定檔定義，微調不需改程式。
