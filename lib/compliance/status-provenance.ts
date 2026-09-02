/**
 * STATUS PROVENANCE — did the PROVIDER say this, or did MALLAN derive it?
 *
 * `listings.status` is a single column carrying values from two different
 * authorities, with nothing on the row to tell them apart:
 *
 *   PROVIDER-ASSERTED     copied verbatim out of a Cotality `StandardStatus`
 *                         observation by `mapTrestleToPrisma`
 *                         (`lib/idx/trestle-mapper.ts`, the `status`
 *                         assignment: `String(raw.StandardStatus || …)`).
 *   MALLAN-DERIVED        computed locally by Mallan from something that is NOT
 *                         a provider status assertion — feed ABSENCE
 *                         (`app/api/cron/feed-reconcile/route.ts`), a CRM
 *                         soft-delete (`app/api/crm/listings/[id]/route.ts`),
 *                         or an expiry clock
 *                         (`app/api/cron/listing-expiration/route.ts`).
 *
 * WHY THAT CONFLATION IS A DEFECT, NOT A TIDINESS COMPLAINT
 * ---------------------------------------------------------
 * `last_synced_from_trestle` is the repo's row-level provenance marker — it is
 * read as "this listing came from the feed" by
 * `lib/media/crm-media.ts` (`listingIsTrestleSynced`),
 * `lib/auth/listing-capabilities.ts` (`isTrestleCursorBearing`) and
 * `app/api/crm/listings/[id]/route.ts`. It is a ROW fact, not a FIELD fact.
 * When a cron stamps a locally-derived status onto such a row, the row keeps
 * saying "provider-sourced" while one of its most consequential fields no
 * longer is. Retention tiering, DB↔provider reconciliation and comps all read
 * that field as though the provider had asserted it.
 *
 * This is the same Source-vs-Visibility separation
 * `lib/listings/mallan-source-identity.ts` draws for authorship: a pure
 * classifier over EXISTING columns, no schema change, no backfill.
 *
 * ── WHAT CAN AND CANNOT BE PROVEN FROM A STORED ROW ─────────────────────────
 * PROVABLE, with no inference: the provider cannot have asserted a value it
 * does not accept. Live probe of `api.cotality.com/trestle` on 2026-08-19
 * (raw + sha256 in `.cache/cotality-authority-m2/raw/`) returned HTTP 400 —
 * "The string 'X' is not a valid enumeration type constant" — for `Cancelled`,
 * `Sold`, `Rented`, `Leased`, `TemporarilyOffMarket`, `OwnerOptOut` and
 * `Draft`. A Trestle-sourced row carrying one of those holds a Mallan-local
 * derivation, full stop.
 *
 * NOT PROVABLE from the row alone: whether a row carrying a value the provider
 * DOES accept (say `Withdrawn`) got it from an observation or from a local
 * derivation. Both writers produce the identical string. This module returns
 * `'indeterminate'` there and refuses to guess — reporting "indeterminate" is
 * the correction; the status quo silently reads those rows as provider-asserted.
 *
 * DELIBERATELY NOT INFERRED FROM POPULATION. `StandardStatus eq 'Withdrawn'`
 * answers HTTP 200 with `@odata.count` 0 today, so the live feed carries no
 * Withdrawn rows at this instant. That is a fact about NOW; it does not prove
 * what the feed carried when a given row was last synced, and turning it into
 * a per-row verdict would be exactly the kind of extrapolation CLAUDE.md §E
 * forbids. Population is evidence for a REPORT, never for a row-level claim.
 *
 * THE DURABLE PER-ROW EVIDENCE is the audit trail: `feed_reconcile_ghost_transition`
 * events carry `status_origin` (see `STATUS_ORIGIN`) from 2026-08-19 forward,
 * which is what makes future rows determinate rather than merely arguable.
 *
 * @module lib/compliance/status-provenance
 */
// Repointed 2026-08-20 from `@/lib/idx/trestle-mapper` to the shared compliance
// vocabulary, which is now the canonical home of the live provider member list.
// The old import created a lib/compliance -> lib/idx edge for a value that is
// not IDX-pipeline-specific; the vocabulary module imports nothing from lib/idx,
// so this is the acyclic direction. Same Set object either way — the mapper
// re-exports it.
import { LIVE_PROVIDER_STANDARD_STATUSES } from '@/lib/compliance/listing-status-vocabulary';
import { isMallanLocalListing } from '@/lib/listings/mallan-source-identity';

/**
 * Audit-payload vocabulary. Written into `audit_events.changes.status_origin`
 * so a later reader never has to re-derive origin from the action name.
 */
export const STATUS_ORIGIN = {
  /** The value is a Cotality `StandardStatus` we read back from the provider. */
  PROVIDER_ASSERTED: 'provider_asserted',
  /** Mallan computed the value locally; the provider never asserted it. */
  MALLAN_LOCAL_DERIVATION: 'mallan_local_derivation',
  /** Mallan-authored inventory — the provider has no opinion to conflict with. */
  MALLAN_AUTHORED: 'mallan_authored',
  /** A provider-assertable value on a feed row, with no per-row evidence either way. */
  INDETERMINATE: 'indeterminate',
} as const;

export type StatusOrigin = (typeof STATUS_ORIGIN)[keyof typeof STATUS_ORIGIN];

/**
 * The reason a Mallan-derived status was chosen. Paired with
 * `STATUS_ORIGIN.MALLAN_LOCAL_DERIVATION` in audit payloads so "derived" is
 * never recorded without saying derived FROM WHAT.
 */
export const DERIVATION_REASON = {
  /** The provider returned no record at all for this ListingId. */
  ABSENT_FROM_LICENSED_FEED: 'absent_from_licensed_live_feed',
  /** A Mallan operator removed the listing through the CRM. */
  CRM_SOFT_DELETE: 'crm_soft_delete',
  /** A Mallan-side expiration clock fired. */
  LOCAL_EXPIRATION_CLOCK: 'local_expiration_clock',
} as const;

export type DerivationReason =
  (typeof DERIVATION_REASON)[keyof typeof DERIVATION_REASON];

/**
 * Could the LIVE provider have asserted this exact string as a StandardStatus?
 *
 * TRUE only for the 11 members proven SUPPORTED (HTTP 200) by the 2026-08-19
 * probe. Everything else — including every value the provider answered HTTP 400
 * for — is FALSE. Case/whitespace variants are NOT folded here on purpose: this
 * asks about the string as STORED, and a stored `withdrawn` is not a thing the
 * provider ever sent.
 */
export function isProviderAssertableStatus(status: unknown): boolean {
  return typeof status === 'string' && LIVE_PROVIDER_STANDARD_STATUSES.has(status);
}

/** The columns needed to classify a stored row's status origin. */
export interface StatusProvenanceRow {
  status?: string | null;
  listing_id?: string | null;
  rls_eligible?: boolean | null;
  /** Row-level "this listing came from the Trestle feed" marker. */
  last_synced_from_trestle?: Date | string | null;
}

/**
 * Classify where a STORED status value came from.
 *
 * Order matters and each branch is a proof, not a heuristic:
 *
 *   1. Mallan-authored local row (`SL-`/`RL-` prefix or `rls_eligible === false`,
 *      per `lib/listings/mallan-source-identity.ts`) → MALLAN_AUTHORED. The
 *      provider has no record of it, so no provider assertion can exist.
 *   2. Never synced from the feed (`last_synced_from_trestle` null/absent) →
 *      MALLAN_AUTHORED for the same reason.
 *   3. Feed row carrying a string the provider REJECTS (HTTP 400) →
 *      MALLAN_LOCAL_DERIVATION. Proven by the probe, not inferred.
 *   4. Feed row carrying a provider-assertable string → INDETERMINATE. Both a
 *      provider observation and a local derivation produce this exact string
 *      and the row retains no discriminator. Say so; do not guess.
 *
 * This function NEVER returns PROVIDER_ASSERTED. That verdict requires evidence
 * a stored row does not carry — it is produced at WRITE time by the caller that
 * actually read the provider (see `app/api/cron/feed-reconcile/route.ts`), and
 * recorded in the audit event.
 */
export function classifyStatusOrigin(row: StatusProvenanceRow): StatusOrigin {
  if (isMallanLocalListing({ listing_id: row.listing_id, rls_eligible: row.rls_eligible })) {
    return STATUS_ORIGIN.MALLAN_AUTHORED;
  }
  if (row.last_synced_from_trestle == null) {
    return STATUS_ORIGIN.MALLAN_AUTHORED;
  }
  if (!isProviderAssertableStatus(row.status)) {
    return STATUS_ORIGIN.MALLAN_LOCAL_DERIVATION;
  }
  return STATUS_ORIGIN.INDETERMINATE;
}
