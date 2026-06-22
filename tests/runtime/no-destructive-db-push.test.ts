/// <reference types="jest" />
/**
 * Phase D safety guard (Codex #429) -- no repo workflow or script may run
 * `prisma db push --accept-data-loss`.
 *
 * With agent_info removed from the Prisma schema (step 3), a --accept-data-loss push would sync
 * any target DB to the field-less schema and DROP the physical column WITHOUT an approved,
 * snapshot-gated migration. The DB column DROP is a SEPARATE, explicitly-Maya-approved step.
 * Plain `prisma db push` (no flag, which REFUSES any data-loss op) is allowed.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const ROOTS = [".github", "scripts", "tools"];
const scanned: string[] = ROOTS.flatMap((d) => {
  const p = join(process.cwd(), d);
  return existsSync(p) ? walk(p) : [];
})
  .concat([join(process.cwd(), "package.json")])
  .filter((f) => /\.(ya?ml|js|mjs|ts|json|sh)$/.test(f) && !/\.test\./.test(f) && !/[\\/]__/.test(f));

describe("Phase D safety -- no destructive prisma db push --accept-data-loss", () => {
  it("no workflow/script has a `prisma db push ... --accept-data-loss` command", () => {
    // Match the actual destructive INVOCATION (prisma db push + the flag on one line), so an
    // explanatory comment that merely names the flag does not false-positive.
    const offenders = scanned
      .filter((f) => /prisma db push[^\n]*--accept-data-loss/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(process.cwd(), ""));
    expect(offenders).toEqual([]);
  });

  it("pr-check.yml validates + generates and uses a non-destructive db push (no flag)", () => {
    const wf = readFileSync(join(process.cwd(), ".github", "workflows", "pr-check.yml"), "utf8");
    expect(wf).toContain("prisma validate");
    expect(wf).toContain("prisma generate");
    expect(wf).toMatch(/run:\s*npx prisma db push\s*$/m); // bare db push, no flag
    // The destructive flag must not appear on any `prisma db push` run line.
    expect(wf).not.toMatch(/prisma db push[^\n]*--accept-data-loss/);
  });
});
