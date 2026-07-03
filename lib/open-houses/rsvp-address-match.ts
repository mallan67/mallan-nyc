/**
 * RSVP listing-linkage integrity (Codex #472 r5).
 *
 * `openHouseId` on the public RSVP route is request-body supplied, so a
 * caller could post a REAL `local-{showingId}` with arbitrary address text
 * and inflate another listing's RSVP counts. Linking therefore requires the
 * SUBMITTED address to plausibly match the resolved listing's address:
 * street number present AND at least one meaningful street-name token
 * present (case-insensitive). Fails CLOSED — no linkage rather than a wrong
 * one. Case-tolerant address JSON (PascalCase canonical, camelCase legacy).
 * Pure; never throws.
 */
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
  const subTokens = new Set(submitted.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  // Codex #472 r7+r9: the street number must match as EXACT token(s). r7 fixed
  // the prefix-substring hole ("1400" vs "400"); r9 tokenizes the STORED number
  // too, so a Queens hyphenated number like "25-10" (tokens 25,10) matches a
  // submitted "25-10 30th Ave" — every stored number token must be present.
  const numTokens = num.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (numTokens.length === 0 || !numTokens.every((t) => subTokens.has(t))) return false;
  // Codex #472 r8: require a DISTINCTIVE street token matched as an EXACT
  // token — generic direction/suffix words (street, east, …) are too common
  // to prove identity, so "400 Fake Street" / "400 East 91st Street" must not
  // link to "400 East 90th Street". Distinctive = has a digit (ordinals like
  // "90th"/"46th") or length>3 AND not a generic word. A name with no
  // distinctive token fails CLOSED (no linkage rather than a wrong one).
  const GENERIC = new Set([
    'street', 'st', 'avenue', 'ave', 'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr',
    'lane', 'ln', 'place', 'pl', 'court', 'ct', 'terrace', 'ter', 'parkway', 'pkwy',
    'plaza', 'square', 'sq', 'way', 'walk', 'north', 'south', 'east', 'west', 'n', 's', 'e', 'w',
  ]);
  const distinctive = name.toLowerCase().split(/[^a-z0-9]+/).filter(
    (t) => t && !GENERIC.has(t) && (/\d/.test(t) || t.length > 3)
  );
  if (distinctive.length === 0) return false;
  return distinctive.some((t) => subTokens.has(t));
}
