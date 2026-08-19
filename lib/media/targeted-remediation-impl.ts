/**
 * TARGETED MEDIA REMEDIATION — IMPLEMENTATION.
 *
 * Runs OUTSIDE `mirrorMediaToR2`. That function resolves `existingKey ?? buildMediaR2Key(...)`
 * (lib/idx/media-sync.ts:2977) and returns `reused` as soon as `existsInR2(key)` is true
 * (:3148-3177) WITHOUT reading provider bytes — the deliberate PR #583 mass-re-upload guard, locked
 * by 43 tests. Neither it nor `buildMediaR2Key` is modified.
 *
 * Per repaired row: resolve fresh Cotality by MediaKey -> fetch provider bytes -> sha256 ->
 * versioned key -> if the exact key exists, READ IT BACK AND VERIFY before reuse; otherwise PUT ->
 * read back and verify sha256 -> only then reconcile pointers. `closeMediaWrite` runs EXACTLY ONCE
 * per listing unit, after every row is verified and reconciled. The legacy object is never
 * overwritten and never deleted.
 */
import { createHash } from 'node:crypto';
import type {
  RemediationTargetRow,
  RemediationUnit,
  RemediationDeps,
  RemediationOutcome,
  RepairedRow,
  PlanValidation,
  RemediationIneligibleClass,
} from './targeted-remediation';

export const R2_PUBLIC_BASE = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Mirrors `encodeR2Segment` semantics: [A-Za-z0-9_-] pass through, everything else -> ~HH. */
export function encodeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, (c) => `~${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

function folderFor(mediaType: string): string {
  const t = String(mediaType || '').toLowerCase();
  if (t.includes('floor')) return 'floorplans';
  if (t.includes('video')) return 'videos';
  if (t.includes('virtual') || t.includes('tour')) return 'virtualtours';
  return 'photos';
}

/**
 * Separator is `.` — encodeSegment can emit `-` but can NEVER emit `.`, so `{encKey}.{sha8}` is
 * injective by construction while `{encKey}-{sha8}` is not.
 */
export function buildVersionedDeliveryKeyImpl(
  listingId: string,
  mediaType: string,
  mediaKey: string,
  sha256Hex: string,
): string {
  const sha8 = String(sha256Hex).slice(0, 8).toLowerCase();
  return `${folderFor(mediaType)}/${encodeSegment(listingId)}/${encodeSegment(mediaKey)}.${sha8}.jpg`;
}

export function validateRemediationUnitImpl(
  unit: RemediationUnit,
  knownBadRowsForListing: RemediationTargetRow[],
  ineligibleRows?: Array<{ media_key: string; klass: RemediationIneligibleClass }>,
): PlanValidation {
  const planned = new Set(unit.rows.map((r) => r.media_key));

  // An ineligible row must never enter a plan: MATCH_CURRENT_PHOTO, SIBLING_OK,
  // CURRENT_PROVIDER_UNAVAILABLE, UNVERIFIABLE.
  const bad = (ineligibleRows ?? []).filter((i) => planned.has(i.media_key));
  if (bad.length) {
    return {
      ok: false,
      reason: 'INELIGIBLE_ROW',
      detail: bad.map((b) => `${b.media_key}=${b.klass}`).join(', '),
      missing: [],
    };
  }

  // A plan that omits a KNOWN verified-bad ACTIVE row for this listing is INCOMPLETE. Detection
  // lives here, before any write — never inside closeMediaWrite, which is a post-write seam.
  // NOTE: deliberately does NOT re-filter by listing_id. The parameter contract is "the known
  // verified-bad rows FOR THIS LISTING" — the caller scopes it. Re-filtering here would mean that a
  // caller passing mislabelled rows gets an INCOMPLETE plan silently APPROVED, which is the exact
  // wrong direction to fail. Any known-bad row absent from the plan blocks the unit.
  const missing = knownBadRowsForListing
    .filter((r) => !planned.has(r.media_key))
    .map((r) => r.media_key);
  if (missing.length) {
    return {
      ok: false,
      reason: 'INCOMPLETE_UNIT',
      detail: `listing ${unit.listing_id} has ${missing.length} verified-bad row(s) omitted from the plan`,
      missing,
    };
  }
  return { ok: true };
}

/** Unit set = UNION of bad-hero and bad-sibling listings. A hero-less unit must not be skipped. */
export function buildRemediationUnitsImpl(rows: RemediationTargetRow[]): RemediationUnit[] {
  const byListing = new Map<string, RemediationTargetRow[]>();
  for (const r of rows) {
    const a = byListing.get(r.listing_id);
    if (a) a.push(r);
    else byListing.set(r.listing_id, [r]);
  }
  return [...byListing.entries()]
    .map(([listing_id, rs]) => ({
      listing_id,
      listing_type: (rs[0] as unknown as { listing_type?: 'sale' | 'rent' }).listing_type ?? 'sale',
      rows: rs,
    }))
    .sort((a, b) => (a.listing_id < b.listing_id ? -1 : a.listing_id > b.listing_id ? 1 : 0));
}

export async function remediateListingUnitImpl(
  unit: RemediationUnit,
  knownBadRowsForListing: RemediationTargetRow[],
  deps: RemediationDeps,
): Promise<RemediationOutcome> {
  const plan = validateRemediationUnitImpl(unit, knownBadRowsForListing);
  if (!plan.ok) {
    return { status: 'refused', listing_id: unit.listing_id, reason: `${plan.reason}: ${plan.detail}` };
  }

  // Admission re-evaluated at EXECUTION time against a freshly read listing, not the frozen manifest.
  let scope: 'hero_only' | 'none';
  try {
    scope = await deps.admissionScope(unit.listing_id);
  } catch (e) {
    return { status: 'refused', listing_id: unit.listing_id, reason: `admission check failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (scope === 'none') {
    return { status: 'refused', listing_id: unit.listing_id, reason: 'ADMISSION_REFUSED: decideMirrorAdmissionScope returned none at execution time' };
  }

  // ── PHASE 1: every object uploaded AND content-verified BEFORE any pointer becomes authoritative.
  const prepared: Array<{ row: RemediationTargetRow; newKey: string; url: string; sha: string }> = [];
  for (const row of unit.rows) {
    let bytes: Buffer;
    try {
      bytes = await deps.fetchProviderBytes(row.freshProviderUrl);
    } catch (e) {
      return { status: 'incomplete', listing_id: unit.listing_id, retryable: true, rows: [],
        reason: `provider fetch failed for ${row.media_key}: ${e instanceof Error ? e.message : String(e)}` };
    }

    const sha = sha256(bytes);
    const newKey = buildVersionedDeliveryKeyImpl(row.listing_id, row.media_type, row.media_key, sha);

    try {
      await deps.uploadToR2(newKey, bytes, 'image/jpeg');
    } catch (e) {
      return { status: 'incomplete', listing_id: unit.listing_id, retryable: true, rows: [],
        reason: `R2 upload failed for ${row.media_key}: ${e instanceof Error ? e.message : String(e)}` };
    }

    // Read back and verify. uploadToR2 sends no checksum, so the repair must prove its own upload.
    // A content-addressed key does NOT prove its own bytes — a truncated PUT leaves a key whose
    // digest lies about its content.
    let readBack: Buffer;
    try {
      readBack = await deps.readR2Bytes(newKey);
    } catch (e) {
      return { status: 'incomplete', listing_id: unit.listing_id, retryable: true, rows: [],
        reason: `read-back failed for ${row.media_key}: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (sha256(readBack) !== sha) {
      return { status: 'incomplete', listing_id: unit.listing_id, retryable: true, rows: [],
        reason: `read-back sha256 mismatch for ${row.media_key} — stored bytes differ from uploaded bytes` };
    }

    prepared.push({ row, newKey, url: `${R2_PUBLIC_BASE}/${newKey}`, sha });
  }

  // ── PHASE 2: reconcile pointers, addressed by media_key only (never by legacy key shape).
  const repaired: RepairedRow[] = [];
  for (const p of prepared) {
    try {
      await deps.updateRowPointers(p.row.media_key, { r2_key: p.newKey, media_url_cached: p.url });
    } catch (e) {
      return { status: 'incomplete', listing_id: unit.listing_id, retryable: true, rows: repaired,
        reason: `pointer write failed for ${p.row.media_key}: ${e instanceof Error ? e.message : String(e)}` };
    }
    repaired.push({
      media_key: p.row.media_key,
      previousR2Key: p.row.legacyR2Key,
      newR2Key: p.newKey,
      newMediaUrlCached: p.url,
      sha256_8: p.sha.slice(0, 8),
    });
  }

  // ── PHASE 3: canonical closure, EXACTLY ONCE per listing unit, after all pointers reconciled.
  // galleryMutated: true whenever at least one authorized active row had its delivery corrected.
  let closure: { ok: boolean };
  try {
    closure = await deps.closeMediaWrite(unit.listing_id, { galleryMutated: repaired.length > 0 });
  } catch (e) {
    return { status: 'incomplete', listing_id: unit.listing_id, retryable: true, rows: repaired,
      reason: `closure threw: ${e instanceof Error ? e.message : String(e)}` };
  }

  // closeMediaWrite is FAIL-SOFT and never throws — an uninspected result would over-count.
  if (!closure.ok) {
    return { status: 'incomplete', listing_id: unit.listing_id, retryable: true, rows: repaired,
      reason: 'closeMediaWrite returned ok:false — summary/invalidation did not complete' };
  }

  return { status: 'repaired', listing_id: unit.listing_id, rows: repaired, closureOk: true };
}

/** A unit counts ONLY when every bad row was reconciled after verification AND closure returned ok. */
export function countCompletedRemediationsImpl(outcomes: RemediationOutcome[]): number {
  return outcomes.filter((o) => o.status === 'repaired' && o.closureOk === true).length;
}
