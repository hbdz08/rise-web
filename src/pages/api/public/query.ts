import type { NextApiRequest, NextApiResponse } from "next";

import { insertAuditLog } from "@/server/audit";
import { logApi, startApiLog } from "@/server/apiLog";
import { getPgPool } from "@/server/db";
import { hmacSha256Hex, normalizePhone } from "@/server/pii";
import { getRedisOptional } from "@/server/redis";
import { buildPublicQueryRateLimitRules, enforceRateLimitOrRespond } from "@/server/rateLimit";
import { isValidChinaIdNo, isValidChinaPhone } from "@/server/validators";

function secureFlag(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function clearCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secureFlag()}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = startApiLog(req, res);
  if (req.method !== "POST") {
    logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 405 });
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const idNo = String(req.body?.idNo ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const captcha = String(req.body?.captcha ?? "").trim();

  if (!isValidChinaIdNo(idNo) || !isValidChinaPhone(phone)) {
    logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "invalid_format" });
    return res.status(200).json({ ok: false, message: "信息格式不正确，请检查后重试。" });
  }

  const idNoHash = hmacSha256Hex(idNo.toUpperCase());
  const phoneNorm = normalizePhone(phone);
  const phoneHash = hmacSha256Hex(phoneNorm);
  const idHash8 = idNoHash.slice(0, 8);
  const phoneHash8 = phoneHash.slice(0, 8);

  // Rate limit: by IP + ID hash + phone hash (Redis required; otherwise disabled).
  for (const rule of buildPublicQueryRateLimitRules({ req, idNoHash, phoneHash })) {
    const ok = await enforceRateLimitOrRespond(req, res, rule, {
      // Keep status 200 so the public page can uniformly handle json payloads.
      status: 200,
      message: "查询过于频繁，请稍后再试。",
      exposeHeaders: true,
    });
    if (!ok) {
      logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "rate_limited", idHash8, phoneHash8 });
      return;
    }
  }

  // Captcha verification (Redis):
  // - stored in Redis with TTL=120s
  // - one-time use: delete on success
  // - fail count limited: 5 attempts
  //
  // Fallback: cookie-only captcha when Redis is unavailable.
  const redis = await getRedisOptional();
  if (redis) {
    const captchaId = String(req.cookies["rise_captcha_id"] ?? "").trim();
    if (!captchaId || !captcha) {
      logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "captcha_missing", idHash8, phoneHash8 });
      return res.status(200).json({ ok: false, message: "请输入验证码。" });
    }

    try {
      const code = await redis.get(`captcha:${captchaId}`);
      if (!code) {
        res.setHeader("Set-Cookie", clearCookie("rise_captcha_id"));
        logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "captcha_expired", idHash8, phoneHash8 });
        return res.status(200).json({ ok: false, message: "验证码已过期，请刷新验证码后重试。" });
      }

      if (code !== captcha) {
        const failKey = `captcha_fail:${captchaId}`;
        const fails = await redis.incr(failKey);
        if (fails === 1) await redis.expire(failKey, 120);

        if (fails >= 5) {
          await redis.del(`captcha:${captchaId}`, failKey);
          res.setHeader("Set-Cookie", clearCookie("rise_captcha_id"));
          logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "captcha_locked", fails, idHash8, phoneHash8 });
          return res.status(200).json({ ok: false, message: "验证码错误次数过多，请刷新验证码后重试。" });
        }

        logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "captcha_mismatch", fails, idHash8, phoneHash8 });
        return res.status(200).json({ ok: false, message: `验证码错误（${fails}/5）。` });
      }

      await redis.del(`captcha:${captchaId}`, `captcha_fail:${captchaId}`);
      res.setHeader("Set-Cookie", clearCookie("rise_captcha_id"));
    } catch {
      res.setHeader("Set-Cookie", clearCookie("rise_captcha_id"));
      logApi(ctx, { level: "error", event: "public_query", ok: false, status: 200, reason: "captcha_redis_error", idHash8, phoneHash8 });
      return res.status(200).json({ ok: false, message: "验证码服务繁忙，请刷新验证码后重试。" });
    }
  } else {
    const cookieCode = String(req.cookies["rise_captcha"] ?? "");
    res.setHeader("Set-Cookie", clearCookie("rise_captcha"));

    if (!cookieCode || !captcha || cookieCode !== captcha) {
      logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "captcha_mismatch_cookie", idHash8, phoneHash8 });
      return res.status(200).json({ ok: false, message: "验证码校验失败，请重试。" });
    }
  }

  const pool = getPgPool();

  // Verify employee
  const { rows: empRows } = await pool.query<{
    id: number;
    name: string;
    dept: string;
    phone_hash: string | null;
  }>(`SELECT id, name, dept, phone_hash FROM employees WHERE id_no_hash=$1 AND status='active' LIMIT 1`, [idNoHash]);

  const emp = empRows[0];
  if (!emp || !emp.phone_hash || emp.phone_hash !== phoneHash) {
    // Avoid leaking whether ID exists.
    try {
      await insertAuditLog(pool, {
        actor: null,
        action: "PUBLIC_QUERY_FAIL",
        entity: "public_query",
        entityId: "",
        before: null,
        after: { ok: false, reason: "employee_mismatch", idHash8, phoneHash8 },
        reason: null,
        req,
      });
    } catch {
      // ignore
    }

    logApi(ctx, { level: "warn", event: "public_query", ok: false, status: 200, reason: "employee_mismatch", idHash8, phoneHash8 });
    return res.status(200).json({ ok: false, message: "校验失败，请检查后重试。" });
  }

  const { rows } = await pool.query<{
    campaign_id: number;
    campaign_name: string;
    effective_date: string;
    raise_amount: string;
    performance_grade: "S" | "A" | "B" | "C";
    remark: string | null;
  }>(
    `SELECT
       c.id AS campaign_id,
       c.name AS campaign_name,
       c.effective_date::text AS effective_date,
       ri.raise_amount::text AS raise_amount,
       ri.performance_grade,
       ri.remark
     FROM raise_items ri
     JOIN raise_campaigns c ON c.id = ri.campaign_id
     WHERE ri.employee_id=$1 AND c.status='published'
     ORDER BY c.effective_date DESC, c.id DESC
     LIMIT 50`,
    [emp.id],
  );

  try {
    await insertAuditLog(pool, {
      actor: null,
      action: "PUBLIC_QUERY",
      entity: "public_query",
      entityId: String(emp.id),
      before: null,
      after: {
        ok: true,
        employeeId: emp.id,
        name: emp.name,
        dept: emp.dept,
        records: rows.length,
        // Avoid bloating audit row; keep top 10 for quick debugging.
        topCampaigns: rows.slice(0, 10).map((r) => ({
          campaignId: r.campaign_id,
          campaignName: r.campaign_name,
          effectiveDate: r.effective_date,
          raiseAmount: r.raise_amount,
          performanceGrade: r.performance_grade,
        })),
      },
      reason: null,
      req,
    });
  } catch {
    // ignore
  }

  logApi(ctx, { level: "info", event: "public_query", ok: true, status: 200, employeeId: emp.id, records: rows.length });
  return res.status(200).json({
    ok: true,
    data: {
      name: emp.name,
      dept: emp.dept,
      records: rows.map((r) => ({
        campaignName: r.campaign_name,
        effectiveDate: r.effective_date,
        raiseAmount: r.raise_amount,
        performanceGrade: r.performance_grade,
        remark: r.remark,
      })),
    },
  });
}
