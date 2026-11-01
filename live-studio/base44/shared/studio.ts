// Shared helpers for Live Studio backend functions.
import { createClientFromRequest } from "npm:@base44/sdk";

export type Role = "host" | "guest";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function fail(err: unknown): Response {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  return json({ error: message }, status);
}

export async function readBody(req: Request): Promise<Record<string, any>> {
  try {
    return (await req.json()) ?? {};
  } catch {
    return {};
  }
}

export async function currentUser(base44: any): Promise<any | null> {
  try {
    return await base44.auth.me();
  } catch {
    return null;
  }
}

export async function loadStudio(base44: any, studioId: string): Promise<any> {
  if (!studioId || typeof studioId !== "string") throw new HttpError(400, "studioId is required");
  let studio: any = null;
  try {
    studio = await base44.asServiceRole.entities.Studio.get(studioId);
  } catch {
    studio = null;
  }
  if (!studio) throw new HttpError(404, "Studio not found");
  return studio;
}

/**
 * Works out whether the caller may act in a studio.
 * Host: the signed-in owner of the studio. Guest: anyone holding the invite code.
 */
export async function resolveAccess(req: Request, body: Record<string, any>) {
  const base44 = createClientFromRequest(req);
  const studio = await loadStudio(base44, body.studioId);
  const user = await currentUser(base44);
  let role: Role | null = null;
  if (user && user.id === studio.created_by_id) role = "host";
  else if (body.code && studio.invite_code && body.code === studio.invite_code) role = "guest";
  if (!role) throw new HttpError(403, "You do not have access to this studio");
  return { base44, studio, user, role };
}

export async function requireHost(req: Request, body: Record<string, any>) {
  const access = await resolveAccess(req, body);
  if (access.role !== "host") throw new HttpError(403, "Only the studio host can do this");
  return access;
}
