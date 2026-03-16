// POST /api/portal/listings/request
// Client sends a listing link/address to their agent to add/review.
// This creates a "listing_request" action that the agent sees in CRM.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePortalRole, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requirePortalRole(req, "buyer", "renter");
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url as string)?.trim();
  const address = (body.address as string)?.trim();
  const notes = (body.notes as string)?.trim() ?? "";

  if (!url && !address) {
    return NextResponse.json(
      { error: "Provide either a listing URL or address" },
      { status: 400 }
    );
  }

  // Verify client has an agent
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { agent_id: true, first_name: true, last_name: true },
  });

  if (!lead?.agent_id) {
    return NextResponse.json(
      { error: "No agent assigned. Please contact Mallan Real Estate." },
      { status: 400 }
    );
  }

  // Log as an audit event (the agent sees these in CRM activity feed)
  await logAuditEvent(
    "listing_request",
    "lead",
    auth.userId.toString(),
    auth,
    {
      url: url || null,
      address: address || null,
      notes,
      agent_id: lead.agent_id.toString(),
      client_name: `${lead.first_name} ${lead.last_name}`,
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    success: true,
    message: "Your request has been sent to your agent.",
  });
}
