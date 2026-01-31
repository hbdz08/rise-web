import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const campaignId = parseId(req.query.id);
  if (!campaignId) return sendError(res, 400, "Invalid campaign id");

  const pool = getPgPool();
  let actor;
  try {
    actor = requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method === "GET") {
    const { rows } = await pool.query<{
      item_id: number | null;
      employee_id: number;
      name: string;
      dept: string;
      raise_amount: string | null;
      performance_grade: string | null;
      remark: string | null;
    }>(
      `SELECT
         ri.id AS item_id,
         e.id AS employee_id,
         e.name,
         e.dept,
         ri.raise_amount,
         ri.performance_grade,
         ri.remark
       FROM employees e
       LEFT JOIN raise_items ri
         ON ri.employee_id = e.id AND ri.campaign_id = $1
       WHERE e.status='active'
       ORDER BY e.id DESC
       LIMIT 500`,
      [campaignId],
    );

    const data = rows.map((r) => ({
      itemId: r.item_id,
      employeeId: r.employee_id,
      name: r.name,
      dept: r.dept,
      raiseAmount: r.raise_amount,
      performanceGrade: r.performance_grade,
      remark: r.remark,
    }));

    return sendJson(res, 200, { ok: true, data });
  }

  if (req.method === "POST") {
    // Upsert by (campaign_id, employee_id) in draft only.
    const employeeId = parseId(req.body?.employeeId);
    const raiseAmount = Number(req.body?.raiseAmount);
    const performanceGrade = String(req.body?.performanceGrade ?? "").trim();
    const remark = req.body?.remark != null ? String(req.body.remark).trim() : null;

    if (!employeeId) return sendError(res, 400, "Invalid employeeId");
    if (!Number.isFinite(raiseAmount)) return sendError(res, 400, "Invalid raiseAmount");
    if (!["S", "A", "B", "C"].includes(performanceGrade)) return sendError(res, 400, "Invalid performanceGrade");

    const { rows: c } = await pool.query<{ status: string }>(`SELECT status FROM raise_campaigns WHERE id=$1`, [
      campaignId,
    ]);
    if (!c[0]) return sendError(res, 404, "活动不存在");
    if (c[0].status !== "draft") return sendError(res, 409, "活动已发布/归档，禁止录入");

    const { rows: beforeRows } = await pool.query<{
      id: number;
      raise_amount: string;
      performance_grade: string;
      remark: string | null;
    }>(`SELECT id, raise_amount::text, performance_grade, remark FROM raise_items WHERE campaign_id=$1 AND employee_id=$2`, [
      campaignId,
      employeeId,
    ]);
    const before = beforeRows[0] ?? null;

    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO raise_items (campaign_id, employee_id, raise_amount, performance_grade, remark, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (campaign_id, employee_id)
       DO UPDATE SET raise_amount=EXCLUDED.raise_amount, performance_grade=EXCLUDED.performance_grade, remark=EXCLUDED.remark, updated_by=EXCLUDED.updated_by, updated_at=NOW(), version=raise_items.version+1
       RETURNING id`,
      [campaignId, employeeId, raiseAmount, performanceGrade, remark, actor.userId],
    );

    await insertAuditLog(pool, {
      actor,
      action: "RAISE_ITEM_UPSERT",
      entity: "raise_items",
      entityId: String(rows[0]?.id ?? ""),
      before,
      after: { employeeId, raiseAmount, performanceGrade, remark },
      reason: null,
      req,
    });

    return sendJson(res, 200, { ok: true, data: { itemId: rows[0]?.id } });
  }

  return sendError(res, 405, "Method not allowed");
}
