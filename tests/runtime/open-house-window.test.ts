/**
 * OPEN-HOUSE WINDOW — "has an open house this weekend / on this date" is a
 * different question from "has one upcoming". Search asks the former; the index
 * previously answered only the latter.
 *
 * Pure date logic, injectable reference day — no frozen clocks.
 */
import { dayInWindow, resolveWeekend } from '@/lib/open-houses/upcoming-open-houses';

describe('resolveWeekend', () => {
  // 2026-08-12 is a Wednesday; that week's Sat/Sun are the 15th and 16th.
  it('midweek resolves to the COMING Saturday and Sunday', () => {
    expect(resolveWeekend('2026-08-12')).toEqual({ from: '2026-08-15', to: '2026-08-16' });
  });

  it('Friday still resolves to the next day, not the following week', () => {
    expect(resolveWeekend('2026-08-14')).toEqual({ from: '2026-08-15', to: '2026-08-16' });
  });

  it('ON Saturday resolves to the weekend in progress — today is not skipped', () => {
    expect(resolveWeekend('2026-08-15')).toEqual({ from: '2026-08-15', to: '2026-08-16' });
  });

  it('ON Sunday resolves BACK to the current weekend, not forward a week', () => {
    // Sunday is dow 0; naive `6 - dow` would jump to the following Saturday and
    // hide every event happening today.
    expect(resolveWeekend('2026-08-16')).toEqual({ from: '2026-08-15', to: '2026-08-16' });
  });

  it('crosses a month boundary correctly', () => {
    // 2026-08-31 is a Monday -> weekend is 5–6 September.
    expect(resolveWeekend('2026-08-31')).toEqual({ from: '2026-09-05', to: '2026-09-06' });
  });
});

describe('dayInWindow', () => {
  it('no window matches everything — existing callers are unaffected', () => {
    expect(dayInWindow('2026-01-01')).toBe(true);
    expect(dayInWindow('2099-12-31', undefined)).toBe(true);
  });

  it('exact date matches only that day', () => {
    const w = { date: '2026-08-15' };
    expect(dayInWindow('2026-08-15', w)).toBe(true);
    expect(dayInWindow('2026-08-16', w)).toBe(false);
    expect(dayInWindow('2026-08-14', w)).toBe(false);
  });

  it('from/to bounds are inclusive at both ends', () => {
    const w = { from: '2026-08-15', to: '2026-08-16' };
    expect(dayInWindow('2026-08-15', w)).toBe(true);
    expect(dayInWindow('2026-08-16', w)).toBe(true);
    expect(dayInWindow('2026-08-14', w)).toBe(false);
    expect(dayInWindow('2026-08-17', w)).toBe(false);
  });

  it('weekend admits Sat and Sun and rejects the surrounding weekdays', () => {
    const w = { weekend: true, today: '2026-08-12' };
    expect(dayInWindow('2026-08-15', w)).toBe(true);
    expect(dayInWindow('2026-08-16', w)).toBe(true);
    expect(dayInWindow('2026-08-14', w)).toBe(false);
    expect(dayInWindow('2026-08-17', w)).toBe(false);
  });

  it('an explicit date wins over weekend', () => {
    expect(dayInWindow('2026-08-20', { date: '2026-08-20', weekend: true, today: '2026-08-12' })).toBe(true);
  });

  it('explicit from/to override the weekend defaults', () => {
    const w = { weekend: true, today: '2026-08-12', from: '2026-08-10', to: '2026-08-20' };
    expect(dayInWindow('2026-08-11', w)).toBe(true);
  });
});
