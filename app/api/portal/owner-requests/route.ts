// POST /api/portal/owner-requests
//
// AN OWNER ASKS. STAFF CHANGES THE LISTING.
//
// Three Seller/Landlord capabilities had no route at all — correction requests,
// marketing approval, and showing coordination — so the only way an owner could
// raise them was outside the system, leaving no record against the listing.
//
// None of them is a listing edit. Each is a durable REQUEST recorded against the
// listing the owner actually owns, surfaced to the agent through CRM activity
// (`PortalEvent`) and the audit trail, and actioned by authorized staff through
// the CRM — where the compliance gates already live.
//
// "Owner portal users do not directly mutate regulated canonical listing facts
// merely for convenience. Durable owner requests/actions belong in Mallan
// CRM/audit history and authorized staff applies the canonical change."
//
// This route therefore writes to `PortalEvent` and the audit log and NOTHING
// else. It has no import of, and no path to, a listing write.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { isAuthError, logAuditEvent, requirePortalRole } from "@/lib/auth";
import { resolveOwnedListingId } from "@/lib/portal/listing-ownership";

/**
 * The request kinds an owner may raise, and the CRM activity event each becomes.
 *
 * Closed set on purpose. A free-text `kind` would let the portal invent
 * categories the CRM has no panel for, and the request would land in the
 * activity feed as something no agent recognises or actions.
 */
const REQUEST_KINDS = {
  correction: "owner_correction_request",
  marketing_approval: "owner_marketing_approval",
  showing_coordination: "owner_showing_coordination",
} as const;

type RequestKind = keyof typeof REQUEST_KINDS;

/** A marketing approval is a decision, and there are exactly two of them. */
const DECISIONS = ["approved", "declined"] as const;

/**
 * Long enough for an owner to explain a correction properly, short enough that
 * the field cannot be used as unbounded storage. Rejected rather than truncated:
 * silently cutting an owner's explanation in half would hide the part that
 * mattered.
 */
const MAX_MESSAGE = 4000;

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requirePortalRole(req, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!(kind in REQUEST_KINDS)) {
    return NextResponse.json(
      {
        error: "Unknown request kind",
        code: "UNKNOWN_REQUEST_KIND",
        allowed: Object.keys(REQUEST_KINDS),
      },
      { status: 400 },
    );
  }
  const requestKind = kind as RequestKind;

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const decisionRaw = typeof body.decision === "string" ? body.decision.trim() : "";

  // A marketing approval may be a bare decision with no note; every other kind
  // has to say something, or there is nothing for staff to act on.
  const hasDecision = decisionRaw !== "";
  if (!message && !hasDecision) {
    return NextResponse.json(
      { error: "Describe what you would like changed or decided.", code: "EMPTY_REQUEST" },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      {
        error: `Please keep the message under ${MAX_MESSAGE} characters.`,
        code: "MESSAGE_TOO_LONG",
      },
      { status: 400 },
    );
  }
  if (hasDecision && !(DECISIONS as readonly string[]).includes(decisionRaw)) {
    // Storing "maybe later" as a decision would put a value in the record that
    // nothing downstream can interpret.
    return NextResponse.json(
      { error: "Decision must be approved or declined.", code: "UNKNOWN_DECISION", allowed: DECISIONS },
      { status: 400 },
    );
  }

  // THE LISTING IS REQUIRED, AND IT IS NEVER GUESSED.
  //
  // Unlike planning signals — which a seller may legitimately record before any
  // listing exists — these requests are ABOUT a specific listing. Picking one
  // for the owner would attach the request to the wrong listing the moment they
  // have more than one.
  const requestedListingId =
    typeof body.listing_id === "string" ? body.listing_id.trim() : "";
  if (!requestedListingId) {
    return NextResponse.json(
      { error: "listing_id is required", code: "LISTING_REQUIRED" },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, agent_id: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // `Listing.owner_client_id` is the canonical relation and the only
  // authorization. The `Lead.active_*_listing_id` backref is deliberately not
  // consulted here: it is a hint, and this route requires an explicit listing.
  const owned = await resolveOwnedListingId(prisma, {
    leadId: lead.id,
    // The fallback path is unreachable here — an explicit `listing_id` is
    // required above — so this value never selects anything. It is passed
    // because the helper's contract requires it.
    listingType: "sale",
    requestedListingId,
  });
  if (!owned.ok) {
    return NextResponse.json(
      {
        error: "That listing is not yours.",
        code: "LISTING_NOT_OWNED",
        listing_id: owned.requested,
      },
      { status: 403 },
    );
  }
  // `listingId` is non-null on this branch by construction: an explicit
  // `listing_id` is required above, and `resolveOwnedListingId` returns the
  // requested id or `ok: false`. The null case belongs to the fallback path,
  // which this route never takes — so there is no unreachable 4xx branch here
  // pretending otherwise.
  const listingId = owned.listingId as string;

  const metadata: Record<string, unknown> = {
    kind: requestKind,
    message: message || null,
    ...(hasDecision ? { decision: decisionRaw } : {}),
  };

  // WHICH WORKSPACE THIS BELONGS TO IS A FACT ABOUT THE LISTING, NOT THE SESSION.
  //
  // `SessionUser` carries no portal role, and the Lead's own role bookkeeping is
  // three-layered (`enabled_workspaces` -> `roles` -> legacy `portal_role`) and
  // can disagree with itself — that mismatch is what caused the comparables
  // IDOR. The listing the request is about already says which side of the
  // business it is: a rental request belongs in the landlord workspace.
  const workspace = owned.listingType === "rent" ? "landlord" : "seller";

  const event = await prisma.portalEvent.create({
    data: {
      lead_id: lead.id,
      workspace,
      event_type: REQUEST_KINDS[requestKind],
      listing_id: listingId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  await logAuditEvent(
    "owner_request",
    "lead",
    lead.id.toString(),
    auth,
    {
      kind: requestKind,
      listing_id: listingId,
      decision: hasDecision ? decisionRaw : null,
      agent_id: lead.agent_id ? lead.agent_id.toString() : null,
      // The message itself stays in PortalEvent.metadata. Duplicating owner free
      // text into the audit payload would spread the same content across two
      // retention windows for no gain.
      message_length: message.length,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json(
    {
      ok: true,
      id: event.id.toString(),
      kind: requestKind,
      listing_id: listingId,
      // Says plainly what happens next, so the portal does not imply the listing
      // itself changed.
      message: "Your request has been recorded and sent to your agent.",
    },
    { status: 201 },
  );
}
