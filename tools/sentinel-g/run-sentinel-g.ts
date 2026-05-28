import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type Status = 'PASS' | 'YELLOW' | 'FAIL';
type Check = { code: string; name: string; status: Status; details: string };

type Report = {
  tool: 'Sentinel-G';
  status: Status;
  generatedAt: string;
  mode: 'static' | 'static+live';
  metadataHash: string | null;
  selectedFieldCount: number;
  metadataPropertyFieldCount: number;
  checks: Check[];
};

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const outDir = path.join(root, 'ops', 'audit', 'sentinel-g');
const checks: Check[] = [];

const REQUIRED_FILES = [
  'CLAUDE.md',
  'docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md',
  'docs/compliance/COMPLIANCE-CANONICAL-INDEX.md',
  'docs/agents/SENTINEL-G-MANDATE-2026-05-28.md',
  'lib/idx/auth.ts',
  'lib/idx/fetch.ts',
  'lib/idx/trestle-mapper.ts',
  'lib/idx/public-dto.ts',
  'lib/idx/db-to-public-dto.ts',
  'lib/listing-slug.ts',
  'app/api/listings/route.ts',
  'app/api/listings/[id]/route.ts',
  'app/api/listings/suggest/route.ts',
  'app/listing/[id]/page.tsx',
  'lib/search/public-listing-db.ts',
  'lib/search/public-listing-trestle.ts',
  'data/rebny-rls-property-fields.csv',
  'data/rebny-rls-property-lookup.csv',
  'data/RLS-FIELD-REGISTRY.md',
  'artifacts/metadata.xml',
];

const PUBLIC_FORBIDDEN_KEYS = [
  'PrivateRemarks', 'PrivateOfficeRemarks', 'ShowingInstructions',
  'ShowingContactPhone', 'ShowingContactName', 'ShowingRequirements',
  'LockBoxType', 'LockBoxLocation', 'ListAgentEmail',
  'ListAgentDirectPhone', 'ListAgentMlsId', 'CoListAgentEmail',
  'CoListAgentDirectPhone', 'owner_client_id', 'sellerEmail',
  'sellerPhone', 'seller_email', 'seller_phone',
];

function rel(file: string): string { return path.join(root, file); }
function exists(file: string): boolean { return fs.existsSync(rel(file)); }
function read(file: string): string { return fs.readFileSync(rel(file), 'utf8'); }
function uniq<T>(items: T[]): T[] { return Array.from(new Set(items)); }
function add(code: string, name: string, status: Status, details: string): void { checks.push({ code, name, status, details }); }
function missing(content: string, needles: string[]): string[] { return needles.filter((needle) => !content.includes(needle)); }
function sample(items: string[], n = 25): string { return items.slice(0, n).join(', ') + (items.length > n ? ` ... +${items.length - n} more` : ''); }
function fieldSet(items: string[]): Set<string> { return new Set(items.map((s) => s.trim()).filter(Boolean)); }
function overall(): Status { return checks.some(c => c.status === 'FAIL') ? 'FAIL' : checks.some(c => c.status === 'YELLOW') ? 'YELLOW' : 'PASS'; }

function extractStringLiterals(block: string): string[] {
  return uniq([...block.matchAll(/["']([A-Za-z0-9_]+)["']/g)].map((m) => m[1]));
}

function extractBCategoryFields(mapper: string): string[] {
  const fields: string[] = [];
  for (const match of mapper.matchAll(/const\s+B[A-Z0-9_]+\s*=\s*\[([\s\S]*?)\];/g)) {
    fields.push(...extractStringLiterals(match[1]));
  }
  return uniq(fields);
}

function extractExcludedFields(mapper: string): string[] {
  const match = mapper.match(/IDX_PLUS_EXCLUDED_FIELDS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  return match ? extractStringLiterals(match[1]) : [];
}

function extractRenames(mapper: string): Record<string, string> {
  const match = mapper.match(/RESO_TO_RLS_RENAMES[^{]*\{([\s\S]*?)\};/);
  const out: Record<string, string> = {};
  if (!match) return out;
  for (const row of match[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*["']([A-Za-z0-9_]+)["']/g)) out[row[1]] = row[2];
  return out;
}

function extractMetadataPropertyFields(xml: string): string[] {
  if (!xml) return [];
  const propertyEntity = xml.match(/<EntityType\s+Name=["']Property["'][^>]*>([\s\S]*?)<\/EntityType>/);
  const scope = propertyEntity ? propertyEntity[1] : xml;
  return uniq([...scope.matchAll(/<Property\s+Name=["']([^"']+)["']/g)].map((m) => m[1]));
}

function extractInterfaceBody(source: string, interfaceName: string): string {
  const start = source.indexOf(`export interface ${interfaceName}`);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  return '';
}

async function getTrestleToken(): Promise<string | null> {
  const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const clientSecret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle';
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api' });
  const res = await fetch(`${base}/oidc/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`token request failed ${res.status}`);
  const json = await res.json() as { access_token?: string };
  return json.access_token || null;
}

async function fetchLiveMetadata(): Promise<string | null> {
  const token = await getTrestleToken();
  if (!token) return null;
  const base = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || 'https://api.cotality.com/trestle';
  const res = await fetch(`${base}/odata/$metadata`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`metadata request failed ${res.status}`);
  return await res.text();
}

async function probePublicEndpoint(baseUrl: string, pathPart: string): Promise<{ status: number; body: string; location?: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}${pathPart}`;
  const res = await fetch(url, { redirect: 'manual' });
  return { status: res.status, body: await res.text().catch(() => ''), location: res.headers.get('location') || undefined };
}

async function main(): Promise<void> {
  const missingFiles = REQUIRED_FILES.filter((file) => !exists(file));
  add('G-000', 'Required Sentinel-G source files exist', missingFiles.length ? 'FAIL' : 'PASS', missingFiles.length ? `Missing: ${missingFiles.join(', ')}` : `${REQUIRED_FILES.length} required files found.`);

  const mapper = exists('lib/idx/trestle-mapper.ts') ? read('lib/idx/trestle-mapper.ts') : '';
  const publicDto = exists('lib/idx/public-dto.ts') ? read('lib/idx/public-dto.ts') : '';
  const dbDto = exists('lib/idx/db-to-public-dto.ts') ? read('lib/idx/db-to-public-dto.ts') : '';
  const fetchTs = exists('lib/idx/fetch.ts') ? read('lib/idx/fetch.ts') : '';
  const suggest = exists('app/api/listings/suggest/route.ts') ? read('app/api/listings/suggest/route.ts') : '';
  const listingRoute = exists('app/api/listings/route.ts') ? read('app/api/listings/route.ts') : '';
  const apiDetailRoute = exists('app/api/listings/[id]/route.ts') ? read('app/api/listings/[id]/route.ts') : '';
  const pageDetailRoute = exists('app/listing/[id]/page.tsx') ? read('app/listing/[id]/page.tsx') : '';
  const slug = exists('lib/listing-slug.ts') ? read('lib/listing-slug.ts') : '';
  let metadata = exists('artifacts/metadata.xml') ? read('artifacts/metadata.xml') : '';
  let mode: Report['mode'] = 'static';

  const allFields = extractBCategoryFields(mapper);
  const excludedFields = extractExcludedFields(mapper);
  const excludedSet = fieldSet(excludedFields);
  const selectedFields = allFields.filter((f) => !excludedSet.has(f));
  const renames = extractRenames(mapper);

  const mapperMissing = missing(mapper, ['RESO_TO_RLS_RENAMES', 'IDX_PLUS_SELECT_FIELDS', 'computeGateColumns', 'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN', 'Permission']);
  add('G-001', 'Mapper exposes required contract primitives', mapperMissing.length ? 'FAIL' : 'PASS', mapperMissing.length ? `Missing anchors: ${mapperMissing.join(', ')}` : `Found ${allFields.length} B-category fields, ${excludedFields.length} exclusions, ${selectedFields.length} derived selected fields.`);

  const selectedIntersection = selectedFields.filter((f) => excludedSet.has(f));
  add('G-002', 'Excluded IDX Plus fields are not selected', selectedIntersection.length ? 'FAIL' : 'PASS', selectedIntersection.length ? `Excluded fields still selected: ${sample(selectedIntersection)}` : `${excludedFields.length} excluded fields absent from selected set.`);

  try {
    const live = await fetchLiveMetadata();
    if (live) { metadata = live; mode = 'static+live'; add('G-003', 'Live Cotality/Trestle metadata fetch', 'PASS', 'Fetched live /odata/$metadata with configured IDX credentials.'); }
    else add('G-003', 'Live Cotality/Trestle metadata fetch', 'YELLOW', 'IDX credentials not configured; using artifacts/metadata.xml only.');
  } catch (err) {
    add('G-003', 'Live Cotality/Trestle metadata fetch', 'FAIL', `Live metadata fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const metadataHash = metadata ? crypto.createHash('sha256').update(metadata).digest('hex') : null;
  const metadataFields = extractMetadataPropertyFields(metadata);
  const metadataSet = fieldSet(metadataFields);
  add('G-004', 'Metadata has Property field list', metadataFields.length ? 'PASS' : 'FAIL', metadataFields.length ? `${metadataFields.length} Property fields parsed. sha256=${metadataHash}` : 'No Property fields parsed from metadata.');

  const missingSelected = selectedFields.filter((field) => {
    if (metadataSet.has(field)) return false;
    const renamed = renames[field];
    return !(renamed && metadataSet.has(renamed));
  });
  add('G-005', 'Derived selected fields exist in metadata after rename resolution', missingSelected.length ? 'FAIL' : 'PASS', missingSelected.length ? `${missingSelected.length} selected fields missing after rename resolution: ${sample(missingSelected)}` : `${selectedFields.length} selected fields validated against metadata or rename target.`);

  const renameShapeBad = Object.entries(renames).filter(([src, dest]) => !src || !dest || src === dest);
  const renameSourcesMissing = Object.keys(renames).filter((src) => !allFields.includes(src) && !metadataSet.has(src));
  const renameStatus: Status = renameShapeBad.length ? 'FAIL' : renameSourcesMissing.length ? 'YELLOW' : 'PASS';
  add('G-006', 'RESO_TO_RLS_RENAMES has valid shape and source coverage', renameStatus, renameShapeBad.length ? `Bad rename rows: ${sample(renameShapeBad.map(([s, d]) => `${s}->${d}`))}` : renameSourcesMissing.length ? `Rename sources not in B arrays/metadata, review as internal aliases: ${sample(renameSourcesMissing)}` : `${Object.keys(renames).length} rename rows have non-empty source/destination and covered sources.`);

  const idAnchors = ['ListingId', 'ListingKey', 'SourceSystemKey', 'OriginatingSystemKey', 'ListingKeyNumeric'];
  const idMissing = idAnchors.filter((field) => !allFields.includes(field) && !metadataSet.has(field) && !(renames[field] && metadataSet.has(renames[field])));
  const fetchIdMissing = missing(fetchTs, ['ListingId eq', 'fetchSingleListing', 'ListingId != entity key']);
  add('G-007', 'Provider ID chain fields and fetch semantics are present', idMissing.length || fetchIdMissing.length ? 'FAIL' : 'PASS', idMissing.length || fetchIdMissing.length ? `Missing ID fields/anchors: ${sample([...idMissing, ...fetchIdMissing])}` : 'ListingId, ListingKey, SourceSystemKey/rename, OriginatingSystemKey, ListingKeyNumeric, and fetch-by-ListingId semantics found.');

  const publicInterface = extractInterfaceBody(publicDto, 'PublicListingDTO');
  const dtoLeaks = PUBLIC_FORBIDDEN_KEYS.filter((key) => new RegExp(`\\b${key}\\b`).test(publicInterface));
  const dtoRequired = missing(publicDto, ['_displayCompliance', 'requiresAttribution', 'attributionText', 'disclaimerRequired', 'isAddressDisplayable', 'generateListingSlug']);
  add('G-008', 'Public DTO has attribution/canonical fields and no internal fields in DTO shape', dtoLeaks.length || dtoRequired.length ? 'FAIL' : 'PASS', dtoLeaks.length || dtoRequired.length ? `DTO leaks/omissions: leaks=${dtoLeaks.join(', ') || 'none'} missing=${dtoRequired.join(', ') || 'none'}` : 'Public DTO shape is attribution-aware and does not declare internal/private fields.');

  const dbClassMissing = missing(dbDto, ['classifyDbListing', 'mallan-exclusive', 'third-party-idx', 'website-only', 'filterDisplayableDbListings', 'owner_client_id', 'agent_id', 'rls_eligible']);
  add('G-009', 'DB DTO classifies Mallan exclusive vs third-party IDX vs website-only', dbClassMissing.length ? 'FAIL' : 'PASS', dbClassMissing.length ? `Missing DB classification anchors: ${dbClassMissing.join(', ')}` : 'DB provenance classifier anchors found.');

  const gateMissing = missing(mapper + dbDto + suggest + listingRoute, ['computeGateColumns', 'filterDisplayableDbListings', 'checkDistributionGates', 'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN', 'owner_opt_out', 'participant_only']);
  add('G-010', 'Display gates are represented across mapper, DB DTO, suggest, and listing route', gateMissing.length ? 'FAIL' : 'PASS', gateMissing.length ? `Missing gate anchors: ${gateMissing.join(', ')}` : 'Display gate anchors found across layers.');

  const suggestMissing = missing(suggest, ['SUGGEST_SELECT_FIELDS', 'ListingId', 'ListingKey', 'checkDistributionGates', 'isAddressDisplayablePerSuggest', 'InternetAddressDisplayYN', 'InternetEntireListingDisplayYN']);
  const suggestLeaks = PUBLIC_FORBIDDEN_KEYS.filter((key) => new RegExp(`\\b${key}\\b`).test(suggest));
  add('G-011', 'Public suggest route uses identity/gate anchors and avoids private fields', suggestMissing.length || suggestLeaks.length ? 'FAIL' : 'PASS', suggestMissing.length || suggestLeaks.length ? `suggest missing=${suggestMissing.join(', ') || 'none'} private-key-presence=${suggestLeaks.join(', ') || 'none'}` : 'Suggest route identity/gate anchors present and no forbidden public keys detected.');

  const slugRequired = missing(slug, ['generateListingSlug', 'extractListingIdFromSlug', 'extractMlsIdFromSlug', 'isMlsIdSlug', 'internetAddressDisplayYN', 'listing-']);
  const pageRequired = missing(pageDetailRoute, ['extractListingIdFromSlug', 'extractMlsIdFromSlug', 'parseAddressSlug', 'generateListingSlug']);
  add('G-012', 'Public detail page supports canonical address slug plus fallback ID resolution', slugRequired.length || pageRequired.length ? 'FAIL' : 'PASS', slugRequired.length || pageRequired.length ? `slug missing=${slugRequired.join(', ') || 'none'} detail page missing=${pageRequired.join(', ') || 'none'}` : 'Slug helper and public detail page fallback/canonical anchors found.');

  const routeRequired = missing(listingRoute, ['filterDisplayableDbListings', 'annotateCoListedSiblings']);
  add('G-013', 'Public listing route applies display filtering and sibling annotation', routeRequired.length ? 'FAIL' : 'PASS', routeRequired.length ? `Missing listing route anchors: ${routeRequired.join(', ')}` : 'Public listing route display-filter/sibling anchors found.');

  add('G-014', 'Public API detail route remains ID-oriented while page route handles slugs', missing(apiDetailRoute, ['fetchSingleListing', 'checkDistributionGates', 'toPublicDTO']).length ? 'FAIL' : 'PASS', 'Validated API detail route separately from public page slug route to avoid false slug failures.');

  const baseUrl = process.env.SENTINEL_G_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (baseUrl) {
    for (const probe of ['/api/listings/suggest?q=SL-0004', '/api/listings/suggest?q=333%20E%2046', '/api/listings?address=333%20E%2046', '/listing/sl-0004']) {
      try {
        const result = await probePublicEndpoint(baseUrl, probe);
        const leaks = PUBLIC_FORBIDDEN_KEYS.filter((key) => result.body.includes(key));
        const fallbackDisplayed = probe !== '/listing/sl-0004' && result.body.includes('/listing/sl-0004');
        const fallbackRouteOk = probe === '/listing/sl-0004' ? [200, 301, 302, 307, 308, 404].includes(result.status) : result.status < 500;
        add('G-015', `Public endpoint probe ${probe}`, leaks.length || fallbackDisplayed || !fallbackRouteOk ? 'FAIL' : 'PASS', `status=${result.status}${result.location ? ` location=${result.location}` : ''}${leaks.length ? ` leaks=${leaks.join(',')}` : ''}${fallbackDisplayed ? ' fallback-url-displayed=true' : ''}`);
      } catch (err) {
        add('G-015', `Public endpoint probe ${probe}`, 'FAIL', err instanceof Error ? err.message : String(err));
      }
    }
  } else {
    add('G-015', 'Public endpoint probes', 'YELLOW', 'SENTINEL_G_BASE_URL or NEXT_PUBLIC_SITE_URL not set; endpoint probes skipped, not passed.');
  }

  const report: Report = { tool: 'Sentinel-G', status: overall(), generatedAt: new Date().toISOString(), mode, metadataHash, selectedFieldCount: selectedFields.length, metadataPropertyFieldCount: metadataFields.length, checks };
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${stamp}-report.json`);
  const mdPath = path.join(outDir, `${stamp}-report.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, `# Sentinel-G Report\n\nStatus: **${report.status}**\n\nGenerated: ${report.generatedAt}\n\nMode: ${report.mode}\n\nSelected fields: ${report.selectedFieldCount}\n\nMetadata Property fields: ${report.metadataPropertyFieldCount}\n\n| Code | Status | Check | Details |\n|---|---|---|---|\n${checks.map((c) => `| ${c.code} | ${c.status} | ${c.name} | ${c.details.replace(/\|/g, '\\|')} |`).join('\n')}\n`);

  console.log(`Sentinel-G status: ${report.status}`);
  console.log(`Mode: ${report.mode}`);
  console.log(`JSON report: ${path.relative(root, jsonPath)}`);
  console.log(`Markdown report: ${path.relative(root, mdPath)}`);
  for (const check of checks) console.log(`${check.status.padEnd(6)} ${check.code} ${check.name}`);
  if (report.status === 'FAIL') process.exit(1);
}

main().catch((err) => {
  add('G-999', 'Sentinel-G runner crashed', 'FAIL', err instanceof Error ? err.stack || err.message : String(err));
  const report: Report = { tool: 'Sentinel-G', status: 'FAIL', generatedAt: new Date().toISOString(), mode: 'static', metadataHash: null, selectedFieldCount: 0, metadataPropertyFieldCount: 0, checks };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${stamp}-report.json`), JSON.stringify(report, null, 2));
  console.error(err);
  process.exit(1);
});
