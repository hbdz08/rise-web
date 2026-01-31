import type { NextApiRequest, NextApiResponse } from "next";

import type { Buffer as NodeBuffer } from "node:buffer";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";
import { decryptPiiFromBytes, encryptPiiToBytes, hmacSha256Hex, normalizePhone } from "@/server/pii";
import { isValidChinaPhone, maskPhone } from "@/server/validators";

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
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

  if (req.method !== "PATCH") return sendError(res, 405, "Method not allowed");

  const pool = getPgPool();

  const { rows: beforeRows } = await pool.query<{
    id: number;
    name: string;
    dept: string;
    job_title: string | null;
    status: "active" | "inactive";
    id_last6: string;
    phone_enc: NodeBuffer;
  }>(`SELECT id, name, dept, job_title, status, id_last6, phone_enc FROM employees WHERE id=$1`, [id]);

  const before = beforeRows[0];
  if (!before) return sendError(res, 404, "员工不存在");

  const name = req.body?.name != null ? String(req.body.name).trim() : null;
  const dept = req.body?.dept != null ? String(req.body.dept).trim() : null;
  const jobTitle = req.body?.jobTitle != null ? String(req.body.jobTitle).trim() : null;
  const status = req.body?.status != null ? String(req.body.status).trim() : null;
  const phone = req.body?.phone != null ? String(req.body.phone).trim() : null;

  const updates: string[] = [];
  const args: unknown[] = [];
  let idx = 1;

  if (name != null) {
    if (!name) return sendError(res, 400, "姓名不能为空");
    updates.push(`name=$${idx++}`);
    args.push(name);
  }
  if (dept != null) {
    if (!dept) return sendError(res, 400, "部门不能为空");
    updates.push(`dept=$${idx++}`);
    args.push(dept);
  }
  if (jobTitle != null) {
    updates.push(`job_title=$${idx++}`);
    args.push(jobTitle || null);
  }
  if (status != null) {
    if (status !== "active" && status !== "inactive") return sendError(res, 400, "状态不正确");
    updates.push(`status=$${idx++}`);
    args.push(status);
  }
  if (phone != null) {
    if (!isValidChinaPhone(phone)) return sendError(res, 400, "手机号格式不正确");
    const phoneNorm = normalizePhone(phone);
    const phoneHash = hmacSha256Hex(phoneNorm);
    const phoneEnc = encryptPiiToBytes(phoneNorm);
    updates.push(`phone_enc=$${idx++}`);
    args.push(phoneEnc);
    updates.push(`phone_norm=$${idx++}`);
    args.push(phoneNorm);
    updates.push(`phone_hash=$${idx++}`);
    args.push(phoneHash);
  }

  if (!updates.length) return sendError(res, 400, "没有需要更新的字段");

  updates.push(`updated_at=NOW()`);
  args.push(id);

  await pool.query(`UPDATE employees SET ${updates.join(", ")} WHERE id=$${idx}`, args);

  // Avoid storing PII in audit log.
  let beforePhoneMasked = "";
  try {
    beforePhoneMasked = maskPhone(decryptPiiFromBytes(before.phone_enc));
  } catch {
    beforePhoneMasked = "";
  }

  await insertAuditLog(pool, {
    actor,
    action: "EMPLOYEE_UPDATE",
    entity: "employees",
    entityId: String(id),
    before: { name: before.name, dept: before.dept, jobTitle: before.job_title, status: before.status, idLast6: before.id_last6, phoneMasked: beforePhoneMasked },
    after: {
      ...(name != null ? { name } : null),
      ...(dept != null ? { dept } : null),
      ...(jobTitle != null ? { jobTitle } : null),
      ...(status != null ? { status } : null),
      ...(phone != null ? { phoneChanged: true } : null),
    },
    reason: null,
    req,
  });

  return sendJson(res, 200, { ok: true, data: true });
}
