// Event source: connects to the hub over SSE, or falls back to an in-browser
// demo that plays sim/scenario.mjs. Both feed the same `dispatch` pipeline.
import { create } from "zustand";
import { runScenario } from "../../../sim/scenario.mjs";
import type { DioramaEvent } from "../engine/types";

export type SourceMode = "connecting" | "hub" | "demo" | "offline";

interface SourceStore {
  mode: SourceMode;
  hubUrl: string;
  setMode: (m: SourceMode) => void;
}

const params = new URLSearchParams(location.search);
const DEFAULT_HUB = params.get("hub") || import.meta.env.VITE_DIORAMA_HUB || "http://127.0.0.1:4319";
/** Optional shared secret when the hub runs with DIORAMA_TOKEN. */
const TOKEN = params.get("token") || import.meta.env.VITE_DIORAMA_TOKEN || "";
const authHeaders = (): Record<string, string> => (TOKEN ? { authorization: `Bearer ${TOKEN}` } : {});
const withToken = (url: string) => (TOKEN ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(TOKEN)}` : url);

export const useSource = create<SourceStore>((set) => ({
  mode: "connecting",
  hubUrl: DEFAULT_HUB,
  setMode: (mode) => set({ mode }),
}));

let seq = 0;
const pendingApprovals = new Map<string, (d: "approve" | "reject") => void>();

function normalize(raw: Partial<DioramaEvent>): DioramaEvent {
  return { v: "0.1", id: raw.id || `local-${Date.now()}-${seq++}`, ts: raw.ts || new Date().toISOString(), type: raw.type!, ...raw } as DioramaEvent;
}

let demoSignal: { stopped: boolean } | undefined;

export function startDemo(dispatch: (e: DioramaEvent) => void, speed = 1) {
  stopDemo();
  disconnectHub();
  const signal = { stopped: false };
  demoSignal = signal;
  useSource.getState().setMode("demo");
  dispatch(normalize({ type: "custom.reset", agent: "system" }));
  runScenario({
    emit: (e) => { if (!signal.stopped) dispatch(normalize(e as DioramaEvent)); },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    waitApproval: (id, ms) =>
      new Promise((resolve) => {
        const t = setTimeout(() => { pendingApprovals.delete(id); resolve("timeout"); }, ms);
        pendingApprovals.set(id, (d) => { clearTimeout(t); pendingApprovals.delete(id); resolve(d); });
      }),
    speed,
    signal,
  });
}

export function stopDemo() {
  if (demoSignal) demoSignal.stopped = true;
  demoSignal = undefined;
}

let es: EventSource | undefined;
const seen = new Set<string>();

export function connect(dispatch: (e: DioramaEvent) => void) {
  const forceDemo = params.get("demo") === "1";
  if (forceDemo) return startDemo(dispatch);

  const { hubUrl } = useSource.getState();
  let opened = false;
  es?.close();
  es = new EventSource(withToken(`${hubUrl}/v1/stream`));
  es.onmessage = (m) => {
    try {
      const evt = normalize(JSON.parse(m.data));
      // EventSource reconnects replay the hub history; apply each event once.
      if (seen.has(evt.id)) return;
      seen.add(evt.id);
      if (seen.size > 50000) seen.clear();
      dispatch(evt);
    } catch { /* ignore malformed */ }
  };
  es.addEventListener("ready", () => {
    opened = true;
    useSource.getState().setMode("hub");
  });
  es.onerror = () => {
    if (!opened) {
      es?.close();
      startDemo(dispatch);
    } else {
      useSource.getState().setMode("offline");
    }
  };
}

/** Send a command (approve / reject / pause…). In demo mode it is resolved locally. */
export async function sendCommand(command: string, agent: string | undefined, args: Record<string, any>, dispatch: (e: DioramaEvent) => void) {
  const { mode, hubUrl } = useSource.getState();
  if (mode === "demo") {
    if ((command === "approve" || command === "reject") && args.request) {
      dispatch(normalize({ type: "approval.resolved", agent: "human", data: { request: args.request, decision: command } }));
      pendingApprovals.get(args.request)?.(command);
    }
    return;
  }
  await fetch(`${hubUrl}/v1/commands`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ command, agent, args }),
  });
  // Adapters that can't act on approvals still get a visible resolution.
  if ((command === "approve" || command === "reject") && args.request) {
    await fetch(`${hubUrl}/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ type: "approval.resolved", agent: "human", data: { request: args.request, decision: command } }),
    });
  }
}

/** Stop listening to the hub (e.g. to play the local demo instead). */
export function disconnectHub() {
  es?.close();
  es = undefined;
}

/** Leave demo mode and reconnect to the hub. */
export function reconnectHub(dispatch: (e: DioramaEvent) => void) {
  stopDemo();
  seen.clear();
  dispatch(normalize({ type: "custom.reset", agent: "system" }));
  useSource.getState().setMode("connecting");
  const url = new URL(location.href);
  url.searchParams.delete("demo");
  history.replaceState(null, "", url);
  params.delete("demo");
  connect(dispatch);
}

/** Is the hub reachable? Used by the onboarding wizard. */
export async function checkHub(): Promise<{ ok: boolean; events?: number; error?: string }> {
  try {
    const r = await fetch(withToken(`${useSource.getState().hubUrl}/v1/health`), { headers: authHeaders() });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, events: j.events };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** Post events to the hub, or apply them locally in demo mode. */
export async function postEvents(events: Partial<DioramaEvent>[], dispatch: (e: DioramaEvent) => void) {
  if (useSource.getState().mode !== "hub") {
    for (const e of events) dispatch(normalize(e));
    return;
  }
  await fetch(`${useSource.getState().hubUrl}/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(events),
  });
}

export const hubToken = TOKEN;
