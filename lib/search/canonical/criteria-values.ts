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
 * How a criterion's INPUT is structured.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT THE FACT'S DATA TYPE, AND THE TWO MUST NOT BE MERGED.
 *
 * The first version of this contract derived the input shape from the registry's
 * `type`, which forced `type` to be rewritten to describe SEARCH cardinality:
 * `listing_id_canonical` became `array` purely because the Search box accepts
 * several IDs at once. That is false about the fact. One listing has exactly ONE
 * canonical identifier — a scalar reference, dual-domain, never a list.
 *
 * `FieldSpec.type` answers "what kind of fact is this on a listing".
 * `FieldSpec.criterionValueShape` answers "what may a broker type into this
 * control". A multi-select over a scalar fact is completely ordinary, and
 * collapsing the two makes the registry lie about the domain in order to
 * describe a UI.
 */
export type CriterionValueShape =
  | 'range_number'
  | 'range_date'
  | 'basis_range_date'
  /** A closed vocabulary owned by a named module; unknown members are refused. */
  | 'enum_set'
  /** A structured field -> values selection across several feature families. */
  | 'feature_map'
  /** An open list — no vocabulary to check membership against. */
  | 'text_set'
  | 'text'
  | 'boolean'
  | 'geo';

/**
 * A bounded criterion. Either bound may be omitted — an open-ended range is a
 * legitimate search ("anything over $400k") — but a range with NEITHER bound is
 * refused, because a present-and-empty value means a bound was lost in transit
 * and an unbounded range silently widens the result set.
 */
export interface RangeValue<T extends number | string> {
  min?: T;
  max?: T;
}

/**
 * A range plus the selector naming WHICH underlying fact it applies to.
 *
 * `activity_date` is the live example: the same from/to pair means
 * ListingContractDate or ModificationTimestamp depending on the basis.
 *
 * `basis` is REQUIRED. A canonical criteria object that stores a date range
 * without saying which date it means is ambiguous, and a Saved Search that
 * persists that ambiguity re-answers a different question every time the default
 * changes. A legacy boundary adapter may resolve a missing wire value into an
 * explicit basis on the way in; what it must never do is store the absence.
 */
export interface BasisRangeValue<T extends number | string> extends RangeValue<T> {
  basis: string;
}

/** A closed-vocabulary selection. Absence means unfiltered; `[]` means broken. */
export type SetValue = readonly string[];

/** A map-drawn boundary. Opaque here; `geography.ts` owns its interpretation. */
export interface GeoValue {
  readonly encoded: string;
}

/**
 * A selection across feature FAMILIES: which family, and which of its values.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NESTED, NOT FLAT.
 *
 * This was generated as a flat `SetValue` — `['City', 'InUnit', 'Furnished']` —
 * which throws away the family each value belongs to. That is not a cosmetic
 * loss: `checkbox-criteria.ts` does not own one vocabulary, it owns eighteen
 * separate families, each with its own Cotality field, its own scalar/multi
 * kind, its own allowed members and its own UNRESOLVED members. A flat array
 * cannot say whether `Common` meant `laundry` (where it is unresolved between
 * CommonArea and CommonOnFloor) or something else entirely.
 *
 * The saved-search normalizer already models this correctly as field -> values,
 * so flattening here would also have put the canonical object out of step with
 * the persistence boundary it is supposed to feed.
 */
export type FeatureSelection = Readonly<Record<string, readonly string[]>>;

/**
 * The family owner, injected rather than imported.
 *
 * `criteria-values.ts` is a LEAF — importing `checkbox-criteria.ts` would make
 * it a consumer of one specific owner and invite a
 * `switch (vocabularyOwner) { case 'checkbox-criteria': ... }` in the validator,
 * which is just translation table number ten. The validator ASKS the owner; it
 * never interprets the owner's name.
 */
export interface FeatureFamilyAuthority {
  /** Is this family selectable here, or does it have a first-class identity? */
  isOfferable(family: string): boolean;
  /** Does the owner accept these values for this family? */
  validate(family: string, values: readonly string[]): { ok: boolean; reason?: string };
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
  // A present-but-empty range is refused for exactly the reason a present-but-
  // empty SET is: absence of the key means unfiltered, so a key that IS present
  // holding nothing means a bound was lost on the way in. Letting `{}` through
  // turns a price filter into no price filter and widens the result set on a
  // page that still shows the control as active.
  if (value.min == null && value.max == null) {
    throw new InvalidCriterionValueError(
      criterion,
      'received a range with neither bound — omit the criterion entirely to leave it unfiltered',
    );
  }
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
  // REQUIRED, not defaulted. A canonical criteria object that stores a date
  // range without saying which date it means is ambiguous, and a Saved Search
  // persisting that ambiguity silently re-answers a different question whenever
  // the default changes. A legacy boundary adapter may resolve a missing wire
  // value into an explicit basis on the way in — it must not store the absence.
  if (basis == null || basis === '') {
    throw new InvalidCriterionValueError(
      criterion,
      `requires an explicit basis (${allowed.join(' | ')}) — a range with no basis is ambiguous`,
    );
  }
  if (!allowed.includes(basis)) {
    throw new InvalidCriterionValueError(
      criterion,
      `unknown basis "${basis}" — permitted: ${allowed.join(', ')}`,
    );
  }
}

/**
 * A scalar text criterion. Blank is refused rather than left for a later layer
 * to trim, omit or query.
 *
 * `street_address: ""` reaching the executor either renders a predicate that
 * matches nothing or is dropped and widens the search, depending on which layer
 * notices first — and which layer notices is not something the contract should
 * leave open.
 */
export function assertValidText(criterion: string, value: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidCriterionValueError(
      criterion,
      'received a blank value — omit the criterion entirely to leave it unfiltered',
    );
  }
}

/**
 * A structured feature selection, validated family by family THROUGH ITS OWNER.
 *
 * Refuses a family that carries a first-class identity elsewhere. `pets` and
 * `furnished` are top-level Rental criteria, so a request holding BOTH
 * `pets` and `feature_criteria.pet_policy` would ask one business question twice
 * with no rule saying which half wins.
 */
export function assertValidFeatureSelection(
  criterion: string,
  value: FeatureSelection,
  authority: FeatureFamilyAuthority,
): void {
  const families = Object.keys(value);
  if (families.length === 0) {
    throw new InvalidCriterionValueError(
      criterion,
      'received an empty feature selection — omit the criterion entirely to leave it unfiltered',
    );
  }
  for (const family of families) {
    if (!authority.isOfferable(family)) {
      throw new InvalidCriterionValueError(
        criterion,
        `"${family}" is not selectable here — it is a first-class criterion, and offering it in ` +
          `both places would let one request ask the same question twice`,
      );
    }
    const values = value[family];
    if (!Array.isArray(values) || values.length === 0) {
      throw new InvalidCriterionValueError(
        criterion,
        `family "${family}" has no values — omit the family to leave it unfiltered`,
      );
    }
    const verdict = authority.validate(family, values);
    if (!verdict.ok) {
      throw new InvalidCriterionValueError(
        criterion,
        `family "${family}": ${verdict.reason ?? 'rejected by its vocabulary owner'}`,
      );
    }
  }
}

/** A map-drawn boundary. An empty encoding is a lost shape, not "no boundary". */
export function assertValidGeo(criterion: string, value: GeoValue): void {
  if (typeof value?.encoded !== 'string' || value.encoded.trim() === '') {
    throw new InvalidCriterionValueError(
      criterion,
      'received an empty boundary — omit the criterion entirely to leave it unfiltered',
    );
  }
}
