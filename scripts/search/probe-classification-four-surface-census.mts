/**
 * FOUR-SURFACE ID-LEVEL CENSUS — Townhouse · Multi-Family · Land.
 *
 * CORRECTS an incomplete census. The first pass compared only PropertySubType
 * and StructureType and omitted PropertySubTypeAdditional entirely, which means
 * "StructureType carries Townhouse" was never proven EXCLUSIVE and
 * "Land is genuinely absent" was never proven at all.
 *
 * Live Cotality exposes each concept through up to FOUR dimensions:
 *   PropertyType                (scalar enum   — transaction/inventory class)
 *   PropertySubType             (scalar enum   — primary subtype)
 *   PropertySubTypeAdditional   (MULTI enum    — additional subtype)
 *   StructureType               (MULTI enum    — structural form)
 *
 * A field carrying the token `MultiFamily` is NOT proof it expresses the broker
 * concept Multi-Family; the four describe different dimensions. This measures.
 * It does not decide the business criterion.
 *
 * Set algebra is done at ListingId level so overlap and exclusivity are real
 * intersections, not inferred from counts.
 *
 * READ-ONLY. GET only. No Prisma, no Neon.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { writeFileSync } from 'node:fs';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'four-surface.json';
const token = await getAccessToken();
const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string) {
  for (let a = 0; a < 5; a++) {
    let r: Response;
    try { r = await fetch(url, { headers: auth }); } catch { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
    return r;
  }
  return null;
}

const CTX = [
  'ListingId', 'PropertyType', 'PropertySubType', 'PropertySubTypeAdditional', 'StructureType',
  'CommonInterest', 'StandardStatus', 'PropertyAttachedYN', 'BedroomsTotal', 'NumberOfUnitsTotal',
  'StreetNumber', 'StreetName', 'CityRegion', 'PostalCode', 'YearBuilt', 'LivingArea', 'ListPrice',
].join(',');

type Row = Record<string, unknown>;
type SetResult = { label: string; filter: string; state: string; declared: number | null; rows: Row[] };

/** Page a filter to exhaustion, collecting context rows. Aborts loud. */
async function collect(label: string, filter: string, cap = 4000): Promise<SetResult> {
  let url: string | null =
    `${API}/odata/Property?$filter=${encodeURIComponent(filter)}&$top=200&$count=true&$select=${encodeURIComponent(CTX)}`;
  const rows: Row[] = [];
  let declared: number | null = null;

  while (url && rows.length < cap) {
    const r = await get(url);
    if (!r) return { label, filter, state: 'UNVERIFIED: no response', declared, rows };
    if (!r.ok) {
      const body = (await r.text()).slice(0, 200);
      return { label, filter, state: `PROVIDER_REJECTED ${r.status}: ${body}`, declared, rows };
    }
    const body = (await r.json()) as Record<string, unknown>;
    if (declared === null) declared = (body['@odata.count'] as number) ?? null;
    for (const row of (body.value as Row[]) ?? []) rows.push(row);
    url = (body['@odata.nextLink'] as string) ?? null;
    await sleep(160);
  }
  const complete = declared !== null && rows.length >= declared;
  return { label, filter, state: complete ? 'SUPPORTED (complete)' : `SUPPORTED (capped at ${rows.length}/${declared})`, declared, rows };
}

const ACTIVE = "StandardStatus eq 'Active'";
const NS_SUBTYPE_ADDL = 'Cotality.DataStandard.Cotality.DD.Enums.Multi.PropertySubTypeAdditional';
const NS_STRUCTURE = 'Cotality.DataStandard.Cotality.DD.Enums.Multi.StructureType';

/** All four surfaces for one token, scoped to Active. */
function surfaces(token: string): Array<[string, string]> {
  return [
    [`PropertyType eq '${token}'`, `${ACTIVE} and PropertyType eq '${token}'`],
    [`PropertySubType eq '${token}'`, `${ACTIVE} and PropertySubType eq '${token}'`],
    [`PropertySubTypeAdditional has '${token}'`, `${ACTIVE} and PropertySubTypeAdditional has ${NS_SUBTYPE_ADDL}'${token}'`],
    [`StructureType has '${token}'`, `${ACTIVE} and StructureType has ${NS_STRUCTURE}'${token}'`],
  ];
}

const concepts: Record<string, Array<[string, string]>> = {
  Townhouse: surfaces('Townhouse'),
  MultiFamily: surfaces('MultiFamily'),
  // Land is spread across DIFFERENT tokens per surface, so it is enumerated
  // explicitly rather than by one token name.
  Land: [
    ['PropertyType eq Land', `${ACTIVE} and PropertyType eq 'Land'`],
    ['PropertySubType eq Land', `${ACTIVE} and PropertySubType eq 'Land'`],
    ['PropertySubType eq UnimprovedLand', `${ACTIVE} and PropertySubType eq 'UnimprovedLand'`],
    ['PropertySubType eq ImprovedLand', `${ACTIVE} and PropertySubType eq 'ImprovedLand'`],
    ['PropertySubTypeAdditional has Land', `${ACTIVE} and PropertySubTypeAdditional has ${NS_SUBTYPE_ADDL}'Land'`],
    ['PropertySubTypeAdditional has UnimprovedLand', `${ACTIVE} and PropertySubTypeAdditional has ${NS_SUBTYPE_ADDL}'UnimprovedLand'`],
    ['PropertySubTypeAdditional has ImprovedLand', `${ACTIVE} and PropertySubTypeAdditional has ${NS_SUBTYPE_ADDL}'ImprovedLand'`],
    ['ALL-STATUS PropertyType eq Land', `PropertyType eq 'Land'`],
    ['ALL-STATUS PropertySubTypeAdditional has Land', `PropertySubTypeAdditional has ${NS_SUBTYPE_ADDL}'Land'`],
    ['ALL-STATUS PropertySubTypeAdditional has UnimprovedLand', `PropertySubTypeAdditional has ${NS_SUBTYPE_ADDL}'UnimprovedLand'`],
    ['ALL-STATUS PropertySubTypeAdditional has ImprovedLand', `PropertySubTypeAdditional has ${NS_SUBTYPE_ADDL}'ImprovedLand'`],
  ],
};

const out: Record<string, unknown> = { probedAt: new Date().toISOString(), api: API };

for (const [concept, defs] of Object.entries(concepts)) {
  const sets: Record<string, SetResult> = {};
  for (const [label, filter] of defs) {
    sets[label] = await collect(label, filter);
  }

  const idSets: Record<string, Set<string>> = {};
  for (const [label, r] of Object.entries(sets)) {
    idSets[label] = new Set(r.rows.map((x) => String(x.ListingId)));
  }

  const labels = Object.keys(idSets);
  const pairwise: Record<string, number> = {};
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = idSets[labels[i]], b = idSets[labels[j]];
      pairwise[`${labels[i]} ∩ ${labels[j]}`] = [...a].filter((x) => b.has(x)).length;
    }
  }

  const union = new Set<string>();
  for (const s of Object.values(idSets)) for (const id of s) union.add(id);

  const exclusive: Record<string, number> = {};
  for (const label of labels) {
    const others = labels.filter((l) => l !== label);
    exclusive[label] = [...idSets[label]].filter((id) => !others.some((o) => idSets[o].has(id))).length;
  }

  const allFour = [...union].filter((id) => labels.every((l) => idSets[l].has(id))).length;

  /** Context distribution across the union, so semantics can be reviewed. */
  const byId = new Map<string, Row>();
  for (const r of Object.values(sets)) for (const row of r.rows) byId.set(String(row.ListingId), row);
  const dist = (field: string) => {
    const m: Record<string, number> = {};
    for (const id of union) {
      const v = String(byId.get(id)?.[field] ?? '(null)');
      m[v] = (m[v] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  };

  out[concept] = {
    sets: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, { state: v.state, declared: v.declared, collected: v.rows.length }])),
    pairwiseOverlap: pairwise,
    presentInEverySurface: allFour,
    unionCount: union.size,
    exclusiveToEachSurface: exclusive,
    context: {
      PropertyType: dist('PropertyType'),
      PropertySubType: dist('PropertySubType'),
      PropertySubTypeAdditional: dist('PropertySubTypeAdditional'),
      StructureType: dist('StructureType'),
      CommonInterest: dist('CommonInterest'),
      PropertyAttachedYN: dist('PropertyAttachedYN'),
      NumberOfUnitsTotal: dist('NumberOfUnitsTotal'),
    },
    representatives: [...union].slice(0, 12).map((id) => {
      const r = byId.get(id)!;
      return {
        ListingId: r.ListingId,
        address: `${r.StreetNumber ?? ''} ${r.StreetName ?? ''}`.trim(),
        borough: r.CityRegion, zip: r.PostalCode, yearBuilt: r.YearBuilt,
        units: r.NumberOfUnitsTotal, beds: r.BedroomsTotal, price: r.ListPrice,
        PropertyType: r.PropertyType, PropertySubType: r.PropertySubType,
        PropertySubTypeAdditional: r.PropertySubTypeAdditional, StructureType: r.StructureType,
        CommonInterest: r.CommonInterest, PropertyAttachedYN: r.PropertyAttachedYN,
      };
    }),
  };
}

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, (k, v) => (k === 'representatives' ? `[${(v as unknown[]).length} rows in artifact]` : v), 2).slice(0, 14000));
