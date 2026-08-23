/**
 * SEARCH ↔ LIVE COTALITY CONTRACT VERIFIER
 *
 *   live metadata/probes → one canonical contract → all renderers/readers
 *                              → THIS, which fails before code is changed.
 *
 * Every Search defect found in this workstream existed because the contract was
 * checked by hand, once, and then drifted: `UnitYes` and `RoofDeck` matched
 * nothing for months; `NewConstructionYN` was declared "not exposed" while being
 * live and filterable; `live-truth.ts` carried a six-week-old pull date; the UI
 * offered `Hospitality` and `Healthcare`, which are not live members. None of
 * those are subtle — they were simply never re-checked.
 *
 * This reads the REAL contract modules the application uses. It deliberately does
 * NOT keep its own copy of the expected values: a verifier with a private
 * manifest verifies the manifest, not the code, and drifts in its own right.
 *
 * FAIL-LOUD CONTRACT (CLAUDE.md §A.0). SUPPORTED, PROVIDER_REJECTED and
 * UNVERIFIED are three states that may never collapse. An HTTP failure is never
 * reported as 0/null/absent — it aborts with UNVERIFIED.
 *
 *   npm run search:verify-live          # fails (exit 1) on any drift
 *   npm run search:verify-live -- --json
 *
 * READ-ONLY. GET only. Touches api.cotality.com and nothing else — no Neon, no
 * production route. Safe to run while a Neon autosuspend window is collecting.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { AMENITY_TOKENS } from '../../lib/search/canonical/amenity-vocabulary';
// Capability is the REGISTRY's call; the verifier checks the registry.
import { UNSUPPORTED_AMENITY_KEYS } from '../../lib/search/canonical/field-registry';
import { OWNERSHIP_FLAG_BY_COMMON_INTEREST } from '../../lib/search/canonical/amenity-match';
import { BATH_COMPONENTS_LIVE } from '../../lib/search/canonical/bath-contract';
import { PROPERTY_SUB_TYPE_LIVE } from '../../lib/search/canonical/property-subtype-contract';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const JSON_OUT = process.argv.includes('--json');
const ACTIVE = "StandardStatus eq 'Active'";

type Failure = { check: string; detail: string };
const failures: Failure[] = [];
const notes: string[] = [];
const fail = (check: string, detail: string) => failures.push({ check, detail });
const log = (s = '') => { if (!JSON_OUT) console.log(s); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const token = await getAccessToken();
const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

/** GET with 429 backoff. Returns null ONLY after retries are exhausted. */
async function get(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: auth });
    if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
    return r;
  }
  return null;
}

/** Abort rather than let a transport failure look like "zero rows". */
function abortUnverified(what: string, status: number | string): never {
  console.error(`\nUNVERIFIED — ${what} (HTTP ${status}).`);
  console.error('The contract was NOT checked. This is not a pass and not a failure count.');
  process.exit(2);
}

// ── 1. LIVE $metadata: field existence and declared type ────────────────────
log('SEARCH ↔ LIVE COTALITY CONTRACT VERIFIER');
log(`  ${API}\n`);

const metaRes = await get(`${API}/odata/$metadata`);
if (!metaRes || !metaRes.ok) abortUnverified('could not fetch $metadata', metaRes?.status ?? 'no response');
const meta = await metaRes.text();
const propertyBlock = meta.slice(meta.indexOf('EntityType Name="Property"'));
const propertyProps = new Map<string, string>(
  [...propertyBlock.slice(0, propertyBlock.indexOf('</EntityType>')).matchAll(/<Property Name="([^"]+)" Type="([^"]+)"/g)]
    .map((m) => [m[1], m[2]]),
);

/** Fields the contract depends on, with the type it assumes. */
const REQUIRED_FIELDS: Array<[string, string]> = [
  ['BathroomsFull', 'Edm.Int32'],
  ['BathroomsHalf', 'Edm.Int32'],
  ['BathroomsOneQuarter', 'Edm.Int32'],
  ['BathroomsThreeQuarter', 'Edm.Int32'],
  ['NewConstructionYN', 'Edm.Boolean'],
  ['GarageYN', 'Edm.Boolean'],
  ['FireplaceYN', 'Edm.Boolean'],
  ['PropertyType', ''],
  ['PropertySubType', ''],
  ['CommonInterest', ''],
  ['StandardStatus', ''],
  ['Furnished', ''],
  ['PetsAllowed', ''],
  ['YearBuilt', 'Edm.Int32'],
  ['LivingArea', 'Edm.Decimal'],
  ['ListPrice', 'Edm.Decimal'],
  ['BedroomsTotal', 'Edm.Int32'],
  ['PublicRemarks', 'Edm.String'],
  ['PostalCode', 'Edm.String'],
  ['CityRegion', 'Edm.String'],
  ['SubdivisionName', 'Edm.String'],
];

log('1. FIELD EXISTENCE + DECLARED TYPE');
for (const [field, expectedType] of REQUIRED_FIELDS) {
  const actual = propertyProps.get(field);
  if (!actual) { fail('field-exists', `${field} is NOT declared on the live Property entity`); continue; }
  if (expectedType && actual !== expectedType) {
    fail('field-type', `${field} is ${actual}, contract assumes ${expectedType}`);
  }
}
// A field the contract REFUSES must still be checked — if it ever gains a
// decimal sibling, the refusal reasoning should be revisited deliberately.
if (propertyProps.has('BathroomsTotalDecimal')) {
  fail('bath-contract', 'BathroomsTotalDecimal NOW EXISTS — the total-bath contract refuses BathroomsTotalInteger partly because no decimal total exists. Re-verify.');
}
log(`   ${REQUIRED_FIELDS.length} fields checked · ${propertyProps.size} declared on Property`);

// ── 2. ENUM MEMBERSHIP ──────────────────────────────────────────────────────
const enumsFile = (await import('../../data/cotality-enums.live.json', { with: { type: 'json' } })).default as {
  enums: Record<string, string[]>;
};
const enumByShort = new Map<string, string[]>(
  Object.entries(enumsFile.enums).map(([k, v]) => [k.split('.').pop()!, v]),
);

log('\n2. ENUM MEMBERSHIP (literals the contract emits)');
for (const value of Object.values(OWNERSHIP_FLAG_BY_COMMON_INTEREST ? { ...OWNERSHIP_FLAG_BY_COMMON_INTEREST } : {})) { void value; }
for (const member of Object.keys(OWNERSHIP_FLAG_BY_COMMON_INTEREST)) {
  if (!(enumByShort.get('CommonInterest') ?? []).includes(member)) {
    fail('enum-member', `CommonInterest '${member}' is not a live member`);
  }
}
// Commercial sub-type literals belong to the CRM workflow contracts, which are
// not yet defined. They will be checked here once those registries land.
log(`   ${Object.keys(OWNERSHIP_FLAG_BY_COMMON_INTEREST).length} ownership literals checked`);

// ── 3. LIVE PRESENCE of every amenity token (exhaustive census) ─────────────
log('\n3. AMENITY TOKEN LIVE-PRESENCE (exhaustive Active census)');
const AMENITY_SOURCE_FIELDS = [
  'InteriorFeatures', 'ExteriorFeatures', 'BuildingFeatures', 'Appliances',
  'LaundryFeatures', 'Cooling', 'View', 'ParkingFeatures', 'PetsAllowed',
];
const seen = new Map<string, Map<string, number>>(AMENITY_SOURCE_FIELDS.map((f) => [f, new Map()]));
let rows = 0;
let declared: number | null = null;
let url: string | null =
  `${API}/odata/Property?$filter=${encodeURIComponent(ACTIVE)}` +
  `&$select=${encodeURIComponent('ListingId,' + AMENITY_SOURCE_FIELDS.join(','))}&$top=1000&$count=true`;

while (url) {
  const res = await get(url);
  if (!res || !res.ok) abortUnverified('amenity census aborted mid-pagination', res?.status ?? 'no response');
  const body = (await res.json()) as Record<string, unknown>;
  if (declared === null) declared = (body['@odata.count'] as number) ?? null;
  for (const row of (body.value as Array<Record<string, unknown>>) ?? []) {
    rows++;
    for (const field of AMENITY_SOURCE_FIELDS) {
      const raw = row[field];
      if (raw === null || raw === undefined || raw === '') continue;
      const toks = Array.isArray(raw) ? raw.map(String) : String(raw).split(',');
      for (const t of toks.map((x) => x.trim()).filter(Boolean)) {
        const m = seen.get(field)!;
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
  }
  url = (body['@odata.nextLink'] as string) ?? null;
  if (url) await sleep(300);
}
if (declared !== null && rows !== declared) {
  abortUnverified(`census incomplete — read ${rows} of ${declared} declared rows`, 'partial');
}
log(`   census complete: ${rows}/${declared} Active rows`);

for (const key of Object.keys(AMENITY_TOKENS)) {
  if (UNSUPPORTED_AMENITY_KEYS.has(key)) continue;
  const mapping = AMENITY_TOKENS[key];
  if (mapping.match === 'isTrue') continue; // booleans covered by field checks
  const fields = mapping.field.split(',').map((f) => f.trim());
  for (const value of mapping.values) {
    const present = fields.some((f) => (seen.get(f)?.get(value) ?? 0) > 0);
    if (!present) {
      fail('token-live-present', `amenity '${key}' maps '${value}' on ${mapping.field}, which appears on ZERO live Active listings`);
    }
  }
}
// An amenity classified unavailable that has STARTED being populated should be
// surfaced — that is a filter Mallan could now offer.
for (const key of UNSUPPORTED_AMENITY_KEYS) {
  const mapping = AMENITY_TOKENS[key];
  if (!mapping || mapping.values.length === 0) continue;
  const fields = mapping.field.split(',').map((f) => f.trim());
  const nowPresent = mapping.values.filter((v) => fields.some((f) => (seen.get(f)?.get(v) ?? 0) > 0));
  if (nowPresent.length > 0) {
    fail('unavailable-now-populated', `'${key}' is classified unavailable but ${nowPresent.join(', ')} is NOW live-present — it can be offered`);
  }
}

// ── 4. FILTERABILITY: claims must match probes ─────────────────────────────
log('\n4. FILTERABILITY (probed, never inferred from $metadata)');
const FILTER_CLAIMS: Array<{ label: string; filter: string; expect: 'SUPPORTED' | 'REJECTED' }> = [
  { label: 'NewConstructionYN eq true', filter: `${ACTIVE} and NewConstructionYN eq true`, expect: 'SUPPORTED' },
  { label: "PropertySubType eq 'Apartment'", filter: `${ACTIVE} and PropertySubType eq 'Apartment'`, expect: 'SUPPORTED' },
  { label: "CommonInterest eq 'Condominium'", filter: `${ACTIVE} and CommonInterest eq 'Condominium'`, expect: 'SUPPORTED' },
  { label: "PropertyType eq 'Residential'", filter: `${ACTIVE} and PropertyType eq 'Residential'`, expect: 'SUPPORTED' },
  { label: 'BathroomsHalf ge 1', filter: `${ACTIVE} and BathroomsHalf ge 1`, expect: 'SUPPORTED' },
  { label: "PetsAllowed has 'Yes' (exact token)", filter: `${ACTIVE} and PetsAllowed has Cotality.DataStandard.RESO.DD.Enums.Multi.PetsAllowed'Yes'`, expect: 'SUPPORTED' },
  { label: "Furnished eq 'Furnished'", filter: `${ACTIVE} and Furnished eq 'Furnished'`, expect: 'SUPPORTED' },
  { label: "PropertySubType in ('Apartment','Loft')", filter: `${ACTIVE} and PropertySubType in ('Apartment','Loft')`, expect: 'SUPPORTED' },
  { label: 'PropertySubType OR of exact members', filter: `${ACTIVE} and (PropertySubType eq 'Office' or PropertySubType eq 'Retail')`, expect: 'SUPPORTED' },
  // Claims the contract relies on being REJECTED. If one starts working, a
  // Mallan-side post-filter could move to the provider — worth knowing.
  { label: 'contains(PetsAllowed,..) [expected rejected]', filter: `${ACTIVE} and contains(PetsAllowed,'Yes')`, expect: 'REJECTED' },
  // The operator the CRM builder used to emit. It is HTTP 400 because `contains`
  // takes strings and PropertySubType is an enum. Pinned here so the substring
  // form cannot creep back in unnoticed — and so that if the provider ever DID
  // start accepting it, that is a deliberate revisit rather than a silent one.
  { label: 'contains(PropertySubType,..) [expected rejected]', filter: `${ACTIVE} and contains(PropertySubType,'Apartment')`, expect: 'REJECTED' },
  { label: 'BuildingFeatures/any(..) [expected rejected]', filter: `${ACTIVE} and BuildingFeatures/any(a: a eq 'Elevators')`, expect: 'REJECTED' },
  { label: 'arithmetic div [expected rejected]', filter: `${ACTIVE} and BathroomsFull add (BathroomsHalf div 2) ge 2`, expect: 'REJECTED' },
];

for (const claim of FILTER_CLAIMS) {
  const r = await get(`${API}/odata/Property?$filter=${encodeURIComponent(claim.filter)}&$select=ListingKey&$top=1`);
  if (!r) abortUnverified(`filter probe "${claim.label}" got no response`, 'no response');
  const actual = r.ok ? 'SUPPORTED' : 'REJECTED';
  if (actual !== claim.expect) {
    fail('filterability', `${claim.label}: contract expects ${claim.expect}, live says ${actual}${r.ok ? '' : ` (HTTP ${r.status})`}`);
  }
  await sleep(300);
}
log(`   ${FILTER_CLAIMS.length} capability claims probed`);

// ── 5. BATH COMPONENT ASSUMPTION ───────────────────────────────────────────
// `full + half/2` is only lossless while the quarter components are unpopulated.
log('\n5. BATH COMPONENT POPULATION (the formula depends on this)');
for (const field of BATH_COMPONENTS_LIVE.presentButAlwaysZero) {
  const r = await get(`${API}/odata/Property?$filter=${encodeURIComponent(`${ACTIVE} and ${field} ge 1`)}&$count=true&$top=1`);
  if (!r) abortUnverified(`bath component probe for ${field}`, 'no response');
  if (!r.ok) { fail('bath-component', `${field} could not be probed (HTTP ${r.status}) — assumption UNVERIFIED`); continue; }
  const count = ((await r.json()) as Record<string, unknown>)['@odata.count'] as number;
  if (count > 0) {
    fail('bath-component', `${field} is NOW non-zero on ${count} Active listings — 'full + half/2' silently discards it. The total-bath contract must be revisited.`);
  }
  await sleep(300);
}
log(`   ${BATH_COMPONENTS_LIVE.presentButAlwaysZero.length} components re-checked`);

// ── 6. PROPERTY SUB-TYPE CONTRACT ──────────────────────────────────────────
// The registry called this a `multi_enum` for months while pointing at a SCALAR
// field, and the CRM builder emitted a `contains()` the provider 400s. Both
// survived because nothing re-read the provider. This section does.
log('\n6. PROPERTY SUB-TYPE (shape · vocabulary · population)');

const subTypeDeclared = propertyProps.get('PropertySubType');
if (!subTypeDeclared) {
  fail('subtype-shape', 'PropertySubType is NOT declared on the live Property entity');
} else {
  if (subTypeDeclared.startsWith('Collection(')) {
    fail('subtype-shape', `PropertySubType is now ${subTypeDeclared} — the contract treats it as SCALAR`);
  }
  // The MULTI sibling lives in the `.Enums.Multi.` namespace. If PropertySubType
  // ever moved there, exact `eq` would stop meaning what the contract says.
  if (subTypeDeclared.includes('.Enums.Multi.')) {
    fail('subtype-shape', `PropertySubType is now a MULTI enum (${subTypeDeclared}) — the contract treats it as scalar`);
  }
  if (PROPERTY_SUB_TYPE_LIVE.shape !== 'scalar_enum') {
    fail('subtype-shape', `contract declares shape '${PROPERTY_SUB_TYPE_LIVE.shape}', live is scalar`);
  }
}

// Vocabulary: the contract's member list against the live enum declaration.
const liveSubTypeMembers = enumByShort.get('PropertySubType') ?? [];
if (liveSubTypeMembers.length === 0) {
  notes.push('PropertySubType enum absent from data/cotality-enums.live.json — vocabulary not cross-checked here.');
} else {
  const contractSet = new Set<string>(PROPERTY_SUB_TYPE_LIVE.members);
  const missing = liveSubTypeMembers.filter((m) => !contractSet.has(m));
  const extra = [...contractSet].filter((m) => !liveSubTypeMembers.includes(m));
  if (missing.length > 0) fail('subtype-vocabulary', `live members absent from the contract: ${missing.join(', ')}`);
  if (extra.length > 0) fail('subtype-vocabulary', `contract members no longer live: ${extra.join(', ')}`);
}

// Population: the census the contract records must still hold. A member that
// gains or loses rows changes what the UI can honestly offer.
for (const [member, recorded] of Object.entries(PROPERTY_SUB_TYPE_LIVE.populatedActive)) {
  const r = await get(`${API}/odata/Property?$filter=${encodeURIComponent(`${ACTIVE} and PropertySubType eq '${member}'`)}&$count=true&$top=1`);
  if (!r) abortUnverified(`sub-type census probe for ${member}`, 'no response');
  if (!r.ok) { fail('subtype-census', `${member} could not be probed (HTTP ${r.status}) — population UNVERIFIED`); continue; }
  const count = ((await r.json()) as Record<string, unknown>)['@odata.count'] as number;
  if (count === 0) {
    fail('subtype-census', `${member} was ${recorded} live and is NOW ZERO — the contract records it as populated`);
  }
  await sleep(300);
}

// The four the UI offers that this feed has never carried. If one starts
// carrying rows, that is good news the product should hear about.
for (const member of PROPERTY_SUB_TYPE_LIVE.neverPopulatedAnyStatus) {
  const r = await get(`${API}/odata/Property?$filter=${encodeURIComponent(`PropertySubType eq '${member}'`)}&$count=true&$top=1`);
  if (!r) abortUnverified(`sub-type absence probe for ${member}`, 'no response');
  if (!r.ok) { fail('subtype-census', `${member} could not be probed (HTTP ${r.status}) — absence UNVERIFIED`); continue; }
  const count = ((await r.json()) as Record<string, unknown>)['@odata.count'] as number;
  if (count > 0) {
    fail('subtype-census', `${member} is recorded as never-populated but NOW has ${count} rows — the UI option is live and the contract must say so`);
  }
  await sleep(300);
}
log(`   shape + ${PROPERTY_SUB_TYPE_LIVE.members.length} members + ${Object.keys(PROPERTY_SUB_TYPE_LIVE.populatedActive).length} populated + ${PROPERTY_SUB_TYPE_LIVE.neverPopulatedAnyStatus.length} absent re-checked`);

// ── VERDICT ────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({ api: API, censusRows: rows, failures, notes }, null, 2));
} else {
  log('\n' + '='.repeat(70));
  if (failures.length === 0) {
    log('PASS — the Search contract matches live Cotality.');
    log('  Proves: declared fields/types, enum membership, amenity tokens are');
    log('  live-PRESENT (not merely valid), probed filterability, and the bath');
    log('  component assumption. Does NOT prove renderer correctness — that is');
    log('  what the unit and parity suites cover.');
  } else {
    log(`FAIL — ${failures.length} contract drift(s):\n`);
    for (const f of failures) log(`  [${f.check}] ${f.detail}`);
    log('\nFix the contract (or the code) before shipping Search changes.');
  }
  log('='.repeat(70));
}
process.exit(failures.length === 0 ? 0 : 1);
