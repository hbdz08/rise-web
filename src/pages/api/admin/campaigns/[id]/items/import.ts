import type { NextApiRequest, NextApiResponse } from "next";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { logApi, startApiLog } from "@/server/apiLog";
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

type ImportError = { row: number; column?: string; message: string };

type RowParsed = {
  row: number;
  employeeId: number;
  employeeName: string;
  raiseAmount: number;
  performanceGrade: "S" | "A" | "B" | "C";
  remark: string | null;
  op: "create" | "update";
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
    logApi(ctx, { level: "warn", event: "campaign_items_import", ok: false, status: 401 });
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method !== "POST") {
    logApi(ctx, { level: "warn", event: "campaign_items_import", ok: false, status: 405, actorId: actor.userId });
    return sendError(res, 405, "Method not allowed");
  }

  const campaignId = parseId(req.query.id);
  if (!campaignId) {
    logApi(ctx, { level: "warn", event: "campaign_items_import", ok: false, status: 400, actorId: actor.userId });
    return sendError(res, 400, "Invalid campaign id");
  }

  const preview = isTruthyQuery(req.query.preview) || String(req.query.mode ?? "") === "preview";

  const pool = getPgPool();

  const { rows: campRows } = await pool.query<{ status: string }>(`SELECT status FROM raise_campaigns WHERE id=$1`, [
    campaignId,
  ]);
  const status = campRows[0]?.status;
  if (!status) {
    logApi(ctx, { level: "warn", event: "campaign_items_import", ok: false, status: 404, actorId: actor.userId, campaignId });
    return sendError(res, 404, "活动不存在");
  }
  if (status !== "draft") {
    logApi(ctx, { level: "warn", event: "campaign_items_import", ok: false, status: 409, actorId: actor.userId, campaignId });
    return sendError(res, 409, "活动已发布/归档，禁止导入明细");
  }

  const { rows: empRows } = await pool.query<{ id: number; id_no_hash: string; name: string }>(
    `SELECT id, id_no_hash, name FROM employees WHERE status='active'`,
  );
  const empMap = new Map<string, { id: number; name: string }>();
  for (const e of empRows) empMap.set(String(e.id_no_hash), { id: e.id, name: e.name });

  const { rows: existingRows } = await pool.query<{ employee_id: number }>(
    `SELECT employee_id FROM raise_items WHERE campaign_id=$1`,
    [campaignId],
  );
  const existing = new Set<number>(existingRows.map((r) => Number(r.employee_id)));

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
    const colName = header["姓名(可选)"] ?? header["姓名"] ?? 0;
    const colAmount = pickHeaderCol(header, ["调薪金额", "调薪金额", "调薪金额(元)", "调薪金额(元)"], 2);
    const colGrade = pickHeaderCol(header, ["绩效等级(S/A/B/C)", "绩效等级", "绩效(S/A/B/C)"], 3);
    const colRemark = pickHeaderCol(header, ["备注(可选)", "备注"], 4);

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
        errors.push({ row: i, column: "身份证号", message: "必填字段缺失" });
        continue;
      }
      if (!isValidChinaIdNo(idNo)) {
        errors.push({ row: i, column: "身份证号", message: "格式不正确" });
        continue;
      }

      const emp = empMap.get(hmacSha256Hex(idNo.toUpperCase()));
      if (!emp) {
        errors.push({ row: i, column: "身份证号", message: "员工不存在（请先导入人员）" });
        continue;
      }

      if (name && name.trim() !== emp.name.trim()) {
        errors.push({ row: i, column: "姓名", message: "与系统记录不一致（请检查身份证号/姓名）" });
        continue;
      }

      const raiseAmount = Number(amountRaw);
      if (!Number.isFinite(raiseAmount)) {
        errors.push({ row: i, column: "调薪金额", message: "不是有效数字" });
        continue;
      }

      const grade = gradeRaw as RowParsed["performanceGrade"];
      if (!["S", "A", "B", "C"].includes(grade)) {
        errors.push({ row: i, column: "绩效等级", message: "必须是 S/A/B/C" });
        continue;
      }

      if (remark && remark.length > 500) {
        errors.push({ row: i, column: "备注", message: "长度过长（<=500）" });
        continue;
      }

      rowsParsed.push({
        row: i,
        employeeId: emp.id,
        employeeName: emp.name,
        raiseAmount: Number(raiseAmount.toFixed(2)),
        performanceGrade: grade,
        remark,
        op: existing.has(emp.id) ? "update" : "create",
      });
    }
  } catch (e) {
    logApi(ctx, { level: "error", event: "campaign_items_import", ok: false, status: 400, actorId: actor.userId, campaignId, err: String(e instanceof Error ? e.message : e) });
    return sendError(res, 400, "导入失败（文件格式或内容不正确）");
  }

  const willCreate = rowsParsed.filter((r) => r.op === "create");
  const willUpdate = rowsParsed.filter((r) => r.op === "update");

  if (preview) {
    logApi(ctx, { level: "info", event: "campaign_items_import_preview", ok: true, status: 200, actorId: actor.userId, campaignId, willCreate: willCreate.length, willUpdate: willUpdate.length, failCount: errors.length });
    return sendJson(res, 200, {
      ok: true,
      data: {
        preview: true,
        willCreateCount: willCreate.length,
        willUpdateCount: willUpdate.length,
        failCount: errors.length,
        errors,
        rows: rowsParsed.slice(0, 200),
      },
    });
  }

  let successCount = 0;
  let createdCount = 0;
  let updatedCount = 0;

  try {
    await pool.query("BEGIN");
    for (const r of rowsParsed) {
      try {
        const { rows: upRows } = await pool.query<{ inserted: boolean }>(
          `INSERT INTO raise_items (campaign_id, employee_id, raise_amount, performance_grade, remark, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())
           ON CONFLICT (campaign_id, employee_id)
           DO UPDATE SET
             raise_amount=EXCLUDED.raise_amount,
             performance_grade=EXCLUDED.performance_grade,
             remark=EXCLUDED.remark,
             updated_by=EXCLUDED.updated_by,
             updated_at=NOW(),
             version=raise_items.version+1
           RETURNING (xmax = 0) AS inserted`,
          [campaignId, r.employeeId, r.raiseAmount, r.performanceGrade, r.remark, actor.userId],
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
    logApi(ctx, { level: "error", event: "campaign_items_import", ok: false, status: 400, actorId: actor.userId, campaignId, err: String(e instanceof Error ? e.message : e) });
    return sendError(res, 400, "导入失败（请检查文件内容后重试）");
  }

  await insertAuditLog(pool, {
    actor,
    action: "CAMPAIGN_ITEMS_IMPORT",
    entity: "raise_campaigns",
    entityId: String(campaignId),
    before: null,
    after: { successCount, createdCount, updatedCount, failCount: errors.length },
    reason: null,
    req,
  });

  logApi(ctx, { level: "info", event: "campaign_items_import", ok: true, status: 200, actorId: actor.userId, campaignId, successCount, createdCount, updatedCount, failCount: errors.length });

  return sendJson(res, 200, {
    ok: true,
    data: { successCount, createdCount, updatedCount, failCount: errors.length, errors },
  });
}

