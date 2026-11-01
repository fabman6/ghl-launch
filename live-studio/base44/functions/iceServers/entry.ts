// Returns ICE servers for the WebRTC mesh between studio participants.
// STUN works for most networks; add a TURN relay for strict corporate/hotel
// networks with either:
//   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_KEY_API_TOKEN  (short-lived creds), or
//   TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL
import { fail, json, readBody, resolveAccess } from "../../shared/studio.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const body = await readBody(req);
    await resolveAccess(req, body);
    const servers: any[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

    const keyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
    const keyToken = Deno.env.get("CLOUDFLARE_TURN_KEY_API_TOKEN");
    if (keyId && keyToken) {
      try {
        const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
          method: "POST",
          headers: { Authorization: `Bearer ${keyToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 6 * 3600 }),
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
          servers.push(...list.filter(Boolean));
        }
      } catch { /* fall back to STUN */ }
    }

    const urls = Deno.env.get("TURN_URLS");
    if (urls) {
      servers.push({
        urls: urls.split(",").map((u) => u.trim()).filter(Boolean),
        username: Deno.env.get("TURN_USERNAME") ?? "",
        credential: Deno.env.get("TURN_CREDENTIAL") ?? "",
      });
    }
    return json({ iceServers: servers });
  } catch (err) {
    return fail(err);
  }
}
