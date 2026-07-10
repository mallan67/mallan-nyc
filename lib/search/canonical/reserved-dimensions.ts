/**
 * reserved-dimensions.ts — future contract dimensions, RESERVED as type placeholders only.
 *
 * Backend-Search-1 is the foundation for agent intelligence, reports, marketing, client searches,
 * valuation-style analysis, investor reports, and analytics. The contract must KNOW these dimensions
 * exist even though implementation is later. Every entry is:
 *
 *     reserved | not wired | no schema | no runtime behavior
 *
 * These are documentation + type anchors so downstream PRs slot in without a v2 rewrite. There is
 * NO implementation, NO import into any reader, and NO migration here.
 */

export type ReservedStatus = 'reserved';

export interface ReservedDimension {
  key: string;
  title: string;
  status: ReservedStatus;
  wired: false;
  schema: false;
  runtimeBehavior: false;
  purpose: string;
}

function reserved(key: string, title: string, purpose: string): ReservedDimension {
  return { key, title, status: 'reserved', wired: false, schema: false, runtimeBehavior: false, purpose };
}

export const RESERVED_DIMENSIONS: readonly ReservedDimension[] = Object.freeze([
  reserved('entity_type', 'Multi-entity model', 'listing | building | contact | buyer_need | collection | engagement_event | market_snapshot | comp_set — the demand/relationship side of the brokerage.'),
  reserved('temporal', 'Temporal / event history', 'append-only listing_events + ingest meta (first_seen_at, canonical_id) + periodic snapshots — the spine for analytics/alerts/badges.'),
  reserved('economics', 'Economics', 'carrying cost (maintenance/CC/taxes/assessment → total monthly) + rental economics (net effective rent, concessions, lease term, FARE fee payer).'),
  reserved('data_quality', 'Data quality / confidence', '{confidence, provenance, freshness, is_estimated} envelope on fields and derived outputs.'),
  reserved('identity', 'Identity / dedup', 'canonical listing identity across relists + ACRIS/MLS/exclusive; canonical Building (BBL + unit-lot) and neighborhood geometry.'),
  reserved('entitlement', 'Entitlement', 'fine-grained access beyond the 4-value audience enum: per-user/role/collection/share-scope + RLS audience scoping + co-broke-comp gating.'),
  reserved('engagement', 'Engagement', 'append-only who-sent-what-to-whom + view/dwell/favorite/comment stream, per-recipient.'),
  reserved('media_intelligence', 'Media intelligence', 'media manifest + hero/photo-quality/floorplan/tour flags + listing-completeness score as a card-quality gate.'),
  reserved('market_metric', 'Market metric', 'registry-defined derived outputs (absorption, months-of-supply, list-to-sale, DOM clocks, price-cut) segmented by ownership × new-dev/resale.'),
  reserved('preference_semantics', 'Preference semantics', 'must-have (required, exclusionary) vs nice-to-have (weighted) on saved-searches/buyer-needs + optional embedding for hybrid retrieval.'),
  reserved('exclusive_syndication', 'Exclusive / syndication', 'pre-public rules (Coming-Soon ≤14d no-DOM, Participant-Only, Owner-Opt-Out) + UCBA "Off-Market" label prohibition + syndication boundaries.'),
  reserved('report_methodology', 'Report methodology / audit', 'report-provenance envelope (prepared by/for, sources, excluded comps, adjustments, assumptions, confidence, freshness, version) + audit trail.'),
]);

/** Reserved dimensions are never implemented here — they must not report as wired. */
export function isReservedOnly(dim: ReservedDimension): boolean {
  return dim.status === 'reserved' && !dim.wired && !dim.schema && !dim.runtimeBehavior;
}
