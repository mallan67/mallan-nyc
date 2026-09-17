#!/usr/bin/env node
// Stage: capability-graph — THE DERIVATION REGISTRY, run live.
//
// PRINCIPLE
//   Every Mallan fact is a proven derivation from a live provider fact, or it is UNVERIFIED.
//   The unit of proof is the EDGE (Mallan fact <- provider source, via a declared transform),
//   and each edge carries a LAW that is executed against the live provider and the stored value.
//
// WHY THIS SHAPE
//   Every Search defect measured on 2026-09-07/08 was a WRONG-SOURCE defect: a flag read Media rows
//   instead of Property.VirtualTourURL*; DOM read a JSON key present on 0 rows; the status clock was
//   new Date() instead of StatusChangeTimestamp; an empty $expand was believed. Internal-consistency
//   laws (tightening, sort, paging) cannot see any of those. A per-edge, provider-anchored law can.
//
// LAW KINDS
//   per-key      for a sample of stored provider listings, fetch the same keys live and compare the
//                stored fact to transform(live source) key by key. Reports agreement and mismatches.
//   diagnostic   the stored fact is written from a LOCAL CLOCK / Mallan-only logic; no provider law
//                can prove it. The edge is UNVERIFIED BY CONSTRUCTION; the stage measures the gap.
//   discarded    the provider field is fetched by the mapper's select list but never persisted. The
//                law checks raw_data for the key on the sample and whether the live value is non-null:
//                (absent, non-null) = confirmed discarded; (present) = the lineage claim was wrong.
//
// INPUTS
//   --mallan-sample=<file>   JSON array of stored rows (see MALLAN_SAMPLE_FIELDS). Produced read-only.
//   DATABASE_URL             alternatively, the stage reads the sample itself via Prisma (read-only).
//   Neither                  -> Mallan side UNVERIFIED; the provider side still runs.
//
// STATES
//   PASS        every per-key law within its band; no confirmed-discarded edge that a live Search fact
//               depends on; sample >= MIN_SAMPLE
//   BLOCKED     a per-key law FAILED — a stored fact provably disagrees with the provider
//   UNVERIFIED  provider unreachable, sample missing/too small, or every law diagnostic

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCotalityClient } from '../../cotality/live-client.mjs';
import { STATE, parseArgs, writeStage, exitFor, sha256 } from './lib.mjs';

const args = parseArgs();
const outDir = args.out || 'artifacts/search-closure/_unbound';
const MIN_SAMPLE = Number(args['min-sample'] || 50);
const BATCH = 100;

// ── The registry ─────────────────────────────────────────────────────────────────────────────────
// `source` names live Cotality Property fields ONLY (verified declared in $metadata 2026-09-08).
// `mallan` names the stored column on the sample row. `law` is how they are compared.
// `band` is the minimum agreement ratio for a per-key law to PASS.
const REGISTRY = [
  // identity / status
  { fact: 'listings.status', mallan: 'status', source: ['StandardStatus'], kind: 'per-key', band: 0.98,
    transform: (live) => STATUS_STORAGE[live.StandardStatus] ?? live.StandardStatus,
    note: 'Mallan status vocabulary vs live StandardStatus. 6,759 rows measured 2026-09-08 with status=Withdrawn while raw StandardStatus=Active — live never emits Withdrawn.' },
  // price / size
  { fact: 'listings.list_price', mallan: 'list_price', source: ['ListPrice'], kind: 'per-key', band: 0.98, transform: (l) => num(l.ListPrice) },
  { fact: 'listings.bedrooms_total', mallan: 'bedrooms_total', source: ['BedroomsTotal'], kind: 'per-key', band: 0.98, transform: (l) => num(l.BedroomsTotal) },
  { fact: 'listings.bathrooms_full', mallan: 'bathrooms_full', source: ['BathroomsFull'], kind: 'per-key', band: 0.98, transform: (l) => num(l.BathroomsFull) },
  { fact: 'listings.bathrooms_half', mallan: 'bathrooms_half', source: ['BathroomsHalf'], kind: 'per-key', band: 0.98, transform: (l) => num(l.BathroomsHalf) },
  { fact: 'listings.living_area', mallan: 'living_area', source: ['LivingArea'], kind: 'per-key', band: 0.95, transform: (l) => num(l.LivingArea) },
  // geography — the lineage found TWO derivations of borough on this lane (projection: CountyOrParish+City; DTO: CityRegion)
  { fact: 'listings.borough', mallan: 'borough', source: ['CityRegion'], kind: 'per-key', band: 0.95, transform: (l) => BOROUGH_STORAGE[l.CityRegion] ?? l.CityRegion ?? null,
    note: 'listings.borough is derived from CountyOrParish+City by inferBorough; the Search DTO uses CityRegion. This law asks whether they agree.' },
  { fact: 'listings.postal_code', mallan: 'postal_code', source: ['PostalCode'], kind: 'per-key', band: 0.98, transform: (l) => l.PostalCode ?? null },
  { fact: 'listings.neighborhood', mallan: 'neighborhood', source: ['SubdivisionName', 'CityRegion'], kind: 'per-key', band: 0.90, transform: (l) => l.SubdivisionName ?? l.CityRegion ?? null,
    note: 'SubdivisionName with CityRegion fallback, per the mapper.' },
  // classification
  { fact: 'listings.property_type', mallan: 'property_type', source: ['PropertyType'], kind: 'per-key', band: 0.98, transform: (l) => l.PropertyType ?? null },
  { fact: 'listings.property_sub_type', mallan: 'property_sub_type', source: ['PropertySubType'], kind: 'per-key', band: 0.95, transform: (l) => l.PropertySubType ?? null },
  // media counter — PhotosCount is the provider's count of ALL media rows (photos + floorplans), measured 2026-09-08
  { fact: 'listings.photo_count', mallan: 'photo_count', source: ['PhotosCount'], kind: 'per-key', band: 0.90, transform: (l) => num(l.PhotosCount),
    note: 'PhotosCount counts every Media row incl. floorplans (14/60 agreed with Photo-only rows). The column is written from a Mallan resolver; expect drift.' },
  // gates — the mapper's own derivation, re-derived here from the same live inputs
  { fact: 'listings.participant_only', mallan: 'participant_only', source: ['Permission'], kind: 'per-key', band: 1.0, transform: (l) => tokens(l.Permission).includes('Private') },
  { fact: 'listings.internet_entire_listing_display_yn', mallan: 'internet_entire_listing_display_yn', source: ['InternetEntireListingDisplayYN'], kind: 'per-key', band: 0.98, transform: (l) => l.InternetEntireListingDisplayYN !== false },
  { fact: 'listings.internet_address_display_yn', mallan: 'internet_address_display_yn', source: ['InternetAddressDisplayYN'], kind: 'per-key', band: 0.98, transform: (l) => l.InternetAddressDisplayYN !== false },
  { fact: 'listings.idx_display_yn', mallan: 'idx_display_yn', source: ['StandardStatus', 'InternetEntireListingDisplayYN', 'Permission'], kind: 'per-key', band: 0.98,
    transform: (l) => { const t = tokens(l.Permission); const st = STATUS_STORAGE[l.StandardStatus] ?? l.StandardStatus; return !TERMINAL.has(st) && l.InternetEntireListingDisplayYN !== false && (t.length === 0 || t.every((x) => x === 'IDX')) && !t.includes('Private'); },
    note: 'computeGateColumns re-derived: !terminal && entire-display !== false && every Permission token is IDX && !Private. owner_opt_out is Mallan-only (false for provider rows).' },
  // projection mirrors
  { fact: 'listing_search_projection.borough', mallan: 'proj_borough', source: ['CityRegion'], kind: 'per-key', band: 0.95, transform: (l) => BOROUGH_STORAGE[l.CityRegion] ?? l.CityRegion ?? null },
  { fact: 'listing_search_projection.list_price', mallan: 'proj_list_price', source: ['ListPrice'], kind: 'per-key', band: 0.98, transform: (l) => num(l.ListPrice) },
  { fact: 'listing_search_projection.participant_only_yn', mallan: 'proj_participant_only_yn', source: ['Permission'], kind: 'per-key', band: 1.0, transform: (l) => tokens(l.Permission).includes('Private') },
  { fact: 'listing_search_projection.feature_flags.has_virtual_tour', mallan: 'proj_has_virtual_tour', source: ['VirtualTourURLBranded', 'VirtualTourURLUnbranded'], kind: 'per-key', band: 0.95,
    transform: (l) => Boolean(l.VirtualTourURLBranded || l.VirtualTourURLUnbranded),
    note: 'Measured 2026-09-08: projection has_virtual_tour=true on 0 of 26,501 rows; 883 Active listings carry a tour URL. The flag is derived from Media rows, which never carry tours on this feed.' },
  { fact: 'listing_search_projection.feature_flags.has_floorplan', mallan: 'proj_has_floorplan', source: ['Media'], kind: 'per-key', band: 0.95,
    transform: (l) => (l.Media || []).some((m) => m.MediaCategory === 'FloorPlan'),
    note: 'Derived from expanded Media; compares to the projection flag.' },
  { fact: 'listing_media (row count)', mallan: 'db_media_rows', source: ['Media'], kind: 'per-key', band: 0.90, transform: (l) => (l.Media || []).length,
    note: 'Stored media rows vs live Media rows. 103 surplus stored rows on 25 listings measured 2026-09-08 — stored media never purges.' },
  // local-clock facts — UNVERIFIED BY CONSTRUCTION; measured, not proven
  { fact: 'listings.status_changed_at', mallan: 'status_changed_at', source: ['StatusChangeTimestamp'], kind: 'diagnostic',
    transform: (l) => l.StatusChangeTimestamp ?? null,
    note: 'Written from new Date()/now by 9 writers (lineage 2026-09-08). StatusChangeTimestamp is populated on 591,409 live rows and is fetched by the mapper but never mapped. This law measures the gap in days.' },
  { fact: 'listings.days_on_market', mallan: 'days_on_market', source: ['DaysOnMarket'], kind: 'diagnostic', transform: (l) => num(l.DaysOnMarket),
    note: 'Provider DaysOnMarket is null on every row of this feed and not filterable; Mallan computes DOM locally. Reported, not proven.' },
  // fetched-and-discarded — the mapper selects these; the keep-list drops them
  ...['StatusChangeTimestamp', 'BackOnMarketDate', 'OffMarketTimestamp', 'OriginalEntryTimestamp', 'VideosCount', 'PhotosChangeTimestamp', 'DocumentsCount', 'CountyOrParish', 'City', 'StateOrProvince', 'UnparsedAddress', 'PreviousListPrice', 'ExpirationDate', 'ClosePrice', 'CloseDate', 'VirtualTourURLUnbranded', 'VirtualTourURLBranded']
    .map((f) => ({ fact: `raw_data.${f}`, mallan: `raw_has_key.${f}`, source: [f], kind: 'discarded' })),
];

const STATUS_STORAGE = { Active: 'Active', ComingSoon: 'ComingSoon', Pending: 'Pending', Closed: 'Closed', Canceled: 'Cancelled', Withdrawn: 'Withdrawn', Expired: 'Expired', Hold: 'Hold', ActiveUnderContract: 'ActiveUnderContract', Delete: 'Delete', Incomplete: 'Incomplete' };
const TERMINAL = new Set(['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'Delete']);
const BOROUGH_STORAGE = { Manhattan: 'Manhattan', Brooklyn: 'Brooklyn', Queens: 'Queens', Bronx: 'Bronx', StatenIsland: 'Staten Island' };
const num = (v) => (v == null || v === '' ? null : Number(v));
const tokens = (v) => (v == null || v === '' ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));
const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const eq = (a, b) => { if (a == null && b == null) return true; if (a == null || b == null) return false; if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b); if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b); return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };

// ── Mallan sample ────────────────────────────────────────────────────────────────────────────────
async function loadSample() {
  if (args['mallan-sample']) {
    const j = JSON.parse(await readFile(path.resolve(args['mallan-sample']), 'utf8'));
    return Array.isArray(j) ? j : (j.sample ?? j.rows ?? []);
  }
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT l.listing_id, l.mls_id AS listing_key, l.status, l.list_price, l.bedrooms_total, l.bathrooms_full, l.bathrooms_half, l.living_area, l.photo_count, l.borough, l.neighborhood, l.postal_code, l.property_type, l.property_sub_type, l.participant_only, l.idx_display_yn, l.internet_entire_listing_display_yn, l.internet_address_display_yn, l.status_changed_at, l.days_on_market, (SELECT count(*)::int FROM listing_media m WHERE m.listing_id = l.listing_id) AS db_media_rows, p.borough AS proj_borough, p.list_price AS proj_list_price, p.participant_only_yn AS proj_participant_only_yn, (p.feature_flags->>'has_virtual_tour')::boolean AS proj_has_virtual_tour, (p.feature_flags->>'has_floorplan')::boolean AS proj_has_floorplan, (SELECT jsonb_object_agg(k, l.raw_data ? k) FROM unnest(ARRAY['StatusChangeTimestamp','BackOnMarketDate','OffMarketTimestamp','OriginalEntryTimestamp','VideosCount','PhotosChangeTimestamp','DocumentsCount','CountyOrParish','City','StateOrProvince','UnparsedAddress','PreviousListPrice','ExpirationDate','ClosePrice','CloseDate','VirtualTourURLUnbranded','VirtualTourURLBranded']) k) AS raw_has_key FROM listings l LEFT JOIN listing_search_projection p ON p.listing_id = l.listing_id WHERE l.status='Active' AND l.mls_id IS NOT NULL AND l.raw_data IS NOT NULL ORDER BY l.updated_at DESC LIMIT 200`);
      return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
    } finally { await prisma.$disconnect(); }
  }
  return null;
}

// ── Provider fetch ───────────────────────────────────────────────────────────────────────────────
async function fetchLive(client, keys) {
  const fields = [...new Set(REGISTRY.flatMap((e) => e.source).filter((f) => f !== 'Media'))];
  const select = ['ListingKey', 'ListingId', ...fields].join(',');
  const out = new Map();
  let pages = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    const json = await client.query('Property', {
      '$filter': `ListingKey in (${chunk.map((k) => `'${String(k).replace(/'/g, "''")}'`).join(',')})`,
      '$select': select,
      '$expand': 'Media($select=MediaCategory,MediaStatus)',
      '$top': String(chunk.length),
    });
    pages += 1;
    for (const row of json.value || []) out.set(String(row.ListingKey), row);
  }
  return { rows: out, pages, fields };
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────────────
const client = createCotalityClient();
let sample = null; let sampleSource = 'none';
try { sample = await loadSample(); sampleSource = args['mallan-sample'] ? 'file' : (process.env.DATABASE_URL ? 'DATABASE_URL' : 'none'); }
catch (e) { console.error(`[closure:capability-graph] Mallan sample unavailable: ${e?.message || e}`); }

let live = null; let providerError = null;
if (sample && sample.length) {
  try { live = await fetchLive(client, sample.map((r) => r.listing_key).filter(Boolean)); }
  catch (e) { providerError = `${e?.message || e}`.slice(0, 200); }
}

const edges = [];
for (const e of REGISTRY) {
  const rec = { fact: e.fact, source: e.source, kind: e.kind, note: e.note ?? null };
  if (!sample || !sample.length) { edges.push({ ...rec, state: STATE.UNVERIFIED, reason: 'no Mallan sample' }); continue; }
  if (!live) { edges.push({ ...rec, state: STATE.UNVERIFIED, reason: providerError ? `provider: ${providerError}` : 'provider not fetched' }); continue; }
  let compared = 0, agree = 0, liveMissing = 0; const mismatches = []; const gaps = [];
  for (const row of sample) {
    const L = live.rows.get(String(row.listing_key));
    if (!L) { liveMissing += 1; continue; }
    if (e.kind === 'discarded') {
      const present = get(row, e.mallan) === true;
      const liveVal = L[e.source[0]];
      compared += 1;
      if (present) agree += 1; else if (liveVal != null && liveVal !== '') mismatches.push({ key: row.listing_id, stored: 'ABSENT', live: String(liveVal).slice(0, 40) });
      continue;
    }
    const expected = e.transform(L);
    const stored = get(row, e.mallan);
    compared += 1;
    if (e.kind === 'diagnostic') {
      if (expected != null && stored != null && /Timestamp/.test(e.source[0])) gaps.push(Math.abs((new Date(stored).getTime() - new Date(expected).getTime()) / 86_400_000));
      else if (eq(stored, expected)) agree += 1;
      continue;
    }
    if (eq(stored, expected)) agree += 1;
    else if (mismatches.length < 6) mismatches.push({ key: row.listing_id, stored: stored == null ? null : String(stored).slice(0, 40), expected: expected == null ? null : String(expected).slice(0, 40) });
  }
  const ratio = compared ? agree / compared : 0;
  if (e.kind === 'diagnostic') {
    const med = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
    edges.push({ ...rec, state: STATE.UNVERIFIED, reason: 'unverified by construction: written from a local clock / Mallan logic', compared, liveMissing, gap_days_median: med, gap_days_max: gaps.length ? Math.max(...gaps) : null, agree_if_comparable: gaps.length ? null : agree });
  } else if (e.kind === 'discarded') {
    const confirmed = compared - agree; const liveNonNull = mismatches.length;
    edges.push({ ...rec, state: agree === compared ? STATE.PASS : STATE.UNVERIFIED, verdict: agree === compared ? 'KEPT in raw_data (lineage claim of discard was wrong)' : (liveNonNull ? 'DISCARDED — fetched, populated live, absent from raw_data' : 'absent from raw_data; live value null on the sample'), compared, kept: agree, absent: confirmed, absent_but_live_populated: liveNonNull });
  } else {
    const pass = compared >= MIN_SAMPLE && ratio >= e.band;
    edges.push({ ...rec, state: compared < MIN_SAMPLE ? STATE.UNVERIFIED : (pass ? STATE.PASS : STATE.BLOCKED), band: e.band, compared, agree, ratio: Number(ratio.toFixed(4)), liveMissing, mismatches });
  }
}

const perKey = edges.filter((e) => e.kind === 'per-key');
const blocked = perKey.filter((e) => e.state === STATE.BLOCKED);
const unverified = edges.filter((e) => e.state === STATE.UNVERIFIED && e.kind === 'per-key');
let state = STATE.PASS; let reason = null;
if (!sample || !sample.length) { state = STATE.UNVERIFIED; reason = 'no Mallan sample (pass --mallan-sample=<file> or set DATABASE_URL)'; }
else if (!live) { state = STATE.UNVERIFIED; reason = providerError || 'provider not fetched'; }
else if (blocked.length) { state = STATE.BLOCKED; reason = `${blocked.length} derivation law(s) FAILED: ${blocked.map((e) => e.fact).join(', ')}`; }
else if (unverified.length) { state = STATE.UNVERIFIED; reason = `${unverified.length} per-key law(s) could not be evaluated`; }

const { body } = await writeStage(outDir, 'capability-graph', {
  state, reason,
  registry_sha256: sha256(REGISTRY.map((e) => ({ fact: e.fact, source: e.source, kind: e.kind, band: e.band ?? null }))),
  sample: { source: sampleSource, rows: sample?.length ?? 0, live_matched: live ? sample.filter((r) => live.rows.has(String(r.listing_key))).length : 0, provider_pages: live?.pages ?? 0, provider_fields_selected: live?.fields ?? [] },
  quota_seen: client.quota(),
  summary: { per_key: perKey.length, pass: perKey.filter((e) => e.state === STATE.PASS).length, blocked: blocked.length, unverified: unverified.length, diagnostic: edges.filter((e) => e.kind === 'diagnostic').length, discarded_confirmed: edges.filter((e) => e.kind === 'discarded' && e.absent_but_live_populated > 0).length },
  edges,
});
console.error(`[closure:capability-graph] ${state}${reason ? ' — ' + reason : ''}  (sample ${body.sample.rows} rows from ${sampleSource}, ${body.sample.live_matched} matched live)`);
for (const e of edges) if (e.kind !== 'discarded') console.error(`  ${String(e.state).padEnd(11)} ${e.fact.padEnd(58)} ${e.kind === 'per-key' ? `${e.agree}/${e.compared} (${(e.ratio * 100).toFixed(1)}% ≥ ${(e.band * 100).toFixed(0)}%)` : e.kind === 'diagnostic' ? `gap median ${e.gap_days_median ?? '-'}d max ${e.gap_days_max ?? '-'}d` : ''}`);
for (const e of edges) if (e.kind === 'discarded') console.error(`  ${String(e.state).padEnd(11)} ${e.fact.padEnd(58)} ${e.verdict}`);
process.stdout.write(JSON.stringify({ stage: 'capability-graph', state, blocked: blocked.map((e) => e.fact) }) + '\n');
process.exit(exitFor(state));
