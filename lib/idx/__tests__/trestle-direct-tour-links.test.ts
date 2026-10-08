/// <reference types="jest" />
/**
 * A listing's second and third tour links reach the public page whichever path serves it.
 *
 * The public site reads a listing's video and 3D tour from the Cotality Property fields VirtualTourURLBranded and VirtualTourURLUnbranded, ...2 and ...3 (tourUrlsForDto splits their links by host: a
 * YouTube or Vimeo link is the listing's video, a Matterport link its 3D tour). The database path reads all of them (db-to-public-dto.ts, and the keep list of raw_data since the Featured / media
 * change), but the live-Trestle path, which serves the public pages when the database has nothing synced for a search (and every page of a deployment that has no database, a preview), asked Cotality
 * for the first and the branded one only, mapped those two, and gave only those two to the public DTO: a video in a listing's second link was in the record Cotality holds (the sync reads it) and
 * never reached the page on that path (CLAUDE.md J.5 asks for the public DTO to be checked on the DB path and on the Cotality-direct path).
 *
 * These tests follow a raw Cotality Property record through the live-Trestle path (mapRESOToInternal -> toPublicDTO) and pin the two lists of fields that path asks Cotality for: both carry the four tour
 * fields, and every field of both is a Property field of the repo's copy of the live $metadata (Cotality refuses a whole query that asks for a field it does not know; card-fields.ts, rule 2).
 */
import fs from 'fs';
import path from 'path';
import { mapRESOToInternal, RESO_FIELDS, FIELD_MAP } from '@/lib/idx/mapping';
import { toPublicDTO } from '@/lib/idx/public-dto';
import { CARD_SELECT_FIELDS } from '@/lib/idx/card-fields';

const ROOT = path.resolve(__dirname, '../../..');
const TOUR_FIELDS = ['VirtualTourURLBranded', 'VirtualTourURLUnbranded', 'VirtualTourURLUnbranded2', 'VirtualTourURLUnbranded3'];
/** The repo's copy of the live Cotality $metadata (scripts/cotality/pull-enums.mjs writes it; the Property entity maps each field to its type). */
const MIRROR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cotality-enums.live.json'), 'utf8')) as { source: string; entities: { Property: Record<string, string> } };
/** The field names of SEARCH_SELECT_FIELDS in the search route, read from its source (the route module needs the Next runtime). */
const searchSelectFields = (): string[] => {
  const source = fs.readFileSync(path.join(ROOT, 'app/api/idx/search/route.ts'), 'utf8');
  const start = source.indexOf('[', source.indexOf('export const SEARCH_SELECT_FIELDS = '));
  const end = source.indexOf('\n]', start);
  return (source.slice(start, end).replace(/\/\/.*$/gm, '').match(/"[A-Za-z0-9_]+"/g) ?? []).map((quoted) => quoted.slice(1, -1));
};
const MATTERPORT = 'https://my.matterport.com/show/?m=abc';
const MATTERPORT2 = 'https://my.matterport.com/show/?m=def';
const YOUTUBE = 'https://www.youtube.com/watch?v=RM4ef1CIo2k';
const VIMEO = 'https://vimeo.com/123456789';
const BRANDED = 'https://tour.example.com/branded/xyz';

/** A raw Cotality Property record the public path accepts (displayable, with an address), plus the tour fields of the test. */
const record = (tours: Record<string, string>): Record<string, unknown> => ({
  ListingId: 'RLS20000001', ListingKey: '1000001', ListingKeyNumeric: 1000001,
  StandardStatus: 'Active', MlsStatus: 'Active', PropertyType: 'Residential', PropertySubType: 'Condominium', CommonInterest: 'Condominium',
  ListPrice: 1250000, OriginalListPrice: 1250000, BedroomsTotal: 2, BathroomsFull: 2, LivingArea: 1100,
  StreetNumber: '217', StreetName: 'West 57th', StreetSuffix: 'Street', UnitNumber: '50A', City: 'New York', StateOrProvince: 'NY', PostalCode: '10019', CountyOrParish: 'New York',
  InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true, ListOfficeName: 'Compass',
  ListingContractDate: '2026-04-01T00:00:00Z', ModificationTimestamp: '2026-05-05T16:21:52Z',
  ...tours,
});
const publicOf = (tours: Record<string, string>) => {
  const listing = mapRESOToInternal(record(tours));
  if (!listing) throw new Error('the record was not mapped');
  return toPublicDTO(listing);
};

describe('the live-Trestle path carries all of a listing\'s tour links', () => {
  it('asks Cotality for the four tour fields on a card and on a search', () => {
    const search = searchSelectFields();
    for (const field of TOUR_FIELDS) {
      expect(CARD_SELECT_FIELDS).toContain(field);
      expect(search).toContain(field);
    }
  });

  it('asks Cotality only for Property fields of the live $metadata (the repo\'s copy of it), the four tour fields among them', () => {
    expect(MIRROR.source).toBe('https://api.cotality.com/trestle/odata/$metadata');
    const lists: Array<[string, string[]]> = [['the card list', [...CARD_SELECT_FIELDS]], ['the search list', searchSelectFields()]];
    for (const [name, fields] of lists) {
      expect(fields.length).toBeGreaterThan(40);                                    // (the lists were read: an empty one would pass the next line)
      expect([name, fields.filter((field) => !(field in MIRROR.entities.Property))]).toEqual([name, []]);
    }
    for (const field of TOUR_FIELDS) expect(MIRROR.entities.Property[field]).toBe('Edm.String');
  });

  it('names the two fields in the field table, and maps them into the internal listing', () => {
    expect(RESO_FIELDS.VirtualTourURLUnbranded2).toBe('VirtualTourURLUnbranded2');
    expect(RESO_FIELDS.VirtualTourURLUnbranded3).toBe('VirtualTourURLUnbranded3');
    expect(FIELD_MAP.VirtualTourURLUnbranded2).toBe('virtualTourURLUnbranded2');
    expect(FIELD_MAP.VirtualTourURLUnbranded3).toBe('virtualTourURLUnbranded3');
    const listing = mapRESOToInternal(record({ VirtualTourURLBranded: BRANDED, VirtualTourURLUnbranded: MATTERPORT, VirtualTourURLUnbranded2: YOUTUBE, VirtualTourURLUnbranded3: VIMEO }))!;
    expect(listing.virtualTourURLBranded).toBe(BRANDED);
    expect(listing.virtualTourURLUnbranded).toBe(MATTERPORT);
    expect(listing.virtualTourURLUnbranded2).toBe(YOUTUBE);
    expect(listing.virtualTourURLUnbranded3).toBe(VIMEO);
  });

  it('leaves a link out that the record does not carry (and takes a blank for none)', () => {
    const listing = mapRESOToInternal(record({ VirtualTourURLUnbranded2: '', VirtualTourURLUnbranded3: '' }))!;
    expect(listing.virtualTourURLUnbranded).toBeUndefined();
    expect(listing.virtualTourURLUnbranded2).toBeUndefined();
    expect(listing.virtualTourURLUnbranded3).toBeUndefined();
  });

  it('a video in the second link and a 3D tour in the first: the public listing has both', () => {
    const dto = publicOf({ VirtualTourURLUnbranded: MATTERPORT, VirtualTourURLUnbranded2: YOUTUBE });
    expect(dto.virtualTourURL).toBe(MATTERPORT);
    expect(dto.videoUrl).toBe(YOUTUBE);
  });

  it('a video in the third link alone is the listing\'s video, and it has no 3D tour', () => {
    const dto = publicOf({ VirtualTourURLUnbranded3: VIMEO });
    expect(dto.videoUrl).toBe(VIMEO);
    expect(dto.virtualTourURL).toBeUndefined();
  });

  it('a 3D tour in the second or the third link is the listing\'s 3D tour', () => {
    expect(publicOf({ VirtualTourURLUnbranded2: MATTERPORT }).virtualTourURL).toBe(MATTERPORT);
    expect(publicOf({ VirtualTourURLUnbranded3: MATTERPORT2 }).virtualTourURL).toBe(MATTERPORT2);
  });

  it('the first link of each kind wins, in the order of the fields', () => {
    const dto = publicOf({ VirtualTourURLUnbranded: YOUTUBE, VirtualTourURLUnbranded2: VIMEO, VirtualTourURLUnbranded3: MATTERPORT });
    expect(dto.videoUrl).toBe(YOUTUBE);
    expect(dto.virtualTourURL).toBe(MATTERPORT);
    const tours = publicOf({ VirtualTourURLUnbranded2: MATTERPORT2, VirtualTourURLUnbranded3: MATTERPORT });
    expect(tours.virtualTourURL).toBe(MATTERPORT2);
  });

  it('an unbranded link is shown over a branded one of its kind, and a branded one alone is still shown (as before)', () => {
    expect(publicOf({ VirtualTourURLBranded: BRANDED, VirtualTourURLUnbranded2: MATTERPORT }).virtualTourURL).toBe(MATTERPORT);
    expect(publicOf({ VirtualTourURLBranded: BRANDED }).virtualTourURL).toBe(BRANDED);
  });

  it('a listing with no tour link has neither', () => {
    const dto = publicOf({});
    expect(dto.videoUrl).toBeUndefined();
    expect(dto.virtualTourURL).toBeUndefined();
  });
});
