import { NextRequest, NextResponse } from "next/server";
import sg from "@sendgrid/mail";
import { evaluateText } from "@/lib/compliance";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { to, subject, templateId, dynamicTemplateData } = body || {};

  if (!process.env.SENDGRID_API_KEY) {
    return NextResponse.json({ ok: false, error: "SENDGRID_API_KEY missing" }, { status: 500 });
  }
  if (!to || !templateId) {
    return NextResponse.json({ ok: false, error: "to and templateId required" }, { status: 400 });
  }

  // Compliance scan
  const mainCopy = `${subject ?? ""} ${JSON.stringify(dynamicTemplateData ?? {})}`;
  const compliance = evaluateText(mainCopy);
  if (!compliance.ok) {
    return NextResponse.json({ ok: false, compliance, error: "Blocked by compliance rules" }, { status: 422 });
  }

  sg.setApiKey(process.env.SENDGRID_API_KEY!);
  await sg.send({
    to,
    from: "you@mallan.nyc", // change to your verified sender later
    subject: subject || "Listing update",
    templateId,
    dynamicTemplateData,
  });

  return NextResponse.json({ ok: true });
}
