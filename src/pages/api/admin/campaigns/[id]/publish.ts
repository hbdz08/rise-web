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

  if (req.method !== "POST") {
    logApi(ctx, { level: "warn", event: "campaign_publish", ok: false, status: 405 });
    return sendError(res, 405, "Method not allowed");
  }

  let actor;
  try {
    actor = requireAdminRole(req, "HR_ADMIN");
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : "UNAUTHORIZED");
    const status = msg === "FORBIDDEN" ? 403 : 401;
    logApi(ctx, { level: "warn", event: "campaign_publish", ok: false, status, reason: msg });
    return sendError(res, status, msg);
  }

  const id = parseId(req.query.id);
  if (!id) {
    logApi(ctx, { level: "warn", event: "campaign_publish", ok: false, status: 400 });
    return sendError(res, 400, "Invalid id");
  }

  const pool = getPgPool();

  try {
    const { rows: found } = await pool.query<{ status: string }>(`SELECT status FROM raise_campaigns WHERE id=$1`, [id]);
    const status = found[0]?.status;
    if (!status) {
      logApi(ctx, { level: "warn", event: "campaign_publish", ok: false, status: 404, actorId: actor.userId, campaignId: id });
      return sendError(res, 404, "活动不存在");
    }
    if (status !== "draft") {
      logApi(ctx, { level: "warn", event: "campaign_publish", ok: false, status: 409, actorId: actor.userId, campaignId: id, reason: "not_draft" });
      return sendError(res, 409, "活动不可发布");
    }

    await pool.query(
      `UPDATE raise_campaigns
       SET status='published', published_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [id],
    );

    await insertAuditLog(pool, {
      actor,
      action: "CAMPAIGN_PUBLISH",
      entity: "raise_campaigns",
      entityId: String(id),
      before: { status: "draft" },
      after: { status: "published" },
      reason: null,
      req,
    });

    logApi(ctx, { level: "info", event: "campaign_publish", ok: true, status: 200, actorId: actor.userId, campaignId: id });
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    logApi(ctx, { level: "error", event: "campaign_publish", ok: false, status: 500, actorId: actor.userId, campaignId: id, err: String(e instanceof Error ? e.message : e) });
    return sendError(res, 500, "发布失败");
  }
}

