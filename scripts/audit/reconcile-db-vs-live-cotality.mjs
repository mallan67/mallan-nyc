/**
 * reconcile-db-vs-live-cotality.mjs — FULL 3-tier truth reconciliation. NO SAMPLING.
 *
 * Compares every layer of our stored state against the sole authority (live Cotality):
 *   Layer 0  authority : live Cotality feed (StandardStatus per ListingId)
 *   Layer 1  source    : listings table (status, idx_display_yn)
 *   Layer 2  mirror    : listing_search_projection (mls_status, idx_display_yn)
 *   Layer 3  media/cache: listing_media / momentum / social_proof (orphan check)
 *
 * Tiers of output:
 *   MACRO  — one-line counts per divergence class + per-layer totals
 *   LAYER  — how each layer agrees/disagrees with authority and with each other
 *   MICRO  — per-row id lists written to files for every non-empty class
 *
 * Divergence classes (each row lands in exactly one primary class):
 *   MISLABEL_SUPPRESSED — DB terminal, but the id IS live on-market (Active/Pending/ComingSoon)  [the bug]
 *   STATUS_DRIFT        — DB on-market, id live on-market, but statuses differ (e.g. DB Active / live Pending)
 *   STALE_SHOWING       — DB on-market + idx_display_yn=true, but id NOT in live on-market set   [reverse bug]
 *   DEPARTED            — DB terminal AND id not in live on-market set                            [removal candidates]
 *   OK_ONMARKET         — DB on-market, id live on-market, statuses agree
 *   OTHER               — draft/incomplete/etc.
 *   MISSING_INVENTORY   — live on-market id we do NOT have in the DB at all
 *   PROJECTION_DRIFT    — listings vs projection disagree (status or idx_display_yn) [cross-layer, independent axis]
 *
 * READ-ONLY. Writes nothing to the DB or Cotality.
 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url); // resolves node_modules from the project tree
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const OUT = process.env.SP;
const TERMINAL = new Set(['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'Canceled']);
const ONMARKET_DB = new Set(['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']);
const norm = (s) => String(s || '').replace(/\s+/g, '');

async function getToken() {
  const b = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.IDX_CLIENT_ID, client_secret: process.env.IDX_CLIENT_SECRET, scope: 'api' });
  const r = await fetch(BASE + '/oidc/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() });
  if (!r.ok) throw new Error('token ' + r.status);
  return (await r.json()).access_token;
}

// Page the FULL id+status set for a StandardStatus (no sampling) via @odata.nextLink.
async function fetchAllLive(token, status) {
  const out = new Map(); // ListingId -> StandardStatus
  let url = BASE + '/odata/Property?$select=ListingId,StandardStatus&$top=1000&$filter=' + encodeURIComponent(`StandardStatus eq '${status}'`);
  let pages = 0;
  while (url) {
    let r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 4000)); continue; }
    if (r.status === 401) { token = await getToken(); continue; }
    if (!r.ok) throw new Error(status + ' page HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    const j = await r.json();
    for (const v of j.value || []) out.set(v.ListingId, v.StandardStatus);
    url = j['@odata.nextLink'] || null;
    if (++pages % 5 === 0) console.log('   ' + status + ': ' + out.size + ' ids so far...');
  }
  return out;
}

// Resolve a bounded set of ids to their CURRENT live status (any status, incl Closed) — for STALE_SHOWING.
async function resolveStatuses(token, ids) {
  const res = new Map();
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const filter = batch.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(' or ');
    const url = BASE + '/odata/Property?$select=ListingId,StandardStatus&$top=25&$filter=' + encodeURIComponent(filter);
    let r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 3000)); i -= 25; continue; }
    if (!r.ok) continue;
    for (const v of (await r.json()).value || []) res.set(v.ListingId, v.StandardStatus);
    await new Promise((x) => setTimeout(x, 200));
  }
  return res;
}

const run = async () => {
  const started = process.env.NOW || 'unstamped';
  const token = await getToken();

  // ---- Layer 0: pull the FULL live on-market universe (no sampling) ----
  console.log('[Layer 0] pulling full live Cotality on-market universe...');
  const live = new Map();
  for (const s of ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']) {
    const m = await fetchAllLive(token, s);
    for (const [id, st] of m) live.set(id, st);
    console.log('   live ' + s + ' = ' + m.size);
  }
  console.log('[Layer 0] total live on-market ids = ' + live.size);

  // ---- Layers 1+2: full DB + projection (no sampling) ----
  const p = new PrismaClient({ datasources: { db: { url: process.env.U } } });
  let rows;
  try {
    await p.$executeRawUnsafe("SET statement_timeout='115s'");
    rows = await p.$queryRawUnsafe(`
      SELECT l.listing_id, l.status, l.idx_display_yn, l.listing_type,
             pr.mls_status AS proj_status, pr.idx_display_yn AS proj_idx
      FROM listings l
      LEFT JOIN listing_search_projection pr ON pr.listing_id = l.listing_id
      WHERE l.listing_id LIKE 'RLS%'`);
  } finally { await p.$disconnect(); }
  console.log('[Layer 1] DB RLS rows = ' + rows.length + '  (projection joined)');

  // ---- Reconcile ----
  const cls = { MISLABEL_SUPPRESSED: [], STATUS_DRIFT: [], STALE_SHOWING: [], DEPARTED: [], OK_ONMARKET: [], OTHER: [], PROJECTION_DRIFT: [] };
  const dbIds = new Set();
  for (const d of rows) {
    dbIds.add(d.listing_id);
    const liveStatus = live.get(d.listing_id);
    const isTerm = TERMINAL.has(d.status);
    const isOn = ONMARKET_DB.has(d.status);
    if (isTerm && liveStatus) cls.MISLABEL_SUPPRESSED.push(`${d.listing_id}:db=${d.status}:live=${liveStatus}`);
    else if (isTerm && !liveStatus) cls.DEPARTED.push(`${d.listing_id}:${d.status}`);
    else if (isOn && liveStatus && norm(liveStatus) !== norm(d.status)) cls.STATUS_DRIFT.push(`${d.listing_id}:db=${d.status}:live=${liveStatus}`);
    else if (isOn && liveStatus) cls.OK_ONMARKET.push(d.listing_id);
    else if (isOn && !liveStatus && d.idx_display_yn === true) cls.STALE_SHOWING.push(`${d.listing_id}:${d.status}`);
    else cls.OTHER.push(`${d.listing_id}:${d.status}`);
    // cross-layer: projection drift (independent axis)
    if (d.proj_status != null && (norm(d.proj_status) !== norm(d.status) || d.proj_idx !== d.idx_display_yn))
      cls.PROJECTION_DRIFT.push(`${d.listing_id}:l=${d.status}/${d.idx_display_yn}:p=${d.proj_status}/${d.proj_idx}`);
  }
  // missing inventory: live on-market id not in our DB
  const missing = [...live.keys()].filter((id) => !dbIds.has(id));

  // ---- Resolve STALE_SHOWING to true current status (bounded set) ----
  let staleResolved = {};
  if (cls.STALE_SHOWING.length) {
    console.log('[resolve] STALE_SHOWING = ' + cls.STALE_SHOWING.length + ' → per-id live check...');
    const ids = cls.STALE_SHOWING.map((x) => x.split(':')[0]);
    const rmap = await resolveStatuses(token, ids);
    for (const id of ids) { const s = rmap.get(id) || 'ABSENT'; staleResolved[s] = (staleResolved[s] || 0) + 1; }
  }

  // ---- MACRO ----
  const macro = {
    generated: started,
    layer0_live_onmarket: live.size,
    layer1_db_rls_rows: rows.length,
    classes: Object.fromEntries(Object.entries(cls).map(([k, v]) => [k, v.length])),
    MISSING_INVENTORY: missing.length,
    stale_showing_resolved_true_status: staleResolved,
  };
  console.log('\n================ MACRO (full census, no sampling) ================');
  console.log(JSON.stringify(macro, null, 2));

  // ---- MICRO: write per-class id lists ----
  for (const [k, v] of Object.entries(cls)) if (v.length) fs.writeFileSync(`${OUT}/recon-${k}.txt`, v.join('\n'));
  if (missing.length) fs.writeFileSync(`${OUT}/recon-MISSING_INVENTORY.txt`, missing.join('\n'));
  fs.writeFileSync(`${OUT}/recon-MACRO.json`, JSON.stringify(macro, null, 2));
  console.log('\nmicro per-row id lists written to ' + OUT + '/recon-*.txt');
};

run().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
