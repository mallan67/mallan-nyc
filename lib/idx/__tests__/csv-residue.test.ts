import { detectResidue } from '../../../scripts/lib/csv-residue';

/**
 * Migration-residue detector (PR-V1b). Drives the FAIL-FIRST behavior of
 * refresh-trestle-csv (--prune) and the non-zero exit of trestle:diff.
 *
 * A (field, resource) CSV row is residue when its field no longer exists on live
 * for that resource. Valid multi-resource fields are preserved; a resource with an
 * empty/failed live fetch is skipped (no false residue).
 */
const S = (...xs: string[]) => new Set(xs);

describe('detectResidue', () => {
  it('flags a migrated field (CustomProperty → Property) as residue under the OLD resource only', () => {
    const csv = new Map([
      ['CustomProperty', S('DownPaymentAssistanceAmount', 'SomeCustomField')],
      ['Property', S('DownPaymentAssistanceAmount', 'ListPrice')],
    ]);
    const live = new Map([
      ['CustomProperty', S('SomeCustomField')], // live CP no longer has DPA Amount
      ['Property', S('DownPaymentAssistanceAmount', 'ListPrice')], // live Property has it
    ]);
    expect(detectResidue(csv, live)).toEqual([
      { field: 'DownPaymentAssistanceAmount', resource: 'CustomProperty' },
    ]);
  });

  it('preserves valid multi-resource fields (present on live for every CSV resource)', () => {
    const csv = new Map([
      ['CustomProperty', S('HumanModifiedYN')],
      ['Property', S('HumanModifiedYN')],
      ['Media', S('HumanModifiedYN')],
    ]);
    const live = new Map([
      ['CustomProperty', S('HumanModifiedYN')],
      ['Property', S('HumanModifiedYN')],
      ['Media', S('HumanModifiedYN')],
    ]);
    expect(detectResidue(csv, live)).toEqual([]);
  });

  it('empty-fetch guard: a resource with an empty live set is skipped (no false residue)', () => {
    const csv = new Map([['CustomProperty', S('DownPaymentAssistanceAmount')]]);
    expect(detectResidue(csv, new Map([['CustomProperty', S()]]))).toEqual([]); // empty live set
    expect(detectResidue(csv, new Map())).toEqual([]); // missing resource entirely
  });

  it('returns [] when CSV matches live (zero residue → diff exits 0)', () => {
    const csv = new Map([['Property', S('ListPrice', 'MoveInCostsAmount')]]);
    const live = new Map([['Property', S('ListPrice', 'MoveInCostsAmount', 'NewLiveField')]]);
    expect(detectResidue(csv, live)).toEqual([]);
  });

  it('flags multiple residue rows and sorts them (drives non-zero exit)', () => {
    const csv = new Map([
      ['CustomProperty', S('A', 'B')],
      ['Property', S('A')],
    ]);
    const live = new Map([
      ['CustomProperty', S('keep')], // non-empty, but lacks A and B
      ['Property', S('A')],
    ]);
    const r = detectResidue(csv, live);
    expect(r.length).toBe(2);
    expect(r).toEqual([
      { field: 'A', resource: 'CustomProperty' },
      { field: 'B', resource: 'CustomProperty' },
    ]);
  });
});
