import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MoreVertical, Pencil, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { uid } from "@/lib/studio/utils";

export function inviteLink(studio) {
  return `${window.location.origin}/join/${studio.id}?code=${encodeURIComponent(studio.invite_code ?? "")}`;
}

export async function copyInvite(studio) {
  await navigator.clipboard.writeText(inviteLink(studio));
  toast.success("Guest invite link copied");
}

function StudioDialog({ open, onOpenChange, studio, onSaved }) {
  const [title, setTitle] = useState(studio?.title ?? "");
  const [description, setDescription] = useState(studio?.description ?? "");
  const save = useMutation({
    mutationFn: async () => {
      if (studio) return base44.entities.Studio.update(studio.id, { title, description });
      return base44.entities.Studio.create({ title, description, invite_code: uid(18), settings: {} });
    },
    onSuccess: (s) => {
      onSaved?.(s);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message || "Could not save the studio"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{studio ? "Edit studio" : "New studio"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="title">Show or studio name</Label>
            <Input id="title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Weekly Podcast" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!title.trim() || save.isPending}>
              {studio ? "Save" : "Create studio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const { data: studios = [], isLoading } = useQuery({
    queryKey: ["studios"],
    queryFn: () => base44.entities.Studio.list("-updated_date"),
  });
  const remove = useMutation({
    mutationFn: (id) => base44.entities.Studio.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studios"] }),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Studios</h1>
          <p className="mt-1 text-muted-foreground">Go live, record in high quality, and bring guests on for your podcast or show.</p>
        </div>
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> New studio
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : studios.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 border-dashed p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Video className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Create your first studio</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              A studio keeps your branding, banners and guest link, so every episode starts ready to go.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New studio
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {studios.map((s) => {
            const color = s.settings?.brand?.color || "#e5202e";
            return (
              <Card key={s.id} className="group overflow-hidden">
                <Link to={`/studio/${s.id}`} className="block">
                  <div
                    className="relative flex aspect-video items-end p-4"
                    style={{ background: `linear-gradient(135deg, ${s.settings?.brand?.bgColor || "#0d0b14"}, ${color}66)` }}
                  >
                    {s.settings?.brand?.logoUrl && (
                      <img src={s.settings.brand.logoUrl} alt="" className="absolute right-3 top-3 max-h-8 max-w-[30%] object-contain" />
                    )}
                    <span className="rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ background: color }}>
                      {s.title}
                    </span>
                  </div>
                </Link>
                <div className="flex items-center gap-2 p-3">
                  <Button className="flex-1" onClick={() => navigate(`/studio/${s.id}`)}>
                    Enter studio
                  </Button>
                  <Button variant="secondary" size="icon" title="Copy guest invite link" onClick={() => copyInvite(s)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(s)}>
                        <Pencil className="mr-2 h-4 w-4" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${s.title}"? Recordings already in Google Drive are kept.`)) remove.mutate(s.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating && (
        <StudioDialog
          open
          onOpenChange={setCreating}
          onSaved={(s) => {
            qc.invalidateQueries({ queryKey: ["studios"] });
            navigate(`/studio/${s.id}`);
          }}
        />
      )}
      {editing && (
        <StudioDialog
          open
          studio={editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["studios"] })}
        />
      )}
    </div>
  );
}
