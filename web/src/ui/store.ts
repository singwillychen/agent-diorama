// View-level state: zoom tier, floating panel windows, display toggles.
// Per-viewer preferences persist in localStorage (best effort).
import { create } from "zustand";

export type Zoom = "overview" | "area" | "close";
export type TermMode = "story" | "pro" | "both";
export type Area = "left" | "right" | "bottom";

export interface Rect { x: number; y: number; w: number; h: number }
export interface WinState extends Rect { z: number }

export const TOP = 74; // below the top bar
export const MARGIN = 12;
export const GAP = 10;
export const MIN_W = 220;
export const MIN_H = 110;

const DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  roster: { w: 300, h: 380 },
  tasks: { w: 300, h: 220 },
  approvals: { w: 280, h: 170 },
  cost: { w: 280, h: 300 },
  context: { w: 280, h: 220 },
  timeline: { w: 640, h: 200 },
  agent: { w: 290, h: 300 },
};

export interface UiState {
  zoom: Zoom;
  termMode: TermMode;
  open: string[]; // open panels, in opening order
  windows: Record<string, WinState>;
  sizes: Record<string, { w: number; h: number }>; // sizes the user chose (survive closing)
  zTop: number;
  preset: string;
  effects: { tiltShift: boolean; bloom: boolean };
  onboarding: boolean;
  setZoom: (z: Zoom) => void;
  setTermMode: (m: TermMode) => void;
  openPanel: (id: string, area: Area) => void;
  closePanel: (id: string) => void;
  togglePanel: (id: string, area: Area) => void;
  focus: (id: string) => void;
  setRect: (id: string, r: Rect) => void;
  applyPreset: (id: string, panels: { id: string; area: Area }[]) => void;
  clampAll: () => void;
  setEffect: (k: keyof UiState["effects"], v: boolean) => void;
  setOnboarding: (v: boolean) => void;
}

const KEY = "agent-diorama:ui:v2";

function load(): Partial<UiState> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function save(s: UiState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      termMode: s.termMode, open: s.open, windows: s.windows, sizes: s.sizes, preset: s.preset, effects: s.effects,
    }));
  } catch { /* storage unavailable */ }
}

const vw = () => window.innerWidth;
const vh = () => window.innerHeight;

/** Keep a window fully on screen and within sane bounds, so it can never cover the UI unreachably. */
export function clampRect(r: Rect): Rect {
  const maxW = Math.max(MIN_W, vw() - MARGIN * 2);
  const maxH = Math.max(MIN_H, vh() - TOP - MARGIN);
  const w = Math.min(Math.max(r.w, MIN_W), maxW);
  const h = Math.min(Math.max(r.h, MIN_H), maxH);
  const x = Math.min(Math.max(r.x, MARGIN), vw() - w - MARGIN);
  const y = Math.min(Math.max(r.y, TOP), vh() - h - MARGIN);
  return { x: Math.max(0, x), y: Math.max(TOP, y), w, h };
}

const overlapsX = (a: Rect, x: number, w: number) => a.x < x + w && x < a.x + a.w;

/**
 * Where a newly opened panel goes: directly below the panels already open in
 * its column; if the column is full, try the other side, then cascade.
 */
function place(id: string, area: Area, size: { w: number; h: number }, others: Rect[]): Rect {
  const tryColumn = (x: number): Rect | null => {
    const below = others.filter((o) => overlapsX(o, x, size.w));
    const y = below.length ? Math.max(...below.map((o) => o.y + o.h)) + GAP : TOP;
    const room = vh() - MARGIN - y;
    // Fits (possibly a little shorter than remembered) right below the column.
    return room >= Math.min(size.h, MIN_H * 1.5) ? { x, y, w: size.w, h: Math.min(size.h, room) } : null;
  };
  const left = MARGIN;
  const right = vw() - size.w - MARGIN;
  if (area === "bottom") {
    const x = Math.max(MARGIN, (vw() - size.w) / 2);
    const above = others.filter((o) => overlapsX(o, x, size.w) && o.y + o.h > vh() - size.h - MARGIN);
    const y = above.length ? Math.min(...above.map((o) => o.y)) - GAP - size.h : vh() - size.h - MARGIN;
    if (y >= TOP) return clampRect({ x, y, ...size });
  }
  const first = area === "right" ? right : left;
  const second = area === "right" ? left : right;
  const spot = tryColumn(first) ?? tryColumn(second);
  if (spot) return clampRect(spot);
  const n = others.length;
  return clampRect({ x: vw() / 2 - size.w / 2 + n * 24, y: TOP + 40 + n * 24, ...size });
}

const saved = load();

export const useUi = create<UiState>((set, get) => ({
  zoom: "area",
  termMode: saved.termMode ?? "story",
  open: saved.open ?? [],
  windows: saved.windows ?? {},
  sizes: saved.sizes ?? {},
  zTop: 10,
  preset: saved.preset ?? "commander",
  effects: { tiltShift: true, bloom: true, ...(saved.effects || {}) },
  onboarding: false,
  setZoom: (zoom) => { if (get().zoom !== zoom) set({ zoom }); },
  setTermMode: (termMode) => { set({ termMode }); save(get()); },
  openPanel: (id, area) => {
    const s = get();
    if (s.open.includes(id)) { get().focus(id); return; }
    const size = s.sizes[id] ?? DEFAULT_SIZE[id] ?? { w: 280, h: 220 };
    const others = s.open.map((o) => s.windows[o]).filter(Boolean);
    const rect = place(id, area, size, others);
    const z = s.zTop + 1;
    set({ open: [...s.open, id], windows: { ...s.windows, [id]: { ...rect, z } }, zTop: z, preset: id === "agent" ? s.preset : "custom" });
    save(get());
  },
  closePanel: (id) => {
    const s = get();
    const windows = { ...s.windows };
    delete windows[id];
    set({
      open: s.open.filter((o) => o !== id),
      windows,
      preset: id === "agent" ? s.preset : "custom",
    });
    save(get());
  },
  togglePanel: (id, area) => (get().open.includes(id) ? get().closePanel(id) : get().openPanel(id, area)),
  focus: (id) => {
    const s = get();
    if (!s.windows[id] || s.windows[id].z === s.zTop) return;
    const z = s.zTop + 1;
    set({ windows: { ...s.windows, [id]: { ...s.windows[id], z } }, zTop: z });
  },
  setRect: (id, r) => {
    const s = get();
    if (!s.windows[id]) return;
    const rect = clampRect(r);
    set({ windows: { ...s.windows, [id]: { ...s.windows[id], ...rect } }, sizes: { ...s.sizes, [id]: { w: rect.w, h: rect.h } } });
    save(get());
  },
  applyPreset: (preset, panels) => {
    set({ open: get().open.filter((o) => o === "agent"), windows: Object.fromEntries(Object.entries(get().windows).filter(([k]) => k === "agent")) });
    for (const p of panels) get().openPanel(p.id, p.area);
    set({ preset });
    save(get());
  },
  clampAll: () => {
    const s = get();
    const windows = Object.fromEntries(Object.entries(s.windows).map(([k, w]) => [k, { ...w, ...clampRect(w) }]));
    set({ windows });
  },
  setEffect: (k, v) => { set({ effects: { ...get().effects, [k]: v } }); save(get()); },
  setOnboarding: (onboarding) => set({ onboarding }),
}));
