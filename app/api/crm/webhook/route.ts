// app/api/crm/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Respond to CORS/preflight and avoid 405 on OPTIONS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    },
  });
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRM_WEBHOOK_SECRET || secret !== process.env.CRM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const text =
    body?.current?.note?.content ??
    body?.current?.long_description ??
    body?.current?.title ??
    "";

  return NextResponse.json({ ok: true, received: !!text, preview: String(text).slice(0, 120) });
}
