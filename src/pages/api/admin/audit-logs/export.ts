import type { NextApiRequest, NextApiResponse } from "next";

import ExcelJS from "exceljs";

import { auditActionLabel, auditEntityLabel, auditFieldLabel } from "@/lib/auditLabels";
import { requireAdmin } from "@/server/adminAuth";
import { getPgPool } from "@/server/db";
import { sendXlsx } from "@/server/excel";
import { sendError } from "@/server/http";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2000;
  return Math.max(1, Math.min(10000, Math.floor(n)));
}

function parseYmd(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function fmtVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 160 ? `${s.slice(0, 160)}...` : s;
  } catch {
    return String(v);
  }
}

function buildChangeSummary(before: unknown, after: unknown): string {
  if (!after || typeof after !== "object") return "";
  const a = after as Record<string, unknown>;
  const b = before && typeof before === "object" ? (before as Record<string, unknown>) : {};

  const keys = Object.keys(a);
  if (!keys.length) return "";

  const parts: string[] = [];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    const same = fmtVal(av) === fmtVal(bv);
    if (!same) parts.push(`${auditFieldLabel(k)}: ${fmtVal(bv)} -> ${fmtVal(av)}`);
  }
  return parts.join("；");
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

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("audit_logs");

  ws.addRow([
    "ID",
    "时间",
    "操作者ID",
    "操作者",
    "目标账号",
    "动作代码",
    "动作",
    "对象代码",
    "对象",
    "对象ID",
    "活动ID",
    "活动名称",
    "生效日期",
    "人员ID",
    "姓名",
    "部门",
    "变更摘要",
    "原因",
    "IP",
  ]);

  for (const r of rows) {
    ws.addRow([
      r.id,
      r.created_at.toISOString(),
      r.actor_id ?? "",
      r.actor_username ?? "",
      r.target_admin_username ?? "",
      r.action,
      auditActionLabel(r.action),
      r.entity,
      auditEntityLabel(r.entity),
      r.entity_id,
      r.campaign_id ?? "",
      r.campaign_name ?? "",
      r.campaign_effective_date ?? "",
      r.employee_id ?? "",
      r.employee_name ?? "",
      r.employee_dept ?? "",
      buildChangeSummary(r.before_json, r.after_json),
      r.reason ?? "",
      r.ip ?? "",
    ]);
  }

  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => {
    c.width = 22;
  });

  return sendXlsx(res, "audit_logs_export.xlsx", wb);
}
