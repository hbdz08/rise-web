import type { NextApiRequest, NextApiResponse } from "next";

import crypto from "crypto";

import { getRedisOptional } from "@/server/redis";

function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

function svgCaptcha(code: string): string {
  const w = 120;
  const h = 40;
  const bg = "#ffffff";
  const fg = "#1f2329";
  const noise = Array.from({ length: 10 })
    .map(() => {
      const x1 = Math.floor(Math.random() * w);
      const y1 = Math.floor(Math.random() * h);
      const x2 = Math.floor(Math.random() * w);
      const y2 = Math.floor(Math.random() * h);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d0d7de" stroke-width="1" />`;
    })
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" rx="6" ry="6" fill="${bg}" />
  ${noise}
  <text x="60" y="26" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" fill="${fg}" letter-spacing="2">
    ${code}
  </text>
</svg>`.trim();
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });

  // Next.js API route supports returning a Promise; keep it simple here.
  return (async () => {
    const code = randomCode(5);
    const svg = svgCaptcha(code);

    const secure = process.env.NODE_ENV === "production";
    const secureFlag = secure ? "; Secure" : "";

    const redis = await getRedisOptional();
    if (redis) {
      try {
        const id = crypto.randomUUID();
        await redis.set(`captcha:${id}`, code, { EX: 120 });
        res.setHeader("Set-Cookie", `rise_captcha_id=${id}; Max-Age=120; Path=/; HttpOnly; SameSite=Lax${secureFlag}`);
        return res.status(200).json({ ok: true, data: { svg } });
      } catch {
        // fall through to cookie-only
      }
    }

    // Fallback: cookie-only captcha if Redis is not configured/available.
    res.setHeader("Set-Cookie", `rise_captcha=${code}; Max-Age=120; Path=/; HttpOnly; SameSite=Lax${secureFlag}`);
    return res.status(200).json({ ok: true, data: { svg } });
  })();
}
