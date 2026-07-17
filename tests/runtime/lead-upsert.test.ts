/// <reference types="jest" />
/**
 * lib/leads/lead-upsert — atomic SQL contract pin.
 *
 * The runtime concurrency-safety of the contact-form upsert path depends
 * on the DB-side union expression compiled into the INSERT ... ON CONFLICT
 * statement. If a future refactor switches to .upsert() (which sets roles
 * to a JS-computed value and loses the DB-side merge), or removes the
 * DISTINCT / unnest expression, this test pins the regression.
 *
 * The Prisma client is mocked — the test verifies the SQL string Prisma
 * would send to Postgres, not the round-trip to a real DB. The Codex
 * contract is "concurrent submissions for the same email cannot drop a
 * role", which is only true if the merge is performed inside a single
 * statement against the row-locked existing row. Probing the compiled
 * SQL keeps that contract from silently breaking under a future
 * "cleanup" diff.
 */

import { atomicMergeUpsertLead } from "@/lib/leads/lead-upsert";

// Reconstruct an approximation of the SQL Prisma would send for inspection.
// Prisma's tagged-template $queryRaw call form receives `(strings, ...values)`;
// nested Prisma.sql fragments appear as values with their own `.strings` /
// `.sql` properties. We unwrap one level (the helper only nests once for
// the roles ARRAY literal) so the static SQL of both the outer and nested
// fragments is visible to the assertion.
function reconstructSql(
  strings: ReadonlyArray<string> | undefined,
  values: ReadonlyArray<unknown>
): string {
  if (!strings) return "";
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === "object") {
        const sql = (v as { sql?: unknown }).sql;
        const nestedStrings = (v as { strings?: ReadonlyArray<string> })
          .strings;
        if (typeof sql === "string") {
          out += sql;
        } else if (Array.isArray(nestedStrings)) {
          out += nestedStrings.join("?");
        } else {
          out += "?";
        }
      } else {
        out += "?";
      }
    }
  }
  return out;
}

// Collect every primitive bound parameter (including those inside nested
// Prisma.sql fragments) so the test can assert that JS NEVER passes a
// pre-merged "buyer+seller" value — that would be the smoking gun for
// a regression back to the TOCTOU race.
function collectBoundValues(values: ReadonlyArray<unknown>): unknown[] {
  const out: unknown[] = [];
  for (const v of values) {
    if (v && typeof v === "object") {
      const nestedValues = (v as { values?: ReadonlyArray<unknown> }).values;
      if (Array.isArray(nestedValues)) {
        out.push(...collectBoundValues(nestedValues));
        continue;
      }
    }
    out.push(v);
  }
  return out;
}

describe("atomicMergeUpsertLead — SQL contract", () => {
  it('source contract: the helper file contains no raw PascalCase relation reference anywhere (comments included)', () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/leads/lead-upsert.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/"Lead"/);
    expect(src).toMatch(/INSERT INTO "leads" \(/);
    expect(src).toMatch(/"leads"\."roles"/);
  });

  it("emits a single INSERT ... ON CONFLICT statement with DB-side roles union", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const fakePrisma = {
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        calls.push({
          sql: reconstructSql(strings, values),
          values: collectBoundValues(values),
        });
        return [{ id: 42n, roles: ["buyer", "seller"] }];
      },
    };

    const result = await atomicMergeUpsertLead(fakePrisma as never, {
      email: "tester@example.com",
      firstName: "Test",
      lastName: "User",
      phone: "555-1234",
      incomingRoles: ["seller"],
      consentCapturedAt: new Date("2026-05-20T12:00:00Z"),
    });

    expect(result).toEqual({ id: 42n, roles: ["buyer", "seller"] });
    // Single statement — no separate findUnique + upsert anymore.
    expect(calls.length).toBe(1);
    const sql = calls[0].sql;

    // Pin every expression that the concurrency contract depends on.
    // If any of these regexes stops matching, a future refactor has
    // broken the DB-side merge and reopened the TOCTOU race.
    // Must target the REAL physical table `leads` (Prisma @@map("leads")),
    // referenced by its literal quoted name (no alias) per the 2026-07-17
    // SQL contract.
    // Regression guard: the historical `INSERT INTO "Lead"` (quoted, case-
    // sensitive) hit a non-existent relation → 42P01 → 16 days of dropped
    // contact leads (fixed 2026-07-14). Never let the PascalCase name back in.
    expect(sql).toMatch(/INSERT INTO "leads" \(/);
    expect(sql).toMatch(/"leads"\."roles"/);
    expect(sql).toMatch(/"leads"\."phone"/);
    expect(sql).not.toMatch(/"Lead"/);
    expect(sql).toMatch(/ON CONFLICT \("email"\)/i);
    expect(sql).toMatch(/DO UPDATE SET/i);
    expect(sql).toMatch(
      /unnest\(\s*"leads"\."roles"\s*\|\|\s*EXCLUDED\."roles"\s*\)/
    );
    expect(sql).toMatch(/SELECT DISTINCT/i);
    expect(sql).toMatch(/RETURNING/i);
    expect(sql).toMatch(/"id",\s*"roles"/);

    // The JS layer must NOT pre-compute the merged roles and pass them
    // in as bound parameters — that would put us back in the TOCTOU
    // race the Codex feedback flagged. The bound roles param should
    // contain only the *incoming* role(s), never a union with a value
    // we didn't pass in.
    const boundStrings = calls[0].values.filter(
      (v): v is string => typeof v === "string"
    );
    expect(boundStrings).toContain("seller");
    // "buyer" came only from the mocked DB RETURNING. If it appears as
    // a bound parameter, the JS layer is doing the merge — regression.
    expect(boundStrings).not.toContain("buyer");
  });

  it("preserves the COALESCE NULLIF guard on phone (don't blank an existing phone with an empty submission)", async () => {
    let capturedSql = "";
    const fakePrisma = {
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        capturedSql = reconstructSql(strings, values);
        return [{ id: 1n, roles: ["buyer"] }];
      },
    };
    await atomicMergeUpsertLead(fakePrisma as never, {
      email: "x@example.com",
      firstName: "X",
      lastName: "Y",
      phone: "",
      incomingRoles: ["buyer"],
      consentCapturedAt: new Date(),
    });
    expect(capturedSql).toMatch(
      /COALESCE\(\s*NULLIF\(EXCLUDED\."phone",\s*''\),\s*"leads"\."phone"\s*\)/
    );
  });

  it("throws when the upsert returns no rows (defensive — should never happen with ON CONFLICT)", async () => {
    const fakePrisma = {
      $queryRaw: async () => [] as Array<{ id: bigint; roles: string[] }>,
    };
    await expect(
      atomicMergeUpsertLead(fakePrisma as never, {
        email: "x@example.com",
        firstName: "X",
        lastName: "Y",
        phone: "",
        incomingRoles: ["buyer"],
        consentCapturedAt: new Date(),
      })
    ).rejects.toThrow(/returned no rows/i);
  });
});
