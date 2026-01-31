import type { NextApiRequest, NextApiResponse } from "next";

import crypto from "crypto";

import { getClientIp } from "@/server/ip";

export type ApiLogCtx = {
  requestId: string;
  startNs: bigint;
  method: string;
  path: string;
  ip: string;
};

export function startApiLog(req: NextApiRequest, res: NextApiResponse): ApiLogCtx {
  const incoming = req.headers["x-request-id"];
  const requestId =
    (Array.isArray(incoming) ? incoming[0] : incoming)?.toString().trim() || crypto.randomUUID();

  res.setHeader("X-Request-Id", requestId);

  return {
    requestId,
    startNs: process.hrtime.bigint(),
    method: String(req.method ?? ""),
    path: String(req.url ?? ""),
    ip: getClientIp(req),
  };
}

export function logApi(ctx: ApiLogCtx, fields: Record<string, unknown>): void {
  const nowNs = process.hrtime.bigint();
  const durationMs = Number(nowNs - ctx.startNs) / 1_000_000;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      requestId: ctx.requestId,
      method: ctx.method,
      path: ctx.path,
      ip: ctx.ip,
      durationMs: Math.round(durationMs),
      ...fields,
    }),
  );
}

