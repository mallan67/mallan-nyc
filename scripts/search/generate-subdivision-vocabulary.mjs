/**
 * GENERATE the live-verified SubdivisionName vocabulary from probe evidence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACES THE ALIAS REVERSAL
 *
 * `geography.ts` resolved a neighbourhood selection by reversing
 * `data/rls/geo/neighborhood-aliases.json` into Cotality `SubdivisionName eq`
 * terms. That file's own `_meta` reads "Maps RLS SubdivisionName variants",
 * generatedAt 2026-03-19 — five months before the geography probe. Old RLS
 * evidence was defining current provider truth, which inverts the architecture:
 * COTALITY RAW -> VERIFIED MAPPING -> MALLAN CANONICAL, never the reverse.
 *
 * Measured against the live feed 2026-08-31, the reversal was not merely
 * unproven. It was WRONG, because that file maps provider names onto 72 POLYGON
 * shapes for map rendering — a grouping, not an identity:
 *
 *   Williamsburg       191 rows literal -> 331 with the expansion, adding
 *                      Bushwick (109) and Ridgewood (16), which is in QUEENS
 *   Downtown Brooklyn   88 -> 431, adding Flatbush, Bay Ridge and Midwood
 *   Prospect Heights    19 -> 149, adding Stuyvesant Heights (67), in Bed-Stuy
 *   Bayside              2 ->  92, adding Jamaica (36)
 *
 * A broker selecting Williamsburg was being handed Bushwick and Ridgewood
 * listings under HTTP 200 with nothing to say so. That is silent widening.
 *
 * 437 of the 593 alias spellings match nothing live at all, and three canonical
 * names — Gramercy, Stuyvesant Town, Union Square — expand ENTIRELY to spellings
 * the feed does not carry, so selecting them returned zero rows while
 * `Gramercy Park` sat in the feed unreachable, unknown to the alias file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS KEPT
 *
 * Seven of the expansions are genuine CASE variants of one name — SoHo/Soho/SOHO,
 * DUMBO/Dumbo, NoHo/Noho, NoMad/NOMAD, Nolita/NoLIta, Tribeca/TriBeCa,
 * Midtown/midtown. Those are the same neighbourhood and must keep working, so
 * resolution is case-insensitive against the live vocabulary rather than an
 * alias table. That is identity, not equivalence: every emitted term is a value
 * the provider itself carries.
 *
 * The alias file remains valid for what it was built for — polygons and map
 * rendering. It is no longer consulted for provider execution.
 *
 * Run: node scripts/search/generate-subdivision-vocabulary.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = 'artifacts/section5-closure-probe-2026-08-31.json';
const OUT = 'lib/search/canonical/subdivision-vocabulary.generated.ts';

const probe = JSON.parse(readFileSync(resolve(REPO, EVIDENCE), 'utf8'));
const n = probe.neighborhood;

// A TRUNCATED READ IS A PARTIAL VOCABULARY. Generating from one would blocklist
// real neighbourhoods that simply were not reached, so refuse rather than emit
// a vocabulary that looks complete.
if (!n || n.complete !== true) {
  throw new Error('REFUSING to generate: the neighbourhood read was truncated or absent');
}
if (!Array.isArray(n.values) || n.values.length < 100) {
  throw new Error(`REFUSING to generate: only ${n.values?.length ?? 0} values — evidence looks wrong`);
}

const values = [...n.values].sort((a, b) => a.name.localeCompare(b.name));

const lines = [
  '/**',
  ' * GENERATED — do not edit. `node scripts/search/generate-subdivision-vocabulary.mjs`',
  ' *',
  ' * The SubdivisionName values the LIVE Cotality feed carries across the',
  ' * Search-eligible universe (Residential + ResidentialLease, Active +',
  ' * ComingSoon + ActiveUnderContract), read exhaustively — ' + n.rowsRead + ' rows,',
  ' * ' + n.pagesRead + ' pages, not truncated — on ' + probe.probedAt + '.',
  ' *',
  ' * This is the PROVIDER vocabulary, not a Mallan naming decision. A neighbourhood',
  ' * search emits only values from this list, so every term is one the feed',
  ' * actually carries: identity, never an asserted equivalence.',
  ' *',
  ' * Evidence: ' + EVIDENCE,
  ' */',
  '',
  '/** Live value -> row count observed at generation time. */',
  'export const SUBDIVISION_NAME_LIVE: Readonly<Record<string, number>> = Object.freeze({',
  ...values.map((v) => `  ${JSON.stringify(v.name)}: ${v.rows},`),
  '});',
  '',
  '/** ISO date the vocabulary was read from live Cotality. */',
  `export const SUBDIVISION_VOCABULARY_PROBED_AT = ${JSON.stringify(probe.probedAt)} as const;`,
  '',
  '/** Rows read in the exhaustive pass that produced this list. */',
  `export const SUBDIVISION_VOCABULARY_ROWS_READ = ${n.rowsRead} as const;`,
  '',
];

writeFileSync(resolve(REPO, OUT), lines.join('\n') + '\n');
console.log(`wrote ${OUT}: ${values.length} live SubdivisionName values from ${n.rowsRead} rows`);

// ─────────────────────────────────────────────────────────────────────────────
// THE BROWSER GETS THE SAME VOCABULARY, FROM THE SAME EVIDENCE.
//
// Four neighbourhood lists existed: this generated server contract, a hard-coded
// array in neighborhood-autocomplete.js, a neighbourhood→borough table in
// search-engine.js, and the map polygon names. The autocomplete list offered
// `Stuyvesant Town` and `Union Square`, which the live feed does not carry — so
// the UI invited a selection the server now refuses.
//
// Hand-copying the 240 names into another JS array would make a FIFTH list.
// Generating the browser file from the same probe is what makes them one
// vocabulary that cannot drift, because neither can be edited independently.
//
// POLYGON NAMES STAY SEPARATE ON PURPOSE. The map renders shapes and its names
// are a different vocabulary answering a different question; conflating them is
// what produced the alias reversal in the first place. The bridge between them is
// explicit and lives in the map layer, not here.
// ─────────────────────────────────────────────────────────────────────────────
const UNIQUENESS = 'artifacts/subdivision-borough-uniqueness-2026-08-31.json';
const BROWSER_OUT = 'public/crm/data/neighborhood-vocabulary.generated.json';

const uniq = JSON.parse(readFileSync(resolve(REPO, UNIQUENESS), 'utf8'));
if (uniq.complete !== true) {
  throw new Error('REFUSING to generate the browser vocabulary: uniqueness read was truncated');
}
if (uniq.uniquePerBorough !== true) {
  // A name in two boroughs means the browser cannot present a flat per-borough
  // list without lying about which place the broker picked.
  throw new Error('REFUSING: a SubdivisionName spans more than one borough — grouping would be ambiguous');
}
const grouped = uniq.byBorough ?? {};
const groupedTotal = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
if (groupedTotal !== values.length) {
  throw new Error(`REFUSING: grouped ${groupedTotal} names but the vocabulary has ${values.length}`);
}

writeFileSync(
  resolve(REPO, BROWSER_OUT),
  JSON.stringify(
    {
      _generated: 'node scripts/search/generate-subdivision-vocabulary.mjs — do not edit',
      _meta: {
        description:
          'Live Cotality SubdivisionName values, grouped by the CityRegion each is proven unique to. ' +
          'The ONE neighbourhood vocabulary shared by the CRM autocomplete and the server executor. ' +
          'Map polygon names are a SEPARATE vocabulary and are not in this file.',
        probedAt: probe.probedAt,
        rowsRead: n.rowsRead,
        uniquenessEvidence: UNIQUENESS,
        vocabularyEvidence: EVIDENCE,
        totalNames: groupedTotal,
      },
      byBorough: grouped,
    },
    null,
    2,
  ) + '\n',
);
console.log(`wrote ${BROWSER_OUT}: ${groupedTotal} names across ${Object.keys(grouped).length} boroughs`);
