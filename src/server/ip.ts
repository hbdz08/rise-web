import type { NextApiRequest } from "next";

export function getClientIp(req: NextApiRequest): string {
  const xf = req.headers["x-forwarded-for"];
  const v = Array.isArray(xf) ? xf[0] : xf;
  const raw = (v ? String(v).split(",")[0] : req.socket.remoteAddress) ?? "";
  const ip = raw.trim();
  // Normalize IPv6-mapped IPv4 addresses: ::ffff:127.0.0.1
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

