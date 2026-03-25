// /api/crm/inquiries — GET: list inquiries (leads created from listing inquiries)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const listingId = url.searchParams.get("listing_id");
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

  // Inquiries are leads that have an inquiry source linked to a listing
  // We find them via audit events or by matching the lead's notes/source
  const where: Record<string, unknown> = {
    action: { in: ["inquiry_received", "create"] },
    entity_type: "lead",
  };

  // If listing_id provided, search audit events that reference that listing
  if (listingId) {
    where.OR = [
      { changes: { path: ["listingId"], equals: listingId } },
      { changes: { path: ["listing_id"], equals: listingId } },
    ];
  }

  // Get audit events for inquiries
  const auditEvents = await prisma.auditEvent.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
  });

  // Get associated lead IDs from audit events
  const leadIds = auditEvents
    .map((e) => e.entity_id)
    .filter((id): id is string => id !== null)
    .map((id) => {
      try { return BigInt(id); } catch { return null; }
    })
    .filter((id): id is bigint => id !== null);

  // Fetch actual lead data for these IDs
  const leads = leadIds.length > 0
    ? await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          source: true,
          notes: true,
          created_at: true,
          status: true,
          agent_id: true,
        },
      })
    : [];

  // Build a lookup map
  const leadMap = new Map(leads.map((l) => [l.id.toString(), l]));

  const inquiries = auditEvents.map((e) => {
    const lead = e.entity_id ? leadMap.get(e.entity_id) : null;
    const changes = (e.changes as Record<string, unknown>) || {};
    return {
      id: e.id.toString(),
      lead_id: e.entity_id,
      name: lead
        ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
        : (changes.name as string) || "Unknown",
      email: lead?.email || (changes.email as string) || null,
      phone: lead?.phone || (changes.phone as string) || null,
      message: (changes.message as string) || null,
      listing_id: (changes.listingId as string) || (changes.listing_id as string) || listingId,
      source: lead?.source || (changes.source as string) || "website",
      status: lead?.status || "new",
      created_at: e.created_at.toISOString(),
      converted: lead?.agent_id != null,
    };
  });

  return NextResponse.json({ inquiries, total: inquiries.length });
}
