/**
 * MALLAN PUBLICATION / REVIEW STATE — the single server-owned state machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `Listing.status`
 *
 * `Listing.status` answers a COTALITY question: what is happening to this
 * property in the market? Its vocabulary is the provider's, and the provider's
 * alone — `Property.StandardStatus` has exactly eleven members (Active,
 * ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold,
 * Incomplete, Pending, Withdrawn) and Mallan may not add to it.
 *
 * This module answers a MALLAN question: has this listing been submitted,
 * reviewed, compliance-checked, approved, and published — and to whom?
 *
 * They are different questions with different authorities, and they must not
 * overwrite each other. A listing can be `Active` in the market while its
 * Mallan publication state is `REVISION_REQUESTED`; it can be `APPROVED` here
 * and still hold whatever market status the provider reports.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTRACT IS THE SPECIFICATION'S, NOT THIS FILE'S
 *
 * States, the canonical workflow, the visibility modes and the role baselines
 * below are transcribed from the frontend↔backend conformance specification.
 * They are not reconstructed and not invented. Where the spec is silent this
 * module fails CLOSED rather than choosing.
 *
 * The spec is explicit that skipping is a blocker: "backend allows skipping
 * steps (e.g., export before approval) → FAIL (BLOCKER)". Every transition here
 * is therefore enumerated; anything not enumerated is refused.
 *
 * It is equally explicit about who publishes. Step 6 of the canonical workflow
 * reads "Broker chooses publishing scope", and the Agent baseline says an agent
 * may "not export to IDX/RLS/VOW or external channels without Broker approval".
 * An earlier pass of this work recorded agent-publishes-directly as a harmless
 * product choice. That was wrong against this source: it is a skipped step.
 *
 * Seller/Landlord may "Submit listing intake form", "View/edit their own draft
 * submissions" and "See review status + requested changes", and explicitly
 * "Cannot publish or export". So an owner appears exactly twice in the matrix:
 * submitting, and resubmitting after a revision request.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE IT IS STORED
 *
 * One namespaced object inside the existing `Listing.compliance` JSON column —
 * `compliance.mallan_publication`. No schema migration. That column was chosen
 * only after proving every lane preserves it; see
 * tests/runtime/publication-state-namespace-preservation.test.ts, which pins
 * each lane individually.
 *
 * `custom_fields` was rejected: it is documented as agent-defined data and
 * cannot hold an authority the server enforces.
 */

// ── STATES ───────────────────────────────────────────────────────────────────

/** The exact eleven states named by the specification, in workflow order. */
export const PUBLICATION_STATES = [
  "DRAFT",
  "SUBMITTED",
  "REVIEW_IN_PROGRESS",
  "REVISION_REQUESTED",
  "COMPLIANCE_CHECK",
  "APPROVED",
  "PUBLISHED_INTERNAL",
  "PUBLISHED_PUBLIC",
  "EXPORTED",
  "REJECTED",
  "ARCHIVED",
] as const;

export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** The exact four visibility modes named by the specification. */
export const VISIBILITY_MODES = [
  "INTERNAL_ONLY",
  "PRIVATE_CLIENT",
  "PUBLIC_WEB",
  "DISTRIBUTION_ELIGIBLE",
] as const;

export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

/**
 * Who may execute a transition.
 *
 *   BROKER  — the spec's "Broker (Admin)": full CRUD, approves/rejects
 *             compliance, enables distribution exports.
 *   AGENT   — may create and edit listings they are assigned to.
 *   OWNER   — the Seller/Landlord Lead linked by `Listing.owner_client_id`.
 *
 * A Buyer/Renter appears nowhere: the spec gives them no listing-workflow role
 * at all.
 */
export type PublicationActorRole = "BROKER" | "AGENT" | "OWNER";

/**
 * VISIBILITY IS CONSTRAINED BY STATE, NOT FREELY CHOSEN.
 *
 * Everything before publication is `INTERNAL_ONLY` — the spec defines that mode
 * as "Broker + assigned Agent only", which is exactly what an unapproved listing
 * is. Only the two published states open anything up, and only `EXPORTED`
 * reaches `DISTRIBUTION_ELIGIBLE` ("can be exported, but only after approval").
 *
 * `PRIVATE_CLIENT` ("specific Buyer/Renter access; typically VOW/member-only")
 * is reachable only from `PUBLISHED_INTERNAL`: it is a deliberate, narrower
 * alternative to the public web, not a step on the way to it.
 */
const ALLOWED_VISIBILITY: Record<PublicationState, readonly VisibilityMode[]> = {
  DRAFT: ["INTERNAL_ONLY"],
  SUBMITTED: ["INTERNAL_ONLY"],
  REVIEW_IN_PROGRESS: ["INTERNAL_ONLY"],
  REVISION_REQUESTED: ["INTERNAL_ONLY"],
  COMPLIANCE_CHECK: ["INTERNAL_ONLY"],
  APPROVED: ["INTERNAL_ONLY"],
  PUBLISHED_INTERNAL: ["INTERNAL_ONLY", "PRIVATE_CLIENT"],
  PUBLISHED_PUBLIC: ["PUBLIC_WEB"],
  EXPORTED: ["DISTRIBUTION_ELIGIBLE"],
  REJECTED: ["INTERNAL_ONLY"],
  ARCHIVED: ["INTERNAL_ONLY"],
};

/** The visibility a state takes unless the actor picks another allowed one. */
const DEFAULT_VISIBILITY: Record<PublicationState, VisibilityMode> = {
  DRAFT: "INTERNAL_ONLY",
  SUBMITTED: "INTERNAL_ONLY",
  REVIEW_IN_PROGRESS: "INTERNAL_ONLY",
  REVISION_REQUESTED: "INTERNAL_ONLY",
  COMPLIANCE_CHECK: "INTERNAL_ONLY",
  APPROVED: "INTERNAL_ONLY",
  PUBLISHED_INTERNAL: "INTERNAL_ONLY",
  PUBLISHED_PUBLIC: "PUBLIC_WEB",
  EXPORTED: "DISTRIBUTION_ELIGIBLE",
  REJECTED: "INTERNAL_ONLY",
  ARCHIVED: "INTERNAL_ONLY",
};

/** Only these two states put a listing in front of the public. */
const PUBLIC_STATES: ReadonlySet<PublicationState> = new Set<PublicationState>([
  "PUBLISHED_PUBLIC",
  "EXPORTED",
]);

/** Only these two visibility modes put a listing in front of the public. */
const PUBLIC_VISIBILITY: ReadonlySet<VisibilityMode> = new Set<VisibilityMode>([
  "PUBLIC_WEB",
  "DISTRIBUTION_ELIGIBLE",
]);

// ── TRANSITIONS ──────────────────────────────────────────────────────────────

export interface TransitionRule {
  readonly to: PublicationState;
  /** Roles permitted to execute it. Anything absent is refused. */
  readonly actors: readonly PublicationActorRole[];
  /** Why this transition exists, in the specification's terms. */
  readonly why: string;
  /** True when the transition requires a passing compliance evaluation. */
  readonly requiresCompliancePass?: boolean;
  /** True when the transition requires the listing to have a canonical owner. */
  readonly requiresOwner?: boolean;
  /**
   * True when the transition asserts that something left this system and was
   * accepted by an external party. Such a transition may NEVER complete on
   * bookkeeping alone — see EXPORTED below.
   */
  readonly requiresDeliveryEvidence?: boolean;
}

/**
 * THE CANONICAL WORKFLOW, transcribed from the specification:
 *
 *   1) Seller/Landlord or Agent creates listing        → DRAFT
 *   2) Submit                                          → SUBMITTED
 *   3) Broker/Agent review  → REVIEW_IN_PROGRESS or REVISION_REQUESTED
 *   4) Compliance validation (Fair Housing + RLS ruleset + NY ads)
 *                                                      → COMPLIANCE_CHECK
 *   5) If pass                                         → APPROVED
 *   6) Broker chooses publishing scope:
 *        Internal only  → PUBLISHED_INTERNAL
 *        Public site    → PUBLISHED_PUBLIC
 *   7) Optional: distribution exports, channel by channel → EXPORTED
 *
 * Anything not listed here is refused. That is the point: the spec marks
 * "backend allows skipping steps (e.g., export before approval)" as a BLOCKER,
 * so an allow-list is the only shape that satisfies it.
 */
export const PUBLICATION_TRANSITIONS: Record<PublicationState, readonly TransitionRule[]> = {
  DRAFT: [
    {
      to: "SUBMITTED",
      actors: ["AGENT", "BROKER", "OWNER"],
      // The spec's step 1 names Seller/Landlord OR Agent as the creator, and the
      // Seller/Landlord baseline is explicitly allowed to "Submit listing intake
      // form" — so an owner may submit their own.
      why: "step 2 — submit for review",
      // An ownerless listing cannot be reviewed toward publication: the owner
      // link is the only path by which a seller or landlord reaches their own
      // listing, and publication without one publishes a property whose owner
      // can never see it.
      requiresOwner: true,
    },
    { to: "ARCHIVED", actors: ["BROKER"], why: "abandon a draft" },
  ],

  SUBMITTED: [
    { to: "REVIEW_IN_PROGRESS", actors: ["AGENT", "BROKER"], why: "step 3 — begin review" },
    { to: "REVISION_REQUESTED", actors: ["AGENT", "BROKER"], why: "step 3 — send back for changes" },
    { to: "ARCHIVED", actors: ["BROKER"], why: "withdraw from the workflow" },
  ],

  REVIEW_IN_PROGRESS: [
    { to: "COMPLIANCE_CHECK", actors: ["AGENT", "BROKER"], why: "step 4 — run compliance validation" },
    { to: "REVISION_REQUESTED", actors: ["AGENT", "BROKER"], why: "step 3 — send back for changes" },
    { to: "ARCHIVED", actors: ["BROKER"], why: "withdraw from the workflow" },
  ],

  REVISION_REQUESTED: [
    {
      to: "SUBMITTED",
      actors: ["AGENT", "BROKER", "OWNER"],
      // The owner may "view/edit their own draft submissions" and "see review
      // status + requested changes" — resubmitting after fixing them is the
      // action those two capabilities exist for.
      why: "resubmit after addressing the requested changes",
      requiresOwner: true,
    },
    { to: "ARCHIVED", actors: ["BROKER"], why: "abandon after revision request" },
  ],

  COMPLIANCE_CHECK: [
    {
      to: "APPROVED",
      // "Approve/reject compliance" is a BROKER baseline permission. An agent
      // may run the check; only a broker may accept its result.
      actors: ["BROKER"],
      why: "step 5 — compliance passed",
      requiresCompliancePass: true,
      requiresOwner: true,
    },
    { to: "REJECTED", actors: ["BROKER"], why: "step 5 — compliance failed" },
    { to: "REVISION_REQUESTED", actors: ["AGENT", "BROKER"], why: "fixable compliance findings" },
  ],

  APPROVED: [
    {
      to: "PUBLISHED_INTERNAL",
      // Step 6: "Broker chooses publishing scope". Not the agent.
      actors: ["BROKER"],
      why: "step 6 — publish internally",
      requiresCompliancePass: true,
      requiresOwner: true,
    },
    {
      to: "PUBLISHED_PUBLIC",
      actors: ["BROKER"],
      why: "step 6 — publish to the public site",
      requiresCompliancePass: true,
      requiresOwner: true,
    },
    { to: "REVISION_REQUESTED", actors: ["AGENT", "BROKER"], why: "withdraw approval for changes" },
    { to: "ARCHIVED", actors: ["BROKER"], why: "archive before publishing" },
  ],

  PUBLISHED_INTERNAL: [
    {
      to: "PUBLISHED_PUBLIC",
      actors: ["BROKER"],
      why: "step 6 — widen scope to the public site",
      requiresCompliancePass: true,
      requiresOwner: true,
    },
    { to: "REVISION_REQUESTED", actors: ["AGENT", "BROKER"], why: "pull back for changes" },
    { to: "ARCHIVED", actors: ["BROKER"], why: "end internal publication" },
  ],

  PUBLISHED_PUBLIC: [
    {
      to: "EXPORTED",
      // Step 7. An agent may not export "without Broker approval", and the spec
      // marks export-before-approval a BLOCKER — which is why EXPORTED is
      // reachable only from a published state.
      //
      // EXPORTED CANNOT BE FABRICATED. It is a claim that a listing left this
      // system and an external party accepted it. Mallan has no authorized
      // outbound exporter and no delivery-acknowledgement channel today, and
      // external distribution activation is held. Approval is not delivery;
      // public visibility is not delivery; DISTRIBUTION_ELIGIBLE is not
      // delivery. So this transition demands EVIDENCE of an actual completed
      // delivery, which nothing in the current runtime can produce — and that
      // is the correct, truthful outcome rather than a state a broker can click
      // into. See EXPORT_DELIVERY_UNAVAILABLE.
      actors: ["BROKER"],
      why: "step 7 — distribution export (requires real delivery evidence)",
      requiresCompliancePass: true,
      requiresOwner: true,
      requiresDeliveryEvidence: true,
    },
    { to: "PUBLISHED_INTERNAL", actors: ["BROKER"], why: "narrow scope back to internal" },
    { to: "REVISION_REQUESTED", actors: ["AGENT", "BROKER"], why: "pull back for changes" },
    { to: "ARCHIVED", actors: ["BROKER"], why: "end public publication" },
  ],

  EXPORTED: [
    { to: "PUBLISHED_PUBLIC", actors: ["BROKER"], why: "stop distribution, stay public" },
    { to: "ARCHIVED", actors: ["BROKER"], why: "end distribution and publication" },
  ],

  REJECTED: [
    { to: "DRAFT", actors: ["AGENT", "BROKER"], why: "start again after rejection" },
    { to: "ARCHIVED", actors: ["BROKER"], why: "abandon after rejection" },
  ],

  // Terminal. Re-entering the workflow means a new listing, not a resurrection.
  ARCHIVED: [],
};

/** Timestamp key recorded when a state is entered. */
const ENTERED_AT: Partial<Record<PublicationState, string>> = {
  SUBMITTED: "submitted_at",
  REVIEW_IN_PROGRESS: "review_started_at",
  REVISION_REQUESTED: "revision_requested_at",
  COMPLIANCE_CHECK: "compliance_checked_at",
  APPROVED: "approved_at",
  PUBLISHED_INTERNAL: "published_internal_at",
  PUBLISHED_PUBLIC: "published_public_at",
  EXPORTED: "exported_at",
  REJECTED: "rejected_at",
  ARCHIVED: "archived_at",
};

/** Actor key recorded alongside the decisive transitions. */
const ACTOR_KEY: Partial<Record<PublicationState, string>> = {
  SUBMITTED: "submitted_by",
  APPROVED: "approved_by",
  PUBLISHED_INTERNAL: "published_by",
  PUBLISHED_PUBLIC: "published_by",
  EXPORTED: "exported_by",
  REJECTED: "rejected_by",
};

// ── THE STORED SHAPE ─────────────────────────────────────────────────────────

export interface PublicationHistoryEntry {
  from: PublicationState | null;
  to: PublicationState;
  at: string;
  by: string;
  role: PublicationActorRole;
  note?: string;
}

export interface MallanPublication {
  state: PublicationState;
  visibility: VisibilityMode;
  history: PublicationHistoryEntry[];
  [timestampOrActor: string]: unknown;
}

/** The namespace key inside `Listing.compliance`. One place, named once. */
export const PUBLICATION_NAMESPACE = "mallan_publication" as const;

/**
 * The state of a listing that has no publication record yet.
 *
 * Every existing row is exactly this: `DRAFT` / `INTERNAL_ONLY`. That is the
 * fail-closed reading — a listing nobody has submitted has not been approved,
 * and an un-approved listing is internal. No backfill is required or performed.
 */
export function initialPublication(): MallanPublication {
  return { state: "DRAFT", visibility: "INTERNAL_ONLY", history: [] };
}

function isState(v: unknown): v is PublicationState {
  return typeof v === "string" && (PUBLICATION_STATES as readonly string[]).includes(v);
}

function isVisibility(v: unknown): v is VisibilityMode {
  return typeof v === "string" && (VISIBILITY_MODES as readonly string[]).includes(v);
}

/**
 * Read the publication record off a `Listing.compliance` value.
 *
 * Fail-closed on every unreadable shape: a missing namespace, a non-object
 * compliance column, an unknown state string, or a visibility the state does not
 * permit all resolve to an unpublished DRAFT rather than to something more
 * permissive. A row we cannot read is never a row we publish.
 */
export function readPublication(compliance: unknown): MallanPublication {
  if (!compliance || typeof compliance !== "object" || Array.isArray(compliance)) {
    return initialPublication();
  }
  const ns = (compliance as Record<string, unknown>)[PUBLICATION_NAMESPACE];
  if (!ns || typeof ns !== "object" || Array.isArray(ns)) return initialPublication();

  const raw = ns as Record<string, unknown>;
  if (!isState(raw.state)) return initialPublication();

  const state = raw.state;
  const visibility =
    isVisibility(raw.visibility) && ALLOWED_VISIBILITY[state].includes(raw.visibility)
      ? raw.visibility
      : DEFAULT_VISIBILITY[state];

  return {
    ...raw,
    state,
    visibility,
    history: Array.isArray(raw.history) ? (raw.history as PublicationHistoryEntry[]) : [],
  };
}

// ── DECISIONS ────────────────────────────────────────────────────────────────

export interface TransitionRequest {
  to: PublicationState;
  role: PublicationActorRole;
  /** Stable identifier of the acting principal, for history and audit. */
  actorId: string;
  /** Chosen visibility; must be permitted by the target state. */
  visibility?: VisibilityMode;
  /** Result of the compliance evaluation for the target audience. */
  compliancePassed?: boolean;
  /** Whether the listing has a canonical owner. */
  hasOwner?: boolean;
  /**
   * Evidence that an authorized exporter actually delivered this listing to an
   * external channel and the channel acknowledged it. There is no such exporter
   * today, so no caller can honestly supply this.
   */
  deliveryEvidence?: {
    channel: string;
    deliveredAt: string;
    acknowledgementRef: string;
  } | null;
  note?: string;
  /** ISO timestamp; injected so the caller owns the clock. */
  now: string;
}

export type TransitionRefusal = {
  ok: false;
  code:
    | "UNKNOWN_TARGET_STATE"
    | "TRANSITION_NOT_ALLOWED"
    | "ACTOR_NOT_PERMITTED"
    | "COMPLIANCE_NOT_PASSED"
    | "OWNER_REQUIRED"
    | "VISIBILITY_NOT_ALLOWED"
    | "EXPORT_DELIVERY_UNAVAILABLE";
  message: string;
  from: PublicationState;
  to: string;
  /** Transitions the caller COULD make from here, for a useful error. */
  allowed: PublicationState[];
};

export type TransitionSuccess = {
  ok: true;
  publication: MallanPublication;
  from: PublicationState;
  to: PublicationState;
  visibility: VisibilityMode;
  /** Payload for the audit event; the caller writes it. */
  audit: Record<string, unknown>;
};

/**
 * Evaluate a requested transition. PURE — no I/O, no clock, no database.
 *
 * The caller supplies the current record, the request, and the facts the rules
 * depend on (compliance result, owner presence). This function decides, and
 * returns either a refusal with a machine-readable code or the exact object to
 * persist. Keeping it pure is what lets the whole matrix be tested directly
 * instead of through nine route fixtures.
 */
export function applyPublicationTransition(
  current: MallanPublication,
  req: TransitionRequest,
): TransitionRefusal | TransitionSuccess {
  const from = current.state;
  const allowedRules = PUBLICATION_TRANSITIONS[from] ?? [];
  const allowed = allowedRules.map((r) => r.to);

  if (!isState(req.to)) {
    return {
      ok: false,
      code: "UNKNOWN_TARGET_STATE",
      message: `"${req.to}" is not a Mallan publication state.`,
      from,
      to: String(req.to),
      allowed,
    };
  }

  const rule = allowedRules.find((r) => r.to === req.to);
  if (!rule) {
    return {
      ok: false,
      code: "TRANSITION_NOT_ALLOWED",
      message: `${from} → ${req.to} is not a step in the publication workflow.`,
      from,
      to: req.to,
      allowed,
    };
  }

  if (!rule.actors.includes(req.role)) {
    return {
      ok: false,
      code: "ACTOR_NOT_PERMITTED",
      message: `${req.role} may not perform ${from} → ${req.to}. Permitted: ${rule.actors.join(", ")}.`,
      from,
      to: req.to,
      allowed,
    };
  }

  if (rule.requiresOwner && req.hasOwner !== true) {
    return {
      ok: false,
      code: "OWNER_REQUIRED",
      message:
        "This listing has no owner. Assign the seller or landlord client before continuing.",
      from,
      to: req.to,
      allowed,
    };
  }

  if (rule.requiresDeliveryEvidence) {
    const ev = req.deliveryEvidence;
    const complete =
      !!ev &&
      typeof ev.channel === "string" && ev.channel.trim() !== "" &&
      typeof ev.deliveredAt === "string" && ev.deliveredAt.trim() !== "" &&
      typeof ev.acknowledgementRef === "string" && ev.acknowledgementRef.trim() !== "";
    if (!complete) {
      return {
        ok: false,
        code: "EXPORT_DELIVERY_UNAVAILABLE",
        message:
          "This listing cannot be marked exported. Mallan has no authorized outbound " +
          "exporter and no delivery acknowledgement, so there is nothing to record. " +
          "Approval and public visibility are not delivery.",
        from,
        to: req.to,
        allowed,
      };
    }
  }

  if (rule.requiresCompliancePass && req.compliancePassed !== true) {
    return {
      ok: false,
      code: "COMPLIANCE_NOT_PASSED",
      message: `${from} → ${req.to} requires a passing compliance evaluation for the target audience.`,
      from,
      to: req.to,
      allowed,
    };
  }

  const visibility = req.visibility ?? DEFAULT_VISIBILITY[req.to];
  if (!ALLOWED_VISIBILITY[req.to].includes(visibility)) {
    return {
      ok: false,
      code: "VISIBILITY_NOT_ALLOWED",
      message: `${req.to} does not permit visibility ${visibility}. Permitted: ${ALLOWED_VISIBILITY[req.to].join(", ")}.`,
      from,
      to: req.to,
      allowed,
    };
  }

  const entry: PublicationHistoryEntry = {
    from,
    to: req.to,
    at: req.now,
    by: req.actorId,
    role: req.role,
    ...(req.note ? { note: req.note } : {}),
  };

  const publication: MallanPublication = {
    ...current,
    state: req.to,
    visibility,
    // APPEND. Publication history is evidence of who approved what and when;
    // it is never rewritten, and a later withdrawal does not erase the fact
    // that the listing was once published.
    history: [...current.history, entry],
  };

  const tsKey = ENTERED_AT[req.to];
  if (tsKey) publication[tsKey] = req.now;
  const actorKey = ACTOR_KEY[req.to];
  if (actorKey) publication[actorKey] = req.actorId;

  return {
    ok: true,
    publication,
    from,
    to: req.to,
    visibility,
    audit: {
      publication_from: from,
      publication_to: req.to,
      visibility,
      actor_role: req.role,
      actor_id: req.actorId,
      ...(req.note ? { note: req.note } : {}),
    },
  };
}

// ── QUERIES ──────────────────────────────────────────────────────────────────

/** True when this state puts the listing in front of the public. */
export function isPublicPublicationState(state: PublicationState): boolean {
  return PUBLIC_STATES.has(state);
}

/** True when this visibility mode puts the listing in front of the public. */
export function isPublicVisibility(visibility: VisibilityMode): boolean {
  return PUBLIC_VISIBILITY.has(visibility);
}

/**
 * The single question every public reader should ask of publication state.
 *
 * Fail-closed by construction: it requires BOTH a public state and a public
 * visibility mode, so a record that is unreadable, partially written, or in any
 * pre-publication state is not public.
 */
export function isPubliclyPublished(pub: MallanPublication): boolean {
  return isPublicPublicationState(pub.state) && isPublicVisibility(pub.visibility);
}

/**
 * THE LATEST real Mallan public-publication transition, or null.
 *
 * "Last Published" means the MOST RECENT time this listing was published to the
 * public — not the first. A listing published in March, withdrawn in April and
 * republished in July was last published in July, and saying "March" would be as
 * wrong as showing a sync timestamp.
 *
 * NEVER a provider or database timestamp. `last_synced_from_trestle`, provider
 * `ModificationTimestamp` and row `updated_at` all describe when the PROVIDER or
 * the DATABASE last moved, not when MALLAN published. The CRM's "Last Published"
 * card previously fell through to exactly those and displayed a sync as a
 * publication.
 *
 * The history scan walks BACKWARDS on purpose. An earlier version of this
 * function used `history.find(...)`, which returns the FIRST match — so a
 * republished listing would have reported its original publication date forever.
 */
export function lastPublishedAt(pub: MallanPublication): string | null {
  const direct = pub.published_public_at;
  if (typeof direct === "string" && direct) return direct;
  for (let i = pub.history.length - 1; i >= 0; i--) {
    if (pub.history[i].to === "PUBLISHED_PUBLIC") return pub.history[i].at;
  }
  return null;
}

/**
 * The FIRST time this listing was ever published publicly, or null.
 *
 * Separate from `lastPublishedAt` because they answer different questions and
 * conflating them is the defect above. Exported for a caller that genuinely
 * needs "has this ever been public, and since when" — not for "Last Published".
 */
export function firstPublishedAt(pub: MallanPublication): string | null {
  const first = pub.history.find((h) => h.to === "PUBLISHED_PUBLIC");
  return first ? first.at : null;
}

/** Write the record back into a `Listing.compliance` value, preserving siblings. */
export function withPublication(
  compliance: unknown,
  publication: MallanPublication,
): Record<string, unknown> {
  const base =
    compliance && typeof compliance === "object" && !Array.isArray(compliance)
      ? (compliance as Record<string, unknown>)
      : {};
  return { ...base, [PUBLICATION_NAMESPACE]: publication };
}
