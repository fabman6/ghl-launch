// One WebRTC connection between two studio participants (full mesh).
// Four fixed transceivers so tracks can be swapped without renegotiation:
//   0 mic audio | 1 camera video | 2 screen video | 3 screen audio
import { Emitter } from "./utils";

export const SLOTS = { mic: 0, cam: 1, screen: 2, screenAudio: 3 };
const KINDS = ["audio", "video", "video", "audio"];
const BITRATES = { 1: 1_800_000, 2: 2_500_000 };

export class PeerLink extends Emitter {
  constructor({ remoteId, initiator, iceServers, sendSignal, getTrack }) {
    super();
    this.remoteId = remoteId;
    this.initiator = initiator;
    this.sendSignal = sendSignal;
    this.getTrack = getTrack;
    this.pendingCandidates = [];
    this.camStream = new MediaStream();
    this.screenStream = new MediaStream();
    this.closed = false;
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal({ candidate: e.candidate.toJSON() });
    };
    this.pc.ontrack = (e) => this.onTrack(e);
    this.pc.onconnectionstatechange = () => this.onState();
  }

  get state() {
    return this.pc.connectionState;
  }

  async start() {
    if (!this.initiator) return;
    KINDS.forEach((k) => this.pc.addTransceiver(k, { direction: "sendrecv" }));
    await this.applyTracks();
    await this.makeOffer();
  }

  async makeOffer(iceRestart = false) {
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ sdp: this.pc.localDescription.toJSON() });
  }

  async handleSignal(data) {
    if (this.closed) return;
    try {
      if (data.sdp) {
        const desc = data.sdp;
        if (desc.type === "offer") {
          if (this.pc.signalingState !== "stable") {
            await Promise.all([this.pc.setLocalDescription({ type: "rollback" }).catch(() => {})]);
          }
          await this.pc.setRemoteDescription(desc);
          this.pc.getTransceivers().forEach((t) => {
            if (t.direction !== "sendrecv") t.direction = "sendrecv";
          });
          await this.applyTracks();
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.sendSignal({ sdp: this.pc.localDescription.toJSON() });
        } else if (desc.type === "answer") {
          if (this.pc.signalingState === "have-local-offer") await this.pc.setRemoteDescription(desc);
        }
        for (const c of this.pendingCandidates.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
      } else if (data.candidate) {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(data.candidate).catch(() => {});
        else this.pendingCandidates.push(data.candidate);
      }
    } catch (e) {
      console.warn("[studio] signaling error with", this.remoteId, e);
    }
  }

  async applyTracks() {
    const txs = this.pc.getTransceivers();
    await Promise.all(
      txs.slice(0, 4).map((t, i) => {
        const track = this.getTrack(i) ?? null;
        if (t.sender.track === track) return null;
        return t.sender.replaceTrack(track).catch(() => {});
      })
    );
  }

  /** Swap one outgoing slot (e.g. start/stop screen share, switch camera). */
  async setTrack(slot, track) {
    const t = this.pc.getTransceivers()[slot];
    if (!t) return;
    if (t.sender.track !== track) await t.sender.replaceTrack(track ?? null).catch(() => {});
    if (track && BITRATES[slot]) this.tuneSender(t.sender, BITRATES[slot]);
  }

  async tuneSender(sender, maxBitrate) {
    try {
      const p = sender.getParameters();
      if (!p.encodings?.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = maxBitrate;
      p.encodings[0].maxFramerate = 30;
      await sender.setParameters(p);
    } catch {
      /* not negotiated yet */
    }
  }

  onTrack(e) {
    const idx = this.pc.getTransceivers().indexOf(e.transceiver);
    const target = idx === 2 || idx === 3 ? this.screenStream : this.camStream;
    for (const t of target.getTracks()) if (t.kind === e.track.kind) target.removeTrack(t);
    target.addTrack(e.track);
    this.emit("tracks");
  }

  onState() {
    const st = this.pc.connectionState;
    this.emit("state", st);
    if (st === "connected") {
      const txs = this.pc.getTransceivers();
      Object.entries(BITRATES).forEach(([slot, br]) => {
        const t = txs[Number(slot)];
        if (t?.sender.track) this.tuneSender(t.sender, br);
      });
    }
    if (st === "failed" && this.initiator && !this.closed) {
      this.pc.restartIce?.();
      this.makeOffer(true).catch(() => {});
    }
  }

  close() {
    this.closed = true;
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
    this.emit("closed");
  }
}
