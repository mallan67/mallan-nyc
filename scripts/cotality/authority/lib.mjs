// COTALITY AUTHORITY — state, live change detection, incremental refresh, exact diff, simulation,
// surface classification, repair order, health. Pure where possible; live only in detect/refresh.
//
// Maya, 2026-09-08: "Cotality changes → authority updates → blast radius appears automatically →
// affected functionality is quarantined → agents repair the exact chain. No guessing, no sampling."
//
// LIVE CHANGE SIGNAL (measured 2026-09-08): Field, Lookup and Model rows carry a filterable
// ModificationTimestamp. Cotality bulk-stamps the catalogue (every row 2026-09-04T08:45) and then
// stamps individual edits on top (Custom_Property.ListingKey 2026-09-06T21:41; three City lookup
// rows 2026-09-04T22:29). So `ModificationTimestamp gt <watermark>` is an exact, cheap signal
// (3 count requests); $metadata has no timestamp and is hash-compared; entitlement/filterability
// have no timestamp and are re-probed on a schedule (capabilities_verified_at is dated, never
// assumed current). The signal only says SOMETHING moved — the recompile + diff say WHAT.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compactFromParts,
  compactLookupRows,
  metadataSha,
  normalizeResourceName,
  renderContractTs,
} from '../contract-codegen.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const PATHS = {
  compact: path.join(ROOT, 'data/cotality-contract/contract.compact.json'),
  lookups: path.join(ROOT, 'data/cotality-contract/lookups.live.json'),
  generated: path.join(ROOT, 'lib/cotality/generated/contract.ts'),
  state: path.join(ROOT, 'data/cotality-contract/authority-state.json'),
  health: path.join(ROOT, 'data/cotality-contract/authority-health.json'),
};

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export function nowIso() {
  return new Date().toISOString();
}
function gitSha() {
  try { return execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

export function readSnapshot() {
  if (!existsSync(PATHS.compact) || !existsSync(PATHS.lookups)) throw new Error('UNVERIFIED: no committed contract snapshot (run cotality:compile:light && cotality:generate)');
  return { compact: readJson(PATHS.compact), lookups: readJson(PATHS.lookups) };
}
export function writeSnapshot(compact, lookups) {
  writeJson(PATHS.compact, compact);
  writeJson(PATHS.lookups, lookups);
  mkdirSync(path.dirname(PATHS.generated), { recursive: true });
  writeFileSync(PATHS.generated, renderContractTs(compact, lookups));
}

// ── State ──────────────────────────────────────────────────────────────────

export function readState() {
  if (!existsSync(PATHS.state)) return null;
  return readJson(PATHS.state);
}
export function writeState(state) {
  writeJson(PATHS.state, state);
}

export function maxTimestamp(rows, key = 'ModificationTimestamp') {
  let max = null;
  for (const r of rows || []) {
    const v = r?.[key];
    if (typeof v !== 'string') continue;
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) continue;
    if (max == null || ms > max.ms) max = { ms, iso: new Date(ms).toISOString() };
  }
  return max ? max.iso : null;
}

/** Initialize the authority state from a full evidence bundle (which carries every catalogue row). */
export function stateFromBundle(bundle, compact) {
  const watermarks = {
    field: maxTimestamp(bundle.catalogs?.field?.value?.rows),
    lookup: maxTimestamp(bundle.catalogs?.lookup?.value?.rows),
    model: maxTimestamp(bundle.catalogs?.model?.value?.rows),
  };
  for (const [k, v] of Object.entries(watermarks)) if (!v) throw new Error(`UNVERIFIED: bundle has no ${k} rows to derive a watermark from`);
  return {
    format: 'mallan-cotality-authority-state/v1',
    watermarks,
    metadata_sha256: compact.fingerprint.metadata_sha256,
    content_sha256: compact.fingerprint.content_sha256,
    probe_mode: compact.probe_mode,
    acquired_at: compact.fingerprint.acquired_at,
    capabilities_verified_at: compact.fingerprint.acquired_at,
    source: 'bundle',
    updated_at: nowIso(),
    repo_git_sha: gitSha(),
  };
}

// ── Live detection ─────────────────────────────────────────────────────────

async function countSince(client, resource, watermark, keyField) {
  const json = await client.query(resource, {
    '$select': keyField,
    '$filter': `ModificationTimestamp gt ${watermark}`,
    '$count': 'true',
    '$top': 0,
  });
  const n = json['@odata.count'];
  if (typeof n !== 'number') throw new Error(`UNVERIFIED: ${resource} count query returned no @odata.count`);
  return n;
}

/**
 * detect(): 4 requests. Any acquisition failure → UNVERIFIED (never "unchanged").
 *   metadata  $metadata hash vs state
 *   field     Field rows modified after the watermark
 *   lookup    Lookup rows modified after the watermark
 *   model     Model rows modified after the watermark
 */
export async function detect(client, state) {
  if (!state) throw new Error('UNVERIFIED: no authority state (run authority init --from=<bundle>)');
  const checkedAt = nowIso();
  const layers = {};
  try {
    const { parsed } = await client.metadata();
    const sha = metadataSha(parsed);
    layers.metadata = { changed: sha !== state.metadata_sha256, sha, previous: state.metadata_sha256 };
    layers.field = { modified: await countSince(client, 'Field', state.watermarks.field, 'FieldKey'), since: state.watermarks.field };
    layers.lookup = { modified: await countSince(client, 'Lookup', state.watermarks.lookup, 'LookupKey'), since: state.watermarks.lookup };
    layers.model = { modified: await countSince(client, 'Model', state.watermarks.model, 'ModelKey'), since: state.watermarks.model };
  } catch (error) {
    return { state: 'UNVERIFIED', checkedAt, error: String(error?.message || error), layers };
  }
  const changed = layers.metadata.changed || layers.field.modified > 0 || layers.lookup.modified > 0 || layers.model.modified > 0;
  return { state: changed ? 'CHANGED' : 'UNCHANGED', checkedAt, layers, quota: client.quota() };
}

// ── Incremental refresh ────────────────────────────────────────────────────

function factsFromCompact(compact) {
  const facts = new Map();
  const navFacts = new Map();
  const access = {};
  for (const [res, r] of Object.entries(compact.resources)) {
    access[res] = { ...r.access };
    for (const [f, v] of Object.entries(r.fields)) facts.set(`${res}.${f}`, { filterable: v.filterable, populated: v.populated, probeHttp: v.probeHttp });
    for (const [n, v] of Object.entries(r.navigation)) navFacts.set(`${res}.${n}`, { expand: v.expand, http: v.http, payloadPresent: v.payloadPresent });
  }
  return { facts, navFacts, access };
}

/**
 * refresh(): rebuild the contract from live with the minimum of requests.
 *   - $metadata re-read and parsed (existence, types, navigation)
 *   - Field + Model catalogues re-read in full (3 + 1 pages)
 *   - Lookup: rows modified since the watermark → the touched (resource, field) pairs → each pair
 *     re-read in FULL (a removed member leaves no modified row to see; the pair's full set does),
 *     plus every pair of a newly declared field
 *   - facts: newly declared fields get a light probe; existing fields keep their dated facts
 *     (capabilities_verified_at is unchanged — only a scheduled --reprobe moves it)
 *   - access: a new resource is probed once; existing resources keep their measured state
 * Returns { compact, lookups, state, changes } without writing; the caller decides.
 * Any acquisition failure throws → the caller reports UNVERIFIED and writes nothing.
 */
export async function refresh(client, state, previous, { force = false } = {}) {
  const started = nowIso();
  const { parsed: metadata } = await client.metadata();
  const fieldCatalog = await client.fieldCatalog();
  const modelCatalog = await client.modelCatalog();
  if (!fieldCatalog.complete || !modelCatalog.complete) throw new Error('UNVERIFIED: Field/Model catalogue pagination incomplete');

  const old = previous; // { compact, lookups }
  const { facts, navFacts, access } = factsFromCompact(old.compact);

  // Catalogue spelling per normalized resource (Custom_Property ↔ CustomProperty).
  const catalogueName = new Map();
  for (const row of fieldCatalog.rows) catalogueName.set(normalizeResourceName(row.ResourceName), row.ResourceName);

  // Newly declared fields / resources.
  const newFields = [];
  const newResources = [];
  for (const [res, r] of Object.entries(metadata.resources)) {
    if (!old.compact.resources[res]) newResources.push(res);
    for (const f of Object.keys(r.fields)) if (!old.compact.resources[res]?.fields?.[f]) newFields.push({ res, f, info: r.fields[f] });
  }

  // Lookup: touched pairs since the watermark, then full re-read per pair.
  const modifiedLookups = await client.page('Lookup', {
    '$filter': `ModificationTimestamp gt ${state.watermarks.lookup}`,
    '$select': 'ResourceName,FieldName,ModificationTimestamp',
    '$top': 1000,
  }, { maxRows: Infinity });
  if (!modifiedLookups.complete) throw new Error('UNVERIFIED: modified Lookup pagination incomplete');
  const touched = new Map(); // normalized key -> catalogue ResourceName
  for (const row of modifiedLookups.rows) touched.set(`${normalizeResourceName(row.ResourceName)}.${row.FieldName}`, row.ResourceName);
  for (const { res, f } of newFields) if (catalogueName.has(res)) touched.set(`${res}.${f}`, catalogueName.get(res));
  if (force) {
    for (const [res, r] of Object.entries(old.lookups)) for (const f of Object.keys(r)) if (catalogueName.has(res)) touched.set(`${res}.${f}`, catalogueName.get(res));
  }

  const lookups = JSON.parse(JSON.stringify(old.lookups));
  const touchedRows = [];
  for (const [key, catalogueResource] of touched) {
    const dot = key.indexOf('.');
    const res = key.slice(0, dot);
    const field = key.slice(dot + 1);
    const rows = await client.page('Lookup', {
      '$filter': `ResourceName eq '${catalogueResource.replace(/'/g, "''")}' and FieldName eq '${field.replace(/'/g, "''")}'`,
      '$top': 1000,
    }, { maxRows: Infinity });
    if (!rows.complete) throw new Error(`UNVERIFIED: Lookup pagination incomplete for ${key}`);
    if (lookups[res]) delete lookups[res][field];
    touchedRows.push(...rows.rows);
  }

  // Access for new resources (one probe on the first field), facts for new fields (light probe).
  for (const res of newResources) {
    const first = Object.keys(metadata.resources[res].fields)[0];
    const probe = first ? await client.probeField(res, first, null, { light: true }) : null;
    access[res] = probe?.filterNonNull?.state === 'SUPPORTED'
      ? { state: 'accessible', http: 200, error: null }
      : { state: 'rejected', http: probe?.filterNonNull?.httpStatus ?? null, error: String(probe?.filterNonNull?.error || '').slice(0, 200) || null };
  }
  for (const { res, f, info } of newFields) {
    if (access[res]?.state !== 'accessible') { facts.set(`${res}.${f}`, { filterable: null, populated: null, probeHttp: null }); continue; }
    const p = await client.probeField(res, f, { ...info, __enumMembers: [] }, { light: true });
    const fn = p.filterNonNull;
    if (fn.state === 'SUPPORTED') facts.set(`${res}.${f}`, { filterable: true, populated: typeof fn.count === 'number' ? fn.count : null, probeHttp: fn.httpStatus ?? null });
    else if (fn.state === 'PROVIDER_REJECTED') facts.set(`${res}.${f}`, { filterable: false, populated: null, probeHttp: fn.httpStatus ?? null });
    else throw new Error(`UNVERIFIED: probe of new field ${res}.${f} is ${fn.state}`);
  }
  // New navigations: probe $expand once.
  for (const [res, r] of Object.entries(metadata.resources)) {
    for (const n of Object.keys(r.navigation || {})) {
      if (navFacts.has(`${res}.${n}`)) continue;
      if (access[res]?.state !== 'accessible') { navFacts.set(`${res}.${n}`, { expand: null, http: null, payloadPresent: null }); continue; }
      const p = await client.probeRelationship(res, n);
      navFacts.set(`${res}.${n}`, { expand: p.state, http: p.httpStatus ?? null, payloadPresent: p.relationshipPayloadPresent ?? null });
    }
  }

  // Merge the re-read pairs (definitions gated by access, as in the full path).
  const merged = compactLookupRows(touchedRows, access);
  for (const [res, fields] of Object.entries(merged)) {
    if (!lookups[res]) lookups[res] = {};
    for (const [f, v] of Object.entries(fields)) lookups[res][f] = v;
  }
  // Drop vocabularies of fields no longer declared.
  for (const [res, fields] of Object.entries(lookups)) {
    for (const f of Object.keys(fields)) if (!metadata.resources[res]?.fields?.[f]) delete fields[f];
    if (!Object.keys(fields).length) delete lookups[res];
  }

  const built = compactFromParts({
    mode: old.compact.probe_mode,
    fingerprint: {
      evidence_sha256: null,
      metadata_sha256: metadataSha(metadata),
      catalog_sha256: null,
      probe_sha256: null,
      provider_base: client.base,
      acquired_at: started,
      repo_git_sha: gitSha(),
      source: 'incremental',
    },
    metadata,
    fieldRows: fieldCatalog.rows,
    lookups,
    fieldFacts: facts,
    navFacts,
    accessByResource: access,
  });

  const newState = {
    ...state,
    watermarks: {
      field: maxTimestamp(fieldCatalog.rows) || state.watermarks.field,
      lookup: maxTimestamp(modifiedLookups.rows) || state.watermarks.lookup,
      model: maxTimestamp(modelCatalog.rows) || state.watermarks.model,
    },
    metadata_sha256: built.compact.fingerprint.metadata_sha256,
    content_sha256: built.compact.fingerprint.content_sha256,
    acquired_at: started,
    source: 'incremental',
    updated_at: nowIso(),
    repo_git_sha: gitSha(),
  };
  const changes = diffContracts(old.compact, old.lookups, built.compact, built.lookups);
  return { compact: built.compact, lookups: built.lookups, state: newState, changes, requests: { touchedPairs: touched.size, newFields: newFields.length, newResources: newResources.length } };
}

// ── Exact diff (pure) ──────────────────────────────────────────────────────

const CHANGE_ORDER = [
  'resource-added', 'resource-removed', 'access-changed', 'field-added', 'field-removed', 'type-changed',
  'nullable-changed', 'filterable-changed', 'population-zeroed', 'population-restored', 'member-added',
  'member-removed', 'observed-value-added', 'observed-value-removed', 'rls-listed-changed',
  'navigation-added', 'navigation-removed', 'navigation-changed',
];

function sortChanges(changes) {
  const key = (c) => `${c.resource}|${c.field || ''}|${c.navigation || ''}|${CHANGE_ORDER.indexOf(c.kind)}|${c.member || ''}`;
  return changes.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/**
 * Exact change set between two snapshots. Daily population drift (non-zero → non-zero) is NOT a
 * change; 0 ↔ >0 transitions are. A resource whose entitlement changed reports ONE change (its
 * field facts follow from it). A removed field reports ONE change (its members follow from it).
 */
export function diffContracts(oldC, oldL, newC, newL) {
  const changes = [];
  const resources = new Set([...Object.keys(oldC.resources), ...Object.keys(newC.resources)]);
  for (const res of [...resources].sort()) {
    const o = oldC.resources[res];
    const n = newC.resources[res];
    if (!o) { changes.push({ kind: 'resource-added', resource: res }); continue; }
    if (!n) { changes.push({ kind: 'resource-removed', resource: res }); continue; }
    const accessChanged = o.access.state !== n.access.state;
    if (accessChanged) changes.push({ kind: 'access-changed', resource: res });

    const fields = new Set([...Object.keys(o.fields), ...Object.keys(n.fields)]);
    for (const f of [...fields].sort()) {
      const of = o.fields[f];
      const nf = n.fields[f];
      if (!of) { changes.push({ kind: 'field-added', resource: res, field: f }); continue; }
      if (!nf) { changes.push({ kind: 'field-removed', resource: res, field: f }); continue; }
      if (of.type !== nf.type || of.enum !== nf.enum || of.multi !== nf.multi) changes.push({ kind: 'type-changed', resource: res, field: f });
      if (of.nullable !== nf.nullable) changes.push({ kind: 'nullable-changed', resource: res, field: f });
      if (!accessChanged) {
        if (typeof of.filterable === 'boolean' && typeof nf.filterable === 'boolean' && of.filterable !== nf.filterable) changes.push({ kind: 'filterable-changed', resource: res, field: f });
        if (typeof of.populated === 'number' && typeof nf.populated === 'number') {
          if (of.populated > 0 && nf.populated === 0) changes.push({ kind: 'population-zeroed', resource: res, field: f });
          if (of.populated === 0 && nf.populated > 0) changes.push({ kind: 'population-restored', resource: res, field: f });
        }
      }
      const ol = oldL[res]?.[f];
      const nl = newL[res]?.[f];
      if (ol || nl) {
        const om = new Set(ol?.members || []);
        const nm = new Set(nl?.members || []);
        // An ENUM field's Lookup is its closed vocabulary — a member change is a contract change.
        // A plain string field (City, PostalCity, CountyOrParish …) publishes an OBSERVED-value catalogue,
        // platform-wide (City: 24,514 values; this feed uses one). Such a change is recorded as
        // `observed-value-*` and blocks only when Mallan code literally names the value (impact.mjs).
        const isEnum = Boolean(nf.enum);
        const addedKind = isEnum ? 'member-added' : 'observed-value-added';
        const removedKind = isEnum ? 'member-removed' : 'observed-value-removed';
        for (const m of [...nm].sort()) if (!om.has(m)) changes.push({ kind: addedKind, resource: res, field: f, member: m });
        for (const m of [...om].sort()) if (!nm.has(m)) changes.push({ kind: removedKind, resource: res, field: f, member: m });
        // RLS-listing is compared over the members BOTH snapshots publish: a removed/added member already
        // reports as its own change, and its RLS flag going with it is a consequence, not a second cause.
        const common = [...om].filter((m) => nm.has(m));
        const orls = common.filter((m) => (ol?.rls || []).includes(m)).sort().join('|');
        const nrls = common.filter((m) => (nl?.rls || []).includes(m)).sort().join('|');
        if (orls !== nrls) changes.push({ kind: 'rls-listed-changed', resource: res, field: f });
      }
    }

    const navs = new Set([...Object.keys(o.navigation || {}), ...Object.keys(n.navigation || {})]);
    for (const nav of [...navs].sort()) {
      const on = o.navigation?.[nav];
      const nn = n.navigation?.[nav];
      if (!on) { changes.push({ kind: 'navigation-added', resource: res, navigation: nav }); continue; }
      if (!nn) { changes.push({ kind: 'navigation-removed', resource: res, navigation: nav }); continue; }
      if (!accessChanged && on.expand !== nn.expand && on.expand != null && nn.expand != null) changes.push({ kind: 'navigation-changed', resource: res, navigation: nav });
      if (on.target !== nn.target || on.collection !== nn.collection) changes.push({ kind: 'navigation-changed', resource: res, navigation: nav });
    }
  }
  return sortChanges(changes);
}

// ── Simulation (pure): apply one controlled change to a copy of the snapshot ─

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/**
 * Specs (space-separated):
 *   remove-member <Res>.<Field> <Member…>    add-member <Res>.<Field> <Member…>   (spaces allowed)
 *   remove-field <Res>.<Field>               suppress <Res>.<Field>   (filterable → false)
 *   zero <Res>.<Field>  (populated → 0)      drift <Res>.<Field>      (populated + 1: NOT a change)
 *   reject-resource <Res>                     rename-member <Res>.<Field> <Old> -> <New>
 */
export function applySimulatedChange(compact, lookups, spec) {
  const c = clone(compact);
  const l = clone(lookups);
  // `<op> <Res>.<Field> <rest>` — the rest is the member (spaces allowed: "New York City");
  // rename-member takes `<old> -> <new>`.
  const trimmed = String(spec).trim();
  const op = trimmed.split(/\s+/)[0];
  const target = trimmed.split(/\s+/)[1] || '';
  const rest = trimmed.slice(trimmed.indexOf(target) + target.length).trim();
  const [a, b] = op === 'rename-member' ? rest.split(/\s*->\s*/) : [rest, undefined];
  const [res, field] = String(target || '').split('.');
  const r = c.resources[res];
  if (!r) throw new Error(`simulate: unknown resource ${res}`);
  const needField = () => { if (!field || !r.fields[field]) throw new Error(`simulate: unknown field ${res}.${field}`); };
  const needLookup = () => { needField(); if (!l[res]?.[field]) throw new Error(`simulate: ${res}.${field} publishes no vocabulary`); };
  switch (op) {
    case 'remove-member': {
      needLookup();
      const lk = l[res][field];
      if (!lk.members.includes(a)) throw new Error(`simulate: ${res}.${field} has no member ${a}`);
      lk.members = lk.members.filter((m) => m !== a);
      lk.rls = lk.rls.filter((m) => m !== a);
      delete lk.definitions[a];
      r.fields[field].lookup = lk.members.length;
      break;
    }
    case 'add-member': {
      needLookup();
      const lk = l[res][field];
      if (!lk.members.includes(a)) lk.members = [...lk.members, a].sort();
      r.fields[field].lookup = lk.members.length;
      break;
    }
    case 'rename-member': {
      needLookup();
      const lk = l[res][field];
      lk.members = [...lk.members.filter((m) => m !== a), b].sort();
      lk.rls = lk.rls.includes(a) ? [...lk.rls.filter((m) => m !== a), b].sort() : lk.rls;
      break;
    }
    case 'remove-field': {
      needField();
      delete r.fields[field];
      if (l[res]) delete l[res][field];
      c.fieldCount -= 1;
      break;
    }
    case 'suppress': {
      needField();
      r.fields[field].filterable = false;
      r.fields[field].populated = null;
      r.fields[field].probeHttp = 400;
      break;
    }
    case 'zero': {
      needField();
      r.fields[field].populated = 0;
      break;
    }
    case 'drift': {
      needField();
      if (typeof r.fields[field].populated === 'number') r.fields[field].populated += 1;
      break;
    }
    case 'reject-resource': {
      r.access = { state: 'rejected', http: 403, error: 'simulated' };
      for (const f of Object.values(r.fields)) { f.filterable = null; f.populated = null; f.probeHttp = null; }
      for (const n of Object.values(r.navigation)) { n.expand = null; n.http = null; n.payloadPresent = null; }
      if (l[res]) for (const v of Object.values(l[res])) v.definitions = {};
      break;
    }
    default:
      throw new Error(`simulate: unknown op ${op}`);
  }
  return { compact: c, lookups: l, spec: { op, resource: res, field: field || null, a: a || null, b: b || null } };
}

// ── Surfaces + repair order (declared, mechanical, ordered) ───────────────

export const SURFACE_RULES = [
  ['Storage/Projection', (f) => f === 'lib/idx/sync.ts' || f === 'lib/search/listing-search-projection.ts' || f === 'lib/compliance/raw-data-keep-fields.ts' || f === 'lib/idx/write-suppression.ts' || f.startsWith('prisma/')],
  ['Canonical mapping', (f) => f === 'lib/idx/trestle-mapper.ts' || f.startsWith('lib/cotality/') || f.startsWith('lib/search/canonical/') || f === 'lib/listings/mallan-status.ts' || f.startsWith('lib/compliance/')],
  ['Saved Search', (f) => f.startsWith('app/api/crm/saved-searches/') || f.startsWith('app/api/search-alerts/') || f.startsWith('app/api/cron/search-alerts/') || f.startsWith('app/saved-searches/') || f === 'lib/search/saved-search-read.ts' || f === 'lib/search/alert-delivery-history.ts' || f === 'lib/search/engine/saved-search.ts'],
  ['CMA', (f) => f.startsWith('lib/cma/') || f.startsWith('lib/comps/') || f.startsWith('app/api/cma/') || f.startsWith('app/api/crm/sales/comps/') || f.startsWith('app/api/crm/cma/')],
  ['Reports', (f) => f.startsWith('lib/seller-report/') || f.startsWith('lib/market-report/') || f.startsWith('lib/pitch-packet/') || f.startsWith('lib/pdf/') || f.startsWith('app/admin/seller-report/') || f.startsWith('app/api/crm/reports/')],
  ['Map', (f) => f.startsWith('lib/geo/') || f.startsWith('lib/transit/') || f.startsWith('app/api/nearby-poi/') || f.startsWith('app/api/transit/') || /(^|\/)[A-Za-z]*Map[A-Za-z]*\.tsx$/.test(f)],
  ['Search', (f) => f.startsWith('lib/search/') || f.startsWith('app/api/idx/search/') || f.startsWith('app/api/listings/') || f.startsWith('app/search/') || f.startsWith('app/api/buildings/search/')],
  ['UI', (f) => f.startsWith('app/components/') || /\/page\.tsx$/.test(f) || f.startsWith('app/listing/')],
  ['Portal', (f) => f.startsWith('app/api/portal/') || f.startsWith('lib/portal/') || f.startsWith('app/portal/')],
  ['Sync/Cron', (f) => f.startsWith('app/api/cron/') || f.startsWith('lib/idx/')],
  ['CRM API', (f) => f.startsWith('app/api/crm/')],
  ['CRM UI (JS)', (f) => f.startsWith('public/crm/')],
  ['Other', () => true],
];

export function classifySurface(file) {
  const f = file.replace(/\\/g, '/');
  for (const [name, test] of SURFACE_RULES) if (test(f)) return name;
  return 'Other';
}

/** Maya's canonical repair order. Each step lists the affected surfaces it covers; empty steps are omitted. */
export const REPAIR_STEPS = [
  { step: 1, name: 'canonical mapping', covers: ['Canonical mapping'] },
  { step: 2, name: 'Sale/Rental execution', covers: ['Search', 'Map'] },
  { step: 3, name: 'storage/projection', covers: ['Storage/Projection', 'Sync/Cron', 'CRM API', 'Other'] },
  { step: 4, name: 'Saved Search', covers: ['Saved Search'] },
  { step: 5, name: 'Reports', covers: ['Reports'] },
  { step: 6, name: 'CMA', covers: ['CMA'] },
  { step: 7, name: 'browser verification', covers: ['UI', 'Search', 'Map', 'Saved Search', 'Portal', 'CRM UI (JS)'] },
];

export function repairOrder(blockedSurfaces) {
  const set = new Set(blockedSurfaces);
  const steps = [];
  for (const s of REPAIR_STEPS) {
    const surfaces = s.covers.filter((c) => set.has(c));
    if (surfaces.length) steps.push({ step: s.step, name: s.name, surfaces });
  }
  return steps;
}

// ── Health ─────────────────────────────────────────────────────────────────

export function healthDocument({ state, compact, impact = null, detection = null, note = null }) {
  const verdict = impact ? impact.state : detection?.state === 'UNVERIFIED' ? 'UNVERIFIED' : detection?.state === 'CHANGED' ? 'BLOCKED' : 'HEALTHY';
  return {
    format: 'mallan-cotality-authority-health/v1',
    state: verdict,
    checked_at: nowIso(),
    contract: {
      metadata_sha256: compact.fingerprint.metadata_sha256,
      content_sha256: compact.fingerprint.content_sha256,
      acquired_at: compact.fingerprint.acquired_at,
      probe_mode: compact.probe_mode,
      capabilities_verified_at: state?.capabilities_verified_at ?? null,
    },
    detection,
    changes: impact?.changes ?? [],
    affected: impact?.affected ?? [],
    unbound: impact?.unbound ?? [],
    blocked_surfaces: impact?.blocked_surfaces ?? [],
    transitive_surfaces: impact?.transitive_surfaces ?? [],
    repair_order: impact?.repair_order ?? [],
    note,
  };
}

/** The human-facing BLOCKED report, exactly in the shape Maya specified. */
export function renderReport(impact) {
  const lines = [];
  if (impact.state !== 'BLOCKED') {
    lines.push(`STATE: ${impact.state}`);
    for (const c of impact.observed_changes || []) lines.push(`  observed (non-blocking): ${c.resource}.${c.field} [${c.member}] — ${c.kind}; no Mallan code names this value`);
    return lines.join('\n');
  }
  lines.push('COTALITY CHANGE DETECTED');
  for (const c of impact.changes) lines.push(`  ${c.resource}${c.field ? `.${c.field}` : ''}${c.navigation ? `/${c.navigation}` : ''}${c.member ? ` [${c.member}]` : ''} — ${c.kind}`);
  lines.push('');
  lines.push('Affected:');
  for (const a of impact.affected) lines.push(`  ${a.node}  (${a.tier}; ${a.sites.length} site${a.sites.length === 1 ? '' : 's'}; ${a.surfaces.join(', ') || 'no surface'})`);
  if (impact.unbound.length) { lines.push(''); lines.push(`Unbound (fetched or declared, no Mallan reader): ${impact.unbound.join(', ')}`); }
  lines.push('');
  lines.push(`STATE: BLOCKED — ${impact.blocked_surfaces.join(', ')}`);
  lines.push('');
  lines.push('Required repair order:');
  for (const s of impact.repair_order) lines.push(`  ${s.step} ${s.name}  [${s.surfaces.join(', ')}]`);
  lines.push('');
  lines.push(`Healthy again only when all ${impact.repair_order.length} pass.`);
  return lines.join('\n');
}
