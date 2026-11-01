// Records a MediaStream with MediaRecorder and fans chunks out to sinks
// (memory, a local folder, Google Drive).
import { baseMime, Emitter, pickRecorderType } from "./utils";

export class TrackRecorder extends Emitter {
  constructor({ stream, kind = "video", label, videoBitsPerSecond, audioBitsPerSecond = 192_000 }) {
    super();
    this.stream = stream;
    this.label = label;
    const picked = pickRecorderType(kind);
    this.mimeType = picked.mimeType;
    this.ext = picked.ext;
    this.contentType = baseMime(picked.mimeType || (kind === "audio" ? "audio/webm" : "video/webm"));
    this.opts = { mimeType: picked.mimeType || undefined, audioBitsPerSecond };
    if (kind !== "audio") this.opts.videoBitsPerSecond = videoBitsPerSecond ?? 8_000_000;
    this.sinks = [];
    this.bytes = 0;
    this.startedAt = 0;
    this.stoppedAt = 0;
  }

  addSink(sink) {
    this.sinks.push(sink);
  }

  start(timeslice = 1000) {
    this.rec = new MediaRecorder(this.stream, this.opts);
    this.rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      this.bytes += e.data.size;
      for (const s of this.sinks) {
        Promise.resolve(s.write(e.data)).catch((err) => console.error("[studio] sink write failed", err));
      }
      this.emit("progress", this.bytes);
    };
    this.done = new Promise((resolve) => (this.rec.onstop = resolve));
    this.rec.onerror = (e) => this.emit("error", e.error ?? e);
    this.rec.start(timeslice);
    this.startedAt = Date.now();
  }

  get durationSec() {
    return ((this.stoppedAt || Date.now()) - this.startedAt) / 1000;
  }

  /** Stops recording and closes every sink. Returns one result per sink. */
  async stop() {
    if (this.rec && this.rec.state !== "inactive") {
      this.rec.stop();
      await this.done;
    }
    this.stoppedAt = Date.now();
    const results = await Promise.allSettled(this.sinks.map((s) => s.close()));
    return results.map((r, i) => ({ sink: this.sinks[i], ok: r.status === "fulfilled", value: r.value, error: r.reason }));
  }
}
