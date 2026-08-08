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
 *   V6. (Blocker-1a/1b) Media-type scope is IN-QUERY: feed candidates are
 *       Photo-only in the where; Mallan candidates are EXACTLY
 *       Photo + FloorPlan (videos / virtual tours never admitted).
 *   V7. (Blocker-1) Policy rejection MUST write parking state — no
 *       select-all-then-reject-without-state: deterministic rejections are
 *       parked with `r2_attempts = R2_POLICY_PARKED_ATTEMPTS` (9, above the
 *       RC3 exhaustion threshold 8) so the existing backlog predicate
 *       permanently excludes them.
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
  FEED_MIRROR_MEDIA_TYPES,
  MALLAN_MIRROR_MEDIA_TYPES,
  MAX_FEED_MIRROR_PHOTOS_PER_LISTING,
  R2_POLICY_PARKED_ATTEMPTS,
  R2_RETRY_EXHAUSTED_THRESHOLD,
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
      // #550 bounded structure: ONE main selection per run, no re-query
      // exclusion list (the drain never re-selects within a run).
      /where: buildR2BacklogWhere\(cooldownThreshold, \[\]\)/,
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

describe('R2 lifecycle validator — V6 media-type scope is IN-QUERY (Blocker-1a/1b)', () => {
  it('feed candidates are Photo-ONLY in the where (floorplans/videos/tours of feed listings are NEVER candidates)', () => {
    expect(FEED_MIRROR_MEDIA_TYPES).toEqual(['Photo']);
    const where = buildR2MirrorPolicyMediaWhere() as {
      OR: Array<{ media_type?: { in?: string[] }; listing?: unknown }>;
    };
    expect(where.OR).toHaveLength(2);
    const feedBranch = where.OR[1];
    expect(feedBranch.media_type).toEqual({ in: ['Photo'] });
  });

  it('Mallan candidates are EXACTLY Photo + FloorPlan — videos / virtual tours are never silently admitted', () => {
    expect([...MALLAN_MIRROR_MEDIA_TYPES].sort()).toEqual(['FloorPlan', 'Photo']);
    const where = buildR2MirrorPolicyMediaWhere() as {
      OR: Array<{ media_type?: { in?: string[] } }>;
    };
    const mallanBranch = where.OR[0];
    expect([...(mallanBranch.media_type?.in ?? [])].sort()).toEqual(['FloorPlan', 'Photo']);
    expect(mallanBranch.media_type?.in).not.toContain('Video');
    expect(mallanBranch.media_type?.in).not.toContain('VirtualTour');
  });

  it('BOTH policy branches carry a media_type restriction (no any-type branch remains)', () => {
    const where = buildR2MirrorPolicyMediaWhere() as {
      OR: Array<Record<string, unknown>>;
    };
    for (const branch of where.OR) {
      expect(branch).toHaveProperty('media_type');
      expect(branch).toHaveProperty('listing');
    }
  });
});

describe('R2 lifecycle validator — V7 rejection MUST write parking state (Blocker-1)', () => {
  it('R2_POLICY_PARKED_ATTEMPTS is the literal 9 — above AND distinct from the RC3 exhaustion threshold (8)', () => {
    expect(R2_POLICY_PARKED_ATTEMPTS).toBe(9);
    expect(R2_RETRY_EXHAUSTED_THRESHOLD).toBe(8);
    expect(R2_POLICY_PARKED_ATTEMPTS).toBeGreaterThan(R2_RETRY_EXHAUSTED_THRESHOLD);
    expect(mediaSyncCode).toMatch(/export const R2_POLICY_PARKED_ATTEMPTS = 9;/);
  });

  it('a parked row is permanently excluded by the EXISTING backlog attempts predicate', () => {
    // 9 < 8 is false ⇒ a parked row fails { r2_attempts: { lt: 8 } } and its
    // r2_attempts is non-null ⇒ it can never match the backlog where again.
    expect(R2_POLICY_PARKED_ATTEMPTS < R2_RETRY_EXHAUSTED_THRESHOLD).toBe(false);
    const where = buildR2BacklogWhere(new Date(), []) as {
      AND: Array<{ OR?: Array<Record<string, unknown>> }>;
    };
    const attemptsMember = where.AND.find(
      (m) => Array.isArray(m.OR) && m.OR.some((o) => 'r2_attempts' in o),
    );
    expect(attemptsMember?.OR).toEqual([
      { r2_attempts: null },
      { r2_attempts: { lt: R2_RETRY_EXHAUSTED_THRESHOLD } },
    ]);
  });

  it('the Phase-3 rejection branches reference the parking collector (no stateless select-all-then-reject)', () => {
    // Deterministic rejections must collect the row id for parking. Two
    // sites: the media-type mismatch and the non-hero rejection.
    const parkPushes = mediaSyncCode.match(/policyParkIds\.push\(row\.id\)/g) ?? [];
    expect(parkPushes.length).toBeGreaterThanOrEqual(2);
  });

  it('the parking flush writes the EXPLICIT policy column via ONE batched updateMany over the collected ids', () => {
    // CONTRACT INVERTED (writer cutover). This previously pinned the sentinel
    // form `data: { r2_attempts: R2_POLICY_PARKED_ATTEMPTS, r2_last_attempt_at:
    // ... }`. That shape WAS the defect: a policy decision written into the
    // FAILURE counter, plus a cooldown stamp for an attempt never made.
    //
    // What this validator actually guards is unchanged and still asserted here:
    // the park is ONE batched updateMany over the collected ids, never per-row.
    expect(mediaSyncCode).toMatch(
      /updateMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*policyParkIds\s*\}\s*\},\s*data:\s*\{\s*r2_policy_excluded_at:/,
    );
  });

  it('the parking flush no longer touches the failure counter or the cooldown', () => {
    // `mediaSyncCode` is ALREADY comment-stripped, so a comment marker such as
    // "// ── PHASE 4" does not exist in it: bounding the slice with one would
    // silently return -1 and sweep in the rest of the file's unrelated writes.
    // Both bounds are therefore code, and both are asserted to be real.
    const start = mediaSyncCode.indexOf('if (policyParkIds.length > 0)');
    const end = mediaSyncCode.indexOf('mirrorRejectedPolicyParked = parked.count');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const flush = mediaSyncCode.slice(start, end);
    expect(flush).not.toMatch(/r2_attempts\s*:/);
    expect(flush).not.toMatch(/r2_last_attempt_at\s*:/);
  });

  it('the parked outcome is surfaced as a counter (mirror_rejected_policy_parked) for audit', () => {
    expect(mediaSyncCode).toMatch(/mirror_rejected_policy_parked:\s*mirrorRejectedPolicyParked/);
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
