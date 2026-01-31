import type { NextApiResponse } from "next";

export function sendJson<T>(res: NextApiResponse, status: number, body: T): void {
  res.status(status).json(body);
}

export function sendError(res: NextApiResponse, status: number, message: string): void {
  sendJson(res, status, { ok: false, message });
}

