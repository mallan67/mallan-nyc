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
type EnumPull = {
  pulled_at?: string;
  /** Property vocabularies keyed by FIELD name (from the live Lookup endpoint). */
  enums: Record<string, string[]>;
  /** The same, per resource: Property, Media, OpenHouse. */
  resources?: Record<string, Record<string, string[]>>;
  /** Declared type per resource + field, from $metadata (authoritative for TYPE, never for values). */
  types?: Record<string, Record<string, { type: string; isEnum: boolean; isMulti: boolean; enumType: string | null }>>;
};

const FIELDS = fieldPull as unknown as FieldPull;
const ENUMS = enumPull as unknown as EnumPull;

export const COTALITY_CONTRACT_PULLED_AT: string = ENUMS.pulled_at ?? FIELDS.pulled_at ?? 'unknown';

/** Every live Cotality Property field name. */
export const LIVE_PROPERTY_FIELDS: ReadonlySet<string> = new Set(FIELDS.fields);

export function isLiveCotalityField(name: string): boolean {
  return LIVE_PROPERTY_FIELDS.has(name);
}

/**
 * The live vocabulary a FIELD publishes on a RESOURCE (default Property), or null when the provider
 * publishes none for it.
 *
 * Source: the Cotality Lookup endpoint keyed by (ResourceName, FieldName) — NEVER $metadata EnumTypes.
 * Corrected 2026-09-06 after live verification: EnumTypes are shared across resources, are frequently
 * named differently from the field that uses them (60 of the Property enum fields), and over-declare.
 * Concretely, the EnumType named 'Permission' publishes 20 members, but Property.Permission publishes
 * 18 (no 'Idx'/'Vow') and Media.Permission publishes 7 with different casing ('Idx', 'Vow'). Indexing
 * EnumTypes by field name therefore returned the WRONG list for Permission, and null for 121 Property
 * fields that do publish a vocabulary (AssociationFeeFrequency, City, CountyOrParish, every *YN, …),
 * which silently disabled the enum boundary on all of them.
 */
export function liveEnumMembers(field: string, resource: string = 'Property'): readonly string[] | null {
  if (!isLiveEnumField(field, resource)) return null;
  return livePublishedValues(field, resource);
}

/**
 * Is this field's value space a CLOSED provider vocabulary? Read from the declared type in the dated
 * pull. Cotality publishes a Lookup vocabulary for many NON-enum fields too — every `*YN` boolean gets
 * ["false","true"], and free-text fields like City get their observed values. Those document the field;
 * they do not enumerate it. Only a declared-enum field may be member-checked, or the boundary would
 * refuse legitimate values.
 */
export function isLiveEnumField(field: string, resource: string = 'Property'): boolean {
  return ENUMS.types?.[resource]?.[field]?.isEnum === true;
}

/** Is this field declared multi-valued (a Multi-Enum or a collection) on the live resource? */
export function isLiveMultiField(field: string, resource: string = 'Property'): boolean {
  return ENUMS.types?.[resource]?.[field]?.isMulti === true;
}

/**
 * Everything the provider PUBLISHES for a field, enum or not — the raw Lookup vocabulary. Use this for
 * documentation, option labels and diagnostics. For validation use `liveEnumMembers`, which returns
 * null unless the field is a declared enum.
 */
export function livePublishedValues(field: string, resource: string = 'Property'): readonly string[] | null {
  const table = resource === 'Property' ? ENUMS.enums : ENUMS.resources?.[resource];
  const m = table?.[field];
  return Array.isArray(m) ? m : null;
}

/** Every resource whose published vocabularies are carried in the dated pull. */
export const LIVE_VOCABULARY_RESOURCES: readonly string[] = Object.freeze(Object.keys(ENUMS.resources ?? { Property: {} }));

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

export interface LiveEnumViolation { field: string; value: string }

/**
 * The member tokens of a stored enum value: arrays element-wise; a string is one token when it is
 * itself a member, otherwise a comma-separated list. Empty / null → no tokens.
 */
export function enumValueTokens(field: string, value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((v) => enumValueTokens(field, v));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const members = liveEnumMembers(field);
    if (members && members.includes(trimmed)) return [trimmed];
    return trimmed.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [String(value)];
}

/**
 * THE live-enum boundary: every (field, token) on a record where the field is a live enum field and
 * the token is not a live member. Applies to every provider enum field, whatever wrote it.
 */
export function liveEnumViolations(record: Record<string, unknown>): LiveEnumViolation[] {
  const out: LiveEnumViolation[] = [];
  for (const [field, value] of Object.entries(record)) {
    const members = liveEnumMembers(field);
    if (!members) continue;
    for (const token of enumValueTokens(field, value)) {
      if (!members.includes(token)) out.push({ field, value: token });
    }
  }
  return out;
}
