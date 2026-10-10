/// <reference types="jest" />
/**
 * The statistical-data disclaimer (UCBA 2026 Art. VIII Sec. 4): lib/compliance/rls-statistical-disclaimer.ts is the one wording.
 *
 * The code carried more than twenty wordings of it, most with no dates ("for the period indicated", "for the period ending <today>") or with a second sentence that is not the UCBA's. The text below is
 * the repo's extraction of the UCBA (data/UCBA-2026-Requirements.md); the PDF itself was not supplied (UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  RLS_STATISTICAL_DISCLAIMER_TEMPLATE,
  formatDisclaimerDate,
  rlsStatisticalDisclaimer,
  statisticalPeriod,
} from '@/lib/compliance/rls-statistical-disclaimer';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';

const UCBA_TEXT =
  'Based on information from the REBNY Listing Service for the period [date] through [date]. The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information and shall not be held liable for any omission or inaccuracy of such information thereof.';

describe('the wording', () => {
  it('is the UCBA sentence pair, word for word, with a [date] in each place the period goes', () => {
    expect(RLS_STATISTICAL_DISCLAIMER_TEMPLATE).toBe(UCBA_TEXT);
    expect(RLS_STATISTICAL_DISCLAIMER_TEMPLATE.split('[date]')).toHaveLength(3);
  });

  it('is the sentence the repo\'s extraction of the UCBA gives for Art. VIII Sec. 4 (data/UCBA-2026-Requirements.md): the template cannot drift from the document it quotes', () => {
    const extraction = readFileSync(resolve(__dirname, '../../../data/UCBA-2026-Requirements.md'), 'utf8');
    const rows = extraction.split('\n').filter((line) => line.includes('Statistical Data Attribution'));
    expect(rows).toHaveLength(1);                                                  // one row says it; if the document is reorganised this test is looked at, not skipped
    expect(rows[0]).toContain('Art. VIII, Sec. 4');
    expect(rows[0]).toContain(`"${RLS_STATISTICAL_DISCLAIMER_TEMPLATE}"`);
  });

  it('the rule table\'s template is the same sentence pair (it used to end "deemed reliable but not guaranteed")', () => {
    const table = (REBNY_FIELD_TABLES as unknown as { publicDisplay: { statisticalDisclaimer: string } }).publicDisplay.statisticalDisclaimer;
    expect(table).toBe(UCBA_TEXT.replace('[date]', '{startDate}').replace('[date]', '{endDate}'));
  });

  it('says what it says with the dates in: both sentences, and nothing else', () => {
    expect(rlsStatisticalDisclaimer('2026-01-01', '2026-02-12')).toBe(
      'Based on information from the REBNY Listing Service for the period January 1, 2026 through February 12, 2026. The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information and shall not be held liable for any omission or inaccuracy of such information thereof.');
  });
});

describe('the dates', () => {
  it.each([
    ['2026-04-02', 'April 2, 2026'],
    ['2026-12-31', 'December 31, 2026'],
    ['2024-02-29', 'February 29, 2024'],
    ['2026-01-05', 'January 5, 2026'],
  ])('a date-only string (%s) is that day, in words (%s), whatever the time zone of the server', (value, words) => {
    expect(formatDisclaimerDate(value)).toBe(words);
  });

  it.each(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((name, i) => [String(i + 1).padStart(2, '0'), name]))(
    'month %s is %s', (number, name) => {
      expect(formatDisclaimerDate(`2026-${number}-15`)).toBe(`${name} 15, 2026`);
    });

  it('a timestamp is read as New York time: 11:30 pm on April 1 is April 1, half past midnight on April 2 is April 2 (EDT), in winter as well (EST)', () => {
    expect(formatDisclaimerDate(new Date('2026-04-02T03:30:00Z'))).toBe('April 1, 2026');
    expect(formatDisclaimerDate(new Date('2026-04-02T04:30:00Z'))).toBe('April 2, 2026');
    expect(formatDisclaimerDate('2026-01-15T04:59:00Z')).toBe('January 14, 2026');
    expect(formatDisclaimerDate('2026-01-15T05:01:00Z')).toBe('January 15, 2026');
    expect(formatDisclaimerDate('2026-11-01T05:30:00.000Z')).toBe('November 1, 2026');               // the night the clocks go back
  });

  it.each(['', 'abc', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '26-04-02', 'yesterday', 'March 2', '03/12/2026', 'xx2026-04-02', '2026-04-02 and more'])('%j is not a date', (value) => {
    expect(() => formatDisclaimerDate(value)).toThrow(RangeError);       // only ISO 8601 is read: JavaScript's loose parser reads "March 2" as the year 2001
  });

  it('an invalid Date is not a date either', () => {
    expect(() => formatDisclaimerDate(new Date('nope'))).toThrow(RangeError);
  });
});

describe('rlsStatisticalDisclaimer', () => {
  it('a one-day period is allowed (start and end the same day)', () => {
    expect(rlsStatisticalDisclaimer('2026-06-05', '2026-06-05')).toContain('for the period June 5, 2026 through June 5, 2026.');
  });

  it('compares days, not digits: January 31 comes before February 1, and December 31 before January 1 of the next year', () => {
    expect(rlsStatisticalDisclaimer('2026-01-31', '2026-02-01')).toContain('for the period January 31, 2026 through February 1, 2026.');
    expect(rlsStatisticalDisclaimer('2025-12-31', '2026-01-01')).toContain('for the period December 31, 2025 through January 1, 2026.');
    expect(() => rlsStatisticalDisclaimer('2026-02-01', '2026-01-31')).toThrow(RangeError);
  });

  it('takes Dates and strings alike', () => {
    expect(rlsStatisticalDisclaimer(new Date('2026-01-01T12:00:00Z'), '2026-02-12')).toContain('for the period January 1, 2026 through February 12, 2026.');
  });

  it('throws, rather than print a wrong period: a start or an end that is not a date, an end before the start', () => {
    expect(() => rlsStatisticalDisclaimer('2026-02-12', '2026-01-01')).toThrow(/ends \(January 1, 2026\) before it starts \(February 12, 2026\)/);
    expect(() => rlsStatisticalDisclaimer('soon', '2026-01-01')).toThrow(/the start is not a date/);
    expect(() => rlsStatisticalDisclaimer('2026-01-01', '')).toThrow(/the end is not a date/);
    expect(() => rlsStatisticalDisclaimer(undefined as never, '2026-01-01')).toThrow(RangeError);
  });

  it('never defaults to today', () => {
    expect(() => rlsStatisticalDisclaimer(null as never, null as never)).toThrow(RangeError);
  });
});

describe('statisticalPeriod', () => {
  it('the window, when the records lie inside it', () => {
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['2026-01-15', '2026-09-30T14:00:00Z'])).toEqual({ start: '2025-10-09', end: '2026-10-09' });
  });

  it('with no records, the window itself', () => {
    expect(statisticalPeriod('2025-10-09', '2026-10-09')).toEqual({ start: '2025-10-09', end: '2026-10-09' });
    expect(statisticalPeriod('2025-10-09', '2026-10-09', [null, undefined, ''])).toEqual({ start: '2025-10-09', end: '2026-10-09' });
  });

  it('a record older than the window moves the start back to it (a curated comparable sale from two years ago)', () => {
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['2026-01-15', '2024-03-02'])).toEqual({ start: '2024-03-02', end: '2026-10-09' });
  });

  it('compares days across months: a record on September 30 is before a window that starts on October 9', () => {
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['2025-09-30'])).toEqual({ start: '2025-09-30', end: '2026-10-09' });
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['2025-10-31', '2026-09-30'])).toEqual({ start: '2025-10-09', end: '2026-10-09' });
  });

  it('a record later than the end moves the end out to it', () => {
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['2026-11-02'])).toEqual({ start: '2025-10-09', end: '2026-11-02' });
  });

  it('a record with no valid date is not counted', () => {
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['n/a', '2026-02-30', 'tbd', new Date('nope')])).toEqual({ start: '2025-10-09', end: '2026-10-09' });
  });

  it('reads New York calendar days: a sale closed at 11 pm New York time on the last day is on that day', () => {
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['2026-10-10T02:30:00Z'])).toEqual({ start: '2025-10-09', end: '2026-10-09' });
    expect(statisticalPeriod('2025-10-09', '2026-10-09', ['2026-10-10T04:30:00Z'])).toEqual({ start: '2025-10-09', end: '2026-10-10' });
  });

  it('throws when the window start or the end is not a date, and feeds the disclaimer', () => {
    expect(() => statisticalPeriod('', '2026-10-09')).toThrow(/window start/);
    expect(() => statisticalPeriod('2025-10-09', 'x')).toThrow(/the end is not a date/);
    const { start, end } = statisticalPeriod('2025-10-09', '2026-10-09', ['2024-03-02']);
    expect(rlsStatisticalDisclaimer(start, end)).toContain('for the period March 2, 2024 through October 9, 2026.');
  });
});
