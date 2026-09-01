import { readOpenHouseMembership } from '../open-house-membership';

/** A provider that serves `pages` in order and then stops. */
function provider(pages: Array<{ keys: string[]; last?: boolean }>) {
  let i = 0;
  return async () => {
    const p = pages[i];
    if (!p) throw new Error('read past the end');
    i += 1;
    return { keys: p.keys, nextLink: p.last ? null : `link-${i}` };
  };
}

describe('the range is walked to the end, or it is not answered', () => {
  it('follows nextLink until the provider says there is none', async () => {
    const m = await readOpenHouseMembership({
      fetchPage: provider([
        { keys: ['A', 'B'] },
        { keys: ['C'] },
        { keys: ['D'], last: true },
      ]),
      maxPages: 10,
    });
    expect(m.state).toBe('resolved');
    if (m.state !== 'resolved') throw new Error('unreachable');
    expect([...m.listingKeys].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(m.pagesRead).toBe(3);
  });

  it('a FULL first page does not end the walk — the old $top=500 defect', async () => {
    // The route read 500 rows once and treated that as the resource. If the
    // range holds more, every listing past the cut silently loses its open
    // house. Exhaustion must come from the provider, not from a page filling.
    const keys = Array.from({ length: 500 }, (_, i) => `K${i}`);
    const m = await readOpenHouseMembership({
      fetchPage: provider([{ keys }, { keys: ['OVERFLOW'], last: true }]),
      maxPages: 10,
    });
    expect(m.state).toBe('resolved');
    if (m.state !== 'resolved') throw new Error('unreachable');
    expect(m.listingKeys.has('OVERFLOW')).toBe(true);
    expect(m.listingKeys.size).toBe(501);
  });

  it('a provider failure is UNAVAILABLE, never an empty set', async () => {
    // An empty set reads as "no listing has an open house" and would return an
    // empty search. The old code did the opposite and skipped the filter, which
    // returned the UNFILTERED set. Both are wrong; neither is available here.
    const m = await readOpenHouseMembership({
      fetchPage: async () => { throw new Error('HTTP 503'); },
      maxPages: 10,
    });
    expect(m.state).toBe('unavailable');
    if (m.state !== 'unavailable') throw new Error('unreachable');
    expect(m.reason).toContain('503');
  });

  it('a failure PART WAY THROUGH discards the partial set', async () => {
    // Keys already gathered are not an answer. Returning them would narrow the
    // search by exactly the rows we failed to read.
    let n = 0;
    const m = await readOpenHouseMembership({
      fetchPage: async () => {
        n += 1;
        if (n === 1) return { keys: ['A', 'B'], nextLink: 'more' };
        throw new Error('connection reset');
      },
      maxPages: 10,
    });
    expect(m.state).toBe('unavailable');
  });

  it('running out of budget before exhaustion is UNAVAILABLE, not a smaller answer', async () => {
    const m = await readOpenHouseMembership({
      fetchPage: async () => ({ keys: ['X'], nextLink: 'always-more' }),
      maxPages: 3,
    });
    expect(m.state).toBe('unavailable');
    if (m.state !== 'unavailable') throw new Error('unreachable');
    expect(m.reason).toMatch(/not exhausted/i);
  });

  it('an empty range is RESOLVED and empty — a real answer, distinct from unavailable', async () => {
    // "No open houses this weekend" is a true answer and must not be confused
    // with "we could not find out".
    const m = await readOpenHouseMembership({
      fetchPage: provider([{ keys: [], last: true }]),
      maxPages: 10,
    });
    expect(m.state).toBe('resolved');
    if (m.state !== 'resolved') throw new Error('unreachable');
    expect(m.listingKeys.size).toBe(0);
  });

  it('duplicate keys across pages collapse to one identity', async () => {
    const m = await readOpenHouseMembership({
      fetchPage: provider([{ keys: ['A', 'A'] }, { keys: ['A', 'B'], last: true }]),
      maxPages: 10,
    });
    if (m.state !== 'resolved') throw new Error('unreachable');
    expect(m.listingKeys.size).toBe(2);
    expect(m.keysRead).toBe(4);
  });
});
