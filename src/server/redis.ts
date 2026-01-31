import net from "node:net";
import { Buffer as NodeBuffer } from "node:buffer";

import { env } from "@/server/env";

export type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { EX?: number }): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
};

type RedisConnInfo = {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  db: number | null;
};

class RedisRespError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisRespError";
  }
}

function parseRedisUrl(url: string): RedisConnInfo {
  const u = new URL(url);
  if (u.protocol !== "redis:") throw new Error("Only redis:// is supported");

  const host = u.hostname;
  const port = u.port ? Number(u.port) : 6379;
  // Supported forms:
  // - redis://:password@host:port/0              (password-only, recommended)
  // - redis://password@host:port/0               (password-only, tolerant)
  // - redis://username:password@host:port/0      (ACL username + password)
  const rawUsername = u.username ? u.username : "";
  const rawPassword = u.password ? u.password : "";

  let username: string | null = null;
  let password: string | null = null;
  if (rawPassword) {
    password = rawPassword;
    username = rawUsername || null;
  } else if (rawUsername) {
    // When password is omitted, Node's URL parser treats it as "username".
    // Treat it as a password-only Redis URL for compatibility.
    password = rawUsername;
  }

  let db: number | null = null;
  const p = u.pathname.replace(/^\//, "");
  if (p) {
    const n = Number(p);
    if (Number.isFinite(n) && n >= 0) db = Math.floor(n);
  }

  if (!host) throw new Error("Invalid REDIS_URL (missing host)");
  if (!Number.isFinite(port) || port <= 0) throw new Error("Invalid REDIS_URL (bad port)");

  return { host, port, username, password, db };
}

function encodeCommand(parts: string[]): NodeBuffer {
  const chunks: NodeBuffer[] = [];
  chunks.push(NodeBuffer.from(`*${parts.length}\r\n`, "utf8"));
  for (const p of parts) {
    const b = NodeBuffer.from(p, "utf8");
    chunks.push(NodeBuffer.from(`$${b.length}\r\n`, "utf8"));
    chunks.push(b);
    chunks.push(NodeBuffer.from("\r\n", "utf8"));
  }
  return NodeBuffer.concat(chunks);
}

function tryParseResp(buf: NodeBuffer): { value: unknown; rest: NodeBuffer } | null {
  if (buf.length === 0) return null;
  const prefix = buf[0];

  function readLine(from: number): { line: string; next: number } | null {
    const idx = buf.indexOf("\r\n", from);
    if (idx === -1) return null;
    const line = buf.subarray(from, idx).toString("utf8");
    return { line, next: idx + 2 };
  }

  function parseAt(offset: number): { value: unknown; next: number } | null {
    if (offset >= buf.length) return null;
    const p = buf[offset];

    // Simple string
    if (p === 43 /* + */) {
      const r = readLine(offset + 1);
      if (!r) return null;
      return { value: r.line, next: r.next };
    }

    // Error
    if (p === 45 /* - */) {
      const r = readLine(offset + 1);
      if (!r) return null;
      return { value: new RedisRespError(r.line), next: r.next };
    }

    // Integer
    if (p === 58 /* : */) {
      const r = readLine(offset + 1);
      if (!r) return null;
      const n = Number(r.line);
      return { value: Number.isFinite(n) ? n : 0, next: r.next };
    }

    // Bulk string
    if (p === 36 /* $ */) {
      const r = readLine(offset + 1);
      if (!r) return null;
      const len = Number(r.line);
      if (len === -1) return { value: null, next: r.next };
      if (!Number.isFinite(len) || len < 0) return { value: null, next: r.next };
      const end = r.next + len;
      if (buf.length < end + 2) return null;
      const s = buf.subarray(r.next, end).toString("utf8");
      return { value: s, next: end + 2 };
    }

    // Array
    if (p === 42 /* * */) {
      const r = readLine(offset + 1);
      if (!r) return null;
      const count = Number(r.line);
      if (count === -1) return { value: null, next: r.next };
      if (!Number.isFinite(count) || count < 0) return { value: [], next: r.next };

      let next = r.next;
      const out: unknown[] = [];
      for (let i = 0; i < count; i++) {
        const v = parseAt(next);
        if (!v) return null;
        out.push(v.value);
        next = v.next;
      }
      return { value: out, next };
    }

    // Unknown => treat as incomplete
    return null;
  }

  const parsed = parseAt(0);
  if (!parsed) return null;
  return { value: parsed.value, rest: buf.subarray(parsed.next) };
}

class RedisLite implements RedisClient {
  private info: RedisConnInfo;
  private socket: net.Socket | null = null;
  private buffer: NodeBuffer = NodeBuffer.alloc(0);
  private pending: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private connecting: Promise<void> | null = null;

  constructor(info: RedisConnInfo) {
    this.info = info;
  }

  private onData = (data: NodeBuffer) => {
    this.buffer = NodeBuffer.concat([this.buffer, data]);
    while (true) {
      const parsed = tryParseResp(this.buffer);
      if (!parsed) break;
      this.buffer = parsed.rest;
      const job = this.pending.shift();
      if (!job) continue;
      if (parsed.value instanceof RedisRespError) job.reject(parsed.value);
      else job.resolve(parsed.value);
    }
  };

  private onCloseOrError = (e?: unknown) => {
    const err = e instanceof Error ? e : new Error("Redis connection closed");
    this.socket?.removeAllListeners();
    this.socket = null;
    this.buffer = NodeBuffer.alloc(0);
    this.connecting = null;
    const pending = this.pending;
    this.pending = [];
    for (const job of pending) job.reject(err);
  };

  private async ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ host: this.info.host, port: this.info.port });
      this.socket = s;

      s.on("data", this.onData);
      s.on("error", (e) => {
        this.onCloseOrError(e);
        reject(e);
      });
      s.on("close", () => {
        this.onCloseOrError();
      });

      s.once("connect", async () => {
        try {
          if (this.info.password) {
            if (this.info.username) await this.rawCommand(["AUTH", this.info.username, this.info.password]);
            else await this.rawCommand(["AUTH", this.info.password]);
          }
          if (this.info.db != null) {
            await this.rawCommand(["SELECT", String(this.info.db)]);
          }
          resolve();
        } catch (e) {
          this.onCloseOrError(e);
          reject(e);
        }
      });
    });

    return this.connecting;
  }

  private async rawCommand(parts: string[]): Promise<unknown> {
    await this.ensureConnected();
    const s = this.socket;
    if (!s) throw new Error("Redis socket not available");

    const payload = encodeCommand(parts);
    return await new Promise<unknown>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      s.write(payload);
    });
  }

  async get(key: string): Promise<string | null> {
    const v = await this.rawCommand(["GET", key]);
    return typeof v === "string" ? v : null;
  }

  async set(key: string, value: string, opts?: { EX?: number }): Promise<string | null> {
    const parts = ["SET", key, value];
    if (opts?.EX != null) parts.push("EX", String(opts.EX));
    const v = await this.rawCommand(parts);
    return typeof v === "string" ? v : null;
  }

  async del(...keys: string[]): Promise<number> {
    const v = await this.rawCommand(["DEL", ...keys]);
    return typeof v === "number" ? v : 0;
  }

  async incr(key: string): Promise<number> {
    const v = await this.rawCommand(["INCR", key]);
    return typeof v === "number" ? v : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const v = await this.rawCommand(["EXPIRE", key, String(seconds)]);
    return typeof v === "number" ? v : 0;
  }

  async ttl(key: string): Promise<number> {
    const v = await this.rawCommand(["TTL", key]);
    return typeof v === "number" ? v : -2;
  }
}

let client: RedisClient | null = null;
let warnedNoRedis = false;

export async function getRedisOptional(): Promise<RedisClient | null> {
  const url = env.redisUrl;
  if (!url) {
    if (!warnedNoRedis) {
      warnedNoRedis = true;
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({ level: "warn", msg: "redis_disabled", reason: "missing_REDIS_URL" }));
    }
    return null;
  }

  if (client) return client;

  try {
    const info = parseRedisUrl(url);
    client = new RedisLite(info);
    // Probe connect lazily; first command will connect. Keep return fast.
    return client;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_init_failed",
        err: String(e instanceof Error ? e.message : e),
      }),
    );
    client = null;
    return null;
  }
}
