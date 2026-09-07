/// <reference types="jest" />
/**
 * Property.Permission is a PROVIDER FACT, never a Mallan decision (Packet 2 contradiction-closure, 2026-09-06).
 *
 * Live Cotality (verified 2026-09-06): Permission is a Multi-Enum (ListingPermission). The authorized IDX Plus
 * feed serves 'IDX' on every row; there is NO 'OwnerOptOut' member and MlsStatus has no such member either.
 * No authorized Cotality / RLS feed contract in this repository proves that any member equals a Mallan
 * business decision, so:
 *   - the ONE interpretation is `idxPermitted`: every token is the served 'IDX' → true; any other token →
 *     false (fail-closed, no member meaning asserted); no fact → null (no effect, no replacement mapping);
 *   - participant_only / owner_opt_out are Mallan / REBNY-UCBA decisions, read only from the Mallan side
 *     (`_mallanPermission`, the stored columns) and never derived from Permission;
 *   - the legacy plural `Permissions` key and the MlsStatus sentinel are not consulted anywhere.
 * Every consumer of the provider fact must agree: ingest mapper, gate columns, compliance gates, Search
 * hydration, the CRM-IDX Search mapper, media sync and the recovery manifest.
 */
import { derivePermissionGates, computeGateColumns, mapTrestleToPrisma } from '@/lib/idx/trestle-mapper';
import { isProviderPermissionPermitted, isOwnerOptOut, isParticipantOnly, evaluateDisplayGate } from '@/lib/compliance/gates';
import { isPropertyComplianceBlocked } from '@/lib/idx/media-sync';
import { liveEnumMembers } from '@/lib/cotality/live-contract';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../..');

describe('derivePermissionGates — tokenized provider fact with one interpretation', () => {
  it("'IDX' (the served permission) → permitted", () => {
    expect(derivePermissionGates({ Permission: 'IDX' })).toEqual({ permissions: 'IDX', permissionTokens: ['IDX'], idxPermitted: true });
  });
  it.each(['Private', 'Public', 'Officeidxoptout', 'AgentOnly', 'IDX,Private', 'Owner Opt-Out', 'OwnerOptOut'])(
    '%s → NOT permitted (fail-closed; no member meaning asserted)',
    (value) => {
      const g = derivePermissionGates({ Permission: value });
      expect(g.idxPermitted).toBe(false);
      expect(g.permissionTokens.length).toBeGreaterThan(0);
    },
  );
  it('handles the Multi-Enum as an array and as a comma string', () => {
    expect(derivePermissionGates({ Permission: ['IDX', 'Private'] }).idxPermitted).toBe(false);
    expect(derivePermissionGates({ Permission: ['IDX'] }).idxPermitted).toBe(true);
    expect(derivePermissionGates({ Permission: 'IDX, Private' }).permissionTokens).toEqual(['IDX', 'Private']);
  });
  it('an absent fact is null — never a decision', () => {
    for (const v of [undefined, null, '']) expect(derivePermissionGates({ Permission: v }).idxPermitted).toBeNull();
  });
  it('derives NO Mallan decision and ignores MlsStatus and the legacy plural key', () => {
    const g = derivePermissionGates({ Permission: 'IDX', MlsStatus: 'OwnerOptOut', Permissions: 'OwnerOptOut' }) as unknown as Record<string, unknown>;
    expect(g.idxPermitted).toBe(true);
    expect(g).not.toHaveProperty('participantOnly');
    expect(g).not.toHaveProperty('ownerOptOut');
  });
  it("the live member list has no 'OwnerOptOut' and 'IDX' is a member (dated pull)", () => {
    const members = liveEnumMembers('Permission');
    expect(members).not.toBeNull();
    expect(members).toContain('IDX');
    expect(members).not.toContain('OwnerOptOut');
    expect(liveEnumMembers('MlsStatus')).not.toContain('OwnerOptOut');
  });
});

describe('every consumer agrees with the one interpretation', () => {
  const base = { StandardStatus: 'Active', MlsStatus: 'Active', InternetEntireListingDisplayYN: null, InternetAddressDisplayYN: null, ModificationTimestamp: '2026-09-01T00:00:00Z' };
  it('computeGateColumns: providerIdxPermitted false blocks; null/undefined has no effect', () => {
    const open = { status: 'Active', internetEntireListing: true, internetAddressDisplay: true, participantOnly: false, ownerOptOut: false };
    expect(computeGateColumns({ ...open, providerIdxPermitted: false }).idx_display_yn).toBe(false);
    expect(computeGateColumns({ ...open, providerIdxPermitted: null }).idx_display_yn).toBe(true);
    expect(computeGateColumns({ ...open }).idx_display_yn).toBe(true);
  });
  it('mapTrestleToPrisma: a non-IDX token blocks display, the Mallan columns stay false', () => {
    const raw = { ...base, ListingId: 'RLS1', ListingKey: 'K1', ListPrice: 1, PropertyType: 'Residential', Permission: 'Private' } as Record<string, unknown>;
    const m = mapTrestleToPrisma(raw);
    expect(m.idx_display_yn).toBe(false);
    expect(m.participant_only).toBe(false);
    expect(m.owner_opt_out).toBe(false);
    expect(mapTrestleToPrisma({ ...raw, Permission: 'IDX' }).idx_display_yn).toBe(true);
    expect(mapTrestleToPrisma({ ...raw, Permission: null }).idx_display_yn).toBe(true);
  });
  it('compliance gates: Gate 0 is the provider fact; Gates 1/2 read the Mallan side only', () => {
    expect(isProviderPermissionPermitted({ Permission: 'IDX' })).toBe(true);
    expect(isProviderPermissionPermitted({ Permission: 'IDX,Private' })).toBe(false);
    expect(isProviderPermissionPermitted({})).toBe(true);
    expect(isOwnerOptOut({ Permission: 'OwnerOptOut' })).toBe(false);
    expect(isParticipantOnly({ Permission: 'Private' })).toBe(false);
    expect(isOwnerOptOut({ owner_opt_out: true })).toBe(true);
    expect(isParticipantOnly({ _mallanPermission: 'Private' })).toBe(true);
    const r = evaluateDisplayGate({ StandardStatus: 'Active', Permission: 'Private' });
    expect(r.displayable).toBe(false);
    expect(r.reason).toContain('Provider permission does not permit IDX display');
  });
  it('media sync: the same predicate', () => {
    expect(isPropertyComplianceBlocked({ ...base, Permission: 'IDX' })).toBe(false);
    expect(isPropertyComplianceBlocked({ ...base, Permission: 'IDX,Private' })).toBe(true);
    expect(isPropertyComplianceBlocked({ ...base, MlsStatus: 'OwnerOptOut' })).toBe(false);
  });
  it('Search hydration, the CRM-IDX Search mapper and the recovery manifest call derivePermissionGates (no private re-derivation)', () => {
    for (const f of ['lib/search/engine/hydrate.ts', 'lib/search/crm-idx-mapper.ts', 'scripts/build-recovery-manifest.ts', 'lib/idx/media-sync.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src).toMatch(/derivePermissionGates\(/);
      expect(src).not.toMatch(/['"]OwnerOptOut['"]|Owner Opt-Out/);
    }
  });
  it('no runtime consumer keeps the retired arms', () => {
    for (const f of ['lib/idx/trestle-mapper.ts', 'lib/compliance/gates.ts', 'lib/compliance/public-listing-filter.ts']) {
      const code = readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      expect(code).not.toMatch(/Permission\s*===\s*['"]Private['"]/);
      expect(code).not.toMatch(/MlsStatus\s*===\s*['"]OwnerOptOut['"]/);
      expect(code).not.toMatch(/['"]Owner Opt-Out['"]/);
    }
  });
});
