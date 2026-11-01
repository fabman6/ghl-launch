# Live Studio

A browser studio for live streaming and podcast recording, in the spirit of StreamYard and Riverside (without AI editing). Built on Base44.

- Base44 app: https://app.base44.com/apps/6ae7392a088c187242bd1e07/editor/preview
- This folder mirrors the app's source. Files here overlay the Base44 starter template (UI kit, auth pages, SDK client).

## Features

**Studio**
- Lobby with camera / mic / speaker selection, 720p / 1080p / 4K capture, noise suppression and echo cancellation, live mic meter
- Guests join from an invite link with no account; green room with Admit / Deny
- Backstage vs. on stage, like StreamYard: the host adds and removes people and screens from the stage
- Layouts: Solo, Grid, Side by side, Spotlight, Picture in picture, Screen + people, Screen + corner, with animated transitions
- 16:9 landscape and 9:16 vertical output
- Screen sharing (with tab/system audio) for host and guests, auto-placed on stage
- Name tags with headline, active-speaker highlight
- Banners (lower thirds) and scrolling tickers, four themes, six fonts, brand + text color
- Logo (4 positions), background image or color, full-frame overlay PNG
- Scenes: Starting soon (with countdown), Be right back, Thanks for watching
- Video clips (intros, outros, ads) played full screen with audio
- Private studio chat, host controls (mute guest, camera off, remove)

**Recording**
- Composite recording of the program feed (exactly what viewers see)
- Riverside-style separate local recordings for every participant, at full camera quality, independent of the network
- Optional extra audio-only file per person, plus a screen-share file
- Progressive upload to Google Drive while recording (resumable uploads, retries), into `Live Studio Recordings / <Studio> / <Session>`
- Local backup: download from the Files tab, or record straight into a folder on disk (Chrome / Edge)
- Recordings library grouped by session with Drive links

**Live streaming**
- Multistream to YouTube, Facebook, Twitch, LinkedIn, X, Kick, Instagram or any RTMP(S) server via Cloudflare Stream (browser → WebRTC/WHIP → Cloudflare → RTMP)
- Direct WHIP destinations (no restream service needed)
- Live and recording timers

## Architecture

| Piece | Where |
| --- | --- |
| Realtime room (roster, green room, signaling, shared state, chat) | `base44/actors/studioRoom/entry.ts` |
| Who may join (host = owner, guest = invite code) | `base44/functions/studioAccess` |
| Google Drive folders + resumable upload sessions | `base44/functions/driveUpload` (Google Drive connector) |
| Go live / restream outputs | `base44/functions/liveControl` (Cloudflare Stream API) |
| ICE / TURN servers | `base44/functions/iceServers` |
| Data | `base44/entities/Studio`, `Destination`, `Recording` |
| WebRTC mesh | `src/lib/studio/peer.js` |
| Program compositor (canvas) | `src/lib/studio/compositor.js`, `layouts.js` |
| Audio mixing + meters | `src/lib/studio/mixer.js` |
| Recording + sinks (Drive, folder, memory) | `src/lib/studio/recorder.js`, `sinks.js` |
| Session orchestration | `src/lib/studio/session.js` |
| UI | `src/pages/*`, `src/components/studio/*` |

Participants connect peer to peer (full mesh, good for a host plus up to about 5 guests). The host's browser composites the program feed on a canvas and mixes on-stage audio; that feed is what gets streamed and recorded as the composite. Guests render the same scene locally so they see what is live.

## Setup

1. **Google Drive**: Base44 editor → Integrations → Google Drive → Connect (scope `drive.file`). All recordings, including guests', go to this Drive.
2. **Live streaming to RTMP**: enable Cloudflare Stream, create an API token with *Stream: Edit*, then add secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN`. Add stream keys on the Destinations page.
3. **Optional TURN relay** for strict firewalls: `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_KEY_API_TOKEN`, or `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.

Best experience: Chrome or Edge on desktop, headphones for everyone.
