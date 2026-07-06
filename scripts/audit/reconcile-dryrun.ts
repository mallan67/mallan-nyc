/**
 * reconcile-dryrun.ts — proves the REAL reconcile-decision module against live production data.
 *
 * Imports the exact `reconcileStatusDecision` that feed-reconcile will call, pulls the full
 * live Cotality on-market universe + the full DB (no sampling), applies the decision to every
 * row, and tallies the actions. The tally must match the independent census
 * (scripts/audit/reconcile-db-vs-live-cotality.mjs): un-suppress 103, hide the 345 correctly,
 * leave the departed alone — and NEVER withdraw a live on-market listing.
 *
 * READ-ONLY. Computes decisions; writes nothing.
 */
import { PrismaClient } from '@prisma/client';
import { reconcileStatusDecision, ON_MARKET_STATUSES, type LiveTruth } from '@/lib/idx/reconcile-decision';

const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function getToken(): Promise<string> {
  const b = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.IDX_CLIENT_ID!, client_secret: process.env.IDX_CLIENT_SECRET!, scope: 'api' });
  const r = await fetch(BASE + '/oidc/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() });
  if (!r.ok) throw new Error('token ' + r.status);
  return (await r.json()).access_token;
}

async function fetchAllLive(token: string, status: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let url: string | null = BASE + '/odata/Property?$select=ListingId,StandardStatus&$top=1000&$filter=' + encodeURIComponent(`StandardStatus eq '${status}'`);
  while (url) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 4000)); continue; }
    if (!r.ok) throw new Error(status + ' HTTP ' + r.status);
    const j: any = await r.json();
    for (const v of j.value || []) out.set(v.ListingId, v.StandardStatus);
    url = j['@odata.nextLink'] || null;
  }
  return out;
}

async function resolveStatuses(token: string, ids: string[]): Promise<Map<string, string>> {
  const res = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const filter = batch.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(' or ');
    const url = BASE + '/odata/Property?$select=ListingId,StandardStatus&$top=25&$filter=' + encodeURIComponent(filter);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 3000)); i -= 25; continue; }
    if (!r.ok) continue;
    for (const v of (await r.json()).value || []) res.set(v.ListingId, v.StandardStatus);
    await new Promise((x) => setTimeout(x, 200));
  }
  return res;
}

async function main() {
  const token = await getToken();
  console.log('[dry-run] pulling full live on-market universe...');
  const live = new Map<string, string>();
  for (const s of ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']) {
    for (const [id, st] of await fetchAllLive(token, s)) live.set(id, st);
  }
  console.log('[dry-run] live on-market ids =', live.size);

  const p = new PrismaClient({ datasources: { db: { url: process.env.U } } });
  let rows: Array<{ listing_id: string; status: string; idx_display_yn: boolean | null }>;
  try {
    await p.$executeRawUnsafe("SET statement_timeout='115s'");
    rows = (await p.$queryRawUnsafe(`SELECT listing_id, status, idx_display_yn FROM listings WHERE listing_id LIKE 'RLS%'`)) as any;
  } finally { await p.$disconnect(); }
  console.log('[dry-run] DB RLS rows =', rows.length);

  // rows that are on-market in DB but NOT in live on-market → resolve true live status (Closed vs gone)
  const staleCandidates = rows.filter((r) => ON_MARKET_STATUSES.has(r.status) && !live.has(r.listing_id)).map((r) => r.listing_id);
  console.log('[dry-run] resolving', staleCandidates.length, 'stale candidates per-id...');
  const resolved = await resolveStatuses(token, staleCandidates);

  const tally: Record<string, number> = {};
  let violations = 0; // live on-market listing that the decision would withdraw — must be 0
  for (const r of rows) {
    let truth: LiveTruth;
    const liveStatus = live.get(r.listing_id);
    if (liveStatus) truth = { kind: 'onmarket', status: liveStatus };
    else if (resolved.has(r.listing_id)) truth = { kind: 'terminal', status: resolved.get(r.listing_id)! };
    else truth = { kind: 'absent' };
    const d = reconcileStatusDecision(r.status, truth);
    const key = `${d.className}/${d.action}`;
    tally[key] = (tally[key] || 0) + 1;
    // safety: a row that is live on-market must never become terminal
    if (truth.kind === 'onmarket' && d.targetIsTerminal) violations++;
  }

  console.log('\n================ DRY-RUN DECISION TALLY (real module, live data) ================');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(32) + v);
  console.log('\n  SAFETY: live-on-market rows the fix would withdraw =', violations, violations === 0 ? '(SAFE)' : '(VIOLATION!)');
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
