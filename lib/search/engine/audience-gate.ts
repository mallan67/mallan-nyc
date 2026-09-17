// THE audience gate for Search — one implementation, two consumers.
//
// WHY THIS MODULE EXISTS. The gate used to live in hydrate.ts, which meant it ran only AFTER the page was
// cut. universe.ts settled membership and counted rows with no permission predicate on the Mallan side at
// all — its query did not even SELECT a gate column — so a suppressed listing was counted and then removed,
// and the total disagreed with the page by construction (C4B).
//
// Putting the predicate here rather than importing hydrate.ts into universe.ts also keeps the dependency
// direction honest: hydrate.ts imports `UniverseRow` FROM universe.ts, so the reverse import would be a
// cycle. Both now depend on this leaf module instead, and there is exactly one spelling of
// owner_opt_out / participant_only / internet-entire-display semantics in the Search engine.
//
//   universe membership gate  →  MEMBERSHIP TRUTH   (what may be counted, ordered and paged)
//   hydration gate            →  RACE / DRIFT SAFETY (provider drift, storage changing between settle and
//                                hydrate, malformed rows, permission changes between phases)
//
// Both stay. They are the same decision applied at two moments, not two decisions.
//
// NOT lib/compliance/client-distribution.ts. That helper documents itself as CLIENT-FACING, and its
// participant_only rule would strip legitimate professional inventory out of member Search.

import { derivePermissionGates } from '@/lib/idx/trestle-mapper';
import { isOwnerOptOut, isParticipantOnly } from '@/lib/compliance/gates';

/**
 * Who receives the rows.
 *   public — the public / client-facing surfaces, including Lead-linked Search Alerts
 *   member — an authenticated REBNY participant (agent-broker Search)
 * An undeclared audience is the public: fail-closed.
 */
export type SearchAudience = 'public' | 'member';

/**
 * Provider rows. Unchanged behaviour, moved verbatim.
 *
 *   member — an authenticated REBNY participant may see a participants-only row (STEP3 ledger §13.3 — the
 *            previous gate excluded it from the one audience it exists for). Any other non-IDX token
 *            (SyndicateOptOut, OfficeInactive, …) has no definition on the provider docs and stays
 *            fail-closed for every audience until its meaning is proven.
 *
 * Note `InternetEntireListingDisplayYN === false` blocks at BOTH audiences. That is an explicit false, not
 * a null: the field is PROVIDER-GATED and fail-OPEN (`!== false`), because REBNY pre-filters the IDX Plus
 * feed and null means "the upstream filter passed this row". Never wrap it in affirmPermission — that was
 * the 2026-04-30 incident.
 */
export function providerRowPassesGate(raw: Record<string, unknown>, audience: SearchAudience = 'public'): boolean {
  if (raw.InternetEntireListingDisplayYN === false) return false;
  const p = derivePermissionGates(raw);
  if (audience === 'member') {
    const onlyIdxOrPrivate = p.permissionTokens.every((t) => t === 'IDX' || t === 'Private');
    return p.idxPermitted !== false || (p.participantOnly && onlyIdxOrPrivate);
  }
  return p.idxPermitted !== false && !p.participantOnly;
}

/**
 * Read the Mallan entire-listing display decision under either spelling.
 *
 * The same stored column reaches this gate two ways: universe.ts passes the RAW Prisma row
 * (`internet_entire_listing_display_yn`), while hydrate.ts passes a provider-shaped record where
 * mallanRecord() has already projected it to `InternetEntireListingDisplayYN` (hydrate.ts:201). One gate,
 * two shapes — so it reads both rather than forcing either caller to reshape a row just to be judged.
 *
 * The column is `Boolean NOT NULL` in schema (prisma/schema.prisma:467-473), so there is no fail-open
 * ambiguity on the Mallan side: absent means the caller did not load it, and only an explicit `false`
 * blocks. A missing value is NOT treated as false — that would fail closed on an unloaded column and
 * silently empty the universe.
 */
function mallanEntireListingDisplay(raw: Record<string, unknown>): unknown {
  return raw.internet_entire_listing_display_yn !== undefined
    ? raw.internet_entire_listing_display_yn
    : raw.InternetEntireListingDisplayYN;
}

/**
 * Mallan-authored rows. The two decisions have different reach, and that difference is the whole point:
 *
 *   owner opt-out    — blocked at EVERY audience. UCBA Art. I §5(A): no public dissemination at any time.
 *                      A member is not an exception; the owner withdrew the listing from display.
 *   participant only — blocked for the PUBLIC audience only. RLS Permissions=Private exists precisely so
 *                      authorized participants can see it.
 *   entire-listing display false — blocked at EVERY audience.
 *
 * THE THIRD RULE CLOSES A PROVEN ASYMMETRY (C4B §D). providerRowPassesGate has always blocked
 * `InternetEntireListingDisplayYN === false` for both audiences, while this gate checked only
 * owner_opt_out and participant_only — so the SAME decision, expressed in Mallan storage rather than a
 * provider field, survived where the provider's did not. No provider Permission is manufactured for a
 * Mallan row and no owner opt-out is inferred from a provider field; this reads the Mallan column the
 * Mallan writer sets.
 *
 * owner_opt_out / participant_only resolve through lib/compliance/gates.ts, which reads the typed column
 * AND the `_mallanPermission` key that mallanRecord() emits. No third interpreter.
 */
export function mallanRowPassesGate(raw: Record<string, unknown>, audience: SearchAudience = 'public'): boolean {
  if (isOwnerOptOut(raw as never)) return false;
  if (mallanEntireListingDisplay(raw) === false) return false;
  if (audience !== 'member' && isParticipantOnly(raw as never)) return false;
  return true;
}
