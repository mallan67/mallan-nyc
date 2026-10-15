/// <reference types="jest" />
/**
 * The Outlook (Microsoft Graph) inbox scanner stays retired; SMTP business email and the generic
 * contact import stay intact.
 *
 * Retired (Maya, 2026-10-14): the Graph OAuth flow, the folder/scan/disconnect routes, lib/outlook, and the
 * CRM "Outlook Scanner" panel. It was built for inbox scanning and contact import, not sending.
 * Preserved: Microsoft 365 SMTP delivery (lib/email/sendgrid.ts, nodemailer + SMTP_USER/SMTP_PASS),
 * the generic "Import Contacts" panel, and existing CRM records (no schema or data change here).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|html)$/.test(name)) out.push(full);
  }
  return out;
}

describe("Outlook Graph integration is gone", () => {
  it("the routes and the library are deleted", () => {
    expect(existsSync(path.join(ROOT, "app/api/crm/outlook"))).toBe(false);
    expect(existsSync(path.join(ROOT, "lib/outlook"))).toBe(false);
  });

  it("no application code calls the Outlook routes, Microsoft Graph, Microsoft login or the MS_* variables", () => {
    const roots = ["app", "lib", "components", "public/crm/js"].map((r) => path.join(ROOT, r)).filter(existsSync);
    const forbidden = [/api\/crm\/outlook/, /graph\.microsoft\.com/, /login\.microsoftonline\.com/, /process\.env\.MS_(CLIENT_ID|CLIENT_SECRET|TENANT_ID|REDIRECT_URI)/];
    const hits: string[] = [];
    for (const file of roots.flatMap((r) => walk(r))) {
      const src = readFileSync(file, "utf8");
      for (const re of forbidden) if (re.test(src)) hits.push(`${path.relative(ROOT, file)} :: ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it("the CRM dashboard no longer registers or lists the Outlook Scanner", () => {
    for (const rel of ["public/crm/js/dashboard/app.js", "public/crm/js/dashboard/panels.js"]) {
      const src = read(rel);
      expect(src).not.toMatch(/\/ops\/outlook/);
      expect(src).not.toMatch(/outlookScanner|_renderOutlook|_importSelectedOutlook|_disconnectOutlook/);
    }
  });
});

describe("what must survive the retirement", () => {
  it("Microsoft 365 SMTP delivery is untouched", () => {
    const src = read("lib/email/sendgrid.ts");
    expect(src).toMatch(/from ["']nodemailer["']/);
    expect(src).toMatch(/process\.env\.SMTP_USER/);
    expect(src).toMatch(/process\.env\.SMTP_PASS/);
    expect(src).toMatch(/smtp\.office365\.com/);
  });

  it("the generic Import Contacts panel is still registered", () => {
    expect(read("public/crm/js/dashboard/app.js")).toMatch(/Router\.register\('\/ops\/import'/);
    expect(read("public/crm/js/dashboard/panels.js")).toMatch(/importFromEmail/);
  });
});
