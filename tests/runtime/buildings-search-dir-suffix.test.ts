/**
 * /api/buildings/search — streets with a direction SUFFIX.
 *
 * Live Cotality (probed read-only 2026-10-28): "425 Park Avenue South" is served as
 * StreetNumber "425", StreetName "PARK", StreetSuffix "Avenue", StreetDirSuffix "S"
 * (UnparsedAddress "425 PARK Avenue S 4D"); StreetDirSuffix is in $metadata and set
 * on 13,595 rows. The query parser only knew direction PREFIXES, so the Cotality
 * filter became contains(tolower(StreetName),'park avenue south') → 0 rows, and the
 * sale/rental forms could not fill the building for any "… Avenue South/North" address.
 */
import { parseAddressQuery } from '@/app/api/buildings/search/route';

describe('parseAddressQuery — direction suffix', () => {
  it('parses "425 Park Avenue South" into StreetName park + StreetDirSuffix S', () => {
    expect(parseAddressQuery('425 Park Avenue South')).toEqual({
      streetNumber: '425',
      streetName: 'park',
      streetDirSuffix: 'S',
    });
  });

  it('parses the abbreviated "425 Park Ave S" the same way', () => {
    expect(parseAddressQuery('425 Park Ave S')).toEqual({
      streetNumber: '425',
      streetName: 'park',
      streetDirSuffix: 'S',
    });
  });

  it('keeps a direction PREFIX address unchanged', () => {
    expect(parseAddressQuery('333 East 46th Street')).toEqual({
      streetNumber: '333',
      streetDirPrefix: 'E',
      streetName: '46',
    });
  });

  it('parses "116 Central Park South" the way Cotality serves it (CENTRAL / Park / S)', () => {
    expect(parseAddressQuery('116 Central Park South')).toEqual({
      streetNumber: '116',
      streetName: 'central',
      streetDirSuffix: 'S',
    });
  });

  it('parses "60 Sutton Place South" (SUTTON / Place / S)', () => {
    expect(parseAddressQuery('60 Sutton Place South')).toEqual({
      streetNumber: '60',
      streetName: 'sutton',
      streetDirSuffix: 'S',
    });
  });

  it('a leading direction word is still a direction PREFIX (unchanged behaviour)', () => {
    expect(parseAddressQuery('20 South Street')).toEqual({
      streetNumber: '20',
      streetDirPrefix: 'S',
    });
  });
});
