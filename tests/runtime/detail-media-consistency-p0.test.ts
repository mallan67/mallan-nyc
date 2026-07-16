/// <reference types="jest" />
/**
 * Detail/card media-consistency P0 (2026-07-16).
 *
 * SYMPTOM: featured/search CARDS showed photos while the LISTING DETAIL page
 * showed the gray placeholder for the same listing (repro: RLS20103891 →
 * /listing/372-5th-avenue-apt-7m-new-york-city-ny-10018/rls20103891).
 *
 * ROOT CAUSE: both surfaces ran the same `rows.length > 0 ? fromRows : legacyJson`
 * ternary, but fed it different row sets. The card list route queries
 * `listing_media WHERE status='active'`, so a listing whose rows are all
 * deleted/replaced returns 0 rows → the legacy `Listing.media` JSON fallback
 * fires → photos. The detail page fetches ALL statuses (needed for CRM deletion
 * authority), so the same listing returns non-empty rows → the ternary commits
 * to the relational path → `resolveListingMediaFromRows` filters to active → []
 * → NO fallback → placeholder.
 *
 * FIX: a shared DB-only policy `resolveDbListingMedia` keyed on the RESOLVED
 * active-media count + listing type (NOT raw `rows.length`):
 *   1. relational active media wins when present;
 *   2. zero usable → fall back to the legacy JSON for third-party IDX/RLS
 *      (and un-synced / not-yet-migrated) listings;
 *   3. a CRM exclusive with deleted rows stays authoritatively empty
 *      (deleted Mallan photos must never resurrect).
 *
 * DB-ONLY: no live Cotality/Trestle call is reintroduced to the public render
 * path (PR #511 stays intact).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveDbListingMedia,
  shouldFallbackToLegacyMedia,
  type ListingMediaTableRow,
  type MediaFallbackContext,
} from '@/lib/media/listing-media-resolver';
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ── row + context fixtures ──────────────────────────────────────────────────
function row(over: Partial<ListingMediaTableRow> = {}): ListingMediaTableRow {
  const merged = {
    media_url_cached: 'https://r2.dev/a-card.webp',
    media_type: 'Photo',
    media_category: 'Photo',
    media_classification: null,
    order: 0,
    preferred_photo_yn: false,
    status: 'active',
    ...over,
  } as ListingMediaTableRow;
  if (merged.media_url_original == null) merged.media_url_original = merged.media_url_cached;
  return merged;
}

// Legacy `Listing.media` JSON items (Cotality-sourced for a third-party listing).
const legacyPhotos = [
  { url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo', order: 0 },
  { url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/2.jpg', type: 'photo', order: 1 },
];

const IDX_CTX: MediaFallbackContext = { mlsId: 'RLS20103891', listingId: 'RLS20103891', rlsEligible: true };
const CRM_SL_CTX: MediaFallbackContext = { mlsId: null, listingId: 'SL-0004' };
const CRM_RL_CTX: MediaFallbackContext = { mlsId: null, listingId: 'RL-0007' };
const WEBSITE_ONLY_CTX: MediaFallbackContext = { mlsId: 'C-1001', listingId: 'C-1001', rlsEligible: false };

// ════════════════════════════════════════════════════════════════════════════
// shouldFallbackToLegacyMedia — the authority truth table
// ════════════════════════════════════════════════════════════════════════════
describe('shouldFallbackToLegacyMedia — never-imported vs all-deleted × listing type', () => {
  it('no relational rows at all → fall back for EVERYONE (nothing was deleted)', () => {
    expect(shouldFallbackToLegacyMedia([], IDX_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia([], CRM_SL_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia([], WEBSITE_ONLY_CTX)).toBe(true);
  });

  it('rows exist (all deleted) + third-party IDX/RLS → fall back to legacy JSON', () => {
    const rows = [row({ status: 'deleted' }), row({ status: 'replaced', order: 1 })];
    expect(shouldFallbackToLegacyMedia(rows, IDX_CTX)).toBe(true);
  });

  it('rows exist (all deleted) + CRM exclusive (SL-/RL-) → authoritative empty, NO fallback', () => {
    const rows = [row({ status: 'deleted' })];
    expect(shouldFallbackToLegacyMedia(rows, CRM_SL_CTX)).toBe(false);
    expect(shouldFallbackToLegacyMedia(rows, CRM_RL_CTX)).toBe(false);
  });

  it('rows exist (all deleted) + no mls_id → treated as CRM-created → NO fallback', () => {
    expect(shouldFallbackToLegacyMedia([row({ status: 'deleted' })], { mlsId: null, listingId: 'anything' })).toBe(false);
  });

  it('rows exist (all deleted) + website-only (rls_eligible === false) → NO fallback', () => {
    expect(shouldFallbackToLegacyMedia([row({ status: 'deleted' })], WEBSITE_ONLY_CTX)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// resolveDbListingMedia — the shared selection policy (the P0 buckets)
// ════════════════════════════════════════════════════════════════════════════
describe('resolveDbListingMedia — relational precedence + typed fallback', () => {
  // (A) THE BUG: third-party RLS, relational rows all deleted/replaced, valid legacy JSON.
  it('third-party RLS with only deleted/replaced relational rows + legacy JSON → photos appear', () => {
    const rows = [row({ status: 'deleted' }), row({ status: 'replaced', order: 1 })];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
    expect(out.every((m) => m.class === 'photo')).toBe(true);
    expect(out[0].isPrimary).toBe(true);
  });

  // (B) third-party with ACTIVE relational media → relational/R2 wins, legacy ignored.
  it('third-party with active relational media → relational (R2) wins; legacy JSON ignored', () => {
    const rows = [row({ media_url_cached: 'https://r2.dev/active-hero.webp', status: 'active' })];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(1);
    expect(out[0].url).toContain('active-hero.webp');
    expect(out.some((m) => m.url.includes('cotality.com'))).toBe(false);
  });

  // (C) third-party, no relational rows, valid legacy JSON → photos.
  it('third-party with NO relational rows + legacy JSON → photos appear', () => {
    const out = resolveDbListingMedia([], legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
  });

  // (D) CRM exclusive, relational rows all deleted → placeholder ([]); legacy NOT resurrected.
  it('CRM exclusive (SL-) with all-deleted relational rows → [] (deleted CRM photos never resurrect)', () => {
    const rows = [row({ status: 'deleted' }), row({ status: 'deleted', order: 1 })];
    const out = resolveDbListingMedia(rows, legacyPhotos, CRM_SL_CTX, { legacyMapUrl: (u) => u });
    expect(out).toEqual([]);
  });

  // (E) CRM exclusive, no rows ever imported → legacy JSON fallback still works.
  it('CRM exclusive (SL-) with NO relational rows + legacy JSON → photos (never-imported fallback)', () => {
    const out = resolveDbListingMedia([], legacyPhotos, CRM_SL_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
  });

  // (F) website-only exclusive, deleted rows → [] (authoritative).
  it('website-only exclusive (rls_eligible=false) with all-deleted rows → [] (authoritative)', () => {
    const rows = [row({ status: 'deleted' })];
    expect(resolveDbListingMedia(rows, legacyPhotos, WEBSITE_ONLY_CTX, { legacyMapUrl: (u) => u })).toEqual([]);
  });

  // Regression guard: the decision must NOT be keyed on raw rows.length.
  it('one deleted + one active relational row → active surfaces, legacy ignored (rows.length not the key)', () => {
    const rows = [
      row({ media_url_cached: 'https://r2.dev/live.webp', status: 'active', order: 0 }),
      row({ media_url_cached: 'https://r2.dev/gone.webp', status: 'deleted', order: 1 }),
    ];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(1);
    expect(out[0].url).toContain('live.webp');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Parity through the REAL public DTO (dbListingToPublicDTO) — card path uses the
// same shared helper, so its media output matches the detail-page policy.
// ════════════════════════════════════════════════════════════════════════════
describe('card DTO parity via dbListingToPublicDTO', () => {
  function makeListing(over: Record<string, unknown> = {}): DbListing {
    return ({
      id: '1', listing_id: 'RLS20103891', mls_id: 'RLS20103891', status: 'Active',
      listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condominium',
      list_price: '1495000', bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0,
      living_area: '820', borough: 'manhattan', neighborhood: 'NoMad',
      address: { StreetNumber: '372', StreetName: '5th Avenue', UnitNumber: '7M', City: 'New York', PostalCode: '10018' },
      features: {}, media: [], agent_info: { ListOfficeName: 'Mallan Real Estate Inc.' },
      rls_eligible: true, idx_display_yn: true, internet_entire_listing_display_yn: true,
      internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
      listing_contract_date: null,
      modification_timestamp: new Date('2026-07-01T00:00:00Z').toISOString(),
      created_at: new Date('2026-06-01T00:00:00Z').toISOString(),
      updated_at: new Date('2026-07-01T00:00:00Z').toISOString(),
      ...over,
    } as unknown) as DbListing;
  }

  it('third-party RLS, all relational rows deleted, legacy JSON present → card DTO shows photos', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo' }],
      listing_media: [row({ status: 'deleted' })],
    }));
    expect(dto.media.length).toBe(1);
  });

  it('CRM exclusive, all relational rows deleted → card DTO empty (no resurrection)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      listing_id: 'SL-0004', mls_id: 'SL-0004',
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [row({ status: 'deleted' })],
    }));
    expect(dto.media).toEqual([]);
  });

  it('third-party RLS with active relational media → relational wins on the card too', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/legacy.jpg', type: 'photo' }],
      listing_media: [row({ media_url_cached: 'https://r2.dev/active.webp', status: 'active' })],
    }));
    expect(dto.media.length).toBe(1);
    expect(dto.media[0].url).toContain('active.webp');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Detail-page wiring (source-locked): the render path uses the shared helper,
// never keys on raw rows.length, and stays DB-only + ISR-cacheable.
// ════════════════════════════════════════════════════════════════════════════
describe('detail page wiring — shared helper, DB-only, ISR intact', () => {
  const detailPage = read('app/listing/[...slug]/page.tsx');
  // Strip comments so assertions test CODE, not the notes explaining it.
  const code = detailPage
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('uses resolveDbListingMedia for the render media', () => {
    expect(code).toMatch(/resolveDbListingMedia\s*\(/);
  });

  it('does NOT gate the fallback on raw listing_media rows.length', () => {
    expect(code).not.toMatch(/listingMediaRows\.length\s*>\s*0/);
  });

  it('passes listing-type context so CRM deletion authority is honored', () => {
    expect(code).toMatch(/mlsId:\s*dbListing\.mls_id/);
    expect(code).toMatch(/listingId:\s*dbListing\.listing_id/);
    expect(code).toMatch(/rlsEligible:\s*dbListing\.rls_eligible/);
  });

  it('fetches listing_media across ALL statuses (no active-only filter) so deletions are visible', () => {
    expect(detailPage).toMatch(/LISTING_MEDIA_INCLUDE/);
    expect(detailPage).not.toMatch(/listing_media:\s*\{\s*where:\s*\{\s*status:\s*['"]active['"]\s*\}/);
  });

  it('reintroduces NO live Cotality/Trestle media call on the render path (PR #511 intact)', () => {
    expect(code).not.toMatch(/fetchListingMedia\s*\(/);
    expect(code).not.toMatch(/fetchSingleListing\s*\(/);
    expect(code).not.toMatch(/from\s+['"]@\/lib\/idx\/fetch['"]/);
    expect(code).not.toMatch(/from\s+['"]@\/lib\/idx\/auth['"]/);
  });

  it('keeps ISR: revalidate = 300, dynamicParams, generateStaticParams', () => {
    expect(detailPage).toMatch(/export const revalidate = 300/);
    expect(detailPage).toMatch(/export const dynamicParams = true/);
    expect(detailPage).toMatch(/export async function generateStaticParams/);
  });
});
