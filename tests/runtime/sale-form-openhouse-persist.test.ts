/// <reference types="jest" />
/**
 * Sale-form open-house scheduling now PERSISTS (2026-06-23). Previously saveSaleOpenHouse only
 * inserted an HTML card (data-rls-ignore inputs, no API call), so open houses were discarded on
 * save and never reached the public /open-houses page or the listing detail banner.
 *
 * Fix: open houses are stored as `showing` rows tied to the listing via POST /api/crm/showings,
 * loaded on edit (GET), and removed via PATCH status='cancelled'. PUBLIC events display publicly
 * (type='openhouse') — Public, Virtual, AND By Appointment (a public open house that requires an
 * RSVP, 2026-07-16); only Broker Only is internal (type='brokersopen'). Coming Soon blocks
 * scheduling (REBNY UCBA Art. I §16). Source-structure assertions (no jsdom).
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

  it('Public/Virtual/ByAppointment map to the public showing type (openhouse); only BrokerOnly is internal', () => {
    const s = fn('function _ohShowingType(');
    expect(s).toMatch(/case 'Public':\s*return \{ showingType: 'openhouse',\s*isPublic: true/);
    expect(s).toMatch(/case 'Virtual':\s*return \{ showingType: 'openhouse',\s*isPublic: true/);
    // By Appointment is a PUBLIC open house that requires an RSVP (2026-07-16) — no longer internal.
    expect(s).toMatch(/case 'ByAppointment':\s*return \{ showingType: 'openhouse',\s*isPublic: true/);
    // Broker Only remains the ONLY internal type.
    expect(s).toMatch(/case 'BrokerOnly':\s*return \{ showingType: 'brokersopen',\s*isPublic: false/);
  });

  it('saveSaleOpenHouse persists the form type as a [Type] notes marker (recovers By Appointment)', () => {
    const s = fn('async function saveSaleOpenHouse()');
    // fullNotes = '[' + type + '] ' + notes  → e.g. "[ByAppointment] ..." — the designation survives
    // reload and is what the public API + card resolver key off of for the "· By Appointment" label.
    expect(s).toMatch(/\[' \+ type \+ '\]/);
  });
});

describe('sale form — open house remove + load', () => {
  it('removeSaleOpenHouse cancels via PATCH status=cancelled (no hard delete)', () => {
    const s = fn('async function removeSaleOpenHouse(');
    expect(s).toMatch(/\/api\/crm\/showings\/'\s*\+\s*encodeURIComponent\(showingId\)/);
    expect(s).toMatch(/method: 'PATCH'[\s\S]*?status: 'cancelled'/);
  });

  it('loadSaleOpenHouses fetches BOTH open-house types and filters to this listing', () => {
    const s = fn('async function loadSaleOpenHouses(');
    // No type filter on the GET — internal brokersopen events must reload too (Codex P2).
    expect(s).not.toMatch(/\/api\/crm\/showings\?type=openhouse/);
    expect(s).toMatch(/\/api\/crm\/showings\?limit=200/);
    expect(s).toMatch(/s\.type !== 'openhouse' && s\.type !== 'brokersopen'/);
    expect(s).toMatch(/s\.listing && s\.listing\.listing_id/);
    expect(s).toMatch(/s\.status === 'cancelled'/); // skip cancelled
  });

  it('persisted open-house notes + time are HTML-escaped before render (no stored XSS, Codex P2)', () => {
    const s = fn('function _renderSaleOpenHouseCard(', 2000);
    expect(s).toMatch(/escapeHtml\(oh\.notes\)/);
    expect(s).toMatch(/escapeHtml\(oh\.time/);
    // the raw, unescaped concatenation must be gone
    expect(s).not.toMatch(/mt-1">'\s*\+\s*oh\.notes\s*\+/);
  });

  it('edit-load calls loadSaleOpenHouses so existing open houses render', () => {
    expect(FORM).toMatch(/loadSaleOpenHouses\(listing\.listing_id/);
  });
});
