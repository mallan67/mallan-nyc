/// <reference types="jest" />
/**
 * RC3 — R2 retry-purgatory fix (behavioral proofs).
 *
 * The tombstone CLASSIFICATION is unchanged and already fully covered by
 * media-sync-r2.test.ts (404/410 → tombstone at 3; 429/5xx/403/408/network/
 * r2_upload_failed/r2_head_failed/token → cooldown only, NEVER tombstone). RC3
 * adds ONE thing: non-permanent rows that keep failing must stop wasting the
 * Phase-3 backlog budget — WITHOUT deleting the row, so the resolver can still
 * serve `media_url_original` via the proxy. That is the `buildR2BacklogWhere`
 * retry-exhausted exclusion proven here.
 */
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import { buildR2BacklogWhere, R2_RETRY_EXHAUSTED_THRESHOLD } from '@/lib/idx/media-sync';
import { resolveListingMediaFromRows } from '@/lib/media/listing-media-resolver';
import { getValidPhotoMedia } from '@/lib/media/listing-card-media';

describe('buildR2BacklogWhere — RC3 retry-exhausted exclusion', () => {
  const cooldown = new Date('2026-06-09T00:00:00Z');

  it('exhaustion threshold is HIGHER than the 404/410 tombstone threshold (3) — transient gets more retries', () => {
    expect(R2_RETRY_EXHAUSTED_THRESHOLD).toBeGreaterThan(3);
  });

  it('EXCLUDES rows with r2_attempts >= threshold, KEEPS null + below-threshold rows eligible', () => {
    const where = buildR2BacklogWhere(cooldown, []) as { AND: { OR?: unknown[] }[] };
    const and = where.AND;
    const exhaustion = and.find(
      (c) => Array.isArray(c.OR) && c.OR.some((o) => o != null && typeof o === 'object' && 'r2_attempts' in o),
    );
    expect(exhaustion).toBeDefined();
    // null (never failed) OR below-threshold ⇒ eligible; >= threshold ⇒ dropped.
    expect(exhaustion!.OR).toEqual(
      expect.arrayContaining([{ r2_attempts: null }, { r2_attempts: { lt: R2_RETRY_EXHAUSTED_THRESHOLD } }]),
    );
  });

  it('preserves the existing backlog conditions (active + missing-R2 OR + cooldown clause)', () => {
    const where = buildR2BacklogWhere(cooldown, []) as {
      status: string;
      media_url_original: unknown;
      OR: unknown[];
      AND: { OR?: unknown[] }[];
    };
    expect(where.status).toBe('active');
    expect(where.media_url_original).toEqual({ not: null });
    expect(where.OR).toEqual([{ r2_key: null }, { media_url_cached: null }]);
    expect(
      where.AND.some(
        (c) => Array.isArray(c.OR) && c.OR.some((o) => o != null && typeof o === 'object' && 'r2_last_attempt_at' in o),
      ),
    ).toBe(true);
  });

  it('threads the per-invocation attempted-id exclusion only when ids are present', () => {
    const withIds = buildR2BacklogWhere(cooldown, [1n, 2n]) as { id?: unknown };
    expect(withIds.id).toEqual({ notIn: [1n, 2n] });
    const noIds = buildR2BacklogWhere(cooldown, []) as { id?: unknown };
    expect(noIds.id).toBeUndefined();
  });
});

describe('RC3 safety net — an exhausted (cached-null) row still serves a usable photo, never disappears', () => {
  it('resolveListingMediaFromRows falls back to media_url_original (proxied) when media_url_cached is null', () => {
    const rows = [
      {
        media_url_original: 'https://api.cotality.com/Media/Property/PHOTO-Jpeg/x.jpg',
        media_url_cached: null,
        media_type: 'Photo',
        media_category: 'Photo',
        media_classification: null,
        order: 0,
        preferred_photo_yn: false,
        status: 'active',
      },
    ];
    const resolved = resolveListingMediaFromRows(rows);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].mediaType).toBe('Photo');
    // The proxied original URL must pass the card's display-validity gate, so a
    // row whose R2 mirror failed (cached null) is NOT dropped from the grid.
    const valid = getValidPhotoMedia(
      resolved.map((m) => ({ url: m.url, mediaType: m.mediaType, order: m.providerOrder })),
    );
    expect(valid).toHaveLength(1);
    expect(valid[0].url).toContain('/api/media/proxy?url=');
  });
});
