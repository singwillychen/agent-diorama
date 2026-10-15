// A draggable, resizable panel window. Geometry always goes through
// clampRect so a window can never grow past the screen or hide its title bar.
import { useRef, type ReactNode } from "react";
import { useUi, type Rect } from "./store";

const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Edge = (typeof EDGES)[number];

export function FloatingWindow({ id, title, onClose, children }: { id: string; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const win = useUi((s) => s.windows[id]);
  const setRect = useUi((s) => s.setRect);
  const focus = useUi((s) => s.focus);
  const drag = useRef<{ mode: "move" | Edge; px: number; py: number; start: Rect } | null>(null);
  if (!win) return null;

  const begin = (mode: "move" | Edge) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button, input, select")) return;
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    drag.current = { mode, px: e.clientX, py: e.clientY, start: { x: win.x, y: win.y, w: win.w, h: win.h } };
    focus(id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    const r = { ...d.start };
    if (d.mode === "move") { r.x += dx; r.y += dy; }
    else {
      if (d.mode.includes("e")) r.w += dx;
      if (d.mode.includes("s")) r.h += dy;
      if (d.mode.includes("w")) { r.x += dx; r.w -= dx; }
      if (d.mode.includes("n")) { r.y += dy; r.h -= dy; }
      // Resizing from the left/top must not push the opposite edge.
      if (d.mode.includes("w") && r.w < 220) { r.x -= 220 - r.w; r.w = 220; }
      if (d.mode.includes("n") && r.h < 110) { r.y -= 110 - r.h; r.h = 110; }
    }
    setRect(id, r);
  };
  const end = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  return (
    <section
      className={`panel panel-${id} floating`}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: 20 + win.z }}
      onPointerDown={() => focus(id)}
    >
      <header onPointerDown={begin("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDoubleClick={() => setRect(id, { ...win })}>
        <span className="seal" />
        <h3>{title}</h3>
        <button className="x" title="關閉" aria-label="關閉" onClick={onClose}>×</button>
      </header>
      <div className="panel-body">{children}</div>
      {EDGES.map((edge) => (
        <div key={edge} className={`rz rz-${edge}`} onPointerDown={begin(edge)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      ))}
    </section>
  );
}
