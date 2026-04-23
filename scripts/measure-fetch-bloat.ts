#!/usr/bin/env tsx
/**
 * Pin the bloat source: measure current vs minimal $select against live Trestle.
 * Usage: npx tsx --env-file=.env.local scripts/measure-fetch-bloat.ts
 */
import { IDX_PLUS_SELECT_FIELDS, ALL_RLS_FIELDS } from '../lib/idx/trestle-mapper';

const API_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const CLIENT_ID = process.env.IDX_CLIENT_ID!;
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET!;

async function token(): Promise<string> {
  const r = await fetch(`${API_URL}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'api' }).toString(),
  });
  return (await r.json()).access_token;
}

async function fetchOne(t: string, sel: string): Promise<{ ok: boolean; keys?: number; nulls?: number; bytes?: number; status?: number; text?: string }> {
  const p = new URLSearchParams({ $filter: "ListingId eq 'RLS20059088'", $top: '1', $select: sel });
  const r = await fetch(`${API_URL}/odata/Property?${p}`, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } });
  if (!r.ok) return { ok: false, status: r.status, text: (await r.text()).slice(0, 300) };
  const d = await r.json();
  const rec = (d.value || [])[0] || {};
  const keys = Object.keys(rec).filter(k => !k.startsWith('@'));
  const nulls = keys.filter(k => rec[k] === null || rec[k] === '');
  const bytes = Buffer.byteLength(JSON.stringify(rec), 'utf8');
  return { ok: true, keys: keys.length, nulls: nulls.length, bytes };
}

(async () => {
  const t = await token();
  console.log('ALL_RLS_FIELDS:         ', ALL_RLS_FIELDS.length);
  console.log('IDX_PLUS_SELECT_FIELDS: ', IDX_PLUS_SELECT_FIELDS.length);

  const full = await fetchOne(t, IDX_PLUS_SELECT_FIELDS.join(','));
  console.log('\n=== CURRENT $select (what every sync + every per-listing fetch uses) ===');
  if (!full.ok) { console.log('  FAILED:', full.status, full.text); return; }
  console.log('  fields returned:        ', full.keys);
  console.log('  null/empty:             ', full.nulls, `(${Math.round(100 * full.nulls! / full.keys!)}% of response is null)`);
  console.log('  response size:          ', full.bytes, `bytes (${(full.bytes! / 1024).toFixed(1)} KB)`);

  // Minimal — only fields actually rendered by the public listing page
  const MIN = ['ListingId','ListingKey','ListingKeyNumeric','StreetNumber','StreetName','StreetDirPrefix','StreetSuffix','StreetDirSuffix','UnitNumber','City','StateOrProvince','PostalCode','CountyOrParish','Latitude','Longitude','SubdivisionName','CityRegion','BuildingName','PropertyType','PropertySubType','CommonInterest','StandardStatus','ModificationTimestamp','ListingContractDate','ListPrice','OriginalListPrice','PreviousListPrice','ClosePrice','CloseDate','BedroomsTotal','BathroomsFull','BathroomsHalf','LivingArea','LotSizeArea','YearBuilt','RoomsTotal','StoriesTotal','DaysOnMarket','PhotosCount','PhotosChangeTimestamp','ListAgentFullName','ListOfficeName','PublicRemarks','InternetEntireListingDisplayYN','InternetAddressDisplayYN','Permission','AssociationFee','AssociationFeeFrequency','TaxAnnualAmount','BuildingFeatures','InteriorFeatures','Appliances','Cooling','Heating','PetsAllowed','Furnished','MoveInCosts','OngoingFees','TenantPays','AvailabilityDate','OnMarketDate','VirtualTourURLBranded','VirtualTourURLUnbranded'];
  const min = await fetchOne(t, MIN.join(','));
  console.log('\n=== MINIMAL $select (only what the listing page renders) ===');
  if (!min.ok) { console.log('  FAILED:', min.status, min.text); return; }
  console.log('  fields returned:        ', min.keys);
  console.log('  null/empty:             ', min.nulls, `(${Math.round(100 * min.nulls! / min.keys!)}% null)`);
  console.log('  response size:          ', min.bytes, `bytes (${(min.bytes! / 1024).toFixed(1)} KB)`);

  const saved = full.bytes! - min.bytes!;
  console.log('\n=== Per-record waste ===');
  console.log(`  reduction:               ${Math.round(100 * saved / full.bytes!)}% smaller`);
  console.log(`  wasted bytes per listing: ${saved} (${(saved / 1024).toFixed(1)} KB)`);

  console.log('\n=== Estimated monthly Trestle bandwidth waste ===');
  // Realistic: idx-sync every 12 min, real effective rate ~2-5 per hour (concurrency guard + no-changes short-circuit).
  // Avg 200 records per run × 3 runs/hr × 24 × 30 = 432K record-fetches/mo at steady state.
  // media-backfill adds more. Include per-listing page loads too.
  const syncFetchesPerMonth = 200 * 3 * 24 * 30;     // ~432K sync fetches
  const pageLoadFetches = 1500 * 30;                  // 1500 listing-detail page views/day
  const monthly = syncFetchesPerMonth + pageLoadFetches;
  const wastedMB = (monthly * saved) / (1024 * 1024);
  console.log(`  approx ${monthly.toLocaleString()} Property fetches/mo: ${wastedMB.toFixed(0)} MB of null-fields transferred over the wire`);

  console.log('\n=== DB row storage implication ===');
  console.log('  Every synced listing stores ~all returned fields TWICE:');
  console.log('    - once distributed across features/compliance/agent_info/address JSONBs');
  console.log('    - again as the complete stripPrivateFields(raw) in raw_data JSONB');
  console.log(`  If raw_data is ~${(full.bytes! - full.nulls! * 5) / 1024 | 0} KB per row (populated portion),`);
  console.log(`  and features+compliance+agent_info combined is a near-duplicate,`);
  console.log(`  a single listing row carries roughly ${((full.bytes! - full.nulls! * 5) / 1024) * 2 | 0} KB of JSONB — most of which is duplicated.`);

  console.log('\n=== Field name drift check: does the mapper mention fields live Trestle rejects? ===');
  // Sample a few mapper-only names and hit Trestle individually
  const sampleDeadSuspects = ['IDXEntireListingDisplayYN', 'ParticipantOnlyYN', 'IDXParticipationYN', 'VOWEntireListingDisplayYN', 'ActivationTimestamp', 'FirstShowingDate'];
  for (const f of sampleDeadSuspects) {
    const p = new URLSearchParams({ $filter: "ListingId eq 'RLS20059088'", $top: '1', $select: f });
    const r = await fetch(`${API_URL}/odata/Property?${p}`, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } });
    const txt = r.ok ? 'exists' : `404 — ${((await r.text()).match(/'[^']+'/)?.[0] || '').slice(0, 80)}`;
    console.log(`  ${f.padEnd(40)} → ${txt}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
