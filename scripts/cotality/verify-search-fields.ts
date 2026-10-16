/**
 * cotality:verify-search — proves the search can really use every Cotality field it lists.
 *
 * For every Property field Cotality filters server side, builds a filter with lib/search/field-filters.ts (the same code the search
 * route runs) and sends it to the live API; every one must answer HTTP 200. For the fields Cotality blocks, it checks they can be
 * selected (the search route selects them and filters the fetched page). Read-only, paced under the provider quota (280/minute).
 *
 * Env: IDX_CLIENT_ID, IDX_CLIENT_SECRET, TRESTLE_API_URL.   Usage: npx tsx scripts/cotality/verify-search-fields.ts
 */
import { allSearchableFields, buildFieldFilters, opsFor, type FieldKind } from '../../lib/search/field-filters';

const base = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function token(): Promise<string> {
  const res = await fetch(`${base}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.IDX_CLIENT_ID || '', client_secret: process.env.IDX_CLIENT_SECRET || '', scope: 'api' }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json()).access_token;
}

const SAMPLE: Record<FieldKind, (members: string[] | null) => { op: string; v: unknown }> = {
  boolean: () => ({ op: 'eq', v: true }),
  number: () => ({ op: 'ge', v: 0 }),
  date: () => ({ op: 'ge', v: '2000-01-01' }),
  datetime: () => ({ op: 'ge', v: '2000-01-01' }),
  string: () => ({ op: 'eq', v: 'a' }),
  enum: (m) => ({ op: 'in', v: [m && m[0]] }),
};

async function get(tok: string, query: string): Promise<{ status: number; body: string }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${base}/odata/Property?${query}`, { headers: { authorization: `Bearer ${tok}` } });
    if (res.status === 429) { await sleep(15_000); continue; }
    return { status: res.status, body: res.ok ? '' : (await res.text()).slice(0, 160) };
  }
  return { status: 429, body: 'rate-limited' };
}

async function main() {
  const tok = await token();
  const fields = allSearchableFields().filter((f) => f.source === 'property');
  const serverSide = fields.filter((f) => f.serverSide);
  const blocked = fields.filter((f) => !f.serverSide);
  const failures: string[] = [];
  let n = 0;

  for (const f of serverSide) {
    // every operator the UI offers for this kind, with a sample value
    const sample = SAMPLE[f.kind](f.members);
    const built = buildFieldFilters(JSON.stringify([{ f: f.name, op: sample.op, v: sample.v }]));
    if (built.rejected.length || built.clauses.length !== 1) { failures.push(`${f.name}: builder rejected ${JSON.stringify(built.rejected)}`); continue; }
    const r = await get(tok, `$top=1&$select=ListingKey&$filter=${encodeURIComponent(built.clauses[0])}`);
    if (r.status !== 200) failures.push(`${f.name} [${built.clauses[0]}]: HTTP ${r.status} ${r.body}`);
    await sleep(300);
    if (++n % 100 === 0) console.log(`verified ${n}/${serverSide.length}`);
  }

  // blocked fields: they are fetched with $select and filtered on the page, so Cotality must accept them in $select (chunks of 40)
  for (let i = 0; i < blocked.length; i += 40) {
    const chunk = blocked.slice(i, i + 40).map((f) => f.name);
    const r = await get(tok, `$top=1&$select=ListingKey,${chunk.join(',')}`);
    if (r.status !== 200) failures.push(`select of ${chunk.join(',')}: HTTP ${r.status} ${r.body}`);
    await sleep(400);
  }

  console.log(`cotality:verify-search — ${serverSide.length} server-side fields queried, ${blocked.length} page-filtered fields selected, ${failures.length} failures`);
  for (const f of failures) console.log('  FAIL', f);
  process.exit(failures.length ? 1 : 0);
}

void opsFor;
main().catch((e) => { console.error(e); process.exit(1); });
