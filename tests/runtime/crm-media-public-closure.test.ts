/// <reference types="jest" />
/**
 * CRM media writers must close out through the ONE canonical post-write seam.
 *
 * ── THE LIVE DEFECT THIS PINS ──────────────────────────────────────────────
 * All four CRM media routes wrote `listing_media` and stopped. They never
 * recomputed the `Listing` media summary and never emitted a cache tag.
 * Meanwhile:
 *
 *   app/listing/[...slug]/page.tsx      `export const revalidate = false`
 *   fetchListing()                      persistent `unstable_cache` entry,
 *                                       `revalidate: false`, tag `listing:{id}`
 *   the page renders from `listing_media` rows
 *
 * So an agent's upload / delete / set-main / reorder left the PUBLIC gallery and
 * hero stale INDEFINITELY — and permanently for Mallan-only exclusives, which
 * the Cotality media sync never revisits. Nothing expired those entries.
 *
 * ── WHY A SEAM, NOT FOUR revalidateTag() CALLS ─────────────────────────────
 * Three media writers already held three different opinions about what a media
 * change expires. Four more ad-hoc call sites would be four more. The closure
 * owns: recompute summary -> persist storage -> CLASSIFY the public change ->
 * invalidate exactly the affected surfaces -> record bounded telemetry.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ROUTES: Array<[string, string]> = [
  ['app/api/crm/listings/[id]/media/upload/route.ts', 'upload + restore'],
  ['app/api/crm/listings/[id]/media/[mediaId]/route.ts', 'delete + set-main'],
  ['app/api/crm/listings/[id]/media-order/route.ts', 'reorder'],
];

describe('every CRM media writer routes through the canonical closure', () => {
  it.each(ROUTES)('%s (%s) calls closeMediaWrite', (rel) => {
    const src = read(rel);
    // Quote-agnostic: the repo mixes single and double quotes across routes.
    expect(src).toMatch(/from ['"]@\/lib\/media\/post-media-write-closure['"]/);
    expect(src).toContain('closeMediaWrite(');
  });

  it('the delete+set-main route closes BOTH handlers, not just one', () => {
    // One file, two mutating handlers. A single call would leave set-main stale.
    const src = read('app/api/crm/listings/[id]/media/[mediaId]/route.ts');
    const calls = src.match(/closeMediaWrite\(/g) || [];
    expect(calls.length).toBe(2);
  });

  it('no CRM media route hand-rolls its own invalidation', () => {
    // The seam is the only invalidation owner. An ad-hoc revalidateTag here is
    // how the three pre-existing writers drifted apart.
    for (const [rel] of ROUTES) {
      const src = read(rel);
      expect(src).not.toContain('revalidateTag(');
      expect(src).not.toContain('publicListingChangeTags(');
    }
  });

  it('each writer declares galleryMutated — the evidence the comparator cannot derive', () => {
    // A reorder or a delete-balanced-by-insert leaves hero AND photo_count
    // identical; no comparison of the four summary columns can see it.
    for (const [rel] of ROUTES) {
      expect(read(rel)).toContain('galleryMutated: true');
    }
  });
});

describe('the closure itself', () => {
  const src = read('lib/media/post-media-write-closure.ts');

  it('delegates to the canonical summary owner rather than reimplementing it', () => {
    expect(src).toContain('updateListingMediaSummary');
    // It must NOT compose tags itself — classification and scoping belong to
    // the summary writer, which owns the storage-vs-public split.
    expect(src).not.toContain('revalidateTag(');
  });

  it('is fail-soft: a closure failure cannot 500 a committed media write', () => {
    expect(src).toContain('catch');
    expect(src).toContain('rows_failed++');
  });

  it('records only bounded aggregates — never a URL, media key or address', () => {
    // Assert on CODE, not on the prose that explains the rule by naming those
    // very fields. (Same comment-stripping precedent as
    // public-closed-sale-source-guard.test.ts.)
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/media_url|media_key|address/);
  });
});

describe('feed-owned metadata stays feed-owned', () => {
  it('set-main clears ONLY crm:-namespaced siblings', () => {
    // Clearing preferred_photo_yn on Trestle rows mutates source-owned metadata
    // that media-sync rewrites from the feed each cycle — a silent revert plus
    // per-sync write amplification.
    const src = read('app/api/crm/listings/[id]/media/[mediaId]/route.ts');
    expect(src).toContain('CRM_MEDIA_KEY_PREFIX');
  });

  it('reorder skips feed-owned rows', () => {
    expect(read('app/api/crm/listings/[id]/media-order/route.ts')).toContain('skippedTrestleKeys');
  });
});
