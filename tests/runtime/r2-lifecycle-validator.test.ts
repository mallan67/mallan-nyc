/// <reference types="jest" />
/**
 * R2-1 — R2 lifecycle validator (CI release gate).
 *
 * Root cause being guarded: before R2-1, the media-sync Phase-3 backlog SELECT
 * mirrored EVERY active `listing_media` row missing its R2 copy — an unscoped
 * feed-wide mirror that grew the bucket to 135.8 GiB (~0.63 GB/day). This
 * validator source-scans `lib/idx/media-sync.ts` (+ the `lib/media` mirror
 * helpers) and imports the module's pure surface to pin the R2-0 policy
 * invariants:
 *
 *   V1. Admission control exists and is wired into Phase 3
 *       (`decideMirrorAdmissionScope` + post-fetch filter).
 *   V2. The unconditional feed-wide mirror is NOT reachable: every occurrence
 *       of the bare `OR: [{ r2_key: null }, { media_url_cached: null }]`
 *       backlog shape lives in a function that also applies
 *       `buildR2MirrorPolicyMediaWhere` (the listing-scoped policy filter).
 *   V3. The feed-listing mirror ceiling is exactly 1 photo
 *       (`MAX_FEED_MIRROR_PHOTOS_PER_LISTING === 1`).
 *   V4. Ownership references the canonical `isMallanExclusiveListing` helper
 *       (SL-/RL- prefix OR rls_eligible === false) — NEVER agent_id /
 *       owner_client_id.
 *   V5. Hero identity comes from the shared production resolver
 *       (`selectHeroPhoto`, the function `computeListingMediaSummary` uses).
 *
 * Runs automatically in CI via the root jest projects list
 * (tests/runtime/jest.config.js — `npx jest --ci` in pr-check.yml).
 */

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import * as fs from 'fs';
import * as path from 'path';
import {
  buildR2BacklogWhere,
  buildR2MirrorPolicyMediaWhere,
  MAX_FEED_MIRROR_PHOTOS_PER_LISTING,
} from '@/lib/idx/media-sync';

const ROOT = path.resolve(__dirname, '..', '..');
const MEDIA_SYNC_PATH = path.join(ROOT, 'lib', 'idx', 'media-sync.ts');
const mediaSyncSrc = fs.readFileSync(MEDIA_SYNC_PATH, 'utf8');

/** Strip block + line comments so assertions bind to CODE, not prose. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/[ \t]\/\/[^\n]*/g, '');
}

const mediaSyncCode = stripComments(mediaSyncSrc);

describe('R2 lifecycle validator — V1 admission control present + wired', () => {
  it('media-sync exports the admission policy surface', () => {
    expect(mediaSyncCode).toMatch(/export function decideMirrorAdmissionScope/);
    expect(mediaSyncCode).toMatch(/export function buildR2MirrorPolicyMediaWhere/);
    expect(mediaSyncCode).toMatch(/export function buildMallanOwnedListingWhere/);
  });

  it('runMediaSync Phase 3 applies the post-fetch policy filter to every candidate batch', () => {
    // The in-code (fail-closed) filter must be invoked inside the Phase-3
    // loop, and only admitted rows may reach the mirror.
    expect(mediaSyncCode).toMatch(/decideMirrorAdmissionScope\(row\.listing\)/);
    expect(mediaSyncCode).toMatch(/admittedRows\.map\(\(row\) =>/);
    // The old unscoped form — mirroring the raw backlog page — must be gone.
    expect(mediaSyncCode).not.toMatch(/backlogRows\.map\(\(row\) =>/);
  });

  it('the backlog SELECT builds its where exclusively via buildR2BacklogWhere (policy-carrying)', () => {
    expect(mediaSyncCode).toMatch(
      /where: buildR2BacklogWhere\(cooldownThreshold, \[\.\.\.attemptedBacklogIds\]\)/,
    );
  });
});

describe('R2 lifecycle validator — V2 no unconditional feed-wide mirror', () => {
  it('buildR2BacklogWhere output ALWAYS contains the listing-scoped policy filter', () => {
    const where = buildR2BacklogWhere(new Date(), []) as {
      AND?: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(where.AND)).toBe(true);
    const policyMember = (where.AND ?? []).find(
      (m) =>
        Array.isArray(m.OR) &&
        (m.OR as Array<Record<string, unknown>>).some((o) => 'listing' in o),
    );
    expect(policyMember).toEqual(buildR2MirrorPolicyMediaWhere());
  });

  it('every source occurrence of the bare missing-R2 OR-shape is inside a function that applies the policy filter', () => {
    // Find each `OR: [{ r2_key: null }, { media_url_cached: null }]` and walk
    // back to its enclosing exported/async function; that function body must
    // reference buildR2MirrorPolicyMediaWhere. This is what makes the pre-R2-1
    // unscoped mirror unreachable: no code path can SELECT "everything missing
    // R2" without the listing policy attached.
    const shape = /OR:\s*\[\s*\{\s*r2_key:\s*null\s*\},\s*\{\s*media_url_cached:\s*null\s*\}\s*\]/g;
    const fnStarts = [...mediaSyncCode.matchAll(/(?:export\s+)?(?:async\s+)?function\s+\w+/g)].map(
      (m) => m.index ?? 0,
    );
    expect(fnStarts.length).toBeGreaterThan(0);
    const occurrences = [...mediaSyncCode.matchAll(shape)];
    expect(occurrences.length).toBeGreaterThan(0); // the shape must exist (backlog + count)
    for (const occ of occurrences) {
      const at = occ.index ?? 0;
      const fnStart = Math.max(...fnStarts.filter((s) => s < at));
      // Function body slice: from the enclosing function start to the next
      // function start (or EOF).
      const nextStarts = fnStarts.filter((s) => s > fnStart);
      const fnEnd = nextStarts.length > 0 ? Math.min(...nextStarts) : mediaSyncCode.length;
      const body = mediaSyncCode.slice(fnStart, fnEnd);
      expect(body).toContain('buildR2MirrorPolicyMediaWhere');
    }
  });
});

describe('R2 lifecycle validator — V3 feed mirror ceiling', () => {
  it('MAX_FEED_MIRROR_PHOTOS_PER_LISTING === 1 (raising it requires an approved policy change)', () => {
    expect(MAX_FEED_MIRROR_PHOTOS_PER_LISTING).toBe(1);
  });

  it('the constant is declared as the literal 1 in source (no runtime override path)', () => {
    expect(mediaSyncCode).toMatch(/export const MAX_FEED_MIRROR_PHOTOS_PER_LISTING = 1;/);
  });
});

describe('R2 lifecycle validator — V4 ownership signal is canonical (never agent_id)', () => {
  it('media-sync imports isMallanExclusiveListing from the canonical module and calls it', () => {
    expect(mediaSyncSrc).toMatch(
      /import\s*\{[^}]*isMallanExclusiveListing[^}]*\}\s*from\s*"@\/lib\/listings\/exclusive-agent-assignment"/,
    );
    expect(mediaSyncCode).toMatch(/isMallanExclusiveListing\(listing\)/);
  });

  it('DB-side ownership branches derive from the canonical prefix export (no hardcoded duplicate list)', () => {
    expect(mediaSyncCode).toMatch(
      /MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES\.map\(\(p\) =>/,
    );
  });

  it('media-sync code never references agent_id / owner_client_id', () => {
    expect(mediaSyncCode).not.toContain('agent_id');
    expect(mediaSyncCode).not.toContain('owner_client_id');
  });

  it('lib/media MIRROR-path helpers never gate on agent_id / owner_client_id either', () => {
    // Scope: the helpers on the R2 MIRROR path (key building / media
    // classification / CRM-media namespace). `listing-media-resolver.ts` is
    // deliberately EXCLUDED: its `isMallanOwnedListing` is a pre-existing
    // RENDER-side fallback-provenance predicate (mirrors classifyDbListing) —
    // it is not part of mirror admission, and render code is out of R2-1
    // scope. Mirror admission ownership is pinned to isMallanExclusiveListing
    // by the assertions above.
    const mirrorPathFiles = ['media-sync-service.ts', 'crm-media.ts', 'photo-fallback.ts'];
    for (const f of mirrorPathFiles) {
      const code = stripComments(
        fs.readFileSync(path.join(ROOT, 'lib', 'media', f), 'utf8'),
      );
      expect(`${f}: ${code.includes('agent_id')}`).toBe(`${f}: false`);
      expect(`${f}: ${code.includes('agentId')}`).toBe(`${f}: false`);
      expect(`${f}: ${code.includes('owner_client_id')}`).toBe(`${f}: false`);
    }
  });
});

describe('R2 lifecycle validator — V5 hero identity = production resolver', () => {
  it('selectHeroPhoto is the single extracted resolver and computeListingMediaSummary delegates to it', () => {
    expect(mediaSyncCode).toMatch(/export function selectHeroPhoto/);
    expect(mediaSyncCode).toMatch(/const hero = selectHeroPhoto\(rows\)/);
  });

  it('the Phase-3 hero_only branch uses selectHeroPhoto (no divergent duplicate ordering logic)', () => {
    expect(mediaSyncCode).toMatch(/selectHeroPhoto\(listingRows\)/);
    // Exactly one sort implements the hero ordering (inside selectHeroPhoto).
    const heroSorts = mediaSyncCode.match(/preferred_photo_yn !== b\.row\.preferred_photo_yn/g) ?? [];
    expect(heroSorts).toHaveLength(1);
  });
});
