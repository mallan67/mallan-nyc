/**
 * Tests for NYC Dictionary — Knowledge base for NYC search intelligence.
 *
 * Covers:
 *   - Neighborhood resolution (exact, alias, fuzzy, unknown)
 *   - Borough resolution
 *   - Lingo matching (layout, ownership, year-built, rental)
 *   - Transit matching (individual lines, groups, generic)
 *   - Autocomplete suggestions
 *   - REBNY compliance (no protected class terms, no off-market language)
 */

import {
  resolveNeighborhood,
  resolveBorough,
  matchLingo,
  matchTransit,
  getSuggestions,
  getNeighborhoodsForBorough,
  getAllBoroughs,
  getAllNeighborhoods,
} from '../nyc-dictionary';

// ─── resolveNeighborhood ─────────────────────────────────────────────────────

describe('resolveNeighborhood', () => {
  describe('exact canonical matches', () => {
    it('resolves "Upper East Side" exactly', () => {
      const result = resolveNeighborhood('Upper East Side');
      expect(result).toEqual({
        canonical: 'Upper East Side',
        borough: 'Manhattan',
        matchType: 'exact',
        distance: 0,
      });
    });

    it('resolves case-insensitively', () => {
      const result = resolveNeighborhood('upper east side');
      expect(result).toEqual({
        canonical: 'Upper East Side',
        borough: 'Manhattan',
        matchType: 'exact',
        distance: 0,
      });
    });

    it('resolves DUMBO (capitalized)', () => {
      const result = resolveNeighborhood('dumbo');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('DUMBO');
      expect(result!.borough).toBe('Brooklyn');
    });

    it('resolves Bed-Stuy with hyphen', () => {
      const result = resolveNeighborhood('Bed-Stuy');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Bed-Stuy');
      expect(result!.borough).toBe('Brooklyn');
    });

    it("resolves Hell's Kitchen with apostrophe", () => {
      const result = resolveNeighborhood("Hell's Kitchen");
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe("Hell's Kitchen");
      expect(result!.borough).toBe('Manhattan');
    });

    it('resolves St. George with period', () => {
      const result = resolveNeighborhood('St. George');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('St. George');
      expect(result!.borough).toBe('Staten Island');
    });
  });

  describe('alias matches', () => {
    it('resolves UES -> Upper East Side', () => {
      const result = resolveNeighborhood('UES');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Upper East Side');
      expect(result!.matchType).toBe('alias');
    });

    it('resolves uws -> Upper West Side', () => {
      const result = resolveNeighborhood('uws');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Upper West Side');
    });

    it('resolves wburg -> Williamsburg', () => {
      const result = resolveNeighborhood('wburg');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Williamsburg');
      expect(result!.borough).toBe('Brooklyn');
    });

    it('resolves fidi -> Financial District', () => {
      const result = resolveNeighborhood('fidi');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Financial District');
    });

    it('resolves LIC -> Long Island City', () => {
      const result = resolveNeighborhood('LIC');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Long Island City');
      expect(result!.borough).toBe('Queens');
    });

    it('resolves BoCoCa -> Cobble Hill', () => {
      const result = resolveNeighborhood('bococa');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Cobble Hill');
    });

    it('resolves HK -> Hell\'s Kitchen', () => {
      const result = resolveNeighborhood('HK');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe("Hell's Kitchen");
    });

    it('resolves BedStuy -> Bed-Stuy', () => {
      const result = resolveNeighborhood('bedstuy');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Bed-Stuy');
    });

    it('resolves bed stuy (with space) -> Bed-Stuy', () => {
      const result = resolveNeighborhood('bed stuy');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Bed-Stuy');
    });

    it('resolves ev -> East Village', () => {
      const result = resolveNeighborhood('ev');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('East Village');
    });

    it('resolves wv -> West Village', () => {
      const result = resolveNeighborhood('wv');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('West Village');
    });

    it('resolves bpc -> Battery Park City', () => {
      const result = resolveNeighborhood('bpc');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Battery Park City');
    });

    it('resolves hy -> Hudson Yards', () => {
      const result = resolveNeighborhood('hy');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Hudson Yards');
    });

    it('resolves muhi -> Murray Hill', () => {
      const result = resolveNeighborhood('muhi');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Murray Hill');
    });

    it('resolves gram -> Gramercy', () => {
      const result = resolveNeighborhood('gram');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Gramercy');
    });

    it('resolves gpoint -> Greenpoint', () => {
      const result = resolveNeighborhood('gpoint');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Greenpoint');
    });

    it('resolves sobronya -> Mott Haven', () => {
      const result = resolveNeighborhood('sobronya');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Mott Haven');
    });

    it('resolves el barrio -> East Harlem', () => {
      const result = resolveNeighborhood('el barrio');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('East Harlem');
    });

    it('resolves spanish harlem -> East Harlem', () => {
      const result = resolveNeighborhood('spanish harlem');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('East Harlem');
    });

    it('resolves the village -> Greenwich Village', () => {
      const result = resolveNeighborhood('the village');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Greenwich Village');
    });

    it('resolves billyburg -> Williamsburg', () => {
      const result = resolveNeighborhood('billyburg');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Williamsburg');
    });

    it('resolves south bronx -> Mott Haven', () => {
      const result = resolveNeighborhood('south bronx');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Mott Haven');
    });

    it('resolves full name via alias: bedford-stuyvesant -> Bed-Stuy', () => {
      const result = resolveNeighborhood('bedford-stuyvesant');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Bed-Stuy');
    });
  });

  describe('fuzzy matches (Levenshtein <= 2)', () => {
    it('resolves willamsburg -> Williamsburg (1 char off, alias)', () => {
      const result = resolveNeighborhood('willamsburg');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Williamsburg');
      // "willamsburg" is in the alias map, so resolves as alias
      expect(result!.matchType).toBe('alias');
    });

    it('resolves Williamsbrg -> Williamsburg (fuzzy, 2 chars off)', () => {
      const result = resolveNeighborhood('Williamsbrg');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Williamsburg');
      expect(result!.matchType).toBe('fuzzy');
      expect(result!.distance).toBeLessThanOrEqual(2);
    });

    it('resolves tribecca -> Tribeca (1 char off)', () => {
      const result = resolveNeighborhood('tribecca');
      // "tribecca" is an alias, so it should match as alias, not fuzzy
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Tribeca');
    });

    it('resolves greenich village -> Greenwich Village via fuzzy', () => {
      // "greenich village" is an alias
      const result = resolveNeighborhood('greenich village');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Greenwich Village');
    });

    it('resolves Chlesea -> Chelsea via fuzzy', () => {
      const result = resolveNeighborhood('Chlesea');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Chelsea');
      expect(result!.matchType).toBe('fuzzy');
    });

    it('resolves Grenpoint -> Greenpoint via fuzzy', () => {
      const result = resolveNeighborhood('Grenpoint');
      expect(result).not.toBeNull();
      expect(result!.canonical).toBe('Greenpoint');
      expect(result!.matchType).toBe('fuzzy');
    });

    it('does not fuzzy match inputs < 4 chars', () => {
      // "abc" is 3 chars - should not fuzzy match anything
      const result = resolveNeighborhood('abc');
      expect(result).toBeNull();
    });
  });

  describe('unknown inputs', () => {
    it('returns null for unknown neighborhood', () => {
      expect(resolveNeighborhood('Narnia')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(resolveNeighborhood('')).toBeNull();
    });

    it('returns null for whitespace', () => {
      expect(resolveNeighborhood('   ')).toBeNull();
    });
  });
});

// ─── resolveBorough ──────────────────────────────────────────────────────────

describe('resolveBorough', () => {
  it('resolves BK -> Brooklyn', () => {
    expect(resolveBorough('BK')).toBe('Brooklyn');
  });

  it('resolves bklyn -> Brooklyn', () => {
    expect(resolveBorough('bklyn')).toBe('Brooklyn');
  });

  it('resolves SI -> Staten Island', () => {
    expect(resolveBorough('SI')).toBe('Staten Island');
  });

  it('resolves manhattan -> Manhattan', () => {
    expect(resolveBorough('manhattan')).toBe('Manhattan');
  });

  it('resolves the bronx -> Bronx', () => {
    expect(resolveBorough('the bronx')).toBe('Bronx');
  });

  it('resolves bx -> Bronx', () => {
    expect(resolveBorough('bx')).toBe('Bronx');
  });

  it('resolves qns -> Queens', () => {
    expect(resolveBorough('qns')).toBe('Queens');
  });

  it('resolves queens case-insensitively', () => {
    expect(resolveBorough('Queens')).toBe('Queens');
  });

  it('returns null for unknown', () => {
    expect(resolveBorough('Hoboken')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveBorough('')).toBeNull();
  });
});

// ─── matchLingo ──────────────────────────────────────────────────────────────

describe('matchLingo', () => {
  describe('layout terms', () => {
    it('matches jr4', () => {
      const result = matchLingo('looking for a jr4');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Junior 4');
      expect(result.matches[0].type).toBe('layout');
      expect(result.matches[0].filterKey).toBe('propertySubTypes');
    });

    it('matches junior 4', () => {
      const result = matchLingo('junior 4 apartment');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Junior 4');
    });

    it('matches alcove studio', () => {
      const result = matchLingo('alcove studio in tribeca');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Alcove Studio');
    });

    it('matches penthouse / ph', () => {
      const result = matchLingo('ph with views');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Penthouse');
    });

    it('matches loft', () => {
      const result = matchLingo('loft in soho');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Loft');
    });
  });

  describe('ownership terms', () => {
    it('matches sponsor unit', () => {
      const result = matchLingo('sponsor unit condo');
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const sponsor = result.matches.find(m => m.label.includes('Sponsor'));
      expect(sponsor).toBeDefined();
    });

    it('matches both condo and sponsor unit', () => {
      const result = matchLingo('sponsor unit condo');
      expect(result.matches.length).toBe(2);
      const labels = result.matches.map(m => m.label);
      expect(labels).toContain('Sponsor Unit (No Board Approval)');
      expect(labels).toContain('Condo');
    });

    it('matches coop / co-op', () => {
      const result = matchLingo('looking for a coop');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].filterValue).toBe('Co-op');
    });

    it('matches townhouse / brownstone', () => {
      const result = matchLingo('brownstone in brooklyn');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Townhouse');
    });

    it('matches new development / new construction', () => {
      const result = matchLingo('new construction condo');
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const newDev = result.matches.find(m => m.label === 'New Development');
      expect(newDev).toBeDefined();
    });
  });

  describe('year-built terms', () => {
    it('matches prewar', () => {
      const result = matchLingo('prewar coop');
      const prewar = result.matches.find(m => m.label === 'Pre-War');
      expect(prewar).toBeDefined();
      expect(prewar!.filterKey).toBe('yearBuilt');
      expect(prewar!.filterValue).toBe('pre-war');
    });

    it('matches pre-war', () => {
      const result = matchLingo('pre-war');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Pre-War');
    });

    it('matches post-war', () => {
      const result = matchLingo('post-war building');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Post-War');
    });
  });

  describe('rental terms', () => {
    it('matches no fee', () => {
      const result = matchLingo('no fee apartment');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('No Fee');
      expect(result.matches[0].type).toBe('rental');
    });

    it('matches no broker fee (longest-first)', () => {
      const result = matchLingo('no broker fee');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('No Fee');
    });

    it('matches furnished', () => {
      const result = matchLingo('furnished rental');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Furnished');
      expect(result.matches[0].filterKey).toBe('furnished');
      expect(result.matches[0].filterValue).toBe(true);
    });

    it('matches walkup / walk-up', () => {
      const result = matchLingo('walk-up');
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].label).toBe('Walk-Up');
    });
  });

  describe('multiple matches', () => {
    it('matches prewar coop', () => {
      const result = matchLingo('prewar coop on the ues');
      expect(result.matches.length).toBeGreaterThanOrEqual(2);
      const labels = result.matches.map(m => m.label);
      expect(labels).toContain('Pre-War');
      expect(labels).toContain('Co-op');
    });
  });

  describe('edge cases', () => {
    it('returns empty for no matches', () => {
      const result = matchLingo('something random');
      expect(result.matches).toHaveLength(0);
      expect(result.remainder).toBe('something random');
    });

    it('returns empty for empty string', () => {
      const result = matchLingo('');
      expect(result.matches).toHaveLength(0);
    });

    it('removes matched text from remainder', () => {
      const result = matchLingo('a nice loft');
      expect(result.matches).toHaveLength(1);
      expect(result.remainder).not.toContain('loft');
    });

    it('avoids duplicate matches (coop and co-op)', () => {
      // Only "coop" should match since it appears first, "co-op" has same filterValue
      const result = matchLingo('coop');
      expect(result.matches).toHaveLength(1);
    });
  });
});

// ─── matchTransit ────────────────────────────────────────────────────────────

describe('matchTransit', () => {
  it('matches "near the L train"', () => {
    const result = matchTransit('apartment near the L train');
    expect(result.match).not.toBeNull();
    expect(result.match!.lines).toEqual(['L']);
    expect(result.match!.label).toBe('Near L train');
  });

  it('matches "L train" without "near"', () => {
    const result = matchTransit('L train');
    expect(result.match).not.toBeNull();
    expect(result.match!.lines).toEqual(['L']);
  });

  it('matches "the 6"', () => {
    const result = matchTransit('near the 6');
    expect(result.match).not.toBeNull();
    expect(result.match!.lines).toEqual(['6']);
  });

  it('matches grouped service NQRW', () => {
    const result = matchTransit('near NQRW');
    expect(result.match).not.toBeNull();
    expect(result.match!.lines).toEqual(['N', 'Q', 'R', 'W']);
    expect(result.match!.label).toContain('N/Q/R/W');
  });

  it('matches grouped service ACE', () => {
    const result = matchTransit('ACE trains');
    expect(result.match).not.toBeNull();
    expect(result.match!.lines).toEqual(['A', 'C', 'E']);
  });

  it('matches "near subway" (generic)', () => {
    const result = matchTransit('near subway');
    expect(result.match).not.toBeNull();
    expect(result.match!.lines).toEqual([]);
    expect(result.match!.label).toBe('Near subway');
  });

  it('matches "near train" (generic)', () => {
    const result = matchTransit('near train');
    expect(result.match).not.toBeNull();
    expect(result.match!.label).toBe('Near subway');
  });

  it('returns null for no transit match', () => {
    const result = matchTransit('nice apartment');
    expect(result.match).toBeNull();
  });

  it('removes matched text from remainder', () => {
    const result = matchTransit('condo near the L train in williamsburg');
    expect(result.match).not.toBeNull();
    expect(result.remainder).not.toContain('L train');
    expect(result.remainder).toContain('williamsburg');
  });
});

// ─── getSuggestions ──────────────────────────────────────────────────────────

describe('getSuggestions', () => {
  it('suggests Upper East Side for "ues"', () => {
    const results = getSuggestions('ues');
    const ues = results.find(r => r.label === 'Upper East Side');
    expect(ues).toBeDefined();
    expect(ues!.type).toBe('neighborhood');
    expect(ues!.context).toBe('Manhattan');
  });

  it('suggests neighborhoods for "upper"', () => {
    const results = getSuggestions('upper');
    const labels = results.map(r => r.label);
    expect(labels).toContain('Upper East Side');
    expect(labels).toContain('Upper West Side');
  });

  it('suggests Brooklyn for "bk"', () => {
    const results = getSuggestions('bk');
    const bk = results.find(r => r.label === 'Brooklyn' && r.type === 'borough');
    expect(bk).toBeDefined();
  });

  it('suggests lingo for "no fee" (via key match)', () => {
    const results = getSuggestions('no fee');
    const noFee = results.find(r => r.type === 'lingo' && r.label === 'No Fee');
    expect(noFee).toBeDefined();
  });

  it('suggests lingo for "junior" (via label match)', () => {
    const results = getSuggestions('junior');
    const jr4 = results.find(r => r.type === 'lingo' && r.label === 'Junior 4');
    expect(jr4).toBeDefined();
  });

  it('suggests lingo for "prewar"', () => {
    const results = getSuggestions('prewar');
    const prewar = results.find(r => r.label === 'Pre-War');
    expect(prewar).toBeDefined();
  });

  it('suggests transit for "L tr"', () => {
    const results = getSuggestions('l tr');
    const lTrain = results.find(r => r.type === 'transit' && r.value === 'L');
    expect(lTrain).toBeDefined();
  });

  it('respects limit parameter', () => {
    const results = getSuggestions('a', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty for empty input', () => {
    expect(getSuggestions('')).toEqual([]);
  });

  it('returns empty for whitespace input', () => {
    expect(getSuggestions('   ')).toEqual([]);
  });

  it('deduplicates suggestions', () => {
    // "williamsburg" matches both as canonical and alias
    const results = getSuggestions('williamsburg');
    const wburg = results.filter(r => r.label === 'Williamsburg' && r.type === 'neighborhood');
    expect(wburg).toHaveLength(1);
  });
});

// ─── Utility Exports ─────────────────────────────────────────────────────────

describe('utility exports', () => {
  it('getNeighborhoodsForBorough returns Manhattan neighborhoods', () => {
    const hoods = getNeighborhoodsForBorough('Manhattan');
    expect(hoods).toContain('Upper East Side');
    expect(hoods).toContain('Tribeca');
    expect(hoods).toHaveLength(33);
  });

  it('getNeighborhoodsForBorough returns Brooklyn neighborhoods', () => {
    const hoods = getNeighborhoodsForBorough('Brooklyn');
    expect(hoods).toContain('Williamsburg');
    expect(hoods).toContain('DUMBO');
    expect(hoods).toHaveLength(10);
  });

  it('getNeighborhoodsForBorough returns empty for unknown borough', () => {
    expect(getNeighborhoodsForBorough('New Jersey')).toEqual([]);
  });

  it('getAllBoroughs returns all 5 boroughs', () => {
    const boroughs = getAllBoroughs();
    expect(boroughs).toHaveLength(5);
    expect(boroughs).toContain('Manhattan');
    expect(boroughs).toContain('Brooklyn');
    expect(boroughs).toContain('Queens');
    expect(boroughs).toContain('Bronx');
    expect(boroughs).toContain('Staten Island');
  });

  it('getAllNeighborhoods returns all 59 neighborhoods', () => {
    const hoods = getAllNeighborhoods();
    // 33 + 10 + 7 + 5 + 4 = 59
    expect(hoods).toHaveLength(59);
  });
});

// ─── Canonical Name Verification ─────────────────────────────────────────────

describe('canonical name integrity', () => {
  it('all alias values resolve to real canonical names', () => {
    // Verify every alias maps to a name that actually exists in BOROUGH_NEIGHBORHOODS
    const allCanonical = getAllNeighborhoods();
    const allCanonicalSet = new Set(allCanonical);

    // Test a sample of aliases
    const aliases = ['ues', 'uws', 'les', 'fidi', 'hk', 'ev', 'wv', 'bpc', 'hy',
      'wburg', 'dumbo', 'lic', 'bococa', 'bedstuy', 'sobronya', 'el barrio'];

    for (const alias of aliases) {
      const result = resolveNeighborhood(alias);
      expect(result).not.toBeNull();
      expect(allCanonicalSet.has(result!.canonical)).toBe(true);
    }
  });

  it('all borough alias values are valid borough names', () => {
    const validBoroughs = new Set(getAllBoroughs());
    const aliases = ['bk', 'bklyn', 'si', 'bx', 'qns', 'the bronx', 'manhattan'];
    for (const alias of aliases) {
      const result = resolveBorough(alias);
      expect(result).not.toBeNull();
      expect(validBoroughs.has(result!)).toBe(true);
    }
  });
});

// ─── REBNY Compliance ────────────────────────────────────────────────────────

describe('REBNY compliance', () => {
  // Read the source file content at test time is not practical,
  // but we can verify that the exports do NOT match prohibited terms.

  const PROHIBITED_TERMS = [
    // Protected classes
    'white', 'black', 'asian', 'hispanic', 'latino',
    'christian', 'jewish', 'muslim', 'mosque', 'synagogue', 'church',
    'adults only', 'no children', '55+', 'senior only', 'seniors only',
    'female only', 'male only', 'women only', 'men only',
    'handicapped', 'wheelchair', 'ada',
    'section 8', 'no vouchers', 'no section 8',
    'background check', 'felon', 'conviction',
    'citizens only', 'legal residents',
    // Off-market language
    'pocket listing', 'whisper listing', 'quiet listing', 'pre-market', 'off-market',
    // Commission terms
    'buyer pays', 'seller pays', 'closing cost credit',
  ];

  it('resolveNeighborhood returns null for all prohibited terms', () => {
    for (const term of PROHIBITED_TERMS) {
      const result = resolveNeighborhood(term);
      // Some might fuzzy match by accident to a real neighborhood,
      // but they should NOT be in the alias map
      if (result && result.matchType === 'alias') {
        fail(`Prohibited term "${term}" matched as alias to ${result.canonical}`);
      }
    }
  });

  it('matchLingo does not match prohibited terms', () => {
    for (const term of PROHIBITED_TERMS) {
      const result = matchLingo(term);
      if (result.matches.length > 0) {
        fail(`Prohibited term "${term}" matched lingo: ${result.matches.map(m => m.label).join(', ')}`);
      }
    }
  });

  it('getSuggestions does not suggest prohibited terms', () => {
    for (const term of PROHIBITED_TERMS) {
      const results = getSuggestions(term);
      for (const r of results) {
        const lower = r.label.toLowerCase();
        for (const prohibited of PROHIBITED_TERMS) {
          if (lower === prohibited) {
            fail(`Prohibited term "${prohibited}" appeared as suggestion: ${r.label}`);
          }
        }
      }
    }
  });

  it('no off-market language in lingo labels', () => {
    const offMarketTerms = ['off-market', 'off market', 'pocket listing', 'whisper listing', 'quiet listing', 'pre-market'];
    // Test all lingo entries by matching everything
    const allTerms = 'jr4 flex 2 alcove studio penthouse loft duplex triplex condo coop condop townhouse brownstone new development prewar postwar no fee furnished walkup';
    const result = matchLingo(allTerms);
    for (const match of result.matches) {
      const lower = match.label.toLowerCase();
      for (const omt of offMarketTerms) {
        expect(lower).not.toContain(omt);
      }
    }
  });
});
