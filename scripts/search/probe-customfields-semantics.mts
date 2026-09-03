/**
 * SEMANTIC EVIDENCE for two observed CustomFields extension keys.
 *
 * A populated key name is NOT a proven meaning. `Concierge` is live and
 * populated and a concierge is still not a doorman — the same trap applies here.
 *
 *   MaximumFinancingPercent — is it the co-op financing rule? Break population
 *     and VALUES down by CommonInterest, detect sentinels, and test whether
 *     units in the SAME building agree. If they disagree it is not a building
 *     fact, whatever its name says.
 *
 *   AttendanceType — enumerate the actual value vocabulary and correlate with
 *     BuildingStaffType / AssociationAmenities / BuildingFeatures. Attach NO
 *     brokerage label here.
 *
 * These are OBSERVED EXTENSION KEYS inside a declared Edm.String, not
 * $metadata-declared fields. Nothing here promotes them.
 *
 * READ-ONLY. GET only. No Prisma, no Neon.
 */
import { getAccessToken } from '../../lib/idx/auth';
import { writeFileSync } from 'node:fs';

const API = process.env.TRESTLE_API_URL ?? 'https://api.cotality.com/trestle';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'semantics.json';
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

const ACTIVE = "StandardStatus eq 'Active'";
const SELECT = 'ListingId,CommonInterest,StreetNumber,StreetName,PostalCode,UnitNumber,BuildingName,AssociationAmenities,BuildingFeatures,PropertySubType';

type Row = {
  listingId: string; commonInterest: string; buildingKey: string;
  custom: Record<string, unknown>;
  associationAmenities: string; buildingFeatures: string;
};

const rows: Row[] = [];
let declared: number | null = null;
let url: string | null =
  `${API}/odata/Property?$filter=${encodeURIComponent(ACTIVE)}&$top=200&$count=true` +
  `&$select=${encodeURIComponent(SELECT)}&$expand=CustomProperty($select=CustomFields)`;

while (url) {
  const r = await get(url);
  if (!r || !r.ok) {
    console.error(`UNVERIFIED — aborted mid-pagination (HTTP ${r?.status ?? 'none'}). Not a zero result.`);
    process.exit(2);
  }
  const body = (await r.json()) as Record<string, unknown>;
  if (declared === null) declared = (body['@odata.count'] as number) ?? null;
  for (const row of (body.value as Array<Record<string, unknown>>) ?? []) {
    const cp = row.CustomProperty as Array<Record<string, unknown>> | undefined;
    let custom: Record<string, unknown> = {};
    const blob = cp && cp.length ? (cp[0].CustomFields as string | null) : null;
    if (blob) { try { custom = JSON.parse(blob); } catch { custom = {}; } }
    rows.push({
      listingId: String(row.ListingId),
      commonInterest: String(row.CommonInterest ?? '(null)'),
      // Building identity proxy: street address + zip. UnitNumber excluded on purpose.
      buildingKey: `${row.StreetNumber ?? ''}|${row.StreetName ?? ''}|${row.PostalCode ?? ''}`.toUpperCase(),
      custom,
      associationAmenities: String(row.AssociationAmenities ?? ''),
      buildingFeatures: String(row.BuildingFeatures ?? ''),
    });
  }
  url = (body['@odata.nextLink'] as string) ?? null;
  await sleep(180);
}

// ── MaximumFinancingPercent ─────────────────────────────────────────────────
const byCI: Record<string, { rowsWithKey: number; totalRows: number; values: Record<string, number> }> = {};
for (const r of rows) {
  const ci = r.commonInterest;
  byCI[ci] ??= { rowsWithKey: 0, totalRows: 0, values: {} };
  byCI[ci].totalRows++;
  const raw = r.custom.MaximumFinancingPercent;
  if (raw === undefined) continue;
  byCI[ci].rowsWithKey++;
  const v = String(raw);
  byCI[ci].values[v] = (byCI[ci].values[v] ?? 0) + 1;
}
for (const ci of Object.keys(byCI)) {
  byCI[ci].values = Object.fromEntries(Object.entries(byCI[ci].values).sort((a, b) => b[1] - a[1]).slice(0, 15));
}

/** Do units in the SAME building agree? If not, it is not a building fact. */
const buildings = new Map<string, Set<string>>();
for (const r of rows) {
  const v = r.custom.MaximumFinancingPercent;
  if (v === undefined || !r.buildingKey.replace(/\|/g, '')) continue;
  if (!buildings.has(r.buildingKey)) buildings.set(r.buildingKey, new Set());
  buildings.get(r.buildingKey)!.add(String(v));
}
const multiUnit = [...buildings.entries()].filter(([, s]) => s.size >= 1);
const disagreeing = [...buildings.entries()].filter(([, s]) => s.size > 1);

// ── AttendanceType — vocabulary only, NO label attached ─────────────────────
const attendanceTokens: Record<string, number> = {};
const attendanceRaw: Record<string, number> = {};
for (const r of rows) {
  const v = r.custom.AttendanceType;
  if (v === undefined) continue;
  const s = String(v);
  attendanceRaw[s] = (attendanceRaw[s] ?? 0) + 1;
  for (const tok of s.split(',').map((t) => t.trim()).filter(Boolean)) {
    attendanceTokens[tok] = (attendanceTokens[tok] ?? 0) + 1;
  }
}

/** Correlate the two most common tokens with declared amenity vocabularies. */
function correlate(token: string) {
  const withTok = rows.filter((r) => String(r.custom.AttendanceType ?? '').split(',').map((t) => t.trim()).includes(token));
  const amenityHit = withTok.filter((r) => /Doorman|Concierge/i.test(r.associationAmenities + ' ' + r.buildingFeatures)).length;
  const staff: Record<string, number> = {};
  for (const r of withTok) {
    const s = String(r.custom.BuildingStaffType ?? '(absent)');
    staff[s] = (staff[s] ?? 0) + 1;
  }
  return { token, rows: withTok.length, alsoDoormanOrConciergeInDeclaredAmenities: amenityHit, buildingStaffType: staff };
}

const out = {
  probedAt: new Date().toISOString(),
  api: API,
  coverage: { rowsRead: rows.length, providerDeclaredActive: declared, complete: declared !== null && rows.length >= declared },
  maximumFinancingPercent: {
    byCommonInterest: byCI,
    buildingAgreement: {
      buildingsSeen: multiUnit.length,
      buildingsWithDisagreeingValues: disagreeing.length,
      examples: disagreeing.slice(0, 10).map(([k, s]) => ({ building: k, values: [...s] })),
    },
  },
  attendanceType: {
    distinctRawValues: Object.keys(attendanceRaw).length,
    topRawValues: Object.fromEntries(Object.entries(attendanceRaw).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    tokenVocabulary: Object.fromEntries(Object.entries(attendanceTokens).sort((a, b) => b[1] - a[1])),
    correlation: [correlate('DoormanFullTime'), correlate('ConciergeFullTime'), correlate('None')],
  },
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 9000));
