/// <reference types="jest" />
/**
 * Detail/card media-consistency P0 (2026-07-16).
 *
 * SYMPTOM: featured/search CARDS showed photos while the LISTING DETAIL page
 * showed the gray placeholder for the same listing (repro: RLS20103891 →
 * /listing/372-5th-avenue-apt-7m-new-york-city-ny-10018/rls20103891).
 *
 * ROOT CAUSE: both surfaces ran `rows.length > 0 ? fromRows : legacyJson`, but
 * fed it different row sets. `/api/listings` queries `listing_media WHERE
 * status='active'`, so an all-deleted listing returns 0 rows → the legacy
 * `Listing.media` JSON fallback fires → photos. The detail page fetches ALL
 * statuses, so the same listing returns non-empty rows → the ternary commits to
 * the relational path → `resolveListingMediaFromRows` filters to active → [] →
 * NO fallback → placeholder.
 *
 * FIX: a shared DB-only policy `resolveDbListingMedia` keyed on the RESOLVED
 * active-media count + LISTING PROVENANCE (never raw `rows.length`, never
 * `mls_id`):
 *   1. relational active media wins when present;
 *   2. zero usable → fall back to the legacy Cotality JSON for third-party
 *      IDX/RLS (and un-synced) listings;
 *   3. a Mallan-owned listing (website-only / agent_id / owner_client_id /
 *      SL-RL) with deleted rows stays authoritatively empty.
 *
 * Provenance mirrors `classifyDbListing`: rls_eligible === false → website-only;
 * agent_id or owner_client_id → Mallan exclusive; SL-/RL- reinforcing. `mls_id`
 * is NOT a signal (a caller such as /api/listings does not even select it).
 *
 * Card-side deletion authority uses an all-status existence signal
 * (`_count.listing_media`) so the active-only card query can still tell
 * "no rows ever" from "rows existed but were deleted" — WITHOUT loading deleted
 * rows and WITHOUT an extra per-listing query.
 *
 * DB-ONLY: no live Cotality request is reintroduced to the public render (PR #511).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveDbListingMedia,
  shouldFallbackToLegacyMedia,
  isMallanOwnedListing,
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

// Legacy `Listing.media` JSON items — Cotality-sourced for a third-party listing.
const legacyPhotos = [
  { url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo', order: 0 },
  { url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/2.jpg', type: 'photo', order: 1 },
];

// Provenance contexts (NO mls_id anywhere — it is not a signal).
const IDX_CTX: MediaFallbackContext = { listingId: 'RLS20103891', rlsEligible: true };
const IDX_CTX_NO_SIGNALS: MediaFallbackContext = { listingId: 'RLS20103891' }; // rls_eligible omitted too
const CRM_AGENT_CTX: MediaFallbackContext = { listingId: '5512340001', agentId: 42n };        // Mallan agent, non-SL id
const CRM_OWNER_CTX: MediaFallbackContext = { listingId: '5512340002', ownerClientId: 7n };   // Mallan owner, non-SL id
const CRM_SL_CTX: MediaFallbackContext = { listingId: 'SL-0004' };                            // reinforcing id
const CRM_RL_CTX: MediaFallbackContext = { listingId: 'RL-0007' };
const WEBSITE_ONLY_CTX: MediaFallbackContext = { listingId: 'C-1001', rlsEligible: false };

// ════════════════════════════════════════════════════════════════════════════
// isMallanOwnedListing — provenance authority (mirrors classifyDbListing)
// ════════════════════════════════════════════════════════════════════════════
describe('isMallanOwnedListing — provenance signals, never mls_id', () => {
  it('third-party Cotality/IDX (RLS id, no Mallan signals) → false', () => {
    expect(isMallanOwnedListing(IDX_CTX)).toBe(false);
    expect(isMallanOwnedListing(IDX_CTX_NO_SIGNALS)).toBe(false);
  });
  it('website-only (rls_eligible === false) → true', () => {
    expect(isMallanOwnedListing(WEBSITE_ONLY_CTX)).toBe(true);
  });
  it('Mallan exclusive via agent_id or owner_client_id (non-SL id) → true', () => {
    expect(isMallanOwnedListing(CRM_AGENT_CTX)).toBe(true);
    expect(isMallanOwnedListing(CRM_OWNER_CTX)).toBe(true);
  });
  it('SL-/RL- listing-id namespace → true (reinforcing)', () => {
    expect(isMallanOwnedListing(CRM_SL_CTX)).toBe(true);
    expect(isMallanOwnedListing(CRM_RL_CTX)).toBe(true);
  });
  it('a MISSING mls_id must NOT classify a row as Mallan-owned', () => {
    // No mls_id field at all, no Mallan signals → still third-party.
    expect(isMallanOwnedListing({ listingId: 'RLS99999999' })).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// shouldFallbackToLegacyMedia — never-imported vs all-deleted × provenance
// ════════════════════════════════════════════════════════════════════════════
describe('shouldFallbackToLegacyMedia — explicit hadRelationalRows', () => {
  it('never imported (hadRelationalRows=false) → fall back for EVERYONE', () => {
    expect(shouldFallbackToLegacyMedia(false, IDX_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia(false, CRM_SL_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia(false, CRM_AGENT_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia(false, WEBSITE_ONLY_CTX)).toBe(true);
  });
  it('rows existed but none active + third-party → fall back to legacy Cotality JSON', () => {
    expect(shouldFallbackToLegacyMedia(true, IDX_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia(true, IDX_CTX_NO_SIGNALS)).toBe(true);
  });
  it('rows existed but none active + Mallan-owned → authoritative empty, NO fallback', () => {
    expect(shouldFallbackToLegacyMedia(true, CRM_SL_CTX)).toBe(false);
    expect(shouldFallbackToLegacyMedia(true, CRM_AGENT_CTX)).toBe(false);
    expect(shouldFallbackToLegacyMedia(true, CRM_OWNER_CTX)).toBe(false);
    expect(shouldFallbackToLegacyMedia(true, WEBSITE_ONLY_CTX)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// resolveDbListingMedia — shared selection policy (the P0 buckets)
// ════════════════════════════════════════════════════════════════════════════
describe('resolveDbListingMedia — relational precedence + provenance fallback', () => {
  // (A) THE BUG: third-party RLS, relational rows all deleted/replaced, legacy JSON.
  it('third-party RLS with only deleted/replaced rows + legacy JSON → photos appear', () => {
    const rows = [row({ status: 'deleted' }), row({ status: 'replaced', order: 1 })];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
    expect(out.every((m) => m.class === 'photo')).toBe(true);
  });

  // Third-party classified even when mls_id is omitted by the caller.
  it('third-party with NO provenance signals (mls_id omitted) → still falls back to legacy JSON', () => {
    const rows = [row({ status: 'deleted' })];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX_NO_SIGNALS, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
  });

  // (B) third-party with ACTIVE relational media → relational/R2 wins.
  it('third-party with active relational media → relational (R2) wins; legacy ignored', () => {
    const rows = [row({ media_url_cached: 'https://r2.dev/active-hero.webp', status: 'active' })];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(1);
    expect(out[0].url).toContain('active-hero.webp');
    expect(out.some((m) => m.url.includes('cotality.com'))).toBe(false);
  });

  // (C) third-party, no relational rows, valid legacy JSON → photos.
  it('third-party with NO relational rows + legacy JSON → photos appear', () => {
    const out = resolveDbListingMedia([], legacyPhotos, IDX_CTX, {
      hadRelationalRows: false, legacyMapUrl: (u) => u,
    });
    expect(out.length).toBe(2);
  });

  // (D) Mallan-owned, relational rows all deleted → placeholder ([]); legacy NOT resurrected.
  it('Mallan exclusive (agent_id) with all-deleted rows → [] (deleted photos never resurrect)', () => {
    const rows = [row({ status: 'deleted' }), row({ status: 'deleted', order: 1 })];
    expect(resolveDbListingMedia(rows, legacyPhotos, CRM_AGENT_CTX, { legacyMapUrl: (u) => u })).toEqual([]);
  });
  it('Mallan exclusive (SL- id) with all-deleted rows → []', () => {
    expect(resolveDbListingMedia([row({ status: 'deleted' })], legacyPhotos, CRM_SL_CTX, { legacyMapUrl: (u) => u })).toEqual([]);
  });
  it('website-only (rls_eligible=false) with all-deleted rows → []', () => {
    expect(resolveDbListingMedia([row({ status: 'deleted' })], legacyPhotos, WEBSITE_ONLY_CTX, { legacyMapUrl: (u) => u })).toEqual([]);
  });

  // (E) Mallan-owned, no rows ever imported → legacy JSON fallback still works.
  it('Mallan exclusive with NO relational rows → legacy JSON fallback (never-imported)', () => {
    const out = resolveDbListingMedia([], legacyPhotos, CRM_SL_CTX, {
      hadRelationalRows: false, legacyMapUrl: (u) => u,
    });
    expect(out.length).toBe(2);
  });

  // Active relational media always wins.
  it('one deleted + one active relational row → active surfaces (rows.length not the key)', () => {
    const rows = [
      row({ media_url_cached: 'https://r2.dev/live.webp', status: 'active', order: 0 }),
      row({ media_url_cached: 'https://r2.dev/gone.webp', status: 'deleted', order: 1 }),
    ];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(1);
    expect(out[0].url).toContain('live.webp');
  });

  // Card-side signal: active-only rows (empty) + all-status _count > 0.
  it('active-only caller: empty rows but hadRelationalRows=true + third-party → legacy fallback', () => {
    const out = resolveDbListingMedia([], legacyPhotos, IDX_CTX, {
      hadRelationalRows: true, legacyMapUrl: (u) => u,
    });
    expect(out.length).toBe(2);
  });
  it('active-only caller: empty rows but hadRelationalRows=true + Mallan-owned → [] (no resurrection)', () => {
    const out = resolveDbListingMedia([], legacyPhotos, CRM_SL_CTX, {
      hadRelationalRows: true, legacyMapUrl: (u) => u,
    });
    expect(out).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Parity through the REAL public DTO (dbListingToPublicDTO) — card + detail
// share the policy, including the _count-based all-status existence signal.
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

  it('third-party, all relational rows deleted, legacy JSON present → card DTO shows photos', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo' }],
      listing_media: [row({ status: 'deleted' })],
    }));
    expect(dto.media.length).toBe(1);
  });

  it('Mallan exclusive (agent_id), all relational rows deleted → card DTO empty (no resurrection)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      agent_id: 42n,
      media: [{ url: 'https://r2.dev/listings/legacy.webp', type: 'photo' }],
      listing_media: [row({ status: 'deleted' })],
    }));
    expect(dto.media).toEqual([]);
  });

  // Card-side gap closure via _count: active-only rows empty, but rows existed.
  it('active-only card query (rows=[]) + _count>0 + third-party → legacy photos (card matches detail)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo' }],
      listing_media: [],                              // active-only query returned none
      _count: { listing_media: 3 },                   // but 3 rows exist (deleted)
    }));
    expect(dto.media.length).toBe(1);
  });

  it('active-only card query (rows=[]) + _count>0 + Mallan-owned → empty (no resurrection on card)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      listing_id: 'SL-0004', mls_id: 'SL-0004',
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [],
      _count: { listing_media: 3 },
    }));
    expect(dto.media).toEqual([]);
  });

  it('active-only card query (rows=[]) + _count=0 (never imported) → legacy fallback', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo' }],
      listing_media: [],
      _count: { listing_media: 0 },
    }));
    expect(dto.media.length).toBe(1);
  });

  it('third-party with active relational media → relational wins on the card too', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/legacy.jpg', type: 'photo' }],
      listing_media: [row({ media_url_cached: 'https://r2.dev/active.webp', status: 'active' })],
    }));
    expect(dto.media.length).toBe(1);
    expect(dto.media[0].url).toContain('active.webp');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Detail-page wiring (source-locked): shared helper, provenance not mls_id,
// DB-only, ISR intact.
// ════════════════════════════════════════════════════════════════════════════
describe('detail page wiring — shared helper, provenance, DB-only, ISR intact', () => {
  const detailPage = read('app/listing/[...slug]/page.tsx');
  const code = detailPage
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('uses resolveDbListingMedia for the render media', () => {
    expect(code).toMatch(/resolveDbListingMedia\s*\(/);
  });

  it('does NOT gate the fallback on raw listing_media rows.length ternary', () => {
    expect(code).not.toMatch(/listingMediaRows\.length\s*>\s*0\s*\n?\s*\?/);
  });

  it('passes provenance (rls_eligible / agent_id / owner_client_id) and NOT mls_id', () => {
    // Scope to the resolveDbListingMedia call itself — the PublicListingDTO
    // separately (and legitimately) carries a `mlsId` field for the listing's
    // real MLS id, which is unrelated to the media provenance ctx.
    const call = code.slice(code.indexOf('resolveDbListingMedia('), code.indexOf('resolveDbListingMedia(') + 500);
    expect(call).toMatch(/rlsEligible:\s*dbListing\.rls_eligible/);
    expect(call).toMatch(/agentId:\s*dbListing\.agent_id/);
    expect(call).toMatch(/ownerClientId:\s*dbListing\.owner_client_id/);
    expect(call).not.toMatch(/mlsId/);
  });

  it('fetches listing_media across ALL statuses (no active-only filter) so deletions are visible', () => {
    expect(detailPage).toMatch(/LISTING_MEDIA_INCLUDE/);
    expect(detailPage).not.toMatch(/listing_media:\s*\{\s*where:\s*\{\s*status:\s*['"]active['"]\s*\}/);
  });

  it('reintroduces NO live Cotality media call on the render path (PR #511 intact)', () => {
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

// ════════════════════════════════════════════════════════════════════════════
// Card route (/api/listings) — closes the deletion-authority gap with _count,
// shared helper, and ZERO extra per-listing queries (no N+1).
// ════════════════════════════════════════════════════════════════════════════
describe('/api/listings card-side deletion authority', () => {
  const route = read('app/api/listings/route.ts');
  // Isolate the DB media-fallback block.
  const startIdx = route.indexOf('const stillEmpty');
  const phase2 = startIdx >= 0 ? route.slice(startIdx, startIdx + 2200) : '';

  it('selects an all-status existence signal (_count.listing_media)', () => {
    expect(phase2).toContain('_count: { select: { listing_media: true } }');
  });

  it('still selects only ACTIVE listing_media rows (no deleted rows loaded into the payload)', () => {
    expect(phase2).toMatch(/listing_media:\s*\{\s*where:\s*\{\s*status:\s*['"]active['"]\s*\}/);
  });

  it('routes through the shared resolveDbListingMedia with provenance + hadRelationalRows', () => {
    expect(phase2).toContain('resolveDbListingMedia');
    expect(phase2).toMatch(/hadRelationalRows:\s*\(dbL\._count\?\.listing_media\s*\?\?\s*0\)\s*>\s*0/);
    expect(phase2).toMatch(/rlsEligible:\s*dbL\.rls_eligible/);
    expect(phase2).toMatch(/agentId:\s*dbL\.agent_id/);
    expect(phase2).toMatch(/ownerClientId:\s*dbL\.owner_client_id/);
  });

  it('adds ZERO extra per-listing queries — exactly one batched prisma call in the block (no N+1)', () => {
    const prismaCalls = (phase2.match(/prisma\./g) || []).length;
    expect(prismaCalls).toBe(1);
    expect(phase2).toMatch(/prisma\.listing\.findMany/);
    // No per-item findUnique/findFirst inside the loop.
    expect(phase2).not.toMatch(/findUnique|findFirst/);
  });
});
