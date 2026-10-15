// View-level state: zoom tier, panel layout, visual toggles. Per-viewer
// preferences persist in localStorage (best effort).
import { create } from "zustand";

export type Zoom = "overview" | "area" | "close";

export interface UiState {
  zoom: Zoom;
  openPanels: Record<string, boolean>;
  preset: string;
  effects: { tiltShift: boolean; bloom: boolean; autoFocusAlerts: boolean };
  setZoom: (z: Zoom) => void;
  togglePanel: (id: string) => void;
  applyPreset: (id: string, panels: string[]) => void;
  setEffect: (k: keyof UiState["effects"], v: boolean) => void;
}

const KEY = "agent-diorama:ui";

function load(): Partial<UiState> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function save(s: UiState) {
  try { localStorage.setItem(KEY, JSON.stringify({ openPanels: s.openPanels, preset: s.preset, effects: s.effects })); } catch { /* storage unavailable */ }
}

const saved = load();

export const useUi = create<UiState>((set, get) => ({
  zoom: "area",
  openPanels: saved.openPanels ?? { roster: true, approvals: true, cost: true, tasks: true, timeline: true },
  preset: saved.preset ?? "commander",
  effects: { tiltShift: true, bloom: true, autoFocusAlerts: false, ...(saved.effects || {}) },
  setZoom: (zoom) => { if (get().zoom !== zoom) set({ zoom }); },
  togglePanel: (id) => {
    set({ openPanels: { ...get().openPanels, [id]: !get().openPanels[id] }, preset: "custom" });
    save(get());
  },
  applyPreset: (preset, panels) => {
    set({ preset, openPanels: Object.fromEntries(panels.map((p) => [p, true])) });
    save(get());
  },
  setEffect: (k, v) => { set({ effects: { ...get().effects, [k]: v } }); save(get()); },
}));
