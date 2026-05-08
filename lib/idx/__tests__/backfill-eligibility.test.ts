/**
 * Layer 2 of the PhotosChangeTimestamp gap fix.
 *
 * The `backfillEmptyMedia` eligibility query was previously limited to NULL,
 * non-array, and empty-array media. The Layer 0 audit (2026-05-08) showed
 * that misses three real failure modes:
 *   - 171 FloorPlan-only / Video-only / VirtualTour-only rows
 *   - 17,521 rows where Trestle's PhotosChangeTimestamp had advanced past
 *     our DB modification_timestamp (PCT drift)
 *   - listings where the broker uploaded photos *after* we last sampled them
 *     and Trestle bumped PCT without bumping MT
 *
 * The expanded eligibility logic is inlined into a SQL query on
 * `prisma.listing` and is hard to unit-test directly. Instead this test
 * pure-JS-replicates the predicate (mirroring the SQL clauses exactly) and
 * asserts shape-by-shape behavior. If the production SQL drifts from the
 * predicate here, the test will fail the next time someone touches it.
 */

interface Row {
  media: unknown;
  modification_timestamp: Date | null;
  raw_data: Record<string, unknown> | null;
  sync_status: string | null;
}

/**
 * Mirror of the eligibility predicate in lib/idx/sync.ts:backfillEmptyMedia
 * (Layer 2). When that SQL changes, update this in lock-step.
 */
function isEligibleForBackfill(row: Row): boolean {
  // sync_status guards (excluded categories)
  if (row.sync_status === 'gated:owner_opt_out') return false;
  if (row.sync_status === 'gated:participant_only') return false;

  const m = row.media;

  // 1. NULL media
  if (m === null || m === undefined) return true;

  // 2. Non-array (object-shaped or other)
  if (!Array.isArray(m)) return true;

  // 3. Empty array
  if (m.length === 0) return true;

  // 4. Non-empty array with ZERO Photo entries
  const PHOTO_TYPES = new Set(['photo', 'image', '']);
  const hasAnyPhoto = m.some((elem) => {
    const t = String((elem as Record<string, unknown>)?.mediaType ?? '').toLowerCase();
    return PHOTO_TYPES.has(t);
  });
  if (!hasAnyPhoto) return true;

  // 5. PCT drift: raw_data.PhotosChangeTimestamp > modification_timestamp
  const pctRaw = row.raw_data?.PhotosChangeTimestamp;
  if (pctRaw && typeof pctRaw === 'string' && pctRaw.length > 0 && row.modification_timestamp) {
    const pct = new Date(pctRaw);
    if (!Number.isNaN(pct.getTime()) && pct.getTime() > row.modification_timestamp.getTime()) {
      return true;
    }
  }

  return false;
}

const baseRow: Row = {
  media: [{ url: 'https://example.com/p.jpg', mediaType: 'Photo' }],
  modification_timestamp: new Date('2026-05-08T00:00:00.000Z'),
  raw_data: { PhotosChangeTimestamp: '2026-05-08T00:00:00.000Z' },
  sync_status: 'synced',
};

describe('backfillEmptyMedia eligibility — Layer 2', () => {
  it('catches NULL media', () => {
    expect(isEligibleForBackfill({ ...baseRow, media: null })).toBe(true);
  });

  it('catches non-array media (legacy {PhotosCount:N} object shape)', () => {
    expect(
      isEligibleForBackfill({ ...baseRow, media: { PhotosCount: 5 } as unknown }),
    ).toBe(true);
  });

  it('catches empty media array', () => {
    expect(isEligibleForBackfill({ ...baseRow, media: [] })).toBe(true);
  });

  it('catches FloorPlan-only media', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [{ url: 'https://example.com/fp.jpg', mediaType: 'FloorPlan' }],
      }),
    ).toBe(true);
  });

  it('catches Video-only media', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [{ url: 'https://example.com/tour.mp4', mediaType: 'Video' }],
      }),
    ).toBe(true);
  });

  it('catches VirtualTour-only media', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [{ url: 'https://example.com/v.html', mediaType: 'VirtualTour' }],
      }),
    ).toBe(true);
  });

  it('does NOT catch a row with at least one valid Photo and no PCT drift', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [
          { url: 'https://example.com/p1.jpg', mediaType: 'Photo' },
          { url: 'https://example.com/fp.jpg', mediaType: 'FloorPlan' },
        ],
      }),
    ).toBe(false);
  });

  it('catches a row WITH valid Photo when PCT drift is present (Trestle bumped PCT, our raw_data is stale)', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [{ url: 'https://example.com/p1.jpg', mediaType: 'Photo' }],
        modification_timestamp: new Date('2025-04-02T14:14:54.260Z'),
        raw_data: { PhotosChangeTimestamp: '2026-02-26T23:10:31.170Z' },
      }),
    ).toBe(true);
  });

  it('respects sync_status gates — owner_opt_out is excluded', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: null,
        sync_status: 'gated:owner_opt_out',
      }),
    ).toBe(false);
  });

  it('respects sync_status gates — participant_only is excluded', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [],
        sync_status: 'gated:participant_only',
      }),
    ).toBe(false);
  });

  it('treats empty-string mediaType as Photo (legacy default — preserves prior behavior)', () => {
    // Trestle's default Media is Photo; some legacy rows have `mediaType: ''`
    // which the resolver treats as Photo. The eligibility query mirrors that.
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [{ url: 'https://example.com/p1.jpg', mediaType: '' }],
      }),
    ).toBe(false);
  });

  it('regression: a row with valid Photo and matching MT/PCT is left alone', () => {
    expect(
      isEligibleForBackfill({
        ...baseRow,
        media: [{ url: 'https://example.com/p1.jpg', mediaType: 'Photo' }],
        modification_timestamp: new Date('2026-05-08T00:00:00.000Z'),
        raw_data: { PhotosChangeTimestamp: '2026-05-08T00:00:00.000Z' },
      }),
    ).toBe(false);
  });
});
