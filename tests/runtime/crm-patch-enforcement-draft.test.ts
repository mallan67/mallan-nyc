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
 * status is not display-ready (Draft / Incomplete / empty / terminal). The gate
 * keys on isDisplayReadyStatus(effectiveStatus) — normalized Active/ComingSoon
 * only — NOT a negative `!isDraft` check, which wrongly blocked Incomplete draft
 * saves (the CRM draft marker MlsStatus:"Incomplete" is non-Draft but not
 * display-ready). Same class as Codex #348/#350. Behavioral proof:
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
  test('enforcement gate is wrapped in rlsEligible AND display-ready AND !isCrmCreated guard', () => {
    // The gate keys on DISPLAY-READY status (Active/ComingSoon), NOT `!isDraft`.
    // The CRM form saves drafts as RESO MlsStatus:"Incomplete" — non-Draft but
    // not display-ready — so a `!isDraft` gate wrongly enforced the 48-field
    // check on Incomplete draft saves (422). Same class as Codex #348/#350;
    // behavioral proof in crm-patch-incomplete-draft-rls-gate.test.ts.
    expect(routeSource).toMatch(
      /if\s*\(\s*effectiveRlsEligible\s*&&\s*isDisplayReadyStatus\(effectiveStatus\)\s*&&\s*!isCrmCreated\s*\)/
    );
  });

  test('effectiveStatus is derived from merged MlsStatus and the gate uses the display-ready allowlist (not !isDraft)', () => {
    expect(routeSource).toMatch(/const effectiveStatus\s*=\s*\(merged\.MlsStatus[^\n]*\|\|\s*listing\.status/);
    expect(routeSource).toMatch(/isDisplayReadyStatus\(effectiveStatus\)/);
    // The negative-status gate must be gone (it is the bug).
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
