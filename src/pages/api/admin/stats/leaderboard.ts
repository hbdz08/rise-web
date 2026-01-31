import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";

function parseIntParam(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function parseLimit(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  const x = Math.floor(n);
  return Math.max(1, Math.min(100, x));
}

type Scope = "campaign" | "all";
type Kind = "raise" | "cut";

export type LeaderboardRow = {
  employeeId: number;
  name: string;
  dept: string;
  amount: string; // keep 2-decimal precision from NUMERIC
  itemsCount: number;
  campaignsCount: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

  try {
    requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  const scope = String(req.query.scope ?? "campaign") as Scope;
  if (scope !== "campaign" && scope !== "all") return sendError(res, 400, "Invalid scope");

  const kind = String(req.query.kind ?? "raise") as Kind;
  if (kind !== "raise" && kind !== "cut") return sendError(res, 400, "Invalid kind");

  const includeDraft = String(req.query.includeDraft ?? "") === "1";
  const limit = parseLimit(req.query.limit);

  const pool = getPgPool();

  if (scope === "campaign") {
    const campaignId = parseIntParam(req.query.campaignId);
    if (!campaignId || campaignId <= 0) return sendError(res, 400, "Invalid campaignId");

    const amountOp = kind === "raise" ? ">" : "<";
    const order = kind === "raise" ? "DESC" : "ASC";
    const statusFilter = includeDraft ? "" : "AND c.status IN ('published','archived')";

    const { rows } = await pool.query<{
      employee_id: number;
      name: string;
      dept: string;
      amount: string;
    }>(
      `SELECT
         e.id AS employee_id,
         e.name,
         e.dept,
         ri.raise_amount::text AS amount
       FROM raise_items ri
       JOIN employees e ON e.id=ri.employee_id
       JOIN raise_campaigns c ON c.id=ri.campaign_id
       WHERE ri.campaign_id=$1
         ${statusFilter}
         AND ri.raise_amount ${amountOp} 0
       ORDER BY ri.raise_amount ${order}, ri.id ASC
       LIMIT $2`,
      [campaignId, limit],
    );

    const data: LeaderboardRow[] = rows.map((r) => ({
      employeeId: r.employee_id,
      name: r.name,
      dept: r.dept,
      amount: r.amount,
      itemsCount: 1,
      campaignsCount: 1,
    }));

    return sendJson(res, 200, {
      ok: true,
      data: { scope, kind, includeDraft, limit, campaignId, rows: data },
    });
  }

  // scope === "all": rank by accumulated amount across campaigns.
  // Default: only published campaigns, unless includeDraft=1.
  const statusFilter = includeDraft ? "" : "WHERE c.status IN ('published','archived')";
  const amountExpr =
    kind === "raise"
      ? "SUM(CASE WHEN ri.raise_amount > 0 THEN ri.raise_amount ELSE 0 END)"
      : "SUM(CASE WHEN ri.raise_amount < 0 THEN ri.raise_amount ELSE 0 END)";
  const having =
    kind === "raise"
      ? "HAVING SUM(CASE WHEN ri.raise_amount > 0 THEN ri.raise_amount ELSE 0 END) > 0"
      : "HAVING SUM(CASE WHEN ri.raise_amount < 0 THEN ri.raise_amount ELSE 0 END) < 0";
  const order = kind === "raise" ? "DESC" : "ASC";
  const cond = kind === "raise" ? "ri.raise_amount > 0" : "ri.raise_amount < 0";

  const { rows } = await pool.query<{
    employee_id: number;
    name: string;
    dept: string;
    amount: string;
    items_count: string;
    campaigns_count: string;
  }>(
    `SELECT
       e.id AS employee_id,
       e.name,
       e.dept,
       (${amountExpr})::text AS amount,
       (COUNT(*) FILTER (WHERE ${cond}))::text AS items_count,
       (COUNT(DISTINCT ri.campaign_id) FILTER (WHERE ${cond}))::text AS campaigns_count
     FROM raise_items ri
     JOIN employees e ON e.id=ri.employee_id
     JOIN raise_campaigns c ON c.id=ri.campaign_id
     ${statusFilter}
     GROUP BY e.id, e.name, e.dept
     ${having}
     ORDER BY (${amountExpr}) ${order}, e.id ASC
     LIMIT $1`,
    [limit],
  );

  const data: LeaderboardRow[] = rows.map((r) => ({
    employeeId: r.employee_id,
    name: r.name,
    dept: r.dept,
    amount: r.amount,
    itemsCount: Number(r.items_count ?? 0),
    campaignsCount: Number(r.campaigns_count ?? 0),
  }));

  return sendJson(res, 200, { ok: true, data: { scope, kind, includeDraft, limit, rows: data } });
}
