/// <reference types="jest" />
/**
 * app/api/market/route.ts — Status residue cutover (2026-10-03).
 *
 * Live Cotality re-verification proved both `MlsStatus eq 'Active'` and
 * `(MlsStatus eq 'Closed' or StandardStatus eq 'Closed')` return HTTP 400 ("field
 * MlsStatus cannot be used for filtering or ordering queries") -- RLS suppresses
 * MlsStatus for filtering/ordering on live Cotality. The route's live Cotality
 * fallback silently degraded to empty cotalityActive/cotalityClosed arrays whenever
 * this fired (no warning, no telemetry), and the active fetch's Active-only filter
 * made the later `cotalityActive.filter(... === 'ActiveUnderContract')` count a
 * logical impossibility -- that status could never appear in rows the filter itself
 * excluded.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTE = readFileSync(resolve(__dirname, '../../app/api/market/route.ts'), 'utf8');

describe('api/market — live Cotality filters use StandardStatus only (MlsStatus HTTP 400)', () => {
  it('contains no "MlsStatus eq" filter clause anywhere in the route', () => {
    expect(ROUTE).not.toMatch(/MlsStatus eq/);
  });

  it('the active live fallback filter matches the DB activeWhere population (Active, ComingSoon, ActiveUnderContract)', () => {
    expect(ROUTE).toMatch(
      /\$filter: `\(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract'\) and \$\{propertyClass\}\$\{boroughFilter\}`/,
    );
    // and the DB-side rule it must match:
    expect(ROUTE).toMatch(/status: \{ in: \['Active', 'ComingSoon', 'ActiveUnderContract'\] \}/);
  });

  it('the closed live fallback filter uses StandardStatus eq Closed (no MlsStatus OR clause)', () => {
    expect(ROUTE).toMatch(
      /\$filter: `StandardStatus eq 'Closed' and \$\{propertyClass\} and CloseDate ge \$\{periodStartISO\}\$\{boroughFilter\}`/,
    );
  });

  it('a non-OK active fallback response triggers an explicit warning (not silently swallowed)', () => {
    expect(ROUTE).toMatch(/if \(activeRes\.ok\) \{[\s\S]{0,200}?\} else \{[\s\S]{0,200}?console\.warn\(/);
  });

  it('a non-OK closed fallback response triggers an explicit warning (not silently swallowed)', () => {
    expect(ROUTE).toMatch(/if \(closedRes\.ok\) \{[\s\S]{0,200}?\} else \{[\s\S]{0,200}?console\.warn\(/);
  });

  it('the active and closed warnings log HTTP status only, never the bearer token or response body', () => {
    const warnLines = ROUTE.match(/console\.warn\(\s*`\[\/api\/market\][^`]*`/g) || [];
    for (const line of warnLines) {
      expect(line).not.toMatch(/token/i);
      expect(line).not.toMatch(/Authorization/i);
    }
  });
});
