/**
 * DOM Tracker — Days on Market calculation + 30-day reset enforcement (UCBA 2026)
 *
 * UCBA 2026 rules:
 *   - DOM accrues only while listing is Active or ActiveUnderContract
 *   - DOM does NOT accrue during ComingSoon, Withdrawn, Cancelled, Expired
 *   - If listing is in Withdrawn/Cancelled for >= 30 consecutive days,
 *     DOM resets to 0 upon reactivation
 *   - If < 30 days in Withdrawn/Cancelled, DOM resumes where it left off
 *   - Sold/Rented = final DOM snapshot (no further accrual)
 */

/** Number of consecutive days in Withdrawn/Cancelled before DOM resets */
export const DOM_RESET_DAYS = 30;

/** Statuses where DOM actively accrues */
const DOM_ACCRUING_STATUSES = new Set(["Active", "ActiveUnderContract"]);

/** Statuses that can trigger a DOM reset after DOM_RESET_DAYS */
const DOM_RESET_ELIGIBLE_STATUSES = new Set(["Withdrawn", "Cancelled"]);

type ListingDomFields = {
  status: string;
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
 * Compute DOM update fields for a status transition.
 * Returns partial update data to spread into a Prisma update.
 */
export function computeDomTransition(
  listing: ListingDomFields,
  newStatus: string
): {
  status_changed_at: Date;
  first_active_date: Date | null;
  days_on_market: number;
  cumulative_days_on_market: number;
} {
  const now = new Date();
  const isActivating = DOM_ACCRUING_STATUSES.has(newStatus);
  const wasAccruing = DOM_ACCRUING_STATUSES.has(listing.status);

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
  if (isActivating && shouldResetDom(listing)) {
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

  if (isActivating) {
    return {
      status_changed_at: now,
      first_active_date: resetDom ? now : (listing.first_active_date ?? now),
      days_on_market: resetDom ? 0 : currentDom,
      cumulative_days_on_market: currentDom, // cumulative never resets
    };
  }

  // Moving to non-accruing status (Withdrawn, Cancelled, Expired, ComingSoon, etc.)
  return {
    status_changed_at: now,
    first_active_date: listing.first_active_date,
    days_on_market: currentDom, // freeze at current value
    cumulative_days_on_market: currentDom,
  };
}
