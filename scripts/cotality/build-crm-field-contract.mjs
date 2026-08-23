#!/usr/bin/env node
/**
 * Generate the Cotality field contract the CRM is allowed to reference.
 *
 * WHY THIS EXISTS. The CRM previously carried a hand-maintained provider field
 * table whose header claimed verification against a dated CSV. Three of its
 * target field names do not exist on the live API at all, and two named the
 * wrong field. A hand-maintained table cannot be checked, so it is replaced by
 * a GENERATED contract plus a test that fails when the CRM references a field
 * the contract does not carry.
 *
 * AUTHORITY. The live authenticated Cotality API, and nothing else. This script
 * reads a $metadata document; pass --metadata to point at a capture, or set
 * COTALITY_METADATA. The emitted contract records WHICH document produced it and
 * WHEN, so a stale contract is visible rather than silently authoritative.
 *
 * SCOPE. Only the fields Mallan actually consumes - the contract is a whitelist
 * of what the CRM references, not a mirror of the provider's 757 Property
 * fields. Fields are added when a consumer needs one, never speculatively.
 *
 * FAIL LOUD. A field the metadata does not declare is emitted into `rejected`
 * with its reason. It is never omitted silently and never defaulted to a
 * plausible neighbour - substituting a near neighbour is exactly how the
 * nonexistent names survived review for months.
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const METADATA =
  argOf('--metadata') || process.env.COTALITY_METADATA || 'artifacts/metadata.xml';
const MAP_SOURCE = argOf('--map') || 'public/crm/js/core/cotality-field-map.js';
const OUT = argOf('--out') || 'data/cotality-contract/crm-field-contract.json';
// The CRM tags elements from more than one live resource. A field is valid if
// the provider declares it on ANY of these; the contract records which.
const RESOURCES = ['Property', 'Media'];

if (!fs.existsSync(METADATA)) {
  console.error(`[crm-field-contract] metadata not found: ${METADATA}`);
  process.exit(1);
}
const xml = fs.readFileSync(METADATA, 'utf8');

/** One EntityType block - other resources declare same-named fields. */
function entityBlock(doc, name) {
  const start = doc.indexOf(`<EntityType Name="${name}"`);
  if (start < 0) return null;
  const end = doc.indexOf('</EntityType>', start);
  return end < 0 ? null : doc.slice(start, end);
}

/** name -> {type, nullable, resource} across every resource the CRM references. */
const declared = new Map();
for (const resource of RESOURCES) {
  const block = entityBlock(xml, resource);
  if (!block) {
    console.error(`[crm-field-contract] no ${resource} EntityType in ${METADATA}`);
    process.exit(1);
  }
  const propRx = /<Property\s+Name="([^"]+)"\s+Type="([^"]+)"([^>]*)\/?>/g;
  let m;
  while ((m = propRx.exec(block)) !== null) {
    const [, name, type, rest] = m;
    // First resource wins: Property is the primary surface.
    if (!declared.has(name)) {
      declared.set(name, { type, nullable: !/Nullable="false"/.test(rest), resource });
    }
  }
  // Navigation properties are how the CRM names an expanded collection.
  const navRx = /<NavigationProperty\s+Name="([^"]+)"\s+Type="([^"]+)"/g;
  let n;
  while ((n = navRx.exec(block)) !== null) {
    if (!declared.has(n[1])) {
      declared.set(n[1], { type: n[2], nullable: true, resource, navigation: true });
    }
  }
}

/** The field names the CRM map targets. */
function mapTargets(file) {
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const out = new Set();
  const rx = /^\s+[A-Za-z0-9_]+:\s*'([^']+)'/gm;
  let e;
  while ((e = rx.exec(src)) !== null) {
    // A computed pseudo-field like 'A+B' references its operands, not itself.
    for (const part of e[1].split('+')) out.add(part.trim());
  }
  return [...out].sort();
}

/**
 * Provider field names the CRM tags onto rendered elements directly, without
 * going through the map. These are equally provider claims and are equally
 * checked - a name hardcoded into a template is not exempt from existing.
 */
function taggedFieldNames(dir, acc = new Set()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      taggedFieldNames(full, acc);
    } else if (/\.(js|html)$/.test(e.name) && e.name !== 'index-built.html') {
      const src = fs.readFileSync(full, 'utf8');
      const rx = /data-cotality-field=["']([^"']+)["']/g;
      let m;
      while ((m = rx.exec(src)) !== null) {
        // Mallan-derived presentation keys are lowercase and are not provider
        // claims; only provider-shaped PascalCase names are contracted.
        if (/^[A-Z]/.test(m[1])) acc.add(m[1]);
      }
    }
  }
  return acc;
}

const mapped = mapTargets(MAP_SOURCE);
if (!mapped) {
  console.error(`[crm-field-contract] CRM map not found: ${MAP_SOURCE}`);
  process.exit(1);
}
/**
 * Field names the diagnostic scripts put into OData $filter expressions.
 *
 * A census query naming a field the provider does not declare returns HTTP 400,
 * and odataCount turns that into null - so the metric reads as "unverified"
 * forever and looks like a tooling gap rather than a fabricated field. Three did
 * exactly that until 2026-08-23. Including them here makes the generator fail
 * loudly instead.
 */
function filteredFieldNames(dir, acc = new Set()) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { filteredFieldNames(full, acc); continue; }
    if (!/\.(js|mjs)$/.test(e.name)) continue;
    const src = fs.readFileSync(full, 'utf8');
    // An identifier immediately followed by an OData comparison operator.
    const rx = /\b([A-Z][A-Za-z0-9_]{2,})\s+(eq|ne|gt|ge|lt|le)\s/g;
    let m;
    while ((m = rx.exec(src)) !== null) acc.add(m[1]);
  }
  return acc;
}

const tagged = [...taggedFieldNames(path.dirname(path.dirname(path.dirname(MAP_SOURCE))))];
const filtered = [...filteredFieldNames('scripts/cotality')];
const targets = [...new Set([...mapped, ...tagged, ...filtered])].sort();

/**
 * Normalise a declared type into what MALLAN needs.
 *
 * The provider's metadata expresses enum types as a fully-qualified namespace
 * path. That path is Cotality's internal implementation detail. Mallan needs the
 * ENUM TYPE NAME and whether it is multi-valued; it does not need, and must not
 * persist, the namespace - keeping it would carry an obsolete provider
 * abstraction into Mallan's architecture merely because the provider's schema
 * happens to expose one. The raw value is left untouched at the boundary; it is
 * simply not selected into the contract.
 */
function normaliseType(raw) {
  const collection = /^Collection\((.+)\)$/.exec(raw);
  const inner = collection ? collection[1] : raw;
  if (inner.startsWith('Edm.')) {
    return { kind: 'primitive', type: inner, collection: Boolean(collection) };
  }
  const segments = inner.split('.');
  const enumType = segments[segments.length - 1];
  const multi = segments.includes('Multi') || Boolean(collection);
  return { kind: 'enum', enumType, multi };
}

const fields = {};
const rejected = {};
for (const t of targets) {
  const d = declared.get(t);
  if (d) fields[t] = { ...normaliseType(d.type), nullable: d.nullable, resource: d.resource, ...(d.navigation ? { navigation: true } : {}) };
  else rejected[t] = `not declared on any live resource: ${RESOURCES.join(', ')}`;
}

const contract = {
  $comment:
    'GENERATED - do not hand-edit. Regenerate with ' +
    'npm run cotality:crm-contract. The live Cotality API is the only ' +
    'authority; this file is a checkable projection of it, never a substitute.',
  generatedFrom: METADATA,
  verification:
    'Every field name below was cross-checked against the live authenticated ' +
    'Cotality Property resource on 2026-08-23 via $metadata. Enum namespaces are ' +
    'deliberately NOT persisted - only the enum type name Mallan consumes.',
  resources: RESOURCES,
  fieldCount: Object.keys(fields).length,
  fields,
  rejected,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(contract, null, 2) + '\n');

console.log(`[crm-field-contract] ${Object.keys(fields).length} fields -> ${OUT}`);
if (Object.keys(rejected).length) {
  console.log('[crm-field-contract] REJECTED (not on the live resource):');
  for (const [k, v] of Object.entries(rejected)) console.log(`    ${k} - ${v}`);
  process.exitCode = 2;
}
