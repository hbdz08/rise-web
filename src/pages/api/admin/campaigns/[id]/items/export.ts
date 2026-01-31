import type { NextApiRequest, NextApiResponse } from "next";

import type { Buffer as NodeBuffer } from "node:buffer";

import ExcelJS from "exceljs";

import { requireAdmin } from "@/server/adminAuth";
import { getPgPool } from "@/server/db";
import { sendError } from "@/server/http";
import { sendXlsx } from "@/server/excel";
import { decryptPiiFromBytes } from "@/server/pii";
import { maskPhone } from "@/server/validators";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

  const campaignId = parseId(req.query.id);
  if (!campaignId) return sendError(res, 400, "Invalid campaign id");

  const pool = getPgPool();

  const { rows: campRows } = await pool.query<{ name: string; effective_date: string }>(
    `SELECT name, effective_date::text AS effective_date FROM raise_campaigns WHERE id=$1`,
    [campaignId],
  );
  const camp = campRows[0];
  if (!camp) return sendError(res, 404, "活动不存在");

  const { rows } = await pool.query<{
    employee_id: number;
    name: string;
    dept: string;
    id_last6: string;
    phone_enc: NodeBuffer;
    raise_amount: string | null;
    performance_grade: string | null;
    remark: string | null;
  }>(
    `SELECT
       e.id AS employee_id,
       e.name,
       e.dept,
       e.id_last6,
       e.phone_enc,
       ri.raise_amount::text AS raise_amount,
       ri.performance_grade,
       ri.remark
     FROM employees e
     LEFT JOIN raise_items ri
       ON ri.employee_id=e.id AND ri.campaign_id=$1
     WHERE e.status='active'
     ORDER BY e.id DESC
     LIMIT 5000`,
    [campaignId],
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("campaign_items");

  ws.addRow([
    "活动名称",
    "生效日期",
    "姓名",
    "部门",
    "身份证后6位",
    "手机号(脱敏)",
    "调薪金额",
    "绩效等级",
    "备注",
  ]);

  for (const r of rows) {
    let phone = "";
    try {
      phone = decryptPiiFromBytes(r.phone_enc);
    } catch {
      phone = "";
    }
    ws.addRow([
      camp.name,
      String(camp.effective_date),
      r.name,
      r.dept,
      r.id_last6,
      phone ? maskPhone(phone) : "",
      r.raise_amount ?? "",
      r.performance_grade ?? "",
      r.remark ?? "",
    ]);
  }

  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => {
    c.width = 20;
  });

  return sendXlsx(res, `campaign_${campaignId}_items_export.xlsx`, wb);
}
