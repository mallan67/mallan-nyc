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
  it("'IDX' (the served permission) → permitted, not participant-only", () => {
    expect(derivePermissionGates({ Permission: 'IDX' })).toEqual({
      permissions: 'IDX',
      permissionTokens: ['IDX'],
      idxPermitted: true,
      participantOnly: false,
    });
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
  it('derives NO owner-opt-out and ignores MlsStatus and the legacy plural key', () => {
    const g = derivePermissionGates({ Permission: 'IDX', MlsStatus: 'OwnerOptOut', Permissions: 'OwnerOptOut' }) as unknown as Record<string, unknown>;
    expect(g.idxPermitted).toBe(true);
    // participant_only IS a provider-derived decision (owner ruling 2026-09-07) — but not from
    // MlsStatus and not from the legacy plural key, and this record carries no 'Private' token.
    expect(g.participantOnly).toBe(false);
    // owner_opt_out is NEVER derived from the provider: no such published member exists.
    expect(g).not.toHaveProperty('ownerOptOut');
  });
});

/**
 * OWNER RULING 2026-09-07 — Property.Permission = 'Private' means REBNY members/participants only
 * and sets the canonical participant_only decision. It is NOT owner-opt-out.
 *
 * Each verified live ListingPermission value is asserted separately, as required.
 */
describe("derivePermissionGates — 'Private' is the canonical participant_only decision", () => {
  it("'Private' → participantOnly true", () => {
    expect(derivePermissionGates({ Permission: 'Private' }).participantOnly).toBe(true);
  });

  it("'IDX' → participantOnly false", () => {
    expect(derivePermissionGates({ Permission: 'IDX' }).participantOnly).toBe(false);
  });

  it('an ABSENT Permission → participantOnly false (no provider fact, never a decision)', () => {
    for (const v of [undefined, null, '']) {
      const g = derivePermissionGates({ Permission: v });
      expect(g.participantOnly).toBe(false);
      expect(g.idxPermitted).toBeNull();
    }
  });

  // Multi-Enum: token membership, never equality. 'IDX,Private' IS participant-only.
  it.each([
    ['IDX,Private', true],
    ['IDX, Private', true],
    ['Private,IDX', true],
  ])('multi-value %s → participantOnly %s', (value, expected) => {
    expect(derivePermissionGates({ Permission: value }).participantOnly).toBe(expected);
  });

  it('array form is handled identically to the comma form', () => {
    expect(derivePermissionGates({ Permission: ['IDX', 'Private'] }).participantOnly).toBe(true);
    expect(derivePermissionGates({ Permission: ['IDX'] }).participantOnly).toBe(false);
  });

  // Every OTHER verified live member asserted separately: none is participant-only.
  it.each([
    'Public', 'VOW', 'AgentOnly', 'FirmOnly', 'OfficeOnly', 'SyndicateOptOut',
    'ComingSoon', 'CompSold', 'History', 'PhotoOptedOut', 'Officeidxoptout',
    'OfficeInactive', 'OfficeSuspended', 'MemberInactive',
    'DownPaymentResourceYes', 'DownPaymentResourceNo',
  ])("live member '%s' → participantOnly false (only 'Private' carries that meaning)", (member) => {
    expect(derivePermissionGates({ Permission: member }).participantOnly).toBe(false);
  });

  it("every asserted member above is a real published ListingPermission member", () => {
    const members = liveEnumMembers('Permission');
    expect(members).not.toBeNull();
    for (const m of ['IDX', 'Private', 'Public', 'VOW', 'AgentOnly', 'FirmOnly', 'OfficeOnly',
      'SyndicateOptOut', 'ComingSoon', 'CompSold', 'History', 'PhotoOptedOut', 'Officeidxoptout',
      'OfficeInactive', 'OfficeSuspended', 'MemberInactive', 'DownPaymentResourceYes',
      'DownPaymentResourceNo']) {
      expect(members).toContain(m);
    }
  });

  it('participant_only is NOT owner_opt_out — the two are never conflated', () => {
    const g = derivePermissionGates({ Permission: 'Private' });
    expect(g.participantOnly).toBe(true);
    expect(g).not.toHaveProperty('ownerOptOut');
    // and no live member expresses owner opt-out at all
    expect(liveEnumMembers('Permission')).not.toContain('OwnerOptOut');
  });

  it('mapTrestleToPrisma PERSISTS the participant_only decision (was hardcoded false)', () => {
    const base = { ListingKey: 'K1', ListingId: 'RLS1', StandardStatus: 'Active', MlsStatus: 'Active', PropertyType: 'Residential', ListPrice: 1, ModificationTimestamp: '2026-09-01T00:00:00Z' };
    expect(mapTrestleToPrisma({ ...base, Permission: 'Private' } as never).participant_only).toBe(true);
    expect(mapTrestleToPrisma({ ...base, Permission: 'IDX,Private' } as never).participant_only).toBe(true);
    expect(mapTrestleToPrisma({ ...base, Permission: 'IDX' } as never).participant_only).toBe(false);
    expect(mapTrestleToPrisma({ ...base } as never).participant_only).toBe(false);
  });

  it('a participant-only provider row is NOT publicly displayable', () => {
    const base = { ListingKey: 'K2', ListingId: 'RLS2', StandardStatus: 'Active', MlsStatus: 'Active', PropertyType: 'Residential', ListPrice: 1, ModificationTimestamp: '2026-09-01T00:00:00Z' };
    expect(mapTrestleToPrisma({ ...base, Permission: 'Private' } as never).idx_display_yn).toBe(false);
    expect(mapTrestleToPrisma({ ...base, Permission: 'IDX' } as never).idx_display_yn).toBe(true);
  });

  it('owner_opt_out stays false on provider rows — no provider fact can express it', () => {
    const base = { ListingKey: 'K3', ListingId: 'RLS3', StandardStatus: 'Active', MlsStatus: 'Active', PropertyType: 'Residential', ListPrice: 1, ModificationTimestamp: '2026-09-01T00:00:00Z' };
    for (const p of ['Private', 'IDX', 'Public', undefined]) {
      expect(mapTrestleToPrisma({ ...base, Permission: p } as never).owner_opt_out).toBe(false);
    }
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
  it("mapTrestleToPrisma: 'Private' blocks display AND sets participant_only; owner_opt_out stays false", () => {
    // UPDATED under the owner ruling 2026-09-07. This case previously asserted
    // `participant_only === false` for a 'Private' provider row — that was the position
    // derivePermissionGates took before 'Private' had a defined compliance interpretation.
    const raw = { ...base, ListingId: 'RLS1', ListingKey: 'K1', ListPrice: 1, PropertyType: 'Residential', Permission: 'Private' } as Record<string, unknown>;
    const m = mapTrestleToPrisma(raw);
    expect(m.idx_display_yn).toBe(false);
    expect(m.participant_only).toBe(true);   // REBNY members/participants only
    expect(m.owner_opt_out).toBe(false);     // never conflated — no provider fact expresses it
    expect(mapTrestleToPrisma({ ...raw, Permission: 'IDX' }).idx_display_yn).toBe(true);
    expect(mapTrestleToPrisma({ ...raw, Permission: 'IDX' }).participant_only).toBe(false);
    expect(mapTrestleToPrisma({ ...raw, Permission: null }).idx_display_yn).toBe(true);
    expect(mapTrestleToPrisma({ ...raw, Permission: null }).participant_only).toBe(false);
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
