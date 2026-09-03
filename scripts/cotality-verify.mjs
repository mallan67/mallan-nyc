/**
 * cotality:verify — READ-ONLY verifier against the LIVE authenticated Cotality API.
 *
 * LIVE COTALITY IS THE SOLE PROVIDER AUTHORITY.
 *
 * This verifier deliberately does NOT consult RLS CSVs, RESO dictionaries, old
 * audits, repo comments, or UI labels to decide provider truth. Repo files are
 * inspected only to answer a different question: "what is Mallan currently
 * trying to do with the provider contract?"
 *
 * It verifies two layers:
 *   1. provider drift — committed enum evidence vs live Cotality $metadata;
 *   2. Mallan wiring — authenticated Search field references, identity usage,
 *      duplicate canonical keys and forbidden legacy provider dependencies.
 *
 * Exit: 0 = verified · 1 = contract/wiring defect · 2 = Cotality unreachable.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const ROOT = process.cwd();

function read(rel) {
  return readFileSync(path.resolve(ROOT, rel), 'utf8');
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([A-Za-z][A-Za-z0-9:]*)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function walk(dir) {
  const abs = path.resolve(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const p = path.join(abs, name);
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

let committedEnums;
try {
  committedEnums = JSON.parse(read('data/cotality-enums.live.json')).enums;
} catch {
  console.error('[cotality:verify] cannot read data/cotality-enums.live.json — run `npm run cotality:pull` first.');
  process.exit(1);
}

let xml;
try {
  const tokRes = await fetch(`${BASE}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.IDX_CLIENT_ID || '',
      client_secret: process.env.IDX_CLIENT_SECRET || '',
      grant_type: 'client_credentials',
      scope: 'api',
    }),
  });
  const token = tokRes.ok ? (await tokRes.json()).access_token : null;
  if (!token) throw new Error(`auth ${tokRes.status}`);
  const metaRes = await fetch(`${BASE}/odata/$metadata`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error(`$metadata ${metaRes.status}`);
  xml = await metaRes.text();
} catch (e) {
  console.error(`[cotality:verify] UNVERIFIED — could not reach live Cotality (${e.message}). Set IDX_CLIENT_ID/IDX_CLIENT_SECRET.`);
  process.exit(2);
}

// ── Parse LIVE Cotality contract ───────────────────────────────────────────
const liveEnums = {};
for (const m of xml.matchAll(/<EnumType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EnumType>/g)) {
  liveEnums[m[1]] = [...m[2].matchAll(/<Member\s+Name="([^"]+)"/g)].map((x) => x[1]);
}

const entities = {};
for (const m of xml.matchAll(/<EntityType\s+([^>]*?)>([\s\S]*?)<\/EntityType>/g)) {
  const ea = attrs(m[1]);
  if (!ea.Name) continue;
  const properties = {};
  for (const p of m[2].matchAll(/<Property\s+([^>]*?)\/?\s*>/g)) {
    const a = attrs(p[1]);
    if (!a.Name) continue;
    properties[a.Name] = {
      type: a.Type || null,
      nullable: a.Nullable !== 'false',
    };
  }
  const navigation = {};
  for (const n of m[2].matchAll(/<NavigationProperty\s+([^>]*?)\/?\s*>/g)) {
    const a = attrs(n[1]);
    if (a.Name) navigation[a.Name] = a.Type || null;
  }
  entities[ea.Name] = { properties, navigation };
}

const entitySets = {};
for (const c of xml.matchAll(/<EntityContainer\s+[^>]*>([\s\S]*?)<\/EntityContainer>/g)) {
  for (const s of c[1].matchAll(/<EntitySet\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/EntitySet>)/g)) {
    const a = attrs(s[1]);
    if (a.Name) entitySets[a.Name] = a.EntityType || null;
  }
}

const defects = [];
const notes = [];

// ── 1. Enum drift: old behavior retained, but it is no longer the whole proof ─
const allEnumNames = new Set([...Object.keys(committedEnums), ...Object.keys(liveEnums)]);
for (const name of allEnumNames) {
  const c = committedEnums[name] || null;
  const l = liveEnums[name] || null;
  if (!c) {
    defects.push(`COTALITY_ENUM_DRIFT: live has NEW enum '${name}' (${l.length}) not in committed evidence`);
    continue;
  }
  if (!l) {
    defects.push(`COTALITY_ENUM_DRIFT: committed enum '${name}' no longer exists live`);
    continue;
  }
  if (JSON.stringify([...c].sort()) !== JSON.stringify([...l].sort())) {
    const added = l.filter((x) => !c.includes(x));
    const removed = c.filter((x) => !l.includes(x));
    defects.push(`COTALITY_ENUM_DRIFT '${name}': live added [${added.join(', ')}] removed [${removed.join(', ')}]`);
  }
}

// ── 2. FIELD_REGISTRY must actually be one authority ──────────────────────
const registryPath = 'lib/search/canonical/field-registry.ts';
const registry = read(registryPath);
const canonicalKeys = [...registry.matchAll(/canonicalKey:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
const keyCounts = new Map();
for (const key of canonicalKeys) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
for (const [key, count] of keyCounts) {
  if (count > 1) defects.push(`DUPLICATE_CANONICAL_KEY: '${key}' appears ${count} times in ${registryPath}`);
}

// Verify every simple declared cotalityField token exists somewhere LIVE. Complex
// expressions are not guessed here; they must be checked by their owning contract.
for (const m of registry.matchAll(/cotalityField:\s*['"]([^'"]+)['"]/g)) {
  const raw = m[1];
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) continue;
  const owners = Object.entries(entities).filter(([, e]) => Object.hasOwn(e.properties, raw)).map(([name]) => name);
  if (owners.length === 0) defects.push(`REGISTRY_FIELD_NOT_LIVE: '${raw}' is claimed by FIELD_REGISTRY but exists on no live Cotality EntityType`);
}

// ── 3. /api/idx/search select list must be LIVE Property fields ────────────
const routePath = 'app/api/idx/search/route.ts';
const route = read(routePath);
const selectBlock = route.match(/export const SEARCH_SELECT_FIELDS\s*=\s*\[([\s\S]*?)\];/);
if (!selectBlock) {
  defects.push(`SEARCH_SELECT_UNREADABLE: cannot find SEARCH_SELECT_FIELDS in ${routePath}`);
} else {
  const selected = [...selectBlock[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((m) => m[1]);
  const propertyFields = entities.Property?.properties || {};
  for (const field of selected) {
    if (!Object.hasOwn(propertyFields, field)) defects.push(`SEARCH_SELECT_NOT_PROPERTY: '${field}' is selected by ${routePath} but is not a live Property field`);
  }
  if (!selected.includes('ListingKey')) {
    defects.push('SEARCH_IDENTITY_NOT_SELECTED: live Property.ListingKey is non-nullable but SEARCH_SELECT_FIELDS does not request it');
  }
}

// ── 4. Provider identity must not be synthesized from lineage ──────────────
const mapperPath = 'lib/search/crm-idx-mapper.ts';
const mapper = read(mapperPath);
const identityFn = mapper.match(/function listingIdentity\([\s\S]*?\n\}/)?.[0] || '';
if (/SourceSystemKey/.test(identityFn)) {
  defects.push('LINEAGE_USED_AS_IDENTITY: crm-idx-mapper listingIdentity() uses SourceSystemKey; live Cotality exposes non-nullable ListingKey for provider identity');
}
if (!/ListingKey/.test(identityFn)) {
  defects.push('LISTINGKEY_NOT_IDENTITY: crm-idx-mapper listingIdentity() does not use live Property.ListingKey');
}
if (/_listingKey:\s*String\(raw\.ListingId\s*\|\|\s*raw\.SourceSystemKey/.test(mapper)) {
  defects.push('FAKE_LISTING_KEY: mapper emits _listingKey from ListingId/SourceSystemKey instead of live ListingKey');
}

// ── 5. Authenticated Search must not use legacy provider-data files ────────
const providerLogicFiles = [
  ...walk('lib/search'),
  ...walk('app/api/idx/search'),
  ...walk('public/crm/js/search'),
].filter((p) => /\.(?:ts|tsx|js|mjs|json)$/.test(p));
for (const rel of providerLogicFiles) {
  const src = read(rel);
  if (/data\/rls\//i.test(src) || /@\/data\/rls\//i.test(src)) {
    defects.push(`LEGACY_PROVIDER_DEPENDENCY: ${rel} imports/reads data/rls in the authenticated Search provider path`);
  }
}

// ── 6. Known invalid substitutions must fail, never impersonate another field ─
const filterPath = 'lib/search/crm-idx-filter.ts';
const filter = read(filterPath);
if (/managementCompany[\s\S]{0,160}ListOfficeName/.test(filter)) {
  defects.push('INVALID_FIELD_SUBSTITUTION: managementCompany is implemented as ListOfficeName; live Cotality has no ManagementCompany field and listing office is a different fact');
}

// A Cotality multi-enum is not a scalar enum/string. If the generic checkbox
// renderer feeds a live Multi enum through `${field} eq 'value'`, it is structurally
// wrong even before semantic-equivalence questions are considered.
const propertyMulti = new Set(
  Object.entries(entities.Property?.properties || {})
    .filter(([, p]) => String(p.type || '').includes('.Enums.Multi.'))
    .map(([name]) => name),
);
const safeSet = filter.match(/const odataSafe = new Set\(\[([\s\S]*?)\]\);/);
if (safeSet && /\$\{trestleField\}\s+eq/.test(filter)) {
  const safeFields = [...safeSet[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((m) => m[1]);
  for (const field of safeFields) {
    if (propertyMulti.has(field)) defects.push(`MULTI_ENUM_SCALAR_OPERATOR: ${filterPath} sends live multi-enum ${field} through generic eq rendering`);
  }
}

// ── 7. Status criteria leaving the browser must be exact StandardStatus members ─
const searchEnginePath = 'public/crm/js/search/search-engine.js';
const searchEngine = read(searchEnginePath);
if (/criteria\.statuses\.push\(sub\)/.test(searchEngine)) {
  defects.push('NON_COTALITY_STATUS_PATH: CRM pushes data-sub-status values (OfferAccepted/ContractOut/etc.) into executable provider statuses');
}
for (const legacy of ['FUTURE', 'OFFEROUT', 'COMING_SOON', 'UNDER_CONTRACT', 'CANCELLED']) {
  const re = new RegExp(`criteria\\.statuses\\.push\\(['\"]${legacy}['\"]\\)`);
  if (re.test(searchEngine)) defects.push(`NON_COTALITY_STATUS_VALUE: CRM can emit '${legacy}' as executable status`);
}
const resoStatusRefs = [...searchEngine.matchAll(/\bresoStatuses\b/g)].length;
if (resoStatusRefs === 1) {
  defects.push('STATUS_SERIALIZER_DROPS_OUTPUT: buildIdxSearchParams creates resoStatuses but never attaches it to outgoing params');
}

const liveFieldDeclarations = Object.values(entities).reduce((n, e) => n + Object.keys(e.properties).length, 0);
notes.push(`live entity types=${Object.keys(entities).length}`);
notes.push(`live entity sets=${Object.keys(entitySets).length}`);
notes.push(`live field declarations=${liveFieldDeclarations}`);
notes.push(`live enums=${Object.keys(liveEnums).length}`);

if (defects.length) {
  console.error(`[cotality:verify] FAIL — ${defects.length} live-contract / Mallan-wiring defect(s)`);
  for (const d of defects) console.error(`  - ${d}`);
  console.error(`[cotality:verify] Cotality census: ${notes.join(' · ')}`);
  process.exit(1);
}

console.log(`[cotality:verify] PASS — live Cotality contract and authenticated Search wiring agree (${notes.join(' · ')}).`);
process.exit(0);
