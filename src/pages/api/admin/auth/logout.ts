import type { NextApiRequest, NextApiResponse } from "next";

import { sendJson } from "@/server/http";
import { buildSessionCookieHeader } from "@/server/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  res.setHeader("Set-Cookie", buildSessionCookieHeader(null));
  return sendJson(res, 200, { ok: true, data: true });
}

