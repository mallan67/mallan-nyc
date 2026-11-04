/// <reference types="jest" />
/**
 * /api/market — cached Date columns must be coerced before use.
 *
 * `cachedPublicRead` wraps `unstable_cache`, which JSON-serializes its result. A cache
 * miss returns real Date objects; a cache HIT returns ISO strings. Calling `.getTime()`
 * on the string threw "e.first_active_date.getTime is not a function" in production.
 */

import { readFileSync } from "fs";
import * as path from "path";

const src = readFileSync(path.resolve(__dirname, "../../app/api/market/route.ts"), "utf8");

describe("/api/market cached Date handling", () => {
  it("a JSON round trip (what a cache hit does) turns Dates into strings", () => {
    const row = { first_active_date: new Date("2026-09-01T00:00:00Z"), created_at: new Date("2026-08-01T00:00:00Z") };
    const hit = JSON.parse(JSON.stringify(row)) as { first_active_date: unknown; created_at: unknown };
    expect(typeof hit.first_active_date).toBe("string");
    expect(() => (hit.first_active_date as Date).getTime()).toThrow(TypeError);
    expect(new Date(hit.first_active_date as string).getTime()).toBe(row.first_active_date.getTime());
  });

  it("the days-on-market calculation coerces both cached Date columns", () => {
    expect(src).toMatch(/new Date\(l\.first_active_date\)\.getTime\(\)/);
    expect(src).toMatch(/new Date\(l\.created_at\)\.getTime\(\)/);
    expect(src).not.toMatch(/l\.first_active_date\.getTime\(\)/);
    expect(src).not.toMatch(/l\.created_at\.getTime\(\)/);
  });
});
