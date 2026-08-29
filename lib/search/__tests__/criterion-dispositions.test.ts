import {
  FIELD_REGISTRY,
  executionReadiness,
  type FieldSpec,
} from '../canonical/field-registry';
import { CANONICAL_FILTER_KEYS, WORKFLOW_CRITERIA } from '../canonical/filter-keys.generated';

const spec = (key: string): FieldSpec =>
  FIELD_REGISTRY.find((f) => f.canonicalKey === key)!;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OFFERED IS NOT THE SAME AS EXECUTABLE.
 *
 * These five are real brokerage criteria and stay in the contract. None of them
 * may RUN yet. Keeping the two axes separate is the whole point of the role
 * model: a criterion vanishing from the product because its mapping is unproven
 * is how `pets` and `furnished` disappeared, and a criterion executing on an
 * unproven mapping is how a broker gets a confident wrong answer.
 */
describe('blocked broker inputs — offered, not executable', () => {
  const BLOCKED = [
    'parking',
    'open_house',
    'days_on_market',
    'maintenance_common_charge',
    'price_per_sqft',
  ];

  it.each(BLOCKED)('%s is still offered as a broker input', (key) => {
    expect(spec(key).criterionRole).toBe('broker_input');
    expect(CANONICAL_FILTER_KEYS as readonly string[]).toContain(key);
  });

  it.each(BLOCKED)('%s fails LOUD rather than silently widening', (key) => {
    // A dropped criterion broadens the result set on a page that looks correct.
    // These must refuse by name instead.
    expect(spec(key).failureBehavior).toBe('fail_loud');
  });

  it.each(BLOCKED)('%s is NOT verified executable', (key) => {
    const readiness = executionReadiness(spec(key), {
      reachesServer: true,
      strategyImplemented: true,
    });
    expect(readiness).not.toBe('verified_executable');
  });

  it('parking is blocked on an equivalence its own entry disproves', () => {
    // Parking/Garage equivalence is unproven, and the entry says so. Field
    // existence and equivalence correctness are different proofs.
    expect(spec('parking').semanticEquivalenceProven).toBe(false);
  });

  it('open_house is blocked because it currently executes AFTER pagination', () => {
    // The provider slices the population first and the open-house test runs over
    // the rows already returned, so the answer comes from an arbitrary page
    // rather than the complete universe. That is a WRONG answer, not a missing
    // one — which is why it may not ship while the control stays offered.
    expect(spec('open_house').notes ?? '').toMatch(/AFTER pagination/i);
  });

  it('maintenance_common_charge is blocked on an unreconciled fee model', () => {
    // AssociationFee alone is not canonical monthly Maintenance/CC. Filtering on
    // it raw would compare co-op maintenance against condo common charges as
    // though they were one fact.
    expect(spec('maintenance_common_charge').notes ?? '').toMatch(/Fee2\/Fee3/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RETIRED AND RECLASSIFIED — for two DIFFERENT reasons.
 */
describe('commercial is retired from the residential workflows', () => {
  it('is a boundary refusal, not a report field', () => {
    // Sale and Rental are DEFINED residential universes — Residential and
    // ResidentialLease — carried as workflow invariants. A `commercial: true`
    // boolean inside one of them would mutate the very universe the workflow
    // fixes, which is the contradiction `listing_universe` was made an invariant
    // to prevent.
    expect(spec('commercial').criterionRole).toBe('boundary_refusal');
  });

  it('is offered by NO workflow', () => {
    expect(CANONICAL_FILTER_KEYS as readonly string[]).not.toContain('commercial');
    for (const keys of Object.values(WORKFLOW_CRITERIA)) {
      expect(keys as readonly string[]).not.toContain('commercial');
    }
  });

  it('keeps its entry so a legacy parameter is refused BY NAME', () => {
    // Deleting the entry would make a legacy `commercial` input unrecognised and
    // therefore silently ignored — which widens a residential search instead of
    // refusing it.
    expect(spec('commercial')).toBeDefined();
    expect(spec('commercial').notes ?? '').toMatch(/RETIRED from residential/);
  });
});

describe('total_monthly_cost is a report output, not a criterion', () => {
  it('is a non-search fact', () => {
    // No computed fact and no established formula: what "total monthly"
    // includes — maintenance, taxes, assessment — depends on CommonInterest.
    // A filter over an undefined sum lets a broker narrow on a number Mallan
    // cannot define.
    expect(spec('total_monthly_cost').criterionRole).toBe('non_search_fact');
    expect(CANONICAL_FILTER_KEYS as readonly string[]).not.toContain('total_monthly_cost');
  });

  it('carries no Search-only declarations', () => {
    // A non-search fact with a value shape and a workflow list reads as though
    // it were merely unwired, which is exactly the confusion the role removes.
    expect(spec('total_monthly_cost').criterionValueShape).toBeUndefined();
    expect(spec('total_monthly_cost').workflows).toBeUndefined();
  });
});
