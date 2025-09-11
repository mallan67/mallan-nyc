import { NextRequest, NextResponse } from "next/server";
import { evaluateText } from "@/lib/compliance";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const text =
    payload?.current?.note?.content ||
    payload?.current?.title ||
    payload?.current?.long_description ||
    "";

  const compliance = evaluateText(String(text || ""));
  console.log("CRM webhook:", payload?.meta?.action, compliance);

  return NextResponse.json({ ok: true, compliance });
}
