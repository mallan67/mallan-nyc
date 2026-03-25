// POST /api/idx/ensure-listing
// Ensures an IDX/Trestle listing exists in the local DB so that showings,
// listing-sends, and other actions that require a Prisma Listing record work.
//
// If the listing already exists (by listing_id or mls_id), returns it.
// If not, creates a minimal record from the IDX search data provided in the body.
//
// Auth: agent or broker session required.
// The listing is marked rls_eligible=false (external IDX listing, not our exclusive).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const listingId = body.listing_id as string;
  if (!listingId || typeof listingId !== "string" || listingId.trim().length === 0) {
    return NextResponse.json(
      { error: "listing_id is required (Trestle ListingId)" },
      { status: 400 }
    );
  }

  const trimmedId = listingId.trim();

  // 1. Check if listing already exists by listing_id
  let existing = await prisma.listing.findUnique({
    where: { listing_id: trimmedId },
    select: { id: true, listing_id: true },
  });

  if (existing) {
    return NextResponse.json({ listing_id: existing.listing_id,
      db_id: existing.id.toString(),
      created: false,
    });
  }

  // 2. Check by mls_id (Trestle ListingId may have been stored there)
  const byMlsId = await prisma.listing.findFirst({
    where: { mls_id: trimmedId },
    select: { id: true, listing_id: true },
  });

  if (byMlsId) {
    return NextResponse.json({ listing_id: byMlsId.listing_id,
      db_id: byMlsId.id.toString(),
      created: false,
    });
  }

  // 3. Create minimal record from IDX data provided by the frontend
  // address, agent_info, media, features, compliance are all Json columns
  const addressStr = (body.address as string) || "";
  const isRental = body.listing_category === "rental" ||
    String(body.listing_type || "").toLowerCase().includes("rent") ||
    String(body.listing_type || "").toLowerCase().includes("lease");

  const addressJson: Record<string, unknown> = {
    full: addressStr,
    unit: (body.unit as string) || "",
    neighborhood: (body.neighborhood as string) || "",
    borough: (body.borough as string) || "",
    zip: (body.zip as string) || "",
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    cross_street: (body.cross_street as string) || "",
  };

  const agentInfoJson: Record<string, unknown> = {
    name: (body.agent_name as string) || "",
    email: (body.agent_email as string) || "",
    phone: (body.agent_phone as string) || "",
    company: (body.company as string) || "",
  };

  try {
    const listing = await prisma.listing.create({
      data: {
        listing_id: trimmedId,
        mls_id: trimmedId,
        listing_type: isRental ? "rent" : "sale",
        status: (body.status as string) || "Active",
        address: addressJson as Prisma.InputJsonValue,
        list_price: body.price != null ? Number(body.price) : 0,
        bedrooms_total: body.beds != null ? Number(body.beds) : null,
        bathrooms_full: body.full_baths != null ? Number(body.full_baths) : (body.baths != null ? Math.floor(Number(body.baths)) : null),
        bathrooms_half: body.half_baths != null ? Number(body.half_baths) : null,
        living_area: body.int_sqft != null ? Number(body.int_sqft) : null,
        borough: (body.borough as string) || null,
        neighborhood: (body.neighborhood as string) || null,
        postal_code: (body.zip as string) || null,
        property_type: (body.property_type as string) || null,
        property_sub_type: (body.property_sub_type as string) || null,
        rls_eligible: false, // External IDX listing, not our exclusive
        idx_display_yn: true,
        internet_entire_listing_display_yn: body.internet_display_yn !== false,
        internet_address_display_yn: body.address_display_yn !== false,
        agent_info: agentInfoJson as Prisma.InputJsonValue,
        media: (body.images as Prisma.InputJsonValue) ?? ([] as Prisma.InputJsonValue),
        features: {} as Prisma.InputJsonValue,
        compliance: {} as Prisma.InputJsonValue,
        modification_timestamp: new Date(),
        last_synced_from_trestle: new Date(),
        sync_status: "synced",
      },
    });

    await logAuditEvent(
      "create",
      "listing",
      listing.id.toString(),
      auth,
      { source: "idx_ensure", trestle_id: trimmedId }
    );

    return NextResponse.json({ listing_id: listing.listing_id,
      db_id: listing.id.toString(),
      created: true,
    }, { status: 201 });
  } catch (err) {
    // Race condition: another request created it between our check and create
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      existing = await prisma.listing.findUnique({
        where: { listing_id: trimmedId },
        select: { id: true, listing_id: true },
      });
      if (existing) {
        return NextResponse.json({ listing_id: existing.listing_id,
          db_id: existing.id.toString(),
          created: false,
        });
      }
    }

    console.error("[ensure-listing] Create failed:", err);
    return NextResponse.json(
      { error: "Failed to create listing record" },
      { status: 500 }
    );
  }
}
