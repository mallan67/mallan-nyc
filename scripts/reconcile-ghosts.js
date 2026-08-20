// scripts/reconcile-ghosts.js
//
// Feed reconciliation — detects listings marked Active in our DB that are no
// longer in the Trestle Active feed (ghosts), and transitions them to
// Withdrawn with a full audit trail.
//
// WHY:
// Incremental sync via `ModificationTimestamp > watermark` detects changes but
// NOT disappearances. When a listing is fully removed from the Trestle feed —
// post-listing Owner Opt-Out (Exhibit B), broker cancellation with history
// deletion, aging out of retention — there's no modification event to pull.
// Our DB keeps the last-known Active state forever, polluting public search
// with ghost listings that no longer exist.
//
// ALGORITHM:
//   1. Fetch Trestle's complete Active ListingId set (citywide, sale+rent)
//   2. Query our DB for all Active ListingIds
//   3. Compute diff: in-our-DB-but-not-in-Trestle = ghosts
//   4. Skip any ghost whose status is already terminal (defense in depth)
//   5. Transition ghosts → Withdrawn, status_changed_at=NOW(), idx_display_yn=false
//   6. Record each transition in audit_events for compliance trail
//
// SAFETY:
//   - Cap on daily ghost count — if >2000 ghosts detected, abort and alert.
//     That magnitude suggests a Trestle API failure (partial fetch) rather
//     than real removals.
//   - Only operates on RLS-prefixed listing IDs (Trestle-sourced). Internal
//     listings (SL-/RL-prefix from agent direct submission) are untouched.
//   - All transitions logged to audit_events — REBNY RLS requires audit trail.
//   - Idempotent — running twice is a no-op on already-Withdrawn listings.
//
// USAGE:
//   node --env-file=.env.local scripts/reconcile-ghosts.js --verify-only
//   node --env-file=.env.local scripts/reconcile-ghosts.js --dry-run
//   node --env-file=.env.local scripts/reconcile-ghosts.js --execute
//
// Default mode is --verify-only (prints counts only, no changes).
// Called by /api/cron/feed-reconcile as --execute-cron (same execute semantics
// with abort-cap + alerting).

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Safety cap — if reconciliation finds more ghosts than this, abort.
// Normal daily delta is single-digit to low-double-digit. A magnitude over
// GHOST_ABORT_CAP suggests a Trestle API failure (partial fetch = false
// ghost signal) rather than real removals. Reject-close rather than
// mass-transition a legitimate fetch error.
const GHOST_ABORT_CAP = 2000;

// Safety cap for orphans (listings in Trestle we've never synced). Higher
// than ghost cap because a one-shot catch-up after feature deployment may
// legitimately process hundreds; steady state should be single digits.
const ORPHAN_ABORT_CAP = 500;

// How many ListingIds to include in a single OData OR-filter when fetching
// orphans. Keeps URLs under 8KB and Trestle-request-size limits.
const ORPHAN_FETCH_BATCH = 20;

// Terminal statuses we don't need to update (defense in depth).
//
// SCOPE OF THE GUARD — stated precisely, not inflated. The ghost set is
// seeded by `prisma.listing.findMany({ where: { status: "Active", … } })`
// below, so every `g` reaching `TERMINAL_STATUSES.has(g.status)` in
// summarize() is Active and the guard cannot fire today. It is defense in
// depth for the day that seed widens — which has precedent: the wired cron
// twin (app/api/cron/feed-reconcile/route.ts) already unions the live
// Pending/AUC/ComingSoon sets into its ghost decision.
//
// DIRECTION OF THE BUG THIS FIXES: the omission was from a SKIP set, so a
// missed member causes EXTRA WRITES, not a display failure. A ghost already
// terminal as 'Canceled' would fall through to the transition loop and be
// rewritten to Withdrawn with a spurious audit_event and a
// `terminal_since = now` that RESTARTS the retention/archive clock — churn
// plus loss of the provider's own cancellation fact, not a leak.
//
// 'Canceled' (single L) ADDED 2026-08-20. mapTrestleToPrisma stores
// StandardStatus verbatim and the live Cotality member is single-L (HTTP 200,
// re-probed 2026-08-20); 'Cancelled' is the Mallan CRM spelling (provider
// HTTP 400). Both are written by live code paths, so both must be here.
//
// Canonical set: lib/compliance/listing-status-vocabulary.ts TERMINAL_STATUSES.
// This CommonJS runner cannot require() a .ts module (no compile step — same
// constraint the orphan-deferral note below records), so the literal is
// PINNED to the canonical set by
// lib/compliance/__tests__/d9-coming-soon-status-closure.test.ts.
const TERMINAL_STATUSES = new Set([
  "Closed", "Sold", "Leased", "Rented",
  "Withdrawn", "Expired", "Cancelled", "Canceled",
]);

const MODE = process.argv.find((a) => a.startsWith("--")) || "--verify-only";

/** Get an OAuth2 bearer token for Trestle. */
async function getTrestleToken() {
  const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const clientSecret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("IDX_CLIENT_ID / IDX_CLIENT_SECRET missing from environment");
  }
  const base = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "api",
  });
  const r = await fetch(`${base}/oidc/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await r.json();
  if (!json.access_token) {
    throw new Error(`Trestle auth failed: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

/** Fetch every Active ListingId from Trestle, paginated. */
async function fetchTrestleActiveIds(token) {
  const base = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
  const filter = "StandardStatus eq 'Active'";
  const ids = new Set();
  let skip = 0;
  const pageSize = 1000;
  // Safety valve — should never exceed ~15K total citywide but cap at 25K.
  while (skip < 25000) {
    const url = `${base}/odata/Property?$filter=${encodeURIComponent(filter)}&$select=ListingId&$top=${pageSize}&$skip=${skip}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Trestle fetch failed at skip=${skip}: ${res.status} ${await res.text().catch(() => "")}`);
    }
    const page = await res.json();
    const rows = Array.isArray(page.value) ? page.value : [];
    for (const r of rows) if (r.ListingId) ids.add(r.ListingId);
    if (rows.length < pageSize) break;
    skip += pageSize;
  }
  return ids;
}

/** Summarize the ghost set before any writes. */
async function summarize(ghosts) {
  const byBucket = {
    manhattan_sale: 0,
    manhattan_rent: 0,
    outer_sale: 0,
    outer_rent: 0,
    skipped_already_terminal: 0,
  };
  const toTransition = [];
  for (const g of ghosts) {
    if (TERMINAL_STATUSES.has(g.status)) {
      byBucket.skipped_already_terminal++;
      continue;
    }
    toTransition.push(g);
    const isMan = g.borough === "Manhattan";
    if (isMan && g.listing_type === "sale") byBucket.manhattan_sale++;
    else if (isMan && g.listing_type === "rent") byBucket.manhattan_rent++;
    else if (!isMan && g.listing_type === "sale") byBucket.outer_sale++;
    else byBucket.outer_rent++;
  }
  return { byBucket, toTransition };
}

async function run() {
  console.log(`\n━━━ FEED RECONCILIATION (${MODE}) ━━━\n`);
  const t0 = Date.now();

  // 1. Fetch Trestle Active set
  console.log("Fetching Trestle Active ListingIds (citywide)...");
  const token = await getTrestleToken();
  const trestleIds = await fetchTrestleActiveIds(token);
  console.log(`  Trestle Active: ${trestleIds.size} listings`);

  // 2. Our DB Active set (RLS-sourced only — skip internal agent submissions)
  console.log("Querying our DB for Active RLS listings...");
  const ourActive = await prisma.listing.findMany({
    where: {
      status: "Active",
      listing_id: { startsWith: "RLS" },
    },
    select: {
      id: true,
      listing_id: true,
      listing_type: true,
      borough: true,
      status: true,
      idx_display_yn: true,
    },
  });
  console.log(`  Our DB Active (RLS-sourced): ${ourActive.length} listings`);

  // 3. Diff — bidirectional
  const ghosts = ourActive.filter((r) => !trestleIds.has(r.listing_id));
  console.log(`  Ghosts (in our DB, not in Trestle): ${ghosts.length}`);

  // ALSO find orphans — Trestle has ListingId we don't have at all.
  // These are listings the incremental sync missed (pagination boundary,
  // transient Trestle 5xx during fetch, or timing across run windows).
  const ourAllRls = await prisma.listing.findMany({
    where: { listing_id: { startsWith: "RLS" } },
    select: { listing_id: true },
  });
  const ourAllIds = new Set(ourAllRls.map((r) => r.listing_id));
  const orphans = [...trestleIds].filter((id) => !ourAllIds.has(id));
  console.log(`  Orphans (in Trestle Active, not in our DB at all): ${orphans.length}`);

  const { byBucket, toTransition } = await summarize(ghosts);
  console.log("\n── Ghosts by bucket ──");
  console.table([byBucket]);
  console.log(`  → Will transition to Withdrawn: ${toTransition.length}`);
  console.log(`  → Will fetch + create for orphans: ${orphans.length}`);

  // 4. Safety caps — abort if either direction exceeds its cap
  if (toTransition.length > GHOST_ABORT_CAP) {
    console.error(
      `\n❌ ABORT: ghost count ${toTransition.length} exceeds cap ${GHOST_ABORT_CAP}. ` +
      `Likely Trestle fetch failure (partial result), not real removals.`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  if (orphans.length > ORPHAN_ABORT_CAP) {
    console.error(
      `\n❌ ABORT: orphan count ${orphans.length} exceeds cap ${ORPHAN_ABORT_CAP}. ` +
      `Likely a Trestle feed reset or a bug in incremental sync — investigate ` +
      `before mass-fetching.`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  // 5. Mode branch — verify / dry-run / execute
  if (MODE === "--verify-only" || MODE === "--dry-run") {
    console.log(`\n(${MODE} — no changes made)`);
    console.log(`  To execute: node --env-file=.env.local scripts/reconcile-ghosts.js --execute`);
    await prisma.$disconnect();
    process.exit(0);
  }

  if (MODE !== "--execute" && MODE !== "--execute-cron") {
    console.error(`Unknown mode: ${MODE}. Use --verify-only | --dry-run | --execute`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // NOTE: Orphan fetch/create is handled by the cron route
  // (app/api/cron/feed-reconcile/route.ts) where Next.js runtime imports
  // the TypeScript sync mapper directly. This one-shot .js runner can't
  // import .ts without a compile step, so we surface the orphan count
  // here and defer orphan creation to the next `30 3 * * *` cron cycle
  // (or any manual hit to /api/cron/feed-reconcile from a CRON_SECRET-holder).
  if (orphans.length > 0) {
    console.log(
      `\n  ℹ Orphans (${orphans.length}) will be fetched + created by the next ` +
      `/api/cron/feed-reconcile run. Cron schedule: 30 3 * * *.`,
    );
  }

  // 6. Execute ghost transitions — one transaction per ghost so partial
  //    failures don't block the rest. Audit event co-written with each update.
  console.log(`\n━━━ EXECUTING — transitioning ${toTransition.length} ghosts ━━━`);
  const now = new Date();
  let updated = 0;
  let errors = 0;
  for (const g of toTransition) {
    try {
      await prisma.$transaction([
        prisma.listing.update({
          where: { id: g.id },
          data: {
            status: "Withdrawn",
            status_changed_at: now,
            idx_display_yn: false, // belt-and-suspenders — data-retention cron also handles
            modification_timestamp: now,
            // Archive Eligibility Clock (#415/#446): ghosts are always Active→Withdrawn with
            // no stable off-market date, so the wall-clock `now` is the correct floor — byte-
            // identical to the wired cron twin (app/api/cron/feed-reconcile/route.ts). This
            // CommonJS runner can't import the .ts helper; `now` matches the helper's terminal
            // fallback exactly, so no refactor is needed.
            terminal_since: now,
          },
        }),
        prisma.auditEvent.create({
          data: {
            action: "feed_reconcile_ghost_transition",
            entity_type: "listing",
            entity_id: g.id.toString(),
            user_type: "system",
            user_id: null,
            changes: {
              from_status: g.status,
              to_status: "Withdrawn",
              listing_id: g.listing_id,
              reason: "Not present in Trestle Active feed at reconcile time",
              mode: MODE,
            },
          },
        }),
      ]);
      updated++;
    } catch (e) {
      errors++;
      console.error(`  ✗ ${g.listing_id}: ${e.message}`);
    }
  }

  console.log(`\n── RESULT ──`);
  console.log(`  Transitioned: ${updated}`);
  console.log(`  Errors:       ${errors}`);
  console.log(`  Duration:     ${Math.round((Date.now() - t0) / 1000)}s`);

  await prisma.$disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(async (e) => {
  console.error("FATAL:", e);
  await prisma.$disconnect();
  process.exit(3);
});
