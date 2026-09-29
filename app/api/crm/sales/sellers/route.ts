// /api/crm/sales/sellers — GET: all sellers, POST: create, PATCH: update
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    roles: { has: "seller" },
  };

  // Agent sees only own clients; broker sees all
  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const sellers = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      showings: { select: { id: true } },
      activity_logs: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { title: true, created_at: true },
      },
    },
  });

  // Enrich with listing data
  const enriched = await Promise.all(
    sellers.map(async (s) => {
      let listing_status = "No Listing";
      let list_price: number | null = null;
      let dom = 0;
      const showings_count = s.showings.length;

      if (s.active_sale_listing_id) {
        const listing = await prisma.listing.findFirst({
          where: { listing_id: s.active_sale_listing_id },
          select: { status: true, list_price: true, days_on_market: true },
        });
        if (listing) {
          // A Mallan-authored listing that is not on the market yet has NO
          // market status. That is different from having no listing at all,
          // and the roster must not collapse the two — the panel offers
          // "Create Listing" on the no-listing sentinel.
          listing_status = listing.status ?? "Not On Market";
          list_price = listing.list_price ? Number(listing.list_price) : null;
          dom = listing.days_on_market || 0;
        }
      }

      return {
        ...s,
        id: String(s.id),
        agent_id: s.agent_id ? String(s.agent_id) : null,
        listing_status,
        list_price,
        dom,
        showings_count,
        name: `${s.first_name} ${s.last_name}`.trim(),
      };
    })
  );

  return NextResponse.json({ sellers: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { first_name, last_name, email, phone, property_address, unit_number, entity_name, entity_type, attorney_name, attorney_email, attorney_phone, attorney_firm, notes } = body;

  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "first_name, last_name, email required" }, { status: 400 });
  }

  const seller = await prisma.lead.create({
    data: {
      first_name,
      last_name,
      email,
      phone: phone || "",
      roles: ["seller"],
      status: "new",
      pipeline_stage: "new",
      agent_id: auth.userId,
      source: "manual",
      property_address,
      unit_number,
      entity_name,
      entity_type,
      attorney_name,
      attorney_email,
      attorney_phone,
      attorney_firm,
      notes,
    },
  });

  await logAuditEvent("create_seller", "lead", String(seller.id), auth, { first_name, last_name });

  return NextResponse.json({
    seller: { ...seller, id: String(seller.id), name: `${seller.first_name} ${seller.last_name}`.trim() },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Verify ownership
  const existing = await prisma.lead.findFirst({
    where: { id: BigInt(id), ...(auth.role !== "BROKER" ? { agent_id: auth.userId } : {}) },
  });

  if (!existing) {
    return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  }

  // Sanitize updates — only allow known fields
  const allowed = [
    "first_name", "last_name", "email", "phone", "status", "pipeline_stage",
    "property_address", "unit_number", "home_address", "entity_name", "entity_type",
    "attorney_name", "attorney_email", "attorney_phone", "attorney_firm",
    "notes", "next_follow_up", "last_contacted_at",
    "secondary_first_name", "secondary_last_name", "secondary_email", "secondary_phone", "secondary_relationship",
    "legal_ownership_name", "authorized_signatories",
    "home_prep_checklist", "building_mgmt_requirements", "disclosures", "documents_collected", "marketing_strategy",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) data[key] = updates[key];
  }

  const updated = await prisma.lead.update({
    where: { id: BigInt(id) },
    data,
  });

  await logAuditEvent("update_seller", "lead", String(updated.id), auth, { fields: Object.keys(data) });

  return NextResponse.json({
    seller: { ...updated, id: String(updated.id), name: `${updated.first_name} ${updated.last_name}`.trim() },
  });
}
