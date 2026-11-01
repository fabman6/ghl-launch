import { useEffect, useRef, useState } from "react";
import { Check, Download, ExternalLink, FolderDown, ImagePlus, Loader2, Pencil, Play, Plus, Send, Square, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FONTS, SCENES, THEMES } from "@/lib/studio/state";
import { downloadBlob, fmtBytes, fmtDuration, uid } from "@/lib/studio/utils";

const SWATCHES = ["#e5202e", "#ff6b00", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#ec4899", "#111827", "#ffffff"];

function Section({ title, children, right }) {
  return (
    <section className="space-y-3 border-b p-4 last:border-b-0">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

async function uploadFile(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

function UploadButton({ accept, label, onUploaded, icon: Icon = ImagePlus }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onUploaded(await uploadFile(f), f);
          } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Icon className="mr-1.5 h-4 w-4" />}
        {label}
      </Button>
    </>
  );
}

// ---------------- Banners ----------------

export function BannersPanel({ session, snap }) {
  const s = snap.state;
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ticker, setTicker] = useState(false);
  const [editing, setEditing] = useState(null);

  const toggle = (b) => {
    if (b.ticker) session.updateState({ activeTicker: s.activeTicker === b.id ? null : b.id });
    else session.updateState({ activeBanner: s.activeBanner === b.id ? null : b.id });
  };
  const add = () => {
    if (!title.trim()) return;
    session.updateState((st) => ({ banners: [...st.banners, { id: `b-${uid(6)}`, title: title.trim(), subtitle: subtitle.trim(), ticker }] }));
    setTitle("");
    setSubtitle("");
  };
  const saveEdit = () => {
    session.updateState((st) => ({ banners: st.banners.map((b) => (b.id === editing.id ? editing : b)) }));
    setEditing(null);
  };
  const remove = (id) =>
    session.updateState((st) => ({
      banners: st.banners.filter((b) => b.id !== id),
      activeBanner: st.activeBanner === id ? null : st.activeBanner,
      activeTicker: st.activeTicker === id ? null : st.activeTicker,
    }));

  return (
    <div>
      <Section title="On-screen">
        <label className="flex items-center justify-between text-sm">
          Show name tags
          <Switch checked={s.showNames} onCheckedChange={(v) => session.updateState({ showNames: v })} />
        </label>
        <label className="flex items-center justify-between text-sm">
          Highlight who is speaking
          <Switch checked={s.speakerHighlight} onCheckedChange={(v) => session.updateState({ speakerHighlight: v })} />
        </label>
      </Section>
      <Section title="Banners" right={<span className="text-xs text-muted-foreground">Click to show / hide</span>}>
        <div className="space-y-2">
          {s.banners.map((b) => {
            const active = b.ticker ? s.activeTicker === b.id : s.activeBanner === b.id;
            if (editing?.id === b.id) {
              return (
                <div key={b.id} className="space-y-2 rounded-lg border p-2">
                  <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  {!editing.ticker && (
                    <Input value={editing.subtitle} placeholder="Subtitle" onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
                  )}
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={saveEdit}>
                      <Check className="mr-1 h-4 w-4" /> Save
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(b)}
                onKeyDown={(e) => e.key === "Enter" && toggle(b)}
                className={`group flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition ${
                  active ? "border-primary bg-primary/15" : "hover:bg-accent"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{b.title}</div>
                  {b.subtitle && <div className="text-xs text-muted-foreground">{b.subtitle}</div>}
                  {b.ticker && <div className="mt-1 text-[10px] uppercase tracking-wider text-primary">Scrolling ticker</div>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-60 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ ...b });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-60 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(b.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="space-y-2 rounded-lg border border-dashed p-2.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ticker ? "Ticker text" : "Banner title"} onKeyDown={(e) => e.key === "Enter" && add()} />
          {!ticker && <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" onKeyDown={(e) => e.key === "Enter" && add()} />}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={ticker} onCheckedChange={setTicker} /> Scrolling ticker
            </label>
            <Button size="sm" onClick={add} disabled={!title.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ---------------- Brand ----------------

export function BrandPanel({ session, snap }) {
  const b = snap.state.brand;
  const set = (patch) => session.updateState((st) => ({ brand: { ...st.brand, ...patch } }));
  return (
    <div>
      <Section title="Brand color">
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => set({ color: c })}
              className={`h-7 w-7 rounded-full border-2 ${b.color === c ? "border-white" : "border-transparent"}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
          <input type="color" value={b.color} onChange={(e) => set({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded bg-transparent" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Text on brand color</span>
          <input type="color" value={b.textColor} onChange={(e) => set({ textColor: e.target.value })} className="h-7 w-9 cursor-pointer rounded bg-transparent" />
        </div>
      </Section>
      <Section title="Theme">
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <Button key={t.id} size="sm" variant={b.theme === t.id ? "default" : "secondary"} onClick={() => set({ theme: t.id })}>
              {t.label}
            </Button>
          ))}
        </div>
        <Select value={b.font} onValueChange={(v) => set({ font: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => (
              <SelectItem key={f} value={f}>
                <span style={{ fontFamily: f }}>{f}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>
      <Section title="Logo">
        {b.logoUrl && <img src={b.logoUrl} alt="" className="max-h-16 rounded bg-white/5 p-1" />}
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton accept="image/*" label={b.logoUrl ? "Replace" : "Upload logo"} onUploaded={(url) => set({ logoUrl: url })} />
          {b.logoUrl && (
            <Button size="sm" variant="ghost" onClick={() => set({ logoUrl: "" })}>
              Remove
            </Button>
          )}
        </div>
        <Select value={b.logoPos} onValueChange={(v) => set({ logoPos: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top-left">Top left</SelectItem>
            <SelectItem value="top-right">Top right</SelectItem>
            <SelectItem value="bottom-left">Bottom left</SelectItem>
            <SelectItem value="bottom-right">Bottom right</SelectItem>
          </SelectContent>
        </Select>
      </Section>
      <Section title="Background">
        {b.bgUrl && <img src={b.bgUrl} alt="" className="aspect-video w-full rounded object-cover" />}
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton accept="image/*" label={b.bgUrl ? "Replace image" : "Upload image"} onUploaded={(url) => set({ bgUrl: url })} />
          {b.bgUrl && (
            <Button size="sm" variant="ghost" onClick={() => set({ bgUrl: "" })}>
              Remove
            </Button>
          )}
          <input type="color" value={b.bgColor} onChange={(e) => set({ bgColor: e.target.value })} className="ml-auto h-7 w-9 cursor-pointer rounded bg-transparent" title="Background color" />
        </div>
      </Section>
      <Section title="Overlay (transparent PNG, full frame)">
        {b.overlayUrl && <img src={b.overlayUrl} alt="" className="aspect-video w-full rounded bg-black/40 object-contain" />}
        <div className="flex items-center gap-2">
          <UploadButton accept="image/png,image/webp,image/gif" label={b.overlayUrl ? "Replace" : "Upload overlay"} onUploaded={(url) => set({ overlayUrl: url })} />
          {b.overlayUrl && (
            <Button size="sm" variant="ghost" onClick={() => set({ overlayUrl: "" })}>
              Remove
            </Button>
          )}
        </div>
      </Section>
    </div>
  );
}

// ---------------- Scenes & clips ----------------

export function ScenesPanel({ session, snap }) {
  const s = snap.state;
  const setScene = (sc) =>
    session.updateState({
      scene: sc.id,
      sceneTitle: sc.title ?? "",
      sceneSubtitle: sc.subtitle ?? "",
      countdownTo: sc.id === "starting" ? s.countdownTo : null,
    });
  const playClip = (c) => session.updateState({ clip: { url: c.url, name: c.name, playing: true, startedAt: Date.now() } });
  const stopClip = () => session.updateState((st) => ({ clip: { ...st.clip, playing: false } }));
  return (
    <div>
      <Section title="Scenes">
        <div className="grid grid-cols-2 gap-2">
          {SCENES.map((sc) => (
            <Button key={sc.id} size="sm" variant={s.scene === sc.id ? "default" : "secondary"} onClick={() => setScene(sc)}>
              {sc.label}
            </Button>
          ))}
        </div>
        {s.scene !== "stage" && (
          <div className="space-y-2">
            <Input value={s.sceneTitle} onChange={(e) => session.updateState({ sceneTitle: e.target.value })} placeholder="Title" />
            <Input value={s.sceneSubtitle} onChange={(e) => session.updateState({ sceneSubtitle: e.target.value })} placeholder="Subtitle" />
            <div className="flex items-center gap-2">
              <Label className="text-sm">Countdown</Label>
              <Select
                value={s.countdownTo ? "on" : "0"}
                onValueChange={(v) => session.updateState({ countdownTo: v === "0" || v === "on" ? (v === "on" ? s.countdownTo : null) : Date.now() + Number(v) * 60000 })}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  {s.countdownTo && <SelectItem value="on">Running</SelectItem>}
                  <SelectItem value="1">1 minute</SelectItem>
                  <SelectItem value="2">2 minutes</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Section>
      <Section title="Video clips" right={<UploadButton accept="video/*" label="Add" icon={Upload} onUploaded={(url, f) => session.updateState((st) => ({ clips: [...(st.clips ?? []), { id: `c-${uid(6)}`, name: f.name, url }] }))} />}>
        {(s.clips ?? []).length === 0 && <p className="text-sm text-muted-foreground">Upload intros, outros, ads or B-roll and play them full screen with sound.</p>}
        <div className="space-y-2">
          {(s.clips ?? []).map((c) => {
            const playing = s.clip?.url === c.url && s.clip.playing;
            return (
              <div key={c.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${playing ? "border-primary bg-primary/10" : ""}`}>
                <div className="min-w-0 flex-1 truncate">{c.name}</div>
                <Button size="icon" variant={playing ? "destructive" : "secondary"} className="h-8 w-8" onClick={() => (playing ? stopClip() : playClip(c))}>
                  {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => session.updateState((st) => ({ clips: st.clips.filter((x) => x.id !== c.id), clip: playing ? { ...st.clip, playing: false } : st.clip }))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ---------------- Chat ----------------

export function ChatPanel({ session, snap }) {
  const [text, setText] = useState("");
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    session.markChatRead();
  }, [snap.chat.length, session]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {snap.chat.length === 0 && <p className="text-center text-sm text-muted-foreground">Private chat for everyone in the studio. Viewers don&apos;t see this.</p>}
        {snap.chat.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className={`font-semibold ${m.role === "host" ? "text-primary" : ""}`}>{m.name}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-foreground/90">{m.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          session.sendChat(text);
          setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the studio" maxLength={1000} />
        <Button type="submit" size="icon" disabled={!text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

// ---------------- People ----------------

export function PeoplePanel({ session, snap }) {
  const pending = snap.roster.filter((p) => !p.admitted);
  const admitted = snap.roster.filter((p) => p.admitted);
  return (
    <div>
      {snap.isHost && pending.length > 0 && (
        <Section title={`Waiting to join (${pending.length})`}>
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                {p.headline && <div className="truncate text-xs text-muted-foreground">{p.headline}</div>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => session.kick(p.id, "denied")}>
                Deny
              </Button>
              <Button size="sm" onClick={() => session.admit(p.id)}>
                Admit
              </Button>
            </div>
          ))}
        </Section>
      )}
      <Section title={`In the studio (${admitted.length})`}>
        {admitted.map((p) => {
          const st = p.id === snap.me?.id ? "you" : snap.peerStates[p.id] ?? "connecting";
          const onStage = snap.state.stage.includes(p.id);
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${st === "you" || st === "connected" ? "bg-emerald-400" : st === "failed" ? "bg-destructive" : "bg-amber-400"}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  {p.name} {p.role === "host" && <span className="text-xs text-primary">host</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {onStage ? "On stage" : "Backstage"} · {p.media?.mic ? "mic on" : "muted"} · {p.media?.cam ? "camera on" : "camera off"}
                  {p.media?.screen ? " · sharing" : ""}
                </div>
              </div>
              {snap.isHost && p.id !== snap.me?.id && (
                <Button size="sm" variant="secondary" onClick={() => (onStage ? session.removeFromStage(p.id) : session.addToStage(p.id))}>
                  {onStage ? "Remove" : "Add"}
                </Button>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

// ---------------- Local files ----------------

export function FilesPanel({ session, snap }) {
  return (
    <div>
      <Section title="Save copies on this computer">
        <p className="text-sm text-muted-foreground">
          {snap.recFolderName
            ? `Recording straight into the folder "${snap.recFolderName}".`
            : "Without a folder, files stay in this tab and you can download them when recording stops."}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={snap.recordingLocal}
            onClick={() => session.pickRecordingFolder().catch((e) => e.name !== "AbortError" && toast.error(e.message))}
          >
            <FolderDown className="mr-1.5 h-4 w-4" /> {snap.recFolderName ? "Change folder" : "Choose folder"}
          </Button>
          {snap.recFolderName && (
            <Button size="sm" variant="ghost" disabled={snap.recordingLocal} onClick={() => session.clearRecordingFolder()}>
              Stop using folder
            </Button>
          )}
        </div>
      </Section>
      <Section title="Recorded on this device">
        {snap.localFiles.length === 0 && <p className="text-sm text-muted-foreground">Files appear here when a recording starts.</p>}
        <div className="space-y-2">
          {snap.localFiles.map((f) => {
            const pct = f.drive && f.bytes ? Math.min(100, Math.round(((f.uploaded || 0) / f.bytes) * 100)) : null;
            return (
              <div key={f.key} className="space-y-1.5 rounded-lg border p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {f.status === "recording" && <span className="live-dot h-2 w-2 rounded-full bg-[hsl(var(--live))]" />}
                  {f.status === "finishing" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <div className="min-w-0 flex-1 truncate font-medium">{f.label}</div>
                  <span className="text-xs text-muted-foreground">{fmtBytes(f.bytes)}</span>
                </div>
                {f.durationSec ? <div className="text-xs text-muted-foreground">{fmtDuration(f.durationSec)} · {f.fileName}</div> : null}
                {pct !== null && !f.driveUrl && !f.driveError && (
                  <div className="space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-muted-foreground">Google Drive: {pct}% uploaded{f.status === "recording" ? " (uploading as you record)" : ""}</div>
                  </div>
                )}
                {f.driveError && <div className="text-xs text-amber-300">Drive: {f.driveError}. Your local copy is safe.</div>}
                {f.error && <div className="text-xs text-destructive">{f.error}</div>}
                {f.savedTo && <div className="text-xs text-emerald-300">Saved to {f.savedTo}</div>}
                <div className="flex flex-wrap gap-2">
                  {f.blob && (
                    <Button size="sm" variant="secondary" onClick={() => downloadBlob(f.blob, f.fileName)}>
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                    </Button>
                  )}
                  {f.driveUrl && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={f.driveUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in Drive
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
