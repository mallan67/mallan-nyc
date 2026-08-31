/**
 * GENERATE the canonical neighbourhood identity contract from the FULL live feed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A NEIGHBOURHOOD NAME ALONE IS NOT AN IDENTITY
 *
 * The full-feed census disproved global uniqueness: 124 of 632 folded names span
 * more than one CityRegion. The first response was a 95% dominance threshold that
 * assigned a borough for display and left `borough: null` otherwise — which fixed
 * nothing and broke two things:
 *
 *   - `Downtown Brooklyn` (6,401 Brooklyn / 586 Manhattan = 91.6%) and `Midwood`
 *     fell under the threshold, so the autocomplete loader's `if (!label) return`
 *     dropped them and two major neighbourhoods became unselectable;
 *   - the Map called `selectNeighborhood(name, borough, !borough, …)`, so a null
 *     borough marked a NEIGHBOURHOOD as BOROUGH-LEVEL — recreating the widening
 *     defect it was meant to remove.
 *
 * And execution still emitted `SubdivisionName eq '…'` alone, so the system knew
 * the name was not globally unique and searched as though it were.
 *
 * IDENTITY IS NOW (borough × normalised name), AND THE BOROUGH EXECUTES. Every
 * identity has a borough; none is null. The predicate becomes
 * `CityRegion eq <borough> and (SubdivisionName eq <spelling> or …)`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO PLACES, OR ONE PLACE MIS-TAGGED?
 *
 * The counts cannot tell you. `Bay Terrace` is 42 Queens / 17 Staten Island and
 * there genuinely IS one of each. `Downtown Brooklyn` is 6,401 Brooklyn / 586
 * Manhattan and there is no Downtown Brooklyn in Manhattan — that is provider
 * error. Both look identical to a threshold.
 *
 * So it is a MALLAN DECISION, declared explicitly below, which the executor then
 * enforces. A name not listed there resolves to its dominant borough, and the
 * minority rows are excluded by the CityRegion term — which is the point: they
 * are mis-tagged, and a broker asking for Downtown Brooklyn is asking for
 * Brooklyn. Every exclusion is written to an artifact so the decision is visible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCEPT vs OFFER
 *
 *   ACCEPT — every identity, shipped to BOTH server and browser. The browser needs
 *            it to restore a Saved Search: `Union Square` is valid and searchable
 *            but not offered, and a browser holding only the OFFER set told the
 *            broker it "is no longer available to search" and dropped it.
 *   OFFER  — the subset shown in autocomplete, carried as a FLAG rather than by
 *            omission.
 *
 * Run: node scripts/search/generate-neighborhood-identities.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FULL = 'artifacts/subdivision-full-feed-2026-08-31.json';
const ONMARKET = 'artifacts/section5-closure-probe-2026-08-31.json';
const TS_OUT = 'lib/search/canonical/subdivision-vocabulary.generated.ts';
const JSON_OUT = 'public/crm/data/neighborhood-vocabulary.generated.json';
const EXCLUSIONS_OUT = 'artifacts/neighborhood-minority-borough-exclusions.json';

const full = JSON.parse(readFileSync(resolve(REPO, FULL), 'utf8'));
const onmkt = JSON.parse(readFileSync(resolve(REPO, ONMARKET), 'utf8'));

if (full.complete !== true) throw new Error('REFUSING: the full-feed read was truncated');
if (!Array.isArray(full.identities) || full.identities.length < 400) {
  throw new Error(`REFUSING: only ${full.identities?.length ?? 0} identities — evidence looks wrong`);
}
if (onmkt.neighborhood?.complete !== true) throw new Error('REFUSING: the on-market read was truncated');

/**
 * NAMES MALLAN DECLARES TO BE MORE THAN ONE PLACE.
 *
 * A Mallan product decision about NYC geography, not a Cotality fact — the feed
 * cannot distinguish "two places share a name" from "one place is mis-tagged".
 *
 * `Bay Terrace` is the only case the evidence and NYC reality both support: there
 * is a Bay Terrace in Queens and another in Staten Island. Every other split in
 * the census is provider error (Downtown Brooklyn tagged Manhattan), a one-place
 * boundary quirk (Marble Hill is legally Manhattan and physically attached to the
 * Bronx), a borough name used as a neighbourhood, or somewhere outside NYC
 * altogether (Hoboken, Yonkers, Catskill).
 *
 * Adding an entry here is Maya's call; the other 23 splits are reported, not
 * guessed at.
 */
const MULTI_BOROUGH_PLACES = {
  bayterrace: ['Queens', 'StatenIsland'],
};

/** PRESENTATION LABELS — Mallan naming, keyed by folded identity. */
const LABEL_OVERRIDES = {
  soho: 'SoHo', noho: 'NoHo', dumbo: 'DUMBO', nomad: 'NoMad',
  midtown: 'Midtown', nolita: 'Nolita', tribeca: 'Tribeca',
};

/** Provider CityRegion value -> the label a broker reads. */
const BOROUGH_LABELS = {
  Manhattan: 'Manhattan', Brooklyn: 'Brooklyn', Queens: 'Queens',
  Bronx: 'Bronx', StatenIsland: 'Staten Island',
};

const onMarketNames = new Set((onmkt.neighborhood.values ?? []).map((v) => v.name));

const identities = [];
const droppedMinority = [];

for (const i of full.identities) {
  const counts = Object.entries(i.boroughs ?? {}).sort((a, b) => b[1] - a[1]);
  if (counts.length === 0) continue;             // no borough evidence at all
  const spellings = i.spellings.map((s) => s.value);
  const base = LABEL_OVERRIDES[i.folded] ?? i.commonestSpelling;
  const declared = MULTI_BOROUGH_PLACES[i.folded];

  // A DECLARED multi-place name becomes one identity per borough, each labelled
  // with its borough so a single wire value stays unambiguous.
  const boroughs = declared
    ? counts.filter(([b]) => declared.includes(b)).map(([b]) => b)
    : [counts[0][0]];

  if (!declared && counts.length > 1) {
    const total = counts.reduce((s, [, n]) => s + n, 0);
    droppedMinority.push({
      name: base,
      resolvedTo: counts[0][0],
      keptRows: counts[0][1],
      keptShare: Number((counts[0][1] / total).toFixed(4)),
      excludedRowsByBorough: Object.fromEntries(counts.slice(1)),
    });
  }

  for (const borough of boroughs) {
    identities.push({
      folded: i.folded,
      label: declared ? `${base}, ${BOROUGH_LABELS[borough] ?? borough}` : base,
      spellings,
      rows: declared ? (i.boroughs[borough] ?? 0) : i.rows,
      borough,
      boroughLabel: BOROUGH_LABELS[borough] ?? borough,
      offered: spellings.some((s) => onMarketNames.has(s)),
    });
  }
}
identities.sort((a, b) => a.label.localeCompare(b.label));
const offered = identities.filter((i) => i.offered);

// GUARD THE GUARDS. Each of these caught a real defect during development.
if (offered.length < 150) throw new Error(`REFUSING: only ${offered.length} offered identities`);
if (identities.some((i) => !i.borough)) {
  throw new Error('REFUSING: an identity has no borough — a null borough is the defect being removed');
}
const need = (label, borough) => {
  const hit = identities.find((i) => i.label === label);
  if (!hit || hit.borough !== borough) {
    throw new Error(`REFUSING: ${label} resolved to ${hit ? hit.borough : 'MISSING'} — expected ${borough}`);
  }
};
need('Mott Haven', 'Bronx');            // the regression case
need('Downtown Brooklyn', 'Brooklyn');  // was null under the 95% threshold
need('Midwood', 'Brooklyn');            // was null under the 95% threshold
need('Bay Terrace, Queens', 'Queens');
need('Bay Terrace, Staten Island', 'StatenIsland');
const soho = identities.find((i) => i.folded === 'soho');
if (!soho || soho.label !== 'SoHo' || soho.spellings.length < 3) {
  throw new Error('REFUSING: the SoHo case group did not collapse as required');
}
if (identities.some((i) => i.boroughLabel === 'StatenIsland')) {
  throw new Error('REFUSING: raw provider spelling StatenIsland leaked into a broker label');
}
for (const name of ['Union Square', 'Gramercy', 'Stuyvesant Town']) {
  if (!identities.some((i) => i.label === name)) {
    throw new Error(`REFUSING: ${name} missing — ACCEPT must cover names with no on-market inventory`);
  }
}

/** `folded` is derivable and is not emitted; see BY_FOLDED below. */
const emit = ({ folded, ...rest }) => rest;

const ts = [
  '/**',
  ' * GENERATED — do not edit. `node scripts/search/generate-neighborhood-identities.mjs`',
  ' *',
  ' * Canonical neighbourhood identities from the FULL live Cotality feed:',
  ` * ${full.rowsRead.toLocaleString()} rows, ${full.pagesRead} pages, not truncated, read ${full.probedAt}.`,
  ` * Universe: ${full.universe}.`,
  ' *',
  ' * IDENTITY IS (borough × normalised name). The census disproved global name',
  ' * uniqueness — 124 of 632 folded names span more than one CityRegion — so the',
  ' * borough is part of the identity AND part of the predicate, not just a label.',
  ' *',
  ` * ${identities.length} identities, ${offered.length} offered in the autocomplete.`,
  ' * ACCEPT ships everywhere; OFFER is a flag, so a Saved Search can restore a valid',
  ' * name the dropdown does not show.',
  ' *',
  ` * Evidence: ${FULL}`,
  ' */',
  '',
  'export interface NeighborhoodIdentity {',
  '  /** The ONE label a broker sees. Carries the borough when the name is two places. */',
  '  readonly label: string;',
  '  /** Every raw Cotality spelling behind it. The union executes. */',
  '  readonly spellings: readonly string[];',
  '  readonly rows: number;',
  '  /** Provider CityRegion value. NEVER null — it is part of the identity. */',
  '  readonly borough: string;',
  '  /** The borough label a broker reads. `StatenIsland` -> `Staten Island`. */',
  '  readonly boroughLabel: string;',
  '  /** Whether the browser autocomplete offers it. Execution ignores this. */',
  '  readonly offered: boolean;',
  '}',
  '',
  'export const NEIGHBORHOOD_IDENTITIES: readonly NeighborhoodIdentity[] = Object.freeze([',
  ...identities.map((i) => `  ${JSON.stringify(emit(i))},`),
  ']);',
  '',
  "const FOLD = (v: string): string => v.toLowerCase().replace(/[^a-z]/g, '');",
  '',
  '/**',
  ' * Indexed by every folded label AND spelling.',
  ' *',
  ' * The folded key is derivable, so storing it would be a second copy that could',
  ' * drift — and one compound provider name folds to a 40+ character lowercase run',
  ' * that the repo secrets scanner reads as a possible API key, failing CI.',
  ' */',
  'const BY_FOLDED: ReadonlyMap<string, NeighborhoodIdentity[]> = (() => {',
  '  const m = new Map<string, NeighborhoodIdentity[]>();',
  '  for (const i of NEIGHBORHOOD_IDENTITIES) {',
  '    for (const key of [i.label, ...i.spellings].map(FOLD)) {',
  '      const list = m.get(key) ?? [];',
  '      if (!list.includes(i)) list.push(i);',
  '      m.set(key, list);',
  '    }',
  '  }',
  '  return m;',
  '})();',
  '',
  '/**',
  ' * The identity a typed, stored or polygon name means.',
  ' *',
  ' * `borough` disambiguates a name that is two places. Without it an ambiguous',
  ' * name returns null rather than silently picking one — guessing between',
  ' * Bay Terrace in Queens and Bay Terrace in Staten Island is exactly the quiet',
  ' * substitution this contract exists to prevent.',
  ' */',
  'export function identityFor(value: unknown, borough?: string | null): NeighborhoodIdentity | null {',
  "  if (typeof value !== 'string') return null;",
  '  const key = FOLD(value.trim());',
  '  if (!key) return null;',
  '  const hits = BY_FOLDED.get(key);',
  '  if (!hits || hits.length === 0) return null;',
  '  if (hits.length === 1) return hits[0];',
  '  if (!borough) return null;',
  '  const want = FOLD(borough);',
  '  return hits.find((h) => FOLD(h.borough) === want || FOLD(h.boroughLabel) === want) ?? null;',
  '}',
  '',
  '/** Every identity a name could mean — for reporting an ambiguity to the broker. */',
  'export function identitiesFor(value: unknown): readonly NeighborhoodIdentity[] {',
  "  if (typeof value !== 'string') return [];",
  '  return BY_FOLDED.get(FOLD(value.trim())) ?? [];',
  '}',
  '',
  '/** The borough a neighbourhood belongs to, as the PROVIDER value. */',
  'export function boroughForNeighborhood(value: unknown, borough?: string | null): string | null {',
  '  return identityFor(value, borough)?.borough ?? null;',
  '}',
  '',
  '/** Every raw Cotality spelling to search for a selection. */',
  'export function spellingsFor(value: unknown, borough?: string | null): readonly string[] {',
  '  return identityFor(value, borough)?.spellings ?? [];',
  '}',
  '',
  '/** BACK-COMPAT: raw spelling -> row count. */',
  'export const SUBDIVISION_NAME_LIVE: Readonly<Record<string, number>> = Object.freeze(',
  '  Object.fromEntries(',
  '    NEIGHBORHOOD_IDENTITIES.flatMap((i) => i.spellings.map((s) => [s, i.rows])),',
  '  ),',
  ');',
  '',
  `export const NEIGHBORHOOD_VOCABULARY_PROBED_AT = ${JSON.stringify(full.probedAt)} as const;`,
  `export const NEIGHBORHOOD_VOCABULARY_ROWS_READ = ${full.rowsRead} as const;`,
  '',
];
writeFileSync(resolve(REPO, TS_OUT), ts.join('\n'));
console.log(`wrote ${TS_OUT}: ${identities.length} identities (${offered.length} offered)`);

// THE BROWSER GETS THE FULL ACCEPT SET, with `offered` as a flag. Shipping only
// the offered subset is what made Saved Search restore drop `Union Square`.
writeFileSync(
  resolve(REPO, JSON_OUT),
  JSON.stringify(
    {
      _generated: 'node scripts/search/generate-neighborhood-identities.mjs — do not edit',
      _meta: {
        description:
          'Canonical neighbourhood identities from the full live Cotality feed. Identity is ' +
          '(borough x normalised name); the borough is part of the predicate, not just a label. ' +
          'Carries the FULL accept set so Saved Search can restore a valid name the dropdown ' +
          'does not offer. Map polygon names are a SEPARATE vocabulary and are not in this file.',
        probedAt: full.probedAt,
        rowsRead: full.rowsRead,
        universe: full.universe,
        evidence: FULL,
        totalIdentities: identities.length,
        offeredIdentities: offered.length,
      },
      boroughLabels: BOROUGH_LABELS,
      identities: identities.map(emit),
    },
    null,
    2,
  ) + '\n',
);
console.log(`wrote ${JSON_OUT}: ${identities.length} identities, ${offered.length} offered`);

writeFileSync(
  resolve(REPO, EXCLUSIONS_OUT),
  JSON.stringify(
    {
      generatedFrom: FULL,
      note:
        'Names resolved to their dominant borough. The excluded rows are provider mis-tagging ' +
        'and are removed from the search by the CityRegion term. Recorded so the decision is ' +
        'visible rather than silent, and so a genuine second place can be promoted into ' +
        'MULTI_BOROUGH_PLACES if one is found here.',
      exclusions: droppedMinority,
    },
    null,
    2,
  ) + '\n',
);
console.log(`minority-borough exclusions recorded: ${droppedMinority.length}`);
