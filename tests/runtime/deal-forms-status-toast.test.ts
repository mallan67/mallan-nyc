/// <reference types="jest" />
/**
 * Buyer / Tenant deal forms — the save toast reports the deal's ACTUAL status.
 *
 * Observed 2026-10-28 in the served forms: POST /api/crm/deals answered
 * {"id":"4","status":"submitted"} while the toast said "Buyer deal saved as
 * draft (#4)". A message must state what the server did (owner rule: never
 * display a presumed state), so the label now carries `dealStatus`, which the
 * form already takes from the response.
 */
import fs from 'node:fs';
import path from 'node:path';

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, '../../public/crm', name), 'utf8');

describe.each([
  ['BUYER-DEAL-FORM.html', 'Buyer'],
  ['TENANT-DEAL-FORM.html', 'Tenant'],
])('%s — save toast', (file, side) => {
  const form = read(file);

  test('never says "saved as draft" on its own', () => {
    expect(form).not.toContain(`'${side} deal saved as draft'`);
  });

  test('the label is built from the status the server returned', () => {
    expect(form).toMatch(new RegExp(`\\(existingId \\? '${side} deal updated' : '${side} deal saved'\\) \\+ ' · status ' \\+ dealStatus`));
  });

  test('dealStatus still comes from the response first', () => {
    expect(form).toMatch(/var dealStatus = \(data && data\.status\)/);
  });
});

/**
 * Same files — the auth-gate script block was an unterminated string literal
 * (`'/crm/login.html;`), the defect class already fixed in the rental form
 * (rental-form-p0-fixes). The block failed to parse, so an unauthenticated
 * visitor was never redirected to login. Every inline script block of each
 * served form must parse.
 */
describe.each(['BUYER-DEAL-FORM.html', 'TENANT-DEAL-FORM.html', 'SALE-FORM-REDESIGN.html', 'RENTAL-FORM-REDESIGN.html', 'SALE-FORM-WITH-TOOLS.html', 'RENTAL-FORM-WITH-TOOLS.html'])('%s — inline scripts parse', (file) => {
  const form = read(file);

  test('no unterminated /crm/login.html redirect remains', () => {
    expect(form).not.toMatch(/['"]\/crm\/login\.html;/);
  });

  test('every inline <script> block is valid JavaScript', () => {
    const re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    let blocks = 0;
    while ((m = re.exec(form))) {
      blocks++;
      expect(() => new Function(m![1])).not.toThrow();
    }
    expect(blocks).toBeGreaterThan(0);
  });
});
