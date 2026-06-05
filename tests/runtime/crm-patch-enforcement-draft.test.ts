/// <reference types="jest" />
/**
 * P0 fix (2026-05-27) — PATCH enforcement must skip for Draft and web-only.
 *
 * Root cause: PATCH /api/crm/listings/[id] ran assertRlsCompliantPayload
 * unconditionally on every update. The 48-field mandatory check blocked
 * Draft saves and InHouseWebOnly listings that don't need RLS fields.
 * POST handler correctly wraps enforcement in `if (rlsEligible)`.
 *
 * Fix: PATCH skips enforcement when effectiveRlsEligible is false OR when the
 * status is draft-like — `isDraftLike` ≡ "Draft", the CRM draft marker
 * "Incomplete", or empty/missing. It enforces (fail-closed) for EVERY other
 * status, including the publicly displayable Active / ComingSoon /
 * ActiveUnderContract plus Pending and terminal. The gate deliberately does NOT
 * reuse the FARE-specific isDisplayReadyStatus() (Active/ComingSoon-only), which
 * would fail-OPEN on ActiveUnderContract (Codex P1 on #358). The Incomplete-
 * draft side is the Codex #348/#350 class. Behavioral proof:
 * tests/runtime/crm-patch-incomplete-draft-rls-gate.test.ts.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/crm/listings/[id]/route.ts'
);
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

describe('PATCH enforcement Draft/WebOnly bypass (P0 fix)', () => {
  test('enforcement gate is wrapped in rlsEligible AND !isDraftLike AND !isCrmCreated guard', () => {
    // Fail-closed: the gate enforces for EVERY non-draft status (Active,
    // ComingSoon, ActiveUnderContract, Pending, terminal) and skips ONLY
    // draft-like states (Draft / Incomplete / empty). It must NOT reuse the
    // FARE-specific isDisplayReadyStatus() (Active/ComingSoon-only) — that would
    // fail-OPEN on the publicly displayable ActiveUnderContract (Codex P1 #358).
    // The Incomplete-draft side is the Codex #348/#350 class. Behavioral proof:
    // crm-patch-incomplete-draft-rls-gate.test.ts.
    expect(routeSource).toMatch(
      /if\s*\(\s*effectiveRlsEligible\s*&&\s*!isDraftLike\s*&&\s*!isCrmCreated\s*\)/
    );
  });

  test('isDraftLike treats Draft, Incomplete, and empty as draft-like (not a narrow allowlist)', () => {
    expect(routeSource).toMatch(/const effectiveStatus\s*=\s*\(merged\.MlsStatus[^\n]*\|\|\s*listing\.status/);
    expect(routeSource).toMatch(/const isDraftLike\s*=/);
    expect(routeSource).toMatch(/effectiveStatus === "Draft"/);
    expect(routeSource).toMatch(/effectiveStatus === "Incomplete"/);
    // The old literal-only negative gate must be gone (it was the bug).
    expect(routeSource).not.toMatch(/&&\s*!isDraft\s*&&/);
  });

  test('InHouseWebOnly is included in isInHouse check', () => {
    expect(routeSource).toMatch(/InHouseWebOnly/);
    const inHouseLines = routeSource.split('\n').filter(l =>
      l.includes('inHouseValues') && l.includes('InHouseWebOnly')
    );
    expect(inHouseLines.length).toBeGreaterThanOrEqual(1);
  });

  test('ListingAgreement (uppercase) is checked for InHouse detection', () => {
    expect(routeSource).toMatch(/merged\.ListingAgreement/);
  });

  test('enforcement does NOT run unconditionally', () => {
    const lines = routeSource.split('\n');
    const enforcementCallLine = lines.findIndex(l =>
      l.includes('assertRlsCompliantPayload(merged') && !l.trimStart().startsWith('//')
    );
    expect(enforcementCallLine).toBeGreaterThan(-1);

    const precedingLines = lines.slice(Math.max(0, enforcementCallLine - 8), enforcementCallLine).join('\n');
    expect(precedingLines).toMatch(/if\s*\(\s*effectiveRlsEligible/);
  });
});
