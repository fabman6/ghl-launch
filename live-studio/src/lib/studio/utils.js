export function uid(n = 10) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (const b of bytes) s += a[b % a.length];
  return s;
}

export class Emitter {
  constructor() {
    this._listeners = new Map();
  }
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }
  emit(event, ...args) {
    for (const fn of [...(this._listeners.get(event) ?? [])]) {
      try {
        fn(...args);
      } catch (e) {
        console.error(`[studio] listener for ${event} failed`, e);
      }
    }
  }
}

export function fmtDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
const AUDIO_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

/** Best MediaRecorder container this browser supports (MP4 first: editors like it). */
export function pickRecorderType(kind = "video") {
  const list = kind === "audio" ? AUDIO_TYPES : VIDEO_TYPES;
  if (typeof MediaRecorder === "undefined") return { mimeType: "", ext: "webm" };
  for (const t of list) {
    if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: t.includes("mp4") ? (kind === "audio" ? "m4a" : "mp4") : "webm" };
  }
  return { mimeType: "", ext: "webm" };
}

export function baseMime(mimeType) {
  return (mimeType || "video/webm").split(";")[0];
}

export function slug(s, fallback = "file") {
  const out = String(s ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return out || fallback;
}

export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function hashColor(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Interval that keeps firing in background tabs (rAF and main-thread timers get throttled). */
export function createTicker(fps, cb) {
  const ms = Math.round(1000 / fps);
  try {
    const code = "let t=null;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}";
    const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    const w = new Worker(url);
    w.onmessage = cb;
    w.postMessage(ms);
    return {
      stop() {
        w.postMessage(0);
        w.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    const t = setInterval(cb, ms);
    return { stop: () => clearInterval(t) };
  }
}
