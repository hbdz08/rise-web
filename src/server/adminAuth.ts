import type { NextApiRequest } from "next";

import type { AdminRole } from "@/lib/roles";
import { parseAdminSessionCookieValue } from "@/server/session";

export type AdminContext = {
  userId: number;
  username: string;
  role: AdminRole;
};

export function getAdminContext(req: NextApiRequest): AdminContext | null {
  const raw = String(req.cookies["rise_admin_session"] ?? "");
  if (!raw) return null;
  const session = parseAdminSessionCookieValue(raw);
  if (!session) return null;
  return {
    userId: session.userId,
    username: session.username,
    role: session.role,
  };
}

export function requireAdmin(req: NextApiRequest): AdminContext {
  const ctx = getAdminContext(req);
  if (!ctx) throw new Error("UNAUTHORIZED");
  return ctx;
}

export function requireAdminRole(req: NextApiRequest, role: AdminRole): AdminContext {
  const ctx = requireAdmin(req);
  if (ctx.role !== role) throw new Error("FORBIDDEN");
  return ctx;
}
