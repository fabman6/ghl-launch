import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invokeFn } from "@/lib/studio/api";
import { MAIN_PLATFORMS, MORE_PLATFORMS, PLATFORMS, PlatformIcon } from "@/components/studio/platforms";

export { PLATFORMS };

const EDITOR_URL = "https://app.base44.com/apps/6ae7392a088c187242bd1e07/editor/preview";

export function useLiveStatus(enabled = true) {
  return useQuery({
    queryKey: ["live-status"],
    queryFn: async () => (await invokeFn("liveControl", { action: "status" })).data,
    enabled,
    staleTime: 60_000,
  });
}

export function StreamingSetupCard({ onRecheck, checking }) {
  return (
    <Card className="border-primary/40 bg-primary/5 p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-[16rem] flex-1 space-y-2">
          <h2 className="font-semibold">Switch on live streaming (one-time setup)</h2>
          <p className="text-sm text-muted-foreground">
            Browsers can&apos;t send video to YouTube or Facebook directly, so the studio sends one feed to Cloudflare Stream, which pushes it to every
            platform at once. Recording works without this.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              In Cloudflare, open <b>Stream</b> and subscribe (about $5 a month).
            </li>
            <li>
              Create an API token with the <b>Stream: Edit</b> permission, and copy your Account ID.
            </li>
            <li>
              In the Base44 editor go to <b>Settings → Secrets</b> and add <code className="text-xs">CLOUDFLARE_ACCOUNT_ID</code> and{" "}
              <code className="text-xs">CLOUDFLARE_STREAM_API_TOKEN</code>.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" asChild>
              <a href="https://dash.cloudflare.com/?to=/:account/stream" target="_blank" rel="noreferrer">
                Open Cloudflare <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={EDITOR_URL} target="_blank" rel="noreferrer">
                Open Base44 secrets <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={onRecheck} disabled={checking}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Check again
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Guided "connect" for platforms that work with a stream key. */
function KeyDialog({ platform, dest, onClose }) {
  const qc = useQueryClient();
  const p = PLATFORMS[platform];
  const each = p.mode === "each";
  const whip = p.mode === "whip";
  const [name, setName] = useState(dest?.name ?? p.label);
  const [url, setUrl] = useState(dest?.rtmp_url ?? dest?.whip_url ?? p.url ?? "");
  const [key, setKey] = useState(dest?.stream_key ?? dest?.whip_token ?? "");
  const save = useMutation({
    mutationFn: () => {
      const data = {
        name: name.trim() || p.label,
        platform,
        connection: "key",
        key_each_time: each,
        rtmp_url: whip ? "" : url.trim(),
        stream_key: whip || each ? "" : key.trim(),
        whip_url: whip ? url.trim() : "",
        whip_token: whip ? key.trim() : "",
        enabled: dest?.enabled ?? true,
      };
      return dest ? base44.entities.Destination.update(dest.id, data) : base44.entities.Destination.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["destinations"] });
      toast.success(`${p.label} connected`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const valid = whip ? url.trim() : each ? true : url.trim() && key.trim();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <PlatformIcon platform={platform} />
            <div>
              <DialogTitle>Connect {p.label}</DialogTitle>
              {p.blurb && <DialogDescription>{p.blurb}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <ol className="space-y-2">
          {(p.steps ?? []).map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">{i + 1}</span>
              <span className="text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
        {p.keyUrl && (
          <Button variant="secondary" className="w-full" asChild>
            <a href={p.keyUrl} target="_blank" rel="noreferrer">
              Open {p.label} <ExternalLink className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {!each && (
            <>
              {(!p.url || whip) && (
                <div className="space-y-1.5">
                  <Label>{whip ? "WHIP URL" : "Server URL"}</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={whip ? "https://…" : "rtmp://…"} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{whip ? "Token (optional)" : "Stream key"}</Label>
                <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste here" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dest ? "Save" : each ? `Add ${p.label}` : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusChip({ tone, children }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-300"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-secondary text-muted-foreground";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function PlatformCard({ platform, account, dests, onConnectKey, onEdit, onRemove, onToggle, onPrivacy, onConnectAccount, busy, onRecheck, checking }) {
  const p = PLATFORMS[platform];
  const dest = dests[0];
  const isYouTube = platform === "youtube";
  const ytBlocked = isYouTube && account?.connected && account.liveEnabled === false;

  let status;
  if (dest && !ytBlocked) status = <StatusChip tone="ok"><Check className="h-3 w-3" /> Ready</StatusChip>;
  else if (ytBlocked) status = <StatusChip tone="warn">Live not enabled</StatusChip>;
  else status = <StatusChip>Not set up</StatusChip>;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={platform} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{p.label}</h3>
            {status}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {isYouTube
              ? account?.connected
                ? `Channel: ${account.name}`
                : "Account not connected"
              : p.mode === "each"
                ? "New stream key for each live"
                : "Persistent stream key"}
          </p>
        </div>
      </div>

      <p className="mt-3 flex-1 text-sm text-muted-foreground">{p.blurb}</p>

      {ytBlocked && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          YouTube hasn&apos;t enabled live streaming on this channel yet. Turn it on once; the first time can take up to 24 hours.
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" asChild>
              <a href="https://www.youtube.com/features" target="_blank" rel="noreferrer">
                Enable live on YouTube <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={onRecheck} disabled={checking}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Check again
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!dest ? (
          isYouTube ? (
            account?.connected ? (
              <Button onClick={onConnectAccount} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Connect
              </Button>
            ) : (
              <Button asChild>
                <a href={EDITOR_URL} target="_blank" rel="noreferrer">
                  Connect YouTube account <ExternalLink className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
            )
          ) : (
            <Button onClick={() => onConnectKey(platform)}>Connect</Button>
          )
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={dest.enabled} onCheckedChange={(v) => onToggle(dest, v)} /> On by default
            </label>
            {isYouTube && (
              <Select value={dest.privacy || "public"} onValueChange={(v) => onPrivacy(dest, v)}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="ml-auto flex gap-1">
              {!isYouTube && (
                <Button size="sm" variant="ghost" onClick={() => onEdit(dest)}>
                  Edit
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Disconnect" onClick={() => onRemove(dest)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default function Destinations() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // { platform, dest? }
  const status = useLiveStatus();
  const { data: list = [], isLoading } = useQuery({ queryKey: ["destinations"], queryFn: () => base44.entities.Destination.list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["destinations"] });
  const update = useMutation({ mutationFn: ({ id, data }) => base44.entities.Destination.update(id, data), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id) => base44.entities.Destination.delete(id), onSuccess: refresh });
  const connectYouTube = useMutation({
    mutationFn: () =>
      base44.entities.Destination.create({
        name: status.data?.accounts?.youtube?.name || "YouTube",
        platform: "youtube",
        connection: "account",
        privacy: "public",
        enabled: true,
      }),
    onSuccess: () => {
      refresh();
      toast.success("YouTube connected");
    },
    onError: (e) => toast.error(e.message),
  });

  const accounts = status.data?.accounts ?? {};
  const byPlatform = (pl) => list.filter((d) => d.platform === pl && (pl !== "youtube" || d.connection === "account"));
  const others = list.filter((d) => !MAIN_PLATFORMS.includes(d.platform) || (d.platform === "youtube" && d.connection !== "account"));
  const recheck = () => qc.invalidateQueries({ queryKey: ["live-status"] });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Destinations</h1>
        <p className="mt-1 text-muted-foreground">Connect where your show goes live. Pick any mix of them each time you hit Go live.</p>
      </div>

      {status.data && !status.data.restreamConfigured && <StreamingSetupCard onRecheck={recheck} checking={status.isFetching} />}

      <section className="grid gap-4 md:grid-cols-2">
        {MAIN_PLATFORMS.map((pl) => (
          <PlatformCard
            key={pl}
            platform={pl}
            account={accounts[pl]}
            dests={byPlatform(pl)}
            busy={connectYouTube.isPending || isLoading}
            checking={status.isFetching}
            onRecheck={recheck}
            onConnectAccount={() => connectYouTube.mutate()}
            onConnectKey={(platform) => setDialog({ platform })}
            onEdit={(dest) => setDialog({ platform: dest.platform, dest })}
            onRemove={(dest) => confirm(`Disconnect ${dest.name}?`) && remove.mutate(dest.id)}
            onToggle={(dest, v) => update.mutate({ id: dest.id, data: { enabled: v } })}
            onPrivacy={(dest, v) => update.mutate({ id: dest.id, data: { privacy: v } })}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">More platforms</h2>
        <div className="flex flex-wrap gap-2">
          {MORE_PLATFORMS.map((pl) => (
            <Button key={pl} variant="secondary" onClick={() => setDialog({ platform: pl })}>
              <PlatformIcon platform={pl} size="sm" className="-ml-1 mr-2" /> {PLATFORMS[pl].label}
              <Plus className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          ))}
        </div>
        {others.length > 0 && (
          <div className="grid gap-2">
            {others.map((d) => (
              <Card key={d.id} className="flex items-center gap-3 p-3">
                <PlatformIcon platform={d.platform} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{d.platform === "whip" ? d.whip_url : d.rtmp_url}</div>
                </div>
                <Switch checked={d.enabled} onCheckedChange={(v) => update.mutate({ id: d.id, data: { enabled: v } })} />
                <Button size="sm" variant="ghost" onClick={() => setDialog({ platform: d.platform, dest: d })}>
                  Edit
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => confirm(`Remove ${d.name}?`) && remove.mutate(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {dialog && <KeyDialog platform={dialog.platform} dest={dialog.dest} onClose={() => setDialog(null)} />}
    </div>
  );
}
