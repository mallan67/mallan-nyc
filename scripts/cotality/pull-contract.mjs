#!/usr/bin/env node
/**
 * Generate a COMPLETE evidence cache from the LIVE authenticated Cotality API.
 *
 * Provider authority is ALWAYS the live response from api.cotality.com. The JSON
 * written by this script is only a reviewable cache/drift artifact; it is never
 * allowed to override the live API.
 *
 * Captures:
 *   - every EnumType and exact member
 *   - every EntityType and property (type/nullability/length/precision/scale)
 *   - every NavigationProperty / subsection
 *   - every EntitySet exposed by the EntityContainer + navigation bindings
 *
 * Usage:
 *   IDX_CLIENT_ID=... IDX_CLIENT_SECRET=... node scripts/cotality/pull-contract.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';
const STAMP = process.argv[2] || new Date().toISOString();

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([A-Za-z][A-Za-z0-9:]*)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function stripNamespace(type) {
  return String(type || '').replace(/^Collection\(/, '').replace(/\)$/, '').split('.').pop();
}

const tokRes = await fetch(`${BASE}/oidc/connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'api',
  }),
});
if (!tokRes.ok) {
  console.error(`[cotality:pull-contract] AUTH FAILED ${tokRes.status}`);
  process.exit(2);
}
const token = (await tokRes.json()).access_token;
if (!token) {
  console.error('[cotality:pull-contract] AUTH FAILED — no token');
  process.exit(2);
}

const metaRes = await fetch(`${BASE}/odata/$metadata`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!metaRes.ok) {
  console.error(`[cotality:pull-contract] $metadata FAILED ${metaRes.status}`);
  process.exit(2);
}
const xml = await metaRes.text();

const enums = {};
for (const m of xml.matchAll(/<EnumType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EnumType>/g)) {
  const body = m[2];
  enums[m[1]] = [...body.matchAll(/<Member\s+([^>]*?)\/?\s*>/g)].map((member) => {
    const a = attrs(member[1]);
    return { name: a.Name, value: a.Value ?? null };
  });
}


/**
 * COTALITY RAW CONTRACT -> VERIFIED MALLAN COTALITY CONTRACT.
 *
 * The wire declares a property's type as a fully qualified namespace path. That
 * path is Cotality's internal implementation detail. Mallan needs the SEMANTIC
 * FACTS - primitive type, enum type name, multi/collection, nullability, length,
 * precision, scale - and nothing else.
 *
 * THIS DOES NOT ALTER COTALITY'S RESPONSE. The HTTP body is untouched; this is
 * the projection Mallan chooses to store. Persisting the namespace would carry an
 * obsolete provider abstraction into Mallan's architecture merely because the
 * provider's schema happens to expose one.
 */
function describeType(rawType) {
  const raw = String(rawType || '');
  const collection = /^Collection\((.+)\)$/.exec(raw);
  const inner = collection ? collection[1] : raw;
  if (!inner) return { kind: 'unknown' };
  if (inner.startsWith('Edm.')) {
    return { kind: 'primitive', type: inner, collection: Boolean(collection) };
  }
  const segments = inner.split('.');
  return {
    kind: 'enum',
    enumType: segments[segments.length - 1],
    multi: segments.includes('Multi') || Boolean(collection),
  };
}

const entityTypes = {};
for (const m of xml.matchAll(/<EntityType\s+([^>]*?)>([\s\S]*?)<\/EntityType>/g)) {
  const entityAttrs = attrs(m[1]);
  const name = entityAttrs.Name;
  if (!name) continue;
  const body = m[2];
  const properties = {};
  for (const p of body.matchAll(/<Property\s+([^>]*?)\/?\s*>/g)) {
    const a = attrs(p[1]);
    if (!a.Name) continue;
    properties[a.Name] = {
      ...describeType(a.Type),
      nullable: a.Nullable !== 'false', // OData default is true when omitted
      maxLength: a.MaxLength ?? null,
      precision: a.Precision ?? null,
      scale: a.Scale ?? null,
    };
  }
  const navigation = {};
  for (const n of body.matchAll(/<NavigationProperty\s+([^>]*?)\/?\s*>/g)) {
    const a = attrs(n[1]);
    if (!a.Name) continue;
    navigation[a.Name] = {
      kind: 'navigation',
      target: stripNamespace(a.Type),
      collection: String(a.Type || '').startsWith('Collection('),
      nullable: a.Nullable !== 'false',
    };
  }
  entityTypes[name] = { properties, navigation };
}

const entitySets = {};
for (const c of xml.matchAll(/<EntityContainer\s+[^>]*>([\s\S]*?)<\/EntityContainer>/g)) {
  const body = c[1];
  for (const s of body.matchAll(/<EntitySet\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/EntitySet>)/g)) {
    const a = attrs(s[1]);
    if (!a.Name) continue;
    const bindings = {};
    const setBody = s[2] || '';
    for (const b of setBody.matchAll(/<NavigationPropertyBinding\s+([^>]*?)\/?\s*>/g)) {
      const ba = attrs(b[1]);
      if (ba.Path) bindings[ba.Path] = ba.Target || null;
    }
    entitySets[a.Name] = {
      entityType: stripNamespace(a.EntityType),
      navigationBindings: bindings,
    };
  }
}

const resourceCounts = {};
let fieldDeclarations = 0;
for (const [name, entity] of Object.entries(entityTypes)) {
  const count = Object.keys(entity.properties).length;
  resourceCounts[name] = count;
  fieldDeclarations += count;
}

const ordered = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
const doc = {
  _README: 'GENERATED EVIDENCE from LIVE Cotality $metadata. Never hand-edit and never use this file to override the live API.',
  source: `${BASE}/odata/$metadata`,
  pulled_at: STAMP,
  entity_type_count: Object.keys(entityTypes).length,
  entity_set_count: Object.keys(entitySets).length,
  field_declaration_count: fieldDeclarations,
  enum_count: Object.keys(enums).length,
  resource_field_counts: ordered(resourceCounts),
  entitySets: ordered(entitySets),
  entityTypes: ordered(entityTypes),
  enums: ordered(enums),
};

const dest = path.resolve('data/cotality-contract.live.json');
writeFileSync(dest, JSON.stringify(doc, null, 2) + '\n');
console.log(`[cotality:pull-contract] wrote ${Object.keys(entityTypes).length} entity types / ${fieldDeclarations} field declarations / ${Object.keys(enums).length} enums to ${dest}`);
for (const [name, count] of Object.entries(resourceCounts).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${name}: ${count}`);
}
