#!/usr/bin/env node
// Verify the CURRENT authenticated Search provider contract against live Cotality.
//
// This is deliberately narrower/faster than compile-live-contract -- it is the
// development gate for PR #618. It inventories the exact provider fields the
// Search route selects or filters, proves they are declared on the expected
// resource, and executes live select/filter/order probes. It never promotes a
// nearby field when a requested one fails.

import { readFile } from 'node:fs/promises';
import { createCotalityClient, mapLimit, PROBE_STATE } from './live-client.mjs';

const ROOT = process.cwd();
const ROUTE = 'app/api/idx/search/route.ts';
const FILTER = 'lib/search/crm-idx-filter.ts';
const REGISTRY = 'lib/search/canonical/field-registry.ts';
const concurrencyArg = process.argv.slice(2).find((arg) => arg.startsWith('--concurrency='));
const concurrency = Math.max(1, Math.min(Number(concurrencyArg?.split('=')[1] || 4), 10));

function quotedNames(block) {
  return [...String(block).matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((m) => m[1]);
}

function extractSearchSelectFields(source) {
  const match = source.match(/export const SEARCH_SELECT_FIELDS\s*=\s*\[([\s\S]*?)\];/);
  if (!match) throw new Error(`Cannot find SEARCH_SELECT_FIELDS in ${ROUTE}`);
  return [...new Set(quotedNames(match[1]))];
}

function extractFilterFields(source) {
  const fields = new Set();
  // Numeric table rows: ["minPrice", "ListPrice", "ge", false]
  for (const m of source.matchAll(/\[\s*["'][^"']+["']\s*,\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*,\s*["'](?:ge|le|gt|lt|eq|ne)["']/g)) {
    fields.add(m[1]);
  }
  // Explicit OData expressions produced by the filter builder. This does not
  // attempt to parse arbitrary TS; it inventories exact provider identifiers in
  // strings/templates and is cross-checked against route + registry below.
  for (const m of source.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s+(?:eq|ne|ge|le|gt|lt|has)\b/g)) fields.add(m[1]);
  for (const m of source.matchAll(/(?:contains|startswith|endswith)\(\s*(?:tolower\()?([A-Z][A-Za-z0-9_]*)/g)) fields.add(m[1]);
  for (const m of source.matchAll(/renderExactEnum\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)) fields.add(m[1]);
  // Known canonical helpers own these exact live fields.
  if (/standardStatusOData\(/.test(source)) fields.add('StandardStatus');
  if (/propertyTypeUniverseOData\(/.test(source)) fields.add('PropertyType');
  if (/propertySubTypeOData\(/.test(source)) fields.add('PropertySubType');
  return [...fields].sort();
}

function extractSimpleRegistryFields(source) {
  const out = new Set();
  for (const m of source.matchAll(/cotalityField:\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)) out.add(m[1]);
  return [...out].sort();
}

function enumMembersFor(metadata, fieldInfo) {
  if (!fieldInfo?.enumName) return [];
  return (metadata.enums[fieldInfo.enumName] || []).map((m) => m.name);
}

const [routeSource, filterSource, registrySource] = await Promise.all([
  readFile(`${ROOT}/${ROUTE}`, 'utf8'),
  readFile(`${ROOT}/${FILTER}`, 'utf8'),
  readFile(`${ROOT}/${REGISTRY}`, 'utf8'),
]);

const routeFields = extractSearchSelectFields(routeSource);
const filterFields = extractFilterFields(filterSource);
const registryFields = extractSimpleRegistryFields(registrySource);
const searchFields = [...new Set([...routeFields, ...filterFields])].sort();

const client = createCotalityClient();
const { parsed: metadata } = await client.metadata();
const property = metadata.resources.Property;
if (!property) throw new Error('UNVERIFIED: live Cotality $metadata has no Property EntityType.');

const defects = [];
for (const field of searchFields) {
  if (!property.fields[field]) defects.push({ code: 'SEARCH_FIELD_NOT_LIVE_PROPERTY', field });
}
for (const field of filterFields) {
  if (!routeFields.includes(field)) {
    defects.push({ code: 'FILTER_FIELD_NOT_SELECTED', field, note: 'Filter may execute, but result mapping cannot inspect the same provider fact unless selection is intentionally unnecessary.' });
  }
}

console.error(`[cotality:search:verify] live Property fields=${Object.keys(property.fields).length}; Search fields=${searchFields.length}`);
const probeTargets = searchFields.filter((field) => property.fields[field]);
const evidence = await mapLimit(probeTargets, concurrency, async (field, index) => {
  if ((index + 1) % 25 === 0) console.error(`[cotality:search:verify] ${index + 1}/${probeTargets.length}`);
  const info = property.fields[field];
  return client.probeField('Property', field, {
    ...info,
    __enumMembers: enumMembersFor(metadata, info),
  });
});

const byField = Object.fromEntries(evidence.map((e) => [e.field, e]));
for (const field of routeFields) {
  const e = byField[field];
  if (!e) continue;
  if (e.select.state !== PROBE_STATE.SUPPORTED) {
    defects.push({ code: 'SEARCH_SELECT_NOT_SUPPORTED', field, state: e.select.state, httpStatus: e.select.httpStatus, error: e.select.error });
  }
}
for (const field of filterFields) {
  const e = byField[field];
  if (!e) continue;
  if (e.filterNonNull.state !== PROBE_STATE.SUPPORTED) {
    defects.push({ code: 'SEARCH_FILTER_NOT_SUPPORTED', field, state: e.filterNonNull.state, httpStatus: e.filterNonNull.httpStatus, error: e.filterNonNull.error });
  }
  if (e.operator && e.operator.state !== PROBE_STATE.SUPPORTED) {
    defects.push({ code: 'SEARCH_OPERATOR_NOT_SUPPORTED', field, state: e.operator.state, httpStatus: e.operator.httpStatus, error: e.operator.error });
  }
}

// Hard semantic anti-alias invariants. These do not infer provider semantics;
// they prevent already-proven distinct facts from being laundered into each other.
const forbiddenPatterns = [
  { code: 'STATUS_FIELD_ALIAS', re: /MlsStatus[^\n]{0,120}StandardStatus|StandardStatus[^\n]{0,120}MlsStatus/i },
  { code: 'DIRECTION_EXPOSURE_ALIAS', re: /DirectionFaces[^\n]{0,120}StreetDirSuffix|StreetDirSuffix[^\n]{0,120}DirectionFaces/i },
  { code: 'BUSINESS_SUBTYPE_ALIAS', re: /BusinessType[^\n]{0,120}PropertySubType|PropertySubType[^\n]{0,120}BusinessType/i },
];
for (const { code, re } of forbiddenPatterns) {
  if (re.test(filterSource)) defects.push({ code, file: FILTER });
}

const unverified = evidence.filter((e) => [e.select, e.filterNonNull, e.sort, e.operator].some((p) => p?.state === PROBE_STATE.UNVERIFIED));
const summary = {
  livePropertyFields: Object.keys(property.fields).length,
  routeSelectFields: routeFields.length,
  filterFields: filterFields.length,
  registrySimpleFields: registryFields.length,
  probedSearchFields: evidence.length,
  unverifiedFields: unverified.map((e) => e.field),
  defects,
};

console.log(JSON.stringify(summary, null, 2));
if (unverified.length) process.exit(2);
if (defects.length) process.exit(1);
process.exit(0);
