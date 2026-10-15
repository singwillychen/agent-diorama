// Theme cascade: _base → theme (via `extends`) → runtime overrides.
// Objects deep-merge, arrays replace, `null` deletes an inherited key.
import baseTheme from "@themes/_base/theme.json";
import baseBubbles from "@themes/_base/bubbles.zh-TW.json";
import xianxiaTheme from "@themes/xianxia/theme.json";
import xianxiaBubbles from "@themes/xianxia/bubbles.zh-TW.json";
import cicTheme from "@themes/cic/theme.json";
import cicBubbles from "@themes/cic/bubbles.zh-TW.json";
import officeTheme from "@themes/startup-office/theme.json";
import officeBubbles from "@themes/startup-office/bubbles.zh-TW.json";

type Json = Record<string, any>;

const THEMES: Record<string, { theme: Json; bubbles: Json }> = {
  _base: { theme: baseTheme, bubbles: baseBubbles },
  xianxia: { theme: xianxiaTheme, bubbles: xianxiaBubbles },
  cic: { theme: cicTheme, bubbles: cicBubbles },
  "startup-office": { theme: officeTheme, bubbles: officeBubbles },
};

/** Scenes that have a 3D implementation today. Others load config only. */
export const PLAYABLE_THEMES = ["xianxia"] as const;

export function deepMerge<T extends Json>(base: T, over: Json | undefined): T {
  if (!over) return structuredClone(base);
  const out: Json = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    if (v === null) { delete out[k]; continue; }
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = structuredClone(v);
    }
  }
  return out as T;
}

/** Bubble files merge per section; line pools for the same key are concatenated with the parent's. */
function mergeBubbles(base: Json, over: Json): Json {
  const out = deepMerge(base, { ...over, idle: undefined, contextual: undefined, banter: undefined });
  out.idle = { ...base.idle };
  for (const [role, lines] of Object.entries(over.idle || {})) {
    out.idle[role] = role === "_any" ? (lines as string[]) : [...(lines as string[])];
  }
  out.contextual = over.contextual ?? base.contextual ?? [];
  out.banter = over.banter ?? base.banter ?? [];
  return out;
}

export interface ResolvedTheme {
  id: string;
  theme: Json;
  bubbles: Json;
}

export function resolveTheme(id: string, overrides?: Json): ResolvedTheme {
  const chain: string[] = [];
  let cur: string | undefined = id;
  while (cur && THEMES[cur] && !chain.includes(cur)) {
    chain.unshift(cur);
    cur = cur === "_base" ? undefined : THEMES[cur].theme.extends || "_base";
  }
  let theme: Json = {};
  let bubbles: Json = { templates: {}, idle: {}, contextual: [], banter: [] };
  for (const t of chain) {
    theme = deepMerge(theme, THEMES[t].theme);
    bubbles = mergeBubbles(bubbles, THEMES[t].bubbles);
  }
  if (overrides) theme = deepMerge(theme, overrides);
  return { id, theme, bubbles };
}
