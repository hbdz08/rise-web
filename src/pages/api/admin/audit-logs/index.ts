import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

type AuditLogRow = {
  id: number;
  actorId: number | null;
  actorUsername: string | null;
  action: string;
  entity: string;
  entityId: string;
  campaignId: number | null;
  campaignName: string | null;
  campaignEffectiveDate: string | null;
  employeeId: number | null;
  employeeName: string | null;
  employeeDept: string | null;
  targetAdminUsername: string | null;
  reason: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 200;
  return Math.max(1, Math.min(2000, Math.floor(n)));
}

function parseYmd(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

  const action = String(req.query.action ?? "").trim();
  const entity = String(req.query.entity ?? "").trim();
  const actorId = parseId(req.query.actorId);
  const campaignId = parseId(req.query.campaignId);
  const from = parseYmd(req.query.from);
  const to = parseYmd(req.query.to);
  const limit = parseLimit(req.query.limit);

  const where: string[] = [];
  const args: unknown[] = [];
  let idx = 1;

  if (action) {
    where.push(`a.action=$${idx++}`);
    args.push(action);
  }

  if (entity) {
    where.push(`a.entity=$${idx++}`);
    args.push(entity);
  }

  if (actorId) {
    where.push(`a.actor_id=$${idx++}`);
    args.push(actorId);
  }

  if (from) {
    where.push(`a.created_at >= $${idx++}::date`);
    args.push(from);
  }

  if (to) {
    // include the whole day
    where.push(`a.created_at < ($${idx++}::date + INTERVAL '1 day')`);
    args.push(to);
  }

  if (campaignId) {
    where.push(
      `( (a.entity='raise_campaigns' AND a.entity_id=$${idx}::text)
         OR (ri.campaign_id=$${idx}::bigint) )`,
    );
    args.push(campaignId);
    idx += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: number;
    actor_id: number | null;
    actor_username: string | null;
    action: string;
    entity: string;
    entity_id: string;
    reason: string | null;
    campaign_id: number | null;
    campaign_name: string | null;
    campaign_effective_date: string | null;
    employee_id: number | null;
    employee_name: string | null;
    employee_dept: string | null;
    target_admin_username: string | null;
    before_json: unknown | null;
    after_json: unknown | null;
    ip: string | null;
    user_agent: string | null;
    created_at: Date;
  }>(
    `SELECT
       a.id,
       a.actor_id,
       u.username AS actor_username,
       a.action,
       a.entity,
       a.entity_id,
       a.reason,
       CASE
         WHEN a.entity='raise_campaigns' AND a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint
         ELSE ri.campaign_id
       END AS campaign_id,
       c.name AS campaign_name,
       c.effective_date::text AS campaign_effective_date,
       e.id AS employee_id,
       e.name AS employee_name,
       e.dept AS employee_dept,
       tu.username AS target_admin_username,
       a.before_json,
       a.after_json,
       a.ip,
       a.user_agent,
       a.created_at
     FROM audit_logs a
     LEFT JOIN admin_users u ON u.id=a.actor_id
     LEFT JOIN admin_users tu
       ON tu.id = CASE WHEN a.entity='admin_users' AND a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint END
     LEFT JOIN raise_items ri
       ON ri.id = CASE WHEN a.entity='raise_items' AND a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint END
     LEFT JOIN employees e
       ON e.id = CASE
         WHEN a.entity='employees' AND a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint
         WHEN a.entity='raise_items' THEN ri.employee_id
         WHEN a.entity='public_query' AND a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint
         ELSE NULL
       END
     LEFT JOIN raise_campaigns c
       ON c.id = CASE
         WHEN a.entity='raise_campaigns' AND a.entity_id ~ '^[0-9]+$' THEN a.entity_id::bigint
         WHEN a.entity='raise_items' THEN ri.campaign_id
         ELSE NULL
       END
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT $${idx}`,
    [...args, limit],
  );

  const data: AuditLogRow[] = rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorUsername: r.actor_username,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignEffectiveDate: r.campaign_effective_date,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    employeeDept: r.employee_dept,
    targetAdminUsername: r.target_admin_username,
    reason: r.reason,
    beforeJson: r.before_json,
    afterJson: r.after_json,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at.toISOString(),
  }));

  return sendJson(res, 200, { ok: true, data });
}
