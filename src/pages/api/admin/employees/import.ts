import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { getFirstSheet, normalizeCellString, readUploadedXlsx } from "@/server/excel";
import { sendError, sendJson } from "@/server/http";
import { encryptPiiToBytes, hmacSha256Hex, normalizePhone } from "@/server/pii";
import { isValidChinaIdNo, isValidChinaPhone } from "@/server/validators";

export const config = {
  api: {
    bodyParser: false,
  },
};

type ImportError = { row: number; message: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let actor;
  try {
    actor = requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "POST") return sendError(res, 405, "Method not allowed");

  const pool = getPgPool();

  const errors: ImportError[] = [];
  let successCount = 0;

  try {
    const wb = await readUploadedXlsx(req);
    const ws = getFirstSheet(wb);

    // Header mapping by title
    const headerRow = ws.getRow(1);
    const header: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const key = normalizeCellString(cell.value);
      if (key) header[key] = colNumber;
    });

    const colIdNo = header["身份证号"] ?? 1;
    const colPhone = header["手机号"] ?? 2;
    const colName = header["姓名"] ?? 3;
    const colDept = header["部门"] ?? 4;
    const colJobTitle = header["职位(可选)"] ?? header["职位"] ?? 5;
    const colStatus = header["状态(active/inactive,可选)"] ?? header["状态"] ?? 6;

    await pool.query("BEGIN");

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const idNo = normalizeCellString(row.getCell(colIdNo).value);
      const phoneRaw = normalizeCellString(row.getCell(colPhone).value);
      const name = normalizeCellString(row.getCell(colName).value);
      const dept = normalizeCellString(row.getCell(colDept).value);
      const jobTitle = normalizeCellString(row.getCell(colJobTitle).value) || null;
      const statusRaw = normalizeCellString(row.getCell(colStatus).value) || "active";
      const status = statusRaw === "inactive" ? "inactive" : "active";

      const emptyRow = !idNo && !phoneRaw && !name && !dept && !jobTitle;
      if (emptyRow) continue;

      if (!idNo || !phoneRaw || !name || !dept) {
        errors.push({ row: i, message: "必填字段缺失（身份证号/手机号/姓名/部门）" });
        continue;
      }
      if (!isValidChinaIdNo(idNo)) {
        errors.push({ row: i, message: "身份证号格式不正确" });
        continue;
      }
      if (!isValidChinaPhone(phoneRaw)) {
        errors.push({ row: i, message: "手机号格式不正确" });
        continue;
      }

      const idNoHash = hmacSha256Hex(idNo.toUpperCase());
      const phoneNorm = normalizePhone(phoneRaw);
      const phoneHash = hmacSha256Hex(phoneNorm);
      const idLast6 = idNo.slice(-6);

      const idNoEnc = encryptPiiToBytes(idNo);
      const phoneEnc = encryptPiiToBytes(phoneNorm);

      try {
        await pool.query(
          `INSERT INTO employees (name, dept, job_title, status, id_no_enc, id_no_hash, id_last6, phone_enc, phone_norm, phone_hash, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (id_no_hash)
           DO UPDATE SET
             name=EXCLUDED.name,
             dept=EXCLUDED.dept,
             job_title=EXCLUDED.job_title,
             status=EXCLUDED.status,
             id_no_enc=EXCLUDED.id_no_enc,
             id_last6=EXCLUDED.id_last6,
             phone_enc=EXCLUDED.phone_enc,
             phone_norm=EXCLUDED.phone_norm,
             phone_hash=EXCLUDED.phone_hash,
             updated_at=NOW()`,
          [name, dept, jobTitle, status, idNoEnc, idNoHash, idLast6, phoneEnc, phoneNorm, phoneHash],
        );
        successCount++;
      } catch {
        errors.push({ row: i, message: "写入失败（请检查是否有重复/非法数据）" });
      }
    }

    await pool.query("COMMIT");
  } catch (e) {
    try {
      await pool.query("ROLLBACK");
    } catch {
      // ignore
    }
    return sendError(res, 400, "导入失败（文件格式或内容不正确）");
  }

  await insertAuditLog(pool, {
    actor,
    action: "EMPLOYEE_IMPORT",
    entity: "employees",
    entityId: "-",
    before: null,
    after: { successCount, failCount: errors.length },
    reason: null,
    req,
  });

  return sendJson(res, 200, {
    ok: true,
    data: { successCount, failCount: errors.length, errors },
  });
}
