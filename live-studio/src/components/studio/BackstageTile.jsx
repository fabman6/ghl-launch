import { useMemo } from "react";
import { MicOff, MonitorUp, MoreVertical, Plus, Minus, VideoOff, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { hashColor, initials } from "@/lib/studio/utils";
import { LevelBar, VideoView } from "./MediaBits";

export default function BackstageTile({ session, snap, id, kind, participant, isLocal }) {
  const onStage = snap.state.stage.includes(id);
  const isHost = snap.isHost;
  const stream = session.streamFor(id);
  const name = kind === "screen" ? `${participant.name}'s screen` : isLocal ? `${participant.name} (you)` : participant.name;
  const camOn = isLocal ? snap.camOn : participant.media?.cam;
  const micOn = isLocal ? snap.micOn : participant.media?.mic;
  const peerState = isLocal ? "connected" : snap.peerStates[participant.id];
  const getLevel = useMemo(() => () => (micOn ? session.level(id) : 0), [session, id, micOn]);
  const showVideo = stream && (kind === "screen" || camOn);

  return (
    <div
      className={`group relative w-44 shrink-0 overflow-hidden rounded-lg border bg-card transition ${onStage ? "border-primary ring-2 ring-primary/40" : ""}`}
    >
      {onStage && (
        <span className="absolute right-1.5 top-1.5 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
          On stage
        </span>
      )}
      <div className="relative aspect-video bg-black">
        {showVideo ? (
          <VideoView key={`${id}-${snap.localVersion}`} stream={stream} mirror={kind === "cam" && (isLocal ? snap.fx?.mirror !== false : participant.media?.mirror !== false)} contain={kind === "screen"} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ background: hashColor(participant.name) }}
            >
              {initials(participant.name)}
            </div>
          </div>
        )}
        {kind === "screen" && <MonitorUp className="absolute left-2 top-2 h-4 w-4 text-sky-300" />}
        {peerState && peerState !== "connected" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-amber-200">
            <WifiOff className="mr-1 h-4 w-4" /> {peerState === "failed" ? "Connection failed" : "Connecting…"}
          </div>
        )}
        {isHost && (
          <div className={`absolute inset-x-0 bottom-0 flex justify-center p-1.5 transition ${onStage ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
            <Button
              size="sm"
              variant={onStage ? "secondary" : "default"}
              className="h-7 px-2 text-xs"
              onClick={() => (onStage ? session.removeFromStage(id) : session.addToStage(id))}
            >
              {onStage ? <Minus className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
              {onStage ? "Remove" : "Add to stage"}
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{name}</div>
          {kind === "cam" && <LevelBar getLevel={getLevel} className="mt-1" />}
        </div>
        {kind === "cam" && !micOn && <MicOff className="h-3.5 w-3.5 text-destructive" />}
        {kind === "cam" && !camOn && <VideoOff className="h-3.5 w-3.5 text-muted-foreground" />}
        {isHost && !isLocal && kind === "cam" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => session.moveOnStage(id, -1)} disabled={!onStage}>
                Move earlier on stage
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => session.moveOnStage(id, 1)} disabled={!onStage}>
                Move later on stage
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => session.remote(participant.id, "mute")}>Mute microphone</DropdownMenuItem>
              <DropdownMenuItem onClick={() => session.remote(participant.id, "cam-off")}>Turn camera off</DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => confirm(`Remove ${participant.name} from the studio?`) && session.kick(participant.id)}
              >
                Remove from studio
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {isHost && isLocal && kind === "cam" && onStage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => session.moveOnStage(id, -1)}>Move earlier on stage</DropdownMenuItem>
              <DropdownMenuItem onClick={() => session.moveOnStage(id, 1)}>Move later on stage</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
