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
  if (req.method !== "PATCH") return sendError(res, 405, "Method not allowed");

  let actor;
  try {
    actor = requireAdminRole(req, "HR_ADMIN");
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : "UNAUTHORIZED");
    return sendError(res, msg === "FORBIDDEN" ? 403 : 401, msg);
  }

  const campaignId = parseId(req.query.id);
  const itemId = parseId(req.query.itemId);
  if (!campaignId || !itemId) return sendError(res, 400, "Invalid id");

  const raiseAmount = Number(req.body?.raiseAmount);
  const performanceGrade = String(req.body?.performanceGrade ?? "").trim();
  const remark = req.body?.remark != null ? String(req.body.remark).trim() : null;
  const overrideReason = String(req.body?.overrideReason ?? "").trim();

  if (!overrideReason) return sendError(res, 400, "OVERRIDE_REASON_REQUIRED");
  if (overrideReason.length < 5) return sendError(res, 400, "OVERRIDE_REASON_TOO_SHORT");
  if (!Number.isFinite(raiseAmount)) return sendError(res, 400, "Invalid raiseAmount");
  if (!["S", "A", "B", "C"].includes(performanceGrade)) return sendError(res, 400, "Invalid performanceGrade");

  const pool = getPgPool();

  const { rows: c } = await pool.query<{ status: string }>(`SELECT status FROM raise_campaigns WHERE id=$1`, [campaignId]);
  if (!c[0]) return sendError(res, 404, "活动不存在");
  if (c[0].status !== "published") return sendError(res, 409, "CAMPAIGN_NOT_EDITABLE");

  // NOTE: auth (HR_ADMIN) should be enforced here later.
  const { rows: beforeRows } = await pool.query<{
    raise_amount: string;
    performance_grade: string;
    remark: string | null;
    override_reason: string | null;
  }>(
    `SELECT raise_amount::text, performance_grade, remark, override_reason
     FROM raise_items
     WHERE id=$1 AND campaign_id=$2`,
    [itemId, campaignId],
  );
  const before = beforeRows[0] ?? null;

  const { rowCount } = await pool.query(
    `UPDATE raise_items
     SET raise_amount=$1,
         performance_grade=$2,
         remark=$3,
         override_reason=$4,
         overridden_at=NOW(),
         overridden_by=$5,
         updated_at=NOW(),
         updated_by=$5,
         version=version+1
     WHERE id=$6 AND campaign_id=$7`,
    [raiseAmount, performanceGrade, remark, overrideReason, actor.userId, itemId, campaignId],
  );

  if (!rowCount) return sendError(res, 404, "明细不存在");

  await insertAuditLog(pool, {
    actor,
    action: "RAISE_ITEM_ADMIN_OVERRIDE",
    entity: "raise_items",
    entityId: String(itemId),
    before,
    after: { raiseAmount, performanceGrade, remark, overrideReason },
    reason: overrideReason,
    req,
  });

  return sendJson(res, 200, { ok: true });
}
