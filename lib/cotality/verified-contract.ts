/**
 * The LAST VERIFIED Cotality acquisition, as a cached projection.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND THE QUESTION IT MAY ANSWER
 *
 * This module reads `data/cotality-contract.live.json`, which was produced by
 * `npm run cotality:pull-contract` from the authenticated API. It answers
 * exactly one question:
 *
 *     "What did the LAST VERIFIED Cotality acquisition declare?"
 *
 * It may NOT be reported as "Cotality currently declares this." Presence in Git
 * proves a file exists; it does not prove a provider fact was verified in the
 * current session. Treating a tracked projection as live authority is how the
 * deleted XML capture came to answer provider questions for months, and this
 * file must not become that capture in JSON clothing.
 *
 * USE THE CACHE FOR: deterministic tests, drift comparison, type and resource
 * lookup, and CI that cannot reach the provider.
 *
 * REQUIRE CURRENT-RUN LIVE VERIFICATION FOR: changing a provider mapping,
 * approving a new field, changing an enum or picklist, changing resource
 * ownership, any capability or permission conclusion, and final acceptance.
 * That is owned by `cotality:pull-contract` and the run-id handshake in
 * `scripts/cotality/build-crm-field-contract.mjs` — not by this module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FAIL CLOSED
 *
 * The projection is validated on load: provider host, a parseable acquisition
 * timestamp, a non-empty acquisition id, and the expected structure. Any failure
 * THROWS. There is no stub and no empty result, because an empty result would
 * make every existence check below silently pass — the same failure shape as an
 * HTTP error collapsing to zero rows.
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

interface VerifiedProjection {
  source: string;
  pulled_at: string;
  run_id: string;
  entityTypes: Record<
    string,
    { properties: Record<string, CotalityField>; navigation: Record<string, CotalityNavigation> }
  >;
  enums: Record<string, CotalityEnumMember[]>;
}

/** The one provider host. A projection sourced elsewhere is not Cotality's. */
const REQUIRED_HOST = 'api.cotality.com';

/**
 * Resolved per call, not at module load, so a test can point at a fixture
 * without reloading the module. Production never sets the override.
 */
function projectionPath(): string {
  return (
    process.env.COTALITY_CONTRACT_PATH ||
    resolve(__dirname, '..', '..', 'data', 'cotality-contract.live.json')
  );
}

let cached: VerifiedProjection | null = null;

export class UnverifiedCotalityProjectionError extends Error {
  constructor(reason: string) {
    super(
      `Cotality projection is UNVERIFIED: ${reason}. ` +
        `UNVERIFIED is never success — regenerate with: npm run cotality:pull-contract`,
    );
    this.name = 'UnverifiedCotalityProjectionError';
  }
}

function validate(doc: unknown): VerifiedProjection {
  if (!doc || typeof doc !== 'object') {
    throw new UnverifiedCotalityProjectionError('not a JSON object');
  }
  const d = doc as Partial<VerifiedProjection>;

  // Provenance. Each of these was a real hole at some point in this workstream:
  // the acquisition timestamp was once caller-supplied, and a projection with no
  // acquisition id predates the current-run guarantee entirely.
  let host: string;
  try {
    host = new URL(String(d.source)).host;
  } catch {
    throw new UnverifiedCotalityProjectionError(`source is not a URL: ${String(d.source)}`);
  }
  if (host !== REQUIRED_HOST) {
    throw new UnverifiedCotalityProjectionError(`source host is ${host}, not ${REQUIRED_HOST}`);
  }
  if (!Number.isFinite(Date.parse(String(d.pulled_at)))) {
    throw new UnverifiedCotalityProjectionError(
      `acquisition timestamp is not parseable: ${String(d.pulled_at)}`,
    );
  }
  if (typeof d.run_id !== 'string' || d.run_id.trim().length === 0) {
    throw new UnverifiedCotalityProjectionError('carries no acquisition id');
  }

  // Structure. A projection that parsed but declares nothing would answer every
  // "does this field exist" question with "no" and pass every absence assertion.
  if (!d.entityTypes || typeof d.entityTypes !== 'object' || Object.keys(d.entityTypes).length === 0) {
    throw new UnverifiedCotalityProjectionError('declares no resources');
  }
  if (!d.enums || typeof d.enums !== 'object' || Object.keys(d.enums).length === 0) {
    throw new UnverifiedCotalityProjectionError('declares no enums');
  }
  for (const [name, rt] of Object.entries(d.entityTypes)) {
    if (!rt || typeof rt !== 'object' || typeof (rt as { properties?: unknown }).properties !== 'object') {
      throw new UnverifiedCotalityProjectionError(`resource ${name} has no properties map`);
    }
  }
  return d as VerifiedProjection;
}

/**
 * The validated projection of the last verified acquisition.
 *
 * Throws rather than returning a stub — see the fail-closed note above.
 */
export function verifiedProjection(): VerifiedProjection {
  if (cached) return cached;
  let raw: string;
  try {
    raw = readFileSync(projectionPath(), 'utf-8');
  } catch {
    throw new UnverifiedCotalityProjectionError(`absent at ${projectionPath()}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new UnverifiedCotalityProjectionError(`unparseable JSON (${(e as Error).message})`);
  }
  cached = validate(parsed);
  return cached;
}

/** Test seam: drop the memoised projection so a different fixture can be loaded. */
export function resetVerifiedProjectionCache(): void {
  cached = null;
}

/** Every resource the last verified acquisition declared. */
export function resources(): string[] {
  return Object.keys(verifiedProjection().entityTypes).sort();
}

/** Fields and navigation properties declared on one resource. */
export function fieldsOn(resource: string): Record<string, CotalityField> {
  const rt = verifiedProjection().entityTypes[resource];
  if (!rt) throw new Error(`Cotality projection declares no resource "${resource}"`);
  return { ...rt.properties, ...rt.navigation };
}

/** One field's declaration on one resource, or null. */
export function field(resource: string, name: string): CotalityField | null {
  return fieldsOn(resource)[name] ?? null;
}

/**
 * Which resources declare this field name.
 *
 * A bare field name is not an identity — StandardStatus is declared on eight
 * resources — so callers that need identity must qualify it.
 */
export function declaringResources(name: string): string[] {
  const c = verifiedProjection();
  return Object.keys(c.entityTypes)
    .filter((r) => c.entityTypes[r].properties?.[name] || c.entityTypes[r].navigation?.[name])
    .sort();
}

/** Did the last verified acquisition declare this field name anywhere? */
export function isDeclaredField(name: string): boolean {
  return declaringResources(name).length > 0;
}

/**
 * Every field name declared across every resource.
 *
 * This is the set a phantom-field guard checks against: a name absent here was
 * absent from the provider at acquisition, not merely absent from one resource.
 */
export function allFieldNames(): Set<string> {
  const c = verifiedProjection();
  const out = new Set<string>();
  for (const r of Object.keys(c.entityTypes)) {
    for (const n of Object.keys(c.entityTypes[r].properties || {})) out.add(n);
    for (const n of Object.keys(c.entityTypes[r].navigation || {})) out.add(n);
  }
  return out;
}

/** Members of a provider enum, or null when no such enum was declared. */
export function enumMembers(enumType: string): CotalityEnumMember[] | null {
  return verifiedProjection().enums[enumType] ?? null;
}

/** Member names of the enum backing a field, or null if the field is not an enum. */
export function enumMembersFor(resource: string, name: string): string[] | null {
  const f = field(resource, name);
  if (!f || f.kind !== 'enum') return null;
  const members = enumMembers(f.enumType);
  return members ? members.map((m) => m.name) : null;
}

/**
 * Where and when these facts were acquired.
 *
 * Any report quoting a provider fact from this module must quote this alongside
 * it, so a reader can tell a cached answer from a current-run one.
 */
export function acquisition(): { source: string; acquiredAt: string; runId: string } {
  const c = verifiedProjection();
  return { source: c.source, acquiredAt: c.pulled_at, runId: c.run_id };
}
