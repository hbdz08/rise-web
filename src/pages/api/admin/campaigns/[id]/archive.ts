import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdminRole } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

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

  const { rows: found } = await pool.query<{ status: string }>(`SELECT status FROM raise_campaigns WHERE id=$1`, [id]);
  const status = found[0]?.status;
  if (!status) return sendError(res, 404, "活动不存在");
  if (status === "archived") return sendJson(res, 200, { ok: true });

  await pool.query(
    `UPDATE raise_campaigns
     SET status='archived', updated_at=NOW()
     WHERE id=$1`,
    [id],
  );

  await insertAuditLog(pool, {
    actor,
    action: "CAMPAIGN_ARCHIVE",
    entity: "raise_campaigns",
    entityId: String(id),
    before: { status },
    after: { status: "archived" },
    reason: null,
    req,
  });

  return sendJson(res, 200, { ok: true });
}
