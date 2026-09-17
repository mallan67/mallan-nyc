/**
 * THE COTALITY CONTRACT — access layer over the generated, live-derived provider truth.
 *
 * `lib/cotality/generated/contract.ts` is generated from the authenticated Cotality API
 * (`npm run cotality:compile:light && npm run cotality:generate`) and carries, for every one of the
 * 17 resources and 1,456 declared fields: the exact live name and type, the published vocabulary as
 * a string-literal union, and the MEASURED facts (filterable, populated, RLS-listed, entitlement).
 *
 * This module is how runtime code binds to it:
 *
 *   - `cotalityFields('Property', [...])` — a field list the COMPILER checks. A phantom name
 *     (`IDXEntireListingDisplayYN`, `ParticipantOnlyYN`, `FirstShowingDate`) is a type error.
 *   - `CotalityRow<'Property'>` — the shape of a provider row. `raw.StandardStatus === 'Cancelled'`
 *     is a type error (the live member is `Canceled`).
 *   - `assertFilterable` / `assertExpandable` / `assertAccessible` — fail-closed guards for query
 *     builders: a `$filter` on a provider-suppressed field, an `$expand` the provider rejects, or a
 *     resource this subscription cannot read throws BEFORE a request is made.
 *   - `cotalityFieldFact` / `zeroPopulatedFields` — facts for derivation code. A field with
 *     `populated: 0` is declared, selectable and EMPTY on this feed; that is a fact to record as
 *     UNVERIFIED downstream, never a licence to read some other field instead.
 *
 * Nothing here consults a snapshot other than the generated contract, and the generated contract
 * is regenerated — never edited — when the provider changes (metadata_sha moves).
 */
import {
  COTALITY_ACCESS,
  COTALITY_CONTRACT,
  COTALITY_FIELD_FACTS,
  COTALITY_NAVIGATIONS,
  COTALITY_RESOURCES,
  type CotalityFieldFact,
  type CotalityNavigationMap,
  type CotalityResource,
  type CotalityResourceMap,
} from './generated/contract';

export { COTALITY_CONTRACT, COTALITY_RESOURCES };
export type { CotalityFieldFact, CotalityNavigationMap, CotalityResource, CotalityResourceMap };

/** A declared, `$select`-able field name on a resource. Navigation properties are NOT fields. */
export type CotalityField<R extends CotalityResource> = keyof CotalityResourceMap[R] & string;

/** A navigation property name on a resource (an `$expand` target, as declared in $metadata). */
export type CotalityNavigation<R extends CotalityResource> = keyof CotalityNavigationMap[R] & string;

/**
 * A provider row as delivered by `$select` (+ optional `$expand`): every field optional (absent when
 * not selected), exactly typed when present; navigation payloads typed by their target resource.
 * Use this as the parameter type of anything that reads a payload.
 */
export type CotalityRow<R extends CotalityResource> = Partial<CotalityResourceMap[R]> & Partial<CotalityNavigationMap[R]>;

export type CotalityContractErrorCode =
  | 'UNKNOWN_RESOURCE'
  | 'UNKNOWN_FIELD'
  | 'UNKNOWN_NAVIGATION'
  | 'NOT_FILTERABLE'
  | 'NOT_EXPANDABLE'
  | 'RESOURCE_REJECTED'
  | 'UNMEASURED';

export class CotalityContractError extends Error {
  readonly code: CotalityContractErrorCode;
  constructor(code: CotalityContractErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'CotalityContractError';
    this.code = code;
  }
}

/**
 * Identity at runtime; the value is the compile-time check. `const F` keeps the literal tuple so the
 * result is typed as exactly the names passed, and every name must be a declared field of `resource`.
 */
export function cotalityFields<R extends CotalityResource, const F extends readonly CotalityField<R>[]>(
  resource: R,
  fields: F,
): F {
  void resource;
  return fields;
}

export function isCotalityResource(name: string): name is CotalityResource {
  return (COTALITY_RESOURCES as readonly string[]).includes(name);
}

export function isCotalityField<R extends CotalityResource>(resource: R, name: string): name is CotalityField<R> {
  const facts = COTALITY_FIELD_FACTS[resource] as Record<string, CotalityFieldFact> | undefined;
  return Boolean(facts) && Object.prototype.hasOwnProperty.call(facts, name);
}

/** The names in `names` that are NOT declared on `resource`, in input order. The census primitive. */
export function unknownFields<R extends CotalityResource>(resource: R, names: readonly string[]): string[] {
  return names.filter((n) => !isCotalityField(resource, n));
}

export function cotalityFieldFact<R extends CotalityResource>(resource: R, field: CotalityField<R>): CotalityFieldFact {
  if (!isCotalityResource(resource)) throw new CotalityContractError('UNKNOWN_RESOURCE', `${String(resource)} is not a Cotality resource on this subscription`);
  if (!isCotalityField(resource, field)) throw new CotalityContractError('UNKNOWN_FIELD', `${resource}.${String(field)} is not declared in the live $metadata`);
  return (COTALITY_FIELD_FACTS[resource] as Record<string, CotalityFieldFact>)[field];
}

export function accessOf(resource: CotalityResource): { state: 'accessible' | 'rejected' | 'unmeasured'; http: number | null } {
  if (!isCotalityResource(resource)) throw new CotalityContractError('UNKNOWN_RESOURCE', `${String(resource)} is not a Cotality resource on this subscription`);
  return COTALITY_ACCESS[resource];
}

/** Throws unless this subscription was measured able to read `resource`. */
export function assertAccessible(resource: CotalityResource): void {
  const a = accessOf(resource);
  if (a.state === 'rejected') throw new CotalityContractError('RESOURCE_REJECTED', `${resource} is rejected on this subscription (HTTP ${a.http})`);
  if (a.state !== 'accessible') throw new CotalityContractError('UNMEASURED', `${resource} entitlement was not measured; regenerate the contract with --light or --full`);
}

/** true / false when measured; null when unmeasured. Throws only for an undeclared field. */
export function isFilterable<R extends CotalityResource>(resource: R, field: CotalityField<R>): boolean | null {
  return cotalityFieldFact(resource, field).filterable;
}

/** Throws unless `$filter` on `resource.field` was measured accepted by the provider. */
export function assertFilterable<R extends CotalityResource>(resource: R, field: CotalityField<R>): void {
  const f = cotalityFieldFact(resource, field);
  if (f.filterable === false) throw new CotalityContractError('NOT_FILTERABLE', `${resource}.${String(field)} is provider-suppressed for $filter/$orderby (HTTP 400)`);
  if (f.filterable !== true) throw new CotalityContractError('UNMEASURED', `${resource}.${String(field)} filterability was not measured; regenerate the contract with --light or --full`);
}

/** Throws unless `$expand=<navigation>` on `resource` was measured SUPPORTED. */
export function assertExpandable<R extends CotalityResource>(resource: R, navigation: CotalityNavigation<R>): void {
  const navs = COTALITY_NAVIGATIONS[resource] as Record<string, { target: string; collection: boolean; expand: string | null; http: number | null }>;
  const nav = Object.prototype.hasOwnProperty.call(navs, navigation) ? navs[navigation as string] : undefined;
  if (!nav) throw new CotalityContractError('UNKNOWN_NAVIGATION', `${resource}.${String(navigation)} is not a declared navigation property`);
  if (nav.expand === 'SUPPORTED') return;
  if (nav.expand == null) throw new CotalityContractError('UNMEASURED', `${resource}.${String(navigation)} $expand was not measured`);
  throw new CotalityContractError('NOT_EXPANDABLE', `${resource}.${String(navigation)} $expand is rejected by the provider (HTTP ${nav.http})`);
}

/** Fields of `resource` that are declared, filterable, and EMPTY on the live feed (populated === 0). */
export function zeroPopulatedFields<R extends CotalityResource>(resource: R): CotalityField<R>[] {
  const facts = COTALITY_FIELD_FACTS[resource] as Record<string, CotalityFieldFact>;
  return (Object.keys(facts) as CotalityField<R>[]).filter((f) => facts[f].populated === 0);
}

/**
 * Multi-select enum values arrive as comma-joined member names (e.g. `Permission: "IDX"`,
 * `InteriorOrRoomFeatures: "Elevator,Doorman"`). Split, trim, drop empties. An array is returned
 * verbatim (trimmed) so callers are agnostic to the serialization.
 */
export function splitMultiEnum(value: unknown): string[] {
  if (value == null) return [];
  const parts = Array.isArray(value) ? value.map((v) => String(v)) : String(value).split(',');
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
