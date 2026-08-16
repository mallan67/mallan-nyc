/**
 * Public-surface dedupe — prefer Mallan CRM exclusive over Trestle/IDX
 * duplicate when both rows represent the same physical unit.
 *
 * Background
 * ----------
 * When a CRM-created exclusive (listing_id prefix `SL-` / `RL-`) is
 * submitted separately to REBNY RLS through an external listing-entry workflow
 * (OUTSIDE this system), the Trestle sync subsequently pulls
 * the listing back into our DB as a separate row keyed by REBNY's
 * ListingKey (e.g. `RLS20093870`). The two rows are the same physical unit
 * but have different `listing_id`, slug, attribution, and URL. Without
 * dedupe, public surfaces render both rows — Maya's exclusive appears as a
 * duplicate IDX-courtesy card, with wrong attribution, wrong URL, and
 * duplicate-content SEO penalty.
 *
 * This helper filters at READ time on every public surface so only the CRM
 * row is returned. The IDX duplicate is NOT mutated or deleted — it stays
 * in the DB for audit history and is still visible on the broker-side
 * CRM views (which explicitly do NOT call this helper, so duplicates remain
 * visible internally for cleanup decisions).
 *
 * Matching key
 * ------------
 * Two rows are considered the same physical unit when ALL of these match
 * (case-insensitive, after trim):
 *   - StreetNumber
 *   - StreetDirPrefix
 *   - StreetName (or the combined "<dir> <name> <suffix>" form for DTO shape)
 *   - StreetSuffix
 *   - UnitNumber  ← REQUIRED on both sides; rows without UnitNumber are
 *                   never deduped against any other row (cannot prove same
 *                   physical unit).
 *   - PostalCode
 *
 * Prefer-CRM rule
 * ---------------
 *   - If exactly one row in a key-group has `id` starting `SL-`/`RL-`,
 *     keep that row; drop the others.
 *   - If multiple CRM rows exist in a key-group (defensive — should not
 *     happen in practice), keep the row with the newest `modificationTimestamp`
 *     / `updatedAt`; log a warning with all candidate ids.
 *   - If no row in a key-group has `SL-`/`RL-` prefix, keep all rows
 *     (real third-party IDX group — no Mallan exclusive to prefer).
 *
 * Compliance notes
 * ----------------
 *   - UCBA Art. III §2(C): attribution must identify the ACTUAL listing
 *     broker. Preserved — Mallan IS the listing broker for the CRM row.
 *   - Address suppression (`internet_address_display_yn === false`): tests
 *     verify the helper does NOT leak suppressed addresses as a match key
 *     for visible rows. A row with no `unitNumber` is never deduped, which
 *     also prevents accidentally matching a suppressed row against a
 *     visible one when address atoms are blanked.
 *   - This helper is READ-only. No DB writes. Fully reversible by removing
 *     the integration calls.
 *
 * @module lib/listings/dedupe-crm-vs-idx
 */

import {
  canonicalizeDirection,
  canonicalizeSuffix,
  canonicalizeStreetName,
} from '@/lib/address/nyc-address-normalizer';

const CRM_PREFIXES = ['SL-', 'RL-'] as const;

/**
 * Canonicalize a single street token so address-variant spellings collapse to
 * one form: direction (East↔E), suffix (Street↔St), and ordinal (46↔46th).
 * Each underlying normalizer is a no-op outside its domain and idempotent, so
 * applying all three in sequence is safe for any token. This is what lets a
 * CRM exclusive ("333 East 46th Street") and its Trestle/IDX duplicate
 * ("333 E 46th Street") produce the SAME dedupe key.
 */
function canonStreetToken(token: string): string {
  return canonicalizeStreetName(canonicalizeSuffix(canonicalizeDirection(token)));
}

/**
 * Minimal address shape this helper understands. Accepts either:
 *   - DTO shape: `streetName` already includes direction + suffix
 *     (e.g. "E 46th Street") — `streetDirPrefix` and `streetSuffix` may
 *     be absent.
 *   - DB-row shape: components are separate (StreetNumber / StreetDirPrefix
 *     / StreetName / StreetSuffix).
 *
 * The key derivation handles both by concatenating populated parts; the
 * resulting key is identical regardless of which shape the caller supplied,
 * so a DTO row and a DB row for the same physical unit compare equal.
 */
export interface DedupeAddressLike {
  streetNumber?: string | null;
  streetDirPrefix?: string | null;
  streetName?: string | null;
  streetSuffix?: string | null;
  unitNumber?: string | null;
  postalCode?: string | null;
}

/**
 * Minimum row shape the helper operates on. Generic so callers can pass
 * `PublicListingDTO`, raw Prisma rows, sitemap row adapters, etc., and
 * receive the same shape back.
 */
export interface DedupeCandidate {
  /** The listing_id — used to detect CRM prefix (SL-/RL-). */
  id: string;
  address?: DedupeAddressLike | null;
  /** ISO string. Optional — used as tiebreaker when multiple CRM rows
   *  exist for the same key. `updatedAt` is checked as fallback. */
  modificationTimestamp?: string | null;
  updatedAt?: string | null;
}

function norm(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function isCrmId(id: string): boolean {
  return CRM_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * Derive the normalized address key used to group rows. Returns `null`
 * when the row lacks enough data to be matchable (no UnitNumber, or no
 * StreetName at all). A `null` key means the row is not a dedupe
 * candidate and passes through unchanged.
 *
 * Exported (2026-05-28) so route handlers can pre-compute the key for a
 * reference row (e.g. the listing being excluded in `/api/listings/similar`)
 * and filter the dedupe output against it. Use `buildAddressKeyFromDbRow`
 * when the source is a raw Prisma listing row with PascalCase address
 * JSON; this version expects the camelCase `DedupeAddressLike` shape that
 * also accepts DTO output.
 */
export function buildAddressKey(addr: DedupeAddressLike | null | undefined): string | null {
  if (!addr) return null;

  const streetNumber = norm(addr.streetNumber);
  const unitNumber = norm(addr.unitNumber);
  const postalCode = norm(addr.postalCode);

  // UnitNumber MUST be present on both sides to dedupe. Without it we
  // cannot prove two rows are the same physical unit (could be different
  // units in the same building).
  if (!unitNumber) return null;
  if (!streetNumber) return null;

  // Reconstruct combined street name from whichever shape the caller
  // supplied. For DB-row shape with separate components, this concatenates
  // them. For DTO shape where `streetName` already includes the direction
  // + suffix, the streetDirPrefix/streetSuffix are usually absent, so the
  // result is the same string after normalization. Either way the key for
  // the same physical address is identical.
  // Canonicalize every street token (East↔E, Street↔St, 46↔46th) so a CRM
  // exclusive and its Trestle/IDX duplicate — which spell the address
  // differently — collapse to the SAME key. Without this the dedupe silently
  // failed and BOTH cards rendered (the bug Maya saw on /agents/maya-allan).
  const rawPieces = [addr.streetDirPrefix, addr.streetName, addr.streetSuffix]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const fullStreetName = rawPieces
    .split(/\s+/)
    .map(canonStreetToken)
    .join(' ')
    .trim()
    .toLowerCase();
  if (!fullStreetName) return null;

  return [streetNumber, fullStreetName, unitNumber, postalCode].join('|');
}

/**
 * Pick the most-recent CRM row in a group when multiple SL-/RL- rows match
 * the same key. Defensive — should not happen in practice; if it does,
 * surface a warning so the broker can investigate and clean up the
 * duplicate exclusive in the CRM.
 */
function pickNewestCrm<T extends DedupeCandidate>(crmRows: T[]): T {
  if (crmRows.length === 1) return crmRows[0];
  const sorted = [...crmRows].sort((a, b) => {
    const aTs = a.modificationTimestamp || a.updatedAt || '';
    const bTs = b.modificationTimestamp || b.updatedAt || '';
    // Reverse-lexicographic on ISO 8601 ⇒ newest first.
    return bTs.localeCompare(aTs);
  });
  // eslint-disable-next-line no-console
  console.warn(
    `[dedupe-crm-vs-idx] Multiple CRM rows matched the same address+unit; keeping newest. Candidates: ${sorted.map((r) => r.id).join(', ')}`,
  );
  return sorted[0];
}

/**
 * Public-surface dedupe. Returns a new array; does not mutate input.
 *
 * Order-preserving: when a key-group is collapsed to its CRM winner, that
 * winner takes the position of the FIRST occurrence in the input array.
 * Non-candidate rows (no UnitNumber, no StreetName, or pure-IDX groups)
 * are returned in their original positions.
 */
export function preferCrmExclusiveOverIdxDuplicate<T extends DedupeCandidate>(
  listings: T[],
): T[] {
  if (!Array.isArray(listings) || listings.length < 2) return listings;

  // First pass: bucket rows by key. Rows that cannot be keyed pass through.
  const buckets = new Map<string, T[]>();
  const passthrough: Array<{ index: number; row: T }> = [];
  const firstSeenIndex = new Map<string, number>();

  listings.forEach((row, index) => {
    const key = buildAddressKey(row.address);
    if (key === null) {
      passthrough.push({ index, row });
      return;
    }
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(key, [row]);
      firstSeenIndex.set(key, index);
    }
  });

  // Second pass: for each bucket, apply the prefer-CRM rule.
  const winners: Array<{ index: number; row: T }> = [];
  for (const [key, bucket] of buckets) {
    const crmRows = bucket.filter((r) => isCrmId(r.id));
    if (crmRows.length === 0) {
      // Pure-IDX group: helper is a no-op for this group; keep all rows in
      // their original positions.
      bucket.forEach((row) => {
        const idx = listings.indexOf(row);
        winners.push({ index: idx, row });
      });
      continue;
    }
    // At least one CRM row in this group: collapse to the (newest) CRM
    // row only. Position it at the first-seen index of the group so output
    // order roughly matches input order.
    const winner = pickNewestCrm(crmRows);
    winners.push({ index: firstSeenIndex.get(key) ?? 0, row: winner });
  }

  // Reassemble in original order. Passthrough rows + winners share an
  // index space; sort and emit.
  const combined = [...winners, ...passthrough].sort((a, b) => a.index - b.index);
  return combined.map((entry) => entry.row);
}

/**
 * Build the normalized address key for a raw Prisma listing row. Handles
 * both PascalCase (`StreetNumber`, `StreetName`, …) and camelCase
 * (`streetNumber`, `streetName`, …) address JSON shapes by reading both
 * forms with a fallback.
 *
 * Exported alongside `buildAddressKey` so route handlers can compute a
 * comparable key for an arbitrary reference row — e.g. the listing
 * excluded in `/api/listings/similar` — and filter the dedupe output
 * against it. See the call site there for the exclude-id-aware pattern.
 */
export function buildAddressKeyFromDbRow(row: { address: unknown }): string | null {
  const addr = (row.address || {}) as Record<string, unknown>;
  return buildAddressKey({
    streetNumber: String(addr.StreetNumber ?? addr.streetNumber ?? ''),
    streetDirPrefix: String(addr.StreetDirPrefix ?? addr.streetDirPrefix ?? ''),
    streetName: String(addr.StreetName ?? addr.streetName ?? ''),
    streetSuffix: String(addr.StreetSuffix ?? addr.streetSuffix ?? ''),
    unitNumber: String(addr.UnitNumber ?? addr.unitNumber ?? ''),
    postalCode: String(addr.PostalCode ?? addr.postalCode ?? ''),
  });
}

/**
 * Compare two rows (DB-row shape) by normalized address key. Returns
 * `true` only when both keys are non-null AND identical — i.e. both rows
 * are dedupe candidates AND represent the same physical unit. Two rows
 * that both lack a UnitNumber are NOT considered the same.
 */
export function sameAddressKey(
  a: { address: unknown } | null | undefined,
  b: { address: unknown } | null | undefined,
): boolean {
  if (!a || !b) return false;
  const keyA = buildAddressKeyFromDbRow(a);
  const keyB = buildAddressKeyFromDbRow(b);
  return keyA !== null && keyB !== null && keyA === keyB;
}

/**
 * Adapter for callers that work with raw Prisma listing rows (PascalCase
 * address JSON: `StreetNumber`, `StreetDirPrefix`, etc.) instead of
 * `PublicListingDTO` (camelCase). Used by `app/sitemap.ts` and the DB-first
 * branch of `/api/listings/similar` which don't pass through
 * `dbListingToPublicDTO`.
 *
 * Returns the original row objects (not adapted ones), so the caller's
 * subsequent code keeps the full Prisma row shape.
 */
export function dedupeRawDbRows<T extends {
  listing_id: string;
  address: unknown;
  modification_timestamp?: Date | string | null;
  updated_at?: Date | string | null;
}>(rows: T[]): T[] {
  if (!Array.isArray(rows) || rows.length < 2) return rows;

  const candidates = rows.map((row, idx) => {
    const addr = (row.address || {}) as Record<string, unknown>;
    return {
      id: row.listing_id,
      address: {
        streetNumber: String(addr.StreetNumber ?? addr.streetNumber ?? ''),
        streetDirPrefix: String(addr.StreetDirPrefix ?? addr.streetDirPrefix ?? ''),
        streetName: String(addr.StreetName ?? addr.streetName ?? ''),
        streetSuffix: String(addr.StreetSuffix ?? addr.streetSuffix ?? ''),
        unitNumber: String(addr.UnitNumber ?? addr.unitNumber ?? ''),
        postalCode: String(addr.PostalCode ?? addr.postalCode ?? ''),
      },
      modificationTimestamp:
        row.modification_timestamp instanceof Date
          ? row.modification_timestamp.toISOString()
          : (typeof row.modification_timestamp === 'string' ? row.modification_timestamp : null),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : (typeof row.updated_at === 'string' ? row.updated_at : null),
      _idx: idx,
    };
  });

  const deduped = preferCrmExclusiveOverIdxDuplicate(candidates);
  return deduped.map((c) => rows[(c as typeof c & { _idx: number })._idx]);
}
