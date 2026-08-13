/**
 * RED EVIDENCE — the current Property cursor loses records, by construction.
 *
 * Three facts from current main combine into guaranteed loss:
 *   1. fetch.ts:144   $orderby defaults to "ModificationTimestamp desc"
 *   2. scheduled Property runs cap at maxRecords = 500
 *   3. the durable cursor advances to the highest MT processed
 *
 * Newest-first + capped + max-seen means the cursor jumps to the newest MT
 * after processing only the newest 500, and the next run's `MT gt cursor`
 * filter excludes the entire OLDER tail. sync.ts:1879-1893 documents this
 * failure mode for a wall-clock cursor; it applies identically to a max-seen
 * cursor under DESC ordering, because that doc's safety claim ("records above
 * the high-water mark remain visible") holds only for ASCENDING traversal.
 */
import {
  advanceCursor,
  compareCursorRows,
  isAfterCursor,
  keysetFilter,
  legacyMaxSeenCursor,
  type CursorRow,
} from '@/lib/idx/cursor/keyset-cursor';

const CAP = 500;
const at = (iso: string, key: string): CursorRow => ({ timestamp: new Date(iso), listingKey: key });

/** A backlog of 600 rows spanning 600 distinct minutes — larger than the cap. */
function backlog(n: number): CursorRow[] {
  return Array.from({ length: n }, (_, i) =>
    at(new Date(Date.UTC(2026, 7, 1, 0, i)).toISOString(), `K${String(i).padStart(4, '0')}`),
  );
}

describe('RED — DESC + 500 cap + max-seen loses the tail', () => {
  it('the CURRENT rule makes 100 older rows permanently unreachable', () => {
    const all = backlog(600);
    // Provider returns newest-first (fetch.ts default), capped at 500.
    const desc = all.slice().sort((a, b) => compareCursorRows(b, a));
    const processed = desc.slice(0, CAP);
    const tail = desc.slice(CAP); // 100 OLDEST rows, never processed

    const cursor = legacyMaxSeenCursor(processed)!;

    // Next run asks `MT gt cursor`. Every unprocessed row is OLDER than it.
    const reachable = tail.filter((r) => r.timestamp > cursor);
    expect(tail).toHaveLength(100);
    expect(reachable).toHaveLength(0); // ← permanent loss, every capped run
  });

  it('ASC + keyset advances to the 500th processed row, so the tail survives', () => {
    const all = backlog(600);
    const asc = all.slice().sort(compareCursorRows);
    const first = asc.slice(0, CAP);

    const { next, processed, haltedOnFailure } = advanceCursor(first, null, () => true);
    expect(processed).toBe(CAP);
    expect(haltedOnFailure).toBe(false);
    expect(next!.listingKey).toBe('K0499'); // exactly the 500th ordered key

    const remaining = asc.filter((r) => isAfterCursor(r, next));
    expect(remaining).toHaveLength(100); // ← nothing unreachable
    expect(remaining[0].listingKey).toBe('K0500');
  });
});

describe('RED — same-timestamp keys straddling the cap', () => {
  const boundary = '2026-08-01T00:00:00.000Z';

  it('a DateTime-only cursor cannot resume inside one timestamp', () => {
    const rows = [at(boundary, 'A'), at(boundary, 'B'), at(boundary, 'C')];
    const processedFirstTwo = rows.slice(0, 2);
    const cursor = legacyMaxSeenCursor(processedFirstTwo)!;
    // `MT gt cursor` skips C entirely; `MT ge cursor` reprocesses A and B forever.
    expect(rows.filter((r) => r.timestamp > cursor)).toHaveLength(0);
    expect(rows.filter((r) => r.timestamp >= cursor)).toHaveLength(3);
  });

  it('the keyset cursor resumes at exactly the next key', () => {
    const rows = [at(boundary, 'A'), at(boundary, 'B'), at(boundary, 'C')];
    const { next } = advanceCursor(rows.slice(0, 2), null, () => true);
    const remaining = rows.filter((r) => isAfterCursor(r, next));
    expect(remaining.map((r) => r.listingKey)).toEqual(['C']); // no skip, no replay
  });
});

describe('advancement rule — last CONTIGUOUS processed, never max-seen', () => {
  it('a failure at row N leaves the cursor at N-1 so N is retried', () => {
    const rows = [at('2026-08-01T00:00:00Z', 'A'), at('2026-08-01T00:01:00Z', 'B'), at('2026-08-01T00:02:00Z', 'C')];
    const { next, processed, haltedOnFailure } = advanceCursor(rows, null, (_r, i) => i !== 1);
    expect(haltedOnFailure).toBe(true);
    expect(processed).toBe(1);
    expect(next!.listingKey).toBe('A');
    // B is retried, and C was never silently consumed.
    expect(rows.filter((r) => isAfterCursor(r, next)).map((r) => r.listingKey)).toEqual(['B', 'C']);
  });

  it('an empty batch does NOT invent a position — the prior cursor stands', () => {
    const prior = { timestamp: new Date('2026-08-01T00:00:00Z'), listingKey: 'A' };
    expect(advanceCursor([], prior, () => true)).toEqual({ next: prior, processed: 0, haltedOnFailure: false });
    expect(advanceCursor([], null, () => true).next).toBeNull();
  });

  it('a restart resumes from durable state alone — no replay, no skip', () => {
    const rows = backlog(10);
    const firstRun = advanceCursor(rows.slice(0, 4), null, () => true);
    // Simulated cold start: only `next` survives.
    const secondRun = advanceCursor(rows.filter((r) => isAfterCursor(r, firstRun.next)), firstRun.next, () => true);
    expect(secondRun.processed).toBe(6);
    expect(secondRun.next!.listingKey).toBe('K0009');
  });
});

describe('two clocks cannot share one cursor', () => {
  it('the keyset filter is per-dimension, so MT and PCT need separate rows', () => {
    const c = { timestamp: new Date('2026-08-01T00:00:00.000Z'), listingKey: 'K1' };
    expect(keysetFilter('ModificationTimestamp', c)).toBe(
      "(ModificationTimestamp gt 2026-08-01T00:00:00.000Z or (ModificationTimestamp eq 2026-08-01T00:00:00.000Z and ListingKey gt 'K1'))",
    );
    expect(keysetFilter('PhotosChangeTimestamp', c)).toContain('PhotosChangeTimestamp gt');
    expect(keysetFilter('ModificationTimestamp', null)).toBeNull();
  });

  it('escapes a quote in the key so the filter cannot be broken', () => {
    const c = { timestamp: new Date('2026-08-01T00:00:00.000Z'), listingKey: "K'1" };
    expect(keysetFilter('ModificationTimestamp', c)).toContain("ListingKey gt 'K''1'");
  });
});
