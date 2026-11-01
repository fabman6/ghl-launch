import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CameraOff,
  Clapperboard,
  FolderDown,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Palette,
  PanelRight,
  Radio,
  Settings as SettingsIcon,
  Sparkles,
  Type,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LAYOUTS } from "@/lib/studio/layouts";
import { fmtDuration } from "@/lib/studio/utils";
import { useElapsed, useSession } from "./hooks";
import { LayoutIcon, StageView } from "./StageView";
import BackstageTile from "./BackstageTile";
import { BannersPanel, BrandPanel, ChatPanel, FilesPanel, PeoplePanel, ScenesPanel } from "./Panels";
import { GoLiveDialog, InviteDialog, LiveOutputs, RecordDialog, SettingsDialog } from "./Dialogs";
import { VideoView } from "./MediaBits";
import EffectsPanel from "./EffectsPanel";

function Badge({ color, label, since }) {
  const t = useElapsed(since);
  return (
    <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-white" style={{ background: color }}>
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
      {label} {since ? fmtDuration(t) : ""}
    </span>
  );
}

function WaitingScreen({ session, snap, onLeave }) {
  const messages = {
    connecting: { title: "Connecting to the studio…", body: "" },
    waiting: {
      title: snap.hostPresent ? "The host will let you in soon" : "Waiting for the host to arrive",
      body: snap.hostPresent ? "You're in the waiting room. Hang tight." : "You'll join automatically once the host opens the studio and admits you.",
    },
    denied: { title: "You can't join this studio", body: session.deniedReason || "The host declined the request, or the invite link is no longer valid." },
    kicked: { title: "You were removed from the studio", body: "Thanks for stopping by." },
  };
  const m = messages[snap.status] ?? messages.connecting;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      {(snap.status === "connecting" || snap.status === "waiting") && (
        <div className="aspect-video w-full max-w-md overflow-hidden rounded-2xl border bg-black">
          {snap.camOn && <VideoView stream={session.localStream} mirror />}
        </div>
      )}
      <div>
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold">
          {(snap.status === "connecting" || snap.status === "waiting") && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {m.title}
        </h1>
        {m.body && <p className="mt-2 max-w-md text-muted-foreground">{m.body}</p>}
      </div>
      <Button variant="secondary" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}

const HOST_TABS = [
  { id: "banners", label: "Banners", icon: Type },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "scenes", label: "Scenes", icon: Clapperboard },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "people", label: "People", icon: Users },
  { id: "files", label: "Files", icon: FolderDown },
];
const GUEST_TABS = HOST_TABS.filter((t) => ["chat", "people", "files"].includes(t.id));

function SidePanels({ session, snap, tabs, activeTab, setTab, pendingCount }) {
  return (
    <>
      <div className="flex shrink-0 border-b">
        {tabs.map((t) => {
          const badge = t.id === "chat" && snap.unread && activeTab !== "chat" ? snap.unread : t.id === "people" && pendingCount ? pendingCount : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition ${activeTab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {activeTab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded bg-primary" />}
              {badge > 0 && (
                <span className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--live))] px-1 text-[10px] font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === "banners" && <BannersPanel session={session} snap={snap} />}
        {activeTab === "brand" && <BrandPanel session={session} snap={snap} />}
        {activeTab === "scenes" && <ScenesPanel session={session} snap={snap} />}
        {activeTab === "chat" && <ChatPanel session={session} snap={snap} />}
        {activeTab === "people" && <PeoplePanel session={session} snap={snap} />}
        {activeTab === "files" && <FilesPanel session={session} snap={snap} />}
      </div>
    </>
  );
}

export default function Room({ session, inviteLink, onLeave }) {
  const snap = useSession(session);
  const [tab, setTab] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const s = snap.state;
  const tabs = snap.isHost ? HOST_TABS : GUEST_TABS;
  const activeTab = tab ?? (snap.isHost ? "banners" : "chat");

  useEffect(() => {
    const offNotice = session.on("notice", ({ message, level }) => {
      if (level === "error") toast.error(message);
      else if (level === "warning") toast.warning(message);
      else toast(message);
    });
    return offNotice;
  }, [session]);

  // Tell the host when someone is waiting.
  const pendingCount = snap.isHost ? snap.roster.filter((p) => !p.admitted).length : 0;
  useEffect(() => {
    if (pendingCount > 0) toast(`${pendingCount} guest${pendingCount > 1 ? "s are" : " is"} waiting to join`, { action: { label: "Review", onClick: () => setTab("people") } });
  }, [pendingCount]);

  const busy = snap.live.active || s.recording || snap.localFiles.some((f) => f.status !== "done" && f.status !== "error");
  useEffect(() => {
    const h = (e) => {
      if (!busy) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [busy]);

  const backstage = useMemo(() => {
    const out = [];
    for (const p of snap.roster.filter((x) => x.admitted)) {
      const isLocal = p.id === snap.me?.id;
      out.push({ id: p.id, kind: "cam", participant: p, isLocal });
      if (isLocal ? snap.screenOn : p.media?.screen) out.push({ id: `screen:${p.id}`, kind: "screen", participant: p, isLocal });
    }
    return out;
  }, [snap.roster, snap.me?.id, snap.screenOn]);

  if (snap.status !== "joined") return <WaitingScreen session={session} snap={snap} onLeave={onLeave} />;

  const leave = async () => {
    if (busy && !confirm(snap.isHost ? "End the show? Recording and the live stream will stop." : "Leave the studio?")) return;
    setLeaving(true);
    try {
      await session.leave();
    } finally {
      onLeave();
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{session.studioTitle}</div>
        </div>
        <div className="flex items-center gap-2">
          {s.live && (
            <Popover>
              <PopoverTrigger asChild>
                <button>
                  <Badge color="hsl(var(--live))" label="LIVE" since={s.liveStartedAt} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                {snap.isHost ? <LiveOutputs outputs={snap.live.outputs} /> : <p className="text-sm">The show is live.</p>}
              </PopoverContent>
            </Popover>
          )}
          {s.recording && <Badge color="#dc2626" label="REC" since={s.recStartedAt} />}
        </div>
        {snap.isHost && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog("invite")}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              <span className="hidden md:inline">Invite</span>
            </Button>
            {s.recording ? (
              <Button variant="secondary" size="sm" onClick={() => confirm("Stop recording for everyone?") && session.stopRecording()}>
                <span className="mr-1.5 h-2.5 w-2.5 rounded-sm bg-red-500" /> Stop rec
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setDialog("record")}>
                <span className="mr-1.5 h-2.5 w-2.5 rounded-full bg-red-500" /> Record
              </Button>
            )}
            {snap.live.active ? (
              <Button size="sm" variant="destructive" onClick={() => confirm("End the broadcast on all destinations?") && session.endLive()}>
                End broadcast
              </Button>
            ) : (
              <Button size="sm" className="bg-[hsl(var(--live))] text-white hover:bg-[hsl(var(--live))]/90" onClick={() => setDialog("live")}>
                <Radio className="mr-1.5 h-4 w-4" /> Go live
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Stage column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5">
            <div className={s.aspect === "9:16" ? "h-full" : "w-full max-w-[min(100%,calc((100vh-330px)*16/9))]"}>
              <StageView session={session} snap={snap} aspect={s.aspect} className={s.aspect === "9:16" ? "h-full" : "w-full"} />
            </div>
          </div>

          {snap.isHost && (
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-3 pb-2 scrollbar-thin sm:justify-center">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  title={`${l.label}: ${l.hint}`}
                  onClick={() => session.updateState({ layout: l.id })}
                  className={`flex shrink-0 flex-col items-center gap-1 rounded-lg p-1.5 text-[10px] transition ${s.layout === l.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}
                >
                  <LayoutIcon layout={l.id} active={s.layout === l.id} />
                  {l.label}
                </button>
              ))}
              <div className="mx-2 h-8 w-px shrink-0 bg-border" />
              <div className="flex shrink-0 overflow-hidden rounded-lg border text-xs">
                {["16:9", "9:16"].map((a) => (
                  <button
                    key={a}
                    disabled={s.live || s.recording}
                    onClick={() => session.updateState({ aspect: a })}
                    className={`px-2.5 py-2 ${s.aspect === a ? "bg-primary text-primary-foreground" : "hover:bg-secondary"} disabled:opacity-50`}
                    title={a === "9:16" ? "Vertical for Reels, Shorts, TikTok" : "Landscape"}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Backstage */}
          <div className="shrink-0 border-t bg-card/40">
            <div className="flex gap-3 overflow-x-auto p-3 scrollbar-thin">
              {backstage.map((b) => (
                <BackstageTile key={b.id} session={session} snap={snap} {...b} />
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center justify-center gap-2 border-t p-3">
            <Button
              size="lg"
              variant={snap.micOn ? "secondary" : "destructive"}
              disabled={!snap.hasMic}
              onClick={() => session.setMic(!snap.micOn)}
              className="min-w-[6rem]"
            >
              {snap.micOn ? <Mic className="mr-2 h-4 w-4" /> : <MicOff className="mr-2 h-4 w-4" />}
              {snap.micOn ? "Mute" : "Unmute"}
            </Button>
            <Button
              size="lg"
              variant={snap.camOn ? "secondary" : "destructive"}
              disabled={!snap.hasCam}
              onClick={() => session.setCam(!snap.camOn)}
              className="min-w-[6rem]"
            >
              {snap.camOn ? <Camera className="mr-2 h-4 w-4" /> : <CameraOff className="mr-2 h-4 w-4" />}
              {snap.camOn ? "Cam off" : "Cam on"}
            </Button>
            <Button
              size="lg"
              variant={snap.screenOn ? "default" : "secondary"}
              onClick={() => (snap.screenOn ? session.stopScreen() : session.startScreen().catch((e) => e.name !== "NotAllowedError" && toast.error(e.message)))}
              className="hidden sm:inline-flex"
            >
              {snap.screenOn ? <MonitorX className="mr-2 h-4 w-4" /> : <MonitorUp className="mr-2 h-4 w-4" />}
              {snap.screenOn ? "Stop sharing" : "Share screen"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={!snap.hasCam}
              onClick={() => setDialog("effects")}
              title="Camera effects, backgrounds and framing"
              className={snap.fx && (snap.fx.background !== "none" || snap.fx.autoFrame || snap.fx.smoothing > 0) ? "text-primary" : ""}
            >
              <Sparkles className="h-4 w-4" />
              <span className="ml-2 hidden md:inline">Effects</span>
            </Button>
            <Button size="lg" variant="secondary" className="relative lg:hidden" onClick={() => setMobilePanel(true)} title="Panels">
              <PanelRight className="h-4 w-4" />
              {(snap.unread > 0 || pendingCount > 0) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[hsl(var(--live))]" />}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setDialog("settings")} title="Settings">
              <SettingsIcon className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="ghost" onClick={leave} disabled={leaving} title="Leave studio">
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Leave</span>
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="hidden w-80 shrink-0 flex-col border-l lg:flex xl:w-96">
          <SidePanels session={session} snap={snap} tabs={tabs} activeTab={activeTab} setTab={setTab} pendingCount={pendingCount} />
        </aside>
      </div>

      <Sheet open={mobilePanel} onOpenChange={setMobilePanel}>
        <SheetContent side="right" className="flex w-[92vw] max-w-sm flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Studio panels</SheetTitle>
          </SheetHeader>
          <SidePanels session={session} snap={snap} tabs={tabs} activeTab={activeTab} setTab={setTab} pendingCount={pendingCount} />
        </SheetContent>
      </Sheet>

      {snap.isHost && <RecordDialog session={session} snap={snap} open={dialog === "record"} onOpenChange={(o) => setDialog(o ? "record" : null)} />}
      {snap.isHost && <GoLiveDialog session={session} snap={snap} open={dialog === "live"} onOpenChange={(o) => setDialog(o ? "live" : null)} />}
      {snap.isHost && <InviteDialog link={inviteLink} open={dialog === "invite"} onOpenChange={(o) => setDialog(o ? "invite" : null)} />}
      {dialog === "settings" && <SettingsDialog session={session} snap={snap} open onOpenChange={(o) => setDialog(o ? "settings" : null)} />}
      <EffectsPanel session={session} snap={snap} open={dialog === "effects"} onOpenChange={(o) => setDialog(o ? "effects" : null)} />
    </div>
  );
}
