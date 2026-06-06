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
  dedupeRawDbRows,
  sameAddressKey,
  buildAddressKeyFromDbRow,
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

describe('preferCrmExclusiveOverIdxDuplicate — pure-IDX groups (PR-B winner-rule collapse)', () => {
  it('different units are both kept (RLS_20087929=20B vs RLS_20036865=1D)', () => {
    const result = preferCrmExclusiveOverIdxDuplicate([RLS_20087929, RLS_20036865]);
    expect(result).toHaveLength(2);
  });

  it('PR-B: two third-party IDX rows at the SAME unit collapse to ONE canonical card', () => {
    const idxA: DedupeCandidate = { id: 'RLS11111', address: { ...RLS_20093870.address } };
    const idxB: DedupeCandidate = { id: 'RLS22222', address: { ...RLS_20093870.address } };
    const result = preferCrmExclusiveOverIdxDuplicate([idxA, idxB]);
    expect(result).toHaveLength(1);
    // No media/tour/timestamp → tie resolves to the stable id (ascending).
    expect(result[0].id).toBe('RLS11111');
  });
});

describe('preferCrmExclusiveOverIdxDuplicate — pure-IDX winner rule (PR-B)', () => {
  const photo = (n: number) => ({ url: `https://cdn.example.com/${n}.jpg`, mediaType: 'Photo', order: n });
  const at = (id: string, over: Partial<DedupeCandidate> = {}): DedupeCandidate => ({
    id,
    address: { ...RLS_20093870.address },
    ...over,
  });

  it('1. usable photos beat no-photo', () => {
    const r = preferCrmExclusiveOverIdxDuplicate([at('RLS-A', { media: [] }), at('RLS-B', { media: [photo(1)] })]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('RLS-B');
  });

  it('2. more valid Photo media wins', () => {
    const r = preferCrmExclusiveOverIdxDuplicate([
      at('RLS-A', { media: [photo(1)] }),
      at('RLS-B', { media: [photo(1), photo(2), photo(3)] }),
    ]);
    expect(r[0].id).toBe('RLS-B');
  });

  it('non-photo media (FloorPlan) does NOT count as a usable photo', () => {
    const r = preferCrmExclusiveOverIdxDuplicate([
      at('RLS-A', { media: [{ url: 'https://cdn.example.com/fp.jpg', mediaType: 'FloorPlan', order: 0 }] }),
      at('RLS-B', { media: [photo(1)] }),
    ]);
    expect(r[0].id).toBe('RLS-B');
  });

  it('3. virtualTourURL breaks an equal-photo tie', () => {
    const r = preferCrmExclusiveOverIdxDuplicate([
      at('RLS-A', { media: [photo(1)] }),
      at('RLS-B', { media: [photo(1)], virtualTourURL: 'https://my.matterport.com/show/?m=abc' }),
    ]);
    expect(r[0].id).toBe('RLS-B');
  });

  it('4. freshest modificationTimestamp breaks a tie', () => {
    const r = preferCrmExclusiveOverIdxDuplicate([
      at('RLS-A', { media: [photo(1)], modificationTimestamp: '2026-01-01T00:00:00Z' }),
      at('RLS-B', { media: [photo(1)], modificationTimestamp: '2026-06-01T00:00:00Z' }),
    ]);
    expect(r[0].id).toBe('RLS-B');
  });

  it('5. stable tie-break by id, order-independent', () => {
    const a = at('RLS-zzz', { media: [photo(1)] });
    const b = at('RLS-aaa', { media: [photo(1)] });
    expect(preferCrmExclusiveOverIdxDuplicate([a, b])[0].id).toBe('RLS-aaa');
    expect(preferCrmExclusiveOverIdxDuplicate([b, a])[0].id).toBe('RLS-aaa');
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

// ── Codex review follow-up (PR #269) ───────────────────────────────────
// The /api/listings/similar route's Prisma `listing_id: { not: excludeId }`
// filter only removes the exact-id row. When the excluded listing is one
// half of a CRM/IDX duplicate pair, the other half passes through unfiltered
// — so a user viewing SL-0004's detail page would see RLS20093870 (the
// same physical unit) recommended as a "similar" listing. Mitigation:
// fetch the excluded listing's address, run regular dedupe, then drop any
// row whose normalized address key matches the excluded listing's key.
//
// These tests exercise the route's filter logic directly (no Prisma mock)
// to verify the address-key pattern correctly handles both directions
// (excluded=CRM and excluded=IDX) plus the per-unit / per-direction
// regression guards.

describe('similar route — exclude-id-aware dedupe pattern (Codex PR #269 follow-up)', () => {
  // Raw DB-row shape (PascalCase address JSON) — matches what
  // prisma.listing.findUnique returns, which is what the similar route
  // actually uses.
  const SL_0004_RAW = {
    listing_id: 'SL-0004',
    address: {
      StreetNumber: '333',
      StreetDirPrefix: 'E',
      StreetName: '46th',
      StreetSuffix: 'Street',
      UnitNumber: '2G',
      PostalCode: '10017',
    },
  };
  const RLS_20093870_RAW = {
    listing_id: 'RLS20093870',
    address: {
      StreetNumber: '333',
      StreetDirPrefix: 'E',
      StreetName: '46th',
      StreetSuffix: 'Street',
      UnitNumber: '2G',
      PostalCode: '10017',
    },
  };
  const RLS_20087929_RAW = {
    listing_id: 'RLS20087929',
    address: {
      StreetNumber: '333',
      StreetDirPrefix: 'E',
      StreetName: '46th',
      StreetSuffix: 'Street',
      UnitNumber: '20B', // different unit
      PostalCode: '10017',
    },
  };
  const WEST_46TH_2G = {
    listing_id: 'SL-9999',
    address: {
      StreetNumber: '333',
      StreetDirPrefix: 'W', // different direction
      StreetName: '46th',
      StreetSuffix: 'Street',
      UnitNumber: '2G',
      PostalCode: '10017',
    },
  };

  function simulateSimilarRouteFilter(
    excluded: { listing_id: string; address: unknown } | null,
    dbResultsRaw: Array<{ listing_id: string; address: unknown }>,
  ) {
    // Reproduces app/api/listings/similar/route.ts logic.
    return dedupeRawDbRows(dbResultsRaw).filter(
      (r) => !sameAddressKey(r, excluded),
    );
  }

  it('Codex-1: excluded=CRM SL-0004 → IDX duplicate (RLS20093870) is also filtered', () => {
    // Prisma already filtered SL-0004 out (excludeId match); RLS20093870
    // remains. Before the fix, helper would no-op on the pure-IDX group
    // and surface RLS20093870 as similar. The address-key filter against
    // the excluded listing closes that gap.
    const dbResultsRaw = [RLS_20093870_RAW, RLS_20087929_RAW];
    const result = simulateSimilarRouteFilter(SL_0004_RAW, dbResultsRaw);
    expect(result.map((r) => r.listing_id)).toEqual(['RLS20087929']);
  });

  it('Codex-2: excluded=IDX RLS20093870 → CRM partner (SL-0004) is also filtered', () => {
    // Defense-in-depth: if a user navigates to the IDX row directly, the
    // CRM partner would otherwise surface as similar (same physical unit).
    // The address-key filter drops it.
    const dbResultsRaw = [SL_0004_RAW, RLS_20087929_RAW];
    const result = simulateSimilarRouteFilter(RLS_20093870_RAW, dbResultsRaw);
    expect(result.map((r) => r.listing_id)).toEqual(['RLS20087929']);
  });

  it('Codex-3: same building, different unit is NOT filtered', () => {
    // 20B in 333 E 46th must remain as a similar listing for 2G — different
    // physical unit, real "similar" recommendation.
    const dbResultsRaw = [RLS_20087929_RAW];
    const result = simulateSimilarRouteFilter(SL_0004_RAW, dbResultsRaw);
    expect(result.map((r) => r.listing_id)).toEqual(['RLS20087929']);
  });

  it('Codex-4: same address with different StreetDirPrefix is NOT filtered', () => {
    // 333 W 46th #2G (hypothetical) is a different physical building than
    // 333 E 46th #2G even though all other fields are identical.
    const dbResultsRaw = [WEST_46TH_2G];
    const result = simulateSimilarRouteFilter(SL_0004_RAW, dbResultsRaw);
    expect(result.map((r) => r.listing_id)).toEqual(['SL-9999']);
  });

  it('helper sanity: sameAddressKey returns true for SL/RLS pair', () => {
    expect(sameAddressKey(SL_0004_RAW, RLS_20093870_RAW)).toBe(true);
  });

  it('helper sanity: sameAddressKey returns false for different units', () => {
    expect(sameAddressKey(SL_0004_RAW, RLS_20087929_RAW)).toBe(false);
  });

  it('helper sanity: sameAddressKey returns false for different StreetDirPrefix', () => {
    expect(sameAddressKey(SL_0004_RAW, WEST_46TH_2G)).toBe(false);
  });

  it('helper sanity: sameAddressKey returns false when either side is null/undefined', () => {
    expect(sameAddressKey(SL_0004_RAW, null)).toBe(false);
    expect(sameAddressKey(null, SL_0004_RAW)).toBe(false);
    expect(sameAddressKey(null, null)).toBe(false);
  });

  it('helper sanity: buildAddressKeyFromDbRow returns null when UnitNumber missing', () => {
    const noUnit = {
      address: { ...SL_0004_RAW.address, UnitNumber: '' },
    };
    expect(buildAddressKeyFromDbRow(noUnit)).toBeNull();
  });

  it('similar-route safety: when excluded listing has no UnitNumber, no rows are filtered by address', () => {
    // Defensive: if the excluded listing's UnitNumber is empty (suppressed
    // address, malformed data), the address key is null and sameAddressKey
    // returns false against every row — the address-key filter becomes a
    // no-op and we fall back to the regular Prisma exclude-by-id behavior.
    const excluded = {
      listing_id: 'SL-NO-UNIT',
      address: { ...SL_0004_RAW.address, UnitNumber: '' },
    };
    const dbResultsRaw = [RLS_20093870_RAW, RLS_20087929_RAW];
    const result = simulateSimilarRouteFilter(excluded, dbResultsRaw);
    expect(result.map((r) => r.listing_id).sort()).toEqual(['RLS20087929', 'RLS20093870']);
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
