/**
 * Auction sub-section wiring — runtime test (C3c).
 *
 * Asserts public/crm/SALE-FORM-REDESIGN.html carries the auction toggle,
 * the four auction inputs, the visibility-toggle handler,
 * and the snake_case mapping block in collectSaleFormData() that the API
 * validator (AU-001..AU-005, lib/compliance/rls-enforcement.ts) expects.
 *
 * Schema (PR #50) + validator (PR #57) are already shipped. This test
 * proves the UI plumbing is correct so submissions actually reach the
 * validator with the right keys.
 *
 * Style: file-string parsing rather than DOM/JSDOM. The project's jest
 * runtime config uses node env, and jsdom is not a dependency. The form
 * is large and stable — substring assertions on attribute strings are
 * sufficient to gate against accidental breakage of the wiring.
 *
 * @module tests/runtime/auction-form-flow
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORM_PATH = resolve(__dirname, '..', '..', 'public', 'crm', 'SALE-FORM-REDESIGN.html');

describe('SALE-FORM-REDESIGN.html — auction sub-section (C3c)', () => {
  let html: string;

  beforeAll(() => {
    html = readFileSync(FORM_PATH, 'utf8');
  });

  it('includes the auction sub-section container', () => {
    expect(html).toContain('id="saleAuctionSection"');
    expect(html).toContain('id="saleAuctionFields"');
  });

  it('includes the auction-on toggle wired to the visibility handler', () => {
    expect(html).toContain('id="saleAuctionYn"');
    expect(html).toContain('onchange="toggleSaleAuctionFields()"');
    // The toggle is a Mallan control. It carries no provider binding: Cotality
    // declares no auction field on any resource, so a provider attribute here
    // would assert a mapping that cannot exist.
    expect(html).toMatch(/id="saleAuctionYn"/);
  });

  it('includes the four auction field inputs', () => {
    const expected: Array<[string, string, string]> = [
      ['saleAuctionType', 'auction_type', 'select'],
      ['saleAuctionStartDate', 'auction_start_date', 'datetime-local'],
      ['saleAuctionEndDate', 'auction_end_date', 'datetime-local'],
      ['saleAuctionTermsUrl', 'auction_terms_url', 'url'],
    ];
    for (const [id, field] of expected) {
      // id present
      expect(html).toContain(`id="${id}"`);
      const re = new RegExp(`id="${id}"`);
      expect(html).toMatch(re);
    }
  });

  it('Auction Type select offers exactly the validator picklist (AU-002)', () => {
    // The validator (AU-002) restricts to {Absolute, WithReserve, Minimum}.
    // Find the saleAuctionType <select> block and assert it has exactly those
    // three real option values plus the empty placeholder.
    const selectBlock = html.match(/<select id="saleAuctionType"[\s\S]*?<\/select>/);
    expect(selectBlock).not.toBeNull();
    const opts = selectBlock![0].match(/<option value="([^"]*)"/g) ?? [];
    const values = opts.map(o => o.match(/value="([^"]*)"/)![1]);
    expect(values).toContain('');           // placeholder
    expect(values).toContain('Absolute');
    expect(values).toContain('WithReserve');
    expect(values).toContain('Minimum');
    // And nothing else outside the validator picklist.
    const extras = values.filter(v => v !== '' && v !== 'Absolute' && v !== 'WithReserve' && v !== 'Minimum');
    expect(extras).toEqual([]);
  });

  it('defines toggleSaleAuctionFields() that hides + clears on toggle-off', () => {
    expect(html).toContain('function toggleSaleAuctionFields()');
    // Visibility flip via display style:
    expect(html).toMatch(/fields\.style\.display\s*=\s*on\s*\?\s*''\s*:\s*'none'/);
    // Clear on toggle-off — verify all four field IDs are reset:
    const clearBlock = html.match(/function toggleSaleAuctionFields\(\)[\s\S]*?\n\}/);
    expect(clearBlock).not.toBeNull();
    expect(clearBlock![0]).toContain('saleAuctionType');
    expect(clearBlock![0]).toContain('saleAuctionStartDate');
    expect(clearBlock![0]).toContain('saleAuctionEndDate');
    expect(clearBlock![0]).toContain('saleAuctionTermsUrl');
  });

  it('initial visibility of saleAuctionFields is hidden', () => {
    // The fields div opens with style="display:none;" so the section is
    // collapsed until the agent ticks the auction-on toggle.
    expect(html).toMatch(/id="saleAuctionFields"[^>]*style="display:none;?"/);
  });

  it('collectSaleFormData() emits the five snake_case auction keys', () => {
    const fnMatch = html.match(/function collectSaleFormData\(\)[\s\S]*?return data;\s*\}/);
    expect(fnMatch).not.toBeNull();
    const fn = fnMatch![0];
    expect(fn).toMatch(/data\.auction_yn\s*=/);
    expect(fn).toMatch(/data\.auction_type\s*=/);
    expect(fn).toMatch(/data\.auction_start_date\s*=/);
    expect(fn).toMatch(/data\.auction_end_date\s*=/);
    expect(fn).toMatch(/data\.auction_terms_url\s*=/);
  });

  it('toggle-off path NULLs out the four optional auction fields (no stale data leak)', () => {
    const fnMatch = html.match(/function collectSaleFormData\(\)[\s\S]*?return data;\s*\}/);
    expect(fnMatch).not.toBeNull();
    const fn = fnMatch![0];
    // The else branch (auction_yn === false) should explicitly null all four
    // detail fields to prevent submitting stale auction data on a
    // non-auction listing.
    const elseBranch = fn.match(/}\s*else\s*{[\s\S]*?data\.auction_terms_url\s*=\s*null;[\s\S]*?\}/);
    expect(elseBranch).not.toBeNull();
    expect(elseBranch![0]).toMatch(/data\.auction_type\s*=\s*null/);
    expect(elseBranch![0]).toMatch(/data\.auction_start_date\s*=\s*null/);
    expect(elseBranch![0]).toMatch(/data\.auction_end_date\s*=\s*null/);
  });
});
