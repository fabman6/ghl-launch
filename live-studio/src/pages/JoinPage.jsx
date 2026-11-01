import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { invokeFn } from "@/lib/studio/api";
import StudioFlow from "@/components/studio/StudioFlow";
import { Logo } from "@/components/AppShell";

export default function JoinPage() {
  const { studioId } = useParams();
  const [params] = useSearchParams();
  const code = params.get("code") || "";
  const [left, setLeft] = useState(false);
  const access = useQuery({
    queryKey: ["studio-access", studioId, code],
    queryFn: async () => (await invokeFn("studioAccess", { studioId, code })).data,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (left) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <Logo />
        <h1 className="text-2xl font-bold">Thanks for joining!</h1>
        <p className="text-muted-foreground">You can close this tab.</p>
      </div>
    );
  }
  if (access.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (access.error || !access.data?.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <Logo />
        <h1 className="text-2xl font-bold">This invite link doesn&apos;t work</h1>
        <p className="max-w-md text-muted-foreground">Ask the host for a fresh link. {access.error?.message}</p>
      </div>
    );
  }
  return (
    <StudioFlow
      role={access.data.role}
      studioId={studioId}
      studioTitle={access.data.title}
      subtitle="Set up your camera and mic. The host will bring you into the studio."
      code={code}
      savedSettings={{}}
      inviteLink={window.location.href}
      onExit={() => setLeft(true)}
    />
  );
}
