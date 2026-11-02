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
- Live screen zoom: the host scrolls or pinches over a shared screen to zoom toward the cursor, drags to pan, double-clicks to reset (or uses the +/- toolbar); the zoom is part of the program feed, so the stream and recordings see it too
- Screen share mode in Settings: Smooth motion (keeps the frame rate up for zooming, scrolling and video) or Sharp text (slides and documents)
- Draggable divider between the main item and the side items (Spotlight and Screen + people layouts, landscape and 9:16); double-click resets
- Mirrored cameras (on by default, per person): raise your right hand and it appears on the right
- Name tags with headline, active-speaker highlight
- Banners (lower thirds) and scrolling tickers, four themes, six fonts, brand + text color
- Logo (4 positions), background image or color, full-frame overlay PNG
- Scenes: Starting soon (with countdown), Be right back, Thanks for watching
- Video clips (intros, outros, ads) played full screen with audio
- Private studio chat, host controls (mute guest, camera off, remove)

**Camera effects** (run on each person's own device, so guests get them too)
- Touch up: skin smoothing that leaves eyes, hair and edges sharp, clarity, low-light boost, plus presets
- Colour: brightness, contrast, saturation, warmth
- Background blur and virtual backgrounds (5 built-in looks or your own images; signed-in users get uploads saved to their account so they follow them to any computer, guests keep them in the browser), cut out with Google's MediaPipe selfie segmentation and refined at full resolution so edges follow hair and shoulders
- Auto-frame toggle: gently pans and zooms to keep you centred
- Lighter mode (720p) toggle for slower computers; settings are remembered

**Recording**
- Composite recording of the program feed (exactly what viewers see)
- Riverside-style separate local recordings for every participant, at full camera quality, independent of the network
- Optional extra audio-only file per person, plus a screen-share file
- Progressive upload to Google Drive while recording (resumable uploads, retries), into `Live Studio Recordings / <Studio> / <Session>`
- Local backup: download from the Files tab, or record straight into a folder on disk (Chrome / Edge)
- Recordings library grouped by session with Drive links

**Live streaming**
- YouTube: one click. Connect your channel once and every Go live creates the YouTube broadcast and stream key for you, then ends it when you stop
- Facebook: guided one-time setup with a persistent stream key from Live Producer
- Instagram and LinkedIn: these platforms issue a new key for every live, so you paste it in the Go live window (with a button that opens the right page)
- Twitch, Kick, X, any RTMP(S) server, or WHIP endpoints
- Everything is multistreamed at once via Cloudflare Stream (browser → WebRTC/WHIP → Cloudflare → each platform)
- Live and recording timers, watch-page links once live

## Architecture

| Piece | Where |
| --- | --- |
| Realtime room (roster, green room, signaling, shared state, chat) | `base44/actors/studioRoom/entry.ts` |
| Who may join (host = owner, guest = invite code) | `base44/functions/studioAccess` |
| Google Drive folders + resumable upload sessions | `base44/functions/driveUpload` (Google Drive connector) |
| Go live / restream outputs | `base44/functions/liveControl` (Cloudflare Stream API) |
| ICE / TURN servers | `base44/functions/iceServers` |
| Data | `base44/entities/Studio`, `Destination`, `Recording`, `Background` |
| WebRTC mesh | `src/lib/studio/peer.js` |
| Program compositor (canvas) | `src/lib/studio/compositor.js`, `layouts.js` |
| Audio mixing + meters | `src/lib/studio/mixer.js` |
| Recording + sinks (Drive, folder, memory) | `src/lib/studio/recorder.js`, `sinks.js` |
| Camera effects (WebGL2 + MediaPipe) | `src/lib/studio/effects.js`, model + wasm self-hosted in `public/` |
| Session orchestration | `src/lib/studio/session.js` |
| UI | `src/pages/*`, `src/components/studio/*` |

Participants connect peer to peer (full mesh, good for a host plus up to about 5 guests). The host's browser composites the program feed on a canvas and mixes on-stage audio; that feed is what gets streamed and recorded as the composite. Guests render the same scene locally so they see what is live.

## Setup

1. **Google Drive**: Base44 editor → Integrations → Google Drive → Connect. All recordings, including guests', go to this Drive.
2. **Live streaming to RTMP**: enable Cloudflare Stream, create an API token with *Stream: Edit*, then add secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN`. Then connect platforms on the Destinations page. YouTube also needs live streaming enabled on the channel once (youtube.com/features).
3. **Optional TURN relay** for strict firewalls: `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_KEY_API_TOKEN`, or `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.

Best experience: Chrome or Edge on desktop, headphones for everyone.
