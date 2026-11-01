import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StudioSession } from "@/lib/studio/session";
import Lobby from "./Lobby";
import Room from "./Room";

/** Lobby → live studio, shared by the host page and the guest join page. */
export default function StudioFlow({ role, studioId, studioTitle, subtitle, code, savedSettings, defaultName, inviteLink, onExit, lobbyNotice }) {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);

  useEffect(
    () => () => {
      sessionRef.current?.leave().catch(() => {});
    },
    []
  );

  if (!session) {
    return (
      <Lobby
        role={role}
        title={studioTitle}
        subtitle={subtitle}
        defaultName={defaultName}
        notice={lobbyNotice}
        onEnter={async (opts) => {
          try {
            const s = new StudioSession({
              studioId,
              studioTitle,
              code,
              role,
              name: opts.name,
              headline: opts.headline,
              camTrack: opts.camTrack,
              micTrack: opts.micTrack,
              camOn: opts.camOn,
              micOn: opts.micOn,
              savedSettings,
              prefs: opts.prefs,
            });
            if (opts.prefs?.speakerId) s.setSpeaker(opts.prefs.speakerId);
            sessionRef.current = s;
            setSession(s);
            await s.connect();
          } catch (e) {
            toast.error(e.message || "Could not open the studio");
          }
        }}
      />
    );
  }
  return (
    <Room
      session={session}
      inviteLink={inviteLink}
      onLeave={() => {
        sessionRef.current = null;
        onExit();
      }}
    />
  );
}
