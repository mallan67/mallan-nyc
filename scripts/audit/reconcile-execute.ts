/**
 * reconcile-execute.ts — Phase 2 corrector. Reconciles mislabeled/stale rows to live truth.
 *
 * Uses the proven `reconcileStatusDecision`. For EVERY candidate it RE-VERIFIES the row's live
 * status immediately before writing (never a snapshot), recomputes the decision, and only writes
 * if it is still actionable. Writes are dual: `listings` (status + idx_display_yn via the canonical
 * computeGateColumns) AND `listing_search_projection` (via dualWriteProjectionForListingId), plus an
 * audit event. DRY-RUN by default; pass --execute to write. Filters: --only=<class>, --limit=<n>.
 *
 * Requires env: U (Neon DATABASE_URL), IDX_CLIENT_ID/SECRET.
 */
import { PrismaClient } from '@prisma/client';
import { reconcileStatusDecision, ON_MARKET_STATUSES, type LiveTruth } from '@/lib/idx/reconcile-decision';
import { computeGateColumns, TERMINAL_STATUSES } from '@/lib/idx/trestle-mapper';
import { dualWriteProjectionForListingId } from '@/lib/search/listing-search-projection';

const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const EXECUTE = process.argv.includes('--execute');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
const TARGET = (process.argv.find((a) => a.startsWith('--target=')) || '').split('=')[1] || null;
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0) || Infinity;

async function getToken(): Promise<string> {
  const b = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.IDX_CLIENT_ID!, client_secret: process.env.IDX_CLIENT_SECRET!, scope: 'api' });
  const r = await fetch(BASE + '/oidc/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() });
  if (!r.ok) throw new Error('token ' + r.status);
  return (await r.json()).access_token;
}
async function fetchAllLive(token: string, status: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let url: string | null = BASE + `/odata/Property?$select=ListingId,StandardStatus&$top=1000&$filter=${encodeURIComponent(`StandardStatus eq '${status}'`)}`;
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
async function liveStatusOf(token: string, ids: string[]): Promise<Map<string, string>> {
  const res = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const filter = batch.map((id) => `ListingId eq '${id.replace(/'/g, "''")}'`).join(' or ');
    const url = BASE + `/odata/Property?$select=ListingId,StandardStatus&$top=25&$filter=${encodeURIComponent(filter)}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 3000)); i -= 25; continue; }
    if (!r.ok) continue;
    for (const v of (await r.json()).value || []) res.set(v.ListingId, v.StandardStatus);
    await new Promise((x) => setTimeout(x, 150));
  }
  return res;
}
function truthFor(liveStatus: string | undefined): LiveTruth {
  if (!liveStatus) return { kind: 'absent' };
  if (ON_MARKET_STATUSES.has(liveStatus)) return { kind: 'onmarket', status: liveStatus };
  return { kind: 'terminal', status: liveStatus };
}

async function main() {
  console.log(`[reconcile-execute] mode=${EXECUTE ? 'EXECUTE (writes)' : 'DRY-RUN'}${ONLY ? ` only=${ONLY}` : ''}${LIMIT !== Infinity ? ` limit=${LIMIT}` : ''}`);
  const token = await getToken();
  const live = new Map<string, string>();
  for (const s of ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']) for (const [id, st] of await fetchAllLive(token, s)) live.set(id, st);
  console.log('[reconcile-execute] live on-market ids =', live.size);

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.U } } });
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT listing_id, status, idx_display_yn,
           internet_entire_listing_display_yn AS ield, internet_address_display_yn AS iadd,
           internet_automated_valuation_display_yn AS iavm, internet_consumer_comment_yn AS icc,
           participant_only, owner_opt_out, rls_eligible
    FROM listings WHERE listing_id LIKE 'RLS%'`);
  console.log('[reconcile-execute] DB RLS rows =', rows.length);

  // candidate update set (initial pass); stale on-market rows need per-id resolution
  const stale = rows.filter((r) => ON_MARKET_STATUSES.has(r.status) && !live.has(r.listing_id)).map((r) => r.listing_id);
  const staleResolved = await liveStatusOf(token, stale);
  let candidates = rows.filter((r) => {
    const truth = live.has(r.listing_id) ? truthFor(live.get(r.listing_id)) : (ON_MARKET_STATUSES.has(r.status) ? truthFor(staleResolved.get(r.listing_id)) : { kind: 'absent' } as LiveTruth);
    return reconcileStatusDecision(r.status, truth).action === 'update';
  });
  if (ONLY || TARGET) candidates = candidates.filter((r) => {
    const truth = live.has(r.listing_id) ? truthFor(live.get(r.listing_id)) : truthFor(staleResolved.get(r.listing_id));
    const d = reconcileStatusDecision(r.status, truth);
    return (!ONLY || d.className === ONLY) && (!TARGET || d.targetStatus === TARGET);
  });
  if (candidates.length > LIMIT) candidates = candidates.slice(0, LIMIT);
  console.log('[reconcile-execute] candidate rows to correct =', candidates.length);

  const now = new Date();
  const tally: Record<string, number> = {};
  let applied = 0, skippedReverified = 0;
  for (let i = 0; i < candidates.length; i += 25) {
    const batch = candidates.slice(i, i + 25);
    // RE-VERIFY live status for this batch immediately before writing (never a snapshot)
    const fresh = await liveStatusOf(token, batch.map((r) => r.listing_id));
    for (const r of batch) {
      const truth = truthFor(fresh.get(r.listing_id));
      const d = reconcileStatusDecision(r.status, truth);
      if (d.action !== 'update') { skippedReverified++; continue; } // changed since pull → skip
      const gate = computeGateColumns({
        status: d.targetStatus,
        internetEntireListingDisplayYN: r.ield, internetAddressDisplayYN: r.iadd,
        internetAutomatedValuationDisplayYN: r.iavm, internetConsumerCommentYN: r.icc,
        participantOnly: r.participant_only, ownerOptOut: r.owner_opt_out, rls_eligible: r.rls_eligible,
      });
      tally[`${d.className} → ${d.targetStatus}/idx=${gate.idx_display_yn}`] = (tally[`${d.className} → ${d.targetStatus}/idx=${gate.idx_display_yn}`] || 0) + 1;
      if (EXECUTE) {
        await prisma.$transaction([
          prisma.listing.update({
            where: { listing_id: r.listing_id },
            data: {
              status: d.targetStatus,
              idx_display_yn: gate.idx_display_yn,
              status_changed_at: now,
              modification_timestamp: now,
              terminal_since: d.targetIsTerminal ? now : null,
            },
          }),
          prisma.auditEvent.create({
            data: {
              action: 'reconcile_status_correction', entity_type: 'listing', entity_id: r.listing_id, user_type: 'system',
              changes: { from_status: r.status, to_status: d.targetStatus, idx_display_yn: gate.idx_display_yn, class: d.className, live_verified_at: now.toISOString(), reason: d.reason },
            },
          }),
        ]);
        await dualWriteProjectionForListingId(prisma as any, r.listing_id); // keep the mirror in lockstep
      }
      applied++;
    }
    console.log(`  ${Math.min(i + 25, candidates.length)}/${candidates.length} processed`);
  }
  await prisma.$disconnect();

  console.log(`\n================ ${EXECUTE ? 'APPLIED' : 'WOULD APPLY'} ================`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(48) + v);
  console.log(`\n  ${EXECUTE ? 'written' : 'planned'}=${applied}  skipped(reverified-changed)=${skippedReverified}`);
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
