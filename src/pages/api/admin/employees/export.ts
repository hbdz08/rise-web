import type { NextApiRequest, NextApiResponse } from "next";

import type { Buffer as NodeBuffer } from "node:buffer";

import ExcelJS from "exceljs";

import { requireAdmin } from "@/server/adminAuth";
import { getPgPool } from "@/server/db";
import { sendError } from "@/server/http";
import { sendXlsx } from "@/server/excel";
import { decryptPiiFromBytes } from "@/server/pii";
import { maskPhone } from "@/server/validators";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

  const pool = getPgPool();
  const { rows } = await pool.query<{
    id: number;
    name: string;
    dept: string;
    job_title: string | null;
    status: string;
    id_last6: string;
    phone_enc: NodeBuffer;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, dept, job_title, status, id_last6, phone_enc, created_at, updated_at
     FROM employees
     ORDER BY id DESC
     LIMIT 2000`,
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("employees");

  ws.addRow(["姓名", "部门", "职位", "状态", "身份证后6位", "手机号(脱敏)", "创建时间", "更新时间"]);
  for (const r of rows) {
    let phone = "";
    try {
      phone = decryptPiiFromBytes(r.phone_enc);
    } catch {
      phone = "";
    }
    ws.addRow([
      r.name,
      r.dept,
      r.job_title ?? "",
      r.status,
      r.id_last6,
      phone ? maskPhone(phone) : "",
      r.created_at.toISOString(),
      r.updated_at.toISOString(),
    ]);
  }

  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => {
    c.width = 22;
  });

  return sendXlsx(res, "employees_export.xlsx", wb);
}
