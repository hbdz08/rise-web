import type { NextApiRequest, NextApiResponse } from "next";

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

  const code = randomCode(5);
  const svg = svgCaptcha(code);

  // MVP: use HttpOnly cookie (Redis later).
  res.setHeader(
    "Set-Cookie",
    `rise_captcha=${code}; Max-Age=120; Path=/; HttpOnly; SameSite=Lax`,
  );

  return res.status(200).json({ ok: true, data: { svg } });
}

