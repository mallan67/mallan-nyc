import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CANONICAL_FILTER_KEYS,
  CRITERION_VALUE_SHAPE,
  WORKFLOW_CRITERIA,
} from '../canonical/filter-keys.generated';
import { SEARCH_WORKFLOWS } from '../canonical/search-workflow';

const GENERATED = resolve(__dirname, '../canonical/filter-keys.generated.ts');
const LEDGER = resolve(__dirname, '../../../scripts/search/criterion-matrix.mjs');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A WORKFLOW CONTRACT ANSWERS EXACTLY ONE QUESTION: WHICH CRITERIA APPLY.
 *
 * `SaleCriteria`, `RentalCriteria`, `BuildingCriteria` and `ComparableCriteria`
 * are PROJECTIONS of `CanonicalCriteriaValues`. They must never redefine a
 * criterion's type, value shape, allowed vocabulary, Cotality mapping or
 * execution semantics — each of those already has exactly one owner, and a
 * workflow restating any of them is how per-surface divergence returns.
 *
 * The applicability fact itself lived as a hand-written column in the matrix
 * ledger, which is a MEASUREMENT tool and explicitly not an authority. It now
 * lives on the registry entry, and the ledger reads it back.
 */
describe('the four workflow contracts', () => {
  it('covers every workflow, and only the declared workflows', () => {
    expect(Object.keys(WORKFLOW_CRITERIA).sort()).toEqual([...SEARCH_WORKFLOWS].sort());
  });

  it('offers only criteria that exist in the canonical vocabulary', () => {
    // A workflow naming a key the vocabulary does not have would be a private
    // criterion — a surface-specific filter with no owner, no shape and no
    // refusal behaviour.
    const vocabulary = new Set<string>(CANONICAL_FILTER_KEYS);
    for (const [workflow, keys] of Object.entries(WORKFLOW_CRITERIA)) {
      const strangers = (keys as readonly string[]).filter((k) => !vocabulary.has(k));
      expect({ workflow, strangers }).toEqual({ workflow, strangers: [] });
    }
  });

  it('leaves no criterion belonging to zero workflows', () => {
    // Such a criterion would silently vanish from all four surfaces while still
    // existing in the vocabulary — present everywhere it can be measured, absent
    // everywhere it could be used.
    const offered = new Set(Object.values(WORKFLOW_CRITERIA).flat() as string[]);
    const orphans = CANONICAL_FILTER_KEYS.filter((k) => !offered.has(k));
    expect(orphans).toEqual([]);
  });

  it('is a PROJECTION — every contract is built with Pick, never hand-written', () => {
    // A hand-written interface could drift from the canonical values object in a
    // way `Pick` structurally cannot.
    const src = readFileSync(GENERATED, 'utf8');
    for (const workflow of SEARCH_WORKFLOWS) {
      const name = `${workflow[0].toUpperCase()}${workflow.slice(1)}Criteria`;
      expect(src).toMatch(new RegExp(`export type ${name} = Pick<\\s*CanonicalCriteriaValues`));
    }
  });

  it('does not restate a value shape or a vocabulary per workflow', () => {
    // The contracts section must contain no second shape/owner table. If a
    // workflow ever needs "its own" allowed values, that is a registry change,
    // not a workflow exception.
    const src = readFileSync(GENERATED, 'utf8');
    const contractsSection = src.slice(src.indexOf('export const WORKFLOW_CRITERIA'));
    expect(contractsSection).not.toMatch(/CriterionValueShape\s*=/);
    expect(contractsSection).not.toMatch(/allowed\s*[:=]/);
    expect(contractsSection).not.toMatch(/cotalityField/);
  });

  it('applies criteria where they make sense — sanity on the migrated data', () => {
    // Cheap, concrete anchors so a silent scramble of the migration is visible.
    expect(WORKFLOW_CRITERIA.sale).toContain('ownership');
    expect(WORKFLOW_CRITERIA.building).toContain('units_total');
    expect(WORKFLOW_CRITERIA.building).not.toContain('ownership');
    expect(WORKFLOW_CRITERIA.comparable).toContain('close_date');
    expect(WORKFLOW_CRITERIA.rental).not.toContain('max_financing_percent');
  });

  it('keeps every projected key typed by the ONE canonical shape', () => {
    // The guarantee that makes these projections rather than contracts: a key's
    // shape is identical whichever workflow offers it.
    for (const keys of Object.values(WORKFLOW_CRITERIA)) {
      for (const key of keys as readonly string[]) {
        expect(CRITERION_VALUE_SHAPE[key as keyof typeof CRITERION_VALUE_SHAPE]).toBeDefined();
      }
    }
  });
});

describe('the ledger no longer owns applicability', () => {
  it('has no hand-written workflow column left', () => {
    // 27 of them were removed. If one returns, two places would answer "which
    // workflows use this criterion" and the ledger would stop measuring the
    // registry and start competing with it.
    const ledger = readFileSync(LEDGER, 'utf8');
    expect(ledger).not.toMatch(/workflows: '[a-z,]+'/);
  });
});
