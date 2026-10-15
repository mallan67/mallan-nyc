// PATCH /api/crm/listings/[id]/status
// Status state machine transition with REBNY RLS rules enforcement.
// Includes DOM tracking per UCBA 2026 (30-day reset).
import { NextRequest, NextResponse } from "next/server";
import { buildingAndManifestInvalidationTags, listingCacheTag, safeRevalidateTags, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { computeDomTransition } from "@/lib/compliance/dom-tracker";
import { assertRlsCompliantPayload } from "@/lib/compliance/rls-enforcement";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { addBusinessDays, addCalendarDays } from "@/lib/compliance/business-days";
import { createNotification } from "@/lib/notifications/engine";
import { computeGateColumns } from "@/lib/idx/trestle-mapper";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { buildListingUrls } from "@/lib/crm/listing-urls";
import { checkFeeDisclosure, isDisplayReadyStatus } from "@/lib/crm/fee-disclosure";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";
import { listingCapabilities, CAPABILITY_DENIED } from "@/lib/auth/listing-capabilities";

// REBNY RLS status state machine
// Valid transitions map: current → allowed next statuses
const STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ["Active", "ComingSoon"],
  ComingSoon: ["Active", "Withdrawn"],
  Active: ["ActiveUnderContract", "Pending", "Hold", "Withdrawn", "Expired"],
  ActiveUnderContract: ["Active", "Pending", "Hold", "Withdrawn"],
  Pending: ["Sold", "Rented", "Active", "Withdrawn"],
  Hold: ["Active", "Draft"],
  Sold: [], // Terminal
  Rented: [], // Terminal
  Withdrawn: ["Active", "Draft"],
  Expired: ["Active", "Draft"],
  Cancelled: [], // Terminal
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Resolve listing
  const numericId = parseInt(id);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
    });
  }

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // `status` on a synced row is source-owned: Cotality supplies MlsStatus and
  // the next sync overwrites any local transition. Writing it here would also
  // stamp `modification_timestamp` and poison the incremental cursor. Status
  // transitions are therefore a LOCAL-listing capability only.
  const caps = listingCapabilities(auth, listing);
  if (!caps.mayManageMallanLocalListing) {
    return NextResponse.json(
      caps.mayViewHistory ? CAPABILITY_DENIED.SOURCE_OWNED : CAPABILITY_DENIED.ACCESS,
      { status: 403 },
    );
  }

  let body: { status: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newStatus = body.status;
  if (!newStatus) {
    return NextResponse.json(
      { error: "Missing 'status' field" },
      { status: 400 }
    );
  }

  // Validate transition
  const currentStatus = listing.status;
  const allowed = STATUS_TRANSITIONS[currentStatus];

  if (!allowed) {
    return NextResponse.json(
      {
        error: `Unknown current status: ${currentStatus}`,
        current: currentStatus,
      },
      { status: 400 }
    );
  }

  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Invalid status transition: ${currentStatus} → ${newStatus}`,
        current: currentStatus,
        allowed,
      },
      { status: 422 }
    );
  }

  // Terminal statuses (Sold/Rented) require broker approval
  if (
    (newStatus === "Sold" || newStatus === "Rented") &&
    auth.role !== "BROKER"
  ) {
    return NextResponse.json(
      { error: "Sold/Rented status requires broker approval" },
      { status: 403 }
    );
  }

  // C12: ClosePrice required when transitioning to Sold/Rented
  const existingRaw = (listing.raw_data as Record<string, unknown>) ?? {};
  if (newStatus === "Sold" || newStatus === "Rented") {
    if (!existingRaw.ClosePrice) {
      return NextResponse.json(
        {
          error: `ClosePrice is required before marking a listing as ${newStatus} (UCBA C12)`,
          field: "ClosePrice",
        },
        { status: 422 }
      );
    }
  }

  // FARE Act fee-disclosure gate (NYC LL 119/2024) — rentals going display-ready
  // (Active / ComingSoon). Applies to CRM rental exclusives too (NOT skipped like
  // the RLS gate below), since FARE applies wherever rental details are displayed.
  // Never gates Draft. Fee data is the listing's saved raw_data (existingRaw).
  const isRentalListing = ((listing.listing_type as string) ?? "") === "rent";
  if (isRentalListing && isDisplayReadyStatus(newStatus)) {
    const feeCheck = checkFeeDisclosure(existingRaw);
    if (!feeCheck.ok) {
      return NextResponse.json(
        { error: feeCheck.reason, field: "MoveInCostsAmount", code: "FARE_FEE_DISCLOSURE" },
        { status: 422 }
      );
    }
  }

  // RLS Enforcement Gate — only for Trestle-synced RLS-eligible listings.
  // CRM-created listings (mls_id=null) are Mallan exclusives published to
  // mallan.nyc only — they never go to Trestle, so skip the 48-field check.
  // InHouseWebOnly/InHouseInternal/commercial (rls_eligible=false) also skip.
  const isCrmCreated = !listing.mls_id;
  if (listing.rls_eligible && !isCrmCreated) {
    const enforcement = assertRlsCompliantPayload(
      { ...existingRaw, MlsStatus: newStatus },
      {
        listingType: (listing.listing_type as "sale" | "rent") ?? "sale",
        isNewDevelopment: (existingRaw.NewDevelopmentYN as boolean) === true,
        currentStatus: newStatus,
        previousStatus: currentStatus,
        statusChangedAt: listing.status_changed_at ?? undefined,
        existingActivationDate: existingRaw.ActivationDate as string | undefined,
        rlsEligible: listing.rls_eligible,
      }
    );
    if (!enforcement.passed) {
      return NextResponse.json(
        {
          error: "Status change blocked by RLS enforcement gate",
          blockers: enforcement.blockers,
          warnings: enforcement.warnings,
        },
        { status: 422 }
      );
    }
  }

  // Compute DOM tracking fields for this transition
  const domUpdate = computeDomTransition(
    {
      status: currentStatus,
      status_changed_at: listing.status_changed_at,
      first_active_date: listing.first_active_date,
      days_on_market: listing.days_on_market,
    },
    newStatus
  );

  // D9: Mark listings that were Coming Soon so one-time-per-address check works
  const updatedRaw = currentStatus === "ComingSoon" && newStatus !== "ComingSoon"
    ? { ...existingRaw, _wasComingSoon: true }
    : undefined;

  // Phase A W1 — recompute display gates against the new status.
  //
  // Closes the W1 gap from docs/idx/post-reconciliation-tightening-audit-2026-05-20.md:
  // before this change a CRM status PATCH to a terminal state (Sold / Rented /
  // Withdrawn / Expired / Cancelled / Closed) left `idx_display_yn=true` on
  // the listing until the next 03:00 UTC data-retention cron firing. With the
  // PR 5B reader swap (held), that 24h window would be a real public-display
  // leakage. Calling the canonical helper here flips the gate in the same
  // transaction as the status change, so writer + cron agree on the
  // terminal-status set with no race window.
  //
  // The existing `internet_*_display_yn`, AVM, ConsumerComment, participant_only,
  // owner_opt_out, AND rls_eligible columns are unchanged by a status PATCH;
  // they are read from the existing listing row and passed through to the
  // helper unchanged.
  //
  // The `rls_eligible` input was added to the helper 2026-05-20 (Codex review
  // on PR #165) — without it, a CRM status PATCH on a commercial / website-
  // only listing would have flipped `idx_display_yn=true` on an Active
  // transition, overriding the CRM POST's `rlsEligible && ...` guard at
  // app/api/crm/listings/route.ts:340-343. Locked by tests in
  // lib/idx/__tests__/compute-gate-columns.test.ts "rls_eligible first-class
  // gate" describe block.
  const newGateColumns = computeGateColumns({
    status: newStatus,
    internetEntireListingDisplayYN: listing.internet_entire_listing_display_yn,
    internetAddressDisplayYN: listing.internet_address_display_yn,
    internetAutomatedValuationDisplayYN:
      listing.internet_automated_valuation_display_yn,
    internetConsumerCommentYN: listing.internet_consumer_comment_yn,
    participantOnly: listing.participant_only,
    ownerOptOut: listing.owner_opt_out,
    rls_eligible: listing.rls_eligible,
  });

  // Archive eligibility clock (#415): set terminal_since on non-terminal→terminal,
  // clear on terminal→active, no change otherwise. Derived from the listing's stable
  // source dates (raw_data.CloseDate/OffMarketDate, else transition wall-clock).
  const terminalSincePatch = computeTerminalSincePatch({
    previousStatus: currentStatus,
    newStatus,
    raw_data: existingRaw,
    features: (listing.features as Record<string, unknown>) ?? undefined,
    // #446: a manual Active→Expired on a CRM exclusive may have no raw_data.ExpirationDate;
    // seed from the typed expiration_date (same date the cron + protected-period use), not wall-clock.
    expirationDateFallback: listing.expiration_date,
  });

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: newStatus,
      modification_timestamp: new Date(),
      status_changed_at: domUpdate.status_changed_at,
      first_active_date: domUpdate.first_active_date,
      days_on_market: domUpdate.days_on_market,
      cumulative_days_on_market: domUpdate.cumulative_days_on_market,
      idx_display_yn: newGateColumns.idx_display_yn,
      ...terminalSincePatch,
      ...(updatedRaw ? { raw_data: updatedRaw } : {}),
    },
  });

  // Building-Neon-wake — a status change (incl. Active→Expired/Withdrawn)
  // changes building-visible inventory: expire the listing tag + its
  // building + search in the same cycle.
  safeRevalidateTags([
    listingCacheTag(listing.listing_id),
    ...buildingAndManifestInvalidationTags(listing.address),
    SEARCH_CACHE_TAG,
  ]);

  // Phase A W1 — dual-write the listing_search_projection so any reader
  // (including the PR 5B-future projection reader) sees the new gate state
  // immediately. The data-retention cron's per-row dual-write (PR #147)
  // remains as belt-and-suspenders if this call fails — the failure is
  // logged to AuditEvent but does NOT block the agent's status change
  // (matches the same per-row-failure semantics as lib/idx/sync.ts).
  try {
    await dualWriteProjectionForListingId(prisma, listing.listing_id);
  } catch (err) {
    await prisma.auditEvent.create({
      data: {
        action: "projection_dual_write_failed",
        entity_type: "listing",
        entity_id: listing.id.toString(),
        user_type: auth.userType,
        user_id: auth.userId,
        changes: {
          source: "crm_status_patch",
          listing_id: listing.listing_id,
          previous_status: currentStatus,
          new_status: newStatus,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    }).catch(() => { /* swallow — don't fail the user action on a logging failure */ });
  }

  const domReset = domUpdate.days_on_market === 0 && listing.days_on_market > 0;

  // UCBA A6/A7/A8: Create ProtectedPeriod when transitioning to Expired
  if (newStatus === "Expired" && listing.agent_id) {
    const existingPeriod = await prisma.protectedPeriod.findUnique({
      where: { listing_id: listing.id },
    });
    if (!existingPeriod) {
      const expiredAt = listing.expiration_date ?? new Date();
      const namesDeadline = addBusinessDays(expiredAt, 7);
      const protectionEnds = addCalendarDays(expiredAt, 90);

      await prisma.protectedPeriod.create({
        data: {
          listing_id: listing.id,
          agent_id: listing.agent_id,
          agreement_expired_at: expiredAt,
          names_deadline: namesDeadline,
          protection_ends_at: protectionEnds,
          status: "pending_names",
        },
      });

      // Notify agent
      await createNotification({
        recipient_type: "agent",
        recipient_id: listing.agent_id,
        type: "listing_expiration",
        title: "Exclusive expired — submit protected buyers",
        body: `Your listing ${listing.listing_id} has expired. Submit up to 6 protected buyer names by ${namesDeadline.toLocaleDateString()} and upload the notice of expired listing (UCBA A6/A7).`,
        data: { listing_id: listing.listing_id },
      });
    }
  }

  await logAuditEvent(
    "status_change",
    "listing",
    listing.id.toString(),
    auth,
    {
      previous_status: currentStatus,
      new_status: newStatus,
      days_on_market: domUpdate.days_on_market,
      ...(domReset ? { dom_reset: true, previous_dom: listing.days_on_market } : {}),
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  const urls = buildListingUrls({
    listing_id: listing.listing_id,
    status: newStatus,
    address: listing.address as Record<string, unknown> | null,
    // Required by the canonical public-address decision: a prefix is not
    // permission, and a null IDX flag must fail closed on a DB row.
    rls_eligible: listing.rls_eligible,
    internet_entire_listing_display_yn: listing.internet_entire_listing_display_yn,
    internet_address_display_yn: listing.internet_address_display_yn,
  });

  return NextResponse.json({
    id: listing.id.toString(),
    listing_id: listing.listing_id,
    previous_status: currentStatus,
    status: newStatus,
    publicUrl: urls.publicUrl,
    days_on_market: domUpdate.days_on_market,
    ...(domReset ? { dom_reset: true } : {}),
  });
}
