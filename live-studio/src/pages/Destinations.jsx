import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const PLATFORMS = {
  youtube: { label: "YouTube Live", url: "rtmp://a.rtmp.youtube.com/live2", help: "YouTube Studio → Go live → Stream → Stream key" },
  facebook: { label: "Facebook Live", url: "rtmps://live-api-s.facebook.com:443/rtmp/", help: "Facebook Live Producer → Streaming software → Stream key" },
  twitch: { label: "Twitch", url: "rtmp://live.twitch.tv/app", help: "Twitch Creator Dashboard → Settings → Stream → Primary stream key" },
  linkedin: { label: "LinkedIn Live", url: "", help: "LinkedIn Events / Live → Streaming tool → copy the Stream URL and key" },
  x: { label: "X (Twitter)", url: "", help: "X Media Studio → Producer → Sources → RTMP URL and key" },
  kick: { label: "Kick", url: "", help: "Kick Dashboard → Settings → Stream URL & Key" },
  instagram: { label: "Instagram Live", url: "", help: "Instagram (professional account) → Live Producer → Stream URL and key" },
  custom_rtmp: { label: "Custom RTMP(S)", url: "", help: "Any RTMP or RTMPS server" },
  whip: { label: "WHIP endpoint", url: "", help: "Any WebRTC WHIP ingest URL (no restream service needed)" },
};

function DestinationDialog({ dest, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(
    dest ?? { name: "", platform: "youtube", rtmp_url: PLATFORMS.youtube.url, stream_key: "", whip_url: "", whip_token: "", enabled: true }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isWhip = form.platform === "whip";
  const save = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name || PLATFORMS[form.platform].label,
        platform: form.platform,
        rtmp_url: isWhip ? "" : form.rtmp_url,
        stream_key: isWhip ? "" : form.stream_key,
        whip_url: isWhip ? form.whip_url : "",
        whip_token: isWhip ? form.whip_token : "",
        enabled: form.enabled,
      };
      return dest ? base44.entities.Destination.update(dest.id, data) : base44.entities.Destination.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["destinations"] });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const valid = isWhip ? form.whip_url : form.rtmp_url && form.stream_key;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dest ? "Edit destination" : "Add destination"}</DialogTitle>
          <DialogDescription>{PLATFORMS[form.platform].help}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select
              value={form.platform}
              onValueChange={(v) => setForm((f) => ({ ...f, platform: v, rtmp_url: PLATFORMS[v].url || f.rtmp_url }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORMS).map(([k, p]) => (
                  <SelectItem key={k} value={k}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={PLATFORMS[form.platform].label} />
          </div>
          {isWhip ? (
            <>
              <div className="space-y-2">
                <Label>WHIP URL</Label>
                <Input value={form.whip_url} onChange={(e) => set("whip_url", e.target.value)} placeholder="https://…/whip" />
              </div>
              <div className="space-y-2">
                <Label>Bearer token (optional)</Label>
                <Input type="password" value={form.whip_token} onChange={(e) => set("whip_token", e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Server URL</Label>
                <Input value={form.rtmp_url} onChange={(e) => set("rtmp_url", e.target.value)} placeholder="rtmp://…" />
              </div>
              <div className="space-y-2">
                <Label>Stream key</Label>
                <Input type="password" value={form.stream_key} onChange={(e) => set("stream_key", e.target.value)} />
              </div>
            </>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Selected by default when going live</Label>
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Destinations() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null);
  const { data: list = [], isLoading } = useQuery({ queryKey: ["destinations"], queryFn: () => base44.entities.Destination.list() });
  const remove = useMutation({
    mutationFn: (id) => base44.entities.Destination.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["destinations"] }),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Destinations</h1>
          <p className="mt-1 text-muted-foreground">Stream to several platforms at the same time. Keys are only visible to you.</p>
        </div>
        <Button onClick={() => setEditing({})}>
          <Plus className="mr-2 h-4 w-4" /> Add destination
        </Button>
      </div>
      {isLoading ? null : list.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
          <Radio className="h-8 w-8 text-primary" />
          <p className="text-muted-foreground">Add YouTube, Facebook, Twitch, LinkedIn, X, Kick or any RTMP / WHIP server.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((d) => (
            <Card key={d.id} className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Radio className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.name}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {PLATFORMS[d.platform]?.label} · {d.platform === "whip" ? d.whip_url : d.rtmp_url}
                </div>
              </div>
              {d.enabled && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">default</span>}
              <Button variant="ghost" size="icon" onClick={() => setEditing(d)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => confirm(`Remove ${d.name}?`) && remove.mutate(d.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
      {editing && <DestinationDialog dest={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </div>
  );
}
