/**
 * cotality:pull — regenerate the single source of Cotality truth from the LIVE API.
 *
 * This is the ONLY sanctioned way to (re)generate `data/cotality-enums.live.json`.
 * It authenticates to api.cotality.com/trestle and writes, from live responses only:
 *
 *   enums   every $metadata EnumType and its members (the query strings).
 *   search  the search contract that Agent Search, CMA and reports draw from — Property in
 *           full below, and every other resource the licence lists (search.resources:
 *           Office, Member, Media, OpenHouse, CustomProperty, …) with each field's filter
 *           verdict and live population —
 *           with SEPARATE sale and rental facts:
 *             sale   = PropertyType 'Residential'
 *             rental = PropertyType 'ResidentialLease'
 *           - every Property field: type, operator kind, and its probed filter verdict
 *             (SUPPORTED / SUPPRESSED / NOT_FILTERABLE / UNVERIFIED — an HTTP error is never zero rows);
 *           - how many sale and rental records carry it ($count probe), and how many sampled
 *             records return it on $select (where the API refuses the filter, this is the only evidence);
 *           - the values observed on sampled sale and rental records for every picklist field;
 *           - every REBNY CustomProperty.CustomFields key observed on sampled sale / rental records;
 *           - display labels: Lookup.StandardLookupValue per LookupValue (query LookupValue,
 *             display StandardLookupValue — Master §0.2 STRING).
 *
 * No hand-editing that JSON — regenerate it here. Law (Maya 2026-07-05): the live Cotality API is
 * the SOLE authority for every status, field, and picklist value. Never assume, never hand-copy.
 *
 * Usage:  IDX_CLIENT_ID=… IDX_CLIENT_SECRET=… node scripts/cotality/pull-enums.mjs [ISO-stamp]
 * Read-only toward Cotality. Paces itself on the minute quota; a full pull is ~2,000 requests.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';
const STAMP = process.argv[2] || new Date().toISOString();

const TYPES = { sale: 'Residential', rental: 'ResidentialLease' };
const SAMPLE_PAGES = 5; // × 200 records per type, newest ModificationTimestamp first
const SELECT_GROUP = 60; // fields per $select request (URL length)
const CONCURRENCY = 4;

const tokRes = await fetch(`${BASE}/oidc/connect/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', scope: 'api' }),
});
if (!tokRes.ok) { console.error(`AUTH FAILED ${tokRes.status}`); process.exit(2); }
const token = (await tokRes.json()).access_token;
if (!token) { console.error('AUTH FAILED — no token'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET against /odata with quota pacing; retries 429 and transient 5xx, returns other errors as data.
async function odata(rel) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/odata/${rel}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
    const avail = Number(res.headers.get('minute-quota-available') ?? 999);
    if (avail < 20) await sleep(10_000);
    if (res.status === 429 && attempt < 30) { await sleep(60_000); continue; } // quota: wait for the window
    if (res.status >= 500 && attempt < 6) { await sleep(15_000); continue; }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* error bodies are not always JSON */ }
    return { status: res.status, json, text };
  }
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const q = (filter) => encodeURIComponent(filter);
const sortKeys = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));

// ── $metadata: enums (unchanged contract) + Property fields ──
// The hourly quota is shared with production: on 429 wait (up to 30 min) rather than fail or hammer.
let metaRes;
for (let attempt = 0; attempt < 30; attempt++) {
  metaRes = await fetch(`${BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } });
  if (metaRes.status !== 429) break;
  console.log('  $metadata HTTP 429 (quota) — waiting 60s');
  await sleep(60_000);
}
if (!metaRes.ok) { console.error(`$metadata FAILED ${metaRes.status}`); process.exit(2); }
const xml = await metaRes.text();

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];

const enums = {};
const flagEnums = new Set();
for (const m of xml.matchAll(/<EnumType Name="([^"]+)"([^>]*)>[\s\S]*?<\/EnumType>/g)) {
  enums[m[1]] = [...m[0].matchAll(/<Member Name="([^"]+)"/g)].map((x) => x[1]);
  if (/IsFlags="true"/.test(m[2])) flagEnums.add(m[1]);
}
// Every field the licence serves, per entity, with its declared type. A field is real only when
// a query for it succeeds (Master section 0.2); this map is what $metadata declares.
const entities = {};
for (const m of xml.matchAll(/<EntityType\b([^>]*)>([\s\S]*?)<\/EntityType>/g)) {
  const fields = {};
  for (const p of m[2].matchAll(/<Property\b[^>]*>/g)) fields[attr(p[0], 'Name')] = attr(p[0], 'Type');
  entities[attr(m[1], 'Name')] = sortKeys(fields);
}

function entityFields(entity) {
  const start = xml.indexOf(`<EntityType Name="${entity}">`);
  if (start < 0) return [];
  const block = xml.slice(start, xml.indexOf('</EntityType>', start));
  return [...block.matchAll(/<Property Name="([^"]+)" Type="([^"]+)"/g)].map((m) => ({ name: m[1], type: m[2] }));
}

function kindOf(type) {
  if (type === 'Edm.String') return 'string';
  if (type === 'Edm.Boolean') return 'boolean';
  if (/^Edm\.(Int32|Int64|Decimal|Double)$/.test(type)) return 'number';
  if (type === 'Edm.Date') return 'date';
  if (type === 'Edm.DateTimeOffset') return 'timestamp';
  const e = type.split('.').pop();
  if (enums[e]) return flagEnums.has(e) ? 'multi' : 'enum';
  return 'unknown';
}

const propertyFields = entityFields('Property');
if (propertyFields.length === 0) { console.error('$metadata has no Property entity'); process.exit(2); }

// ── PropertyType population: which listing types this licence actually serves ──
const typeCounts = {};
for (const t of enums.PropertyType || []) {
  const r = await odata(`Property?$top=0&$count=true&$filter=${q(`PropertyType eq '${t}'`)}`);
  typeCounts[t] = r.status === 200 ? r.json['@odata.count'] : `HTTP ${r.status}`;
}

// ── Which StandardStatus values each side actually carries (the licence need not deliver all) ──
const statusCounts = {};
for (const [side, pt] of Object.entries(TYPES)) {
  statusCounts[side] = {};
  for (const st of enums.StandardStatus || []) {
    const r = await odata(`Property?$top=0&$count=true&$filter=${q(`PropertyType eq '${pt}' and StandardStatus eq '${st}'`)}`);
    statusCounts[side][st] = r.status === 200 ? r.json['@odata.count'] : `HTTP ${r.status}`;
  }
}

// ── Mallan's own office as Cotality names it ("In-House (Company)" in Agent Search) ──
const officeRes = await odata(`Property?$top=1&$orderby=ModificationTimestamp desc&$filter=${q("contains(ListOfficeName,'Mallan')")}&$select=ListOfficeName,ListOfficeMlsId`);
const officeRow = officeRes.status === 200 ? officeRes.json.value[0] : null;
const mallanOffice = officeRow ? { ListOfficeName: officeRow.ListOfficeName, ListOfficeMlsId: String(officeRow.ListOfficeMlsId) } : null;

// ── Probe every field: filter verdict, then sale / rental population ──
function verdictOf(r) {
  if (r.status === 200) return 'SUPPORTED';
  const msg = (r.json && r.json.error && r.json.error.message) || r.text;
  if (/suppressed/i.test(msg)) return 'SUPPRESSED';
  if (/cannot be used for filtering/i.test(msg)) return 'NOT_FILTERABLE';
  return 'UNVERIFIED';
}

let probed = 0;
const property = {};
await pool(propertyFields, async (f) => {
  const kind = kindOf(f.type);
  const row = { type: f.type.startsWith('Edm.') ? f.type : f.type.split('.').pop(), kind };
  if (kind === 'enum' || kind === 'multi') row.lookup = row.type;
  const any = await odata(`Property?$top=0&$count=true&$filter=${q(`${f.name} ne null`)}`);
  row.filter = verdictOf(any);
  if (row.filter === 'UNVERIFIED') row.error = `HTTP ${any.status} ${String((any.json && any.json.error && any.json.error.message) || any.text).slice(0, 160)}`;
  if (row.filter === 'SUPPORTED') {
    row.total = any.json['@odata.count'];
    for (const [side, pt] of Object.entries(TYPES)) {
      if (row.total === 0) { row[side] = 0; continue; }
      const r = await odata(`Property?$top=0&$count=true&$filter=${q(`PropertyType eq '${pt}' and ${f.name} ne null`)}`);
      row[side] = r.status === 200 ? r.json['@odata.count'] : `HTTP ${r.status}`;
    }
  }
  property[f.name] = row;
  if (++probed % 100 === 0) console.log(`  probed ${probed}/${propertyFields.length} fields`);
});

// ── Sample live records per type AND per status: what each status actually carries ──
// For every StandardStatus the side delivers (status_counts > 0), the newest records of that
// status are read with $select over every field: per-status population (sampled_by_status),
// $select data where filters are refused, and observed picklist values.
async function selectPage(side, status, fields, skip) {
  const filter = q(`PropertyType eq '${TYPES[side]}' and StandardStatus eq '${status}'`);
  const r = await odata(`Property?$top=200&$skip=${skip}&$orderby=ModificationTimestamp desc&$filter=${filter}&$select=${fields.join(',')}`);
  if (r.status === 200) return { rows: r.json.value, rejected: [] };
  if (fields.length === 1) return { rows: [], rejected: fields };
  const mid = Math.ceil(fields.length / 2); // find the field the API refuses on $select
  const [a, b] = [await selectPage(side, status, fields.slice(0, mid), skip), await selectPage(side, status, fields.slice(mid), skip)];
  return { rows: a.rows.map((row, i) => ({ ...row, ...(b.rows[i] || {}) })), rejected: [...a.rejected, ...b.rejected] };
}

const sampled = {};
const selectRejected = new Set();
const groups = [];
for (let i = 0; i < propertyFields.length; i += SELECT_GROUP) groups.push(propertyFields.slice(i, i + SELECT_GROUP).map((f) => f.name));
for (const side of Object.keys(TYPES)) {
  sampled[side] = {};
  const tallies = {}; // field -> { nonNull, byStatus: {status: n}, values: {v: n} }
  const statuses = Object.entries(statusCounts[side]).filter(([, n]) => typeof n === 'number' && n > 0).map(([s]) => s);
  for (const status of statuses) {
    let records = 0;
    for (let page = 0; page < SAMPLE_PAGES; page++) {
      const results = await pool(groups, (g) => selectPage(side, status, g, page * 200));
      const got = Math.max(...results.map((r) => r.rows.length), 0);
      records += got;
      for (const r of results) {
        r.rejected.forEach((f) => selectRejected.add(f));
        for (const rec of r.rows) {
          for (const [field, value] of Object.entries(rec)) {
            if (value === null || value === '' || field.startsWith('@')) continue;
            const t = (tallies[field] = tallies[field] || { nonNull: 0, byStatus: {}, values: {} });
            t.nonNull++;
            t.byStatus[status] = (t.byStatus[status] || 0) + 1;
            const kind = property[field] && property[field].kind;
            if (kind === 'enum' || kind === 'multi' || kind === 'boolean') {
              for (const v of String(value).split(',').map((s) => s.trim()).filter(Boolean)) t.values[v] = (t.values[v] || 0) + 1;
            }
          }
        }
      }
      if (got < 200) break;
    }
    sampled[side][status] = records;
  }
  for (const [field, t] of Object.entries(tallies)) {
    const row = property[field];
    if (!row) continue;
    row.sampled = row.sampled || {};
    row.sampled[side] = t.nonNull;
    row.sampled_by_status = row.sampled_by_status || {};
    row.sampled_by_status[side] = sortKeys(t.byStatus);
    if (Object.keys(t.values).length) { row.observed = row.observed || {}; row.observed[side] = sortKeys(t.values); }
  }
}
for (const f of selectRejected) property[f].select = 'REJECTED';

// ── Every other resource the licence lists (DataSystem): access, and every field's filter verdict
//    and population — sale / rental where the resource carries PropertyType ──
const DICTIONARY = new Set(['Field', 'Lookup', 'Model', 'DataSystem', 'Enumeration']);
const dataSystem = await odata('DataSystem');
const listedResources = dataSystem.status === 200 ? (dataSystem.json.value[0].Resources || []).map((r) => r.Name) : [];
const resources = {};
for (const res of listedResources) {
  if (res === 'Property') continue; // search.property
  const fields = entityFields(res);
  const access = await odata(`${res}?$top=1&$count=true`);
  const accessMsg = access.status === 200 ? null : String((access.json && access.json.error && access.json.error.message) || access.text).slice(0, 200);
  const entry = { access: access.status === 200 ? 'OK' : `HTTP ${access.status}`, message: accessMsg, records: access.status === 200 ? access.json['@odata.count'] : null, fields: {} };
  resources[res] = entry;
  const describe = (f) => ({ type: f.type.startsWith('Edm.') ? f.type : f.type.split('.').pop(), kind: kindOf(f.type) });
  if (access.status !== 200 || DICTIONARY.has(res)) { for (const f of fields) entry.fields[f.name] = describe(f); continue; }
  const hasType = fields.some((f) => f.name === 'PropertyType');
  await pool(fields, async (f) => {
    const row = describe(f);
    const r = await odata(`${res}?$top=0&$count=true&$filter=${q(`${f.name} ne null`)}`);
    row.filter = verdictOf(r);
    if (row.filter === 'SUPPORTED') {
      row.total = r.json['@odata.count'];
      if (hasType && row.total > 0) for (const [side, pt] of Object.entries(TYPES)) {
        const s = await odata(`${res}?$top=0&$count=true&$filter=${q(`PropertyType eq '${pt}' and ${f.name} ne null`)}`);
        row[side] = s.status === 200 ? s.json['@odata.count'] : `HTTP ${s.status}`;
      }
    }
    entry.fields[f.name] = row;
  });
  // $select returns data the filter may refuse: sample 200 rows per field group.
  const names = fields.map((f) => f.name);
  for (let i = 0; i < names.length; i += SELECT_GROUP) {
    const group = names.slice(i, i + SELECT_GROUP);
    const r = await odata(`${res}?$top=200&$select=${group.join(',')}`);
    if (r.status !== 200) { group.forEach((g) => (entry.fields[g].select = `HTTP ${r.status}`)); continue; }
    for (const g of group) entry.fields[g].sampled = r.json.value.filter((v) => v[g] !== null && v[g] !== undefined && v[g] !== '').length;
  }
  entry.fields = sortKeys(entry.fields);
  console.log(`  ${res}: ${entry.access}, ${fields.length} fields`);
}

// ── REBNY CustomProperty.CustomFields keys, per type (reached through Property — not filterable) ──
function cfKind(key, values) {
  const vs = values.filter((v) => v !== '');
  if (vs.length && /YN$/.test(key) && vs.every((v) => v === '0' || v === '1')) return 'boolean01';
  if (vs.length && vs.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number';
  if (vs.length && vs.every((v) => /^\d{4}-\d{2}-\d{2}T/.test(v))) return 'timestamp';
  if (vs.length && vs.every((v) => /^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$/.test(v)) && new Set(vs.flatMap((v) => v.split(','))).size <= 60) return 'list';
  return 'string';
}
const customFields = { sampled: {}, keys: {} };
for (const [side, pt] of Object.entries(TYPES)) {
  const raw = {}, byStatus = {};
  customFields.sampled[side] = {};
  const statuses = Object.entries(statusCounts[side]).filter(([, n]) => typeof n === 'number' && n > 0).map(([s]) => s);
  for (const status of statuses) {
    let records = 0;
    for (let page = 0; page < SAMPLE_PAGES; page++) {
      const r = await odata(`Property?$top=200&$skip=${page * 200}&$orderby=ModificationTimestamp desc&$filter=${q(`PropertyType eq '${pt}' and StandardStatus eq '${status}'`)}&$select=ListingKey&$expand=CustomProperty($select=CustomFields,ListingKey)`);
      if (r.status !== 200) { customFields.error = `HTTP ${r.status} ${r.text.slice(0, 160)}`; break; }
      for (const p of r.json.value) {
        records++;
        const cp = Array.isArray(p.CustomProperty) ? p.CustomProperty[0] : p.CustomProperty; // live shape: array of one
        if (!cp || !cp.CustomFields) continue;
        let obj;
        try { obj = typeof cp.CustomFields === 'string' ? JSON.parse(cp.CustomFields) : cp.CustomFields; } catch { continue; }
        for (const [k, v] of Object.entries(obj)) {
          if (k === 'ListingKey' || v === null) continue;
          (raw[k] = raw[k] || []).push(String(v).trim());
          if (String(v).trim() !== '') { byStatus[k] = byStatus[k] || {}; byStatus[k][status] = (byStatus[k][status] || 0) + 1; }
        }
      }
      if (r.json.value.length < 200) break;
    }
    customFields.sampled[side][status] = records;
  }
  for (const [k, values] of Object.entries(raw)) {
    const row = (customFields.keys[k] = customFields.keys[k] || {});
    row[side] = values.filter((v) => v !== '').length;
    row.by_status = row.by_status || {};
    row.by_status[side] = sortKeys(byStatus[k] || {});
    const kind = cfKind(k, values);
    row.kind = row.kind && row.kind !== kind ? 'string' : kind;
    if (kind === 'list' || kind === 'boolean01') {
      const tally = {};
      for (const v of values) for (const t of v.split(',').filter(Boolean)) tally[t] = (tally[t] || 0) + 1;
      row.observed = row.observed || {};
      row.observed[side] = sortKeys(tally);
    }
  }
}
customFields.keys = sortKeys(customFields.keys);

// ── Display labels for every picklist a sale or rental record carries ──
// A value whose provider label contains a Fair Housing prohibited term (data/compliance/
// prohibited-terms.json — e.g. "Near Schools") is never a Mallan search option: its label is
// not stored and its LookupValue is listed in fair_housing_excluded, which the mapping layer refuses.
const prohibited = JSON.parse(readFileSync(path.resolve('data/compliance/prohibited-terms.json'), 'utf8')).flatList.map((t) => t.toLowerCase());
const humanize = (v) => v.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
const isProhibited = (value, label) => prohibited.some((t) => String(label).toLowerCase().includes(t) || humanize(value).includes(t));
const carried = (row) => [row.sale, row.rental, row.sampled && row.sampled.sale, row.sampled && row.sampled.rental].some((n) => typeof n === 'number' && n > 0);
const lookupNames = [...new Set(Object.values(property).filter((r) => r.lookup && carried(r)).map((r) => r.lookup))].sort();
const lookups = {};
const fairHousingExcluded = {};
await pool(lookupNames, async (name) => {
  const labels = {};
  for (let skip = 0; ; skip += 1000) {
    const r = await odata(`Lookup?$top=1000&$skip=${skip}&$filter=${q(`LookupName eq '${name}'`)}&$select=LookupValue,StandardLookupValue`);
    if (r.status !== 200) { labels._error = `HTTP ${r.status}`; break; }
    for (const v of r.json.value) {
      if (!v.LookupValue || labels[v.LookupValue]) continue;
      if (isProhibited(v.LookupValue, v.StandardLookupValue || '')) { (fairHousingExcluded[name] = fairHousingExcluded[name] || new Set()).add(v.LookupValue); continue; }
      labels[v.LookupValue] = v.StandardLookupValue || v.LookupValue;
    }
    if (r.json.value.length < 1000) break;
  }
  lookups[name] = sortKeys(labels);
});
for (const name of Object.keys(enums)) {
  for (const value of enums[name]) if (isProhibited(value, '')) (fairHousingExcluded[name] = fairHousingExcluded[name] || new Set()).add(value);
}

const search = {
  pulled_at: STAMP,
  types: TYPES,
  type_counts: typeCounts,
  status_counts: statusCounts,
  mallan_office: mallanOffice,
  sampled_records: sampled,
  property: sortKeys(property),
  resources: sortKeys(resources),
  custom_fields: customFields,
  lookups: sortKeys(lookups),
  fair_housing_excluded: sortKeys(Object.fromEntries(Object.entries(fairHousingExcluded).map(([k, s]) => [k, [...s].sort()]))),
};

const doc = {
  _README: 'GENERATED from the live Cotality API by scripts/cotality/pull-enums.mjs. Do NOT hand-edit. Regenerate live; verify with `npm run cotality:verify`.',
  source: `${BASE}/odata/$metadata`,
  pulled_at: STAMP,
  // Every entity the licence serves with its declared field types (read by lib/compliance, lib/cotality,
  // lib/idx and their live-parity tests), the enums, and the Property search contract — one document.
  entity_count: Object.keys(entities).length,
  entities: sortKeys(entities),
  enum_count: names.length,
  enums: ordered,
  search,
};
const dest = path.resolve('data/cotality-enums.live.json');
writeFileSync(dest, JSON.stringify(doc, null, 2) + '\n');

const rows = Object.values(property);
const count = (v) => rows.filter((r) => r.filter === v).length;
const withData = (side) => rows.filter((r) => (typeof r[side] === 'number' && r[side] > 0) || (r.sampled && r.sampled[side] > 0)).length;
console.log(`cotality:pull — wrote ${names.length} live enums and the ${rows.length}-field Property search contract to ${dest}`);
console.log(`  PropertyType records: ${Object.entries(typeCounts).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(', ')}`);
console.log(`  filter: SUPPORTED ${count('SUPPORTED')}, SUPPRESSED ${count('SUPPRESSED')}, NOT_FILTERABLE ${count('NOT_FILTERABLE')}, UNVERIFIED ${count('UNVERIFIED')}`);
console.log(`  fields with data — sale: ${withData('sale')}, rental: ${withData('rental')}; CustomFields keys: ${Object.keys(customFields.keys).length}`);
console.log(`  StandardStatus: ${enums.StandardStatus?.join(', ')}`);
