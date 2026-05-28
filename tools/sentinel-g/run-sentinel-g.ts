import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type Status = 'PASS' | 'YELLOW' | 'FAIL';

type Check = {
  code: string;
  name: string;
  status: Status;
  details: string;
};

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const outDir = path.join(root, 'ops', 'audit', 'sentinel-g');

const requiredFiles = [
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
  'lib/search/public-listing-db.ts',
  'lib/search/public-listing-trestle.ts',
  'data/rebny-rls-property-fields.csv',
  'data/rebny-rls-property-lookup.csv',
  'data/RLS-FIELD-REGISTRY.md',
  'artifacts/metadata.xml',
];

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

function includesAll(content: string, needles: string[]): string[] {
  return needles.filter((needle) => !content.includes(needle));
}

const checks: Check[] = [];

function add(code: string, name: string, status: Status, details: string) {
  checks.push({ code, name, status, details });
}

const missingFiles = requiredFiles.filter((file) => !exists(file));
add(
  'G-000',
  'Required Sentinel-G source files exist',
  missingFiles.length === 0 ? 'PASS' : 'FAIL',
  missingFiles.length === 0 ? `${requiredFiles.length} required files found.` : `Missing: ${missingFiles.join(', ')}`,
);

const mapper = exists('lib/idx/trestle-mapper.ts') ? read('lib/idx/trestle-mapper.ts') : '';
const publicDto = exists('lib/idx/public-dto.ts') ? read('lib/idx/public-dto.ts') : '';
const dbDto = exists('lib/idx/db-to-public-dto.ts') ? read('lib/idx/db-to-public-dto.ts') : '';
const fetchTs = exists('lib/idx/fetch.ts') ? read('lib/idx/fetch.ts') : '';
const suggest = exists('app/api/listings/suggest/route.ts') ? read('app/api/listings/suggest/route.ts') : '';
const listingRoute = exists('app/api/listings/route.ts') ? read('app/api/listings/route.ts') : '';
const slug = exists('lib/listing-slug.ts') ? read('lib/listing-slug.ts') : '';
const metadata = exists('artifacts/metadata.xml') ? read('artifacts/metadata.xml') : '';

const mapperMissing = includesAll(mapper, [
  'RESO_TO_RLS_RENAMES',
  'SourceSystemKey',
  'ListingKey',
  'ListingId',
  'IDX_PLUS_SELECT_FIELDS',
  'computeGateColumns',
  'InternetEntireListingDisplayYN',
  'InternetAddressDisplayYN',
  'Permission',
]);
add(
  'G-001',
  'Mapper contains required Trestle/IDX contract anchors',
  mapperMissing.length === 0 ? 'PASS' : 'FAIL',
  mapperMissing.length === 0 ? 'Mapper anchors found.' : `Missing mapper anchors: ${mapperMissing.join(', ')}`,
);

const metadataHash = metadata
  ? crypto.createHash('sha256').update(metadata).digest('hex')
  : null;
add(
  'G-002',
  'Static metadata artifact is present',
  metadataHash ? 'PASS' : 'YELLOW',
  metadataHash ? `artifacts/metadata.xml sha256=${metadataHash}` : 'No static metadata artifact found; live metadata check required.',
);

const fetchMissing = includesAll(fetchTs, [
  'TRESTLE_API_URL',
  'api.cotality.com/trestle',
  'getAccessToken',
  'IDX_PLUS_SELECT_FIELDS',
  'expandMedia',
  'expandCustomProperty',
  'fetchSingleListing',
]);
add(
  'G-003',
  'Trestle fetch client has required auth/select/expand guards',
  fetchMissing.length === 0 ? 'PASS' : 'FAIL',
  fetchMissing.length === 0 ? 'Fetch anchors found.' : `Missing fetch anchors: ${fetchMissing.join(', ')}`,
);

const publicLeakFields = [
  'PrivateRemarks',
  'ShowingInstructions',
  'ShowingContactPhone',
  'ShowingContactName',
  'LockBox',
  'ListAgentEmail',
  'ListAgentDirectPhone',
  'owner_client_id',
];
const publicDtoMissing = includesAll(publicDto, [
  'Stripping private remarks',
  'Stripping agent PII',
  'Suppressing address',
  '_displayCompliance',
  'requiresAttribution',
  'attributionText',
  'disclaimerRequired',
]);
add(
  'G-004',
  'Public DTO declares privacy, address-suppression, and attribution contract',
  publicDtoMissing.length === 0 ? 'PASS' : 'FAIL',
  publicDtoMissing.length === 0 ? 'Public DTO contract anchors found.' : `Missing public DTO anchors: ${publicDtoMissing.join(', ')}`,
);

const dbDtoMissing = includesAll(dbDto, [
  'classifyDbListing',
  'mallan-exclusive',
  'third-party-idx',
  'website-only',
  'filterDisplayableDbListings',
  'owner_client_id',
  'agent_id',
  'rls_eligible',
]);
add(
  'G-005',
  'DB DTO classifies Mallan exclusive vs third-party IDX vs website-only',
  dbDtoMissing.length === 0 ? 'PASS' : 'FAIL',
  dbDtoMissing.length === 0 ? 'DB DTO classification anchors found.' : `Missing DB DTO anchors: ${dbDtoMissing.join(', ')}`,
);

const suggestMissing = includesAll(suggest, [
  'checkDistributionGates',
  'isAddressDisplayablePerSuggest',
  'SUGGEST_SELECT_FIELDS',
  'ListingId',
  'ListingKey',
  'InternetAddressDisplayYN',
  'InternetEntireListingDisplayYN',
]);
add(
  'G-006',
  'Suggest route enforces identity and display gates',
  suggestMissing.length === 0 ? 'PASS' : 'FAIL',
  suggestMissing.length === 0 ? 'Suggest gate anchors found.' : `Missing suggest anchors: ${suggestMissing.join(', ')}`,
);

const slugMissing = includesAll(slug, ['generateListingSlug', 'listing-', 'streetNumber', 'postalCode']);
add(
  'G-007',
  'Slug generator exists for canonical URL checks',
  slugMissing.length === 0 ? 'PASS' : 'FAIL',
  slugMissing.length === 0 ? 'Slug generator anchors found.' : `Missing slug anchors: ${slugMissing.join(', ')}`,
);

const listingRouteMissing = includesAll(listingRoute, ['annotateCoListedSiblings', 'filterDisplayableDbListings']);
add(
  'G-008',
  'Listings route uses public DTO/display filtering anchors',
  listingRouteMissing.length === 0 ? 'PASS' : 'FAIL',
  listingRouteMissing.length === 0 ? 'Listings route anchors found.' : `Missing route anchors: ${listingRouteMissing.join(', ')}`,
);

const liveEnvPresent = Boolean(
  process.env.TRESTLE_API_URL ||
  process.env.IDX_ENDPOINT ||
  process.env.TRESTLE_CLIENT_ID ||
  process.env.TRESTLE_CLIENT_SECRET ||
  process.env.IDX_CLIENT_ID ||
  process.env.IDX_CLIENT_SECRET,
);
add(
  'G-009',
  'Live Trestle/Cotality trigger readiness',
  liveEnvPresent ? 'YELLOW' : 'YELLOW',
  liveEnvPresent
    ? 'Trestle/Cotality env vars appear present; this runner currently performs static validation only. Live metadata probe must be added before marking live checks PASS.'
    : 'No Trestle/Cotality env vars detected; live checks skipped, not passed.',
);

const hardFail = checks.some((check) => check.status === 'FAIL');
const status: Status = hardFail ? 'FAIL' : checks.some((check) => check.status === 'YELLOW') ? 'YELLOW' : 'PASS';

const report = {
  tool: 'Sentinel-G',
  status,
  generatedAt: new Date().toISOString(),
  mode: 'static',
  metadataHash,
  requiredFiles,
  checks,
};

fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, `${stamp}-report.json`);
const mdPath = path.join(outDir, `${stamp}-report.md`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(
  mdPath,
  `# Sentinel-G Report\n\nStatus: **${status}**\n\nGenerated: ${report.generatedAt}\n\nMode: static\n\n` +
    `| Code | Status | Check | Details |\n|---|---|---|---|\n` +
    checks.map((c) => `| ${c.code} | ${c.status} | ${c.name} | ${c.details.replace(/\|/g, '\\|')} |`).join('\n') +
    '\n',
);

console.log(`Sentinel-G status: ${status}`);
console.log(`JSON report: ${path.relative(root, jsonPath)}`);
console.log(`Markdown report: ${path.relative(root, mdPath)}`);
for (const check of checks) {
  console.log(`${check.status.padEnd(6)} ${check.code} ${check.name}`);
}

if (hardFail) {
  process.exit(1);
}
