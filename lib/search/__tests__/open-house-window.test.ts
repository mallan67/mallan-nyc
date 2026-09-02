/**
 * OPEN HOUSE DATE WINDOWS — DETERMINISTIC, AND CORRECT IN NEW YORK.
 *
 * "This Weekend" is the one every implementation gets wrong, because the answer
 * depends on WHICH DAY YOU ASK. These tests pin all seven.
 *
 * The timezone is not incidental. A broker in New York opening Search at 21:00
 * on a Friday is at 01:00 Saturday UTC. Deriving "today" from a UTC date would
 * show them Saturday's open houses and hide Friday's — the listings they can
 * still get to tonight. So every boundary is computed in America/New_York.
 */
import { resolveOpenHouseWindow, OpenHouseWindowError } from '../open-house-window';

/** A real instant, expressed as UTC, so the NY conversion is what is tested. */
const at = (iso: string) => new Date(iso);

describe('preset windows are computed in America/New_York', () => {
  it('TODAY is the New York day, not the UTC day', () => {
    // 01:30 UTC Saturday === 21:30 Friday in New York.
    const w = resolveOpenHouseWindow({ preset: 'today', now: at('2026-09-05T01:30:00Z') });
    expect(w).toEqual({ from: '2026-09-04', to: '2026-09-04' });
  });

  it('TODAY late in the New York evening is still that same day', () => {
    // 23:59 New York on 2026-09-04 is 03:59 UTC on 2026-09-05.
    const w = resolveOpenHouseWindow({ preset: 'today', now: at('2026-09-05T03:59:00Z') });
    expect(w.from).toBe('2026-09-04');
  });
});

describe('THIS WEEKEND, asked on every day of the week', () => {
  // 2026-09-07 is a Monday. The weekend it points at is Sat 12 / Sun 13.
  const cases: Array<[string, string, string, string]> = [
    ['Monday',    '2026-09-07T16:00:00Z', '2026-09-12', '2026-09-13'],
    ['Tuesday',   '2026-09-08T16:00:00Z', '2026-09-12', '2026-09-13'],
    ['Wednesday', '2026-09-09T16:00:00Z', '2026-09-12', '2026-09-13'],
    ['Thursday',  '2026-09-10T16:00:00Z', '2026-09-12', '2026-09-13'],
    ['Friday',    '2026-09-11T16:00:00Z', '2026-09-12', '2026-09-13'],
    // ON Saturday the weekend has STARTED. It must not roll forward a week —
    // that would hide today's open houses from a broker standing in one.
    ['Saturday',  '2026-09-12T16:00:00Z', '2026-09-12', '2026-09-13'],
    // ON Sunday the weekend is ALMOST over, and Saturday is in the past.
    // The window starts today, not last Saturday.
    ['Sunday',    '2026-09-13T16:00:00Z', '2026-09-13', '2026-09-13'],
  ];

  it.each(cases)('%s -> %s .. %s', (_day, nowIso, from, to) => {
    const w = resolveOpenHouseWindow({ preset: 'weekend', now: at(nowIso) });
    expect(w).toEqual({ from, to });
  });

  it('late Friday night in New York still means the coming weekend', () => {
    // 02:00 UTC Saturday === 22:00 Friday NY. A UTC reading would call this
    // Saturday and give the same answer by luck; assert the NY reasoning holds.
    const w = resolveOpenHouseWindow({ preset: 'weekend', now: at('2026-09-12T02:00:00Z') });
    expect(w).toEqual({ from: '2026-09-12', to: '2026-09-13' });
  });
});

describe('rolling windows are inclusive of today', () => {
  it('NEXT 7 DAYS spans today through day 7 — seven days, not eight', () => {
    const w = resolveOpenHouseWindow({ preset: 'next7', now: at('2026-09-07T16:00:00Z') });
    expect(w).toEqual({ from: '2026-09-07', to: '2026-09-13' });
  });

  it('NEXT 30 DAYS spans today through day 30', () => {
    const w = resolveOpenHouseWindow({ preset: 'next30', now: at('2026-09-07T16:00:00Z') });
    expect(w).toEqual({ from: '2026-09-07', to: '2026-10-06' });
  });

  it('a rolling window crosses a month end without arithmetic drift', () => {
    const w = resolveOpenHouseWindow({ preset: 'next7', now: at('2026-09-28T16:00:00Z') });
    expect(w).toEqual({ from: '2026-09-28', to: '2026-10-04' });
  });

  it('a rolling window crosses the DST fall-back without losing a day', () => {
    // US DST ends 2026-11-01. A naive +N*86400000 would land an hour short and
    // can round down to the previous date.
    const w = resolveOpenHouseWindow({ preset: 'next7', now: at('2026-10-29T16:00:00Z') });
    expect(w).toEqual({ from: '2026-10-29', to: '2026-11-04' });
  });
});

describe('CUSTOM ranges are inclusive at both ends, and validated', () => {
  it('both bounds are kept exactly as given', () => {
    const w = resolveOpenHouseWindow({ preset: 'custom', from: '2026-09-10', to: '2026-09-12' });
    expect(w).toEqual({ from: '2026-09-10', to: '2026-09-12' });
  });

  it('a single-day custom range is from === to, not an empty window', () => {
    const w = resolveOpenHouseWindow({ preset: 'custom', from: '2026-09-10', to: '2026-09-10' });
    expect(w).toEqual({ from: '2026-09-10', to: '2026-09-10' });
  });

  it('an open-ended FROM is allowed and anchors the start', () => {
    const w = resolveOpenHouseWindow({
      preset: 'custom', from: '2026-09-10', now: at('2026-09-07T16:00:00Z'),
    });
    expect(w.from).toBe('2026-09-10');
    expect(w.to).toBeNull();
  });

  it('REFUSES a reversed range rather than returning nothing', () => {
    // from > to matches no open house. Returning an empty result would tell the
    // broker "there are none", which is a different and false statement.
    expect(() => resolveOpenHouseWindow({ preset: 'custom', from: '2026-09-12', to: '2026-09-10' }))
      .toThrow(OpenHouseWindowError);
  });

  it('REFUSES a malformed date rather than coercing it', () => {
    expect(() => resolveOpenHouseWindow({ preset: 'custom', from: '09/10/2026' }))
      .toThrow(OpenHouseWindowError);
    expect(() => resolveOpenHouseWindow({ preset: 'custom', from: '2026-13-01' }))
      .toThrow(OpenHouseWindowError);
  });

  it('REFUSES a custom preset with no bounds at all', () => {
    expect(() => resolveOpenHouseWindow({ preset: 'custom' })).toThrow(OpenHouseWindowError);
  });
});

describe('an unknown preset is refused, never silently widened', () => {
  it('throws instead of falling back to "all open houses"', () => {
    expect(() => resolveOpenHouseWindow({ preset: 'nextYear' as never }))
      .toThrow(OpenHouseWindowError);
  });
});
