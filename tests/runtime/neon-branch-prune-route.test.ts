/// <reference types="jest" />
import { NextRequest } from "next/server";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function request(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request("http://localhost/api/cron/neon-branch-prune", {
    method: "GET",
    headers,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

afterAll(() => {
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
});

describe("neon branch prune route — quarantined direct provider control", () => {
  test("authenticated callers are refused with 410 and no provider action path", async () => {
    const route = await import("@/app/api/cron/neon-branch-prune/route");
    const res = await route.GET(request("test-cron-secret"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.refused).toBe(true);
    expect(body.reason).toBe("direct_neon_control_quarantined");
  });

  test("unauthenticated or wrong-secret callers remain unauthorized", async () => {
    const route = await import("@/app/api/cron/neon-branch-prune/route");
    expect((await route.GET(request())).status).toBe(401);
    expect((await route.GET(request("wrong"))).status).toBe(401);
  });

  test("source contains no direct Neon credential or prune helper", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/cron/neon-branch-prune/route.ts"),
      "utf8",
    );
    expect(source).not.toContain("NEON_API_KEY");
    expect(source).not.toContain("NEON_PROJECT_ID");
    expect(source).not.toContain("pruneBranches");
    expect(source).toContain("QUARANTINED_DIRECT_NEON_CONTROL");
  });
});
