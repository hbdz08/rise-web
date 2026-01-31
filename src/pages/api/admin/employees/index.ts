import type { NextApiRequest, NextApiResponse } from "next";

import type { Buffer as NodeBuffer } from "node:buffer";

import { requireAdmin } from "@/server/adminAuth";
import { insertAuditLog } from "@/server/audit";
import { getPgPool } from "@/server/db";
import { sendError, sendJson } from "@/server/http";
import { decryptPiiFromBytes, encryptPiiToBytes, hmacSha256Hex, normalizePhone } from "@/server/pii";
import { isValidChinaIdNo, isValidChinaPhone, maskPhone } from "@/server/validators";

type EmployeeListItem = {
  id: number;
  name: string;
  dept: string;
  jobTitle: string | null;
  status: "active" | "inactive";
  idLast6: string;
  phoneMasked: string;
  createdAt: string;
  updatedAt: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pool = getPgPool();

  let actor;
  try {
    actor = requireAdmin(req);
  } catch {
    return sendError(res, 401, "UNAUTHORIZED");
  }

  if (req.method === "GET") {
    const { rows } = await pool.query<{
      id: number;
      name: string;
      dept: string;
      job_title: string | null;
      status: "active" | "inactive";
      id_last6: string;
      phone_enc: NodeBuffer;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, name, dept, job_title, status, id_last6, phone_enc, created_at, updated_at
       FROM employees
       ORDER BY id DESC
       LIMIT 200`,
    );

    const data: EmployeeListItem[] = rows.map((r) => {
      let phonePlain = "";
      try {
        phonePlain = decryptPiiFromBytes(r.phone_enc);
      } catch {
        phonePlain = "";
      }

      return {
        id: r.id,
        name: r.name,
        dept: r.dept,
        jobTitle: r.job_title,
        status: r.status,
        idLast6: r.id_last6,
        phoneMasked: phonePlain ? maskPhone(phonePlain) : "***********",
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      };
    });

    return sendJson(res, 200, { ok: true, data });
  }

  if (req.method === "POST") {
    const name = String(req.body?.name ?? "").trim();
    const dept = String(req.body?.dept ?? "").trim();
    const jobTitle = req.body?.jobTitle != null ? String(req.body.jobTitle).trim() : null;
    const idNo = String(req.body?.idNo ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();

    if (!name) return sendError(res, 400, "姓名不能为空");
    if (!dept) return sendError(res, 400, "部门不能为空");
    if (!isValidChinaIdNo(idNo)) return sendError(res, 400, "身份证号格式不正确");
    if (!isValidChinaPhone(phone)) return sendError(res, 400, "手机号格式不正确");

    const idNoHash = hmacSha256Hex(idNo.toUpperCase());
    const phoneNorm = normalizePhone(phone);
    const phoneHash = hmacSha256Hex(phoneNorm);

    const idLast6 = idNo.slice(-6);
    const idNoEnc = encryptPiiToBytes(idNo);
    const phoneEnc = encryptPiiToBytes(phoneNorm);

    try {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO employees (name, dept, job_title, status, id_no_enc, id_no_hash, id_last6, phone_enc, phone_norm, phone_hash)
         VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [name, dept, jobTitle, idNoEnc, idNoHash, idLast6, phoneEnc, phoneNorm, phoneHash],
      );

      await insertAuditLog(pool, {
        actor,
        action: "EMPLOYEE_CREATE",
        entity: "employees",
        entityId: String(rows[0]?.id ?? ""),
        before: null,
        after: { name, dept, jobTitle, idLast6 },
        reason: null,
        req,
      });

      return sendJson(res, 200, { ok: true, data: { id: rows[0]?.id } });
    } catch {
      return sendError(res, 400, "创建失败（可能身份证号已存在）");
    }
  }

  return sendError(res, 405, "Method not allowed");
}
