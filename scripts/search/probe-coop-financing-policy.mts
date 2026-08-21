/**
 * Does the licensed contract carry "maximum financing the building allows"?
 *
 * All 1,456 declared fields across 17 resources were searched by name for
 * financing / percent / max / allow / LTV / equity / loan / mortgage /
 * downpayment / flip / sublet / board / approval / reserve, plus the whole
 * 142-field CustomProperty extension and the 106-member Restrictions enum.
 * Nothing declares it. This probe checks the remaining places a value could
 * hide WITHOUT being declared as its own field, before anything is concluded.
 *
 * READ-ONLY. GET only. No Prisma, no Neon.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { writeFileSync } from 'node:fs';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'coop.json';
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

async function count(label: string, filter: string) {
  const r = await get(`${API}/odata/Property?$filter=${encodeURIComponent(filter)}&$top=1&$count=true&$select=ListingId`);
  if (!r) return { label, state: 'UNVERIFIED' as const, status: 'no response', count: null };
  const t = await r.text();
  if (!r.ok) return { label, state: 'PROVIDER_REJECTED' as const, status: r.status, count: null, body: t.slice(0, 200) };
  try { return { label, state: 'SUPPORTED' as const, status: 200, count: JSON.parse(t)['@odata.count'] ?? null }; }
  catch { return { label, state: 'UNVERIFIED' as const, status: 200, count: null }; }
}

const ACTIVE = "StandardStatus eq 'Active'";
const probes = [];

// 1. Is CustomProperty expandable at all, and what does CustomFields hold?
const expandUrl =
  `${API}/odata/Property?$filter=${encodeURIComponent(ACTIVE)}&$top=5` +
  `&$select=ListingId,CommonInterest&$expand=CustomProperty($select=CustomFields,Restrictions,AssociationFeeTotal,AdditionalFee,AdditionalFeeDescription,ApplicationFee,UnitLocation,ComplexName)`;
const expandRes = await get(expandUrl);
const customPropertySample = expandRes && expandRes.ok
  ? (JSON.parse(await expandRes.text()).value ?? [])
  : { UNVERIFIED: `HTTP ${expandRes?.status ?? 'none'}: ${expandRes ? (await expandRes.text()).slice(0, 300) : ''}` };

// 2. Population of the financing/policy fields that DO exist.
for (const [label, filter] of [
  ['CurrentFinancing ne null', `${ACTIVE} and CurrentFinancing ne null`],
  ['BuyerFinancing ne null', `${ACTIVE} and BuyerFinancing ne null`],
  ['ListingTerms ne null', `${ACTIVE} and ListingTerms ne null`],
  ['AssociationFee ne null', `${ACTIVE} and AssociationFee ne null`],
  ['TaxAnnualAmount ne null', `${ACTIVE} and TaxAnnualAmount ne null`],
  ['TaxBlock ne null', `${ACTIVE} and TaxBlock ne null`],
  ['TaxLot ne null', `${ACTIVE} and TaxLot ne null`],
  ['GrossIncome ne null', `${ACTIVE} and GrossIncome ne null`],
  ['NetOperatingIncome ne null', `${ACTIVE} and NetOperatingIncome ne null`],
  ['TotalActualRent ne null', `${ACTIVE} and TotalActualRent ne null`],
  ['OperatingExpense ne null', `${ACTIVE} and OperatingExpense ne null`],
] as Array<[string, string]>) {
  probes.push(await count(label, filter));
  await sleep(140);
}

// 3. Does PublicRemarks carry a financing percentage in prose? Substring search
//    on a STRING field is supported (unlike on an enum), so this is measurable.
for (const term of ['financing', '% financing', 'max financing', 'financing allowed', 'sublet', 'flip tax']) {
  probes.push(await count(`PublicRemarks contains '${term}'`, `${ACTIVE} and contains(PublicRemarks,'${term}')`));
  await sleep(140);
}

const out = { probedAt: new Date().toISOString(), api: API, customPropertySample, probes };
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 6000));
