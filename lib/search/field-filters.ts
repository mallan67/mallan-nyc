/**
 * Search on every Cotality field.
 *
 * The CRM search sends `fieldFilters`: a JSON array of { f: <Cotality field>, op, v }. Every field name, type and
 * picklist value is held to the live Cotality contract (data/cotality-enums.live.json) and to the live list of fields
 * Cotality lets us filter on (data/cotality-filterable.live.json, from `npm run cotality:probe`):
 *
 *   - a Property field Cotality accepts in $filter  -> an OData clause (server side, whole result set);
 *   - a Property field the RLS provider blocks, a CustomProperty field or a CustomFields key (SponsorUnitYN, FlipTax ...)
 *     -> a post filter on the fetched page (they cannot be expressed in $filter).
 *
 * Nothing here invents a field, a type or a value: an unknown field, an operator the type does not support or a value
 * that is not a live picklist member is rejected and reported, never guessed.
 */
import contract from "@/data/cotality-enums.live.json";
import filterableDoc from "@/data/cotality-filterable.live.json";
import concepts from "@/compliance/rules/compliance-concepts.json";

export type FieldKind = "boolean" | "number" | "date" | "datetime" | "string" | "enum";
export type FilterOp = "eq" | "in" | "contains" | "startswith" | "ge" | "le" | "gt" | "lt" | "between" | "isnull" | "notnull";

export interface FieldFilter {
  f: string;
  op: FilterOp;
  v?: unknown;
}

export interface PostFilter {
  field: string;
  source: "property" | "custom-property" | "custom-fields";
  kind: FieldKind;
  op: FilterOp;
  value: unknown;
}

export interface FieldFilterResult {
  clauses: string[];
  postFilters: PostFilter[];
  rejected: Array<{ field: string; reason: string }>;
}

const MAX_FILTERS = 25;
const MAX_STRING = 120;
const MAX_IN_VALUES = 40;

const PROPERTY: Record<string, string> = (contract as { entities: { Property: Record<string, string> } }).entities.Property;
const CUSTOM_PROPERTY: Record<string, string> = (contract as { entities: { CustomProperty: Record<string, string> } }).entities.CustomProperty;
const ENUMS: Record<string, string[]> = (contract as { enums: Record<string, string[]> }).enums;
const FILTERABLE = new Set<string>((filterableDoc as { filterable: string[] }).filterable);
const CUSTOM_FIELDS_KEYS = new Set<string>((concepts as { customFieldKeys: { keys: string[] } }).customFieldKeys.keys);
const CUSTOM_FIELDS_KINDS: Record<string, string> = (concepts as { customFieldKeys: { kinds?: Record<string, string> } }).customFieldKeys.kinds ?? {};

const NUMBER_TYPES = new Set(["Edm.Int16", "Edm.Int32", "Edm.Int64", "Edm.Decimal", "Edm.Double", "Edm.Single"]);

export function kindOfType(type: string): FieldKind {
  if (type === "Edm.Boolean") return "boolean";
  if (type === "Edm.String") return "string";
  if (type === "Edm.Date") return "date";
  if (type === "Edm.DateTimeOffset") return "datetime";
  if (NUMBER_TYPES.has(type)) return "number";
  return "enum";
}

function enumMembers(field: string, type: string): string[] | null {
  const typeName = String(type).replace(/^Collection\(/, "").replace(/\)$/, "").replace(/^.*\.Enums\.(?:Multi\.)?/, "");
  return ENUMS[field] ?? ENUMS[typeName] ?? null;
}

/** Everything the search can address, by name: where it lives, its kind and (for enumerations) its live members. */
export interface SearchableField {
  name: string;
  source: "property" | "custom-property" | "custom-fields";
  kind: FieldKind;
  /** true when Cotality accepts the field in $filter (server side); false = filtered on the fetched page */
  serverSide: boolean;
  members: string[] | null;
}

export function searchableField(name: string): SearchableField | null {
  if (name in PROPERTY) {
    const type = PROPERTY[name];
    const kind = kindOfType(type);
    return { name, source: "property", kind, serverSide: FILTERABLE.has(name), members: kind === "enum" ? enumMembers(name, type) : null };
  }
  if (name in CUSTOM_PROPERTY && name !== "CustomFields") {
    const type = CUSTOM_PROPERTY[name];
    const kind = kindOfType(type);
    return { name, source: "custom-property", kind, serverSide: false, members: kind === "enum" ? enumMembers(name, type) : null };
  }
  if (CUSTOM_FIELDS_KEYS.has(name)) {
    return { name, source: "custom-fields", kind: customFieldsKind(name), serverSide: false, members: null };
  }
  return null;
}

// CustomFields is a JSON string: the key names are live, the JSON value types follow the key's name convention
// (…YN boolean; …Total/Amount/Percent/Months/Feet/Inches/Year numeric; …Timestamp/DateTime a date-time; the rest text).
function customFieldsKind(name: string): FieldKind {
  // read from live evidence (compliance-concepts.json customFieldKeys.kinds): Cotality sends every CustomFields value as text
  const known = CUSTOM_FIELDS_KINDS[name];
  if (known === "number" || known === "boolean" || known === "datetime" || known === "string") return known;
  if (/YN$/.test(name)) return "boolean";
  if (/Timestamp$|DateTime$/.test(name)) return "datetime";
  if (/(Total|Amount|Percent|Months|Feet|Inches|Year|Size|FAR)$/.test(name)) return "number";
  return "string";
}

export function allSearchableFields(): SearchableField[] {
  const out: SearchableField[] = [];
  for (const name of Object.keys(PROPERTY)) { const f = searchableField(name); if (f) out.push(f); }
  for (const name of Object.keys(CUSTOM_PROPERTY)) { if (name in PROPERTY || name === "CustomFields") continue; const f = searchableField(name); if (f) out.push(f); }
  for (const name of CUSTOM_FIELDS_KEYS) { if (name in PROPERTY || name in CUSTOM_PROPERTY) continue; const f = searchableField(name); if (f) out.push(f); }
  return out;
}

const OPS_BY_KIND: Record<FieldKind, FilterOp[]> = {
  boolean: ["eq", "isnull", "notnull"],
  number: ["eq", "ge", "le", "gt", "lt", "between", "isnull", "notnull"],
  date: ["eq", "ge", "le", "gt", "lt", "between", "isnull", "notnull"],
  datetime: ["ge", "le", "gt", "lt", "between", "isnull", "notnull"],
  string: ["eq", "in", "contains", "startswith", "isnull", "notnull"],
  enum: ["eq", "in", "isnull", "notnull"],
};

export function opsFor(kind: FieldKind): FilterOp[] {
  return OPS_BY_KIND[kind];
}

/**
 * Free-text fields (remarks, descriptions, comments, instructions ...). Live Cotality cannot evaluate contains()/startswith()
 * on them within the request timeout (the CRM already stopped sending `keyword` for that reason), so text matching on these
 * fields is done on the fetched page; empty / not-empty is still asked of Cotality.
 */
export function isLongText(name: string): boolean {
  return /(Remarks|Description|Comments|Instructions|Directions|Considerations|Requirements|Terms|Disclosures|Notes)$/.test(name);
}

export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanString(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(CONTROL, " ").trim().slice(0, MAX_STRING);
  return s ? s : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "boolean" || v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// CustomFields values arrive as text: a Yes/No field is "1" or "0" (live 2026-10-16); Mallan's own listings store true / false.
function asBoolean(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "Yes" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === "No" || v === 0 || v === "0") return false;
  return null;
}

function asDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function asDateTime(v: unknown, end = false): string | null {
  if (typeof v !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T${end ? "23:59:59" : "00:00:00"}Z`;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) ? v : null;
}

/** One typed literal as it appears in an OData expression, or null when the value is not valid for the field. */
function literal(field: SearchableField, v: unknown, end = false): string | null {
  switch (field.kind) {
    case "boolean": { const b = asBoolean(v); return b == null ? null : String(b); }
    case "number": { const n = asNumber(v); return n == null ? null : String(n); }
    case "date": return asDate(v);
    case "datetime": return asDateTime(v, end);
    case "enum": {
      const s = cleanString(v);
      if (s == null) return null;
      if (field.members && !field.members.includes(s)) return null;
      return `'${escapeODataString(s)}'`;
    }
    case "string": { const s = cleanString(v); return s == null ? null : `'${escapeODataString(s)}'`; }
  }
}

const COMPARE: Partial<Record<FilterOp, string>> = { ge: "ge", le: "le", gt: "gt", lt: "lt", eq: "eq" };

function clauseFor(field: SearchableField, op: FilterOp, v: unknown): { clause?: string; reason?: string } {
  const name = field.name;
  if (op === "isnull") return { clause: `${name} eq null` };
  if (op === "notnull") return { clause: `${name} ne null` };
  if (op === "between") {
    const pair = Array.isArray(v) ? v : [];
    const lo = pair[0] != null && pair[0] !== "" ? literal(field, pair[0]) : null;
    const hi = pair[1] != null && pair[1] !== "" ? literal(field, pair[1], true) : null;
    if (lo == null && hi == null) return { reason: "between needs a valid lower or upper value" };
    const parts: string[] = [];
    if (lo != null) parts.push(`${name} ge ${lo}`);
    if (hi != null) parts.push(`${name} le ${hi}`);
    return { clause: parts.length === 1 ? parts[0] : `(${parts.join(" and ")})` };
  }
  if (op === "in") {
    const list = (Array.isArray(v) ? v : [v]).slice(0, MAX_IN_VALUES);
    const lits = list.map((x) => literal(field, x));
    if (lits.some((l) => l == null) || lits.length === 0) {
      const bad = list.filter((_, i) => lits[i] == null).map((x) => String(x)).join(", ");
      return { reason: field.kind === "enum" ? `not a live ${name} value: ${bad}` : "invalid value" };
    }
    return { clause: lits.length === 1 ? `${name} eq ${lits[0]}` : `(${lits.map((l) => `${name} eq ${l}`).join(" or ")})` };
  }
  if (op === "contains" || op === "startswith") {
    const s = cleanString(v);
    if (s == null) return { reason: "a text value is required" };
    return { clause: `${op}(${name},'${escapeODataString(s)}')` };
  }
  const cmp = COMPARE[op];
  if (!cmp) return { reason: `unsupported operator ${op}` };
  const lit = literal(field, v);
  if (lit == null) return { reason: field.kind === "enum" ? `not a live ${name} value` : "invalid value" };
  return { clause: `${name} ${cmp} ${lit}` };
}

/** Validate and translate `fieldFilters` (the JSON text of the request parameter) into OData clauses and post filters. */
export function buildFieldFilters(raw: string | null | undefined): FieldFilterResult {
  const result: FieldFilterResult = { clauses: [], postFilters: [], rejected: [] };
  if (!raw) return result;
  let list: unknown;
  try { list = JSON.parse(raw); } catch { result.rejected.push({ field: "", reason: "fieldFilters is not valid JSON" }); return result; }
  if (!Array.isArray(list)) { result.rejected.push({ field: "", reason: "fieldFilters must be a list" }); return result; }

  for (const item of list.slice(0, MAX_FILTERS)) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const name = typeof entry.f === "string" ? entry.f : "";
    const op = entry.op as FilterOp;
    const field = searchableField(name);
    if (!field) { result.rejected.push({ field: name, reason: "not a Cotality field" }); continue; }
    if (!opsFor(field.kind).includes(op)) { result.rejected.push({ field: name, reason: `operator ${String(op)} does not apply to a ${field.kind} field` }); continue; }

    const textOnPage = field.kind === "string" && isLongText(name) && (op === "contains" || op === "startswith");
    if (field.serverSide && !textOnPage) {
      const built = clauseFor(field, op, entry.v);
      if (built.clause) result.clauses.push(built.clause);
      else result.rejected.push({ field: name, reason: built.reason || "invalid value" });
    } else {
      // A post filter needs a value of the right shape too; validate it the same way, then keep the raw value.
      const probe = clauseFor({ ...field, name: "x" }, op, entry.v);
      if (!probe.clause) { result.rejected.push({ field: name, reason: probe.reason || "invalid value" }); continue; }
      result.postFilters.push({ field: name, source: field.source, kind: field.kind, op, value: entry.v });
    }
  }
  if (list.length > MAX_FILTERS) result.rejected.push({ field: "", reason: `only the first ${MAX_FILTERS} filters are applied` });
  return result;
}

// ── Post filters (applied to the fetched page) ─────────────────────────────

function customFieldsOf(record: Record<string, unknown>): Record<string, unknown> {
  const cp = record.CustomProperty;
  const first = Array.isArray(cp) ? (cp[0] as Record<string, unknown> | undefined) : (cp as Record<string, unknown> | undefined);
  if (!first) return {};
  const cf = first.CustomFields;
  if (typeof cf === "string") { try { const o = JSON.parse(cf); return o && typeof o === "object" ? o : {}; } catch { return {}; } }
  return {};
}

function customPropertyOf(record: Record<string, unknown>): Record<string, unknown> {
  const cp = record.CustomProperty;
  const first = Array.isArray(cp) ? cp[0] : cp;
  return first && typeof first === "object" ? (first as Record<string, unknown>) : {};
}

export function valueOf(record: Record<string, unknown>, pf: Pick<PostFilter, "field" | "source">): unknown {
  if (pf.source === "property") return record[pf.field];
  if (pf.source === "custom-property") return customPropertyOf(record)[pf.field];
  return customFieldsOf(record)[pf.field];
}

function present(v: unknown): boolean {
  return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
}

function listOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return v == null ? [] : [String(v)];
}

function compare(kind: FieldKind, actual: unknown, op: FilterOp, wanted: unknown): boolean {
  if (kind === "number") {
    const a = asNumber(actual); const w = asNumber(wanted);
    if (a == null || w == null) return false;
    return op === "eq" ? a === w : op === "ge" ? a >= w : op === "le" ? a <= w : op === "gt" ? a > w : a < w;
  }
  if (kind === "date" || kind === "datetime") {
    const a = Date.parse(String(actual)); const w = Date.parse(kind === "date" ? String(wanted) : String(asDateTime(wanted) ?? ""));
    if (!Number.isFinite(a) || !Number.isFinite(w)) return false;
    return op === "eq" ? a === w : op === "ge" ? a >= w : op === "le" ? a <= w : op === "gt" ? a > w : a < w;
  }
  return false;
}

export function matchesPostFilter(record: Record<string, unknown>, pf: PostFilter): boolean {
  const actual = valueOf(record, pf);
  if (pf.op === "isnull") return !present(actual);
  if (pf.op === "notnull") return present(actual);
  if (!present(actual)) return false;

  if (pf.kind === "boolean") { const a = asBoolean(actual); const w = asBoolean(pf.value); return a != null && a === w; }
  if (pf.kind === "enum" || pf.kind === "string") {
    const have = listOf(actual).map((x) => x.toLowerCase());
    if (pf.op === "contains") return have.some((x) => x.includes(String(pf.value).toLowerCase()));
    if (pf.op === "startswith") return have.some((x) => x.startsWith(String(pf.value).toLowerCase()));
    const want = (Array.isArray(pf.value) ? pf.value : [pf.value]).map((x) => String(x).toLowerCase());
    return want.some((x) => have.includes(x));
  }
  if (pf.op === "between") {
    const pair = Array.isArray(pf.value) ? pf.value : [];
    const loOk = pair[0] == null || pair[0] === "" || compare(pf.kind, actual, "ge", pair[0]);
    const hiOk = pair[1] == null || pair[1] === "" || compare(pf.kind, actual, "le", pair[1]);
    return loOk && hiOk;
  }
  return compare(pf.kind, actual, pf.op, pf.value);
}

export function applyPostFilters<T extends Record<string, unknown>>(records: T[], postFilters: PostFilter[]): T[] {
  if (postFilters.length === 0) return records;
  return records.filter((r) => postFilters.every((pf) => matchesPostFilter(r, pf)));
}

/** Property field names a post filter needs in $select (CustomProperty is expanded by the search route already). */
export function selectFieldsForPostFilters(postFilters: PostFilter[]): string[] {
  return [...new Set(postFilters.filter((p) => p.source === "property").map((p) => p.field))];
}
