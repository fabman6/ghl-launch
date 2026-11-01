// Mixes audio for the program feed and measures levels for meters and the
// active-speaker ring. Every participant gets an analyser; only sources that
// are "in program" (on stage, or the playing clip) reach the output.
export class AudioMixer {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive", sampleRate: 48000 });
    this.dest = this.ctx.createMediaStreamDestination();
    this.master = this.ctx.createGain();
    this.master.connect(this.dest);
    this.inputs = new Map();
    this.buf = new Float32Array(1024);
  }

  resume() {
    if (this.ctx.state !== "running") return this.ctx.resume().catch(() => {});
  }

  get track() {
    return this.dest.stream.getAudioTracks()[0];
  }

  /** Attach (or replace) the audio for a source id. */
  setStream(id, stream) {
    const existing = this.inputs.get(id);
    const track = stream?.getAudioTracks?.()[0] ?? null;
    if (existing && existing.trackId === track?.id) return;
    this.remove(id);
    if (!track) return;
    const node = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.wire(id, node, { trackId: track.id, inProgram: existing?.inProgram ?? false, volume: existing?.volume ?? 1 });
  }

  /** Attach a media element (video clips). Can only be done once per element. */
  setElement(id, el, { monitor = true } = {}) {
    if (this.inputs.get(id)?.el === el) return;
    this.remove(id);
    const node = this.ctx.createMediaElementSource(el);
    const rec = this.wire(id, node, { el, inProgram: false, volume: 1 });
    if (monitor) node.connect(this.ctx.destination);
    rec.monitor = monitor;
  }

  wire(id, node, extra) {
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    const gain = this.ctx.createGain();
    node.connect(analyser);
    node.connect(gain);
    gain.connect(this.master);
    const rec = { node, analyser, gain, ...extra };
    gain.gain.value = rec.inProgram ? rec.volume : 0;
    this.inputs.set(id, rec);
    return rec;
  }

  setInProgram(id, on) {
    const rec = this.inputs.get(id);
    if (!rec) return;
    rec.inProgram = on;
    rec.gain.gain.setTargetAtTime(on ? rec.volume : 0, this.ctx.currentTime, 0.05);
  }

  setVolume(id, v) {
    const rec = this.inputs.get(id);
    if (!rec) return;
    rec.volume = v;
    if (rec.inProgram) rec.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  level(id) {
    const rec = this.inputs.get(id);
    if (!rec) return 0;
    rec.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    return Math.min(1, rms * 4);
  }

  remove(id) {
    const rec = this.inputs.get(id);
    if (!rec) return;
    if (rec.el) return; // element sources cannot be recreated; keep them wired
    try {
      rec.node.disconnect();
      rec.gain.disconnect();
    } catch {
      /* already disconnected */
    }
    this.inputs.delete(id);
  }

  close() {
    this.ctx.close().catch(() => {});
  }
}
