/**
 * AttendanceType reaches a stored listing (Maya, 2026-11-20: "this 'Door person' as it says in trestle must be matched to the new field ... please fix").
 *
 * Live Cotality: AttendanceType is a key inside CustomProperty.CustomFields, not a Property field (`$select=AttendanceType` answers HTTP 400), and the listing sync reads
 * Property fields only, so no stored listing carried it (the public listings API served 0 of 400 listings with it, 2026-11-20). fetchAttendanceTypes reads it from the
 * CustomProperty resource for the listings of one sync batch; withAttendanceType puts it on the listing's features.
 *
 * The rule that matters: a FAILED lookup is "unknown", never "absent". Only a lookup that succeeded and found nothing clears a stored value.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  chunkKeys,
  fetchAttendanceTypes,
  keepStoredAttendanceType,
  readAttendanceType,
  withAttendanceType,
  type AttendanceJoin,
} from '@/lib/idx/custom-property-join';
import { IDX_PLUS_SELECT_FIELDS } from '@/lib/idx/trestle-mapper';

type Call = { resource?: string; filter?: string; select?: readonly string[]; orderby?: string; top?: number; maxTotal?: number; expandCustomProperty?: unknown };
const rowsFor = (keys: string[], values: Record<string, string | null | undefined>) =>
  keys.filter((k) => k in values).map((k) => ({ ListingKey: k, CustomFields: JSON.stringify(values[k] ? { TaxAbatementYN: true, AttendanceType: values[k] } : { TaxAbatementYN: true }) }));

describe('readAttendanceType', () => {
  it('reads the comma list from the CustomFields text', () => {
    expect(readAttendanceType('{"AttendanceType":"DoorpersonFullTime,ConciergeFullTime","TaxAbatementYN":true}')).toBe('DoorpersonFullTime,ConciergeFullTime');
  });

  it('trims members, drops blanks, and accepts a list value', () => {
    expect(readAttendanceType('{"AttendanceType":" DoorpersonYes , ,LobbyAttendantYes "}')).toBe('DoorpersonYes,LobbyAttendantYes');
    expect(readAttendanceType({ AttendanceType: ['DoorpersonYes', 'ConciergeYes'] })).toBe('DoorpersonYes,ConciergeYes');
  });

  it('null: Cotality carries none (no key, an empty value, or no custom fields at all)', () => {
    expect(readAttendanceType('{"TaxAbatementYN":true}')).toBeNull();
    expect(readAttendanceType('{"AttendanceType":""}')).toBeNull();
    expect(readAttendanceType('{"AttendanceType":" , "}')).toBeNull();
    expect(readAttendanceType(null)).toBeNull();
    expect(readAttendanceType('')).toBeNull();
  });

  it('undefined: unreadable, so unknown and never "absent"', () => {
    expect(readAttendanceType('{not json')).toBeUndefined();
    expect(readAttendanceType('[1,2]')).toBeUndefined();
    expect(readAttendanceType('"text"')).toBeUndefined();
    expect(readAttendanceType(42)).toBeUndefined();
  });

  it('undefined: a value that is not text or a list of text is unreadable (never stored as "[object Object]" or "true")', () => {
    expect(readAttendanceType('{"AttendanceType":{"a":1}}')).toBeUndefined();
    expect(readAttendanceType('{"AttendanceType":true}')).toBeUndefined();
    expect(readAttendanceType('{"AttendanceType":5}')).toBeUndefined();
    expect(readAttendanceType('{"AttendanceType":["DoorpersonYes",5]}')).toBeUndefined();
  });

  it('keeps the live spelling as delivered (no retired Doorman spelling is translated or invented)', () => {
    expect(readAttendanceType('{"AttendanceType":"VideoDoorpersonYes"}')).toBe('VideoDoorpersonYes');
    expect(readAttendanceType('{"AttendanceType":"DoormanFullTime"}')).toBe('DoormanFullTime');
  });
});

describe('chunkKeys', () => {
  it('keeps every request under the URL budget, measured the way the request is really built (URLSearchParams escapes quotes and parentheses; Cotality answers HTTP 414 above about 8 KB: live 420 keys 8,130 characters 200, 440 keys 8,510 characters 414)', () => {
    const keys = Array.from({ length: 2500 }, (_, i) => String(1195000000 + i));
    const chunks = chunkKeys(keys);
    expect(chunks.flat()).toEqual(keys);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      const filter = `ListingKey in (${c.map((k) => `'${k}'`).join(',')})`;
      const query = new URLSearchParams({ $filter: filter, $select: 'ListingKey,CustomFields' }).toString();
      expect(query.length).toBeLessThanOrEqual(6000);
    }
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThan(330);
  });

  it('empty input makes no request, and a quote in a key is doubled', () => {
    expect(chunkKeys([])).toEqual([]);
    expect(chunkKeys(["12'3"])).toEqual([["12'3"]]);
  });
});

describe('fetchAttendanceTypes', () => {
  const ok = (calls: Call[], values: Record<string, string | null | undefined>) => async (options: Call) => {
    calls.push(options);
    const keys = [...(options.filter ?? '').matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
    return { records: rowsFor(keys, values), totalFetched: 0, hasMore: false };
  };

  it('asks the CustomProperty resource for ListingKey and CustomFields only, by ListingKey, and never expands', async () => {
    const calls: Call[] = [];
    await fetchAttendanceTypes(['1001', '1002'], ok(calls, {}) as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].resource).toBe('CustomProperty');
    expect(calls[0].filter).toBe("ListingKey in ('1001','1002')");
    expect([...(calls[0].select ?? [])]).toEqual(['ListingKey', 'CustomFields']);
    expect(calls[0].orderby).toBe('ListingKey');
    expect(calls[0].expandCustomProperty).toBeUndefined();
  });

  it('maps a value and a missing key in CustomFields; a listing with no CustomProperty row is UNKNOWN, not "none" (live: every listing has a row, so a missing one is an anomaly and must not clear data)', async () => {
    const join = await fetchAttendanceTypes(['1', '2', '3'], ok([], { '1': 'DoorpersonFullTime', '2': null }) as never);
    expect(join.byKey.get('1')).toBe('DoorpersonFullTime');
    expect(join.byKey.get('2')).toBeNull();
    expect(join.byKey.has('3')).toBe(false);
    expect(join.unknown.has('3')).toBe(true);
  });

  it('a request Cotality refuses (a 4xx: 414 too long, 429 rate limited) is not retried, and its chunk is unknown; a 5xx or a timeout is retried once', async () => {
    const attempts = async (message: string) => {
      let n = 0;
      const join = await fetchAttendanceTypes(['1'], (async () => { n++; throw new Error(message); }) as never);
      expect(join.unknown.has('1')).toBe(true);
      return n;
    };
    expect(await attempts('[IDX Fetch] Trestle API error (414)')).toBe(1);
    expect(await attempts('[IDX Fetch] Trestle API error (429)')).toBe(1);
    expect(await attempts('[IDX Fetch] Trestle API error (400)')).toBe(1);
    expect(await attempts('[IDX Fetch] Trestle API error (500)')).toBe(2);
    expect(await attempts('The operation was aborted due to timeout')).toBe(2);
  });

  it('each request is given no more time than the budget has left', async () => {
    const keys = Array.from({ length: 900 }, (_, i) => String(1195000000 + i));
    const seen: Array<number | undefined> = [];
    let clock = 0;
    const fetcher = async (options: Call & { timeoutMs?: number }) => {
      seen.push(options.timeoutMs);
      clock += 20_000;
      const ks = [...(options.filter ?? '').matchAll(/'(\d+)'/g)].map((m) => m[1]);
      return { records: rowsFor(ks, Object.fromEntries(ks.map((k) => [k, 'DoorpersonYes']))), totalFetched: 0, hasMore: false };
    };
    await fetchAttendanceTypes(keys, fetcher as never, { budgetMs: 30_000, now: () => clock });
    expect(seen[0]).toBe(20_000); // the usual per-request timeout
    expect(seen[1]).toBe(10_000); // 20 s of a 30 s budget are gone
  });

  it('a failed request marks only its chunk unknown, and a later chunk still succeeds', async () => {
    const keys = Array.from({ length: 900 }, (_, i) => String(1195000000 + i));
    let n = 0;
    const fetcher = async (options: Call) => {
      n++;
      if (n === 1 || n === 2) throw new Error('[IDX Fetch] Trestle API error (500)'); // first chunk: the request and its one retry both fail
      const ks = [...(options.filter ?? '').matchAll(/'(\d+)'/g)].map((m) => m[1]);
      return { records: rowsFor(ks, Object.fromEntries(ks.map((k) => [k, 'DoorpersonYes']))), totalFetched: 0, hasMore: false };
    };
    const join = await fetchAttendanceTypes(keys, fetcher as never);
    const firstChunk = chunkKeys(keys)[0];
    expect(join.unknown.size).toBe(firstChunk.length);
    for (const k of firstChunk) expect(join.byKey.has(k)).toBe(false);
    const rest = keys.filter((k) => !firstChunk.includes(k));
    expect(rest.length).toBeGreaterThan(0);
    for (const k of rest) expect(join.byKey.get(k)).toBe('DoorpersonYes');
  });

  it('retries a failed request once and uses the second answer', async () => {
    let n = 0;
    const fetcher = async (options: Call) => {
      n++;
      if (n === 1) throw new Error('timeout');
      return { records: rowsFor(['7'], { '7': 'DoorpersonPartTime' }), totalFetched: 0, hasMore: false, options };
    };
    const join = await fetchAttendanceTypes(['7'], fetcher as never);
    expect(n).toBe(2);
    expect(join.byKey.get('7')).toBe('DoorpersonPartTime');
    expect(join.unknown.size).toBe(0);
  });

  it('a row whose CustomFields cannot be read is unknown, not absent', async () => {
    const fetcher = async () => ({ records: [{ ListingKey: '9', CustomFields: '{broken' }], totalFetched: 1, hasMore: false });
    const join = await fetchAttendanceTypes(['9'], fetcher as never);
    expect(join.unknown.has('9')).toBe(true);
    expect(join.byKey.has('9')).toBe(false);
  });

  it('stops asking once its time budget is spent: the rest are unknown, with no further request (a slow Cotality cannot eat the sync\'s whole run)', async () => {
    const keys = Array.from({ length: 900 }, (_, i) => String(1195000000 + i));
    const calls: Call[] = [];
    let clock = 0;
    const fetcher = async (options: Call) => {
      calls.push(options);
      clock += 20_000; // each request takes 20 s
      const ks = [...(options.filter ?? '').matchAll(/'(\d+)'/g)].map((m) => m[1]);
      return { records: rowsFor(ks, Object.fromEntries(ks.map((k) => [k, 'DoorpersonYes']))), totalFetched: 0, hasMore: false };
    };
    const join = await fetchAttendanceTypes(keys, fetcher as never, { budgetMs: 30_000, now: () => clock });
    const chunks = chunkKeys(keys);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(calls).toHaveLength(2); // 0 s and 20 s are inside the budget; 40 s is not
    for (const k of chunks[0].concat(chunks[1])) expect(join.byKey.get(k)).toBe('DoorpersonYes');
    const rest = chunks.slice(2).flat();
    for (const k of rest) expect(join.unknown.has(k)).toBe(true);
    expect(join.byKey.size + join.unknown.size).toBe(keys.length);
  });

  it('de-duplicates keys, ignores blanks, and makes no request for nothing', async () => {
    const calls: Call[] = [];
    await fetchAttendanceTypes(['5', '5', '', '6'], ok(calls, {}) as never);
    expect(calls[0].filter).toBe("ListingKey in ('5','6')");
    const none: Call[] = [];
    const join = await fetchAttendanceTypes([], ok(none, {}) as never);
    expect(none).toHaveLength(0);
    expect(join.requests).toBe(0);
  });
});

describe('the sync uses it, and AttendanceType never goes into the Property $select (it would answer HTTP 400)', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8').replace(/\r\n/g, '\n');
  const sync = read('lib/idx/sync.ts');

  it('syncListings looks AttendanceType up once per batch, right after the fetch', () => {
    const fetched = sync.indexOf('[IDX Sync] Fetched ${fetchResult.totalFetched} records from Cotality');
    const joined = sync.indexOf('const attendanceJoin = await fetchAttendanceTypes(fetchResult.records.map');
    const loop = sync.indexOf('for (const [recordIndex, raw] of fetchResult.records.entries())');
    expect(fetched).toBeGreaterThan(0);
    expect(joined).toBeGreaterThan(fetched);
    expect(loop).toBeGreaterThan(joined);
  });

  it('each listing takes its AttendanceType from the join after its stored row is read, and before the permissions and the write', () => {
    const existing = sync.indexOf('const existing = await prisma.listing.findUnique');
    const applied = sync.indexOf('mapped.features = withAttendanceType(mapped.features as Record<string, unknown>, String(raw.ListingKey ?? ""), attendanceJoin, existing?.features);');
    const permissions = sync.indexOf('const newPermissions = readTrestlePermissions(raw);');
    expect(existing).toBeGreaterThan(0);
    expect(applied).toBeGreaterThan(existing);
    expect(permissions).toBeGreaterThan(applied);
  });

  it('the mapper and the $select field list do not name AttendanceType', () => {
    expect(IDX_PLUS_SELECT_FIELDS).not.toContain('AttendanceType');
    expect(read('lib/idx/trestle-mapper.ts')).not.toMatch(/AttendanceType/);
  });
});

describe('the other writers of a listing\'s features do not erase AttendanceType', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8').replace(/\r\n/g, '\n');

  it('keepStoredAttendanceType keeps what is stored, drops a stray copy, and makes no request', () => {
    expect(keepStoredAttendanceType({ A: 1 }, { AttendanceType: 'DoorpersonYes' })).toEqual({ A: 1, AttendanceType: 'DoorpersonYes' });
    expect(keepStoredAttendanceType({ A: 1, AttendanceType: 'stale' }, { Other: 2 })).toEqual({ A: 1 });
    expect(keepStoredAttendanceType({ A: 1 }, null)).toEqual({ A: 1 });
    expect(keepStoredAttendanceType({ A: 1 }, { AttendanceType: { x: 1 } })).toEqual({ A: 1 });
  });

  it('the agent-history sync keeps the stored value (it rewrites existing listings and makes no extra Cotality request)', () => {
    const sync = read('lib/idx/sync.ts');
    expect(sync).toMatch(/select: LISTING_SYNC_COMPARE_SELECT,\n\s*\}\);\n(?:\s*\/\/[^\n]*\n)*\s*mapped\.features = keepStoredAttendanceType\(mapped\.features as Record<string, unknown>, existingForClock\?\.features\);/);
  });

  it('the CRM reset-sync route looks AttendanceType up for the listings it pulls and reads the stored features before it rewrites them', () => {
    const route = read('app/api/crm/listings/reset-sync/route.ts');
    expect(route).toMatch(/const attendanceJoin = await fetchAttendanceTypes\(result\.records\.map/);
    expect(route).toMatch(/select: \{ status: true, owner_opt_out: true, features: true \}/);
    expect(route).toMatch(/mapped\.features = withAttendanceType\(mapped\.features as Record<string, unknown>, String\(raw\.ListingKey \?\? ""\), attendanceJoin, existingForClock\?\.features\);/);
  });

  it('the CRM reset-sync route deletes every listing first, so nothing is stored to keep: it says how many listings came back without AttendanceType because the lookup failed', () => {
    const route = read('app/api/crm/listings/reset-sync/route.ts');
    expect(route).toMatch(/prisma\.listing\.deleteMany\(\{\}\)/);
    expect(route).toMatch(/if \(attendanceJoin\.unknown\.size > 0\) log\.push\(`  AttendanceType unknown for \$\{attendanceJoin\.unknown\.size\} of \$\{result\.records\.length\} listings/);
  });

  it('the nightly reconcile says when its lookup failed for listings it created', () => {
    expect(read('app/api/cron/feed-reconcile/route.ts')).toMatch(/if \(attendanceJoin\.unknown\.size > 0\) console\.warn\(`\[feed-reconcile\] AttendanceType unknown for/);
  });

  it('the nightly reconcile carries it onto the listings it creates', () => {
    const route = read('app/api/cron/feed-reconcile/route.ts');
    expect(route).toMatch(/const attendanceJoin = await fetchAttendanceTypes\(rows\.map/);
    expect(route).toMatch(/mapped\.features = withAttendanceType\(mapped\.features as Record<string, unknown>, String\(raw\.ListingKey \?\? ""\), attendanceJoin, null\);/);
  });

  it('the recovery script keeps the stored value (a recovered listing keeps its AttendanceType, and the script makes no extra Cotality request)', () => {
    const script = read('scripts/recover-stale-property-listings.ts');
    expect(script).toMatch(/mapped\.features = keepStoredAttendanceType\(mapped\.features as Record<string, unknown>, existing\?\.features\);/);
  });
});

describe('withAttendanceType', () => {
  const join = (byKey: Record<string, string | null>, unknown: string[] = []): AttendanceJoin => ({ byKey: new Map(Object.entries(byKey)), unknown: new Set(unknown), requests: 1 });

  it('puts the value Cotality carries on the features', () => {
    expect(withAttendanceType({ BuildingFeatures: 'Elevators' }, '1', join({ '1': 'DoorpersonFullTime' }), undefined)).toEqual({ BuildingFeatures: 'Elevators', AttendanceType: 'DoorpersonFullTime' });
  });

  it('a successful lookup that finds none CLEARS a stored value: Cotality no longer carries it', () => {
    expect(withAttendanceType({ A: 1 }, '1', join({ '1': null }), { AttendanceType: 'DoorpersonFullTime' })).toEqual({ A: 1 });
  });

  it('an UNKNOWN lookup keeps what is stored (a failed request never erases data)', () => {
    expect(withAttendanceType({ A: 1 }, '1', join({}, ['1']), { AttendanceType: 'DoorpersonFullTime' })).toEqual({ A: 1, AttendanceType: 'DoorpersonFullTime' });
  });

  it('an unknown lookup with nothing stored leaves it absent', () => {
    expect(withAttendanceType({ A: 1 }, '1', join({}, ['1']), { Other: 2 })).toEqual({ A: 1 });
    expect(withAttendanceType({ A: 1 }, '1', join({}, ['1']), null)).toEqual({ A: 1 });
  });

  it('a listing the lookup never covered is treated as unknown, not absent', () => {
    expect(withAttendanceType({ A: 1 }, '404', join({ '1': 'DoorpersonYes' }), { AttendanceType: 'LobbyAttendantYes' })).toEqual({ A: 1, AttendanceType: 'LobbyAttendantYes' });
  });

  it('never trusts an AttendanceType already in the mapped features, and does not change its input', () => {
    const mapped = { A: 1, AttendanceType: 'stale' };
    const out = withAttendanceType(mapped, '1', join({ '1': null }), undefined);
    expect(out).toEqual({ A: 1 });
    expect(mapped).toEqual({ A: 1, AttendanceType: 'stale' });
  });

  it('ignores a stored value that is not a text (never carries junk forward)', () => {
    expect(withAttendanceType({}, '1', join({}, ['1']), { AttendanceType: { x: 1 } })).toEqual({});
    expect(withAttendanceType({}, '1', join({}, ['1']), { AttendanceType: '' })).toEqual({});
  });
});
