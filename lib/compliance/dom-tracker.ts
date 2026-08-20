/**
 * DOM Tracker — Days on Market calculation + 30-day reset enforcement (UCBA 2026)
 *
 * UCBA 2026 rules (Art. I, Sec. 11):
 *   - DOM accrues only while listing is Active or ActiveUnderContract
 *   - DOM does NOT accrue during ComingSoon, Withdrawn, Cancelled, Expired
 *   - DOM does NOT accrue while Permissions = "Participant Only Network"
 *     (even if status is Active) — UCBA 2026 explicit carve-out
 *   - If listing is in Withdrawn/Cancelled for >= 30 consecutive days,
 *     DOM resets to 0 upon reactivation
 *   - If < 30 days in Withdrawn/Cancelled, DOM resumes where it left off
 *   - Sold/Rented = final DOM snapshot (no further accrual)
 *   - Cannot circumvent by re-naming or re-listing
 */

import { DOM_RESET_ELIGIBLE_STATUSES } from "@/lib/compliance/listing-status-vocabulary";

/** Number of consecutive days in Withdrawn/Cancelled before DOM resets */
export const DOM_RESET_DAYS = 30;

/** Statuses where DOM actively accrues (subject to permissions check) */
const DOM_ACCRUING_STATUSES = new Set(["Active", "ActiveUnderContract"]);

// ── DOM_RESET_ELIGIBLE_STATUSES IS IMPORTED, NOT DECLARED HERE ─────────────
//
// It used to be the literal `new Set(["Withdrawn", "Cancelled"])`. Omitting the
// provider's own spelling `Canceled` was a live UCBA 2026 Art. I §11 failure —
// exactly the outcome the `getCurrentDom` doc block at the bottom of this file
// warns about. `mapTrestleToPrisma` stores `raw.StandardStatus` VERBATIM, so a
// provider cancellation lands in `listings.status` spelled `Canceled`, and this
// exact-case Set never matched it. Proven by execution before the fix:
//
//   shouldResetDom({status:'Cancelled', status_changed_at:-60d, dom:42}) === true
//   shouldResetDom({status:'Canceled',  ...identical...})                === false
//
// The provider row therefore never reset its DOM on reactivation while the
// identical CRM-authored row did. Importing the shared set makes the two
// spellings indistinguishable here BY CONSTRUCTION rather than by an author
// remembering to list both — see `lib/compliance/listing-status-vocabulary.ts`.
// Re-exported so the daily `dom-reset` cron reads the same object rather than
// a tenth hand-copied duplicate.
export { DOM_RESET_ELIGIBLE_STATUSES };

/** Permissions values that suppress DOM accrual even when status is Active */
const DOM_SUPPRESSING_PERMISSIONS = new Set([
  "Participant Only Network",
  "Private",
]);

type ListingDomFields = {
  status: string;
  permissions?: string | null;
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
 * Check if DOM accrual is suppressed by permissions.
 * UCBA 2026: "Coming Soon" and "Participant Only Network" do NOT accrue DOM.
 */
export function isDomSuppressedByPermissions(
  permissions: string | null | undefined
): boolean {
  if (!permissions) return false;
  return DOM_SUPPRESSING_PERMISSIONS.has(permissions);
}

/**
 * Compute DOM update fields for a status transition.
 * Returns partial update data to spread into a Prisma update.
 *
 * Permissions-aware: if listing has DOM-suppressing permissions
 * (Participant Only Network), DOM does not accrue even if status is Active.
 */
export function computeDomTransition(
  listing: ListingDomFields,
  newStatus: string,
  newPermissions?: string | null
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
    !isDomSuppressedByPermissions(listing.permissions);

  // If activating but permissions suppress DOM, treat as non-accruing
  const effectivelyActivating =
    isActivating &&
    !isDomSuppressedByPermissions(newPermissions ?? listing.permissions);

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

  // Sold/Rented: freeze DOM at current value
  if (newStatus === "Sold" || newStatus === "Rented") {
    return {
      status_changed_at: now,
      first_active_date: listing.first_active_date,
      days_on_market: currentDom,
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
 *   - Suppresses accrual when permissions are "Participant Only Network" / "Private"
 *   - Freezes at stored value once Sold / Rented / Closed
 *
 * Use this instead of naive (now - created_at) math. That math:
 *   (a) never resets after 30 days Withdrawn/Cancelled (UCBA Art. I §11 violation)
 *   (b) continues accruing during ComingSoon (UCBA D1/D2 violation)
 *   (c) continues accruing on Participant Only Network listings (UCBA 2026 carve-out)
 */
export function getCurrentDom(listing: ListingDomFields): number {
  const stored = listing.days_on_market || 0;

  // Not accruing → return stored snapshot
  if (!DOM_ACCRUING_STATUSES.has(listing.status)) return stored;
  if (isDomSuppressedByPermissions(listing.permissions)) return stored;
  if (!listing.status_changed_at) return stored;

  // Accruing → add elapsed since last transition
  const elapsed = Math.floor(
    (Date.now() - listing.status_changed_at.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, stored + elapsed);
}
