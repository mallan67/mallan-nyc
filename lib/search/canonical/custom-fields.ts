/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE PARSER FOR CustomProperty.CustomFields.
 *
 * Cotality declares `CustomProperty.CustomFields` as a nullable Edm.String. The
 * string carries a JSON object whose KEYS are observations, not metadata fields:
 * `MaximumFinancingPercent` and `SponsorUnitYN` are keys INSIDE that payload, and
 * neither is a top-level Cotality field. Anything that treats one as a Property
 * field is describing a schema that does not exist.
 *
 * Because `$filter` cannot reach inside an Edm.String, these facts are retrieved
 * and then filtered MALLAN-SIDE — which is why the registry records
 * `executionStrategy: 'mallan_projection_filter'` for financing rather than
 * pretending a provider clause is possible.
 *
 * ONE parser, here, because the alternative is several: the mapper already
 * hand-parsed this string for `SponsorUnitYN`, and adding a second reader in the
 * UI or a third in the projection is how one payload acquires three
 * interpretations that can disagree about the same listing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LIVE EVIDENCE (exhaustive census, 2026-08-21, all 8,010 Active records)
 *
 *   present            6,803 / 8,010   84.9%
 *   StockCooperative   2,497 / 2,507   99.6%
 *   Condominium        3,615 / 3,720   97.0%
 *   Condop               139 /   147   94.6%
 *
 * Co-op values cluster at 80 / 75 / 50 / 90 / 70 / 65; condominiums concentrate
 * heavily at 90. This is a real, densely populated brokerage fact — not a field
 * to discard because it is absent from `$metadata`.
 */

/** A financing observation on ONE listing. */
export type FinancingObservation =
  /** A stated maximum financing percentage. */
  | { readonly kind: 'stated'; readonly percent: number }
  /** The key is absent, unparseable, or the not-specified sentinel. */
  | { readonly kind: 'not_specified'; readonly reason: string };

export const NOT_SPECIFIED = (reason: string): FinancingObservation => ({
  kind: 'not_specified',
  reason,
});

/** The decoded payload. Absent keys are `undefined`, never invented. */
export interface CustomFieldsFacts {
  readonly maximumFinancingPercent: FinancingObservation;
  readonly sponsorUnit: boolean | null;
}

function decode(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The maximum-financing observation for one listing.
 *
 * 0.00 IS NOT ZERO PERCENT. The census found the value behaves as a
 * NOT-SPECIFIED sentinel — 93% of RentalBuilding records carrying the key report
 * 0.00 — so reading it literally would tell a broker that a building permits no
 * financing at all. That is a materially wrong answer about a real building, and
 * it would silently exclude every co-op an agent was looking for.
 */
export function readMaximumFinancingPercent(customFieldsRaw: unknown): FinancingObservation {
  const parsed = decode(customFieldsRaw);
  if (!parsed) return NOT_SPECIFIED('CustomFields absent or unparseable');

  const raw = parsed.MaximumFinancingPercent;
  if (raw == null || raw === '') return NOT_SPECIFIED('key absent');

  const percent = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(percent)) return NOT_SPECIFIED(`unparseable value ${JSON.stringify(raw)}`);

  if (percent === 0) return NOT_SPECIFIED('0.00 is the provider not-specified sentinel, not 0%');
  if (percent < 0 || percent > 100) {
    return NOT_SPECIFIED(`out of range: ${percent}`);
  }
  return { kind: 'stated', percent };
}

/** Sponsor-unit flag, read from the same payload rather than a second parse. */
export function readSponsorUnit(customFieldsRaw: unknown): boolean | null {
  const parsed = decode(customFieldsRaw);
  if (!parsed) return null;
  const v = parsed.SponsorUnitYN;
  // The payload's OBSERVED forms include the STRINGS "1" and "0" (live census).
  // The reader this replaced accepted numeric 1/0, "true"/"false" and "Yes"/"No"
  // but not those — so a sponsor unit reported as "1" read as null, and the
  // criterion silently found nothing. Carried over verbatim, this new parser
  // reproduced a defect the census had already identified.
  if (v === true || v === 'true' || v === 'Yes' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 'No' || v === 0 || v === '0') return false;
  return null;
}

export function readCustomFields(customFieldsRaw: unknown): CustomFieldsFacts {
  return {
    maximumFinancingPercent: readMaximumFinancingPercent(customFieldsRaw),
    sponsorUnit: readSponsorUnit(customFieldsRaw),
  };
}

/**
 * What a BUILDING's financing limit is, given every listing observed in it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROVIDER SENDS A LISTING FACT; THE BROKER ASKS A BUILDING QUESTION.
 *
 * The census found 380 of 3,402 buildings — 11% — whose own listings report
 * DIFFERENT values: `{90, 75, 25}`, `{50, 60}`. Taking whichever listing happens
 * to come back first would manufacture a building fact out of an arbitrary row,
 * and a broker would then filter buildings on a number no one stated about the
 * building.
 *
 * So disagreement is a RESULT, not something to average away or silently
 * resolve. `unresolved` carries the competing values so the answer can be shown
 * as what it is.
 */
export type BuildingFinancing =
  | { readonly kind: 'stated'; readonly percent: number }
  | { readonly kind: 'not_specified' }
  | { readonly kind: 'unresolved'; readonly observed: readonly number[] };

export function reconcileBuildingFinancing(
  observations: readonly FinancingObservation[],
): BuildingFinancing {
  const stated = observations
    .filter((o): o is { kind: 'stated'; percent: number } => o.kind === 'stated')
    .map((o) => o.percent);

  const distinct = [...new Set(stated)].sort((a, b) => a - b);
  if (distinct.length === 0) return { kind: 'not_specified' };
  if (distinct.length === 1) return { kind: 'stated', percent: distinct[0] };
  return { kind: 'unresolved', observed: distinct };
}

/**
 * Does a building satisfy a broker's minimum-financing criterion?
 *
 * Fail-closed on both unknowns. A building whose limit is not stated, or whose
 * listings disagree, is NOT returned for "financing at least 80%" — including it
 * would assert a limit nobody stated, and the whole point of the criterion is
 * that the buyer needs the financing.
 */
export function satisfiesMinimumFinancing(
  building: BuildingFinancing,
  requiredMinimumPercent: number,
): boolean {
  return building.kind === 'stated' && building.percent >= requiredMinimumPercent;
}
