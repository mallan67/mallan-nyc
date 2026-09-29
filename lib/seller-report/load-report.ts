// lib/seller-report/load-report.ts
// SELLER-001 Phase 1 — data access for the internal seller listing report.
// Fetches EXISTING rows only (listing_views, inquiries, showings,
// client_listing_actions, listings market proxy) and delegates aggregation to
// the pure builder in ./build-report. No new tables, no writes, read-only.
//
// Auth is the caller's responsibility (requireAgentOrBroker in the API route;
// validateSession + role check in the admin page). This module never returns
// viewer identity — the builder reduces correlation keys to aggregate counts.
import prisma from '@/lib/prisma';
import { composeSlugStreetName } from '@/lib/listing-slug';
import {
  buildSellerReport,
  priceBandFor,
  type SellerReport,
  type SellerReportInput,
} from './build-report';

/** Bound row fetches so a hot listing cannot balloon the report query. */
const MAX_ROWS = 5000;

/**
 * Codex #472 r1: IDX/Trestle rows store the address JSON in Cotality/Trestle PascalCase
 * split fields (StreetNumber/StreetDirPrefix/StreetName/StreetSuffix/StreetDirSuffix/
 * UnitNumber/City/StateOrProvince/PostalCode); CRM/local rows may carry legacy camelCase.
 * Read PascalCase first with camelCase fallback (pickAddressParts precedent, #463), and
 * compose the street via the canonical composeSlugStreetName (DirPrefix + Name + Suffix —
 * SEO-001 shared helper) PLUS StreetDirSuffix (Codex #472 r13 — Cotality/Trestle split-field
 * shapes like "Central Park S" / "Park Avenue S" carry the direction in StreetDirSuffix;
 * without it the report shows the wrong street) so IDX reports show the real address, not the
 * listing id. Exported for tests.
 */
export function composeAddressDisplay(address: unknown, fallback: string): string {
  const a = (address && typeof address === 'object' ? address : {}) as Record<string, unknown>;
  const pick = (pascal: string, camel: string): string => {
    const pv = typeof a[pascal] === 'string' ? (a[pascal] as string).trim() : '';
    if (pv) return pv;
    const cv = typeof a[camel] === 'string' ? (a[camel] as string).trim() : '';
    return cv;
  };
  const street = [
    pick('StreetNumber', 'streetNumber'),
    // StreetDirSuffix is NO LONGER appended separately here. Codex #472 r13 had
    // to add it because composeSlugStreetName omitted it; the helper now
    // composes all four canonical components (DirPrefix + Name + Suffix +
    // DirSuffix) so the sitemap and the canonical DB DTO cannot emit different
    // slugs. Keeping the extra append would DOUBLE it — "160 Central Park S S".
    // The #472 requirement is unchanged and still satisfied: the direction still
    // appears, exactly once, from the one owner.
    composeSlugStreetName(a),
  ].filter(Boolean).join(' ');
  const unitVal = pick('UnitNumber', 'unitNumber');
  const unit = unitVal ? ` ${unitVal}` : '';
  const locality = [pick('City', 'city'), pick('StateOrProvince', 'state') || pick('StateOrProvince', 'stateOrProvince')].filter(Boolean).join(', ');
  const postal = pick('PostalCode', 'postalCode');
  const line = `${street}${unit}${locality ? `, ${locality}` : ''}${postal ? ` ${postal}` : ''}`.trim();
  return line || fallback;
}

/** The subset of a Prisma Listing row this loader needs. */
export interface SellerReportListingRow {
  id: bigint;
  listing_id: string;
  status: string | null;
  listing_type: string;
  property_type: string | null;
  borough: string | null;
  list_price: { toString(): string } | number;
  days_on_market: number;
  first_active_date: Date | null;
  address: unknown;
}

/**
 * Load and aggregate the seller report for one listing from existing data.
 * Read-only. Returns the truth-labeled aggregate report.
 */
export async function loadSellerReport(
  listing: SellerReportListingRow,
  now: Date = new Date()
): Promise<SellerReport> {
  const listPrice = Number(listing.list_price.toString());
  const band = priceBandFor(listPrice);

  const [totalViewCount, earliestView, viewerAgg, views7, views30, inquiryTotal, inquiryBySource, inquiry30, inquiryWithMessage, deviceAgg, views, inquiries, showings, actions, similarActives] = await Promise.all([
    // Codex #472 r1: true DB count so total_views is exact even when the
    // detail slice is capped at MAX_ROWS.
    prisma.listingView.count({ where: { listing_id: listing.listing_id } }),
    // Codex #472 r2: true FIRST view (min aggregate) — the newest-first cap
    // drops the oldest rows, so the slice cannot answer "first tracked view".
    prisma.listingView.findFirst({
      where: { listing_id: listing.listing_id },
      select: { viewed_at: true },
      orderBy: { viewed_at: 'asc' },
    }),
    // Codex #472 r3: exact ALL-TIME viewer aggregates (read-only) so
    // uniques/returning/devices stay truthful past the MAX_ROWS cap.
    prisma.$queryRaw<Array<{ unique_viewers: bigint; known_viewers: bigint; returning_viewers: bigint }>>`
      SELECT
        count(DISTINCT coalesce(ip_hash, 'lead:' || lead_id)) AS unique_viewers,
        count(DISTINCT lead_id) AS known_viewers,
        (SELECT count(*) FROM (
           SELECT 1 FROM listing_views
           WHERE listing_id = ${listing.listing_id}
           -- Codex #472 r10: group returning viewers on the SAME lead-level key
           -- buildSellerReport uses (countBy lead_id) — NOT ip_hash. Two distinct
           -- leads on one office/household IP were being fused into one "returning"
           -- group, overstating repeat interest. lead_id-only keeps the exact
           -- aggregate identical to the capped-slice reducer. (lead_id is a required
           -- FK — never NULL — so there is no anonymous-viewer group here.)
           GROUP BY lead_id
           HAVING count(*) > 1
         ) r) AS returning_viewers
      FROM listing_views WHERE listing_id = ${listing.listing_id}`,
    // Codex #472 r4: exact windowed counts so a hot week never caps at MAX_ROWS.
    prisma.listingView.count({ where: { listing_id: listing.listing_id, viewed_at: { gte: new Date(now.getTime() - 7 * 24 * 3600_000) } } }),
    prisma.listingView.count({ where: { listing_id: listing.listing_id, viewed_at: { gte: new Date(now.getTime() - 30 * 24 * 3600_000) } } }),
    // Codex #472 r5: exact inquiry aggregates past the cap.
    prisma.inquiry.count({ where: { listing_id: listing.listing_id } }),
    prisma.inquiry.groupBy({ by: ['source'], where: { listing_id: listing.listing_id }, _count: { _all: true } }),
    prisma.inquiry.count({ where: { listing_id: listing.listing_id, created_at: { gte: new Date(now.getTime() - 30 * 24 * 3600_000) } } }),
    // Codex #472 r6+r7: exact with-message count past the cap — the SAME
    // trimmed non-empty predicate as the row reducer (message: {not: null}
    // alone counted empty/whitespace-only messages and could overstate the
    // "With a written message" metric).
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM inquiries
      WHERE listing_id = ${listing.listing_id}
        AND message IS NOT NULL AND btrim(message) <> ''`,
    prisma.listingView.groupBy({
      by: ['device_type'],
      where: { listing_id: listing.listing_id },
      _count: { _all: true },
    }),
    prisma.listingView.findMany({
      where: { listing_id: listing.listing_id },
      select: { lead_id: true, viewed_at: true, device_type: true, ip_hash: true, referrer: true },
      // Codex #472 r1: keep the NEWEST rows when capped — asc returned the
      // oldest 5,000 and froze windowed metrics for high-traffic listings.
      orderBy: { viewed_at: 'desc' },
      take: MAX_ROWS,
    }),
    prisma.inquiry.findMany({
      where: { listing_id: listing.listing_id },
      select: { source: true, created_at: true, message: true },
      orderBy: { created_at: 'desc' },
      take: MAX_ROWS,
    }),
    prisma.showing.findMany({
      where: { listing_id: listing.id },
      select: { type: true, status: true, date: true },
      orderBy: { date: 'desc' },
      take: MAX_ROWS,
    }),
    prisma.clientListingAction.findMany({
      where: { listing_id: listing.id },
      select: { action: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: MAX_ROWS,
    }),
    // Market proxy: similar ACTIVE listings from our own DB only — same
    // borough + listing type, price band ±20%. Aggregate context, never
    // presented as competitor/portal traffic (builder attaches the disclaimer).
    prisma.listing.findMany({
      where: {
        id: { not: listing.id },
        status: 'Active',
        listing_type: listing.listing_type,
        ...(listing.borough ? { borough: listing.borough } : {}),
        list_price: { gte: band.min, lte: band.max },
      },
      select: { list_price: true, days_on_market: true },
      take: MAX_ROWS,
    }),
  ]);

  const input: SellerReportInput = {
    listing: {
      listing_id: listing.listing_id,
      address_display: composeAddressDisplay(listing.address, listing.listing_id),
      status: listing.status,
      listing_type: listing.listing_type,
      property_type: listing.property_type,
      borough: listing.borough,
      list_price: listPrice,
      days_on_market: listing.days_on_market,
      first_active_date: listing.first_active_date
        ? listing.first_active_date.toISOString()
        : null,
    },
    views: views.map((v) => ({
      lead_id: v.lead_id.toString(),
      viewed_at: v.viewed_at,
      device_type: v.device_type,
      ip_hash: v.ip_hash,
      referrer: v.referrer,
    })),
    inquiries: inquiries.map((i) => ({
      source: i.source,
      created_at: i.created_at,
      has_message: Boolean(i.message && i.message.trim().length > 0),
    })),
    total_view_count: totalViewCount,
    earliest_view_at: earliestView?.viewed_at,
    window_counts: { last_7_days: views7, last_30_days: views30 },
    inquiry_aggregates: {
      total: inquiryTotal,
      by_source: Object.fromEntries(inquiryBySource.map((g) => [g.source, g._count._all])),
      last_30_days: inquiry30,
      with_message: Number(inquiryWithMessage[0]?.n ?? 0),
    },
    viewer_aggregates: {
      unique_viewers: Number(viewerAgg[0]?.unique_viewers ?? 0),
      known_viewers: Number(viewerAgg[0]?.known_viewers ?? 0),
      returning_viewers: Number(viewerAgg[0]?.returning_viewers ?? 0),
      device_breakdown: Object.fromEntries(deviceAgg.map((d) => [d.device_type ?? 'unknown', d._count._all])),
    },
    showings: showings.map((s) => ({ type: s.type, status: s.status, date: s.date })),
    actions: actions.map((a) => ({ action: a.action, created_at: a.created_at })),
    similarActives: similarActives.map((s) => ({
      list_price: Number(s.list_price.toString()),
      days_on_market: s.days_on_market,
    })),
    now,
  };

  return buildSellerReport(input);
}
