/**
 * CLIENT-FACING DISTRIBUTION ELIGIBILITY — one pure, testable decision.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The four-flag REBNY check that decides whether a listing may be pushed to a CLIENT lived inline in
 * exactly one route (`app/api/crm/listing-sends/route.ts`), while a second route that also performs a
 * client-facing write — `app/api/crm/clients/[id]/actions/route.ts` — performed no such check at all.
 *
 * The actions route was NOT missing the data. Both of its lookups are
 * `prisma.listing.findUnique({ where: … })` with no `select`, so Prisma returns every scalar column and all
 * four gate fields are already on the object. The route simply never read them. (An earlier census claimed
 * the fields were not selected; that was wrong, and the correction matters because it means no plumbing
 * change is required — only the check.)
 *
 * Copying the four booleans into a second hand-written condition would have produced the same shape this
 * repository has already been bitten by twice: two independent interpreters of one rule, free to drift.
 * `Permission` has two interpreters today (lib/idx/trestle-mapper.ts and an inline splitter in
 * lib/compliance/gates.ts) and they disagree. So the interpretation is defined once, here, and imported.
 *
 * THE BOUNDARY — deliberately narrow
 * ----------------------------------
 * This governs CLIENT-FACING distribution and action eligibility: may this listing be sent to, or acted on
 * behalf of, a CLIENT. It is NOT a universal "may distribute" rule, because professional / member contexts
 * carry different permission semantics — a participants-only listing is precisely the kind of inventory an
 * authenticated REBNY member may legitimately see while a client may not. Do not widen this helper to serve
 * member-audience decisions; add a sibling with its own name and its own tests.
 *
 * FAIL BEHAVIOUR — read this before changing a comparison operator
 * ---------------------------------------------------------------
 * The two internet flags are PROVIDER-GATED and FAIL-OPEN: only an explicit `false` blocks. REBNY
 * pre-filters non-displayable rows upstream, so a null means "displayable", and collapsing null → false is
 * exactly commit 55803f87, which suppressed 7,594 rows on 2026-04-30
 * (memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md).
 *
 * The two per-row decisions are FAIL-CLOSED on an explicit `true`.
 *
 * NOTE THE CONTRAST with the sibling module `campaign-distribution-gate.ts`, which wraps the same two
 * internet flags in `affirmPermission()` (fail-CLOSED). That is correct THERE and would be wrong HERE:
 * a campaign is outbound redistribution and is deliberately stricter, whereas this helper must preserve the
 * existing client-send behaviour exactly. Using `affirmPermission` in this module would silently tighten a
 * working path into the 2026-04-30 shape.
 *
 * INVENTS NOTHING. It reads the four fields it is given and nothing else. It does not consult the listing
 * id prefix, does not infer a provider fact, and does not substitute a default for an absent field — an
 * absent internet flag is treated as not-false (fail-open, as above), which is a stated rule rather than a
 * manufactured value.
 */

export interface ClientDistributionInput {
  /** Provider-gated, FAIL-OPEN: only an explicit false blocks. */
  idx_display_yn?: boolean | null;
  /** Provider-gated, FAIL-OPEN: only an explicit false blocks. */
  internet_entire_listing_display_yn?: boolean | null;
  /** Per-row Mallan decision, FAIL-CLOSED on explicit true. UCBA Art. I Sec. 4(A). */
  owner_opt_out?: boolean | null;
  /** Per-row decision, FAIL-CLOSED on explicit true. RLS Permissions=Private. */
  participant_only?: boolean | null;
}

export interface ClientDistributionResult {
  allowed: boolean;
  /**
   * Every violated gate, not just the first — a caller that surfaces one reason hides the rest, and an
   * operator fixing a listing needs the whole list. (The sibling campaign gate names this field `blocks`;
   * same idea.)
   */
  reasons: string[];
}

/**
 * The single refusal message for a client-facing distribution block. Preserved verbatim from
 * `app/api/crm/listing-sends/route.ts` so the extraction changes no observable behaviour.
 */
export const CLIENT_DISTRIBUTION_REFUSAL =
  'This listing is not eligible for distribution per REBNY RLS rules.';

/**
 * May this listing be distributed to, or acted on for, a client?
 * Pure — no I/O, no side effects, no defaults invented.
 */
export function evaluateClientDistributionEligibility(
  input: ClientDistributionInput,
): ClientDistributionResult {
  const reasons: string[] = [];

  // Provider-gated — explicit false only. Do NOT change to affirmPermission(); see the header.
  if (input.idx_display_yn === false) reasons.push('idx_display_yn');
  if (input.internet_entire_listing_display_yn === false) {
    reasons.push('internet_entire_listing_display_yn');
  }

  // Per-row decisions — explicit true blocks.
  if (input.owner_opt_out === true) reasons.push('owner_opt_out');
  if (input.participant_only === true) reasons.push('participant_only');

  return { allowed: reasons.length === 0, reasons };
}
