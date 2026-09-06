/**
 * Payload Normalizer — prepares a Mallan listing-form payload for Mallan storage.
 *
 * Consumes the MALLAN form contract (lib/listings/mallan-form-contract.ts) and the REBNY/UCBA rules
 * (lib/compliance/rebny-ucba-rules.ts). It does NOT define a provider schema: field existence,
 * spelling and enum membership are the live Cotality contract (lib/cotality/live-contract.ts); the
 * server-owned vocabulary conversion (lib/crm/listing-form-mapping.ts) runs BEFORE this normalizer.
 *
 * Steps:
 *   1. Strip removed fields (NAR Settlement — REBNY/UCBA rule)
 *   2. Rename Mallan form aliases → the stored field name (live Cotality field or Mallan-internal key)
 *   3. Normalize Mallan form VALUES via valueAliases
 *   4. Fold legacy permission booleans into the Mallan decision key `_mallanPermission`
 *   5. Apply defaults (InternetEntireListingDisplayYN)
 *
 * A Mallan status or permission decision never lands under a provider field name
 * (MlsStatus / StandardStatus / Permission).
 */

import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';
import { REBNY_UCBA_RULES } from './rebny-ucba-rules';

type Payload = Record<string, unknown>;

/** Provider field names a Mallan-authored payload must never carry (they are Mallan decisions under Mallan keys). */
const PROVIDER_DECISION_FIELDS = new Set(['MlsStatus', 'StandardStatus', 'Permission', 'Permissions']);

/**
 * Normalize a raw form payload into Mallan's stored field names and values.
 * Returns a new object — does not mutate the input.
 */
export function normalizePayload(raw: Payload): {
  normalized: Payload;
  stripped: string[];
  renamed: Array<{ from: string; to: string }>;
  valueNormalized: Array<{ field: string; from: unknown; to: unknown }>;
} {
  const normalized: Payload = {};
  const stripped: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];
  const valueNormalized: Array<{ field: string; from: unknown; to: unknown }> = [];

  const removedSet = new Set<string>(REBNY_UCBA_RULES.removedFields);
  const aliasMap = MALLAN_FORM_CONTRACT.aliasToCanonical as Record<string, string>;
  const valueAliasMap = MALLAN_FORM_CONTRACT.valueAliases as Record<string, Record<string, string>>;

  for (const [key, value] of Object.entries(raw)) {
    // Step 1: Strip removed fields
    if (removedSet.has(key)) {
      stripped.push(key);
      continue;
    }

    // Legacy participant-only booleans → the Mallan decision (Step 4)
    if (key === 'participantOnlyYN' || key === 'ParticipantOnlyYN') {
      if (value === true && normalized._mallanPermission === undefined) {
        normalized._mallanPermission = 'Private';
        renamed.push({ from: key, to: '_mallanPermission' });
      }
      continue;
    }

    // Step 2: Rename alias → stored field name
    let canonicalKey = key;
    if (aliasMap[key]) {
      canonicalKey = aliasMap[key];
      renamed.push({ from: key, to: canonicalKey });
    }

    // Step 3: Normalize form values
    let finalValue = value;
    if (typeof value === 'string' && valueAliasMap[canonicalKey]) {
      const mapped = valueAliasMap[canonicalKey][value];
      if (mapped !== undefined) {
        valueNormalized.push({ field: canonicalKey, from: value, to: mapped });
        finalValue = mapped;
      }
    }

    // Don't overwrite a canonical key with an alias value if canonical already set
    if (normalized[canonicalKey] === undefined || key === canonicalKey) {
      normalized[canonicalKey] = finalValue;
    }
  }

  // A provider-named status / permission can only have arrived through an alias that has already
  // been redirected to its Mallan key; anything left under the provider name is dropped here.
  for (const f of PROVIDER_DECISION_FIELDS) {
    if (f in normalized) { delete normalized[f]; stripped.push(f); }
  }

  // Step 5: Apply defaults
  // InternetEntireListingDisplayYN is the live Cotality master display flag; the form supplies it
  // explicitly, and an absent value means "not opted out".
  if (normalized['InternetEntireListingDisplayYN'] === undefined) {
    normalized['InternetEntireListingDisplayYN'] = true;
  }

  return { normalized, stripped, renamed, valueNormalized };
}

/**
 * Derive the two gate columns from the Mallan permission decision (`_mallanPermission`).
 * Returns { owner_opt_out: boolean, participant_only: boolean }.
 */
export function derivePermissionBooleans(mallanPermission: unknown): {
  owner_opt_out: boolean;
  participant_only: boolean;
} {
  if (!mallanPermission || mallanPermission === 'Public') {
    return { owner_opt_out: false, participant_only: false };
  }
  return {
    owner_opt_out: mallanPermission === 'OwnerOptOut',
    participant_only: mallanPermission === 'Private',
  };
}

/**
 * Build the structured DB record from a normalized payload using the Mallan persistence map.
 * Returns { address, features, agentInfo, compliance, raw_data, topLevel }.
 */
export function buildPersistenceRecord(normalized: Payload): {
  address: Record<string, unknown>;
  features: Record<string, unknown>;
  agentInfo: Record<string, unknown>;
  topLevel: Record<string, unknown>;
  raw_data: Payload;
} {
  const address: Record<string, unknown> = {};
  const features: Record<string, unknown> = {};
  const agentInfo: Record<string, unknown> = {};
  const topLevel: Record<string, unknown> = {};

  const pMap = MALLAN_FORM_CONTRACT.persistenceMap as Record<string, {
    db?: string;
    address?: boolean;
    features?: boolean;
    agentInfo?: boolean;
    raw?: boolean;
    removed?: boolean;
    deriveBooleans?: Record<string, { db: string }>;
    defaultPublic?: boolean;
  }>;

  for (const [key, value] of Object.entries(normalized)) {
    const target = pMap[key];
    if (!target) continue; // Field not in persistence map → raw_data only
    if (target.removed) continue; // Removed field

    if (target.address) address[key] = value;
    if (target.features) features[key] = value;
    if (target.agentInfo) agentInfo[key] = value;
    if (target.db) topLevel[target.db] = value;

    // Derive the gate columns from the Mallan permission decision
    if (target.deriveBooleans && typeof value === 'string') {
      for (const [enumVal, config] of Object.entries(target.deriveBooleans)) {
        topLevel[config.db] = value === enumVal;
      }
      if (target.defaultPublic && !value) {
        for (const config of Object.values(target.deriveBooleans)) topLevel[config.db] = false;
      }
    }
  }

  // raw_data = full normalized payload (minus removed fields, already stripped)
  const raw_data = { ...normalized };

  return { address, features, agentInfo, topLevel, raw_data };
}
