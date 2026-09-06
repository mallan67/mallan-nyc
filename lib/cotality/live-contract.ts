/**
 * THE provider field contract — read from the dated live Cotality pulls.
 *
 *   data/cotality-property-fields.live.json  (Property field names, pulled live)
 *   data/cotality-enums.live.json            (enum members, pulled live)
 *
 * Both files are GENERATED from api.cotality.com and drift-checked (`npm run cotality:compile`,
 * `npm run cotality:verify`). No REBNY CSV, no RESO document, no hand-typed list is a field
 * authority: field existence, spelling and enum membership come from here. REBNY/UCBA rules
 * (lib/compliance/rebny-ucba-rules.ts) and Mallan persistence (lib/listings/mallan-form-contract.ts)
 * are applied AFTER this contract, never instead of it.
 *
 * lib/search/canonical/live-truth.ts pins the executor's vocabulary from the same pulls; it is
 * reserved for the Search engine (A1 contract). Everything else reads this module.
 */
import fieldPull from '@/data/cotality-property-fields.live.json';
import enumPull from '@/data/cotality-enums.live.json';

type FieldPull = { pulled_at?: string; fields: string[] };
type EnumPull = { pulled_at?: string; enums: Record<string, string[]> };

const FIELDS = fieldPull as unknown as FieldPull;
const ENUMS = enumPull as unknown as EnumPull;

export const COTALITY_CONTRACT_PULLED_AT: string = ENUMS.pulled_at ?? FIELDS.pulled_at ?? 'unknown';

/** Every live Cotality Property field name. */
export const LIVE_PROPERTY_FIELDS: ReadonlySet<string> = new Set(FIELDS.fields);

export function isLiveCotalityField(name: string): boolean {
  return LIVE_PROPERTY_FIELDS.has(name);
}

/** Live enum members for a field, or null when the field is not an enum on the live resource. */
export function liveEnumMembers(field: string): readonly string[] | null {
  const m = ENUMS.enums[field];
  return Array.isArray(m) ? m : null;
}

export function isLiveEnumMember(field: string, value: unknown): boolean {
  const m = liveEnumMembers(field);
  return !!m && typeof value === 'string' && m.includes(value);
}

/** Live StandardStatus members (11 on the dated pull). The ONLY provider status vocabulary. */
export const COTALITY_STANDARD_STATUS_MEMBERS: readonly string[] = Object.freeze([...(liveEnumMembers('StandardStatus') ?? [])]);
/** Live MlsStatus members. Not filterable live and null on every sampled row (2026-09-06); kept for completeness only. */
export const COTALITY_MLS_STATUS_MEMBERS: readonly string[] = Object.freeze([...(liveEnumMembers('MlsStatus') ?? [])]);

export function isCotalityStandardStatus(value: unknown): value is string {
  return typeof value === 'string' && COTALITY_STANDARD_STATUS_MEMBERS.includes(value);
}
