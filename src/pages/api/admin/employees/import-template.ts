import type { NextApiRequest, NextApiResponse } from "next";

import ExcelJS from "exceljs";

import { requireAdmin } from "@/server/adminAuth";
import { sendXlsx } from "@/server/excel";
import { sendError } from "@/server/http";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("employees");

  ws.addRow(["身份证号", "手机号", "姓名", "部门", "职位(可选)", "状态(active/inactive,可选)"]);
  ws.addRow(["110101199001011234", "13800138000", "张三", "研发部", "工程师", "active"]);

  ws.columns.forEach((c) => {
    c.width = 22;
  });
  ws.getRow(1).font = { bold: true };

  return sendXlsx(res, "employees_import_template.xlsx", wb);
}

