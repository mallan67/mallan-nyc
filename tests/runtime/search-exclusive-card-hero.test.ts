/// <reference types="jest" />
/**
 * /search exclusive-card hero photo.
 *
 * Root cause (verified live): the search cards force IDXImage's
 * white-border auto-crop, which sets `crossOrigin="anonymous"`. The
 * `pub-*.r2.dev` CRM hero omits `Vary: Origin` on its non-CORS response,
 * so once Featured / the agent page cache the hero via a plain (non-CORS)
 * fetch, the search card's `crossOrigin` request reuses that no-ACAO,
 * `immutable` cached response, fails the CORS check, and falls back to the
 * placeholder.
 *
 * Fix: CRM/Mallan exclusives (`_source === 'exclusive'`) must NOT auto-crop
 * (their R2 heroes are clean Sharp WebP) so they fetch the hero the SAME
 * way as Featured/agent. Third-party IDX keeps auto-crop (same-origin proxy
 * photos — crossOrigin is harmless there).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  shouldAutoCropWhiteBorder,
  getHeroPhoto,
  getValidPhotoMedia,
  LISTING_PLACEHOLDER_IMAGE,
} from '../../lib/media/listing-card-media';

const HERO = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/listings/SL-0004/1780109874725-hero.webp';

describe('shouldAutoCropWhiteBorder — gates the crossOrigin fetch', () => {
  it('CRM/Mallan exclusive (SL/RL → _source "exclusive") does NOT auto-crop (no crossOrigin → cache-coherent hero)', () => {
    expect(shouldAutoCropWhiteBorder('exclusive')).toBe(false);
  });

  it('third-party IDX still auto-crops (same-origin proxy photo — behavior unchanged)', () => {
    expect(shouldAutoCropWhiteBorder('db+idx')).toBe(true);
    expect(shouldAutoCropWhiteBorder('db+mixed')).toBe(true);
  });

  it('unknown / undefined source defaults to auto-crop (matches the legacy unconditional behavior)', () => {
    expect(shouldAutoCropWhiteBorder(undefined)).toBe(true);
    expect(shouldAutoCropWhiteBorder(null)).toBe(true);
    expect(shouldAutoCropWhiteBorder('')).toBe(true);
  });
});

describe('hero media resolution — placeholder only when no media exists', () => {
  it('returns the CRM hero URL when the exclusive carries resolved media', () => {
    const media = [
      { url: HERO, mediaType: 'Photo', order: -1 },
      { url: HERO.replace('1780109874725', '1779898420443'), mediaType: 'Photo', order: 1 },
    ];
    expect(getValidPhotoMedia(media).length).toBe(2);
    expect(getHeroPhoto(media)).toBe(HERO); // order -1 sorts first
  });

  it('uses the placeholder ONLY when there is genuinely no photo media', () => {
    expect(getHeroPhoto([])).toBe(LISTING_PLACEHOLDER_IMAGE);
    expect(getHeroPhoto(undefined)).toBe(LISTING_PLACEHOLDER_IMAGE);
    // FloorPlan / video are not photos → still placeholder
    expect(getHeroPhoto([{ url: HERO, mediaType: 'FloorPlan', order: 0 }])).toBe(LISTING_PLACEHOLDER_IMAGE);
  });
});

describe('SearchListingCard wiring — all three card variants use the gate', () => {
  const src = readFileSync(resolve(__dirname, '../../app/components/SearchListingCard.tsx'), 'utf8');

  it('GridCard, ListCard, and SplitCard pass shouldAutoCropWhiteBorder(listing._source) — not an unconditional crop', () => {
    const gated = src.match(/autoCropWhiteBorder=\{shouldAutoCropWhiteBorder\(listing\._source\)\}/g) || [];
    expect(gated.length).toBe(3);
    // No bare `autoCropWhiteBorder` prop (the old unconditional form) remains.
    expect(src).not.toMatch(/autoCropWhiteBorder\s*\n/);
    expect(src).toMatch(/shouldAutoCropWhiteBorder,?\s*\n?\s*\}? from '@\/lib\/media\/listing-card-media'|shouldAutoCropWhiteBorder/);
  });
});
