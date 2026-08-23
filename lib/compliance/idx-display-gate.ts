/**
 * IDX Display Gate — Centralized REBNY RLS Distribution Gate Enforcement
 *
 * COMPLIANCE CRITICAL: This module enforces ALL 6 REBNY RLS distribution gates.
 * Every listing displayed publicly (IDX context) MUST pass through these checks.
 *
 * 6 Distribution Gates (REBNY RLS / UCBA 2026):
 * 1. Owner Opt-Out (IDXEntireListingDisplayYN = false)
 * 2. Participant Only Network (flags.participantOnlyNetwork = true)
 * 3. IDX Display Opt-Out (compliance.idxOptOut = true)
 * 4. Internet Address Display (InternetAddressDisplayYN = false → suppress address)
 * 5. Coming Soon (compliance.comingSoonDate → badge required, no showings)
 * 6. Closed Status (status = 'closed' → must be removed within 24 hours)
 *
 * Penalty for violation: $40,000 damages + RLS suspension
 */

import type { Listing } from '@/lib/types/listing';

/**
 * Check if a listing is displayable in IDX (public) context.
 * Returns false for any listing that should NOT be shown publicly.
 */
export function isDisplayableInIDX(listing: Listing): boolean {
  // Gate 1: IDX opt-out — owner has opted out of IDX display
  if (listing.compliance?.idxOptOut) return false;

  // Gate 2: Internet Entire Listing Display — Cotality standard field
  if (listing.compliance?.internetEntireListingDisplayYN === false) return false;

  // Gate 3: Participant Only Network — only visible to RLS participants (broker CRM)
  if (listing.flags?.participantOnlyNetwork) return false;
  if (listing.compliance?.participantOnlyNetwork) return false;

  // Gate 4: Status must be active (or coming-soon with restrictions)
  if (listing.status !== 'active' && listing.status !== 'coming-soon') return false;

  // Gate 5: Closed listing 24-hour removal rule
  if (listing.mlsStatus === 'Closed' || listing.mlsStatus === 'Expired') return false;

  return true;
}

/**
 * Check if a listing's address can be displayed publicly.
 * Some listings opt out of showing their address on the internet.
 */
export function canDisplayAddress(listing: Listing): boolean {
  if (listing.compliance?.internetAddressDisplayYN === false) return false;
  return true;
}

/**
 * Check if a listing is in Coming Soon status with display restrictions.
 * Returns the Coming Soon date if applicable, null otherwise.
 *
 * REBNY required badge text: "Coming Soon. No Showings or Open House until [date]"
 */
export function getComingSoonDate(listing: Listing): string | null {
  if (listing.status === 'coming-soon' && listing.compliance?.comingSoonDate) {
    return listing.compliance.comingSoonDate;
  }
  return null;
}

/**
 * Format the required REBNY Coming Soon badge text.
 */
export function formatComingSoonBadge(comingSoonDate: string): string {
  const date = new Date(comingSoonDate);
  const formatted = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `Coming Soon. No Showings or Open House until ${formatted}`;
}

/**
 * Sanitize a listing for public (IDX) display by removing sensitive fields.
 * Returns a new object with private data stripped.
 *
 * Strips: private remarks, showing remarks, compensation fields,
 *         agent direct contact info, internal-only data.
 */
export function sanitizeForPublicDisplay(listing: Listing): Listing {
  const sanitized = {
    ...listing,
    privateRemarks: null,
    showingRemarks: null,
    buyer: {
      ...listing.buyer,
      buyerAgentCompensation: '',
      buyerAgentCompensationType: 'Percentage' as const,
    },
  };

  // Strip agent direct contact info from public display
  // (Public sees office/company name only, per REBNY display rules)
  if (sanitized.agent && typeof sanitized.agent === 'object') {
    const { listAgentEmail, listAgentPhone, ...safeAgent } = sanitized.agent;
    void listAgentEmail; void listAgentPhone;
    sanitized.agent = safeAgent as typeof sanitized.agent;
  }

  // Address suppression per InternetAddressDisplayYN
  if (!canDisplayAddress(listing)) {
    if (sanitized.address && typeof sanitized.address === 'object') {
      sanitized.address = {
        ...sanitized.address,
        streetNumber: '',
        streetName: 'Address Undisclosed',
        unit: '',
      };
    }
  }

  return sanitized;
}

/**
 * Check if a closed listing should be removed (24-hour rule).
 * Returns true if the listing has been closed for more than 24 hours.
 */
export function shouldRemoveClosedListing(listing: Listing): boolean {
  if (listing.mlsStatus !== 'Closed') return false;

  // If we have a close price, assume it's been sold and check timing
  if (listing.price.closePrice !== null) {
    // In production, check ModificationTimestamp against current time
    // For mock data, always remove closed listings from IDX
    return true;
  }

  return false;
}
