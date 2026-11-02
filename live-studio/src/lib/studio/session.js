// StudioSession: everything that happens while someone is inside a studio.
//
//  signaling     base44 actor "studioRoom" (roster, green room, chat, state)
//  media         full-mesh WebRTC between admitted participants (PeerLink)
//  program       canvas Compositor + AudioMixer (host builds the real feed;
//                guests render the same scene locally as a preview)
//  recording     host: composite program file; everyone: their own local
//                high-quality camera/mic (and screen) files, streamed to
//                Google Drive while recording and kept locally as a backup
//  live          host publishes the program feed over WHIP (Cloudflare Stream
//                restreams to RTMP destinations) and/or direct WHIP endpoints
import { base44 } from "@/api/base44Client";
import { invokeFn } from "./api";
import { Compositor } from "./compositor";
import { CameraFX, DEFAULT_FX, fxActive, fxSize } from "./effects";
import { getCamera, getMicrophone, getScreen } from "./devices";
import { AudioMixer } from "./mixer";
import { PeerLink, SLOTS } from "./peer";
import { TrackRecorder } from "./recorder";
import { DriveSink, FolderSink, MemorySink } from "./sinks";
import { defaultStudioState, isScreenItem, persistableState } from "./state";
import { whipPublish } from "./whip";
import { Emitter, slug, stamp, uid } from "./utils";

class MediaPool {
  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "2px",
      height: "2px",
      overflow: "hidden",
      opacity: "0.01",
      pointerEvents: "none",
      zIndex: "-1",
    });
    document.body.appendChild(this.root);
    this.videos = new Map();
    this.audios = new Map();
    this.sinkId = "";
  }
  video(key, stream) {
    let v = this.videos.get(key);
    if (!v) {
      v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.width = 2;
      v.height = 2;
      this.root.appendChild(v);
      this.videos.set(key, v);
    }
    if (v.srcObject !== stream) v.srcObject = stream;
    if (v.paused) v.play().catch(() => {});
    return v;
  }
  audio(key, stream) {
    let a = this.audios.get(key);
    if (!a) {
      a = document.createElement("audio");
      a.autoplay = true;
      this.root.appendChild(a);
      this.audios.set(key, a);
      if (this.sinkId && a.setSinkId) a.setSinkId(this.sinkId).catch(() => {});
    }
    if (a.srcObject !== stream) a.srcObject = stream;
    if (a.paused) a.play().catch(() => {});
    return a;
  }
  setSink(id) {
    this.sinkId = id;
    for (const a of this.audios.values()) if (a.setSinkId) a.setSinkId(id).catch(() => {});
  }
  setRemoteVolume(v) {
    for (const a of this.audios.values()) a.volume = v;
  }
  remove(key) {
    for (const map of [this.videos, this.audios]) {
      const el = map.get(key);
      if (el) {
        el.srcObject = null;
        el.remove();
        map.delete(key);
      }
    }
  }
  destroy() {
    for (const k of [...this.videos.keys(), ...this.audios.keys()]) this.remove(k);
    this.root.remove();
  }
}

const FX_KEY = "live-studio-fx";

function loadFx() {
  try {
    const fx = JSON.parse(localStorage.getItem(FX_KEY) || "{}");
    // Object URLs from a previous visit are gone; fall back to no background.
    if (fx.bgImage && String(fx.bgImage).startsWith("blob:")) {
      fx.bgImage = null;
      if (fx.background === "image") fx.background = "none";
    }
    return fx;
  } catch {
    return {};
  }
}

function saveFx(fx) {
  try {
    localStorage.setItem(FX_KEY, JSON.stringify(fx));
  } catch {
    /* ignore */
  }
}

function connId(studioId) {
  const key = `live-studio-conn-${studioId}`;
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `p-${uid(12)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `p-${uid(12)}`;
  }
}

export class StudioSession extends Emitter {
  /**
   * @param {{studioId:string, studioTitle:string, code?:string, role:'host'|'guest', name:string, headline?:string,
   *          camTrack?:MediaStreamTrack|null, micTrack?:MediaStreamTrack|null, savedSettings?:object, prefs?:object}} opts
   */
  constructor(opts) {
    super();
    this.studioId = opts.studioId;
    this.studioTitle = opts.studioTitle || "Studio";
    this.code = opts.code || "";
    this.wantRole = opts.role;
    this.name = opts.name;
    this.headline = opts.headline || "";
    this.savedSettings = opts.savedSettings || {};
    this.prefs = { quality: "1080p", ...(opts.prefs || {}) };
    this.camTrack = opts.camTrack || null;
    this.rawCam = this.camTrack;
    this.micTrack = opts.micTrack || null;
    this.fx = { ...DEFAULT_FX, ...loadFx() };
    this.fxEngine = null;
    this.fxError = null;
    this.micOn = !!this.micTrack && (opts.micOn ?? true);
    this.camOn = !!this.camTrack && (opts.camOn ?? true);
    if (this.micTrack) this.micTrack.enabled = this.micOn;
    if (this.camTrack) this.camTrack.enabled = this.camOn;
    this.screenStream = null;

    this.id = connId(this.studioId);
    this.status = "connecting";
    this.me = null;
    this.hostPresent = false;
    this.roster = [];
    this.studioState = defaultStudioState(this.savedSettings);
    this.chat = [];
    this.unread = 0;
    this.peers = new Map();
    this.peerStates = {};
    this.iceServers = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

    this.pool = new MediaPool();
    this.mixer = new AudioMixer();
    this.compositor = new Compositor({ getSource: (id) => this.source(id) });
    this.compositor.setQuality(this.prefs.quality);
    this.compositor.onClipEnded = () => {
      if (this.isHost) this.updateState((s) => ({ clip: { ...s.clip, playing: false } }));
    };

    this.localStream = new MediaStream([this.camTrack, this.micTrack].filter(Boolean));
    if (this.micTrack) this.mixer.setStream(this.id, new MediaStream([this.micTrack]));

    this.recorders = new Map(); // key -> {recorder, info}
    this.localFiles = [];
    this.recFolder = null; // FileSystemDirectoryHandle picked by the user
    this.live = { active: false, starting: false, startedAt: null, outputs: [], error: null };
    this.publishers = [];

    this.snap = null;
    this.rebuild();
  }

  get isHost() {
    return this.me?.role === "host";
  }

  // ---------- lifecycle ----------

  async connect() {
    if (this.rawCam && fxActive(this.fx)) await this.applyEffects(this.fx, { quiet: true });
    try {
      const res = await invokeFn("iceServers", { studioId: this.studioId, code: this.code });
      if (Array.isArray(res.data?.iceServers) && res.data.iceServers.length) this.iceServers = res.data.iceServers;
    } catch {
      /* STUN defaults */
    }
    this.compositor.setState(this.studioState);
    this.compositor.start(30);
    this.mixer.resume();
    this.conn = base44.actors.studioRoom(this.studioId).connect({ id: this.id });
    this.sub = this.conn.subscribe((msg) => this.onMessage(msg));
    this.pingTimer = setInterval(() => this.send({ type: "ping" }), 20_000);
    this.levelTimer = setInterval(() => this.emit("levels"), 100);
    // Some transports deliver "hello" before we subscribe; join anyway.
    setTimeout(() => {
      if (this.status === "connecting") this.join();
    }, 1500);
  }

  join() {
    this.send({
      type: "join",
      name: this.name,
      headline: this.headline,
      code: this.code,
      media: { mic: this.micOn, cam: this.camOn, mirror: this.fx.mirror !== false },
    });
  }

  send(msg) {
    try {
      this.conn?.send(msg);
    } catch (e) {
      console.warn("[studio] send failed", e);
    }
  }

  async leave() {
    if (this.left) return;
    this.left = true;
    if (this.isHost) {
      if (this.live.active) await this.endLive().catch(() => {});
      if (this.studioState.recording) await this.stopRecording().catch(() => {});
    } else {
      await this.stopLocalRecorders().catch(() => {});
    }
    this.send({ type: "leave" });
    this.teardown();
  }

  teardown() {
    clearInterval(this.pingTimer);
    clearInterval(this.levelTimer);
    clearTimeout(this.persistTimer);
    this.sub?.unsubscribe();
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    for (const p of this.peers.values()) p.close();
    this.peers.clear();
    this.compositor.stop();
    for (const t of this.localStream.getTracks()) t.stop();
    this.rawCam?.stop();
    this.fxEngine?.stop();
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.pool.destroy();
    this.mixer.close();
  }

  // ---------- reactive snapshot for React ----------

  subscribe = (fn) => this.on("change", fn);
  getSnapshot = () => this.snap;

  changed() {
    if (this.changeQueued) return;
    this.changeQueued = true;
    queueMicrotask(() => {
      this.changeQueued = false;
      this.rebuild();
      this.emit("change");
    });
  }

  rebuild() {
    this.snap = {
      status: this.status,
      me: this.me,
      isHost: this.isHost,
      hostPresent: this.hostPresent,
      roster: this.roster,
      state: this.studioState,
      chat: this.chat,
      unread: this.unread,
      micOn: this.micOn,
      camOn: this.camOn,
      hasMic: !!this.micTrack,
      hasCam: !!this.camTrack,
      screenOn: !!this.screenStream,
      peerStates: { ...this.peerStates },
      localFiles: this.localFiles.map((f) => ({ ...f })),
      recordingLocal: this.recorders.size > 0,
      live: { ...this.live },
      recFolderName: this.recFolder?.name ?? null,
      localVersion: this.localVersion ?? 0,
      fx: this.fx,
      fxError: this.fxError,
      fxLoading: !!this.fxLoading,
    };
  }

  notify(message, level = "info") {
    this.emit("notice", { message, level });
  }

  // ---------- signaling ----------

  onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "hello":
        this.join();
        break;
      case "welcome":
      case "admitted":
        this.onWelcome(msg);
        break;
      case "waiting":
        this.hostPresent = !!msg.hostPresent;
        this.changed();
        break;
      case "roster":
        this.onRoster(msg.roster);
        break;
      case "state":
        if (!this.isHost && msg.state) this.applyRemoteState(msg.state);
        break;
      case "chat":
        this.chat = [...this.chat, msg.message].slice(-200);
        if (msg.message.from !== this.id) this.unread += 1;
        this.changed();
        break;
      case "signal":
        this.onSignal(msg.from, msg.data);
        break;
      case "command":
        this.onCommand(msg.command, msg.payload);
        break;
      case "kicked":
        this.status = msg.reason === "denied" ? "denied" : "kicked";
        this.stopLocalRecorders().finally(() => this.teardown());
        this.changed();
        break;
      case "denied":
        this.status = "denied";
        this.deniedReason = msg.reason;
        this.changed();
        break;
      case "error":
        if (msg.code === "not_joined") this.join();
        break;
      default:
        break;
    }
  }

  onWelcome(msg) {
    this.me = msg.you;
    if (msg.hostPresent !== undefined) this.hostPresent = msg.hostPresent;
    if (!this.me.admitted) {
      this.status = "waiting";
      this.changed();
      return;
    }
    const first = this.status !== "joined";
    this.status = "joined";
    if (msg.chat) this.chat = msg.chat;
    if (this.isHost) {
      // Resume the running show after a refresh, otherwise start from saved settings.
      const base = msg.state && typeof msg.state === "object" ? { ...defaultStudioState(this.savedSettings), ...msg.state } : defaultStudioState(this.savedSettings);
      if (first && !base.stage.includes(this.id)) base.stage = [this.id, ...base.stage];
      if (base.recording && !this.recorders.size) {
        base.recording = false;
        base.recSession = null;
      }
      if (base.live && !this.live.active) base.live = false;
      this.studioState = base;
      this.compositor.setState(base);
      this.pushState();
    } else if (msg.state) {
      this.applyRemoteState(msg.state);
    }
    this.onRoster(msg.roster ?? []);
  }

  onRoster(roster) {
    this.roster = roster;
    const mine = roster.find((p) => p.id === this.id);
    if (mine) this.me = { ...this.me, ...mine };
    this.hostPresent = roster.some((p) => p.role === "host");
    this.syncPeers();
    if (this.isHost) this.reconcileStage();
    this.changed();
  }

  syncPeers() {
    if (!this.me?.admitted) return;
    const others = this.roster.filter((p) => p.admitted && p.id !== this.id);
    const ids = new Set(others.map((p) => p.id));
    for (const p of others) {
      if (this.peers.has(p.id)) continue;
      const initiator = this.me.admittedAt > p.admittedAt || (this.me.admittedAt === p.admittedAt && this.id > p.id);
      this.createPeer(p.id, initiator);
    }
    for (const id of [...this.peers.keys()]) if (!ids.has(id)) this.dropPeer(id);
  }

  createPeer(remoteId, initiator) {
    const peer = new PeerLink({
      remoteId,
      initiator,
      iceServers: this.iceServers,
      sendSignal: (data) => this.send({ type: "signal", to: remoteId, data }),
      getTrack: (slot) => this.trackForSlot(slot),
    });
    peer.on("tracks", () => {
      this.pool.video(remoteId, peer.camStream);
      this.pool.audio(remoteId, peer.camStream);
      this.mixer.setStream(remoteId, peer.camStream);
      if (peer.screenStream.getTracks().length) {
        this.pool.video(`screen:${remoteId}`, peer.screenStream);
        if (peer.screenStream.getAudioTracks().length) {
          this.pool.audio(`screen:${remoteId}`, peer.screenStream);
          this.mixer.setStream(`screen:${remoteId}`, peer.screenStream);
        }
      }
      this.syncProgramAudio();
      this.changed();
    });
    peer.on("state", (st) => {
      this.peerStates[remoteId] = st;
      this.changed();
    });
    this.peers.set(remoteId, peer);
    peer.start().catch((e) => console.warn("[studio] peer start failed", e));
    return peer;
  }

  dropPeer(id) {
    this.peers.get(id)?.close();
    this.peers.delete(id);
    delete this.peerStates[id];
    this.pool.remove(id);
    this.pool.remove(`screen:${id}`);
    this.mixer.remove(id);
    this.mixer.remove(`screen:${id}`);
  }

  onSignal(from, data) {
    if (!data) return;
    let peer = this.peers.get(from);
    if (!peer && this.me?.admitted) peer = this.createPeer(from, false);
    peer?.handleSignal(data);
  }

  trackForSlot(slot) {
    if (slot === SLOTS.mic) return this.micTrack;
    if (slot === SLOTS.cam) return this.camTrack;
    if (slot === SLOTS.screen) return this.screenStream?.getVideoTracks()[0] ?? null;
    if (slot === SLOTS.screenAudio) return this.screenStream?.getAudioTracks()[0] ?? null;
    return null;
  }

  onCommand(command, payload) {
    if (command === "mute") {
      this.setMic(false);
      this.notify("The host muted your microphone.");
    } else if (command === "cam-off") {
      this.setCam(false);
      this.notify("The host turned off your camera.");
    } else if (command === "message" && payload?.text) {
      this.notify(payload.text);
    }
  }

  // ---------- shared studio state ----------

  applyRemoteState(state) {
    const prev = this.studioState;
    this.studioState = { ...defaultStudioState(), ...state };
    this.compositor.setState(this.studioState);
    this.handleRecordingState(prev, this.studioState);
    this.changed();
  }

  /** Host only. Accepts a patch object or a function of the current state. */
  updateState(patch) {
    if (!this.isHost) return;
    const prev = this.studioState;
    const delta = typeof patch === "function" ? patch(prev) : patch;
    const next = { ...prev, ...delta };
    this.studioState = next;
    this.compositor.setState(next);
    if (next.brand?.color !== prev.brand?.color) this.fxEngine?.setBrandColor(next.brand?.color);
    this.syncProgramAudio();
    this.pushState();
    this.handleRecordingState(prev, next);
    this.changed();
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 1500);
  }

  pushState() {
    this.send({ type: "state", state: this.studioState });
  }

  async persist() {
    try {
      await base44.entities.Studio.update(this.studioId, {
        settings: persistableState(this.studioState),
        last_session_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[studio] could not save studio settings", e);
    }
  }

  reconcileStage() {
    const s = this.studioState;
    const byId = new Map(this.roster.filter((p) => p.admitted).map((p) => [p.id, p]));
    const valid = (id) => (isScreenItem(id) ? byId.get(id.slice(7))?.media?.screen : byId.has(id));
    let stage = s.stage.filter(valid);
    let layout = s.layout;
    const freshScreens = [];
    // Put fresh screen shares on stage automatically, like a production switcher would.
    for (const p of byId.values()) {
      const sid = `screen:${p.id}`;
      if (p.media?.screen && !this.knownScreens?.has(sid)) {
        freshScreens.push(sid);
        if (!stage.includes(sid)) stage = [sid, ...stage];
        if (!layout.startsWith("screen")) layout = "screen";
      }
    }
    this.knownScreens = new Set([...byId.values()].filter((p) => p.media?.screen).map((p) => `screen:${p.id}`));
    const zoomed = freshScreens.filter((id) => s.screenView?.[id]);
    if (stage.length !== s.stage.length || stage.some((id, i) => id !== s.stage[i]) || layout !== s.layout || zoomed.length) {
      const patch = { stage, layout };
      if (zoomed.length) {
        // A new share starts un-zoomed.
        const screenView = { ...s.screenView };
        for (const id of zoomed) delete screenView[id];
        patch.screenView = screenView;
      }
      this.updateState(patch);
    }
  }

  syncProgramAudio() {
    const s = this.studioState;
    for (const id of this.mixer.inputs.keys()) {
      if (id === "clip") this.mixer.setInProgram(id, !!(s.clip?.url && s.clip.playing));
      else this.mixer.setInProgram(id, s.scene === "stage" && s.stage.includes(id) && !(s.clip?.playing));
    }
    if (this.isHost && this.compositor.clipVideo && !this.mixer.inputs.has("clip")) {
      try {
        this.compositor.clipVideo.muted = false;
        this.mixer.setElement("clip", this.compositor.clipVideo, { monitor: true });
        this.mixer.setInProgram("clip", !!s.clip?.playing);
      } catch (e) {
        console.warn("[studio] clip audio unavailable", e);
      }
    }
  }

  // Host actions
  addToStage(id) {
    this.updateState((s) => (s.stage.includes(id) ? {} : { stage: [...s.stage, id] }));
  }
  removeFromStage(id) {
    this.updateState((s) => ({ stage: s.stage.filter((x) => x !== id) }));
  }
  moveOnStage(id, dir) {
    this.updateState((s) => {
      const i = s.stage.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.stage.length) return {};
      const stage = [...s.stage];
      [stage[i], stage[j]] = [stage[j], stage[i]];
      return { stage };
    });
  }
  admit(id) {
    this.send({ type: "admit", id });
  }
  kick(id, reason = "removed") {
    this.send({ type: "kick", id, reason });
  }
  remote(id, command, payload) {
    this.send({ type: "command", to: id, command, payload });
  }

  // ---------- sources for the compositor and UI ----------

  participant(id) {
    return this.roster.find((p) => p.id === id);
  }

  streamFor(id) {
    if (id === this.id) return this.localStream;
    if (id === `screen:${this.id}`) return this.screenStream;
    if (isScreenItem(id)) return this.peers.get(id.slice(7))?.screenStream ?? null;
    return this.peers.get(id)?.camStream ?? null;
  }

  source(id) {
    const pid = isScreenItem(id) ? id.slice(7) : id;
    const p = this.participant(pid) ?? (pid === this.id ? { id: this.id, name: this.name, headline: this.headline, media: {} } : null);
    if (!p) return null;
    const local = pid === this.id;
    if (isScreenItem(id)) {
      const stream = local ? this.screenStream : this.peers.get(pid)?.screenStream;
      const sharing = local ? !!this.screenStream : !!p.media?.screen;
      if (!stream || !sharing) return null;
      return { video: this.pool.video(id, stream), hasVideo: true, name: `${p.name}'s screen`, headline: "", level: 0, micOn: false };
    }
    const stream = local ? this.localStream : this.peers.get(pid)?.camStream;
    const camOn = local ? this.camOn : !!p.media?.cam;
    const micOn = local ? this.micOn : !!p.media?.mic;
    return {
      video: stream ? this.pool.video(id, stream) : null,
      hasVideo: !!stream && camOn,
      mirror: local ? this.fx.mirror !== false : p.media?.mirror !== false,
      name: local ? this.name : p.name,
      headline: local ? this.headline : p.headline,
      level: micOn ? this.mixer.level(id) : 0,
      micOn,
    };
  }

  level(id) {
    return this.mixer.level(id);
  }

  // ---------- local media controls ----------

  sendMedia() {
    this.send({ type: "media", media: { mic: this.micOn, cam: this.camOn, screen: !!this.screenStream, mirror: this.fx.mirror !== false } });
  }

  // ---------- camera effects ----------

  /** Apply touch-up / background / framing / mirror settings to my camera. */
  async applyEffects(next, { quiet = false } = {}) {
    const prevMirror = this.fx.mirror;
    this.fx = { ...DEFAULT_FX, ...next };
    saveFx(this.fx);
    if (prevMirror !== this.fx.mirror) this.sendMedia();
    if (!this.fxEngine && this.rawCam && fxActive(this.fx)) {
      this.fxLoading = true;
      this.changed();
      try {
        const engine = new CameraFX(fxSize(this.fx.quality));
        engine.setBrandColor(this.studioState.brand?.color);
        engine.setSettings(this.fx);
        const out = await engine.start(this.rawCam);
        this.fxEngine = engine;
        out.enabled = this.camOn;
        this.swapCamTrack(out);
      } catch (e) {
        this.fxError = e.message || "Camera effects aren't supported in this browser.";
        if (!quiet) this.notify(this.fxError, "warning");
      } finally {
        this.fxLoading = false;
      }
    }
    // Once running, the engine stays on (pass-through when everything is off)
    // so recordings and guests never see the camera track swap mid-show.
    if (this.fxEngine) {
      const { maxWidth, maxHeight } = fxSize(this.fx.quality);
      this.fxEngine.setMaxSize(maxWidth, maxHeight);
      this.fxEngine.setBrandColor(this.studioState.brand?.color);
      this.fxEngine.setSettings(this.fx);
    }
    this.changed();
  }

  swapCamTrack(track) {
    const old = this.camTrack;
    if (old && old !== this.rawCam) old.stop();
    if (old) this.localStream.removeTrack(old);
    this.camTrack = track;
    this.localStream.addTrack(track);
    for (const p of this.peers.values()) p.setTrack(SLOTS.cam, track);
    this.pool.remove(this.id);
    this.localVersion = (this.localVersion ?? 0) + 1;
  }

  setMic(on) {
    if (!this.micTrack) return;
    this.micOn = on;
    this.micTrack.enabled = on;
    this.sendMedia();
    this.changed();
  }

  setCam(on) {
    if (!this.camTrack) return;
    this.camOn = on;
    this.camTrack.enabled = on;
    if (this.rawCam) this.rawCam.enabled = on;
    this.sendMedia();
    this.changed();
  }

  setProfile({ name, headline }) {
    if (name !== undefined) this.name = name;
    if (headline !== undefined) this.headline = headline;
    this.send({ type: "profile", name: this.name, headline: this.headline });
    this.changed();
  }

  async switchCamera(deviceId, resolution) {
    if (this.recorders.size) throw new Error("Stop recording before switching devices.");
    const track = await getCamera({ deviceId, resolution: resolution ?? this.prefs.resolution });
    track.enabled = this.camOn || !this.camTrack;
    if (this.fxEngine) {
      // Effects keep their output track; only the camera feeding them changes.
      const oldRaw = this.rawCam;
      this.rawCam = track;
      this.fxEngine.setSource(track);
      oldRaw?.stop();
      this.changed();
      return;
    }
    this.rawCam = track;
    const old = this.camTrack;
    if (old) {
      this.localStream.removeTrack(old);
      old.stop();
    }
    this.camTrack = track;
    if (!old) this.camOn = true;
    this.localStream.addTrack(track);
    for (const p of this.peers.values()) p.setTrack(SLOTS.cam, track);
    this.pool.remove(this.id);
    this.localVersion = (this.localVersion ?? 0) + 1;
    this.sendMedia();
    this.changed();
  }

  async switchMic(deviceId, processing = {}) {
    if (this.recorders.size) throw new Error("Stop recording before switching devices.");
    const track = await getMicrophone({ deviceId, ...processing });
    track.enabled = this.micOn || !this.micTrack;
    const old = this.micTrack;
    if (old) {
      this.localStream.removeTrack(old);
      old.stop();
    }
    this.micTrack = track;
    if (!old) this.micOn = true;
    this.localStream.addTrack(track);
    this.mixer.setStream(this.id, new MediaStream([track]));
    for (const p of this.peers.values()) p.setTrack(SLOTS.mic, track);
    this.syncProgramAudio();
    this.sendMedia();
    this.changed();
  }

  setSpeaker(deviceId) {
    this.pool.setSink(deviceId);
  }

  async startScreen() {
    if (this.screenStream) return;
    const stream = await getScreen();
    const v = stream.getVideoTracks()[0];
    this.screenStream = stream;
    this.applyScreenMode();
    v?.addEventListener("ended", () => this.stopScreen());
    for (const p of this.peers.values()) {
      p.setTrack(SLOTS.screen, v ?? null);
      p.setTrack(SLOTS.screenAudio, stream.getAudioTracks()[0] ?? null);
    }
    if (stream.getAudioTracks().length) this.mixer.setStream(`screen:${this.id}`, stream);
    this.sendMedia(); // the host's stage picks up the new share from the roster update
    if (this.studioState.recording && this.studioState.recSession?.isolated) this.startScreenRecorder(this.studioState.recSession);
    this.changed();
  }

  /**
   * "smooth" keeps the frame rate up so zooming, scrolling and video on the
   * shared screen stay fluid; "text" favours crisp static text over motion.
   */
  get screenMode() {
    try {
      return localStorage.getItem("live-studio-screen-mode") === "text" ? "text" : "smooth";
    } catch {
      return "smooth";
    }
  }

  setScreenMode(mode) {
    try {
      localStorage.setItem("live-studio-screen-mode", mode === "text" ? "text" : "smooth");
    } catch {
      /* ignore */
    }
    this.applyScreenMode();
    this.changed();
  }

  applyScreenMode() {
    const v = this.screenStream?.getVideoTracks()[0];
    if (!v) return;
    const text = this.screenMode === "text";
    if ("contentHint" in v) v.contentHint = text ? "detail" : "motion";
    v.applyConstraints?.({ frameRate: { ideal: text ? 15 : 30, max: 60 } }).catch(() => {});
    for (const p of this.peers.values()) p.setScreenMode?.(text);
  }

  stopScreen() {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    for (const p of this.peers.values()) {
      p.setTrack(SLOTS.screen, null);
      p.setTrack(SLOTS.screenAudio, null);
    }
    this.mixer.remove(`screen:${this.id}`);
    this.pool.remove(`screen:${this.id}`);
    const rec = this.recorders.get("screen");
    if (rec) this.finishRecorder("screen");
    this.sendMedia();
    this.changed();
  }

  sendChat(text) {
    const t = String(text || "").trim();
    if (t) this.send({ type: "chat", text: t });
  }

  markChatRead() {
    if (this.unread) {
      this.unread = 0;
      this.changed();
    }
  }

  setQuality(q) {
    this.prefs.quality = q;
    this.compositor.setQuality(q);
  }

  // ---------- recording ----------

  async pickRecordingFolder() {
    if (!window.showDirectoryPicker) throw new Error("Your browser can't save straight to a folder. Files will be offered as downloads instead.");
    this.recFolder = await window.showDirectoryPicker({ mode: "readwrite", id: "live-studio-recordings" });
    this.changed();
    return this.recFolder.name;
  }

  clearRecordingFolder() {
    this.recFolder = null;
    this.changed();
  }

  /** Host: start a recording session for everyone in the studio. */
  async startRecording({ program = true, isolated = true, audioOnly = true, drive = true } = {}) {
    if (!this.isHost || this.studioState.recording) return;
    const sessionId = `${stamp()}-${uid(4)}`;
    const title = `${this.studioTitle} ${new Date().toLocaleString()}`;
    let folderId = null;
    let folderUrl = null;
    if (drive) {
      try {
        const res = await invokeFn("driveUpload", { action: "prepare", studioId: this.studioId, sessionId, sessionTitle: title });
        folderId = res.data?.folderId;
        folderUrl = res.data?.folderUrl;
        if (!folderId) throw new Error(res.data?.error || "Drive folder could not be created");
      } catch (e) {
        const msg = e.message;
        this.notify(`Google Drive unavailable (${msg}). Recording locally only.`, "warning");
        drive = false;
      }
    }
    const recSession = { id: sessionId, title, folderId, folderUrl, drive, isolated, audioOnly, program, startedAt: Date.now() };
    this.updateState({ recording: true, recStartedAt: recSession.startedAt, recSession });
    if (program) this.startProgramRecorder(recSession);
  }

  /** Host: stop recording everywhere. */
  async stopRecording() {
    if (!this.isHost) return;
    this.updateState({ recording: false, recSession: null, recStartedAt: null });
    await this.stopLocalRecorders();
  }

  handleRecordingState(prev, next) {
    const startedNow = next.recording && next.recSession && (!prev?.recording || prev.recSession?.id !== next.recSession.id);
    if (startedNow && next.recSession.isolated) {
      this.startIsolatedRecorders(next.recSession);
    }
    if (prev?.recording && !next.recording && !this.isHost) this.stopLocalRecorders();
  }

  programStream() {
    if (!this.program) {
      const v = this.compositor.captureStream(30).getVideoTracks()[0];
      this.program = new MediaStream([v, this.mixer.track]);
    }
    return this.program;
  }

  makeSinks(rec, recSession, fileName, kind) {
    const sinks = [];
    if (recSession.drive && recSession.folderId) {
      const file = this.localFiles.find((f) => f.key === rec.key);
      sinks.push(
        new DriveSink({
          studioId: this.studioId,
          code: this.code,
          folderId: recSession.folderId,
          fileName,
          mimeType: rec.recorder.contentType,
          meta: {
            sessionId: recSession.id,
            sessionTitle: recSession.title,
            participantName: this.name,
            kind,
            durationSec: 0,
          },
          onProgress: ({ uploaded, error }) => {
            if (file) {
              file.uploaded = uploaded;
              if (error) file.driveError = error;
              this.changed();
            }
          },
        })
      );
    }
    if (this.recFolder) sinks.push(new FolderSink(this.recFolder, fileName));
    else sinks.push(new MemorySink(rec.recorder.contentType));
    return sinks;
  }

  beginRecorder(key, { stream, kind, label, recSession, fileStem, videoBitsPerSecond }) {
    if (this.recorders.has(key)) return;
    const recorder = new TrackRecorder({ stream, kind: kind === "audio" ? "audio" : "video", label, videoBitsPerSecond });
    const fileName = `${fileStem}.${recorder.ext}`;
    const file = { key: `${key}-${recSession.id}`, label, kind, fileName, bytes: 0, uploaded: 0, status: "recording", drive: !!recSession.drive };
    this.localFiles = [file, ...this.localFiles];
    const rec = { key: file.key, recorder, file, recSession, kind };
    for (const sink of this.makeSinks(rec, recSession, fileName, kind)) recorder.addSink(sink);
    recorder.on("progress", (bytes) => {
      file.bytes = bytes;
      this.changedThrottled();
    });
    recorder.on("error", (e) => {
      file.status = "error";
      file.error = e?.message || String(e);
      this.changed();
    });
    recorder.start(1000);
    this.recorders.set(key, rec);
    this.changed();
  }

  changedThrottled() {
    const now = Date.now();
    if (now - (this.lastThrottle || 0) > 500) {
      this.lastThrottle = now;
      this.changed();
    }
  }

  startProgramRecorder(recSession) {
    this.beginRecorder("program", {
      stream: this.programStream(),
      kind: "program",
      label: "Program (composite)",
      recSession,
      fileStem: `${slug(this.studioTitle, "studio")}_program_${recSession.id}`,
      videoBitsPerSecond: this.prefs.quality === "720p" ? 5_000_000 : 8_000_000,
    });
  }

  startIsolatedRecorders(recSession) {
    const who = slug(this.name, "guest");
    const tracks = [this.camTrack, this.micTrack].filter(Boolean);
    if (tracks.length) {
      this.beginRecorder("participant", {
        stream: new MediaStream(tracks),
        kind: this.camTrack ? "participant" : "audio",
        label: this.camTrack ? `${this.name} (camera + mic)` : `${this.name} (audio)`,
        recSession,
        fileStem: `${who}_${recSession.id}`,
        videoBitsPerSecond: 12_000_000,
      });
    }
    if (recSession.audioOnly && this.micTrack && this.camTrack) {
      this.beginRecorder("audio", {
        stream: new MediaStream([this.micTrack]),
        kind: "audio",
        label: `${this.name} (audio only)`,
        recSession,
        fileStem: `${who}_audio_${recSession.id}`,
      });
    }
    if (this.screenStream) this.startScreenRecorder(recSession);
  }

  startScreenRecorder(recSession) {
    if (!this.screenStream) return;
    this.beginRecorder("screen", {
      stream: this.screenStream,
      kind: "screen",
      label: `${this.name} (screen)`,
      recSession,
      fileStem: `${slug(this.name, "guest")}_screen_${recSession.id}_${uid(3)}`,
      videoBitsPerSecond: 6_000_000,
    });
  }

  async finishRecorder(key) {
    const rec = this.recorders.get(key);
    if (!rec) return;
    this.recorders.delete(key);
    const { recorder, file } = rec;
    file.status = "finishing";
    this.changed();
    // Duration is only known at the end; hand it to the Drive record.
    for (const s of recorder.sinks) if (s instanceof DriveSink) s.meta.durationSec = Math.round(recorder.durationSec);
    const results = await recorder.stop();
    file.durationSec = Math.round(recorder.durationSec);
    for (const r of results) {
      if (r.sink instanceof DriveSink) {
        if (r.ok) {
          file.driveUrl = r.value.driveUrl;
          file.uploaded = file.bytes;
        } else file.driveError = r.error?.message || "Upload failed";
      } else if (r.sink instanceof MemorySink && r.ok) {
        file.blob = r.value.blob;
      } else if (r.sink instanceof FolderSink) {
        if (r.ok) file.savedTo = `${this.recFolder?.name ?? "folder"}/${file.fileName}`;
        else file.error = r.error?.message || "Could not write file";
      }
    }
    file.status = file.driveError && !file.blob && !file.savedTo ? "error" : "done";
    this.changed();
  }

  async stopLocalRecorders() {
    await Promise.all([...this.recorders.keys()].map((k) => this.finishRecorder(k)));
  }

  // ---------- going live ----------

  async goLive(destinationIds, { title = "", description = "", overrides = {} } = {}) {
    if (!this.isHost || this.live.active || this.live.starting) return;
    this.live = { ...this.live, starting: true, error: null };
    this.changed();
    try {
      const res = await invokeFn("liveControl", { action: "start", studioId: this.studioId, destinationIds, title, description, overrides });
      const data = res.data ?? {};
      if (data.error) throw new Error(data.error);
      const stream = this.programStream();
      const outputs = [...(data.outputs ?? [])];
      this.publishers = [];
      if (data.restreamWhipUrl) {
        this.publishers.push(await whipPublish({ url: data.restreamWhipUrl, stream, iceServers: this.iceServers }));
      }
      for (const w of data.whip ?? []) {
        try {
          this.publishers.push(await whipPublish({ url: w.url, token: w.token, stream, iceServers: this.iceServers }));
          outputs.push({ id: w.id, name: w.name, ok: true });
        } catch (e) {
          outputs.push({ id: w.id, name: w.name, ok: false, error: e.message });
        }
      }
      if (!this.publishers.length || !outputs.some((o) => o.ok)) {
        for (const p of this.publishers) p.stop();
        this.publishers = [];
        if (data.liveInputId || data.youtubeBroadcasts?.length) {
          invokeFn("liveControl", { action: "stop", studioId: this.studioId, liveInputId: data.liveInputId, youtubeBroadcasts: data.youtubeBroadcasts }).catch(() => {});
        }
        throw new Error(outputs.find((o) => o.error)?.error || "No destination could be reached.");
      }
      this.live = { active: true, starting: false, startedAt: Date.now(), outputs, liveInputId: data.liveInputId, youtubeBroadcasts: data.youtubeBroadcasts ?? [], error: null };
      this.updateState({ live: true, liveStartedAt: this.live.startedAt });
    } catch (e) {
      const msg = e.message;
      this.live = { active: false, starting: false, startedAt: null, outputs: [], error: msg };
      for (const p of this.publishers) p.stop();
      this.publishers = [];
      this.notify(`Could not go live: ${msg}`, "error");
    }
    this.changed();
  }

  async endLive() {
    if (!this.live.active) return;
    const id = this.live.liveInputId;
    const youtubeBroadcasts = this.live.youtubeBroadcasts ?? [];
    await Promise.all(this.publishers.map((p) => p.stop()));
    this.publishers = [];
    this.live = { active: false, starting: false, startedAt: null, outputs: [], error: null };
    this.updateState({ live: false, liveStartedAt: null });
    if (id || youtubeBroadcasts.length) invokeFn("liveControl", { action: "stop", studioId: this.studioId, liveInputId: id, youtubeBroadcasts }).catch(() => {});
    this.changed();
  }
}
