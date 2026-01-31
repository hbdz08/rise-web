import crypto from "crypto";
import { Buffer as NodeBuffer } from "node:buffer";

import { env, requirePiiHmacKey } from "@/server/env";

export type PiiEncryptionMode = "plain" | "aesgcm";

function normalizeMode(mode: string): PiiEncryptionMode {
  return mode === "aesgcm" ? "aesgcm" : "plain";
}

export function hmacSha256Hex(value: string): string {
  const key = requirePiiHmacKey();
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function normalizePhone(phone: string): string {
  return phone.trim();
}

export function encryptPiiToBytes(plainText: string): NodeBuffer {
  const mode = normalizeMode(env.piiEncryptionMode);
  if (mode === "plain") return NodeBuffer.from(plainText, "utf8");

  const key = NodeBuffer.from(env.piiEncKeyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("PII_ENC_KEY_BASE64 must be base64 for 32 bytes when PII_ENCRYPTION_MODE=aesgcm");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = NodeBuffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // [iv(12)][tag(16)][ciphertext]
  return NodeBuffer.concat([iv, tag, ciphertext]);
}

export function decryptPiiFromBytes(buf: NodeBuffer): string {
  const mode = normalizeMode(env.piiEncryptionMode);
  if (mode === "plain") return buf.toString("utf8");

  const key = NodeBuffer.from(env.piiEncKeyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("PII_ENC_KEY_BASE64 must be base64 for 32 bytes when PII_ENCRYPTION_MODE=aesgcm");
  }

  if (buf.length < 12 + 16 + 1) throw new Error("Invalid encrypted PII payload");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = NodeBuffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
