import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export function useSession(session) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

/** Seconds elapsed since a timestamp, ticking once a second. */
export function useElapsed(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? Math.max(0, (now - since) / 1000) : 0;
}

/** Level (0..1) of a single audio track, for lobby meters. */
export function useTrackLevel(track) {
  const [ctxLevel, setLevel] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!track) return undefined;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let last = 0;
    const loop = (t) => {
      if (t - last > 80) {
        last = t;
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        setLevel(Math.min(1, Math.sqrt(s / buf.length) * 4));
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf.current);
      ctx.close().catch(() => {});
    };
  }, [track]);
  return ctxLevel;
}
