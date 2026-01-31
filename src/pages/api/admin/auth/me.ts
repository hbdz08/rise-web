import type { NextApiRequest, NextApiResponse } from "next";

import { getAdminContext } from "@/server/adminAuth";
import { sendError, sendJson } from "@/server/http";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return sendError(res, 405, "Method not allowed");
  const ctx = getAdminContext(req);
  if (!ctx) return sendError(res, 401, "UNAUTHORIZED");
  return sendJson(res, 200, { ok: true, data: { userId: ctx.userId, username: ctx.username, role: ctx.role } });
}
