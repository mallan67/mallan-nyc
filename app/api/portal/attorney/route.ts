// /api/portal/attorney — the CLIENT's own attorney information.
// Any deal-side portal role: buyer, renter, seller, landlord. Strictly
// self-scoped — reads and writes only the authenticated lead's own row.
// GET: Read attorney info. PUT: Update attorney info.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePortalRole, requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";

export async function GET(req: NextRequest) {
  // ALL FOUR DEAL-SIDE ROLES, not just the sale side.
  //
  // This gate read ("buyer", "seller"), so a RENTER and a LANDLORD got 403 on
  // their OWN record. It was not protecting anything: the query below is keyed
  // on `auth.userId` and returns nothing that belongs to anyone else, so the
  // gate was withholding a client's data from that client. A renter can inquire
  // on listings (the portal listings route is gated "buyer","renter") and a
  // landlord signs leases and retains counsel exactly as a seller does.
  //
  // Widened, not removed — a lead carrying any other portal_role is still 403.
  // Locked by tests/runtime/portal-role-symmetry-self-scoped.test.ts, which also
  // asserts the self-scoping that makes the widening safe.
  const auth = await requirePortalRole(req, "buyer", "renter", "seller", "landlord");
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
  const auth = await requirePortalRole(req, "buyer", "renter", "seller", "landlord");
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
