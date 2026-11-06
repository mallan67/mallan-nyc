/// <reference types="jest" />
/**
 * The Sale form has no button that does nothing (Maya, 2026-11-06: "do not add things that do not exist").
 *
 * Found by opening the form in a real browser and clicking every button the way an agent does: 14 buttons had no handler of any kind, so a click changed nothing. Each is gone:
 *  - Bold, Italic and List over the Listing Description, and a B and an I over each of the four Townhouse / Building description boxes (the description is plain text on the RLS);
 *  - "Copy Building Flip Tax", "Save Feature / Changes / Sort Order" and the Preview's "Email" (Print works);
 *  - the Edit pencil on the listing agent's row in the Agent Contacts table (the agent's details come from the directory, so there is nothing to edit there).
 * The same row wrote the agent's name, company, phone and e-mail into the page as markup; a value from the directory is text.
 *
 * What stays: every other button has a handler, and the Print button of the Preview, the file drop zones and the co-list agent's remove button still work. The "Contact Agent" button is part of the
 * Preview's picture of the public page, which is a mock of the listing page and not a control of the form.
 */
import { bootAddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);

const H = (name: string) => `<img src=x onerror="window.__pwned_${name}=1">`;
const label = (b: Element) => (b.textContent ?? '').replace(/\s+/g, ' ').trim() || b.getAttribute('title') || '(icon)';

describe('the Sale form: every button does something', () => {
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm('SALE-FORM-REDESIGN'); });
  afterAll(() => f.close());

  it('boots without a page error', () => { expect(f.errors).toEqual([]); });

  it('every button has a handler, except the "Contact Agent" button of the Preview\'s mock of the public page', () => {
    const bare = [...f.d.querySelectorAll('button')].filter((b) => !b.getAttribute('onclick') && !b.closest('#salePreviewSite')).map(label);
    expect(bare).toEqual([]);
  });

  it('the controls that did nothing are gone', () => {
    const labels = [...f.d.querySelectorAll('button')].map(label);
    for (const gone of ['Copy Building Flip Tax', 'Save Feature / Changes / Sort Order', 'Email']) expect([gone, labels.includes(gone)]).toEqual([gone, false]);
    expect(f.d.querySelector('button[title="Bold"], button[title="Italic"], button[title="List"]')).toBeNull();
    // the B / I buttons over the four Townhouse / Building description boxes are gone: the panel keeps only its Back and Next
    expect([...f.d.querySelectorAll('#saleSubTabContent3_2 button')].map(label)).toEqual(['Back: Essentials', 'Next: Financials']);
  });

  it('the Print button of the Preview is still there (it opens the browser\'s print window)', () => {
    expect([...f.d.querySelectorAll('button[onclick="window.print()"]')].map(label)).toEqual(['Print']);
  });

  it('the Listing Description keeps its character count and the scan note, now at the right', () => {
    const count = f.d.getElementById('saleDescCharCount') as HTMLElement;
    expect(count).not.toBeNull();
    expect(count.parentElement?.className).toContain('ml-auto');
    expect(count.parentElement?.textContent).toContain('UCBA + Fair Housing scan active');
  });
});

describe('the Agent Contacts table: a directory value is text, and the row has nothing to click that does nothing', () => {
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm('SALE-FORM-REDESIGN'); });
  afterAll(() => f.close());

  it('writes the agent\'s id, name, company, phone and e-mail as text, with no Edit pencil', () => {
    f.w.updateSaleAgentTable('listing', H('id'), H('name'), H('company'), H('phone'), H('email'));
    const table = f.d.getElementById('saleAgentContactsTable') as HTMLElement;
    const row = table.querySelector('tr[data-type="listing"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.querySelector('img')).toBeNull();                                 // no <img> from the stored text
    expect(row.querySelectorAll('[onerror]')).toHaveLength(0);
    expect(Object.keys(f.w).filter((k) => k.startsWith('__pwned_'))).toEqual([]);
    for (const n of ['id', 'name', 'company', 'phone', 'email']) expect([n, row.textContent?.includes(H(n))]).toEqual([n, true]);
    expect(row.querySelectorAll('button')).toHaveLength(0);
  });

  it('a second call for the same agent replaces the row, as before', () => {
    f.w.updateSaleAgentTable('listing', 'AG-1', 'First Name', 'Co', '212-555-0101', 'a@example.test');
    f.w.updateSaleAgentTable('listing', 'AG-1', 'Second Name', 'Co', '212-555-0101', 'a@example.test');
    const rows = f.d.querySelectorAll('#saleAgentContactsTable tr[data-type="listing"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Second Name');
  });

  it('a missing value is an empty cell, not the word "undefined"', () => {
    f.w.updateSaleAgentTable('buyer', undefined, 'Buyer Agent', undefined, null, undefined);
    const row = f.d.querySelector('#saleAgentContactsTable tr[data-type="buyer"]') as HTMLElement;
    expect(row.textContent).toContain('Buyer Agent');
    expect(row.textContent).not.toMatch(/undefined|null/);
  });
});
