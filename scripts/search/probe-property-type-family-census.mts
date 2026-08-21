/**
 * BOUNDED LIVE SEMANTIC CENSUS — the four zero-population Property Type controls,
 * plus Multi-Family, plus the resource/field-family inventory foundation.
 *
 * Answers ONE question per control: which provider fact does this UI label
 * actually mean? Population, overlap and disagreement are MEASURED, never
 * inferred from the fact that an enum declares a member.
 *
 * READ-ONLY. GET only. api.cotality.com only. No Prisma import, no Neon.
 * FAIL-LOUD: SUPPORTED / PROVIDER_REJECTED / UNVERIFIED never collapse.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { writeFileSync } from 'node:fs';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'census.json';

const token = await getAccessToken();
const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Response | null> {
  for (let a = 0; a < 5; a++) {
    let r: Response;
    try { r = await fetch(url, { headers: auth }); } catch { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
    return r;
  }
  return null;
}

type Probe = {
  label: string;
  filter: string;
  state: 'SUPPORTED' | 'PROVIDER_REJECTED' | 'UNVERIFIED';
  status: number | string;
  count: number | null;
  body?: string;
};

async function probe(label: string, filter: string, select?: string): Promise<Probe> {
  const sel = select ?? 'ListingId';
  const url = `${API}/odata/Property?$filter=${encodeURIComponent(filter)}&$top=1&$count=true&$select=${encodeURIComponent(sel)}`;
  const r = await get(url);
  if (!r) return { label, filter, state: 'UNVERIFIED', status: 'no response', count: null };
  const text = await r.text();
  if (!r.ok) return { label, filter, state: 'PROVIDER_REJECTED', status: r.status, count: null, body: text.slice(0, 240) };
  let count: number | null = null;
  try { count = JSON.parse(text)['@odata.count'] ?? null; } catch { count = null; }
  if (count === null) return { label, filter, state: 'UNVERIFIED', status: r.status, count: null, body: text.slice(0, 240) };
  return { label, filter, state: 'SUPPORTED', status: r.status, count };
}

/** Sample rows so the CONTEXT of a match can be read, not just its count. */
async function sample(filter: string, select: string, top = 15): Promise<unknown[] | { UNVERIFIED: string }> {
  const url = `${API}/odata/Property?$filter=${encodeURIComponent(filter)}&$top=${top}&$select=${encodeURIComponent(select)}`;
  const r = await get(url);
  if (!r) return { UNVERIFIED: 'no response' };
  if (!r.ok) return { UNVERIFIED: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
  try { return (JSON.parse(await r.text()).value ?? []) as unknown[]; } catch { return { UNVERIFIED: 'unparsable body' }; }
}

// ── LIVE $metadata ──────────────────────────────────────────────────────────
const metaRes = await get(`${API}/odata/$metadata`);
if (!metaRes || !metaRes.ok) {
  console.error(`UNVERIFIED — $metadata unreachable (HTTP ${metaRes?.status ?? 'none'})`);
  process.exit(2);
}
const meta = await metaRes.text();

/** Every EntityType and its declared property count — the coverage foundation. */
const entityTypes: Record<string, { fieldCount: number; fields: Record<string, string> }> = {};
for (const m of meta.matchAll(/<EntityType Name="([^"]+)"[^>]*>/g)) {
  const name = m[1];
  const start = m.index ?? 0;
  const end = meta.indexOf('</EntityType>', start);
  const block = meta.slice(start, end);
  const fields: Record<string, string> = {};
  for (const p of block.matchAll(/<Property Name="([^"]+)" Type="([^"]+)"/g)) fields[p[1]] = p[2];
  entityTypes[name] = { fieldCount: Object.keys(fields).length, fields };
}

const propertyFields = entityTypes['Property']?.fields ?? {};

/** Navigation properties on Property = the expandable related resources. */
const propStart = meta.indexOf('<EntityType Name="Property"');
const propBlock = meta.slice(propStart, meta.indexOf('</EntityType>', propStart));
const navProperties = [...propBlock.matchAll(/<NavigationProperty Name="([^"]+)" Type="([^"]+)"/g)]
  .map((m) => ({ name: m[1], type: m[2] }));

function enumMembers(typeRef: string | undefined): { typeName: string | null; isMulti: boolean; members: string[] } {
  if (!typeRef) return { typeName: null, isMulti: false, members: [] };
  const bare = typeRef.startsWith('Collection(') ? typeRef.slice(11, -1) : typeRef;
  const short = bare.split('.').pop() ?? bare;
  const idx = meta.indexOf(`EnumType Name="${short}"`);
  if (idx === -1) return { typeName: bare, isMulti: bare.includes('.Enums.Multi.'), members: [] };
  const block = meta.slice(idx, meta.indexOf('</EnumType>', idx));
  return {
    typeName: bare,
    isMulti: bare.includes('.Enums.Multi.'),
    members: [...block.matchAll(/<Member Name="([^"]+)"/g)].map((x) => x[1]),
  };
}

const structureType = enumMembers(propertyFields['StructureType']);
const commonInterest = enumMembers(propertyFields['CommonInterest']);
const propertyType = enumMembers(propertyFields['PropertyType']);
const subTypeAdditional = enumMembers(propertyFields['PropertySubTypeAdditional']);

/** Multi-enum membership uses `has NS'Member'`; scalar uses `eq 'Member'`. */
const hasExpr = (field: string, ns: string | null, member: string) => `${field} has ${ns}'${member}'`;

const ACTIVE = "StandardStatus eq 'Active'";
const results: Probe[] = [];
const push = async (label: string, filter: string) => { results.push(await probe(label, filter)); await sleep(140); };

// ── 1. TOWNHOUSE ────────────────────────────────────────────────────────────
await push('ALL-STATUS PropertySubType eq Townhouse', `PropertySubType eq 'Townhouse'`);
if (structureType.members.includes('Townhouse')) {
  const expr = structureType.isMulti
    ? hasExpr('StructureType', structureType.typeName, 'Townhouse')
    : `StructureType eq 'Townhouse'`;
  await push('ALL-STATUS StructureType Townhouse', expr);
  await push('ACTIVE StructureType Townhouse', `${ACTIVE} and ${expr}`);
}

// ── 2/3. CONDO + CO-OP — ownership vs sub-type ──────────────────────────────
for (const member of ['Condominium', 'StockCooperative']) {
  await push(`ALL-STATUS CommonInterest eq ${member}`, `CommonInterest eq '${member}'`);
  await push(`ACTIVE CommonInterest eq ${member}`, `${ACTIVE} and CommonInterest eq '${member}'`);
  await push(`ALL-STATUS PropertySubType eq ${member}`, `PropertySubType eq '${member}'`);
  // Disagreement: does either field ever carry it without the other?
  await push(
    `ACTIVE CommonInterest ${member} AND PropertySubType ne ${member}`,
    `${ACTIVE} and CommonInterest eq '${member}' and PropertySubType ne '${member}'`,
  );
}
await push('ACTIVE CommonInterest ne null', `${ACTIVE} and CommonInterest ne null`);
for (const member of commonInterest.members) {
  await push(`census CommonInterest ${member}`, `${ACTIVE} and CommonInterest eq '${member}'`);
}

// ── 4. LAND — PropertyType eq 'Land' is NOT PropertySubType 'UnimprovedLand' ─
await push('ALL-STATUS PropertyType eq Land', `PropertyType eq 'Land'`);
await push('ACTIVE PropertyType eq Land', `${ACTIVE} and PropertyType eq 'Land'`);
await push('ALL-STATUS PropertySubType eq UnimprovedLand', `PropertySubType eq 'UnimprovedLand'`);
await push('ALL-STATUS PropertySubType eq Land', `PropertySubType eq 'Land'`);
await push('ALL-STATUS PropertySubType eq ImprovedLand', `PropertySubType eq 'ImprovedLand'`);

// ── 5. MULTI-FAMILY — declared on THREE fields ──────────────────────────────
await push('ALL-STATUS PropertyType eq MultiFamily', `PropertyType eq 'MultiFamily'`);
await push('ACTIVE PropertyType eq MultiFamily', `${ACTIVE} and PropertyType eq 'MultiFamily'`);
await push('ACTIVE PropertySubType eq MultiFamily', `${ACTIVE} and PropertySubType eq 'MultiFamily'`);
if (structureType.members.includes('MultiFamily')) {
  const expr = structureType.isMulti
    ? hasExpr('StructureType', structureType.typeName, 'MultiFamily')
    : `StructureType eq 'MultiFamily'`;
  await push('ACTIVE StructureType MultiFamily', `${ACTIVE} and ${expr}`);
  await push(
    'ACTIVE StructureType MultiFamily AND PropertySubType ne MultiFamily',
    `${ACTIVE} and ${expr} and PropertySubType ne 'MultiFamily'`,
  );
}
await push('ACTIVE StructureType ne null', `${ACTIVE} and StructureType ne null`);

// ── 6. CONTEXT SAMPLES — read what the matching rows actually are ───────────
const CTX = 'ListingId,PropertyType,PropertySubType,PropertySubTypeAdditional,StructureType,CommonInterest,StandardStatus,BedroomsTotal,NumberOfUnitsTotal';
const samples: Record<string, unknown> = {};
if (structureType.members.includes('Townhouse')) {
  const expr = structureType.isMulti
    ? hasExpr('StructureType', structureType.typeName, 'Townhouse')
    : `StructureType eq 'Townhouse'`;
  samples.structureTypeTownhouse = await sample(expr, CTX);
}
samples.propertyTypeLand = await sample(`PropertyType eq 'Land'`, CTX);
samples.commonInterestCondominium = await sample(`${ACTIVE} and CommonInterest eq 'Condominium'`, CTX);
samples.commonInterestStockCooperative = await sample(`${ACTIVE} and CommonInterest eq 'StockCooperative'`, CTX);
samples.propertySubTypeMultiFamily = await sample(`${ACTIVE} and PropertySubType eq 'MultiFamily'`, CTX);
samples.propertyTypeMultiFamily = await sample(`PropertyType eq 'MultiFamily'`, CTX);

// ── 7. FINANCING FIELD DISCOVERY — including building max financing ─────────
const FINANCE_RE = /financ|loan|mortgage|ltv|downpayment|down_payment|concession|terms|lender|amortiz|cash|fha|va|assumable|percent|ratio/i;
const financingFields = Object.entries(propertyFields)
  .filter(([name]) => FINANCE_RE.test(name))
  .map(([name, type]) => ({ name, type, enumMembers: enumMembers(type).members }));

const customPropertyFinancing = Object.entries(entityTypes['CustomProperty']?.fields ?? {})
  .filter(([name]) => FINANCE_RE.test(name))
  .map(([name, type]) => ({ name, type, enumMembers: enumMembers(type).members }));

const evidence = {
  probedAt: new Date().toISOString(),
  api: API,
  resourceInventory: {
    entityTypeCount: Object.keys(entityTypes).length,
    fieldCounts: Object.fromEntries(Object.entries(entityTypes).map(([k, v]) => [k, v.fieldCount])),
    propertyNavigationProperties: navProperties,
  },
  classificationFields: {
    PropertyType: { declared: propertyFields['PropertyType'] ?? null, ...propertyType },
    PropertySubType: { declared: propertyFields['PropertySubType'] ?? null, ...enumMembers(propertyFields['PropertySubType']) },
    PropertySubTypeAdditional: { declared: propertyFields['PropertySubTypeAdditional'] ?? null, ...subTypeAdditional },
    StructureType: { declared: propertyFields['StructureType'] ?? null, ...structureType },
    CommonInterest: { declared: propertyFields['CommonInterest'] ?? null, ...commonInterest },
    OwnershipType: { declared: propertyFields['OwnershipType'] ?? null, ...enumMembers(propertyFields['OwnershipType']) },
  },
  probes: results,
  samples,
  financingFields,
  customPropertyFinancing,
};

writeFileSync(OUT, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({
  entityFieldCounts: evidence.resourceInventory.fieldCounts,
  navProperties: navProperties.map((n) => n.name),
  StructureType: { declared: propertyFields['StructureType'] ?? null, isMulti: structureType.isMulti, memberCount: structureType.members.length },
  CommonInterest: { declared: propertyFields['CommonInterest'] ?? null, members: commonInterest.members },
  probes: results.map((p) => ({ label: p.label, state: p.state, status: p.status, count: p.count, body: p.body })),
  financingFieldNames: financingFields.map((f) => f.name),
  customPropertyFinancingNames: customPropertyFinancing.map((f) => f.name),
}, null, 2));
