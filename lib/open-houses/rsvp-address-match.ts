/**
 * RSVP listing-linkage integrity (Codex #472 r5; field-shape + cross-street fix r12).
 *
 * `openHouseId` on the public RSVP route is request-body supplied, so a caller could
 * post a REAL `local-{showingId}` with an arbitrary address and MISATTRIBUTE — or
 * inflate — another listing's RSVP counts. On a seller report, attributing one
 * seller's open-house RSVP to another seller's listing is a trust breaker, far worse
 * than missing a count, so linkage fails CLOSED on any uncertainty.
 *
 * r12 (root fix): production stores the RESO/Trestle SPLIT address shape — `StreetName`
 * is bare/partial ("90th", "Central", "Fort Washington", "St Nicholas") with the
 * direction in `StreetDirPrefix`/`StreetDirSuffix` and the type in `StreetSuffix`.
 * Earlier rounds read only `StreetName`, so their direction/suffix logic was inert in
 * production. The comparison NAME is now composed from all four fields, and the core
 * (identity) tokens must match by EQUALITY — "Fort Washington Avenue" (core {fort,
 * washington}) must never link "Washington Avenue" (core {washington}), and vice versa.
 *
 * A submission links to the resolved listing only when ALL hold:
 *   1. every stored street-NUMBER token is present in the submitted STREET portion
 *      (r7/r9: "1400" ≠ "400"; hyphenated "25-10" → 25 AND 10);
 *   2. the submitted street portion (unit/apartment tail and post-comma city/
 *      neighborhood dropped; bare unit tokens like "2G"/"4D" stripped) matches on:
 *        - DIRECTION set equality (East ≠ West; "Broadway" ≠ "West Broadway";
 *          "Park Avenue" ≠ "Park Avenue South");
 *        - street-type SUFFIX set equality when BOTH sides carry one (Street ≠ Avenue;
 *          submitters who omit "Street" are tolerated);
 *        - CORE (identity) token set EQUALITY — Fort Washington ≠ Washington, Avenue H
 *          ≠ Avenue J — OR, for a pure-suffix name like "Broadway" (empty core), an
 *          exact suffix match with no extra submitted core.
 * Abbreviation-tolerant (E/East, St/Street, Ave/Avenue); "St" is read as Saint when it
 * leads a name (St Nicholas) and Street only as a trailing type. Pure; never throws.
 */

const DIRECTIONS = new Set([
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
]);

// Street-type words — a "suffix", never identity-proving on its own. Covers NYC
// street types so a shared suffix can never alone link two different streets.
const SUFFIXES = new Set([
  'street', 'avenue', 'road', 'boulevard', 'drive', 'lane', 'place', 'court',
  'terrace', 'parkway', 'plaza', 'square', 'way', 'walk', 'circle', 'row',
  'concourse', 'broadway', 'path', 'loop', 'alley', 'mews', 'crescent', 'oval',
  'esplanade', 'highway', 'expressway', 'turnpike', 'pike', 'slip', 'close',
  'bend', 'crossing', 'trail', 'promenade',
]);

// Abbreviation / direction canonicalization. NOTE: "st" is handled positionally in
// classify() (leading = Saint, trailing = Street), so it is NOT in this map.
const CANON: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  ave: 'avenue', av: 'avenue', rd: 'road', blvd: 'boulevard', dr: 'drive',
  ln: 'lane', pl: 'place', ct: 'court', ter: 'terrace', terr: 'terrace',
  pkwy: 'parkway', pkway: 'parkway', sq: 'square', cir: 'circle', hwy: 'highway',
  expy: 'expressway', cres: 'crescent', tpke: 'turnpike',
};

// Words (or "#") that introduce the UNIT / apartment portion of a submission.
const UNIT_MARKER = /#|\b(?:apt|apartment|unit|suite|ste|floor|fl|penthouse|room|rm)\b/;

// Trailing city/borough/state tokens dropped from the submitted street portion so
// "…, Brooklyn NY 11221" doesn't defeat core equality. Neighborhoods are open-ended
// and intentionally NOT stripped — an unlisted trailing word fails CLOSED (safe).
const LOCATION_TOKENS = new Set([
  'manhattan', 'brooklyn', 'queens', 'bronx', 'staten', 'island',
  'new', 'york', 'nyc', 'ny',
]);

function canon(t: string): string {
  return Object.prototype.hasOwnProperty.call(CANON, t) ? CANON[t] : t;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// A bare unit designator like "2G"/"4D"/"12F" (digits + letters, NOT an ordinal
// such as "90th"/"1st") that slips in without a marker keyword.
function isBareUnit(t: string): boolean {
  return /^\d+[a-z]+$/.test(t) && !/^\d+(?:st|nd|rd|th)$/.test(t);
}

// A five-digit ZIP.
function isZip(t: string): boolean {
  return /^\d{5}$/.test(t);
}

interface Parts {
  dir: Set<string>;
  suf: Set<string>;
  core: Set<string>;
}

/**
 * Classify NON-number name tokens into direction / suffix / core.
 * `exclude` holds the stored street-number tokens (already matched separately).
 * Trailing locality tokens are removed by the caller (only at the END, so a real
 * "Manhattan Avenue" / "New York Avenue" keeps its identity).
 */
function classify(tokens: string[], exclude: Set<string>): Parts {
  const dir = new Set<string>();
  const suf = new Set<string>();
  const core = new Set<string>();
  // "st" at the LAST token is a trailing "Street" type; elsewhere it is a leading/
  // medial "Saint" (St Nicholas).
  const lastIdx = tokens.length - 1;
  tokens.forEach((raw, i) => {
    if (exclude.has(raw)) return;                       // stored street-number token
    if (raw === 'st' || raw === 'saint') {
      if (raw === 'st' && i === lastIdx) suf.add('street'); // "Main St"
      else core.add('saint');                               // "St Nicholas"
      return;
    }
    // Lettered avenue: in "Avenue S" the S is the avenue's IDENTITY, not a direction —
    // otherwise "Avenue S" would collapse into the same {south} as "South Avenue".
    if (/^[nsew]$/.test(raw) && i > 0 && canon(tokens[i - 1]) === 'avenue') {
      core.add(raw);
      return;
    }
    const c = canon(raw);
    if (DIRECTIONS.has(c)) dir.add(c);
    else if (SUFFIXES.has(c)) suf.add(c);
    else core.add(c);
  });
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

  // Compose the stored comparison name from ALL RESO address fields — StreetName
  // alone is bare/partial in production; direction can live in either DirPrefix or
  // DirSuffix, the type in StreetSuffix.
  const storedFull = [
    pick('StreetDirPrefix', 'streetDirPrefix'),
    name,
    pick('StreetSuffix', 'streetSuffix'),
    pick('StreetDirSuffix', 'streetDirSuffix'),
  ].filter(Boolean).join(' ');

  // Submitted street portion: cut at the FIRST of a comma or a unit marker so the
  // apartment/floor and any trailing city/neighborhood are excluded from the name.
  const subLower = submitted.toLowerCase();
  const commaIdx = subLower.indexOf(',');
  const markerIdx = subLower.search(UNIT_MARKER);
  const cuts = [commaIdx, markerIdx].filter((i) => i >= 0);
  const cutIdx = cuts.length ? Math.min(...cuts) : -1;
  const streetPart = cutIdx >= 0 ? subLower.slice(0, cutIdx) : subLower;

  // FP-1 (Codex #472 r14): NYC repeats street names across boroughs at overlapping
  // house numbers. When the submission carries a ZIP or an explicit borough that
  // DISAGREES with the stored address, fail closed — street + number alone cannot
  // disambiguate boroughs. (Silent when the submission omits both — the honest feed
  // string does — so this only ADDS safety, never drops a legitimate own-address RSVP.)
  const storedZip5 = pick('PostalCode', 'postalCode').replace(/\D/g, '').slice(0, 5);
  const subZips = subLower.match(/\b\d{5}\b/g);
  const subZip = subZips ? subZips[subZips.length - 1] : '';
  if (storedZip5.length === 5 && subZip && storedZip5 !== subZip) return false;
  const BOROUGHS = ['staten island', 'manhattan', 'brooklyn', 'queens', 'bronx'];
  const storedCity = pick('City', 'city').toLowerCase();
  const subBorough = BOROUGHS.find((b) => subLower.includes(b));
  const storedBorough = BOROUGHS.find((b) => storedCity.includes(b));
  if (subBorough && storedBorough && subBorough !== storedBorough) return false;

  // Drop bare unit designators ("2G") that survive without a marker.
  const streetTokens = tokenize(streetPart).filter((t) => !isBareUnit(t));

  // The submitted HOUSE NUMBER is the LEADING run of pure-numeric tokens — handles
  // hyphenated Queens numbers ("25-10" → 25,10) and ranges ("400-402" → 400,402).
  // Everything after it is the street NAME. A number appearing later (a bare floor,
  // "…Street 4") is NOT the house number and must not satisfy the stored number.
  let hn = 0;
  while (hn < streetTokens.length && /^\d+$/.test(streetTokens[hn])) hn++;
  const houseTokens = streetTokens.slice(0, hn);
  const nameTokens = streetTokens.slice(hn);

  // 1. street number: the stored number tokens must be an ORDERED PREFIX of the
  // leading house run — so hyphenated Queens numbers keep their order ("25-10" ≠
  // "10-25", different buildings) while a single "400" still matches a "400-402"
  // range building. (r7: "1400" ≠ "400" — the runs already differ at index 0.)
  const numTokens = tokenize(num).filter((t) => !isBareUnit(t));
  if (
    numTokens.length === 0 ||
    numTokens.length > houseTokens.length ||
    !numTokens.every((t, i) => houseTokens[i] === t)
  ) return false;

  // Strip a TRAILING run of city/borough/state/ZIP tokens only — a mid-name
  // borough word ("Manhattan Avenue", "New York Avenue") is part of the street
  // identity and must be kept; only a trailing "…Street Brooklyn NY 11221" is dropped.
  let end = nameTokens.length;
  while (end > 0 && (LOCATION_TOKENS.has(nameTokens[end - 1]) || isZip(nameTokens[end - 1]))) end--;

  // 2. street name (house number removed; trailing locality trimmed).
  const stored = classify(tokenize(storedFull), new Set());
  const sub = classify(nameTokens.slice(0, end), new Set());

  // Direction must AGREE (East ≠ West; directionless ≠ directioned).
  if (!setEq(stored.dir, sub.dir)) return false;
  // Street-type suffix must agree when BOTH sides carry one (Street ≠ Avenue);
  // a submitter who omits the suffix (DTO "400 East 90th") is tolerated.
  if (stored.suf.size > 0 && sub.suf.size > 0 && !setEq(stored.suf, sub.suf)) return false;

  if (stored.core.size === 0) {
    // Pure suffix/direction name (e.g. "Broadway"): fail closed unless the suffix
    // matches exactly and the submission carries no extra distinctive word.
    return sub.core.size === 0 && stored.suf.size > 0 && setEq(stored.suf, sub.suf);
  }
  // Core (identity) tokens must match by EQUALITY — Fort Washington ≠ Washington,
  // Avenue H ≠ Avenue J. Trailing city/neighborhood/unit tokens were already removed.
  return setEq(stored.core, sub.core);
}
