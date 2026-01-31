import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { logApi, startApiLog } from "@/server/apiLog";
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

type ImportError = { row: number; column?: string; message: string };

type RowParsed = {
  row: number;
  idNo: string;
  phone: string;
  name: string;
  dept: string;
  jobTitle: string | null;
  status: "active" | "inactive";
  idNoHash: string;
  phoneNorm: string;
  phoneHash: string;
  idLast6: string;
};

function isTruthyQuery(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s === "1" || s === "true" || s === "yes";
}

function normalizeHeaderKey(s: string): string {
  return s.replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")").trim();
}

function pickHeaderCol(header: Record<string, number>, keys: string[], fallback: number): number {
  for (const k of keys) {
    const col = header[k];
    if (typeof col === "number" && col > 0) return col;
  }
  return fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = startApiLog(req, res);

  let actor;
  try {
    actor = requireAdmin(req);
  } catch {
    logApi(ctx, { level: "warn", event: "employee_import", ok: false, status: 401 });
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "POST") {
    logApi(ctx, { level: "warn", event: "employee_import", ok: false, status: 405, actorId: actor.userId });
    return sendError(res, 405, "Method not allowed");
  }

  const preview = isTruthyQuery(req.query.preview) || String(req.query.mode ?? "") === "preview";

  const pool = getPgPool();
  const errors: ImportError[] = [];
  const rowsParsed: RowParsed[] = [];

  try {
    const wb = await readUploadedXlsx(req);
    const ws = getFirstSheet(wb);

    const headerRow = ws.getRow(1);
    const header: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const key = normalizeHeaderKey(normalizeCellString(cell.value));
      if (key) header[key] = colNumber;
    });

    const colIdNo = pickHeaderCol(header, ["身份证号", "身份证号码", "证件号码"], 1);
    const colPhone = pickHeaderCol(header, ["手机号", "手机号码"], 2);
    const colName = pickHeaderCol(header, ["姓名"], 3);
    const colDept = pickHeaderCol(header, ["部门"], 4);
    const colJobTitle = pickHeaderCol(header, ["职位(可选)", "职位"], 5);
    const colStatus = pickHeaderCol(header, ["状态(active/inactive,可选)", "状态(active/inactive,可选)", "状态"], 6);

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const idNo = normalizeCellString(row.getCell(colIdNo).value);
      const phoneRaw = normalizeCellString(row.getCell(colPhone).value);
      const name = normalizeCellString(row.getCell(colName).value);
      const dept = normalizeCellString(row.getCell(colDept).value);
      const jobTitle = normalizeCellString(row.getCell(colJobTitle).value) || null;
      const statusRaw = normalizeCellString(row.getCell(colStatus).value) || "active";
      const status: "active" | "inactive" = statusRaw === "inactive" ? "inactive" : "active";

      const emptyRow = !idNo && !phoneRaw && !name && !dept && !jobTitle;
      if (emptyRow) continue;

      if (!idNo) errors.push({ row: i, column: "身份证号", message: "必填字段缺失" });
      if (!phoneRaw) errors.push({ row: i, column: "手机号", message: "必填字段缺失" });
      if (!name) errors.push({ row: i, column: "姓名", message: "必填字段缺失" });
      if (!dept) errors.push({ row: i, column: "部门", message: "必填字段缺失" });
      if (!idNo || !phoneRaw || !name || !dept) continue;

      if (!isValidChinaIdNo(idNo)) {
        errors.push({ row: i, column: "身份证号", message: "格式不正确" });
        continue;
      }
      if (!isValidChinaPhone(phoneRaw)) {
        errors.push({ row: i, column: "手机号", message: "格式不正确" });
        continue;
      }

      if (name.length > 50) errors.push({ row: i, column: "姓名", message: "长度过长（<=50）" });
      if (dept.length > 100) errors.push({ row: i, column: "部门", message: "长度过长（<=100）" });
      if (jobTitle && jobTitle.length > 100) errors.push({ row: i, column: "职位", message: "长度过长（<=100）" });
      if (errors.some((e) => e.row === i)) continue;

      const idNoHash = hmacSha256Hex(idNo.toUpperCase());
      const phoneNorm = normalizePhone(phoneRaw);
      const phoneHash = hmacSha256Hex(phoneNorm);
      const idLast6 = idNo.slice(-6);

      rowsParsed.push({
        row: i,
        idNo,
        phone: phoneRaw,
        name,
        dept,
        jobTitle,
        status,
        idNoHash,
        phoneNorm,
        phoneHash,
        idLast6,
      });
    }
  } catch (e) {
    logApi(ctx, { level: "error", event: "employee_import", ok: false, status: 400, actorId: actor.userId, err: String(e instanceof Error ? e.message : e) });
    return sendError(res, 400, "导入失败（文件格式或内容不正确）");
  }

  const idNoHashes = Array.from(new Set(rowsParsed.map((r) => r.idNoHash)));
  const { rows: existsRows } = await pool.query<{ id_no_hash: string }>(
    `SELECT id_no_hash FROM employees WHERE id_no_hash = ANY($1::text[])`,
    [idNoHashes],
  );
  const exists = new Set(existsRows.map((r) => String(r.id_no_hash)));

  const willCreate = rowsParsed.filter((r) => !exists.has(r.idNoHash));
  const willUpdate = rowsParsed.filter((r) => exists.has(r.idNoHash));

  if (preview) {
    logApi(ctx, { level: "info", event: "employee_import_preview", ok: true, status: 200, actorId: actor.userId, willCreate: willCreate.length, willUpdate: willUpdate.length, failCount: errors.length });
    return sendJson(res, 200, {
      ok: true,
      data: {
        preview: true,
        willCreateCount: willCreate.length,
        willUpdateCount: willUpdate.length,
        failCount: errors.length,
        errors,
        rows: rowsParsed.slice(0, 100).map((r) => ({
          row: r.row,
          name: r.name,
          dept: r.dept,
          jobTitle: r.jobTitle,
          status: r.status,
          op: exists.has(r.idNoHash) ? "update" : "create",
        })),
      },
    });
  }

  let createdCount = 0;
  let updatedCount = 0;
  let successCount = 0;

  try {
    await pool.query("BEGIN");

    for (const r of rowsParsed) {
      const idNoEnc = encryptPiiToBytes(r.idNo);
      const phoneEnc = encryptPiiToBytes(r.phoneNorm);

      try {
        const { rows: upRows } = await pool.query<{ inserted: boolean }>(
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
             updated_at=NOW()
           RETURNING (xmax = 0) AS inserted`,
          [r.name, r.dept, r.jobTitle, r.status, idNoEnc, r.idNoHash, r.idLast6, phoneEnc, r.phoneNorm, r.phoneHash],
        );

        successCount++;
        if (upRows[0]?.inserted) createdCount++;
        else updatedCount++;
      } catch (e) {
        errors.push({ row: r.row, message: `写入失败：${String(e instanceof Error ? e.message : e)}` });
      }
    }

    await pool.query("COMMIT");
  } catch (e) {
    try {
      await pool.query("ROLLBACK");
    } catch {
      // ignore
    }
    logApi(ctx, { level: "error", event: "employee_import", ok: false, status: 400, actorId: actor.userId, err: String(e instanceof Error ? e.message : e) });
    return sendError(res, 400, "导入失败（请检查文件内容后重试）");
  }

  await insertAuditLog(pool, {
    actor,
    action: "EMPLOYEE_IMPORT",
    entity: "employees",
    entityId: "-",
    before: null,
    after: { createdCount, updatedCount, successCount, failCount: errors.length },
    reason: null,
    req,
  });

  logApi(ctx, { level: "info", event: "employee_import", ok: true, status: 200, actorId: actor.userId, createdCount, updatedCount, successCount, failCount: errors.length });

  return sendJson(res, 200, {
    ok: true,
    data: { successCount, createdCount, updatedCount, failCount: errors.length, errors },
  });
}

