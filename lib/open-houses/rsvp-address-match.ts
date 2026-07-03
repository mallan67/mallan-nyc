/**
 * RSVP listing-linkage integrity (Codex #472 r5, tightened r11).
 *
 * `openHouseId` on the public RSVP route is request-body supplied, so a caller
 * could post a REAL `local-{showingId}` with an arbitrary address and MISATTRIBUTE
 * — or inflate — another listing's RSVP counts. On a seller report a false POSITIVE
 * (a seller's RSVP attributed to the wrong listing) is a trust problem far worse
 * than a false negative, so linkage fails CLOSED on any uncertainty. A submission
 * links to the resolved listing only when ALL of the following hold:
 *   1. every stored street-NUMBER token is present as an exact token in the
 *      submitted STREET portion (r7/r9: "1400" ≠ "400"; hyphenated "25-10" → 25 AND 10);
 *   2. street-NAME agreement, computed over the street portion only (the unit /
 *      apartment tail is stripped so "Apt A" cannot satisfy an "Avenue A" name):
 *        - direction words must AGREE (East ≠ West; "Broadway" ≠ "West Broadway");
 *        - street-type suffixes must agree when BOTH sides carry one (Street ≠ Avenue);
 *        - every distinctive "core" token (neither a direction nor a street-type
 *          word) of the stored name must appear in the submitted street portion,
 *          and there must be ≥1 such core token — OR, for a pure suffix name like
 *          "Broadway" (no core), the suffixes must match exactly and the submission
 *          must carry no extra distinctive word.
 * Case- and abbreviation-tolerant (E/East, St/Street, Ave/Avenue …). Pure; never throws.
 */

const DIRECTIONS = new Set([
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
]);

// Street-type words — anything here is a "suffix" and is never identity-proving on
// its own. Expanded (Codex #472 r11) to cover NYC street types (circle, row,
// concourse, broadway, …) so a shared suffix can never alone link two streets.
const SUFFIXES = new Set([
  'street', 'avenue', 'road', 'boulevard', 'drive', 'lane', 'place', 'court',
  'terrace', 'parkway', 'plaza', 'square', 'way', 'walk', 'circle', 'row',
  'concourse', 'broadway', 'path', 'loop', 'alley', 'mews', 'crescent', 'oval',
  'esplanade', 'highway', 'expressway', 'turnpike', 'pike', 'slip', 'close',
  'bend', 'crossing', 'trail', 'promenade',
]);

// Abbreviation / direction canonicalization so "E" == "East", "St" == "Street".
const CANON: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  st: 'street', ave: 'avenue', av: 'avenue', rd: 'road', blvd: 'boulevard',
  dr: 'drive', ln: 'lane', pl: 'place', ct: 'court', ter: 'terrace', terr: 'terrace',
  pkwy: 'parkway', pkway: 'parkway', sq: 'square', cir: 'circle', hwy: 'highway',
  expy: 'expressway', cres: 'crescent', tpke: 'turnpike',
};

// Words (or "#") that introduce the UNIT / apartment portion of a submitted
// address. Everything from the first marker onward is dropped before street-name
// comparison, so an "Apt A" / "Unit 5" tail cannot satisfy a street-name token.
const UNIT_MARKER = /#|\b(?:apt|apartment|unit|suite|ste|floor|fl|penthouse|room|rm)\b/;

function canon(t: string): string {
  return Object.prototype.hasOwnProperty.call(CANON, t) ? CANON[t] : t;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

interface Parts {
  dir: Set<string>;
  suf: Set<string>;
  core: Set<string>;
}

function classify(tokens: string[], excludeNumbers: Set<string>): Parts {
  const dir = new Set<string>();
  const suf = new Set<string>();
  const core = new Set<string>();
  for (const raw of tokens) {
    if (excludeNumbers.has(raw)) continue; // street-number tokens are matched separately
    const c = canon(raw);
    if (DIRECTIONS.has(c)) dir.add(c);
    else if (SUFFIXES.has(c)) suf.add(c);
    else core.add(c);
  }
  return { dir, suf, core };
}

function setEq(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function rsvpAddressMatches(addressJson: unknown, submitted: unknown): boolean {
  if (typeof submitted !== 'string' || !submitted.trim()) return false;
  const a = (addressJson && typeof addressJson === 'object' ? addressJson : {}) as Record<string, unknown>;
  const pick = (pascal: string, camel: string): string => {
    const pv = typeof a[pascal] === 'string' ? (a[pascal] as string).trim() : '';
    if (pv) return pv;
    return typeof a[camel] === 'string' ? (a[camel] as string).trim() : '';
  };
  const num = pick('StreetNumber', 'streetNumber');
  const name = pick('StreetName', 'streetName');
  if (!num || !name) return false;

  // Compare against the STREET portion only — drop the unit/apartment tail so an
  // apartment letter/number can never satisfy a street-name (or street-number) token.
  const subLower = submitted.toLowerCase();
  const markerIdx = subLower.search(UNIT_MARKER);
  const streetPart = markerIdx >= 0 ? subLower.slice(0, markerIdx) : subLower;
  const streetTokens = tokenize(streetPart);
  const streetTokenSet = new Set(streetTokens);

  // 1. street number: every stored number token present as an exact token.
  const numTokens = tokenize(num);
  if (numTokens.length === 0 || !numTokens.every((t) => streetTokenSet.has(t))) return false;
  const numSet = new Set(numTokens);

  // 2. street name.
  const stored = classify(tokenize(name), new Set());
  const sub = classify(streetTokens, numSet);

  // Direction must AGREE (East ≠ West; a directionless name ≠ a directioned one).
  if (!setEq(stored.dir, sub.dir)) return false;
  // Street-type suffix must agree when BOTH sides carry one (Street ≠ Avenue).
  // If either side omits the suffix, don't penalise (submitters drop "Street").
  if (stored.suf.size > 0 && sub.suf.size > 0 && !setEq(stored.suf, sub.suf)) return false;

  if (stored.core.size === 0) {
    // Pure suffix/direction name (e.g. "Broadway"): fail closed unless the suffix
    // matches exactly and the submission carries no extra distinctive word.
    return sub.core.size === 0 && stored.suf.size > 0 && setEq(stored.suf, sub.suf);
  }
  // Every distinctive core token of the stored name must appear in the submitted
  // street portion. Subset (not equality) so trailing city/neighborhood tokens
  // ("Astoria") and bare unit tokens don't break a legitimate match.
  for (const t of stored.core) if (!sub.core.has(t)) return false;
  return true;
}
