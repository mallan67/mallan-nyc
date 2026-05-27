/// <reference types="jest" />
/**
 * P0 fix (2026-05-27) — advisory lock must use $executeRaw, not $queryRaw.
 *
 * Root cause: generateListingId() calls
 *   SELECT pg_advisory_xact_lock(...)
 * which returns void. Prisma $queryRaw tries to deserialize the void column
 * and throws P2010 ("Failed to deserialize column of type 'void'").
 * $executeRaw does not attempt deserialization — it returns affected-row count.
 *
 * Assertions:
 *   1. Source pin: the advisory lock line uses $executeRaw, not $queryRaw
 *   2. Source pin: no $queryRaw call exists for pg_advisory_xact_lock anywhere
 *      in the route file (regression guard)
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/crm/listings/route.ts'
);
const routeSource = readFileSync(ROUTE_PATH, 'utf-8');

describe('generateListingId advisory lock (P0 fix)', () => {
  test('advisory lock uses $executeRaw, not $queryRaw', () => {
    const callLines = routeSource
      .split('\n')
      .filter(
        (l) =>
          l.includes('pg_advisory_xact_lock') &&
          (l.includes('$executeRaw') || l.includes('$queryRaw'))
      );

    expect(callLines.length).toBeGreaterThanOrEqual(1);

    for (const line of callLines) {
      expect(line).toContain('$executeRaw');
      expect(line).not.toMatch(/\$queryRaw/);
    }
  });

  test('no $queryRaw call exists for pg_advisory_xact_lock (regression guard)', () => {
    const dangerousPattern = /\$queryRaw.*pg_advisory_xact_lock/;
    expect(routeSource).not.toMatch(dangerousPattern);

    const reversePattern = /pg_advisory_xact_lock[\s\S]{0,50}\$queryRaw/;
    expect(routeSource).not.toMatch(reversePattern);
  });

  test('$executeRaw + pg_advisory_xact_lock pattern is present', () => {
    expect(routeSource).toMatch(/\$executeRaw.*pg_advisory_xact_lock/);
  });
});
