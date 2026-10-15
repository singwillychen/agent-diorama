# Adapters：把各家 agent 接進 Agent Diorama

場景只認 [ADEP 事件協定](../docs/06-integration-protocol.md)，所以接入任何 agent 都只有一件事要做：在 agent 的生命週期裡送出事件。

| Adapter | 狀態 | 接法 |
|---|---|---|
| **Claude Code**（本體） | ✅ MVP 可用 | 用 Claude Code hooks，零程式碼改動 → [`claude-code/`](claude-code/) |
| **Claude Agent SDK** | ⏳ 下一步 | SDK 本身支援 hooks，計畫沿用同一份事件對應表；在那之前可用通用 client 自行送事件（尚未實測） |
| **ChatGPT / OpenAI Agents SDK** | ⏳ 規劃中 | Tracing processor：把 agent / tool / handoff span 轉成 ADEP 事件 |
| **MiniMax** | ⏳ 規劃中 | 包住模型呼叫與工具迴圈，用通用 client 送事件 |
| **Hermes Agent（Nous Research）** | ⏳ 規劃中 | Python 版通用 client 掛在 agent 迴圈與工具呼叫處 |
| 任何語言 | ✅ | `POST /v1/events`，或用 [`clients/`](clients/) 裡的 Python / JS 小型 client |

---

## Claude Code（MVP）

一個 hook script（[`diorama-hook.mjs`](claude-code/diorama-hook.mjs)）會收到 Claude Code 的 hook 事件並轉成 ADEP：

| Claude Code hook | → ADEP 事件 | 場景表現（修仙） |
|---|---|---|
| `SessionStart` | `agent.registered` | 掌門自傳送陣降臨 |
| `UserPromptSubmit` | `task.created` + `task.assigned` + `llm.started` | 宗主下令，掌門入定參悟 |
| `PreToolUse` | `tool.called`（Grep→grep、Edit→edit…） | 掐訣施法 |
| `PreToolUse(Task/Agent)` | `message.sent`（廣播） | 千里傳音召喚弟子 |
| `PostToolUse` | `tool.finished` / `tool.failed` | 收功／走火入魔 |
| `PermissionRequest` / 權限 `Notification` | `approval.requested` | 跪地請示宗主 |
| `SubagentStart` / `SubagentStop` | 子 agent 入場 / 回報後離場 | 弟子降臨 / 傳送離去 |
| `PreCompact` | `say` | 「神識將滿，整理記憶…」 |
| `Stop` | `task.completed` + `llm.finished` | 突破光柱 |
| `SessionEnd` | `agent.unregistered` | 全員離場 |

子 agent 內觸發的 hook 若帶有 `agent_id` / `agent_type`，會被畫成獨立角色，`Explore` → 守閣長老（researcher）、`Plan` → 執法長老（planner）等。

### 安裝

```bash
# 1. 啟動事件中樞與畫面
npm run dev

# 2a. 只對這個專案生效（寫入 ./.claude/settings.local.json）
node adapters/claude-code/install.mjs

# 2b. 或對所有專案生效（寫入 ~/.claude/settings.json）
node adapters/claude-code/install.mjs --global

# 移除
node adapters/claude-code/install.mjs --remove
```

安裝後新開的 Claude Code session 就會出現在山門中。

安裝時可直接指定身分（會寫進 hook 指令）：

```bash
node adapters/claude-code/install.mjs --name 雲崖子 --role orchestrator --id my-claude
```

`--id` 讓主角色每次都用同一個 ID，畫面上的自訂名稱與統計才會跨 session 保留。同時開多個 Claude Code session 時，請不要共用同一個 ID。

環境變數：

| 變數 | 預設 | 用途 |
|---|---|---|
| `DIORAMA_HUB` | `http://127.0.0.1:4319` | 事件中樞位址 |
| `DIORAMA_NAME` | `Claude xxxx` | 主角色顯示名稱 |
| `DIORAMA_ROLE` | `orchestrator` | 主角色職能 |
| `DIORAMA_PRIVACY` | `public` | 設為 `redacted` 則不送出 prompt、指令、路徑內容 |
| `DIORAMA_AGENT_ID` | `cc-<session>` | 固定的主角色 ID |
| `DIORAMA_TOKEN` | — | 中樞以 `DIORAMA_TOKEN` 啟動時需要 |

hook 永遠以 exit 0 結束、不輸出任何東西、網路逾時 0.8 秒，所以中樞沒開也不會影響 Claude Code。

---

## ChatGPT / MiniMax / Hermes 的接入規劃

三者共通做法：**在 agent 的「開始思考 / 呼叫工具 / 工具結束 / 傳訊 / 完成」五個位置各送一個事件**。差別只在掛勾點：

### ChatGPT（OpenAI Agents SDK）
- 實作一個 tracing processor，監聽 agent、generation、function（tool）、handoff 等 span 的開始與結束。
- 對應：generation 開始 → `llm.started`；function span → `tool.called` / `tool.finished`；handoff → `message.sent` + 目標 agent 的 `task.assigned`。
- `usage` → `cost.updated`。
- 角色預設 `vendor: "openai"`，名牌與名冊以綠色標示。

### MiniMax
- 用 MiniMax API 自建 agent 迴圈時，直接在迴圈裡呼叫 [`clients/`](clients/) 的 `thinking()`、`tool()`、`toolDone()`、`done()`。
- 若透過 OpenAI 相容端點搭配其他框架，就沿用該框架的 adapter，只把 `vendor` 設成 `"minimax"`。

### Hermes Agent（Nous Research）
- Python 專案，直接 `from diorama_client import Diorama`。
- 在工具執行包裝層與主迴圈的每一輪送事件；子 agent 以 `parent` 欄位指向主 agent，就會畫成「外門弟子」。
- `vendor: "nous"`，名牌以紫色標示。

> 實作這三個 adapter 前，會先對照各框架最新文件確認 hook / callback 的實際名稱，不憑記憶寫 API。

---

## 自訂 agent 最小範例

```bash
curl -X POST http://127.0.0.1:4319/v1/events \
  -H 'content-type: application/json' \
  -d '{"type":"agent.registered","agent":"me","data":{"id":"me","name":"散修","role":"builder","vendor":"local"}}'
```
