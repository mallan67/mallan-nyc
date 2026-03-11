/**
 * Payload Normalizer — Consumes REBNY_FIELD_TABLES to normalize incoming
 * form payloads before validation or persistence.
 *
 * Steps:
 *   1. Strip removed fields (NAR Settlement)
 *   2. Rename alias keys → canonical RLS names
 *   3. Normalize enum values via valueAliases
 *   4. Apply defaults (IDXEntireListingDisplayYN, SyndicateYN)
 */

import { REBNY_FIELD_TABLES } from './rebny-field-tables';

type Payload = Record<string, unknown>;

/**
 * Normalize a raw form payload into canonical RLS field names and values.
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

  const removedSet = new Set<string>(REBNY_FIELD_TABLES.removedFields);
  const aliasMap = REBNY_FIELD_TABLES.aliasToCanonical as Record<string, string>;
  const valueAliasMap = REBNY_FIELD_TABLES.valueAliases as Record<string, Record<string, string>>;

  for (const [key, value] of Object.entries(raw)) {
    // Step 1: Strip removed fields
    if (removedSet.has(key)) {
      stripped.push(key);
      continue;
    }

    // Step 2: Rename alias → canonical
    let canonicalKey = key;
    if (aliasMap[key]) {
      canonicalKey = aliasMap[key];
      renamed.push({ from: key, to: canonicalKey });
    }

    // Step 3: Normalize enum values
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

  // Step 4: Apply defaults
  if (normalized['IDXEntireListingDisplayYN'] === undefined) {
    normalized['IDXEntireListingDisplayYN'] = true;
  }
  if (normalized['SyndicateYN'] === undefined) {
    normalized['SyndicateYN'] = true;
  }

  return { normalized, stripped, renamed, valueNormalized };
}

/**
 * Derive boolean DB columns from Permissions field.
 * Returns { owner_opt_out: boolean, participant_only: boolean }.
 */
export function derivePermissionBooleans(permissions: unknown): {
  owner_opt_out: boolean;
  participant_only: boolean;
} {
  if (!permissions || permissions === 'Public') {
    return { owner_opt_out: false, participant_only: false };
  }
  return {
    owner_opt_out: permissions === 'OwnerOptOut',
    participant_only: permissions === 'Private',
  };
}

/**
 * Build the structured DB record from a normalized payload using persistenceMap.
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

  const pMap = REBNY_FIELD_TABLES.persistenceMap as Record<string, {
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

    // Route to address bucket
    if (target.address) {
      address[key] = value;
    }

    // Route to features bucket
    if (target.features) {
      features[key] = value;
    }

    // Route to agentInfo bucket
    if (target.agentInfo) {
      agentInfo[key] = value;
    }

    // Route to top-level DB column
    if (target.db) {
      topLevel[target.db] = value;
    }

    // Derive boolean columns from Permissions
    if (target.deriveBooleans && typeof value === 'string') {
      for (const [enumVal, config] of Object.entries(target.deriveBooleans)) {
        topLevel[config.db] = value === enumVal;
      }
      if (target.defaultPublic && !value) {
        // No permission set = public
        for (const config of Object.values(target.deriveBooleans)) {
          topLevel[config.db] = false;
        }
      }
    }
  }

  // raw_data = full normalized payload (minus removed fields, already stripped)
  const raw_data = { ...normalized };

  return { address, features, agentInfo, topLevel, raw_data };
}
