// Google Drive storage for studio recordings.
//
// Actions:
//   status   -> { connected, account }             (any signed-in user)
//   prepare  -> creates the session folder         (host)
//   start    -> opens a resumable upload session    (host or guest with invite code)
//   finish   -> records the uploaded file           (host or guest with invite code)
//
// The browser streams the recording straight to Google's resumable upload URL
// while recording, so files never pass through this function.
import { createClientFromRequest } from "npm:@base44/sdk";
import { currentUser, fail, HttpError, json, readBody, requireHost, resolveAccess } from "../../shared/studio.ts";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ROOT_FOLDER = "Live Studio Recordings";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function driveToken(base44: any): Promise<string> {
  try {
    const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
    if (!conn?.accessToken) throw new Error("missing token");
    return conn.accessToken;
  } catch {
    throw new HttpError(412, "Google Drive is not connected. Connect it in Settings.");
  }
}

async function gfetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpError(502, `Google Drive error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

function q(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateFolder(token: string, name: string, parentId: string | null, appProperties: Record<string, string>) {
  const props = Object.entries(appProperties)
    .map(([k, v]) => ` and appProperties has { key='${q(k)}' and value='${q(v)}' }`)
    .join("");
  const parent = parentId ? ` and '${q(parentId)}' in parents` : "";
  const query = `mimeType='${FOLDER_MIME}' and trashed=false and name='${q(name)}'${parent}${props}`;
  const list = await (await gfetch(token, `${DRIVE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1`)).json();
  if (list.files?.length) return list.files[0];
  const created = await gfetch(token, `${DRIVE}/files?fields=id,name,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined, appProperties }),
  });
  return await created.json();
}

function safeName(s: string, fallback: string) {
  const cleaned = String(s ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 120);
  return cleaned || fallback;
}

export default async function (req: Request): Promise<Response> {
  try {
    const body = await readBody(req);
    const action = body.action;

    if (action === "status") {
      const base44 = createClientFromRequest(req);
      if (!(await currentUser(base44))) throw new HttpError(401, "Sign in first");
      try {
        const token = await driveToken(base44);
        const about = await (await gfetch(token, `${DRIVE}/about?fields=user(emailAddress,displayName)`)).json();
        return json({ connected: true, account: about.user?.emailAddress ?? null });
      } catch {
        return json({ connected: false });
      }
    }

    if (action === "prepare") {
      const { base44, studio } = await requireHost(req, body);
      const token = await driveToken(base44);
      const root = await findOrCreateFolder(token, ROOT_FOLDER, null, { liveStudioRoot: "1" });
      const studioFolder = await findOrCreateFolder(token, safeName(studio.title, "Studio"), root.id, { studioId: studio.id });
      const sessionId = safeName(body.sessionId, "") || crypto.randomUUID();
      const title = safeName(body.sessionTitle, `Session ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
      const folder = await findOrCreateFolder(token, title, studioFolder.id, { studioId: studio.id, sessionId });
      return json({ folderId: folder.id, folderUrl: folder.webViewLink, sessionId });
    }

    if (action === "start") {
      const { base44, studio } = await resolveAccess(req, body);
      const token = await driveToken(base44);
      if (!body.folderId) throw new HttpError(400, "folderId is required");
      // Only allow uploads into a session folder that belongs to this studio.
      const folder = await (await gfetch(token, `${DRIVE}/files/${encodeURIComponent(body.folderId)}?fields=id,appProperties,trashed`)).json();
      if (folder.trashed || folder.appProperties?.studioId !== studio.id || !folder.appProperties?.sessionId) {
        throw new HttpError(403, "That folder does not belong to this studio session");
      }
      const mimeType = typeof body.mimeType === "string" && /^(video|audio)\//.test(body.mimeType) ? body.mimeType : "video/webm";
      const fileName = safeName(body.fileName, "recording.webm");
      const headers: Record<string, string> = {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      };
      // Google only returns CORS headers on the session URL when the session is
      // opened with the browser's Origin, so the browser can PUT chunks directly.
      if (typeof body.origin === "string" && /^https?:\/\//.test(body.origin)) headers["Origin"] = body.origin;
      const res = await gfetch(token, `${UPLOAD}/files?uploadType=resumable&fields=id,name,webViewLink,size`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: fileName,
          mimeType,
          parents: [folder.id],
          appProperties: { studioId: studio.id, sessionId: folder.appProperties.sessionId },
        }),
      });
      const uploadUrl = res.headers.get("Location");
      if (!uploadUrl) throw new HttpError(502, "Google Drive did not return an upload URL");
      return json({ uploadUrl });
    }

    if (action === "finish") {
      const { base44, studio } = await resolveAccess(req, body);
      const token = await driveToken(base44);
      if (!body.fileId) throw new HttpError(400, "fileId is required");
      const file = await (await gfetch(token, `${DRIVE}/files/${encodeURIComponent(body.fileId)}?fields=id,name,mimeType,size,webViewLink,parents,appProperties`)).json();
      if (file.appProperties?.studioId !== studio.id) throw new HttpError(403, "File does not belong to this studio");
      let folderUrl = "";
      if (file.parents?.[0]) {
        try {
          const parent = await (await gfetch(token, `${DRIVE}/files/${file.parents[0]}?fields=webViewLink`)).json();
          folderUrl = parent.webViewLink ?? "";
        } catch { /* optional */ }
      }
      const kinds = ["program", "participant", "screen", "audio"];
      const record = await base44.asServiceRole.entities.Recording.create({
        owner_id: studio.created_by_id,
        studio_id: studio.id,
        studio_title: studio.title,
        session_id: String(body.sessionId ?? file.appProperties?.sessionId ?? ""),
        session_title: safeName(body.sessionTitle, ""),
        participant_name: safeName(body.participantName, "Participant"),
        kind: kinds.includes(body.kind) ? body.kind : "participant",
        file_name: file.name,
        drive_file_id: file.id,
        drive_url: file.webViewLink,
        folder_url: folderUrl,
        mime_type: file.mimeType,
        size_bytes: Number(file.size ?? body.sizeBytes ?? 0),
        duration_sec: Number(body.durationSec ?? 0),
        status: "uploaded",
      });
      return json({ recording: record, driveUrl: file.webViewLink, folderUrl });
    }

    throw new HttpError(400, `Unknown action: ${action}`);
  } catch (err) {
    return fail(err);
  }
}
