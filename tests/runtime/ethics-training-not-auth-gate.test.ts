/**
 * Compliance-contract guard (UCBA Art. III §6): ethics training is an
 * ADMINISTRATIVE record, NOT an authentication gate. This test locks in the
 * WHOLE contract — not just the workflow-map entry — so the obsolete
 * authentication-gate system cannot silently return.
 *
 * Authoritative business rule (commit 2c10ce0b, 2026-05-26 — the over-broad
 * login gate was removed after it caused a complete agent lockout):
 *   - Login / MFA / session creation are governed by ACCOUNT STATUS only.
 *   - Missing/expired ethics training must NEVER auto-block login.
 *   - Ethics training is administered via the broker admin route (which writes
 *     an audit event) and reported read-only; the broker handles follow-up.
 *
 * Source/contract scans — no DB, no network.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

const map = JSON.parse(read("compliance/rules/workflow-map.json"));
const gate = (map.workflows as Array<Record<string, unknown>>).find(
  (w) => w.name === "ethics_training_gate",
)!;
const STANDARD_SURFACES = new Set(Object.keys((map._meta as { surface_keys: object }).surface_keys));

describe("ethics_training_gate is an administrative record, not an auth gate", () => {
  it("is framed as a record/tracking contract, not an auth gate", () => {
    expect(gate).toBeDefined();
    expect(String(gate.title)).not.toMatch(/auth gate/i);
    expect(String(gate.title)).toMatch(/record|tracking|administrative/i);
  });

  it("has NO login/MFA surface", () => {
    const surfaces = gate.required_surfaces as string[];
    for (const banned of ["login_route", "mfa_verify_route", "auth_gate", "auth_gate_logic"]) {
      expect(surfaces).not.toContain(banned);
      expect(Object.keys(gate.evidence as object)).not.toContain(banned);
    }
  });

  it("uses ONLY standard surface-vocabulary names (no invented surfaces)", () => {
    for (const s of gate.required_surfaces as string[]) {
      expect(STANDARD_SURFACES.has(s)).toBe(true);
    }
    // The invented names from the first draft must be gone.
    for (const invented of ["tracking_helper", "admin_api", "rollout_action"]) {
      expect(gate.required_surfaces as string[]).not.toContain(invented);
    }
  });

  it("every surface points at a file that actually exists", () => {
    for (const files of Object.values(gate.evidence as Record<string, string[]>)) {
      for (const f of files) expect(exists(f)).toBe(true);
    }
  });

  it("carries no operational_action_id (the auth-gate precondition is gone)", () => {
    expect(gate.operational_action_id).toBeUndefined();
    expect(String(gate.runtime_test_target)).toBe("tests/runtime/ethics-training-not-auth-gate.test.ts");
  });
});

describe("no obsolete authentication-gate artifacts remain", () => {
  it("login and MFA-verify routes do NOT reference ethics enforcement", () => {
    for (const rel of ["app/api/auth/login/route.ts", "app/api/auth/mfa/verify/route.ts"]) {
      expect(read(rel)).not.toMatch(/EthicsTrainingExpiredError|ETHICS_TRAINING_EXPIRED|assertAgentEthicsTrainingValid/);
    }
  });

  it("the throwing enforcement primitives are removed from lib/auth", () => {
    const session = read("lib/auth/session.ts");
    // No class/function DEFINITION remains (mentions only survive in explanatory prose).
    expect(session).not.toMatch(/export class EthicsTrainingExpiredError/);
    expect(session).not.toMatch(/export async function assertAgentEthicsTrainingValid/);
    const index = read("lib/auth/index.ts");
    expect(index).not.toMatch(/assertAgentEthicsTrainingValid|EthicsTrainingExpiredError/);
  });

  it("operational-actions.json has no ethics auth-gate precondition or lockout language", () => {
    const ops = read("compliance/rules/operational-actions.json");
    expect(ops).not.toMatch(/ethics_backfill_before_gate/);
    expect(ops).not.toMatch(/would_lock_out/i);
    expect(ops).not.toMatch(/lock them out|auth gate will lock/i);
  });

  it("the ethics report script is READ-ONLY (no placeholder-date write, no lockout/gate language)", () => {
    expect(exists("scripts/c4-ethics-backfill.ts")).toBe(false); // retired/renamed
    const report = read("scripts/ethics-training-status-report.ts");
    expect(report).not.toMatch(/UPDATE\s+agents/i);
    expect(report).not.toMatch(/INTERVAL '30 days'|NOW\(\)\s*\+/i);
    expect(report).not.toMatch(/would_lock_out/i);
    expect(report).not.toMatch(/auth gate|lock(ed)? out|before merging/i);
  });
});
