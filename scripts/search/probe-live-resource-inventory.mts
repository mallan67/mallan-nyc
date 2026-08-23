/**
 * LIVE COTALITY COTALITYURCE / FIELD INVENTORY — the coverage-matrix foundation.
 *
 * Extracts EVERY entity type, EVERY declared field with its type, EVERY enum
 * vocabulary and EVERY navigation property from live `$metadata`, mechanically.
 * Nothing here is hand-summarised — hand-summarising an inventory is how the
 * "29 controls" error happened.
 *
 * This is a DECLARATION inventory. `$metadata` OVER-DECLARES what the licence
 * grants (CLAUDE.md §A.0), so a declaration is NOT capability proof: each field
 * still needs an endpoint probe before anything relies on it. The output marks
 * every row accordingly.
 *
 * READ-ONLY. GET only. api.cotality.com only. No Prisma import, no Neon.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { writeFileSync } from 'node:fs';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'inventory.json';

const token = await getAccessToken();
const res = await fetch(`${API}/odata/$metadata`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
});
if (!res.ok) {
  console.error(`UNVERIFIED — $metadata unreachable (HTTP ${res.status}). Inventory NOT built.`);
  process.exit(2);
}
const meta = await res.text();

/** Every EnumType in the document, by fully-qualified name. */
const enums: Record<string, { isMulti: boolean; members: string[] }> = {};
for (const m of meta.matchAll(/<EnumType Name="([^"]+)"[^>]*>/g)) {
  const start = m.index ?? 0;
  const block = meta.slice(start, meta.indexOf('</EnumType>', start));
  const members = [...block.matchAll(/<Member Name="([^"]+)"/g)].map((x) => x[1]);
  // The namespace is carried on the containing Schema; `.Multi.` is what marks a
  // multi-enum on this feed, NOT a Collection() wrapper.
  const before = meta.slice(0, start);
  const schemaMatch = [...before.matchAll(/<Schema Namespace="([^"]+)"/g)].pop();
  const ns = schemaMatch ? schemaMatch[1] : '';
  enums[`${ns}.${m[1]}`] = { isMulti: ns.includes('.Enums.Multi'), members };
}

type FieldRow = {
  resource: string;
  field: string;
  edmType: string;
  kind: 'scalar' | 'enum' | 'multi_enum' | 'collection';
  enumType: string | null;
  memberCount: number | null;
  capability: 'DECLARED_ONLY';
};

const rows: FieldRow[] = [];
const resources: Record<string, { fieldCount: number; navigation: Array<{ name: string; type: string }> }> = {};

for (const m of meta.matchAll(/<EntityType Name="([^"]+)"[^>]*>/g)) {
  const resource = m[1];
  const start = m.index ?? 0;
  const block = meta.slice(start, meta.indexOf('</EntityType>', start));

  const navigation = [...block.matchAll(/<NavigationProperty Name="([^"]+)" Type="([^"]+)"/g)]
    .map((n) => ({ name: n[1], type: n[2] }));

  let fieldCount = 0;
  for (const p of block.matchAll(/<Property Name="([^"]+)" Type="([^"]+)"/g)) {
    fieldCount++;
    const edmType = p[2];
    const isCollection = edmType.startsWith('Collection(');
    const bare = isCollection ? edmType.slice(11, -1) : edmType;
    const declaredEnum = enums[bare];

    rows.push({
      resource,
      field: p[1],
      edmType,
      kind: declaredEnum
        ? (declaredEnum.isMulti ? 'multi_enum' : 'enum')
        : (isCollection ? 'collection' : 'scalar'),
      enumType: declaredEnum ? bare : null,
      memberCount: declaredEnum ? declaredEnum.members.length : null,
      // Declaration is never capability. Every row starts here.
      capability: 'DECLARED_ONLY',
    });
  }
  resources[resource] = { fieldCount, navigation };
}

const inventory = {
  probedAt: new Date().toISOString(),
  api: API,
  caveat:
    '$metadata OVER-DECLARES what the licence grants. Every row is DECLARED_ONLY until an ' +
    'endpoint probe proves it. A declaration is not capability proof (CLAUDE.md A.0).',
  resources,
  enums,
  fields: rows,
};

writeFileSync(OUT, JSON.stringify(inventory, null, 2));

const byResource = Object.entries(resources)
  .map(([k, v]) => `${k}=${v.fieldCount}`)
  .sort();
console.log(JSON.stringify({
  totalEntityTypes: Object.keys(resources).length,
  totalFields: rows.length,
  totalEnums: Object.keys(enums).length,
  multiEnums: Object.values(enums).filter((e) => e.isMulti).length,
  fieldsByResource: byResource,
  propertyNavigation: resources['Property']?.navigation.map((n) => n.name) ?? [],
  propertyKindBreakdown: rows
    .filter((r) => r.resource === 'Property')
    .reduce<Record<string, number>>((acc, r) => { acc[r.kind] = (acc[r.kind] ?? 0) + 1; return acc; }, {}),
}, null, 2));
