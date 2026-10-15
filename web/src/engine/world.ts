// World state engine: reduces ADEP events into agents / tasks / approvals / timeline.
// Every visual state comes from an event here — the scene never invents work.
import { create } from "zustand";
import type {
  AgentState, AgentView, ApprovalView, DioramaEvent, Flight, TaskView, TimelineEntry,
} from "./types";

const TIMELINE_CAP = 400;
const DONE_MS = 3500;
const SPEAK_MS = 1800;
const ERROR_MS = 4000;
export const LONG_RUNNING_MS = 20000;

export interface WorldState {
  agents: Record<string, AgentView>;
  tasks: Record<string, TaskView>;
  approvals: ApprovalView[];
  timeline: TimelineEntry[];
  flights: Flight[];
  budgetUsd: number;
  totalCostUsd: number;
  selected?: string;
  eventCount: number;
  lastEvent?: DioramaEvent;
  apply: (evt: DioramaEvent) => void;
  select: (id?: string) => void;
  setBudget: (usd: number) => void;
  reset: () => void;
}

/** What the scene should show right now for an agent. */
export function displayState(a: AgentView, now = Date.now()): AgentState {
  if (a.transient && a.transient.until > now) return a.transient.state;
  if (a.state === "tool_call" && now - a.stateSince > LONG_RUNNING_MS) return "long_running";
  return a.state;
}

let agentOrder = 0;

function blankAgent(id: string, now: number, partial: Partial<AgentView> = {}): AgentView {
  return {
    id,
    name: partial.name || id,
    role: partial.role || "builder",
    state: "idle",
    stateSince: now,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    joinedAt: now,
    lastEventAt: now,
    completedStreak: 0,
    order: agentOrder++,
    ...partial,
  };
}

const initial = () => ({
  agents: {} as Record<string, AgentView>,
  tasks: {} as Record<string, TaskView>,
  approvals: [] as ApprovalView[],
  timeline: [] as TimelineEntry[],
  flights: [] as Flight[],
  totalCostUsd: 0,
  eventCount: 0,
  selected: undefined as string | undefined,
  lastEvent: undefined as DioramaEvent | undefined,
});

export const useWorld = create<WorldState>((set, get) => ({
  ...initial(),
  budgetUsd: 5,
  select: (id) => set({ selected: id }),
  setBudget: (usd) => set({ budgetUsd: usd }),
  reset: () => { agentOrder = 0; set(initial()); },
  apply: (evt) => {
    if (evt.type === "custom.reset") { get().reset(); return; }
    const s = get();
    const now = Date.now();
    const agents = { ...s.agents };
    const tasks = { ...s.tasks };
    let approvals = s.approvals;
    let flights = s.flights.filter((f) => now - f.start < 3000);
    let totalCostUsd = s.totalCostUsd;
    const d = evt.data || {};
    const entries: TimelineEntry[] = [];
    const log = (text: string, level: TimelineEntry["level"] = "info", agent = evt.agent) =>
      entries.push({ id: evt.id, at: now, agent, type: evt.type, text, level });

    const ensure = (id?: string): AgentView | undefined => {
      if (!id || id === "human" || id === "system") return undefined;
      if (!agents[id]) agents[id] = blankAgent(id, now);
      agents[id] = { ...agents[id], lastEventAt: now };
      return agents[id];
    };
    const setState = (id: string | undefined, state: AgentState, extra: Partial<AgentView> = {}) => {
      const a = ensure(id);
      if (!a) return;
      agents[a.id] = { ...a, state, stateSince: a.state === state ? a.stateSince : now, transient: undefined, ...extra };
    };
    const flash = (id: string | undefined, state: AgentState, ms: number, base?: AgentState) => {
      const a = ensure(id);
      if (!a) return;
      agents[a.id] = {
        ...a,
        state: base ?? a.state,
        stateSince: base && base !== a.state ? now : a.stateSince,
        transient: { state, until: now + ms },
      };
    };
    const name = (id?: string) => (id && agents[id]?.name) || id || "?";

    switch (evt.type) {
      case "agent.registered":
      case "agent.updated": {
        const m: Record<string, any> = { ...d, id: d.id || evt.agent };
        if (!m.id) break;
        const prev = agents[m.id];
        agents[m.id] = prev ? { ...prev, ...m } : blankAgent(m.id, now, m);
        if (evt.type === "agent.registered" && !prev) log(`${m.name || m.id} 加入`, "good", m.id);
        break;
      }
      case "agent.unregistered":
        if (evt.agent && agents[evt.agent]) {
          log(`${name(evt.agent)} 離開`, "info");
          delete agents[evt.agent];
        }
        break;
      case "agent.state_changed":
        if (d.state) setState(evt.agent, d.state as AgentState);
        break;
      case "llm.started":
        setState(evt.agent, "thinking");
        break;
      case "llm.finished":
        setState(evt.agent, "idle");
        break;
      case "tool.called":
        setState(evt.agent, "tool_call");
        log(`${name(evt.agent)} 使用 ${d.tool ?? "工具"}`, "work");
        break;
      case "tool.finished":
        setState(evt.agent, "thinking");
        break;
      case "tool.failed": {
        const a = ensure(evt.agent);
        if (a) agents[a.id] = { ...a, lastErrorAt: now };
        flash(evt.agent, "error", ERROR_MS, "thinking");
        log(`${name(evt.agent)} 的 ${d.tool ?? "工具"} 失敗：${d.error ?? ""}`, "error");
        break;
      }
      case "message.sent": {
        const to = d.to as string | undefined;
        flash(evt.agent, "speaking", SPEAK_MS);
        if (to && to !== "*") { ensure(to); flash(to, "listening", SPEAK_MS); }
        flights = [...flights, { id: evt.id, from: evt.agent || "", to: to || "*", start: now }];
        log(`${name(evt.agent)} → ${to === "*" || !to ? "全體" : name(to)}：${d.text ?? ""}`, "talk");
        break;
      }
      case "meeting.started":
        for (const p of (d.participants as string[]) || []) setState(p, "meeting");
        log(`議事開始：${d.topic ?? ""}`, "info");
        break;
      case "meeting.ended":
        for (const p of (d.participants as string[]) || []) setState(p, "idle");
        break;
      case "task.created":
        tasks[d.task] = { id: d.task, title: d.title || d.task, status: "open", createdAt: now, updatedAt: now };
        log(`新任務：${d.title ?? d.task}`, "info");
        break;
      case "task.assigned": {
        const t = tasks[d.task] || { id: d.task, title: d.title || d.task, status: "open", createdAt: now, updatedAt: now };
        tasks[d.task] = { ...t, assignee: d.to, status: "assigned", updatedAt: now };
        const a = ensure(d.to);
        if (a) agents[a.id] = { ...a, taskId: d.task };
        flights = [...flights, { id: evt.id, from: evt.agent || "", to: d.to, start: now }];
        flash(evt.agent, "speaking", SPEAK_MS);
        log(`${name(evt.agent)} 指派「${tasks[d.task].title}」給 ${name(d.to)}`, "talk");
        break;
      }
      case "task.updated":
        if (tasks[d.task]) tasks[d.task] = { ...tasks[d.task], status: d.status || "in_progress", updatedAt: now };
        break;
      case "task.completed": {
        if (tasks[d.task]) tasks[d.task] = { ...tasks[d.task], status: "done", updatedAt: now };
        const a = ensure(evt.agent);
        if (a) {
          agents[a.id] = { ...a, taskId: a.taskId === d.task ? undefined : a.taskId, completedStreak: a.completedStreak + 1 };
          flash(evt.agent, "done", DONE_MS, "idle");
        }
        log(`${name(evt.agent)} 完成「${tasks[d.task]?.title ?? d.task}」`, "good");
        break;
      }
      case "task.failed": {
        if (tasks[d.task]) tasks[d.task] = { ...tasks[d.task], status: "failed", updatedAt: now };
        const a = ensure(evt.agent);
        if (a) agents[a.id] = { ...a, completedStreak: 0, lastErrorAt: now };
        setState(evt.agent, "error");
        log(`${name(evt.agent)}「${tasks[d.task]?.title ?? d.task}」失敗`, "error");
        break;
      }
      case "cost.updated": {
        const a = ensure(evt.agent);
        const usd = Number(d.usd || 0);
        totalCostUsd += usd;
        if (a) {
          agents[a.id] = {
            ...a,
            costUsd: a.costUsd + usd,
            tokensIn: a.tokensIn + Number(d.tokensIn || 0),
            tokensOut: a.tokensOut + Number(d.tokensOut || 0),
          };
        }
        break;
      }
      case "context.updated": {
        const a = ensure(evt.agent);
        if (a) agents[a.id] = { ...a, context: { used: Number(d.used || 0), max: Number(d.max || 1) } };
        break;
      }
      case "approval.requested":
        approvals = [...approvals.filter((x) => x.id !== d.request), { id: d.request, agent: evt.agent || "", summary: d.summary || "", at: now }];
        setState(evt.agent, "waiting_human");
        log(`${name(evt.agent)} 請示：${d.summary ?? ""}`, "warn");
        break;
      case "approval.resolved": {
        const req = approvals.find((x) => x.id === d.request);
        approvals = approvals.filter((x) => x.id !== d.request);
        if (req) setState(req.agent, d.decision === "reject" ? "blocked" : "thinking");
        log(`宗主${d.decision === "reject" ? "駁回" : "准許"}：${req?.summary ?? d.request}`, d.decision === "reject" ? "warn" : "good", "human");
        break;
      }
      case "input.requested":
        setState(evt.agent, "waiting_human");
        log(`${name(evt.agent)} 需要輸入：${d.prompt ?? ""}`, "warn");
        break;
      case "artifact.created":
        log(`${name(evt.agent)} 產出 ${d.name ?? "成果"}`, "good");
        break;
      case "memory.read":
      case "memory.written":
        log(`${name(evt.agent)} ${evt.type === "memory.read" ? "查閱" : "寫入"}藏經閣`, "info");
        break;
      case "say":
        ensure(evt.agent);
        break;
      default:
        if (evt.type.startsWith("custom.retry")) {
          const a = ensure(evt.agent);
          if (a) agents[a.id] = { ...a, lastRecoveredAt: now };
          flash(evt.agent, "retrying", 2500, "thinking");
        } else {
          ensure(evt.agent);
        }
    }

    // A recovered agent: thinking/done after a recent error.
    if (evt.agent && agents[evt.agent]) {
      const a = agents[evt.agent];
      if (a.lastErrorAt && !a.lastRecoveredAt && (evt.type === "tool.finished" || evt.type === "task.completed")) {
        agents[a.id] = { ...a, lastRecoveredAt: now };
      }
    }

    set({
      agents,
      tasks,
      approvals,
      flights,
      totalCostUsd,
      timeline: entries.length ? [...s.timeline, ...entries].slice(-TIMELINE_CAP) : s.timeline,
      eventCount: s.eventCount + 1,
      lastEvent: evt,
    });
  },
}));
