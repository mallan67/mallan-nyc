/**
 * Canonical public broker-attribution policy — ONE owner, shared by every path.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Three independent paths build a public listing view:
 *
 *   A  lib/idx/public-dto.ts            Trestle/IDXListing -> PublicListingDTO
 *   B  lib/idx/db-to-public-dto.ts      DB row             -> PublicListingDTO
 *   C  app/listing/[...slug]/page.tsx   DB row             -> inline DTO
 *
 * A and B fell back to the neutral `REBNY RLS`. C fell back to
 * `'Mallan Real Estate Inc.'` at four separate sites, publishing a FALSE CLAIM
 * OF BROKERAGE whenever a third-party listing had no office name:
 *
 *   - NY DOS 19 NYCRR §175.25 — no misleading/false/deceptive claims; the
 *     brokerage named must be the actual one.
 *   - REBNY UCBA Art. III §2(C) — attribution must identify the ACTUAL listing
 *     broker, never the displaying broker.
 *
 * `MALLAN_OFFICE_MLS_IDS` is `[]` (syndication hold), so every listing is
 * currently third-party and NOTHING may fall back to a Mallan attribution.
 * Exposure is latent rather than live only because every displayable
 * third-party listing happens to carry an office name today; the OPS-019
 * office-id migration would arm it.
 *
 * Source-specific EXTRACTION is legitimate — Trestle and the DB genuinely
 * carry different raw fields. Source-specific PUBLIC POLICY is not. This
 * module is that single policy owner.
 */

import { isMallanLocalListing, type MallanSourceIdentityRow } from '@/lib/listings/mallan-source-identity';

/**
 * The neutral attribution used when the listing office is unknown.
 *
 * Deliberately NOT a brokerage name: naming any brokerage for a listing whose
 * office we do not know is a false claim. `REBNY RLS` names the feed, which is
 * accurate and is already the value used by paths A and B
 * (`db-to-public-dto.ts:457` and `:550`).
 */
export const NEUTRAL_OFFICE_ATTRIBUTION = 'REBNY RLS';

/**
 * The brokerage name to display for a listing.
 *
 *   real office name -> that name, trimmed
 *   null/undefined/blank -> NEUTRAL_OFFICE_ATTRIBUTION
 *
 * Never returns a Mallan attribution for a listing whose office is unknown.
 */
export function publicListOfficeName(
  officeName?: string | null,
): string {
  const trimmed = typeof officeName === 'string' ? officeName.trim() : '';
  return trimmed || NEUTRAL_OFFICE_ATTRIBUTION;
}

/**
 * The public "Listing courtesy of …" line.
 *
 * Wording is kept byte-identical to `db-to-public-dto.ts:559` — divergent
 * wording between paths would itself be a parity defect.
 */
export function publicAttributionText(
  officeName?: string | null,
): string {
  return `Listing courtesy of ${publicListOfficeName(officeName)}`;
}

/**
 * The attribution line of a listing Mallan AUTHORED: an `SL-`/`RL-` row, or a website-only row (`rls_eligible === false`). Mallan is the listing broker there, so naming Mallan is the truth.
 * The wording is the one `buildSourceAndCompliance` (db-to-public-dto.ts) gives the same listing; tests/runtime/listing-attribution-policy.test.ts holds the two together.
 */
export const MALLAN_EXCLUSIVE_ATTRIBUTION = 'Exclusive listing by Mallan Real Estate Inc.';

/**
 * What a listing's attribution line says, and whether the REBNY data-provider sentence goes with it, decided from WHERE THE LISTING COMES FROM.
 *
 *   a listing Mallan authored (lib/listings/mallan-source-identity.ts isMallanLocalListing) -> MALLAN_EXCLUSIVE_ATTRIBUTION, no data-provider sentence (it is not RLS content);
 *   anything else is third-party RLS content                                              -> "Listing courtesy of <its office>" and the sentence.
 *
 * It never reads `agent_id` or `owner_client_id`. `syncAgentHistory` writes `agent_id` onto Cotality rows that match the agent on the LIST side or the BUYER side, so a third-party listing can carry
 * one; reading it as ownership would put "Exclusive listing by Mallan Real Estate Inc." on another firm's listing (UCBA Art. III §2(C), NY DOS 19 NYCRR §175.25) and drop the data-provider sentence.
 * The canonical identity is the listing id and `rls_eligible` alone (mallan-source-identity.ts: "IDENTITY IS SOURCE-FIELD ONLY").
 */
export function listingAttribution(
  row: MallanSourceIdentityRow,
  officeName?: string | null,
): { attributionText: string; disclaimerRequired: boolean } {
  if (isMallanLocalListing(row)) return { attributionText: MALLAN_EXCLUSIVE_ATTRIBUTION, disclaimerRequired: false };
  return { attributionText: publicAttributionText(officeName), disclaimerRequired: true };
}
