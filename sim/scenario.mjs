// Demo scenario: a Claude-powered sect (team) working through tasks.
// Shared by the in-browser demo mode and `npm run sim` (which posts to the hub).
// Every function only *emits ADEP events*; nothing here is scene-specific.

export const DEMO_AGENTS = [
  { id: "claude-sect-master", name: "雲崖子", role: "orchestrator", rank: 8, vendor: "anthropic", model: "claude-opus-5-5", framework: "claude-agent-sdk",
    persona: { voice: "沉穩", chattiness: 0.4, catchphrases: ["諸位，依計行事。"] },
    appearance: { hairColor: "#d9d4cc", robe: "#f2efe6", accent: "#c9a23a", beard: true } },
  { id: "claude-elder-law", name: "玄衡", role: "planner", rank: 7, vendor: "anthropic", model: "claude-opus-5-5", framework: "claude-agent-sdk", parent: "claude-sect-master",
    persona: { voice: "嚴謹", chattiness: 0.3 },
    appearance: { hairColor: "#2a2420", robe: "#4b3f6b", accent: "#9b87d6" } },
  { id: "claude-librarian", name: "墨蘊", role: "researcher", rank: 6, vendor: "anthropic", model: "claude-sonnet-5-5", framework: "claude-agent-sdk", parent: "claude-sect-master",
    persona: { voice: "溫和", chattiness: 0.6 },
    appearance: { hairColor: "#1c1c22", robe: "#3d6f8f", accent: "#9fd0e8", female: true } },
  { id: "claude-alchemist-1", name: "赤炎", role: "builder", rank: 5, vendor: "anthropic", model: "claude-sonnet-5-5", framework: "claude-agent-sdk", parent: "claude-sect-master",
    persona: { voice: "熱血", chattiness: 0.8, catchphrases: ["交給我！", "這爐丹穩了。"] },
    appearance: { hairColor: "#3a1e14", robe: "#9e3b2e", accent: "#f0b45a" } },
  { id: "claude-alchemist-2", name: "青嵐", role: "builder", rank: 4, vendor: "anthropic", model: "claude-sonnet-5-5", framework: "claude-agent-sdk", parent: "claude-sect-master",
    persona: { voice: "冷靜", chattiness: 0.5 },
    appearance: { hairColor: "#20262a", robe: "#3f7d6e", accent: "#bfe3c9", female: true } },
  { id: "claude-discipline", name: "鐵律", role: "reviewer", rank: 6, vendor: "anthropic", model: "claude-opus-5-5", framework: "claude-agent-sdk", parent: "claude-sect-master",
    persona: { voice: "毒舌", chattiness: 0.5, catchphrases: ["這裡有破綻。"] },
    appearance: { hairColor: "#555", robe: "#4a4f57", accent: "#c0c6cf" } },
  { id: "claude-formation", name: "陣玄", role: "monitor", rank: 5, vendor: "anthropic", model: "claude-haiku-5-5", framework: "claude-agent-sdk", parent: "claude-sect-master",
    persona: { voice: "淡定", chattiness: 0.4 },
    appearance: { hairColor: "#2b2b2b", robe: "#2f6b72", accent: "#7fd6d0" } },
];

const TASKS = [
  { title: "修復登入逾時", files: ["src/auth/session.ts", "config/session.yaml"], query: "session timeout best practice" },
  { title: "新增匯出 CSV 功能", files: ["src/export/csv.ts", "src/routes/report.ts"], query: "csv streaming node" },
  { title: "優化首頁載入速度", files: ["web/src/pages/home.tsx", "web/vite.config.ts"], query: "lcp optimization react" },
  { title: "撰寫 API 文件", files: ["docs/api.md", "src/routes/index.ts"], query: "openapi 3.1 examples" },
  { title: "升級資料庫驅動", files: ["package.json", "src/db/pool.ts"], query: "pg driver migration" },
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[Math.floor(Math.random() * l.length)];

/**
 * @param {{ emit:(e:object)=>void, sleep:(ms:number)=>Promise<void>, waitApproval:(id:string, ms:number)=>Promise<"approve"|"reject"|"timeout">, speed?:number, signal?:{stopped:boolean} }} io
 */
export async function runScenario(io) {
  const { emit, signal = { stopped: false } } = io;
  const speed = io.speed ?? 1;
  const sleep = (ms) => io.sleep(ms / speed);
  const [master, planner, librarian, a1, a2, reviewer, monitor] = DEMO_AGENTS.map((a) => a.id);
  let taskSeq = 0;
  let reqSeq = 0;
  let subSeq = 0;

  const cost = (agent, k = 1) =>
    emit({ type: "cost.updated", agent, data: { usd: +(rand(0.004, 0.03) * k).toFixed(4), tokensIn: Math.round(rand(2000, 14000) * k), tokensOut: Math.round(rand(200, 1500) * k) } });
  const ctxUse = { };
  const context = (agent, grow) => {
    ctxUse[agent] = Math.min(0.97, (ctxUse[agent] ?? 0.08) + grow);
    emit({ type: "context.updated", agent, data: { used: Math.round(ctxUse[agent] * 200000), max: 200000 } });
  };
  const tool = async (agent, name, args, ms = rand(1500, 3500), fail = false) => {
    emit({ type: "tool.called", agent, data: { tool: name, args } });
    await sleep(ms);
    if (fail) {
      emit({ type: "tool.failed", agent, data: { tool: name, error: "exit code 1" } });
      return false;
    }
    emit({ type: "tool.finished", agent, data: { tool: name, durationMs: Math.round(ms) } });
    cost(agent, 0.5);
    context(agent, 0.03);
    return true;
  };
  const think = async (agent, ms = rand(1500, 3000)) => {
    emit({ type: "llm.started", agent });
    await sleep(ms);
    cost(agent);
  };

  for (const a of DEMO_AGENTS) {
    emit({ type: "agent.registered", agent: a.id, data: a });
    await sleep(500);
  }
  await sleep(2500);

  while (!signal.stopped) {
    const spec = TASKS[taskSeq % TASKS.length];
    const task = `t${++taskSeq}`;
    const builder = taskSeq % 2 ? a1 : a2;

    // 1) The sect master opens a task and convenes the planner.
    await think(master, 2000);
    emit({ type: "task.created", agent: master, data: { task, title: spec.title } });
    emit({ type: "message.sent", agent: master, data: { to: planner, text: `「${spec.title}」，擬個章程。` } });
    emit({ type: "llm.finished", agent: master });
    await sleep(1500);

    // 2) Planner and librarian investigate in parallel.
    await think(planner, 2500);
    emit({ type: "message.sent", agent: planner, data: { to: librarian, text: `查一下${spec.files[0]}的來龍去脈` } });
    emit({ type: "llm.finished", agent: planner });

    const research = (async () => {
      await think(librarian, 1500);
      await tool(librarian, "grep", { pattern: spec.files[0].split("/").pop().split(".")[0] });
      await tool(librarian, "read", { path: spec.files[0] });
      emit({ type: "memory.read", agent: librarian, data: { key: spec.title } });
      await tool(librarian, "web_search", { query: spec.query }, rand(2500, 4000));
      emit({ type: "message.sent", agent: librarian, data: { to: planner, text: "查到了，關鍵在設定檔。" } });
      emit({ type: "llm.finished", agent: librarian });
    })();
    await research;
    if (signal.stopped) return;

    // 3) Assignment.
    await think(planner, 1500);
    emit({ type: "task.assigned", agent: planner, data: { task, to: builder, title: spec.title } });
    emit({ type: "llm.finished", agent: planner });

    // 4) Builder works; may spawn a subagent (outer disciple) for a side errand.
    await think(builder, 2000);
    let sub;
    if (taskSeq % 2 === 0 && DEMO_AGENTS.length + subSeq < 10) {
      sub = `claude-disciple-${++subSeq}`;
      emit({ type: "agent.registered", agent: sub, data: { id: sub, name: `外門弟子${"甲乙丙丁戊"[subSeq % 5]}`, role: "subagent", rank: 2, vendor: "anthropic", model: "claude-haiku-5-5", framework: "claude-agent-sdk", parent: builder, persona: { chattiness: 0.9 } } });
      emit({ type: "message.sent", agent: builder, data: { to: sub, text: "幫我跑一下測試" } });
      (async () => {
        await sleep(2500);
        await think(sub, 1200);
        await tool(sub, "bash", { command: "npm test" }, rand(4000, 6000));
        emit({ type: "message.sent", agent: sub, data: { to: builder, text: "師兄，測試全過！" } });
        emit({ type: "llm.finished", agent: sub });
        await sleep(3000);
        emit({ type: "agent.unregistered", agent: sub });
      })();
    }
    await tool(builder, "read", { path: spec.files[0] });
    await tool(builder, "edit", { path: spec.files[0] }, rand(3000, 5000));
    const failed = Math.random() < 0.35;
    const ok = await tool(builder, "bash", { command: "npm run build" }, rand(3000, 4500), failed);
    if (!ok) {
      await sleep(2500);
      emit({ type: "custom.retry", agent: builder, utterance: "再閉關一次…" });
      await think(builder, 2000);
      await tool(builder, "edit", { path: spec.files[1] }, 2500);
      await tool(builder, "bash", { command: "npm run build" }, 3000);
    }

    // 5) Something risky needs the human's approval.
    if (taskSeq % 2 === 1) {
      const req = `a${Date.now().toString(36)}-${++reqSeq}`;
      emit({ type: "approval.requested", agent: builder, data: { request: req, summary: `修改 ${spec.files[1]}` } });
      const decision = await io.waitApproval(req, 30000 / speed);
      if (decision === "timeout") emit({ type: "approval.resolved", agent: "human", data: { request: req, decision: "approve", auto: true } });
      if (decision === "reject") {
        emit({ type: "task.failed", agent: builder, data: { task } });
        await sleep(4000);
        emit({ type: "llm.finished", agent: builder });
        continue;
      }
      await tool(builder, "edit", { path: spec.files[1] }, 2500);
    }
    emit({ type: "message.sent", agent: builder, data: { to: reviewer, text: "請長老過目。" } });
    emit({ type: "llm.finished", agent: builder });

    // 6) Review, monitoring, completion.
    await think(reviewer, 2500);
    await tool(reviewer, "read", { path: spec.files[0] });
    if (Math.random() < 0.3) {
      emit({ type: "message.sent", agent: reviewer, data: { to: builder, text: "邊界條件沒處理。" } });
      emit({ type: "llm.finished", agent: reviewer });
      await think(builder, 1500);
      await tool(builder, "edit", { path: spec.files[0] }, 2500);
      emit({ type: "llm.finished", agent: builder });
    }
    emit({ type: "message.sent", agent: reviewer, data: { to: master, text: `「${spec.title}」審畢，可行。` } });
    emit({ type: "llm.finished", agent: reviewer });

    await think(monitor, 1200);
    await tool(monitor, "bash", { command: "check health" }, 2000);
    emit({ type: "llm.finished", agent: monitor });

    emit({ type: "task.completed", agent: builder, data: { task }, utterance: `「${spec.title}」煉成！` });
    emit({ type: "artifact.created", agent: builder, data: { name: spec.files[0] } });
    emit({ type: "memory.written", agent: librarian, data: { key: spec.title } });
    await sleep(1000);
    emit({ type: "message.sent", agent: master, data: { to: "*", text: "諸位辛苦，稍作歇息。" } });

    // 7) Idle break so idle chatter has room to appear.
    await sleep(rand(12000, 20000));
  }
}

export function pickRandom(list) { return pick(list); }
