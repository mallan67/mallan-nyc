/// <reference types="jest" />
/**
 * STEP 2 — THE SALE / RENTAL UNIVERSE IS POSITIVE MEMBERSHIP, NOT A COMPLEMENT.
 *
 * `lib/search/crm-idx-mapper.ts` decided the split with a substring test:
 *
 *     const isRental = propertyType.toLowerCase().includes('lease');
 *     listingCategory: isRental ? 'rental' : undefined
 *
 * Both halves are wrong, and both are invisible on today's data.
 *
 *   SUBSTRING     `DisasterReliefRental` is a rental and contains no "lease",
 *                 so it classified as a SALE. Same defect shape as the
 *                 `PetsAllowed` "Yes" / "BuildingYes" substring bug already
 *                 corrected elsewhere in this codebase.
 *
 *   NEGATION      Sale was `undefined` — whatever was left over. Every member
 *                 Cotality has not yet populated (Land, CommercialSale,
 *                 MultiFamily, ResidentialIncome, Farm, BusinessOpportunity)
 *                 becomes residential SALE inventory the moment it appears,
 *                 with no code change and no warning.
 *
 * Measured live on 2026-08-22, which is why this had to be probed and not
 * reasoned about:
 *
 *     PropertyType eq 'Residential'        215,388
 *     PropertyType ne 'ResidentialLease'   215,388   <- identical, TODAY
 *
 * The negation is indistinguishable from the correct definition right now. It
 * agrees only because the other eleven members are unpopulated.
 */
import {
  PROPERTY_TYPE_MEMBERS,
  SALE_PROPERTY_TYPES,
  RENTAL_PROPERTY_TYPES,
  classifyPropertyType,
  isRentalPropertyType,
  isSalePropertyType,
  isPropertyTypeMember,
  propertyTypeUniverseOData,
} from '@/lib/search/canonical/property-type-universe';

describe('the vocabulary matches the live provider enum', () => {
  it('carries all thirteen declared members', () => {
    expect(PROPERTY_TYPE_MEMBERS).toHaveLength(13);
  });

  it.each(['Residential', 'ResidentialLease', 'Land', 'CommercialSale', 'DisasterReliefRental'])(
    '%s is a real member',
    (m) => expect(isPropertyTypeMember(m)).toBe(true),
  );

  it.each(['Commercial', 'Rental', 'Sale', 'residential', ''])(
    '%p is NOT a member',
    (v) => {
      // 'Commercial' in particular: lib/compliance/cotality-mapper.ts types
      // PropertyType as including it, but the live API rejects it with
      // HTTP 400 "not a valid enumeration type constant".
      expect(isPropertyTypeMember(v)).toBe(false);
    },
  );
});

describe('membership is positive on BOTH sides', () => {
  it('classifies Residential as sale', () => {
    expect(classifyPropertyType('Residential')).toBe('sale');
  });

  it('classifies ResidentialLease as rental', () => {
    expect(classifyPropertyType('ResidentialLease')).toBe('rental');
  });

  it('does not make sale the complement of rental', () => {
    // The heart of it. Every member that is not rental must NOT thereby be sale.
    const notRental = PROPERTY_TYPE_MEMBERS.filter((m) => !isRentalPropertyType(m));
    const treatedAsSale = notRental.filter((m) => isSalePropertyType(m));
    expect(treatedAsSale).toEqual(['Residential']);
    // i.e. eleven members are neither — not silently absorbed into sale.
    expect(notRental.length - treatedAsSale.length).toBe(11);
  });

  it.each([
    'BusinessOpportunity', 'CommercialLease', 'CommercialSale', 'DisasterReliefRental',
    'Farm', 'HighRise', 'Land', 'ManufacturedInPark', 'MultiFamily',
    'ResidentialIncome', 'Specialty',
  ])('%s is unknown — assigned to neither universe', (m) => {
    expect(classifyPropertyType(m)).toBe('unknown');
    expect(isSalePropertyType(m)).toBe(false);
    expect(isRentalPropertyType(m)).toBe(false);
  });
});

describe('the substring defect is closed', () => {
  it('DisasterReliefRental is not classified as a sale', () => {
    // Under `includes('lease')` this was a SALE. It is a rental by name and a
    // non-member of Mallan's rental universe by decision — either way, never
    // sale inventory.
    expect(isSalePropertyType('DisasterReliefRental')).toBe(false);
  });

  it('CommercialLease is not swept into residential rentals', () => {
    // Under `includes('lease')` this WAS a residential rental.
    expect(isRentalPropertyType('CommercialLease')).toBe(false);
  });

  it('matches exactly, never by case-folding', () => {
    // The provider emits member names exactly as declared.
    expect(classifyPropertyType('residential')).toBe('unknown');
    expect(classifyPropertyType('RESIDENTIALLEASE')).toBe('unknown');
  });
});

describe('unknown stays unknown', () => {
  it.each([null, undefined, '', 0, {}, [], 'SomethingNewFromCotality'])(
    '%p classifies as unknown, not sale',
    (v) => {
      expect(classifyPropertyType(v)).toBe('unknown');
      expect(isSalePropertyType(v)).toBe(false);
    },
  );
});

describe('the OData rendering is positive, never a negation', () => {
  it('renders sale as an explicit eq predicate', () => {
    expect(propertyTypeUniverseOData('sale')).toBe("PropertyType eq 'Residential'");
  });

  it('renders rental as an explicit eq predicate', () => {
    expect(propertyTypeUniverseOData('rental')).toBe("PropertyType eq 'ResidentialLease'");
  });

  it.each(['sale', 'rental'] as const)('the %s filter contains no ne operator', (u) => {
    // A negation absorbs every future member. It is also not uniformly safe on
    // Cotality enums — see the MediaClassification eq/ne asymmetry.
    expect(propertyTypeUniverseOData(u)).not.toMatch(/\bne\b/);
  });

  it('refuses to render a filter for unknown', () => {
    // There is no provider predicate for "we do not know what this is", and
    // inventing one puts unclassified rows into a broker's results.
    expect(() => propertyTypeUniverseOData('unknown')).toThrow(/no provider filter exists/);
  });
});

/**
 * NEGATIVE TESTS — criteria must not leak across the universes.
 *
 * These are the ones that matter operationally: a rental-only concept appearing
 * in a sale search, or vice versa, is how a broker sends a client the wrong
 * inventory.
 */
describe('the two universes do not overlap', () => {
  it('no PropertyType is both sale and rental', () => {
    const both = PROPERTY_TYPE_MEMBERS.filter((m) => isSalePropertyType(m) && isRentalPropertyType(m));
    expect(both).toEqual([]);
  });

  it('the two member sets are disjoint by construction', () => {
    const overlap = SALE_PROPERTY_TYPES.filter((m) => (RENTAL_PROPERTY_TYPES as readonly string[]).includes(m));
    expect(overlap).toEqual([]);
  });

  it('the sale filter cannot match a rental listing type', () => {
    expect(propertyTypeUniverseOData('sale')).not.toContain('ResidentialLease');
  });

  it('the rental filter cannot match the sale listing type', () => {
    // Guarded deliberately: 'Residential' is a SUBSTRING of 'ResidentialLease',
    // so a careless containment check here would pass while the real filter was
    // wrong. Assert on the rendered predicate, not on substring presence.
    expect(propertyTypeUniverseOData('rental')).toBe("PropertyType eq 'ResidentialLease'");
    expect(propertyTypeUniverseOData('rental')).not.toContain("eq 'Residential'");
  });
});
