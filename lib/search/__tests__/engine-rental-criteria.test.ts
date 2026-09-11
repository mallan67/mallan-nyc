/**
 * Domain 6 (2026-09-08) — the Rental workflow's own criteria, executed against the provider.
 *
 * Provider facts (live, Active rentals = 939 on 2026-09-08): Furnished populated on 938 (members Furnished /
 * Partially / Negotiable / Unfurnished observed); PetsAllowed populated on 939 (unit-level Yes 620, CatsOk 98,
 * DogsOk 81, NumberLimit 20, SizeLimit 41, BreedRestrictions 18; No 267); AvailabilityDate on 939
 * (`AvailabilityDate le 2026-09-30` → 874); SecurityDeposit on 289 (`le 5000` → 186). LeaseTerm, ListingTerms,
 * LeaseAmount* and AvailableLeaseType carry 0 rows — they are NOT criteria. Every filter form below was accepted
 * live (HTTP 200 with a count).
 *
 * Before: the engine refused `furnished` (and every other rental criterion) as an unsupported parameter, so the
 * CRM rental search could not narrow by furnishing or pets at all, while the public paths applied `furnished`
 * to sale searches too.
 */
import { criteriaFromParams } from '@/lib/search/engine/criteria';
import { buildProviderQuery } from '@/lib/search/engine/provider-query';
import { PETS_FRIENDLY_MEMBERS } from '@/lib/search/canonical/live-truth';

function ok(q: string) {
  const r = criteriaFromParams(new URLSearchParams(q));
  if (!r.ok) throw new Error(JSON.stringify(r.refusal));
  return r.criteria;
}
function refused(q: string) {
  const r = criteriaFromParams(new URLSearchParams(q));
  if (r.ok) throw new Error('expected refusal');
  return r.refusal;
}

describe('furnished', () => {
  test('furnished=true (the CRM wire form) is the Furnished member and executes as Furnished eq', () => {
    const c = ok('type=rent&furnished=true');
    expect(c.furnished).toEqual(['Furnished']);
    expect(buildProviderQuery(c).filter).toContain("Furnished eq 'Furnished'");
  });
  test('explicit live members, several, case-insensitively; executed as an OR', () => {
    const c = ok('type=rent&furnished=partially,Negotiable');
    expect(c.furnished).toEqual(['Partially', 'Negotiable']);
    expect(buildProviderQuery(c).filter).toContain("(Furnished eq 'Partially' or Furnished eq 'Negotiable')");
  });
  test('a token that is not a live Furnished member is refused by name', () => {
    expect(refused('type=rent&furnished=Staged').invalid).toEqual([{ param: 'furnished', value: 'Staged', reason: 'not a live Furnished member' }]);
  });
  test('a sale search never carries a rental criterion — refused, never silently ignored', () => {
    expect(refused('type=sale&furnished=true').invalid).toEqual([{ param: 'furnished', value: 'true', reason: 'rental-only criterion' }]);
  });
});

describe('pets', () => {
  test('pets=friendly is the unit-level positive PetsAllowed members, executed as an OR of has', () => {
    const c = ok('type=rent&pets=friendly');
    expect(c.petsAllowed).toEqual([...PETS_FRIENDLY_MEMBERS]);
    const f = buildProviderQuery(c).filter;
    for (const m of PETS_FRIENDLY_MEMBERS) expect(f).toContain(`PetsAllowed has '${m}'`);
    expect(f).not.toContain("PetsAllowed has 'No'");
  });
  test('explicit live members resolve; PetsAllowed is the provider name too', () => {
    expect(ok('type=rent&pets=catsok,DogsOk').petsAllowed).toEqual(['CatsOk', 'DogsOk']);
    expect(ok('type=rent&PetsAllowed=BuildingYes').petsAllowed).toEqual(['BuildingYes']);
  });
  test('a token that is not a live PetsAllowed member is refused by name', () => {
    expect(refused('type=rent&pets=Unicorn').invalid).toEqual([{ param: 'pets', value: 'Unicorn', reason: 'not a live PetsAllowed member' }]);
  });
  test('rental-only', () => {
    expect(refused('type=sale&pets=friendly').invalid[0]).toEqual({ param: 'pets', value: 'friendly', reason: 'rental-only criterion' });
  });
});

describe('availability and deposit', () => {
  test('availableBy=YYYY-MM-DD executes as AvailabilityDate le', () => {
    const c = ok('type=rent&availableBy=2026-10-01');
    expect(c.availableBy).toBe('2026-10-01');
    expect(buildProviderQuery(c).filter).toContain('AvailabilityDate le 2026-10-01');
  });
  test('a malformed date is refused', () => {
    expect(refused('type=rent&availableBy=October').invalid).toEqual([{ param: 'availableBy', value: 'October', reason: 'must be a YYYY-MM-DD date' }]);
  });
  test('maxDeposit executes as SecurityDeposit le', () => {
    const c = ok('type=rent&maxDeposit=5000');
    expect(c.securityDepositMax).toBe(5000);
    expect(buildProviderQuery(c).filter).toContain('SecurityDeposit le 5000');
  });
  test('rental-only', () => {
    expect(refused('type=sale&availableBy=2026-10-01').invalid[0].reason).toBe('rental-only criterion');
    expect(refused('type=sale&maxDeposit=5000').invalid[0].reason).toBe('rental-only criterion');
  });
});

describe('a rental search without rental criteria is unchanged', () => {
  test('no rental clause is emitted when none was asked for', () => {
    const f = buildProviderQuery(ok('type=rent&minPrice=3000')).filter;
    expect(f).not.toMatch(/Furnished|PetsAllowed|AvailabilityDate|SecurityDeposit/);
  });
});
