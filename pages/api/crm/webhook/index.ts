// pages/api/crm/webhook/index.ts
import type { NextApiRequest, NextApiResponse } from "next";

export const config = { api: { bodyParser: true } };

function cors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  // TEMP: echo method/body so we can prove this route is hit
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "pages/api/crm/webhook/index.ts",
      method: "GET",
      now: new Date().toISOString(),
    });
  }

  // Accept POST for now without secret check (we’ll add it back after prove-up)
  if (req.method === "POST") {
    const body = (req.body ?? {}) as any;
    const text =
      body?.current?.note?.content ??
      body?.current?.long_description ??
      body?.current?.title ??
      "";

    return res.status(200).json({
      ok: true,
      route: "pages/api/crm/webhook/index.ts",
      method: "POST",
      preview: String(text).slice(0, 120),
    });
  }

  res.setHeader("Allow", "GET,POST,OPTIONS");
  return res.status(405).json({ ok: false, error: "Method Not Allowed", method: req.method });
}
