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
import {
  buildSellerReport,
  priceBandFor,
  type SellerReport,
  type SellerReportInput,
} from './build-report';

/** Bound row fetches so a hot listing cannot balloon the report query. */
const MAX_ROWS = 5000;

type ListingAddressJson = {
  streetNumber?: string;
  streetName?: string;
  unitNumber?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

function composeAddressDisplay(address: unknown, fallback: string): string {
  const a = (address && typeof address === 'object' ? address : {}) as ListingAddressJson;
  const street = [a.streetNumber, a.streetName].filter(Boolean).join(' ');
  const unit = a.unitNumber ? ` ${a.unitNumber}` : '';
  const locality = [a.city, a.state].filter(Boolean).join(', ');
  const line = `${street}${unit}${locality ? `, ${locality}` : ''}${a.postalCode ? ` ${a.postalCode}` : ''}`.trim();
  return line || fallback;
}

/** The subset of a Prisma Listing row this loader needs. */
export interface SellerReportListingRow {
  id: bigint;
  listing_id: string;
  status: string;
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

  const [views, inquiries, showings, actions, similarActives] = await Promise.all([
    prisma.listingView.findMany({
      where: { listing_id: listing.listing_id },
      select: { lead_id: true, viewed_at: true, device_type: true, ip_hash: true, referrer: true },
      orderBy: { viewed_at: 'asc' },
      take: MAX_ROWS,
    }),
    prisma.inquiry.findMany({
      where: { listing_id: listing.listing_id },
      select: { source: true, created_at: true, message: true },
      orderBy: { created_at: 'asc' },
      take: MAX_ROWS,
    }),
    prisma.showing.findMany({
      where: { listing_id: listing.id },
      select: { type: true, status: true, date: true },
      orderBy: { date: 'asc' },
      take: MAX_ROWS,
    }),
    prisma.clientListingAction.findMany({
      where: { listing_id: listing.id },
      select: { action: true, created_at: true },
      orderBy: { created_at: 'asc' },
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
