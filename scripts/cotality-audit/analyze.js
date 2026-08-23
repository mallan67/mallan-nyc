#!/usr/bin/env node
/**
 * scripts/cotality/analyze.js — One-shot read-only "what is the current
 * state of my site" report. Pulls live counts from Trestle, the
 * project DB, and the public site, and prints a single-screen summary.
 *
 * Composes count.js / parity.js helpers without importing them — runs
 * its own bundle of parallel `$count` queries plus a Prisma snapshot,
 * so it's still safe to run during the master-plan migration.
 *
 * Usage:
 *   node scripts/cotality/analyze.js
 *   node scripts/cotality/analyze.js --json
 *
 * Read-only. No DB writes. No Trestle writes. Safe to re-run any time.
 */
require('dotenv').config({ path: '.env.local' });
const { odataCount, odataLatestField, getToken } = require('./lib/trestle-client');

const PUBLIC_SITE = 'https://mallan.nyc';

async function fetchPublic(path) {
  try {
    const r = await fetch(`${PUBLIC_SITE}${path}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return { status: r.status, error: `${r.statusText}` };
    const isJson = r.headers.get('content-type')?.includes('application/json');
    return isJson
      ? { status: r.status, body: await r.json() }
      : { status: r.status };
  } catch (err) {
    return { error: err.message };
  }
}

async function snapshotDb() {
  let prisma;
  try {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();

    const [
      listingsTotal,
      listingsActive,
      listingsActiveSale,
      listingsActiveRent,
      projectionTotal,
      missingProjection,
      lastSync,
    ] = await Promise.all([
      prisma.listing.count(),
      prisma.listing.count({ where: { status: 'Active' } }),
      prisma.listing.count({ where: { status: 'Active', listing_type: 'sale' } }),
      prisma.listing.count({ where: { status: 'Active', listing_type: 'rent' } }),
      prisma.listingSearchProjection.count(),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM listings l
          LEFT JOIN listing_search_projection p ON p.listing_id = l.listing_id
          WHERE p.listing_id IS NULL`,
      ).then((rows) => rows[0]?.n ?? null).catch(() => null),
      prisma.syncState.findFirst({ orderBy: { last_run: 'desc' } }).catch(() => null),
    ]);

    await prisma.$disconnect();
    return {
      listingsTotal,
      listingsActive,
      listingsActiveSale,
      listingsActiveRent,
      projectionTotal,
      missingProjection,
      lastSync: lastSync
        ? {
            last_run: lastSync.last_run?.toISOString?.() ?? null,
            upserted: lastSync.last_upserted ?? null,
            errors: lastSync.last_errors ?? null,
            duration_ms: lastSync.last_duration_ms ?? null,
          }
        : null,
    };
  } catch (err) {
    await prisma?.$disconnect().catch(() => {});
    return { error: err.message };
  }
}

function fmt(n) {
  if (n === null || n === undefined) return 'n/a';
  return typeof n === 'number' ? n.toLocaleString() : String(n);
}

function ago(iso) {
  if (!iso) return 'n/a';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

(async () => {
  const json = process.argv.includes('--json');
  await getToken(); // warm token cache

  const t0 = Date.now();
  const probes = await Promise.allSettled([
    odataCount('Property'),
    odataCount('Property', `StandardStatus eq 'Active'`),
    odataCount('Property', `StandardStatus eq 'Active' and PropertyType eq 'Residential'`),
    odataCount('Property', `StandardStatus eq 'Active' and PropertyType eq 'ResidentialLease'`),
    odataCount('Property', `StandardStatus eq 'Closed' and CloseDate ge ${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}`),
    odataCount('Property', `StandardStatus eq 'Active' and InternetEntireListingDisplayYN eq false`),
    odataCount('Property', `StandardStatus eq 'Active' and InternetAddressDisplayYN eq false`),
    odataCount('Property', `StandardStatus eq 'Active' and OwnerOptOut eq true`),
    odataCount('Property', `StandardStatus eq 'Active' and ParticipantOnly eq true`),
    odataCount('Property', `StandardStatus eq 'Active' and InternetAutomatedValuationDisplayYN eq false`),
    odataCount('Property', `StandardStatus eq 'Active' and InternetConsumerCommentYN eq false`),
    odataCount('Property', `StandardStatus eq 'Active' and AuctionYN eq true`),
    odataCount('Property', `MlsStatus eq 'Coming Soon'`),
    odataLatestField('Property', 'ModificationTimestamp', `StandardStatus eq 'Active'`),
    odataCount('Media'),
    odataCount('Member'),
    odataCount('Office'),
    odataCount('OpenHouse'),
    odataCount('CustomProperty'),
    snapshotDb(),
    fetchPublic('/'),
    fetchPublic('/search'),
    fetchPublic('/api/listings?limit=1'),
    fetchPublic('/api/health'),
  ]);
  const elapsedMs = Date.now() - t0;

  // Unwrap allSettled results — null on rejection so 429s on individual
  // probes don't sink the whole report.
  const unwrap = (i) => (probes[i].status === 'fulfilled' ? probes[i].value : null);
  const trestleTotal = unwrap(0);
  const trestleActive = unwrap(1);
  const trestleActiveSale = unwrap(2);
  const trestleActiveRent = unwrap(3);
  const trestleClosed30d = unwrap(4);
  const trestleIdxOff = unwrap(5);
  const trestleAddrOff = unwrap(6);
  const trestleOptOut = unwrap(7);
  const trestlePartOnly = unwrap(8);
  const trestleAvmOff = unwrap(9);
  const trestleConsumerCommentOff = unwrap(10);
  const trestleAuction = unwrap(11);
  const trestleComingSoon = unwrap(12);
  const trestleLatest = unwrap(13);
  const trestleMedia = unwrap(14);
  const trestleMember = unwrap(15);
  const trestleOffice = unwrap(16);
  const trestleOpenHouse = unwrap(17);
  const trestleCustomProp = unwrap(18);
  const db = unwrap(19) ?? { error: 'snapshotDb failed' };
  const siteRoot = unwrap(20) ?? { error: 'fetch failed' };
  const siteSearch = unwrap(21) ?? { error: 'fetch failed' };
  const siteListings = unwrap(22) ?? { error: 'fetch failed' };
  const siteHealth = unwrap(23) ?? { error: 'fetch failed' };

  // Track which probes failed so the report shows partial-data clearly.
  const probeFailures = probes
    .map((p, i) => (p.status === 'rejected' ? { idx: i, reason: String(p.reason?.message || p.reason) } : null))
    .filter(Boolean);

  const trestleDisplayable =
    trestleActive !== null
      ? trestleActive - (trestleIdxOff || 0) - (trestleOptOut || 0) - (trestlePartOnly || 0)
      : null;

  const publicTotal =
    siteListings.body?.total ??
    siteListings.body?.count ??
    null;

  const report = {
    captured_at: new Date().toISOString(),
    elapsed_ms: elapsedMs,
    trestle: {
      total: trestleTotal,
      active_total: trestleActive,
      active_sale: trestleActiveSale,
      active_rent: trestleActiveRent,
      closed_30d: trestleClosed30d,
      coming_soon: trestleComingSoon,
      latest_active_modified_at: trestleLatest,
      gates: {
        idx_display_yn_false: trestleIdxOff,
        internet_address_display_yn_false: trestleAddrOff,
        owner_opt_out_true: trestleOptOut,
        participant_only_true: trestlePartOnly,
        avm_display_false: trestleAvmOff,
        consumer_comment_yn_false: trestleConsumerCommentOff,
        auction_yn_true: trestleAuction,
      },
      expected_displayable_active: trestleDisplayable,
      resources: {
        media: trestleMedia,
        member: trestleMember,
        office: trestleOffice,
        open_house: trestleOpenHouse,
        custom_property: trestleCustomProp,
      },
    },
    db: db.error ? { error: db.error } : db,
    public_site: {
      base: PUBLIC_SITE,
      root: { status: siteRoot.status, error: siteRoot.error || null },
      search: { status: siteSearch.status, error: siteSearch.error || null },
      api_listings: { status: siteListings.status, total: publicTotal, error: siteListings.error || null },
      api_health: { status: siteHealth.status, error: siteHealth.error || null },
    },
    parity_delta: {
      trestle_displayable_minus_db_listings:
        trestleDisplayable !== null && db.listingsActive !== undefined
          ? trestleDisplayable - db.listingsActive
          : null,
      db_listings_minus_projection:
        db.listingsTotal !== undefined && db.projectionTotal !== undefined
          ? db.listingsTotal - db.projectionTotal
          : null,
      trestle_displayable_minus_public_site:
        trestleDisplayable !== null && publicTotal !== null
          ? trestleDisplayable - publicTotal
          : null,
    },
    probe_failures: probeFailures,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human view
  console.log('═'.repeat(72));
  console.log(`mallan.nyc — Cotality Toolkit Analyze (${report.captured_at})`);
  console.log('═'.repeat(72));

  console.log('\n┌─ Trestle / Cotality (live) ────────────────────────────────────┐');
  console.log(`│ Total listings (all statuses)        : ${fmt(report.trestle.total).padStart(12)}    │`);
  console.log(`│   Active total                       : ${fmt(report.trestle.active_total).padStart(12)}    │`);
  console.log(`│     Active Residential (sale)        : ${fmt(report.trestle.active_sale).padStart(12)}    │`);
  console.log(`│     Active ResidentialLease (rent)   : ${fmt(report.trestle.active_rent).padStart(12)}    │`);
  console.log(`│   Closed last 30 days                : ${fmt(report.trestle.closed_30d).padStart(12)}    │`);
  console.log(`│   Coming Soon                        : ${fmt(report.trestle.coming_soon).padStart(12)}    │`);
  console.log(`│ Latest active mod timestamp          : ${ago(report.trestle.latest_active_modified_at).padStart(12)}    │`);
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Distribution gates (active listings BLOCKED) ─────────────────┐');
  for (const [name, count] of Object.entries(report.trestle.gates)) {
    console.log(`│ ${name.padEnd(40)}: ${fmt(count).padStart(10)}    │`);
  }
  console.log(`│ ${'expected_displayable_active'.padEnd(40)}: ${fmt(report.trestle.expected_displayable_active).padStart(10)}    │`);
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Other Trestle resources ──────────────────────────────────────┐');
  for (const [name, count] of Object.entries(report.trestle.resources)) {
    console.log(`│ ${name.padEnd(40)}: ${fmt(count).padStart(10)}    │`);
  }
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Local DB ─────────────────────────────────────────────────────┐');
  if (report.db.error) {
    console.log(`│ ERROR: ${report.db.error.padEnd(56)}│`);
  } else {
    console.log(`│ Listings total                       : ${fmt(report.db.listingsTotal).padStart(12)}    │`);
    console.log(`│ Listings active                      : ${fmt(report.db.listingsActive).padStart(12)}    │`);
    console.log(`│   Active sale                        : ${fmt(report.db.listingsActiveSale).padStart(12)}    │`);
    console.log(`│   Active rent                        : ${fmt(report.db.listingsActiveRent).padStart(12)}    │`);
    console.log(`│ Search projection rows               : ${fmt(report.db.projectionTotal).padStart(12)}    │`);
    console.log(`│ Listings missing projection          : ${fmt(report.db.missingProjection).padStart(12)}    │`);
    if (report.db.lastSync) {
      console.log(`│ Last sync                            : ${ago(report.db.lastSync.last_run).padStart(12)}    │`);
      console.log(`│   upserted                           : ${fmt(report.db.lastSync.upserted).padStart(12)}    │`);
      console.log(`│   errors                             : ${fmt(report.db.lastSync.errors).padStart(12)}    │`);
    }
  }
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ mallan.nyc public site ───────────────────────────────────────┐');
  console.log(`│ GET /                                : ${String(report.public_site.root.status || report.public_site.root.error).padStart(12)}    │`);
  console.log(`│ GET /search                          : ${String(report.public_site.search.status || report.public_site.search.error).padStart(12)}    │`);
  console.log(`│ GET /api/listings?limit=1            : ${String(report.public_site.api_listings.status || report.public_site.api_listings.error).padStart(12)}    │`);
  console.log(`│   /api/listings reports total        : ${fmt(report.public_site.api_listings.total).padStart(12)}    │`);
  console.log(`│ GET /api/health                      : ${String(report.public_site.api_health.status || report.public_site.api_health.error).padStart(12)}    │`);
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log('\n┌─ Parity deltas ────────────────────────────────────────────────┐');
  console.log(`│ Trestle expected − DB listings active: ${fmt(report.parity_delta.trestle_displayable_minus_db_listings).padStart(12)}    │`);
  console.log(`│ DB listings − projection rows        : ${fmt(report.parity_delta.db_listings_minus_projection).padStart(12)}    │`);
  console.log(`│ Trestle expected − public site total : ${fmt(report.parity_delta.trestle_displayable_minus_public_site).padStart(12)}    │`);
  console.log('└────────────────────────────────────────────────────────────────┘');

  console.log(`\nQueries completed in ${elapsedMs} ms\n`);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
