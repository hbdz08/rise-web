import type { NextApiRequest, NextApiResponse } from "next";

import type { AdminContext } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { logApi, startApiLog } from "@/server/apiLog";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";
import { verifyPassword } from "@/server/password";
import { buildAdminLoginRateLimitRules, enforceRateLimitOrRespond } from "@/server/rateLimit";
import { buildSessionCookieHeader, createAdminSessionCookieValue } from "@/server/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = startApiLog(req, res);
  if (req.method !== "POST") {
    logApi(ctx, { level: "warn", event: "admin_login", ok: false, status: 405 });
    return sendError(res, 405, "Method not allowed");
  }

  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "").trim();

  if (!username || !password) {
    logApi(ctx, { level: "warn", event: "admin_login", ok: false, status: 400 });
    return sendError(res, 400, "请输入用户名和密码");
  }

  for (const rule of buildAdminLoginRateLimitRules({ req, username })) {
    const ok = await enforceRateLimitOrRespond(req, res, rule, {
      status: 429,
      message: "登录过于频繁，请稍后再试",
      exposeHeaders: true,
    });
    if (!ok) {
      logApi(ctx, { level: "warn", event: "admin_login", ok: false, status: 429, username });
      return;
    }
  }

  const pool = getPgPool();
  let u:
    | {
        id: number | string;
        username: string;
        password_hash: string;
        role: "HR_ADMIN" | "HR_OPERATOR";
        status: "active" | "inactive";
      }
    | undefined;

  try {
    const q = await pool.query<{
      id: number | string;
      username: string;
      password_hash: string;
      role: "HR_ADMIN" | "HR_OPERATOR";
      status: "active" | "inactive";
    }>(
      `SELECT id, username, password_hash, role, status
       FROM admin_users
       WHERE username=$1
       LIMIT 1`,
      [username],
    );
    u = q.rows[0];
  } catch (e) {
    logApi(ctx, { level: "error", event: "admin_login", ok: false, status: 500, err: String(e instanceof Error ? e.message : e) });
    return sendError(res, 500, "登录失败");
  }

  const badCreds = !u || u.status !== "active" || !verifyPassword(password, u.password_hash);
  if (badCreds) {
    try {
      await insertAuditLog(pool, {
        actor: null,
        action: "ADMIN_LOGIN_FAIL",
        entity: "admin_users",
        entityId: "",
        before: null,
        after: { ok: false, username, reason: "bad_credentials" },
        reason: null,
        req,
      });
    } catch {
      // ignore
    }

    logApi(ctx, { level: "warn", event: "admin_login", ok: false, status: 401, username });
    return sendError(res, 401, "用户名或密码错误");
  }

  const userId = Number(u.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    logApi(ctx, { level: "error", event: "admin_login", ok: false, status: 500, username });
    return sendError(res, 500, "登录失败");
  }

  const cookieValue = createAdminSessionCookieValue({
    userId,
    username: u.username,
    role: u.role,
    iat: Date.now(),
  });

  res.setHeader("Set-Cookie", buildSessionCookieHeader(cookieValue));

  try {
    const actor: AdminContext = { userId, username: u.username, role: u.role };
    await insertAuditLog(pool, {
      actor,
      action: "ADMIN_LOGIN_SUCCESS",
      entity: "admin_users",
      entityId: String(userId),
      before: null,
      after: { ok: true, username: u.username, role: u.role },
      reason: null,
      req,
    });
  } catch {
    // ignore
  }

  logApi(ctx, { level: "info", event: "admin_login", ok: true, status: 200, actorId: userId, role: u.role });
  return sendJson(res, 200, { ok: true, data: { userId, username: u.username, role: u.role } });
}

