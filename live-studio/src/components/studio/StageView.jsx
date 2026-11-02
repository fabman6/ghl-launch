import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { computeLayout } from "@/lib/studio/layouts";
import { clampView } from "@/lib/studio/compositor";

/** Throttled host state update so dragging doesn't flood the room. */
function useThrottledUpdate(session) {
  const pending = useRef(null);
  const timer = useRef(0);
  return (fn) => {
    pending.current = fn;
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      session.updateState(pending.current);
    }, 40);
  };
}

function toCanvas(hostEl, W, H, clientX, clientY) {
  const r = hostEl.getBoundingClientRect();
  return { px: ((clientX - r.left) / r.width) * W, py: ((clientY - r.top) / r.height) * H };
}

/** Draggable divider between the main item and the side items (host only). */
function SplitHandle({ session, handle, hostRef }) {
  const [dragging, setDragging] = useState(false);
  const commit = useThrottledUpdate(session);
  if (!handle) return null;
  const { axis, area, pos, W, H, key, min, max } = handle;

  const onMove = (e) => {
    if (!dragging) return;
    const rect = hostRef.current.getBoundingClientRect();
    const f =
      axis === "x"
        ? (((e.clientX - rect.left) / rect.width) * W - area.x) / area.w
        : (((e.clientY - rect.top) / rect.height) * H - area.y) / area.h;
    const v = Math.min(max, Math.max(min, f));
    commit((s) => ({ splits: { ...(s.splits ?? {}), [key]: v } }));
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
      className="group/split absolute z-20 flex touch-none items-center justify-center"
      style={style}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={onMove}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        session.updateState((s) => ({ splits: { ...(s.splits ?? {}), [key]: undefined } }));
      }}
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

/**
 * Zoom and pan the shared screen (host only): scroll or pinch over it to zoom
 * toward the cursor, drag to pan, double-click to reset. Everyone, including
 * viewers of the stream and the recording, sees the same zoom.
 */
function ScreenZoom({ session, hostRef }) {
  const [hover, setHover] = useState(null); // { id, rect, view }
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const commit = useThrottledUpdate(session);
  const live = useRef({}); // latest view per screen while interacting
  const settle = useRef(0);
  const canvas = session.compositor.canvas;

  const currentView = (id) => live.current[id] ?? clampView(session.studioState.screenView?.[id]);
  const setView = (id, view) => {
    const v = clampView(view);
    live.current[id] = v;
    commit((s) => ({ screenView: { ...(s.screenView ?? {}), [id]: v } }));
    // Once the gesture settles, read from shared state again (e.g. after a new share resets it).
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (!drag.current) live.current = {};
    }, 400);
    setHover((h) => (h && h.id === id ? { ...h, view: v } : h));
  };

  const zoomAt = (hit, px, py, factor) => {
    const v = currentView(hit.id);
    const p = hit.picture;
    const u = Math.min(1, Math.max(0, (px - p.x) / p.w));
    const w = Math.min(1, Math.max(0, (py - p.y) / p.h));
    const sx = v.x - 0.5 / v.z + u / v.z;
    const sy = v.y - 0.5 / v.z + w / v.z;
    const z = Math.min(5, Math.max(1, v.z * factor));
    setView(hit.id, { z, x: sx - u / z + 0.5 / z, y: sy - w / z + 0.5 / z });
  };

  // Wheel must be a non-passive native listener so the page doesn't scroll.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const { px, py } = toCanvas(el, canvas.width, canvas.height, e.clientX, e.clientY);
      const hit = session.compositor.screenAt(px, py);
      if (!hit) return;
      e.preventDefault();
      // Trackpad pinch arrives as wheel + ctrlKey with small deltas.
      const delta = e.ctrlKey ? e.deltaY * 3 : e.deltaY;
      zoomAt(hit, px, py, Math.exp(-delta / 300));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
     
  }, [session, hostRef]);

  const locate = (e) => {
    const { px, py } = toCanvas(hostRef.current, canvas.width, canvas.height, e.clientX, e.clientY);
    return { px, py, hit: session.compositor.screenAt(px, py) };
  };

  const W = canvas.width;
  const H = canvas.height;
  const view = hover ? currentView(hover.id) : null;

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ cursor: dragging ? "grabbing" : hover && view?.z > 1.01 ? "grab" : "default" }}
      onPointerMove={(e) => {
        const { px, py, hit } = locate(e);
        if (drag.current) {
          const d = drag.current;
          const dx = (px - d.px) / d.picture.w / d.view.z;
          const dy = (py - d.py) / d.picture.h / d.view.z;
          setView(d.id, { z: d.view.z, x: d.view.x - dx, y: d.view.y - dy });
          return;
        }
        setHover(hit ? { id: hit.id, rect: hit.rect } : null);
      }}
      onPointerLeave={() => !drag.current && setHover(null)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const { px, py, hit } = locate(e);
        if (!hit || currentView(hit.id).z <= 1.01) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: hit.id, px, py, picture: hit.picture, view: currentView(hit.id) };
        setDragging(true);
      }}
      onPointerUp={(e) => {
        if (drag.current) e.currentTarget.releasePointerCapture(e.pointerId);
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={(e) => {
        const { hit } = locate(e);
        if (hit) setView(hit.id, { z: 1, x: 0.5, y: 0.5 });
      }}
    >
      {hover && (
        <div
          className="absolute flex items-center gap-1 rounded-lg border border-white/15 bg-black/70 p-1 text-white shadow-lg backdrop-blur"
          style={{ right: `${((W - hover.rect.x - hover.rect.w) / W) * 100 + 1}%`, top: `${(hover.rect.y / H) * 100 + 1.5}%` }}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/15"
            title="Zoom out"
            onClick={() => {
              const v = currentView(hover.id);
              setView(hover.id, { ...v, z: v.z / 1.35 });
            }}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-xs tabular-nums">{Math.round((view?.z ?? 1) * 100)}%</span>
          <button
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/15"
            title="Zoom in"
            onClick={() => {
              const v = currentView(hover.id);
              setView(hover.id, { ...v, z: v.z * 1.35 });
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {view?.z > 1.01 && (
            <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/15" title="Reset zoom" onClick={() => setView(hover.id, { z: 1, x: 0.5, y: 0.5 })}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
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
      {snap?.isHost && <ScreenZoom session={session} hostRef={host} />}
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
