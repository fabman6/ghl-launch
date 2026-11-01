// Destinations for recorded media chunks. A recorder writes each chunk to
// every sink; sinks are independent so a Drive outage never loses the local copy.
import { invokeFn } from "./api";
import { sleep } from "./utils";

const QUANTUM = 256 * 1024; // Google requires chunk sizes in multiples of 256 KiB
const CHUNK = QUANTUM * 32; // 8 MiB per request

/** Keeps the recording in memory (Chrome spills large blobs to disk). */
export class MemorySink {
  constructor(mimeType) {
    this.mimeType = mimeType;
    this.parts = [];
    this.size = 0;
  }
  async write(blob) {
    this.parts.push(blob);
    this.size += blob.size;
  }
  async close() {
    return { blob: new Blob(this.parts, { type: this.mimeType }) };
  }
}

/** Streams straight into a file in a folder the user picked (Chrome/Edge). */
export class FolderSink {
  constructor(dirHandle, fileName) {
    this.dir = dirHandle;
    this.fileName = fileName;
    this.writable = null;
    this.chain = Promise.resolve();
  }
  async open() {
    const fh = await this.dir.getFileHandle(this.fileName, { create: true });
    this.writable = await fh.createWritable();
  }
  write(blob) {
    this.chain = this.chain.then(async () => {
      if (!this.writable) await this.open();
      await this.writable.write(blob);
    });
    return this.chain;
  }
  async close() {
    await this.chain;
    if (this.writable) await this.writable.close();
    return { savedTo: this.fileName };
  }
}

/**
 * Progressive upload to Google Drive using a resumable upload session.
 * Chunks are uploaded while recording, so stopping only flushes the tail.
 */
export class DriveSink {
  constructor({ studioId, code, folderId, fileName, mimeType, meta, onProgress }) {
    Object.assign(this, { studioId, code, folderId, fileName, mimeType, meta, onProgress });
    this.pending = [];
    this.pendingSize = 0;
    this.offset = 0;
    this.uploadUrl = null;
    this.result = null;
    this.error = null;
    this.chain = Promise.resolve();
  }

  async init() {
    const res = await invokeFn("driveUpload", {
      action: "start",
      studioId: this.studioId,
      code: this.code,
      folderId: this.folderId,
      fileName: this.fileName,
      mimeType: this.mimeType,
      origin: window.location.origin,
    });
    this.uploadUrl = res.data?.uploadUrl;
    if (!this.uploadUrl) throw new Error(res.data?.error || "Could not start Drive upload");
  }

  write(blob) {
    this.pending.push(blob);
    this.pendingSize += blob.size;
    if (this.pendingSize >= CHUNK) this.chain = this.chain.then(() => this.flush(false)).catch((e) => this.fail(e));
    return Promise.resolve();
  }

  fail(e) {
    this.error = e;
    console.error("[studio] Drive upload failed", e);
    this.onProgress?.({ uploaded: this.offset, error: e.message });
  }

  async flush(final) {
    if (this.error) return;
    if (!this.uploadUrl) await this.init();
    const buf = new Blob(this.pending, { type: this.mimeType });
    const sendLen = final ? buf.size : Math.floor(buf.size / QUANTUM) * QUANTUM;
    if (!final && sendLen === 0) return;
    let part = buf.slice(0, sendLen);
    const rest = buf.slice(sendLen);
    this.pending = [rest];
    this.pendingSize = rest.size;

    let start = this.offset;
    const total = final ? start + part.size : null;
    for (let attempt = 0; ; attempt++) {
      const end = start + part.size - 1;
      const range = part.size ? `bytes ${start}-${end}/${total ?? "*"}` : `bytes */${total}`;
      try {
        const res = await fetch(this.uploadUrl, { method: "PUT", headers: { "Content-Range": range }, body: part });
        if (res.status === 200 || res.status === 201) {
          this.result = await res.json();
          this.offset = total;
          this.onProgress?.({ uploaded: this.offset, done: true });
          return;
        }
        if (res.status === 308) {
          const committed = this.committedFrom(res, start + part.size);
          if (committed < start + part.size) {
            part = part.slice(committed - start);
            start = committed;
            continue;
          }
          this.offset = committed;
          this.onProgress?.({ uploaded: this.offset });
          return;
        }
        if (res.status === 404 || res.status === 410) throw new Error("Drive upload session expired");
        if (res.status < 500 && res.status !== 429) throw new Error(`Drive upload rejected (${res.status})`);
      } catch (e) {
        if (attempt >= 6 || /expired|rejected/.test(e.message)) throw e;
      }
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
      // Ask Google how much it already has, then resend the remainder.
      try {
        const st = await fetch(this.uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes */${total ?? "*"}` } });
        if (st.status === 200 || st.status === 201) {
          this.result = await st.json();
          this.offset = total;
          return;
        }
        if (st.status === 308) {
          const committed = this.committedFrom(st, start);
          if (committed > start) {
            part = part.slice(committed - start);
            start = committed;
          }
        }
      } catch {
        /* network still down, retry */
      }
    }
  }

  committedFrom(res, assumed) {
    const range = res.headers.get("Range");
    if (!range) return assumed;
    const m = /bytes=0-(\d+)/.exec(range);
    return m ? Number(m[1]) + 1 : 0;
  }

  async close() {
    await this.chain;
    if (this.error) throw this.error;
    await this.flush(true);
    if (!this.result?.id) throw new Error("Drive did not confirm the upload");
    const fin = await invokeFn("driveUpload", {
      action: "finish",
      studioId: this.studioId,
      code: this.code,
      fileId: this.result.id,
      ...this.meta,
    });
    return { driveFileId: this.result.id, driveUrl: fin.data?.driveUrl, folderUrl: fin.data?.folderUrl };
  }
}
