import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://api:8000";
  try {
    const r = await fetch(`${backendUrl}/health`);
    const text = await r.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (r.ok) {
      res.status(200).json({ proxy: "ok", backend: parsed });
    } else {
      res.status(502).json({ proxy: "failed", backendStatus: r.status, backendBody: parsed });
    }
  } catch (e: any) {
    res.status(502).json({ proxy: "down", error: String(e?.message ?? e) });
  }
}
