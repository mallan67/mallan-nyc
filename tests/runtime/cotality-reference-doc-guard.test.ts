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

  /**
   * SYSTEM OWNERSHIP previously asserted that a third-party listing-entry vendor
   * was a component of the Mallan production architecture. That was wrong under
   * the standing architecture: there are exactly TWO systems — mallan.nyc
   * (canonical, editable local listings) and Cotality/Trestle (inbound,
   * read-only). These assertions replace the retired one and protect strictly
   * more: provider direction, read-only consumption, no writeback, local
   * canonical/editable authority, and absence of any retired vendor component.
   */
  describe('SYSTEM OWNERSHIP describes the CURRENT two-system architecture', () => {
    const doc = () => readFileSync(DOC_PATH, 'utf-8');
    const rowFor = (label: string) =>
      doc().split('\n').find((l) => l.includes(label)) ?? '';

    it('has the SYSTEM OWNERSHIP section', () => {
      expect(doc()).toContain('## SYSTEM OWNERSHIP');
    });

    it('names Cotality/Trestle as the INBOUND, READ-ONLY provider', () => {
      const row = rowFor('**Cotality/Trestle**');
      expect(row).not.toBe('');
      expect(row).toMatch(/inbound/i);
      expect(row).toMatch(/read-only/i);
    });

    it('names mallan.nyc as canonical, holding EDITABLE SL-/RL- records', () => {
      const row = rowFor('**mallan.nyc**');
      expect(row).not.toBe('');
      expect(row).toMatch(/canonical/i);
      expect(row).toMatch(/editable/i);
      expect(row).toMatch(/SL-\*/);
    });

    it('states mallan.nyc does NOT write back to Trestle', () => {
      expect(rowFor('**mallan.nyc**')).toMatch(/does NOT write back to Trestle/i);
    });

    it('represents NO retired listing-entry vendor as a system component', () => {
      // Pattern assembled from fragments so this guard cannot match itself.
      const retired = new RegExp(['Real', 'Plus'].join('[ _-]?'), 'i');
      expect(retired.test(doc())).toBe(false);
    });
  });
});
