import { useEffect, useMemo, useState } from "react";
import { Stage } from "./scene/Stage";
import { XianxiaScene, useMood } from "./scene/xianxia/XianxiaScene";
import { resolveTheme } from "./themes/loader";
import { displayState, useWorld } from "./engine/world";
import { bubbleForEvent, idleTick, useBubbles, type BubbleKind } from "./engine/bubbles";
import type { DioramaEvent } from "./engine/types";
import { connect, startDemo, useSource } from "./net/source";
import { LAYOUT_PRESETS, definePanel, panelTitle, usePanels, type PanelDef } from "./panels/registry";
import { formatCost, setPanelDispatch } from "./panels/builtin";
import { useUi } from "./ui/store";

const theme = resolveTheme("xianxia");
const tokens = theme.theme.tokens || {};
const tokenVars = Object.fromEntries(
  ["bg", "surface", "text", "muted", "accent", "warn", "danger", "radius", "font"].filter((k) => tokens[k]).map((k) => [`--${k}`, tokens[k]]),
) as React.CSSProperties;

/** Single entry point for every event, from the hub or the demo. */
function dispatch(evt: DioramaEvent) {
  const world = useWorld.getState();
  const before = world.agents;
  world.apply(evt);
  const after = useWorld.getState().agents;
  const bubbles = useBubbles.getState();
  if (evt.type === "approval.resolved" && evt.data?.request) bubbles.clearSticky(evt.data.request);
  if (evt.type === "custom.reset") { useBubbles.setState({ bubbles: [] }); return; }
  const b = bubbleForEvent(evt, { ...before, ...after }, theme.bubbles, theme.theme, bubbles.settings.showcase);
  if (b) bubbles.push(b);
}

declare global {
  interface Window {
    AgentDiorama: {
      registerPanel: (p: PanelDef) => void;
      emit: (e: Partial<DioramaEvent> & { type: string }) => void;
      theme: typeof theme;
    };
  }
}
window.AgentDiorama = {
  registerPanel: definePanel,
  emit: (e) => dispatch({ v: "0.1", id: `mod-${Date.now()}-${Math.random()}`, ts: new Date().toISOString(), ...e } as DioramaEvent),
  theme,
};

function Panel({ def }: { def: PanelDef }) {
  const toggle = useUi((s) => s.togglePanel);
  const C = def.component;
  return (
    <section className={`panel panel-${def.id}`}>
      <header>
        <span className="seal" />
        <h3>{panelTitle(def, theme)}</h3>
        <button className="x" title="收合" onClick={() => toggle(def.id)}>×</button>
      </header>
      <div className="panel-body"><C theme={theme} /></div>
    </section>
  );
}

function TopBar() {
  const mode = useSource((s) => s.mode);
  const hubUrl = useSource((s) => s.hubUrl);
  const total = useWorld((s) => s.totalCostUsd);
  const agents = useWorld((s) => s.agents);
  const approvals = useWorld((s) => s.approvals.length);
  const mood = useMood();
  const panels = usePanels((s) => s.panels);
  const ui = useUi();
  const bubbleSettings = useBubbles((s) => s.settings);
  const setBubbles = useBubbles((s) => s.set);
  const [menu, setMenu] = useState(false);
  const moodLabel = { calm: "風和日麗", unstable: "風雲變色", tribulation: "天劫降臨" }[mood];
  const modeLabel = { connecting: "連線中…", hub: "已連線", demo: "示範模式", offline: "連線中斷" }[mode];
  const kinds: [BubbleKind, string][] = [["work", "工作"], ["dialogue", "對話"], ["thought", "思考"], ["alert", "警示"], ["idle", "閒聊"], ["banter", "對口"]];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">仙</span>
        <div>
          <h1>修仙山門</h1>
          <small>Agent Diorama</small>
        </div>
      </div>
      <div className="stats">
        <span className={`pill mood-${mood}`}>{moodLabel}</span>
        <span className="pill">弟子 {Object.keys(agents).length}</span>
        <span className="pill">{formatCost(total, theme)}</span>
        {approvals > 0 && <span className="pill warn">請示 {approvals}</span>}
        <span className={`pill src-${mode}`} title={mode === "hub" ? hubUrl : "沒有連上事件中樞，正在播放內建示範"}>{modeLabel}</span>
      </div>
      <div className="controls">
        <select value={ui.preset} onChange={(e) => ui.applyPreset(e.target.value, LAYOUT_PRESETS[e.target.value]?.panels ?? [])}>
          {Object.entries(LAYOUT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}視圖</option>)}
          {ui.preset === "custom" && <option value="custom">自訂</option>}
        </select>
        <button onClick={() => setMenu(!menu)} className={menu ? "on" : ""}>模組 ▾</button>
      </div>
      {menu && (
        <div className="menu" onMouseLeave={() => setMenu(false)}>
          <h4>面板</h4>
          {panels.map((p) => (
            <label key={p.id}><input type="checkbox" checked={!!ui.openPanels[p.id]} onChange={() => ui.togglePanel(p.id)} />{panelTitle(p, theme)}</label>
          ))}
          <h4>文字泡泡</h4>
          <div className="kinds">
            {kinds.map(([k, l]) => (
              <label key={k}><input type="checkbox" checked={bubbleSettings.enabled[k]} onChange={(e) => setBubbles({ enabled: { ...bubbleSettings.enabled, [k]: e.target.checked } })} />{l}</label>
            ))}
          </div>
          <label className="range">熱鬧度<input type="range" min={0} max={2} step={0.25} value={bubbleSettings.liveliness} onChange={(e) => setBubbles({ liveliness: Number(e.target.value) })} /></label>
          <label><input type="checkbox" checked={bubbleSettings.showcase} onChange={(e) => setBubbles({ showcase: e.target.checked })} />展示模式（隱藏參數）</label>
          <h4>畫面</h4>
          <label><input type="checkbox" checked={ui.effects.tiltShift} onChange={(e) => ui.setEffect("tiltShift", e.target.checked)} />移軸微縮效果</label>
          <label><input type="checkbox" checked={ui.effects.bloom} onChange={(e) => ui.setEffect("bloom", e.target.checked)} />光暈</label>
          {mode !== "hub" && <button className="wide" onClick={() => startDemo(dispatch)}>重新播放示範</button>}
        </div>
      )}
    </header>
  );
}

function AgentCard() {
  const selected = useWorld((s) => s.selected);
  const a = useWorld((s) => (s.selected ? s.agents[s.selected] : undefined));
  const tasks = useWorld((s) => s.tasks);
  const select = useWorld((s) => s.select);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(i); }, []);
  if (!selected || !a) return null;
  const st = displayState(a);
  const role = theme.theme.roles?.[a.role];
  return (
    <div className="agent-card">
      <button className="x" onClick={() => select(undefined)}>×</button>
      <h3>{a.name}<small>{role?.title ?? a.role}</small></h3>
      <dl>
        <dt>狀態</dt><dd className={`s-${st}`}>{theme.theme.stateLabels?.[st] ?? st}</dd>
        <dt>模型</dt><dd>{a.vendor} · {a.model ?? "—"}</dd>
        <dt>框架</dt><dd>{a.framework ?? "—"}</dd>
        <dt>任務</dt><dd>{a.taskId ? tasks[a.taskId]?.title : "—"}</dd>
        <dt>花費</dt><dd>{formatCost(a.costUsd, theme)}（{(a.tokensIn / 1000).toFixed(1)}k / {(a.tokensOut / 1000).toFixed(1)}k tokens）</dd>
        {a.context && <><dt>神識</dt><dd>{Math.round((a.context.used / a.context.max) * 100)}%</dd></>}
        {a.parent && <><dt>師承</dt><dd>{useWorld.getState().agents[a.parent]?.name ?? a.parent}</dd></>}
      </dl>
    </div>
  );
}

export default function App() {
  const panels = usePanels((s) => s.panels);
  const open = useUi((s) => s.openPanels);

  useEffect(() => {
    setPanelDispatch(dispatch);
    connect(dispatch);
    const i = setInterval(() => {
      const w = useWorld.getState();
      useBubbles.getState().prune();
      idleTick(w.agents, theme.bubbles, theme.theme, { cost: w.totalCostUsd, budget: w.budgetUsd });
    }, 1000);
    return () => clearInterval(i);
  }, []);

  const byArea = useMemo(() => {
    const out: Record<string, PanelDef[]> = { left: [], right: [], bottom: [] };
    for (const p of panels) if (open[p.id]) out[p.area].push(p);
    return out;
  }, [panels, open]);

  return (
    <div className="app" data-theme={theme.id} style={tokenVars}>
      <div className="stage"><Stage camera={theme.theme.scene?.camera}><XianxiaScene theme={theme} /></Stage></div>
      <TopBar />
      <aside className="col left">{byArea.left.map((p) => <Panel key={p.id} def={p} />)}</aside>
      <aside className="col right">{byArea.right.map((p) => <Panel key={p.id} def={p} />)}</aside>
      {byArea.bottom.length > 0 && <div className="col bottom">{byArea.bottom.map((p) => <Panel key={p.id} def={p} />)}</div>}
      <AgentCard />
    </div>
  );
}
