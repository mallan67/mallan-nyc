/**
 * COMMIT 11 — the URL/locator write decision. TWO source-proven defects.
 *
 * DEFECT 1 — no no-op gate. The material comparator EXCLUDES the URL, so
 * "material unchanged" says nothing about the locator, and nothing compared the
 * locator itself. A BYTE-IDENTICAL `media_url_original` on a pending row still
 * produced a physical UPDATE every cycle. Nothing was refreshed — no new
 * locator was received.
 *
 * CORRECTION (public-delivery review). An earlier revision ALSO suppressed a
 * changed locator whenever the row was R2-delivered, policy-excluded, or
 * retry-unreachable. That was WRONG: it conflated the R2 MIRROR BACKLOG with
 * PUBLIC DELIVERY.
 *
 *   resolveDbListingMedia serves the gallery via pickFullSizeUrl(cached,
 *   original) — R2 first, SOURCE LOCATOR as fallback. Policy parking removes a
 *   row from the backlog, not from public delivery.
 *
 *   Listing.primary_photo_url is set FROM media_url_original, and
 *   public-building-data reads that column ONLY — never primary_photo_r2_key.
 *   So even a DELIVERED hero can still need a fresh source locator.
 *
 * Until hero/manifest R2 delivery is corrected end-to-end this FAILS CLOSED: a
 * changed locator is always refreshed. Suppressing it would trade Neon writes
 * for stale provider URLs and broken photos.
 *
 * These assert the DECISION, not source text.
 */

import {
  decideMediaRowPersistence,
  mediaRowMirrorUnreachable,
  R2_RETRY_EXHAUSTED_THRESHOLD,
  R2_POLICY_PARKED_ATTEMPTS,
} from '../media-sync';
import { isR2PolicyExcluded } from '@/lib/media/r2-policy-state';

const URL_A = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1178013994/67/AAA/BBB/b';
const URL_B = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1178013994/67/AAA/CCC/b';

type Row = {
  media_url_original: string | null;
  r2_key: string | null;
  media_url_cached: string | null;
  r2_attempts?: number | null;
  r2_policy_excluded_at?: Date | null;
};

/**
 * Calls THE PRODUCTION DECISION OWNER. The previous revision of this file
 * recomposed the expression itself, which meant these tests could stay green
 * while production drifted underneath them — they would have been asserting
 * their own copy. There is now exactly one implementation.
 */
function writesLocator(existing: Row, incomingUrl: string | null, materialUnchanged = true): boolean {
  const d = decideMediaRowPersistence({
    materialUnchanged,
    existingLocator: existing.media_url_original ?? null,
    incomingLocator: incomingUrl ?? null,
    existing: existing as never,
  });
  return d.kind !== 'suppress';
}

/** The bounded aggregate reason the production owner assigned. */
function reasonFor(existing: Row, incomingUrl: string | null, materialUnchanged = true): string {
  return decideMediaRowPersistence({
    materialUnchanged,
    existingLocator: existing.media_url_original ?? null,
    incomingLocator: incomingUrl ?? null,
    existing: existing as never,
  }).reason;
}

const pending = (url: string | null): Row => ({
  media_url_original: url, r2_key: null, media_url_cached: null,
  r2_attempts: 1, r2_policy_excluded_at: null,
});

describe('no-op gate — an identical locator is never rewritten', () => {
  it('1. pending + EXACT same URL -> no write', () => {
    expect(writesLocator(pending(URL_A), URL_A)).toBe(false);
  });

  it('2. pending + genuinely changed URL -> locator refresh IS written', () => {
    // Not amplification: an un-delivered row needs the fresh signed locator for
    // the R2 backlog fetch. This must keep working.
    expect(writesLocator(pending(URL_A), URL_B)).toBe(true);
  });

  it('11. PCT-only cycle (same media, same locator) -> no media write', () => {
    expect(writesLocator(pending(URL_A), URL_A, true)).toBe(false);
  });
});

describe('a changed locator FAILS CLOSED — R2 state does not suppress it', () => {
  it('3. delivered + changed URL -> NO WRITE (durable delivery, no source reader left)', () => {
    const delivered: Row = {
      media_url_original: URL_A, r2_key: 'photos/x.jpg',
      media_url_cached: 'https://cdn/x.jpg', r2_attempts: 0, r2_policy_excluded_at: null,
    };
    // COTALITYLVED: delivery now DOES prove the source locator is unused, because
    // the two remaining readers were corrected — the building manifest serves
    // primary_photo_r2_key via the read-safe R2 helper, and CRM heroUrl uses
    // the canonical cached-first pickFullSizeUrl. With no reader left this is
    // the #530/#541 write-amplification win, restored.
    expect(writesLocator(delivered, URL_B)).toBe(false);
  });

  it('4. EXPLICIT policy excluded + changed URL -> REFRESH (public fallback lives)', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: 2, r2_policy_excluded_at: new Date('2026-08-08T00:00:00Z'),
    };
    // CORRECTED: policy parking removes the row from the R2 MIRROR BACKLOG,
    // not from public delivery — resolveDbListingMedia still falls back to
    // media_url_original for an unmirrored row.
    expect(writesLocator(row, URL_B)).toBe(true);
  });

  it('5. EXPLICIT policy excluded + same URL -> no write', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: null, r2_policy_excluded_at: new Date(),
    };
    expect(writesLocator(row, URL_A)).toBe(false);
  });

  it('6. LEGACY exact 9 + changed URL -> REFRESH (public fallback still used)', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: R2_POLICY_PARKED_ATTEMPTS, r2_policy_excluded_at: null,
    };
    expect(writesLocator(row, URL_B)).toBe(true);
  });

  it('7. >9 legacy overflow + changed URL -> REFRESH, and NOT reclassified as policy', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: 112, r2_policy_excluded_at: null,
    };
    expect(writesLocator(row, URL_B)).toBe(true);
    // Frozen overflow is unreachable, but it is NOT a policy exclusion.
    expect(isR2PolicyExcluded(row)).toBe(false);
    expect(mediaRowMirrorUnreachable(row)).toBe(true);
  });
});

describe('recovery and re-admission stay reachable', () => {
  it('8. EXACT 8 recovery + changed URL -> refresh remains ALLOWED', () => {
    // Exactly 8 is recovery-reachable in media-sync. It must not be suppressed
    // just because another helper calls 8 "retry exhausted".
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD, r2_policy_excluded_at: null,
    };
    expect(mediaRowMirrorUnreachable(row)).toBe(false);
    expect(writesLocator(row, URL_B)).toBe(true);
  });

  it('9. policy CLEARED (re-admitted) + changed URL -> refresh allowed again', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: 2, r2_policy_excluded_at: null,
    };
    expect(writesLocator(row, URL_B)).toBe(true);
  });
});

describe('policy must never freeze real provider truth', () => {
  it('10. MATERIAL media change while policy-excluded -> write STILL occurs', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: 0, r2_policy_excluded_at: new Date(),
    };
    // materialUnchanged=false → suppression cannot apply at all.
    expect(writesLocator(row, URL_A, false)).toBe(true);
    expect(writesLocator(row, URL_B, false)).toBe(true);
  });
});

describe('the interpreter is shared, not copied', () => {
  it('media-sync re-exports the SAME constants the policy owner defines', () => {
    // One definition, two import paths. If media-sync ever redefines them the
    // values could drift apart silently.
    const owner = jest.requireActual('@/lib/media/r2-policy-state') as {
      R2_RETRY_EXHAUSTED_THRESHOLD: number; R2_POLICY_PARKED_ATTEMPTS: number;
    };
    expect(R2_RETRY_EXHAUSTED_THRESHOLD).toBe(owner.R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(R2_POLICY_PARKED_ATTEMPTS).toBe(owner.R2_POLICY_PARKED_ATTEMPTS);
    expect(R2_RETRY_EXHAUSTED_THRESHOLD).toBe(8);
    expect(R2_POLICY_PARKED_ATTEMPTS).toBe(9);
  });

  it('bounded aggregate reasons are distinct and value-free', () => {
    // These labels feed observability counters, so they must separate the
    // suppression causes — and must never carry a URL, MediaKey or address.
    expect(reasonFor(pending(URL_A), URL_A)).toBe('locator-identical');
    // R2 state is now OBSERVATIONAL on the refresh path, never a suppression.
    expect(reasonFor({ media_url_original: URL_A, r2_key: 'k', media_url_cached: 'c' }, URL_B)).toBe('delivered-durable');
    expect(reasonFor(pending(URL_A), URL_B)).toBe('pending');
    expect(reasonFor({ media_url_original: URL_A, r2_key: null, media_url_cached: null, r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }, URL_B)).toBe('exact8-recovery');
    expect(reasonFor(pending(URL_A), URL_A, false)).toBe('material-change');
    for (const r of ['locator-identical', 'delivered', 'policy-excluded', 'unreachable-overflow', 'pending', 'exact8-recovery', 'material-change']) {
      expect(r).not.toContain('cotality');
      expect(r).not.toMatch(/\d{6,}/);
    }
  });

  it('a locator refresh is NARROW — production writes the locator and nothing else', () => {
    // Separate from "only one row version is produced": this pins the PAYLOAD.
    // Rewriting provenance/material columns that were already proven unchanged
    // would manufacture the churn this decision exists to remove.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../media-sync.ts'),
      'utf8',
    ) as string;
    // Anchor on the WRITE site, not the first mention of the decision kind — an
    // observational counter block also matches that string, and slicing from it
    // would silently test the wrong region.
    const start = src.indexOf('NARROW BY CONTRACT');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('continue;', start));
    expect(block).toMatch(/data:\s*\{\s*media_url_original:\s*row\.mediaUrlOriginal\s*\}/);
    for (const forbidden of [
      'resource_record_key', 'resource_record_id', 'media_type', 'media_category',
      'media_classification', 'order:', 'preferred_photo_yn', 'media_modification_ts',
      'modification_ts', 'photos_change_ts_snapshot', 'status:', 'r2_key',
      'media_url_cached', 'r2_attempts', 'r2_policy_excluded_at',
    ]) {
      expect(block).not.toContain(forbidden);
    }
  });

  it('12. an absent policy field is fail-safe — never invents exclusion', () => {
    const narrow: Row = { media_url_original: URL_A, r2_key: null, media_url_cached: null };
    expect(isR2PolicyExcluded(narrow)).toBe(false);
    // Unknown policy state + changed locator ⇒ refresh still happens.
    expect(writesLocator(narrow, URL_B)).toBe(true);
  });
});
