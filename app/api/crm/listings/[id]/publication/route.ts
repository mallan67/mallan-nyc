// PATCH /api/crm/listings/[id]/publication
//
// THE ONE PUBLICATION TRANSITION BOUNDARY.
//
// Market status and publication state answer different questions and must not
// be able to move each other:
//
//   /status   owns COTALITY market status only — what the market says about the
//             property. Its vocabulary is the provider's.
//   PATCH     owns editable Mallan listing facts plus canonical owner
//             repair/change. It preserves the publication namespace and must
//             never silently approve or publish.
//   here      owns the Mallan publication/review workflow.
//
// `lib/crm/publication-state.ts` remains the SINGLE transition authority; this
// route resolves the actor, gathers the facts the rules depend on, and persists
// the decision. It does not re-implement any rule, and no transition table
// exists anywhere else — including the client.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { serializeBigInts } from "@/lib/api/serialize";
import {
  buildingAndManifestInvalidationTags,
  listingCacheTag,
  safeRevalidateTags,
  SEARCH_CACHE_TAG,
} from "@/lib/cache/public-cache";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { decideDbPublicAddress } from "@/lib/compliance/db-address-decision";
import { listingCapabilities, CAPABILITY_DENIED } from "@/lib/auth/listing-capabilities";
import {
  applyPublicationTransition,
  readPublication,
  withPublication,
  isPubliclyPublished,
  lastPublishedAt,
  PUBLICATION_STATES,
  VISIBILITY_MODES,
  type PublicationActorRole,
  type PublicationState,
  type VisibilityMode,
} from "@/lib/crm/publication-state";
import {
  evaluatePublicationCompliance,
  advertisementText,
} from "@/lib/crm/publication-compliance";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function findListing(id: string) {
  const numericId = parseInt(id);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({ where: { id: BigInt(numericId) } });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({ where: { listing_id: id } });
  }
  return listing;
}

/**
 * Resolve the acting principal to a publication role.
 *
 * THREE DOMAINS, NOT THREE STRINGS. A staff session (`userType === "agent"`) is
 * the only thing that can be BROKER or AGENT — the same trust boundary
 * `requireRole` enforces, applied here so a lead carrying a `role` of "BROKER"
 * cannot become one. A lead is OWNER only when they are THE owner of THIS
 * listing, checked against the canonical column, not against a role string.
 *
 * Anything else is not a participant in this listing's workflow.
 */
function resolvePublicationRole(
  auth: { userType: string; userId: bigint; role?: string | null },
  listing: { owner_client_id: bigint | null },
): PublicationActorRole | null {
  if (auth.userType === "agent") {
    return auth.role === "BROKER" ? "BROKER" : "AGENT";
  }
  if (auth.userType === "lead") {
    if (listing.owner_client_id != null && listing.owner_client_id === auth.userId) {
      return "OWNER";
    }
    return null;
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  // requireAuth, not requireAgentOrBroker: an OWNER legitimately submits and
  // resubmits their own intake, and they are a lead.
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const listing = await findListing(id);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // A Cotality-sourced row is SOURCE-OWNED. Mallan does not run a publication
  // workflow over inventory it did not author; the provider decides what that
  // listing is, and the next sync would overwrite anything written here.
  const caps = listingCapabilities(auth, listing);
  if (!caps.mayManageMallanLocalListing && auth.userType === "agent") {
    return NextResponse.json(
      caps.mayViewHistory ? CAPABILITY_DENIED.SOURCE_OWNED : CAPABILITY_DENIED.ACCESS,
      { status: 403 },
    );
  }

  const role = resolvePublicationRole(auth, listing);
  if (!role) {
    // 403, not 404: for a staff caller the listing's existence is already known,
    // and an owner-role lead reaching another owner's listing is an authority
    // failure we should name plainly rather than disguise.
    return NextResponse.json(
      { error: "You are not a participant in this listing's publication workflow." },
      { status: 403 },
    );
  }

  let body: { to?: unknown; visibility?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const to = body.to;
  if (typeof to !== "string" || !(PUBLICATION_STATES as readonly string[]).includes(to)) {
    return NextResponse.json(
      {
        error: "`to` must be a Mallan publication state.",
        allowed: PUBLICATION_STATES,
      },
      { status: 400 },
    );
  }

  let visibility: VisibilityMode | undefined;
  if (body.visibility !== undefined && body.visibility !== null) {
    if (
      typeof body.visibility !== "string" ||
      !(VISIBILITY_MODES as readonly string[]).includes(body.visibility)
    ) {
      return NextResponse.json(
        { error: "`visibility` must be a Mallan visibility mode.", allowed: VISIBILITY_MODES },
        { status: 400 },
      );
    }
    visibility = body.visibility as VisibilityMode;
  }

  const current = readPublication(listing.compliance);

  // ── AUDIENCE-SPECIFIC COMPLIANCE ─────────────────────────────────────────
  //
  // Evaluated against the visibility this transition would RESULT IN, not
  // against the listing's current audience. Widening the audience is exactly
  // when the stricter rules must run.
  //
  // Fair Housing is checked here directly rather than through the provider
  // payload validator, because that validator is skipped for Mallan-authored
  // rows (`isCrmCreated`) and the skip was silently taking the legal check with
  // it. "We are not syndicating it" is not a Fair Housing defence.
  const rawData = (listing.raw_data as Record<string, unknown> | null) ?? {};
  const { addressDisplayable } = decideDbPublicAddress({
    listing_id: listing.listing_id,
    rls_eligible: listing.rls_eligible,
    internet_address_display_yn: listing.internet_address_display_yn,
    internet_entire_listing_display_yn: listing.internet_entire_listing_display_yn,
  });

  const targetVisibility = visibility ?? null;
  const complianceAudience: VisibilityMode =
    targetVisibility ??
    // No explicit choice: evaluate against the state's own default audience by
    // asking the state machine what it would pick. A dry-run keeps the default
    // in ONE place instead of duplicating the table here.
    (() => {
      const dry = applyPublicationTransition(current, {
        to: to as PublicationState,
        role,
        actorId: String(auth.userId),
        now: new Date().toISOString(),
        hasOwner: listing.owner_client_id != null,
        compliancePassed: true,
        deliveryEvidence: null,
      });
      return dry.ok ? dry.visibility : "INTERNAL_ONLY";
    })();

  const compliance = evaluatePublicationCompliance(
    {
      listing_type: listing.listing_type,
      text: advertisementText(rawData),
      rawData,
      addressDisplayable,
      // The brokerage identity is a constant of this system, not a per-listing
      // field; NY DOS 19 NYCRR 175.25 requires it on every advertisement.
      brokerAttribution: listing.list_office_name ?? "Mallan Real Estate Inc.",
    },
    complianceAudience,
  );

  const now = new Date();
  const decision = applyPublicationTransition(current, {
    to: to as PublicationState,
    role,
    actorId: String(auth.userId),
    visibility,
    compliancePassed: compliance.passed,
    hasOwner: listing.owner_client_id != null,
    note: typeof body.note === "string" ? body.note : undefined,
    now: now.toISOString(),
    // No authorized outbound exporter exists, so this route can never honestly
    // supply delivery evidence. EXPORTED is therefore unreachable here, which
    // is the truthful outcome rather than a state a broker can click into.
    deliveryEvidence: null,
  });

  if (!decision.ok) {
    // 409 for a workflow refusal, 403 for an authority refusal. The distinction
    // tells the CRM whether to prompt the user to fix something or to tell them
    // they lack the authority.
    const status = decision.code === "ACTOR_NOT_PERMITTED" ? 403 : 409;
    return NextResponse.json(
      {
        error: decision.message,
        code: decision.code,
        from: decision.from,
        to: decision.to,
        allowed: decision.allowed,
        // Surfaced so the CRM can show WHAT failed, not merely that something did.
        compliance: {
          audience: compliance.audience,
          passed: compliance.passed,
          failures: compliance.failures,
          unevaluated: compliance.unevaluated,
        },
      },
      { status },
    );
  }

  const wasPublic = isPubliclyPublished(current);
  const isPublic = isPubliclyPublished(decision.publication);

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      // MERGE, never replace: sibling compliance keys (validation results, RLS
      // eligibility, authored sub-objects) must survive a publication move.
      compliance: withPublication(
        listing.compliance,
        decision.publication,
      ) as unknown as import("@prisma/client").Prisma.InputJsonValue,
      // NOT `modification_timestamp`. That column feeds the Cotality
      // incremental cursor; stamping it for a Mallan-internal workflow move
      // would poison the sync for a change the provider never made.
    },
  });

  await logAuditEvent(
    "listing_publication_transition",
    "listing",
    listing.id.toString(),
    auth,
    {
      listing_id: listing.listing_id,
      ...decision.audit,
      compliance_audience: compliance.audience,
      compliance_passed: compliance.passed,
      became_public: !wasPublic && isPublic,
      ceased_public: wasPublic && !isPublic,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  // Invalidate ONLY when the public surface actually changed. A move from
  // SUBMITTED to REVIEW_IN_PROGRESS changes nothing a visitor can see, and
  // busting the public cache for it would be pure churn.
  if (wasPublic !== isPublic) {
    safeRevalidateTags([
      listingCacheTag(listing.listing_id),
      SEARCH_CACHE_TAG,
      ...buildingAndManifestInvalidationTags(listing.address),
    ]);
    // Best-effort, exactly as the status route treats it: the projection is a
    // read optimisation and its failure must not roll back an authorized
    // workflow transition.
    try {
      await dualWriteProjectionForListingId(prisma, listing.listing_id);
    } catch (err) {
      await logAuditEvent(
        "projection_dual_write_failed",
        "listing",
        listing.id.toString(),
        auth,
        { source: "publication", error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  return NextResponse.json(
    serializeBigInts({
      listing_id: updated.listing_id,
      publication: {
        state: decision.publication.state,
        visibility: decision.publication.visibility,
        from: decision.from,
        lastPublishedAt: lastPublishedAt(decision.publication),
        isPublic,
        history: decision.publication.history,
      },
      compliance: {
        audience: compliance.audience,
        passed: compliance.passed,
        failures: compliance.failures,
        unevaluated: compliance.unevaluated,
      },
      // The market status is REPORTED, never changed here.
      marketStatus: updated.status,
    }),
  );
}
