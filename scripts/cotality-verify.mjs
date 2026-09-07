/**
 * cotality:verify — READ-ONLY drift guard for the single source of Cotality vocabulary truth.
 *
 * Pulls the LIVE Cotality Lookup endpoint (per ResourceName + FieldName) and compares it to the
 * committed `data/cotality-enums.live.json`. Fails if the committed source has drifted from live —
 * so no copy of the vocabulary truth can silently go stale.
 *
 * WHY LOOKUP AND NOT $metadata (corrected 2026-09-06): $metadata declares EnumTypes that are shared
 * across resources, named differently from the fields that use them, and over-declare what the feed
 * publishes. Verified live: EnumType 'Permission' has 20 members while Property.Permission publishes
 * 18 and Media.Permission publishes 7 (with different casing). Diffing EnumTypes therefore proved
 * nothing about any field's real vocabulary. See scripts/cotality/pull-enums.mjs.
 *
 * Law (Maya 2026-07-05): the live Cotality API is the SOLE authority.
 *
 * Exit: 0 = committed source matches live · 1 = DRIFT · 2 = could not reach Cotality (unverified).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';
const RESOURCES = ['Property', 'Media', 'OpenHouse'];

let committedDoc;
try {
  committedDoc = JSON.parse(readFileSync(path.resolve('data/cotality-enums.live.json'), 'utf8'));
} catch {
  console.error('[cotality:verify] cannot read data/cotality-enums.live.json — run `npm run cotality:pull` first.');
  process.exit(1);
}
if (!committedDoc.resources) {
  console.error('[cotality:verify] the committed file has no `resources` map — it predates the Lookup-based pull. Run `npm run cotality:pull`.');
  process.exit(1);
}
const committedResources = committedDoc.resources;

let token;
try {
  const tokRes = await fetch(`${BASE}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', scope: 'api' }),
  });
  token = tokRes.ok ? (await tokRes.json()).access_token : null;
  if (!token) throw new Error(`auth ${tokRes.status}`);
} catch (e) {
  console.error(`[cotality:verify] UNVERIFIED — could not authenticate: ${e?.message || e}`);
  process.exit(2);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(BASE.length)}`);
  return res.json();
}

/** Page Lookup to completion for one resource. Never returns a partial vocabulary. */
async function liveVocabulary(resource) {
  const qs = new URLSearchParams({
    $filter: `ResourceName eq '${resource}'`,
    $select: 'FieldName,LookupValue',
    $top: '1000',
    $count: 'true',
  }).toString();
  let next = `${BASE}/odata/Lookup?${qs}`;
  const rows = [];
  let odataCount = null;
  let pages = 0;
  while (next) {
    if (pages > 5000) throw new Error(`${resource}: pagination exceeded 5000 pages`);
    pages += 1;
    const json = await getJson(next);
    const batch = Array.isArray(json.value) ? json.value : [];
    if (odataCount == null && json['@odata.count'] != null) odataCount = Number(json['@odata.count']);
    rows.push(...batch);
    const candidate = json['@odata.nextLink'];
    next = candidate ? (candidate.startsWith('http') ? candidate : `${BASE}/${candidate.replace(/^\//, '')}`) : null;
    if (batch.length === 0 && next) throw new Error(`${resource}: empty page with a nextLink`);
  }
  if (odataCount != null && odataCount !== rows.length) throw new Error(`${resource}: @odata.count ${odataCount} vs ${rows.length} rows`);
  const byField = {};
  for (const row of rows) {
    if (typeof row.FieldName !== 'string' || typeof row.LookupValue !== 'string' || !row.FieldName || !row.LookupValue) continue;
    (byField[row.FieldName] ||= new Set()).add(row.LookupValue);
  }
  return Object.fromEntries(Object.keys(byField).sort().map((f) => [f, [...byField[f]].sort()]));
}

const liveResources = {};
try {
  for (const resource of RESOURCES) liveResources[resource] = await liveVocabulary(resource);
} catch (e) {
  console.error(`[cotality:verify] UNVERIFIED — Cotality unreachable or refused: ${e?.message || e}`);
  process.exit(2);
}

const drift = [];
let fieldsChecked = 0;
for (const resource of RESOURCES) {
  const c0 = committedResources[resource] || {};
  const l0 = liveResources[resource] || {};
  for (const field of new Set([...Object.keys(c0), ...Object.keys(l0)])) {
    fieldsChecked += 1;
    const c = c0[field] || null;
    const l = l0[field] || null;
    if (!c) { drift.push(`+ live ${resource}.${field} publishes a vocabulary (${l.length}) the committed file lacks`); continue; }
    if (!l) { drift.push(`- committed ${resource}.${field} no longer has a live vocabulary`); continue; }
    const cs = JSON.stringify([...c].sort()), ls = JSON.stringify([...l].sort());
    if (cs !== ls) {
      const added = l.filter((x) => !c.includes(x));
      const removed = c.filter((x) => !l.includes(x));
      drift.push(`~ ${resource}.${field}: live added [${added.join(', ')}] removed [${removed.join(', ')}]`);
    }
  }
}

// The top-level `enums` map must stay an exact mirror of the Property table — every consumer reads it.
for (const field of new Set([...Object.keys(committedDoc.enums || {}), ...Object.keys(committedResources.Property || {})])) {
  const a = JSON.stringify(committedDoc.enums?.[field] ?? null);
  const b = JSON.stringify(committedResources.Property?.[field] ?? null);
  if (a !== b) drift.push(`! committed file is internally inconsistent: enums.${field} ≠ resources.Property.${field}`);
}

if (drift.length) {
  console.error(`[cotality:verify] DRIFT — the committed vocabulary disagrees with live Cotality on ${drift.length} field(s):`);
  for (const d of drift) console.error(`  ${d}`);
  console.error('  Fix: `npm run cotality:pull` to regenerate from live, then review the diff.');
  process.exit(1);
}
console.log(`[cotality:verify] PASS — committed vocabulary matches live Cotality Lookup (${fieldsChecked} resource+field vocabularies across ${RESOURCES.join(', ')}).`);
process.exit(0);
