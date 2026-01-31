import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { getFirstSheet, normalizeCellString, readUploadedXlsx } from "@/server/excel";
import { sendError, sendJson } from "@/server/http";
import { hmacSha256Hex } from "@/server/pii";
import { isValidChinaIdNo } from "@/server/validators";

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type ImportError = { row: number; message: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let actor;
  try {
    actor = requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

  const campaignId = parseId(req.query.id);
  if (!campaignId) return sendError(res, 400, "Invalid campaign id");

  const pool = getPgPool();

  const { rows: campRows } = await pool.query<{ status: string }>(`SELECT status FROM raise_campaigns WHERE id=$1`, [
    campaignId,
  ]);
  const status = campRows[0]?.status;
  if (!status) return sendError(res, 404, "活动不存在");
  if (status !== "draft") return sendError(res, 409, "活动已发布/归档，禁止导入覆盖");

  const { rows: empRows } = await pool.query<{ id: number; id_no_hash: string; name: string }>(
    `SELECT id, id_no_hash, name FROM employees WHERE status='active'`,
  );
  const empMap = new Map<string, { id: number; name: string }>();
  for (const e of empRows) empMap.set(e.id_no_hash, { id: e.id, name: e.name });

  const errors: ImportError[] = [];
  let successCount = 0;

  try {
    const wb = await readUploadedXlsx(req);
    const ws = getFirstSheet(wb);

    const headerRow = ws.getRow(1);
    const header: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const key = normalizeCellString(cell.value);
      if (key) header[key] = colNumber;
    });

    const colIdNo = header["身份证号"] ?? 1;
    const colName = header["姓名（可选）"] ?? header["姓名(可选)"] ?? header["姓名"] ?? null;
    const colAmount = header["调薪金额"] ?? header["涨薪金额"] ?? 2;
    const colGrade =
      header["绩效等级（S/A/B/C）"] ?? header["绩效等级(S/A/B/C)"] ?? header["绩效等级"] ?? 3;
    const colRemark = header["备注（可选）"] ?? header["备注(可选)"] ?? header["备注"] ?? 4;

    await pool.query("BEGIN");

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const idNo = normalizeCellString(row.getCell(colIdNo).value);
      const name = colName ? normalizeCellString(row.getCell(colName).value) : "";
      const amountRaw = normalizeCellString(row.getCell(colAmount).value);
      const gradeRaw = normalizeCellString(row.getCell(colGrade).value).toUpperCase();
      const remark = normalizeCellString(row.getCell(colRemark).value) || null;

      const emptyRow = !idNo && !name && !amountRaw && !gradeRaw && !remark;
      if (emptyRow) continue;

      if (!idNo) {
        errors.push({ row: i, message: "身份证号不能为空" });
        continue;
      }
      if (!isValidChinaIdNo(idNo)) {
        errors.push({ row: i, message: "身份证号格式不正确" });
        continue;
      }

      const emp = empMap.get(hmacSha256Hex(idNo.toUpperCase()));
      if (!emp) {
        errors.push({ row: i, message: "员工不存在（请先导入人员）" });
        continue;
      }

      // Optional safety check: if name is provided, it must match the employee record.
      if (name && name.trim() !== emp.name.trim()) {
        errors.push({ row: i, message: "姓名与系统记录不一致（请检查身份证号/姓名）" });
        continue;
      }

      const raiseAmount = Number(amountRaw);
      if (!Number.isFinite(raiseAmount)) {
        errors.push({ row: i, message: "调薪金额不正确" });
        continue;
      }
      if (!["S", "A", "B", "C"].includes(gradeRaw)) {
        errors.push({ row: i, message: "绩效等级必须是 S/A/B/C" });
        continue;
      }

      try {
        await pool.query(
          `INSERT INTO raise_items (campaign_id, employee_id, raise_amount, performance_grade, remark, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())
           ON CONFLICT (campaign_id, employee_id)
           DO UPDATE SET raise_amount=EXCLUDED.raise_amount, performance_grade=EXCLUDED.performance_grade, remark=EXCLUDED.remark, updated_by=EXCLUDED.updated_by, updated_at=NOW(), version=raise_items.version+1`,
          [campaignId, emp.id, Number(raiseAmount.toFixed(2)), gradeRaw, remark, actor.userId],
        );
        successCount++;
      } catch {
        errors.push({ row: i, message: "写入失败" });
      }
    }

    await pool.query("COMMIT");
  } catch {
    try {
      await pool.query("ROLLBACK");
    } catch {
      // ignore
    }
    return sendError(res, 400, "导入失败（文件格式或内容不正确）");
  }

  await insertAuditLog(pool, {
    actor,
    action: "CAMPAIGN_ITEMS_IMPORT",
    entity: "raise_campaigns",
    entityId: String(campaignId),
    before: null,
    after: { successCount, failCount: errors.length },
    reason: null,
    req,
  });

  return sendJson(res, 200, { ok: true, data: { successCount, failCount: errors.length, errors } });
}
