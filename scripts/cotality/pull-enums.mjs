/**
 * cotality:pull — regenerate `data/cotality-enums.live.json` from the LIVE Cotality API.
 *
 * This is the ONLY sanctioned way to (re)generate that file. No hand-editing — regenerate here.
 * Self-contained on purpose: no import from an untracked helper, so it runs from any worktree.
 *
 * TWO SOURCES, TWO DIFFERENT QUESTIONS (corrected 2026-09-06 after live verification):
 *
 *   VALUES  → the Lookup endpoint, keyed by (ResourceName, FieldName). This is what the provider
 *     actually publishes for a field. $metadata EnumTypes are NOT the vocabulary: they are shared
 *     across resources, frequently named differently from the field that uses them, and over-declare.
 *     Verified live 2026-09-06:
 *       - EnumType `Permission` carries 20 members ('Idx' and 'Vow' included); the Lookup vocabulary
 *         for Property.Permission has 18 and for Media.Permission has 7 (different casing: 'Idx').
 *       - 60 of the 181 Property enum fields have an EnumType whose NAME differs from the field name
 *         (Permission → ListingPermission, AssociationFeeFrequency → FeeFrequency, InteriorFeatures →
 *         InteriorOrRoomFeatures, …), so indexing EnumTypes by field name silently misses or misreads
 *         them, and 121 Property fields that DO publish a vocabulary had none at all.
 *       - 17 EnumTypes list members the Lookup endpoint does not publish.
 *
 *   TYPE  → $metadata. That is exactly what a schema is for, and it is the only place that says
 *     whether a field's value space is a closed enum. It matters because Cotality publishes a Lookup
 *     vocabulary for NON-enum fields too: every `*YN` Edm.Boolean gets ["false","true"], and free-text
 *     fields like City get their observed values. Those DOCUMENT the field; they do not enumerate it.
 *     Member-checking a boolean against ["false","true"] would refuse the form's real values, so the
 *     consumer must be able to tell the two apart. Hence `types`.
 *
 * Law (Maya 2026-07-05): the live Cotality API is the SOLE authority for every status, field and
 * picklist value. Never assume, never snapshot, never hand-copy a list.
 *
 * Usage:  IDX_CLIENT_ID=… IDX_CLIENT_SECRET=… node scripts/cotality/pull-enums.mjs [ISO-date] [--out=path]
 * Fails LOUD (exit 2) on any HTTP failure, incomplete pagination, or a count that does not reconcile —
 * an error never becomes an empty list.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';
const RESOURCES = ['Property', 'Media', 'OpenHouse'];
const PAGE = 1000;

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const STAMP = positional[0] || new Date().toISOString().slice(0, 10);
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
const dest = path.resolve(outArg ? outArg.slice('--out='.length) : 'data/cotality-enums.live.json');

const tokRes = await fetch(`${BASE}/oidc/connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', scope: 'api' }),
});
if (!tokRes.ok) { console.error(`AUTH FAILED ${tokRes.status}`); process.exit(2); }
const token = (await tokRes.json()).access_token;
if (!token) { console.error('AUTH FAILED — no token'); process.exit(2); }

async function getJson(url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url.slice(BASE.length)} ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Page a resource to completion. Refuses to return a partial set. */
async function pageAll(resource, params) {
  const qs = new URLSearchParams(params).toString();
  let next = `${BASE}/odata/${resource}?${qs}`;
  const rows = [];
  let odataCount = null;
  let pages = 0;
  while (next) {
    if (pages > 5000) throw new Error(`${resource}: pagination exceeded 5000 pages — refusing to continue`);
    pages += 1;
    const json = await getJson(next);
    const batch = Array.isArray(json.value) ? json.value : [];
    if (odataCount == null && json['@odata.count'] != null) odataCount = Number(json['@odata.count']);
    rows.push(...batch);
    const candidate = json['@odata.nextLink'];
    next = candidate ? (candidate.startsWith('http') ? candidate : `${BASE}/${candidate.replace(/^\//, '')}`) : null;
    if (batch.length === 0 && next) throw new Error(`${resource}: empty page with a nextLink — refusing to claim complete pagination`);
  }
  if (odataCount != null && odataCount !== rows.length) {
    throw new Error(`${resource}: @odata.count ${odataCount} but ${rows.length} rows paged`);
  }
  return { rows, pages, odataCount };
}

// ── Declared types from $metadata (TYPE only — never values) ────────────────
const ENTITY_RE = /<EntityType Name="([^"]+)"([\s\S]*?)<\/EntityType>/g;
const PROP_RE = /<Property Name="([^"]+)"\s+Type="([^"]+)"/g;

const declaredTypes = {};
try {
  const metaRes = await fetch(`${BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } });
  if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
  const xml = await metaRes.text();
  for (const m of xml.matchAll(ENTITY_RE)) {
    const props = {};
    for (const p of m[2].matchAll(PROP_RE)) {
      const type = p[2];
      const collection = type.startsWith('Collection(');
      const inner = collection ? type.slice('Collection('.length, -1) : type;
      const isEnum = inner.includes('.Enums.');
      props[p[1]] = {
        type,
        isEnum,
        isMulti: collection || inner.includes('.Enums.Multi.'),
        enumType: isEnum ? inner.split('.').pop() : null,
      };
    }
    declaredTypes[m[1]] = props;
  }
} catch (error) {
  console.error(`[cotality:pull] $metadata (declared types) FAILED — ${error?.message ?? error}`);
  process.exit(2);
}

const resources = {};
const types = {};
let totalRows = 0;
for (const resource of RESOURCES) {
  let result;
  try {
    result = await pageAll('Lookup', {
      $filter: `ResourceName eq '${resource}'`,
      $select: 'FieldName,LookupValue',
      $top: String(PAGE),
      $count: 'true',
    });
  } catch (error) {
    console.error(`[cotality:pull] ${resource}: Lookup FAILED — ${error?.message ?? error}`);
    process.exit(2);
  }
  const byField = {};
  for (const row of result.rows) {
    const field = row.FieldName;
    const value = row.LookupValue;
    if (typeof field !== 'string' || !field || typeof value !== 'string' || !value) continue;
    (byField[field] ||= new Set()).add(value);
  }
  const ordered = {};
  for (const field of Object.keys(byField).sort()) ordered[field] = [...byField[field]].sort();
  resources[resource] = ordered;
  types[resource] = declaredTypes[resource] || {};
  if (!Object.keys(types[resource]).length) {
    console.error(`[cotality:pull] ${resource}: no declared types found in $metadata — refusing to write a vocabulary with no type information.`);
    process.exit(2);
  }
  totalRows += result.rows.length;
  const enumFields = Object.keys(ordered).filter((f) => types[resource][f]?.isEnum).length;
  console.log(`[cotality:pull] ${resource}: ${result.rows.length} Lookup rows (${result.pages} pages) → ${Object.keys(ordered).length} fields publish a vocabulary, ${enumFields} of them declared enum`);
}

const doc = {
  _README:
    'GENERATED from the live Cotality API by scripts/cotality/pull-enums.mjs. Do NOT hand-edit. ' +
    'VALUES come from the Lookup endpoint per (ResourceName, FieldName): `enums` = the Property ' +
    'vocabularies keyed by FIELD name (the shape consumers read), `resources` = the same per resource. ' +
    'TYPES come from $metadata: `types[resource][field].isEnum` says whether the value space is a CLOSED ' +
    'vocabulary. A field can publish a Lookup vocabulary without being an enum (every *YN boolean gets ' +
    '["false","true"]; City gets its observed values) — those document the field, they do not enumerate ' +
    'it, and must never be member-checked. Verify with `npm run cotality:verify`.',
  source: `${BASE}/odata/Lookup`,
  typeSource: `${BASE}/odata/$metadata`,
  method: "Lookup?$filter=ResourceName eq <resource>&$select=FieldName,LookupValue (paged to completion, @odata.count reconciled); types from $metadata EntityType declarations",
  pulled_at: STAMP,
  lookup_rows: totalRows,
  enum_count: Object.keys(resources.Property).length,
  enums: resources.Property,
  resources,
  types,
};
writeFileSync(dest, JSON.stringify(doc, null, 2) + '\n');
console.log(`cotality:pull — wrote ${doc.enum_count} Property field vocabularies (+ ${RESOURCES.slice(1).join(', ')}) to ${dest}`);
console.log(`  StandardStatus: ${resources.Property.StandardStatus?.join(', ')}`);
console.log(`  Permission:     ${resources.Property.Permission?.join(', ')}`);
console.log(`  PropertyType:   ${resources.Property.PropertyType?.join(', ')}`);
