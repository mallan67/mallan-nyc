/// <reference types="jest" />
/**
 * The Tools viewers' live loader (js/core/listing-viewer-live.js) and its wiring in the two read-only pages.
 *
 * Owner rule (session 2026-10-27, kept through the 2026-10-28 integration): an RLS listing is read LIVE from Cotality through
 * the agent search route — one exact ListingId request that also carries the Cotality row (raw=1) — and never from a database
 * copy; a Mallan-only listing (SL-/RL-) is the CRM record. The live row is shaped as the CRM record the convergence viewers
 * hydrate from (js/forms/listing-hydration.js reads raw_data / features / address by the live field names).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadListingViewerLive } from './helpers';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r/g, '');
const sale = read('public/crm/SALE-FORM-WITH-TOOLS.html');
const rental = read('public/crm/RENTAL-FORM-WITH-TOOLS.html');

const RAW = {
  ListingKey: '1190000002', ListingId: 'RLS20005678', StandardStatus: 'Active', ListPrice: 4500, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 650,
  StreetNumber: '98-10', StreetDirPrefix: null, StreetName: '63RD', StreetSuffix: 'Road', StreetDirSuffix: null, UnitNumber: '1114', UnparsedAddress: '98-10 63RD ROAD 1114',
  City: 'Rego Park', PostalCode: '11374', CityRegion: 'Queens', CountyOrParish: 'Queens', SubdivisionName: 'Rego Park', PropertySubType: 'Apartment', CommonInterest: 'RentalBuilding',
  ListAgentFullName: 'Matthew Lipton', ListAgentMlsId: '12345', ListAgentDirectPhone: '212-555-0100', ListAgentEmail: 'm@example.test', ListOfficeName: 'MNS', ListOfficeMlsId: '777',
  IDXEntireListingDisplayYN: true, InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true, ListingContractDate: '2026-10-01', OriginalEntryTimestamp: '2026-10-01T12:00:00Z', ModificationTimestamp: '2026-10-27T09:00:00Z',
  PublicRemarks: 'Bright one bedroom.', VirtualTourURLUnbranded: 'https://my.matterport.com/show/?m=t1',
  CustomProperty: [{ CustomFields: JSON.stringify({ SponsorUnitYN: '0', AttendanceType: 'DoormanFullTime' }) }],
};
const MAPPED = { lid: 'RLS20005678', wid: '1190000002', status: 'ACTIVE', price: 4500, ownership: 'RentalBuilding', propertySubType: 'Apartment', neighborhood: 'Rego Park',
  tours: [{ url: 'https://youtu.be/v1', kind: 'video' }, { url: 'https://my.matterport.com/show/?m=t1', kind: '3d' }, { url: 'https://vimeo.com/22', kind: 'video' }], videosCount: 2, raw: RAW };

describe('live loader — an RLS listing is read LIVE from Cotality, never from a database copy', () => {
  it('sends one exact ListingId request (with the raw row) to the agent search route and never asks the CRM record', async () => {
    const h = loadListingViewerLive({ liveListings: [MAPPED] });
    const rec = await h.viewerLiveListing('RLS20005678', 'rental');
    expect(h.idxSearch).toHaveBeenCalledTimes(1);
    expect(h.idxSearch).toHaveBeenCalledWith({ listingId: 'RLS20005678', status: '*', limit: 1, raw: '1' });
    expect(h.listingsGet).not.toHaveBeenCalled();
    expect(rec._source).toBe('cotality_live');
  });

  it('shapes the live row as the CRM record the viewers hydrate from: typed columns, the address atoms, raw_data by the live names', async () => {
    const h = loadListingViewerLive({ liveListings: [MAPPED] });
    const rec = await h.viewerLiveListing('RLS20005678', 'rental');
    expect(rec).toMatchObject({ listing_id: 'RLS20005678', id: '1190000002', mls_id: 'RLS20005678', status: 'Active', list_price: 4500, bedrooms_total: 1, living_area: 650,
      city: 'Rego Park', postal_code: '11374', borough: 'Queens', neighborhood: 'Rego Park', property_type: 'RentalBuilding', common_interest: 'RentalBuilding',
      list_agent_full_name: 'Matthew Lipton', list_office_name: 'MNS', rls_eligible: true, updated_at: '2026-10-27T09:00:00Z' });
    expect(rec.address).toEqual({ StreetNumber: '98-10', StreetDirPrefix: null, StreetName: '63RD', StreetSuffix: 'Road', StreetDirSuffix: null, UnitNumber: '1114', UnparsedAddress: '98-10 63RD ROAD 1114' });
    expect(rec.raw_data.PublicRemarks).toBe('Bright one bedroom.');
    expect(rec.raw_data.VirtualTourURLUnbranded).toBe('https://my.matterport.com/show/?m=t1');
    expect(rec.raw_data.rentalPropertyType).toBe('RentalBuilding');                    // the form's own classification key, so the radio restores
    expect(rec.raw_data).not.toHaveProperty('CustomProperty');
    expect(rec.features).toBe(rec.raw_data);
  });

  it('the REBNY CustomFields of the expanded CustomProperty row are plain keys ("0" / "1" stay as the provider sends them)', async () => {
    const h = loadListingViewerLive({ liveListings: [MAPPED] });
    const rec = await h.viewerLiveListing('RLS20005678', 'rental');
    expect(rec.raw_data.SponsorUnitYN).toBe('0');
    expect(rec.raw_data.AttendanceType).toBe('DoormanFullTime');
    const yes = h.viewerLiveRecord({ ...MAPPED }, { ...RAW, CustomProperty: { CustomFields: { SponsorUnitYN: '1' } } }, 'RLS20005678', 'sale');
    expect(yes.raw_data.SponsorUnitYN).toBe('1');
    expect(yes.raw_data.salePropertyType).toBe('RentalBuilding');
  });

  it('the video boxes get the unbranded links the mapper classified as videos, in order; the 3D box keeps the raw field', async () => {
    const h = loadListingViewerLive({ liveListings: [MAPPED] });
    const rec = await h.viewerLiveListing('RLS20005678', 'rental');
    expect(rec.raw_data.rentalVideoUrl).toBe('https://youtu.be/v1');
    expect(rec.raw_data.rentalVideoTourUrl).toBe('https://vimeo.com/22');
    expect(rec.tours).toEqual(MAPPED.tours);
    expect(rec.videos_count).toBe(2);
    const none = h.viewerLiveRecord({ lid: 'RLS1', status: 'ACTIVE' }, { ListingId: 'RLS1' }, 'RLS1', 'sale');
    expect(none.raw_data.saleVideoUrl).toBe('');
    expect(none.videos_count).toBeNull();
  });

  it('an RLS id that is not in live Cotality fails closed, and so does an answer without the row', async () => {
    const h = loadListingViewerLive({ liveListings: [] });
    await expect(h.viewerLiveListing('RLS20009999', 'rental')).rejects.toThrow(/not in live Cotality/);
    const noRaw = loadListingViewerLive({ liveListings: [{ ...MAPPED, raw: undefined }] });
    await expect(noRaw.viewerLiveListing('RLS20005678', 'rental')).rejects.toThrow(/not in live Cotality/);
    expect(h.listingsGet).not.toHaveBeenCalled();
  });

  it('the photos and floor plans of a live listing come from the live media route, classified by the server, in order', async () => {
    const h = loadListingViewerLive({ media: { RLS20005678: [
      { url: 'https://cdn.example/plan.jpg', mediaType: 'FloorPlan', order: 3 }, { url: 'https://cdn.example/p2.jpg', mediaType: 'Photo', order: 2 },
      { url: 'https://cdn.example/p1.jpg', mediaType: 'Photo', order: 1 }, { url: 'https://cdn.example/walk.mp4', mediaType: 'Video', order: 4 }, { url: 'https://cdn.example/p1.jpg', mediaType: 'Photo', order: 5 },
    ] } });
    const media = await h.viewerLiveMedia('RLS20005678');
    expect(h.fetch).toHaveBeenCalledWith('/api/media/batch?ids=RLS20005678&detail=true', { credentials: 'same-origin' });
    expect(media).toEqual({ photos: ['https://cdn.example/p1.jpg', 'https://cdn.example/p2.jpg'], plans: ['https://cdn.example/plan.jpg'] });
  });

  it('a Mallan-only id names its side; an RLS id names none', () => {
    const h = loadListingViewerLive();
    expect(h.viewerMallanSide('SL-1001')).toBe('sale');
    expect(h.viewerMallanSide('rl-7')).toBe('rental');
    expect(h.viewerMallanSide('RLS20005678')).toBeNull();
  });
});

describe('the two viewers route an id through the live loader', () => {
  it.each([['sale', sale, 'Rental'], ['rental', rental, 'Sales']])('%s viewer: the live loader for an RLS id, the CRM record for its own Mallan side, fail-closed for the other side', (side, html, other) => {
    expect(html).toContain('<script src="js/core/listing-viewer-live.js"></script>');
    expect(html).toContain("var owned = typeof viewerMallanSide === 'function' ? viewerMallanSide(id) : null;");
    expect(html).toContain("if (owned && owned !== '" + side + "') {");
    expect(html).toContain("open it in the " + other + " Tools viewer");
    expect(html).toContain("var request = (!owned && typeof viewerLiveListing === 'function') ? viewerLiveListing(id, '" + side + "') : MallanAPI.listings.get(id);");
    expect((html.match(/MallanAPI\.listings\.get\(id\)/g) || []).length).toBe(1);                        // the CRM record is read in that one place
    expect(html).toContain("if (record._source === 'cotality_live' && typeof viewerLiveMedia === 'function') {");  // live photos for a live listing
    expect(html).not.toMatch(/viewerRenderTours|viewerListingFromLive|viewerRenderPhotos/);                // the retired session renderers
  });
});
