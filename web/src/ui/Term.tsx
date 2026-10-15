// Story vocabulary ↔ professional terms (docs/04 + glossary in themes/_base).
// <Term id="cost" /> shows the themed word (靈石) and carries the professional
// term (Token 成本 / Token cost) for the hover tooltip or the "pro" display mode.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { theme } from "../themes/current";
import { useUi } from "./store";

type Gloss = { zh: string; en: string };

export function storyLabel(id: string): string | undefined {
  const t = theme.theme;
  const [ns, key] = id.includes(".") ? (id.split(/\.(.+)/) as [string, string]) : ["", id];
  if (ns === "state") return t.stateLabels?.[key];
  if (ns === "panel") return t.panelTitles?.[key];
  if (ns === "role") return t.roles?.[key]?.title;
  return t.labels?.[id];
}

export function gloss(id: string): Gloss | undefined {
  return theme.theme.glossary?.[id];
}

/** Text for an id under the current display mode (for places that need a plain string). */
export function useTermText() {
  const mode = useUi((s) => s.termMode);
  return (id: string, fallback = id) => {
    const story = storyLabel(id) ?? fallback;
    const g = gloss(id);
    if (!g) return story;
    if (mode === "pro") return g.zh;
    if (mode === "both" && g.zh !== story) return `${story}（${g.zh}）`;
    return story;
  };
}

/**
 * `text` overrides the story word but is still swapped for the professional
 * term in "pro" mode; `children` is shown as-is in every mode (e.g. amounts).
 */
export function Term({ id, text, children, className }: { id: string; text?: string; children?: ReactNode; className?: string }) {
  const mode = useUi((s) => s.termMode);
  const g = gloss(id);
  const story = text ?? storyLabel(id) ?? id;
  if (!g) return <span className={className}>{children ?? story}</span>;
  if (children != null) {
    return <span className={`term ${className ?? ""}`} data-term-zh={g.zh} data-term-en={g.en}>{children}</span>;
  }
  return (
    <span className={`term ${className ?? ""}`} data-term-zh={g.zh} data-term-en={g.en}>
      {mode === "pro" ? g.zh : story}
      {mode === "both" && story !== g.zh && <small className="term-pro">{g.zh}</small>}
    </span>
  );
}

/** One tooltip for the whole page, following the pointer. */
export function TermTooltip() {
  const [tip, setTip] = useState<{ zh: string; en: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.("[data-term-zh]") as HTMLElement | null;
        if (!el) { setTip(null); return; }
        setTip({ zh: el.dataset.termZh!, en: el.dataset.termEn!, x: e.clientX, y: e.clientY });
      });
    };
    const hide = () => setTip(null);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerdown", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);
  if (!tip) return null;
  // Keep the box on screen: flip to the left / above near the edges.
  const w = box.current?.offsetWidth ?? 180;
  const h = box.current?.offsetHeight ?? 44;
  const x = tip.x + 14 + w > window.innerWidth - 8 ? tip.x - w - 10 : tip.x + 14;
  const y = tip.y + 18 + h > window.innerHeight - 8 ? tip.y - h - 10 : tip.y + 18;
  return (
    <div ref={box} className="term-tip" style={{ left: Math.max(8, x), top: Math.max(8, y) }} role="tooltip">
      <b>{tip.zh}</b>
      {tip.en !== tip.zh && <span>{tip.en}</span>}
    </div>
  );
}
