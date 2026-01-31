import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

type AuditLogRow = {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  reason: string | null;
  createdAt: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: number;
    action: string;
    entity: string;
    entity_id: string;
    reason: string | null;
    created_at: Date;
  }>(
    `SELECT id, action, entity, entity_id, reason, created_at
     FROM audit_logs
     ORDER BY id DESC
     LIMIT 200`,
  );

  const data: AuditLogRow[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    reason: r.reason,
    createdAt: r.created_at.toISOString(),
  }));

  return sendJson(res, 200, { ok: true, data });
}

