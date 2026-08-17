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
import { isActiveDisplayStatus } from "@/lib/compliance/status";
import {
  buildingAndManifestInvalidationTags,
  listingCacheTag,
  safeRevalidateTags,
  SEARCH_CACHE_TAG,
} from "@/lib/cache/public-cache";
import type { Prisma } from "@prisma/client";
import { affirmPermission } from "@/lib/compliance/gates";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";

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

  // H1 amend (2026-05-13): normalize body.status BEFORE the terminal guard
  // and BEFORE the DB write so case/whitespace/alias variants ("closed",
  // "Closed ", "CLOSED", "canceled") cannot bypass the guard AND cannot
  // create stealth audit anomalies invisible to the exact-case
  // data-retention cron + ops:health predicates. The same canonical value
  // is used for both `status` and `idx_display_yn` below.
  const canonicalStatus = normalizeStandardStatus(body.status);

  try {
    const listing = await prisma.listing.create({
      data: {
        listing_id: trimmedId,
        mls_id: trimmedId,
        listing_type: isRental ? "rent" : "sale",
        status: canonicalStatus,
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
        // H1 fix (2026-05-13): close the secondary-writer §2.05 gap.
        // `canonicalStatus` is the normalized form of body.status (see the
        // declaration above). Using the SAME canonical value for both the
        // DB `status` column and this guard means the writer, the
        // data-retention cron, and ops:health cannot disagree on whether
        // the row is terminal. Reuses the C2 canonical TERMINAL_STATUSES
        // set (lib/idx/trestle-mapper.ts is the source of truth).
        idx_display_yn: !TERMINAL_STATUSES.has(canonicalStatus),
        // Archive Eligibility Clock (#415/#446): seed terminal_since when this minimal
        // external record is created already-terminal (arbitrary body.status). This path
        // has NO stable close/off-market source (raw_data/features empty), so a terminal
        // create resolves to the wall-clock fallback inside the helper; a non-terminal
        // create no-ops ({} spread). Same helper the live writers use → parity with the
        // future PR-2 archive predicate.
        ...computeTerminalSincePatch({
          previousStatus: undefined,
          newStatus: canonicalStatus,
          raw_data: {},
          features: {},
        }),
        // Fail-CLOSED coercion — body is untrusted POST input. Was `!== false`
        // which let missing/null fields become displayable.
        internet_entire_listing_display_yn: affirmPermission(body.internet_display_yn),
        internet_address_display_yn: affirmPermission(body.address_display_yn),
        // Phase C: agent_info JSON no longer persisted. The 8 typed agent columns are
        // written from the in-memory manual shape ({name,email,phone,company}).
        ...typedAgentColumnsFromJson(agentInfoJson),
        media: (body.images as Prisma.InputJsonValue) ?? ([] as Prisma.InputJsonValue),
        features: {} as Prisma.InputJsonValue,
        compliance: {} as Prisma.InputJsonValue,
        // TRESTLE CURSOR SAFETY. `getLastSyncTimestamp()` (lib/idx/sync.ts) is
        //     MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL
        // and feeds the OData filter `ModificationTimestamp gt SINCE`. PR-S.7
        // added that filter so the cursor "selects ONLY Trestle-sync writers".
        //
        // This route is NOT one: it builds a local STUB from IDX search-result
        // data in the request body so showings and listing-sends have a Prisma
        // row to reference. It previously stamped `last_synced_from_trestle:
        // new Date()` — a false claim, since nothing was synced — together with
        // a LOCAL-clock `modification_timestamp`. The stub therefore passed the
        // cursor filter carrying a local-NOW watermark: one call pushed the
        // cursor past every genuine Trestle ModificationTimestamp, and the next
        // incremental sync skipped real upstream changes until wall-clock time
        // caught up. Same hazard PR-S.7 documented, through a door it left open.
        //
        // Leaving the column NULL is both the honest value and the fix — the
        // existing PR-S.7 filter then excludes this row. The real sync sets it
        // when it actually writes this listing.
        //
        // `modification_timestamp` is non-nullable so it must be set; local NOW
        // is safe here ONLY because the row is now outside the cursor query.
        modification_timestamp: new Date(),
        // "pending" is the schema default and the accurate state. Nothing
        // branches on "synced"; the values that carry meaning elsewhere are
        // "archived" and the `gated:*` forms.
        sync_status: "pending",
      },
    });

    // MISSING INVALIDATION, fixed 2026-08-16; NARROWED 2026-08-17 after review.
    //
    // The first version invalidated whenever the status was merely
    // non-terminal. That is not public RESULT MEMBERSHIP: the cached public
    // collections admit only ACTIVE_DISPLAY_STATUSES (Active,
    // ActiveUnderContract, ComingSoon), so a create in any other status —
    // Draft, Pending, Withdrawn — cannot appear in them, and expiring those
    // entries would evict correct data and force an avoidable Neon refill.
    //
    // Gated on the canonical helper rather than a local status list, so this
    // cannot drift from the predicates the readers actually use.
    //
    // Insert, so there is no previous address: the helper is null-safe on the
    // missing side and yields one building tag plus that address's manifest
    // shard. `safeRevalidateTags` never throws, so it cannot fail a create that
    // has already committed.
    if (isActiveDisplayStatus(canonicalStatus) && affirmPermission(body.internet_display_yn)) {
      safeRevalidateTags([
        listingCacheTag(trimmedId),
        ...buildingAndManifestInvalidationTags(addressJson),
        SEARCH_CACHE_TAG,
      ]);
    }

    await logAuditEvent(
      "create",
      "listing",
      listing.id.toString(),
      auth,
      { source: "idx_ensure", trestle_id: trimmedId }
    );

    // H1 Tier-1 dual-write — projection upsert via canonical builder.
    // Failure is non-fatal so the ensure-listing flow still returns 201
    // to the caller; ops:projection-backfill heals on next run.
    try {
      await dualWriteProjectionForListingId(prisma, listing.listing_id);
    } catch (projErr) {
      console.warn(
        "[ensure-listing] projection dual-write failed:",
        projErr instanceof Error ? projErr.message : projErr,
      );
    }

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
