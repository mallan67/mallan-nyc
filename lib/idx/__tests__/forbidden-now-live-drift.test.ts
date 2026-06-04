import {
  detectForbiddenNowLive,
  FORBIDDEN_FIELDS,
  FORBIDDEN_LIVE_ALLOWLIST,
} from '../../../scripts/trestle-forbidden-fields';

/**
 * Live-drift guard for the server phantom list.
 *
 * `detectForbiddenNowLive` is what makes the daily live audit
 * (.github/workflows/trestle-live-audit.yml → trestle:audit-server) fail the
 * moment Cotality turns one of the forbidden phantoms into a real live $metadata
 * field — the case the snapshot parity test cannot see (it reads the cached
 * artifacts/metadata.xml). It is pure, so we drive it with simulated "live"
 * schema-field sets here.
 *
 * The documented live-but-intentional allowlist (ResourceRecordID) must NEVER
 * trip the guard, otherwise the production audit — which DOES see ResourceRecordID
 * on live — would fail on every run.
 */
describe('detectForbiddenNowLive — vendor live-drift guard', () => {
  it('returns [] when no forbidden phantom is in the live schema (clean feed)', () => {
    const live = new Set<string>([
      'ListPrice',
      'InternetEntireListingDisplayYN',
      'StandardStatus',
    ]);
    expect(detectForbiddenNowLive(live)).toEqual([]);
  });

  it('FLAGS a forbidden phantom that has turned up in the live schema (drift)', () => {
    const live = new Set<string>(['ListPrice', 'VideoURL']); // VideoURL is forbidden
    expect(detectForbiddenNowLive(live)).toContain('VideoURL');
    expect(detectForbiddenNowLive(live).length).toBe(1);
  });

  it('does NOT flag the documented live-but-intentional allowlist (ResourceRecordID)', () => {
    const live = new Set<string>(['ResourceRecordID']);
    expect(detectForbiddenNowLive(live)).toEqual([]);
  });

  it('flags multiple drifted fields while excluding allowlisted ones', () => {
    const live = new Set<string>(['MoveInCostsAmountTotal', 'FloorPlanURL', 'ResourceRecordID']);
    expect(detectForbiddenNowLive(live).sort()).toEqual(
      ['FloorPlanURL', 'MoveInCostsAmountTotal'].sort()
    );
  });

  it('production guard list includes the allowlisted field so the live audit stays green', () => {
    // ResourceRecordID is genuinely on live; it must be both forbidden AND
    // allowlisted, or the daily audit would fail spuriously.
    expect(Object.keys(FORBIDDEN_FIELDS)).toContain('ResourceRecordID');
    expect(FORBIDDEN_LIVE_ALLOWLIST.has('ResourceRecordID')).toBe(true);
  });

  it('the now-live MoveInCosts fields are NOT in the guard list (so they never drift-flag)', () => {
    // Post-#342: removed from FORBIDDEN_FIELDS, so even though they are live they
    // are not forbidden and cannot trip the drift guard.
    expect(Object.keys(FORBIDDEN_FIELDS)).not.toContain('MoveInCostsAmount');
    expect(Object.keys(FORBIDDEN_FIELDS)).not.toContain('MoveInCostsComments');
  });
});
