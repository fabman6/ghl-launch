// Live streaming control (host only).
//
// Browsers cannot speak RTMP, so the studio publishes its program feed over
// WebRTC (WHIP). For RTMP destinations (YouTube, Facebook, Twitch, LinkedIn,
// X, Kick, custom RTMP) we create a Cloudflare Stream live input that accepts
// WHIP and restreams to every selected RTMP destination at once.
//
// Secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN
// Actions: status | start | stop
import { createClientFromRequest } from "npm:@base44/sdk";
import { currentUser, fail, HttpError, json, readBody, requireHost } from "../../shared/studio.ts";

const API = "https://api.cloudflare.com/client/v4";

function cfConfig() {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
  return accountId && token ? { accountId, token } : null;
}

async function cf(path: string, init: RequestInit = {}) {
  const cfg = cfConfig();
  if (!cfg) throw new HttpError(412, "Cloudflare Stream is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN secrets.");
  const res = await fetch(`${API}/accounts/${cfg.accountId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = data?.errors?.map((e: any) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new HttpError(502, `Cloudflare Stream: ${msg}`);
  }
  return data.result;
}

export default async function (req: Request): Promise<Response> {
  try {
    const body = await readBody(req);

    if (body.action === "status") {
      const user = await currentUser(createClientFromRequest(req));
      if (!user) throw new HttpError(401, "Sign in first");
      return json({ restreamConfigured: !!cfConfig() });
    }

    const { base44, studio } = await requireHost(req, body);

    if (body.action === "start") {
      const ids: string[] = Array.isArray(body.destinationIds) ? body.destinationIds : [];
      const all = await base44.entities.Destination.list();
      const chosen = all.filter((d: any) => ids.includes(d.id));
      const rtmp = chosen.filter((d: any) => d.platform !== "whip" && d.rtmp_url && d.stream_key);
      const whip = chosen
        .filter((d: any) => d.platform === "whip" && d.whip_url)
        .map((d: any) => ({ id: d.id, name: d.name, url: d.whip_url, token: d.whip_token || "" }));

      let liveInputId: string | null = null;
      let restreamWhipUrl: string | null = null;
      const outputs: any[] = [];
      if (rtmp.length) {
        const input = await cf(`/stream/live_inputs`, {
          method: "POST",
          body: JSON.stringify({
            meta: { name: `${studio.title} (${new Date().toISOString()})`, studioId: studio.id },
            recording: { mode: "off" },
          }),
        });
        liveInputId = input.uid;
        restreamWhipUrl = input.webRTC?.url ?? null;
        for (const d of rtmp) {
          try {
            const out = await cf(`/stream/live_inputs/${liveInputId}/outputs`, {
              method: "POST",
              body: JSON.stringify({ url: d.rtmp_url, streamKey: d.stream_key, enabled: true }),
            });
            outputs.push({ id: d.id, name: d.name, ok: true, outputId: out.uid });
          } catch (e) {
            outputs.push({ id: d.id, name: d.name, ok: false, error: (e as Error).message });
          }
        }
        if (!restreamWhipUrl) throw new HttpError(502, "Cloudflare did not return a WebRTC (WHIP) URL for the live input");
      }
      return json({ liveInputId, restreamWhipUrl, outputs, whip });
    }

    if (body.action === "stop") {
      if (body.liveInputId) {
        try {
          await cf(`/stream/live_inputs/${encodeURIComponent(body.liveInputId)}`, { method: "DELETE" });
        } catch { /* already gone */ }
      }
      return json({ ok: true });
    }

    throw new HttpError(400, `Unknown action: ${body.action}`);
  } catch (err) {
    return fail(err);
  }
}
