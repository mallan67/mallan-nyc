// lib/email/listing-campaign-profiles.ts
// Server-side structured source of the listing-scoped campaign copy + economics.
//
// This REPLACES the former browser-side `LISTING_PROFILES` JavaScript map: the
// compose modal now hydrates its defaults from GET /api/crm/listing-campaigns, so
// the approved copy lives in one server-owned, typed place — not baked into a
// shipped bundle. Values remain fully editable in the compose screen.
//
// INTERIM HOME — this is the single source of truth until the durable, DB-backed
// listing/lease economics land (see the Slice 2 spec). The rent economics are
// modeled TEMPORALLY on purpose: a scheduled step-up is stored separately from the
// verified current in-place rent, with its own effective date, so the email never
// labels a future rent as "current" before it takes effect.

export type CampaignType = "investor" | "buyer" | "agent";

export interface ListingCampaignProfile {
  /** Which audience this listing defaults to (drives the whole compose form). */
  campaignType: CampaignType;
  /** Eyebrow label above the header (replaces the old hard-coded "1031" label). */
  campaignLabel?: string;
  /** Main marketing headline (rendered in the email). */
  headline?: string;
  subject?: string;
  intro?: string;
  benefitBullets?: string[];
  /** Building-specific ownership/board/ROFR note. Never a universal default. */
  purchaseStructure?: string | null;
  locationBlurb?: string;
  // ── Temporal economics (all editable in compose) ──
  /** Verified in-place rent today. Blank ⇒ the agent must verify it from the lease. */
  currentRent?: string | null;
  /** A future scheduled rent written into the current lease, if any. */
  scheduledRent?: string | null;
  /** Effective date of the scheduled rent (ISO or human). */
  scheduledRentEffective?: string | null;
  maintenance?: string | null;
  leaseExpiration?: string | null;
}

/**
 * Approved, listing-scoped defaults. A listing NOT present here opens blank with
 * `campaignType: "buyer"` (no investor economics, no 1031 wording) so nothing
 * leaks across listings.
 */
const PROFILES: Record<string, ListingCampaignProfile> = {
  // 333 East 46th Street, #2G — approved investor/1031 copy (Maya, 2026-07).
  "SL-0004": {
    campaignType: "investor",
    campaignLabel: "Potential 1031 Replacement Opportunity",
    headline: "Tenant-Occupied Manhattan Investment Opportunity",
    subject: "Investment Opportunity — 333 East 46th Street, #2G",
    intro: "Condo rules with co-op economics — lease from day one, no board interview.",
    benefitBullets: [
      "Leased — tenant in place, and open to renewing",
      "Low closing costs — all-cash closing runs about $7,000 for this condop vs about $12,000 for a comparable condo (roughly $5,000 less)",
    ],
    purchaseStructure:
      "Condop ownership with no board interview. The sale is subject to the building’s Right of First Refusal and issuance of the applicable waiver.",
    locationBlurb:
      "Full-service building — 24-hour doorman, live-in superintendent, laundry, and a roof deck\n" +
      "Heart of Midtown East — steps to the United Nations, transportation, and shopping",
    // Economics: the verified CURRENT in-place rent is intentionally blank — the
    // agent confirms it from the lease. $4,305/mo is the SCHEDULED rent that takes
    // effect 2026-08-15, so it is stored as `scheduledRent`, never as current.
    currentRent: "",
    scheduledRent: "$4,305/mo",
    scheduledRentEffective: "2026-08-15",
    maintenance: "$1,748.65/mo",
    leaseExpiration: "August 14, 2027",
  },
};

/** Default profile for any listing without approved copy: safe, economics-free. */
export function defaultProfile(): ListingCampaignProfile {
  return { campaignType: "buyer" };
}

/** Resolve a listing's campaign profile, or the safe default. */
export function getListingCampaignProfile(listingId: string): ListingCampaignProfile {
  return PROFILES[listingId] ?? defaultProfile();
}

export function hasListingCampaignProfile(listingId: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROFILES, listingId);
}
