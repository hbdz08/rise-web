import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdminRole } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";
import { hashPassword } from "@/server/password";

type AdminUser = {
  id: number;
  username: string;
  role: "HR_ADMIN" | "HR_OPERATOR";
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let actor;
  try {
    actor = requireAdminRole(req, "HR_ADMIN");
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : "UNAUTHORIZED");
    return sendError(res, msg === "FORBIDDEN" ? 403 : 401, msg);
  }

  const pool = getPgPool();

  if (req.method === "GET") {
    const { rows } = await pool.query<{
      id: number;
      username: string;
      role: "HR_ADMIN" | "HR_OPERATOR";
      status: "active" | "inactive";
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, username, role, status, created_at, updated_at
       FROM admin_users
       ORDER BY id DESC
       LIMIT 200`,
    );

    const data: AdminUser[] = rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));

    return sendJson(res, 200, { ok: true, data });
  }

  if (req.method === "POST") {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "").trim();
    const role = String(req.body?.role ?? "HR_OPERATOR").trim();

    if (!username) return sendError(res, 400, "用户名不能为空");
    if (username.length > 64) return sendError(res, 400, "用户名过长");
    if (!password || password.length < 8) return sendError(res, 400, "密码至少 8 位");
    if (role !== "HR_ADMIN" && role !== "HR_OPERATOR") return sendError(res, 400, "角色不正确");

    const passwordHash = hashPassword(password);

    try {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO admin_users (username, password_hash, role, status)
         VALUES ($1,$2,$3,'active')
         RETURNING id`,
        [username, passwordHash, role],
      );

      const id = rows[0]?.id;
      await insertAuditLog(pool, {
        actor,
        action: "ADMIN_USER_CREATE",
        entity: "admin_users",
        entityId: String(id ?? ""),
        before: null,
        after: { username, role, status: "active" },
        reason: null,
        req,
      });

      return sendJson(res, 200, { ok: true, data: { id } });
    } catch {
      return sendError(res, 400, "创建失败（用户名可能已存在）");
    }
  }

  return sendError(res, 405, "Method not allowed");
}

