import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdminRole } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { logApi, startApiLog } from "@/server/apiLog";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = startApiLog(req, res);

  if (req.method !== "PATCH") {
    logApi(ctx, { level: "warn", event: "raise_item_admin_override", ok: false, status: 405 });
    return sendError(res, 405, "Method not allowed");
  }

  let actor;
  try {
    actor = requireAdminRole(req, "HR_ADMIN");
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : "UNAUTHORIZED");
    const status = msg === "FORBIDDEN" ? 403 : 401;
    logApi(ctx, { level: "warn", event: "raise_item_admin_override", ok: false, status, reason: msg });
    return sendError(res, status, msg);
  }

  const campaignId = parseId(req.query.id);
  const itemId = parseId(req.query.itemId);
  if (!campaignId || !itemId) {
    logApi(ctx, { level: "warn", event: "raise_item_admin_override", ok: false, status: 400, actorId: actor.userId });
    return sendError(res, 400, "Invalid id");
  }

  const raiseAmount = Number(req.body?.raiseAmount);
  const performanceGrade = String(req.body?.performanceGrade ?? "").trim();
  const remark = req.body?.remark != null ? String(req.body.remark).trim() : null;
  const overrideReason = String(req.body?.overrideReason ?? "").trim();

  if (!overrideReason) return sendError(res, 400, "OVERRIDE_REASON_REQUIRED");
  if (overrideReason.length < 5) return sendError(res, 400, "OVERRIDE_REASON_TOO_SHORT");
  if (!Number.isFinite(raiseAmount)) return sendError(res, 400, "Invalid raiseAmount");
  if (!["S", "A", "B", "C"].includes(performanceGrade)) return sendError(res, 400, "Invalid performanceGrade");

  const pool = getPgPool();

  try {
    const { rows: c } = await pool.query<{ status: string }>(`SELECT status FROM raise_campaigns WHERE id=$1`, [campaignId]);
    if (!c[0]) {
      logApi(ctx, { level: "warn", event: "raise_item_admin_override", ok: false, status: 404, actorId: actor.userId, campaignId, itemId });
      return sendError(res, 404, "活动不存在");
    }
    if (c[0].status !== "published") {
      logApi(ctx, { level: "warn", event: "raise_item_admin_override", ok: false, status: 409, actorId: actor.userId, campaignId, itemId, reason: "campaign_not_published" });
      return sendError(res, 409, "CAMPAIGN_NOT_EDITABLE");
    }

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

    if (!rowCount) {
      logApi(ctx, { level: "warn", event: "raise_item_admin_override", ok: false, status: 404, actorId: actor.userId, campaignId, itemId, reason: "item_not_found" });
      return sendError(res, 404, "明细不存在");
    }

    await insertAuditLog(pool, {
      actor,
      action: "RAISE_ITEM_ADMIN_OVERRIDE",
      entity: "raise_items",
      entityId: String(itemId),
      before,
      after: { raiseAmount, performanceGrade, remark, overrideReason, campaignId },
      reason: overrideReason,
      req,
    });

    logApi(ctx, { level: "info", event: "raise_item_admin_override", ok: true, status: 200, actorId: actor.userId, campaignId, itemId });
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    logApi(ctx, { level: "error", event: "raise_item_admin_override", ok: false, status: 500, actorId: actor.userId, campaignId, itemId, err: String(e instanceof Error ? e.message : e) });
    return sendError(res, 500, "修正失败");
  }
}

