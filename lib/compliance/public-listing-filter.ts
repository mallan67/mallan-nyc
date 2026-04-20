// Shared Prisma where-fragment for ANY public-facing listing query.
// Enforces all REBNY §2.05 + UCBA display rules at the DB layer so a bug in one
// route can't bypass gates that another route enforces.
//
// Usage:
//   await prisma.listing.findMany({ where: { ...PUBLIC_LISTING_GATE, ...otherFilters } })
//
// Covers:
//   - 3 distribution gates (owner_opt_out, participant_only, internet_entire_listing_display_yn)
//   - REBNY §2.05 "remove within 24 hours" via terminal-status exclusion
//   - idx_display_yn=true (set by data-retention cron when a listing should no longer display)

export const TERMINAL_STATUSES = [
  'Closed',
  'Sold',
  'Rented',
  'Expired',
  'Cancelled',
  'Canceled',
  'Withdrawn',
  'TemporarilyOffMarket',
  'OwnerOptOut',
] as const;

export const PUBLIC_LISTING_GATE = {
  owner_opt_out: false,
  participant_only: false,
  internet_entire_listing_display_yn: true,
  idx_display_yn: true,
  status: { notIn: [...TERMINAL_STATUSES] },
} as const;

/**
 * Portal gate (buyer/renter/seller/landlord views). Same as public but allows
 * seller/landlord to continue to see their own listing after close for up to
 * the data-retention cutoff.
 */
export const PORTAL_LISTING_GATE = {
  owner_opt_out: false,
  participant_only: false,
  internet_entire_listing_display_yn: true,
  idx_display_yn: true,
} as const;
