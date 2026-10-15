// Built-in mod panels: roster, tasks, approvals, cost, context, timeline, agent details.
import { useEffect, useRef, useState } from "react";
import { displayState, useWorld } from "../engine/world";
import type { AgentView, DioramaEvent } from "../engine/types";
import { sendCommand } from "../net/source";
import { Term } from "../ui/Term";
import { useUi } from "../ui/store";
import { definePanel, type PanelProps } from "./registry";

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

export function formatCost(usd: number, theme: PanelProps["theme"]) {
  const u = theme.theme.costUnit || { label: "USD", perUsd: 1, decimals: 3 };
  const v = usd * u.perUsd;
  return `${v.toLocaleString(undefined, { minimumFractionDigits: u.decimals, maximumFractionDigits: u.decimals })} ${u.label}`;
}

/** Cost with the themed unit, hover shows the professional term. */
export function Cost({ usd, theme }: { usd: number; theme: PanelProps["theme"] }) {
  const mode = useUi((s) => s.termMode);
  const dollars = `$${usd.toFixed(3)}`;
  const text = mode === "pro" ? dollars : mode === "both" ? `${formatCost(usd, theme)}（${dollars}）` : formatCost(usd, theme);
  return <Term id="cost">{text}</Term>;
}

export const VENDOR: Record<string, string> = { anthropic: "Claude", openai: "ChatGPT", minimax: "MiniMax", nous: "Hermes", local: "Local" };

let dispatchRef: (e: DioramaEvent) => void = () => {};
export function setPanelDispatch(fn: (e: DioramaEvent) => void) { dispatchRef = fn; }

/** Inline editable agent name. Empty input restores the registered name. */
export function AgentName({ agent, editing, onDone }: { agent: AgentView; editing: boolean; onDone: () => void }) {
  const rename = useWorld((s) => s.rename);
  const [value, setValue] = useState(agent.name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setValue(agent.name); setTimeout(() => input.current?.select(), 0); } }, [editing, agent.name]);
  if (!editing) return <b title={agent.originalName && agent.originalName !== agent.name ? `原名：${agent.originalName}` : undefined}>{agent.name}</b>;
  const commit = () => { rename(agent.id, value); onDone(); };
  return (
    <input
      ref={input}
      className="name-input"
      value={value}
      maxLength={24}
      placeholder={agent.originalName}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onDone(); }}
      onBlur={commit}
    />
  );
}

function Roster() {
  const agents = useWorld((s) => s.agents);
  const selected = useWorld((s) => s.selected);
  const select = useWorld((s) => s.select);
  const tasks = useWorld((s) => s.tasks);
  const [editing, setEditing] = useState<string>();
  const now = useNow(500);
  const list = Object.values(agents).sort((a, b) => a.order - b.order);
  if (!list.length) return <div className="empty">尚無 agent。點右上「導入 Agent」連接，或播放示範。</div>;
  return (
    <ul className="roster">
      {list.map((a) => {
        const st = displayState(a, now);
        const task = a.taskId ? tasks[a.taskId] : undefined;
        return (
          <li key={a.id} className={selected === a.id ? "on" : ""} onClick={() => select(selected === a.id ? undefined : a.id)}>
            <span className={`state-dot s-${st}`} />
            <div className="roster-main">
              <div className="roster-name" onDoubleClick={(e) => { e.stopPropagation(); setEditing(a.id); }} title="雙擊可改名">
                <AgentName agent={a} editing={editing === a.id} onDone={() => setEditing(undefined)} />
                <Term id={`role.${a.role}`} />
              </div>
              <div className="roster-sub">
                <span className="chip vendor" data-vendor={a.vendor}>{VENDOR[a.vendor || ""] ?? a.vendor ?? "?"}</span>
                <span className="model">{a.model}</span>
              </div>
              {task && <div className="roster-task">「{task.title}」</div>}
            </div>
            <Term id={`state.${st}`} className={`state-label s-${st}`} />
          </li>
        );
      })}
    </ul>
  );
}

function Tasks() {
  const tasks = useWorld((s) => s.tasks);
  const agents = useWorld((s) => s.agents);
  const list = Object.values(tasks).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
  if (!list.length) return <div className="empty">目前沒有任務。</div>;
  return (
    <ul className="tasks">
      {list.map((t) => (
        <li key={t.id} className={`t-${t.status}`}>
          <Term id={`task.${t.status}`} className="task-status" />
          <span className="task-title">{t.title}</span>
          <span className="task-who">{t.assignee ? agents[t.assignee]?.name ?? t.assignee : "—"}</span>
        </li>
      ))}
    </ul>
  );
}

function Approvals() {
  const approvals = useWorld((s) => s.approvals);
  const agents = useWorld((s) => s.agents);
  if (!approvals.length) return <div className="empty">沒有待決事項。</div>;
  return (
    <ul className="approvals">
      {approvals.map((r) => (
        <li key={r.id}>
          <div className="approval-text"><b>{agents[r.agent]?.name ?? r.agent}</b>：{r.summary}</div>
          <div className="approval-actions">
            <button className="btn-yes" onClick={() => sendCommand("approve", r.agent, { request: r.id }, dispatchRef)}><Term id="approve" /></button>
            <button className="btn-no" onClick={() => sendCommand("reject", r.agent, { request: r.id }, dispatchRef)}><Term id="reject" /></button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CostPanel({ theme }: PanelProps) {
  const agents = useWorld((s) => s.agents);
  const total = useWorld((s) => s.totalCostUsd);
  const budget = useWorld((s) => s.budgetUsd);
  const setBudget = useWorld((s) => s.setBudget);
  const list = Object.values(agents).sort((a, b) => b.costUsd - a.costUsd);
  const max = Math.max(0.0001, ...list.map((a) => a.costUsd));
  const pct = Math.min(1, total / budget);
  return (
    <div className="cost">
      <div className="cost-total">
        <span className="big"><Cost usd={total} theme={theme} /></span>
        <span className="muted">≈ ${total.toFixed(3)}</span>
      </div>
      <div className={`meter ${pct > 0.8 ? "hot" : ""}`}><div style={{ width: `${pct * 100}%` }} /></div>
      <label className="budget"><Term id="budget" /> $<input type="number" min={0.5} step={0.5} value={budget} onChange={(e) => setBudget(Number(e.target.value) || 1)} /></label>
      <ul className="bars">
        {list.map((a) => (
          <li key={a.id}>
            <span>{a.name}</span>
            <div className="bar"><div style={{ width: `${(a.costUsd / max) * 100}%` }} /></div>
            <span className="num"><Cost usd={a.costUsd} theme={theme} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Context() {
  const agents = useWorld((s) => s.agents);
  const list = Object.values(agents).filter((a) => a.context).sort((a, b) => a.order - b.order);
  if (!list.length) return <div className="empty">尚未回報 <Term id="context" /> 用量。</div>;
  return (
    <ul className="bars">
      {list.map((a) => {
        const p = a.context!.used / a.context!.max;
        return (
          <li key={a.id}>
            <span>{a.name}</span>
            <div className={`bar ${p > 0.85 ? "hot" : ""}`}><div style={{ width: `${p * 100}%` }} /></div>
            <span className="num">{Math.round(p * 100)}%</span>
          </li>
        );
      })}
    </ul>
  );
}

function Timeline() {
  const timeline = useWorld((s) => s.timeline);
  const agents = useWorld((s) => s.agents);
  const [filter, setFilter] = useState<string>("all");
  const list = timeline.filter((e) => filter === "all" || e.level === filter).slice(-80).reverse();
  return (
    <div className="timeline">
      <div className="filters">
        {["all", "talk", "work", "warn", "error", "good"].map((k) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}><Term id={`filter.${k}`} /></button>
        ))}
      </div>
      <ul>
        {list.map((e, i) => (
          <li key={e.id + i} className={`lv-${e.level}`}>
            <time>{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
            <span className="who">{e.agent === "human" ? <Term id="human" /> : e.agent ? agents[e.agent]?.name ?? "" : ""}</span>
            <span className="what">{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Details for the selected agent (opened by clicking a character or roster row). */
export function AgentDetails({ theme }: PanelProps) {
  const a = useWorld((s) => (s.selected ? s.agents[s.selected] : undefined));
  const parent = useWorld((s) => (a?.parent ? s.agents[a.parent] : undefined));
  const tasks = useWorld((s) => s.tasks);
  const [editing, setEditing] = useState(false);
  useNow(500);
  if (!a) return <div className="empty">點選場景中的角色或列表中的 agent。</div>;
  const st = displayState(a);
  return (
    <div className="agent-details">
      <div className="agent-head">
        <AgentName agent={a} editing={editing} onDone={() => setEditing(false)} />
        {!editing && <button className="link" onClick={() => setEditing(true)} title="自訂顯示名稱">✎ 改名</button>}
        {a.originalName && a.originalName !== a.name && !editing && (
          <button className="link" onClick={() => useWorld.getState().rename(a.id, "")} title={`還原為「${a.originalName}」`}>還原</button>
        )}
      </div>
      <dl>
        <dt>職位</dt><dd><Term id={`role.${a.role}`} /></dd>
        <dt>狀態</dt><dd className={`s-${st}`}><Term id={`state.${st}`} className={`state-label s-${st}`} /></dd>
        <dt>模型</dt><dd>{VENDOR[a.vendor || ""] ?? a.vendor} · {a.model ?? "—"}</dd>
        <dt>框架</dt><dd>{a.framework ?? "—"}</dd>
        <dt>ID</dt><dd className="mono">{a.id}</dd>
        <dt>任務</dt><dd>{a.taskId ? tasks[a.taskId]?.title : "—"}</dd>
        <dt><Term id="cost" /></dt><dd><Cost usd={a.costUsd} theme={theme} />（{(a.tokensIn / 1000).toFixed(1)}k / {(a.tokensOut / 1000).toFixed(1)}k tokens）</dd>
        {a.context && <><dt><Term id="context" /></dt><dd>{Math.round((a.context.used / a.context.max) * 100)}%</dd></>}
        {a.parent && <><dt><Term id="parent" /></dt><dd>{parent?.name ?? a.parent}</dd></>}
      </dl>
    </div>
  );
}

definePanel({ id: "roster", title: { "zh-TW": "Agent 列表", en: "Agents" }, area: "left", order: 10, component: Roster });
definePanel({ id: "tasks", title: { "zh-TW": "任務看板", en: "Tasks" }, area: "left", order: 20, component: Tasks });
definePanel({ id: "approvals", title: { "zh-TW": "核准請求", en: "Approvals" }, area: "right", order: 10, component: Approvals });
definePanel({ id: "cost", title: { "zh-TW": "Token 與成本", en: "Cost" }, area: "right", order: 20, component: CostPanel });
definePanel({ id: "context", title: { "zh-TW": "Context 用量", en: "Context" }, area: "right", order: 30, component: Context });
definePanel({ id: "timeline", title: { "zh-TW": "事件紀錄", en: "Log" }, area: "bottom", order: 10, component: Timeline });
