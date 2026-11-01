import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Droplets, Gauge, ImagePlus, Loader2, RotateCcw, ScanFace, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BG_PRESETS, DEFAULT_FX, FX_PRESETS, presetBackground } from "@/lib/studio/effects";
import { deleteBackground, listBackgrounds, saveBackground, urlFor } from "@/lib/studio/bgstore";
import { VideoView } from "./MediaBits";

function Range({ label, value, onChange, min = 0, max = 1, hint }) {
  const pct = max - min === 1 ? Math.round(value * 100) : Math.round(value * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="tabular-nums text-xs text-muted-foreground">{min < 0 && value > 0 ? "+" : ""}{pct}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={0.01} onValueChange={([v]) => onChange(v)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function thumb(id, brand) {
  const src = presetBackground(id, brand);
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 108;
  c.getContext("2d").drawImage(src, 0, 0, 192, 108);
  return c.toDataURL("image/jpeg", 0.7);
}

export default function EffectsPanel({ session, snap, open, onOpenChange }) {
  const [fx, setFx] = useState(snap.fx ?? DEFAULT_FX);
  const timer = useRef(0);
  const fileRef = useRef(null);
  const brand = snap.state.brand?.color;
  const thumbs = useMemo(() => (open ? Object.fromEntries(BG_PRESETS.map((p) => [p.id, thumb(p.id, brand)])) : {}), [open, brand]);
  const [saved, setSaved] = useState([]);
  const [uploading, setUploading] = useState(false);
  const refreshSaved = () => listBackgrounds().then(setSaved);

  useEffect(() => {
    if (open) {
      setFx(snap.fx ?? DEFAULT_FX);
      refreshSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onUpload = async (file) => {
    setUploading(true);
    try {
      const item = await saveBackground(file);
      await refreshSaved();
      update({ background: "image", bgImage: `stored:${item.id}` });
    } catch (e) {
      toast.error(e.message || "Could not save that image");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id) => {
    await deleteBackground(id);
    if (fx.bgImage === `stored:${id}`) update({ background: "none", bgImage: null });
    refreshSaved();
  };

  const update = (patch) => {
    setFx((prev) => {
      const next = { ...prev, ...patch };
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => session.applyEffects(next), 60);
      return next;
    });
  };

  const presetActive = (p) => Object.entries(p.fx).every(([k, v]) => Math.abs((fx[k] ?? 0) - v) < 0.005);
  const bgActive = (val) => fx.background === "image" && fx.bgImage === val;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Camera effects
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 px-6 pb-6 md:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-xl border bg-black">
              {snap.hasCam ? (
                <VideoView key={snap.localVersion} stream={session.localStream} mirror={fx.mirror !== false} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No camera</div>
              )}
              {snap.fxLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting effects…
                </div>
              )}
            </div>
            {snap.fxError && <p className="text-sm text-amber-300">{snap.fxError}</p>}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Mirror my camera</div>
                <div className="text-xs text-muted-foreground">Raise your right hand and it shows on the right, like a mirror.</div>
              </div>
              <Switch checked={fx.mirror !== false} onCheckedChange={(v) => update({ mirror: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <ScanFace className="h-4 w-4 text-primary" /> Auto-frame
                </div>
                <div className="text-xs text-muted-foreground">Gently pans and zooms to keep you centered.</div>
              </div>
              <Switch checked={!!fx.autoFrame} onCheckedChange={(v) => update({ autoFrame: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Gauge className="h-4 w-4 text-primary" /> Lighter mode (720p)
                </div>
                <div className="text-xs text-muted-foreground">Processes effects at 720p. Turn on if video stutters or your computer runs hot.</div>
              </div>
              <Switch checked={fx.quality === "720p"} onCheckedChange={(v) => update({ quality: v ? "720p" : "1080p" })} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ ...DEFAULT_FX, mirror: fx.mirror, quality: fx.quality })}
              className="text-muted-foreground"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset all effects
            </Button>
          </div>

          <Tabs defaultValue="background">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="background">Background</TabsTrigger>
              <TabsTrigger value="touchup">Touch up</TabsTrigger>
              <TabsTrigger value="color">Color</TabsTrigger>
            </TabsList>

            <TabsContent value="background" className="space-y-4 pt-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => update({ background: "none" })}
                  className={`flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border text-xs ${fx.background === "none" ? "border-primary ring-2 ring-primary/40" : "hover:bg-accent"}`}
                >
                  <Ban className="h-4 w-4" /> None
                </button>
                <button
                  onClick={() => update({ background: "blur" })}
                  className={`flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border text-xs ${fx.background === "blur" ? "border-primary ring-2 ring-primary/40" : "hover:bg-accent"}`}
                >
                  <Droplets className="h-4 w-4" /> Blur
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs hover:bg-accent"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload image
                </button>
                {saved.map((b) => (
                  <div key={b.id} className="group relative">
                    <button
                      onClick={() => update({ background: "image", bgImage: `stored:${b.id}` })}
                      className={`relative block aspect-video w-full overflow-hidden rounded-lg border ${bgActive(`stored:${b.id}`) ? "border-primary ring-2 ring-primary/40" : ""}`}
                      title={b.name}
                    >
                      <img src={urlFor(b)} alt="" className="h-full w-full object-cover" />
                    </button>
                    <button
                      onClick={() => onDelete(b.id)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                      title="Remove from saved backgrounds"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {BG_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => update({ background: "image", bgImage: `preset:${p.id}` })}
                    className={`relative aspect-video overflow-hidden rounded-lg border ${bgActive(`preset:${p.id}`) ? "border-primary ring-2 ring-primary/40" : ""}`}
                  >
                    {thumbs[p.id] && <img src={thumbs[p.id]} alt="" className="h-full w-full object-cover" />}
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{p.label}</span>
                  </button>
                ))}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onUpload(f);
                }}
              />
              {fx.background === "blur" && <Range label="Blur strength" value={fx.blur ?? 0.6} onChange={(v) => update({ blur: v })} />}
              <p className="text-xs text-muted-foreground">
                Backgrounds are cut out on your device with edge refinement around hair and shoulders. Uploaded images are saved in this browser for next time and never leave your computer. Even, front-facing light gives the cleanest edges.
              </p>
            </TabsContent>

            <TabsContent value="touchup" className="space-y-4 pt-3">
              <div className="flex flex-wrap gap-2">
                {FX_PRESETS.map((p) => (
                  <Button key={p.id} size="sm" variant={presetActive(p) ? "default" : "secondary"} onClick={() => update(p.fx)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <Range label="Smooth skin" value={fx.smoothing} onChange={(v) => update({ smoothing: v })} hint="Softens skin only; eyes, hair and edges stay sharp." />
              <Range label="Clarity" value={fx.clarity} onChange={(v) => update({ clarity: v })} hint="Crisper detail in eyes, hair and clothing." />
              <Range label="Low-light boost" value={fx.lowLight} onChange={(v) => update({ lowLight: v })} hint="Lifts shadows in a dim room without blowing out highlights." />
            </TabsContent>

            <TabsContent value="color" className="space-y-4 pt-3">
              <Range label="Brightness" min={-1} max={1} value={fx.brightness} onChange={(v) => update({ brightness: v })} />
              <Range label="Contrast" min={-1} max={1} value={fx.contrast} onChange={(v) => update({ contrast: v })} />
              <Range label="Saturation" min={-1} max={1} value={fx.saturation} onChange={(v) => update({ saturation: v })} />
              <Range label="Warmth" min={-1} max={1} value={fx.warmth} onChange={(v) => update({ warmth: v })} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
