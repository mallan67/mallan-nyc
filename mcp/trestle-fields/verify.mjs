/**
 * verify.mjs — reproducible proof that the fixed parser reads the LIVE Cotality $metadata.
 *
 * Mirrors the parse config in index.ts (multi-schema + NavigationProperty). Prints the parse
 * facts and asserts the expected shape. Exit 0 = all checks pass.
 *
 * Run (secrets come from env — never hardcode):
 *   IDX_CLIENT_ID=… IDX_CLIENT_SECRET=… node mcp/trestle-fields/verify.mjs
 */
import { XMLParser } from './node_modules/fast-xml-parser/src/fxp.js';

const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function token() {
  const b = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.IDX_CLIENT_ID, client_secret: process.env.IDX_CLIENT_SECRET, scope: 'api' });
  const r = await fetch(BASE + '/oidc/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() });
  if (!r.ok) throw new Error('token ' + r.status);
  return (await r.json()).access_token;
}

const run = async () => {
  console.log('LIVE HOST:', BASE);
  if (!/api\.cotality\.com\/trestle/.test(BASE)) { console.error('✗ not the live Cotality host'); process.exit(1); }

  const t = await token();
  const xml = await (await fetch(BASE + '/odata/$metadata', { headers: { Authorization: 'Bearer ' + t } })).text();

  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_', allowBooleanAttributes: true, parseAttributeValue: true,
    isArray: (n) => ['Schema', 'Property', 'NavigationProperty', 'EnumType', 'Member', 'EntityType', 'Annotation'].includes(n),
  });
  const raw = parser.parse(xml)['edmx:Edmx']['edmx:DataServices']['Schema'];
  const schemas = Array.isArray(raw) ? raw : [raw];

  const byResource = new Map(), navs = new Map(), enums = new Map();
  for (const s of schemas) {
    for (const et of (s['EntityType'] || [])) {
      byResource.set(et['@_Name'], (et['Property'] || []).map((p) => p['@_Name']));
      navs.set(et['@_Name'], (et['NavigationProperty'] || []).map((n) => n['@_Name']));
    }
    for (const en of (s['EnumType'] || [])) enums.set(en['@_Name'], (en['Member'] || []).map((m) => m['@_Name']));
  }

  const propFields = byResource.get('Property') || [];
  const ss = enums.get('StandardStatus') || [];
  const propNav = navs.get('Property') || [];
  const expectedSub = ['Media', 'Building', 'Rooms', 'UnitTypes', 'CustomProperty', 'OpenHouse', 'ListAgent', 'ListOffice'];

  const checks = [
    ['schemas parsed = 5', schemas.length === 5, schemas.length],
    ['resources parsed = 17', byResource.size === 17, byResource.size],
    ['enums parsed = 181', enums.size === 181, enums.size],
    ['Property scalar fields = 755', propFields.length === 755, propFields.length],
    ['Property.StandardStatus found', propFields.includes('StandardStatus'), propFields.includes('StandardStatus')],
    ['Property.ListingId found', propFields.includes('ListingId'), propFields.includes('ListingId')],
    ['StandardStatus enum found (11)', ss.length === 11, ss.length],
    ['Property subsections present', expectedSub.every((s) => propNav.includes(s)), propNav.join(',')],
  ];

  console.log('\n=== live Cotality $metadata parse (fixed multi-schema + NavigationProperty) ===');
  let ok = true;
  for (const [label, pass, got] of checks) { console.log(`  ${pass ? '✓' : '✗'} ${label}  (got: ${got})`); if (!pass) ok = false; }
  console.log('\n  StandardStatus enum:', ss.join(', '));
  console.log('  Property subsections ($expand):', propNav.join(', '));
  console.log(ok ? '\nALL CHECKS PASS' : '\nCHECKS FAILED');
  process.exit(ok ? 0 : 1);
};
run().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
