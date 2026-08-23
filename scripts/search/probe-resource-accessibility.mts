/**
 * ENDPOINT ACCESSIBILITY + POPULATION for every live Cotality resource.
 *
 * `$metadata` OVER-DECLARES what the licence grants — `Building` is declared and
 * `GET /Building` is 403. So a coverage matrix built from declarations alone
 * would assert availability nobody verified. This probes each resource two ways:
 *
 *   1. direct collection GET      -> is the endpoint licensed at all?
 *   2. $expand from Property      -> is it reachable as a related resource?
 *
 * Three states, never collapsed: SUPPORTED / PROVIDER_REJECTED / UNVERIFIED.
 * A 403 is a licence fact and is reported as such, not as "zero rows".
 *
 * READ-ONLY. GET only. No Prisma, no Neon.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { writeFileSync } from 'node:fs';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'access.json';
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

type Probe = { state: string; status: number | string; count?: number | null; detail?: string };

/** Direct collection GET — the licence question. */
async function collection(resource: string): Promise<Probe> {
  const r = await get(`${API}/odata/${resource}?$top=1&$count=true`);
  if (!r) return { state: 'UNVERIFIED', status: 'no response after retries' };
  const text = await r.text();
  if (!r.ok) {
    return {
      state: r.status === 403 ? 'PROVIDER_REJECTED (not licensed)' : 'PROVIDER_REJECTED',
      status: r.status,
      detail: text.slice(0, 180),
    };
  }
  try {
    const body = JSON.parse(text);
    return { state: 'SUPPORTED', status: 200, count: body['@odata.count'] ?? null };
  } catch { return { state: 'UNVERIFIED', status: 200, detail: 'unparsable body' }; }
}

/** $expand from Property — the related-resource question. */
async function viaExpand(nav: string): Promise<Probe> {
  const r = await get(
    `${API}/odata/Property?$filter=${encodeURIComponent("StandardStatus eq 'Active'")}` +
    `&$top=3&$select=ListingId&$expand=${nav}`,
  );
  if (!r) return { state: 'UNVERIFIED', status: 'no response after retries' };
  const text = await r.text();
  if (!r.ok) return { state: 'PROVIDER_REJECTED', status: r.status, detail: text.slice(0, 180) };
  try {
    const rows = JSON.parse(text).value ?? [];
    // How many of the sampled parents actually carry a non-empty related payload?
    let withPayload = 0;
    for (const row of rows) {
      const v = row[nav];
      if (Array.isArray(v) ? v.length > 0 : v != null) withPayload++;
    }
    return { state: 'SUPPORTED', status: 200, detail: `${withPayload}/${rows.length} sampled parents carry a payload` };
  } catch { return { state: 'UNVERIFIED', status: 200, detail: 'unparsable body' }; }
}

const COTALITYURCES = [
  'Property', 'Member', 'Office', 'Media', 'OpenHouse', 'CustomProperty',
  'PropertyRooms', 'PropertyUnitTypes', 'PropertyGreenVerification',
  'HistoryTransactional', 'Teams', 'TeamMembers', 'Building',
  'Field', 'Lookup', 'Model', 'Enumeration',
];

const NAVIGATION = [
  'Media', 'OpenHouse', 'CustomProperty', 'Rooms', 'UnitTypes', 'Building',
  'ListAgent', 'ListOffice', 'BuyerAgent', 'BuyerOffice',
  'CoListAgent', 'CoListOffice', 'CoBuyerAgent', 'CoBuyerOffice',
];

const out: Record<string, unknown> = { probedAt: new Date().toISOString(), api: API, collections: {}, navigation: {} };

for (const r of COTALITYURCES) {
  (out.collections as Record<string, Probe>)[r] = await collection(r);
  await sleep(200);
}
for (const n of NAVIGATION) {
  (out.navigation as Record<string, Probe>)[n] = await viaExpand(n);
  await sleep(200);
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
