import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let actor;
  try {
    actor = requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  const id = parseId(req.query.id);
  if (!id) return sendError(res, 400, "Invalid id");

  const pool = getPgPool();

  if (req.method === "GET") {
    const { rows } = await pool.query<{
      id: number;
      name: string;
      start_date: string | null;
      end_date: string | null;
      effective_date: string;
      status: "draft" | "published" | "archived";
      published_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
         id,
         name,
         start_date::text AS start_date,
         end_date::text AS end_date,
         effective_date::text AS effective_date,
         status,
         published_at,
         created_at,
         updated_at
       FROM raise_campaigns
       WHERE id=$1
       LIMIT 1`,
      [id],
    );

    const c = rows[0];
    if (!c) return sendError(res, 404, "活动不存在");

    const { rows: cntRows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM raise_items WHERE campaign_id=$1`,
      [id],
    );
    const itemsCount = Number(cntRows[0]?.cnt ?? 0);

    return sendJson(res, 200, {
      ok: true,
      data: {
        id: c.id,
        name: c.name,
        startDate: c.start_date,
        endDate: c.end_date,
        effectiveDate: String(c.effective_date),
        status: c.status,
        publishedAt: c.published_at ? c.published_at.toISOString() : null,
        itemsCount,
        createdAt: c.created_at.toISOString(),
        updatedAt: c.updated_at.toISOString(),
      },
    });
  }

  if (req.method === "DELETE") {
    const { rows: foundRows } = await pool.query<{
      id: number;
      name: string;
      status: "draft" | "published" | "archived";
    }>(`SELECT id, name, status FROM raise_campaigns WHERE id=$1 LIMIT 1`, [id]);

    const found = foundRows[0];
    if (!found) return sendError(res, 404, "活动不存在");
    if (found.status !== "draft") return sendError(res, 409, "只有草稿状态可以删除");

    await pool.query(`DELETE FROM raise_campaigns WHERE id=$1`, [id]);

    await insertAuditLog(pool, {
      actor,
      action: "CAMPAIGN_DELETE",
      entity: "raise_campaigns",
      entityId: String(id),
      before: { id: found.id, name: found.name, status: found.status },
      after: null,
      reason: null,
      req,
    });

    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "PATCH") {
    const { rows: beforeRows } = await pool.query<{
      id: number;
      name: string;
      start_date: string | null;
      end_date: string | null;
      effective_date: string;
      status: "draft" | "published" | "archived";
    }>(
      `SELECT id, name, start_date::text AS start_date, end_date::text AS end_date, effective_date::text AS effective_date, status
       FROM raise_campaigns
       WHERE id=$1
       LIMIT 1`,
      [id],
    );

    const before = beforeRows[0];
    if (!before) return sendError(res, 404, "活动不存在");
    if (before.status !== "draft") return sendError(res, 409, "活动已发布/归档，禁止修改");

    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    const startDate = req.body?.startDate != null ? String(req.body.startDate).trim() : null;
    const endDate = req.body?.endDate != null ? String(req.body.endDate).trim() : null;
    const effectiveDate = req.body?.effectiveDate != null ? String(req.body.effectiveDate).trim() : null;

    const updates: string[] = [];
    const args: unknown[] = [];
    let idx = 1;

    if (name != null) {
      if (!name) return sendError(res, 400, "活动名称不能为空");
      updates.push(`name=$${idx++}`);
      args.push(name);
    }

    if (startDate != null) {
      if (startDate && !isYmd(startDate)) return sendError(res, 400, "开始日期格式不正确");
      updates.push(`start_date=$${idx++}`);
      args.push(startDate || null);
    }

    if (endDate != null) {
      if (endDate && !isYmd(endDate)) return sendError(res, 400, "结束日期格式不正确");
      updates.push(`end_date=$${idx++}`);
      args.push(endDate || null);
    }

    if (effectiveDate != null) {
      if (!effectiveDate || !isYmd(effectiveDate)) return sendError(res, 400, "生效日期格式不正确");
      updates.push(`effective_date=$${idx++}`);
      args.push(effectiveDate);
    }

    const startAfter = startDate ?? before.start_date ?? null;
    const endAfter = endDate ?? before.end_date ?? null;
    if (startAfter && endAfter && startAfter > endAfter) {
      return sendError(res, 400, "开始日期不能晚于结束日期");
    }

    if (!updates.length) return sendError(res, 400, "没有需要更新的字段");

    updates.push(`updated_at=NOW()`);
    args.push(id);

    await pool.query(`UPDATE raise_campaigns SET ${updates.join(", ")} WHERE id=$${idx}`, args);

    await insertAuditLog(pool, {
      actor,
      action: "CAMPAIGN_UPDATE",
      entity: "raise_campaigns",
      entityId: String(id),
      before: {
        name: before.name,
        startDate: before.start_date,
        endDate: before.end_date,
        effectiveDate: before.effective_date,
        status: before.status,
      },
      after: {
        ...(name != null ? { name } : null),
        ...(startDate != null ? { startDate: startDate || null } : null),
        ...(endDate != null ? { endDate: endDate || null } : null),
        ...(effectiveDate != null ? { effectiveDate } : null),
      },
      reason: null,
      req,
    });

    return sendJson(res, 200, { ok: true, data: true });
  }

  return sendError(res, 405, "Method not allowed");
}
