// /api/portal/attorney — Seller's attorney information
// GET: Read attorney info. PUT: Update attorney info.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePortalRole, requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";

export async function GET(req: NextRequest) {
  const auth = await requirePortalRole(req, "buyer", "seller");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: {
      attorney_name: true,
      attorney_email: true,
      attorney_phone: true,
      attorney_firm: true,
    },
  });

  return NextResponse.json({
    attorney: lead ? {
      name: lead.attorney_name,
      email: lead.attorney_email,
      phone: lead.attorney_phone,
      firm: lead.attorney_firm,
    } : null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;

  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requirePortalRole(req, "buyer", "seller");
  if (isAuthError(auth)) return auth;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { name, email, phone, firm } = body;

  await prisma.lead.update({
    where: { id: auth.userId },
    data: {
      attorney_name: name || null,
      attorney_email: email || null,
      attorney_phone: phone || null,
      attorney_firm: firm || null,
    },
  });

  await logAuditEvent(
    "attorney_updated",
    "lead",
    auth.userId.toString(),
    auth,
    { attorney_name: name },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ success: true });
}
