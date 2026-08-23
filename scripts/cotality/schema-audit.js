#!/usr/bin/env node
/**
 * scripts/cotality/schema-audit.js — Audit our Prisma `Listing` model
 * column-by-column against the RESO Property entity (as published by
 * REBNY's IDX Plus CSV) and Trestle's live $metadata cache.
 *
 * Useful before every reader-migration PR (5F/5G/etc.) to catch
 * naming drift between our DB columns and the upstream RESO spec.
 *
 * Output:
 *   - artifacts/schema-audit.md  (Markdown)
 *   - artifacts/schema-audit.json
 *
 * Read-only. No DB queries. No Trestle calls. Reads:
 *   - prisma/schema.prisma
 *   - data/rebny-rls-property-fields.csv
 *   - artifacts/metadata.xml
 *
 * Usage:
 *   npm run cotality:schema-audit
 *   npm run cotality:schema-audit -- --json
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.cwd();
const SCHEMA_PRISMA = path.join(REPO_ROOT, 'prisma', 'schema.prisma');
const REBNY_CSV = path.join(REPO_ROOT, 'data', 'rebny-rls-property-fields.csv');
const METADATA_XML = path.join(REPO_ROOT, 'artifacts', 'metadata.xml');
const OUT_MD = path.join(REPO_ROOT, 'artifacts', 'schema-audit.md');
const OUT_JSON = path.join(REPO_ROOT, 'artifacts', 'schema-audit.json');

function pascalCase(snakeOrCamel) {
  return snakeOrCamel
    .replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())
    .replace(/Yn$/, 'YN');
}

function snakeToReso(snake) {
  // Special-cases that don't follow a simple rule.
  const exceptions = {
    listing_id: 'ListingId',
    mls_id: null, // mallan-internal, not a RESO field
    list_price: 'ListPrice',
    bedrooms_total: 'BedroomsTotal',
    bathrooms_full: 'BathroomsFull',
    bathrooms_half: 'BathroomsHalf',
    living_area: 'LivingArea',
    listing_type: null, // mallan-internal sale|rent (RESO uses PropertyType)
    property_type: 'PropertyType',
    property_sub_type: 'PropertySubType',
    postal_code: 'PostalCode',
    rls_eligible: null, // mallan-internal
    commercial_sub_type: null, // mallan-internal
    commercial_ownership: null, // mallan-internal
    idx_display_yn: 'IDXDisplayYN',
    internet_entire_listing_display_yn: 'InternetEntireListingDisplayYN',
    internet_address_display_yn: 'InternetAddressDisplayYN',
    internet_automated_valuation_display_yn: 'InternetAutomatedValuationDisplayYN',
    internet_consumer_comment_yn: 'InternetConsumerCommentYN',
    participant_only: 'ParticipantOnly',
    owner_opt_out: 'OwnerOptOut',
    address: null, // JSON column, not 1:1
    features: null,
    media: null,
    compliance: null,
    agent_info: null,
    raw_data: null,
    primary_photo_url: null, // mallan-derived
    primary_photo_r2_key: null,
    photos_change_timestamp: 'PhotosChangeTimestamp',
    photo_count: 'PhotosCount',
    auction_yn: 'AuctionYN',
    auction_type: null, // RESO doesn't have a single-named field; UCBA composite
    auction_start_date: null,
    auction_end_date: null,
    auction_terms_url: null,
    status: 'StandardStatus',
    status_changed_at: null, // mallan-internal DOM
    first_active_date: null,
    days_on_market: 'DaysOnMarket',
    cumulative_days_on_market: 'CumulativeDaysOnMarket',
    expiration_date: 'ExpirationDate',
    expiration_30d_notified: null, // mallan-internal
    expiration_7d_notified: null,
    last_synced_from_trestle: null, // mallan-internal
    sync_status: null,
    modification_timestamp: 'ModificationTimestamp',
    listing_contract_date: 'ListingContractDate',
    created_at: null,
    updated_at: null,
    custom_fields: null,
    comp_criteria: null,
    agent_id: null, // mallan FK
    owner_client_id: null,
    borough: null, // mallan/CityRegion mapped
    neighborhood: null, // mallan/SubdivisionName mapped
    city: 'City',
  };
  if (snake in exceptions) return exceptions[snake];
  return pascalCase(snake);
}

function parseListingModel(prismaText) {
  // Find the `model Listing { ... }` block.
  const m = prismaText.match(/model Listing \{([\s\S]+?)\n\}/);
  if (!m) throw new Error('Could not find Listing model in schema.prisma');
  const body = m[1];
  // Each meaningful line: `<name> <type> [@directives]`
  const cols = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@') || trimmed.startsWith('@')) continue;
    const match = trimmed.match(/^([a-z_][a-z0-9_]*)\s+(\S+)/);
    if (!match) continue;
    const [, name, type] = match;
    // Skip relation fields (no @map, type contains [ ] or capitalized model name)
    const isRelation = /^[A-Z]/.test(type) && !/^(BigInt|String|Int|Float|Decimal|Boolean|DateTime|Json|Bytes)/.test(type);
    if (isRelation) continue;
    cols.push({ name, type });
  }
  return cols;
}

function parseRebnyPropertyFields(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const fieldName = (cols[1] || '').trim();
    const resource = (cols[5] || '').trim();
    if (resource !== 'Property') continue;
    if (!fieldName) continue;
    out.set(fieldName, { name: fieldName, raw: line });
  }
  return out;
}

function parseTrestleMetadata(xml) {
  const m = xml.match(/<EntityType\s+Name="Property"[^>]*>([\s\S]*?)<\/EntityType>/);
  if (!m) return new Set();
  const names = new Set();
  const propRegex = /<Property\s+Name="([^"]+)"/g;
  let p;
  while ((p = propRegex.exec(m[1])) !== null) names.add(p[1]);
  return names;
}

(async () => {
  const json = process.argv.includes('--json');

  const prismaText = fs.readFileSync(SCHEMA_PRISMA, 'utf-8');
  const csvText = fs.readFileSync(REBNY_CSV, 'utf-8');
  const xmlText = fs.existsSync(METADATA_XML) ? fs.readFileSync(METADATA_XML, 'utf-8') : '';

  const cols = parseListingModel(prismaText);
  const rebny = parseRebnyPropertyFields(csvText);
  const trestle = parseTrestleMetadata(xmlText);

  const findings = cols.map((c) => {
    const reso = snakeToReso(c.name);
    const inRebny = reso ? rebny.has(reso) : false;
    const inTrestle = reso ? trestle.has(reso) : false;
    let verdict;
    if (reso === null) verdict = 'mallan-internal (no RESO mapping by design)';
    else if (inRebny && inTrestle) verdict = '✅ RESO+Trestle aligned';
    else if (inRebny && !inTrestle) verdict = '⚠ REBNY documents but Trestle does NOT expose';
    else if (!inRebny && inTrestle) verdict = '⚠ Trestle exposes but REBNY does NOT document';
    else verdict = '⚠ neither REBNY nor Trestle has this name — verify mapping';
    return {
      column: c.name,
      type: c.type,
      reso_name: reso,
      in_rebny_idx_plus: inRebny,
      in_trestle_metadata: inTrestle,
      verdict,
    };
  });

  const stats = {
    total_columns: findings.length,
    aligned: findings.filter((f) => f.verdict.startsWith('✅')).length,
    mallan_internal: findings.filter((f) => f.verdict.startsWith('mallan-internal')).length,
    drift: findings.filter((f) => f.verdict.startsWith('⚠')).length,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ stats, findings }, null, 2));

  // Markdown
  const lines = [];
  lines.push('# Schema vs RESO DD audit');
  lines.push('');
  lines.push(`> Column-by-column compare of \`prisma/schema.prisma\` Listing model vs REBNY IDX Plus CSV (\`data/rebny-rls-property-fields.csv\`) vs Trestle's live \`$metadata\` (\`artifacts/metadata.xml\`).`);
  lines.push(`> Generated by \`npm run cotality:schema-audit\`. Captured: ${new Date().toISOString()}.`);
  lines.push('');
  lines.push('## Stats');
  lines.push('');
  lines.push(`- **Total Listing columns**: ${stats.total_columns}`);
  lines.push(`- **Fully aligned (REBNY + Trestle)**: ${stats.aligned}`);
  lines.push(`- **Mallan-internal (no RESO mapping by design)**: ${stats.mallan_internal}`);
  lines.push(`- **Drift / verify-mapping**: ${stats.drift}`);
  lines.push('');
  lines.push('## Per-column verdict');
  lines.push('');
  lines.push('| Column | Type | RESO name | In REBNY | In Trestle | Verdict |');
  lines.push('|---|---|---|---|---|---|');
  for (const f of findings) {
    lines.push(`| \`${f.column}\` | \`${f.type}\` | \`${f.reso_name ?? '—'}\` | ${f.in_rebny_idx_plus ? '✓' : '—'} | ${f.in_trestle_metadata ? '✓' : '—'} | ${f.verdict} |`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- **Mallan-internal** columns are deliberately not RESO-aligned: things like `agent_id` (FK to our `Agent` model), `sync_status` (sync pipeline state), and the JSON columns (`address`, `features`, `media`, `compliance`, `agent_info`, `raw_data`) which carry RESO data inside them but are not 1:1 column-named.');
  lines.push('- **REBNY-only** entries usually mean Trestle hasn\'t certified that field on the IDX Plus tier yet, or REBNY documents a field that Trestle exposes under a slightly different name.');
  lines.push('- **Trestle-only** entries indicate fields the live feed exposes that REBNY hasn\'t formally licensed in the IDX Plus subset — useful but not contractual.');
  lines.push('');
  fs.writeFileSync(OUT_MD, lines.join('\n'));

  if (json) {
    console.log(JSON.stringify({ stats, findings }, null, 2));
    return;
  }

  console.log(`[schema-audit] saved → ${path.relative(REPO_ROOT, OUT_MD)}`);
  console.log(`[schema-audit] saved → ${path.relative(REPO_ROOT, OUT_JSON)}`);
  console.log(`[schema-audit] total Listing columns: ${stats.total_columns}`);
  console.log(`[schema-audit]   fully aligned (REBNY + Trestle): ${stats.aligned}`);
  console.log(`[schema-audit]   mallan-internal: ${stats.mallan_internal}`);
  console.log(`[schema-audit]   drift / verify: ${stats.drift}`);
})().catch((err) => {
  console.error('[schema-audit] fatal:', err);
  process.exit(1);
});
