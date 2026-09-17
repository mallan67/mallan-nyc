/**
 * MALLAN STATUS DOMAIN — the `listings.status` column vocabulary IS the live Cotality StandardStatus vocabulary.
 *
 * Owner ruling (Maya, 2026-09-08 evening): every status consumer works against live Cotality
 * Property.StandardStatus and stores ONLY its members — Active, ActiveUnderContract, Canceled (one L), Closed,
 * ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn. The sale and rental Mallan WORKFLOWS
 * (OfferOut, ContractSigned, SoldThruUs, AppOut, LeaseSigned, RentedThruUs …) are a separate layer
 * (lib/crm/status-mapping.ts) that resolves to one of these tokens plus its associated Cotality date; a workflow
 * word is never a stored status and is never called MlsStatus. Broker language is a LABEL applied per transaction
 * at display time (Closed → "Sold" on a sale, "Rented" on a rental), never a stored token.
 *
 * Three domains, kept apart:
 *   CRM WORKFLOW        — what the agent picks on the sale or rental form (lib/crm/status-mapping.ts).
 *   MALLAN STATUS       — this module: the stored column vocabulary = the live StandardStatus members.
 *   COTALITY STATUS     — the live StandardStatus enum (lib/cotality/live-contract.ts); only exact live members
 *                         may ever appear under a provider-named field (StandardStatus / MlsStatus).
 *
 * LEGACY rows: before this correction Mallan-authored rows were stored with Mallan spellings — 'Draft', 'Sold',
 * 'Rented', 'Leased', 'Cancelled' — and provider rows with 'Cancelled'. Those spellings are READ-compatible here
 * (`normalizeStoredStatus`, `LEGACY_STORAGE_ALIASES`) and every DB `in` filter keeps matching them
 * (`storageStatusesFor`) until the correction plan rewrites them
 * (docs/operations/evidence-2026-09-08/lifecycle/status-token-correction-plan.sql — a HELD production write).
 * Nothing writes a legacy spelling any more.
 *
 * Verified provider semantics (live probes 2026-09-05/06/08, api.cotality.com; the committed contract):
 *   - closed sales AND closed rentals carry StandardStatus 'Closed' (374,786 ResidentialLease Closed rows);
 *   - a rental with an application / lease in progress is StandardStatus 'Pending' live (352 rows);
 *     'ActiveUnderContract' has 0 live rental rows (it is a live member, used by sales);
 *   - 'Canceled' has 0 live rows today; the live spelling is single-L;
 *   - MlsStatus is not filterable and was null on every sampled row — StandardStatus is the provider status fact.
 */
import { COTALITY_STANDARD_STATUS_MEMBERS, isCotalityStandardStatus } from '@/lib/cotality/live-contract';

/** The `listings.status` vocabulary (Mallan storage) = the eleven live StandardStatus members, verbatim. */
export const MALLAN_STORAGE_STATUSES = Object.freeze([
  'Active', 'ActiveUnderContract', 'Canceled', 'Closed', 'ComingSoon', 'Delete', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn',
] as const);
export type MallanStorageStatus = typeof MALLAN_STORAGE_STATUSES[number];
const STORAGE_SET = new Set<string>(MALLAN_STORAGE_STATUSES);
export function isMallanStorageStatus(v: unknown): v is MallanStorageStatus {
  return typeof v === 'string' && STORAGE_SET.has(v);
}

/**
 * Spellings written before the 2026-09-08 correction → the provider token they mean. Read-compatibility only:
 * no writer emits them. 'Draft' was Mallan's draft (the provider's is Incomplete); 'Sold' / 'Rented' / 'Leased' were
 * Mallan's closes (the provider's is Closed for both transactions); 'Cancelled' was the double-L respelling.
 */
export const LEGACY_STORAGE_ALIASES: Readonly<Record<string, MallanStorageStatus>> = Object.freeze({
  Draft: 'Incomplete',
  Sold: 'Closed',
  Rented: 'Closed',
  Leased: 'Closed',
  Cancelled: 'Canceled',
});

/**
 * A stored status → its provider token: an exact live member, a legacy spelling, or a case-insensitive match of
 * either. Null for anything else (refuse; never default).
 */
export function normalizeStoredStatus(v: unknown): MallanStorageStatus | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (STORAGE_SET.has(trimmed)) return trimmed as MallanStorageStatus;
  if (Object.prototype.hasOwnProperty.call(LEGACY_STORAGE_ALIASES, trimmed)) return LEGACY_STORAGE_ALIASES[trimmed];
  const lower = trimmed.toLowerCase();
  for (const s of MALLAN_STORAGE_STATUSES) if (s.toLowerCase() === lower) return s;
  for (const [legacy, token] of Object.entries(LEGACY_STORAGE_ALIASES)) if (legacy.toLowerCase() === lower) return token;
  return null;
}

/** Every stored spelling (the token and its legacy spellings) a provider token covers — for DB `in` / `notIn` filters. */
export function storageStatusesFor(tokens: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    const token = normalizeStoredStatus(t);
    if (!token) continue;
    out.add(token);
    for (const [legacy, target] of Object.entries(LEGACY_STORAGE_ALIASES)) if (target === token) out.add(legacy);
  }
  return [...out];
}

/** Mallan-only statuses: none — every stored token is a live member (kept as an export for the census tests). */
export const MALLAN_ONLY_STATUSES: readonly string[] = Object.freeze(
  MALLAN_STORAGE_STATUSES.filter((s) => !COTALITY_STANDARD_STATUS_MEMBERS.includes(s)),
);

/** Terminal (no longer marketed) statuses — the §2.05 / retention set (provider tokens). */
export const MALLAN_TERMINAL_STATUSES: ReadonlySet<string> = new Set(['Closed', 'Withdrawn', 'Expired', 'Canceled', 'Delete']);
/** The terminal set as every stored spelling (token + legacy) — for DB filters until the correction plan runs. */
export const TERMINAL_STATUS_FILTER_VALUES: readonly string[] = Object.freeze(storageStatusesFor([...MALLAN_TERMINAL_STATUSES]));
/** Publicly marketable statuses. */
export const MALLAN_ACTIVE_STATUSES: ReadonlySet<string> = new Set(['Active', 'ActiveUnderContract', 'ComingSoon']);
/** Internal lifecycle statuses (never publicly displayable, not terminal). */
export const MALLAN_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set(['Incomplete', 'Pending', 'Hold']);

/** Parse a provider status: a live member is stored verbatim; anything else is null (refuse, never default). */
export function mallanStatusFromCotality(live: unknown): MallanStorageStatus | null {
  if (!isCotalityStandardStatus(live)) return null;
  return STORAGE_SET.has(live) ? (live as MallanStorageStatus) : null;
}

/**
 * Stored status → the live StandardStatus member that represents it when a provider-shaped record is required
 * (the agent Search engine's Mallan rows). Identity for a token; a legacy spelling resolves to its token; null for
 * anything unknown.
 */
export function cotalityStandardStatusForMallan(mallan: unknown): string | null {
  const token = normalizeStoredStatus(mallan);
  return token && isCotalityStandardStatus(token) ? token : null;
}

/** Inverse: which stored spellings a live StandardStatus criterion covers (for querying Mallan rows). */
export function mallanStorageStatusesForCotality(live: readonly string[]): string[] {
  return storageStatusesFor(live);
}

/** Every live member is a stored token (guarded by tests). */
export const COTALITY_STATUS_COVERAGE: readonly string[] = Object.freeze([...MALLAN_STORAGE_STATUSES]);
