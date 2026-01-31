import type { NextApiRequest, NextApiResponse } from "next";

import { getRedisOptional } from "@/server/redis";
import { getClientIp } from "@/server/ip";

export type RateLimitRule = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult =
  | { ok: true; count: number; remaining: number; resetSeconds: number }
  | { ok: false; count: number; remaining: number; resetSeconds: number };

async function incrWithExpiry(key: string, windowSeconds: number): Promise<{ count: number; ttl: number } | null> {
  const redis = await getRedisOptional();
  if (!redis) return null;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    let ttl = await redis.ttl(key);
    if (ttl < 0) {
      await redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }

    return { count, ttl };
  } catch {
    // Redis unavailable => treat as no rate limit (graceful degradation).
    return null;
  }
}

export async function checkRateLimit(rule: RateLimitRule): Promise<RateLimitResult | null> {
  const r = await incrWithExpiry(rule.key, rule.windowSeconds);
  if (!r) return null;

  const remaining = Math.max(0, rule.limit - r.count);
  const ok = r.count <= rule.limit;
  return ok
    ? { ok: true, count: r.count, remaining, resetSeconds: r.ttl }
    : { ok: false, count: r.count, remaining, resetSeconds: r.ttl };
}

export async function enforceRateLimitOrRespond(
  req: NextApiRequest,
  res: NextApiResponse,
  rule: RateLimitRule,
  opts?: { status?: number; message?: string; exposeHeaders?: boolean },
): Promise<boolean> {
  const result = await checkRateLimit(rule);
  if (!result) return true; // Redis disabled/unavailable => no rate limit

  const status = opts?.status ?? 429;
  const message = opts?.message ?? "请求过于频繁，请稍后再试";

  if (opts?.exposeHeaders) {
    res.setHeader("X-RateLimit-Limit", String(rule.limit));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    res.setHeader("X-RateLimit-Reset", String(result.resetSeconds));
  }

  if (!result.ok) {
    res.status(status).json({ ok: false, message });
    return false;
  }
  return true;
}

export function buildPublicQueryRateLimitRules(params: {
  req: NextApiRequest;
  idNoHash?: string | null;
  phoneHash?: string | null;
}): RateLimitRule[] {
  const ip = getClientIp(params.req);
  const rules: RateLimitRule[] = [
    { key: `rl:public_query:ip:${ip}`, limit: 60, windowSeconds: 10 * 60 },
  ];
  if (params.idNoHash) rules.push({ key: `rl:public_query:id:${params.idNoHash}`, limit: 12, windowSeconds: 10 * 60 });
  if (params.phoneHash)
    rules.push({ key: `rl:public_query:phone:${params.phoneHash}`, limit: 12, windowSeconds: 10 * 60 });
  return rules;
}

export function buildAdminLoginRateLimitRules(params: { req: NextApiRequest; username?: string | null }): RateLimitRule[] {
  const ip = getClientIp(params.req);
  const rules: RateLimitRule[] = [{ key: `rl:admin_login:ip:${ip}`, limit: 30, windowSeconds: 10 * 60 }];
  if (params.username) rules.push({ key: `rl:admin_login:username:${params.username}`, limit: 10, windowSeconds: 10 * 60 });
  return rules;
}
