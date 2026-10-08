/// <reference types="jest" />
/**
 * Sale-form open-house scheduling PERSISTS (2026-06-23). Previously saveSaleOpenHouse only
 * inserted an HTML card (data-rls-ignore inputs, no API call), so open houses were discarded on
 * save and never reached the public /open-houses page or the listing detail banner.
 *
 * Fix: open houses are stored as `showing` rows tied to the listing via POST /api/crm/showings,
 * loaded on edit (GET), and removed via PATCH status='cancelled'. PUBLIC events display publicly
 * (type='openhouse') — Public, Virtual, AND By Appointment (a public open house that requires an
 * RSVP, 2026-07-16); only Broker Only is internal (type='brokersopen'). Coming Soon blocks
 * scheduling (REBNY UCBA Art. I §16). Source-structure assertions (no jsdom).
 *
 * 2026-10-08: the page's own copy of this code moved onto js/forms/listing-open-houses.js (the Rental form's module), so the same rules are pinned where they live now: the page's side
 * here (the listing it saves for, Coming Soon, the load on edit) and the module's rules below. What they DO is exercised in crm-sale-open-houses.test.ts (the real page) and
 * crm-listing-open-houses.test.ts (the module on a plain page).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const MODULE = readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-open-houses.js'), 'utf8');

function fn(name: string, span = 2600): string {
  const i = MODULE.indexOf(name);
  return i < 0 ? '' : MODULE.slice(i, i + span);
}

describe('sale form — open house PERSISTS via the showing table', () => {
  it('saveSaleOpenHouse saves through the module, tied to the listing id the page holds (the listing id, else the database id)', () => {
    const s = FORM.slice(FORM.indexOf('function saveSaleOpenHouse()'), FORM.indexOf('function saveSaleOpenHouse()') + 300);
    expect(s).toMatch(/openHouses\.save\(\)/);
    expect(FORM).toMatch(/MallanOpenHouses\.create\(\{\s*prefix: 'sale',\s*listingId: function\(\) \{ return _saleEditListingId \|\| _saleEditDbId \|\| ''; \}/);
    // the module POSTs the showing with the id it is given, and asks for a saved listing
    const save = fn('function save()', 3600);
    expect(save).toMatch(/request\('\/api\/crm\/showings',\s*\{\s*method: 'POST'/);
    expect(save).toMatch(/listing_id: String\(id\)/);
    expect(save).toMatch(/Save the listing first/);
  });

  it('blocks Coming Soon (UCBA Art. I §16)', () => {
    expect(FORM).toMatch(/blocked: function\(\) \{[\s\S]*?status\.value === 'ComingSoon'\) \? 'Open houses cannot be scheduled while the listing is in Coming Soon status\.'/);
  });

  it('Public/Virtual/ByAppointment map to the public showing type (openhouse); only BrokerOnly is internal', () => {
    const s = fn('function showingType(', 900);
    expect(s).toMatch(/case 'Public': return \{ type: 'openhouse', isPublic: true \}/);
    expect(s).toMatch(/case 'Virtual': return \{ type: 'openhouse', isPublic: true \}/);
    // By Appointment is a PUBLIC open house that requires an RSVP (2026-07-16) — no longer internal.
    expect(s).toMatch(/case 'ByAppointment': return \{ type: 'openhouse', isPublic: true \}/);
    // Broker Only remains the ONLY internal type.
    expect(s).toMatch(/case 'BrokerOnly': return \{ type: 'brokersopen', isPublic: false \}/);
    expect(s).toMatch(/default: return \{ type: 'brokersopen', isPublic: false \}/);
  });

  it('the save persists the form type as a [Type] notes marker (recovers By Appointment)', () => {
    // notes = '[' + type + '] ' + notes → e.g. "[ByAppointment] ..." — the designation survives reload and is what the public API + card resolver key off of for the "· By Appointment" label.
    expect(fn('function save()', 3600)).toMatch(/notes: '\[' \+ type \+ '\] '/);
  });
});

describe('sale form — open house remove + load', () => {
  it('Remove cancels via PATCH status=cancelled (no hard delete)', () => {
    const s = fn('function removeOpenHouse(', 1800);
    expect(s).toMatch(/\/api\/crm\/showings\/' \+ encodeURIComponent\(showingId\)/);
    expect(s).toMatch(/method: 'PATCH'[\s\S]*?status: 'cancelled'/);
  });

  it('the load asks for BOTH open-house types (internal brokersopen events must reload too, Codex P2), from today, a page at a time, and keeps this listing\'s that are not cancelled', () => {
    const s = fn('function load(', 3600);
    expect(s).toMatch(/\['openhouse', 'brokersopen'\]/);
    expect(s).toMatch(/s\.type !== 'openhouse' && s\.type !== 'brokersopen'/);
    expect(s).toMatch(/s\.status === 'cancelled'/);
    expect(MODULE).toMatch(/'\/api\/crm\/showings\?type=' \+ type \+ '&date_from=' \+ today\(\) \+ '&limit=' \+ PAGE \+ '&offset=' \+ offset/);
    // not "the first 200 showings of the agent" (the oldest first), from which the page picked its own
    expect(FORM).not.toMatch(/\/api\/crm\/showings\?limit=200/);
  });

  it('persisted open-house notes + time are text on the card, never markup (no stored XSS, Codex P2)', () => {
    expect(MODULE).not.toMatch(/innerHTML\s*=/);
    expect(MODULE).not.toMatch(/insertAdjacentHTML/);
    const card = fn('function renderCard(', 3000);
    expect(card).toMatch(/element\('p', 'text-xs text-gray-500 mt-1', String\(oh\.notes\)\)/);
    expect(card).toMatch(/String\(oh\.time \|\| ''\)/);
  });

  it('edit-load hands both ids of the record to the module so existing open houses render', () => {
    expect(FORM).toMatch(/openHouses\.load\(\[listing\.listing_id, listing\.id\]\)/);
  });
});
