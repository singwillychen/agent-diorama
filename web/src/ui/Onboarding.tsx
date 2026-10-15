// "導入 Agent" wizard: pick a kind of agent → name & role → connect → verify.
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorld } from "../engine/world";
import type { DioramaEvent } from "../engine/types";
import { checkHub, hubToken, postEvents, reconnectHub, useSource } from "../net/source";
import { theme } from "../themes/current";
import { Term, gloss, storyLabel } from "./Term";
import { useUi } from "./store";

type Kind = "claude-code" | "claude-sdk" | "openai" | "minimax" | "hermes" | "http";

const KINDS: { id: Kind; name: string; vendor: string; status: "ready" | "client" ; blurb: string }[] = [
  { id: "claude-code", name: "Claude Code", vendor: "anthropic", status: "ready", blurb: "用 hooks 自動回報，零程式碼。你平常用的 Claude Code 就會出現在場景裡。" },
  { id: "claude-sdk", name: "Claude Agent SDK", vendor: "anthropic", status: "client", blurb: "你自己寫的 Claude agent。在 agent 迴圈裡呼叫通用 client 回報。" },
  { id: "openai", name: "ChatGPT / OpenAI Agents", vendor: "openai", status: "client", blurb: "官方 adapter 開發中；現在可用通用 client 手動回報。" },
  { id: "minimax", name: "MiniMax", vendor: "minimax", status: "client", blurb: "官方 adapter 開發中；在你的 agent 迴圈中用通用 client 回報。" },
  { id: "hermes", name: "Hermes Agent", vendor: "nous", status: "client", blurb: "官方 adapter 開發中；Python 專案可直接用 diorama_client.py。" },
  { id: "http", name: "任何程式（HTTP）", vendor: "local", status: "client", blurb: "任何語言只要能送 HTTP POST 就能接入。" },
];

const ROLES = ["orchestrator", "planner", "researcher", "builder", "reviewer", "monitor", "communicator", "designer", "subagent"];

const STEPS = ["選擇類型", "身分設定", "連接", "驗證"];

function slug(s: string) {
  const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return ascii || `agent-${Math.random().toString(36).slice(2, 7)}`;
}

function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <pre>{text}</pre>
      <button
        onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
        }}
      >{copied ? "已複製" : "複製"}</button>
    </div>
  );
}

export function Onboarding({ dispatch }: { dispatch: (e: DioramaEvent) => void }) {
  const close = () => useUi.getState().setOnboarding(false);
  const hubUrl = useSource((s) => s.hubUrl);
  const mode = useSource((s) => s.mode);
  const agents = useWorld((s) => s.agents);
  const select = useWorld((s) => s.select);

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("claude-code");
  const [name, setName] = useState("");
  const [role, setRole] = useState("builder");
  const [rank, setRank] = useState(5);
  const [model, setModel] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [hub, setHub] = useState<{ ok: boolean; error?: string } | null>(null);
  const known = useRef<Set<string>>(new Set(Object.keys(agents)));

  const k = KINDS.find((x) => x.id === kind)!;
  const id = idTouched ? agentId : slug(name || k.name);

  useEffect(() => { if (step === 2) { setHub(null); checkHub().then(setHub); } }, [step]);
  useEffect(() => { if (step === 3) known.current = new Set(Object.keys(agents)); /* eslint-disable-next-line */ }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const manifest = useMemo(() => ({
    id, name: name || k.name, role, rank, vendor: k.vendor, model: model || undefined, framework: kind,
  }), [id, name, role, rank, k, model, kind]);

  // The agent we're waiting for: exact id, or (for Claude Code without a fixed id) any new arrival.
  const arrived = agents[id] ?? (kind === "claude-code" ? Object.values(agents).find((a) => !known.current.has(a.id)) : undefined);

  const env = [
    `DIORAMA_NAME=${shellQuote(manifest.name)}`,
    `DIORAMA_ROLE=${role}`,
    `DIORAMA_AGENT_ID=${id}`,
    hubUrl !== "http://127.0.0.1:4319" ? `DIORAMA_HUB=${hubUrl}` : "",
  ].filter(Boolean);

  const snippets: Record<Kind, { label: string; code: string }[]> = {
    "claude-code": [
      { label: "1. 在專案根目錄執行（只對這個專案生效）", code: `node adapters/claude-code/install.mjs --name ${shellQuote(manifest.name)} --role ${role} --id ${id}${hubToken ? " --token <你的 DIORAMA_TOKEN>" : ""}` },
      { label: "或對所有專案生效", code: `node adapters/claude-code/install.mjs --global --name ${shellQuote(manifest.name)} --role ${role} --id ${id}` },
      { label: "2. 新開一個 Claude Code session，送出任何訊息", code: "claude" },
    ],
    "claude-sdk": [
      { label: "TypeScript：把 client 複製進專案後", code: `import { Diorama } from "./diorama-client.mjs";\nconst d = new Diorama(${JSON.stringify(id)});\nawait d.register(${JSON.stringify(manifest)});\n// 在 agent 迴圈中：\nd.thinking(); d.tool("read", { path }); d.toolDone("read"); d.done(taskId);` },
    ],
    openai: [
      { label: "Python：在 agent 迴圈與工具呼叫處回報", code: `from diorama_client import Diorama\nd = Diorama(${JSON.stringify(id)})\nd.register(name=${JSON.stringify(manifest.name)}, role=${JSON.stringify(role)}, rank=${rank}, vendor="openai", model=${JSON.stringify(model || "gpt")}, framework="openai-agents")\nd.thinking(); d.tool("web_search", query="..."); d.tool_done("web_search"); d.done("t1")` },
    ],
    minimax: [
      { label: "Python", code: `from diorama_client import Diorama\nd = Diorama(${JSON.stringify(id)})\nd.register(name=${JSON.stringify(manifest.name)}, role=${JSON.stringify(role)}, rank=${rank}, vendor="minimax", model=${JSON.stringify(model || "minimax")})\nd.thinking(); d.tool("bash", command="..."); d.tool_done("bash"); d.done("t1")` },
    ],
    hermes: [
      { label: "Python（Hermes Agent）", code: `from diorama_client import Diorama\nd = Diorama(${JSON.stringify(id)})\nd.register(name=${JSON.stringify(manifest.name)}, role=${JSON.stringify(role)}, rank=${rank}, vendor="nous", model=${JSON.stringify(model || "hermes")}, framework="hermes-agent")` },
    ],
    http: [
      { label: "任何語言：送一個 HTTP POST", code: `curl -X POST ${hubUrl}/v1/events \\\n  -H 'content-type: application/json'${hubToken ? " \\\n  -H 'authorization: Bearer <你的 DIORAMA_TOKEN>'" : ""} \\\n  -d '${JSON.stringify({ type: "agent.registered", agent: id, data: manifest })}'` },
    ],
  };

  const sendTest = () =>
    postEvents([
      { type: "agent.registered", agent: id, data: manifest },
      { type: "say", agent: id, utterance: "測試訊號：我已連上！" },
    ], dispatch);
  const removeTest = () => postEvents([{ type: "agent.unregistered", agent: id }], dispatch);

  const roleText = (r: string) => `${storyLabel(`role.${r}`) ?? r}（${gloss(`role.${r}`)?.zh ?? r}）`;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal onboarding" role="dialog" aria-label="導入 Agent">
        <header>
          <h2>導入 Agent</h2>
          <button className="x" onClick={close} aria-label="關閉">×</button>
        </header>
        <ol className="steps">
          {STEPS.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""}><span>{i < step ? "✓" : i + 1}</span>{s}</li>)}
        </ol>

        <div className="modal-body">
          {step === 0 && (
            <div className="kinds-grid">
              {KINDS.map((x) => (
                <button key={x.id} className={`kind ${kind === x.id ? "on" : ""}`} onClick={() => setKind(x.id)}>
                  <span className="vendor-dot" data-vendor={x.vendor} />
                  <b>{x.name}</b>
                  <span className={`badge ${x.status}`}>{x.status === "ready" ? "一鍵接入" : "通用 client"}</span>
                  <small>{x.blurb}</small>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="form">
              <label>顯示名稱<input value={name} placeholder={k.name} maxLength={24} onChange={(e) => setName(e.target.value)} /></label>
              <label>
                職位
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleText(r)}</option>)}
                </select>
                <small className="hint">決定角色在場景中的位置與服裝。</small>
              </label>
              <label><Term id="rank" />：{rank}（{String(Object.entries(theme.theme.ranks ?? {}).filter(([n]) => rank >= Number(n)).pop()?.[1] ?? "")}）
                <input type="range" min={1} max={9} value={rank} onChange={(e) => setRank(Number(e.target.value))} />
              </label>
              {kind !== "claude-code" && <label>模型<input value={model} placeholder="例如 claude-sonnet-5-5 / gpt-5" onChange={(e) => setModel(e.target.value)} /></label>}
              <label>Agent ID<input className="mono" value={id} onChange={(e) => { setIdTouched(true); setAgentId(slug(e.target.value)); }} />
                <small className="hint">固定的 ID 讓自訂名稱與統計能跨 session 保留。</small>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="connect">
              <div className={`hub-status ${hub ? (hub.ok ? "ok" : "bad") : ""}`}>
                {hub === null ? "檢查事件中樞…" : hub.ok ? `✓ 事件中樞運作中：${hubUrl}` : `✗ 連不到事件中樞（${hubUrl}）`}
                {hub && !hub.ok && (
                  <>
                    <p>請先在專案根目錄啟動：</p>
                    <Code text="npm run dev" />
                    <button className="link" onClick={() => { setHub(null); checkHub().then(setHub); }}>重新檢查</button>
                  </>
                )}
                {hub?.ok && mode !== "hub" && (
                  <p>畫面目前在示範模式。<button className="link" onClick={() => reconnectHub(dispatch)}>改為連線到中樞</button>，才看得到真正的 agent。</p>
                )}
              </div>
              {snippets[kind].map((s) => (
                <div key={s.label}>
                  <p className="snippet-label">{s.label}</p>
                  <Code text={s.code} />
                </div>
              ))}
              {kind !== "claude-code" && (
                <p className="hint">通用 client 位於 <code>adapters/clients/</code>（Python：<code>diorama_client.py</code>，JS：<code>diorama-client.mjs</code>）。環境變數 <code>DIORAMA_HUB</code> 可指定中樞位址。</p>
              )}
              {kind === "claude-code" && <p className="hint">等同於設定 {env.join(" ")}。hook 不會影響 Claude Code 的運作，中樞沒開時會自動略過。</p>}
            </div>
          )}

          {step === 3 && (
            <div className="verify">
              {arrived ? (
                <div className="success">
                  <div className="big-check">✓</div>
                  <p><b>{arrived.name}</b> 已出現在場景中！</p>
                  <button className="primary" onClick={() => { select(arrived.id); close(); }}>前往查看</button>
                </div>
              ) : (
                <div className="waiting">
                  <div className="spinner" />
                  <p>{kind === "claude-code" ? "等待 Claude Code 送出第一個事件…（新開 session 並送出訊息）" : `等待 agent「${id}」上線…`}</p>
                </div>
              )}
              <div className="test-row">
                <span>還沒準備好？先送一個測試訊號確認畫面與中樞正常：</span>
                <button onClick={sendTest}>送出測試事件</button>
                {agents[id] && <button className="link" onClick={removeTest}>移除測試 agent</button>}
              </div>
            </div>
          )}
        </div>

        <footer>
          {step > 0 && <button onClick={() => setStep(step - 1)}>上一步</button>}
          <span className="spacer" />
          {step < 3 && <button className="primary" disabled={step === 1 && !id} onClick={() => setStep(step + 1)}>下一步</button>}
          {step === 3 && <button onClick={close}>完成</button>}
        </footer>
      </div>
    </div>
  );
}
