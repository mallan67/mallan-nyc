// /api/crm/past-deals
// GET: List past deals (broker sees all, agent sees own). POST: Create. Broker-only for now.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agent_id");
  const dealType = url.searchParams.get("deal_type"); // "sale" | "rent"

  const where: Record<string, unknown> = {};
  if (agentId) where.agent_id = BigInt(agentId);
  if (dealType) where.deal_type = dealType;

  const deals = await prisma.pastDeal.findMany({
    where,
    orderBy: [{ close_date: "desc" }, { created_at: "desc" }],
    include: { agent: { select: { full_name: true, public_slug: true } } },
  });

  const serialized = deals.map((d) => ({
    id: d.id.toString(),
    agent_id: d.agent_id.toString(),
    agent_name: d.agent?.full_name || null,
    agent_slug: d.agent?.public_slug || null,
    street: d.street,
    unit: d.unit,
    city: d.city,
    postal_code: d.postal_code,
    neighborhood: d.neighborhood,
    deal_type: d.deal_type,
    property_type: d.property_type,
    close_price: d.close_price?.toString() ?? null,
    close_date: d.close_date?.toISOString().split("T")[0] ?? null,
    beds: d.beds,
    baths_full: d.baths_full,
    baths_half: d.baths_half,
    sqft: d.sqft,
    photo_url: d.photo_url,
    listing_courtesy: d.listing_courtesy,
    source: d.source,
    trestle_listing_id: d.trestle_listing_id,
    sort_order: d.sort_order,
    created_at: d.created_at.toISOString(),
    updated_at: d.updated_at.toISOString(),
  }));

  return NextResponse.json({ deals: serialized, total: serialized.length });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentId = body.agent_id as string | undefined;
  const street = body.street as string | undefined;
  const dealType = body.deal_type as string | undefined;

  if (!agentId || !street || !dealType) {
    return NextResponse.json(
      { error: "agent_id, street, and deal_type are required" },
      { status: 400 }
    );
  }

  if (!["sale", "rent"].includes(dealType)) {
    return NextResponse.json(
      { error: "deal_type must be 'sale' or 'rent'" },
      { status: 400 }
    );
  }

  const deal = await prisma.pastDeal.create({
    data: {
      agent_id: BigInt(agentId),
      street,
      unit: (body.unit as string) || null,
      city: (body.city as string) || "New York",
      postal_code: (body.postal_code as string) || null,
      neighborhood: (body.neighborhood as string) || null,
      deal_type: dealType,
      property_type: (body.property_type as string) || null,
      close_price: body.close_price != null ? Number(body.close_price) : null,
      close_date: body.close_date ? new Date(body.close_date as string) : null,
      beds: body.beds != null ? Number(body.beds) : null,
      baths_full: body.baths_full != null ? Number(body.baths_full) : null,
      baths_half: body.baths_half != null ? Number(body.baths_half) : null,
      sqft: body.sqft != null ? Number(body.sqft) : null,
      photo_url: (body.photo_url as string) || null,
      listing_courtesy: (body.listing_courtesy as string) || null,
      source: (body.source as string) || "manual",
      trestle_listing_id: (body.trestle_listing_id as string) || null,
      trestle_listing_key: (body.trestle_listing_key as string) || null,
      sort_order: body.sort_order != null ? Number(body.sort_order) : null,
    },
  });

  await logAuditEvent(
    "create",
    "past_deal",
    deal.id.toString(),
    auth,
    { street, deal_type: dealType },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ id: deal.id.toString() }, { status: 201 });
}
