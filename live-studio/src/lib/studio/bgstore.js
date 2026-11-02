// Virtual backgrounds the user uploads.
//
//  Signed in   saved to your account (Background entity + file storage) so
//              they follow you to any computer, with a copy cached in this
//              browser for instant loading.
//  Guests      kept in this browser only (IndexedDB), never uploaded.
//
// Background keys used in camera settings:
//   "account:<entityId>"  saved to the account
//   "stored:<localId>"    saved in this browser only
import { base44 } from "@/api/base44Client";
import { uid } from "./utils";

const DB = "live-studio";
const STORE = "backgrounds";
const MAX_LOCAL_ONLY = 8;
const urls = new Map(); // local id -> object URL
const accountUrls = new Map(); // account id -> file_url

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

/** Downscale to at most 1920x1080 and re-encode, so storage stays small. */
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
    return { blob: blob || file, width: w, height: h };
  } catch {
    return { blob: file, width: 0, height: 0 };
  }
}

async function listLocal() {
  try {
    const all = await tx("readonly", (s) => req(s.getAll()));
    return (all || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function putLocal(item) {
  await tx("readwrite", (s) => req(s.put(item)));
}

async function deleteLocal(id) {
  try {
    await tx("readwrite", (s) => req(s.delete(id)));
  } catch {
    /* ignore */
  }
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

function localUrl(item) {
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.blob));
  return urls.get(item.id);
}

async function listAccount() {
  try {
    const rows = await base44.entities.Background.list("-created_date", 100);
    for (const r of rows) accountUrls.set(r.id, r.file_url);
    return rows;
  } catch {
    return [];
  }
}

async function uploadToAccount(blob, name, width, height) {
  const file = new File([blob], /\.\w+$/.test(name) ? name : `${name}.jpg`, { type: blob.type || "image/jpeg" });
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  const row = await base44.entities.Background.create({ name, file_url, width, height });
  accountUrls.set(row.id, file_url);
  return row;
}

/**
 * Everything to show in the picker. When signed in, any backgrounds that
 * were only in this browser are uploaded to the account first.
 * Returns { items: [{ key, name, thumb, inAccount }], renamed: { oldKey: newKey } }.
 */
export async function loadGallery({ signedIn }) {
  const renamed = {};
  let local = await listLocal();
  let account = [];
  if (signedIn) {
    account = await listAccount();
    // Move browser-only uploads into the account (once).
    for (const item of local.filter((l) => !l.accountId)) {
      try {
        const row = await uploadToAccount(item.blob, item.name, item.width, item.height);
        item.accountId = row.id;
        await putLocal(item);
        account.unshift(row);
        renamed[`stored:${item.id}`] = `account:${row.id}`;
      } catch {
        /* stays local; try again next time */
      }
    }
    local = await listLocal();
  }
  const cachedByAccount = new Map(local.filter((l) => l.accountId).map((l) => [l.accountId, l]));
  const items = [];
  for (const row of account) {
    const cached = cachedByAccount.get(row.id);
    items.push({ key: `account:${row.id}`, name: row.name || "Background", thumb: cached ? localUrl(cached) : row.file_url, inAccount: true });
  }
  for (const l of local.filter((x) => !x.accountId)) {
    items.push({ key: `stored:${l.id}`, name: l.name, thumb: localUrl(l), inAccount: false });
  }
  return { items, renamed };
}

/** Save an uploaded file; returns its background key. */
export async function addBackground(file, { signedIn }) {
  const { blob, width, height } = await shrink(file);
  const name = (file.name || "Background").replace(/\.[^.]+$/, "");
  const item = { id: `bg-${uid(8)}`, name, blob, width, height, createdAt: Date.now() };
  if (signedIn) {
    try {
      const row = await uploadToAccount(blob, name, width, height);
      item.accountId = row.id;
    } catch {
      /* keep it local if the upload fails */
    }
  }
  await putLocal(item);
  // Browser-only uploads are capped; account copies are kept.
  const localOnly = (await listLocal()).filter((l) => !l.accountId);
  for (const old of localOnly.slice(MAX_LOCAL_ONLY)) await deleteLocal(old.id);
  return item.accountId ? `account:${item.accountId}` : `stored:${item.id}`;
}

export async function removeBackground(key) {
  if (key.startsWith("account:")) {
    const id = key.slice(8);
    try {
      await base44.entities.Background.delete(id);
    } catch {
      /* already gone */
    }
    accountUrls.delete(id);
    for (const l of await listLocal()) if (l.accountId === id) await deleteLocal(l.id);
  } else if (key.startsWith("stored:")) {
    await deleteLocal(key.slice(7));
  }
}

/** URL the effects engine can load for a background key (null if it no longer exists). */
export async function resolveBackground(key) {
  if (key.startsWith("stored:")) {
    const item = await tx("readonly", (s) => req(s.get(key.slice(7)))).catch(() => null);
    return item?.blob ? localUrl(item) : null;
  }
  if (key.startsWith("account:")) {
    const id = key.slice(8);
    const cached = (await listLocal()).find((l) => l.accountId === id);
    if (cached) return localUrl(cached);
    let fileUrl = accountUrls.get(id);
    if (!fileUrl) {
      try {
        const row = await base44.entities.Background.get(id);
        fileUrl = row?.file_url;
      } catch {
        return null;
      }
    }
    if (!fileUrl) return null;
    // Cache a copy in this browser for next time (the file host allows CORS).
    try {
      const blob = await (await fetch(fileUrl)).blob();
      const item = { id: `bg-${uid(8)}`, name: "Background", blob, accountId: id, createdAt: Date.now() };
      await putLocal(item);
      return localUrl(item);
    } catch {
      return fileUrl;
    }
  }
  return key;
}
