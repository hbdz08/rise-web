import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

type CampaignListItem = {
  id: number;
  name: string;
  effectiveDate: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pool = getPgPool();
  let actor;
  try {
    actor = requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method === "GET") {
    const { rows } = await pool.query<{
      id: number;
      name: string;
      effective_date: string;
      status: "draft" | "published" | "archived";
      published_at: Date | null;
    }>(
      `SELECT id, name, effective_date::text AS effective_date, status, published_at
       FROM raise_campaigns
       ORDER BY id DESC
       LIMIT 200`,
    );

    const data: CampaignListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      effectiveDate: String(r.effective_date),
      status: r.status,
      publishedAt: r.published_at ? r.published_at.toISOString() : null,
    }));

    return sendJson(res, 200, { ok: true, data });
  }

  if (req.method === "POST") {
    const name = String(req.body?.name ?? "").trim();
    const effectiveDate = String(req.body?.effectiveDate ?? "").trim();

    if (!name) return sendError(res, 400, "活动名称不能为空");
    if (!effectiveDate) return sendError(res, 400, "生效日期不能为空");

    const startDate = req.body?.startDate ? String(req.body.startDate).trim() : null;
    const endDate = req.body?.endDate ? String(req.body.endDate).trim() : null;

    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO raise_campaigns (name, start_date, end_date, effective_date, status, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5)
       RETURNING id`,
      [name, startDate, endDate, effectiveDate, actor.userId],
    );

    await insertAuditLog(pool, {
      actor,
      action: "CAMPAIGN_CREATE",
      entity: "raise_campaigns",
      entityId: String(rows[0]?.id ?? ""),
      before: null,
      after: { name, startDate, endDate, effectiveDate, status: "draft" },
      reason: null,
      req,
    });

    return sendJson(res, 200, { ok: true, data: { id: rows[0]?.id } });
  }

  return sendError(res, 405, "Method not allowed");
}
