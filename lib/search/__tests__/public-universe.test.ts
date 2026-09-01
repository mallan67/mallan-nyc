import {
  assemblePublicUniverse,
  PublicCountMeaning,
} from '../public-universe';

/** A candidate row: an id and a flag each stage can act on. */
interface Row {
  id: string;
  keep: boolean;
  twinOf?: string;
}

/** Reads from a fixed corpus, honouring skip/take like a real query would. */
function readerFor(corpus: Row[], calls: Array<[number, number]> = []) {
  return async (skip: number, take: number) => {
    calls.push([skip, take]);
    return corpus.slice(skip, skip + take);
  };
}

const identity = <T,>(x: T[]) => x;

/** Collapses a twin onto its principal, wherever in the corpus each one sits. */
const reconcileTwins = (rows: Row[]) => {
  const principals = new Set(rows.filter((r) => !r.twinOf).map((r) => r.id));
  return rows.filter((r) => !(r.twinOf && principals.has(r.twinOf)));
};

const keepOnly = (rows: Row[]) => rows.filter((r) => r.keep);

function corpus(n: number, keep: (i: number) => boolean = () => true): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `L${i}`, keep: keep(i) }));
}

describe('membership is settled before the page is cut', () => {
  it('a page is FULL even when most candidates are filtered out', async () => {
    // THE RAGGED-PAGE DEFECT. Under the old order the route asked Prisma for 50
    // rows, then removed the ones that failed the filter, and rendered whatever
    // was left — a page of 50 showing 5. Here the filter runs first, so the page
    // is cut from survivors and is whole.
    const u = await assemblePublicUniverse<Row, Row>({
      readBatch: readerFor(corpus(1000, (i) => i % 10 === 0)),
      toDtos: identity,
      reconcile: identity,
      corpusFilter: keepOnly,
      page: 1,
      pageSize: 50,
      budget: 5000,
      batchSize: 100,
    });
    expect(u.rows).toHaveLength(50);
    expect(u.count).toBe(100);
    expect(u.countMeaning).toBe(PublicCountMeaning.EXACT);
  });

  it('a filtered row is LOST, not deferred, under page-local filtering — this proves it is not', async () => {
    // Page 2 must continue where page 1 ended IN THE FINAL UNIVERSE. Under the
    // old order page 2 started at candidate 51 regardless of how many of the
    // first 50 survived, so survivors 6..10 were never rendered on any page.
    const src = corpus(1000, (i) => i % 10 === 0);
    const opts = {
      readBatch: readerFor(src),
      toDtos: identity,
      reconcile: identity,
      corpusFilter: keepOnly,
      pageSize: 5,
      budget: 5000,
      batchSize: 100,
    };
    const p1 = await assemblePublicUniverse<Row, Row>({ ...opts, page: 1 });
    const p2 = await assemblePublicUniverse<Row, Row>({ ...opts, page: 2 });
    expect(p1.rows.map((r) => r.id)).toEqual(['L0', 'L10', 'L20', 'L30', 'L40']);
    expect(p2.rows.map((r) => r.id)).toEqual(['L50', 'L60', 'L70', 'L80', 'L90']);
    // No gap and no repeat across the seam.
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(10);
  });

  it('the count describes the SAME set as the rows', async () => {
    // `total` used to be prisma.count(where) — a population no JS filter had
    // touched. Walking every page must now account for exactly `count` rows.
    const opts = {
      readBatch: readerFor(corpus(437, (i) => i % 3 === 0)),
      toDtos: identity,
      reconcile: identity,
      corpusFilter: keepOnly,
      pageSize: 20,
      budget: 5000,
      batchSize: 64,
    };
    const first = await assemblePublicUniverse<Row, Row>({ ...opts, page: 1 });
    const seen: string[] = [];
    for (let p = 1; p <= (first.totalPages ?? 0); p++) {
      const u = await assemblePublicUniverse<Row, Row>({ ...opts, page: p });
      seen.push(...u.rows.map((r) => r.id));
    }
    expect(seen).toHaveLength(first.count);
    expect(new Set(seen).size).toBe(first.count);
  });
});

describe('reconciliation is global, not page-local', () => {
  it('a twin in the LAST batch still suppresses its principal-duplicate from the first', async () => {
    // THE PAGE-LOCAL RECONCILIATION DEFECT. A Mallan exclusive and its IDX twin
    // land on different pages, so a per-page dedupe never sees them together and
    // one physical listing occupies two identities in the public universe.
    const rows: Row[] = [
      { id: 'IDX-1', keep: true, twinOf: 'CRM-1' },
      ...corpus(600).map((r) => ({ ...r })),
      { id: 'CRM-1', keep: true },
    ];
    const u = await assemblePublicUniverse<Row, Row>({
      readBatch: readerFor(rows),
      toDtos: identity,
      reconcile: reconcileTwins,
      corpusFilter: identity,
      page: 1,
      pageSize: 10,
      budget: 5000,
      batchSize: 100,
    });
    expect(u.rows.map((r) => r.id)).not.toContain('IDX-1');
    expect(u.exclusions.reconciled).toBe(1);
    expect(u.count).toBe(rows.length - 1);
  });

  it('reconcile runs BEFORE the corpus filter, preserving the route order', async () => {
    const order: string[] = [];
    await assemblePublicUniverse<Row, Row>({
      readBatch: readerFor(corpus(10)),
      toDtos: identity,
      reconcile: (r) => { order.push('reconcile'); return r; },
      corpusFilter: (r) => { order.push('corpusFilter'); return r; },
      page: 1,
      pageSize: 5,
      budget: 100,
    });
    expect(order).toEqual(['reconcile', 'corpusFilter']);
  });
});

describe('a budget bounds work; it never claims to be the end of the inventory', () => {
  it('a truncated traversal reports LOWER_BOUND and withholds the last page', async () => {
    const u = await assemblePublicUniverse<Row, Row>({
      readBatch: readerFor(corpus(10_000)),
      toDtos: identity,
      reconcile: identity,
      corpusFilter: identity,
      page: 1,
      pageSize: 50,
      budget: 300,
      batchSize: 100,
    });
    expect(u.exhausted).toBe(false);
    expect(u.countMeaning).toBe(PublicCountMeaning.LOWER_BOUND);
    expect(u.candidatesRead).toBe(300);
    // "1000+ results / page 1 of 5" is a self-contradiction.
    expect(u.totalPages).toBeNull();
    expect(u.hasMore).toBe(true);
  });

  it('never reads past the budget even when the corpus is far larger', async () => {
    const calls: Array<[number, number]> = [];
    await assemblePublicUniverse<Row, Row>({
      readBatch: readerFor(corpus(10_000), calls),
      toDtos: identity,
      reconcile: identity,
      corpusFilter: identity,
      page: 1,
      pageSize: 50,
      budget: 250,
      batchSize: 100,
    });
    expect(calls.reduce((n, [, take]) => n + take, 0)).toBe(250);
  });

  it('an exhausted traversal is EXACT and states the last page', async () => {
    const u = await assemblePublicUniverse<Row, Row>({
      readBatch: readerFor(corpus(137)),
      toDtos: identity,
      reconcile: identity,
      corpusFilter: identity,
      page: 1,
      pageSize: 20,
      budget: 5000,
      batchSize: 50,
    });
    expect(u.exhausted).toBe(true);
    expect(u.countMeaning).toBe(PublicCountMeaning.EXACT);
    expect(u.totalPages).toBe(7);
  });

  it('a batch that fills EXACTLY does not end the traversal', async () => {
    // A full batch says the batch was filled, nothing more. Treating it as the
    // end is how an exact-size universe loses everything after row N.
    const u = await assemblePublicUniverse<Row, Row>({
      readBatch: readerFor(corpus(200)),
      toDtos: identity,
      reconcile: identity,
      corpusFilter: identity,
      page: 1,
      pageSize: 10,
      budget: 5000,
      batchSize: 100,
    });
    expect(u.count).toBe(200);
    expect(u.exhausted).toBe(true);
  });
});

describe('page edges', () => {
  const base = {
    toDtos: identity,
    reconcile: identity,
    corpusFilter: keepOnly,
    pageSize: 10,
    budget: 5000,
    batchSize: 32,
  };

  it('the final page is short but present, and knows it is last', async () => {
    const opts = { ...base, readBatch: readerFor(corpus(95)) };
    const last = await assemblePublicUniverse<Row, Row>({ ...opts, page: 10 });
    expect(last.rows).toHaveLength(5);
    expect(last.hasMore).toBe(false);
    expect(last.hasPrevious).toBe(true);
  });

  it('a page past the end is EMPTY rather than wrapping or throwing', async () => {
    const opts = { ...base, readBatch: readerFor(corpus(95)) };
    const beyond = await assemblePublicUniverse<Row, Row>({ ...opts, page: 99 });
    expect(beyond.rows).toEqual([]);
    expect(beyond.count).toBe(95);
    expect(beyond.hasMore).toBe(false);
  });

  it('an empty universe is empty, exact, and one page', async () => {
    const u = await assemblePublicUniverse<Row, Row>({
      ...base,
      readBatch: readerFor([]),
      page: 1,
    });
    expect(u.rows).toEqual([]);
    expect(u.count).toBe(0);
    expect(u.countMeaning).toBe(PublicCountMeaning.EXACT);
    expect(u.hasMore).toBe(false);
    expect(u.totalPages).toBe(1);
  });
});
