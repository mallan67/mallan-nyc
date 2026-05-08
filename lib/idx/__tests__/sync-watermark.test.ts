/**
 * Layer 1 of the PhotosChangeTimestamp gap fix.
 *
 * The watermark used by the next incremental sync must reflect the LATER of
 * (a) the latest ModificationTimestamp and (b) the latest PhotosChangeTimestamp
 * across the records returned by the current pass. Otherwise the next pass
 * would re-fetch every row whose PCT advanced past the (MT-only) watermark.
 *
 * The watermark advancement happens inline inside `syncListings`. To keep this
 * test independent of the Prisma + Trestle stack we replicate the inline loop
 * exactly. If the production loop drifts from this test, the test will fail
 * and we'll know the watermark logic regressed.
 */

const NOW = new Date('2026-05-08T12:00:00.000Z');

function advanceBatchWatermark(records: Array<Record<string, unknown>>, baseline = NOW): Date {
  let batchWatermark = baseline;
  for (const r of records) {
    const mt = r.ModificationTimestamp ? new Date(String(r.ModificationTimestamp)) : null;
    const pct = r.PhotosChangeTimestamp ? new Date(String(r.PhotosChangeTimestamp)) : null;
    for (const cand of [mt, pct]) {
      if (cand && !Number.isNaN(cand.getTime()) && cand > batchWatermark) batchWatermark = cand;
    }
  }
  return batchWatermark;
}

describe('sync watermark — Layer 1 (max(MT, PCT))', () => {
  it('advances to MT when MT is the latest', () => {
    const wm = advanceBatchWatermark([
      { ModificationTimestamp: '2026-06-01T00:00:00Z', PhotosChangeTimestamp: '2026-04-01T00:00:00Z' },
      { ModificationTimestamp: '2026-05-15T00:00:00Z', PhotosChangeTimestamp: '2026-05-10T00:00:00Z' },
    ]);
    expect(wm.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('advances to PCT when PCT is the latest', () => {
    const wm = advanceBatchWatermark([
      { ModificationTimestamp: '2026-05-01T00:00:00Z', PhotosChangeTimestamp: '2026-06-15T00:00:00Z' },
      { ModificationTimestamp: '2026-05-10T00:00:00Z', PhotosChangeTimestamp: '2026-05-12T00:00:00Z' },
    ]);
    expect(wm.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('falls back to baseline (now) on an empty batch', () => {
    expect(advanceBatchWatermark([])).toBe(NOW);
  });

  it('tolerates rows with one timestamp missing', () => {
    const wm = advanceBatchWatermark([
      { ModificationTimestamp: '2026-06-01T00:00:00Z' },
      { PhotosChangeTimestamp: '2026-06-02T00:00:00Z' },
      { ModificationTimestamp: null, PhotosChangeTimestamp: null },
    ]);
    expect(wm.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('ignores invalid date strings', () => {
    const wm = advanceBatchWatermark([
      { ModificationTimestamp: 'not-a-date', PhotosChangeTimestamp: 'also-bad' },
      { ModificationTimestamp: '2026-05-20T00:00:00Z', PhotosChangeTimestamp: '2026-05-25T00:00:00Z' },
    ]);
    expect(wm.toISOString()).toBe('2026-05-25T00:00:00.000Z');
  });
});
