/// <reference types="jest" />
/**
 * Detail/card media-consistency P0 (2026-07-16) + Codex hardening.
 *
 * ORIGINAL P0: featured/search CARDS showed photos while the LISTING DETAIL page
 * showed the gray placeholder for the same listing (both ran
 * `rows.length > 0 ? fromRows : legacyJson` but fed it different row sets).
 *
 * FIX: a shared DB-only policy `resolveDbListingMedia` keyed on RESOLVED active
 * media + LISTING PROVENANCE (never raw rows.length, never mls_id):
 *   1. relational active media wins;
 *   2. zero usable → fall back to legacy Cotality JSON for third-party listings;
 *   3. Mallan-owned deletions are authoritative (deleted photos never resurrect).
 *
 * CODEX HARDENING (this revision):
 *   • Media ownership uses ONLY the canonical `isMallanExclusiveListing` signal —
 *     SL-/RL- listing_id OR rls_eligible === false — NEVER agent_id/owner_client_id.
 *     `syncAgentHistory` stamps agent_id onto third-party IDX rows, so using it
 *     would mislabel third-party listings as Mallan and BLOCK their legitimate
 *     Cotality fallback (Codex finding #2).
 *   • FAIL-CLOSED for Mallan-owned media when the all-status existence signal is
 *     UNKNOWN: `hadRelationalRows` is undefined for an active-only caller that did
 *     not pass `_count`, so a Mallan all-deleted listing must NOT resurrect its
 *     legacy JSON (Codex finding #1).
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

function row(over: Partial<ListingMediaTableRow> = {}): ListingMediaTableRow {
  const merged = {
    media_url_cached: 'https://r2.dev/a-card.webp',
    media_type: 'Photo', media_category: 'Photo', media_classification: null,
    order: 0, preferred_photo_yn: false, status: 'active', ...over,
  } as ListingMediaTableRow;
  if (merged.media_url_original == null) merged.media_url_original = merged.media_url_cached;
  return merged;
}

const legacyPhotos = [
  { url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo', order: 0 },
  { url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/2.jpg', type: 'photo', order: 1 },
];

// Provenance contexts — ONLY listingId (SL-/RL-) and rlsEligible are signals.
const IDX_CTX: MediaFallbackContext = { listingId: 'RLS20103891', rlsEligible: true };
const IDX_CTX_BARE: MediaFallbackContext = { listingId: 'RLS20103891' };       // no rls_eligible either
const CRM_SL_CTX: MediaFallbackContext = { listingId: 'SL-0004' };
const CRM_RL_CTX: MediaFallbackContext = { listingId: 'RL-0007' };
const WEBSITE_ONLY_CTX: MediaFallbackContext = { listingId: 'C-1001', rlsEligible: false };

// ════════════════════════════════════════════════════════════════════════════
// isMallanOwnedListing — canonical signal, NEVER agent_id (Codex #2)
// ════════════════════════════════════════════════════════════════════════════
describe('isMallanOwnedListing — SL-/RL- OR rls_eligible===false, never agent_id', () => {
  it('third-party Cotality/IDX (RLS id) → false', () => {
    expect(isMallanOwnedListing(IDX_CTX)).toBe(false);
    expect(isMallanOwnedListing(IDX_CTX_BARE)).toBe(false);
  });
  it('SL-/RL- listing_id → true', () => {
    expect(isMallanOwnedListing(CRM_SL_CTX)).toBe(true);
    expect(isMallanOwnedListing(CRM_RL_CTX)).toBe(true);
  });
  it('website-only (rls_eligible === false) → true', () => {
    expect(isMallanOwnedListing(WEBSITE_ONLY_CTX)).toBe(true);
  });
  it('EQUIVALENCE: isMallanOwnedListing delegates to the REAL canonical isMallanExclusiveListing', () => {
    // Single-source-of-truth proof (Maya, 2026-07-19): both REAL functions are
    // called on every row — the expected formula is never duplicated here, so
    // any future canonical-rule change is automatically covered. Includes the
    // casing behavior: the canonical rule is a case-SENSITIVE SL-/RL- prefix.
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { isMallanExclusiveListing } = require('@/lib/listings/exclusive-agent-assignment');
    const table: Array<{ label: string; listingId?: string | null; rlsEligible?: boolean | null }> = [
      { label: 'SL- uppercase', listingId: 'SL-0004' },
      { label: 'RL- uppercase', listingId: 'RL-0007' },
      { label: 'lowercase sl-', listingId: 'sl-0004' },
      { label: 'lowercase rl-', listingId: 'rl-0007' },
      { label: 'RLS third-party', listingId: 'RLS20103891', rlsEligible: true },
      { label: 'rls_eligible false', listingId: 'C-1001', rlsEligible: false },
      { label: 'rls_eligible true', listingId: 'RLS20103891', rlsEligible: true },
      { label: 'missing id + null rls', listingId: null, rlsEligible: null },
      { label: 'undefined everything' },
      { label: 'empty id', listingId: '' },
      { label: 'SL- with rls_eligible true', listingId: 'SL-0009', rlsEligible: true },
    ];
    for (const row of table) {
      const media = isMallanOwnedListing({ listingId: row.listingId, rlsEligible: row.rlsEligible });
      const canonical = isMallanExclusiveListing({
        listing_id: row.listingId ?? null,
        rls_eligible: row.rlsEligible ?? null,
      });
      expect({ label: row.label, result: media }).toEqual({ label: row.label, result: canonical });
    }
    // Unrelated agent/owner values cannot affect the result: the media context
    // cannot even carry them (excess-property type error), and passing a ctx
    // for a third-party listing that HAS agent_id in the DB stays false:
    expect(isMallanOwnedListing({ listingId: 'RLS20103891', rlsEligible: true })).toBe(false);
    // Casing behavior explicitly matches the canonical helper on both sides:
    expect(isMallanOwnedListing({ listingId: 'sl-0004' })).toBe(
      isMallanExclusiveListing({ listing_id: 'sl-0004' })
    );
  });

  it('the MediaFallbackContext type carries NO agent_id/owner_client_id signal', () => {
    // Codex #2: syncAgentHistory stamps agent_id onto third-party IDX rows, so it
    // must not reach the media-ownership gate. The context type intentionally has
    // no such field — a third-party RLS listing is never Mallan-owned here.
    const ctx = { listingId: '', rlsEligible: false, mlsId: '' } satisfies MediaFallbackContext;
    expect(Object.keys(ctx)).not.toContain('agentId');
    expect(Object.keys(ctx)).not.toContain('ownerClientId');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// shouldFallbackToLegacyMedia — third-party governed by FEED history; Mallan fail-closed (Codex #1)
// ════════════════════════════════════════════════════════════════════════════
//
// DELIBERATELY REVISED 2026-08-15. This block previously asserted "third-party → ALWAYS fall back,
// any existence signal". That rule was wrong: when the provider deletes a listing's photos the
// canonical lane tombstones the feed rows, and unconditional fallback then republished the stale
// legacy gallery (verified live on RLS20082303 — provider PhotosCount 0, 20 rows all `deleted`,
// 20 stale legacy items rendering).
//
// The assertions below are UNCHANGED in value but no longer mean what they used to: they are
// 2-argument calls, so `hadFeedRelationalRows` is `undefined` (not looked up) and fallback is
// preserved. They now pin the UNKNOWN-signal path, which is deliberately fail-open to previous
// behaviour so un-adopted callers cannot regress. The feed-governed cases are asserted explicitly
// below so this block can never again pass for a reason other than the one it documents.
describe('shouldFallbackToLegacyMedia — fail-closed for Mallan on unknown', () => {
  it('third-party + UNKNOWN feed history (not looked up) → fall back, preserving prior behaviour', () => {
    expect(shouldFallbackToLegacyMedia(true, IDX_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia(false, IDX_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia(undefined, IDX_CTX)).toBe(true);
  });
  it('third-party + feed rows PROVABLY existed (all now inactive) → authoritative feed-empty, NO fallback', () => {
    expect(shouldFallbackToLegacyMedia(true, IDX_CTX, true)).toBe(false);
    expect(shouldFallbackToLegacyMedia(undefined, IDX_CTX, true)).toBe(false);
  });
  it('third-party + feed PROVABLY never materialized → fallback allowed (the never-imported residuals)', () => {
    expect(shouldFallbackToLegacyMedia(false, IDX_CTX, false)).toBe(true);
    // CRM-only relational history must NOT suppress the Cotality fallback.
    expect(shouldFallbackToLegacyMedia(true, IDX_CTX, false)).toBe(true);
  });
  it('Mallan-owned + provably never-imported (false) → fall back to its legacy JSON', () => {
    expect(shouldFallbackToLegacyMedia(false, CRM_SL_CTX)).toBe(true);
    expect(shouldFallbackToLegacyMedia(false, WEBSITE_ONLY_CTX)).toBe(true);
  });
  it('Mallan-owned + rows existed all deleted (true) → authoritative empty, NO fallback', () => {
    expect(shouldFallbackToLegacyMedia(true, CRM_SL_CTX)).toBe(false);
    expect(shouldFallbackToLegacyMedia(true, CRM_RL_CTX)).toBe(false);
  });
  it('Mallan-owned + UNKNOWN existence (undefined) → FAIL-CLOSED, NO fallback', () => {
    expect(shouldFallbackToLegacyMedia(undefined, CRM_SL_CTX)).toBe(false);
    expect(shouldFallbackToLegacyMedia(undefined, WEBSITE_ONLY_CTX)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// resolveDbListingMedia — selection policy + fail-closed
// ════════════════════════════════════════════════════════════════════════════
describe('resolveDbListingMedia — relational precedence + safe fallback', () => {
  it('third-party with only deleted/replaced rows + legacy JSON → photos appear', () => {
    const rows = [row({ status: 'deleted' }), row({ status: 'replaced', order: 1 })];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
  });
  it('third-party (bare RLS ctx) with all-deleted rows → still falls back to Cotality JSON', () => {
    const out = resolveDbListingMedia([row({ status: 'deleted' })], legacyPhotos, IDX_CTX_BARE, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
  });
  it('active relational media always wins; legacy ignored', () => {
    const rows = [row({ media_url_cached: 'https://r2.dev/live.webp', status: 'active' })];
    const out = resolveDbListingMedia(rows, legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(1);
    expect(out[0].url).toContain('live.webp');
  });
  it('third-party with NO relational rows + legacy JSON → photos (undefined existence still safe)', () => {
    const out = resolveDbListingMedia([], legacyPhotos, IDX_CTX, { legacyMapUrl: (u) => u });
    expect(out.length).toBe(2);
  });

  // Codex #1 — the resurrection guard.
  it('Mallan (SL-) all-deleted rows, UNKNOWN existence (no hadRelationalRows) → [] (fail-closed)', () => {
    const rows = [row({ status: 'deleted' }), row({ status: 'deleted', order: 1 })];
    expect(resolveDbListingMedia(rows, legacyPhotos, CRM_SL_CTX, { legacyMapUrl: (u) => u })).toEqual([]);
  });
  it('Mallan (SL-) all-deleted rows, hadRelationalRows=true → [] (authoritative)', () => {
    expect(resolveDbListingMedia([row({ status: 'deleted' })], legacyPhotos, CRM_SL_CTX, {
      hadRelationalRows: true, legacyMapUrl: (u) => u,
    })).toEqual([]);
  });
  it('Mallan (SL-) provably never-imported (hadRelationalRows=false) → legacy JSON fallback', () => {
    const out = resolveDbListingMedia([], legacyPhotos, CRM_SL_CTX, {
      hadRelationalRows: false, legacyMapUrl: (u) => u,
    });
    expect(out.length).toBe(2);
  });
  it('website-only all-deleted, unknown existence → [] (fail-closed)', () => {
    expect(resolveDbListingMedia([row({ status: 'deleted' })], legacyPhotos, WEBSITE_ONLY_CTX, { legacyMapUrl: (u) => u })).toEqual([]);
  });

  it('active-only caller: rows=[] but hadRelationalRows=true + third-party → legacy fallback', () => {
    expect(resolveDbListingMedia([], legacyPhotos, IDX_CTX, { hadRelationalRows: true, legacyMapUrl: (u) => u }).length).toBe(2);
  });
  it('active-only caller: rows=[] but hadRelationalRows=true + Mallan → [] (no resurrection)', () => {
    expect(resolveDbListingMedia([], legacyPhotos, CRM_SL_CTX, { hadRelationalRows: true, legacyMapUrl: (u) => u })).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Parity through the REAL public DTO (dbListingToPublicDTO) with _count semantics
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

  // Codex #2: third-party stays third-party even if a caller had stamped agent_id.
  it('third-party with agent_id present → media still falls back to Cotality JSON', () => {
    const dto = dbListingToPublicDTO(makeListing({
      agent_id: 42n,   // stamped by syncAgentHistory; NOT a media-ownership signal
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo' }],
      listing_media: [row({ status: 'deleted' })],
    }));
    expect(dto.media.length).toBe(1);
  });

  // Codex #1: Mallan-owned, active-only rows empty, NO _count → fail-closed.
  it('Mallan (SL-), all rows deleted, NO _count (active-only caller) → empty (no resurrection)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      listing_id: 'SL-0004', mls_id: 'SL-0004',
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [],          // active-only query returned none; no _count → unknown
    }));
    expect(dto.media).toEqual([]);
  });

  it('Mallan (SL-), _count>0 (rows existed, all deleted) → empty (authoritative)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      listing_id: 'SL-0004', mls_id: 'SL-0004',
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [], _count: { listing_media: 3 },
    }));
    expect(dto.media).toEqual([]);
  });

  it('Mallan (SL-), _count=0 (provably never imported) → legacy JSON fallback', () => {
    const dto = dbListingToPublicDTO(makeListing({
      listing_id: 'SL-0004', mls_id: 'SL-0004',
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [], _count: { listing_media: 0 },
    }));
    expect(dto.media.length).toBe(1);
  });

  it('third-party, rows=[] + _count>0 (deleted) → legacy fallback (card matches detail)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg', type: 'photo' }],
      listing_media: [], _count: { listing_media: 3 },
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
// Detail-page wiring (source-locked)
// ════════════════════════════════════════════════════════════════════════════
describe('detail page wiring — shared helper, canonical provenance, DB-only, ISR intact', () => {
  const detailPage = read('app/listing/[...slug]/page.tsx');
  const code = detailPage.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  /**
   * UPDATED 2026-08-07 — the detail page no longer calls `resolveDbListingMedia`
   * DIRECTLY. It calls `composeDbPublicMedia`, the ONE canonical DB→public media
   * composition, which performs that resolution plus the canonical URL mapping
   * and photo count. `dbListingToPublicDTO` calls the SAME composition, so the
   * two paths can no longer derive different media, URLs or counts.
   *
   * The invariant is unchanged — the detail page must use the shared canonical
   * resolution and must not pass agent/owner signals as media-ownership signals.
   * Only the name of the shared entry point moved.
   */
  it('uses the canonical shared media composition for the render media', () => {
    expect(code).toMatch(/composeDbPublicMedia\s*\(/);
  });
  it('does NOT re-resolve or re-map media itself (single composition)', () => {
    // A second URL map over already-proxied relative URLs is exactly what
    // produced the nested-proxy 403s on production.
    expect(code).not.toMatch(/resolveDbListingMedia\s*\(/);
    expect(code).not.toMatch(/proxyDetailMediaUrl\(m\.url\)/);
    expect(code).not.toMatch(/classifyMediaItem\s*\(/);
  });
  it('does NOT pass agentId/ownerClientId/mlsId (agent_id is not a media-ownership signal)', () => {
    const call = code.slice(code.indexOf('composeDbPublicMedia('), code.indexOf('composeDbPublicMedia(') + 500);
    expect(call).toMatch(/listingId:\s*dbListing\.listing_id/);
    expect(call).toMatch(/rlsEligible:\s*dbListing\.rls_eligible/);
    expect(call).not.toMatch(/agentId/);
    expect(call).not.toMatch(/ownerClientId/);
    expect(call).not.toMatch(/mlsId/);
  });
  /**
   * REPLACED 2026-08-07 (commit 4). This previously asserted the detail page
   * fetched listing_media across ALL STATUSES, because the row array was then
   * the all-status existence signal.
   *
   * The page now fetches ACTIVE rows only and takes existence from an
   * all-status `_count` aggregate — same contract as /api/listings:393-412.
   *
   * NOTE ON THE OLD ASSERTION: it was
   *   expect(detailPage).not.toMatch(/listing_media:\s*\{\s*where:\s*\{\s*status:…/)
   * which requires `where` to immediately follow `{`. After the change a
   * comment block sits between them, so the negative regex still "passed" —
   * a FALSE GREEN that would have let the contract flip silently. Replaced with
   * assertions over comment-stripped source that state the intended contract
   * positively.
   */
  it('fetches ACTIVE listing_media only, with an all-status _count for existence', () => {
    expect(detailPage).toMatch(/LISTING_MEDIA_INCLUDE/);
    // Comment-stripped, so an intervening comment cannot mask the shape.
    expect(code).toMatch(/listing_media:\s*\{[\s\S]{0,200}?where:\s*\{\s*status:\s*['"]active['"]/);
    expect(code).toMatch(/_count:\s*\{\s*select:\s*\{\s*listing_media:\s*true/);
  });

  it('derives all-status existence from _count, never from the fetched rows', () => {
    expect(code).toMatch(/dbListing\._count\?\.listing_media/);
    expect(code).not.toMatch(/hadRelationalRows:\s*listingMediaRows\.length/);
  });
  it('reintroduces NO live Cotality media call (PR #511 intact)', () => {
    expect(code).not.toMatch(/fetchListingMedia\s*\(/);
    expect(code).not.toMatch(/from\s+['"]@\/lib\/idx\/fetch['"]/);
    expect(code).not.toMatch(/from\s+['"]@\/lib\/idx\/auth['"]/);
  });
  it('keeps ISR intact: revalidate = 600 (One Cycle W1 — ISR window = unified 10-min cadence), dynamicParams, generateStaticParams', () => {
    // One Cycle W1: the page can never be fresher than the feed sync, so the
    // ISR window equals the unified One Cycle cadence (10 min = 600s;
    // identical effective freshness, and sync-driven revalidateTag still
    // expires the page in-line on every actual change).
    expect(detailPage).toMatch(/export const revalidate = 600/);
    expect(detailPage).toMatch(/export const dynamicParams = true/);
    expect(detailPage).toMatch(/export async function generateStaticParams/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Active-only DTO callers pass _count (Codex #1) & drop the agent_id media signal.
// ════════════════════════════════════════════════════════════════════════════
describe('active-only dbListingToPublicDTO callers select _count (no N+1, no resurrection)', () => {
  const callers = [
    'app/api/agents/[slug]/listings/route.ts',
    'app/api/listings/route.ts',
    'app/api/crm/listing-campaigns/route.ts',
  ];
  it('every active-only listing_media select is paired with a _count existence signal', () => {
    for (const f of callers) {
      const src = read(f);
      const activeSelects = (src.match(/listing_media:\s*\{\s*where:\s*\{\s*status:\s*['"]active['"]/g) || []).length;
      const counts = (src.match(/_count:\s*\{\s*select:\s*\{\s*listing_media:\s*true\s*\}\s*\}/g) || []).length;
      expect(counts).toBeGreaterThanOrEqual(activeSelects);
    }
  });
  it('db-to-public-dto derives hadRelationalRows from _count only (undefined when absent)', () => {
    const dto = read('lib/idx/db-to-public-dto.ts');
    expect(dto).toMatch(/listing\._count\?\.listing_media/);
    expect(dto).toMatch(/:\s*undefined/); // fail-closed branch when _count absent
    const call = dto.slice(dto.indexOf('resolveDbListingMedia('), dto.indexOf('resolveDbListingMedia(') + 400);
    expect(call).not.toMatch(/agentId/);
    expect(call).not.toMatch(/ownerClientId/);
  });
});
