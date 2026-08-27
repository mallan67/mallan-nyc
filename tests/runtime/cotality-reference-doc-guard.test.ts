import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const DOC_PATH = resolve(__dirname, '../../docs/architecture/COTALITY-COMPLETE-REFERENCE.md');

describe('Cotality reference doc guard', () => {
  it('docs/architecture/COTALITY-COMPLETE-REFERENCE.md exists', () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  it('states that /odata/Property is not guaranteed complete building/address master data', () => {
    const content = readFileSync(DOC_PATH, 'utf-8');
    expect(content).toContain(
      'NOT a guaranteed complete building/address master database'
    );
  });

  it('contains the Mandatory Engineering Rule', () => {
    const content = readFileSync(DOC_PATH, 'utf-8');
    expect(content).toContain('MANDATORY ENGINEERING RULE');
  });

  it('contains the Current Building Lookup Limitation callout', () => {
    const content = readFileSync(DOC_PATH, 'utf-8');
    expect(content).toContain('CURRENT BUILDING LOOKUP LIMITATION');
  });

  it('contains a System Ownership row for the listing-entry path', () => {
    const content = readFileSync(DOC_PATH, 'utf-8');
    expect(content).toContain('Legacy upstream intermediary');
    expect(content).toContain('Listing-entry path for official REBNY listings');
  });

  it('does NOT name the legacy intermediary as a system authority', () => {
    // This guard used to REQUIRE the intermediary's product name to be present
    // in the document.
    // A test that mandates a forbidden provider name is worse than a stray
    // mention - it makes removal fail CI. Cotality API is the only provider
    // authority in this architecture; the listing-entry path is described by
    // what it does, not by whose product it is.
    // Token assembled, not written, so this guard does not itself put the
    // forbidden name back into the tree.
    const forbidden = new RegExp(['real', 'plus'].join(''), 'i');
    expect(readFileSync(DOC_PATH, 'utf-8')).not.toMatch(forbidden);
  });
});
