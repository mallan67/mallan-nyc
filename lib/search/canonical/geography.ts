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
 * NEIGHBORHOOD USES THE PROVIDER'S OWN VOCABULARY — CORRECTED 2026-08-31
 *
 * This section used to read: "No new geography authority is introduced.
 * `data/rls/geo/neighborhood-aliases.json` (593 aliases onto 72 canonical polygon
 * names) is reversed here so a canonical selection expands to EVERY provider
 * spelling Mallan knows for it. Sending only the canonical name would return a
 * silently short universe."
 *
 * The reasoning was sound and the premise was false, which is the most dangerous
 * combination. That file maps provider names onto POLYGON SHAPES for map
 * rendering — a grouping, not an identity — so the expansion did not add
 * spellings of one neighbourhood, it added OTHER NEIGHBOURHOODS. Williamsburg
 * returned Bushwick and Ridgewood; Prospect Heights returned Stuyvesant Heights.
 * Guarding against a short universe produced a silently wide one.
 *
 * The vocabulary now comes from the feed itself — see LIVE_BY_FOLDED below for
 * the measurements. The alias file keeps its real job, polygons and map
 * rendering, and is no longer consulted for provider execution.
 */
import { identitiesFor, identityFor, spellingsFor } from "@/lib/search/canonical/subdivision-vocabulary.generated";
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

/**
 * Live SubdivisionName values, grouped by their case-folded form.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ALIAS REVERSAL THIS REPLACED, AND WHY IT WAS NOT MERELY UNPROVEN
 *
 * This module used to expand a selection through
 * `data/rls/geo/neighborhood-aliases.json`, whose own `_meta` reads "Maps RLS
 * SubdivisionName variants", generatedAt 2026-03-19 — five months before the
 * geography probe. Old RLS evidence was defining current provider truth, which
 * inverts the architecture: COTALITY RAW -> VERIFIED MAPPING -> MALLAN CANONICAL.
 *
 * Measured live 2026-08-31, it was also WRONG. That file maps provider names onto
 * 72 POLYGON SHAPES for map rendering — a grouping, not an identity — so
 * reversing it merged distinct neighbourhoods:
 *
 *   Williamsburg       191 rows literal -> 331 expanded, adding Bushwick (109)
 *                      and Ridgewood (16), which is in QUEENS
 *   Downtown Brooklyn   88 -> 431, adding Flatbush, Bay Ridge and Midwood
 *   Prospect Heights    19 -> 149, adding Stuyvesant Heights (67), in Bed-Stuy
 *   Bayside              2 ->  92, adding Jamaica (36)
 *
 * A broker selecting Williamsburg received Bushwick and Ridgewood listings under
 * HTTP 200 with nothing on the page to say so. A SHORT universe is a visible
 * problem; a silently WIDE one is answered confidently and wrongly.
 *
 * 437 of the 593 alias spellings matched nothing in the ON-MARKET slice that first census read.
 *
 * CORRECTED 2026-08-31: that census covered 7,741 rows of 591,409, and the
 * conclusion drawn from it — that Gramercy, Stuyvesant Town and Union Square
 * were absent from the feed — was false. Read across every row and every status
 * they are real (930, 14 and 654 rows), and refusing them broke Closed/comps
 * searches. The vocabulary now comes from the whole feed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT REPLACES IT
 *
 * The provider's own vocabulary, read exhaustively from the live Search universe
 * and generated into `subdivision-vocabulary.generated.ts`. Resolution is
 * case-insensitive against that list, which keeps the ONE part of the old
 * expansion that was real — SoHo / Soho / SOHO are one neighbourhood spelled
 * three ways (48 + 6 + 1 rows) — while adding no adjacency. Every emitted term is
 * a value the feed carries: identity, never an asserted equivalence.
 *
 * The alias file remains valid for polygons and map rendering. It is no longer
 * consulted for provider execution, and this module no longer imports it.
 */

/**
 * Every LIVE provider spelling for a selected neighborhood.
 *
 * Empty when the feed carries no such name — which the caller must treat as a
 * refusal, not as an empty filter.
 */
export function neighborhoodVariants(value: string): readonly string[] {
  return spellingsFor(value);
}

/**
 * The borough LABEL a broker reads for a provider CityRegion value.
 *
 * The provider spells it `StatenIsland`; every Mallan surface says
 * `Staten Island`. Sending the human spelling produces a valid filter matching
 * zero rows, so the two must never be the same string — this converts one way
 * only, for display.
 */
export function boroughLabel(providerValue: unknown): string {
  if (typeof providerValue !== "string") return "";
  const trimmed = providerValue.trim();
  return trimmed === "StatenIsland" ? "Staten Island" : trimmed;
}

/**
 * The OData predicate for a set of neighborhood selections, or null if none.
 *
 * THROWS on a name the live feed does not carry. Three canonical names —
 * `Gramercy`, `Stuyvesant Town` and `Union Square` — expanded entirely to
 * spellings the feed does not have, so selecting one produced a syntactically
 * valid filter matching zero rows under HTTP 200: indistinguishable from "no
 * listings match your criteria", while `Gramercy Park` sat in the feed with real
 * inventory and no way to reach it. A criterion that can only ever match zero
 * rows must fail loudly, exactly as an unknown borough or status token does.
 *
 * Always parenthesised so it cannot bind loosely against the surrounding
 * ` and ` joins.
 */
export function neighborhoodOData(values: readonly unknown[]): string | null {
  const groups: string[] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];
  const ambiguous: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;

    const identity = identityFor(trimmed);
    if (!identity) {
      // A name the feed carries in more than one borough resolves to nothing
      // without a borough, and must be reported as AMBIGUOUS rather than as
      // unknown — those are different problems with different fixes.
      (identitiesFor(trimmed).length > 1 ? ambiguous : unknown).push(trimmed);
      continue;
    }
    if (seen.has(identity.label)) continue;
    seen.add(identity.label);

    // THE BOROUGH IS PART OF THE PREDICATE, NOT JUST THE LABEL.
    //
    // This emitted `SubdivisionName eq '…'` alone while the census had already
    // disproved global name uniqueness — 124 of 632 folded names span more than
    // one CityRegion — so the executor searched as though a name identified a
    // place when the evidence said it did not.
    //
    // Scoping by CityRegion does two things: it keeps `Bay Terrace, Queens` and
    // `Bay Terrace, Staten Island` apart, and it enforces Mallan's dominant-borough
    // decision, so the 586 rows tagged `Downtown Brooklyn` in Manhattan — provider
    // error, since there is no Downtown Brooklyn in Manhattan — stop arriving in a
    // Brooklyn search.
    const spellingTerms = identity.spellings
      .map((s) => `SubdivisionName eq '${escapeOData(s)}'`)
      .join(" or ");
    groups.push(
      `(CityRegion eq '${escapeOData(identity.borough)}' and ` +
        (identity.spellings.length === 1 ? spellingTerms : `(${spellingTerms})`) +
        `)`,
    );
  }

  if (unknown.length > 0) throw new UnsupportedGeographyError("neighborhood", unknown);
  if (ambiguous.length > 0) throw new UnsupportedGeographyError("neighborhood", ambiguous);
  if (groups.length === 0) return null;

  return groups.length === 1 ? groups[0] : `(${groups.join(" or ")})`;
}
