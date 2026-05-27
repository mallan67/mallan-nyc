/// <reference types="jest" />
/**
 * P0 fix (2026-05-27) — PATCH enforcement must skip for Draft and web-only.
 *
 * Root cause: PATCH /api/crm/listings/[id] ran assertRlsCompliantPayload
 * unconditionally on every update. The 48-field mandatory check blocked
 * Draft saves and InHouseWebOnly listings that don't need RLS fields.
 * POST handler correctly wraps enforcement in `if (rlsEligible)`.
 *
 * Fix: PATCH now skips enforcement when effectiveRlsEligible is false
 * OR when the listing is in Draft status.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/crm/listings/[id]/route.ts'
);
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

describe('PATCH enforcement Draft/WebOnly bypass (P0 fix)', () => {
  test('enforcement gate is wrapped in rlsEligible AND !isDraft AND !isCrmCreated guard', () => {
    expect(routeSource).toMatch(/if\s*\(\s*effectiveRlsEligible\s*&&\s*!isDraft\s*&&\s*!isCrmCreated\s*\)/);
  });

  test('isDraft is derived from effectiveStatus', () => {
    expect(routeSource).toMatch(/const isDraft\s*=\s*effectiveStatus\s*===\s*"Draft"/);
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
