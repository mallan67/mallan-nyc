/**
 * lib/scanner/compliance/types.ts
 *
 * Type definitions for the off-market scanner compliance gate.
 * Loaded from JSON files in data/scanner/compliance/ at module init.
 */

/** GeoJSON polygon feature representing one NY DOS C&D zone. */
export interface CeaseDesistZoneFeature {
  type: "Feature";
  id: string;
  properties: {
    name: string;
    boro: "Manhattan" | "Brooklyn" | "Bronx" | "Queens" | "Staten Island";
    boro_code: "1" | "2" | "3" | "4" | "5";
    zone_id?: string;
    effective_date?: string;
    expires_date?: string;
    notes?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

/** GeoJSON FeatureCollection wrapping the active zones. */
export interface CeaseDesistZonesFile {
  type: "FeatureCollection";
  name: string;
  description: string;
  source: { name: string; url: string; regulatory_basis: string; regulatory_basis_url: string };
  captured_at: string;
  active_through: string;
  refresh_instructions: string;
  manhattan_relevance_note: string;
  features: CeaseDesistZoneFeature[];
}

/** One entry on the per-broker C&D / suppression list. */
export interface SuppressionEntry {
  id: string;
  type: "bbl" | "owner_name" | "phone" | "email" | "address";
  value: string;
  reason: string;
  added_at: string;
  expires_at: string;
  added_by: string;
}

/** Wrapper for the suppression list JSON file. */
export interface SuppressionListFile {
  version: string;
  name: string;
  description: string;
  captured_at: string;
  policy: {
    minimum_exclusion_period_days: number;
    match_modes: string[];
    case_insensitive: boolean;
    whitespace_normalized: boolean;
    expired_entries_handled: string;
  };
  schema: Record<string, string>;
  entries: SuppressionEntry[];
}

/** Input shape for the compliance gate's `isSuppressed()` check. */
export interface SuppressionInput {
  bbl?: string | number | null;
  owner_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Output shape for `isSuppressed()`. */
export interface SuppressionVerdict {
  suppressed: boolean;
  reasons: string[];
  matched_entries: { source: "cease_desist_zone" | "suppression_list"; detail: string }[];
}
