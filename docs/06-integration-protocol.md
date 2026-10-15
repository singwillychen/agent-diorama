# 06 · 開放接入協定

場景與面板 **不直接認識任何 agent 框架**，只認 Agent Diorama Event Protocol（ADEP）。任何 agent 系統只要能送出事件，就能被視覺化。

## 架構

```
[Claude Agent SDK] [OpenAI Agents] [LangGraph] [CrewAI] [AutoGen] [自製 / 任意語言]
        └───────────── Adapters / OpenTelemetry GenAI ─────────────┘
                                 ↓
                Agent Diorama Event Protocol（ADEP）
               WebSocket / SSE 推送 · REST 寫入 · JSON Schema
                                 ↓
               World State Engine（狀態機、存檔、回放）
                    ↙                           ↘
            3D 場景渲染器                    Mod 面板層
                    ↖────── Commands（暫停／核准／指派／中止）──────↗
```

## 接入方式

1. **SDK Adapter**：各框架的小型 hook／callback，自動轉譯成 ADEP 事件。
2. **OpenTelemetry**：吃 GenAI semantic conventions 的 trace／span，轉成 ADEP。已有 OTel 的系統幾乎零改動。
3. **直接 HTTP**：`POST /v1/events`（JSON 或 JSONL 批次）——任何語言皆可。
4. **MCP / A2A**：提供 MCP server（讓 agent 自己回報狀態、說一句話 `utterance`），並可監聽 A2A 訊息。

## 事件信封

```json
{
  "v": "0.1",
  "id": "evt_01J…",
  "ts": "2026-10-15T12:00:00.000Z",
  "type": "tool.called",
  "agent": "agent_builder_1",
  "session": "sess_abc",
  "data": { "tool": "grep", "args": { "pattern": "auth" } },
  "utterance": "我來找找登入邏輯在哪"
}
```

完整定義：[`spec/event-protocol.schema.json`](../spec/event-protocol.schema.json)

## 事件類型

| 類別 | 事件 |
|---|---|
| 生命週期 | `agent.registered` `agent.updated` `agent.unregistered` `agent.state_changed` |
| 思考 | `llm.started` `llm.finished` |
| 工具 | `tool.called` `tool.finished` `tool.failed` |
| 溝通 | `message.sent` `message.received` `meeting.started` `meeting.ended` |
| 任務 | `task.created` `task.assigned` `task.updated` `task.completed` `task.failed` |
| 資源 | `cost.updated` `context.updated` |
| 人類 | `approval.requested` `approval.resolved` `input.requested` |
| 產出 | `artifact.created` `memory.read` `memory.written` |
| 其他 | `say`（純粹讓角色說一句話）、`custom.*`（自訂擴充） |

未知事件類型會被保留在時間軸，但不觸發動畫（向前相容）。

## 指令（Commands，世界 → agent 系統）

`pause` `resume` `cancel` `approve` `reject` `assign_task` `send_message` `set_budget`

Adapter 可宣告自己支援哪些指令；不支援的按鈕在 UI 中自動停用。

## Agent Manifest

agent「入職」時送出的描述，決定它在場景中的外觀與位置。見 [`spec/agent-manifest.schema.json`](../spec/agent-manifest.schema.json) 與 [`examples/agent-manifest.example.json`](../examples/agent-manifest.example.json)。
