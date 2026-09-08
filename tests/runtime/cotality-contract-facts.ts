/**
 * Cotality contract facts for tests — read from the COMMITTED live-contract snapshot
 * (data/cotality-contract/contract.compact.json + lookups.live.json, compiled from the live
 * api.cotality.com/trestle $metadata and Field / Lookup catalogues; `node scripts/cotality/generate-contract-types.mjs --check`
 * proves lib/cotality/generated/contract.ts matches it).
 *
 * Replaces the former artifacts/metadata.xml snapshot reads (owner ruling 2026-09-08: no old provider
 * reference file may answer a field or vocabulary question). Creds-free, deterministic, dated.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

interface CompactResource { fields?: Record<string, unknown>; navigation?: Record<string, unknown> }
interface Compact { resources: Record<string, CompactResource>; fingerprint?: { acquired_at?: string }; acquired_at?: string }
type Lookups = Record<string, Record<string, { members?: string[] }>>;

const compact = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-contract/contract.compact.json'), 'utf8')) as Compact;
const lookups = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-contract/lookups.live.json'), 'utf8')) as Lookups;

/** When the committed snapshot was acquired from the live feed. */
export const CONTRACT_ACQUIRED_AT: string = compact.fingerprint?.acquired_at ?? compact.acquired_at ?? 'unknown';

/** The field names one live resource declares. */
export function contractFields(resource = 'Property'): Set<string> {
  return new Set(Object.keys(compact.resources[resource]?.fields ?? {}));
}

/** Is `field` declared on `resource` — or, with no resource, on ANY live resource (the old `Property Name="…"` regex matched every entity)? */
export function hasContractField(field: string, resource?: string): boolean {
  if (resource) return contractFields(resource).has(field);
  return Object.values(compact.resources).some((r) => Boolean(r.fields && Object.prototype.hasOwnProperty.call(r.fields, field)));
}

/** Every resource, field, navigation and vocabulary-member name the live contract declares (the old `Name="…"` sweep). */
export function contractNames(): Set<string> {
  const names = new Set<string>();
  for (const [resource, r] of Object.entries(compact.resources)) {
    names.add(resource);
    for (const f of Object.keys(r.fields ?? {})) names.add(f);
    for (const n of Object.keys(r.navigation ?? {})) names.add(n);
  }
  for (const byField of Object.values(lookups)) {
    for (const [field, lk] of Object.entries(byField)) {
      names.add(field);
      for (const m of lk.members ?? []) names.add(m);
    }
  }
  return names;
}

/** The live vocabulary of `field` on `resource` (empty when the field publishes none). */
export function enumMembers(field: string, resource = 'Property'): string[] {
  return lookups[resource]?.[field]?.members ?? [];
}

export function enumHasMember(field: string, member: string, resource = 'Property'): boolean {
  return enumMembers(field, resource).includes(member);
}
