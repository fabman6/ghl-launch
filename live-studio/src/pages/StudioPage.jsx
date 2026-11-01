import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import StudioFlow from "@/components/studio/StudioFlow";
import { inviteLink } from "@/pages/Dashboard";

export default function StudioPage() {
  const { studioId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: studio, isLoading, error } = useQuery({
    queryKey: ["studio", studioId],
    queryFn: () => base44.entities.Studio.get(studioId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !studio) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-bold">Studio not found</h1>
        <p className="text-muted-foreground">It may have been deleted, or it belongs to another account.</p>
        <Button onClick={() => navigate("/")}>Back to studios</Button>
      </div>
    );
  }
  return (
    <StudioFlow
      role="host"
      studioId={studio.id}
      studioTitle={studio.title}
      subtitle="Check your camera and mic, then open the studio. Guests can join once you're in."
      savedSettings={studio.settings || {}}
      defaultName={user?.full_name || ""}
      inviteLink={inviteLink(studio)}
      onExit={() => navigate("/")}
    />
  );
}
