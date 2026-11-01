// Uploaded virtual backgrounds, kept in this browser (IndexedDB) so they are
// still there next session. Images never leave the device.
import { uid } from "./utils";

const DB = "live-studio";
const STORE = "backgrounds";
const MAX_SAVED = 8;
const urls = new Map();

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser can't save backgrounds."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => (result = r));
    t.oncomplete = () => {
      db.close();
      resolve(result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Downscale to at most 1920px wide and re-encode, so storage stays small. */
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, 1920 / bmp.width, 1080 / bmp.height);
    const w = Math.round(bmp.width * sc);
    const h = Math.round(bmp.height * sc);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    return blob || file;
  } catch {
    return file;
  }
}

export async function listBackgrounds() {
  try {
    const all = await tx("readonly", (s) => req(s.getAll()));
    return (all || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveBackground(file) {
  const blob = await shrink(file);
  const item = { id: `bg-${uid(8)}`, name: file.name || "Background", blob, createdAt: Date.now() };
  await tx("readwrite", (s) => req(s.put(item)));
  // Keep the gallery tidy: drop the oldest beyond the limit.
  const all = await listBackgrounds();
  for (const old of all.slice(MAX_SAVED)) await deleteBackground(old.id);
  return item;
}

export async function deleteBackground(id) {
  await tx("readwrite", (s) => req(s.delete(id)));
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

/** Object URL for a stored background, or null if it was deleted. */
export async function backgroundUrl(id) {
  if (urls.has(id)) return urls.get(id);
  try {
    const item = await tx("readonly", (s) => req(s.get(id)));
    if (!item?.blob) return null;
    const u = URL.createObjectURL(item.blob);
    urls.set(id, u);
    return u;
  } catch {
    return null;
  }
}

export function urlFor(item) {
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.blob));
  return urls.get(item.id);
}
