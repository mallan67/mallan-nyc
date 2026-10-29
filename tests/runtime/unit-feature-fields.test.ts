/// <reference types="jest" />
/**
 * The unit-feature mapping (public/crm/js/forms/unit-feature-fields.js): every Cotality member it sends is a live member of that field, every form value it reads is a box on the form,
 * and the forms call it. Live Cotality 2026-10-16 is the contract (data/cotality-enums.live.json).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mapper = require('../../public/crm/js/forms/unit-feature-fields.js') as { MAP: string[][]; FIREPLACES: string[][]; apply: (d: Record<string, unknown>, p: string) => Record<string, unknown> };

const ROOT = resolve(__dirname, '../..');
const live = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-enums.live.json'), 'utf8'));
const membersOf = (field: string): string[] => {
  const t = String(live.entities.Property[field] ?? '').replace(/^Collection\(/, '').replace(/\)$/, '').replace(/^.*\.Enums\.(?:Multi\.)?/, '');
  return live.enums[field] ?? live.enums[t] ?? [];
};

describe('every Cotality member the mapping sends is live', () => {
  it.each(mapper.MAP.map((r) => [r[0] + ':' + r[1], r[2], r[3]]))('%s -> %s.%s', (_form, field, member) => {
    expect(live.entities.Property).toHaveProperty(field);
    expect(membersOf(field)).toContain(member);
  });
  it('no row is listed twice', () => {
    const keys = mapper.MAP.map((r) => r.join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// 2026-10-28: the Sale form is Maya's fixed form, which answers the unit feature groups in its own collector (crm-sale-form-roundtrip.test.ts, crm-form-field-roundtrip.test.ts); the module serves the Rental form.
describe.each(['RENTAL-FORM-REDESIGN'])('%s', (name) => {
  const html = readFileSync(resolve(ROOT, `public/crm/${name}.html`), 'utf8');
  const prefix = name.startsWith('SALE') ? 'sale' : 'rental';
  const doc = new JSDOM(html).window.document;

  it('loads the mapping and calls it before the save payload is returned', () => {
    expect(html).toContain('<script src="js/forms/unit-feature-fields.js"></script>');
    expect(html).toContain(`MallanUnitFeatureFields.apply(data, '${prefix}')`);
  });

  it('every form value it reads is a box on this form (for the groups this form has)', () => {
    const missing: string[] = [];
    for (const [suffix, value] of mapper.MAP) {
      const boxes = [...doc.querySelectorAll(`input[name="${prefix}${suffix}"]`)] as HTMLInputElement[];
      if (boxes.length === 0) continue;                                              // this form has no such group
      if (!boxes.some((b) => b.value === value)) missing.push(`${prefix}${suffix}=${value}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('fireplaces', () => {
  it('the three kinds are live FireplaceFeatures members and FireplacesTotal is a live Property field', () => {
    expect(live.entities.Property).toHaveProperty('FireplacesTotal');
    for (const [, member] of mapper.FIREPLACES) expect(membersOf('FireplaceFeatures')).toContain(member);
  });
  it('the counts become FireplacesTotal and the kinds that have any', () => {
    const d = mapper.apply({ saleDecorativeFireplaces: '1', saleGasFireplaces: '0', saleWoodburningFireplaces: '2' }, 'sale');
    expect(d.FireplacesTotal).toBe(3);
    expect(d.FireplaceFeatures).toEqual(['Decorative', 'WoodBurning']);
  });
  it('no count, nothing sent', () => {
    const d = mapper.apply({ saleDecorativeFireplaces: '', saleGasFireplaces: '0' }, 'sale');
    expect(d).not.toHaveProperty('FireplacesTotal');
    expect(d).not.toHaveProperty('FireplaceFeatures');
  });
});

describe('apply', () => {
  it('turns the form answers into Cotality fields and keeps what the collector already sent', () => {
    const d = mapper.apply({ saleExposure: ['North', 'East'], saleFlooring: ['Hardwood', 'Herringbone'], saleWindows: ['DoublePane'], salePrivateOutdoorSpace: ['Balcony', 'Terrace', 'WrapTerrace'], InteriorFeatures: ['Fireplace'] }, 'sale');
    expect(d.Exposures).toEqual(['North', 'East']);
    expect(d.Flooring).toEqual(['Hardwood']);                                        // Herringbone has no live member: not sent
    expect(d.WindowFeatures).toEqual(['DoublePaneWindows']);
    expect(d.PatioAndPorchFeatures).toEqual(['Balcony', 'Terrace']);
    expect(d.ExteriorFeatures).toEqual(['Balcony']);
    expect(d.InteriorFeatures).toEqual(['Fireplace']);
    expect(d).not.toHaveProperty('RoomType');
  });
  it('sends nothing for a group nobody answered, and each member once', () => {
    expect(mapper.apply({ saleExposure: [] }, 'sale')).toEqual({ saleExposure: [] });
    expect((mapper.apply({ salePrivateOutdoorSpace: ['Balcony', 'Balcony'] }, 'sale').PatioAndPorchFeatures as string[])).toEqual(['Balcony']);
  });
});
