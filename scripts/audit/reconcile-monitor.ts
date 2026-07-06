/**
 * reconcile-monitor.ts — standing alert monitor for DB↔live-Cotality status truth.
 *
 * Computes the census + volume metrics against the live feed (no sampling), tracks Cotality API
 * health, compares against the PREVIOUS persisted run (delta + state-change), evaluates the
 * alerts, emits the one-look summary, persists this run, and exits NON-ZERO on any live CRITICAL.
 *
 * Cotality fields used: StandardStatus, ListingId (OData $select). READ-ONLY except one
 * audit_events row per run (the monitor history used for state-change).
 *
 * Env: U (DATABASE_URL — main for prod, or a branch to test), IDX_CLIENT_ID/SECRET.
 */
import { PrismaClient } from '@prisma/client';
import { ON_MARKET_STATUSES } from '@/lib/idx/reconcile-decision';
import { TERMINAL_STATUSES, normalizeStandardStatus } from '@/lib/idx/trestle-mapper';
import {
  evaluateAlerts, hasCriticalAlert, alertsToNotify, formatSummary,
  type CensusMetrics, type VolumeMetrics, type ApiHealth,
} from '@/lib/idx/reconcile-alerts';

const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const PERSIST = !process.argv.includes('--no-persist'); // skip history write when testing on a branch
const api: ApiHealth = { auth_failures: 0, throttle_429: 0, timeouts: 0, partial_responses: 0 };

async function getToken(): Promise<string> {
  const b = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.IDX_CLIENT_ID!, client_secret: process.env.IDX_CLIENT_SECRET!, scope: 'api' });
  const r = await fetch(BASE + '/oidc/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() });
  if (!r.ok) { api.auth_failures++; throw new Error('token ' + r.status); }
  return (await r.json()).access_token;
}
async function fetchAllLive(token: string, status: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let url: string | null = BASE + `/odata/Property?$select=ListingId,StandardStatus&$top=1000&$filter=${encodeURIComponent(`StandardStatus eq '${status}'`)}`;
  let pages = 0, budget = 40;
  while (url) {
    if (budget-- <= 0) { api.partial_responses++; break; } // never claim a complete feed we didn't get
    let r: Response;
    try { r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } }); }
    catch { api.timeouts++; await new Promise((x) => setTimeout(x, 3000)); continue; }
    if (r.status === 429) { api.throttle_429++; await new Promise((x) => setTimeout(x, 4000)); continue; }
    if (r.status >= 500) { await new Promise((x) => setTimeout(x, 4000)); continue; }
    if (!r.ok) { api.partial_responses++; break; }
    const j: any = await r.json();
    for (const v of j.value || []) out.set(v.ListingId, v.StandardStatus);
    url = j['@odata.nextLink'] || null;
    pages++;
  }
  return out;
}

async function main() {
  const runTime = new Date().toISOString();
  const token = await getToken();
  const live = new Map<string, string>();
  for (const s of ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']) for (const [id, st] of await fetchAllLive(token, s)) live.set(id, st);

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.U } } });
  let rows: Array<{ listing_id: string; status: string; idx_display_yn: boolean | null; proj_status: string | null; proj_idx: boolean | null }>;
  let volume: VolumeMetrics;
  let prev: { census: CensusMetrics; volume?: VolumeMetrics } | null = null;
  try {
    await prisma.$executeRawUnsafe("SET statement_timeout='115s'");
    rows = (await prisma.$queryRawUnsafe(`
      SELECT l.listing_id, l.status, l.idx_display_yn, pr.mls_status AS proj_status, pr.idx_display_yn AS proj_idx
      FROM listings l LEFT JOIN listing_search_projection pr ON pr.listing_id = l.listing_id
      WHERE l.listing_id LIKE 'RLS%'`)) as any;
    const v: any = (await prisma.$queryRawUnsafe(`
      SELECT count(*)::int total,
        count(*) FILTER (WHERE status='Active')::int active,
        count(*) FILTER (WHERE status='Pending')::int pending,
        count(*) FILTER (WHERE status='ComingSoon')::int coming_soon,
        count(*) FILTER (WHERE status='Closed')::int closed,
        count(*) FILTER (WHERE status='Withdrawn')::int withdrawn
      FROM listings WHERE listing_id LIKE 'RLS%'`))[0];
    volume = v;
    const last: any[] = await prisma.$queryRawUnsafe(`SELECT changes FROM audit_events WHERE action='reconcile_monitor_run' ORDER BY created_at DESC LIMIT 1`);
    if (last[0]?.changes) prev = { census: last[0].changes.census, volume: last[0].changes.volume };
  } finally { /* keep open for persist below */ }

  const dbIds = new Set(rows.map((r) => r.listing_id));
  const census: CensusMetrics = { mislabel_suppressed: 0, stale_showing: 0, status_drift: 0, projection_drift: 0, missing_inventory: 0 };
  for (const r of rows) {
    const s = normalizeStandardStatus(r.status);
    const liveStatus = live.get(r.listing_id);
    if (TERMINAL_STATUSES.has(s) && liveStatus) census.mislabel_suppressed++;
    else if (ON_MARKET_STATUSES.has(s) && !liveStatus && r.idx_display_yn === true) census.stale_showing++;
    else if (ON_MARKET_STATUSES.has(s) && liveStatus && normalizeStandardStatus(liveStatus) !== s) census.status_drift++;
    if (r.proj_status != null && (normalizeStandardStatus(r.proj_status) !== s || r.proj_idx !== r.idx_display_yn)) census.projection_drift++;
  }
  for (const id of live.keys()) if (!dbIds.has(id)) census.missing_inventory++;

  const alerts = evaluateAlerts({ census, volume, prev, api });
  console.log(formatSummary({ runTime, census, volume, api }));
  console.log('');
  const notify = alertsToNotify(alerts);
  if (alerts.length === 0) console.log('✅ OK — all reconciliation invariants hold, no state change.');
  for (const a of alerts) {
    const tag = a.severity === 'critical' ? '🔴 CRITICAL' : a.severity === 'high' ? '🟠 HIGH' : '🟡 WARNING';
    const page = a.transition === 'new' ? ' «PAGE»' : a.transition === 'recovered' ? ' «RECOVERED»' : ' (ongoing, no re-page)';
    console.log(`${tag} [${a.key}] ${a.message}${page}`);
  }
  console.log(`\nnotify (new/recovered only): ${notify.length}`);

  if (PERSIST) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO audit_events(action,entity_type,entity_id,user_type,changes,created_at) VALUES('reconcile_monitor_run','system','reconcile-monitor','system',$1::jsonb, now())`,
        JSON.stringify({ census, volume, api, at: runTime }),
      );
    } catch (e) { console.error('persist failed:', (e as Error).message); }
  }
  await prisma.$disconnect();

  const critical = hasCriticalAlert(alerts);
  console.log(critical ? '\nEXIT 1 — live CRITICAL alert(s) firing' : '\nEXIT 0 — healthy');
  process.exit(critical ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
