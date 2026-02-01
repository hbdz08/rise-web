import type { NextApiRequest, NextApiResponse } from "next";

import { getPgPool } from "@/server/db";

type NoticePayload =
  | {
      ok: true;
      data: {
        campaigns: Array<{
          id: number;
          name: string;
          startDate: string | null;
          endDate: string | null;
          effectiveDate: string;
          publishedAt: string | null;
        }>;
      };
    }
  | { ok: false; message: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<NoticePayload>) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });

  res.setHeader("Cache-Control", "no-store");

  const pool = getPgPool();

  try {
    const { rows } = await pool.query<{
      id: number;
      name: string;
      start_date: string | null;
      end_date: string | null;
      effective_date: string;
      published_at: Date | null;
    }>(
      `SELECT
         id,
         name,
         start_date::text AS start_date,
         end_date::text AS end_date,
         effective_date::text AS effective_date,
         published_at
       FROM raise_campaigns
       WHERE status='published'
       ORDER BY published_at DESC NULLS LAST, id DESC
       LIMIT 5`,
    );

    return res.status(200).json({
      ok: true,
      data: {
        campaigns: rows.map((r) => ({
          id: r.id,
          name: r.name,
          startDate: r.start_date,
          endDate: r.end_date,
          effectiveDate: r.effective_date,
          publishedAt: r.published_at ? r.published_at.toISOString() : null,
        })),
      },
    });
  } catch {
    return res.status(200).json({ ok: false, message: "通知加载失败" });
  }
}
