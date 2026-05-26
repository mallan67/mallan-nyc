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

  it('contains System Ownership section identifying RealPlus as listing-entry source', () => {
    const content = readFileSync(DOC_PATH, 'utf-8');
    expect(content).toContain('RealPlus/RLS');
    expect(content).toContain('Listing-entry source for official REBNY listings');
  });
});
