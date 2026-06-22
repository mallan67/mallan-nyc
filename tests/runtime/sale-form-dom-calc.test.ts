/// <reference types="jest" />
/**
 * Sale-form Days-on-Market calc — behavior proof + canonical-parity (P0).
 *
 * The sale editor must display UCBA-compliant DOM (UCBA Art. I §11) instead of a
 * from-scratch frontend counter that reset to 0 on every edit-load. The canonical
 * read-path logic lives in `lib/compliance/dom-tracker.ts` (`getCurrentDom`).
 *
 * The browser form can't import the TS module, so `public/crm/js/listing/dom-calc.js`
 * MIRRORS it. This test imports BOTH and asserts they produce IDENTICAL results
 * across a battery of inputs — so the frontend can never silently diverge from the
 * compliance source of truth (instruction 4: no invented frontend DOM logic).
 *
 * @module tests/runtime/sale-form-dom-calc
 */
import { getCurrentDom as tsGetCurrentDom } from '../../lib/compliance/dom-tracker';
import {
  getCurrentDom as jsGetCurrentDom,
  resolveEditorDom,
} from '../../public/crm/js/listing/dom-calc.js';

const FIXED_NOW = Date.parse('2026-06-22T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(FIXED_NOW - n * DAY);

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('dom-calc.getCurrentDom — parity with canonical lib/compliance/dom-tracker', () => {
  const cases = [
    { status: 'Active', permissions: null, status_changed_at: daysAgo(10), days_on_market: 0 },
    { status: 'Active', permissions: null, status_changed_at: daysAgo(0), days_on_market: 0 },
    { status: 'Active', permissions: null, status_changed_at: daysAgo(5), days_on_market: 12 },
    { status: 'ActiveUnderContract', permissions: null, status_changed_at: daysAgo(3), days_on_market: 7 },
    { status: 'ComingSoon', permissions: null, status_changed_at: daysAgo(20), days_on_market: 4 },
    { status: 'Withdrawn', permissions: null, status_changed_at: daysAgo(40), days_on_market: 30 },
    { status: 'Active', permissions: 'Participant Only Network', status_changed_at: daysAgo(15), days_on_market: 2 },
    { status: 'Active', permissions: 'Private', status_changed_at: daysAgo(9), days_on_market: 0 },
    { status: 'Active', permissions: null, status_changed_at: null, days_on_market: 8 },
    { status: 'Sold', permissions: null, status_changed_at: daysAgo(99), days_on_market: 55 },
  ];

  it.each(cases)('matches canonical for %o', (c) => {
    const ts = tsGetCurrentDom({ ...c, first_active_date: null } as never);
    const js = jsGetCurrentDom(c);
    expect(js).toBe(ts);
  });
});

describe('dom-calc.getCurrentDom — UCBA behavior (instruction 6 proof)', () => {
  it('Active since 10 days ago → 10 (NOT 0)', () => {
    expect(jsGetCurrentDom({ status: 'Active', status_changed_at: daysAgo(10), days_on_market: 0 })).toBe(10);
  });
  it('Active as of today → 0 (truly active today)', () => {
    expect(jsGetCurrentDom({ status: 'Active', status_changed_at: daysAgo(0), days_on_market: 0 })).toBe(0);
  });
  it('ComingSoon does not accrue DOM', () => {
    expect(jsGetCurrentDom({ status: 'ComingSoon', status_changed_at: daysAgo(20), days_on_market: 0 })).toBe(0);
  });
  it('Participant Only Network suppresses accrual even when Active', () => {
    expect(jsGetCurrentDom({ status: 'Active', permissions: 'Participant Only Network', status_changed_at: daysAgo(30), days_on_market: 3 })).toBe(3);
  });
});

describe('resolveEditorDom — hydrate seed (instruction 3: seed from OnMarketDate)', () => {
  it('falls back to on_market_date when accruing with no stored base/status_changed_at', () => {
    const r = resolveEditorDom({ status: 'Active', status_changed_at: null, first_active_date: null, on_market_date: daysAgo(7), days_on_market: 0 });
    expect(r.days).toBe(7);
  });
  it('prefers first_active_date over on_market_date as the anchor', () => {
    const r = resolveEditorDom({ status: 'Active', status_changed_at: null, first_active_date: daysAgo(12), on_market_date: daysAgo(7), days_on_market: 0 });
    expect(r.days).toBe(12);
  });
  it('returns 0 for a brand-new Active listing with no dates (not active until dated)', () => {
    const r = resolveEditorDom({ status: 'Active', status_changed_at: null, first_active_date: null, on_market_date: null, days_on_market: 0 });
    expect(r.days).toBe(0);
  });
  it('cumulative is never less than the current DOM', () => {
    const r = resolveEditorDom({ status: 'Active', status_changed_at: daysAgo(10), days_on_market: 0, cumulative_days_on_market: 3 });
    expect(r.days).toBe(10);
    expect(r.cumulative).toBe(10);
  });
});
