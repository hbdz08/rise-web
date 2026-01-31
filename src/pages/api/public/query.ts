import type { NextApiRequest, NextApiResponse } from "next";

import { getPgPool } from "@/server/db";
import { hmacSha256Hex, normalizePhone } from "@/server/pii";
import { isValidChinaIdNo, isValidChinaPhone } from "@/server/validators";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

  const idNo = String(req.body?.idNo ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const captcha = String(req.body?.captcha ?? "").trim();

  const cookieCode = String(req.cookies["rise_captcha"] ?? "");
  res.setHeader("Set-Cookie", "rise_captcha=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");

  if (!cookieCode || !captcha || cookieCode !== captcha) {
    return res.status(200).json({ ok: false, message: "验证失败，请重试。" });
  }

  if (!isValidChinaIdNo(idNo) || !isValidChinaPhone(phone)) {
    return res.status(200).json({ ok: false, message: "信息格式不正确，请检查后重试。" });
  }

  const pool = getPgPool();
  const idNoHash = hmacSha256Hex(idNo.toUpperCase());
  const phoneNorm = normalizePhone(phone);
  const phoneHash = hmacSha256Hex(phoneNorm);

  // Verify employee
  const { rows: empRows } = await pool.query<{
    id: number;
    name: string;
    dept: string;
    phone_hash: string | null;
  }>(`SELECT id, name, dept, phone_hash FROM employees WHERE id_no_hash=$1 AND status='active' LIMIT 1`, [idNoHash]);

  const emp = empRows[0];
  if (!emp || !emp.phone_hash || emp.phone_hash !== phoneHash) {
    // Avoid leaking whether ID exists.
    return res.status(200).json({ ok: false, message: "验证失败，请重试。" });
  }

  const { rows } = await pool.query<{
    campaign_name: string;
    effective_date: string;
    raise_amount: string;
    performance_grade: "S" | "A" | "B" | "C";
    remark: string | null;
  }>(
    `SELECT
       c.name AS campaign_name,
       c.effective_date::text AS effective_date,
       ri.raise_amount::text AS raise_amount,
       ri.performance_grade,
       ri.remark
     FROM raise_items ri
     JOIN raise_campaigns c ON c.id = ri.campaign_id
     WHERE ri.employee_id=$1 AND c.status='published'
     ORDER BY c.effective_date DESC, c.id DESC
     LIMIT 50`,
    [emp.id],
  );

  return res.status(200).json({
    ok: true,
    data: {
      name: emp.name,
      dept: emp.dept,
      records: rows.map((r) => ({
        campaignName: r.campaign_name,
        effectiveDate: r.effective_date,
        raiseAmount: r.raise_amount,
        performanceGrade: r.performance_grade,
        remark: r.remark,
      })),
    },
  });
}
