/// <reference types="jest" />
/**
 * Legacy authentication stays retired.
 *
 * 1. /admin fails closed. The old guard compared the `pc_auth` cookie with
 *    PRIVATE_COLLECTION_PASS; with the variable unset, `undefined === undefined` made it pass for
 *    every visitor.
 * 2. The passwordless dev-login route, its login-page button and CRM dev page, and the
 *    account-specific password-reset script are gone and must not return.
 */

import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { NextRequest } from "next/server";
import { checkRouteGuards } from "@/lib/middleware/route-guards";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const req = (p: string, cookie?: string) =>
  new NextRequest(`https://mallan.nyc${p}`, cookie ? { headers: { cookie } } : undefined);

describe("/admin guard fails closed", () => {
  const OLD_PASS = process.env.PRIVATE_COLLECTION_PASS;
  afterEach(() => {
    if (OLD_PASS === undefined) delete process.env.PRIVATE_COLLECTION_PASS;
    else process.env.PRIVATE_COLLECTION_PASS = OLD_PASS;
  });

  it("redirects a visitor with no cookies to /admin/login, even when PRIVATE_COLLECTION_PASS is unset", () => {
    delete process.env.PRIVATE_COLLECTION_PASS;
    const res = checkRouteGuards(req("/admin/seller-report/1"), "/admin/seller-report/1");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(307);
    const loc = new URL(res!.headers.get("location")!);
    expect(loc.pathname).toBe("/admin/login");
    expect(loc.searchParams.get("redirect")).toBe("/admin/seller-report/1");
  });

  it("no longer honors the legacy pc_auth cookie, whether or not the old variable is set", () => {
    delete process.env.PRIVATE_COLLECTION_PASS;
    expect(checkRouteGuards(req("/admin/x", "pc_auth=anything"), "/admin/x")!.status).toBe(307);
    process.env.PRIVATE_COLLECTION_PASS = "legacy-secret";
    expect(checkRouteGuards(req("/admin/x", "pc_auth=legacy-secret"), "/admin/x")!.status).toBe(307);
  });

  it("lets /admin/login through (no redirect loop) and lets a session-cookie request continue to the page's own validation", () => {
    expect(checkRouteGuards(req("/admin/login"), "/admin/login")).toBeNull();
    expect(checkRouteGuards(req("/admin/seller-report/1", "session_token=abc"), "/admin/seller-report/1")).toBeNull();
  });

  it("the guard source no longer references the legacy cookie or variable", () => {
    // Code only: the explanatory comment in the guard names the removed variable on purpose.
    const src = read("lib/middleware/route-guards.ts").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/PRIVATE_COLLECTION_PASS/);
    expect(src).not.toMatch(/["']pc_auth["']/);
  });
});

describe("passwordless / account-specific access paths stay deleted", () => {
  it("dev-login route, CRM dev page and reset script are gone", () => {
    expect(existsSync(path.join(ROOT, "app/api/auth/dev-login/route.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "public/crm/dev.html"))).toBe(false);
    expect(existsSync(path.join(ROOT, "scripts/reset-password.js"))).toBe(false);
  });

  it("the CRM login page has no dev bypass", () => {
    const login = read("public/crm/login.html");
    expect(login).not.toMatch(/dev-login/);
    expect(login).not.toMatch(/devLogin/);
  });
});
