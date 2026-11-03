import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Cloud,
  FilePlus2,
  FlipHorizontal2,
  GripHorizontal,
  Loader2,
  Minus,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SquarePen,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SAMPLE_SCRIPT, createScript, deleteScript, listScripts, readingMinutes, saveScript } from "@/lib/studio/scripts";

const PREFS_KEY = "live-studio-prompter";
const DEFAULT_PREFS = { fontSize: 36, speed: 3, mirror: false, countdown: true, opacity: 0.88, line: 0.3, scriptId: null, box: null };
const LINE_HEIGHT = 1.45;

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Pixels per second for a speed setting, scaled to the text size. */
const pxPerSec = (speed, fontSize) => speed * fontSize * 0.2;

function defaultBox() {
  const w = Math.min(760, window.innerWidth - 24);
  return { x: Math.round((window.innerWidth - w) / 2), y: 64, w, h: 260 };
}

function clampBox(b) {
  const w = Math.min(Math.max(320, b.w), window.innerWidth - 8);
  const h = Math.min(Math.max(170, b.h), window.innerHeight - 8);
  return { w, h, x: Math.min(Math.max(4, b.x), window.innerWidth - w - 4), y: Math.min(Math.max(4, b.y), window.innerHeight - h - 4) };
}

function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Script text to lines: "[cue]" shows as a stage direction, "# " as a heading. */
const ScriptText = memo(function ScriptText({ text }) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: "0.7em" }} />;
    if (/^#{1,3}\s/.test(line)) {
      return (
        <p key={i} className="font-extrabold uppercase tracking-wide text-primary" style={{ fontSize: "0.8em" }}>
          {line.replace(/^#{1,3}\s/, "")}
        </p>
      );
    }
    const parts = line.split(/(\[[^\]]*\])/g).filter(Boolean);
    return (
      <p key={i}>
        {parts.map((part, j) =>
          /^\[[^\]]*\]$/.test(part) ? (
            <span key={j} className="mx-1 rounded bg-primary/25 px-1.5 align-middle font-semibold italic text-primary" style={{ fontSize: "0.55em" }}>
              {part.slice(1, -1)}
            </span>
          ) : (
            <span key={j}>{part}</span>
          ),
        )}
      </p>
    );
  });
});

function copyStyles(target) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const css = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      const style = target.createElement("style");
      style.textContent = css;
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
  target.documentElement.className = document.documentElement.className;
  target.documentElement.style.cssText = document.documentElement.style.cssText;
}

// Leave keys alone while typing or while another dialog / slider / menu has focus.
const keysBusy = (el) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || !!el.closest?.('[role="dialog"],[role="slider"],[role="menu"],[role="listbox"]'));

function IconBtn({ title, onClick, active, disabled, children, className = "" }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-white/85 transition hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-35 ${
        active ? "bg-primary/90 text-white hover:bg-primary" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Script library + editor. */
function ScriptEditor({ open, onOpenChange, scripts, active, onSelect, onChange, onCreate, onDelete, signedIn, saving }) {
  const fileRef = useRef(null);
  const importFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    onCreate({ title: file.name.replace(/\.[^.]+$/, "") || "Imported script", body: text });
  };
  const mins = readingMinutes(active?.body);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Teleprompter scripts</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-[200px_1fr]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => onCreate({ title: "Untitled script", body: "" })}>
                <FilePlus2 className="mr-1.5 h-4 w-4" /> New
              </Button>
              <Button size="sm" variant="secondary" title="Import a .txt or .md file" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => {
                  importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="max-h-40 min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-thin sm:max-h-none">
              {scripts.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No scripts yet. Start writing on the right.</p>}
              {scripts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`w-full rounded-md px-2.5 py-2 text-left text-sm transition ${active?.id === s.id ? "bg-primary/15 text-foreground ring-1 ring-primary/40" : "hover:bg-secondary"}`}
                >
                  <div className="truncate font-medium">{s.title || "Untitled script"}</div>
                  <div className="truncate text-xs text-muted-foreground">{(s.body || "").slice(0, 60) || "Empty"}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <Input value={active?.title ?? ""} placeholder="Script title" onChange={(e) => onChange({ title: e.target.value })} />
            <Textarea
              value={active?.body ?? ""}
              onChange={(e) => onChange({ body: e.target.value })}
              placeholder={"Write or paste your script.\n\nTips: put stage directions in [brackets], like [pause] or [show slide], and start a line with # for a section heading."}
              className="min-h-[300px] flex-1 resize-none font-mono text-sm leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {(active?.body || "").trim().split(/\s+/).filter(Boolean).length} words · about {mins < 1 ? "<1" : Math.round(mins)} min to read
              </span>
              <span className="flex items-center gap-1.5">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : signedIn && active?.inAccount !== false ? <Cloud className="h-3 w-3" /> : null}
                {saving ? "Saving…" : signedIn && active?.inAccount !== false ? "Saved to your account" : "Saved in this browser"}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={!active?.id}
            onClick={() => confirm(`Delete "${active?.title || "this script"}"?`) && onDelete(active)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Teleprompter: a floating, draggable reader that sits near your camera.
 * It is only on your screen, never in the stream or recording. The host can
 * share theirs so guests read the same script, scrolled by the host.
 */
export default function Teleprompter({ session, snap, open, onClose }) {
  const { isAuthenticated } = useAuth();
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [box, setBox] = useState(() => clampBox(prefs.box ?? defaultBox()));
  const [scripts, setScripts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(null); // script being read/edited
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [follow, setFollow] = useState(true);
  const [popWin, setPopWin] = useState(null);
  const [, setTick] = useState(0);

  const viewport = useRef(null);
  const content = useRef(null);
  const pos = useRef(0);
  const max = useRef(1);
  const countdownUntil = useRef(0);
  const playingRef = useRef(false);
  const lastSent = useRef(0);
  const remoteRef = useRef(null);
  const saveTimer = useRef(0);
  const shareTimer = useRef(0);
  const countdownRef = useRef(0);
  const pxPerSecRef = useRef(0);
  const broadcastRef = useRef(() => {});

  const remote = snap.prompterRemote;
  const following = !snap.isHost && !!remote && follow;
  const sharing = snap.isHost && snap.prompterSharing;
  remoteRef.current = remote;

  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  // Start following again whenever the host shares a different script.
  useEffect(() => {
    if (remote?.docId) setFollow(true);
  }, [remote?.docId]);

  // ---------- script library ----------
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    listScripts({ signedIn: isAuthenticated }).then((list) => {
      if (cancelled) return;
      setScripts(list);
      setLoaded(true);
      const pick = list.find((s) => s.id === prefs.scriptId) ?? list[0];
      setDraft(pick ?? { id: null, title: "My first script", body: SAMPLE_SCRIPT, inAccount: isAuthenticated });
    });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, isAuthenticated, prefs.scriptId]);

  const persist = useCallback(
    (script) => {
      clearTimeout(saveTimer.current);
      setSaving(true);
      saveTimer.current = window.setTimeout(async () => {
        try {
          if (!script.id) {
            const created = await createScript({ signedIn: isAuthenticated, title: script.title, body: script.body });
            setDraft((d) => (d && !d.id ? { ...d, id: created.id, inAccount: created.inAccount } : d));
            setScripts((list) => [created, ...list]);
            setPrefs({ scriptId: created.id });
          } else {
            await saveScript(script);
            setScripts((list) => list.map((s) => (s.id === script.id ? { ...s, title: script.title, body: script.body, updatedAt: Date.now() } : s)));
          }
        } catch (e) {
          toast.error(`Couldn't save the script: ${e.message}`);
        } finally {
          setSaving(false);
        }
      }, 700);
    },
    [isAuthenticated, setPrefs],
  );

  const changeDraft = (patch) => {
    setDraft((d) => {
      const next = { ...(d ?? { id: null, title: "Untitled script", body: "", inAccount: isAuthenticated }), ...patch };
      persist(next);
      return next;
    });
  };

  const selectScript = (id) => {
    const s = scripts.find((x) => x.id === id);
    if (!s) return;
    setDraft(s);
    setPrefs({ scriptId: id });
    restart();
  };

  const newScript = async ({ title, body }) => {
    try {
      const created = await createScript({ signedIn: isAuthenticated, title, body });
      setScripts((list) => [created, ...list]);
      setDraft(created);
      setPrefs({ scriptId: created.id });
      restart();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const removeScript = async (script) => {
    try {
      await deleteScript(script);
      const rest = scripts.filter((s) => s.id !== script.id);
      setScripts(rest);
      setDraft(rest[0] ?? { id: null, title: "Untitled script", body: "", inAccount: isAuthenticated });
      setPrefs({ scriptId: rest[0]?.id ?? null });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const text = following ? remote.text : draft?.body ?? "";
  const title = following ? remote.title : draft?.title ?? "Teleprompter";

  // ---------- sharing (host) ----------
  const rate = () => (max.current > 0 ? pxPerSec(prefs.speed, prefs.fontSize) / max.current : 0);
  const broadcast = useCallback(
    (extra = {}) => {
      if (!snap.isHost || !session.prompterShared) return;
      lastSent.current = performance.now();
      const isPlaying = playingRef.current;
      session.sharePrompter({
        docId: draft?.id ?? "draft",
        doc: { title: draft?.title ?? "Script", text: draft?.body ?? "" },
        ctl: { playing: isPlaying, progress: max.current > 0 ? pos.current / max.current : 0, rate: isPlaying ? rate() : 0, sentAt: performance.now(), ...extra },
      });
    },
    [snap.isHost, session, draft?.id, draft?.title, draft?.body, prefs.speed, prefs.fontSize],
  );

  const toggleShare = () => {
    if (sharing) {
      session.stopSharingPrompter();
      return;
    }
    session.sharePrompter({
      docId: draft?.id ?? "draft",
      doc: { title: draft?.title ?? "Script", text: draft?.body ?? "" },
      ctl: { playing: false, progress: max.current > 0 ? pos.current / max.current : 0, rate: 0, sentAt: performance.now() },
    });
    if (playingRef.current) broadcast();
    toast.success("Guests now see your script and follow your scrolling.");
  };

  // Keep guests in step when the text or speed changes.
  useEffect(() => {
    if (!sharing) return undefined;
    clearTimeout(shareTimer.current);
    shareTimer.current = window.setTimeout(() => broadcast(), 300);
    return () => clearTimeout(shareTimer.current);
  }, [sharing, broadcast]);

  // Stop sharing when the host closes the prompter or leaves.
  useEffect(() => {
    if (!open && snap.isHost) session.stopSharingPrompter();
  }, [open, snap.isHost, session]);

  // ---------- playback ----------
  const setPlay = (v) => {
    if (following) return;
    if (v && pos.current >= max.current - 1) pos.current = 0;
    playingRef.current = v;
    setPlaying(v);
    let countdownMs = 0;
    if (v && prefs.countdown && pos.current < 2) {
      countdownMs = 3000;
      countdownUntil.current = performance.now() + countdownMs;
    } else {
      countdownUntil.current = 0;
    }
    broadcast({ countdownMs });
  };
  const togglePlay = () => setPlay(!playingRef.current);

  function restart() {
    pos.current = 0;
    playingRef.current = false;
    setPlaying(false);
    countdownUntil.current = 0;
    broadcast();
  }

  const seekBy = (dy) => {
    if (following) return;
    pos.current = Math.min(max.current, Math.max(0, pos.current + dy));
    if (performance.now() - lastSent.current > 200) broadcast();
    else {
      clearTimeout(shareTimer.current);
      shareTimer.current = window.setTimeout(() => broadcast(), 220);
    }
  };

  const changeSpeed = (d) => setPrefs({ speed: Math.round(Math.min(10, Math.max(0.5, prefs.speed + d)) * 2) / 2 });
  const changeFont = (d) => setPrefs({ fontSize: Math.min(96, Math.max(18, prefs.fontSize + d)) });

  // The scroll loop. Runs in whichever window shows the prompter.
  useEffect(() => {
    if (!open) return undefined;
    const win = popWin ?? window;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    let lastPing = performance.now();
    const step = (t) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const vp = viewport.current;
      const el = content.current;
      if (vp && el) {
        max.current = Math.max(1, el.scrollHeight - vp.clientHeight);
        const r = remoteRef.current;
        const now = performance.now();
        if (!snap.isHost && r && follow) {
          let p = r.progress;
          let cd = 0;
          if (r.countdownUntil && now < r.countdownUntil) cd = Math.ceil((r.countdownUntil - now) / 1000);
          else if (r.playing) p = r.progress + (r.rate * (now - Math.max(r.receivedAt, r.countdownUntil || 0))) / 1000;
          const target = Math.min(1, Math.max(0, p)) * max.current;
          pos.current += (target - pos.current) * Math.min(1, dt * 8);
          if (cd !== countdownRef.current) {
            countdownRef.current = cd;
            setCountdown(cd);
          }
        } else if (playingRef.current) {
          if (countdownUntil.current && now < countdownUntil.current) {
            const cd = Math.ceil((countdownUntil.current - now) / 1000);
            if (cd !== countdownRef.current) {
              countdownRef.current = cd;
              setCountdown(cd);
            }
          } else {
            if (countdownRef.current) {
              countdownRef.current = 0;
              setCountdown(0);
            }
            pos.current += pxPerSecRef.current * dt;
            if (pos.current >= max.current) {
              pos.current = max.current;
              playingRef.current = false;
              setPlaying(false);
              broadcastRef.current();
            }
            // Occasional re-sync so guests never drift.
            if (now - lastPing > 4000) {
              lastPing = now;
              broadcastRef.current();
            }
          }
        } else if (countdownRef.current) {
          countdownRef.current = 0;
          setCountdown(0);
        }
        el.style.transform = `translate3d(0, ${-pos.current}px, 0)`;
      }
      if (t - lastUi > 250) {
        lastUi = t;
        setTick((n) => (n + 1) % 1e6);
      }
      raf = win.requestAnimationFrame(step);
    };
    raf = win.requestAnimationFrame(step);
    return () => win.cancelAnimationFrame(raf);
  }, [open, popWin, snap.isHost, follow]);

  pxPerSecRef.current = pxPerSec(prefs.speed, prefs.fontSize);
  broadcastRef.current = broadcast;

  // ---------- keyboard ----------
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (editing || keysBusy(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const vpH = viewport.current?.clientHeight ?? 200;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        changeSpeed(0.5);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        changeSpeed(-0.5);
      } else if (e.key === "PageDown" || e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(vpH * 0.6);
      } else if (e.key === "PageUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        seekBy(-vpH * 0.6);
      } else if (e.key === "Home") {
        e.preventDefault();
        restart();
      }
    };
    const wins = [window, popWin].filter(Boolean);
    wins.forEach((w) => w.addEventListener("keydown", onKey));
    return () => wins.forEach((w) => w.removeEventListener("keydown", onKey));
  });

  // Mouse wheel scrolls the script by hand (non-passive so the page stays put).
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      seekBy(e.deltaY);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  });

  // ---------- pop out ----------
  const popOut = async () => {
    try {
      let win = null;
      const w = Math.round(box.w);
      const h = Math.round(box.h);
      if (window.documentPictureInPicture?.requestWindow) {
        win = await window.documentPictureInPicture.requestWindow({ width: w, height: h });
      } else {
        win = window.open("", "raw-live-prompter", `popup,width=${w},height=${h}`);
      }
      if (!win) {
        toast.error("Allow pop-ups for this site to pop out the teleprompter.");
        return;
      }
      win.document.title = "Teleprompter";
      copyStyles(win.document);
      win.document.body.style.margin = "0";
      win.document.body.style.background = "#000";
      win.document.body.style.height = "100vh";
      win.document.body.style.overflow = "hidden";
      win.addEventListener("pagehide", () => setPopWin(null), { once: true });
      setPopWin(win);
    } catch (e) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    if (!open && popWin) popWin.close();
  }, [open, popWin]);
  useEffect(() => () => popWin?.close(), [popWin]);

  // ---------- drag / resize the floating panel ----------
  const drag = useRef(null);
  const startDrag = (e, mode) => {
    if (popWin || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, box };
  };
  const moveDrag = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    setBox(clampBox(d.mode === "move" ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy } : { ...d.box, w: d.box.w + dx, h: d.box.h + dy }));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setPrefs({ box });
  };
  useEffect(() => {
    const onResize = () => setBox((b) => clampBox(b));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Tap the text to pause or play; drag it to scroll by hand.
  const tap = useRef(null);
  const onTextDown = (e) => {
    if (e.button !== 0) return;
    tap.current = { y: e.clientY, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTextMove = (e) => {
    const t = tap.current;
    if (!t) return;
    const dy = t.y - e.clientY;
    t.y = e.clientY;
    t.moved += Math.abs(dy);
    if (t.moved > 4) seekBy(dy);
  };
  const onTextUp = () => {
    const t = tap.current;
    tap.current = null;
    if (t && t.moved <= 4) togglePlay();
  };

  if (!open) return null;

  const progress = max.current > 0 ? Math.min(1, pos.current / max.current) : 0;
  const speedPx = following ? (remote?.rate || 0) * max.current : pxPerSec(prefs.speed, prefs.fontSize);
  const secsLeft = speedPx > 0 ? (max.current - pos.current) / speedPx : 0;
  const isPlaying = following ? !!remote?.playing : playing;
  const empty = !String(text || "").trim();

  const vpHeight = viewport.current?.clientHeight ?? box.h - 48;
  const lineY = Math.round(vpHeight * prefs.line);
  const lineH = prefs.fontSize * LINE_HEIGHT;

  const body = (
    <div
      className="flex h-full flex-col overflow-hidden text-white"
      style={{ background: `rgba(8,8,10,${popWin ? 1 : prefs.opacity})` }}
    >
      {/* Toolbar (also the drag handle) */}
      <div
        className={`flex shrink-0 flex-wrap items-center gap-1 border-b border-white/10 px-2 py-1.5 ${popWin ? "" : "cursor-move"}`}
        onPointerDown={(e) => startDrag(e, "move")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        {!popWin && <GripHorizontal className="mr-0.5 h-4 w-4 shrink-0 text-white/40" />}
        <div className="mr-auto min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{title || "Untitled script"}</div>
          <div className="flex items-center gap-1.5 truncate text-[10px] text-white/55">
            {following ? (
              <span className="flex items-center gap-1 text-primary">
                <Users className="h-3 w-3" /> Following the host
              </span>
            ) : sharing ? (
              <span className="flex items-center gap-1 text-primary">
                <Users className="h-3 w-3" /> Shared with guests
              </span>
            ) : (
              <span>Only you can see this</span>
            )}
            <span>·</span>
            <span className="tabular-nums">{isPlaying && secsLeft > 0 ? `${fmtClock(secsLeft)} left` : `${Math.round(progress * 100)}%`}</span>
          </div>
        </div>

        <IconBtn title={isPlaying ? "Pause (Space)" : "Play (Space)"} onClick={togglePlay} active={isPlaying} disabled={following || empty}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </IconBtn>
        <IconBtn title="Back to the top (Home)" onClick={restart} disabled={following}>
          <RotateCcw className="h-4 w-4" />
        </IconBtn>
        <div className="mx-0.5 flex items-center rounded-md bg-white/10">
          <IconBtn title="Slower (Down arrow)" onClick={() => changeSpeed(-0.5)} disabled={following}>
            <Minus className="h-3.5 w-3.5" />
          </IconBtn>
          <span className="w-9 text-center text-xs tabular-nums" title="Scroll speed">
            {following ? "Host" : `${prefs.speed.toFixed(1)}x`}
          </span>
          <IconBtn title="Faster (Up arrow)" onClick={() => changeSpeed(0.5)} disabled={following}>
            <Plus className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
        <div className="mx-0.5 flex items-center rounded-md bg-white/10">
          <IconBtn title="Smaller text" onClick={() => changeFont(-4)}>
            <span className="text-[11px] font-bold">A</span>
          </IconBtn>
          <IconBtn title="Bigger text" onClick={() => changeFont(4)}>
            <span className="text-base font-bold">A</span>
          </IconBtn>
        </div>
        <IconBtn title="Mirror text (for teleprompter glass)" onClick={() => setPrefs({ mirror: !prefs.mirror })} active={prefs.mirror}>
          <FlipHorizontal2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Prompter settings" onClick={() => setShowSettings((v) => !v)} active={showSettings}>
          <Settings2 className="h-4 w-4" />
        </IconBtn>
        {!following && (
          <IconBtn title={popWin ? "Edit and choose scripts (opens in the studio window)" : "Edit and choose scripts"} onClick={() => setEditing(true)}>
            <SquarePen className="h-4 w-4" />
          </IconBtn>
        )}
        {snap.isHost && (
          <IconBtn title={sharing ? "Stop sharing with guests" : "Share with guests (they follow your scrolling)"} onClick={toggleShare} active={sharing} disabled={empty}>
            <Users className="h-4 w-4" />
          </IconBtn>
        )}
        {!popWin && (
          <IconBtn title="Pop out (keep it on top, move it under your camera)" onClick={popOut}>
            <PictureInPicture2 className="h-4 w-4" />
          </IconBtn>
        )}
        <IconBtn title={popWin ? "Put back in the studio" : "Close teleprompter"} onClick={() => (popWin ? popWin.close() : onClose())}>
          <X className="h-4 w-4" />
        </IconBtn>
      </div>

      {showSettings && (
        <div className="grid shrink-0 grid-cols-1 gap-x-5 gap-y-2.5 border-b border-white/10 px-3 py-2.5 text-xs sm:grid-cols-2" onPointerDown={(e) => e.stopPropagation()}>
          <label className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-white/70">Text size</span>
            <Slider value={[prefs.fontSize]} min={18} max={96} step={2} onValueChange={([v]) => setPrefs({ fontSize: v })} />
            <span className="w-8 text-right tabular-nums">{prefs.fontSize}</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-white/70">Speed</span>
            <Slider value={[prefs.speed]} min={0.5} max={10} step={0.5} disabled={following} onValueChange={([v]) => setPrefs({ speed: v })} />
            <span className="w-8 text-right tabular-nums">{prefs.speed.toFixed(1)}</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-white/70">Reading line</span>
            <Slider value={[prefs.line]} min={0.12} max={0.6} step={0.02} onValueChange={([v]) => setPrefs({ line: v })} />
            <span className="w-8" />
          </label>
          {!popWin && (
            <label className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-white/70">Background</span>
              <Slider value={[prefs.opacity]} min={0.4} max={1} step={0.02} onValueChange={([v]) => setPrefs({ opacity: v })} />
              <span className="w-8 text-right tabular-nums">{Math.round(prefs.opacity * 100)}%</span>
            </label>
          )}
          <label className="flex items-center justify-between gap-3">
            <span className="text-white/70">3-second countdown before scrolling</span>
            <Switch checked={prefs.countdown} onCheckedChange={(v) => setPrefs({ countdown: v })} />
          </label>
          {!snap.isHost && remote && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-white/70">Follow the host&apos;s script</span>
              <Switch checked={follow} onCheckedChange={setFollow} />
            </label>
          )}
        </div>
      )}

      {/* Reader */}
      <div
        ref={viewport}
        className="relative min-h-0 flex-1 cursor-pointer select-none overflow-hidden touch-none"
        onPointerDown={onTextDown}
        onPointerMove={onTextMove}
        onPointerUp={onTextUp}
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm text-white/70">{following ? "The host's script is empty." : "No script yet."}</p>
            {!following && (
              <Button
                size="sm"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
              >
                <SquarePen className="mr-1.5 h-4 w-4" /> Write your script
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="h-full" style={{ transform: prefs.mirror ? "scaleX(-1)" : undefined }}>
              <div
                ref={content}
                className="mx-auto px-[6%] font-semibold will-change-transform"
                style={{
                  fontSize: prefs.fontSize,
                  lineHeight: LINE_HEIGHT,
                  paddingTop: Math.max(0, lineY - lineH / 2),
                  paddingBottom: Math.max(0, vpHeight - lineY - lineH / 2),
                  maxWidth: "62em",
                }}
              >
                <ScriptText text={text} />
              </div>
            </div>
            {/* Reading line: keep your eyes here, right under the camera. */}
            <div className="pointer-events-none absolute inset-x-0" style={{ top: lineY - lineH / 2, height: lineH }}>
              <div className="absolute inset-0 bg-white/[0.06]" />
              <div className="absolute left-1 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[7px] border-l-[10px] border-y-transparent border-l-primary" />
              <div className="absolute right-1 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[7px] border-r-[10px] border-y-transparent border-r-primary" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[12%] bg-gradient-to-b from-black/70 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-black/70 to-transparent" />
            {countdown > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                <span key={countdown} className="animate-in zoom-in-50 fade-in text-7xl font-black text-primary">
                  {countdown}
                </span>
              </div>
            )}
            {!isPlaying && !countdown && !following && progress < 0.002 && vpHeight > 120 && (
              <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
                Tap or press Space to start · scroll to move
              </div>
            )}
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
          <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {!popWin && (
        <div
          title="Drag to resize"
          className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize"
          style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,.35) 50%)" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            startDrag(e, "resize");
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        />
      )}
    </div>
  );

  return (
    <>
      {popWin ? (
        createPortal(body, popWin.document.body)
      ) : (
        <div
          className="fixed z-40 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/15 backdrop-blur-sm"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          role="region"
          aria-label="Teleprompter"
        >
          {body}
        </div>
      )}
      {popWin && (
        <div className="fixed left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs shadow-lg">
          Teleprompter is popped out
          <button className="font-semibold text-primary hover:underline" onClick={() => popWin.close()}>
            Bring it back
          </button>
        </div>
      )}
      <ScriptEditor
        open={editing}
        onOpenChange={setEditing}
        scripts={scripts}
        active={draft}
        onSelect={selectScript}
        onChange={changeDraft}
        onCreate={newScript}
        onDelete={removeScript}
        signedIn={isAuthenticated}
        saving={saving}
      />
    </>
  );
}
