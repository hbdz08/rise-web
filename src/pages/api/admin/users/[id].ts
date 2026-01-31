import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdminRole } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";
import { hashPassword } from "@/server/password";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let actor;
  try {
    actor = requireAdminRole(req, "HR_ADMIN");
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : "UNAUTHORIZED");
    return sendError(res, msg === "FORBIDDEN" ? 403 : 401, msg);
  }

  const id = parseId(req.query.id);
  if (!id) return sendError(res, 400, "Invalid id");

  const pool = getPgPool();

  if (req.method !== "PATCH" && req.method !== "DELETE") return sendError(res, 405, "Method not allowed");

  if (id === actor.userId) {
    // Prevent self lock-out via this endpoint (can be relaxed later with a safer flow).
    if (req.method === "DELETE") return sendError(res, 400, "不能删除当前登录账号");
    if (req.body?.status && String(req.body.status) !== "active") {
      return sendError(res, 400, "不能禁用当前登录账号");
    }
  }

  const { rows: beforeRows } = await pool.query<{
    id: number;
    username: string;
    role: string;
    status: string;
  }>(`SELECT id, username, role, status FROM admin_users WHERE id=$1`, [id]);
  const before = beforeRows[0];
  if (!before) return sendError(res, 404, "账号不存在");

  // Soft-delete: mark inactive and rename username to free original username.
  if (req.method === "DELETE") {
    // Disallow deleting last active HR_ADMIN
    if (before.role === "HR_ADMIN" && before.status === "active") {
      const { rows: adminCntRows } = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM admin_users
         WHERE role='HR_ADMIN' AND status='active' AND id<>$1`,
        [id],
      );
      const cnt = Number(adminCntRows[0]?.cnt ?? 0);
      if (cnt <= 0) return sendError(res, 400, "不能删除最后一个启用的管理员账号");
    }

    const deletedUsername = `${before.username}__deleted__${id}`;
    await pool.query(
      `UPDATE admin_users
       SET status='inactive', username=$1, updated_at=NOW()
       WHERE id=$2`,
      [deletedUsername, id],
    );

    await insertAuditLog(pool, {
      actor,
      action: "ADMIN_USER_DELETE",
      entity: "admin_users",
      entityId: String(id),
      before,
      after: { ...before, status: "inactive", username: deletedUsername },
      reason: null,
      req,
    });

    return sendJson(res, 200, { ok: true, data: true });
  }

  const role = req.body?.role != null ? String(req.body.role).trim() : null;
  const status = req.body?.status != null ? String(req.body.status).trim() : null;
  const password = req.body?.password != null ? String(req.body.password).trim() : null;

  // Disallow disabling/demoting the last active HR_ADMIN
  if ((status && status !== before.status) || (role && role !== before.role)) {
    const wouldDemoteAdmin = before.role === "HR_ADMIN" && role === "HR_OPERATOR";
    const wouldDisableAdmin = before.role === "HR_ADMIN" && before.status === "active" && status === "inactive";
    if (wouldDemoteAdmin || wouldDisableAdmin) {
      const { rows: adminCntRows } = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM admin_users
         WHERE role='HR_ADMIN' AND status='active' AND id<>$1`,
        [id],
      );
      const cnt = Number(adminCntRows[0]?.cnt ?? 0);
      if (cnt <= 0) return sendError(res, 400, "不能禁用或降级最后一个启用的管理员账号");
    }
  }

  const updates: string[] = [];
  const args: unknown[] = [];
  let idx = 1;

  if (role != null) {
    if (role !== "HR_ADMIN" && role !== "HR_OPERATOR") return sendError(res, 400, "角色不正确");
    updates.push(`role=$${idx++}`);
    args.push(role);
  }

  if (status != null) {
    if (status !== "active" && status !== "inactive") return sendError(res, 400, "状态不正确");
    updates.push(`status=$${idx++}`);
    args.push(status);
  }

  if (password != null) {
    if (password.length < 8) return sendError(res, 400, "密码至少 8 位");
    const passwordHash = hashPassword(password);
    updates.push(`password_hash=$${idx++}`);
    args.push(passwordHash);
  }

  if (!updates.length) return sendError(res, 400, "没有需要更新的字段");

  updates.push(`updated_at=NOW()`);
  args.push(id);

  await pool.query(`UPDATE admin_users SET ${updates.join(", ")} WHERE id=$${idx}`, args);

  const after = {
    ...before,
    ...(role != null ? { role } : null),
    ...(status != null ? { status } : null),
    ...(password != null ? { passwordChanged: true } : null),
  };

  await insertAuditLog(pool, {
    actor,
    action: password != null ? "ADMIN_USER_RESET_PASSWORD" : "ADMIN_USER_UPDATE",
    entity: "admin_users",
    entityId: String(id),
    before,
    after,
    reason: null,
    req,
  });

  return sendJson(res, 200, { ok: true, data: true });
}
