// pages/api/crm/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";

export const config = { api: { bodyParser: true } };

// CORS / preflight
function cors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    cors(res);
    res.setHeader("Allow", "POST,OPTIONS");
    return res.status(405).json({ ok: false, error: "Method Not Allowed", method: req.method });
  }

  const secret = String(req.query.secret || "");
  if (!process.env.CRM_WEBHOOK_SECRET || secret !== process.env.CRM_WEBHOOK_SECRET) {
    cors(res);
    return res.status(401).json({ ok: false, error: "bad secret" });
  }

  const body = (req.body ?? {}) as any;
  const text =
    body?.current?.note?.content ??
    body?.current?.long_description ??
    body?.current?.title ??
    "";

  cors(res);
  return res.status(200).json({ ok: true, received: !!text, preview: String(text).slice(0, 120) });
}
