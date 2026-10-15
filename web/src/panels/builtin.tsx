// Built-in mod panels: roster, tasks, approvals, cost, context, timeline.
import { useEffect, useState } from "react";
import { displayState, useWorld } from "../engine/world";
import type { AgentView, DioramaEvent } from "../engine/types";
import { sendCommand } from "../net/source";
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

function stateLabel(theme: PanelProps["theme"], s: string) {
  return theme.theme.stateLabels?.[s] ?? s;
}

function roleTitle(theme: PanelProps["theme"], a: AgentView) {
  return theme.theme.roles?.[a.role]?.title ?? a.role;
}

const VENDOR: Record<string, string> = { anthropic: "Claude", openai: "ChatGPT", minimax: "MiniMax", nous: "Hermes", local: "Local" };

let dispatchRef: (e: DioramaEvent) => void = () => {};
export function setPanelDispatch(fn: (e: DioramaEvent) => void) { dispatchRef = fn; }

function Roster({ theme }: PanelProps) {
  const agents = useWorld((s) => s.agents);
  const selected = useWorld((s) => s.selected);
  const select = useWorld((s) => s.select);
  const tasks = useWorld((s) => s.tasks);
  const now = useNow(500);
  const list = Object.values(agents).sort((a, b) => a.order - b.order);
  if (!list.length) return <div className="empty">尚無弟子入門。啟動 agent 或模擬器後會出現在這裡。</div>;
  return (
    <ul className="roster">
      {list.map((a) => {
        const st = displayState(a, now);
        const task = a.taskId ? tasks[a.taskId] : undefined;
        return (
          <li key={a.id} className={selected === a.id ? "on" : ""} onClick={() => select(selected === a.id ? undefined : a.id)}>
            <span className={`state-dot s-${st}`} />
            <div className="roster-main">
              <div className="roster-name"><b>{a.name}</b><span>{roleTitle(theme, a)}</span></div>
              <div className="roster-sub">
                <span className="chip vendor" data-vendor={a.vendor}>{VENDOR[a.vendor || ""] ?? a.vendor ?? "?"}</span>
                <span className="model">{a.model}</span>
              </div>
              {task && <div className="roster-task">「{task.title}」</div>}
            </div>
            <span className={`state-label s-${st}`}>{stateLabel(theme, st)}</span>
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
  const label: Record<string, string> = { open: "待辦", assigned: "已指派", in_progress: "進行中", done: "完成", failed: "失敗" };
  return (
    <ul className="tasks">
      {list.map((t) => (
        <li key={t.id} className={`t-${t.status}`}>
          <span className="task-status">{label[t.status]}</span>
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
            <button className="btn-yes" onClick={() => sendCommand("approve", r.agent, { request: r.id }, dispatchRef)}>准</button>
            <button className="btn-no" onClick={() => sendCommand("reject", r.agent, { request: r.id }, dispatchRef)}>駁</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Cost({ theme }: PanelProps) {
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
        <span className="big">{formatCost(total, theme)}</span>
        <span className="muted">≈ ${total.toFixed(3)}</span>
      </div>
      <div className={`meter ${pct > 0.8 ? "hot" : ""}`}><div style={{ width: `${pct * 100}%` }} /></div>
      <label className="budget">預算 $<input type="number" min={0.5} step={0.5} value={budget} onChange={(e) => setBudget(Number(e.target.value) || 1)} /></label>
      <ul className="bars">
        {list.map((a) => (
          <li key={a.id}>
            <span>{a.name}</span>
            <div className="bar"><div style={{ width: `${(a.costUsd / max) * 100}%` }} /></div>
            <span className="num">{formatCost(a.costUsd, theme)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Context() {
  const agents = useWorld((s) => s.agents);
  const list = Object.values(agents).filter((a) => a.context).sort((a, b) => a.order - b.order);
  if (!list.length) return <div className="empty">尚未回報 context 用量。</div>;
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
  const list = timeline.filter((e) => filter === "all" || e.level === filter).slice(-60).reverse();
  return (
    <div className="timeline">
      <div className="filters">
        {[["all", "全部"], ["talk", "傳音"], ["work", "施法"], ["warn", "請示"], ["error", "異常"], ["good", "成果"]].map(([k, l]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <ul>
        {list.map((e, i) => (
          <li key={e.id + i} className={`lv-${e.level}`}>
            <time>{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
            <span className="who">{e.agent && e.agent !== "human" ? agents[e.agent]?.name ?? "" : e.agent === "human" ? "宗主" : ""}</span>
            <span className="what">{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

definePanel({ id: "roster", title: { "zh-TW": "Agent 名冊", en: "Roster" }, area: "left", order: 10, component: Roster });
definePanel({ id: "tasks", title: { "zh-TW": "任務看板", en: "Tasks" }, area: "left", order: 20, component: Tasks });
definePanel({ id: "approvals", title: { "zh-TW": "審批佇列", en: "Approvals" }, area: "right", order: 10, component: Approvals });
definePanel({ id: "cost", title: { "zh-TW": "Token 與成本", en: "Cost" }, area: "right", order: 20, component: Cost });
definePanel({ id: "context", title: { "zh-TW": "Context 使用率", en: "Context" }, area: "right", order: 30, component: Context });
definePanel({ id: "timeline", title: { "zh-TW": "對話時間軸", en: "Timeline" }, area: "bottom", order: 10, component: Timeline });
