import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, CloudUpload, Network, Radio, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { invokeFn } from "@/lib/studio/api";
import { useLiveStatus } from "@/pages/Destinations";

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

function Row({ icon: Icon, title, status, children }) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="flex-1 font-semibold">{title}</h2>
        {status}
      </div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </Card>
  );
}

export default function Settings() {
  const drive = useQuery({ queryKey: ["drive-status"], queryFn: async () => (await invokeFn("driveUpload", { action: "status" })).data });
  const live = useLiveStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">The connections behind recording and streaming.</p>
      </div>

      <Row
        icon={CloudUpload}
        title="Google Drive"
        status={
          <Status
            loading={drive.isLoading}
            ok={drive.data?.connected}
            okText={`Connected${drive.data?.account ? ` · ${drive.data.account}` : ""}`}
            badText="Not connected"
          />
        }
      >
        Recordings upload while you record into <b className="text-foreground">Live Studio Recordings / Studio / Session</b>, including your
        guests&apos; files. Guests never need a Google account.
        {!drive.data?.connected && !drive.isLoading && (
          <p className="mt-2 text-foreground">Connect it in the Base44 editor under Integrations → Google Drive.</p>
        )}
      </Row>

      <Link to="/destinations" className="block">
        <Card className="flex items-center gap-3 p-5 transition hover:bg-accent/40">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Radio className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold">Live streaming</h2>
            <p className="text-sm text-muted-foreground">YouTube, Facebook, Instagram, LinkedIn and more.</p>
          </div>
          <Status loading={live.isLoading} ok={live.data?.restreamConfigured} okText="Ready" badText="Setup needed" />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Card>
      </Link>

      <Row icon={Network} title="Guest connections">
        Guests connect directly to each other. If someone sits behind a strict office or hotel firewall, add a relay with the secrets{" "}
        <code>CLOUDFLARE_TURN_KEY_ID</code> + <code>CLOUDFLARE_TURN_KEY_API_TOKEN</code> (or <code>TURN_URLS</code>, <code>TURN_USERNAME</code>,{" "}
        <code>TURN_CREDENTIAL</code>).
      </Row>
    </div>
  );
}
