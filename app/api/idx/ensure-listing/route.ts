// POST /api/idx/ensure-listing
// Ensures an IDX/Cotality listing exists in the local DB so that showings,
// listing-sends, and other actions that require a Prisma Listing record work.
//
// If the listing already exists (by listing_id or mls_id), returns it.
// If not, creates a minimal record from the IDX search data provided in the body.
//
// Auth: agent or broker session required.
// The listing is created RLS-eligible, like every row the Cotality sync writes: it is another firm's listing,
// and rls_eligible=false would make every reader take it for Mallan's own (see the column below).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";
import { affirmPermission } from "@/lib/compliance/gates";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";
import { stubAddressJson } from "@/lib/listings/stub-address";

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
      { error: "listing_id is required (Cotality ListingId)" },
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

  // 2. Check by mls_id (Cotality ListingId may have been stored there)
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

  // The id of a stub is a Cotality ListingId. SL- / RL- are the ids Mallan mints for its OWN listings, and the identity rule
  // (lib/listings/mallan-source-identity.ts) reads either prefix as "Mallan's own" whatever rls_eligible says, so a stub created
  // under one would be labelled and gated as Mallan's listing. (A row that already exists under such an id was returned above, unchanged.)
  if (/^(SL|RL)-/i.test(trimmedId)) {
    return NextResponse.json(
      { error: "listing_id is a Mallan listing id (SL-/RL-), not a Cotality ListingId; this route only creates stubs of Cotality listings" },
      { status: 400 }
    );
  }

  // 3. Create minimal record from IDX data provided by the frontend
  // address, agent_info, media, features, compliance are all Json columns
  const isRental = body.listing_category === "rental" ||
    String(body.listing_type || "").toLowerCase().includes("rent") ||
    String(body.listing_type || "").toLowerCase().includes("lease");

  // Under the provider's own key names, which the public converter and the slug read, as well as the lowercase keys this route always wrote
  // (lib/listings/stub-address.ts): without them a stub that passes the display gates renders with no street number, street name or postal code.
  const addressJson = stubAddressJson(body);

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
        // RLS-eligible: this is a FEED listing (another firm's), and the sync writes the same for every Cotality row
        // ("Cotality-sourced rows are RLS-eligible by definition", lib/idx/sync.ts). rls_eligible=false means "Mallan's own
        // website-only listing, outside RLS" to every reader: the public label ("Exclusive listing by Mallan Real Estate Inc.", no
        // disclaimer, an agent card built from the agent columns below), the IDX-display, internet-display, owner-opt-out,
        // participant-only and address gates (all skipped for such a row), the campaign gate and the exclusives lists. This line
        // used to write false ("External IDX listing, not our exclusive"), which made another firm's listing read as Mallan's own.
        // The display flags below come from the request body, fail-closed, and now bind the stub like any feed row. Rows written
        // before this change keep false until they are corrected (a data change; see the Execution State).
        rls_eligible: true,
        // H1 fix (2026-05-13): close the secondary-writer §2.05 gap.
        // `canonicalStatus` is the normalized form of body.status (see the
        // declaration above). Using the SAME canonical value for both the
        // DB `status` column and this guard means the writer, the
        // data-retention cron, and ops:health cannot disagree on whether
        // the row is terminal. Reuses the C2 canonical TERMINAL_STATUSES
        // set (imported from lib/idx/trestle-mapper.ts).
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
        // COTALITY SYNC-CURSOR SAFETY. `getLastSyncTimestamp()` (lib/idx/sync.ts) is
        //     MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL
        // and feeds the OData filter `ModificationTimestamp gt SINCE`. PR-S.7
        // added that filter so the cursor "selects ONLY Cotality-sync writers".
        //
        // This route is NOT one: it builds a local STUB from IDX search-result
        // data in the request body so showings and listing-sends have a Prisma
        // row to reference. It previously stamped `last_synced_from_trestle:
        // new Date()` — a false claim, since nothing was synced — together with
        // a LOCAL-clock `modification_timestamp`. The stub therefore passed the
        // cursor filter carrying a local-NOW watermark: one call pushed the
        // cursor past every genuine Cotality ModificationTimestamp, and the next
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
