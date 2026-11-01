import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, FolderDown, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invokeFn } from "@/lib/studio/api";
import { listDevices } from "@/lib/studio/devices";
import { DevicePicker } from "./Lobby";

function Option({ title, desc, checked, onChange, disabled }) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border p-3 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-accent/50"}`}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}

export function RecordDialog({ session, snap, open, onOpenChange }) {
  const [program, setProgram] = useState(true);
  const [isolated, setIsolated] = useState(true);
  const [audioOnly, setAudioOnly] = useState(true);
  const [drive, setDrive] = useState(true);
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ["drive-status"],
    queryFn: async () => (await invokeFn("driveUpload", { action: "status" })).data,
    enabled: open,
  });
  const driveOk = status.data?.connected;
  useEffect(() => {
    if (status.data && !status.data.connected) setDrive(false);
  }, [status.data]);

  const start = async () => {
    setBusy(true);
    try {
      await session.startRecording({ program, isolated, audioOnly, drive: drive && driveOk });
      onOpenChange(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start recording</DialogTitle>
          <DialogDescription>Recording works on its own or while you&apos;re live.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Option
            title="Composite video"
            desc="The finished show exactly as it looks on stage: layout, banners, logo and all audio."
            checked={program}
            onChange={setProgram}
          />
          <Option
            title="Separate local tracks for every person"
            desc="Each person's camera and mic recorded in full quality on their own device, unaffected by internet hiccups. Ideal for editing."
            checked={isolated}
            onChange={setIsolated}
          />
          <Option
            title="Extra audio-only file per person"
            desc="Clean voice tracks for podcast editing."
            checked={audioOnly && isolated}
            onChange={setAudioOnly}
            disabled={!isolated}
          />
          <Option
            title="Save to Google Drive"
            desc={
              status.isLoading
                ? "Checking your Drive connection…"
                : driveOk
                  ? `Uploads while you record into "Live Studio Recordings" (${status.data.account ?? "connected"}).`
                  : "Google Drive isn't connected yet. Connect it in Settings."
            }
            checked={drive && !!driveOk}
            onChange={setDrive}
            disabled={!driveOk}
          />
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <div>
              <div className="font-medium">Local copy</div>
              <div className="text-xs text-muted-foreground">
                {snap.recFolderName ? `Writing into folder "${snap.recFolderName}"` : "Kept in this tab for download (or pick a folder to write straight to disk)."}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => session.pickRecordingFolder().catch((e) => e.name !== "AbortError" && toast.error(e.message))}>
              <FolderDown className="mr-1.5 h-4 w-4" /> Folder
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={start} disabled={busy || (!program && !isolated)} className="bg-[hsl(var(--live))] hover:bg-[hsl(var(--live))]/90">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Start recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GoLiveDialog({ session, snap, open, onOpenChange }) {
  const dests = useQuery({ queryKey: ["destinations"], queryFn: () => base44.entities.Destination.list(), enabled: open });
  const status = useQuery({ queryKey: ["live-status"], queryFn: async () => (await invokeFn("liveControl", { action: "status" })).data, enabled: open });
  const [selected, setSelected] = useState(null);
  const list = dests.data ?? [];
  const chosen = selected ?? list.filter((d) => d.enabled).map((d) => d.id);
  const needsRestream = list.some((d) => chosen.includes(d.id) && d.platform !== "whip");
  const blocked = needsRestream && status.data && !status.data.restreamConfigured;

  const go = async () => {
    await session.goLive(chosen);
    if (session.live.active) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Go live</DialogTitle>
          <DialogDescription>Pick where to broadcast. Everything on stage is sent to every destination at once.</DialogDescription>
        </DialogHeader>
        {dests.isLoading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No destinations yet.{" "}
            <Link className="text-primary underline" to="/destinations" target="_blank">
              Add YouTube, Facebook, Twitch…
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-accent/50">
                <Checkbox
                  checked={chosen.includes(d.id)}
                  onCheckedChange={(v) => setSelected(v ? [...chosen, d.id] : chosen.filter((x) => x !== d.id))}
                />
                <Radio className="h-4 w-4 text-primary" />
                <span className="flex-1 text-sm font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.platform === "whip" ? "WHIP" : "RTMP"}</span>
              </label>
            ))}
            <Link className="block text-right text-xs text-primary underline" to="/destinations" target="_blank">
              Manage destinations
            </Link>
          </div>
        )}
        {blocked && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            RTMP destinations need Cloudflare Stream for restreaming. Add the Cloudflare secrets (see Settings) or choose a WHIP destination.
          </div>
        )}
        {snap.live.error && <div className="text-sm text-destructive">{snap.live.error}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={go} disabled={!chosen.length || blocked || snap.live.starting} className="bg-[hsl(var(--live))] hover:bg-[hsl(var(--live))]/90">
            {snap.live.starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Go live
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LiveOutputs({ outputs }) {
  if (!outputs?.length) return null;
  return (
    <div className="space-y-1 text-xs">
      {outputs.map((o) => (
        <div key={o.id} className="flex items-center gap-1.5">
          {o.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
          <span>{o.name}</span>
          {o.error && <span className="text-muted-foreground">({o.error})</span>}
        </div>
      ))}
    </div>
  );
}

export function InviteDialog({ link, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite guests</DialogTitle>
          <DialogDescription>Anyone with this link can ask to join. You admit them from the People tab; they wait backstage until you add them to the stage.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link} onFocus={(e) => e.target.select()} />
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast.success("Invite link copied");
            }}
          >
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Guests don&apos;t need an account. Chrome or Edge on a laptop gives the best quality.</p>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsDialog({ session, snap, open, onOpenChange }) {
  const [devices, setDevices] = useState({ cameras: [], mics: [], speakers: [] });
  const [camId, setCamId] = useState(session.prefs.camId || "");
  const [micId, setMicId] = useState(session.prefs.micId || "");
  const [speakerId, setSpeakerId] = useState(session.prefs.speakerId || "");
  const [resolution, setResolution] = useState(session.prefs.resolution || "1080p");
  const [name, setName] = useState(session.name);
  const [headline, setHeadline] = useState(session.headline);
  const [quality, setQuality] = useState(session.prefs.quality || "1080p");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) listDevices().then(setDevices).catch(() => {});
  }, [open]);

  const applyDevices = async () => {
    setBusy(true);
    try {
      if (camId !== (session.prefs.camId || "") || resolution !== (session.prefs.resolution || "1080p")) {
        await session.switchCamera(camId || undefined, resolution);
        session.prefs.camId = camId;
        session.prefs.resolution = resolution;
      }
      if (micId !== (session.prefs.micId || "")) {
        await session.switchMic(micId || undefined, session.prefs.processing);
        session.prefs.micId = micId;
      }
      if (speakerId !== (session.prefs.speakerId || "")) {
        session.setSpeaker(speakerId);
        session.prefs.speakerId = speakerId;
      }
      toast.success("Devices updated");
      onOpenChange(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="devices">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="output" disabled={!snap.isHost}>
              Output
            </TabsTrigger>
          </TabsList>
          <TabsContent value="devices" className="space-y-3 pt-3">
            {snap.recordingLocal && <p className="text-sm text-amber-300">Devices can&apos;t change while you are recording.</p>}
            <DevicePicker label="Camera" devices={devices.cameras} value={camId} onChange={setCamId} />
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
            <DevicePicker label="Microphone" devices={devices.mics} value={micId} onChange={setMicId} />
            {devices.speakers.length > 0 && <DevicePicker label="Speakers" devices={devices.speakers} value={speakerId} onChange={setSpeakerId} />}
            <DialogFooter>
              <Button onClick={applyDevices} disabled={busy || snap.recordingLocal}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="profile" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label>Headline</Label>
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} />
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  session.setProfile({ name: name.trim() || session.name, headline: headline.trim() });
                  onOpenChange(false);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="output" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Program resolution (stream + composite recording)</Label>
              <Select
                value={quality}
                onValueChange={(v) => {
                  setQuality(v);
                  session.setQuality(v);
                }}
                disabled={snap.live.active || snap.state.recording}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p (lighter on slower computers)</SelectItem>
                  <SelectItem value="1080p">1080p Full HD</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Individual local tracks always record at your camera&apos;s full quality.</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
