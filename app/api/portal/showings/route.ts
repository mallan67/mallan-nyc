// /api/portal/showings
// GET: Client's showings. POST: Client requests a showing. Lead users only.
// Uses centralized DTO for REBNY-compliant address suppression.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { sanitizeForPublic } from "@/lib/compliance/dto";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

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

  const showings = await prisma.showing.findMany({
    where: {
      lead_id: auth.userId,
      OR: [
        { date: { gte: new Date() } },
        { status: "completed", date: { gte: thirtyDaysAgo } },
      ],
    },
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
    },
    orderBy: { date: "asc" },
  });

  const serialized = showings.map((s) => {
    // Centralized address suppression via DTO (REBNY RLS compliance)
    const sanitizedListing = sanitizeForPublic({
      address: s.listing.address,
      internet_address_display_yn: s.listing.internet_address_display_yn,
    });
    return {
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

  // Verify listing exists
  const listingId = BigInt(parseInt(listingIdStr));
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Resolve agent from lead's assigned agent
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { agent_id: true },
  });
  if (!lead?.agent_id) {
    return NextResponse.json(
      { error: "No agent assigned to your account" },
      { status: 400 }
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
