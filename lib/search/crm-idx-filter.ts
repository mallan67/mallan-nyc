import { FIELD_REGISTRY } from "@/lib/search/canonical/field-registry";
import { isMallanLocalIdentifier } from "@/lib/listings/mallan-source-identity";
import { maxBathsOData, minBathsOData } from "@/lib/search/canonical/bath-contract";
import { DEFAULT_MARKET_STATUS_TOKENS, standardStatusOData } from "@/lib/search/canonical/status-token-contract";
import { boroughOData, neighborhoodOData } from "@/lib/search/canonical/geography";
import { checkboxFieldOData, isRegisteredCheckboxField, isProviderSuppressedField } from "@/lib/search/canonical/checkbox-criteria";
import { propertyTypeUniverseOData } from "@/lib/search/canonical/property-type-universe";
import { COMMON_INTEREST_MEMBERS } from "@/lib/search/canonical/live-truth";

import {
  parsePropertySubTypeCriterion,
  propertySubTypeOData,
} from "@/lib/search/canonical/property-subtype-contract";

/**
 * The live CommonInterest vocabulary, from its ONE owner.
 *
 * This file previously carried a private 13-member `COMMON_INTEREST` Set of its own —
 * the same members live-truth.ts already held, read from data/cotality-enums.live.json.
 * Identical copies are not harmless: whichever one someone updates when the provider
 * vocabulary changes, the other keeps validating broker input against the old list.
 * A Set because membership is what this file asks; the owner holds the ordered list.
 */
const COMMON_INTEREST: ReadonlySet<string> = new Set(COMMON_INTEREST_MEMBERS);

/**
 * A broker criterion that Mallan cannot currently express using the verified
 * live Cotality contract. It is a request error, never a reason to drop the
 * criterion or substitute a different provider field.
 */
/**
 * The date activity types this route can actually ask the provider about.
 *
 *   Listed   ListingContractDate ge / le
 *   Updated  ModificationTimestamp gt / le
 *
 * Adding a member here without adding the clause that answers it recreates the
 * exact collapse this set exists to prevent.
 */
const EXECUTABLE_DATE_TYPES: ReadonlySet<string> = new Set(
  FIELD_REGISTRY.find((f) => f.canonicalKey === 'activity_date')?.valueBasis ?? [],
);

export class UnsupportedSearchCriterionError extends Error {
  readonly criterion: string;
  readonly unsupportedValues: readonly string[];

  constructor(criterion: string, unsupportedValues: readonly string[] = []) {
    super(
      `Unsupported search criterion '${criterion}'` +
        (unsupportedValues.length ? `: ${unsupportedValues.join(", ")}` : "") +
        ". Mallan will not silently drop it or substitute another Cotality field.",
    );
    this.name = "UnsupportedSearchCriterionError";
    this.criterion = criterion;
    this.unsupportedValues = unsupportedValues;
  }
}

/**
 * Retained only for old callers while geography is being re-contracted.
 * It no longer reads any legacy provider alias file. The authenticated provider
 * path must use only live Cotality facts.
 */
export function expandCrmIdxNeighborhood(canonical: string): string[] {
  return [canonical];
}

export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function stripStreetSuffix(value: string): string {
  return value
    .replace(/\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|COURT|CT|WAY|TERRACE|TER|CIRCLE|CIR|PARKWAY|PKWY|PLAZA)\s*$/i, "")
    .trim();
}

/**
 * The smallest value that can be a REAL measurement of each field.
 *
 * ZERO IS JUDGED PER FIELD AND NEVER GLOBALLY. `BedroomsTotal` 0 is a STUDIO —
 * a correct zero on 88,158 live rows that a broker means to find — while
 * `LivingArea` 0 is a dwelling with no floor area, which is not a thing. A
 * blanket "drop the zeros" rule would delete studios from Search, which is a
 * worse defect than the one it set out to fix. So `BedroomsTotal` is absent
 * here on purpose, and its live negative count is zero.
 *
 * This is the three-state rule — null unknown, 0 a real zero, positive an
 * amount — applied where the provider encodes unknown as an in-band value
 * instead of null. `NumberOfUnitsTotal` proves the case: it is NEVER null live
 * (0 rows), and instead carries 0 on 267,543 rows and -1 on 229.
 *
 * Values measured against live Cotality 2026-08-31; evidence in
 * artifacts/section5f-sentinel-leak-2026-08-31.json.
 */
const REAL_MINIMUM: Readonly<Record<string, number>> = {
  ListPrice: 1,
  RoomsTotal: 1,
  LivingArea: 1,
  YearBuilt: 1,
  StoriesTotal: 1,
  NumberOfUnitsTotal: 1,
};

function finiteNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}


function renderExactEnum(field: string, raw: string, allowed: ReadonlySet<string>, criterion: string): string {
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const bad = values.filter((v) => !allowed.has(v));
  if (bad.length) throw new UnsupportedSearchCriterionError(criterion, bad);
  const clauses = [...new Set(values)].map((v) => `${field} eq '${escapeOData(v)}'`);
  if (clauses.length === 0) return "";
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" or ")})`;
}

export function buildCrmIdxODataFilter(params: URLSearchParams): string {
  const parts: string[] = [];

  // Sale/Rental is a Mallan business universe rendered from the exact Cotality
  // PropertyType members by one canonical contract.
  const type = params.get("type");
  if (type === "sale") parts.push(propertyTypeUniverseOData("sale"));
  else if (type === "rent" || type === "rental") parts.push(propertyTypeUniverseOData("rental"));

  const numeric: Array<[string, string, "ge" | "le", boolean]> = [
    ["minPrice", "ListPrice", "ge", false],
    ["maxPrice", "ListPrice", "le", false],
    ["minBeds", "BedroomsTotal", "ge", true],
    ["maxBeds", "BedroomsTotal", "le", true],
    // minBaths / maxBaths are NOT in this table. See below — bathrooms have a
    // canonical mapping owner, and a generic `field op value` cannot express it.
    ["minRooms", "RoomsTotal", "ge", false],
    ["maxRooms", "RoomsTotal", "le", false],
    ["minSqft", "LivingArea", "ge", false],
    ["maxSqft", "LivingArea", "le", false],
    ["minYear", "YearBuilt", "ge", false],
    ["maxYear", "YearBuilt", "le", false],
    ["minFloors", "StoriesTotal", "ge", false],
    ["maxFloors", "StoriesTotal", "le", false],
    ["minUnits", "NumberOfUnitsTotal", "ge", false],
    ["maxUnits", "NumberOfUnitsTotal", "le", false],
  ];
  for (const [param, field, op, allowZero] of numeric) {
    const raw = param === "minBeds" ? (params.get(param) ?? params.get("beds")) : params.get(param);
    const value = finiteNumber(raw);
    if (value === null) continue;
    if (!(allowZero ? value >= 0 : value > 0)) continue;

    // A MAX BOUND MUST NOT ADMIT VALUES THAT CANNOT BE A REAL MEASUREMENT.
    //
    // `le` admits everything BELOW the range, and several of these fields encode
    // "not specified" as an in-band number rather than null. Measured live
    // 2026-08-31:
    //
    //   LivingArea le 500          168,549 rows, 151,463 of them (89.9%) area
    //                              0 or negative — a max-square-feet search is
    //                              almost entirely listings of unknown size
    //   NumberOfUnitsTotal le 10   348,063 rows, 267,772 (76.9%) not-a-count,
    //                              including 229 at exactly -1
    //   StoriesTotal le 10         309,926 rows, 64,384 (20.8%) zero storeys
    //
    // The broker asked for "at most N". A row whose value is unknown is not
    // known to be at most N, so returning it is a WRONG ANSWER — and one that
    // looks exactly like a correct one, since nothing on the page says the size
    // is unknown. Fail closed by bounding the low end at the smallest real value.
    //
    // The min side needs no such guard: `LivingArea ge 800` already cannot admit
    // a 0 or -1 row, so a floor there would be noise.
    const floor = op === "le" ? REAL_MINIMUM[field] : undefined;
    if (floor !== undefined && floor > 0) {
      parts.push(`(${field} le ${value} and ${field} ge ${floor})`);
      continue;
    }
    parts.push(`${field} ${op} ${value}`);
  }

  // ── BATHROOMS: ONE EXECUTION OWNER ──────────────────────────────────────
  //
  // This used to sit in the numeric table above as
  // `BathroomsTotalInteger ge/le <value>` — a field `bath-contract.ts` had
  // ALREADY REJECTED on an exhaustive 8,103-row live read. Two engines therefore
  // answered the same bath question differently: the Prisma engine used the
  // contract, this path used a field the contract rejects, and nothing forced
  // them to agree.
  //
  // Why the field is rejected:
  //
  //   It is Edm.Int32, so it cannot represent 1.5. `BathroomsTotalInteger ge 1.5`
  //   is not even strictly numeric for that type — a test previously locked that
  //   expression in, its own comment conceding the problem.
  //
  //   It disagrees with its own components on ~1% of rows. RLS20105072 reports
  //   full=2, half=1 and TotalInteger=0 — a two-and-a-half-bath apartment the
  //   integer field says has none.
  //
  //   Half-baths become unexpressible, though `BathroomsHalf` is non-zero on
  //   2,023 Active rows. A broker searching 1.5+ baths silently loses them.
  //
  // The contract renders an exact disjunction over `BathroomsFull` and
  // `BathroomsHalf`, both live-verified, and it is now the ONLY owner of this
  // mapping on both engines.
  const minBaths = finiteNumber(params.get("minBaths"));
  if (minBaths !== null && minBaths > 0) parts.push(minBathsOData(minBaths));
  const maxBaths = finiteNumber(params.get("maxBaths"));
  if (maxBaths !== null && maxBaths > 0) parts.push(maxBathsOData(maxBaths));

  // GEOGRAPHY — released from hold 2026-08-26 against live evidence.
  //
  // The hold existed because the equivalence between Cotality's several
  // geography facts and the Mallan concepts was unproven. It is now proven:
  // CityRegion is filterable with a closed five-member vocabulary covering
  // 591,293 of 591,303 rows, and SubdivisionName is filterable and 100%
  // populated on sampled active rows. See lib/search/canonical/geography.ts for
  // the probe record, including the `StatenIsland` spelling trap.
  //
  // Both still FAIL CLOSED on a value with no live counterpart: a dropped
  // geographic criterion widens the search while returning HTTP 200.
  // REPEATED PARAMETERS, NOT A COMMA-SEPARATED STRING.
  //
  // This read one `neighborhood` param and split it on commas, while the browser
  // joined the selection with commas. That silently corrupts any provider value
  // containing a comma, and the accepted Cotality vocabulary carries two:
  // `Williamsburg,North` and `Williamsburg,South`. Selecting one arrived here as
  // the two names `Williamsburg` and `North`, so the broker's criterion was
  // changed before the authority ever saw it — and the executor then answered a
  // question nobody asked.
  //
  // `getAll` takes each value exactly as sent. Provider data is never transport
  // syntax, and no name is reshaped to make the wire easier.
  const neighborhoods = params.getAll("neighborhood").map((v) => v.trim()).filter(Boolean);
  if (neighborhoods.length > 0) {
    const clause = neighborhoodOData(neighborhoods);
    if (clause) parts.push(clause);
  }
  const borough = params.get("borough");
  if (borough) {
    // Comma-separated so a multi-borough selection becomes one disjunction.
    // It previously could not be expressed at all, so the browser dropped it
    // and silently answered all of NYC.
    const clause = boroughOData(borough.split(",").map((v) => v.trim()).filter(Boolean));
    if (clause) parts.push(clause);
  }

  const status = params.get("status");
  if (status === "*") {
    // Explicit all-status request.
  } else if (status) {
    const { filter } = standardStatusOData(status.split(","));
    if (filter) parts.push(filter);
  } else {
    // The default on-market universe is the OWNER's business rule, not a literal
    // built here. Rendered through the same function an explicit status uses, so the
    // two cannot drift apart about what counts as on-market.
    const { filter } = standardStatusOData([...DEFAULT_MARKET_STATUS_TOKENS]);
    if (filter) parts.push(filter);
  }

  const address = params.get("address");
  if (address) {
    const raw = address.trim().toUpperCase();
    const dirPattern = /^(\d+)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
    const numOnlyPattern = /^(\d+)\s+(.*)/;
    const dirMatch = raw.match(dirPattern);

    if (dirMatch) {
      const streetNum = dirMatch[1];
      const direction = dirMatch[2].charAt(0);
      const rawStreet = stripStreetSuffix(dirMatch[3]);
      const streetPart = rawStreet.replace(/(ST|ND|RD|TH)\b/gi, "").trim();
      const streetPartFull = escapeOData(rawStreet);
      const conditions = [`StreetNumber eq '${streetNum}'`, `StreetDirPrefix eq '${direction}'`];
      if (streetPart && streetPart !== streetPartFull) {
        conditions.push(`(contains(StreetName,'${escapeOData(streetPart)}') or contains(StreetName,'${streetPartFull}'))`);
      } else if (streetPart) {
        conditions.push(`contains(StreetName,'${escapeOData(streetPart)}')`);
      }
      parts.push(`(${conditions.join(" and ")})`);
    } else {
      const numMatch = raw.match(numOnlyPattern);
      if (numMatch?.[1]) {
        const streetNum = numMatch[1];
        const streetPart = stripStreetSuffix(numMatch[2] || "");
        if (streetPart) {
          const stripped = streetPart.replace(/(ST|ND|RD|TH)\b/gi, "").trim();
          const nameFilters = [`contains(StreetName,'${escapeOData(streetPart)}')`];
          if (stripped !== streetPart) nameFilters.push(`contains(StreetName,'${escapeOData(stripped)}')`);
          parts.push(`(StreetNumber eq '${streetNum}' and (${nameFilters.join(" or ")}))`);
        } else {
          parts.push(`(StreetNumber eq '${streetNum}' or contains(BuildingName,'${escapeOData(raw)}'))`);
        }
      } else if (/^\d+$/.test(raw)) {
        parts.push(`(StreetNumber eq '${escapeOData(raw)}' or contains(BuildingName,'${escapeOData(raw)}'))`);
      } else {
        const cleaned = stripStreetSuffix(raw);
        parts.push(`(contains(StreetName,'${escapeOData(cleaned || raw)}') or contains(BuildingName,'${escapeOData(raw)}'))`);
      }
    }
  }

  const zip = params.get("zip");
  if (zip) parts.push(`PostalCode eq '${escapeOData(zip)}'`);

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  // Two values are executable because two are all this route can emit. The read
  // used to be `params.get("dateType") || "Listed"` feeding a lone `=== "Updated"`
  // ternary, so every OTHER string — a typo, a stale saved record, a value from
  // an older form revision — silently became "Listed" and produced a perfectly
  // valid-looking ListingContractDate clause for a question nobody asked.
  //
  // ABSENT is a different state from UNRECOGNISED and keeps its documented
  // default: the browser only emits dateFrom once an activity type is chosen, so
  // absence means a non-browser caller. An unrecognised value fails by name.
  const rawDateType = params.get("dateType");
  if (rawDateType && !EXECUTABLE_DATE_TYPES.has(rawDateType) && (dateFrom || dateTo)) {
    throw new UnsupportedSearchCriterionError("dateType", [rawDateType]);
  }
  const dateType = rawDateType || "Listed";
  if (dateFrom) {
    const field = dateType === "Updated" ? "ModificationTimestamp" : "ListingContractDate";
    const op = dateType === "Updated" ? "gt" : "ge";
    const val = dateType === "Updated" ? `${dateFrom}T00:00:00Z` : dateFrom;
    parts.push(`${field} ${op} ${val}`);
  }
  if (dateTo) {
    const field = dateType === "Updated" ? "ModificationTimestamp" : "ListingContractDate";
    const val = dateType === "Updated" ? `${dateTo}T23:59:59Z` : dateTo;
    parts.push(`${field} le ${val}`);
  }

  const closeDateFrom = params.get("closeDateFrom");
  const closeDateTo = params.get("closeDateTo");
  if (closeDateFrom) parts.push(`CloseDate ge ${closeDateFrom}`);
  if (closeDateTo) parts.push(`CloseDate le ${closeDateTo}`);

  const contractDateFrom = params.get("contractDateFrom");
  const contractDateTo = params.get("contractDateTo");
  if (contractDateFrom) parts.push(`ListingContractDate ge ${contractDateFrom}`);
  if (contractDateTo) parts.push(`ListingContractDate le ${contractDateTo}`);

  const unit = params.get("unit");
  // CASE-INSENSITIVE ON PURPOSE. Matching is case-exact live, and the stored
  // values are not uniform: UnitNumber eq '3E' returns 2,403 rows and
  // UnitNumber eq '3e' returns 16 more. Uppercasing the input and comparing
  // exactly reached the 2,403 and could never reach the 16, whichever case the
  // broker typed. toupper() is supported and returns exactly the union (2,419),
  // measured 2026-08-31 rather than assumed.
  if (unit) parts.push(`toupper(UnitNumber) eq '${escapeOData(unit.toUpperCase())}'`);

  // KEYWORD IS REFUSED: the provider never ANSWERS this query.
  //
  // Probed 2026-08-31 five times — with and without $count, at top=1, and
  // narrowed to a single ZIP — and every attempt aborted with NO HTTP status.
  // Cotality did not reject it; it never replied. contains() itself is fine:
  // the identical shape on BuildingName returns a row immediately, so this is
  // PublicRemarks specifically.
  //
  // UNVERIFIED IS NOT UNSUPPORTED, so the registry keeps needs_probe rather than
  // asserting a provider refusal nobody observed. But a query that never returns
  // must not be sent. This clause only avoided hanging searches because the
  // serializer assigns `keyword` and api-client.js never forwards it — it was one
  // transport fix away from stalling every search that used it, with nothing here
  // to say so. Refusing by name makes the reason visible to whoever repairs the
  // transport.
  const keyword = params.get("keyword");
  if (keyword) throw new UnsupportedSearchCriterionError("keyword", [keyword]);

  const buildingName = params.get("buildingName");
  if (buildingName) parts.push(`contains(BuildingName,'${escapeOData(buildingName)}')`);

  // Cotality does not declare a ManagementCompany Property field. Listing office
  // is a different fact and must never be substituted for management company.
  const managementCompany = params.get("managementCompany");
  if (managementCompany) throw new UnsupportedSearchCriterionError("managementCompany", [managementCompany]);

  // Maximum financing: REFUSED BY NAME, not ignored.
  //
  // The value is real and densely populated — the 2026-08-21 census found it on
  // 6,803 of 8,010 Active records — but it lives inside
  // `CustomProperty.CustomFields`, a declared Edm.String that `$filter` cannot
  // reach into. So no provider clause is possible, and the registry records
  // `executionStrategy: 'mallan_projection_filter'`: the answer has to be
  // computed Mallan-side over the COMPLETE candidate universe before count and
  // pagination, which is Section 6 work and does not exist yet.
  //
  // Until it does, either bound fails loudly. Accepting the parameter and
  // returning HTTP 200 would hand the broker a result set WIDER than the one
  // they asked for, with nothing on the page saying so — the silent widening
  // this whole boundary exists to prevent. Both bounds are named so a min-only
  // or max-only request is refused just as clearly as both.
  const financingMin = params.get("financingMin");
  const financingMax = params.get("financingMax");
  if (financingMin || financingMax) {
    throw new UnsupportedSearchCriterionError(
      "financing",
      [financingMin, financingMax].filter((v): v is string => !!v),
    );
  }

  const subType = params.get("propertySubType");
  if (subType) {
    const rendered = propertySubTypeOData(parsePropertySubTypeCriterion(subType));
    if (rendered) parts.push(rendered);
  }

  const ownership = params.get("ownership");
  if (ownership) {
    const rendered = renderExactEnum("CommonInterest", ownership, COMMON_INTEREST, "ownership");
    if (rendered) parts.push(rendered);
  }

  // The old generic checkbox engine silently dropped unknown controls and sent
  // Cotality multi-enums through scalar `eq`. Both are unsafe. Until each exact
  // field/operator/value contract is promoted, retain only simple booleans that
  // are declared directly on live Property; reject every other requested box.
  const cbRaw = params.get("checkboxFilters");
  if (cbRaw) {
    let cbFilters: Record<string, string[]>;
    try {
      cbFilters = JSON.parse(cbRaw) as Record<string, string[]>;
    } catch {
      throw new UnsupportedSearchCriterionError("checkboxFilters", ["invalid JSON"]);
    }

    // ONE registry owns every checkbox criterion — multi-enum AND boolean.
    //
    // This previously kept its own `booleanFields` set plus a `NewConstruction`
    // alias, while the persistence layer kept a SECOND boolean map of its own.
    // Two mappings for one business criterion is precisely the translation-table
    // drift this workstream exists to remove, so the tables are now one table,
    // in lib/search/canonical/checkbox-criteria.ts, and each registry entry
    // carries its own `kind` (multi_enum | boolean).
    //
    // Registered OR provider-suppressed both go through the registry: a
    // suppressed field must report WHY the licence forbids filtering it, which
    // is a different fact from "we have not mapped this".
    for (const [htmlField, values] of Object.entries(cbFilters)) {
      if (!Array.isArray(values) || values.length === 0) continue;

      if (isRegisteredCheckboxField(htmlField) || isProviderSuppressedField(htmlField)) {
        const clause = checkboxFieldOData(htmlField, values);
        if (clause) parts.push(clause);
        continue;
      }

      throw new UnsupportedSearchCriterionError(`checkboxFilters.${htmlField}`, values.map(String));
    }
  }

  // Coordinates are map support, not a canonical Search axis. Do not accept a
  // raw caller-supplied coordinate predicate as a provider criterion.
  const gridFilter = params.get("gridFilter");
  if (gridFilter) throw new UnsupportedSearchCriterionError("gridFilter", [gridFilter]);

  // ── LISTING ID IS DUAL-DOMAIN ────────────────────────────────────────────
  //
  // The canonical reference carries EITHER a Cotality `ListingId` OR a
  // Mallan-generated `SL-`/`RL-` identifier. This sent every value to Cotality as
  // `ListingId eq` with no domain check, so searching a Mallan listing by
  // Mallan's own identifier queried a provider that has never heard of it and
  // returned nothing — an empty result set that looks exactly like "no such
  // listing" rather than "you asked the wrong system".
  //
  // A Mallan-domain identifier is REFUSED BY NAME here rather than sent. Routing
  // it to the Mallan-local store is a real capability and a genuinely different
  // execution path; until that path exists, an honest refusal beats a confident
  // empty answer. The domain test itself belongs to `mallan-source-identity.ts`,
  // which owns what a Mallan identifier IS — this file only asks.
  const listingId = params.get("listingId");
  if (listingId) {
    const ids = listingId.split(",").map((s) => s.trim()).filter(Boolean);
    const mallanDomain = ids.filter((id) => isMallanLocalIdentifier(id));
    if (mallanDomain.length) {
      throw new UnsupportedSearchCriterionError("listingId", mallanDomain);
    }
    const clauses = ids.map((id) => `ListingId eq '${escapeOData(id)}'`);
    if (clauses.length === 1) parts.push(clauses[0]);
    else if (clauses.length > 1) parts.push(`(${clauses.join(" or ")})`);
  }

  // LISTINGKEY IS A DIFFERENT PROVIDER FIELD FROM LISTINGID, AND THE SEARCH ROW
  // ID IS THE FORMER.
  //
  // Cotality declares both, separately. `crm-idx-mapper.ts:217` maps
  // `id: listingKey`, and keeps ListingId beside it as `lid` /
  // `providerListingId`. Their value spaces do not overlap — a live pair reads
  // ListingKey "1189389648" against ListingId "RLS20112214" — so a Search row id
  // sent through the `listingId` criterion above matches nothing.
  //
  // That is not hypothetical. Probed live 2026-09-01:
  //
  //   $filter=ListingKey eq '1189389648'                          -> count 1
  //   $filter=(ListingKey eq '1189389648' or ListingKey eq '...') -> count 2
  //   $filter=ListingId  eq '1189389648'                          -> count 0
  //
  // The third is what a caller gets for sending Search ids to the wrong
  // criterion: an empty result and no error. Equality and OR-chaining on
  // ListingKey are SUPPORTED — measured, not assumed from $metadata, which
  // proves existence and type only.
  //
  // A Mallan-local identifier is refused by name rather than translated: an
  // `SL-`/`RL-` listing has no provider key, and sending one here would ask
  // Cotality about a listing it does not have.
  const listingKey = params.get("listingKey");
  if (listingKey) {
    const keys = listingKey.split(",").map((s) => s.trim()).filter(Boolean);
    const mallanDomain = keys.filter((k) => isMallanLocalIdentifier(k));
    if (mallanDomain.length) {
      throw new UnsupportedSearchCriterionError("listingKey", mallanDomain);
    }
    const clauses = keys.map((k) => `ListingKey eq '${escapeOData(k)}'`);
    if (clauses.length === 1) parts.push(clauses[0]);
    else if (clauses.length > 1) parts.push(`(${clauses.join(" or ")})`);
  }

  return parts.join(" and ");
}
