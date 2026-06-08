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
 * The behavioral helper tests are the RED proof (failing-test-flips-green, §F).
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
    // The update branches are anchored by the `modification_timestamp` line; they
    // must now spread the guarded patch, not write media unconditionally.
    expect(src).toMatch(/\.\.\.mediaUpdatePatch\(mapped\.media, useExpandMedia\),/);
  });

  it('CREATE branch still writes media (raw media write remains — only updates were guarded)', () => {
    // After the fix the raw `media: mapped.media` write survives ONLY in the
    // create branches (updates use ...mediaUpdatePatch). Its presence proves
    // create was not changed.
    expect(src).toContain('media: mapped.media as Prisma.InputJsonValue,');
    expect(src).toContain('status_changed_at: new Date()');
  });

  it('the batch-media path is unchanged (still owns the refill via updateMany)', () => {
    expect(src).toContain('if (!useExpandMedia && upserted > 0)');
    expect(src).toMatch(/updateMany\(/);
  });
});
