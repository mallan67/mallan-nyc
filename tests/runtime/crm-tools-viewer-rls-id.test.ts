/// <reference types="jest" />
/**
 * The Tools viewer shows a Sale listing's RLS link (Maya, 2026-11-03). "Pull from Cotality" records the listing's Cotality ListingId (the RLS ID, RLS20123633) as raw_data.saleRlsId and
 * its ListingKey (a different identifier) as raw_data.saleRlsListingKey. The viewer is read-only, so it must show what the record carries: the header and the two boxes.
 */
import { bootViewer, field, rendered, until } from './tools-viewer-harness';

jest.setTimeout(120000);

const SL = {
  id: '688026', listing_id: 'SL-0009', mls_id: null, status: 'Draft', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condominium',
  list_price: '1200000', bedrooms_total: 2, bathrooms_full: 2, borough: 'Manhattan', city: 'New York', postal_code: '10017',
  address: { StreetNumber: '800', StreetName: '2nd', StreetSuffix: 'Avenue', UnitNumber: '806', City: 'New York', StateOrProvince: 'NY', PostalCode: '10017' },
  features: {}, agent_info: {}, media: [],
};

describe('SALE-FORM-WITH-TOOLS: the RLS link', () => {
  it('a listing pulled from RLS20123633 shows that RLS ID in the header and the box, and the ListingKey apart', async () => {
    const b = bootViewer('SALE-FORM-WITH-TOOLS', { listing: { ...SL, raw_data: { saleRlsId: 'RLS20123633', saleRlsListingKey: '1194314473' } } });
    try {
      await until(() => rendered(b.d));
      expect(b.d.getElementById('saleRlsIdDisplay')?.textContent).toBe('RLS20123633');
      expect(field(b.d, 'saleRlsId')?.value).toBe('RLS20123633');
      expect(field(b.d, 'saleRlsListingKey')?.value).toBe('1194314473');
      expect(b.d.getElementById('saleListingIdDisplay')?.textContent).toBe('SL-0009');   // the listing's own ID is not replaced by the RLS ID
    } finally { b.close(); }
  });

  it('a listing that was never pulled says not linked, and the boxes stay empty', async () => {
    const b = bootViewer('SALE-FORM-WITH-TOOLS', { listing: { ...SL, raw_data: {} } });
    try {
      await until(() => rendered(b.d));
      expect(b.d.getElementById('saleRlsIdDisplay')?.textContent).toBe('not linked');
      expect(field(b.d, 'saleRlsId')?.value).toBe('');
      expect(field(b.d, 'saleRlsListingKey')?.value).toBe('');
    } finally { b.close(); }
  });
});
