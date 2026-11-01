import { useEffect, useRef, useState } from "react";
import { computeLayout } from "@/lib/studio/layouts";

/** Draggable divider between the main item and the side items (host only). */
function SplitHandle({ session, handle, hostRef }) {
  const [dragging, setDragging] = useState(false);
  const pending = useRef(null);
  const timer = useRef(0);
  if (!handle) return null;
  const { axis, area, pos, W, H, key, min, max } = handle;

  const commit = (value) => {
    pending.current = value;
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      const v = pending.current;
      session.updateState((s) => ({ splits: { ...(s.splits ?? {}), [key]: v } }));
    }, 40);
  };

  const onMove = (e) => {
    if (!dragging) return;
    const rect = hostRef.current.getBoundingClientRect();
    const f =
      axis === "x"
        ? (((e.clientX - rect.left) / rect.width) * W - area.x) / area.w
        : (((e.clientY - rect.top) / rect.height) * H - area.y) / area.h;
    commit(Math.min(max, Math.max(min, f)));
  };

  const style =
    axis === "x"
      ? { left: `${(pos / W) * 100}%`, top: `${(area.y / H) * 100}%`, height: `${(area.h / H) * 100}%`, width: 24, transform: "translateX(-50%)", cursor: "col-resize" }
      : { top: `${(pos / H) * 100}%`, left: `${(area.x / W) * 100}%`, width: `${(area.w / W) * 100}%`, height: 24, transform: "translateY(-50%)", cursor: "row-resize" };

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      title="Drag to resize"
      className="group/split absolute z-10 flex touch-none items-center justify-center"
      style={style}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={onMove}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onDoubleClick={() => session.updateState((s) => ({ splits: { ...(s.splits ?? {}), [key]: undefined } }))}
    >
      <div
        className={`rounded-full transition ${dragging ? "bg-primary" : "bg-white/0 group-hover/split:bg-white/70"} ${
          axis === "x" ? "h-full w-[3px]" : "h-[3px] w-full"
        }`}
      />
      <div
        className={`absolute rounded-full border border-white/30 bg-black/60 shadow transition ${dragging ? "opacity-100" : "opacity-60 group-hover/split:opacity-100"} ${
          axis === "x" ? "h-10 w-2.5" : "h-2.5 w-10"
        }`}
      />
    </div>
  );
}

/** Mounts the compositor's live canvas (the exact program feed) into the page. */
export function StageView({ session, snap, aspect, className = "" }) {
  const host = useRef(null);
  const canvasHost = useRef(null);
  useEffect(() => {
    const el = canvasHost.current;
    const canvas = session.compositor.canvas;
    el.appendChild(canvas);
    return () => {
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  }, [session]);
  const handle = snap?.isHost ? session.compositor.splitHandle() : null;
  return (
    <div
      ref={host}
      className={`relative mx-auto overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10 ${className}`}
      style={{ aspectRatio: aspect === "9:16" ? "9 / 16" : "16 / 9" }}
    >
      <div ref={canvasHost} className="stage-canvas absolute inset-0" />
      <SplitHandle session={session} handle={handle} hostRef={host} />
    </div>
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
