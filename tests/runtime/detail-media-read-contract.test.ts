/**
 * COMMIT 4 — detail media read contract (active rows + all-status `_count`).
 *
 * The detail page previously fetched listing_media across EVERY status and let
 * the resolver filter to active for display. That transferred soft-deleted and
 * superseded rows on every render purely to answer an existence question.
 *
 * It now fetches ACTIVE rows only and answers existence from an all-status
 * `_count` aggregate — the same contract `/api/listings` already uses
 * (route.ts:393-412).
 *
 * THE ATOMICITY HAZARD THESE TESTS GUARD
 * --------------------------------------
 * Narrowing the `where` WITHOUT adding `_count` — or keeping
 * `hadRelationalRows = rows.length > 0` after narrowing — makes an all-deleted
 * listing look like "no row ever imported", so the legacy `Listing.media` JSON
 * resurrects soft-deleted CRM media. That is Codex media P0 finding #2, the
 * exact regression the old all-status fetch existed to prevent.
 *
 * Matrix A–E from the commit-4 specification.
 */

import fs from 'fs';
import path from 'path';
import { composeDbPublicMedia } from '../../lib/media/db-media-composition';

const ROOT = path.resolve(__dirname, '../..');
const page = fs
  .readFileSync(path.join(ROOT, 'app/listing/[...slug]/page.tsx'), 'utf8')
  .replace(/\r\n?/g, '\n');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const COTALITY = (n: number) =>
  `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/11780139${n}/1/A/B/C${n}`;

const activeRow = (n: number) => ({
  media_url_original: COTALITY(n), media_url_cached: null,
  media_type: 'Photo', media_category: 'Photo', media_classification: null,
  order: n, preferred_photo_yn: n === 0, status: 'active',
});

const compose = (rows: unknown[], over: Record<string, unknown> = {}) =>
  composeDbPublicMedia({
    listingId: 'RLS20105333', rlsEligible: true,
    tableRows: rows as never, legacyMedia: [], hadRelationalRows: true, ...over,
  } as never);

describe('the query contract is applied ATOMICALLY (source lock)', () => {
  it('listing_media is filtered to active rows', () => {
    expect(code).toMatch(/where:\s*\{\s*status:\s*['"]active['"]/);
  });

  it('_count.listing_media is selected in the SAME include', () => {
    expect(code).toMatch(/_count:\s*\{\s*select:\s*\{\s*listing_media:\s*true/);
  });

  // DELIBERATELY RETARGETED 2026-08-15. These two locks asserted that the DETAIL PAGE derives
  // `hadRelationalRows` from `_count`. The page no longer derives it at all: it had a second,
  // DEAD `composeDbPublicMedia` call (its `mediaArr`/`canonicalPhotoCount` were read by nothing,
  // dead since before #612) whose only remaining input was that local computation. #612 wired the
  // feed-authority signal into that dead call while the LIVE path — `dbListingToPublicDTO` — kept
  // the old behaviour, which is how RLS20082303 kept rendering 20 stale Cotality photos on
  // production 3a37c170.
  //
  // Both the dead composition and its local `hadRelationalRows` are removed, leaving exactly ONE
  // media owner. The CONTRACT is unchanged and still enforced — it now lives in that owner, so the
  // lock follows it there rather than being deleted.
  const dtoCode = fs
    .readFileSync(path.join(ROOT, 'lib/idx/db-to-public-dto.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('hadRelationalRows comes from _count, NEVER from the row array length (in the DTO owner)', () => {
    expect(dtoCode).toMatch(/listing\._count\?\.listing_media/);
    expect(dtoCode).not.toMatch(/hadRelationalRows:\s*tableRows\.length/);
    // And the page must NOT reintroduce a competing media owner.
    expect(code).not.toMatch(/[^.\w]composeDbPublicMedia\(\{/);
  });

  it('an absent _count yields undefined (unknown) so the resolver fails closed', () => {
    expect(dtoCode).toMatch(/typeof listing\._count\?\.listing_media === ['"]number['"]/);
  });
});

describe('A. third-party with 67 active + historical deleted rows', () => {
  const active = Array.from({ length: 67 }, (_, i) => activeRow(i));

  it('the public gallery is still 67 after narrowing to active rows', () => {
    // _count is larger than the active array — historical rows exist.
    const { media, photoCount } = compose(active, { hadRelationalRows: true });
    expect(media).toHaveLength(67);
    expect(photoCount).toBe(67);
  });

  it('deleted/replaced rows are simply absent from the payload', () => {
    const { media } = compose(active, { hadRelationalRows: true });
    expect(media.every((m) => m.url)).toBe(true);
    expect(new Set(media.map((m) => m.url)).size).toBe(67);
  });
});

describe('B. Mallan-owned, 0 active, historical rows existed, legacy JSON present', () => {
  const legacy = [{ MediaURL: COTALITY(9), MediaCategory: 'Photo', Order: 0 }];

  it('gallery is EMPTY — legacy JSON must NOT resurrect deleted media', () => {
    const { media, photoCount } = compose([], {
      listingId: 'SL-0004', rlsEligible: false,
      legacyMedia: legacy,
      hadRelationalRows: true,   // _count > 0 : rows existed, all now deleted
    });
    expect(media).toHaveLength(0);
    expect(photoCount).toBe(0);
  });

  it('this is exactly what breaks if length-based derivation returns', () => {
    // Simulating the regression: active rows = 0 -> length-based derivation
    // would pass `false` ("never imported") and permit the legacy fallback.
    const regressed = compose([], {
      listingId: 'SL-0004', rlsEligible: false,
      legacyMedia: legacy,
      hadRelationalRows: false,
    });
    expect(regressed.media.length).toBeGreaterThan(0); // <- the resurrection
    // ...which is why hadRelationalRows must come from _count. Source-locked above.
  });
});

describe('C. Mallan-owned, never imported (0 active, 0 historical)', () => {
  it('legacy JSON fallback is permitted', () => {
    const { media } = compose([], {
      listingId: 'SL-0004', rlsEligible: false,
      legacyMedia: [{ MediaURL: COTALITY(3), MediaCategory: 'Photo', Order: 0 }],
      hadRelationalRows: false,
    });
    expect(media.length).toBeGreaterThan(0);
  });

  it('UNKNOWN existence still fails closed for Mallan-owned media', () => {
    const { media } = compose([], {
      listingId: 'SL-0004', rlsEligible: false,
      legacyMedia: [{ MediaURL: COTALITY(3), MediaCategory: 'Photo', Order: 0 }],
      hadRelationalRows: undefined,
    });
    expect(media).toHaveLength(0);
  });
});

describe('D. third-party with no usable active media and legitimate legacy media', () => {
  it('the canonical third-party fallback is preserved', () => {
    const { media } = compose([], {
      listingId: 'RLS20105333', rlsEligible: true,
      legacyMedia: [{ MediaURL: COTALITY(4), MediaCategory: 'Photo', Order: 0 }],
      hadRelationalRows: false,
    });
    expect(media.length).toBeGreaterThan(0);
  });
});

describe('E. no per-media query', () => {
  it('the composition performs no Prisma access at all', () => {
    const src = fs
      .readFileSync(path.join(ROOT, 'lib/media/db-media-composition.ts'), 'utf8')
      .replace(/\r\n?/g, '\n');
    expect(src).not.toMatch(/from ['"]@\/lib\/prisma['"]/);
    expect(src).not.toMatch(/prisma\./);
    expect(src).not.toMatch(/await /);
  });

  it('the detail page selects media in ONE include, not per item', () => {
    const includes = code.match(/listing_media:\s*\{/g) || [];
    expect(includes.length).toBe(1);
  });
});
