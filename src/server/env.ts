export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "",
  piiHmacKey: process.env.PII_HMAC_KEY ?? "",
  piiEncryptionMode: process.env.PII_ENCRYPTION_MODE ?? "plain",
  piiEncKeyBase64: process.env.PII_ENC_KEY_BASE64 ?? "",
  // NOTE: session vars are intentionally not snapshotted; read via helpers below
};

export function requireDatabaseUrl(): string {
  if (!env.databaseUrl) {
    throw new Error("Missing DATABASE_URL. Create .env.local based on .env.example.");
  }
  return env.databaseUrl;
}

export function requirePiiHmacKey(): string {
  if (!env.piiHmacKey) {
    throw new Error("Missing PII_HMAC_KEY. Create .env.local based on .env.example.");
  }
  return env.piiHmacKey;
}

export function requireSessionSecret(): string {
  const v = process.env.SESSION_SECRET ?? "";
  if (!v) {
    throw new Error("Missing SESSION_SECRET. Create .env.local based on .env.example.");
  }
  return v;
}

export function getSessionMaxAgeSeconds(): number {
  const raw = process.env.SESSION_MAX_AGE_SECONDS;
  const n = Number(raw ?? "43200");
  return Number.isFinite(n) && n > 0 ? n : 43200;
}
