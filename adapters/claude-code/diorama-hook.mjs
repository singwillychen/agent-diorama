#!/usr/bin/env node
// Claude Code → Agent Diorama adapter.
// Registered as a command hook for Claude Code hook events; reads the hook
// payload from stdin and posts ADEP events to the hub. It never blocks or
// fails Claude: no stdout, always exit 0, short network timeout.
//
// Env:
//   DIORAMA_HUB       hub URL (default http://127.0.0.1:4319)
//   DIORAMA_NAME      display name for the main agent (default 「Claude」)
//   DIORAMA_ROLE      role for the main agent (default orchestrator)
//   DIORAMA_PRIVACY   "redacted" to hide prompts / commands / paths in bubbles
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HUB = process.env.DIORAMA_HUB || "http://127.0.0.1:4319";
const PRIVACY = process.env.DIORAMA_PRIVACY === "redacted" ? "redacted" : "public";
const STATE_DIR = path.join(os.tmpdir(), "agent-diorama-claude-code");

const SUBAGENT_ROLES = {
  explore: "researcher",
  plan: "planner",
  "general-purpose": "builder",
  "code-reviewer": "reviewer",
  reviewer: "reviewer",
  "statusline-setup": "builder",
  "claude-code-guide": "researcher",
};

const TOOL_NAMES = {
  Read: "read", Grep: "grep", Glob: "grep", LS: "read",
  Edit: "edit", MultiEdit: "edit", Write: "edit", NotebookEdit: "edit",
  Bash: "bash", BashOutput: "bash",
  WebSearch: "web_search", WebFetch: "web_fetch",
  TodoWrite: "todo",
};

function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}

function short(text, n = 48) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function loadState(sessionId) {
  try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${sessionId}.json`), "utf8")); }
  catch { return { registered: {}, turn: 0 }; }
}
function saveState(sessionId, st) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(STATE_DIR, `${sessionId}.json`), JSON.stringify(st));
  } catch { /* best effort */ }
}

function toolArgs(name, input = {}) {
  if (PRIVACY === "redacted") return {};
  switch (name) {
    case "Read": case "Edit": case "MultiEdit": case "Write": case "NotebookEdit":
      return { path: input.file_path || input.notebook_path };
    case "Grep": return { pattern: short(input.pattern, 30) };
    case "Glob": return { pattern: short(input.pattern, 30) };
    case "Bash": return { command: short(input.command, 40) };
    case "WebSearch": return { query: short(input.query, 30) };
    case "WebFetch": return { url: input.url ? new URL(input.url).hostname : undefined };
    default: return {};
  }
}

async function post(events) {
  if (!events.length) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 800);
  try {
    await fetch(`${HUB}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(events),
      signal: ctrl.signal,
    });
  } catch { /* hub not running — ignore */ }
  clearTimeout(timer);
}

async function main() {
  const raw = readStdin();
  let p;
  try { p = JSON.parse(raw); } catch { return; }
  const ev = p.hook_event_name;
  const sid = String(p.session_id || "unknown");
  const st = loadState(sid);
  const main = `cc-${sid.slice(0, 8)}`;
  // Hooks fired inside a subagent carry its id (newer Claude Code versions).
  const actor = p.agent_id ? `cc-${sid.slice(0, 8)}-${String(p.agent_id).slice(0, 8)}` : main;
  const out = [];
  const emit = (type, agent, data, extra = {}) => out.push({ v: "0.1", type, agent, session: sid, data, visibility: PRIVACY, ts: new Date().toISOString(), ...extra });

  const ensureMain = () => {
    if (st.registered[main]) return;
    st.registered[main] = true;
    emit("agent.registered", main, {
      id: main,
      name: process.env.DIORAMA_NAME || `Claude ${sid.slice(0, 4)}`,
      role: process.env.DIORAMA_ROLE || "orchestrator",
      rank: 8,
      vendor: "anthropic",
      model: p.model || process.env.ANTHROPIC_MODEL || "claude",
      framework: "claude-code",
      persona: { chattiness: 0.4 },
      appearance: { beard: true, hairColor: "#d9d4cc" },
      capabilities: [],
    });
  };
  const ensureSub = (id, type) => {
    if (st.registered[id]) return;
    st.registered[id] = true;
    const role = SUBAGENT_ROLES[String(type || "").toLowerCase()] || "subagent";
    emit("agent.registered", id, {
      id, name: type ? `${type}` : "Subagent", role, rank: 4,
      vendor: "anthropic", framework: "claude-code", parent: main,
    });
  };

  ensureMain();
  if (actor !== main) ensureSub(actor, p.agent_type);

  switch (ev) {
    case "SessionStart":
      emit("say", main, {}, { utterance: p.source === "resume" ? "繼續上次的修行。" : "開關修行。" });
      break;
    case "UserPromptSubmit": {
      st.turn += 1;
      const task = `${main}-t${st.turn}`;
      const title = PRIVACY === "redacted" ? `第 ${st.turn} 道指令` : short(p.prompt, 28) || `第 ${st.turn} 道指令`;
      st.task = task;
      emit("task.created", "human", { task, title });
      emit("task.assigned", "human", { task, to: main, title });
      emit("llm.started", main, {});
      break;
    }
    case "PreToolUse": {
      const name = p.tool_name || "tool";
      if (name === "Task" || name === "Agent") {
        const type = p.tool_input?.subagent_type || "general-purpose";
        emit("message.sent", actor, { to: "*", text: short(p.tool_input?.description || `召喚 ${type}`, 24) });
        break;
      }
      if (name === "AskUserQuestion") {
        emit("input.requested", actor, { prompt: short(p.tool_input?.questions?.[0]?.question, 30) });
        break;
      }
      emit("tool.called", actor, { tool: TOOL_NAMES[name] || name.replace(/^mcp__/, "").toLowerCase(), args: toolArgs(name, p.tool_input), toolUseId: p.tool_use_id });
      break;
    }
    case "PostToolUse": {
      const name = p.tool_name || "tool";
      if (name === "Task" || name === "Agent") break;
      const resp = p.tool_response;
      const failed = resp && typeof resp === "object" && (resp.is_error || resp.error || (typeof resp.exit_code === "number" && resp.exit_code !== 0));
      if (failed) emit("tool.failed", actor, { tool: TOOL_NAMES[name] || name, error: short(resp.error || "failed", 30) });
      else emit("tool.finished", actor, { tool: TOOL_NAMES[name] || name });
      break;
    }
    case "PermissionRequest":
    case "Notification": {
      const msg = p.message || "";
      if (ev === "PermissionRequest" || /permission/i.test(msg)) {
        const req = `${actor}-perm-${Date.now()}`;
        st.pendingPerm = req;
        emit("approval.requested", actor, { request: req, summary: PRIVACY === "redacted" ? "需要權限" : short(msg || p.tool_name, 36) });
      } else if (/waiting for your input|idle/i.test(msg)) {
        emit("agent.state_changed", main, { state: "idle" });
      }
      break;
    }
    case "SubagentStart":
      ensureSub(actor, p.agent_type);
      emit("llm.started", actor, {});
      break;
    case "SubagentStop":
      emit("message.sent", actor, { to: main, text: "回報完畢。" });
      emit("agent.unregistered", actor, {});
      delete st.registered[actor];
      break;
    case "PreCompact":
      emit("say", main, {}, { utterance: "神識將滿，整理記憶…" });
      break;
    case "Stop":
      if (st.pendingPerm) { emit("approval.resolved", "human", { request: st.pendingPerm, decision: "approve" }); st.pendingPerm = undefined; }
      if (st.task) emit("task.completed", main, { task: st.task });
      emit("llm.finished", main, {});
      st.task = undefined;
      break;
    case "SessionEnd":
      for (const id of Object.keys(st.registered)) emit("agent.unregistered", id, {});
      st.registered = {};
      break;
    default:
      break;
  }

  // Any tool activity after a permission prompt means it was granted.
  if (st.pendingPerm && (ev === "PostToolUse")) {
    emit("approval.resolved", "human", { request: st.pendingPerm, decision: "approve" });
    st.pendingPerm = undefined;
  }

  saveState(sid, st);
  await post(out);
}

main().finally(() => process.exit(0));
