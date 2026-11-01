import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FolderOpen, Mic, MonitorUp, Trash2, User, Video } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtBytes, fmtDuration } from "@/lib/studio/utils";

const KIND = {
  program: { label: "Composite", icon: Video },
  participant: { label: "Camera + mic", icon: User },
  audio: { label: "Audio only", icon: Mic },
  screen: { label: "Screen", icon: MonitorUp },
};

export default function Recordings() {
  const qc = useQueryClient();
  const { data: recs = [], isLoading } = useQuery({
    queryKey: ["recordings"],
    queryFn: () => base44.entities.Recording.list("-created_date", 500),
  });
  const remove = useMutation({
    mutationFn: (id) => base44.entities.Recording.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recordings"] }),
  });
  const sessions = useMemo(() => {
    const map = new Map();
    for (const r of recs) {
      const key = r.session_id || r.id;
      if (!map.has(key)) map.set(key, { id: key, title: r.session_title || r.studio_title, studio: r.studio_title, folder: r.folder_url, date: r.created_date, files: [] });
      map.get(key).files.push(r);
    }
    return [...map.values()];
  }, [recs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Recordings</h1>
        <p className="mt-1 text-muted-foreground">
          Every session gets a folder in your Google Drive under <span className="font-medium text-foreground">Live Studio Recordings</span>, with
          the composite plus a separate high-quality file for each person.
        </p>
      </div>
      {isLoading ? null : sessions.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
          <FolderOpen className="h-8 w-8 text-primary" />
          <p className="text-muted-foreground">No recordings yet. Hit Record in a studio and files will appear here as they finish uploading.</p>
        </Card>
      ) : (
        sessions.map((s) => (
          <Card key={s.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm text-muted-foreground">
                  {s.studio} · {new Date(s.date).toLocaleString()}
                </div>
              </div>
              {s.folder && (
                <Button variant="secondary" asChild>
                  <a href={s.folder} target="_blank" rel="noreferrer">
                    <FolderOpen className="mr-2 h-4 w-4" /> Open folder in Drive
                  </a>
                </Button>
              )}
            </div>
            <div className="divide-y">
              {s.files.map((f) => {
                const K = KIND[f.kind] ?? KIND.participant;
                return (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <K.icon className="h-4 w-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{f.participant_name}</div>
                      <div className="truncate text-muted-foreground">
                        {K.label} · {fmtDuration(f.duration_sec || 0)} · {fmtBytes(f.size_bytes)} · {f.file_name}
                      </div>
                    </div>
                    {f.drive_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={f.drive_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-4 w-4" /> Drive
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Remove from list (keeps the Drive file)" onClick={() => remove.mutate(f.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
