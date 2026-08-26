/**
 * THE CANONICAL GEOGRAPHY CONTRACT — Borough and Neighborhood, one meaning.
 *
 * Geography was held (48978094) because the equivalence between Cotality's
 * several geography facts and the Mallan concepts was unproven, and the old
 * alias files were not provider authority. That hold was correct, and deleting
 * the criteria would not have been: borough and neighborhood are the two most
 * used narrowing controls in NYC brokerage. A difficult criterion gets proven,
 * not removed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LIVE API ACTUALLY CONTAINS (probed api.cotality.com 2026-08-26)
 *
 * `CityRegion` — Edm.String(150), nullable, FILTERABLE (not suppressed the way
 * `MlsStatus` is). Complete vocabulary and population on this connection:
 *
 *     Manhattan     397,769
 *     Brooklyn      151,392
 *     Queens         32,927
 *     Bronx           8,424
 *     StatenIsland      781
 *
 * Sum 591,293 of 591,303 Property rows. The other 10 carry a NULL CityRegion
 * and match neither a positive nor a negative filter (OData three-valued
 * logic), so a borough criterion correctly excludes them — an unknown borough
 * is not a borough.
 *
 * `SubdivisionName` — Edm.String(150), nullable, FILTERABLE. 2,000 sampled
 * active rows were 100% populated across 178 distinct values; e.g.
 * `SubdivisionName eq 'Murray Hill'` returns 13,432 rows.
 *
 * `MLSAreaMajor` / `MLSAreaMinor` — null on every sampled row. NOT USED.
 * `CountyOrParish` — a COUNTY (New York / Kings / Queens / Bronx / Richmond).
 * It is NOT a borough and is never substituted for one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPELLING TRAP THIS FILE EXISTS TO CLOSE
 *
 * The provider spells it `StatenIsland`. Every Mallan surface — the borough
 * table in search-engine.js, the autocomplete list, the polygon properties —
 * spells it `Staten Island`. Passing the human spelling through produces a
 * syntactically valid filter that matches ZERO rows under HTTP 200: an entire
 * borough silently missing with nothing to indicate it. That is the same shape
 * as `PENDING` -> `ActiveUnderContract`, which is why the mapping is explicit
 * and tested rather than assumed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEIGHBORHOOD USES THE EXISTING MALLAN ALIAS INFRASTRUCTURE
 *
 * No new geography authority is introduced. `data/rls/geo/neighborhood-aliases.json`
 * (593 aliases onto 72 canonical polygon names, byte-identical to the browser
 * copy at public/geo/) is reversed here so a canonical selection expands to
 * EVERY provider spelling Mallan knows for it. Sending only the canonical name
 * would return a silently short universe.
 *
 * A value the alias file does not know is passed through as an exact
 * SubdivisionName match. That is not an invented equivalence — it is the
 * provider's own field matched literally, and the live feed carries names the
 * alias file has not caught up with (e.g. Hudson Yards, Two Bridges, Yorkville).
 */
import aliasData from "@/data/rls/geo/neighborhood-aliases.json";
import { escapeOData } from "@/lib/search/crm-idx-filter";

/** The five live `CityRegion` values, in PROVIDER spelling. */
export const CITY_REGION_MEMBERS = [
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Bronx",
  "StatenIsland",
] as const;

export type CityRegionMember = (typeof CITY_REGION_MEMBERS)[number];

/** A geography criterion carried a value with no live provider counterpart. */
export class UnsupportedGeographyError extends Error {
  readonly criterion: string;
  readonly unsupportedValues: readonly string[];

  constructor(criterion: string, unsupportedValues: readonly string[]) {
    super(
      `Unsupported ${criterion} criterion: ${unsupportedValues.map((v) => `'${v}'`).join(", ")}. ` +
        `Not a live Cotality value. The criterion is rejected rather than dropped — dropping it ` +
        `would remove the geographic narrowing and answer a broader question under HTTP 200.`,
    );
    this.name = "UnsupportedGeographyError";
    this.criterion = criterion;
    this.unsupportedValues = unsupportedValues;
  }
}

/** Compare loosely enough to survive spacing, case and punctuation drift. */
function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

const CITY_REGION_BY_FOLD = new Map<string, CityRegionMember>(
  CITY_REGION_MEMBERS.map((m) => [fold(m), m]),
);
// "The Bronx" is the one spelling that does not fold onto its member.
CITY_REGION_BY_FOLD.set(fold("The Bronx"), "Bronx");

/**
 * The live `CityRegion` value a Mallan borough label means, or null.
 *
 * Folding is deliberately generous on FORM (case, spaces, punctuation) and
 * strictly closed on IDENTITY: "Staten Island", "StatenIsland" and
 * "staten island" are the same borough; "Hoboken" is not a borough at all.
 */
export function boroughToCityRegion(value: unknown): CityRegionMember | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return CITY_REGION_BY_FOLD.get(fold(trimmed)) ?? null;
}

/**
 * The OData predicate for a set of borough labels, or null if none supplied.
 *
 * THROWS on any unknown value. A dropped borough widens the search to all of
 * NYC while still returning 200 — the failure mode the multi-borough branch
 * used to produce by emitting no geography param at all.
 */
export function boroughOData(values: readonly unknown[]): string | null {
  const members: CityRegionMember[] = [];
  const unsupported: string[] = [];

  for (const value of values) {
    const member = boroughToCityRegion(value);
    if (member === null) {
      unsupported.push(String(value));
      continue;
    }
    if (!members.includes(member)) members.push(member);
  }

  if (unsupported.length > 0) throw new UnsupportedGeographyError("borough", unsupported);
  if (members.length === 0) return null;

  return members.length === 1
    ? `CityRegion eq '${members[0]}'`
    : `(${members.map((m) => `CityRegion eq '${m}'`).join(" or ")})`;
}

/** canonical polygon name -> every provider spelling Mallan knows for it. */
const VARIANTS_BY_CANONICAL: ReadonlyMap<string, readonly string[]> = (() => {
  const raw = (aliasData as { aliases?: Record<string, unknown> }).aliases ?? {};
  const byCanonical = new Map<string, string[]>();

  for (const [variant, target] of Object.entries(raw)) {
    // A null target means "distinct place, no polygon" — it is still a real
    // provider spelling, so it stays searchable as itself.
    const canonicals = Array.isArray(target) ? target : target ? [target] : [];
    for (const canonical of canonicals) {
      const key = fold(String(canonical));
      const list = byCanonical.get(key) ?? [];
      if (!list.includes(String(canonical))) list.push(String(canonical));
      if (!list.includes(variant)) list.push(variant);
      byCanonical.set(key, list);
    }
  }
  return byCanonical;
})();

/**
 * Every provider spelling to search for a selected neighborhood.
 *
 * A known canonical expands to itself plus its variants. An unknown value is
 * matched literally — the live feed carries names the alias file has not caught
 * up with, and refusing them would remove real inventory from reach.
 */
export function neighborhoodVariants(value: string): readonly string[] {
  return VARIANTS_BY_CANONICAL.get(fold(value)) ?? [value];
}

/**
 * The OData predicate for a set of neighborhood selections, or null if none.
 *
 * Always parenthesised when it contains more than one term so it cannot bind
 * loosely against the surrounding ` and ` joins.
 */
export function neighborhoodOData(values: readonly unknown[]): string | null {
  const spellings: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    for (const spelling of neighborhoodVariants(trimmed)) {
      if (!spellings.includes(spelling)) spellings.push(spelling);
    }
  }

  if (spellings.length === 0) return null;

  const terms = spellings.map((s) => `SubdivisionName eq '${escapeOData(s)}'`);
  return terms.length === 1 ? `(${terms[0]})` : `(${terms.join(" or ")})`;
}
