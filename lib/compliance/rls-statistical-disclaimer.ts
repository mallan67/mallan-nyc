/**
 * The statistical-data disclaimer of the REBNY Listing Service (UCBA 2026, Art. VIII Sec. 4): one wording, one place.
 *
 * The text, with its two dates, is the one the repo's extraction of the UCBA gives (data/UCBA-2026-Requirements.md, "Art. VIII Sec. 4"; extracted 2026-02-08 from UCBA_Master_Copy_rev._2026__redline_.pdf):
 *
 *   "Based on information from the REBNY Listing Service for the period [date] through [date]. The REBNY Listing Service makes no representations or warranties with respect to the accuracy or
 *    completeness of such information and shall not be held liable for any omission or inaccuracy of such information thereof."
 *
 * UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED: the UCBA document itself was not supplied, so this wording is the repo extraction's, not a reading of the PDF. If the PDF differs, change
 * RLS_STATISTICAL_DISCLAIMER_TEMPLATE and the extraction together: lib/compliance/__tests__/rls-statistical-disclaimer.test.ts holds this template to the extraction file and to the rule table's template
 * (lib/compliance/rebny-field-tables.ts), which is built from it.
 *
 * The code carried more than twenty different wordings of this sentence, most of them with no dates ("for the period indicated", "for the period ending <today>") or with a second sentence that is
 * not the UCBA's. Anything that shows statistics drawn from the RLS (an average, a median, a count, a comparable-sales table) must say it with the period the statistics cover, through this module. The
 * seller pitch packet and /api/market do; the surfaces that still print their own wording (the CRM reports and CMA, the portals' market card, the building pages, ...) are listed in
 * docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md with the decision each needs (which period a snapshot of the current inventory covers).
 *
 * Dates are calendar days in New York ("MMMM d, yyyy"). A date-only string ("2026-04-02") is that day, whatever the time zone of the server; a timestamp with an offset is converted to New York time. Only
 * ISO 8601 text is read. An invalid date, or a period that ends before it starts, throws: a disclaimer with the wrong period is worse than none, and nothing here defaults to "now".
 */

export const RLS_STATISTICAL_DISCLAIMER_TEMPLATE =
  "Based on information from the REBNY Listing Service for the period [date] through [date]. " +
  "The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information " +
  "and shall not be held liable for any omission or inaccuracy of such information thereof.";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NEW_YORK = "America/New_York";

export type DisclaimerDate = Date | string;

interface Day { year: number; month: number; day: number }

function isCalendarDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 1000 || year > 9999) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  // a day or a month that overflows rolls the probe into the next month or year, so the month and the year are enough to tell
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1;
}

/**
 * The New York calendar day of a date, or null when it is not one. Only ISO 8601 text is read ("2026-04-02", "2026-04-02T14:30:00Z", "2026-04-02T14:30:00-04:00") and Date objects: JavaScript's loose
 * parser reads "March 2" as the year 2001 and "03/12/2026" by the server's own conventions, and a wrong period is worse than none. Text with a time AND an offset is an instant, converted to New York
 * time; text with only a date, or a time and no offset, names a day of the New York calendar as it stands.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function dayOf(value: DisclaimerDate | null | undefined): Day | null {
  if (value === null || value === undefined || value === "") return null;
  let instant: Date;
  if (value instanceof Date) {
    instant = value;
  } else if (typeof value === "string") {
    const m = ISO.exec(value.trim());
    if (!m) return null;
    const calendar = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
    if (!isCalendarDay(calendar.year, calendar.month, calendar.day)) return null;
    if (m[4] === undefined || m[7] === undefined) return calendar;           // a day, or a wall-clock time of the New York calendar: the day is the date part
    instant = new Date(value.trim().replace(" ", "T"));
  } else {
    return null;
  }
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: NEW_YORK, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const day = { year: pick("year"), month: pick("month"), day: pick("day") };
  return isCalendarDay(day.year, day.month, day.day) ? day : null;
}

const ordinal = (d: Day) => d.year * 10000 + d.month * 100 + d.day;
const words = (d: Day) => `${MONTHS[d.month - 1]} ${d.day}, ${d.year}`;

/** "April 2, 2026"; throws RangeError when the value is not a date. */
export function formatDisclaimerDate(value: DisclaimerDate): string {
  const day = dayOf(value);
  if (!day) throw new RangeError(`rls-statistical-disclaimer: not a date: ${String(value)}`);
  return words(day);
}

/** The disclaimer for statistics that cover start through end (both days included). Throws RangeError for a value that is not a date, or an end before the start. */
export function rlsStatisticalDisclaimer(start: DisclaimerDate, end: DisclaimerDate): string {
  const from = dayOf(start);
  const to = dayOf(end);
  if (!from) throw new RangeError(`rls-statistical-disclaimer: the start is not a date: ${String(start)}`);
  if (!to) throw new RangeError(`rls-statistical-disclaimer: the end is not a date: ${String(end)}`);
  if (ordinal(to) < ordinal(from)) throw new RangeError(`rls-statistical-disclaimer: the period ends (${words(to)}) before it starts (${words(from)})`);
  return RLS_STATISTICAL_DISCLAIMER_TEMPLATE.replace("[date]", words(from)).replace("[date]", words(to));
}

/**
 * The period for statistics drawn from dated records: from windowStart (the start of the window the records were asked for) back to the earliest record when one is older, through `through` (the day the
 * statistics were compiled) or the latest record when one is later. A record with no valid date is not counted. Throws when windowStart or through is not a date.
 */
export function statisticalPeriod(windowStart: DisclaimerDate, through: DisclaimerDate, recordDates: ReadonlyArray<DisclaimerDate | null | undefined> = []): { start: string; end: string } {
  const first = dayOf(windowStart);
  const last = dayOf(through);
  if (!first) throw new RangeError(`rls-statistical-disclaimer: the window start is not a date: ${String(windowStart)}`);
  if (!last) throw new RangeError(`rls-statistical-disclaimer: the end is not a date: ${String(through)}`);
  let start = first;
  let end = last;
  for (const value of recordDates) {
    const day = dayOf(value);
    if (!day) continue;
    if (ordinal(day) < ordinal(start)) start = day;
    if (ordinal(day) > ordinal(end)) end = day;
  }
  const iso = (d: Day) => `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}
