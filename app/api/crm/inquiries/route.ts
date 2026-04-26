// /api/crm/inquiries — GET: list inquiries
//
// Reads from the real `Inquiry` model (added in Workstream C1 of master
// refactor — memory/REFACTOR-2026-04-25.md). For backward compatibility
// during the transition, also surfaces historical inquiries that were
// captured only as AuditEvents before the model existed. Once the
// migration backfill ships, the AuditEvent fallback can be removed.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

interface InquiryRow {
  id: string;
  lead_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  listing_id: string | null;
  source: string;
  status: string;
  created_at: string;
  converted: boolean;
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const listingId = url.searchParams.get("listing_id");
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

  // Primary path: query the Inquiry model directly.
  // Wrapped in try/catch so a missing-table error (e.g. migration not yet
  // applied to a particular environment) falls through to the legacy path.
  let modelRows: InquiryRow[] = [];
  try {
    const where: Record<string, unknown> = {};
    if (listingId) where.listing_id = listingId;

    const inquiries = await prisma.inquiry.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
            source: true,
            status: true,
            agent_id: true,
          },
        },
      },
    });

    modelRows = inquiries.map((i) => {
      const lead = i.lead;
      const direct = {
        first: i.first_name || "",
        last: i.last_name || "",
        email: i.email,
        phone: i.phone,
      };
      const fullName = lead
        ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
        : `${direct.first} ${direct.last}`.trim() || "Unknown";
      return {
        id: i.id.toString(),
        lead_id: i.lead_id ? i.lead_id.toString() : null,
        name: fullName,
        email: lead?.email ?? direct.email ?? null,
        phone: lead?.phone ?? direct.phone ?? null,
        message: i.message,
        listing_id: i.listing_id,
        source: i.source,
        status: lead?.status ?? "new",
        created_at: i.created_at.toISOString(),
        converted: lead?.agent_id != null,
      };
    });
  } catch (e) {
    // Inquiry model unavailable in this environment (migration pending).
    // Fall through to the AuditEvent-based legacy path so the route still
    // returns a usable response. Logged but not fatal.
    console.warn("[CRM:Inquiries] Inquiry model query failed; falling back to AuditEvent path:", e);
  }

  // Legacy path: AuditEvent-derived inquiries (pre-Inquiry-model).
  // Preserved during the transition window so historical data remains
  // visible. Once the migration backfill ships and ≥30 days of history
  // exist in the Inquiry table, this block can be removed.
  const legacyWhere: Record<string, unknown> = {
    action: { in: ["inquiry_received", "create"] },
    entity_type: "lead",
  };
  if (listingId) {
    legacyWhere.OR = [
      { changes: { path: ["listingId"], equals: listingId } },
      { changes: { path: ["listing_id"], equals: listingId } },
    ];
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: legacyWhere,
    orderBy: { created_at: "desc" },
    take: limit,
  });

  const leadIds = auditEvents
    .map((e) => e.entity_id)
    .filter((id): id is string => id !== null)
    .map((id) => {
      try {
        return BigInt(id);
      } catch {
        return null;
      }
    })
    .filter((id): id is bigint => id !== null);

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

  const leadMap = new Map(leads.map((l) => [l.id.toString(), l]));

  const legacyRows: InquiryRow[] = auditEvents.map((e) => {
    const lead = e.entity_id ? leadMap.get(e.entity_id) : null;
    const changes = (e.changes as Record<string, unknown>) || {};
    return {
      id: "audit-" + e.id.toString(),
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

  // Merge results — Inquiry model rows first (newer source), then AuditEvent
  // legacy rows. De-duplicate by lead_id+listing_id+source within a 1h window
  // so an inquiry written to BOTH stores during the transition appears once.
  const seen = new Set<string>();
  const dedupKey = (r: InquiryRow): string => {
    const ts = Math.floor(new Date(r.created_at).getTime() / (60 * 60 * 1000));
    return [r.lead_id ?? "", r.listing_id ?? "", r.source ?? "", ts].join("|");
  };

  const merged: InquiryRow[] = [];
  for (const r of [...modelRows, ...legacyRows]) {
    const k = dedupKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(r);
  }

  // Sort by created_at desc and re-cap at limit.
  merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const inquiries = merged.slice(0, limit);

  return NextResponse.json({
    inquiries,
    total: inquiries.length,
    sources: {
      model_count: modelRows.length,
      legacy_count: legacyRows.length,
    },
  });
}
