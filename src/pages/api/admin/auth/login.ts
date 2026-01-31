import type { NextApiRequest, NextApiResponse } from "next";

import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";
import { verifyPassword } from "@/server/password";
import { buildSessionCookieHeader, createAdminSessionCookieValue } from "@/server/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "").trim();

  if (!username || !password) return sendError(res, 400, "请输入用户名和密码");

  const pool = getPgPool();
  const { rows } = await pool.query<{
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

  const u = rows[0];
  if (!u || u.status !== "active") return sendError(res, 401, "用户名或密码错误");

  // Backward-compat: allow inserting a hash produced by scripts/hash-password.mjs.
  const ok = verifyPassword(password, u.password_hash);
  if (!ok) return sendError(res, 401, "用户名或密码错误");

  const userId = Number(u.id);
  if (!Number.isFinite(userId) || userId <= 0) return sendError(res, 500, "登录失败");

  const cookieValue = createAdminSessionCookieValue({
    userId,
    username: u.username,
    role: u.role,
    iat: Date.now(),
  });

  res.setHeader("Set-Cookie", buildSessionCookieHeader(cookieValue));
  return sendJson(res, 200, { ok: true, data: { userId, username: u.username, role: u.role } });
}
