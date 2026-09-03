/**
 * CENSUS OF `CustomProperty.CustomFields` — the UNDECLARED NYC field family.
 *
 * `$metadata` declares CustomFields as a single Edm.String. Its CONTENT is a
 * JSON object whose keys are NYC/REBNY-specific facts that appear in no schema:
 * MaximumFinancingPercent, FlipTax, AttendanceType, ElevatorsTotal,
 * BuildingStaffType, SponsorUnitYN and more.
 *
 * Every field-level audit to date started from declared fields, so this entire
 * family was invisible. It cannot be inventoried from `$metadata` — the only way
 * is to read rows and union the keys, which is what this does.
 *
 * Keys vary per row, so coverage is reported as "rows carrying this key out of
 * rows read". Nothing is extrapolated to rows not read.
 *
 * READ-ONLY. GET only. No Prisma, no Neon.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { writeFileSync } from 'node:fs';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'customfields.json';
const PAGES = Number(process.argv.includes('--pages') ? process.argv[process.argv.indexOf('--pages') + 1] : 12);

const token = await getAccessToken();
const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string) {
  for (let a = 0; a < 5; a++) {
    let r: Response;
    try { r = await fetch(url, { headers: auth }); } catch { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
    return r;
  }
  return null;
}

const ACTIVE = "StandardStatus eq 'Active'";
const keyCounts = new Map<string, number>();
const valueSamples = new Map<string, Set<string>>();
const byCommonInterest = new Map<string, Map<string, number>>();

let rowsRead = 0;
let unparsable = 0;
let nullBlobs = 0;
let url: string | null =
  `${API}/odata/Property?$filter=${encodeURIComponent(ACTIVE)}&$top=200&$count=true` +
  `&$select=ListingId,CommonInterest&$expand=CustomProperty($select=CustomFields)`;
let declared: number | null = null;
let pages = 0;

while (url && pages < PAGES) {
  const res = await get(url);
  if (!res || !res.ok) {
    console.error(`UNVERIFIED — census aborted mid-pagination (HTTP ${res?.status ?? 'none'}).`);
    console.error('This is not a zero result and not a completed census.');
    process.exit(2);
  }
  const body = (await res.json()) as Record<string, unknown>;
  if (declared === null) declared = (body['@odata.count'] as number) ?? null;

  for (const row of (body.value as Array<Record<string, unknown>>) ?? []) {
    rowsRead++;
    const ci = (row.CommonInterest as string) ?? '(null)';
    const cp = row.CustomProperty as Array<Record<string, unknown>> | undefined;
    const blob = cp && cp.length > 0 ? (cp[0].CustomFields as string | null) : null;
    if (!blob) { nullBlobs++; continue; }

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(blob); } catch { unparsable++; continue; }

    if (!byCommonInterest.has(ci)) byCommonInterest.set(ci, new Map());
    const ciMap = byCommonInterest.get(ci)!;

    for (const [k, v] of Object.entries(parsed)) {
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
      ciMap.set(k, (ciMap.get(k) ?? 0) + 1);
      if (!valueSamples.has(k)) valueSamples.set(k, new Set());
      const set = valueSamples.get(k)!;
      if (set.size < 12) set.add(String(v));
    }
  }

  url = (body['@odata.nextLink'] as string) ?? null;
  pages++;
  await sleep(200);
}

const keys = [...keyCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([key, rows]) => ({
    key,
    rowsCarrying: rows,
    pctOfRowsRead: Number(((rows / rowsRead) * 100).toFixed(1)),
    sampleValues: [...(valueSamples.get(key) ?? [])],
  }));

const out = {
  probedAt: new Date().toISOString(),
  api: API,
  coverage: {
    rowsRead,
    providerDeclaredActive: declared,
    pagesRead: pages,
    complete: declared !== null && rowsRead >= declared,
    nullBlobs,
    unparsable,
    note:
      'CustomFields is an UNDECLARED JSON blob inside a declared Edm.String. Keys vary per ' +
      'row, so a key absent from a row is absent — not null. Percentages are of ROWS READ.',
  },
  distinctKeys: keys.length,
  keys,
  byCommonInterest: Object.fromEntries(
    [...byCommonInterest.entries()].map(([ci, m]) => [ci, Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]))]),
  ),
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  coverage: out.coverage,
  distinctKeys: out.distinctKeys,
  keys: keys.map((k) => `${k.key} (${k.rowsCarrying}/${rowsRead} = ${k.pctOfRowsRead}%)`),
}, null, 2));
