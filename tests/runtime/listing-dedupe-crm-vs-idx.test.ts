/// <reference types="jest" />
/**
 * Public-surface dedupe — prefer Mallan CRM exclusive over Trestle/IDX
 * duplicate when both rows represent the same physical unit.
 *
 * Background: see docs/crm/listing-canonical-mallan-exclusive-audit-2026-05-28.md
 *
 * Verified production state (the bug this fixes):
 *   curl https://mallan.nyc/api/listings?address=333+E+46th
 *   → 6 rows returned, including BOTH SL-0004 (CRM exclusive) and
 *     RLS20093870 (Trestle-synced duplicate) for the SAME physical unit (2G).
 *
 * After this helper is wired into the 5 public surfaces, the CRM row
 * (SL-0004) is the only one returned; the IDX duplicate stays in the DB
 * for audit history.
 */
import {
  preferCrmExclusiveOverIdxDuplicate,
  type DedupeCandidate,
} from '@/lib/listings/dedupe-crm-vs-idx';

// ── Test fixtures (modeled on the actual production data) ──

// SL-0004 — Maya's CRM exclusive for 333 E 46th St #2G
const SL_0004: DedupeCandidate = {
  id: 'SL-0004',
  address: {
    streetNumber: '333',
    streetName: 'E 46th Street', // DTO combined-form (includes direction + suffix)
    unitNumber: '2G',
    postalCode: '10017',
  },
  modificationTimestamp: '2026-05-28T10:00:00.000Z',
};

// RLS20093870 — the same physical unit, synced back from REBNY RLS via
// Trestle after Maya submitted SL-0004. Same address, different listing_id.
const RLS_20093870: DedupeCandidate = {
  id: 'RLS20093870',
  address: {
    streetNumber: '333',
    streetName: 'E 46th Street',
    unitNumber: '2G',
    postalCode: '10017',
  },
  modificationTimestamp: '2026-05-28T11:30:00.000Z', // synced AFTER CRM row
};

// Different units in the same building — must NOT dedupe.
const RLS_20087929: DedupeCandidate = {
  id: 'RLS20087929',
  address: {
    streetNumber: '333',
    streetName: 'E 46th Street',
    unitNumber: '20B', // different unit
    postalCode: '10017',
  },
};

const RLS_20036865: DedupeCandidate = {
  id: 'RLS20036865',
  address: {
    streetNumber: '333',
    streetName: 'E 46th Street',
    unitNumber: '1D',
    postalCode: '10017',
  },
};

describe('preferCrmExclusiveOverIdxDuplicate — core dedupe behavior', () => {
  // ── Test 1: the production bug — SL-0004 + RLS20093870 collapse to SL-0004 ──
  it('collapses CRM SL-0004 + IDX RLS20093870 (same unit) to SL-0004 only', () => {
    const result = preferCrmExclusiveOverIdxDuplicate([SL_0004, RLS_20093870]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SL-0004');
  });

  it('order-independent: works when IDX row appears first in input', () => {
    const result = preferCrmExclusiveOverIdxDuplicate([RLS_20093870, SL_0004]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SL-0004');
  });

  // ── Test 2 (proxy for agent listings page) ──
  it('agent-listings shape: returns only the CRM row when both exist for the same unit', () => {
    // Simulating what /api/agents/[slug]/listings would receive after the
    // .map(dbListingToPublicDTO) call (mixed CRM + IDX rows).
    const result = preferCrmExclusiveOverIdxDuplicate([
      RLS_20093870,
      RLS_20087929, // different unit (20B) — kept
      SL_0004,
    ]);
    expect(result.map((r) => r.id).sort()).toEqual(['RLS20087929', 'SL-0004']);
  });

  // ── Test 3 (exclusive feed regression guard) ──
  it('exclusive-only input (single CRM row) is unchanged', () => {
    const result = preferCrmExclusiveOverIdxDuplicate([SL_0004]);
    expect(result).toEqual([SL_0004]);
  });

  // ── Test 5: same building, different units, must NOT dedupe ──
  it('does NOT dedupe different units in the same building', () => {
    const result = preferCrmExclusiveOverIdxDuplicate([
      SL_0004, // unit 2G
      { ...SL_0004, id: 'SL-0005', address: { ...SL_0004.address, unitNumber: '3A' } } as DedupeCandidate,
      RLS_20087929, // unit 20B
      RLS_20036865, // unit 1D
    ]);
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.id).sort()).toEqual(['RLS20036865', 'RLS20087929', 'SL-0004', 'SL-0005']);
  });

  // ── Test 6: same street number/name but different StreetDirPrefix, must NOT dedupe ──
  it('does NOT dedupe "333 E 46th" vs "333 W 46th" (different direction)', () => {
    // DB-row shape (separate components) — direction is the only difference.
    const east: DedupeCandidate = {
      id: 'SL-9001',
      address: {
        streetNumber: '333',
        streetDirPrefix: 'E',
        streetName: '46th',
        streetSuffix: 'Street',
        unitNumber: '2G',
        postalCode: '10017',
      },
    };
    const west: DedupeCandidate = {
      id: 'RLS99999',
      address: {
        streetNumber: '333',
        streetDirPrefix: 'W',
        streetName: '46th',
        streetSuffix: 'Street',
        unitNumber: '2G',
        postalCode: '10017',
      },
    };
    const result = preferCrmExclusiveOverIdxDuplicate([east, west]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['RLS99999', 'SL-9001']);
  });
});

describe('preferCrmExclusiveOverIdxDuplicate — address suppression / missing data', () => {
  // ── Test 7: rows without UnitNumber are never deduped ──
  it('rows with no UnitNumber are passed through unchanged (no false-positive dedupe)', () => {
    // A suppressed CRM row could have empty/null address atoms. Even if a
    // visible IDX row exists at the same physical building, the suppressed
    // row's address is blanked — the helper must not silently match it.
    const suppressed: DedupeCandidate = {
      id: 'SL-9999',
      address: {
        streetNumber: '', // suppressed
        streetName: 'Address Undisclosed', // sentinel from DTO
        unitNumber: null, // suppressed
        postalCode: '10017',
      },
    };
    const visible: DedupeCandidate = {
      id: 'RLS9999',
      address: {
        streetNumber: '333',
        streetName: 'E 46th Street',
        unitNumber: '2G',
        postalCode: '10017',
      },
    };
    const result = preferCrmExclusiveOverIdxDuplicate([suppressed, visible]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['RLS9999', 'SL-9999']);
  });

  it('rows with no address object at all pass through', () => {
    const noAddress: DedupeCandidate = { id: 'SL-NO-ADDR', address: null };
    const result = preferCrmExclusiveOverIdxDuplicate([noAddress, SL_0004]);
    expect(result).toHaveLength(2);
  });
});

describe('preferCrmExclusiveOverIdxDuplicate — pure-IDX groups (helper is no-op)', () => {
  // ── Test 8: pure-IDX group → all kept ──
  it('group with NO CRM row is unchanged (real third-party listings)', () => {
    const result = preferCrmExclusiveOverIdxDuplicate([RLS_20087929, RLS_20036865]);
    expect(result).toHaveLength(2);
  });

  it('two IDX rows that happen to share the SAME unit do NOT collapse (no CRM to prefer)', () => {
    // Defensive case: two IDX rows accidentally synced for the same unit
    // would still both appear, because the helper does not collapse IDX
    // duplicates — only IDX-vs-CRM. (A pure-IDX duplicate is a separate
    // data-quality issue handled at sync time, not in this helper.)
    const idxA: DedupeCandidate = {
      id: 'RLS11111',
      address: { ...RLS_20093870.address },
    };
    const idxB: DedupeCandidate = {
      id: 'RLS22222',
      address: { ...RLS_20093870.address },
    };
    const result = preferCrmExclusiveOverIdxDuplicate([idxA, idxB]);
    expect(result).toHaveLength(2);
  });
});

describe('preferCrmExclusiveOverIdxDuplicate — multiple CRM rows tiebreaker', () => {
  it('keeps the newest CRM row by modificationTimestamp when multiple SL-/RL- rows match the same unit', () => {
    const older: DedupeCandidate = {
      id: 'SL-0100',
      address: { ...SL_0004.address },
      modificationTimestamp: '2026-05-01T00:00:00.000Z',
    };
    const newer: DedupeCandidate = {
      id: 'SL-0200',
      address: { ...SL_0004.address },
      modificationTimestamp: '2026-05-28T00:00:00.000Z',
    };

    // Capture console.warn output to verify the multi-CRM warning fires.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = preferCrmExclusiveOverIdxDuplicate([older, newer]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SL-0200');
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('SL-0100');
    expect(warnSpy.mock.calls[0][0]).toContain('SL-0200');
    warnSpy.mockRestore();
  });

  it('falls back to updatedAt when modificationTimestamp is missing', () => {
    const older: DedupeCandidate = {
      id: 'SL-0300',
      address: { ...SL_0004.address },
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    const newer: DedupeCandidate = {
      id: 'SL-0400',
      address: { ...SL_0004.address },
      updatedAt: '2026-05-28T00:00:00.000Z',
    };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = preferCrmExclusiveOverIdxDuplicate([older, newer]);
    expect(result[0].id).toBe('SL-0400');
    warnSpy.mockRestore();
  });
});

describe('preferCrmExclusiveOverIdxDuplicate — shape compatibility', () => {
  // Both DTO shape (combined streetName) and DB-row shape (separate
  // streetDirPrefix/streetName/streetSuffix) must produce the same key
  // for the same physical address.
  it('DTO-shape (combined streetName) and DB-row-shape (separate components) match each other', () => {
    const dtoShape: DedupeCandidate = {
      id: 'SL-7777',
      address: {
        streetNumber: '333',
        streetName: 'E 46th Street', // combined form (DTO output)
        unitNumber: '2G',
        postalCode: '10017',
      },
    };
    const dbShape: DedupeCandidate = {
      id: 'RLS7777',
      address: {
        streetNumber: '333',
        streetDirPrefix: 'E',
        streetName: '46th',
        streetSuffix: 'Street',
        unitNumber: '2G',
        postalCode: '10017',
      },
    };
    const result = preferCrmExclusiveOverIdxDuplicate([dtoShape, dbShape]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SL-7777');
  });

  it('case differences and whitespace do not prevent matching', () => {
    const a: DedupeCandidate = {
      id: 'SL-8888',
      address: {
        streetNumber: ' 333 ',
        streetName: '  E 46TH STREET  ',
        unitNumber: '2g',
        postalCode: '10017',
      },
    };
    const b: DedupeCandidate = {
      id: 'RLS8888',
      address: {
        streetNumber: '333',
        streetName: 'e 46th street',
        unitNumber: '2G',
        postalCode: '10017',
      },
    };
    const result = preferCrmExclusiveOverIdxDuplicate([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SL-8888');
  });
});

describe('preferCrmExclusiveOverIdxDuplicate — input edge cases', () => {
  it('returns empty array unchanged', () => {
    expect(preferCrmExclusiveOverIdxDuplicate([])).toEqual([]);
  });

  it('returns single-row input unchanged (no comparison needed)', () => {
    expect(preferCrmExclusiveOverIdxDuplicate([SL_0004])).toEqual([SL_0004]);
  });

  it('does not mutate the input array', () => {
    const input = [SL_0004, RLS_20093870];
    const snapshot = [...input];
    preferCrmExclusiveOverIdxDuplicate(input);
    expect(input).toEqual(snapshot);
  });
});
