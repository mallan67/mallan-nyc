/**
 * lib/scanner/trestle-off-market-filter.ts
 *
 * Off-market listing signal source. Expired / Withdrawn / Canceled / Hold
 * listings in the corridor are a high-quality sell-intent signal —
 * the owner *just tried* to sell.
 *
 * Compliance — non-negotiable:
 *
 *   1. **Cooling-off period.** Per NYS DOS solicitation rules + UCBA 2026
 *      norms, a broker may not solicit an owner whose listing recently
 *      expired with another broker until a cooling-off window has passed.
 *      Default: 30 days. Configurable, but never < 7 days.
 *
 *   2. **Internal use only.** Trestle/RLS data is licensed for IDX/VOW
 *      display per REBNY rules. Off-market listings (Expired, Withdrawn,
 *      Canceled, Hold) MAY NOT be displayed publicly. The scanner uses
 *      them as INTERNAL CRM signals only — they surface prospects to a
 *      Mallan broker/agent for outreach, never to the public site.
 *
 *   3. **Mallan exclusives are different.** A listing whose `agent_id`
 *      matched a Mallan agent at expiration is a former Mallan client —
 *      that's a relist conversation with an existing relationship,
 *      not a cold outreach. The scanner flags `was_mallan_listing` so
 *      the UI routes it differently.
 *
 *   4. **Owner-side contact comes from PLUTO + ACRIS + DOS Corp.** The
 *      listing itself carries the LISTING AGENT's contact, not the
 *      owner's. This module produces the BBL + signal; the existing
 *      PLUTO/ACRIS/DOS pipeline produces the verifiable owner contact.
 */
import { isInCorridor } from "@/lib/geo/manhattan-corridor";

/** Listing-row shape this filter accepts. Subset of Prisma's `Listing` model. */
export interface ListingRow {
  listing_id?: string | null;
  mls_id?: string | null;
  status?: string | null;
  status_changed_at?: Date | string | null;
  expiration_date?: Date | string | null;
  first_active_date?: Date | string | null;
  days_on_market?: number | null;
  cumulative_days_on_market?: number | null;
  list_price?: number | string | null;
  agent_id?: string | bigint | null;
  rls_eligible?: boolean | null;
  /** Address string from the Listing row's address JSON or top-level. */
  address?: string | null;
  /** PLUTO BBL — must be joined separately if not on the listing row. */
  bbl?: string | null;
  /** Property centroid coords (for corridor check). */
  latitude?: number | null;
  longitude?: number | null;
}

/** Trestle StandardStatus values that mean "not currently for sale, but the owner tried." */
export const OFF_MARKET_STATUSES = new Set<string>([
  "Expired",
  "Withdrawn",
  "Canceled",
  "Cancelled", // British spelling occasionally appears
  "Hold",
]);

/** Closed status is also relevant but very different signal — exclude by default. */
export const CLOSED_STATUSES = new Set<string>(["Closed", "Sold"]);

/** Active-side statuses we filter OUT (these are still actively listed). */
export const ACTIVE_STATUSES = new Set<string>([
  "Active",
  "ActiveUnderContract",
  "Pending",
  "ComingSoon",
]);

/** Configuration for the cooling-off period and Mallan-exclusive detection. */
export interface OffMarketConfig {
  /** Days that must pass after expiry before outreach is permitted. Default 30. */
  cooling_off_days: number;
  /** Hard floor on cooling-off days — refuse to go below. */
  cooling_off_minimum_days: number;
  /** Set of Mallan agent_ids — listings whose agent_id is in this set are flagged. */
  mallan_agent_ids: Set<string>;
}

export const DEFAULT_OFF_MARKET_CONFIG: OffMarketConfig = {
  cooling_off_days: 30,
  cooling_off_minimum_days: 7,
  mallan_agent_ids: new Set<string>(),
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** True if the status is one we treat as "off-market with sell intent." */
export function isOffMarketStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return OFF_MARKET_STATUSES.has(status.trim());
}

/**
 * Effective off-market date for a listing. Prefers explicit expiration_date,
 * falls back to status_changed_at when the status moved off-market.
 */
export function offMarketSince(row: ListingRow): Date | null {
  return asDate(row.expiration_date) || asDate(row.status_changed_at);
}

/**
 * Returns the date after which outreach to this owner is permitted under
 * the configured cooling-off rule. Uses MAX(configured, minimum) days.
 */
export function coolingThroughDate(
  row: ListingRow,
  config: OffMarketConfig = DEFAULT_OFF_MARKET_CONFIG,
): Date | null {
  const offDate = offMarketSince(row);
  if (!offDate) return null;
  const days = Math.max(config.cooling_off_days, config.cooling_off_minimum_days);
  return new Date(offDate.getTime() + days * 86400000);
}

/** True if (now) is past the cooling-off window for this listing. */
export function isPastCoolingPeriod(
  row: ListingRow,
  config: OffMarketConfig = DEFAULT_OFF_MARKET_CONFIG,
  now: Date = new Date(),
): boolean {
  const through = coolingThroughDate(row, config);
  if (!through) return false;
  return now.getTime() >= through.getTime();
}

/** True if this listing was held by a Mallan agent (former-client relationship, not cold). */
export function isMallanListing(row: ListingRow, config: OffMarketConfig = DEFAULT_OFF_MARKET_CONFIG): boolean {
  const id = row.agent_id == null ? "" : String(row.agent_id);
  return id.length > 0 && config.mallan_agent_ids.has(id);
}

/** Composite predicate: the listing is in the corridor (by lat/lng if provided). */
export function isCorridorListing(row: ListingRow): boolean {
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number") return false;
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return false;
  return isInCorridor(row.latitude, row.longitude);
}

/** Days off market — useful for the "sat vacant for X days" signal. */
export function daysOffMarket(row: ListingRow, now: Date = new Date()): number | null {
  const offDate = offMarketSince(row);
  if (!offDate) return null;
  const ms = now.getTime() - offDate.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

export interface OffMarketIngestStats {
  rows_seen: number;
  rows_off_market_status: number;
  rows_in_corridor: number;
  rows_past_cooling_off: number;
  rows_mallan_exclusive: number;
  rows_kept: number;
  rows_dropped_active: number;
  rows_dropped_outside_corridor: number;
  rows_dropped_in_cooling_off: number;
  rows_dropped_no_geo: number;
  by_status: Record<string, number>;
  unique_bbls: number;
  date_started: string;
  date_finished: string | null;
  cooling_off_days_used: number;
}

export function emptyOffMarketStats(config: OffMarketConfig = DEFAULT_OFF_MARKET_CONFIG): OffMarketIngestStats {
  return {
    rows_seen: 0,
    rows_off_market_status: 0,
    rows_in_corridor: 0,
    rows_past_cooling_off: 0,
    rows_mallan_exclusive: 0,
    rows_kept: 0,
    rows_dropped_active: 0,
    rows_dropped_outside_corridor: 0,
    rows_dropped_in_cooling_off: 0,
    rows_dropped_no_geo: 0,
    by_status: {},
    unique_bbls: 0,
    date_started: new Date().toISOString(),
    date_finished: null,
    cooling_off_days_used: Math.max(config.cooling_off_days, config.cooling_off_minimum_days),
  };
}

export interface OffMarketSignal {
  bbl: string | null;
  mls_id: string | null;
  listing_id: string | null;
  address: string | null;
  listing_status: string;
  off_market_since: string | null;
  cool_through_date: string | null;
  days_off_market: number | null;
  past_cooling_off: boolean;
  was_mallan_listing: boolean;
  list_price: string | null;
  days_on_market_last_listing: number | null;
  cumulative_days_on_market: number | null;
}

export interface ProcessRowResult {
  kept: boolean;
  reason: string;
  signal: OffMarketSignal | null;
}

/**
 * Process one listing row through the off-market scanner pipeline.
 * `kept=true` means: the listing is off-market, in the corridor, AND past
 * the cooling-off window — surface to the broker.
 *
 * `kept=false` rows still get logged in stats so the operator sees the
 * funnel.
 */
export function processListing(
  row: ListingRow,
  stats: OffMarketIngestStats,
  config: OffMarketConfig = DEFAULT_OFF_MARKET_CONFIG,
  now: Date = new Date(),
): ProcessRowResult {
  stats.rows_seen += 1;
  const status = (row.status || "").trim();
  stats.by_status[status || "_blank_"] = (stats.by_status[status || "_blank_"] || 0) + 1;

  if (!isOffMarketStatus(status)) {
    stats.rows_dropped_active += 1;
    return { kept: false, reason: "not_off_market", signal: null };
  }
  stats.rows_off_market_status += 1;

  // Geo / corridor check
  if (typeof row.latitude !== "number" || typeof row.longitude !== "number"
      || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
    stats.rows_dropped_no_geo += 1;
    return { kept: false, reason: "no_geo", signal: null };
  }
  if (!isInCorridor(row.latitude, row.longitude)) {
    stats.rows_dropped_outside_corridor += 1;
    return { kept: false, reason: "outside_corridor", signal: null };
  }
  stats.rows_in_corridor += 1;

  // Cooling-off
  const past = isPastCoolingPeriod(row, config, now);
  if (past) stats.rows_past_cooling_off += 1;
  if (!past) {
    stats.rows_dropped_in_cooling_off += 1;
    return { kept: false, reason: "in_cooling_off", signal: null };
  }

  // Mallan-exclusive flag
  const wasMallan = isMallanListing(row, config);
  if (wasMallan) stats.rows_mallan_exclusive += 1;

  const offDate = offMarketSince(row);
  const through = coolingThroughDate(row, config);
  const days = daysOffMarket(row, now);

  stats.rows_kept += 1;

  return {
    kept: true,
    reason: "kept",
    signal: {
      bbl: row.bbl || null,
      mls_id: row.mls_id || null,
      listing_id: row.listing_id || null,
      address: row.address || null,
      listing_status: status,
      off_market_since: offDate ? offDate.toISOString() : null,
      cool_through_date: through ? through.toISOString() : null,
      days_off_market: days,
      past_cooling_off: past,
      was_mallan_listing: wasMallan,
      list_price: row.list_price != null ? String(row.list_price) : null,
      days_on_market_last_listing: row.days_on_market ?? null,
      cumulative_days_on_market: row.cumulative_days_on_market ?? null,
    },
  };
}

/**
 * Aggregate multiple listings on the same BBL into a relist-frequency
 * signal. A BBL that's been listed 3+ times in 24 months is a much
 * stronger sell-intent signal than a single expiry.
 */
export interface BblRelistSummary {
  bbl: string;
  count_24mo: number;
  most_recent_status: string;
  most_recent_off_market_since: string | null;
  most_recent_cool_through_date: string | null;
  any_was_mallan: boolean;
  signals: OffMarketSignal[];
}

export function aggregateByBbl(signals: OffMarketSignal[], windowDays: number = 730, now: Date = new Date()): BblRelistSummary[] {
  const byBbl = new Map<string, OffMarketSignal[]>();
  const cutoffMs = now.getTime() - windowDays * 86400000;
  for (const s of signals) {
    if (!s.bbl) continue;
    const offMs = s.off_market_since ? Date.parse(s.off_market_since) : NaN;
    if (!Number.isFinite(offMs) || offMs < cutoffMs) continue;
    const list = byBbl.get(s.bbl) || [];
    list.push(s);
    byBbl.set(s.bbl, list);
  }
  const out: BblRelistSummary[] = [];
  for (const [bbl, list] of byBbl) {
    list.sort((a, b) => {
      const ad = a.off_market_since ? Date.parse(a.off_market_since) : 0;
      const bd = b.off_market_since ? Date.parse(b.off_market_since) : 0;
      return bd - ad;
    });
    const newest = list[0];
    out.push({
      bbl,
      count_24mo: list.length,
      most_recent_status: newest.listing_status,
      most_recent_off_market_since: newest.off_market_since,
      most_recent_cool_through_date: newest.cool_through_date,
      any_was_mallan: list.some((s) => s.was_mallan_listing),
      signals: list,
    });
  }
  return out.sort((a, b) => b.count_24mo - a.count_24mo);
}
