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
  const sub = submitted.toLowerCase();
  // Codex #472 r7: the street number must match as an EXACT token — substring
  // matching accepted "1400 East 90th" for a listing at "400" (prefix hit).
  // Tokenize on non-alphanumerics so hyphenated ranges ("400-402") still
  // yield the "400" token; "90" must not match the "90th" token.
  const subTokens = sub.split(/[^a-z0-9]+/).filter(Boolean);
  if (!subTokens.includes(num.toLowerCase())) return false;
  // Meaningful tokens: contain a digit (ordinals like "90th") or are >3 chars
  // (skips "e"/"st"-style abbreviation mismatches on the LISTING side).
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && (/\d/.test(t) || t.length > 3));
  if (tokens.length === 0) return false;
  return tokens.some((t) => sub.includes(t));
}
