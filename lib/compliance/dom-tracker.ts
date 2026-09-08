/**
 * DOM Tracker — Days on Market calculation + 30-day reset enforcement (UCBA 2026)
 *
 * UCBA 2026 rules (Art. I, Sec. 11):
 *   - DOM accrues only while listing is Active or ActiveUnderContract
 *   - DOM does NOT accrue during ComingSoon, Withdrawn, Cancelled, Expired
 *   - DOM does NOT accrue while the listing is participant-only
 *     (even if status is Active) — UCBA 2026 explicit carve-out
 *   - If listing is in Withdrawn/Cancelled for >= 30 consecutive days,
 *     DOM resets to 0 upon reactivation
 *   - If < 30 days in Withdrawn/Cancelled, DOM resumes where it left off
 *   - DOM resets to zero on close (sold/rented) — the third reset trigger;
 *     historical exposure is retained in `cumulative_days_on_market`
 *   - Cannot circumvent by re-naming or re-listing
 *
 * PROVIDER VOCABULARY DOES NOT BELONG IN THIS FILE.
 * ------------------------------------------------
 * Cotality `Permission` is `Collection(Multi.ListingPermission)`, serialized
 * comma-joined on the wire (live examples: `IDX,OfficeInactive`,
 * `IDX,SyndicateOptOut`). It is parsed EXACTLY ONCE, at the provider boundary:
 *
 *     Permission
 *       -> enumValueTokens('Permission', raw.Permission)   [lib/cotality/live-contract.ts]
 *       -> permissionTokens.includes('Private')            [lib/idx/trestle-mapper.ts]
 *       -> listings.participant_only : boolean             [canonical Mallan fact]
 *
 * DOM consumes that typed boolean and nothing else. It previously took a raw
 * `permissions: string` and re-interpreted provider tokens with an exact-match
 * Set, which (a) could never match a multi-value value such as `IDX,Private`
 * and (b) was fed from `listing.compliance.Permissions`, a key present on 0 of
 * 26,497 production rows. Both were symptoms of one defect: the wrong
 * representation crossing this boundary. See
 * `__tests__/dom-canonical-permission.test.ts`, which fails if provider
 * vocabulary reappears here.
 */

/** Number of consecutive days in Withdrawn/Cancelled before DOM resets */
export const DOM_RESET_DAYS = 30;

/** Statuses where DOM actively accrues (subject to permissions check) */
const DOM_ACCRUING_STATUSES = new Set(["Active", "ActiveUnderContract"]);

/** Statuses that can trigger a DOM reset after DOM_RESET_DAYS */
const DOM_RESET_ELIGIBLE_STATUSES = new Set(["Withdrawn", "Cancelled"]);

/**
 * Transaction-close statuses. UCBA 2026 Art. I §11 resets DOM to zero on
 * sold/rented (Closed). `Closed` is the canonical Cotality StandardStatus
 * member; `Sold`/`Rented` are retained because Mallan storage statuses use them
 * for CRM-authored listings.
 */
const CLOSE_STATUSES = new Set(["Closed", "Sold", "Rented"]);

type ListingDomFields = {
  status: string;
  /**
   * Canonical Mallan visibility fact (`listings.participant_only`). UCBA 2026
   * carve-out: a participant-only listing accrues no DOM even while Active.
   * NOT a provider string — see the file header.
   */
  participant_only?: boolean | null;
  status_changed_at: Date | null;
  first_active_date: Date | null;
  days_on_market: number;
};

/**
 * Check if a listing has been in Withdrawn/Cancelled for >= 30 days
 * and should have its DOM reset upon reactivation.
 */
export function shouldResetDom(listing: ListingDomFields): boolean {
  if (!DOM_RESET_ELIGIBLE_STATUSES.has(listing.status)) return false;
  if (!listing.status_changed_at) return false;

  const now = new Date();
  const elapsed = Math.floor(
    (now.getTime() - listing.status_changed_at.getTime()) / (1000 * 60 * 60 * 24)
  );
  return elapsed >= DOM_RESET_DAYS;
}

/**
 * Check if DOM accrual is suppressed by the listing's visibility.
 *
 * UCBA 2026 Art. I §11: a participant-only listing does not accrue DOM even
 * while Active. ComingSoon suppression is handled on the STATUS axis
 * (`DOM_ACCRUING_STATUSES`) — status and permission are separate axes and must
 * not be collapsed.
 *
 * Takes the canonical typed fact, never a provider string.
 */
export function isDomSuppressedByVisibility(
  participantOnly: boolean | null | undefined
): boolean {
  return participantOnly === true;
}

/**
 * Compute DOM update fields for a status transition.
 * Returns partial update data to spread into a Prisma update.
 *
 * Visibility-aware: a participant-only listing does not accrue DOM even if
 * status is Active. `newParticipantOnly` is the canonical post-transition
 * value; when omitted the listing's current value carries forward.
 */
export function computeDomTransition(
  listing: ListingDomFields,
  newStatus: string,
  newParticipantOnly?: boolean | null
): {
  status_changed_at: Date;
  first_active_date: Date | null;
  days_on_market: number;
  cumulative_days_on_market: number;
} {
  const now = new Date();
  const isActivating = DOM_ACCRUING_STATUSES.has(newStatus);
  const wasAccruing =
    DOM_ACCRUING_STATUSES.has(listing.status) &&
    !isDomSuppressedByVisibility(listing.participant_only);

  // If activating but the listing is participant-only, treat as non-accruing
  const effectivelyActivating =
    isActivating &&
    !isDomSuppressedByVisibility(newParticipantOnly ?? listing.participant_only);

  // Snapshot current DOM before transition (if was accruing)
  let currentDom = listing.days_on_market;
  if (wasAccruing && listing.status_changed_at) {
    const elapsed = Math.floor(
      (now.getTime() - listing.status_changed_at.getTime()) / (1000 * 60 * 60 * 24)
    );
    currentDom = listing.days_on_market + elapsed;
  }

  // Determine if DOM resets
  let resetDom = false;
  if (effectivelyActivating && shouldResetDom(listing)) {
    resetDom = true;
  }

  // Close: the RLS DOM clock RESETS to zero. UCBA 2026 Art. I §11 lists three
  // reset triggers — 30 days Withdrawn, 30 days Cancelled, and sold/rented
  // (Closed). See data/UCBA-2026-Requirements.md:14-16. This branch previously
  // FROZE DOM at its accrued value, which is the opposite of the rule.
  //
  // `cumulative_days_on_market` retains the historical market exposure for
  // Mallan comps/reporting. That retention is Mallan's reporting layer, not a
  // REBNY mandate — REBNY's explicit reset rule speaks to DOM.
  //
  // "Closed" is the canonical Cotality StandardStatus member and is the status
  // production actually carries (6,100 rows; 0 in Sold/Rented as of the
  // 2026-09-07 census), so it must be first-class here rather than falling
  // through to the generic non-accruing return below.
  if (CLOSE_STATUSES.has(newStatus)) {
    return {
      status_changed_at: now,
      first_active_date: listing.first_active_date,
      days_on_market: 0,
      cumulative_days_on_market: currentDom,
    };
  }

  if (effectivelyActivating) {
    return {
      status_changed_at: now,
      first_active_date: resetDom ? now : (listing.first_active_date ?? now),
      days_on_market: resetDom ? 0 : currentDom,
      cumulative_days_on_market: currentDom, // cumulative never resets
    };
  }

  // Moving to non-accruing status (Withdrawn, Cancelled, Expired, ComingSoon,
  // or Active with DOM-suppressing permissions like Participant Only Network)
  return {
    status_changed_at: now,
    first_active_date: listing.first_active_date,
    days_on_market: currentDom, // freeze at current value
    cumulative_days_on_market: currentDom,
  };
}

/**
 * Read-path DOM for display (dashboards, cards, public pages).
 *
 * Returns the current UCBA-compliant days-on-market value without writing
 * anything. Honors:
 *   - Stored `days_on_market` as the accumulated base
 *   - Adds elapsed time since `status_changed_at` ONLY if currently accruing
 *   - Suppresses accrual during ComingSoon / Withdrawn / Cancelled / Expired
 *   - Suppresses accrual when the listing is participant-only (typed
 *     `listings.participant_only` — never a provider permission string)
 *   - Freezes at stored value once Sold / Rented / Closed
 *
 * Use this instead of naive (now - created_at) math. That math:
 *   (a) never resets after 30 days Withdrawn/Cancelled (UCBA Art. I §11 violation)
 *   (b) continues accruing during ComingSoon (UCBA D1/D2 violation)
 *   (c) continues accruing on participant-only listings (UCBA 2026 carve-out)
 */
export function getCurrentDom(listing: ListingDomFields): number {
  const stored = listing.days_on_market || 0;

  // Not accruing → return stored snapshot
  if (!DOM_ACCRUING_STATUSES.has(listing.status)) return stored;
  if (isDomSuppressedByVisibility(listing.participant_only)) return stored;
  if (!listing.status_changed_at) return stored;

  // Accruing → add elapsed since last transition
  const elapsed = Math.floor(
    (Date.now() - listing.status_changed_at.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, stored + elapsed);
}
