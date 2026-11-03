// Teleprompter scripts.
//
//  Signed in   saved to your account (Script entity), so they are there in
//              every studio and on every computer.
//  Guests      kept in this browser (localStorage).
//
// Scripts written as a guest are moved into the account the first time the
// library loads while signed in.
import { base44 } from "@/api/base44Client";
import { uid } from "./utils";

const LOCAL_KEY = "live-studio-scripts";

export const SAMPLE_SCRIPT = `Welcome to the show! [smile]

Today we're talking about one thing that changes everything for small businesses.

[pause]

Before we jump in, if you're watching live, drop a comment and tell us where you're tuning in from.

Let's get into it.`;

function readLocal() {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

function writeLocal(all) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(0, 50)));
  } catch {
    /* storage full or blocked */
  }
}

const byNewest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

/** All scripts as [{ id, title, body, updatedAt, inAccount }], newest first. */
export async function listScripts({ signedIn }) {
  if (!signedIn) return readLocal().map((s) => ({ ...s, inAccount: false })).sort(byNewest);
  let rows = [];
  try {
    rows = await base44.entities.Script.list("-updated_date", 100);
  } catch {
    return readLocal().map((s) => ({ ...s, inAccount: false })).sort(byNewest);
  }
  const local = readLocal();
  if (local.length) {
    const kept = [];
    for (const s of local) {
      try {
        rows.unshift(await base44.entities.Script.create({ title: s.title || "Untitled script", body: s.body || "" }));
      } catch {
        kept.push(s);
      }
    }
    writeLocal(kept);
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title || "Untitled script",
    body: r.body || "",
    updatedAt: Date.parse(r.updated_date || r.created_date || "") || 0,
    inAccount: true,
  }));
}

export async function createScript({ signedIn, title = "Untitled script", body = "" }) {
  if (signedIn) {
    try {
      const r = await base44.entities.Script.create({ title, body });
      return { id: r.id, title, body, updatedAt: Date.now(), inAccount: true };
    } catch {
      /* fall back to this browser */
    }
  }
  const s = { id: `local-${uid(8)}`, title, body, updatedAt: Date.now() };
  writeLocal([s, ...readLocal()]);
  return { ...s, inAccount: false };
}

export async function saveScript(script) {
  const { id, title, body } = script;
  if (script.inAccount) {
    await base44.entities.Script.update(id, { title, body });
    return;
  }
  writeLocal(readLocal().map((s) => (s.id === id ? { ...s, title, body, updatedAt: Date.now() } : s)));
}

export async function deleteScript(script) {
  if (script.inAccount) {
    await base44.entities.Script.delete(script.id);
    return;
  }
  writeLocal(readLocal().filter((s) => s.id !== script.id));
}

/** Rough reading time at a conversational 150 words per minute. */
export function readingMinutes(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return words / 150;
}
