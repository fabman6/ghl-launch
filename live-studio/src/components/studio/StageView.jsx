import { useEffect, useRef } from "react";
import { computeLayout } from "@/lib/studio/layouts";

/** Mounts the compositor's live canvas (the exact program feed) into the page. */
export function StageView({ session, aspect, className = "" }) {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    const canvas = session.compositor.canvas;
    el.appendChild(canvas);
    return () => {
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  }, [session]);
  return (
    <div
      ref={host}
      className={`stage-canvas relative mx-auto overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10 ${className}`}
      style={{ aspectRatio: aspect === "9:16" ? "9 / 16" : "16 / 9" }}
    />
  );
}

/** Tiny diagram of a layout, drawn from the real layout math. */
export function LayoutIcon({ layout, active }) {
  const W = 64;
  const H = 36;
  const items = layout.startsWith("screen")
    ? [{ id: "s", kind: "screen" }, { id: "a", kind: "cam" }, { id: "b", kind: "cam" }]
    : [{ id: "a", kind: "cam" }, { id: "b", kind: "cam" }, { id: "c", kind: "cam" }];
  const rects = computeLayout(layout, layout === "solo" ? items.slice(0, 1) : items, W, H);
  return (
    <div className={`relative h-9 w-16 overflow-hidden rounded ${active ? "bg-primary/30" : "bg-white/10"}`}>
      {rects.map((r) => (
        <div
          key={r.id}
          className={`absolute rounded-[2px] ${r.id === "s" ? "bg-sky-300/90" : active ? "bg-primary" : "bg-white/60"}`}
          style={{ left: r.x, top: r.y, width: Math.max(2, r.w), height: Math.max(2, r.h), zIndex: r.z }}
        />
      ))}
    </div>
  );
}
