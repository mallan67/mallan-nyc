/**
 * The verified Cotality contract, read by Mallan code.
 *
 * ONE PROVIDER AUTHORITY. `data/cotality-contract.live.json` is produced by
 * `npm run cotality:pull-contract` directly from the live authenticated API and
 * carries the source host, the acquisition timestamp and the run id that
 * produced it. Everything Mallan believes about Cotality field existence, type,
 * nullability, enum membership, resource ownership and relationships comes from
 * here.
 *
 * A field name is not an identity. Several fields are declared on more than one
 * resource - Media repeats listing-level facts such as StandardStatus and
 * PropertyType - so lookups are resource-qualified and `declaringResources()`
 * exists to make that explicit rather than letting a caller guess.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface CotalityPrimitive {
  kind: 'primitive';
  type: string;
  collection: boolean;
  nullable: boolean;
  maxLength: string | null;
  precision: string | null;
  scale: string | null;
}

export interface CotalityEnumField {
  kind: 'enum';
  enumType: string;
  multi: boolean;
  nullable: boolean;
  maxLength: string | null;
  precision: string | null;
  scale: string | null;
}

export interface CotalityNavigation {
  kind: 'navigation';
  target: string;
  collection: boolean;
  nullable: boolean;
}

export type CotalityField = CotalityPrimitive | CotalityEnumField | CotalityNavigation;

export interface CotalityEnumMember {
  name: string;
  value: string;
}

interface LiveContract {
  source: string;
  pulled_at: string;
  run_id?: string;
  entityTypes: Record<
    string,
    { properties: Record<string, CotalityField>; navigation: Record<string, CotalityNavigation> }
  >;
  enums: Record<string, CotalityEnumMember[]>;
}

const CONTRACT_PATH = resolve(__dirname, '..', '..', 'data', 'cotality-contract.live.json');

let cached: LiveContract | null = null;

/** The whole verified contract. Throws if it is absent — never returns a stub. */
export function liveContract(): LiveContract {
  if (cached) return cached;
  let raw: string;
  try {
    raw = readFileSync(CONTRACT_PATH, 'utf-8');
  } catch {
    // An absent contract is UNVERIFIED, and UNVERIFIED is never an empty success.
    // Returning {} here would make every existence check below silently pass.
    throw new Error(
      `Cotality contract missing at ${CONTRACT_PATH}. ` +
        `Run: npm run cotality:pull-contract`,
    );
  }
  cached = JSON.parse(raw) as LiveContract;
  return cached;
}

/** Every resource the provider declares. */
export function resources(): string[] {
  return Object.keys(liveContract().entityTypes).sort();
}

/** Fields and navigation properties declared on one resource. */
export function fieldsOn(resource: string): Record<string, CotalityField> {
  const rt = liveContract().entityTypes[resource];
  if (!rt) throw new Error(`Cotality contract declares no resource "${resource}"`);
  return { ...rt.properties, ...rt.navigation };
}

/** One field's declaration on one resource, or null. */
export function field(resource: string, name: string): CotalityField | null {
  return fieldsOn(resource)[name] ?? null;
}

/** Which resources declare this field name. Empty means the provider has no such field. */
export function declaringResources(name: string): string[] {
  const c = liveContract();
  return Object.keys(c.entityTypes)
    .filter((r) => c.entityTypes[r].properties?.[name] || c.entityTypes[r].navigation?.[name])
    .sort();
}

/** Does the provider declare this field name anywhere? */
export function isLiveField(name: string): boolean {
  return declaringResources(name).length > 0;
}

/**
 * Every field name the provider declares, across every resource.
 *
 * This is the set a phantom-field guard checks against: a name absent from here
 * is absent from the provider, not merely absent from one resource.
 */
export function allFieldNames(): Set<string> {
  const c = liveContract();
  const out = new Set<string>();
  for (const r of Object.keys(c.entityTypes)) {
    for (const n of Object.keys(c.entityTypes[r].properties || {})) out.add(n);
    for (const n of Object.keys(c.entityTypes[r].navigation || {})) out.add(n);
  }
  return out;
}

/** Members of a provider enum, or null when the provider declares no such enum. */
export function enumMembers(enumType: string): CotalityEnumMember[] | null {
  return liveContract().enums[enumType] ?? null;
}

/** Member names of the enum backing a field, or null if the field is not an enum. */
export function enumMembersFor(resource: string, name: string): string[] | null {
  const f = field(resource, name);
  if (!f || f.kind !== 'enum') return null;
  const members = enumMembers(f.enumType);
  return members ? members.map((m) => m.name) : null;
}

/** Provenance, for tests and reports that must state where a fact came from. */
export function provenance(): { source: string; pulledAt: string; runId: string | null } {
  const c = liveContract();
  return { source: c.source, pulledAt: c.pulled_at, runId: c.run_id ?? null };
}
