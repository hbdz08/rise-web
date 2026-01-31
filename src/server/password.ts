import crypto from "crypto";
import { Buffer as NodeBuffer } from "node:buffer";

type ScryptParams = { N: number; r: number; p: number; keylen: number };

const DEFAULT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1, keylen: 32 };

function toB64(buf: NodeBuffer): string {
  return buf.toString("base64");
}

function fromB64(b64: string): NodeBuffer {
  return NodeBuffer.from(b64, "base64");
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = DEFAULT_PARAMS;
  const derived = crypto.scryptSync(plain, salt, keylen, { N, r, p });
  // Format: scrypt$N=...,r=...,p=...$<saltB64>$<hashB64>
  return `scrypt$N=${N},r=${r},p=${p}$${toB64(salt)}$${toB64(derived)}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  // Format: scrypt$N=...,r=...,p=...$<saltB64>$<hashB64>
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  if (parts[0] !== "scrypt") return false;

  const paramsPart = parts[1] ?? "";
  const saltB64 = parts[2] ?? "";
  const hashB64 = parts[3] ?? "";

  const m = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(paramsPart);
  if (!m) return false;

  const N = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = fromB64(saltB64);
  const expected = fromB64(hashB64);
  if (salt.length < 8 || expected.length < 16) return false;

  const derived = crypto.scryptSync(plain, salt, expected.length, { N, r, p });
  return crypto.timingSafeEqual(derived, expected);
}
