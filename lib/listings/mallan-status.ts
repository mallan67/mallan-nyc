/**
 * MALLAN STATUS DOMAIN — separate from the Cotality status domain.
 *
 * Three domains, kept apart (Packet 2 closure, round 3):
 *   CRM WORKFLOW        — what the agent picks in the form (OfferOut, AppAccepted, LeaseSigned, …).
 *                         lib/crm/status-mapping.ts maps it to a Mallan business status.
 *   MALLAN STATUS       — the `listings.status` column vocabulary (this module). Mallan's own
 *                         lifecycle: it holds Mallan-only values (Draft, Sold, Rented, Cancelled) and
 *                         the Mallan storage spelling of provider statuses.
 *   COTALITY STATUS     — the live StandardStatus enum (lib/cotality/live-contract.ts). ONLY exact
 *                         live members may ever appear under a provider-named field
 *                         (StandardStatus / MlsStatus), in raw_data or in a provider-shaped record.
 *
 * Verified provider semantics (live probes 2026-09-05/06, api.cotality.com):
 *   - closed sales AND closed rentals carry StandardStatus 'Closed' (374,786 ResidentialLease Closed rows);
 *   - a rental with an application / lease in progress is StandardStatus 'Pending' live (352 rows);
 *     'ActiveUnderContract' has 0 live rental rows (it is a live member, used by sales);
 *   - 'Canceled' has 0 live rows today; the live spelling is single-L;
 *   - MlsStatus is null on every sampled Closed / Pending row and is not filterable — StandardStatus is
 *     the populated provider status fact on this feed.
 * A Mallan stage with no verified provider counterpart (Draft) has NO provider representation.
 */
import { COTALITY_STANDARD_STATUS_MEMBERS, isCotalityStandardStatus } from '@/lib/cotality/live-contract';

/** The `listings.status` vocabulary (Mallan storage). */
export const MALLAN_STORAGE_STATUSES = Object.freeze([
  'Draft', 'Incomplete', 'ComingSoon', 'Active', 'ActiveUnderContract', 'Pending', 'Hold',
  'Closed', 'Sold', 'Rented', 'Leased', 'Withdrawn', 'Expired', 'Cancelled', 'Delete',
] as const);
export type MallanStorageStatus = typeof MALLAN_STORAGE_STATUSES[number];
const STORAGE_SET = new Set<string>(MALLAN_STORAGE_STATUSES);
export function isMallanStorageStatus(v: unknown): v is MallanStorageStatus {
  return typeof v === 'string' && STORAGE_SET.has(v);
}

/** Mallan-only statuses: never a live Cotality member, never written under a provider field name. */
export const MALLAN_ONLY_STATUSES: readonly string[] = Object.freeze(
  MALLAN_STORAGE_STATUSES.filter((s) => !COTALITY_STANDARD_STATUS_MEMBERS.includes(s)),
);

/** Terminal (no longer marketed) Mallan storage statuses — the §2.05 / retention set. */
export const MALLAN_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'Delete',
]);
/** Publicly marketable Mallan storage statuses. */
export const MALLAN_ACTIVE_STATUSES: ReadonlySet<string> = new Set(['Active', 'ActiveUnderContract', 'ComingSoon']);
/** Internal lifecycle statuses (never publicly displayable, not terminal). */
export const MALLAN_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set(['Draft', 'Incomplete', 'Pending', 'Hold']);

/**
 * Live Cotality StandardStatus member → Mallan storage status. Exact for every member except the
 * established Mallan storage spelling 'Cancelled' for the live 'Canceled'.
 */
const COTALITY_TO_MALLAN: Readonly<Record<string, MallanStorageStatus>> = Object.freeze({
  Active: 'Active',
  ActiveUnderContract: 'ActiveUnderContract',
  Canceled: 'Cancelled',
  Closed: 'Closed',
  ComingSoon: 'ComingSoon',
  Delete: 'Delete',
  Expired: 'Expired',
  Hold: 'Hold',
  Incomplete: 'Incomplete',
  Pending: 'Pending',
  Withdrawn: 'Withdrawn',
});

/** Parse a provider status: a live member maps to its Mallan storage status; anything else is null (refuse, never default). */
export function mallanStatusFromCotality(live: unknown): MallanStorageStatus | null {
  if (!isCotalityStandardStatus(live)) return null;
  return COTALITY_TO_MALLAN[live] ?? null;
}

/**
 * Mallan storage status → the VERIFIED live StandardStatus member that represents it when a
 * provider-shaped record is required (the agent Search engine's Mallan rows). Null = no verified
 * provider counterpart (Draft): the Mallan status stays under a Mallan key.
 */
const MALLAN_TO_COTALITY: Readonly<Partial<Record<MallanStorageStatus, string>>> = Object.freeze({
  Active: 'Active',
  ActiveUnderContract: 'ActiveUnderContract',
  ComingSoon: 'ComingSoon',
  Pending: 'Pending',
  Hold: 'Hold',
  Withdrawn: 'Withdrawn',
  Expired: 'Expired',
  Incomplete: 'Incomplete',
  Delete: 'Delete',
  Cancelled: 'Canceled',
  Closed: 'Closed',
  Sold: 'Closed',    // verified: closed sales are StandardStatus 'Closed' live
  Rented: 'Closed',  // verified: closed rentals are StandardStatus 'Closed' live
  Leased: 'Closed',
  // Draft: no provider representation
});
export function cotalityStandardStatusForMallan(mallan: unknown): string | null {
  if (!isMallanStorageStatus(mallan)) return null;
  const v = MALLAN_TO_COTALITY[mallan];
  return v && isCotalityStandardStatus(v) ? v : null;
}

/** Inverse: which Mallan storage values a live StandardStatus criterion covers (for querying Mallan rows). */
export function mallanStorageStatusesForCotality(live: readonly string[]): string[] {
  const out = new Set<string>();
  for (const member of live) {
    for (const [mallan, rep] of Object.entries(MALLAN_TO_COTALITY)) if (rep === member) out.add(mallan);
  }
  return [...out];
}

/** Every live member has a Mallan storage counterpart (guarded by tests). */
export const COTALITY_STATUS_COVERAGE: readonly string[] = Object.freeze(Object.keys(COTALITY_TO_MALLAN));
