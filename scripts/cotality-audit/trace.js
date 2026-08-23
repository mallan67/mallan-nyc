#!/usr/bin/env node
/**
 * scripts/cotality/trace.js — Trace a single listing through every layer
 * of the pipeline and report where it lands (or drops).
 *
 * Layers traced:
 *   1. Trestle live (does the upstream feed have it? what status / gates?)
 *   2. DB `Listing` table (did sync ingest it? what's its sync_status?)
 *   3. DB `listing_search_projection` (is it in the search index?)
 *   4. Distribution-gate evaluation (would the canonical fail-closed
 *      helpers display it?)
 *   5. Public `/api/listings` (does the public surface return it?)
 *
 * Read-only. One Trestle call. One Postgres round-trip. One public
 * fetch. Safe to run alongside the master-plan migration.
 *
 * Usage:
 *   node scripts/cotality/trace.js --listing-id=RLS20059088
 *   node scripts/cotality/trace.js --listing-id=RLS20059088 --json
 *
 * Returns exit 0 even when the listing is not displayable (the trace
 * is still useful diagnostic data). Returns exit 1 only on hard
 * errors (auth failure, DB unreachable).
 */
require('dotenv').config({ path: '.env.local' });
const { odataGet } = require('./lib/trestle-client');

const PUBLIC_SITE = 'https://mallan.nyc';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const TRESTLE_FIELDS = [
  'ListingId',
  'ListingKey',
  'StandardStatus',
  'MlsStatus',
  'PropertyType',
  'PropertySubType',
  'CommonInterest',
  'ListPrice',
  'BedroomsTotal',
  'BathroomsTotalInteger',
  'LivingArea',
  'YearBuilt',
  'StreetNumber',
  'StreetName',
  'UnitNumber',
  'CityRegion',
  'SubdivisionName',
  'PostalCode',
  'ModificationTimestamp',
  'PhotosCount',
  'PhotosChangeTimestamp',
  // Distribution-gate fields surfaced by IDX Plus.
  // OwnerOptOut and ParticipantOnly are NOT queryable on our IDX Plus
  // tier — Trestle pre-filters those listings out of the feed entirely.
  // Participant-only listings are inferred from Permission === 'Private'
  // per compliance/IDX-VOW-DISPLAY-RULES.md.
  'InternetEntireListingDisplayYN',
  'InternetAddressDisplayYN',
  'InternetAutomatedValuationDisplayYN',
  'InternetConsumerCommentYN',
  'Permission',
];

async function fetchTrestle(listingId) {
  try {
    const escaped = listingId.replace(/'/g, "''");
    const j = await odataGet('Property', {
      filter: `ListingId eq '${escaped}'`,
      select: TRESTLE_FIELDS.join(','),
      top: 1,
    });
    if (!j.value || j.value.length === 0) {
      return { found: false };
    }
    return { found: true, record: j.value[0] };
  } catch (err) {
    return { error: err.message };
  }
}

async function fetchDb(listingId) {
  let prisma;
  try {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();

    const [listing, projection] = await Promise.all([
      prisma.listing.findUnique({
        where: { listing_id: listingId },
        select: {
          id: true,
          listing_id: true,
          mls_id: true,
          agent_id: true,
          status: true,
          listing_type: true,
          property_type: true,
          property_sub_type: true,
          list_price: true,
          bedrooms_total: true,
          borough: true,
          neighborhood: true,
          rls_eligible: true,
          commercial_sub_type: true,
          idx_display_yn: true,
          internet_entire_listing_display_yn: true,
          internet_address_display_yn: true,
          internet_automated_valuation_display_yn: true,
          internet_consumer_comment_yn: true,
          participant_only: true,
          owner_opt_out: true,
          sync_status: true,
          status_changed_at: true,
          last_synced_from_trestle: true,
          modification_timestamp: true,
        },
      }),
      prisma.listingSearchProjection.findUnique({
        where: { listing_id: listingId },
        select: {
          listing_id: true,
          mls_status: true,
          listing_type: true,
          rls_eligible: true,
          idx_display_yn: true,
          internet_entire_listing_display_yn: true,
          internet_address_display_yn: true,
          participant_only_yn: true,
          modified_at: true,
          updated_at: true,
        },
      }),
    ]);

    await prisma.$disconnect();
    return { listing, projection };
  } catch (err) {
    if (prisma) await prisma.$disconnect().catch(() => {});
    return { error: err.message };
  }
}

async function fetchPublic(listingId) {
  // Public /api/listings doesn't filter by ListingId in its public surface.
  // We can probe the listing detail page instead.
  const url = `${PUBLIC_SITE}/listing/${encodeURIComponent(listingId)}`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual',
      headers: { Accept: 'text/html' },
    });
    return { status: r.status, url, redirected_to: r.headers.get('location') };
  } catch (err) {
    return { error: err.message, url };
  }
}

/**
 * Pure fail-closed gate evaluation, mirroring the canonical helpers in
 * lib/compliance/gates.ts and lib/search/listing-access-decision.ts.
 *
 * Returns a list of named gate verdicts so the trace shows exactly
 * which gate (if any) suppresses the listing.
 *
 * Options:
 *   - skipIdxDisplay   — Trestle records don't surface idx_display_yn;
 *                        skip that gate when evaluating Trestle data.
 *   - skipOwnerOptOut  — listing_search_projection doesn't mirror
 *                        owner_opt_out (PR 5A bounded scope);
 *                        enforcement happens via the FK relation to
 *                        Listing in PROJECTION_DISPLAY_GATE.
 */
function evaluateGates(source, options = {}) {
  if (!source) return null;
  const evals = [];
  const affirm = (v) => v === true;
  const isFalse = (v) => v === false;

  if (!options.skipIdxDisplay) {
    evals.push({
      gate: 'idx_display_yn',
      raw: source.idx_display_yn ?? null,
      affirmative: affirm(source.idx_display_yn),
    });
  }
  evals.push({
    gate: 'internet_entire_listing_display_yn',
    raw: source.internet_entire_listing_display_yn ?? null,
    affirmative: affirm(source.internet_entire_listing_display_yn),
  });
  evals.push({
    gate: 'internet_address_display_yn',
    raw: source.internet_address_display_yn ?? null,
    affirmative: affirm(source.internet_address_display_yn),
  });
  if (!options.skipOwnerOptOut) {
    evals.push({
      gate: 'owner_opt_out (must be false)',
      raw: source.owner_opt_out ?? null,
      affirmative: isFalse(source.owner_opt_out),
    });
  }
  evals.push({
    gate: 'participant_only (must be false)',
    raw: source.participant_only ?? source.participant_only_yn ?? null,
    affirmative: isFalse(source.participant_only ?? source.participant_only_yn),
  });

  const blockers = evals.filter((e) => !e.affirmative).map((e) => e.gate);
  return {
    evaluations: evals,
    displayable: blockers.length === 0,
    blockers,
  };
}

function evaluateAddressGate(source) {
  if (!source) return null;
  const entire = source.internet_entire_listing_display_yn === true;
  const addr = source.internet_address_display_yn === true;
  return {
    addressDisplayable: entire && addr,
    cascade: !entire ? 'entire-listing-off → address forcibly off' : addr ? 'both affirmative' : 'address flag not affirmative',
  };
}

function fmt(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

(async () => {
  const listingId = arg('listing-id');
  const json = process.argv.includes('--json');
  if (!listingId) {
    console.error('Usage: node scripts/cotality/trace.js --listing-id=<RLS_xxx> [--json]');
    process.exit(1);
  }

  const [trestle, db, publicProbe] = await Promise.all([
    fetchTrestle(listingId),
    fetchDb(listingId),
    fetchPublic(listingId),
  ]);

  // IDX Plus feeds frequently return `null` for InternetEntireListingDisplayYN
  // and InternetAddressDisplayYN. Trestle uses presence-in-feed as the
  // implicit display affirmation — non-displayable listings are filtered
  // out upstream before they reach us. So at the Trestle layer the trace
  // is informational ("did Trestle surface a value?") rather than
  // dispositive. The canonical fail-closed gate fires at the DB layer
  // after our sync has populated the columns.
  const trestleGates = trestle.found
    ? {
        present_in_feed: true,
        permission: trestle.record.Permission ?? null,
        permission_implies_participant_only: trestle.record.Permission === 'Private',
        internet_entire_listing_display_yn_surfaced:
          trestle.record.InternetEntireListingDisplayYN ?? null,
        internet_address_display_yn_surfaced:
          trestle.record.InternetAddressDisplayYN ?? null,
        note: 'Trestle pre-filters owner-opt-out and participant-only listings before they reach our IDX Plus feed. Presence-in-feed is the implicit display affirmation; null gate flags are normal.',
      }
    : null;
  const trestleAddrGate = trestle.found ? evaluateAddressGate({
    internet_entire_listing_display_yn: trestle.record.InternetEntireListingDisplayYN,
    internet_address_display_yn: trestle.record.InternetAddressDisplayYN,
  }) : null;
  const dbGates = db.listing ? evaluateGates(db.listing) : null;
  const dbAddrGate = db.listing ? evaluateAddressGate(db.listing) : null;
  const projectionGates = db.projection
    ? evaluateGates(
        {
          idx_display_yn: db.projection.idx_display_yn,
          internet_entire_listing_display_yn: db.projection.internet_entire_listing_display_yn,
          internet_address_display_yn: db.projection.internet_address_display_yn,
          participant_only_yn: db.projection.participant_only_yn,
        },
        { skipOwnerOptOut: true },
      )
    : null;

  const report = {
    listing_id: listingId,
    captured_at: new Date().toISOString(),
    trestle: {
      found: trestle.found,
      record: trestle.record || null,
      gate: trestleGates,
      address_gate: trestleAddrGate,
      error: trestle.error || null,
    },
    db: {
      listing: db.listing
        ? { ...db.listing, id: db.listing.id?.toString(), agent_id: db.listing.agent_id?.toString(), list_price: db.listing.list_price?.toString() }
        : null,
      projection: db.projection,
      listing_gate: dbGates,
      address_gate: dbAddrGate,
      projection_gate: projectionGates,
      error: db.error || null,
    },
    public: publicProbe,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human view
  console.log(`\n══ Trace: ${listingId} ══`);
  console.log(`captured_at: ${report.captured_at}\n`);

  // Trestle
  console.log(`┌─ Trestle (live upstream) ─────────────────────────────────────`);
  if (trestle.error) {
    console.log(`│ ERROR: ${trestle.error}`);
  } else if (!trestle.found) {
    console.log(`│ NOT FOUND in Trestle. The feed does not currently have this`);
    console.log(`│ ListingId — could be Closed > 30 days, never on RLS, or`);
    console.log(`│ outside our IDX Plus license scope.`);
  } else {
    const r = trestle.record;
    console.log(`│ StandardStatus              : ${fmt(r.StandardStatus)}`);
    console.log(`│ MlsStatus                   : ${fmt(r.MlsStatus)}`);
    console.log(`│ PropertyType / SubType      : ${fmt(r.PropertyType)} / ${fmt(r.PropertySubType)}`);
    console.log(`│ ListPrice                   : ${fmt(r.ListPrice)}`);
    console.log(`│ Beds / BathsTotalInt / Sqft : ${fmt(r.BedroomsTotal)} / ${fmt(r.BathroomsTotalInteger)} / ${fmt(r.LivingArea)}`);
    console.log(`│ Address                     : ${fmt(r.StreetNumber)} ${fmt(r.StreetName)} ${fmt(r.UnitNumber || '')}`);
    console.log(`│ Postal / Borough / Neighbor.: ${fmt(r.PostalCode)} / ${fmt(r.CityRegion)} / ${fmt(r.SubdivisionName)}`);
    console.log(`│ ModificationTimestamp       : ${fmt(r.ModificationTimestamp)}`);
    console.log(`│ Photos count                : ${fmt(r.PhotosCount)}`);
    console.log(`│ Distribution gates (informational — Trestle pre-filters):`);
    console.log(`│   InternetEntireListingDisplayYN  : ${fmt(r.InternetEntireListingDisplayYN)}${r.InternetEntireListingDisplayYN === null || r.InternetEntireListingDisplayYN === undefined ? ' (not surfaced — normal on IDX Plus)' : ''}`);
    console.log(`│   InternetAddressDisplayYN        : ${fmt(r.InternetAddressDisplayYN)}${r.InternetAddressDisplayYN === null || r.InternetAddressDisplayYN === undefined ? ' (not surfaced — normal on IDX Plus)' : ''}`);
    console.log(`│   Permission                     : ${fmt(r.Permission)} ${r.Permission === 'Private' ? '⚠ PARTICIPANT-ONLY' : ''}`);
    console.log(`│   OwnerOptOut / ParticipantOnly   : pre-filtered upstream by IDX Plus`);
    console.log(`│ Trestle verdict                  : present in feed (= implicit display affirmation)${r.Permission === 'Private' ? ' BUT Permission=Private → participant-only, suppress public' : ''}`);
    console.log(`│ Note                            : canonical address verdict comes from DB Listing flags below — Trestle null flags are normal.`);
  }
  console.log(`└─`);

  // DB Listing
  console.log(`\n┌─ DB Listing (post-sync) ──────────────────────────────────────`);
  if (db.error) {
    console.log(`│ ERROR: ${db.error}`);
  } else if (!db.listing) {
    console.log(`│ NOT FOUND in DB. Either:`);
    console.log(`│   - The listing has not been synced yet (mid-flight migration?)`);
    console.log(`│   - The listing was tombstoned by data-retention`);
    console.log(`│   - The ListingId differs between Trestle and our DB`);
  } else {
    const l = db.listing;
    console.log(`│ DB id                       : ${fmt(l.id)}`);
    console.log(`│ status                      : ${fmt(l.status)}`);
    console.log(`│ listing_type                : ${fmt(l.listing_type)}`);
    console.log(`│ list_price                  : ${fmt(l.list_price)}`);
    console.log(`│ rls_eligible                : ${fmt(l.rls_eligible)}`);
    console.log(`│ commercial_sub_type         : ${fmt(l.commercial_sub_type)}`);
    console.log(`│ agent_id (exclusive?)       : ${fmt(l.agent_id)}`);
    console.log(`│ sync_status                 : ${fmt(l.sync_status)}`);
    console.log(`│ status_changed_at           : ${fmt(l.status_changed_at)}`);
    console.log(`│ last_synced_from_trestle    : ${fmt(l.last_synced_from_trestle)}`);
    console.log(`│ modification_timestamp      : ${fmt(l.modification_timestamp)}`);
    console.log(`│ Distribution gates:`);
    console.log(`│   idx_display_yn                          : ${fmt(l.idx_display_yn)}`);
    console.log(`│   internet_entire_listing_display_yn      : ${fmt(l.internet_entire_listing_display_yn)}`);
    console.log(`│   internet_address_display_yn             : ${fmt(l.internet_address_display_yn)}`);
    console.log(`│   internet_automated_valuation_display_yn : ${fmt(l.internet_automated_valuation_display_yn)}`);
    console.log(`│   internet_consumer_comment_yn            : ${fmt(l.internet_consumer_comment_yn)}`);
    console.log(`│   owner_opt_out                           : ${fmt(l.owner_opt_out)}`);
    console.log(`│   participant_only                        : ${fmt(l.participant_only)}`);
    if (dbGates) {
      console.log(`│ Gate verdict                : ${dbGates.displayable ? 'DISPLAYABLE' : 'BLOCKED by ' + dbGates.blockers.join(', ')}`);
    }
    if (dbAddrGate) {
      console.log(`│ Address verdict             : ${dbAddrGate.addressDisplayable ? 'SHOW ADDRESS' : 'SUPPRESS (' + dbAddrGate.cascade + ')'}`);
    }
  }
  console.log(`└─`);

  // DB Projection
  console.log(`\n┌─ DB listing_search_projection ────────────────────────────────`);
  if (!db.projection) {
    if (db.listing) {
      console.log(`│ NOT FOUND in projection — but Listing exists. Likely the`);
      console.log(`│ projection backfill hasn't reached this row yet, OR the`);
      console.log(`│ dual-write hasn't fired since the row's last modification.`);
    } else {
      console.log(`│ NOT FOUND in projection (Listing also absent — see above).`);
    }
  } else {
    const p = db.projection;
    console.log(`│ mls_status                  : ${fmt(p.mls_status)}`);
    console.log(`│ listing_type                : ${fmt(p.listing_type)}`);
    console.log(`│ rls_eligible                : ${fmt(p.rls_eligible)}`);
    console.log(`│ idx_display_yn              : ${fmt(p.idx_display_yn)}`);
    console.log(`│ internet_entire_listing_display_yn: ${fmt(p.internet_entire_listing_display_yn)}`);
    console.log(`│ internet_address_display_yn : ${fmt(p.internet_address_display_yn)}`);
    console.log(`│ participant_only_yn         : ${fmt(p.participant_only_yn)}`);
    console.log(`│ modified_at                 : ${fmt(p.modified_at)}`);
    console.log(`│ updated_at                  : ${fmt(p.updated_at)}`);
    if (projectionGates) {
      console.log(`│ Projection gate verdict     : ${projectionGates.displayable ? 'DISPLAYABLE (note: owner_opt_out applied via FK relation, not on projection)' : 'BLOCKED by ' + projectionGates.blockers.join(', ')}`);
    }
  }
  console.log(`└─`);

  // Public
  console.log(`\n┌─ Public mallan.nyc ───────────────────────────────────────────`);
  console.log(`│ GET /listing/${listingId}`);
  if (publicProbe.error) {
    console.log(`│ ERROR: ${publicProbe.error}`);
  } else {
    console.log(`│ HTTP                        : ${fmt(publicProbe.status)}`);
    if (publicProbe.redirected_to) {
      console.log(`│ Redirect                    : ${fmt(publicProbe.redirected_to)}`);
    }
    if (publicProbe.status === 404) {
      console.log(`│ Listing detail page not found — could mean:`);
      console.log(`│   - Listing not yet propagated to the public reader`);
      console.log(`│   - Listing intentionally suppressed (gate blocked it)`);
      console.log(`│   - Slug differs from the ListingId-based URL probed here`);
    }
  }
  console.log(`└─`);

  console.log('');
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
