/**
 * Tests for the natural language search parser.
 *
 * Real NYC queries → expected SearchFilters, neighborhood, borough, tab.
 * Uses NYC dictionary for resolution — no hardcoded lists.
 */

import { parseNaturalLanguageSearch } from '../natural-language-parser';

describe('parseNaturalLanguageSearch', () => {
  // ── Core NYC search queries ──

  it('sunny 2br UES doorman under 3M', () => {
    const result = parseNaturalLanguageSearch('sunny 2br UES doorman under 3M');
    expect(result.filters.beds).toBe(2);
    expect(result.filters.maxPrice).toBe(3_000_000);
    expect(result.neighborhood).toBe('Upper East Side');
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['doorman', 'natural-light']),
    );
  });

  it('wburg flex 2 w/d no fee', () => {
    const result = parseNaturalLanguageSearch('wburg flex 2 w/d no fee');
    expect(result.neighborhood).toBe('Williamsburg');
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['washer-dryer', 'no-fee']),
    );
    // flex 2 → propertySubTypes
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Flex 2']),
    );
  });

  it('prewar coop park slope 2-4M', () => {
    const result = parseNaturalLanguageSearch('prewar coop park slope 2-4M');
    expect(result.filters.yearBuilt).toBe('pre-war');
    expect(result.filters.ownershipTypes).toEqual(
      expect.arrayContaining(['Co-op']),
    );
    expect(result.neighborhood).toBe('Park Slope');
    expect(result.filters.minPrice).toBe(2_000_000);
    expect(result.filters.maxPrice).toBe(4_000_000);
  });

  it('pet friendly 1bed near the L under 3k', () => {
    const result = parseNaturalLanguageSearch('pet friendly 1bed near the L under 3k');
    expect(result.filters.beds).toBe(1);
    expect(result.filters.maxPrice).toBe(3_000);
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['pet-friendly']),
    );
    expect(result.filters.transit).toBeDefined();
    expect(result.filters.transit!.line).toBe('L');
  });

  it('sponsor unit fidi', () => {
    const result = parseNaturalLanguageSearch('sponsor unit fidi');
    expect(result.neighborhood).toBe('Financial District');
    expect(result.filters.ownershipTypes).toEqual(
      expect.arrayContaining(['Sponsor Unit']),
    );
  });

  it('jr4 UES under 2M', () => {
    const result = parseNaturalLanguageSearch('jr4 UES under 2M');
    expect(result.neighborhood).toBe('Upper East Side');
    expect(result.filters.maxPrice).toBe(2_000_000);
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Jr. 4']),
    );
  });

  it('BK brownstone', () => {
    const result = parseNaturalLanguageSearch('BK brownstone');
    expect(result.borough).toBe('Brooklyn');
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Townhouse']),
    );
  });

  it('penthouse tribeca views', () => {
    const result = parseNaturalLanguageSearch('penthouse tribeca views');
    expect(result.neighborhood).toBe('Tribeca');
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Penthouse']),
    );
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['views']),
    );
  });

  it('HK 1br rent under 4k doorman gym', () => {
    const result = parseNaturalLanguageSearch('HK 1br rent under 4k doorman gym');
    expect(result.tab).toBe('rent-residential');
    expect(result.neighborhood).toBe("Hell's Kitchen");
    expect(result.filters.beds).toBe(1);
    expect(result.filters.maxPrice).toBe(4_000);
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['doorman', 'gym']),
    );
  });

  // ── Rent vs Buy intent ──

  it('detects rental intent', () => {
    const result = parseNaturalLanguageSearch('rent 2br chelsea');
    expect(result.tab).toBe('rent-residential');
    expect(result.neighborhood).toBe('Chelsea');
    expect(result.filters.beds).toBe(2);
  });

  it('detects buy intent', () => {
    const result = parseNaturalLanguageSearch('buy condo tribeca');
    expect(result.tab).toBe('buy-residential');
    expect(result.neighborhood).toBe('Tribeca');
    expect(result.filters.ownershipTypes).toEqual(
      expect.arrayContaining(['Condo']),
    );
  });

  // ── Price patterns ──

  it('parses "under $2M"', () => {
    const result = parseNaturalLanguageSearch('under $2M');
    expect(result.filters.maxPrice).toBe(2_000_000);
  });

  it('parses "over $1M"', () => {
    const result = parseNaturalLanguageSearch('over $1M');
    expect(result.filters.minPrice).toBe(1_000_000);
  });

  it('parses price range "$500K-$1M"', () => {
    const result = parseNaturalLanguageSearch('$500K-$1M');
    expect(result.filters.minPrice).toBe(500_000);
    expect(result.filters.maxPrice).toBe(1_000_000);
  });

  it('parses "2M+" as min price', () => {
    const result = parseNaturalLanguageSearch('2M+');
    expect(result.filters.minPrice).toBe(2_000_000);
  });

  it('parses "under 3k" for rentals', () => {
    const result = parseNaturalLanguageSearch('under 3k');
    expect(result.filters.maxPrice).toBe(3_000);
  });

  // ── Bedroom patterns ──

  it('parses studio', () => {
    const result = parseNaturalLanguageSearch('studio chelsea');
    expect(result.filters.beds).toBe(0);
    expect(result.neighborhood).toBe('Chelsea');
  });

  it('parses "3br"', () => {
    const result = parseNaturalLanguageSearch('3br UWS');
    expect(result.filters.beds).toBe(3);
    expect(result.neighborhood).toBe('Upper West Side');
  });

  it('parses "true 2" as keyword + beds', () => {
    const result = parseNaturalLanguageSearch('true 2 UES');
    expect(result.filters.beds).toBe(2);
    expect(result.filters.keywords).toEqual(expect.arrayContaining(['true 2']));
    expect(result.neighborhood).toBe('Upper East Side');
  });

  // ── Bathroom patterns ──

  it('parses "2 bath"', () => {
    const result = parseNaturalLanguageSearch('3br 2bath');
    expect(result.filters.beds).toBe(3);
    expect(result.filters.baths).toBe(2);
  });

  // ── Property types via lingo ──

  it('parses co-op', () => {
    const result = parseNaturalLanguageSearch('co-op UES');
    expect(result.filters.ownershipTypes).toEqual(
      expect.arrayContaining(['Co-op']),
    );
    expect(result.neighborhood).toBe('Upper East Side');
  });

  it('parses condo', () => {
    const result = parseNaturalLanguageSearch('condo midtown east');
    expect(result.filters.ownershipTypes).toEqual(
      expect.arrayContaining(['Condo']),
    );
    expect(result.neighborhood).toBe('Midtown East');
  });

  it('parses townhouse', () => {
    const result = parseNaturalLanguageSearch('townhouse brooklyn heights');
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Townhouse']),
    );
    expect(result.neighborhood).toBe('Brooklyn Heights');
  });

  it('parses condop', () => {
    const result = parseNaturalLanguageSearch('condop gramercy');
    expect(result.filters.ownershipTypes).toEqual(
      expect.arrayContaining(['Condop']),
    );
    expect(result.neighborhood).toBe('Gramercy');
  });

  it('parses new development', () => {
    const result = parseNaturalLanguageSearch('new development hudson yards');
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['New Development']),
    );
    expect(result.neighborhood).toBe('Hudson Yards');
  });

  // ── Year built ──

  it('parses prewar', () => {
    const result = parseNaturalLanguageSearch('prewar UWS');
    expect(result.filters.yearBuilt).toBe('pre-war');
  });

  it('parses postwar', () => {
    const result = parseNaturalLanguageSearch('postwar midtown east');
    expect(result.filters.yearBuilt).toBe('post-war');
  });

  // ── NYC lingo ──

  it('parses alcove studio', () => {
    const result = parseNaturalLanguageSearch('alcove studio chelsea');
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Alcove Studio']),
    );
    // alcove studio contains "studio" which should set beds=0
    expect(result.neighborhood).toBe('Chelsea');
  });

  it('parses walk-up', () => {
    const result = parseNaturalLanguageSearch('walkup east village');
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Walk-Up']),
    );
    expect(result.neighborhood).toBe('East Village');
  });

  it('parses railroad apartment', () => {
    const result = parseNaturalLanguageSearch('railroad apartment LES');
    expect(result.filters.propertySubTypes).toEqual(
      expect.arrayContaining(['Railroad']),
    );
    expect(result.neighborhood).toBe('Lower East Side');
  });

  // ── Keyword patterns ──

  it('parses "high floor"', () => {
    const result = parseNaturalLanguageSearch('high floor UES 2br');
    expect(result.filters.keywords).toEqual(expect.arrayContaining(['high floor']));
    expect(result.filters.beds).toBe(2);
  });

  it('parses "south facing"', () => {
    const result = parseNaturalLanguageSearch('south facing condo tribeca');
    expect(result.filters.keywords).toEqual(expect.arrayContaining(['south facing']));
    expect(result.neighborhood).toBe('Tribeca');
  });

  it('parses "open kitchen"', () => {
    const result = parseNaturalLanguageSearch('open kitchen 2br UWS');
    expect(result.filters.keywords).toEqual(expect.arrayContaining(['open kitchen']));
    expect(result.filters.beds).toBe(2);
  });

  // ── Transit ──

  it('parses "near the L"', () => {
    const result = parseNaturalLanguageSearch('2br near the L williamsburg');
    expect(result.filters.transit).toBeDefined();
    expect(result.filters.transit!.line).toBe('L');
    expect(result.filters.beds).toBe(2);
    expect(result.neighborhood).toBe('Williamsburg');
  });

  it('parses "6 train"', () => {
    const result = parseNaturalLanguageSearch('condo near 6 train UES');
    expect(result.filters.transit).toBeDefined();
    expect(result.filters.transit!.line).toBe('6');
  });

  it('parses grouped subway "ACE"', () => {
    const result = parseNaturalLanguageSearch('near ACE chelsea');
    expect(result.filters.transit).toBeDefined();
    expect(result.filters.transit!.line).toBe('A/C/E');
  });

  it('parses "near subway"', () => {
    const result = parseNaturalLanguageSearch('2br near subway UWS');
    expect(result.filters.transit).toBeDefined();
    expect(result.filters.transit!.line).toBe('subway');
  });

  // ── Neighborhoods (dictionary resolution) ──

  it('resolves "wburg" to Williamsburg', () => {
    const result = parseNaturalLanguageSearch('wburg 1br');
    expect(result.neighborhood).toBe('Williamsburg');
  });

  it('resolves "EV" to East Village', () => {
    const result = parseNaturalLanguageSearch('2br EV');
    expect(result.neighborhood).toBe('East Village');
  });

  it('resolves "soho" to SoHo', () => {
    const result = parseNaturalLanguageSearch('loft soho');
    expect(result.neighborhood).toBe('SoHo');
  });

  it('resolves "dumbo" to DUMBO', () => {
    const result = parseNaturalLanguageSearch('condo dumbo');
    expect(result.neighborhood).toBe('DUMBO');
  });

  it('resolves "prospect hts" to Prospect Heights', () => {
    const result = parseNaturalLanguageSearch('2br prospect hts');
    expect(result.neighborhood).toBe('Prospect Heights');
  });

  it('resolves "LIC" to Long Island City', () => {
    const result = parseNaturalLanguageSearch('studio LIC');
    expect(result.neighborhood).toBe('Long Island City');
  });

  it('resolves "the heights" to Washington Heights', () => {
    const result = parseNaturalLanguageSearch('2br the heights');
    expect(result.neighborhood).toBe('Washington Heights');
  });

  // ── Boroughs ──

  it('resolves "BK" to Brooklyn', () => {
    const result = parseNaturalLanguageSearch('BK 2br under 3k');
    expect(result.borough).toBe('Brooklyn');
    expect(result.filters.beds).toBe(2);
    expect(result.filters.maxPrice).toBe(3_000);
  });

  it('resolves "queens" to Queens', () => {
    const result = parseNaturalLanguageSearch('queens 1br');
    expect(result.borough).toBe('Queens');
  });

  it('resolves "the bronx" to Bronx', () => {
    const result = parseNaturalLanguageSearch('the bronx 2br');
    expect(result.borough).toBe('Bronx');
  });

  // ── Amenities (original set preserved) ──

  it('parses "w/d"', () => {
    const result = parseNaturalLanguageSearch('2br w/d chelsea');
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['washer-dryer']),
    );
  });

  it('parses "high ceilings"', () => {
    const result = parseNaturalLanguageSearch('loft high ceilings soho');
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['high-ceilings']),
    );
  });

  it('parses "no fee"', () => {
    const result = parseNaturalLanguageSearch('no fee 1br east village');
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['no-fee']),
    );
  });

  it('parses "balcony"', () => {
    const result = parseNaturalLanguageSearch('balcony 2br UWS');
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['outdoor-space']),
    );
  });

  it('parses "renovated"', () => {
    const result = parseNaturalLanguageSearch('renovated 3br park slope');
    expect(result.filters.amenities).toEqual(
      expect.arrayContaining(['renovated']),
    );
  });

  // ── Furnished / Open House / Sqft ──

  it('parses furnished', () => {
    const result = parseNaturalLanguageSearch('furnished studio midtown east');
    expect(result.filters.furnished).toBe(true);
    expect(result.filters.beds).toBe(0);
  });

  it('parses open house', () => {
    const result = parseNaturalLanguageSearch('open house UES 2br');
    expect(result.filters.openHouse).toBe(true);
  });

  it('parses sqft', () => {
    const result = parseNaturalLanguageSearch('1500 sqft loft');
    expect(result.filters.minSqft).toBe(1500);
  });

  // ── Edge cases ──

  it('handles empty string', () => {
    const result = parseNaturalLanguageSearch('');
    expect(result.tab).toBe('buy-residential');
    expect(result.filters).toEqual({});
    expect(result.neighborhood).toBeUndefined();
    expect(result.borough).toBeUndefined();
  });

  it('handles plain text with no signals', () => {
    const result = parseNaturalLanguageSearch('something random here');
    expect(result.tab).toBe('buy-residential');
    expect(result.neighborhood).toBeUndefined();
  });

  it('neighborhood takes precedence over borough (park slope implies Brooklyn)', () => {
    const result = parseNaturalLanguageSearch('2br park slope');
    expect(result.neighborhood).toBe('Park Slope');
    // borough is set from neighborhood resolution
    expect(result.borough).toBe('Brooklyn');
  });

  it('does not parse single letters as transit (no false positives)', () => {
    // "N" should not be parsed as a subway line without context
    const result = parseNaturalLanguageSearch('nice apartment chelsea');
    expect(result.filters.transit).toBeUndefined();
  });
});
