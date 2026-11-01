// Checks who may enter a studio. Called by the guest lobby (to show the studio
// title) and by the studioRoom actor (to decide host vs guest for a connection).
import { createClientFromRequest } from "npm:@base44/sdk";
import { currentUser, fail, json, loadStudio, readBody } from "../../shared/studio.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const body = await readBody(req);
    const base44 = createClientFromRequest(req);
    const studio = await loadStudio(base44, body.studioId);
    const caller = await currentUser(base44);

    // The actor passes the verified user id of the socket it is admitting.
    const userId = caller?.id ?? (typeof body.userId === "string" ? body.userId : null);
    let role: "host" | "guest" | null = null;
    if (userId && userId === studio.created_by_id) role = "host";
    else if (body.code && studio.invite_code && body.code === studio.invite_code) role = "guest";

    if (!role) return json({ ok: false, error: "This invite link is not valid." }, 403);
    return json({ ok: true, role, title: studio.title, description: studio.description ?? "" });
  } catch (err) {
    return fail(err);
  }
}
