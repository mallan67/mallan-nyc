// GET /api/portal/offers  — Seller/landlord portal: incoming offers on their listings.
// POST /api/portal/offers — Buyer/tenant portal: submit an offer on a listing.
// Uses ClientListingAction with action="offer" (v1 — no separate Offer model).
// Offer details stored as JSON in the `comment` field (schema has no metadata column).
// Uses centralized DTO for REBNY-compliant address suppression.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { sanitizeForPublic } from "@/lib/compliance/dto";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { isListingDisplayable } from "@/lib/search/listing-access-decision";
import { recordPortalEvent } from "@/lib/portal/events";

/* ───────────────────────────── GET ───────────────────────────── */

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  // Verify this is a seller or landlord
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { portal_role: true, agent_id: true },
  });

  if (!lead || !["seller", "landlord"].includes(lead.portal_role ?? "")) {
    return NextResponse.json(
      { error: "Offers are only available for seller/landlord portals" },
      { status: 403 }
    );
  }

  // Scope to THIS client's own listings only.
  // Listing.owner_client_id is the seller/landlord FK. Scoping by agent_id (previous
  // behavior) leaked offers across clients who share the same agent — REBNY confidentiality
  // breach (Art. III §2). Fail-closed: if no owner_client link, return empty.
  const ownedListings = await prisma.listing.findMany({
    where: {
      owner_client_id: auth.userId,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
    },
    select: {
      id: true,
      listing_id: true,
      address: true,
      list_price: true,
      internet_address_display_yn: true,
    },
  });

  if (ownedListings.length === 0) {
    return NextResponse.json({ offers: [] });
  }

  const listingIds = ownedListings.map((l) => l.id);

  // Find "offer" actions on those listings
  const offerActions = await prisma.clientListingAction.findMany({
    where: {
      listing_id: { in: listingIds },
      action: "offer",
    },
    include: {
      lead: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  const listingMap = new Map(
    ownedListings.map((l) => [l.id.toString(), l])
  );

  const offers = offerActions.map((a) => {
    const listing = listingMap.get(a.listing_id.toString());
    // Centralized address suppression via DTO (REBNY RLS compliance)
    const sanitized = listing
      ? sanitizeForPublic({
          address: listing.address,
          internet_address_display_yn: listing.internet_address_display_yn,
        })
      : null;
    return {
      id: a.id.toString(),
      listing_id: a.listing_id.toString(),
      listing_address: sanitized?.address ?? null,
      list_price: listing?.list_price?.toString() ?? null,
      comment: a.comment,
      created_at: a.created_at,
      // REBNY: Buyer PII masked from seller — only show "Buyer via [Agent]"
      // Seller communicates with buyer ONLY through their agent
      from: a.lead
        ? { id: a.lead.id.toString(), name: "Buyer (via your agent)" }
        : null,
    };
  });

  return NextResponse.json({ offers });
}

/* ───────────────────────────── POST ──────────────────────────── */

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  // Only buyers and tenants (renters) can submit offers
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, portal_role: true, agent_id: true },
  });

  if (!lead || !["buyer", "renter"].includes(lead.portal_role ?? "")) {
    return NextResponse.json(
      { error: "Only buyer or tenant portals can submit offers" },
      { status: 403 }
    );
  }

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    listing_id,
    amount,
    financing_type,
    closing_date,
    contingencies,
    notes,
    move_in_date,
  } = body as {
    listing_id?: string;
    amount?: number;
    financing_type?: string;
    closing_date?: string;
    contingencies?: string;
    notes?: string;
    move_in_date?: string;
  };

  // Validate required fields
  if (!listing_id) {
    return NextResponse.json(
      { error: "listing_id is required" },
      { status: 400 }
    );
  }
  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "amount is required and must be a positive number" },
      { status: 400 }
    );
  }

  const listingBigInt = safeBigInt(listing_id);
  if (!listingBigInt) {
    return NextResponse.json(
      { error: "Invalid listing_id" },
      { status: 400 }
    );
  }

  // Verify listing exists and passes distribution gates
  const listing = await prisma.listing.findUnique({
    where: { id: listingBigInt },
  });

  if (!listing) {
    return NextResponse.json(
      { error: "Listing not found" },
      { status: 404 }
    );
  }
  if (!isListingDisplayable(listing)) {
    return NextResponse.json(
      { error: "Listing not available" },
      { status: 403 }
    );
  }

  // Build offer metadata — stored as JSON in the comment field
  // (ClientListingAction schema has no dedicated metadata column)
  const metadata = {
    amount,
    financing_type: financing_type ?? null,
    closing_date: closing_date ?? null,
    contingencies: contingencies ?? null,
    notes: notes ?? null,
    // move_in_date is relevant for rental offers (tenant portal)
    ...(lead.portal_role === "renter" && move_in_date
      ? { move_in_date }
      : {}),
    submitted_at: new Date().toISOString(),
  };

  // Check for existing offer (unique constraint: lead_id + listing_id + action)
  const existing = await prisma.clientListingAction.findUnique({
    where: {
      lead_id_listing_id_action: {
        lead_id: auth.userId,
        listing_id: listingBigInt,
        action: "offer",
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted an offer on this listing" },
      { status: 409 }
    );
  }

  // Create the offer action
  const action = await prisma.clientListingAction.create({
    data: {
      lead_id: auth.userId,
      listing_id: listingBigInt,
      action: "offer",
      comment: JSON.stringify(metadata),
    },
  });

  // Compliance: audit log for offer submission
  await logAuditEvent(
    "create",
    "offer",
    action.id.toString(),
    auth,
    {
      listing_id: listing_id,
      amount,
      financing_type: financing_type ?? null,
      portal_role: lead.portal_role,
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  if (auth.userType === "lead") {
    await recordPortalEvent({
      leadId: auth.userId,
      eventType: "offer_submit",
      workspace: lead.portal_role,
      listingId: listing.listing_id,
      metadata: {
        offer_action_id: action.id.toString(),
        amount,
        financing_type: financing_type ?? null,
      },
    });

    if (listing.owner_client_id) {
      // Portals Tier A P0 — REBNY Art. III §2 confidentiality. The seller's
      // dashboard activity feed reads from PortalEvent.metadata. The offers
      // GET response masks the buyer to "Buyer (via your agent)" — the
      // PortalEvent metadata MUST mirror that masking, otherwise the raw
      // buyer_lead_id leaks to the seller via the side channel even though
      // the offers list itself is masked.
      await recordPortalEvent({
        leadId: listing.owner_client_id,
        eventType: "offer_view",
        workspace: listing.listing_type === "rent" ? "landlord" : "seller",
        listingId: listing.listing_id,
        metadata: {
          offer_action_id: action.id.toString(),
          from: "Buyer (via your agent)",
          amount,
        },
      });
    }
  }

  return NextResponse.json({
    id: action.id.toString(),
    listing_id: action.listing_id.toString(),
    action: action.action,
    metadata,
    created_at: action.created_at,
  });
}
