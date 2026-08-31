/**
 * GENERATE the canonical neighbourhood identity contract from the FULL live feed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO SETS, BECAUSE THEY ANSWER TWO QUESTIONS
 *
 *   ACCEPT  — every identity the provider actually carries, at any status.
 *             This is what execution may filter on. Refusing a value the feed
 *             holds is how a Closed/comps search for Gramercy (930 rows) came to
 *             hard-fail with "Not a live Cotality value" — a universal negative
 *             asserted from a read of 1.3% of the feed.
 *
 *   OFFER   — the identities a broker is shown in the autocomplete. The full feed
 *             carries 632 identities including `null` (3,508 rows), `OTHER`,
 *             legacy codes (`GRENVILL`, `UPWEST`, `PROSHEI`), borough names used
 *             as neighbourhoods, and non-NYC places (Hoboken, Yonkers, Catskill).
 *             Those are real provider values and must remain searchable; none of
 *             them belongs in a broker's dropdown.
 *
 * OFFER defaults to the identities with CURRENT on-market inventory, which is
 * both clean and the set a broker can actually find something in. Everything else
 * stays executable. WHICH provider values deserve a place in the UI beyond that is
 * a Mallan product decision, not a Cotality fact — see the report to Maya.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CASE VARIANTS COLLAPSE; DIFFERENT NAMES DO NOT
 *
 * `SoHo`/`Soho`/`SOHO` are one identity and the union executes, so capitalisation
 * never loses inventory. `Gramercy` (930) and `Gramercy Park` (9,542) stay
 * separate — different names are never merged without live proof.
 *
 * THE LABEL IS A MALLAN DECISION, THE SPELLINGS ARE COTALITY'S. The commonest
 * provider spelling of SoHo is `Soho` and of DUMBO is `Dumbo`; Maya's required
 * labels are `SoHo` and `DUMBO`. So the label comes from an explicit table where
 * one exists, and otherwise defaults to the provider's commonest form.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOROUGH BY DOMINANCE, NOT BY STRICT UNIQUENESS
 *
 * Strict uniqueness marked `Mott Haven` ambiguous over ONE stray Manhattan row
 * against 574 Bronx rows. A 95% threshold assigns it to the Bronx — which is the
 * regression the deleted hard-coded table got wrong — while leaving genuinely
 * split names unassigned: `Marble Hill` (58 Bronx / 12 Manhattan, a real NYC
 * quirk) and `Bay Terrace` (42 Queens / 17 Staten Island, two different places).
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

const full = JSON.parse(readFileSync(resolve(REPO, FULL), 'utf8'));
const onmkt = JSON.parse(readFileSync(resolve(REPO, ONMARKET), 'utf8'));

if (full.complete !== true) throw new Error('REFUSING: the full-feed read was truncated');
if (!Array.isArray(full.identities) || full.identities.length < 400) {
  throw new Error(`REFUSING: only ${full.identities?.length ?? 0} identities — evidence looks wrong`);
}
if (onmkt.neighborhood?.complete !== true) throw new Error('REFUSING: the on-market read was truncated');

/**
 * PRESENTATION LABELS — a Mallan naming decision, recorded explicitly.
 *
 * Maya's five worked examples, plus the same treatment for the other conventional
 * NYC forms where the provider's commonest spelling is an all-caps or flat form.
 * Keyed by folded identity so it cannot drift with spelling.
 */
const LABEL_OVERRIDES = {
  soho: 'SoHo',
  noho: 'NoHo',
  dumbo: 'DUMBO',
  nomad: 'NoMad',
  midtown: 'Midtown',
  nolita: 'Nolita',
  tribeca: 'Tribeca',
};

/** Provider CityRegion value -> the label a broker reads. */
const BOROUGH_LABELS = {
  Manhattan: 'Manhattan',
  Brooklyn: 'Brooklyn',
  Queens: 'Queens',
  Bronx: 'Bronx',
  StatenIsland: 'Staten Island',
};

/** A borough is assigned when it accounts for at least this share of the rows. */
const BOROUGH_DOMINANCE = 0.95;

const onMarketNames = new Set((onmkt.neighborhood.values ?? []).map((v) => v.name));

const identities = full.identities.map((i) => {
  const counts = Object.entries(i.boroughs ?? {}).sort((a, b) => b[1] - a[1]);
  const total = counts.reduce((s, [, n]) => s + n, 0);
  const dominant = counts.length && total > 0 && counts[0][1] / total >= BOROUGH_DOMINANCE
    ? counts[0][0]
    : null;
  const spellings = i.spellings.map((s) => s.value);
  return {
    folded: i.folded,
    label: LABEL_OVERRIDES[i.folded] ?? i.commonestSpelling,
    spellings,
    rows: i.rows,
    borough: dominant,
    boroughLabel: dominant ? BOROUGH_LABELS[dominant] ?? dominant : null,
    // OFFERED when it has current on-market inventory under any spelling.
    offered: spellings.some((s) => onMarketNames.has(s)),
  };
}).sort((a, b) => a.label.localeCompare(b.label));

const offered = identities.filter((i) => i.offered);

// GUARD THE GUARDS. Each of these caught a real defect during development.
if (offered.length < 150) throw new Error(`REFUSING: only ${offered.length} offered identities`);
const mott = identities.find((i) => i.folded === 'motthaven');
if (!mott || mott.borough !== 'Bronx') {
  throw new Error(`REFUSING: Mott Haven resolved to ${mott?.borough} — the regression case must be Bronx`);
}
const soho = identities.find((i) => i.folded === 'soho');
if (!soho || soho.label !== 'SoHo' || soho.spellings.length < 3) {
  throw new Error('REFUSING: the SoHo case group did not collapse as required');
}
if (identities.some((i) => i.boroughLabel === 'StatenIsland')) {
  throw new Error('REFUSING: raw provider spelling StatenIsland leaked into a broker label');
}

// ── SERVER CONTRACT ─────────────────────────────────────────────────────────
const ts = [
  '/**',
  ' * GENERATED — do not edit. `node scripts/search/generate-neighborhood-identities.mjs`',
  ' *',
  ' * Canonical neighbourhood identities from the FULL live Cotality feed:',
  ` * ${full.rowsRead.toLocaleString()} rows across every status, ${full.pagesRead} pages, not truncated,`,
  ` * read ${full.probedAt}. ${identities.length} identities, ${identities.filter((i) => i.spellings.length > 1).length} of them`,
  ' * carrying more than one provider spelling.',
  ' *',
  ' * ACCEPT is every identity here — refusing a value the feed carries is what made',
  ' * a Closed/comps search for Gramercy hard-fail. OFFER is the subset with current',
  ' * on-market inventory and is a presentation concern, not an execution one.',
  ' *',
  ` * Evidence: ${FULL}`,
  ' */',
  '',
  'export interface NeighborhoodIdentity {',
  '  /** The ONE label a broker sees. A Mallan naming decision. */',
  '  readonly label: string;',
  '  /** Every raw Cotality spelling behind it. The union executes. */',
  '  readonly spellings: readonly string[];',
  '  readonly rows: number;',
  '  /** Provider CityRegion value when one borough holds >=95% of rows, else null. */',
  '  readonly borough: string | null;',
  '  /** The borough label a broker reads. `StatenIsland` -> `Staten Island`. */',
  '  readonly boroughLabel: string | null;',
  '  /** Whether this identity is offered in the browser autocomplete. */',
  '  readonly offered: boolean;',
  '}',
  '',
  'export const NEIGHBORHOOD_IDENTITIES: readonly NeighborhoodIdentity[] = Object.freeze([',
  // `folded` is deliberately NOT emitted: it is derivable, and one compound
  // provider name folds to a 40+ character lowercase run that the repo secrets
  // scanner reads as a possible API key — which failed CI.
  ...identities.map(({ folded, ...rest }) => `  ${JSON.stringify(rest)},`),
  ']);',
  '',
  'const FOLD = (v: string): string => v.toLowerCase().replace(/[^a-z]/g, \'\');',
  '',
  '/**',
  ' * Indexed by EVERY folded spelling, not by a stored key.',
  ' *',
  ' * The folded key is derivable, so storing it was a second copy that could drift —',
  ' * and one compound provider name folds to a 40+ character lowercase run that the',
  ' * repo secrets scanner reads as a possible API key, failing CI.',
  ' */',
  'const BY_FOLDED: ReadonlyMap<string, NeighborhoodIdentity> = new Map(',
  '  NEIGHBORHOOD_IDENTITIES.flatMap((i) =>',
  '    [i.label, ...i.spellings].map((s) => [FOLD(s), i] as const),',
  '  ),',
  ');',
  '',
  '/** The identity a typed or stored neighbourhood value means, or null. */',
  'export function identityFor(value: unknown): NeighborhoodIdentity | null {',
  '  if (typeof value !== \'string\') return null;',
  '  const key = FOLD(value.trim());',
  '  if (!key) return null;',
  '  return BY_FOLDED.get(key) ?? null;',
  '}',
  '',
  '/**',
  ' * The borough a neighbourhood belongs to, as the PROVIDER value.',
  ' *',
  ' * Replaces a hard-coded browser table that placed Mott Haven in Manhattan; the',
  ' * feed puts it in the Bronx on 574 of 575 rows.',
  ' */',
  'export function boroughForNeighborhood(value: unknown): string | null {',
  '  return identityFor(value)?.borough ?? null;',
  '}',
  '',
  '/** Every raw Cotality spelling to search for a selection. Empty when unknown. */',
  'export function spellingsFor(value: unknown): readonly string[] {',
  '  return identityFor(value)?.spellings ?? [];',
  '}',
  '',
  '/** BACK-COMPAT: raw spelling -> row count, as the previous contract exposed. */',
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
console.log(`wrote ${TS_OUT}: ${identities.length} identities (${offered.length} offered) from ${full.rowsRead} rows`);

// ── BROWSER CONTRACT ────────────────────────────────────────────────────────
writeFileSync(
  resolve(REPO, JSON_OUT),
  JSON.stringify(
    {
      _generated: 'node scripts/search/generate-neighborhood-identities.mjs — do not edit',
      _meta: {
        description:
          'Canonical neighbourhood identities from the full live Cotality feed. One label per ' +
          'identity; every provider spelling behind it so capitalisation never loses inventory. ' +
          'Map polygon names are a SEPARATE vocabulary and are not in this file.',
        probedAt: full.probedAt,
        rowsRead: full.rowsRead,
        evidence: FULL,
        totalIdentities: identities.length,
        offeredIdentities: offered.length,
        boroughDominanceThreshold: BOROUGH_DOMINANCE,
      },
      boroughLabels: BOROUGH_LABELS,
      // Only the offered subset ships to the browser dropdown; execution accepts
      // the full set server-side, so nothing becomes unsearchable.
      identities: offered.map((i) => ({
        label: i.label,
        borough: i.borough,
        boroughLabel: i.boroughLabel,
        spellings: i.spellings,
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(`wrote ${JSON_OUT}: ${offered.length} offered identities`);
