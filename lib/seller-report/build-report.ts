// lib/seller-report/build-report.ts
// SELLER-001 Phase 1 — pure aggregation for the internal (broker/agent-only)
// seller listing report. No DB access here: callers pass pre-fetched rows and
// this function reduces them to aggregate, truth-labeled metrics.
//
// Truth rules (Maya directives 2026-07-03, non-negotiable):
//  - Every metric section carries an explicit truth level (see TRUTH_LEVELS).
//  - Known-vs-anonymous: viewer identity is NEVER exposed — lead_id and
//    ip_hash are internal correlation keys used only for counting; they must
//    not survive into the returned report.
//  - Market context = PROXY metrics from our own listings table only. Never
//    claim competitor or portal traffic without real data.
//  - Everything not yet tracked is named in data_gaps (honesty contract).
//
// Spec: docs/architecture/SELLER-001-SPEC-2026-07-03.md
// Tests: tests/runtime/seller-report-build.test.ts

export const TRUTH_LEVELS = {
  VERIFIED_MALLAN_TRAFFIC: 'VERIFIED_MALLAN_TRAFFIC',
  TRACKED_CAMPAIGN: 'TRACKED_CAMPAIGN',
  PORTAL_REPORTED: 'PORTAL_REPORTED',
  EXTERNAL_PRESENCE: 'EXTERNAL_PRESENCE',
  MARKET_PROXY: 'MARKET_PROXY',
} as const;

export type TruthLevel = (typeof TRUTH_LEVELS)[keyof typeof TRUTH_LEVELS];

export interface SellerReportListingInput {
  listing_id: string;
  address_display: string;
  status: string;
  listing_type: string;
  property_type: string | null;
  borough: string | null;
  list_price: number;
  days_on_market: number;
  first_active_date: string | null;
}

export interface SellerReportViewRow {
  /** Internal correlation key only — MUST NOT appear in the report output. */
  lead_id: string;
  viewed_at: Date;
  device_type: string | null;
  /** Internal correlation key only — MUST NOT appear in the report output. */
  ip_hash: string | null;
  referrer: string | null;
}

export interface SellerReportInquiryRow {
  source: string;
  created_at: Date;
  has_message: boolean;
}

export interface SellerReportShowingRow {
  type: string;
  status: string;
  date: Date;
}

export interface SellerReportActionRow {
  action: string;
  created_at: Date;
}

export interface SimilarActiveRow {
  list_price: number;
  days_on_market: number;
}

export interface SellerReportInput {
  listing: SellerReportListingInput;
  views: SellerReportViewRow[];
  inquiries: SellerReportInquiryRow[];
  showings: SellerReportShowingRow[];
  actions: SellerReportActionRow[];
  similarActives: SimilarActiveRow[];
  now?: Date;
}

export interface SellerReport {
  listing: SellerReportListingInput;
  generated_at: string;
  truth_level_definitions: Record<TruthLevel, string>;
  known_vs_anonymous_policy: string;
  exposure: {
    truth_level: TruthLevel;
    total_views: number;
    unique_viewers: number;
    known_viewers: number;
    returning_viewers: number;
    views_last_7_days: number;
    views_last_30_days: number;
    device_breakdown: Record<string, number>;
    first_view_at: string | null;
    last_view_at: string | null;
  };
  engagement: {
    truth_level: TruthLevel;
    open_house_rsvps: number;
    showings: {
      total: number;
      completed: number;
      upcoming_or_requested: number;
      by_type: Record<string, number>;
    };
    client_actions: Record<string, number>;
    saves_or_likes: number;
  };
  inquiries: {
    truth_level: TruthLevel;
    total: number;
    by_source: Record<string, number>;
    with_message: number;
    last_30_days: number;
  };
  campaigns: {
    truth_level: TruthLevel;
    status: 'not_yet_tracked';
    note: string;
  };
  portal_reported: {
    truth_level: TruthLevel;
    status: 'not_yet_tracked';
    note: string;
  };
  external_presence: {
    truth_level: TruthLevel;
    status: 'not_yet_tracked';
    note: string;
  };
  market_context: {
    truth_level: TruthLevel;
    similar_active_count: number;
    price_band: { min: number; max: number };
    median_list_price: number | null;
    median_days_on_market: number | null;
    subject_days_on_market: number;
    disclaimer: string;
  };
  data_gaps: string[];
}

const TRUTH_LEVEL_DEFINITIONS: Record<TruthLevel, string> = {
  VERIFIED_MALLAN_TRAFFIC:
    'Measured directly on mallan.nyc infrastructure (token-gated tracked views, CRM-recorded inquiries, showings and client actions). First-party, verifiable.',
  TRACKED_CAMPAIGN:
    'Attributed via Mallan-issued UTM campaign links or short links. Verifiable click-through data for campaigns we control. Not yet tracked — Phase 2.',
  PORTAL_REPORTED:
    'Numbers reported by external portals (e.g. their own dashboards), manually entered by the broker. Second-party claims we relay but cannot independently verify.',
  EXTERNAL_PRESENCE:
    'Confirmed presence of the listing on an external surface (portal, search engine, brokerage IDX site) — proves exposure exists, not traffic volume. Not yet tracked — Phase 2.',
  MARKET_PROXY:
    'Context computed from similar active listings in our own database (count, price band, days on market). A comparability proxy — NOT a measurement of traffic on any other listing.',
};

const KNOWN_VS_ANONYMOUS_POLICY =
  'Viewer identity is never displayed unless the viewer self-identified (logged-in client, submitted inquiry, or tracked email click). All viewer metrics in this report are aggregate counts; anonymous traffic is reported as aggregate patterns only.';

const MARKET_PROXY_DISCLAIMER =
  'Similar-listing context is computed from our own database of active listings (same borough and listing type, price band ±20%). It is a market proxy for comparability — it is not — and must never be presented as — competitor or portal traffic data.';

const DATA_GAPS: string[] = [
  'Photo-gallery, floorplan, virtual-tour and share events are not yet tracked — Phase 2 (listing_events, HELD: requires Maya-approved migration).',
  'Anonymous public-site views are not yet counted — current tracked views cover token-gated email-link opens by known leads only; anonymous aggregate view counting is Phase 2.',
  'UTM campaign links and short links (mallan.nyc/l/{slug}) are not yet issued or tracked — Phase 2 (listing_campaign_links, HELD).',
  'External presence map (portals, search engines, broker-network IDX sites) is not yet observed — Phase 2 (listing_external_presence + listing_broker_network_presence, HELD).',
  'Portal-reported metrics (manual entry) have no storage yet — Phase 2 (listing_owner_reports, HELD).',
];

/** ±20% comparability band — single source for the builder AND the loader's market-proxy query. */
export function priceBandFor(listPrice: number): { min: number; max: number } {
  return { min: Math.round(listPrice * 0.8), max: Math.round(listPrice * 1.2) };
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildSellerReport(input: SellerReportInput): SellerReport {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ── Exposure (verified Mallan traffic) ──
  const { views } = input;
  // Unique viewers: distinct ip_hash where captured; rows without an ip_hash
  // fall back to the lead correlation key so they are not silently dropped.
  const uniqueKeys = new Set(views.map((v) => (v.ip_hash ? `ip:${v.ip_hash}` : `lead:${v.lead_id}`)));
  const viewsPerLead = countBy(views, (v) => v.lead_id);
  const knownViewers = Object.keys(viewsPerLead).length;
  const returningViewers = Object.values(viewsPerLead).filter((n) => n >= 2).length;
  const viewTimes = views.map((v) => v.viewed_at.getTime()).sort((a, b) => a - b);

  const exposure: SellerReport['exposure'] = {
    truth_level: TRUTH_LEVELS.VERIFIED_MALLAN_TRAFFIC,
    total_views: views.length,
    unique_viewers: uniqueKeys.size,
    known_viewers: knownViewers,
    returning_viewers: returningViewers,
    views_last_7_days: views.filter((v) => nowMs - v.viewed_at.getTime() <= 7 * DAY_MS).length,
    views_last_30_days: views.filter((v) => nowMs - v.viewed_at.getTime() <= 30 * DAY_MS).length,
    device_breakdown: countBy(views, (v) => v.device_type ?? 'unknown'),
    first_view_at: viewTimes.length ? new Date(viewTimes[0]).toISOString() : null,
    last_view_at: viewTimes.length ? new Date(viewTimes[viewTimes.length - 1]).toISOString() : null,
  };

  // ── Inquiries (verified Mallan traffic) ──
  const { inquiries } = input;
  const inquirySection: SellerReport['inquiries'] = {
    truth_level: TRUTH_LEVELS.VERIFIED_MALLAN_TRAFFIC,
    total: inquiries.length,
    by_source: countBy(inquiries, (i) => i.source),
    with_message: inquiries.filter((i) => i.has_message).length,
    last_30_days: inquiries.filter((i) => nowMs - i.created_at.getTime() <= 30 * DAY_MS).length,
  };

  // ── Engagement (verified Mallan traffic) ──
  const { showings, actions } = input;
  const clientActions = countBy(actions, (a) => a.action);
  const engagement: SellerReport['engagement'] = {
    truth_level: TRUTH_LEVELS.VERIFIED_MALLAN_TRAFFIC,
    open_house_rsvps: inquiries.filter((i) => i.source === 'open_house_rsvp').length,
    showings: {
      total: showings.length,
      completed: showings.filter((s) => s.status === 'completed').length,
      upcoming_or_requested: showings.filter(
        (s) => s.status === 'requested' || s.status === 'confirmed'
      ).length,
      by_type: countBy(showings, (s) => s.type),
    },
    client_actions: clientActions,
    saves_or_likes: clientActions['liked'] ?? 0,
  };

  // ── Market context (PROXY only — our own DB) ──
  const { similarActives, listing } = input;
  const marketContext: SellerReport['market_context'] = {
    truth_level: TRUTH_LEVELS.MARKET_PROXY,
    similar_active_count: similarActives.length,
    price_band: priceBandFor(listing.list_price),
    median_list_price: median(similarActives.map((s) => s.list_price)),
    median_days_on_market: median(similarActives.map((s) => s.days_on_market)),
    subject_days_on_market: listing.days_on_market,
    disclaimer: MARKET_PROXY_DISCLAIMER,
  };

  return {
    listing: { ...listing },
    generated_at: now.toISOString(),
    truth_level_definitions: { ...TRUTH_LEVEL_DEFINITIONS },
    known_vs_anonymous_policy: KNOWN_VS_ANONYMOUS_POLICY,
    exposure,
    engagement,
    inquiries: inquirySection,
    campaigns: {
      truth_level: TRUTH_LEVELS.TRACKED_CAMPAIGN,
      status: 'not_yet_tracked',
      note: 'UTM campaign links are a Phase 2 deliverable (listing_campaign_links — HELD, Maya approval). No campaign clicks are claimed until then.',
    },
    portal_reported: {
      truth_level: TRUTH_LEVELS.PORTAL_REPORTED,
      status: 'not_yet_tracked',
      note: 'Portal-reported metrics arrive via manual broker entry in Phase 2 (listing_owner_reports — HELD, Maya approval). No portal numbers are claimed until then.',
    },
    external_presence: {
      truth_level: TRUTH_LEVELS.EXTERNAL_PRESENCE,
      status: 'not_yet_tracked',
      note: 'External presence discovery (portals, search, broker-network IDX appearances) is Phase 2 (listing_external_presence + listing_broker_network_presence — HELD, Maya approval). Broker-network rows are network exposure with third-party lead capture: inquiries on those surfaces route to the displaying broker.',
    },
    market_context: marketContext,
    data_gaps: [...DATA_GAPS],
  };
}
