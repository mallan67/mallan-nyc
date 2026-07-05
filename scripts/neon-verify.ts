/**
 * neon:verify — read-only Neon drift check (OPS-016).
 *
 * Parses the canonical `NEON:FACTS` block from NEON.md (the single source of
 * truth) and compares every field against LIVE Neon via read-only `neonctl`
 * calls. If NEON.md disagrees with live Neon on any field, this FAILS (exit 1).
 * If Neon can't be reached (neonctl missing / not authed / offline), it errors
 * clearly as UNVERIFIED (exit 2) rather than pretending the docs are correct.
 *
 * STRICTLY READ-ONLY. It only runs `neonctl projects get`, `neonctl branches
 * list`, and `neonctl connection-string` (all reads). It never writes to Neon,
 * env, cron, or any file. It is safe to run any time.
 *
 * Usage:  npm run neon:verify        (or)   npx tsx scripts/neon-verify.ts
 *
 * Exit codes:  0 = docs match live · 1 = DRIFT (docs ≠ live) · 2 = UNVERIFIED
 * (could not reach Neon). CI without Neon creds sees 2, not a false drift.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const FACTS_START = "<!-- NEON:FACTS:START -->";
const FACTS_END = "<!-- NEON:FACTS:END -->";
const NEON_MD = path.resolve("NEON.md");

type Facts = Record<string, string>;

/** Parse the key=value NEON:FACTS block out of NEON.md. */
function readDocumentedFacts(): Facts {
  const doc = readFileSync(NEON_MD, "utf8");
  const start = doc.indexOf(FACTS_START);
  const end = doc.indexOf(FACTS_END);
  if (start === -1 || end === -1) {
    throw new Error(`NEON.md is missing the ${FACTS_START} … ${FACTS_END} block — cannot verify.`);
  }
  const body = doc.slice(start + FACTS_START.length, end);
  const facts: Facts = {};
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/i);
    if (m) facts[m[1]] = m[2];
  }
  return facts;
}

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }).trim();
}

interface Row { field: string; documented: string; live: string; ok: boolean }

function main(): void {
  let facts: Facts;
  try {
    facts = readDocumentedFacts();
  } catch (e) {
    console.error(`[neon:verify] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1); // a missing/edited facts block is a documentation defect, not "unverified"
  }

  const projectId = facts.project_id;
  const orgId = facts.org_id;
  if (!projectId || !orgId) {
    console.error("[neon:verify] NEON:FACTS block must define project_id and org_id.");
    process.exit(1);
  }

  // ── Live reads (any failure ⇒ UNVERIFIED, exit 2) ──
  let project: Record<string, any>;
  let branches: Array<Record<string, any>>;
  let connHost: string;
  try {
    project = JSON.parse(sh(`neonctl projects get ${projectId} --org-id ${orgId} --output json`));
    const braw = sh(`neonctl branches list --project-id ${projectId} --org-id ${orgId} --output json`);
    const bparsed = JSON.parse(braw);
    branches = Array.isArray(bparsed) ? bparsed : (bparsed.branches ?? []);
    const conn = sh(`neonctl connection-string main --project-id ${projectId} --org-id ${orgId}`);
    connHost = new URL(conn).hostname; // ep-<endpoint>.<region>.aws.neon.tech
  } catch (e) {
    console.error("[neon:verify] UNVERIFIED — could not read live Neon (neonctl missing / not authed / offline).");
    console.error(`  ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exit(2);
  }

  const def = branches.find((b) => b.default) ?? {};
  const des = project.default_endpoint_settings ?? {};
  const owner = project.owner ?? {};
  const endpointId = connHost.split(".")[0];

  // Map each documented fact to its live value.
  const live: Facts = {
    project_id: String(project.id ?? ""),
    org_id: String(project.org_id ?? owner.name ?? ""),
    plan: String(owner.subscription_type ?? ""),
    default_branch_id: String(def.id ?? ""),
    endpoint_id: endpointId,
    endpoint_host: connHost,
    compute_min_cu: String(des.autoscaling_limit_min_cu ?? ""),
    compute_max_cu: String(des.autoscaling_limit_max_cu ?? ""),
    history_retention_seconds: String(project.history_retention_seconds ?? ""),
    branches_limit: String(owner.branches_limit ?? ""),
    region_id: String(project.region_id ?? ""),
    pg_version: String(project.pg_version ?? ""),
  };

  const rows: Row[] = [];
  for (const [field, documented] of Object.entries(facts)) {
    if (!(field in live)) continue; // documented extra keys (e.g. notes) are ignored
    const liveVal = live[field];
    rows.push({ field, documented, live: liveVal, ok: documented === liveVal });
  }

  // Every documented, checkable field must have been compared.
  const uncovered = Object.keys(live).filter((f) => facts[f] === undefined);

  const drift = rows.filter((r) => !r.ok);
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  console.log(`[neon:verify] NEON.md vs live Neon (${projectId})`);
  for (const r of rows) {
    console.log(`  ${r.ok ? "OK  " : "DRIFT"} ${pad(r.field, 26)} doc=${pad(r.documented, 42)} live=${r.live}`);
  }
  if (uncovered.length) {
    console.error(`\n[neon:verify] NEON:FACTS is missing documented values for: ${uncovered.join(", ")}`);
    process.exit(1);
  }
  if (drift.length) {
    console.error(`\n[neon:verify] DRIFT — NEON.md disagrees with live Neon on ${drift.length} field(s): ${drift.map((d) => d.field).join(", ")}`);
    console.error("  Fix: update the NEON:FACTS block in NEON.md to the live values (or correct the live setting), then re-run.");
    process.exit(1);
  }
  console.log(`\n[neon:verify] PASS — all ${rows.length} documented Neon facts match live.`);
  process.exit(0);
}

main();
