/**
 * Public-eligibility predicate for a LOCAL (CRM) open house — the SINGLE source
 * of truth shared by `/api/open-houses` (feed exposure) and `/api/open-houses/rsvp`
 * (RSVP→listing linkage). Codex #472 r9: the RSVP route resolved a Showing by id
 * + upcoming + not-cancelled only, so it could link a public RSVP to a listing
 * the FEED itself fails closed on (owner opt-out, participant-only, internet
 * display off, non-Mallan-owned, ineligible status) — inflating seller-report
 * counts for events the public endpoint would never show. Both call sites now
 * gate on this identical predicate so they cannot drift.
 *
 * Mirrors the feed's local branch in app/api/open-houses/route.ts: website-only
 * Mallan exclusives (rls_eligible=false) use a status-only displayable check;
 * RLS-eligible locals run the canonical evaluateDisplayGate; then both require
 * isMallanOwnedLocalListing. Pure; never throws.
 */
import { evaluateDisplayGate } from '@/lib/compliance/gates';
import { OPEN_HOUSE_ELIGIBLE_STATUSES, isMallanOwnedLocalListing } from './upcoming-open-houses';

export interface LocalOpenHouseListingGateInput {
  listing_id?: string | null;
  status: string;
  rls_eligible?: boolean | null;
  owner_opt_out?: boolean | null;
  participant_only?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  internet_address_display_yn?: boolean | null;
}

export function isLocalOpenHousePubliclyEligible(l: LocalOpenHouseListingGateInput): boolean {
  const gate =
    l.rls_eligible === false
      ? { displayable: OPEN_HOUSE_ELIGIBLE_STATUSES.includes(l.status) }
      : evaluateDisplayGate({
          status: l.status,
          owner_opt_out: l.owner_opt_out,
          participant_only: l.participant_only,
          internet_entire_listing_display_yn: l.internet_entire_listing_display_yn,
          internet_address_display_yn: l.internet_address_display_yn,
        });
  return gate.displayable && isMallanOwnedLocalListing(l);
}
