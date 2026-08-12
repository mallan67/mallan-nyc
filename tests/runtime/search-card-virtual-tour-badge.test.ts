/// <reference types="jest" />
/**
 * PR-C (2026-06-05) — search-card 3D/virtual-tour visibility.
 *
 * Live media probe established that IDX Plus serves the virtual tour as a
 * Property URL FIELD (`VirtualTourURLBranded`/`VirtualTourURLUnbranded` →
 * `virtualTourURL`), NOT a Media-resource row (Media serves only Photo +
 * FloorPlan). The URL already reaches the cards via the API DTO, but the cards
 * surfaced no indicator. PR-C adds a "3D Tour" badge keyed on `virtualTourURL`.
 *
 * Video: the playable video lives in the SAME `VirtualTourURL*` fields (YouTube/
 * Vimeo), host-split into `videoUrl` by the media resolver (fix/listing-media-
 * pipeline). Cards now surface it too — the badge gates on hasVirtualTour ||
 * hasVideo and labels "Video" vs "3D Tour".
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { hasVirtualTour } from '@/lib/idx/display-adapter';

describe('hasVirtualTour (PR-C predicate)', () => {
  it('is true when virtualTourURL is a non-empty string', () => {
    expect(hasVirtualTour({ virtualTourURL: 'https://my.matterport.com/show/?m=abc' })).toBe(true);
  });
  it('is false when virtualTourURL is missing / undefined', () => {
    expect(hasVirtualTour({ virtualTourURL: undefined })).toBe(false);
    expect(hasVirtualTour({} as { virtualTourURL?: string })).toBe(false);
  });
  it('is false for empty / whitespace-only strings', () => {
    expect(hasVirtualTour({ virtualTourURL: '' })).toBe(false);
    expect(hasVirtualTour({ virtualTourURL: '   ' })).toBe(false);
  });
});

describe('SearchListingCard — 3D Tour badge wiring (source guard)', () => {
  const src = readFileSync(
    path.resolve(__dirname, '../../app/components/SearchListingCard.tsx'),
    'utf8',
  );

  it('imports hasVirtualTour from the display-adapter (keyed on the Property field, not media[])', () => {
    expect(src).toMatch(/import\s*\{[^}]*hasVirtualTour[^}]*\}\s*from\s*'@\/lib\/idx\/display-adapter'/);
  });

  it('renders the TourBadge gated on hasVirtualTour || hasVideo in all three card variants', () => {
    // GridCard, ListCard, SplitCard each gate the badge on
    // `(hasVirtualTour(listing) || hasVideo(listing)) &&` so a video listing
    // (YouTube/Vimeo host-split into videoUrl) still gets a card indicator.
    const gated = src.match(/\(hasVirtualTour\(listing\) \|\| hasVideo\(listing\)\)\s*&&/g) || [];
    expect(gated.length).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(/<TourBadge\b/);
  });

  it('labels the badge "3D Tour" for a tour and "Video" for a video listing', () => {
    expect(src).toMatch(/3D Tour/);
    expect(src).toMatch(/'Video'/);
  });

  it('does NOT reference phantom media fields', () => {
    expect(src).not.toMatch(/\bVideoURL\b/);
    expect(src).not.toMatch(/\bMatterportURL\b/);
    expect(src).not.toMatch(/\bFloorPlanURL\b/);
  });
});

describe('/api/listings DB-search selects canonical external media', () => {
  const src = readFileSync(
    path.resolve(__dirname, '../../app/api/listings/route.ts'),
    'utf8',
  );

  it('both DB-first findMany selects preload listing_external_media through the shared relation', () => {
    const matches = src.match(/external_media:\s*PUBLIC_EXTERNAL_MEDIA_RELATION/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('retains raw_data only for the remaining typed-owner gaps, not tour/video URLs', () => {
    expect(src).toMatch(/raw_data:\s*true/);
    expect(src).not.toMatch(/raw_data[^\n]*source of virtualTourURL/);
  });
});

describe('ListingMediaGallery — tab gating (source guard)', () => {
  const src = readFileSync(
    path.resolve(__dirname, '../../app/components/ListingMediaGallery.tsx'),
    'utf8',
  );

  it('shows the Video tab ONLY when a real videoUrl exists', () => {
    expect(src).toMatch(/key:\s*'video',[^}]*available:\s*!!videoUrl/);
  });

  it('shows the 3D Tour tab when a virtualTourUrl exists', () => {
    expect(src).toMatch(/key:\s*'3d',[^}]*available:\s*!!virtualTourUrl/);
  });

  it('filters tabs to the available set (a dead tab is not rendered)', () => {
    expect(src).toMatch(/availableTabs\s*=\s*tabs\.filter\(\s*t\s*=>\s*t\.available\s*\)/);
  });
});

describe('Listing detail page — virtualTourURL fallback + video sourced from media (source guard)', () => {
  const src = readFileSync(
    path.resolve(__dirname, '../../app/listing/[...slug]/page.tsx'),
    'utf8',
  );

  it('3D tour falls back to the Property field listing.virtualTourURL', () => {
    expect(src).toMatch(/const virtualTourUrl\s*=\s*listing\.virtualTourURL\s*\|\|/);
  });

  it('video is derived from the DTO videoUrl (host-split from VirtualTourURL*), not a phantom field', () => {
    expect(src).toMatch(/const videoUrl\s*=\s*listing\.videoUrl\s*\|\|/);
    expect(src).not.toMatch(/rawData\.VideoURL/);
  });

  it('DB-backed detail consumes the canonical external-media composer', () => {
    // CONTRACT MOVED (DTO collapse): the detail page delegates to
    // dbListingToPublicDTO, so the tour/video host-split now belongs to the
    // CANONICAL owner and is asserted there. The page is checked for
    // delegation, and below for not regrowing the old inline mapping.
    const dtoSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/idx/db-to-public-dto.ts'),
      'utf8',
    ) as string;
    expect(dtoSrc).toMatch(/composeListingMedia\(\[\], externalRows\)/);
    expect(dtoSrc).not.toMatch(/rawData\.VirtualTourURL/);
    expect(src).toMatch(/dbListingToPublicDTO\(dbListing\)/);
    // The old virtualTourURL-only inline mapping must be gone from the DB DTO.
    expect(src).not.toMatch(/virtualTourURL:\s*\r?\n?\s*\(typeof rawData\.VirtualTourURLUnbranded/);
  });
});

describe('/api/buildings — Trestle Media expand fetches enough rows to skip a leading floorplan (Codex #482)', () => {
  const src = readFileSync(
    // Building-Neon-wake (2026-07-23): the Trestle query (incl. MEDIA_EXPAND)
    // moved verbatim into the shared cached module — same contract, new home.
    path.resolve(__dirname, '../../lib/buildings/public-building-data.ts'),
    'utf8',
  );

  it('does NOT limit the Media expand to $top=1 (floorplan-first would starve getPhotoUrl)', () => {
    expect(src).not.toMatch(/Media\([^)]*\$top=1;/);
  });

  it('fetches multiple media rows so classifyMediaItem can find the first real photo', () => {
    const m = src.match(/Media\([^)]*\$top=(\d+)[^)]*\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(5);
  });

  it('getPhotoUrl has no media[0] fallback (never heroes a floorplan)', () => {
    expect(src).not.toMatch(/\|\|\s*media\[0\]/);
  });
});
