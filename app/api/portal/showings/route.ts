// /api/portal/showings
// GET: Client's showings. POST: Client requests a showing. Lead users only.
// Uses centralized DTO for REBNY-compliant address suppression.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { sanitizeForPublic } from "@/lib/compliance/dto";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  // Future showings + last 30 days completed
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Determine role to fix query: sellers see showings ON their listings,
  // buyers see showings they requested
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { portal_role: true, agent_id: true },
  });

  const isSellerRole = lead?.portal_role === "seller" || lead?.portal_role === "landlord";

  // Sellers: find all showings on listings owned by their agent
  // Buyers: find showings where they are the lead (original behavior)
  let showingWhere;
  if (isSellerRole && lead?.agent_id) {
    const agentListings = await prisma.listing.findMany({
      where: { agent_id: lead.agent_id },
      select: { id: true },
    });
    const listingIds = agentListings.map((l) => l.id);
    showingWhere = {
      listing_id: { in: listingIds },
      OR: [
        { date: { gte: new Date() } },
        { status: "completed", date: { gte: thirtyDaysAgo } },
      ],
    };
  } else {
    showingWhere = {
      lead_id: auth.userId,
      OR: [
        { date: { gte: new Date() } },
        { status: "completed", date: { gte: thirtyDaysAgo } },
      ],
    };
  }

  const showings = await prisma.showing.findMany({
    where: showingWhere,
    include: {
      listing: {
        select: {
          id: true,
          listing_id: true,
          address: true,
          list_price: true,
          listing_type: true,
          internet_address_display_yn: true,
        },
      },
      ...(isSellerRole ? {
        lead: { select: { first_name: true, last_name: true } },
        agent: { select: { full_name: true } },
        feedback: { select: { rating: true, interest_level: true, notes: true } },
      } : {}),
    },
    orderBy: { date: "asc" },
  });

  const serialized = showings.map((s: any) => {
    // Centralized address suppression via DTO (REBNY RLS compliance)
    const sanitizedListing = sanitizeForPublic({
      address: s.listing.address,
      internet_address_display_yn: s.listing.internet_address_display_yn,
    });
    const base = {
      id: s.id.toString(),
      listing_id: s.listing_id.toString(),
      date: s.date,
      time: s.time,
      type: s.type,
      status: s.status,
      notes: s.notes,
      listing: {
        id: s.listing.id.toString(),
        listing_id: s.listing.listing_id,
        address: sanitizedListing.address,
        list_price: s.listing.list_price.toString(),
        listing_type: s.listing.listing_type,
      },
    };

    // For sellers, include showing agent, buyer name, and feedback
    if (isSellerRole) {
      return {
        ...base,
        agent_name: s.agent?.full_name || null,
        buyer_name: s.lead ? `${s.lead.first_name || ''} ${s.lead.last_name || ''}`.trim() : null,
        feedback: s.feedback ? {
          rating: s.feedback.rating,
          interest_level: s.feedback.interest_level,
          notes: s.feedback.notes,
        } : null,
      };
    }
    return base;
  });

  return NextResponse.json({ showings: serialized });
}

/**
 * POST /api/portal/showings
 * Client requests a showing. Agent is resolved from lead.agent_id.
 */
export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const listingIdStr = body.listing_id as string;
  const dateStr = body.date as string;

  if (!listingIdStr || !dateStr) {
    return NextResponse.json(
      { error: "listing_id and date are required" },
      { status: 400 }
    );
  }

  const showingDate = new Date(dateStr);
  if (showingDate <= new Date()) {
    return NextResponse.json(
      { error: "Showing date must be in the future" },
      { status: 400 }
    );
  }

  // Verify listing exists and passes distribution gates
  const listingId = safeBigInt(listingIdStr);
  if (!listingId) {
    return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
  }
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Distribution gate checks — cannot schedule showing on restricted listings
  if (listing.owner_opt_out) {
    return NextResponse.json({ error: "Listing not available" }, { status: 403 });
  }
  if (listing.participant_only) {
    return NextResponse.json({ error: "Listing not available" }, { status: 403 });
  }
  if (listing.internet_entire_listing_display_yn === false) {
    return NextResponse.json({ error: "Listing not available" }, { status: 403 });
  }

  // Coming Soon block — no showings allowed (UCBA D3)
  if (listing.status === "ComingSoon") {
    return NextResponse.json(
      { error: "Showings are not permitted for Coming Soon listings" },
      { status: 422 }
    );
  }

  // Resolve agent from lead's assigned agent
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { agent_id: true, buyer_rep_agreement: true, buyer_rep_agreement_date: true },
  });
  if (!lead?.agent_id) {
    return NextResponse.json(
      { error: "No agent assigned to your account" },
      { status: 400 }
    );
  }

  // UCBA E7: Buyer representative agreement must be in place before showing
  if (!lead.buyer_rep_agreement) {
    return NextResponse.json(
      { error: "A buyer representative agreement is required before scheduling a showing (UCBA E7)" },
      { status: 422 }
    );
  }

  const showing = await prisma.showing.create({
    data: {
      lead_id: auth.userId,
      listing_id: listingId,
      agent_id: lead.agent_id,
      date: showingDate,
      time: (body.time as string) ?? null,
      type: (body.type as string) ?? "private",
      status: "requested",
      notes: (body.notes as string) ?? null,
    },
  });

  await logAuditEvent(
    "create",
    "showing",
    showing.id.toString(),
    auth,
    { listing_id: listingIdStr },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      id: showing.id.toString(),
      status: "requested",
      date: showing.date,
    },
    { status: 201 }
  );
}
