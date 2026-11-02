/**
 * The address lookup behind the Sale / Rental forms (GET /api/buildings/search): small, pure helpers.
 *
 * Why they exist (found against the live index, 2026-11-02): typing "800 2nd Ave" found the right building but
 *   - its name came back as the TEXT "null" (a stored address carried the string, not a missing value) and was typed into Building Name,
 *   - its neighborhood was empty although another listing of the same building knows it ("Turtle Bay"), so nothing was picked,
 *   - two unrelated Brooklyn buildings (8001 12th Avenue, 8002 21st Avenue) came back with it, so the form saw three candidates and applied none,
 *   - "800 Second Avenue" and "800 2nd Avenue 806" (the unit typed in the address box) found nothing at all.
 */

const ORDINAL_WORDS: Record<string, string> = {
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
};

/** A stored text value as text: '' for a missing value AND for the literal words "null" / "undefined" that a stringified missing value leaves behind. */
export function cleanBuildingText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return /^(null|undefined)$/i.test(text) ? '' : text;
}

/** "2nd" -> "2", "Second" -> "2", "46th" -> "46"; anything else is returned as it came (lower-cased and trimmed). */
export function ordinalToNumber(word: string): string {
  const w = word.trim().toLowerCase();
  if (ORDINAL_WORDS[w]) return ORDINAL_WORDS[w];
  return w.replace(/^(\d+)(st|nd|rd|th)$/, '$1');
}

const SUFFIX_WORDS = 'street|st|avenue|ave|boulevard|blvd|place|pl|drive|dr|road|rd|lane|ln|way|court|ct|terrace|ter|parkway|pkwy|square|sq|plaza|plz|alley|aly|circle|cir';

/**
 * The typed text as an address search wants it. A NUMBERED address (a leading digit) is cleaned twice:
 *   - a trailing unit is dropped ("800 2nd Ave #806", "800 2nd Avenue, Apt 806", "333 East 46th Street 2G"): the building has no unit;
 *   - an ordinal word is written as its numeral ("800 Second Avenue" -> "800 2 Avenue"; the search already treats "2nd" and "2" alike).
 * Text without a leading number (a building name, "Turtle Bay") is returned untouched, and "425 Park Avenue South" keeps its direction (no digit, so not a unit).
 */
export function normalizeBuildingQuery(query: string): string {
  const text = query.trim().replace(/\s+/g, ' ');
  if (!/^\d/.test(text)) return text;

  let street = text;
  const marked = street.match(/^(.*?)[\s,]*(?:#|\b(?:apt|apartment|unit|ste|suite|fl|floor)\b\.?)\s*[A-Za-z0-9-]{1,8}\s*$/i);
  if (marked && marked[1].trim()) {
    street = marked[1].trim();
  } else {
    const bare = street.match(new RegExp(`^(.*\\b(?:${SUFFIX_WORDS})\\b\\.?)[\\s,]+([A-Za-z0-9-]{1,8})$`, 'i'));
    if (bare && /\d/.test(bare[2])) street = bare[1].trim();
  }
  street = street.replace(/[,\s]+$/, '');

  return street
    .split(' ')
    .map((token) => (ORDINAL_WORDS[token.toLowerCase()] ? ORDINAL_WORDS[token.toLowerCase()] : token))
    .join(' ');
}

/**
 * A numbered street ("2nd Avenue", typed as the digits "2") names ONE street: "2", "2nd", "2ND" match, "12th" and "21st" do not. The index looks a name up with a
 * "contains" so a partial name still finds its building; for a number that lets 12th and 21st Avenue ride along, and a lookup with three candidates applies none.
 * Anything that is not a plain number is left to the index's own match.
 */
export function numberedStreetMatches(resultStreetName: unknown, typedStreetName: string | undefined): boolean {
  if (!typedStreetName) return true;
  const typed = ordinalToNumber(typedStreetName);
  if (!/^\d+$/.test(typed)) return true;
  return ordinalToNumber(cleanBuildingText(resultStreetName)) === typed;
}

/** A building seen through another of its listings: fill what the first listing left blank (name, neighborhood), never overwrite what is there. */
export function backfillBuildingIdentity(existing: Record<string, unknown>, seen: { name?: string; neighborhood?: string; subdivisionName?: string }): void {
  if (!cleanBuildingText(existing.name) && seen.name) existing.name = seen.name;
  if (!cleanBuildingText(existing.neighborhood) && seen.neighborhood) existing.neighborhood = seen.neighborhood;
  if (!cleanBuildingText(existing.subdivisionName) && (seen.subdivisionName || seen.neighborhood)) existing.subdivisionName = seen.subdivisionName || seen.neighborhood;
}

/**
 * The live Cotality record of a building we already hold a stored copy of. The live API is the provider authority, so the AREA it names (SubdivisionName) wins over the
 * stored copy's (which may be blank, or older); a building name only fills a blank (a saved Mallan profile may carry its own name).
 */
export function applyLiveBuildingIdentity(existing: Record<string, unknown>, live: { name?: string; neighborhood?: string }): void {
  if (live.neighborhood) {
    existing.neighborhood = live.neighborhood;
    existing.subdivisionName = live.neighborhood;
  }
  if (!cleanBuildingText(existing.name) && live.name) existing.name = live.name;
}
