// studioRoom: one live session per studio (session id = studio id).
//
// Responsibilities
//  - Verifies who joins (host = studio owner, guest = holder of the invite code)
//  - Green room: guests wait until the host admits them
//  - Roster + media flags (mic/cam/screen) for everyone in the studio
//  - Relays WebRTC signaling (offer/answer/ICE) between admitted participants
//  - Shares the host's studio state (layout, stage, banners, brand, scenes)
//  - Studio chat and host commands (start/stop recording, mute, camera off)
import { Actor } from "base44:runtime/actors";

type Role = "host" | "guest";
type Media = { mic: boolean; cam: boolean; screen: boolean };
type Participant = {
  id: string;
  name: string;
  headline: string;
  role: Role;
  admitted: boolean;
  joinedAt: number;
  admittedAt: number;
  media: Media;
};

const MAX_CHAT = 200;

function clean(s: unknown, max: number) {
  return String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

export default class StudioRoom extends Actor<any, any> {
  participants = new Map<string, Participant>();
  state: any = null;
  chat: any[] = [];
  tickIntervalMs = 15000;

  async handleStart() {
    this.state = (await this.storage.get<any>("state")) ?? null;
    this.chat = (await this.storage.get<any[]>("chat")) ?? [];
    const saved = (await this.storage.get<Participant[]>("participants")) ?? [];
    const live = new Set(this.getConnections().map((c) => c.id));
    this.participants = new Map(saved.filter((p) => live.has(p.id)).map((p) => [p.id, p]));
  }

  // Keep the session warm while people are in the studio.
  shouldTick() {
    return this.participants.size > 0;
  }

  async handleTick() {
    const live = new Set(this.getConnections().map((c) => c.id));
    let changed = false;
    for (const id of [...this.participants.keys()]) {
      if (!live.has(id)) {
        this.participants.delete(id);
        changed = true;
      }
    }
    if (changed) await this.rosterChanged();
  }

  async handleConnect(conn: any) {
    conn.send({ type: "hello", id: conn.id });
  }

  async handleClose(conn: any) {
    if (this.participants.delete(conn.id)) await this.rosterChanged();
  }

  async handleMessage(conn: any, msg: any) {
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
    if (msg.type === "join") return this.onJoin(conn, msg);

    const me = this.participants.get(conn.id);
    if (!me) {
      conn.send({ type: "error", code: "not_joined", message: "Join the studio first." });
      return;
    }

    switch (msg.type) {
      case "ping":
        conn.send({ type: "pong", at: Date.now() });
        return;

      case "signal": {
        const target = this.participants.get(msg.to);
        if (!me.admitted || !target?.admitted) return;
        this.sendTo(msg.to, { type: "signal", from: conn.id, data: msg.data });
        return;
      }

      case "media": {
        me.media = { mic: !!msg.media?.mic, cam: !!msg.media?.cam, screen: !!msg.media?.screen };
        await this.rosterChanged();
        return;
      }

      case "profile": {
        if (msg.name !== undefined) me.name = clean(msg.name, 60) || me.name;
        if (msg.headline !== undefined) me.headline = clean(msg.headline, 80);
        await this.rosterChanged();
        return;
      }

      case "chat": {
        if (!me.admitted) return;
        const text = clean(msg.text, 1000);
        if (!text) return;
        const entry = { id: crypto.randomUUID(), from: me.id, name: me.name, role: me.role, text, at: Date.now() };
        this.chat.push(entry);
        if (this.chat.length > MAX_CHAT) this.chat = this.chat.slice(-MAX_CHAT);
        await this.storage.put("chat", this.chat);
        this.sendToMembers({ type: "chat", message: entry });
        return;
      }

      case "state": {
        if (me.role !== "host" || typeof msg.state !== "object") return;
        this.state = msg.state;
        await this.storage.put("state", this.state);
        this.sendToMembers({ type: "state", state: this.state }, conn.id);
        return;
      }

      case "admit": {
        if (me.role !== "host") return;
        const p = this.participants.get(msg.id);
        if (!p || p.admitted) return;
        p.admitted = true;
        p.admittedAt = Date.now();
        this.sendTo(p.id, { type: "admitted", you: this.publicP(p), roster: this.roster(), state: this.state, chat: this.chat });
        await this.rosterChanged();
        return;
      }

      case "kick": {
        if (me.role !== "host" || msg.id === me.id) return;
        if (this.participants.delete(msg.id)) {
          this.sendTo(msg.id, { type: "kicked", reason: msg.reason === "denied" ? "denied" : "removed" });
          await this.rosterChanged();
        }
        return;
      }

      case "command": {
        if (me.role !== "host" || typeof msg.command !== "string") return;
        const payload = { type: "command", command: msg.command, payload: msg.payload ?? null, from: me.id };
        if (msg.to === "all") this.sendToMembers(payload, conn.id);
        else if (this.participants.get(msg.to)?.admitted) this.sendTo(msg.to, payload);
        return;
      }

      case "leave": {
        if (this.participants.delete(conn.id)) await this.rosterChanged();
        return;
      }
    }
  }

  private async onJoin(conn: any, msg: any) {
    const identity = conn.identity ?? {};
    const userId = identity.type === "authenticated" ? identity.userId : null;
    let role: Role | null = null;
    try {
      const res: any = await this.client.functions.invoke("studioAccess", {
        studioId: this.instanceId,
        code: typeof msg.code === "string" ? msg.code : "",
        userId,
      });
      const data = res?.data ?? res;
      if (data?.ok && (data.role === "host" || data.role === "guest")) role = data.role;
    } catch {
      role = null;
    }
    if (!role) {
      conn.send({ type: "denied", reason: "This invite link is not valid, or the studio was deleted." });
      return;
    }

    const now = Date.now();
    const prev = this.participants.get(conn.id);
    const p: Participant = {
      id: conn.id,
      name: clean(msg.name, 60) || (role === "host" ? "Host" : "Guest"),
      headline: clean(msg.headline, 80),
      role,
      admitted: role === "host" ? true : prev?.admitted ?? false,
      joinedAt: prev?.joinedAt ?? now,
      admittedAt: prev?.admittedAt ?? (role === "host" ? now : 0),
      media: { mic: !!msg.media?.mic, cam: !!msg.media?.cam, screen: false },
    };
    this.participants.set(conn.id, p);

    conn.send({
      type: "welcome",
      you: this.publicP(p),
      roster: p.admitted ? this.roster() : [],
      state: p.admitted ? this.state : null,
      chat: p.admitted ? this.chat : [],
      hostPresent: [...this.participants.values()].some((x) => x.role === "host"),
    });
    await this.rosterChanged();
  }

  private publicP(p: Participant) {
    return { ...p };
  }

  private roster() {
    return [...this.participants.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => this.publicP(p));
  }

  private async rosterChanged() {
    await this.storage.put("participants", [...this.participants.values()]);
    const roster = this.roster();
    this.sendToMembers({ type: "roster", roster });
    // Waiting guests only learn whether a host is around.
    const hostPresent = roster.some((p) => p.role === "host");
    for (const p of this.participants.values()) {
      if (!p.admitted) this.sendTo(p.id, { type: "waiting", hostPresent });
    }
  }

  private sendTo(id: string, data: any) {
    const c = this.getConnections().find((x) => x.id === id);
    if (c) c.send(data);
  }

  private sendToMembers(data: any, exceptId?: string) {
    for (const c of this.getConnections()) {
      if (c.id === exceptId) continue;
      if (this.participants.get(c.id)?.admitted) c.send(data);
    }
  }
}
