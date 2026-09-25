/// <reference types="jest" />
/**
 * BOTH INTAKE FORMS SEND THE CANONICAL OWNER, AND BOTH RESTORE IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEAD-END THIS CLOSES
 *
 * `Listing.owner_client_id` is the only canonical Seller/Landlord relation. The
 * server has accepted and authorised it on create for some time, and the status
 * route refuses to publish a Mallan-local listing without one.
 *
 * Neither intake form ever sent it. So every form-created listing was ownerless
 * AND permanently unpublishable, and until PATCH gained an owner write path
 * there was no way to repair it. The publication guard was a trap with no
 * corresponding way to satisfy it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE HIDDEN INPUT IS NAMED `owner_client_id` EXACTLY
 *
 * Both forms collect their payload the same way: `collectSaleFormData()` /
 * `collectRentalFormData()` sweep every input, select and textarea inside
 * `<main class="flex-1">`, keyed by `field.id || field.name`. So a field whose
 * id IS the API field name reaches the POST/PATCH body with no extra plumbing —
 * and a field whose id is anything else silently does not.
 *
 * That is the whole mechanism, and it is why these tests assert the exact id
 * rather than "an owner input exists".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDENTITY, NOT FREE TEXT
 *
 * The visible box is a search field. The hidden input carries the Lead id and is
 * the only thing submitted. A name typed but not selected leaves the id empty
 * and the listing ownerless — a legal draft state the publication guard catches.
 * Matching a typed name to a client would be exactly the free-text identity
 * authority the architecture forbids.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

const SALE = read('public/crm/SALE-FORM-REDESIGN.html');
const RENTAL = read('public/crm/RENTAL-FORM-REDESIGN.html');
const PICKER = read('public/crm/js/core/owner-picker.js');
const API_CLIENT = read('public/crm/js/core/api-client.js');

const FORMS: Array<[string, string, string, string]> = [
  // label,   source,  role,        field prefix
  ['Sale', SALE, 'seller', 'sale'],
  ['Rental', RENTAL, 'landlord', 'rental'],
];

describe('the collection mechanism these tests depend on still exists', () => {
  it.each(FORMS)('%s sweeps fields by element id', (_label, src) => {
    // Guard the guard. If the generic collector were replaced by an explicit
    // field list, naming the hidden input `owner_client_id` would no longer be
    // sufficient and every assertion below would be misleading.
    expect(src).toMatch(/field\.id \|\| field\.name/);
  });
});

describe('each form carries a hidden canonical owner field', () => {
  it.each(FORMS)('%s has an input with id exactly owner_client_id', (_label, src) => {
    expect(src).toMatch(/id="owner_client_id"/);
  });

  it.each(FORMS)('%s marks it hidden — it is an id, not something typed', (_label, src) => {
    const idx = src.indexOf('id="owner_client_id"');
    expect(idx).toBeGreaterThan(-1);
    const tag = src.slice(src.lastIndexOf('<input', idx), idx);
    expect(tag).toMatch(/type="hidden"/);
  });

  it.each(FORMS)('%s puts it inside the container the collector actually resolves', (_label, src) => {
    // The collector is `document.querySelector('.flex-1')` — the FIRST element
    // with that class in document order, not the <main> tag by name. Asserting
    // against <main> would pass while the real container was something else, so
    // this reproduces the actual selector.
    const firstFlex1 = src.search(/class="[^"]*flex-1/);
    expect(firstFlex1).toBeGreaterThan(-1);
    // …and that first match must BE the main region, or the collector is
    // scanning the wrong subtree entirely.
    const tagStart = src.lastIndexOf('<', firstFlex1);
    expect(src.slice(tagStart, tagStart + 5)).toBe('<main');

    const containerEnd = src.indexOf('</main>', firstFlex1);
    const idx = src.indexOf('id="owner_client_id"');
    expect(idx).toBeGreaterThan(firstFlex1);
    expect(idx).toBeLessThan(containerEnd);
  });
});

describe('each form mounts the SHARED picker against the right role', () => {
  it.each(FORMS)('%s loads the shared module', (_label, src) => {
    // One implementation, two mount points. The CRM already contains four
    // separately copy-pasted client pickers; a fifth would be the problem.
    expect(src).toMatch(/js\/core\/owner-picker\.js/);
  });

  it.each(FORMS)('%s mounts with role %s', (_label, src, role) => {
    expect(src).toMatch(new RegExp(`role:\\s*'${role}'`));
  });

  it.each(FORMS)('%s wires the search, results and clear controls', (_label, src, _role, prefix) => {
    expect(src).toMatch(new RegExp(`searchId:\\s*'${prefix}OwnerSearch'`));
    expect(src).toMatch(new RegExp(`listId:\\s*'${prefix}OwnerResults'`));
    expect(src).toMatch(new RegExp(`clearId:\\s*'${prefix}OwnerClear'`));
    expect(src).toMatch(new RegExp(`id="${prefix}OwnerSearch"`));
    expect(src).toMatch(new RegExp(`id="${prefix}OwnerResults"`));
  });

  it.each(FORMS)('%s restores the owner on edit/reload', (_label, src) => {
    // Without this the owner silently disappears from the UI on reload, and the
    // next save submits an empty id — unassigning the seller.
    expect(src).toMatch(/\.hydrate\(listing\.owner_client_id\)/);
  });
});

describe('the picker asks the authenticated, agent-scoped clients API', () => {
  it('searches through MallanAPI.clients.list', () => {
    expect(PICKER).toMatch(/MallanAPI\.clients\s*\.?\s*\n?\s*\.list\(/);
  });

  it('the API client actually forwards role and search', () => {
    // Both were supported server-side and DROPPED by the client, which is why
    // every previous picker hand-rolled its own fetch.
    expect(API_CLIENT).toMatch(/params\.search.*search=/s);
    expect(API_CLIENT).toMatch(/params\.role.*role=/s);
  });

  it('it does not query any other client source', () => {
    // "Do not create a second client/owner database." The picker names
    // /api/crm/clients in its header comment (which endpoint it uses and why
    // that endpoint already scopes to the agent); what it must not do is reach
    // any OTHER source.
    const endpoints = new Set(PICKER.match(/\/api\/[a-z/-]+/g) || []);
    endpoints.delete('/api/crm/clients');
    expect([...endpoints]).toEqual([]);
  });
});

describe('a typed name is never an identity', () => {
  it('editing the search box clears any previous selection', () => {
    // Otherwise a stale id would sit behind a name the agent has since changed.
    expect(PICKER).toMatch(/addEventListener\('input'/);
    const inputHandler = PICKER.slice(
      PICKER.indexOf("addEventListener('input'"),
      PICKER.indexOf("addEventListener('focus'"),
    );
    expect(inputHandler).toMatch(/hidden\.value = ''/);
  });

  it('only a click on a result sets the id', () => {
    const clickHandler = PICKER.slice(PICKER.indexOf("list.addEventListener('click'"));
    expect(clickHandler).toMatch(/hidden\.value = opt\.dataset\.id/);
  });

  it('a failed search says so instead of showing an empty list', () => {
    // A silent empty list reads as "this client does not exist", and the agent
    // creates a duplicate.
    expect(PICKER).toMatch(/Could not load clients/);
  });

  it('hydration keeps the id even when the display lookup fails', () => {
    // Losing the id because a name lookup failed would unassign the owner on
    // the next save.
    const hydrate = PICKER.slice(PICKER.indexOf('hydrate: function'));
    const assignIdx = hydrate.indexOf('hidden.value = String(ownerClientId)');
    const lookupIdx = hydrate.indexOf('MallanAPI.clients');
    expect(assignIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeLessThan(lookupIdx); // id set BEFORE the lookup
  });
});

describe('the free-text landlord contact fields are not identity', () => {
  it('the rental form keeps them, but the canonical id is separate', () => {
    // The old fields are supplementary contact detail and stay useful. What
    // changed is that they are no longer the only thing recording who the
    // landlord is.
    expect(RENTAL).toMatch(/id="rentalOwnerName"/);
    expect(RENTAL).toMatch(/id="owner_client_id"/);
  });

  it('and the card says which one is authoritative', () => {
    expect(RENTAL).toMatch(/supplementary detail, not the owner's identity/);
  });
});
