// POST /api/crm/validator/run
// Runs the IDX Plus Validator (scripts/idx-validate.js) server-side.
// Broker-only. Returns the JSON results.
import { NextRequest, NextResponse } from "next/server";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBroker(req);
    if (isAuthError(auth)) return auth;

    // Run the validator — it writes results to public/crm/data/validator-results.json
    try {
      execSync("node scripts/idx-validate.js", {
        cwd: process.cwd(),
        timeout: 25000,
        stdio: "pipe",
      });
    } catch {
      // Validator exits with code 1 on criticals — that's expected, not an error.
      // Results are still written to the JSON file.
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // Read the results file
    const resultsPath = path.join(process.cwd(), "public", "crm", "data", "validator-results.json");
    if (existsSync(resultsPath)) {
      const results = JSON.parse(readFileSync(resultsPath, "utf8"));
      const summary = results.summary || {};
      await logAuditEvent("run_validator", "system", "idx-validator", auth, {
        pass: summary.pass ?? 0,
        critical: summary.critical ?? 0,
        warning: summary.warning ?? 0,
      }, ip);
      return NextResponse.json(results);
    }

    return NextResponse.json({ error: "Validator did not produce results" }, { status: 500 });
  } catch (err) {
    return NextResponse.json(
      { error: "Validator failed: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }
}
