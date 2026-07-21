/**
 * Compliance-contract guard (UCBA Art. III §6): ethics training is an
 * ADMINISTRATIVE record, NOT an authentication gate.
 *
 * Authoritative business rule (commit 2c10ce0b, 2026-05-26 — the over-broad
 * login gate was removed after it caused a complete agent lockout):
 *   - Login / MFA / session creation are governed by ACCOUNT STATUS only.
 *   - Missing/expired ethics training must NEVER auto-block login.
 *   - The `ethics_training_gate` workflow-map entry is a record-tracking
 *     contract, not an auth gate: login_route/mfa_verify_route are NOT surfaces.
 *
 * These are source/contract scans — no DB, no network.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("ethics training is not an authentication surface", () => {
  const map = JSON.parse(read("compliance/rules/workflow-map.json"));
  const gate = (map.workflows as Array<Record<string, unknown>>).find(
    (w) => w.name === "ethics_training_gate",
  )!;

  it("the ethics_training_gate exists and is framed as a record, not an auth gate", () => {
    expect(gate).toBeDefined();
    expect(String(gate.title)).not.toMatch(/auth gate/i);
    expect(String(gate.title)).toMatch(/record|tracking|administrative/i);
  });

  it("login_route and mfa_verify_route are NOT required surfaces of the ethics gate", () => {
    const surfaces = gate.required_surfaces as string[];
    expect(surfaces).not.toContain("login_route");
    expect(surfaces).not.toContain("mfa_verify_route");
    expect(Object.keys(gate.evidence as object)).not.toContain("login_route");
    expect(Object.keys(gate.evidence as object)).not.toContain("mfa_verify_route");
    expect(Object.keys(gate.surface_patterns as object)).not.toContain("login_route");
    expect(Object.keys(gate.surface_patterns as object)).not.toContain("mfa_verify_route");
  });

  it("every ethics-gate surface points at a file that actually exists", () => {
    for (const files of Object.values(gate.evidence as Record<string, string[]>)) {
      for (const f of files) expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    }
  });

  it("the login and MFA-verify routes do NOT reference ethics-training enforcement", () => {
    for (const rel of ["app/api/auth/login/route.ts", "app/api/auth/mfa/verify/route.ts"]) {
      const src = read(rel);
      expect(src).not.toMatch(/EthicsTrainingExpiredError|ETHICS_TRAINING_EXPIRED|assertAgentEthicsTrainingValid/);
    }
  });

  it("createSession() does not call the ethics assertion (login never blocked by ethics dates)", () => {
    const session = read("lib/auth/session.ts");
    const start = session.indexOf("export async function createSession");
    expect(start).toBeGreaterThan(-1);
    // Scan from createSession to end of file — it must not invoke the assertion.
    const body = session.slice(start);
    expect(body).not.toMatch(/assertAgentEthicsTrainingValid\s*\(/);
  });
});
