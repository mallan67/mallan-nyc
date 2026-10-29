import live from "@/data/cotality-enums.live.json";
import { resolveBorough, resolveNeighborhoods, type GeoInventory } from "@/lib/idx/geography";

/**
 * The single Cotality mapping layer for CRM Agent Search (Master §0.2 MAPPER, §5.0, §5.5).
 *
 * Every criterion resolves against the LIVE contract in data/cotality-enums.live.json
 * (`search`, regenerated from the live API by `npm run cotality:pull`), with separate
 * SALE (PropertyType 'Residential') and RENTAL (PropertyType 'ResidentialLease') facts:
 *
 *   SUPPORTED    filterable and carried on that side → a Cotality $filter clause with the
 *                operator its live type requires (`has` for multi-select, `eq` for picklists,
 *                ge/le for numbers and dates) and only live LookupValues;
 *   LOCAL        Cotality refuses the filter but returns the data — REBNY CustomProperty
 *                .CustomFields keys, NOT_FILTERABLE fields that $select returns, and derived
 *                criteria → Mallan applies it after retrieval (applyLocalCriteria);
 *   UNAVAILABLE  not carried, suppressed, or not a live value → refused visibly. A criterion is
 *                never dropped, broadened or narrowed silently.
 */

export type SearchSide = "sale" | "rental";
type FieldKind = "string" | "boolean" | "number" | "date" | "timestamp" | "enum" | "multi" | "unknown";
type CustomKind = "boolean01" | "number" | "timestamp" | "list" | "string";
type Op = "eq" | "ne" | "ge" | "le" | "gt" | "lt";

interface PropertyFieldFacts {
  type: string;
  kind: FieldKind;
  lookup?: string;
  filter: "SUPPORTED" | "SUPPRESSED" | "NOT_FILTERABLE" | "UNVERIFIED";
  sale?: number | string;
  rental?: number | string;
  sampled?: Partial<Record<SearchSide, number>>;
  select?: "REJECTED";
}
interface CustomFieldFacts { kind: CustomKind; sale?: number; rental?: number }
interface ResourceFieldFacts {
  type: string;
  kind: FieldKind;
  filter: PropertyFieldFacts["filter"];
  total?: number;
  sale?: number;
  rental?: number;
  sampled?: number;
}
export interface LiveSearchContract {
  pulled_at: string;
  types: Record<SearchSide, string>;
  property: Record<string, PropertyFieldFacts>;
  custom_fields: { keys: Record<string, CustomFieldFacts> };
  lookups: Record<string, Record<string, string>>;
  /** Mallan's own office as Cotality names it (resolved live by the pull). */
  mallan_office?: { ListOfficeName: string; ListOfficeMlsId: string } | null;
  /** LookupValues whose provider label contains a Fair Housing prohibited term — never criteria. */
  fair_housing_excluded?: Record<string, string[]>;
  /** Every other DataSystem resource: access and per-field filter verdict / record counts. */
  resources?: Record<string, { access: string; fields: Record<string, ResourceFieldFacts> }>;
}

const LIVE = live as unknown as { enums: Record<string, string[]>; search: LiveSearchContract };
export const SEARCH_CONTRACT: LiveSearchContract = LIVE.search;

export interface RefusedCriterion { criterion: string; field?: string; reason: string }
export interface LocalCriterion {
  criterion: string;
  field: string;
  /** property: test gets record[field]; customFields: the parsed REBNY key; record: the whole record. */
  source: "property" | "customFields" | "record";
  test: (value: unknown) => boolean;
  /**
   * A "record" test that also reads the REBNY CustomFields block (e.g. TotalMonthly reads
   * TaxMonthlyAmount): the route must keep the CustomProperty expand on the rows it scans, or the
   * test sees no tax and lets condos over the monthlies cap through (found 2026-10-27).
   */
  needsCustomFields?: boolean;
  /**
   * An OR group of fields (one checkbox group) that mixes Property fields with REBNY keys: the
   * members, so the route can execute the Property members in Cotality and the REBNY members
   * through CustomProperty keys instead of scanning. `test` already evaluates the whole group.
   */
  members?: GroupMember[];
}
export interface GroupMember {
  field: string;
  source: "property" | "customFields";
  /** Cotality clause for a Property member executed by Cotality; "" otherwise. */
  clause: string;
  execution: "cotality" | "local";
  /** property: gets record[field]; customFields: the parsed REBNY key. */
  test: (value: unknown) => boolean;
}
export interface CrmIdxQuery {
  sides: SearchSide[];
  filter: string;
  /** Criteria Mallan applies after retrieval because Cotality refuses to filter on them. */
  local: LocalCriterion[];
  /** Property fields the local criteria read, beyond the route's base $select. */
  select: string[];
  refused: RefusedCriterion[];
  /** Criteria on resources linked to Property, resolved to keys by the route (two steps). */
  joins: JoinCriterion[];
  /** Live StandardStatus values this search wants ([] = every status). */
  statuses: string[];
}

/** Criteria on one linked resource, AND-ed so they hold on the same open house / room / agent / office. */
export interface JoinCriterion {
  criterion: string;
  resource: string;
  /** OData filter against the resource. */
  filter: string;
  /** Field read from the matching resource rows. */
  key: string;
  /** Property fields a matching key may sit in (any of them). */
  propertyFields: string[];
  /**
   * CustomProperty columns only: when the matching keys are too many for one request, the same
   * criteria are applied exactly by Mallan to these expanded columns of each scanned listing.
   */
  fallback?: { expand: string[]; criterion: LocalCriterion };
}

// Resources searched through their link to Property. Cotality rejects lambda filters on Property's
// navigation properties (HTTP 400 "Field named 'OpenHouseDate' not in metadata", live 2026-10-24) but
// accepts `ListingKey in (...)`, so Mallan reads the keys from the resource, then searches Property.
export const JOIN_RESOURCES: Record<string, { key: string; propertyFields: string[] }> = {
  OpenHouse: { key: "ListingKey", propertyFields: ["ListingKey"] },
  PropertyRooms: { key: "ListingKey", propertyFields: ["ListingKey"] },
  CustomProperty: { key: "ListingKey", propertyFields: ["ListingKey"] },
  Member: { key: "MemberMlsId", propertyFields: ["ListAgentMlsId", "CoListAgentMlsId", "CoListAgent2MlsId", "CoListAgent3MlsId"] },
  Office: { key: "OfficeMlsId", propertyFields: ["ListOfficeMlsId", "CoListOfficeMlsId", "CoListOffice2MlsId"] },
};

// Protected-class proxies are never search criteria, whatever field carries them (Fair Housing;
// NYC HRL national origin / citizenship / immigration status).
const FAIR_HOUSING_REFUSED = /diplomat/i;
// On market and in contract. Live 2026-10-23 the licence delivers in-contract listings as
// 'Pending' (4,803 sales) and none as 'ActiveUnderContract'; both are included.
const DEFAULT_STATUSES = ["Active", "ComingSoon", "ActiveUnderContract", "Pending"];

// Old-system sub-statuses (MlsStatus, suppressed by Cotality) that live Property fields express.
// Live 2026-10-24: Active + BackOnMarketTimestamp 1,036 sale / 48 rental; Closed with Mallan as buyer
// office 1 sale / 5 rental; BuyerFinancing on 189 closed sales. The buyer office is carried on 8 of
// 4,802 Pending sales, so the in-contract "Thru Us" sub-statuses have no live equivalent.
const thruUs = (office: string) => `(BuyerOfficeMlsId eq '${office}' or CoBuyerOfficeMlsId eq '${office}')`;
export const SUB_STATUSES: Record<string, { status: string; fields: string[]; clause: (office: string) => string | null }> = {
  BackOnMarket: { status: "Active", fields: ["BackOnMarketTimestamp"], clause: () => "BackOnMarketTimestamp ne null" },
  Sold: { status: "Closed", fields: [], clause: () => null },
  Rented: { status: "Closed", fields: [], clause: () => null },
  SoldThruUs: { status: "Closed", fields: ["BuyerOfficeMlsId"], clause: thruUs },
  RentedThruUs: { status: "Closed", fields: ["BuyerOfficeMlsId"], clause: thruUs },
  NoFinancing: { status: "Closed", fields: ["BuyerFinancing"], clause: () => "BuyerFinancing has 'Cash'" },
  Financed: { status: "Closed", fields: ["BuyerFinancing"], clause: () => "(BuyerFinancing ne null and not (BuyerFinancing has 'Cash'))" },
  Future: { status: "Incomplete", fields: [], clause: () => null },
};

export function searchSides(type: string | null): SearchSide[] {
  if (type === "sale") return ["sale"];
  if (type === "rent" || type === "rental") return ["rental"];
  return ["sale", "rental"];
}

const n = (v: unknown) => (typeof v === "number" ? v : 0);

/** True when live Cotality records of this side carry the field (filter count or $select sample). */
export function carriedOn(field: string, side: SearchSide): boolean {
  const f = SEARCH_CONTRACT.property[field];
  return !!f && (n(f[side]) > 0 || n(f.sampled?.[side]) > 0);
}

export function customFieldCarriedOn(key: string, side: SearchSide): boolean {
  return n(SEARCH_CONTRACT.custom_fields.keys[key]?.[side]) > 0;
}

// ── Agent / office search (Agent Search of 2026-10-15, carried into the live-contract filter) ──
// The primary side (ListAgent*, ListOffice*) and the co-list side (CoListAgent{,2,3}*, CoListOffice{,2}*)
// are separate filters and are never merged; "anyAgent" is a convenience that spans both and does not
// replace either. Every id/name field below filters without error on live Cotality Property (verified
// 2026-10-06). A token of digits is an exact MLS ID; anything else is a name match (every word must
// appear, case-insensitive).
const AGENT_PRIMARY_IDS = ["ListAgentMlsId"];
const AGENT_PRIMARY_NAMES = ["ListAgentFullName"];
const AGENT_COLIST_IDS = ["CoListAgentMlsId", "CoListAgent2MlsId", "CoListAgent3MlsId"];
const AGENT_COLIST_NAMES = ["CoListAgentFullName", "CoListAgent2FullName", "CoListAgent3FullName"];

export const CRM_AGENT_OFFICE_FILTERS: Record<string, { ids: string[]; names: string[] }> = {
  listAgent: { ids: AGENT_PRIMARY_IDS, names: AGENT_PRIMARY_NAMES },
  coListAgent: { ids: AGENT_COLIST_IDS, names: AGENT_COLIST_NAMES },
  anyAgent: { ids: [...AGENT_PRIMARY_IDS, ...AGENT_COLIST_IDS], names: [...AGENT_PRIMARY_NAMES, ...AGENT_COLIST_NAMES] },
  listOffice: { ids: ["ListOfficeMlsId"], names: ["ListOfficeName"] },
  coListOffice: { ids: ["CoListOfficeMlsId", "CoListOffice2MlsId"], names: ["CoListOfficeName", "CoListOffice2Name"] },
};

const AGENT_OFFICE_MAX_TOKENS = 5;
const AGENT_OFFICE_MAX_WORDS = 4;

function joinOr(terms: string[]): string {
  return terms.length === 1 ? terms[0] : `(${terms.join(" or ")})`;
}

function agentOfficeClause(spec: { ids: string[]; names: string[] }, token: string): string {
  if (/^\d{1,12}$/.test(token)) {
    return joinOr(spec.ids.map((field) => `${field} eq '${token}'`));
  }
  const words = token.split(/\s+/).filter(Boolean).slice(0, AGENT_OFFICE_MAX_WORDS);
  return joinOr(
    spec.names.map((field) => {
      const matches = words.map((word) => `contains(${field},'${escapeOData(word)}')`);
      return matches.length === 1 ? matches[0] : `(${matches.join(" and ")})`;
    }),
  );
}

export function buildAgentOfficeFilterParts(params: URLSearchParams): string[] {
  const parts: string[] = [];
  for (const [param, spec] of Object.entries(CRM_AGENT_OFFICE_FILTERS)) {
    const tokens = (params.get(param) || "")
      .split(",")
      .map((token) => token.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, AGENT_OFFICE_MAX_TOKENS);
    const clauses = tokens.map((token) => agentOfficeClause(spec, token));
    if (clauses.length === 1) parts.push(clauses[0]);
    else if (clauses.length > 1) parts.push(`(${clauses.join(" or ")})`);
  }
  return parts;
}

export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function stripStreetSuffix(value: string): string {
  return value
    .replace(/\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|COURT|CT|WAY|TERRACE|TER|CIRCLE|CIR|PARKWAY|PKWY|PLAZA)\s*$/i, "")
    .trim();
}

// ── Value parsing: the form sends picklist values, "Any", or operator-prefixed values (lte:1946) ──

type ParsedValue = { op: Op; value: string } | { present: true } | { absent: true };
// "not:" comes from the form's "does not allow" boxes (data-not).
const OP_ALIASES: Record<string, Op> = { eq: "eq", ne: "ne", not: "ne", ge: "ge", gte: "ge", le: "le", lte: "le", gt: "gt", lt: "lt" };
// "Any" on a picklist means a real value: live PoolFeatures is mostly BuildingNone (verified
// 2026-10-23: 11,034 sale records carry PoolFeatures, 1,331 once None/BuildingNone are excluded).
const NONE_VALUES = ["None", "BuildingNone"];

// "isnull" = the field has no value (e.g. Exclude back-on-market); "within:N" = on or after N days ago;
// "next:N" = on or before N days from now (open houses).
function parseValue(raw: string): ParsedValue {
  const v = raw.trim();
  if (/^(any|notnull)$/i.test(v)) return { present: true };
  if (/^(isnull|null)$/i.test(v)) return { absent: true };
  const within = /^within:(\d+)$/i.exec(v);
  if (within) return { op: "ge", value: new Date(Date.now() - Number(within[1]) * 86_400_000).toISOString().slice(0, 10) };
  const next = /^next:(\d+)$/i.exec(v);
  if (next) return { op: "le", value: new Date(Date.now() + Number(next[1]) * 86_400_000).toISOString().slice(0, 10) };
  const m = /^([a-z]+):(.*)$/i.exec(v);
  if (m && OP_ALIASES[m[1].toLowerCase()]) return { op: OP_ALIASES[m[1].toLowerCase()], value: m[2].trim() };
  return { op: "eq", value: v };
}

function toBool(v: string): boolean | null {
  if (/^(true|yes|1|y)$/i.test(v)) return true;
  if (/^(false|no|0|n)$/i.test(v)) return false;
  return null;
}

const isPresent = (v: unknown) => v !== null && v !== undefined && v !== "";
const tokens = (v: unknown) => (isPresent(v) ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);
const hasRealValue = (v: unknown) => tokens(v).some((t) => !NONE_VALUES.includes(t));

function compare(actual: number, op: Op, expected: number): boolean {
  switch (op) {
    case "eq": return actual === expected;
    case "ne": return actual !== expected;
    case "ge": return actual >= expected;
    case "le": return actual <= expected;
    case "gt": return actual > expected;
    case "lt": return actual < expected;
  }
}

// OData literal for a comparison; null when the value does not fit the field's live type.
function literal(kind: FieldKind, op: Op, value: string): string | null {
  switch (kind) {
    case "number": return /^-?\d+(\.\d+)?$/.test(value) ? value : null;
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    case "timestamp":
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T${op === "le" || op === "gt" ? "23:59:59" : "00:00:00"}Z`;
      return /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) ? value : null;
    default: return null;
  }
}

function comparable(kind: FieldKind | CustomKind, v: unknown): number {
  if (kind === "date" || kind === "timestamp") return Date.parse(String(v).length === 10 ? `${v}T00:00:00Z` : String(v));
  return Number(v);
}

const orGroup = (clauses: string[]) => (clauses.length === 1 ? clauses[0] : `(${clauses.join(" or ")})`);
const andGroup = (clauses: string[]) => (clauses.length === 1 ? clauses[0] : `(${clauses.join(" and ")})`);
// Legacy input aliases, mapped to the live Cotality enumeration members (live $metadata, 2026-10-06). Saved searches written before
// the cutover stored the non-live ListingAgreement value "CoExclusive" (live: CoExclusiveAgency) and DirectionFaces / Exposures as
// N/S/E/W/NE/NW/SE/SW (live: North … Southwest). Cotality answers HTTP 400 to any other string.
const LEGACY_DIRECTION_FACES: Record<string, string> = {
  N: "North", S: "South", E: "East", W: "West", NE: "Northeast", NW: "Northwest", SE: "Southeast", SW: "Southwest",
};
export function legacyCriterionValue(field: string, value: string): string {
  if (field === "ListingAgreement" && value === "CoExclusive") return "CoExclusiveAgency";
  if ((field === "DirectionFaces" || field === "Exposures") && LEGACY_DIRECTION_FACES[value]) return LEGACY_DIRECTION_FACES[value];
  return value;
}

const normalizeValues = (values: unknown) =>
  (Array.isArray(values) ? values : [values]).flatMap((v) => String(v).split(",")).map((s) => s.trim()).filter(Boolean);

interface Predicate { clause: string; test: (value: unknown) => boolean; exclude: boolean }
interface FieldExpression { clause: string; test: (value: unknown) => boolean; execution: "cotality" | "local" }

/**
 * @param geo the live Cotality geography inventory (lib/idx/geography.ts). Neighborhood and
 *   borough criteria resolve to exact live values through it; without it (unit tests) the typed
 *   values are sent as given.
 */
export function buildCrmIdxQuery(params: URLSearchParams, geo: GeoInventory | null = null): CrmIdxQuery {
  const sides = searchSides(params.get("type"));
  const statusParam = params.get("status");
  const wantedStatuses: string[] | null = statusParam === "*" ? null
    : statusParam ? statusParam.split(",").map((v) => v.trim().replace(/\s+/g, "")).filter(Boolean) : DEFAULT_STATUSES;
  const sideLabel = sides.length === 1 ? sides[0] : "sale or rental";
  const parts: string[] = [];
  const local: LocalCriterion[] = [];
  const select = new Set<string>();
  const refused: RefusedCriterion[] = [];
  const refuse = (criterion: string, field: string | undefined, reason: string) => refused.push({ criterion, field, reason });

  // Resolve a Property field for this search, or record why it cannot be searched.
  function resolve(criterion: string, field: string): PropertyFieldFacts | null {
    const f = SEARCH_CONTRACT.property[field];
    if (!f) { refuse(criterion, field, `${field} is not a Cotality Property field`); return null; }
    if (f.filter === "SUPPRESSED") { refuse(criterion, field, `Cotality suppresses ${field}`); return null; }
    if (!sides.some((s) => carriedOn(field, s))) { refuse(criterion, field, `No ${sideLabel} records in Cotality carry ${field}`); return null; }
    return f;
  }

  // Cotality executes filterable fields; Mallan executes fields only $select returns.
  function executionOf(criterion: string, field: string, f: PropertyFieldFacts): "cotality" | "local" | null {
    if (f.filter === "SUPPORTED") return "cotality";
    if (f.select !== "REJECTED" && sides.some((s) => n(f.sampled?.[s]) > 0)) return "local";
    refuse(criterion, field, `Cotality neither filters nor returns ${field}`);
    return null;
  }

  // One predicate for one parsed value against a Property field's live type; null = invalid value.
  function predicate(criterion: string, field: string, f: PropertyFieldFacts, pv: ParsedValue): Predicate | null {
    if ("absent" in pv) return { clause: `${field} eq null`, test: (v) => !isPresent(v), exclude: false };
    if ("present" in pv) {
      const nones = (f.kind === "enum" || f.kind === "multi") ? NONE_VALUES.filter((v) => (LIVE.enums[f.lookup || ""] || []).includes(v)) : [];
      if (nones.length === 0) return { clause: `${field} ne null`, test: isPresent, exclude: false };
      const notNone = nones.map((v) => (f.kind === "multi" ? `not (${field} has '${v}')` : `${field} ne '${v}'`));
      return { clause: `(${[`${field} ne null`, ...notNone].join(" and ")})`, test: hasRealValue, exclude: false };
    }
    const { op, value } = pv;
    if (FAIR_HOUSING_REFUSED.test(value)) { refuse(criterion, field, "Fair Housing: not a permitted search criterion"); return null; }
    if (f.kind === "enum" || f.kind === "multi") {
      const members = LIVE.enums[f.lookup || ""] || [];
      if (!members.includes(value)) { refuse(criterion, field, `'${value}' is not a Cotality value for ${field}`); return null; }
      if ((SEARCH_CONTRACT.fair_housing_excluded?.[f.lookup || ""] || []).includes(value)) {
        refuse(criterion, field, "Fair Housing: not a permitted search criterion");
        return null;
      }
      if (op !== "eq" && op !== "ne") { refuse(criterion, field, `${field} is a picklist; ${op} is not meaningful`); return null; }
      const v = escapeOData(value);
      if (op === "ne") {
        // An exclusion matches records known not to have the value; a record without the field is unknown.
        return {
          clause: f.kind === "multi" ? `(${field} ne null and not (${field} has '${v}'))` : `(${field} ne null and ${field} ne '${v}')`,
          test: (x) => isPresent(x) && !tokens(x).includes(value),
          exclude: true,
        };
      }
      return f.kind === "multi"
        ? { clause: `${field} has '${v}'`, test: (x) => tokens(x).includes(value), exclude: false }
        : { clause: `${field} eq '${v}'`, test: (x) => String(x) === value, exclude: false };
    }
    if (f.kind === "boolean") {
      const b = toBool(value);
      if (b === null) { refuse(criterion, field, `'${value}' is not Yes/No for ${field}`); return null; }
      const is = (x: unknown) => x === b || String(x) === String(b);
      // "Exclude" (not:true) keeps records without the field: live 2026-10-24, Active sales
      // LandLeaseYN ne true = 9,126 = false 8,228 + empty 898; eq false would drop the 898.
      if (op === "ne") return { clause: `${field} ne ${b}`, test: (x) => !is(x), exclude: true };
      return { clause: `${field} eq ${b}`, test: is, exclude: false };
    }
    if (f.kind === "number" || f.kind === "date" || f.kind === "timestamp") {
      const lit = literal(f.kind, op, value);
      if (lit === null) { refuse(criterion, field, `'${value}' is not a valid ${f.kind} for ${field}`); return null; }
      const expected = comparable(f.kind, lit);
      return { clause: `${field} ${op} ${lit}`, test: (x) => isPresent(x) && compare(comparable(f.kind, x), op, expected), exclude: op === "ne" };
    }
    if (f.kind === "string") {
      if (op !== "eq" && op !== "ne") { refuse(criterion, field, `${field} is text; ${op} is not meaningful`); return null; }
      const lower = value.toLowerCase();
      return {
        clause: `${field} ${op} '${escapeOData(value)}'`,
        test: (x) => (String(x ?? "").toLowerCase() === lower) === (op === "eq"),
        exclude: op === "ne",
      };
    }
    refuse(criterion, field, `${field} has an unrecognised live type (${f.type})`);
    return null;
  }

  // One field's checkbox / select values: choices OR-ed, exclusions ("not:") AND-ed.
  // "none" = no constraint (a Yes/No field with "any" or both checked); null = refused.
  function fieldExpression(criterion: string, field: string, rawValues: string[]): FieldExpression | "none" | null {
    const f = resolve(criterion, field);
    if (!f) return null;
    const execution = executionOf(criterion, field, f);
    if (!execution) return null;
    const e = expression(criterion, field, f, rawValues);
    return e && e !== "none" ? { ...e, execution } : e;
  }

  function expression(criterion: string, field: string, f: PropertyFieldFacts, rawValues: string[]): Omit<FieldExpression, "execution"> | "none" | null {
    let parsed = rawValues.map(parseValue);
    if (f.kind === "boolean") {
      const bools = parsed.map((p) => ("op" in p ? (p.op === "ne" ? !toBool(p.value) : toBool(p.value)) : null));
      if (parsed.some((p) => "present" in p) || (bools.includes(true) && bools.includes(false))) return "none";
    }
    if (parsed.some((p) => "present" in p)) parsed = [{ present: true }, ...parsed.filter((p) => "op" in p && p.op === "ne")];
    const preds: Predicate[] = [];
    for (const p of parsed) {
      const pred = predicate(criterion, field, f, p);
      if (!pred) return null;
      preds.push(pred);
    }
    const choices = preds.filter((p) => !p.exclude), exclusions = preds.filter((p) => p.exclude);
    const clauses = [...(choices.length ? [orGroup(choices.map((p) => p.clause))] : []), ...exclusions.map((p) => p.clause)];
    return {
      clause: andGroup(clauses),
      test: (v) => (choices.length === 0 || choices.some((p) => p.test(v))) && exclusions.every((p) => p.test(v)),
    };
  }

  // ── Linked resources ("OpenHouse/OpenHouseDate", "Member/MemberLanguages", …) ──
  const joinClauses = new Map<string, Array<{ field: string; clause: string; test: (v: unknown) => boolean }>>();
  const splitResource = (key: string): [string, string] | null => {
    const m = /^([A-Za-z]+)\/([A-Za-z0-9_]+)$/.exec(key);
    return m ? [m[1], m[2]] : null;
  };

  // A field of a linked resource, or why it cannot be searched.
  function resourceField(criterion: string, resource: string, field: string): PropertyFieldFacts | null {
    const e = SEARCH_CONTRACT.resources?.[resource];
    if (!JOIN_RESOURCES[resource] || !e) { refuse(criterion, field, `${resource} is not a Cotality resource linked to Property`); return null; }
    if (e.access !== "OK") { refuse(criterion, field, `Cotality refuses the ${resource} resource (${e.access})`); return null; }
    const f = e.fields[field];
    if (!f) { refuse(criterion, field, `${field} is not a Cotality ${resource} field`); return null; }
    if (f.filter === "SUPPRESSED") { refuse(criterion, field, `Cotality suppresses ${resource}.${field}`); return null; }
    if (f.filter !== "SUPPORTED") { refuse(criterion, field, `Cotality cannot filter ${resource}.${field}`); return null; }
    const perSide = f.sale !== undefined || f.rental !== undefined;
    if (perSide ? !sides.some((s) => n(f[s]) > 0) : !(n(f.total) > 0 || n(f.sampled) > 0)) {
      refuse(criterion, field, `No ${perSide ? sideLabel + " " : ""}${resource} records in Cotality carry ${field}`);
      return null;
    }
    return { type: f.type, kind: f.kind, filter: f.filter, lookup: f.kind === "enum" || f.kind === "multi" ? f.type : undefined };
  }
  const joinClause = (resource: string, field: string, clause: string, test: (v: unknown) => boolean) =>
    joinClauses.set(resource, [...(joinClauses.get(resource) || []), { field, clause, test }]);

  function resourceValues(key: string, resource: string, field: string, list: string[]) {
    const f = resourceField(key, resource, field);
    const e = f && expression(key, field, f, list);
    if (e && e !== "none") joinClause(resource, field, e.clause, e.test);
  }
  function resourceRange(key: string, resource: string, field: string, min: string | null, max: string | null) {
    const f = resourceField(key, resource, field);
    if (!f) return;
    for (const [op, raw] of [["ge", min], ["le", max]] as const) {
      if (raw == null || raw === "") continue;
      const pv: ParsedValue = /^(within|next):\d+$/i.test(raw) ? parseValue(raw) : { op, value: raw };
      const p = predicate(key, field, f, pv);
      if (p) joinClause(resource, field, p.clause, p.test);
    }
  }
  function resourceText(key: string, resource: string, field: string, text: string) {
    const f = resourceField(key, resource, field);
    if (!f) return;
    if (f.kind !== "string") { refuse(key, field, `${resource}.${field} is not text`); return; }
    const needle = text.toLowerCase();
    joinClause(resource, field, `contains(${field},'${escapeOData(text)}')`, (v) => String(v ?? "").toLowerCase().includes(needle));
  }

  function propertyCriterion(criterion: string, field: string, rawValues: string[]) {
    const e = fieldExpression(criterion, field, rawValues);
    if (!e || e === "none") return;
    if (e.execution === "cotality") parts.push(e.clause);
    else { local.push({ criterion, field, source: "property", test: e.test }); select.add(field); }
  }

  // Range on one field (min AND max), from basic-form inputs and generated advanced controls.
  function rangeCriterion(criterion: string, field: string, min: string | null, max: string | null) {
    // A recency select ("within:30") is a minimum date: on or after 30 days ago.
    if (min && /^within:\d+$/i.test(min)) { const pv = parseValue(min); if ("op" in pv) min = pv.value; }
    const hasMin = min != null && min !== "", hasMax = max != null && max !== "";
    if (!hasMin && !hasMax) return;
    if (DERIVED[field]) {
      DERIVED[field](criterion, [hasMin ? `ge:${min}` : "", hasMax ? `le:${max}` : ""].filter(Boolean));
      return;
    }
    if (SEARCH_CONTRACT.custom_fields.keys[field]) {
      customCriterion(criterion, field, [hasMin ? `ge:${min}` : "", hasMax ? `le:${max}` : ""].filter(Boolean), "all");
      return;
    }
    const f = resolve(criterion, field);
    if (!f) return;
    const execution = executionOf(criterion, field, f);
    if (!execution) return;
    const preds: Predicate[] = [];
    for (const [op, v] of [["ge", min], ["le", max]] as const) {
      if (v == null || v === "") continue;
      const p = predicate(criterion, field, f, { op, value: String(v) });
      if (!p) return;
      preds.push(p);
    }
    if (execution === "cotality") parts.push(...preds.map((p) => p.clause));
    else { local.push({ criterion, field, source: "property", test: (v) => preds.every((p) => p.test(v)) }); select.add(field); }
  }

  // Text criterion on a string Property field (contains / startswith), or contains on a REBNY key.
  function textCriterion(criterion: string, field: string, fn: "contains" | "startswith", value: string) {
    const facts = SEARCH_CONTRACT.custom_fields.keys[field];
    if (facts) {
      if (!sides.some((s) => customFieldCarriedOn(field, s))) { refuse(criterion, field, `No ${sideLabel} records in Cotality carry the REBNY field ${field}`); return; }
      const needle = value.toLowerCase();
      local.push({ criterion, field, source: "customFields", test: (v) => String(v ?? "").toLowerCase().includes(needle) });
      return;
    }
    const f = resolve(criterion, field);
    if (!f) return;
    if (f.kind !== "string") { refuse(criterion, field, `${field} is not text`); return; }
    const execution = executionOf(criterion, field, f);
    if (!execution) return;
    const needle = value.toLowerCase();
    if (execution === "cotality") parts.push(`${fn}(${field},'${escapeOData(value)}')`);
    else {
      local.push({ criterion, field, source: "property", test: (v) => (fn === "contains" ? String(v ?? "").toLowerCase().includes(needle) : String(v ?? "").toLowerCase().startsWith(needle)) });
      select.add(field);
    }
  }

  // REBNY CustomProperty.CustomFields key — reached through Property, never filterable: Mallan applies it.
  // combine "any": choices OR-ed (checkboxes); "all": AND-ed (a min/max range). Exclusions are always AND-ed.
  function customExpression(criterion: string, key: string, rawValues: string[], combine: "any" | "all"): ((v: unknown) => boolean) | null {
    const facts = SEARCH_CONTRACT.custom_fields.keys[key];
    if (!facts || !sides.some((s) => customFieldCarriedOn(key, s))) { refuse(criterion, key, `No ${sideLabel} records in Cotality carry the REBNY field ${key}`); return null; }
    const choices: Array<(v: unknown) => boolean> = [];
    const exclusions: Array<(v: unknown) => boolean> = [];
    for (const raw of rawValues) {
      const pv = parseValue(raw);
      if ("present" in pv) { choices.push(hasRealValue); continue; }
      if ("absent" in pv) { choices.push((v) => !hasRealValue(v)); continue; }
      if (FAIR_HOUSING_REFUSED.test(pv.value)) { refuse(criterion, key, "Fair Housing: not a permitted search criterion"); return null; }
      if (facts.kind === "number" || facts.kind === "timestamp") {
        const expected = comparable(facts.kind, pv.value);
        if (Number.isNaN(expected)) { refuse(criterion, key, `'${pv.value}' is not a valid ${facts.kind} for ${key}`); return null; }
        const kind = facts.kind;
        (pv.op === "ne" ? exclusions : choices).push((v) => isPresent(v) && compare(comparable(kind, v), pv.op, expected));
        continue;
      }
      let base: (v: unknown) => boolean;
      if (facts.kind === "boolean01") {
        const b = toBool(pv.value);
        if (b === null) { refuse(criterion, key, `'${pv.value}' is not Yes/No for ${key}`); return null; }
        base = (v) => String(v) === (b ? "1" : "0");
      } else if (facts.kind === "list") {
        base = (v) => tokens(v).includes(pv.value);
      } else {
        const lower = pv.value.toLowerCase();
        base = (v) => String(v ?? "").toLowerCase() === lower;
      }
      // An exclusion matches records known not to have the value; a record without the key is unknown.
      if (pv.op === "ne") exclusions.push((v) => isPresent(v) && !base(v));
      else choices.push(base);
    }
    if (choices.length === 0 && exclusions.length === 0) return null;
    return (v) =>
      (choices.length === 0 || (combine === "all" ? choices.every((c) => c(v)) : choices.some((c) => c(v)))) &&
      exclusions.every((x) => x(v));
  }

  function customCriterion(criterion: string, key: string, rawValues: string[], combine: "any" | "all" = "any") {
    const test = customExpression(criterion, key, rawValues, combine);
    if (test) local.push({ criterion, field: key, source: "customFields", test });
  }

  // Numeric comparisons ("ge:90", "le:7") for a derived criterion, all AND-ed; null = refused.
  function comparisons(criterion: string, field: string, values: string[]): Array<(x: number) => boolean> | null {
    const out: Array<(x: number) => boolean> = [];
    for (const raw of values) {
      const pv = parseValue(raw);
      const v = "op" in pv ? Number(pv.value) : NaN;
      if (!("op" in pv) || Number.isNaN(v)) { refuse(criterion, field, `'${raw}' is not a numeric comparison`); return null; }
      out.push((x) => compare(x, pv.op, v));
    }
    return out;
  }
  const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  // Derived criteria Cotality cannot express: documented LOCAL semantics (Master §5.5).
  const DERIVED: Record<string, (criterion: string, values: string[]) => void> = {
    // Days on market, derived from OnMarketDate (provider DOM is suppressed). Cotality narrows to
    // listings with an OnMarketDate (and, for a minimum, ones on market at least that long); Mallan
    // applies the exact count.
    DOM: (criterion, values) => {
      const tests = comparisons(criterion, "OnMarketDate", values);
      if (!tests || !resolve(criterion, "OnMarketDate")) return;
      parts.push("OnMarketDate ne null");
      // On-market / in-contract only: DOM is exactly today − OnMarketDate, so Cotality executes it.
      if (wantedStatuses && wantedStatuses.every((s) => ON_MARKET_STATUSES.has(SUB_STATUSES[s]?.status ?? s))) {
        for (const raw of values) {
          const pv = parseValue(raw);
          if (!("op" in pv)) continue;
          const x = Number(pv.value);
          if (pv.op === "ge" || pv.op === "eq") parts.push(`OnMarketDate le ${isoDaysAgo(x)}`);
          if (pv.op === "gt") parts.push(`OnMarketDate le ${isoDaysAgo(x + 1)}`);
          if (pv.op === "le" || pv.op === "eq") parts.push(`OnMarketDate ge ${isoDaysAgo(x)}`);
          if (pv.op === "lt") parts.push(`OnMarketDate ge ${isoDaysAgo(x - 1)}`);
          if (pv.op === "ne") { refuse(criterion, "OnMarketDate", "DOM 'not equal' is not supported"); return; }
        }
        return;
      }
      for (const raw of values) {
        const pv = parseValue(raw);
        if ("op" in pv && (pv.op === "ge" || pv.op === "gt")) parts.push(`OnMarketDate le ${isoDaysAgo(Number(pv.value))}`);
      }
      ["OnMarketDate", "StandardStatus", "CloseDate", "OffMarketDate"].forEach((f) => select.add(f));
      local.push({ criterion, field: "OnMarketDate", source: "record", test: (rec) => {
        const d = daysOnMarket(rec as Record<string, unknown>);
        return d !== null && tests.every((t) => t(d));
      } });
    },
    // Asking price below the original asking price by at least N percent.
    PriceBelowOriginalPct: (criterion, values) => {
      const tests = comparisons(criterion, "OriginalListPrice", values);
      if (!tests || !resolve(criterion, "OriginalListPrice")) return;
      parts.push("OriginalListPrice ne null");
      select.add("ListPrice"); select.add("OriginalListPrice");
      local.push({ criterion, field: "OriginalListPrice", source: "record", test: (rec) => {
        const r = rec as Record<string, unknown>, now = Number(r.ListPrice), orig = Number(r.OriginalListPrice);
        if (!(orig > 0) || !(now > 0)) return false;
        const pct = ((orig - now) / orig) * 100;
        return tests.every((t) => t(pct));
      } });
    },
    // Price changed within the last N days, or never ("none") — PriceChangeTimestamp, executed by Cotality.
    PriceChangedWithinDays: (criterion, values) => {
      if (!resolve(criterion, "PriceChangeTimestamp")) return;
      if (values.includes("none")) { parts.push("PriceChangeTimestamp eq null"); return; }
      const days = values.map(Number);
      if (days.some((d) => !(d > 0))) { refuse(criterion, "PriceChangeTimestamp", `'${values.join(", ")}' is not a number of days`); return; }
      parts.push(`PriceChangeTimestamp ge ${isoDaysAgo(Math.max(...days))}T00:00:00Z`);
    },
    // Price per square foot (ListPrice / LivingArea), applied by Mallan; Cotality narrows to
    // listings that have a LivingArea.
    PricePerSqft: (criterion, values) => {
      const tests = comparisons(criterion, "LivingArea", values);
      if (!tests || !resolve(criterion, "LivingArea")) return;
      parts.push("LivingArea gt 0");
      select.add("ListPrice"); select.add("LivingArea");
      local.push({ criterion, field: "LivingArea", source: "record", test: (rec) => {
        const r = rec as Record<string, unknown>, price = Number(r.ListPrice), sqft = Number(r.LivingArea);
        return price > 0 && sqft > 0 && tests.every((t) => t(price / sqft));
      } });
    },
    // Monthly carrying cost (AssociationFee + monthly real-estate tax), applied by Mallan.
    TotalMonthly: (criterion, values) => {
      const tests = comparisons(criterion, "AssociationFee", values);
      if (!tests || !resolve(criterion, "AssociationFee")) return;
      select.add("AssociationFee"); select.add("TaxAnnualAmount");
      local.push({ criterion, field: "AssociationFee", source: "record", needsCustomFields: true, test: (rec) => {
        const m = totalMonthly(rec as Record<string, unknown>);
        return m !== null && tests.every((t) => t(m));
      } });
    },
    // The unit is on the building's top floor: EntryLevel equals StoriesTotal.
    TopFloor: (criterion) => {
      if (!resolve(criterion, "EntryLevel") || !resolve(criterion, "StoriesTotal")) return;
      parts.push("EntryLevel ne null and StoriesTotal ne null");
      select.add("EntryLevel"); select.add("StoriesTotal");
      local.push({ criterion, field: "EntryLevel", source: "record", test: (rec) => {
        const r = rec as Record<string, unknown>;
        return Number(r.EntryLevel) > 0 && Number(r.EntryLevel) === Number(r.StoriesTotal);
      } });
    },
    // Penthouse: a PH unit number or the Penthouse architectural style — executed by Cotality.
    Penthouse: (criterion) => {
      if (!resolve(criterion, "UnitNumber")) return;
      parts.push(carriedOn("ArchitecturalStyle", sides[0]) || carriedOn("ArchitecturalStyle", sides[sides.length - 1])
        ? "(startswith(UnitNumber,'PH') or ArchitecturalStyle has 'Penthouse')"
        : "startswith(UnitNumber,'PH')");
    },
    // Price change direction: Cotality refuses field-to-field comparison (HTTP 500, live
    // 2026-10-23), so it narrows to records with a PreviousListPrice and Mallan compares.
    PriceChangeDirection: (criterion, values) => {
      const down = values.includes("decrease"), up = values.includes("increase");
      const invalid = values.filter((v) => v !== "decrease" && v !== "increase");
      if (invalid.length) { refuse(criterion, "PreviousListPrice", `'${invalid.join(", ")}' is not decrease / increase`); return; }
      if (!resolve(criterion, "PreviousListPrice")) return;
      parts.push("PreviousListPrice ne null");
      select.add("ListPrice"); select.add("PreviousListPrice");
      local.push({
        criterion, field: "PreviousListPrice", source: "record",
        test: (rec) => {
          const r = rec as Record<string, unknown>, now = Number(r.ListPrice), before = Number(r.PreviousListPrice);
          return (down && now < before) || (up && now > before);
        },
      });
    },
  };

  // Several fields offered as one group of checkboxes (e.g. building style): fields OR-ed.
  function groupCriterion(group: string, members: Record<string, unknown>) {
    type Member = { field: string; source: "property" | "customFields"; clause: string; test: (v: unknown) => boolean; execution: "cotality" | "local" };
    const exprs: Member[] = [];
    for (const [field, values] of Object.entries(members || {})) {
      const list = normalizeValues(values);
      if (list.length === 0) continue;
      if (list.some((v) => FAIR_HOUSING_REFUSED.test(v))) { refuse(group, field, "Fair Housing: not a permitted search criterion"); return; }
      if (SEARCH_CONTRACT.property[field]) {
        const e = fieldExpression(group, field, list);
        if (e === null) return;
        if (e === "none") return; // one member unconstrained → the whole group is unconstrained
        exprs.push({ field, source: "property", ...e });
      } else if (SEARCH_CONTRACT.custom_fields.keys[field]) {
        const test = customExpression(group, field, list, "any");
        if (!test) return;
        exprs.push({ field, source: "customFields", clause: "", test, execution: "local" });
      } else {
        refuse(group, field, `${field} is not a Cotality field`);
        return;
      }
    }
    if (exprs.length === 0) return;
    if (exprs.every((e) => e.execution === "cotality")) { parts.push(orGroup(exprs.map((e) => e.clause))); return; }
    exprs.filter((e) => e.source === "property").forEach((e) => select.add(e.field));
    local.push({
      criterion: group, field: exprs.map((e) => e.field).join("|"), source: "record",
      test: (rec) => {
        const r = rec as Record<string, unknown>;
        const cf = exprs.some((e) => e.source === "customFields") ? parseCustomFields(r) : {};
        return exprs.some((e) => e.test(e.source === "customFields" ? cf[e.field] : r[e.field]));
      },
      members: exprs.map((e) => ({ field: e.field, source: e.source, clause: e.clause, execution: e.execution, test: e.test })),
    });
  }

  // Dispatch one named field from the form to the right executor.
  function namedCriterion(field: string, list: string[]) {
    // Saved before the exposure boxes moved to Exposures (2026-10-15): DirectionFaces with the legacy codes N/S/E/W/NE/NW/SE/SW.
    // Live NYC listings carry Exposures (341,229 rows) and leave DirectionFaces empty (1,383), so that is what the record meant.
    if (field === "DirectionFaces" && list.length && list.every((v) => LEGACY_DIRECTION_FACES[v])) field = "Exposures";
    list = [...new Set(list.map((v) => legacyCriterionValue(field, v)))];
    if (list.some((v) => FAIR_HOUSING_REFUSED.test(v))) { refuse(field, field, "Fair Housing: not a permitted search criterion"); return; }
    if (field === "ListOfficeMlsId" && list.includes("OwnOffice")) {
      // "In-House (Company)" — Mallan's own office id, resolved live by the pull.
      const own = SEARCH_CONTRACT.mallan_office?.ListOfficeMlsId;
      if (!own) { refuse(field, field, "Mallan's office is not in the live contract; run npm run cotality:pull"); return; }
      list = list.map((v) => (v === "OwnOffice" ? own : v));
    }
    if (DERIVED[field]) DERIVED[field](field, list);
    else if (SEARCH_CONTRACT.property[field]) propertyCriterion(field, field, list);
    else if (SEARCH_CONTRACT.custom_fields.keys[field]) customCriterion(field, field, list);
    else refuse(field, field, `${field} is not a Cotality field`);
  }

  // ── Listing type: sale and rental are separate Cotality PropertyTypes ──
  parts.push(sides.length === 1
    ? `PropertyType eq '${SEARCH_CONTRACT.types[sides[0]]}'`
    : `(${sides.map((s) => `PropertyType eq '${SEARCH_CONTRACT.types[s]}'`).join(" or ")})`);

  // ── Status: StandardStatus (MlsStatus is suppressed by Cotality and never substituted) ──
  if (wantedStatuses) {
    const office = SEARCH_CONTRACT.mallan_office?.ListOfficeMlsId;
    const clauses: string[] = [];
    const invalid: string[] = [];
    for (const v of new Set(wantedStatuses)) {
      const sub = SUB_STATUSES[v];
      if (!sub) {
        if (LIVE.enums.StandardStatus.includes(v)) clauses.push(`StandardStatus eq '${v}'`);
        else invalid.push(v);
        continue;
      }
      const missing = sub.fields.find((f) => !sides.some((s) => carriedOn(f, s)));
      if (missing) { refuse("status", missing, `No ${sideLabel} records in Cotality carry ${missing}, which '${v}' needs`); continue; }
      if (sub.clause === thruUs && !office) { refuse("status", "BuyerOfficeMlsId", "Mallan's office is not in the live contract"); continue; }
      const extra = sub.clause(office || "");
      clauses.push(extra ? `(StandardStatus eq '${sub.status}' and ${extra})` : `StandardStatus eq '${sub.status}'`);
    }
    if (invalid.length) refuse("status", "StandardStatus", `Not Cotality StandardStatus values: ${invalid.join(", ")}`);
    else if (clauses.length) parts.push(orGroup([...new Set(clauses)]));
  }

  // ── Ranges ──
  const ranges: Array<[string, string, string, string]> = [
    ["price", "ListPrice", "minPrice", "maxPrice"], // sale price and monthly rent are both ListPrice (LeaseAmount is empty live)
    ["bedrooms", "BedroomsTotal", "minBeds", "maxBeds"],
    ["bathrooms", "BathroomsTotalInteger", "minBaths", "maxBaths"],
    ["rooms", "RoomsTotal", "minRooms", "maxRooms"],
    ["sqft", "LivingArea", "minSqft", "maxSqft"],
    ["yearBuilt", "YearBuilt", "minYear", "maxYear"],
    ["floors", "StoriesTotal", "minFloors", "maxFloors"],
    ["units", "NumberOfUnitsTotal", "minUnits", "maxUnits"],
    ["closeDate", "CloseDate", "closeDateFrom", "closeDateTo"], // sold date (sale) / rented date (rental)
    ["contractDate", "PurchaseContractDate", "contractDateFrom", "contractDateTo"], // contract signed / lease signed
    ["availabilityDate", "AvailabilityDate", "availableFrom", "availableTo"],
  ];
  for (const [criterion, field, minKey, maxKey] of ranges) {
    const min = params.get(minKey) ?? (minKey === "minBeds" ? params.get("beds") : null);
    rangeCriterion(criterion, field, min, params.get(maxKey));
  }

  // Listed / Updated activity window.
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo") || dateFrom;
  if (dateFrom) {
    const dateType = params.get("dateType") || "Listed";
    const windowOn = (field: string) => {
      const before = parts.length, refusedBefore = refused.length;
      rangeCriterion(`${dateType} date`, field, dateFrom, dateTo);
      return refused.length > refusedBefore ? null : parts.splice(before).join(" and ");
    };
    if (dateType === "ListedAndUpdated") {
      const listed = windowOn("ListingContractDate"), updated = windowOn("ModificationTimestamp");
      if (listed && updated) parts.push(`((${listed}) or (${updated}))`);
    } else {
      const clause = windowOn(dateType === "Updated" ? "ModificationTimestamp" : "ListingContractDate");
      if (clause) parts.push(clause);
    }
  }

  // ── Location: live Cotality free-text fields. A typed neighborhood (any case, punctuation or
  // shorthand) resolves to every exact SubdivisionName spelling Cotality currently carries; a
  // typed borough resolves to the exact live CityRegion value. Unknown names are refused.
  // Every picked place counts: boroughs and neighborhoods together are a union ("Brooklyn, plus
  // Tribeca"), since a neighborhood inside a picked borough adds nothing and one outside it
  // would otherwise intersect to nothing.
  const placeClauses: string[] = [];
  const neighborhood = params.get("neighborhood");
  if (neighborhood) {
    const typed = neighborhood.split(",").map((s) => s.trim()).filter(Boolean);
    const exact = geo ? resolveNeighborhoods(geo, typed) : { exact: typed, unresolved: [] as string[] };
    for (const name of exact.unresolved) refuse("neighborhood", "SubdivisionName", `'${name}' is not a neighborhood in live Cotality listings`);
    if (exact.exact.length) placeClauses.push(orGroup(exact.exact.map((v) => `SubdivisionName eq '${escapeOData(v)}'`)));
  }
  const borough = params.get("borough");
  if (borough) {
    const typed = borough.split(",").map((s) => s.trim()).filter(Boolean);
    const values: string[] = [];
    for (const b of typed) {
      const live = geo ? resolveBorough(geo, b) : b;
      if (!live) refuse("borough", "CityRegion", `'${b}' is not a borough in live Cotality listings`);
      else if (!values.includes(live)) values.push(live);
    }
    if (values.length) placeClauses.push(orGroup(values.map((v) => `CityRegion eq '${escapeOData(v)}'`)));
  }
  if (placeClauses.length) parts.push(orGroup(placeClauses));
  const zip = params.get("zip");
  if (zip) {
    // One zip or a comma-separated list: the page sends "10028, 10128" and only the first applied
    // (found 2026-10-26). PostalCode is a live filterable Property field.
    const zips = zip.split(",").map((z) => z.trim()).filter(Boolean);
    if (zips.length === 1) parts.push(`PostalCode eq '${escapeOData(zips[0])}'`);
    else if (zips.length > 1) parts.push(orGroup(zips.map((z) => `PostalCode eq '${escapeOData(z)}'`)));
  }
  if (params.get("gridFilter")) refuse("mapArea", "Latitude", "Cotality suppresses Latitude/Longitude; map areas resolve through Mallan's neighborhood maps");

  // ── Address ──
  const address = params.get("address");
  if (address) parts.push(addressClause(address));

  // ── Identity and text ──
  const unit = params.get("unit");
  if (unit) parts.push(`UnitNumber eq '${escapeOData(unit.toUpperCase())}'`);
  const keyword = params.get("keyword");
  if (keyword) textCriterion("keyword", "PublicRemarks", "contains", keyword);
  const buildingName = params.get("buildingName");
  if (buildingName) textCriterion("buildingName", "BuildingName", "contains", buildingName);
  const mgmt = params.get("managementCompany");
  if (mgmt) textCriterion("managementCompany", "ListOfficeName", "contains", mgmt);
  const listingId = params.get("listingId");
  if (listingId) {
    const ids = listingId.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) parts.push(orGroup(ids.map((id) => `ListingId eq '${escapeOData(id)}'`)));
  }

  // ── Picklists ──
  const subType = params.get("propertySubType");
  if (subType) propertyCriterion("propertySubType", "PropertySubType", subType.split(","));
  const ownership = params.get("ownership");
  if (ownership) propertyCriterion("ownership", "CommonInterest", ownership.split(","));
  if (params.get("sponsorUnit") === "true") customCriterion("sponsorUnit", "SponsorUnitYN", ["true"]);

  // ── Every other field, by its live Cotality name (checkboxes / selects / generated advanced controls) ──
  const json = <T,>(key: string): T | null => {
    const raw = params.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { refuse(key, undefined, `${key} is not valid JSON`); return null; }
  };
  for (const [field, values] of Object.entries(json<Record<string, unknown>>("checkboxFilters") || {})) {
    const list = normalizeValues(values);
    const linked = splitResource(field);
    if (list.length && linked) resourceValues(field, linked[0], linked[1], list);
    else if (list.length) namedCriterion(field, list);
  }
  for (const [group, members] of Object.entries(json<Record<string, Record<string, unknown>>>("checkboxGroups") || {})) {
    groupCriterion(group, members);
  }
  for (const [field, r] of Object.entries(json<Record<string, { min?: string; max?: string }>>("fieldRanges") || {})) {
    const linked = splitResource(field);
    if (linked) resourceRange(field, linked[0], linked[1], r?.min ?? null, r?.max ?? null);
    else rangeCriterion(field, field, r?.min ?? null, r?.max ?? null);
  }
  for (const [field, text] of Object.entries(json<Record<string, string>>("fieldText") || {})) {
    const linked = splitResource(field);
    if (text && linked) resourceText(field, linked[0], linked[1], String(text));
    else if (text) textCriterion(field, field, "contains", String(text));
  }

  // ── Agent / office pickers (listAgent, coListAgent, anyAgent, listOffice, coListOffice) ──
  // The 2026-10-15 Agent Search: every id/name field filters without error on live Cotality
  // Property (verified 2026-10-06). Kept as its own parameter family so the pickers and the
  // saved searches that stored them keep working; each parameter touches only its own side.
  parts.push(...buildAgentOfficeFilterParts(params));

  // One join per linked resource. Listing-linked rows carry their listing's PropertyType and
  // StandardStatus (live 2026-10-24: 300/300 CustomProperty and 264/264 OpenHouse rows matched their
  // Property record), so the keys are narrowed to this search's side(s) and statuses; Property still
  // applies every criterion itself.
  const baseStatuses = wantedStatuses
    ? [...new Set(wantedStatuses.map((v) => SUB_STATUSES[v]?.status ?? v))].filter((v) => LIVE.enums.StandardStatus.includes(v))
    : [];
  const joins: JoinCriterion[] = [];
  for (const [resource, preds] of joinClauses) {
    const link = JOIN_RESOURCES[resource];
    const narrow = link.key !== "ListingKey" ? [] : [
      orGroup(sides.map((s) => `PropertyType eq '${SEARCH_CONTRACT.types[s]}'`)),
      ...(baseStatuses.length ? [orGroup(baseStatuses.map((v) => `StandardStatus eq '${v}'`))] : []),
    ];
    const join: JoinCriterion = {
      criterion: resource,
      resource,
      filter: [...narrow, ...preds.map((p) => p.clause)].join(" and "),
      key: link.key,
      propertyFields: link.propertyFields.filter((f) => sides.some((s) => carriedOn(f, s))),
    };
    if (resource === "CustomProperty") {
      join.fallback = {
        expand: [...new Set(preds.map((p) => p.field))],
        criterion: { criterion: resource, field: "CustomProperty", source: "record", test: (rec) => {
          const cp = (rec as Record<string, unknown>).CustomProperty;
          const row = (Array.isArray(cp) ? cp[0] : cp) as Record<string, unknown> | undefined;
          return !!row && preds.every((p) => p.test(row[p.field]));
        } },
      };
    }
    joins.push(join);
  }

  return { sides, filter: parts.join(" and "), local, select: [...select], refused, joins, statuses: baseStatuses };
}

// A house number followed by a street names one building: the number matches exactly (plus the
// Queens hyphenated form "63-34"), never by prefix — startswith('400') would also return 4000.
// A building is identified by its normalized address (number + direction + street + borough):
// TaxBlock/TaxLot name a tax parcel, and condominium units each carry their own lot (live
// 400 E 90th Street: one block, 15 lots across 173 rows), so they cannot group a building.
function streetNumberClause(num: string): string {
  const n = escapeOData(num);
  return `(StreetNumber eq '${n}' or startswith(StreetNumber,'${n}-'))`;
}

// A direction AFTER a street-type word is Cotality's StreetDirSuffix, its own field:
// "425 Park Avenue South" is served as StreetName PARK / StreetSuffix Avenue /
// StreetDirSuffix S, "116 Central Park South" as CENTRAL / Park / S, "60 Sutton Place
// South" as SUTTON / Place / S (live Property rows, 2026-10-28; StreetDirSuffix is in
// $metadata and set on 13,595 rows). Both trailing words leave the name clause.
const DIR_SUFFIX_TAIL = /\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|COURT|CT|WAY|TERRACE|TER|CIRCLE|CIR|PARKWAY|PKWY|PLAZA|PARK)\.?\s+(NORTH|SOUTH|EAST|WEST|N|S|E|W)\.?\s*$/;

function addressClause(address: string): string {
  let raw = address.trim().toUpperCase();
  let dirSuffix: string | null = null;
  const tail = raw.match(DIR_SUFFIX_TAIL);
  if (tail && tail.index !== undefined && tail.index > 0) {
    dirSuffix = tail[2].charAt(0);
    raw = raw.slice(0, tail.index).trim();
  }
  const withSuffix = (clause: string): string =>
    dirSuffix ? `(${clause} and StreetDirSuffix eq '${dirSuffix}')` : clause;
  // House numbers are "400" or the Queens hyphenated form "63-34" (live StreetNumber values).
  const dirPattern = /^(\d+(?:-\d+)?)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
  const numOnlyPattern = /^(\d+(?:-\d+)?)\s+(.*)/;
  const dirMatch = raw.match(dirPattern);

  if (dirMatch) {
    const streetNum = dirMatch[1];
    const direction = dirMatch[2].charAt(0); // StreetDirPrefix live values: E, W, N, S, ...
    const rawStreet = stripStreetSuffix(dirMatch[3]);
    const streetPart = rawStreet.replace(/(ST|ND|RD|TH)\b/gi, "").trim();
    const streetPartFull = escapeOData(rawStreet);
    const conditions = [streetNumberClause(streetNum), `StreetDirPrefix eq '${direction}'`];
    if (streetPart && streetPart !== streetPartFull) {
      conditions.push(`(contains(StreetName,'${escapeOData(streetPart)}') or contains(StreetName,'${streetPartFull}'))`);
    } else if (streetPart) {
      conditions.push(`contains(StreetName,'${escapeOData(streetPart)}')`);
    }
    return withSuffix(`(${conditions.join(" and ")})`);
  }
  const numMatch = raw.match(numOnlyPattern);
  if (numMatch && numMatch[1]) {
    const streetNum = numMatch[1];
    const streetPart = stripStreetSuffix(numMatch[2] || "");
    if (streetPart) {
      const stripped = streetPart.replace(/(ST|ND|RD|TH)\b/gi, "").trim();
      const nameFilters = [`contains(StreetName,'${escapeOData(streetPart)}')`];
      if (stripped !== streetPart) nameFilters.push(`contains(StreetName,'${escapeOData(stripped)}')`);
      return withSuffix(`(${streetNumberClause(streetNum)} and (${nameFilters.join(" or ")}))`);
    }
    return withSuffix(`(startswith(StreetNumber,'${streetNum}') or contains(BuildingName,'${escapeOData(raw)}'))`);
  }
  if (/^\d+$/.test(raw)) return `(startswith(StreetNumber,'${escapeOData(raw)}') or contains(BuildingName,'${escapeOData(raw)}'))`;
  const cleaned = stripStreetSuffix(raw);
  return withSuffix(`(contains(StreetName,'${escapeOData(cleaned || raw)}') or contains(BuildingName,'${escapeOData(raw)}'))`);
}

// UCBA Art. I §11 DOM: provider DaysOnMarket is suppressed, so Mallan derives it from
// OnMarketDate. On-market statuses count to today; Closed counts to CloseDate; other
// off-market statuses count to OffMarketDate. Never past today, never negative.
const ON_MARKET_STATUSES = new Set(["Active", "ComingSoon", "ActiveUnderContract", "Pending"]);
export function daysOnMarket(raw: Record<string, unknown>, now: number = Date.now()): number | null {
  if (!raw.OnMarketDate) return null;
  const day = (v: unknown) => Date.parse(`${String(v).slice(0, 10)}T00:00:00Z`);
  const start = day(raw.OnMarketDate);
  const status = String(raw.StandardStatus || "");
  const endRaw = ON_MARKET_STATUSES.has(status) ? null : status === "Closed" ? raw.CloseDate : raw.OffMarketDate;
  const end = Math.min(endRaw ? day(endRaw) : now, now);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.floor((end - start) / 86_400_000);
}

/** Monthly carrying cost Mallan derives: common charges / maintenance + real-estate tax per month. */
export function totalMonthly(raw: Record<string, unknown>): number | null {
  const fee = Number(raw.AssociationFee);
  const taxAnnual = Number(raw.TaxAnnualAmount);
  const taxMonthly = Number(parseCustomFields(raw).TaxMonthlyAmount);
  const tax = taxAnnual > 0 ? taxAnnual / 12 : taxMonthly > 0 ? taxMonthly : 0;
  if (!(fee > 0) && !(tax > 0)) return null;
  return (fee > 0 ? fee : 0) + tax;
}

/** Parse a raw record's REBNY CustomProperty.CustomFields JSON (live shape: CustomProperty is an array of one). */
export function parseCustomFields(record: Record<string, unknown>): Record<string, unknown> {
  const cp = Array.isArray(record.CustomProperty) ? record.CustomProperty[0] : record.CustomProperty;
  const raw = cp && (cp as Record<string, unknown>).CustomFields;
  if (typeof raw !== "string" || raw === "") return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

/** Apply the criteria Cotality cannot filter, in Mallan's layer, to raw Cotality records. */
export function applyLocalCriteria(records: Record<string, unknown>[], local: LocalCriterion[]): Record<string, unknown>[] {
  if (local.length === 0) return records;
  return records.filter((rec) => {
    const custom = local.some((c) => c.source === "customFields") ? parseCustomFields(rec) : {};
    return local.every((c) => c.test(c.source === "customFields" ? custom[c.field] : c.source === "record" ? rec : rec[c.field]));
  });
}
