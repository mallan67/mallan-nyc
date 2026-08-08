/**
 * COMMIT 11 — the URL/locator write decision. TWO source-proven defects.
 *
 * DEFECT 1 — no no-op gate. The material comparator EXCLUDES the URL, so
 * "material unchanged" says nothing about the locator, and nothing compared the
 * locator itself. A BYTE-IDENTICAL `media_url_original` on a pending row still
 * produced a physical UPDATE every cycle. Nothing was refreshed — no new
 * locator was received.
 *
 * DEFECT 2 — explicit policy invisible. `mediaRowMirrorUnreachable` reads only
 * `r2_attempts > 8`. That was sufficient while policy parking WROTE 9, but after
 * the writer cutover a policy-excluded row carries a LOW/NULL `r2_attempts` and
 * a non-null `r2_policy_excluded_at`. `buildR2BacklogWhere` filters those out,
 * so the backlog says DO-NOT-MIRROR while this decision said
 * STILL-WAITING-FOR-MIRROR and rewrote the locator forever — permanent Neon
 * churn on exactly the rows policy removed from delivery.
 *
 * These assert the DECISION, not source text.
 */

import {
  mediaRowDelivered,
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
 * The production decision, evaluated exactly as media-sync composes it. Kept in
 * one place so every case below exercises the same expression.
 */
function writesLocator(existing: Row, incomingUrl: string | null, materialUnchanged = true): boolean {
  const locatorIdentical = (existing.media_url_original ?? null) === (incomingUrl ?? null);
  const locatorHasNoConsumer =
    mediaRowDelivered(existing) || mediaRowMirrorUnreachable(existing) || isR2PolicyExcluded(existing);
  const suppressed = materialUnchanged && (locatorIdentical || locatorHasNoConsumer);
  return !suppressed;
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

describe('no consumer for the locator -> no write', () => {
  it('3. delivered + changed URL -> no write', () => {
    const delivered: Row = {
      media_url_original: URL_A, r2_key: 'photos/x.jpg',
      media_url_cached: 'https://cdn/x.jpg', r2_attempts: 0, r2_policy_excluded_at: null,
    };
    expect(writesLocator(delivered, URL_B)).toBe(false);
  });

  it('4. EXPLICIT policy excluded + changed URL -> no write (defect 2)', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: 2, r2_policy_excluded_at: new Date('2026-08-08T00:00:00Z'),
    };
    expect(writesLocator(row, URL_B)).toBe(false);
  });

  it('5. EXPLICIT policy excluded + same URL -> no write', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: null, r2_policy_excluded_at: new Date(),
    };
    expect(writesLocator(row, URL_A)).toBe(false);
  });

  it('6. LEGACY exact 9 + changed URL -> no write', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: R2_POLICY_PARKED_ATTEMPTS, r2_policy_excluded_at: null,
    };
    expect(writesLocator(row, URL_B)).toBe(false);
  });

  it('7. >9 legacy overflow + changed URL -> no write, and NOT reclassified as policy', () => {
    const row: Row = {
      media_url_original: URL_A, r2_key: null, media_url_cached: null,
      r2_attempts: 112, r2_policy_excluded_at: null,
    };
    expect(writesLocator(row, URL_B)).toBe(false);
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

  it('12. an absent policy field is fail-safe — never invents exclusion', () => {
    const narrow: Row = { media_url_original: URL_A, r2_key: null, media_url_cached: null };
    expect(isR2PolicyExcluded(narrow)).toBe(false);
    // Unknown policy state + changed locator ⇒ refresh still happens.
    expect(writesLocator(narrow, URL_B)).toBe(true);
  });
});
