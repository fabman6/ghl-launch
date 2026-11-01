import { useEffect, useRef } from "react";

export function VideoView({ stream, mirror = false, contain = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    v.srcObject = stream || null;
    v.play?.().catch(() => {});
    const refresh = () => {
      v.srcObject = stream;
      v.play().catch(() => {});
    };
    stream?.addEventListener?.("addtrack", refresh);
    return () => stream?.removeEventListener?.("addtrack", refresh);
  }, [stream]);
  return (
    <video
      ref={ref}
      muted
      playsInline
      autoPlay
      className={`h-full w-full ${contain ? "object-contain" : "object-cover"} ${className}`}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

/** Animated mic level bar driven by a getter, without React re-renders. */
export function LevelBar({ getLevel, className = "" }) {
  const bar = useRef(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const l = getLevel?.() ?? 0;
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, l * 1.6)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/15 ${className}`}>
      <div ref={bar} className="h-full origin-left rounded-full bg-emerald-400 transition-transform duration-75" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

export function StaticLevel({ level, className = "" }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/15 ${className}`}>
      <div className="h-full rounded-full bg-emerald-400 transition-all duration-75" style={{ width: `${Math.min(100, level * 160)}%` }} />
    </div>
  );
}
