#!/usr/bin/env node
// Compile a fresh, read-only Cotality evidence bundle from the authenticated API.
//
// This is NOT a source of provider truth. The live API is truth; this file makes
// the proof reproducible for Search review and handoff.
//
// Usage:
//   node scripts/cotality/compile-live-contract.mjs --full
//   node scripts/cotality/compile-live-contract.mjs --schema-only
//   node scripts/cotality/compile-live-contract.mjs --out=artifacts/cotality-contract/latest.json
//
// --full probes every declared field and every declared relationship. That is a
// deliberate thousands-of-requests audit and must not be put on a normal Search
// request path. --schema-only still pages Field/Lookup/Model dictionaries fully.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCotalityClient, mapLimit, PROBE_STATE } from './live-client.mjs';

const args = new Set(process.argv.slice(2));
const full = args.has('--full');
const schemaOnly = args.has('--schema-only') || !full;
const outArg = process.argv.slice(2).find((arg) => arg.startsWith('--out='));
const outPath = path.resolve(outArg ? outArg.slice('--out='.length) : 'artifacts/cotality-contract/latest.json');
const concurrencyArg = process.argv.slice(2).find((arg) => arg.startsWith('--concurrency='));
const concurrency = Math.max(1, Math.min(Number(concurrencyArg?.split('=')[1] || 4), 12));

function now() {
  return new Date().toISOString();
}

function summarizeStates(items, selector) {
  const counts = { SUPPORTED: 0, PROVIDER_REJECTED: 0, UNVERIFIED: 0, NONE: 0 };
  for (const item of items) {
    const value = selector(item);
    if (value && Object.hasOwn(counts, value)) counts[value] += 1;
    else counts.NONE += 1;
  }
  return counts;
}

function withEnumMembers(metadata, fieldInfo) {
  if (!fieldInfo?.enumName) return fieldInfo;
  const members = metadata.enums[fieldInfo.enumName] || [];
  return { ...fieldInfo, __enumMembers: members.map((m) => m.name) };
}

async function optional(label, work) {
  try {
    const value = await work();
    return { state: PROBE_STATE.SUPPORTED, label, value };
  } catch (error) {
    return {
      state: error?.status && [400, 403, 404, 405, 422].includes(Number(error.status))
        ? PROBE_STATE.PROVIDER_REJECTED
        : PROBE_STATE.UNVERIFIED,
      label,
      httpStatus: error?.status ?? null,
      error: error?.body || error?.message || String(error),
    };
  }
}

const client = createCotalityClient();
const startedAt = now();
console.error(`[cotality:contract] start ${startedAt} mode=${full ? 'full' : 'schema-only'} concurrency=${concurrency}`);

const metadataResult = await client.metadata();
const metadata = metadataResult.parsed;
const resources = Object.values(metadata.resources);

// Provider self-description is acquired separately because a service may expose
// a queryable endpoint that is not represented as an EntityType in $metadata.
const [serviceDocument, dataSystem, fieldCatalog, lookupCatalog, modelCatalog, enumerationCatalog] = await Promise.all([
  optional('service_document', () => client.serviceDocument()),
  optional('data_system', () => client.dataSystem()),
  optional('field_catalog', () => client.fieldCatalog()),
  optional('lookup_catalog', () => client.lookupCatalog()),
  optional('model_catalog', () => client.modelCatalog()),
  optional('enumeration_catalog', () => client.enumerationCatalog()),
]);

const fieldRows = [];
for (const resource of resources) {
  for (const field of Object.values(resource.fields)) {
    fieldRows.push({ resource: resource.name, field: field.name, fieldInfo: withEnumMembers(metadata, field) });
  }
}

const relationshipRows = [];
for (const resource of resources) {
  for (const relationship of Object.values(resource.navigation)) {
    relationshipRows.push({ resource: resource.name, relationship: relationship.name, target: relationship.target, collection: relationship.collection });
  }
}

let fieldEvidence = [];
let relationshipEvidence = [];
if (full) {
  console.error(`[cotality:contract] probing ${fieldRows.length} fields`);
  fieldEvidence = await mapLimit(fieldRows, concurrency, async ({ resource, field, fieldInfo }, index) => {
    if ((index + 1) % 100 === 0) console.error(`[cotality:contract] fields ${index + 1}/${fieldRows.length}`);
    const evidence = await client.probeField(resource, field, fieldInfo);
    return { ...evidence, rawType: fieldInfo.rawType, nullable: fieldInfo.nullable, enumName: fieldInfo.enumName, multiEnum: fieldInfo.multiEnum };
  });

  console.error(`[cotality:contract] probing ${relationshipRows.length} relationships`);
  relationshipEvidence = await mapLimit(relationshipRows, Math.min(concurrency, 4), async (row) => ({
    ...row,
    evidence: await client.probeRelationship(row.resource, row.relationship),
  }));
}

const finishedAt = now();
const bundle = {
  format: 'mallan-cotality-live-contract-evidence/v1',
  warning: 'EVIDENCE ONLY. Re-run against the authenticated live Cotality API. Never treat this artifact as provider authority.',
  acquisition: {
    base: client.base,
    startedAt,
    finishedAt,
    mode: full ? 'full' : 'schema-only',
    concurrency,
  },
  metadata: {
    resourceCount: metadata.resourceCount,
    fieldCount: metadata.fieldCount,
    enumCount: metadata.enumCount,
    navigationCount: metadata.navigationCount,
    entitySets: metadata.entitySets,
    resources: metadata.resources,
    enums: metadata.enums,
  },
  catalogs: {
    serviceDocument,
    dataSystem,
    field: fieldCatalog,
    lookup: lookupCatalog,
    model: modelCatalog,
    enumeration: enumerationCatalog,
  },
  probes: {
    fields: fieldEvidence,
    relationships: relationshipEvidence,
  },
  summary: {
    declaredResources: resources.length,
    declaredFields: fieldRows.length,
    declaredRelationships: relationshipRows.length,
    fieldSelectStates: full ? summarizeStates(fieldEvidence, (x) => x.select?.state) : null,
    fieldNonNullFilterStates: full ? summarizeStates(fieldEvidence, (x) => x.filterNonNull?.state) : null,
    fieldOrderStates: full ? summarizeStates(fieldEvidence, (x) => x.sort?.state) : null,
    fieldOperatorStates: full ? summarizeStates(fieldEvidence, (x) => x.operator?.state) : null,
    relationshipStates: full ? summarizeStates(relationshipEvidence, (x) => x.evidence?.state) : null,
    allCatalogsComplete: [fieldCatalog, lookupCatalog, modelCatalog]
      .filter((x) => x.state === PROBE_STATE.SUPPORTED)
      .every((x) => x.value?.complete === true),
  },
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
console.error(`[cotality:contract] wrote ${outPath}`);
console.log(JSON.stringify(bundle.summary, null, 2));

// A provider rejection is evidence. An acquisition failure is not. The compiler
// fails only when a required self-description layer could not be verified or a
// supposedly complete paged catalog was truncated.
const required = [serviceDocument, fieldCatalog, lookupCatalog, modelCatalog];
const unverifiedRequired = required.filter((x) => x.state === PROBE_STATE.UNVERIFIED);
const truncatedRequired = required.filter((x) => x.state === PROBE_STATE.SUPPORTED && x.value?.complete === false);
if (unverifiedRequired.length || truncatedRequired.length) {
  console.error('[cotality:contract] FAIL: required provider self-description is incomplete/unverified');
  process.exit(2);
}

if (schemaOnly) process.exit(0);
const unverifiedFieldProbes = fieldEvidence.filter((x) => [x.select, x.filterNonNull, x.sort, x.operator].some((p) => p?.state === PROBE_STATE.UNVERIFIED));
const unverifiedRelationshipProbes = relationshipEvidence.filter((x) => x.evidence?.state === PROBE_STATE.UNVERIFIED);
if (unverifiedFieldProbes.length || unverifiedRelationshipProbes.length) {
  console.error(`[cotality:contract] FAIL: ${unverifiedFieldProbes.length} field probes and ${unverifiedRelationshipProbes.length} relationship probes are UNVERIFIED`);
  process.exit(2);
}
