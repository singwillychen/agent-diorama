// Mod panel registry (docs/05-mod-panels.md). Built-in panels register here;
// external mods can call `window.AgentDiorama.registerPanel(...)`.
import type { ComponentType } from "react";
import { create } from "zustand";
import type { ResolvedTheme } from "../themes/loader";

export interface PanelProps {
  theme: ResolvedTheme;
}

export interface PanelDef {
  id: string;
  title: Record<string, string> | string;
  area: "left" | "right" | "bottom";
  order?: number;
  component: ComponentType<PanelProps>;
}

interface Registry {
  panels: PanelDef[];
  register: (p: PanelDef) => void;
}

export const usePanels = create<Registry>((set, get) => ({
  panels: [],
  register: (p) => set({ panels: [...get().panels.filter((x) => x.id !== p.id), p].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)) }),
}));

export function definePanel(p: PanelDef) {
  usePanels.getState().register(p);
  return p;
}

export const LAYOUT_PRESETS: Record<string, { label: string; panels: string[] }> = {
  commander: { label: "指揮官", panels: ["roster", "tasks", "approvals", "cost", "timeline"] },
  debug: { label: "除錯", panels: ["roster", "context", "timeline"] },
  boss: { label: "老闆", panels: ["cost", "tasks", "approvals"] },
  zen: { label: "禪", panels: [] },
};

export function panelTitle(p: PanelDef, theme: ResolvedTheme): string {
  const themed = theme.theme.panelTitles?.[p.id];
  if (themed) return themed;
  return typeof p.title === "string" ? p.title : p.title["zh-TW"] ?? Object.values(p.title)[0];
}
