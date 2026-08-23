/// <reference types="jest" />
/**
 * THE FORMS CARRY NO PROVIDER FIELD SCHEMA.
 *
 * mallan.nyc does not transmit listings to REBNY — submission is via RealPlus
 * (LMP). These forms are CRM data entry into Mallan's own database, so their
 * controls are Mallan canonical fields and already carry a Mallan id.
 *
 * A per-field list of phantom names used to be checked here. That list could
 * only ever cover the phantoms someone had already noticed. The invariant below
 * is stronger: no control claims a provider field at all, so a phantom cannot be
 * introduced. Where a provider correspondence is genuinely needed it is resolved
 * through the one verified mapping, not embedded in markup.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORMS = [
  'SALE-FORM-REDESIGN.html',
  'RENTAL-FORM-REDESIGN.html',
  'SALE-FORM-WITH-TOOLS.html',
  'RENTAL-FORM-WITH-TOOLS.html',
];

describe('the CRM forms embed no provider field schema', () => {
  it.each(FORMS)('%s declares no provider field binding', (name) => {
    const html = readFileSync(resolve(__dirname, '../../public/crm', name), 'utf8');
    // The scan must have something to scan.
    expect(html.length).toBeGreaterThan(10000);
    expect(html).not.toMatch(/data-[a-z]+-field="/);
  });

  it.each(FORMS)('%s marks Mallan-internal controls as Mallan-owned', (name) => {
    const html = readFileSync(resolve(__dirname, '../../public/crm', name), 'utf8');
    // Controls Mallan holds but never sources from a provider say so in Mallan
    // terms, rather than by naming a provider field they are not bound to.
    expect(html).toMatch(/data-mallan-internal="true"/);
  });

  it('building-feature checkboxes are grouped by a Mallan grouping attribute', () => {
    const html = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    const inputs = html.match(/<input[^>]*data-mallan-group="buildingFeatures"[^>]*>/g) || [];
    // Grouping is a markup concern. The provider correspondence for these values
    // lives in the canonical mapping, not on the elements.
    expect(inputs.length).toBe(19);
  });
});
