/**
 * PAGE HYDRATION — full rows and media for ONE page of the settled universe.
 *
 * Both sources go through the SAME DTO mapper (`mapTrestleToCrmListing`), so
 * the CRM receives one shape. A Mallan-authored row is presented to the mapper
 * as a provider-shaped record built from Mallan storage; a fact Mallan does
 * not hold stays null — nothing is invented.
 *
 * Provider rows are fetched by `ListingKey in (…)` and their media by
 * `ResourceRecordKey in (…)` (both SUPPORTED live 2026-09-05), each in its
 * own key domain. The page order is the universe order.
 */

import prisma from '@/lib/prisma';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';
import { derivePermissionGates } from '@/lib/idx/trestle-mapper';
import { escapeOData } from './provider-query';
import { queryProvider, walkProvider } from './provider-client';
import type { UniverseRow } from './universe';

export interface HydrateOptions {
  /** The route's own select list, passed in so the engine never imports the route. */
  select: readonly string[];
  /** Fetch provider media for the page (default true). The alert cron passes false: its email has no image. */
  media?: boolean;
}

export interface HydratedPage {
  listings: Record<string, unknown>[];
  providerHydrated: number;
  mallanHydrated: number;
  mediaRows: number;
  mediaComplete: boolean;
  /** Identities on the page neither source could hydrate. Reported, never hidden. */
  missing: string[];
  /** Provider rows whose returned permission/display values would fail a gate. Excluded and reported, never silently dropped. */
  gateExcluded: string[];
}

const MEDIA_SELECT = Object.freeze(['ResourceRecordKey', 'ResourceRecordID', 'MediaKey', 'MediaCategory', 'MediaType', 'Order', 'MediaURL', 'MediaStatus', 'PreferredPhotoYN'] as const);

function inList(values: readonly string[]): string {
  return values.map((v) => `'${escapeOData(v)}'`).join(',');
}

type MediaRow = Record<string, unknown> & { ResourceRecordKey?: string | null };

async function providerRecords(keys: readonly string[], select: readonly string[], withMedia: boolean) {
  const records = new Map<string, Record<string, unknown>>();
  if (keys.length === 0) return { records, mediaRows: 0, mediaComplete: true };
  const [rows, media] = await Promise.all([
    queryProvider<Record<string, unknown>>({ resource: 'Property', select, filter: `ListingKey in (${inList(keys)})`, top: keys.length }),
    withMedia ? walkProvider<MediaRow>({
      resource: 'Media', select: MEDIA_SELECT,
      filter: `ResourceRecordKey in (${inList(keys)}) and MediaStatus eq 'Active'`,
      orderby: 'ResourceRecordKey asc,Order asc', top: 1000,
    }, 5) : Promise.resolve({ rows: [] as MediaRow[], complete: true }),
  ]);
  const mediaByKey = new Map<string, MediaRow[]>();
  for (const m of media.rows) {
    const k = m.ResourceRecordKey != null ? String(m.ResourceRecordKey) : '';
    if (!k) continue;
    (mediaByKey.get(k) ?? mediaByKey.set(k, []).get(k) as MediaRow[]).push(m);
  }
  for (const r of rows.value) {
    const k = r.ListingKey != null ? String(r.ListingKey) : '';
    if (k) records.set(k, { ...r, Media: mediaByKey.get(k) ?? [] });
  }
  return { records, mediaRows: media.rows.length, mediaComplete: media.complete };
}

/**
 * Provider-row permission gate for the agent Search page — THE canonical interpretation
 * (derivePermissionGates: Permission 'Private' = participant-only, owner opt-out arms) plus the
 * IDX Plus display-flag convention (null is not false; only an explicit false blocks). Status is
 * a search criterion here, not a gate, so the public closed-24h rule does not apply.
 * Live 2026-09-05: 7,559 of 7,559 Active rows carry Permission 'IDX', 0 'Private', 0 null — the
 * former "must include IDX" rule and this one agree on the whole live universe.
 */
function passesGate(raw: Record<string, unknown>): boolean {
  const { participantOnly, ownerOptOut } = derivePermissionGates(raw);
  return !participantOnly && !ownerOptOut && raw.InternetEntireListingDisplayYN !== false;
}

type MallanRow = {
  listing_id: string; status: string; listing_type: string; property_sub_type: string | null;
  list_price: unknown; bedrooms_total: number | null; bathrooms_full: number | null; bathrooms_half: number | null; living_area: unknown;
  borough: string | null; neighborhood: string | null; city: string | null; postal_code: string | null;
  address: unknown; media: unknown; photo_count: number | null; listing_contract_date: Date | null; updated_at: Date;
  list_agent_full_name: string | null; list_office_name: string | null;
  raw_data: unknown; days_on_market: number | null; cumulative_days_on_market: number | null;
  listing_media: Array<{ media_key: string | null; media_url_cached: string | null; media_url_original: string | null; media_category: string | null; media_type: string; order: number }>;
};

const rawNum = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const rawStr = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));

/**
 * Mallan storage → provider-shaped record for the shared mapper. Unknown facts stay null.
 *
 * Precedence for every Mallan-authored fact (Search Consolidation Packet 1 closure):
 *   verified typed Mallan column (where one exists) → the existing form payload preserved in
 *   `raw_data` (the CRM sale/rental forms persist AssociationFee, AssociationFeeFrequency and,
 *   where entered, TaxAnnualAmount / RoomsTotal / OriginalListPrice / ListingAgreement under
 *   the provider key names) → null. Never a fabricated zero or default. No second storage.
 */
export function mallanRecord(r: MallanRow): Record<string, unknown> {
  const addr = (r.address && typeof r.address === 'object' ? r.address : {}) as Record<string, unknown>;
  const rd = (r.raw_data && typeof r.raw_data === 'object' ? r.raw_data : {}) as Record<string, unknown>;
  const relational = r.listing_media.map((m) => ({
    MediaKey: m.media_key, MediaURL: m.media_url_cached || m.media_url_original, MediaCategory: m.media_category,
    MediaType: m.media_type, Order: m.order, MediaStatus: 'Active', ResourceRecordID: r.listing_id,
  }));
  const legacy = Array.isArray(r.media) ? (r.media as unknown[]) : [];
  return {
    ...addr,
    ListingId: r.listing_id, ListingKey: null, SourceSystemKey: r.listing_id,
    PropertyType: r.listing_type === 'rent' ? 'ResidentialLease' : 'Residential',
    PropertySubType: r.property_sub_type, StandardStatus: r.status,
    ListPrice: r.list_price == null ? null : Number(r.list_price),
    BedroomsTotal: r.bedrooms_total, BathroomsFull: r.bathrooms_full, BathroomsHalf: r.bathrooms_half,
    LivingArea: r.living_area == null ? null : Number(r.living_area),
    CityRegion: r.borough ?? addr.CityRegion ?? null, SubdivisionName: r.neighborhood ?? addr.SubdivisionName ?? null,
    City: r.city ?? addr.City ?? null, PostalCode: r.postal_code ?? addr.PostalCode ?? null,
    ListingContractDate: r.listing_contract_date ? r.listing_contract_date.toISOString().slice(0, 10) : null,
    ModificationTimestamp: r.updated_at.toISOString(),
    // Carrying costs and the remaining facts: typed column first, then the preserved form payload, then null.
    AssociationFee: rawNum(rd.AssociationFee),
    AssociationFeeFrequency: rawStr(rd.AssociationFeeFrequency),
    TaxAnnualAmount: rawNum(rd.TaxAnnualAmount),
    RoomsTotal: rawNum(rd.RoomsTotal),
    OriginalListPrice: rawNum(rd.OriginalListPrice),
    ListingAgreement: rawStr(rd.ListingAgreement),
    DaysOnMarket: r.days_on_market ?? null,
    CumulativeDaysOnMarket: r.cumulative_days_on_market ?? null,
    ListAgentFullName: r.list_agent_full_name, ListOfficeName: r.list_office_name ?? 'Mallan Real Estate Inc.', ListOfficeMlsId: null,
    // Mallan-authored: Mallan decides display for its own listing.
    InternetAddressDisplayYN: true, InternetEntireListingDisplayYN: true, Permission: 'IDX',
    PhotosCount: r.photo_count ?? (relational.length || legacy.length || null),
    Media: relational.length ? relational : legacy,
  };
}

async function mallanRecords(ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return out;
  const rows = await prisma.listing.findMany({
    where: { listing_id: { in: [...ids] }, mls_id: null },
    select: {
      listing_id: true, status: true, listing_type: true, property_sub_type: true, list_price: true, bedrooms_total: true,
      bathrooms_full: true, bathrooms_half: true, living_area: true, borough: true, neighborhood: true, city: true, postal_code: true,
      address: true, media: true, photo_count: true, listing_contract_date: true, updated_at: true, list_agent_full_name: true, list_office_name: true,
      raw_data: true, days_on_market: true, cumulative_days_on_market: true,
      listing_media: { where: { status: 'active' }, orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { media_key: true, media_url_cached: true, media_url_original: true, media_category: true, media_type: true, order: true } },
    },
  });
  for (const r of rows) out.set(r.listing_id, mallanRecord(r as unknown as MallanRow));
  return out;
}

export async function hydratePage(page: readonly UniverseRow[], o: HydrateOptions): Promise<HydratedPage> {
  const providerKeys = page.filter((r) => r.source === 'provider' && r.listingKey).map((r) => r.listingKey as string);
  const mallanIds = page.filter((r) => r.source === 'mallan').map((r) => r.listingId);
  const [prov, mal] = await Promise.all([providerRecords(providerKeys, o.select, o.media !== false), mallanRecords(mallanIds)]);

  const listings: Record<string, unknown>[] = [];
  const missing: string[] = [];
  const gateExcluded: string[] = [];
  page.forEach((row, i) => {
    const raw = row.source === 'provider' ? prov.records.get(row.listingKey as string) : mal.get(row.listingId);
    if (!raw) { missing.push(row.listingKey ?? row.listingId); return; }
    if (row.source === 'provider' && !passesGate(raw)) { gateExcluded.push(row.listingKey as string); return; }
    const dto = mapTrestleToCrmListing(raw, i);
    dto._source = row.source === 'provider' ? 'idx' : 'mallan';
    dto._identity = { source: row.source, listingId: row.listingId, listingKey: row.listingKey };
    dto._providerListingKey = row.listingKey;
    listings.push(dto);
  });
  return { listings, providerHydrated: prov.records.size, mallanHydrated: mal.size, mediaRows: prov.mediaRows, mediaComplete: prov.mediaComplete, missing, gateExcluded };
}
