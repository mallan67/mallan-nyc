/**
 * lib/scanner/scoring/types.ts
 *
 * Types for the seller-intent scoring engine. Inputs are denormalized
 * per-BBL prospect bundles (PLUTO context + ACRIS distress signals +
 * Trestle off-market signals + DOS Corp matches). Output is a scored
 * prospect with full per-reason explainability.
 *
 * Design philosophy (per Maya's WIP doc):
 *   - Rules-based weighted scoring, NOT machine learning. NYC luxury
 *     deal volume (30–80/yr) is too small for reliable supervised ML.
 *   - Half-life style decay matches the WIP doc's "profile decay with
 *     half-lives" framing.
 *   - Per-signal explainability — every score has a `reasons[]` array
 *     so the operator can see WHY the score is what it is. Required
 *     for compliance audit ("why did you reach out to this owner?").
 *   - Compliance gate is the LAST step. A prospect that scores 95 but
 *     is on the suppression list comes out with score=0 and the
 *     suppression reason in `suppression_reasons[]`.
 */

/** A single reason contributing to a prospect's score. */
export interface ScoreReason {
  /** Stable signal identifier (`lis_pendens`, `off_market_expired`, etc.) */
  signal: string;
  /** Max weight before decay. */
  raw_weight: number;
  /** 0..1 multiplier from time-based decay (0 = signal expired, 1 = fresh). */
  decay_factor: number;
  /** Final contribution = raw_weight × decay_factor. */
  contribution: number;
  /** Human-readable description for display. */
  detail: string;
  /** Source tag (filter module + record id) for audit trail. */
  source: string;
  /** Optional link to the underlying record (ACRIS document, DOS Corp entity, etc.). */
  source_url?: string;
  /** ISO date of the underlying signal event, if applicable. */
  signal_date?: string;
}

/** ACRIS distress signal (denormalized output of acris-filter). */
export interface AcrisDistressSignal {
  doc_id: string;
  doc_type: string;
  category: "lis_pendens" | "foreclosure" | "tax_lien" | "estate";
  document_date?: string;
  recorded_datetime: string;
  document_amt?: string;
  party_name?: string;
}

/** Off-market signal — matches the type from trestle-off-market-filter. */
export interface OffMarketSignalRef {
  mls_id: string | null;
  listing_id: string | null;
  listing_status: string;
  off_market_since: string | null;
  cool_through_date: string | null;
  past_cooling_off: boolean;
  was_mallan_listing: boolean;
  list_price: string | null;
  days_off_market: number | null;
}

/** A DOS Corp record matched by entity name to the BBL's owner. */
export interface DosCorpMatch {
  dos_id: string;
  current_entity_name: string;
  status: string;
  initial_filing_date?: string;
  process_name?: string;
  process_address_full?: string;
  match_kind: "exact_normalized" | "stripped_match" | "fuzzy";
}

/** PLUTO context for the BBL. */
export interface PlutoContext {
  bbl: string;
  owner_name: string;
  owner_type?: string;
  address: string;
  zip?: string;
  year_built?: number | null;
  units_res?: number | null;
  units_total?: number | null;
  built_far?: number | null;
  assess_tot?: number | null;
  exempt_tot?: number | null;
  /** PLUTO mailing address — used for absentee detection. */
  mailing_address?: string;
  property_address?: string;
  latitude?: number;
  longitude?: number;
}

/** Full per-BBL prospect input bundle (assembled from all upstream signal sources). */
export interface BblProspect {
  bbl: string;
  pluto: PlutoContext;
  acris_signals?: AcrisDistressSignal[];
  off_market_signals?: OffMarketSignalRef[];
  off_market_relist_count_24mo?: number;
  dos_matches?: DosCorpMatch[];
  /** Computed at upstream join: years since last deed (from ACRIS deed history). */
  ownership_duration_years?: number | null;
  /** Computed: PLUTO mailing address ≠ property address. */
  is_absentee?: boolean;
  /** Computed: at least one DOS match has non-active status. */
  is_dissolved_llc?: boolean;
}

/** Scoring rule weights + decay parameters. */
export interface ScoringConfig {
  /** Max contribution from a recent lis pendens. Decays linearly over `decay_days`. */
  lis_pendens: { max_weight: number; decay_days: number };
  foreclosure: { max_weight: number; decay_days: number };
  tax_lien: { max_weight: number; decay_days: number };
  estate: { max_weight: number; decay_days: number };
  off_market_expired: { max_weight: number; decay_days: number };
  off_market_relist_boost: { threshold: number; weight: number };
  long_ownership_25y: { weight: number };
  long_ownership_40y: { weight: number };
  recent_purchase_penalty: { years: number; weight: number };
  dissolved_llc: { weight: number };
  absentee_owner: { weight: number };
  /** Multi-signal convergence: when 3+ distinct categories hit. */
  convergence_boost: { threshold: number; weight: number };
  /** Hard cap on final score. */
  max_score: number;
  /** Minimum score below which we don't surface to a queue at all. */
  min_score_to_surface: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  lis_pendens: { max_weight: 35, decay_days: 730 },          // 2 years
  foreclosure: { max_weight: 30, decay_days: 365 },          // 1 year
  tax_lien: { max_weight: 20, decay_days: 730 },             // 2 years
  estate: { max_weight: 25, decay_days: 1095 },              // 3 years
  off_market_expired: { max_weight: 30, decay_days: 365 },   // 1 year
  off_market_relist_boost: { threshold: 3, weight: 15 },
  long_ownership_25y: { weight: 10 },
  long_ownership_40y: { weight: 5 },
  recent_purchase_penalty: { years: 2, weight: -10 },
  dissolved_llc: { weight: 15 },
  absentee_owner: { weight: 10 },
  convergence_boost: { threshold: 3, weight: 10 },
  max_score: 100,
  min_score_to_surface: 25,
};

/** Confidence tiers for the scored prospect. */
export type ScoreConfidence = "high" | "medium" | "low" | "below_threshold";

/** Output of the scoring engine. */
export interface ScoredProspect {
  bbl: string;
  /** Score after compliance gate + cap. 0..max_score. */
  score: number;
  /** Score before compliance gate + cap (sum of all reasons' contributions). */
  raw_score: number;
  reasons: ScoreReason[];
  confidence: ScoreConfidence;
  /** True when isSuppressed() returned true — score forced to 0. */
  suppressed: boolean;
  suppression_reasons: string[];
  /** Number of distinct signal categories that contributed. */
  signal_category_count: number;
  /** Most recent signal date (ACRIS recorded_datetime, off-market expiry, etc.). */
  most_recent_signal_at: string | null;
  /** When this score was computed. */
  scored_at: string;
}
