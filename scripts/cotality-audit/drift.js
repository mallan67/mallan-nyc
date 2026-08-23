#!/usr/bin/env node
/**
 * scripts/cotality/drift.js — Track field-set drift between three sources
 * of truth: Trestle's live $metadata, the REBNY IDX Plus field CSV,
 * and (optionally) a snapshot from a prior run.
 *
 * The "Trestle is behind on Cotality updates" reality: Cotality's Trestle
 * tier is currently certified on Cotality Web API Core 2.0.0 + DD 2.0 +
 * DD 1.7. Cotality has DD 2.1 published; Trestle hasn't certified there
 * yet. REBNY has its own IDX Plus subset (902 fields) which they update
 * on their own cadence. So the three sources can drift independently:
 *
 *   1. Trestle live $metadata (what the feed actually exposes)
 *   2. REBNY IDX Plus CSV (what REBNY documents we should see)
 *   3. Cotality DD reference (the canonical standard)
 *
 * What this tool does:
 *   - Parse Trestle's $metadata (cached at artifacts/metadata.xml)
 *   - Parse REBNY IDX Plus field list (data/rebny-rls-property-fields.csv)
 *   - Diff the two sets
 *   - Save a dated snapshot to artifacts/cotality-drift/YYYY-MM-DDTHHmmssZ.json
 *   - Diff against the previous drift snapshot (if any) and surface the delta
 *
 * What this tool does NOT do:
 *   - Hit the live Trestle $metadata endpoint (the cache file is the
 *     source of truth; refresh it with the existing
 *     `scripts/refresh-trestle-csv.ts` runner). This keeps drift.js
 *     from burning IDX Plus quota on every run.
 *
 * Usage:
 *   npm run cotality:drift                 # produce + persist a drift snapshot
 *   npm run cotality:drift -- --json
 *   npm run cotality:drift -- --resource=Property
 *   npm run cotality:drift -- --resource=Member
 *
 * Read-only. No DB writes. No Trestle calls.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.cwd();
const METADATA_XML = path.join(REPO_ROOT, 'artifacts', 'metadata.xml');
const REBNY_FIELDS_CSV = path.join(REPO_ROOT, 'data', 'rebny-rls-property-fields.csv');
const DRIFT_DIR = path.join(REPO_ROOT, 'artifacts', 'cotality-drift');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

/**
 * Lightweight XML parsing — we only need EntityType + Property elements,
 * so we use targeted regex instead of pulling in a full XML library.
 * Trestle's $metadata is well-formed and stable in shape; this is good
 * enough for a diagnostic tool.
 */
function parseTrestleMetadata(xml) {
  const entities = {};
  const entityRegex = /<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
  let m;
  while ((m = entityRegex.exec(xml)) !== null) {
    const [, entityName, body] = m;
    const fields = [];
    const propRegex = /<Property\s+Name="([^"]+)"\s+Type="([^"]+)"/g;
    let p;
    while ((p = propRegex.exec(body)) !== null) {
      fields.push({ name: p[1], type: p[2] });
    }
    entities[entityName] = fields;
  }
  return entities;
}

function parseRebnyCsv(csvText) {
  // CSV header structure: ",AttributeName,,MatrixFieldName,RLSDescription,Resource,StandardType,Feed"
  // Real rows have 7+ columns; we extract per-resource field lists.
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const byResource = {};
  for (const line of lines.slice(1)) {
    // Quick CSV split — REBNY values don't contain quoted commas at the
    // columns we care about (verified against the file).
    const cols = line.split(',');
    const fieldName = (cols[1] || '').trim();
    const matrixName = (cols[3] || '').trim();
    const resource = (cols[5] || '').trim();
    if (!fieldName || !resource) continue;
    if (!byResource[resource]) byResource[resource] = [];
    byResource[resource].push({ name: fieldName, matrix_name: matrixName });
  }
  return byResource;
}

function diffFields(trestleFields, rebnyFields) {
  const trestleSet = new Set(trestleFields.map((f) => f.name));
  const rebnySet = new Set(rebnyFields.map((f) => f.name));

  const trestleOnly = trestleFields
    .filter((f) => !rebnySet.has(f.name))
    .map((f) => f.name)
    .sort();

  const rebnyOnly = rebnyFields
    .filter((f) => !trestleSet.has(f.name))
    .map((f) => f.name)
    .sort();

  const both = trestleFields
    .filter((f) => rebnySet.has(f.name))
    .map((f) => f.name)
    .sort();

  return { trestleOnly, rebnyOnly, both };
}

function loadPriorDrift() {
  try {
    const latest = path.join(DRIFT_DIR, 'latest.json');
    if (!fs.existsSync(latest)) return null;
    return JSON.parse(fs.readFileSync(latest, 'utf-8'));
  } catch {
    return null;
  }
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

(async () => {
  const onlyResource = arg('resource');
  const json = process.argv.includes('--json');

  if (!fs.existsSync(METADATA_XML)) {
    console.error(`[drift] missing ${METADATA_XML} — refresh with scripts/refresh-trestle-csv.ts first`);
    process.exit(1);
  }
  if (!fs.existsSync(REBNY_FIELDS_CSV)) {
    console.error(`[drift] missing ${REBNY_FIELDS_CSV}`);
    process.exit(1);
  }

  const xml = fs.readFileSync(METADATA_XML, 'utf-8');
  const csv = fs.readFileSync(REBNY_FIELDS_CSV, 'utf-8');
  const trestleEntities = parseTrestleMetadata(xml);
  const rebnyByResource = parseRebnyCsv(csv);

  const resources = onlyResource
    ? [onlyResource]
    : [...new Set([...Object.keys(trestleEntities), ...Object.keys(rebnyByResource)])].sort();

  const summary = {
    captured_at: new Date().toISOString(),
    sources: {
      trestle_metadata: path.relative(REPO_ROOT, METADATA_XML),
      rebny_field_csv: path.relative(REPO_ROOT, REBNY_FIELDS_CSV),
    },
    note: 'Cotality/Trestle is currently certified on Cotality Web API Core 2.0.0 + DD 2.0 + DD 1.7. Cotality has DD 2.1 published; Trestle has NOT certified there yet (per the 2026-04-29 Cotality Desktop Client session). REBNY publishes its own IDX Plus subset on its own cadence.',
    resources: {},
  };

  for (const resource of resources) {
    const trestle = trestleEntities[resource] || [];
    const rebny = rebnyByResource[resource] || [];
    const diff = diffFields(trestle, rebny);
    summary.resources[resource] = {
      trestle_field_count: trestle.length,
      rebny_field_count: rebny.length,
      both: diff.both.length,
      trestle_only: diff.trestleOnly.length,
      rebny_only: diff.rebnyOnly.length,
      trestle_only_examples: diff.trestleOnly.slice(0, 20),
      rebny_only_examples: diff.rebnyOnly.slice(0, 20),
    };
  }

  // Compare against prior run if one exists
  const prior = loadPriorDrift();
  const changes = [];
  if (prior && prior.resources) {
    for (const [resource, current] of Object.entries(summary.resources)) {
      const last = prior.resources[resource];
      if (!last) {
        changes.push({ resource, change: 'NEW: not in prior snapshot' });
        continue;
      }
      if (current.trestle_field_count !== last.trestle_field_count) {
        changes.push({
          resource,
          change: `Trestle field count ${last.trestle_field_count} → ${current.trestle_field_count}`,
        });
      }
      if (current.rebny_field_count !== last.rebny_field_count) {
        changes.push({
          resource,
          change: `REBNY field count ${last.rebny_field_count} → ${current.rebny_field_count}`,
        });
      }
      if (current.trestle_only !== last.trestle_only) {
        changes.push({
          resource,
          change: `Trestle-only fields ${last.trestle_only} → ${current.trestle_only}`,
        });
      }
      if (current.rebny_only !== last.rebny_only) {
        changes.push({
          resource,
          change: `REBNY-only fields ${last.rebny_only} → ${current.rebny_only}`,
        });
      }
    }
  }
  summary.changes_since_prior = prior ? changes : 'no prior snapshot';

  // Persist
  fs.mkdirSync(DRIFT_DIR, { recursive: true });
  const filename = `${ts()}.json`;
  const fullPath = path.join(DRIFT_DIR, filename);
  const latestPath = path.join(DRIFT_DIR, 'latest.json');
  const pretty = JSON.stringify(summary, null, 2);
  fs.writeFileSync(fullPath, pretty);
  fs.writeFileSync(latestPath, pretty);

  if (json) {
    console.log(pretty);
    return;
  }

  // Human view
  console.log(`\n── Trestle ↔ REBNY field-set drift ──`);
  console.log(`Trestle metadata: ${path.relative(REPO_ROOT, METADATA_XML)}`);
  console.log(`REBNY CSV:        ${path.relative(REPO_ROOT, REBNY_FIELDS_CSV)}`);
  console.log(`Snapshot saved:   ${path.relative(REPO_ROOT, fullPath)}`);
  console.log('');
  console.log(`Resource             Trestle    REBNY   Both   Trestle-only  REBNY-only`);
  console.log(`─────────────────── ────────  ───────  ─────  ────────────  ──────────`);
  for (const [resource, r] of Object.entries(summary.resources)) {
    console.log(
      `${resource.padEnd(20)} ${String(r.trestle_field_count).padStart(8)}  ${String(r.rebny_field_count).padStart(7)}  ${String(r.both).padStart(5)}  ${String(r.trestle_only).padStart(12)}  ${String(r.rebny_only).padStart(10)}`,
    );
  }

  if (Array.isArray(summary.changes_since_prior) && summary.changes_since_prior.length > 0) {
    console.log(`\nChanges since prior snapshot:`);
    for (const c of summary.changes_since_prior) console.log(`  • ${c.resource}: ${c.change}`);
  } else if (Array.isArray(summary.changes_since_prior)) {
    console.log(`\nNo changes since prior snapshot.`);
  } else {
    console.log(`\n(No prior snapshot — this is the first run. Future runs will diff.)`);
  }
  console.log('');
})().catch((err) => {
  console.error('[drift] fatal:', err.message || err);
  process.exit(1);
});
