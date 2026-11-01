// Live streaming control (host only).
//
// Browsers cannot speak RTMP, so the studio publishes its program feed over
// WebRTC (WHIP) to a Cloudflare Stream live input, which restreams it to every
// selected platform at once.
//
//   YouTube   connected account: a broadcast + stream key are created for you
//             each time you go live, and ended when you stop.
//   Others    server URL + stream key (saved once, or pasted per broadcast for
//             platforms that issue a new key every time).
//   WHIP      published directly from the browser.
//
// Secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN
// Actions: status | start | stop
import { createClientFromRequest } from "npm:@base44/sdk";
import { currentUser, fail, HttpError, json, readBody, requireHost } from "../../shared/studio.ts";

const CF = "https://api.cloudflare.com/client/v4";
const YT = "https://www.googleapis.com/youtube/v3";

function cfConfig() {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
  return accountId && token ? { accountId, token } : null;
}

async function cf(path: string, init: RequestInit = {}) {
  const cfg = cfConfig();
  if (!cfg) throw new HttpError(412, "Live streaming isn't switched on yet. Finish the one-time setup on the Destinations page.");
  const res = await fetch(`${CF}/accounts/${cfg.accountId}${path}`, {
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

async function connectorToken(base44: any, type: string): Promise<string | null> {
  try {
    const c = await base44.asServiceRole.connectors.getConnection(type);
    return c?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function yt(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${YT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    if (reason === "liveStreamingNotEnabled") {
      throw new HttpError(409, "Live streaming isn't enabled on your YouTube channel yet. Turn it on at youtube.com/features (the first time can take up to 24 hours).");
    }
    throw new HttpError(502, `YouTube: ${data?.error?.message || `HTTP ${res.status}`}`);
  }
  return data;
}

async function accountStatus(base44: any) {
  const [ytTok, fbTok, igTok, liTok] = await Promise.all(
    ["youtube", "facebook_pages", "instagram", "linkedin"].map((t) => connectorToken(base44, t))
  );
  const safe = async (fn: () => Promise<any>, fallback: any) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const youtube = ytTok
    ? await safe(async () => {
        const ch = await yt(ytTok, "/channels?part=snippet&mine=true");
        const c = ch.items?.[0];
        let liveEnabled = true;
        try {
          await yt(ytTok, "/liveStreams?part=id&mine=true&maxResults=1");
        } catch (e) {
          liveEnabled = !(e instanceof HttpError && e.status === 409);
        }
        return { connected: true, name: c?.snippet?.title ?? "YouTube channel", avatar: c?.snippet?.thumbnails?.default?.url ?? null, liveEnabled };
      }, { connected: true, name: "YouTube channel", liveEnabled: false })
    : { connected: false };
  const facebook = fbTok
    ? await safe(async () => {
        const me = await (await fetch(`https://graph.facebook.com/v21.0/me?fields=name&access_token=${fbTok}`)).json();
        return { connected: true, name: me.name ?? "Facebook" };
      }, { connected: true, name: "Facebook" })
    : { connected: false };
  const instagram = igTok
    ? await safe(async () => {
        const me = await (await fetch(`https://graph.instagram.com/v21.0/me?fields=username&access_token=${igTok}`)).json();
        return { connected: true, name: me.username ? `@${me.username}` : "Instagram" };
      }, { connected: true, name: "Instagram" })
    : { connected: false };
  const linkedin = liTok
    ? await safe(async () => {
        const me = await (await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${liTok}` } })).json();
        return { connected: true, name: me.name ?? "LinkedIn" };
      }, { connected: true, name: "LinkedIn" })
    : { connected: false };
  return { youtube, facebook, instagram, linkedin };
}

async function createYouTubeBroadcast(token: string, { title, description, privacy }: { title: string; description: string; privacy: string }) {
  const stream = await yt(token, "/liveStreams?part=snippet,cdn,contentDetails,status", {
    method: "POST",
    body: JSON.stringify({
      snippet: { title: `${title} (Live Studio)` },
      cdn: { frameRate: "variable", ingestionType: "rtmp", resolution: "variable" },
      contentDetails: { isReusable: false },
    }),
  });
  const broadcast = await yt(token, "/liveBroadcasts?part=snippet,status,contentDetails", {
    method: "POST",
    body: JSON.stringify({
      snippet: { title, description, scheduledStartTime: new Date().toISOString() },
      status: { privacyStatus: ["public", "unlisted", "private"].includes(privacy) ? privacy : "public", selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: true, enableAutoStop: true, enableDvr: true, latencyPreference: "low", monitorStream: { enableMonitorStream: false } },
    }),
  });
  await yt(token, `/liveBroadcasts/bind?id=${broadcast.id}&part=id&streamId=${stream.id}`, { method: "POST" });
  const ing = stream.cdn?.ingestionInfo ?? {};
  return {
    broadcastId: broadcast.id,
    url: ing.ingestionAddress || "rtmp://a.rtmp.youtube.com/live2",
    key: ing.streamName,
    watchUrl: `https://www.youtube.com/watch?v=${broadcast.id}`,
  };
}

export default async function (req: Request): Promise<Response> {
  try {
    const body = await readBody(req);

    if (body.action === "status") {
      const base44 = createClientFromRequest(req);
      if (!(await currentUser(base44))) throw new HttpError(401, "Sign in first");
      return json({ restreamConfigured: !!cfConfig(), accounts: await accountStatus(base44) });
    }

    const { base44, studio } = await requireHost(req, body);

    if (body.action === "start") {
      const ids: string[] = Array.isArray(body.destinationIds) ? body.destinationIds : [];
      const overrides: Record<string, { rtmp_url?: string; stream_key?: string }> = body.overrides ?? {};
      const title = String(body.title || studio.title).slice(0, 100);
      const description = String(body.description || "").slice(0, 4900);
      const all = await base44.entities.Destination.list();
      const chosen = all.filter((d: any) => ids.includes(d.id));

      const whip = chosen
        .filter((d: any) => d.platform === "whip" && d.whip_url)
        .map((d: any) => ({ id: d.id, name: d.name, url: d.whip_url, token: d.whip_token || "" }));

      // Resolve every RTMP target: YouTube account broadcasts are created now.
      const targets: any[] = [];
      const outputs: any[] = [];
      const youtubeBroadcasts: string[] = [];
      for (const d of chosen.filter((x: any) => x.platform !== "whip")) {
        try {
          if (d.platform === "youtube" && d.connection === "account") {
            const token = await connectorToken(base44, "youtube");
            if (!token) throw new HttpError(412, "Reconnect YouTube in the Base44 editor (Integrations).");
            const b = await createYouTubeBroadcast(token, { title, description, privacy: d.privacy || "public" });
            youtubeBroadcasts.push(b.broadcastId);
            targets.push({ d, url: b.url, key: b.key, watchUrl: b.watchUrl });
          } else {
            const o = overrides[d.id] ?? {};
            const url = (o.rtmp_url || d.rtmp_url || "").trim();
            const key = (o.stream_key || d.stream_key || "").trim();
            if (!url || !key) throw new HttpError(400, "Stream key missing");
            targets.push({ d, url, key });
          }
        } catch (e) {
          outputs.push({ id: d.id, name: d.name, platform: d.platform, ok: false, error: (e as Error).message });
        }
      }

      let liveInputId: string | null = null;
      let restreamWhipUrl: string | null = null;
      if (targets.length) {
        const input = await cf(`/stream/live_inputs`, {
          method: "POST",
          body: JSON.stringify({ meta: { name: `${studio.title} ${new Date().toISOString()}`, studioId: studio.id }, recording: { mode: "off" } }),
        });
        liveInputId = input.uid;
        restreamWhipUrl = input.webRTC?.url ?? null;
        if (!restreamWhipUrl) throw new HttpError(502, "Cloudflare did not return a WebRTC (WHIP) URL for the live input");
        for (const t of targets) {
          try {
            await cf(`/stream/live_inputs/${liveInputId}/outputs`, {
              method: "POST",
              body: JSON.stringify({ url: t.url, streamKey: t.key, enabled: true }),
            });
            outputs.push({ id: t.d.id, name: t.d.name, platform: t.d.platform, ok: true, watchUrl: t.watchUrl ?? null });
          } catch (e) {
            outputs.push({ id: t.d.id, name: t.d.name, platform: t.d.platform, ok: false, error: (e as Error).message });
          }
        }
      }
      return json({ liveInputId, restreamWhipUrl, outputs, whip, youtubeBroadcasts });
    }

    if (body.action === "stop") {
      if (body.liveInputId) {
        try {
          await cf(`/stream/live_inputs/${encodeURIComponent(body.liveInputId)}`, { method: "DELETE" });
        } catch { /* already gone */ }
      }
      const ids: string[] = Array.isArray(body.youtubeBroadcasts) ? body.youtubeBroadcasts : [];
      if (ids.length) {
        const token = await connectorToken(base44, "youtube");
        for (const id of ids) {
          try {
            if (token) await yt(token, `/liveBroadcasts/transition?broadcastStatus=complete&id=${encodeURIComponent(id)}&part=status`, { method: "POST" });
          } catch { /* auto-stop will end it */ }
        }
      }
      return json({ ok: true });
    }

    throw new HttpError(400, `Unknown action: ${body.action}`);
  } catch (err) {
    return fail(err);
  }
}
