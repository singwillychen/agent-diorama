import { useEffect, useState } from "react";
import { Stage } from "./scene/Stage";
import { XianxiaScene, useMood } from "./scene/xianxia/XianxiaScene";
import { theme } from "./themes/current";
import { useWorld } from "./engine/world";
import { bubbleForEvent, idleTick, useBubbles, type BubbleKind } from "./engine/bubbles";
import type { DioramaEvent } from "./engine/types";
import { connect, reconnectHub, startDemo, useSource } from "./net/source";
import { LAYOUT_PRESETS, definePanel, panelTitle, usePanels, type PanelDef } from "./panels/registry";
import { AgentDetails, Cost, setPanelDispatch } from "./panels/builtin";
import { useUi, type TermMode } from "./ui/store";
import { FloatingWindow } from "./ui/FloatingWindow";
import { Term, TermTooltip } from "./ui/Term";
import { Onboarding } from "./ui/Onboarding";

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

const panelArea = (id: string) => usePanels.getState().panels.find((p) => p.id === id)?.area ?? "right";
const presetPanels = (key: string) => (LAYOUT_PRESETS[key]?.panels ?? []).map((id) => ({ id, area: panelArea(id) }));

// Connection LED: green = live hub, yellow = connecting / demo data, red = disconnected.
const LED = { hub: "green", connecting: "yellow", demo: "yellow", offline: "red" } as const;
const LED_LABEL = { green: "連線正常", yellow: "連線中或非即時資料", red: "連線中斷" } as const;

function TopBar() {
  const mode = useSource((s) => s.mode);
  const hubUrl = useSource((s) => s.hubUrl);
  const total = useWorld((s) => s.totalCostUsd);
  const agentCount = useWorld((s) => Object.keys(s.agents).length);
  const approvals = useWorld((s) => s.approvals.length);
  const mood = useMood();
  const panels = usePanels((s) => s.panels);
  const ui = useUi();
  const bubbleSettings = useBubbles((s) => s.settings);
  const setBubbles = useBubbles((s) => s.set);
  const [menu, setMenu] = useState(false);
  const kinds: [BubbleKind, string][] = [["work", "工作"], ["dialogue", "對話"], ["thought", "思考"], ["alert", "警示"], ["idle", "閒聊"], ["banter", "對口"]];
  const termModes: [TermMode, string][] = [["story", "故事"], ["both", "雙語"], ["pro", "專業"]];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">仙</span>
        <div>
          <h1>{theme.theme.name?.["zh-TW"] ?? "Agent Diorama"}</h1>
          <small>Agent Diorama</small>
        </div>
      </div>
      <div className="stats">
        <Term id={`mood.${mood}`} className={`pill mood-${mood}`} />
        <span className="pill"><Term id="agentsCount" /> {agentCount}</span>
        <span className="pill"><Cost usd={total} theme={theme} /></span>
        {approvals > 0 && (
          <button className="pill warn" onClick={() => ui.openPanel("approvals", "right")}>
            <Term id="panel.approvals" /> {approvals}
          </button>
        )}
        <span className={`pill src-${mode}`} title={mode === "hub" ? hubUrl : undefined}>
          <span className={`led led-${LED[mode]}`} role="img" aria-label={LED_LABEL[LED[mode]]} />
          <Term id={`source.${mode}`} />
        </span>
      </div>
      <div className="controls">
        <div className="seg" role="group" aria-label="術語顯示">
          {termModes.map(([m, l]) => (
            <button key={m} className={ui.termMode === m ? "on" : ""} onClick={() => ui.setTermMode(m)} title={m === "story" ? "故事名稱（滑鼠停留可看專業名稱）" : m === "both" ? "故事名稱 + 專業名稱" : "只顯示專業名稱"}>{l}</button>
          ))}
        </div>
        <button className="cta" onClick={() => ui.setOnboarding(true)}>＋ 導入 Agent</button>
        <select value={ui.preset} onChange={(e) => ui.applyPreset(e.target.value, presetPanels(e.target.value))} title="版面預設">
          {Object.entries(LAYOUT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}視圖</option>)}
          {ui.preset === "custom" && <option value="custom">自訂版面</option>}
        </select>
        <button onClick={() => setMenu(!menu)} className={menu ? "on" : ""}>模組 ▾</button>
      </div>
      {menu && (
        <div className="menu" onMouseLeave={() => setMenu(false)}>
          <h4>面板（關閉後再開，會接在同一側既有面板的下方）</h4>
          {panels.map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={ui.open.includes(p.id)} onChange={() => ui.togglePanel(p.id, p.area)} />
              <Term id={`panel.${p.id}`} text={panelTitle(p, theme)} />
            </label>
          ))}
          <button className="wide" onClick={() => ui.applyPreset(ui.preset === "custom" ? "commander" : ui.preset, presetPanels(ui.preset === "custom" ? "commander" : ui.preset))}>重設版面位置</button>
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
          <h4>資料來源</h4>
          {mode === "hub"
            ? <button className="wide" onClick={() => startDemo(dispatch)}>改播放示範（離線）</button>
            : <>
                <button className="wide" onClick={() => startDemo(dispatch)}>重新播放示範</button>
                <button className="wide" onClick={() => reconnectHub(dispatch)}>連線到事件中樞</button>
              </>}
        </div>
      )}
    </header>
  );
}

/** Shown when connected to the hub but nobody has joined yet. */
function EmptyState() {
  const mode = useSource((s) => s.mode);
  const count = useWorld((s) => Object.keys(s.agents).length);
  const setOnboarding = useUi((s) => s.setOnboarding);
  if (mode !== "hub" || count > 0) return null;
  return (
    <div className="empty-state">
      <h2>山門尚無弟子</h2>
      <p>事件中樞已連線，但還沒有任何 agent 回報。</p>
      <div className="row">
        <button className="primary" onClick={() => setOnboarding(true)}>＋ 導入 Agent</button>
        <button onClick={() => startDemo(dispatch)}>先看示範</button>
      </div>
      <small>也可以在終端機執行 <code>npm run sim</code> 把示範團隊送進中樞。</small>
    </div>
  );
}

function Windows() {
  const panels = usePanels((s) => s.panels);
  const open = useUi((s) => s.open);
  const closePanel = useUi((s) => s.closePanel);
  const select = useWorld((s) => s.select);
  return (
    <>
      {open.map((id) => {
        if (id === "agent") {
          return (
            <FloatingWindow key={id} id={id} title={<Term id="panel.agent" text={theme.theme.panelTitles?.agent ?? "Agent 詳情"} />} onClose={() => select(undefined)}>
              <AgentDetails theme={theme} />
            </FloatingWindow>
          );
        }
        const def = panels.find((p) => p.id === id);
        if (!def) return null;
        const C = def.component;
        return (
          <FloatingWindow key={id} id={id} title={<Term id={`panel.${id}`} text={panelTitle(def, theme)} />} onClose={() => closePanel(id)}>
            <C theme={theme} />
          </FloatingWindow>
        );
      })}
    </>
  );
}

export default function App() {
  const onboarding = useUi((s) => s.onboarding);
  const selected = useWorld((s) => s.selected);
  const approvals = useWorld((s) => s.approvals.length);

  useEffect(() => {
    setPanelDispatch(dispatch);
    connect(dispatch);
    // First visit: lay out the default preset.
    const ui = useUi.getState();
    if (!localStorage.getItem("agent-diorama:ui:v2")) ui.applyPreset("commander", presetPanels("commander"));
    else ui.clampAll();
    const onResize = () => useUi.getState().clampAll();
    window.addEventListener("resize", onResize);
    const i = setInterval(() => {
      const w = useWorld.getState();
      useBubbles.getState().prune();
      idleTick(w.agents, theme.bubbles, theme.theme, { cost: w.totalCostUsd, budget: w.budgetUsd });
    }, 1000);
    return () => { clearInterval(i); window.removeEventListener("resize", onResize); };
  }, []);

  // The details window follows the selection.
  useEffect(() => {
    const ui = useUi.getState();
    if (selected) ui.openPanel("agent", "right");
    else if (ui.open.includes("agent")) ui.closePanel("agent");
  }, [selected]);

  // Waiting approvals show up in the browser tab title too.
  useEffect(() => {
    const base = `${theme.theme.name?.["zh-TW"] ?? ""} · Agent Diorama`;
    document.title = approvals ? `(${approvals}) 待核准 · ${base}` : base;
  }, [approvals]);

  return (
    <div className="app" data-theme={theme.id} style={tokenVars}>
      <div className="stage"><Stage camera={theme.theme.scene?.camera}><XianxiaScene theme={theme} /></Stage></div>
      <TopBar />
      <Windows />
      <EmptyState />
      {onboarding && <Onboarding dispatch={dispatch} />}
      <TermTooltip />
    </div>
  );
}
