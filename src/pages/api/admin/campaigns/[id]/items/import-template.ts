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
  const ws = wb.addWorksheet("campaign_items");

  ws.addRow(["身份证号", "姓名(可选)", "调薪金额", "绩效等级(S/A/B/C)", "备注(可选)"]);
  ws.addRow(["110101199001011234", "张三", "500.00", "A", "调薪示例"]);
  ws.addRow(["110101199001011235", "李四", "-200.00", "B", "降薪示例（可为负数）"]);

  ws.columns.forEach((c) => {
    c.width = 22;
  });
  ws.getRow(1).font = { bold: true };

  return sendXlsx(res, "campaign_items_import_template.xlsx", wb);
}
