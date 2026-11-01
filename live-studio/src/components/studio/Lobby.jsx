import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CameraOff, Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCamera, getMicrophone, listDevices, mediaErrorMessage } from "@/lib/studio/devices";
import { useTrackLevel } from "./hooks";
import { StaticLevel, VideoView } from "./MediaBits";

const NAME_KEY = "live-studio-name";
const HEADLINE_KEY = "live-studio-headline";
const PREFS_KEY = "live-studio-devices";

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function DevicePicker({ label, devices, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || "default-none"} onValueChange={(v) => onChange(v === "default-none" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent>
          {devices.length === 0 && <SelectItem value="default-none">Default</SelectItem>}
          {devices.map((d, i) => (
            <SelectItem key={d.deviceId || i} value={d.deviceId || `dev-${i}`}>
              {d.label || `${label} ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Pre-flight screen: pick devices, check framing and levels, set the name
 * that appears on stage, then hand the live tracks to the studio.
 */
export default function Lobby({ role, title, subtitle, defaultName = "", onEnter, busy = false, notice }) {
  const prefs = useRef(load(PREFS_KEY, { camId: "", micId: "", speakerId: "", resolution: "1080p", processing: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
  const [name, setName] = useState(() => load(NAME_KEY, "") || defaultName);
  const [headline, setHeadline] = useState(() => load(HEADLINE_KEY, ""));
  const [devices, setDevices] = useState({ cameras: [], mics: [], speakers: [] });
  const [camId, setCamId] = useState(prefs.current.camId);
  const [micId, setMicId] = useState(prefs.current.micId);
  const [speakerId, setSpeakerId] = useState(prefs.current.speakerId);
  const [resolution, setResolution] = useState(prefs.current.resolution);
  const [processing, setProcessing] = useState(prefs.current.processing);
  const [camTrack, setCamTrack] = useState(null);
  const [micTrack, setMicTrack] = useState(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camError, setCamError] = useState("");
  const [micError, setMicError] = useState("");
  const [loadingCam, setLoadingCam] = useState(true);
  const handedOff = useRef(false);
  const tracks = useRef({ cam: null, mic: null });
  const micLevel = useTrackLevel(micOn ? micTrack : null);
  const preview = useMemo(() => (camTrack ? new MediaStream([camTrack]) : null), [camTrack]);

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await listDevices());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCam(true);
    getCamera({ deviceId: camId || undefined, resolution })
      .then((t) => {
        if (cancelled) return t.stop();
        tracks.current.cam?.stop();
        tracks.current.cam = t;
        setCamTrack(t);
        setCamError("");
        refreshDevices();
      })
      .catch((e) => !cancelled && setCamError(mediaErrorMessage(e)))
      .finally(() => !cancelled && setLoadingCam(false));
    return () => {
      cancelled = true;
    };
  }, [camId, resolution, refreshDevices]);

  useEffect(() => {
    let cancelled = false;
    getMicrophone({ deviceId: micId || undefined, ...processing })
      .then((t) => {
        if (cancelled) return t.stop();
        tracks.current.mic?.stop();
        tracks.current.mic = t;
        setMicTrack(t);
        setMicError("");
        refreshDevices();
      })
      .catch((e) => !cancelled && setMicError(mediaErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [micId, processing, refreshDevices]);

  useEffect(() => {
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      if (!handedOff.current) {
        tracks.current.cam?.stop();
        tracks.current.mic?.stop();
      }
    };
  }, [refreshDevices]);

  const enter = () => {
    save(NAME_KEY, name.trim());
    save(HEADLINE_KEY, headline.trim());
    const p = { camId, micId, speakerId, resolution, processing };
    save(PREFS_KEY, p);
    handedOff.current = true;
    onEnter({
      camTrack,
      micTrack,
      camOn: camOn && !!camTrack,
      micOn: micOn && !!micTrack,
      name: name.trim() || (role === "host" ? "Host" : "Guest"),
      headline: headline.trim(),
      prefs: p,
    });
  };

  return (
    <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl border bg-black">
          {camTrack && camOn ? (
            <VideoView stream={preview} mirror />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {loadingCam ? <Loader2 className="h-6 w-6 animate-spin" /> : <CameraOff className="h-10 w-10" />}
            </div>
          )}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            <Button
              size="icon"
              variant={micOn ? "secondary" : "destructive"}
              className="h-11 w-11 rounded-full"
              disabled={!micTrack}
              onClick={() => setMicOn((v) => !v)}
              title={micOn ? "Mute" : "Unmute"}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button
              size="icon"
              variant={camOn ? "secondary" : "destructive"}
              className="h-11 w-11 rounded-full"
              disabled={!camTrack}
              onClick={() => setCamOn((v) => !v)}
              title={camOn ? "Turn camera off" : "Turn camera on"}
            >
              {camOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <StaticLevel level={micOn ? micLevel : 0} className="flex-1" />
        </div>
        {(camError || micError) && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {camError && <div>Camera: {camError}</div>}
              {micError && <div>Microphone: {micError}</div>}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-primary">{role === "host" ? "Host" : "You're invited"}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="headline">Title / headline (shown under your name)</Label>
            <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Founder, Acme Co." maxLength={80} />
          </div>
          <DevicePicker label="Camera" devices={devices.cameras} value={camId} onChange={setCamId} />
          <DevicePicker label="Microphone" devices={devices.mics} value={micId} onChange={setMicId} />
          {devices.speakers.length > 0 && <DevicePicker label="Speakers" devices={devices.speakers} value={speakerId} onChange={setSpeakerId} />}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Camera quality</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p HD</SelectItem>
                  <SelectItem value="1080p">1080p Full HD</SelectItem>
                  <SelectItem value="4k">4K (if supported)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-lg border p-2.5 text-sm">
              <label className="flex items-center justify-between gap-2">
                Noise suppression
                <Switch checked={processing.noiseSuppression} onCheckedChange={(v) => setProcessing((p) => ({ ...p, noiseSuppression: v }))} />
              </label>
              <label className="flex items-center justify-between gap-2">
                Echo cancellation
                <Switch checked={processing.echoCancellation} onCheckedChange={(v) => setProcessing((p) => ({ ...p, echoCancellation: v }))} />
              </label>
            </div>
          </div>
        </div>
        {notice}
        <Button size="lg" className="w-full" disabled={busy || (!camTrack && !micTrack)} onClick={enter}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {role === "host" ? "Enter studio" : "Join studio"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Use headphones to avoid echo. Your camera and mic are also recorded in full quality on this device during recordings.
        </p>
      </div>
    </div>
  );
}
