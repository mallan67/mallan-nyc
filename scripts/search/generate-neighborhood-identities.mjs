/**
 * GENERATE the canonical neighbourhood identity contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO LAYERS, AND THE BOUNDARY BETWEEN THEM IS THE POINT
 *
 *   COTALITY EVIDENCE   observed (normalised name × CityRegion × count).
 *                       Facts. No interpretation whatsoever.
 *
 *   MALLAN RULE         which borough a name MEANS. A business decision about NYC
 *                       geography, declared below with an owner and a reason.
 *
 * The previous version collapsed the two. It picked the largest row count and the
 * artifact then stated categorically that "the excluded rows are provider
 * mis-tagging" — a claim the census never established. Counts tell you which
 * combinations exist. They cannot tell you whether a minority combination is
 * provider error, a second real place, historical encoding, or a boundary case.
 *
 * MARBLE HILL IS WHY THIS MATTERS. The feed shows Bronx 58 / Manhattan 12, so
 * every count-based rule returns the Bronx. Marble Hill is legally and
 * administratively MANHATTAN — physically attached to the Bronx by a filled-in
 * canal. The plurality answer is simply wrong, and no amount of evidence weighting
 * would have caught it. Only a stated Mallan decision does.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW A NAME GETS A BOROUGH
 *
 *   1. MULTI_BOROUGH_PLACES  — declared to be two real places. One identity each.
 *   2. CANONICAL_BOROUGH     — declared to mean one borough. One identity.
 *   3. >= DOMINANCE_FLOOR    — a declared Mallan DEFAULT, not a claim about error:
 *                              a name whose rows sit almost entirely in one
 *                              borough is treated as that borough. The residue is
 *                              recorded, never characterised.
 *   4. otherwise             — AMBIGUOUS. One identity per borough with real
 *                              observed borough, each labelled "Name (Borough)".
 *                              The bare name resolves to NONE of them and must be
 *                              qualified. No presence cutoff: dropping small
 *                              boroughs is a decision, and it hid inside this branch.
 *
 * There is NO plurality fallback. A 57/43 or 50/50 split acquires no borough just
 * because one bucket is larger.
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
const RESOLUTION_OUT = 'artifacts/neighborhood-borough-resolution.json';

const full = JSON.parse(readFileSync(resolve(REPO, FULL), 'utf8'));
const onmkt = JSON.parse(readFileSync(resolve(REPO, ONMARKET), 'utf8'));

if (full.complete !== true) throw new Error('REFUSING: the full-feed read was truncated');
if (!Array.isArray(full.identities) || full.identities.length < 400) {
  throw new Error(`REFUSING: only ${full.identities?.length ?? 0} identities — evidence looks wrong`);
}
if (onmkt.neighborhood?.complete !== true) throw new Error('REFUSING: the on-market read was truncated');

/** The owner of every decision in this file's rule layer. */
const RULE_OWNER = 'mallan_canonical_geography';

/**
 * NAMES MALLAN DECLARES TO BE MORE THAN ONE PLACE.
 * Owner: Mallan canonical geography. Not a Cotality finding.
 */
const MULTI_BOROUGH_PLACES = {
  bayterrace: {
    boroughs: ['Queens', 'StatenIsland'],
    reason: 'There is a Bay Terrace in Queens and a separate Bay Terrace in Staten Island.',
  },
};

/**
 * NAMES MALLAN DECLARES TO MEAN ONE BOROUGH.
 *
 * Each is NYC geography, not a count. Several would be resolved WRONGLY by any
 * count-based rule, which is why they are stated rather than derived.
 */
const CANONICAL_BOROUGH = {
  marblehill:        { borough: 'Manhattan',    reason: 'Legally and administratively Manhattan, though physically attached to the Bronx. The feed shows Bronx 58 / Manhattan 12, so a count-based rule returns the WRONG borough.' },
  inwoodmarblehill:  { borough: 'Manhattan',    reason: 'Both halves of this compound name are Manhattan.' },
  downtownbrooklyn:  { borough: 'Brooklyn',     reason: 'The name states the borough.' },
  lowermanhattan:    { borough: 'Manhattan',    reason: 'The name states the borough.' },
  midwood:           { borough: 'Brooklyn',     reason: 'Midwood is a Brooklyn neighbourhood.' },
  wingate:           { borough: 'Brooklyn',     reason: 'Wingate is a Brooklyn neighbourhood.' },
  stuyvesanttown:    { borough: 'Manhattan',    reason: 'Stuyvesant Town is a Manhattan development. The feed splits 7/7, so no count rule could decide it.' },
  dongenhills:       { borough: 'StatenIsland', reason: 'Dongan Hills is in Staten Island.' },
  donganhills:       { borough: 'StatenIsland', reason: 'Dongan Hills is in Staten Island.' },
  glenoaks:          { borough: 'Queens',       reason: 'Glen Oaks is in Queens.' },
  lindenwood:        { borough: 'Queens',       reason: 'Lindenwood is in Queens.' },
  sugarhill:         { borough: 'Manhattan',    reason: 'Sugar Hill is in Harlem, Manhattan.' },

  // ── DECIDED 2026-08-31, when the hidden 5% presence cutoff was removed ────
  //
  // Each of these sits between the 95% and 99% marks, so the declared dominance
  // rule does not reach them. They were previously resolved by a SILENT filter
  // that dropped any borough under 5% and then emitted a single unqualified
  // identity — so a name whose own record said "never auto-assigned" auto-assigned.
  //
  // They are decided here instead, because each is an ordinary NYC fact rather
  // than a reading of the counts. Names that are NOT ordinary NYC facts — borough
  // names used as neighbourhoods, placeholders, and places outside the city —
  // are deliberately absent and stay genuinely ambiguous.
  fortgreene:        { borough: 'Brooklyn',     reason: 'Fort Greene is a Brooklyn neighbourhood.' },
  riverdale:         { borough: 'Bronx',        reason: 'Riverdale is in the Bronx.' },
  centralvillage:    { borough: 'Manhattan',    reason: 'Central Village is the Greenwich Village area of Manhattan.' },
  concourse:         { borough: 'Bronx',        reason: 'The Concourse is in the Bronx.' },
  gravesend:         { borough: 'Brooklyn',     reason: 'Gravesend is in Brooklyn.' },
  vinegarhill:       { borough: 'Brooklyn',     reason: 'Vinegar Hill is in Brooklyn, beside DUMBO.' },
  homecrest:         { borough: 'Brooklyn',     reason: 'Homecrest is in Brooklyn.' },
  glendale:          { borough: 'Queens',       reason: 'Glendale is in Queens.' },
  cypresshills:      { borough: 'Brooklyn',     reason: 'Cypress Hills is in Brooklyn.' },
  bedfordpark:       { borough: 'Bronx',        reason: 'Bedford Park is in the Bronx.' },
  woodhaven:         { borough: 'Queens',       reason: 'Woodhaven is in Queens.' },
  williamsburgnside: { borough: 'Brooklyn',     reason: 'Williamsburg North Side is in Brooklyn.' },
  richmondhill:      { borough: 'Queens',       reason: 'Richmond Hill is in Queens.' },
  queensvillage:     { borough: 'Queens',       reason: 'Queens Village is in Queens.' },
  ozonepark:         { borough: 'Queens',       reason: 'Ozone Park is in Queens.' },
  southozonepark:    { borough: 'Queens',       reason: 'South Ozone Park is in Queens.' },
  wests:             { borough: 'Manhattan',    reason: "West 30's is a Manhattan area label." },
  meatpackingdistrict: { borough: 'Manhattan',  reason: 'The Meatpacking District is in Manhattan.' },
  morrispark:        { borough: 'Bronx',        reason: 'Morris Park is in the Bronx.' },
  baychester:        { borough: 'Bronx',        reason: 'Baychester is in the Bronx. The feed shows Bronx 26 / Manhattan 1, which does not reach the dominance floor — so this is a decision, not a count.' },
  proslefr:          { borough: 'Brooklyn',     reason: 'Legacy code for Prospect Lefferts Gardens, Brooklyn.' },
  dtwnbkyn:          { borough: 'Brooklyn',     reason: 'Legacy code for Downtown Brooklyn.' },
};

/**
 * The declared Mallan DEFAULT for a name that is not named above.
 *
 * At or above this share, Mallan treats the name as that borough. This is a
 * decision about how much evidence is enough to act on — NOT an assertion that the
 * remaining rows are provider error. Their provenance is unverified and is
 * recorded as observed.
 */
const DOMINANCE_FLOOR = 0.99;

// THE 5% PRESENCE CUTOFF IS GONE.
//
// It read: "a borough must hold at least this share to count as a real presence
// for a split." That is a Mallan judgement about which observed evidence counts,
// and it was applied inside the branch that declares NO decision was made —
// labelled `cotality_observation`, reason "never auto-assigned".
//
// The effect was that 26 of 38 supposedly ambiguous names lost their minority
// boroughs and were emitted as ONE unqualified identity, so a bare name resolved
// after all. Baychester (Bronx 26 / Manhattan 1) is the plainest case: its record
// says it must be qualified, and the runtime resolved it silently.
//
// True ambiguity now preserves EVERY observed borough with a positive count. A
// name that should not be ambiguous gets an explicit decision above, where the
// reason is visible and owned.

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

/** Same fold the probe used, so a resolution record can find its identities. */
const FOLD_KEY = (v) => String(v).toLowerCase().replace(/[^a-z]/g, '');

const onMarketNames = new Set((onmkt.neighborhood.values ?? []).map((v) => v.name));

const identities = [];
const resolutionLog = [];

for (const i of full.identities) {
  const counts = Object.entries(i.boroughs ?? {}).sort((a, b) => b[1] - a[1]);
  if (counts.length === 0) continue;                 // no borough evidence at all
  const total = counts.reduce((s, [, n]) => s + n, 0);
  const spellings = i.spellings.map((s) => s.value);
  const base = LABEL_OVERRIDES[i.folded] ?? i.commonestSpelling;

  const multi = MULTI_BOROUGH_PLACES[i.folded];
  const canonical = CANONICAL_BOROUGH[i.folded];
  const topShare = counts[0][1] / total;

  let boroughs;
  let basis;
  let reason;

  if (multi) {
    boroughs = counts.filter(([b]) => multi.boroughs.includes(b)).map(([b]) => b);
    basis = 'mallan_multi_place';
    reason = multi.reason;
  } else if (canonical) {
    boroughs = [canonical.borough];
    basis = 'mallan_canonical_borough';
    reason = canonical.reason;
  } else if (counts.length === 1) {
    boroughs = [counts[0][0]];
    basis = 'single_borough_observed';
    reason = 'Every observed row sits in one borough.';
  } else if (topShare >= DOMINANCE_FLOOR) {
    boroughs = [counts[0][0]];
    basis = 'mallan_dominance_default';
    reason = `Observed ${(topShare * 100).toFixed(2)}% in ${counts[0][0]}, at or above the declared ` +
             `${DOMINANCE_FLOOR * 100}% floor. The remaining rows are recorded, not characterised.`;
  } else {
    // AMBIGUOUS. No decision exists and the evidence does not meet the floor, so
    // the name is split per borough and the bare form resolves to neither.
    // EVERY observed borough, with no cutoff. Dropping the small ones is how the
    // bare name came to resolve while its record said it could not.
    boroughs = counts.map(([b]) => b);
    basis = 'ambiguous_requires_borough';
    reason = 'No Mallan decision and no borough at the declared floor. Every observed borough is ' +
             'preserved, so the bare name must be qualified; it is never auto-assigned.';
  }

  const qualify = boroughs.length > 1 || basis === 'mallan_multi_place';
  for (const borough of boroughs) {
    identities.push({
      folded: i.folded,
      // PARENTHESES, NOT A COMMA. The neighborhood request param is
      // comma-separated for multi-select, so a comma inside the label split
      // `Bay Terrace, Queens` into two neighbourhoods and the qualified form
      // could never reach the executor intact.
      label: qualify ? `${base} (${BOROUGH_LABELS[borough] ?? borough})` : base,
      spellings,
      rows: qualify ? (i.boroughs[borough] ?? 0) : i.rows,
      borough,
      boroughLabel: BOROUGH_LABELS[borough] ?? borough,
      offered: spellings.some((s) => onMarketNames.has(s)),
    });
  }

  resolutionLog.push({
    name: base,
    observed: Object.fromEntries(counts),      // COTALITY EVIDENCE, uninterpreted
    resolvedTo: boroughs,                      // MALLAN RULE
    basis,
    reason,
    owner: basis.startsWith('mallan_') ? RULE_OWNER : 'cotality_observation',
  });
}
identities.sort((a, b) => a.label.localeCompare(b.label));
const offered = identities.filter((i) => i.offered);

// GUARD THE GUARDS. Each caught a real defect during development.
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
need('Mott Haven', 'Bronx');
need('Downtown Brooklyn', 'Brooklyn');
need('Midwood', 'Brooklyn');
need('Marble Hill', 'Manhattan');          // the count-based rule would say Bronx
need('Stuyvesant Town', 'Manhattan');      // the feed splits 7/7
need('Bay Terrace (Queens)', 'Queens');
need('Bay Terrace (Staten Island)', 'StatenIsland');
const soho = identities.find((i) => i.folded === 'soho');
if (!soho || soho.label !== 'SoHo' || soho.spellings.length < 3) {
  throw new Error('REFUSING: the SoHo case group did not collapse as required');
}
// A label I CONSTRUCT must never contain a comma: the neighborhood request param
// is comma-separated for multi-select, so `Bay Terrace, Queens` split into two
// neighbourhoods and the qualified form could never reach the executor.
//
// Raw PROVIDER names containing commas are a separate, pre-existing matter —
// `Williamsburg,North` and `Williamsburg,South` cannot survive that param either,
// which is a defect this generator did not create and does not hide. They are
// recorded below rather than silently reshaped.
const commaQualified = identities.filter((i) => i.label.includes(',') && i.label.includes('('));
if (commaQualified.length) {
  throw new Error(`REFUSING: ${commaQualified.length} constructed labels contain a comma`);
}
const commaInProviderName = [...new Set(
  identities.filter((i) => i.label.includes(',')).map((i) => i.label),
)];
if (identities.some((i) => i.boroughLabel === 'StatenIsland')) {
  throw new Error('REFUSING: raw provider spelling StatenIsland leaked into a broker label');
}
for (const name of ['Union Square', 'Gramercy']) {
  if (!identities.some((i) => i.label === name)) {
    throw new Error(`REFUSING: ${name} missing — ACCEPT must cover names with no on-market inventory`);
  }
}
// No decision may be made by plurality alone.
for (const r of resolutionLog) {
  if (r.basis !== 'mallan_dominance_default') continue;
  const tot = Object.values(r.observed).reduce((a, b) => a + b, 0);
  if (Math.max(...Object.values(r.observed)) / tot < DOMINANCE_FLOOR) {
    throw new Error(`REFUSING: ${r.name} was resolved by dominance below the declared floor`);
  }
}

// ── AMBIGUITY MUST MEAN WHAT IT SAYS ────────────────────────────────────────
//
// The record said `ambiguous_requires_borough`, "never auto-assigned", owner
// `cotality_observation` — while a hidden 5% cutoff quietly reduced 26 of 38 such
// names to ONE borough and emitted them unqualified. Behaviour, basis, owner and
// artifact all have to agree, so each of those is now checked.
for (const r of resolutionLog) {
  if (r.basis !== 'ambiguous_requires_borough') continue;
  const observedBoroughs = Object.entries(r.observed).filter(([, n]) => n > 0).map(([b]) => b);

  // 1. An ambiguous name keeps EVERY observed borough. No silent filtering.
  const missing = observedBoroughs.filter((b) => !r.resolvedTo.includes(b));
  if (missing.length) {
    throw new Error(
      `REFUSING: ${r.name} is ambiguous but discarded observed borough(s) ${missing.join(", ")} — ` +
      `a cutoff is a Mallan decision and cannot hide inside an observation`,
    );
  }
  // 2. …and therefore produces more than one identity.
  if (r.resolvedTo.length < 2) {
    throw new Error(`REFUSING: ${r.name} is ambiguous but produced ${r.resolvedTo.length} identity`);
  }
  // 3. …every one of which is qualified, so the bare name cannot resolve.
  const emitted = identities.filter((i) => i.folded === FOLD_KEY(r.name));
  const unqualified = emitted.filter((i) => !i.label.includes('('));
  if (unqualified.length) {
    throw new Error(`REFUSING: ${r.name} is ambiguous but emitted an UNQUALIFIED identity`);
  }
}

// 4. The reported ambiguous count must equal the bare names that actually fail to
//    resolve. A number that does not match the behaviour is how this hid.
const byFoldedCount = new Map();
for (const i of identities) byFoldedCount.set(i.folded, (byFoldedCount.get(i.folded) ?? 0) + 1);
const bareUnresolvable = [...byFoldedCount.values()].filter((n) => n > 1).length;
const declaredAmbiguous = resolutionLog.filter((r) => r.basis === 'ambiguous_requires_borough').length
  + resolutionLog.filter((r) => r.basis === 'mallan_multi_place').length;
if (bareUnresolvable !== declaredAmbiguous) {
  throw new Error(
    `REFUSING: ${declaredAmbiguous} names are declared ambiguous/multi-place but ${bareUnresolvable} ` +
    `bare names actually fail to resolve`,
  );
}

/** `folded` is derivable and is not emitted; see BY_FOLDED below. */
const emit = ({ folded, ...rest }) => rest;
const ambiguousCount = resolutionLog.filter((r) => r.basis === 'ambiguous_requires_borough').length;

const ts = [
  '/**',
  ' * GENERATED — do not edit. `node scripts/search/generate-neighborhood-identities.mjs`',
  ' *',
  ' * Canonical neighbourhood identities from the FULL live Cotality feed:',
  ` * ${full.rowsRead.toLocaleString()} rows, ${full.pagesRead} pages, not truncated, read ${full.probedAt}.`,
  ` * Universe: ${full.universe}.`,
  ' *',
  ' * IDENTITY IS (borough × normalised name). The census disproved global name',
  ' * uniqueness — 124 of 632 folded names span more than one CityRegion.',
  ' *',
  ' * WHICH borough a name means is a MALLAN decision, not a count. Marble Hill is',
  ' * Bronx 58 / Manhattan 12 in the feed and is legally MANHATTAN, so a plurality',
  ' * rule returns the wrong answer. Decisions live in the generator with an owner',
  ' * and a reason; the observed evidence is preserved uninterpreted in',
  ` * ${RESOLUTION_OUT}.`,
  ' *',
  ` * ${identities.length} identities, ${offered.length} offered, ${ambiguousCount} names left AMBIGUOUS`,
  ' * (no decision and no borough at the declared floor). A bare ambiguous name',
  ' * resolves to NOTHING and must be qualified — it is never auto-assigned.',
  ' *',
  ` * Evidence: ${FULL}`,
  ' */',
  '',
  'export interface NeighborhoodIdentity {',
  '  /** The ONE label a broker sees. Carries the borough when the name is ambiguous. */',
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
  '/** Broker borough labels, for parsing a qualified "Name, Borough" input. */',
  `const BOROUGH_LABEL_FOLDS = new Set(${JSON.stringify(
      [...new Set([...Object.keys(BOROUGH_LABELS), ...Object.values(BOROUGH_LABELS)])]
        .map((b) => b.toLowerCase().replace(/[^a-z]/g, '')),
    )});`,
  '',
  '/**',
  ' * Split a qualified label into its base name and borough.',
  ' *',
  ' * A QUALIFIED LABEL MUST NOT BE FOLDED WHOLE. `Downtown, Brooklyn` and',
  ' * `Downtown Brooklyn` fold to the same key, so indexing the qualified form made',
  ' * a real neighbourhood collide with the disambiguated form of a different one —',
  ' * and `Downtown Brooklyn` became unsearchable while being offered in the',
  ' * dropdown. The borough suffix is parsed instead of flattened.',
  ' */',
  'function splitQualified(value: string): { base: string; borough: string | null } {',
  // STRING OPERATIONS, NOT A REGEX. Emitting a regex through this generator means
  // emitting backslashes, and they have been eaten twice by the shell layers this
  // file is edited through — producing /^(.*)s*(([^()]+))s*$/, which silently
  // matched the wrong thing instead of failing. There is nothing here a regex does
  // better.
  '  const close = value.lastIndexOf(")");',
  '  const open = value.lastIndexOf("(");',
  '  if (close !== value.length - 1 || open <= 0) return { base: value, borough: null };',
  '  const tail = value.slice(open + 1, close).trim();',
  '  if (!BOROUGH_LABEL_FOLDS.has(FOLD(tail))) return { base: value, borough: null };',
  '  return { base: value.slice(0, open).trim(), borough: tail };',
  '}',
  '',
  '/**',
  ' * Indexed by folded BASE name and by every raw spelling. A key may map to',
  ' * SEVERAL identities — that is what ambiguity looks like, and it must survive.',
  ' */',
  'const BY_FOLDED: ReadonlyMap<string, NeighborhoodIdentity[]> = (() => {',
  '  const m = new Map<string, NeighborhoodIdentity[]>();',
  '  for (const i of NEIGHBORHOOD_IDENTITIES) {',
  '    const keys = [splitQualified(i.label).base, ...i.spellings].map(FOLD);',
  '    for (const key of keys) {',
  '      const list = m.get(key) ?? [];',
  '      if (!list.includes(i)) list.push(i);',
  '      m.set(key, list);',
  '    }',
  '  }',
  '  return m;',
  '})();',
  '',
  '/** Every identity a name could mean. Length > 1 means AMBIGUOUS. */',
  'export function identitiesFor(value: unknown): readonly NeighborhoodIdentity[] {',
  "  if (typeof value !== 'string') return [];",
  '  return BY_FOLDED.get(FOLD(splitQualified(value.trim()).base)) ?? [];',
  '}',
  '',
  '/**',
  ' * The identity a typed, stored or polygon name means.',
  ' *',
  ' * `borough` disambiguates. Without it an ambiguous name returns null rather than',
  ' * silently picking one — choosing between Bay Terrace in Queens and Bay Terrace',
  ' * in Staten Island is exactly the quiet substitution this contract prevents.',
  ' */',
  '/** Why a neighbourhood value did not resolve. Each needs a different repair. */',
  "export type NeighborhoodResolution = 'ok' | 'unknown' | 'ambiguous' | 'impossible_qualifier';",
  '',
  '/**',
  ' * Resolve a neighbourhood value, saying WHY when it does not resolve.',
  ' *',
  ' * A SUPPLIED QUALIFIER IS PART OF THE CRITERION AND IS NEVER IGNORED.',
  ' *',
  ' * The previous version returned the sole candidate before looking at the',
  ' * qualifier, so `Tribeca (Queens)` resolved to Tribeca in MANHATTAN. The agent',
  ' * asked for Queens and was silently given Manhattan — a changed criterion, not a',
  ' * near miss. The qualifier is now checked whenever one is present, however many',
  ' * candidates there are.',
  ' */',
  'export function resolveNeighborhood(',
  '  value: unknown,',
  '  borough?: string | null,',
  '): { state: NeighborhoodResolution; identity: NeighborhoodIdentity | null; candidates: readonly NeighborhoodIdentity[] } {',
  "  if (typeof value !== 'string') return { state: 'unknown', identity: null, candidates: [] };",
  '  const parsed = splitQualified(value.trim());',
  '  const hits = identitiesFor(value);',
  "  if (hits.length === 0) return { state: 'unknown', identity: null, candidates: [] };",
  '',
  '  const want = borough ?? parsed.borough;',
  '  if (want) {',
  '    const w = FOLD(want);',
  '    const hit = hits.find((h) => FOLD(h.borough) === w || FOLD(h.boroughLabel) === w);',
  '    // An impossible qualifier is NOT an unknown neighbourhood: the place exists,',
  '    // and the borough asked for is not where it is.',
  "    return hit",
  "      ? { state: 'ok', identity: hit, candidates: hits }",
  "      : { state: 'impossible_qualifier', identity: null, candidates: hits };",
  '  }',
  '',
  "  if (hits.length === 1) return { state: 'ok', identity: hits[0], candidates: hits };",
  "  return { state: 'ambiguous', identity: null, candidates: hits };",
  '}',
  '',
  '/** The identity a value means, or null when it does not resolve for any reason. */',
  'export function identityFor(value: unknown, borough?: string | null): NeighborhoodIdentity | null {',
  '  return resolveNeighborhood(value, borough).identity;',
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
console.log(`wrote ${TS_OUT}: ${identities.length} identities (${offered.length} offered, ${ambiguousCount} ambiguous names)`);

writeFileSync(
  resolve(REPO, JSON_OUT),
  JSON.stringify(
    {
      _generated: 'node scripts/search/generate-neighborhood-identities.mjs — do not edit',
      _meta: {
        description:
          'Canonical neighbourhood identities from the full live Cotality feed. Identity is ' +
          '(borough x normalised name). Carries the FULL accept set so Saved Search can restore ' +
          'a valid name the dropdown does not offer. A folded name mapping to more than one ' +
          'identity is AMBIGUOUS and must be qualified by borough — never auto-picked. ' +
          'Map polygon names are a SEPARATE vocabulary and are not in this file.',
        probedAt: full.probedAt,
        rowsRead: full.rowsRead,
        universe: full.universe,
        evidence: FULL,
        boroughResolution: RESOLUTION_OUT,
        totalIdentities: identities.length,
        offeredIdentities: offered.length,
        ambiguousNames: ambiguousCount,
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
  resolve(REPO, RESOLUTION_OUT),
  JSON.stringify(
    {
      generatedFrom: FULL,
      ruleOwner: RULE_OWNER,
      dominanceFloor: DOMINANCE_FLOOR,
      note:
        'EVIDENCE AND DECISION ARE SEPARATE. `observed` is what Cotality carries, uninterpreted — ' +
        'counts cannot establish whether a minority combination is provider error, a second real ' +
        'place, historical encoding or a boundary case, and this file does not claim they can. ' +
        '`resolvedTo` is the Mallan decision, with the basis and reason that produced it. An ' +
        'earlier version asserted that minority rows were provider mis-tagging; that was never ' +
        'verified and the claim has been withdrawn.',
      bases: {
        single_borough_observed: 'Every observed row sits in one borough.',
        mallan_canonical_borough: 'Mallan declares which borough the name means.',
        mallan_multi_place: 'Mallan declares the name to be more than one real place.',
        mallan_dominance_default:
          `At or above the declared ${DOMINANCE_FLOOR * 100}% floor, Mallan treats the name as ` +
          'that borough. A decision about sufficiency of evidence, NOT a claim about the residue.',
        ambiguous_requires_borough:
          'No decision and no borough at the floor. Split per borough; the bare name resolves to ' +
          'nothing and must be qualified.',
      },
      commaBearingProviderNames: {
        note:
          'These raw Cotality SubdivisionName values contain a literal comma. Authenticated '
          + 'Search therefore transports the neighborhood list as REPEATED query parameters and '
          + 'preserves each value losslessly - provider data is never transport syntax. They are '
          + 'kept here as named regression evidence: an earlier comma-joined param split them '
          + 'into two criteria, so the executor answered a question nobody asked. Covered by '
          + 'tests/runtime/neighborhood-transport-lossless.test.ts, which drives the shipped '
          + 'serializer, client, parser and executor end to end.',
        names: commaInProviderName,
      },
      resolutions: resolutionLog,
    },
    null,
    2,
  ) + '\n',
);
const byBasis = {};
for (const r of resolutionLog) byBasis[r.basis] = (byBasis[r.basis] ?? 0) + 1;
console.log('borough resolution basis:', JSON.stringify(byBasis));
