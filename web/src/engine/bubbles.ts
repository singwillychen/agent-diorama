// Speech-bubble engine (docs/04-speech-bubbles.md).
// Work/dialogue/alert bubbles come from real events; idle & banter lines only
// appear while an agent is genuinely idle and are styled so they can't be
// mistaken for work.
import { create } from "zustand";
import type { AgentView, DioramaEvent } from "./types";
import { displayState } from "./world";

export type BubbleKind = "work" | "dialogue" | "thought" | "alert" | "idle" | "banter" | "narrator";

export interface Bubble {
  id: string;
  agent: string;
  kind: BubbleKind;
  text: string;
  born: number;
  until: number;
  sticky?: string; // approval/request id that clears it
}

type Json = Record<string, any>;

const REDACT: [RegExp, string][] = [
  [/sk-[A-Za-z0-9_-]{12,}/g, "sk-•••"],
  [/(bearer\s+)[A-Za-z0-9._-]{12,}/gi, "$1•••"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "•••@•••"],
  [/\b(?:\d[ -]?){13,16}\b/g, "•••• ••••"],
  [/\+?\d[\d -]{8,}\d/g, "•••-•••"],
];

export function redact(text: string): string {
  return REDACT.reduce((t, [re, rep]) => t.replace(re, rep), text);
}

function pick<T>(list: T[] | undefined): T | undefined {
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

function lookup(ctx: Json, path: string): string | undefined {
  let cur: any = ctx;
  for (const part of path.split(".")) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  if (cur == null) return undefined;
  if (typeof cur === "string" && cur.includes("/")) {
    // Show only a file's basename in bubbles.
    const base = cur.split("/").filter(Boolean).pop();
    return base || cur;
  }
  return String(cur);
}

export function fill(template: string, ctx: Json): string {
  return template.replace(/\{([\w.]+)\}/g, (_, p) => lookup(ctx, p) ?? "…");
}

function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : text;
}

interface Settings {
  enabled: Record<BubbleKind, boolean>;
  liveliness: number; // 0..2 multiplier on idle chatter frequency
  showcase: boolean; // hide parameters in work bubbles
}

interface BubbleStore {
  bubbles: Bubble[];
  settings: Settings;
  set: (s: Partial<Settings>) => void;
  push: (b: Omit<Bubble, "id" | "born" | "until"> & { ms?: number }) => void;
  clearSticky: (key: string) => void;
  prune: () => void;
}

let seq = 0;

export const useBubbles = create<BubbleStore>((set, get) => ({
  bubbles: [],
  settings: {
    enabled: { work: true, dialogue: true, thought: true, alert: true, idle: true, banter: true, narrator: true },
    liveliness: 1,
    showcase: false,
  },
  set: (s) => set({ settings: { ...get().settings, ...s } }),
  push: (b) => {
    if (!get().settings.enabled[b.kind]) return;
    const now = Date.now();
    const text = redact(b.text);
    const len = [...text].length;
    const ms = b.ms ?? Math.min(8000, 1500 + len * 250);
    const bubble: Bubble = { id: `b${seq++}`, agent: b.agent, kind: b.kind, text, sticky: b.sticky, born: now, until: b.sticky ? Infinity : now + ms };
    // One bubble per agent at a time — the newest wins, except a sticky alert stays.
    const others = get().bubbles.filter((x) => x.agent !== b.agent || (x.sticky && !b.sticky));
    set({ bubbles: [...others, bubble] });
  },
  clearSticky: (key) => set({ bubbles: get().bubbles.filter((b) => b.sticky !== key) }),
  prune: () => {
    const now = Date.now();
    const alive = get().bubbles.filter((b) => b.until > now);
    if (alive.length !== get().bubbles.length) set({ bubbles: alive });
  },
}));

const PRIORITY: BubbleKind[] = ["alert", "dialogue", "work", "thought", "narrator", "banter", "idle"];

/** Visible subset given zoom level and the max-visible cap. */
export function visibleBubbles(all: Bubble[], zoom: "overview" | "area" | "close", style: Json): Bubble[] {
  const allowed: string[] = style?.zoomLevels?.[zoom] ?? PRIORITY;
  const max: number = style?.maxVisible ?? 6;
  return all
    .filter((b) => allowed.includes(b.kind))
    .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || b.born - a.born)
    .slice(0, max);
}

// ---------------------------------------------------------------- event → bubble

export function bubbleForEvent(
  evt: DioramaEvent,
  agents: Record<string, AgentView>,
  bubbles: Json,
  theme: Json,
  showcase: boolean,
): { agent: string; kind: BubbleKind; text: string; sticky?: string } | undefined {
  if (evt.visibility === "hidden") return undefined;
  const agentId = evt.type === "agent.registered" ? (evt.data?.id ?? evt.agent) : evt.agent;
  if (!agentId || agentId === "human" || agentId === "system") return undefined;
  const agent = agents[agentId];
  const d = evt.data || {};
  const tpl = bubbles.templates?.[evt.type];
  const roleInfo = (id?: string) => (id ? theme.roles?.[agents[id]?.role]?.title : undefined);
  const target = d.to && agents[d.to] ? { ...agents[d.to], title: roleInfo(d.to) ?? agents[d.to].role } : { name: d.to, title: d.to };
  const ctx: Json = {
    agent: { ...(agent || d), title: roleInfo(agentId) ?? agent?.role ?? d.role },
    target,
    tool: { name: d.tool },
    args: showcase || evt.visibility === "redacted" ? {} : d.args || {},
    task: { title: d.title ?? (d.task ? d.task : undefined) },
    data: showcase || evt.visibility === "redacted" ? { summary: "（略）", prompt: "（略）", text: "…" } : d,
  };

  const style = bubbles.style || theme.bubbles?.style || {};
  const maxWork = style.maxChars?.work ?? 30;

  if (evt.type === "say" && evt.utterance) return { agent: agentId, kind: "dialogue", text: truncate(evt.utterance, maxWork) };

  if (!tpl) return evt.utterance ? { agent: agentId, kind: "work", text: truncate(evt.utterance, maxWork) } : undefined;

  const kind = tpl.kind as BubbleKind;
  let text: string | undefined = evt.utterance && evt.visibility !== "redacted" && !showcase ? evt.utterance : undefined;
  if (!text) {
    const lines: string[] | undefined = (d.tool && tpl.byTool?.[String(d.tool).toLowerCase()]) || tpl.default;
    const line = pick(lines);
    if (!line) return undefined;
    text = fill(line, ctx);
  }
  const sticky = evt.type === "approval.requested" ? d.request : evt.type === "input.requested" ? `input:${agentId}` : undefined;
  return { agent: agentId, kind, text: kind === "alert" ? truncate(text, 40) : truncate(text, maxWork), sticky };
}

// ---------------------------------------------------------------- idle chatter

const lastIdleAt: Record<string, number> = {};
let nextGlobalIdle = Date.now() + 4000;

function matches(when: Json, a: AgentView, agents: Record<string, AgentView>, totals: { cost: number; budget: number }, now: number): Json | undefined {
  const within = (ms?: string) => (ms ? parseFloat(ms) * 1000 : 60000);
  if (when.recent === "error_resolved") {
    return a.lastRecoveredAt && now - a.lastRecoveredAt < within(when.within) ? {} : undefined;
  }
  if (when.recent === "task.completed" && when.self === false) {
    const other = Object.values(agents).find((o) => o.id !== a.id && o.transient?.state === "done" && now - (o.transient.until - 3500) < within(when.within));
    return other ? { other } : undefined;
  }
  if (when.idleFor) return now - a.stateSince > within(when.idleFor) ? {} : undefined;
  if (when.budgetUsedAbove != null) return totals.budget > 0 && totals.cost / totals.budget > when.budgetUsedAbove ? {} : undefined;
  if (when.timeOfDay === "night") { const h = new Date().getHours(); return h >= 21 || h < 5 ? {} : undefined; }
  if (when.contextUsedAbove != null) return a.context && a.context.used / a.context.max > when.contextUsedAbove ? {} : undefined;
  if (when.streak === "task.completed") return a.completedStreak >= (when.count ?? 3) ? {} : undefined;
  return undefined;
}

/** Called every ~second; emits at most one idle/banter line per global interval. */
export function idleTick(
  agents: Record<string, AgentView>,
  bubbles: Json,
  theme: Json,
  totals: { cost: number; budget: number },
) {
  const store = useBubbles.getState();
  const now = Date.now();
  if (now < nextGlobalIdle) return;
  const style = bubbles.style || theme.bubbles?.style || {};
  const [lo, hi] = style.globalIdleIntervalMs ?? [8000, 15000];
  const live = Math.max(0.1, store.settings.liveliness);
  nextGlobalIdle = now + (lo + Math.random() * (hi - lo)) / live;

  const cdMin = style.cooldownMs?.idleMin ?? 20000;
  const idle = Object.values(agents).filter(
    (a) => displayState(a, now) === "idle" && now - (lastIdleAt[a.id] ?? 0) > cdMin && !store.bubbles.some((b) => b.agent === a.id),
  );
  if (idle.length === 0) return;
  const maxIdle = style.maxChars?.idle ?? 20;

  // Banter between two idle agents.
  if (idle.length >= 2 && Math.random() < 0.3 && bubbles.banter?.length) {
    const script: Json[] = pick(bubbles.banter)!;
    const cast: AgentView[] = [];
    for (const line of script) {
      const who = idle.find((a) => !cast.includes(a) && (line.role === "_any" || a.role === line.role));
      if (!who) break;
      cast.push(who);
    }
    if (cast.length === script.length) {
      script.forEach((line, i) => {
        setTimeout(() => {
          const a = useBubbles.getState();
          a.push({ agent: cast[i].id, kind: "banter", text: truncate(line.line, maxIdle + 6), ms: 3200 });
        }, i * 2600);
        lastIdleAt[cast[i].id] = now;
      });
      return;
    }
  }

  const a = pick(idle)!;
  const chatty = a.persona?.chattiness ?? 0.5;
  if (Math.random() > 0.35 + chatty) return;
  lastIdleAt[a.id] = now;

  let text: string | undefined;
  for (const rule of bubbles.contextual || []) {
    const hit = matches(rule.when || {}, a, agents, totals, now);
    if (hit && Math.random() < 0.7) {
      text = fill(pick(rule.lines) || "", { agent: a, other: hit.other || {} });
      break;
    }
  }
  if (!text && a.persona?.catchphrases?.length && Math.random() < 0.2) text = pick(a.persona.catchphrases);
  if (!text) text = pick([...(bubbles.idle?.[a.role] || []), ...(bubbles.idle?._any || [])]);
  if (text) store.push({ agent: a.id, kind: "idle", text: truncate(text, maxIdle + 4), ms: 3500 });
}
