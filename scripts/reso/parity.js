#!/usr/bin/env node
/**
 * scripts/reso/parity.js — Compare Trestle, our DB, and the public site
 * for a given listing-shape filter. Useful for diagnosing "why isn't
 * this listing showing up?" and verifying sync convergence.
 *
 * Reads:
 *   - Trestle live counts via $count
 *   - Local Postgres (Listing + ListingSearchProjection) via Prisma
 *   - Public mallan.nyc /api/listings count
 *
 * Writes: nothing.
 *
 * Usage:
 *   node scripts/reso/parity.js
 *   node scripts/reso/parity.js --status=Active --type=sale
 *   node scripts/reso/parity.js --status=Active --type=rent --json
 *
 * Flags:
 *   --status=<RESO StandardStatus>   default 'Active'
 *   --type=<sale|rent|all>           default 'sale' (Residential vs ResidentialLease)
 *   --json                           emit a single JSON object instead of the table
 */
require('dotenv').config({ path: '.env.local' });
const { odataCount } = require('./lib/trestle-client');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const PUBLIC_SITE = 'https://mallan.nyc';

async function fetchPublicTotal(typeFlag) {
  const url = `${PUBLIC_SITE}/api/listings?limit=1${typeFlag !== 'all' ? `&type=${typeFlag}` : ''}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return { error: `${r.status} ${r.statusText}`, url };
    const j = await r.json();
    return { total: j.total ?? j.count ?? null, url };
  } catch (err) {
    return { error: err.message, url };
  }
}

async function fetchDbCounts(status, typeFlag) {
  // Lazy-load Prisma so the script can be packaged + run without
  // generating client when only Trestle/public probes are needed.
  const { default: prisma } = await import('@prisma/client').then((m) => ({ default: new m.PrismaClient() }));
  try {
    const where = { status };
    if (typeFlag === 'sale') where.listing_type = 'sale';
    else if (typeFlag === 'rent') where.listing_type = 'rent';

    const [listingsCount, projectionCount, missingProjection] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listingSearchProjection.count({
        where: {
          mls_status: status,
          ...(typeFlag === 'sale' ? { listing_type: 'sale' } : {}),
          ...(typeFlag === 'rent' ? { listing_type: 'rent' } : {}),
        },
      }),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM listings l
          LEFT JOIN listing_search_projection p ON p.listing_id = l.listing_id
          WHERE p.listing_id IS NULL`,
      ).then((rows) => rows[0]?.n ?? null).catch(() => null),
    ]);
    await prisma.$disconnect();
    return { listingsCount, projectionCount, missingProjection };
  } catch (err) {
    await prisma.$disconnect().catch(() => {});
    return { error: err.message };
  }
}

(async () => {
  const status = arg('status', 'Active');
  const typeFlag = arg('type', 'sale');
  const json = process.argv.includes('--json');

  const propertyTypeClause =
    typeFlag === 'sale' ? `PropertyType eq 'Residential'` :
    typeFlag === 'rent' ? `PropertyType eq 'ResidentialLease'` :
    null;

  const baseFilter = `StandardStatus eq '${status}'` + (propertyTypeClause ? ` and ${propertyTypeClause}` : '');

  const [trestleTotal, trestleIdxOff, trestleOptOut, trestlePartOnly, dbCounts, publicTotal] = await Promise.all([
    odataCount('Property', baseFilter),
    odataCount('Property', `${baseFilter} and InternetEntireListingDisplayYN eq false`),
    odataCount('Property', `${baseFilter} and OwnerOptOut eq true`),
    odataCount('Property', `${baseFilter} and ParticipantOnly eq true`),
    fetchDbCounts(status, typeFlag),
    fetchPublicTotal(typeFlag),
  ]);

  const trestleDisplayable =
    trestleTotal !== null
      ? trestleTotal - (trestleIdxOff || 0) - (trestleOptOut || 0) - (trestlePartOnly || 0)
      : null;

  const result = {
    filter: { status, type: typeFlag, odata_filter: baseFilter },
    trestle: {
      total: trestleTotal,
      idx_display_yn_false: trestleIdxOff,
      owner_opt_out_true: trestleOptOut,
      participant_only_true: trestlePartOnly,
      expected_displayable: trestleDisplayable,
    },
    db: dbCounts,
    public: publicTotal,
    parity_delta: {
      trestle_vs_db_listings: trestleDisplayable !== null && dbCounts.listingsCount !== undefined
        ? trestleDisplayable - dbCounts.listingsCount
        : null,
      db_listings_vs_projection: dbCounts.listingsCount !== undefined && dbCounts.projectionCount !== undefined
        ? dbCounts.listingsCount - dbCounts.projectionCount
        : null,
      trestle_vs_public_site: trestleDisplayable !== null && publicTotal.total !== null && publicTotal.total !== undefined
        ? trestleDisplayable - publicTotal.total
        : null,
    },
    captured_at: new Date().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable view.
  const fmt = (n) => (n === null || n === undefined ? 'n/a' : n.toLocaleString());
  console.log(`\n── Parity probe (status=${status}, type=${typeFlag}) ──`);
  console.log(`OData filter: ${baseFilter}`);
  console.log('');
  console.log(`Trestle total                  : ${fmt(trestleTotal)}`);
  console.log(`  IDX display = false          : ${fmt(trestleIdxOff)}`);
  console.log(`  Owner opt-out                : ${fmt(trestleOptOut)}`);
  console.log(`  Participant only             : ${fmt(trestlePartOnly)}`);
  console.log(`  Expected displayable         : ${fmt(trestleDisplayable)}`);
  console.log('');
  console.log(`DB listings (Listing table)    : ${fmt(dbCounts.listingsCount)}`);
  console.log(`DB projection (search index)   : ${fmt(dbCounts.projectionCount)}`);
  console.log(`Listings missing projection    : ${fmt(dbCounts.missingProjection)}`);
  console.log('');
  console.log(`Public /api/listings total     : ${fmt(publicTotal.total)}`);
  console.log('');
  console.log(`Δ Trestle expected − DB listings : ${fmt(result.parity_delta.trestle_vs_db_listings)}`);
  console.log(`Δ DB listings − projection       : ${fmt(result.parity_delta.db_listings_vs_projection)}`);
  console.log(`Δ Trestle expected − public site : ${fmt(result.parity_delta.trestle_vs_public_site)}`);
  console.log('');
})();
