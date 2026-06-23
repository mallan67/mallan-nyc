/// <reference types="jest" />
/**
 * Sale-form open-house scheduling now PERSISTS (2026-06-23). Previously saveSaleOpenHouse only
 * inserted an HTML card (data-rls-ignore inputs, no API call), so open houses were discarded on
 * save and never reached the public /open-houses page or the listing detail banner.
 *
 * Fix: open houses are stored as `showing` rows tied to the listing via POST /api/crm/showings,
 * loaded on edit (GET), and removed via PATCH status='cancelled'. Only PUBLIC events display
 * publicly (type='openhouse'); Broker/By-Appointment are internal (type='brokersopen'). Coming
 * Soon blocks scheduling (REBNY UCBA Art. I §16). Source-structure assertions (no jsdom).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

function fn(name: string, span = 2600): string {
  const i = FORM.indexOf(name);
  return i < 0 ? '' : FORM.slice(i, i + span);
}

describe('sale form — open house PERSISTS via the showing table', () => {
  it('saveSaleOpenHouse POSTs to /api/crm/showings (tied to the listing id)', () => {
    const s = fn('async function saveSaleOpenHouse()');
    expect(s).toMatch(/fetch\('\/api\/crm\/showings',\s*\{\s*method: 'POST'/);
    expect(s).toMatch(/listing_id: String\(listingId\)/);
    expect(s).toContain('_renderSaleOpenHouseCard(');
  });

  it('requires a saved listing id and blocks Coming Soon (UCBA Art. I §16)', () => {
    const s = fn('async function saveSaleOpenHouse()');
    expect(s).toMatch(/_saleEditListingId[\s\S]*?_saleEditDbId/);
    expect(s).toMatch(/statusEl\.value === 'ComingSoon'/);
    expect(s).toMatch(/Save the listing first/);
  });

  it('only PUBLIC events map to the public showing type (openhouse); Broker/Appt are internal', () => {
    const s = fn('function _ohShowingType(');
    expect(s).toMatch(/case 'Public':\s*return \{ showingType: 'openhouse',\s*isPublic: true/);
    expect(s).toMatch(/case 'BrokerOnly':\s*return \{ showingType: 'brokersopen',\s*isPublic: false/);
    expect(s).toMatch(/case 'ByAppointment':\s*return \{ showingType: 'brokersopen',\s*isPublic: false/);
  });
});

describe('sale form — open house remove + load', () => {
  it('removeSaleOpenHouse cancels via PATCH status=cancelled (no hard delete)', () => {
    const s = fn('async function removeSaleOpenHouse(');
    expect(s).toMatch(/\/api\/crm\/showings\/'\s*\+\s*encodeURIComponent\(showingId\)/);
    expect(s).toMatch(/method: 'PATCH'[\s\S]*?status: 'cancelled'/);
  });

  it('loadSaleOpenHouses GETs the openhouse showings and filters to this listing', () => {
    const s = fn('async function loadSaleOpenHouses(');
    expect(s).toMatch(/\/api\/crm\/showings\?type=openhouse/);
    expect(s).toMatch(/s\.listing && s\.listing\.listing_id/);
    expect(s).toMatch(/s\.status === 'cancelled'/); // skip cancelled
  });

  it('edit-load calls loadSaleOpenHouses so existing open houses render', () => {
    expect(FORM).toMatch(/loadSaleOpenHouses\(listing\.listing_id/);
  });
});
