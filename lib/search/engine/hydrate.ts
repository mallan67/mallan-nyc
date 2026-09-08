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
import { cotalityStandardStatusForMallan } from '@/lib/listings/mallan-status';
import { escapeOData } from './provider-query';
import { queryProvider, walkProvider } from './provider-client';
import { MEDIA_SELECT_FIELDS } from '@/lib/media/listing-media-resolver';
import type { UniverseRow } from './universe';

/** Who receives the rows: an authenticated REBNY participant (Mallan agent / broker) or the public. */
export type SearchAudience = 'public' | 'member';

export interface HydrateOptions {
  /** The route's own select list, passed in so the engine never imports the route. */
  select: readonly string[];
  /** Fetch provider media for the page (default true). The alert cron passes false: its email has no image. */
  media?: boolean;
  /** The audience the rows are for — decides the participants-only gate. Undeclared = the public (fail-closed). */
  audience?: SearchAudience;
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

// The Media select is the one MEDIA_SELECT_FIELDS (lib/media/listing-media-resolver.ts), read at the call site:
// classifyMediaItem reads MediaClassification and ShortDescription too — the previous local list starved it.

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
      resource: 'Media', select: MEDIA_SELECT_FIELDS,
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
 * Provider-row permission gate, per audience — THE canonical interpretation (derivePermissionGates) plus
 * the IDX Plus display-flag convention (null is not false; only an explicit false blocks). Status is a
 * search criterion here, not a gate, so the public closed-24h rule does not apply. A record with no
 * Permission (a Mallan-authored row hydrated into provider shape) carries no provider fact and passes;
 * its Mallan decisions are applied by the Mallan row path.
 *
 *   public  — every token must be the served 'IDX' permission; a participants-only row ('Private':
 *             "private and should have limited distribution", Trestle metadata/enumerations/P-S) is blocked.
 *   member  — an authenticated REBNY participant may see a participants-only row (STEP3 ledger §13.3 —
 *             the previous gate excluded it from the one audience it exists for). Any other non-IDX token
 *             (SyndicateOptOut, OfficeInactive, …) has no definition on the provider docs and stays
 *             fail-closed for every audience until its meaning is proven.
 *
 * Live 2026-09-08 (whole corpus): every row carries 'IDX'; 'Private' 0; on-market rows with an extra token:
 * Pending 'IDX,SyndicateOptOut' 2, all else 0.
 */
export function providerRowPassesGate(raw: Record<string, unknown>, audience: SearchAudience = 'public'): boolean {
  if (raw.InternetEntireListingDisplayYN === false) return false;
  const p = derivePermissionGates(raw);
  if (audience === 'member') {
    const onlyIdxOrPrivate = p.permissionTokens.every((t) => t === 'IDX' || t === 'Private');
    return p.idxPermitted !== false || (p.participantOnly && onlyIdxOrPrivate);
  }
  return p.idxPermitted !== false && !p.participantOnly;
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
    PropertySubType: r.property_sub_type,
    // A provider-shaped record may carry ONLY a verified live member under StandardStatus; the Mallan
    // business status rides under the Mallan key (lib/listings/mallan-status.ts).
    StandardStatus: cotalityStandardStatusForMallan(r.status), _mallanStatus: r.status,
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
    // The Mallan stored clock rides under Mallan keys — never under the provider's DaysOnMarket (the mapper computes
    // provider rows from their contract-event dates; lib/compliance/dom-tracker.ts).
    _mallanDaysOnMarket: r.days_on_market ?? null,
    _mallanCumulativeDaysOnMarket: r.cumulative_days_on_market ?? null,
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
    if (row.source === 'provider' && !providerRowPassesGate(raw, o.audience ?? 'public')) { gateExcluded.push(row.listingKey as string); return; }
    const dto = mapTrestleToCrmListing(raw, i);
    dto._source = row.source === 'provider' ? 'idx' : 'mallan';
    dto._identity = { source: row.source, listingId: row.listingId, listingKey: row.listingKey };
    dto._providerListingKey = row.listingKey;
    listings.push(dto);
  });
  return { listings, providerHydrated: prov.records.size, mallanHydrated: mal.size, mediaRows: prov.mediaRows, mediaComplete: prov.mediaComplete, missing, gateExcluded };
}
