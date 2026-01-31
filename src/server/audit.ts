import type { NextApiRequest } from "next";
import type { Pool } from "pg";

import type { AdminContext } from "@/server/adminAuth";

export type AuditLogInput = {
  actor: AdminContext | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown | null;
  after: unknown | null;
  reason: string | null;
  req: NextApiRequest;
};

function getIp(req: NextApiRequest): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  const ra = req.socket?.remoteAddress;
  return ra ? String(ra) : null;
}

export async function insertAuditLog(pool: Pool, input: AuditLogInput): Promise<void> {
  const userAgent = typeof input.req.headers["user-agent"] === "string" ? input.req.headers["user-agent"] : null;
  const ip = getIp(input.req);

  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, entity, entity_id, before_json, after_json, reason, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.actor?.userId ?? null,
      input.action,
      input.entity,
      input.entityId,
      input.before,
      input.after,
      input.reason,
      ip,
      userAgent,
    ],
  );
}
