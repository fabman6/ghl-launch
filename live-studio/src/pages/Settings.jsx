import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, Network, Radio, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { invokeFn } from "@/lib/studio/api";

function Status({ ok, loading, okText, badText }) {
  if (loading) return <span className="text-sm text-muted-foreground">Checking…</span>;
  return ok ? (
    <span className="flex items-center gap-1 text-sm text-emerald-400">
      <CheckCircle2 className="h-4 w-4" /> {okText}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-sm text-amber-400">
      <XCircle className="h-4 w-4" /> {badText}
    </span>
  );
}

export default function Settings() {
  const drive = useQuery({ queryKey: ["drive-status"], queryFn: async () => (await invokeFn("driveUpload", { action: "status" })).data });
  const live = useQuery({ queryKey: ["live-status"], queryFn: async () => (await invokeFn("liveControl", { action: "status" })).data });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Connections that power recording uploads and live streaming.</p>
      </div>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <CloudUpload className="h-5 w-5 text-primary" />
          <h2 className="flex-1 font-semibold">Google Drive</h2>
          <Status
            loading={drive.isLoading}
            ok={drive.data?.connected}
            okText={`Connected${drive.data?.account ? ` as ${drive.data.account}` : ""}`}
            badText="Not connected"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Recordings upload to your Drive while you record (Riverside-style progressive upload), so a crash or closed tab loses at most a few
          seconds. Files land in <b>Live Studio Recordings / Studio name / Session</b>. Guests&apos; files go to your Drive too; they never need a
          Google account.
        </p>
        {!drive.data?.connected && !drive.isLoading && (
          <p className="text-sm">
            To connect: open this app in the Base44 editor → <b>Integrations</b> → <b>Google Drive</b> → Connect, and approve access with the
            Google account that should store your recordings.
          </p>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-primary" />
          <h2 className="flex-1 font-semibold">Live streaming (multistream to RTMP)</h2>
          <Status loading={live.isLoading} ok={live.data?.restreamConfigured} okText="Cloudflare Stream ready" badText="Not configured" />
        </div>
        <p className="text-sm text-muted-foreground">
          Browsers can&apos;t send RTMP, so the studio sends its program feed over WebRTC to Cloudflare Stream, which pushes it to YouTube, Facebook,
          Twitch, LinkedIn, X, Kick or any RTMP server at once. WHIP destinations work without this.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>In Cloudflare, enable Stream on your account (Stream → Get started).</li>
          <li>Create an API token with the <b>Stream: Edit</b> permission.</li>
          <li>
            In the Base44 editor → <b>Settings → Secrets</b>, add <code>CLOUDFLARE_ACCOUNT_ID</code> and <code>CLOUDFLARE_STREAM_API_TOKEN</code>.
          </li>
          <li>Add your stream keys on the Destinations page.</li>
        </ol>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <Network className="h-5 w-5 text-primary" />
          <h2 className="flex-1 font-semibold">Guest connections (optional TURN relay)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Guests connect peer-to-peer. If a guest sits behind a strict corporate or hotel firewall, add a TURN relay as secrets:{" "}
          <code>CLOUDFLARE_TURN_KEY_ID</code> + <code>CLOUDFLARE_TURN_KEY_API_TOKEN</code>, or <code>TURN_URLS</code>, <code>TURN_USERNAME</code>,{" "}
          <code>TURN_CREDENTIAL</code>.
        </p>
      </Card>
    </div>
  );
}
