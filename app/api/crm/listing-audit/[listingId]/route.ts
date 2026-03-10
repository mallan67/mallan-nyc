// /api/crm/listing-audit/[listingId] — GET: latest audit for a listing
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { listingId } = await params;

  const audit = await prisma.listingAudit.findFirst({
    where: { listing_id: listingId },
    orderBy: { created_at: "desc" },
  });

  if (!audit) return NextResponse.json({ ok: false, error: "No audit found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    item: { ...audit, id: audit.id.toString(), agent_id: audit.agent_id?.toString() ?? null },
  });
}
