/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANONICAL VALUE CONTRACT
 *
 * FIELD_REGISTRY answers WHICH criteria exist, who owns each one, and whether it
 * may execute. It says nothing about what a broker's VALUE is allowed to be, and
 * that gap is where Search fails without ever throwing:
 *
 *   SILENT WIDENING — a value is dropped, its filter vanishes, and the broker
 *   receives MORE listings than they asked for on a page that looks correct.
 *   `financingMin` does exactly this today: the control is live, the collector
 *   writes the value, nothing reads it, and the result set quietly broadens.
 *
 *   SILENT REPAIR — a nonsensical value is "helpfully" corrected. A reversed
 *   range is swapped, an unrecognised enum member is filtered out, an unknown
 *   date basis falls back to a default. The broker then gets a confident,
 *   plausible answer to a question they did not ask.
 *
 * Every rule in this file REFUSES instead. A refusal is visible and
 * attributable; a wrong answer that looks right is neither. The refusal names
 * the criterion AND the offending value so an operator can act on it — Section 6
 * proves it survives to the surface.
 *
 * This is the value half of the identity/value/applicability contract. The
 * identity half is the generated key vocabulary; the applicability half is the
 * per-workflow criteria contracts built on top.
 */

/** A value that cannot be honoured as written. Never repaired, never dropped. */
export class InvalidCriterionValueError extends Error {
  readonly criterion: string;
  readonly reason: string;

  constructor(criterion: string, reason: string) {
    super(`Search criterion "${criterion}" received a value that cannot be honoured: ${reason}`);
    this.name = 'InvalidCriterionValueError';
    this.criterion = criterion;
    this.reason = reason;
  }
}

/**
 * A bounded criterion. BOTH bounds are optional — an open-ended range is a
 * legitimate search ("anything over $400k") and must not be confused with an
 * absent criterion.
 */
export interface RangeValue<T extends number | string> {
  min?: T;
  max?: T;
}

/**
 * A range plus the selector naming WHICH underlying fact it applies to.
 *
 * `activity_date` is the live example: the same from/to pair means
 * ListingContractDate or ModificationTimestamp depending on the basis, so the
 * basis is part of the value rather than a separate criterion.
 */
export interface BasisRangeValue<T extends number | string> extends RangeValue<T> {
  basis?: string;
}

/** A closed-vocabulary selection. Absence means unfiltered; `[]` means broken. */
export type SetValue = readonly string[];

/** A map-drawn boundary. Opaque here; `geography.ts` owns its interpretation. */
export interface GeoValue {
  readonly encoded: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertUsableBound(criterion: string, label: string, bound: number | string): void {
  if (typeof bound === 'number') {
    // NaN and Infinity serialize to "NaN"/"Infinity" and reach the provider as
    // garbage, which either errors far from here or matches nothing.
    if (!Number.isFinite(bound)) {
      throw new InvalidCriterionValueError(criterion, `${label} is not a finite number (${bound})`);
    }
    return;
  }
  // A locale-formatted date is the dangerous case: 03/04/2026 is either March
  // or April depending on who reads it, and the provider will pick one.
  if (!ISO_DATE.test(bound)) {
    throw new InvalidCriterionValueError(
      criterion,
      `${label} is not an ISO date (YYYY-MM-DD): "${bound}"`,
    );
  }
  const parsed = new Date(`${bound}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(bound)) {
    throw new InvalidCriterionValueError(criterion, `${label} is not a real calendar date: "${bound}"`);
  }
}

/**
 * A range must be internally coherent. An inverted range is REFUSED rather than
 * swapped: swapping answers a different question and reports success doing it.
 */
export function assertValidRange<T extends number | string>(
  criterion: string,
  value: RangeValue<T>,
): void {
  // `!= null` deliberately, not truthiness: `beds=0` (studio) and a `$0` bound
  // are real values, and `||`-style checks are what erase them.
  if (value.min != null) assertUsableBound(criterion, 'min', value.min);
  if (value.max != null) assertUsableBound(criterion, 'max', value.max);
  if (value.min != null && value.max != null && value.min > value.max) {
    throw new InvalidCriterionValueError(
      criterion,
      `min (${value.min}) is greater than max (${value.max})`,
    );
  }
}

/**
 * Every member must be in the criterion's vocabulary.
 *
 * Dropping an unrecognised member is silent widening in its purest form: the
 * broker asked for a status that does not exist and would be handed every OTHER
 * status back as though the request had been honoured.
 */
export function assertValidSet(
  criterion: string,
  value: SetValue,
  allowed: readonly string[],
): void {
  if (value.length === 0) {
    // "No filter" is the ABSENCE of the key. A key present but holding [] means
    // a selection was made and lost in transit; treating it as unfiltered
    // returns the entire universe.
    throw new InvalidCriterionValueError(
      criterion,
      'received an empty selection — omit the criterion entirely to leave it unfiltered',
    );
  }
  const unknown = value.filter((member) => !allowed.includes(member));
  if (unknown.length > 0) {
    throw new InvalidCriterionValueError(
      criterion,
      `unknown value(s) ${unknown.map((u) => `"${u}"`).join(', ')} — permitted: ${allowed.join(', ')}`,
    );
  }
}

/**
 * An OPEN-vocabulary set: a list of free values with nothing to check membership
 * against. `listing_id_canonical` is the case — a multi-ID lookup over provider
 * keys rather than a picklist.
 *
 * There is no vocabulary here, so the only lies available are an empty set and a
 * blank member. Both are refused: a blank member would render
 * `ListingId eq ''`, which matches nothing and makes the whole disjunction
 * quietly narrower than the broker asked for.
 */
export function assertValidTextSet(criterion: string, value: SetValue): void {
  if (value.length === 0) {
    throw new InvalidCriterionValueError(
      criterion,
      'received an empty selection — omit the criterion entirely to leave it unfiltered',
    );
  }
  const blank = value.filter((member) => typeof member !== 'string' || member.trim() === '');
  if (blank.length > 0) {
    throw new InvalidCriterionValueError(
      criterion,
      `received ${blank.length} blank or non-string member(s)`,
    );
  }
}

/**
 * An unrecognised basis is REFUSED; an ABSENT one lets the criterion apply its
 * declared default.
 *
 * This is the `dateType=ListedAndUpdated` defect promoted out of the executor
 * into the contract. The old read was `params.get("dateType") || "Listed"`, so
 * an unrecognised basis silently answered the Listed question instead.
 */
export function assertValidBasis(
  criterion: string,
  basis: string | undefined,
  allowed: readonly string[],
): void {
  if (basis == null || basis === '') return;
  if (!allowed.includes(basis)) {
    throw new InvalidCriterionValueError(
      criterion,
      `unknown basis "${basis}" — permitted: ${allowed.join(', ')}`,
    );
  }
}
