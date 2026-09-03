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
    expect(WORKFLOW_CRITERIA.comparable).toContain('close_date');
    expect(WORKFLOW_CRITERIA.rental).not.toContain('max_financing_percent');
  });

  it('matches the CONTROLS the UI actually renders, not the ledger it was copied from', () => {
    // Applicability was moved off the matrix ledger onto the registry, but its
    // VALUES were never verified — the source of truth changed while the data
    // stayed unchecked. A control census on 2026-08-29 counted the criteria
    // inside each container of search-form-and-results.html:
    //
    //   container   CommonInterest  mgmtCo  units  floors
    //   sale             3            1       1      3
    //   rental           4            1       1      3
    //   building         4            1       1      3
    //
    // Four criteria were scoped to the wrong workflows. `ownership` was
    // sale-only although rental offers Rental Building / Co-op / Condo / Condop,
    // and management company, unit count and floor count were building-only
    // although all three surfaces render them.
    //
    // Evidence: docs/search/visible-control-census-2026-08-29.md
    for (const key of ['ownership', 'management_company', 'units_total', 'stories_total']) {
      expect(WORKFLOW_CRITERIA.sale).toContain(key);
      expect(WORKFLOW_CRITERIA.rental).toContain(key);
      expect(WORKFLOW_CRITERIA.building).toContain(key);
    }
    // `comparable` is deliberately NOT asserted here: #comparablesSection was
    // outside that census's scope, and inferring its membership from a census
    // that never read it is the same unverified copy this test exists to catch.
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

describe('membership is a business role, not a URL parameter', () => {
  const registry = readFileSync(resolve(__dirname, '../canonical/field-registry.ts'), 'utf8');
  const entry = (key: string) =>
    registry.split('\n').find((l) => l.includes(`canonicalKey: '${key}'`)) ?? '';

  it('admits verified brokerage criteria that were never wired to a URL param', () => {
    // `pets` and `furnished` are verified facts CURRENT.md names for Rental
    // Search, and the CRM has dedicated rental sections for them. Under the old
    // rule — canonical because `searchParams` exists — RentalCriteria had 19
    // fields and neither of these, because no serializer had been written.
    // A URL parameter is evidence of what was once built, never of what the
    // business means.
    expect(WORKFLOW_CRITERIA.rental).toContain('pets');
    expect(WORKFLOW_CRITERIA.rental).toContain('furnished');
    expect(entry('pets')).toMatch(/criterionRole: 'broker_input'/);
    expect(entry('furnished')).toMatch(/criterionRole: 'broker_input'/);
    // Still unwired — which is a TRANSPORT fact, and no longer a reason to
    // vanish from the contract.
    expect(entry('pets')).toMatch(/searchParams: \[\]/);
  });

  it('excludes a raw transport artifact even though it HAS a wire param', () => {
    // `map_grid_filter` is a viewport predicate and an explicit legacy refusal:
    // a map must translate geographic intent into canonical geographic criteria,
    // not smuggle a grid string into Search. It had a wire param, so the old
    // rule admitted it to both SaleCriteria and RentalCriteria.
    expect(entry('map_grid_filter')).toMatch(/criterionRole: 'boundary_refusal'/);
    expect(CANONICAL_FILTER_KEYS as readonly string[]).not.toContain('map_grid_filter');
    for (const keys of Object.values(WORKFLOW_CRITERIA)) {
      expect(keys as readonly string[]).not.toContain('map_grid_filter');
    }
  });

  it('keeps the refusal live at the boundary — excluded is not forgotten', () => {
    // Dropping it from the vocabulary must not quietly stop refusing it. The
    // executor still fails loudly rather than ignoring a supplied grid.
    const executor = readFileSync(resolve(__dirname, '../crm-idx-filter.ts'), 'utf8');
    expect(executor).toMatch(/gridFilter[\s\S]{0,120}UnsupportedSearchCriterionError/);
  });

  it('excludes what the workflow fixes rather than what a broker chooses', () => {
    // Sale always searches Residential and Rental always ResidentialLease, so
    // offering `listing_universe` would let a broker contradict the workflow
    // they are already inside.
    expect(entry('listing_universe')).toMatch(/criterionRole: 'workflow_invariant'/);
    expect(CANONICAL_FILTER_KEYS as readonly string[]).not.toContain('listing_universe');
  });

  it('classifies EVERY registry entry — silence is not a classification', () => {
    const unclassified = registry
      .split('\n')
      .filter((l) => /canonicalKey: '[a-z_]+'/.test(l) && !/criterionRole:/.test(l))
      .map((l) => /canonicalKey: '([a-z_]+)'/.exec(l)?.[1]);
    expect(unclassified).toEqual([]);
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
