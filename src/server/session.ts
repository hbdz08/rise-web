import crypto from "crypto";
import { Buffer as NodeBuffer } from "node:buffer";

import { getSessionMaxAgeSeconds, requireSessionSecret } from "@/server/env";
import type { AdminRole } from "@/lib/roles";

export type AdminSession = {
  userId: number;
  username: string;
  role: AdminRole;
  iat: number;
};

function b64urlEncode(buf: NodeBuffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecodeToBuf(s: string): NodeBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return NodeBuffer.from(b64, "base64");
}

function sign(data: string): string {
  const key = requireSessionSecret();
  return b64urlEncode(crypto.createHmac("sha256", key).update(data, "utf8").digest());
}

export function createAdminSessionCookieValue(session: AdminSession): string {
  const payload = JSON.stringify(session);
  const payloadB64 = b64urlEncode(NodeBuffer.from(payload, "utf8"));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function parseAdminSessionCookieValue(value: string): AdminSession | null {
  const [payloadB64, sig] = value.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  try {
    if (!crypto.timingSafeEqual(NodeBuffer.from(sig), NodeBuffer.from(expected))) return null;
  } catch {
    return null;
  }

  try {
    const payload = b64urlDecodeToBuf(payloadB64).toString("utf8");
    const parsed = JSON.parse(payload) as Partial<AdminSession> | null;
    if (!parsed) return null;
    const userId =
      typeof parsed.userId === "number"
        ? parsed.userId
        : typeof parsed.userId === "string"
          ? Number(parsed.userId)
          : NaN;
    if (!Number.isFinite(userId) || userId <= 0) return null;
    if (typeof parsed.username !== "string" || !parsed.username.trim()) return null;
    if (parsed.role !== "HR_ADMIN" && parsed.role !== "HR_OPERATOR") return null;
    if (typeof parsed.iat !== "number") return null;

    // Max age check (defense in depth; cookie Max-Age also applies)
    const ageSec = (Date.now() - parsed.iat) / 1000;
    const maxAge = getSessionMaxAgeSeconds();
    if (ageSec > maxAge) return null;

    return {
      userId,
      username: parsed.username,
      role: parsed.role,
      iat: parsed.iat,
    };
  } catch {
    return null;
  }
}

export function buildSessionCookieHeader(value: string | null): string {
  const maxAge = value ? getSessionMaxAgeSeconds() : 0;
  const secure = process.env.NODE_ENV === "production";
  const secureFlag = secure ? "; Secure" : "";
  const val = value ? value : "";
  return `rise_admin_session=${val}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
}
