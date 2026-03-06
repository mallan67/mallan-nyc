// POST /api/admin/reset-lead — reset a lead's profile for testing
// TEMPORARY: Remove after testing OAuth flows
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // Only broker can reset leads
  const session = await requireAuth(req);
  if (session instanceof NextResponse) return session;
  if (session.userType !== "agent" || session.role !== "BROKER") {
    return NextResponse.json({ error: "Broker only" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { email } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  await prisma.lead.update({
    where: { email },
    data: { phone: "", portal_role: null, roles: [] },
  });

  return NextResponse.json({
    success: true,
    message: `Reset ${email} — phone, portal_role, roles cleared`,
  });
}
