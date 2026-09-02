/**
 * OPEN HOUSE DATE WINDOWS, RESOLVED IN NEW YORK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN MODULE
 *
 * The broker picks "This Weekend"; the provider is asked for a date range. The
 * translation between those two is a Mallan product decision, it is
 * timezone-sensitive, and it is the part most likely to be wrong in a way
 * nobody notices — a window that is off by one day still returns results, so
 * the failure looks like inventory rather than like a bug.
 *
 * Every boundary is computed in `America/New_York`. A broker opening Search at
 * 21:00 on a Friday is at 01:00 Saturday UTC; deriving "today" from the UTC date
 * would show them Saturday and hide the open houses they can still reach
 * tonight.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PRODUCT DECISIONS, STATED RATHER THAN IMPLIED
 *
 * - "This weekend" means the COMING Saturday and Sunday, and on Saturday or
 *   Sunday it means the weekend the broker is standing in — it never rolls
 *   forward a week, which would hide today's open houses. Asked on Sunday, the
 *   window is Sunday alone: Saturday has happened.
 * - Rolling windows INCLUDE today. "Next 7 days" is today plus six.
 * - Ranges are INCLUSIVE at both ends.
 *
 * Nothing here is a provider fact. The provider facts are that the OpenHouse
 * resource accepts `OpenHouseDate ge X and OpenHouseDate le Y` and answers
 * `$count` — both probed live 2026-09-01.
 */

/**
 * A window that could not be resolved. THROWN, never returned as an empty
 * range: `from > to` matches nothing, and an empty result set would tell the
 * broker "there are no open houses" when the truth is "that request made no
 * sense". Those are different statements and only one of them is honest.
 */
export class OpenHouseWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenHouseWindowError';
  }
}

export type OpenHousePreset = 'today' | 'weekend' | 'next7' | 'next30' | 'custom';

export interface OpenHouseWindowInput {
  readonly preset: OpenHousePreset;
  /** The instant the broker asked. Injected so the behaviour is testable. */
  readonly now?: Date;
  /** Inclusive start, `YYYY-MM-DD`. Custom only. */
  readonly from?: string | null;
  /** Inclusive end, `YYYY-MM-DD`. Custom only; null means open-ended. */
  readonly to?: string | null;
}

export interface OpenHouseWindow {
  /** Inclusive start, `YYYY-MM-DD` in New York. */
  readonly from: string;
  /** Inclusive end, `YYYY-MM-DD`, or null for open-ended. */
  readonly to: string | null;
}

const NY = 'America/New_York';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar date in New York for a given instant.
 *
 * `en-CA` because it formats as `YYYY-MM-DD`, which is the shape the provider
 * filter needs — avoiding a second parse/reformat step that could itself drift.
 */
function nyDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NY,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Day of week in New York. 0 = Sunday. */
function nyWeekday(instant: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short' }).format(instant);
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  /* istanbul ignore next — Intl always returns one of the seven. */
  if (index < 0) throw new OpenHouseWindowError(`Unrecognised weekday "${name}"`);
  return index;
}

/**
 * Add whole days to a `YYYY-MM-DD` CALENDAR date.
 *
 * Done in UTC on purpose. The value is a calendar date with no time component,
 * so adding 24h in UTC always lands on the next calendar day — whereas adding
 * 86_400_000ms to a NY-local instant lands an hour short across a DST fall-back
 * and can round down to the day before.
 */
function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(t)) throw new OpenHouseWindowError(`Unparseable date "${isoDate}"`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** Reject anything that is not a real `YYYY-MM-DD`. No coercion, no guessing. */
function requireIsoDate(value: string, label: string): string {
  if (!ISO_DATE.test(value)) {
    throw new OpenHouseWindowError(`${label} must be YYYY-MM-DD, received "${value}"`);
  }
  // The regex admits 2026-13-01; round-tripping catches it.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new OpenHouseWindowError(`${label} is not a real date: "${value}"`);
  }
  return value;
}

export function resolveOpenHouseWindow(input: OpenHouseWindowInput): OpenHouseWindow {
  const now = input.now ?? new Date();
  const today = nyDate(now);

  switch (input.preset) {
    case 'today':
      return { from: today, to: today };

    case 'next7':
      // Inclusive of today: today plus six more is seven days.
      return { from: today, to: addDays(today, 6) };

    case 'next30':
      return { from: today, to: addDays(today, 29) };

    case 'weekend': {
      const dow = nyWeekday(now);
      // Sunday: the weekend is today only — Saturday is already past.
      if (dow === 0) return { from: today, to: today };
      // Saturday: the weekend the broker is standing in, through tomorrow.
      if (dow === 6) return { from: today, to: addDays(today, 1) };
      // Mon(1)..Fri(5): forward to the coming Saturday.
      const daysToSaturday = 6 - dow;
      const saturday = addDays(today, daysToSaturday);
      return { from: saturday, to: addDays(saturday, 1) };
    }

    case 'custom': {
      const from = input.from ? requireIsoDate(input.from, 'openHouseDateFrom') : null;
      const to = input.to ? requireIsoDate(input.to, 'openHouseDateTo') : null;
      if (!from && !to) {
        throw new OpenHouseWindowError('A custom open-house range needs at least one bound');
      }
      // An open-ended START would ask the provider for every open house ever
      // recorded, so the range is anchored at today rather than widened.
      const start = from ?? today;
      if (to && start > to) {
        throw new OpenHouseWindowError(
          `Open-house range starts after it ends (${start} .. ${to})`,
        );
      }
      return { from: start, to };
    }

    default:
      // An unknown preset must not degrade into "no date filter", which would
      // silently WIDEN the search to every open house in the feed.
      throw new OpenHouseWindowError(`Unknown open-house preset "${String(input.preset)}"`);
  }
}
