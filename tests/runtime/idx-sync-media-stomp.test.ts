/// <reference types="jest" />
/**
 * RC2 — idx-sync media-stomp guard.
 *
 * The incremental idx-sync fetches Property WITHOUT expanded Media
 * (`useExpandMedia = false`), so `mapped.media` is `[]`. The per-record UPDATE
 * must NOT write media in that case — doing so wipes existing `listings.media`
 * (the app continuously overwriting its own local media with empty arrays;
 * Cotality remains the source, so nothing is permanently lost, but public pages
 * render garbage). `mediaUpdatePatch` encodes the decision: write `media` on
 * UPDATE only when it was actually fetched/expanded; otherwise OMIT it (preserve
 * existing — the separate batch-media path owns refills). CREATE and the
 * batch-media block are unchanged.
 *
 * SCOPE NOTE (Codex re-review, 2026-06-08): an earlier increment also tried to
 * CLEAR deleted-at-source media in the batch loop. Codex correctly showed that is
 * unsafe without following `@odata.nextLink` (a `$top`-truncated page can split a
 * listing's rows / omit later keys), so clearing-on-delete was REVERTED out of
 * RC2 and deferred to the media program (it needs complete pagination = RC1).
 * RC2 is now exactly the per-record stomp fix; the batch loop is unchanged from
 * `main`.
 *
 * The behavioral helper test is the RED proof (failing-test-flips-green, §F).
 * The source-level "non-regression" block is SUPPORTING context only.
 */
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import * as path from 'path';
import { mediaUpdatePatch } from '@/lib/idx/sync';

const PHOTO = { MediaCategory: 'Photo', MediaURL: 'https://api.cotality.com/x/1.jpg' };

describe('mediaUpdatePatch — RC2 media-stomp guard (behavioral / RED→GREEN)', () => {
  it('media NOT fetched + empty incoming → OMITS media (preserves existing)', () => {
    const patch = mediaUpdatePatch([], false);
    expect('media' in patch).toBe(false);
    expect(patch).toEqual({});
  });

  it('media NOT fetched + (defensively) non-empty incoming → still OMITS media', () => {
    const patch = mediaUpdatePatch([PHOTO], false);
    expect('media' in patch).toBe(false);
  });

  it('media FETCHED + real photos → writes media (update still works)', () => {
    expect(mediaUpdatePatch([PHOTO], true)).toEqual({ media: [PHOTO] });
  });

  it('media FETCHED + genuinely empty → writes [] (legitimate clear via the expand path)', () => {
    expect(mediaUpdatePatch([], true)).toEqual({ media: [] });
  });
});

describe('idx-sync source — non-regression (SUPPORTING, not the RED proof)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../lib/idx/sync.ts'), 'utf8');

  it('the UPDATE branches use the guarded patch (no raw `media: mapped.media` on update)', () => {
    // The update branches must spread the guarded patch, not write media
    // unconditionally.
    expect(src).toMatch(/\.\.\.mediaUpdatePatch\(mapped\.media, useExpandMedia\),/);
  });

  it('CREATE branch still writes media (raw media write remains — only updates were guarded)', () => {
    // After the fix the raw `media: mapped.media` write survives ONLY in the
    // create branches (updates use ...mediaUpdatePatch). Its presence proves
    // create was not changed.
    expect(src).toContain('media: mapped.media as Prisma.InputJsonValue,');
    expect(src).toContain('status_changed_at: new Date()');
  });

  it('all three legacy batch-media call sites route through the shared complete-response helper (Phase 1A / RC1)', () => {
    // Phase 1A (2026-07-29) IS the RC1 work this tripwire was waiting for: the
    // @odata.nextLink pagination + complete-response contract now exists, so the
    // original hand-built Map-iterating loops are gone by design. The guard now
    // locks the NEW invariant instead: exactly three legacy batch-media call
    // sites, all routed through the one shared helper, with no hand-rolled
    // grouping left behind.
    expect(src.match(/await fetchLegacyMediaBatch\(/g)?.length).toBe(3);
    expect(src).not.toContain('for (const [key, media] of mediaByListing) {');
    expect(src).not.toContain('for (const [key, media] of mediaByKey) {');
    expect(src).not.toContain('const mediaByListing = new Map');
    expect(src).not.toContain('const mediaByListingId = new Map');
    expect(src).not.toContain('const mediaByKey = new Map');
    // The helper is the ONLY legacy batch-fetch implementation: no direct
    // /odata/Media fetch may reappear in sync.ts.
    expect(src).not.toContain('/odata/Media?');
    // Guarded update patch + inline CREATE media path are untouched by Phase 1A.
    expect(src).toContain('mediaUpdatePatch');
    expect(src).toContain('archivedSafeMediaWhere');
  });
});
