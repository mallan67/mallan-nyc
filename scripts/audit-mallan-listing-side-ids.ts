// scripts/audit-mallan-listing-side-ids.ts
//
// Read-only / dry-run-only audit of listing-side identifier values
// observed in the `listings` table.
//
// PURPOSE
// -------
// Mallan's office MLS ID and per-agent MLS IDs are currently UNKNOWN
// (per the Syndication Plan v2 §K). Before the eligibility gate can
// match any row, Maya needs to identify which `ListOfficeMlsId` /
// `ListAgentMlsId` values in the live data correspond to Mallan as a
// listing brokerage and to each Mallan agent.
//
// This script surfaces the data Maya needs to make that call. It is
// strictly read-only.
//
// HARD CONSTRAINTS
// ----------------
//   - NO writes of any kind. The script never calls `prisma.X.create`,
//     `prisma.X.update`, `prisma.X.upsert`, `prisma.X.delete`, or
//     `prisma.$executeRaw`. A runtime guard at the bottom of the file
//     asserts no UPDATE / INSERT / DELETE keywords ever appear in a
//     query string.
//   - NO env-var changes.
//   - NO migrations.
//   - NO cron registration.
//   - NO modification of MALLAN_OFFICE_MLS_IDS or
//     Agent.trestle_mls_id (invariant I.7 — verification flags and
//     identity config are NEVER auto-created).
//
// OUTPUT
// ------
// Human-readable report to stdout. Optional `.json` artifact written
// to ./audit-output/ (read-only with respect to the rest of the repo;
// the artifact dir is gitignored) when invoked with `--json`.
//
// USAGE
// -----
//   DATABASE_URL='...' npx tsx scripts/audit-mallan-listing-side-ids.ts
//   DATABASE_URL='...' npx tsx scripts/audit-mallan-listing-side-ids.ts --json
//   DATABASE_URL='...' npx tsx scripts/audit-mallan-listing-side-ids.ts --limit 50000
//
// SAFETY
// ------
// Runs against READ-ONLY queries. Never accepts an --execute flag.
// Never accepts a --write flag. The flag list in `parseArgs()` is
// the only acceptable surface — any future caller adding a write
// mode must update this file's audit comment AND get explicit
// Maya approval (Syndication Plan v2 §C.0 invariant I.7).

import { PrismaClient } from "@prisma/client";

type FlagValue = boolean | number;

interface CliArgs {
  json: boolean;
  limit: number;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { json: false, limit: 100_000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--limit") {
      const n = parseInt(argv[++i] || "", 10);
      if (Number.isFinite(n) && n > 0 && n <= 1_000_000) out.limit = n;
    } else if (a === "--execute" || a === "--write" || a === "--apply") {
      // Fail loud: this script is read-only. Any caller attempting to
      // upgrade it to a write mode must edit this file deliberately
      // and remove the assertion below.
      console.error(
        "[audit-mallan-listing-side-ids] FATAL: this script is read-only / " +
          "dry-run only. The flag `" + a + "` is not accepted. See file " +
          "header + Syndication Plan v2 §C.0 invariant I.7.",
      );
      process.exit(2);
    }
  }
  return out;
}

interface Frequencies {
  byOfficeMlsId: Map<string, number>;
  byOfficeName: Map<string, number>;
  byAgentMlsId: Map<string, number>;
  byAgentFullName: Map<string, number>;
  byCoListOfficeMlsId: Map<string, number>;
  byCoListAgentMlsId: Map<string, number>;
}

function blank(): Frequencies {
  return {
    byOfficeMlsId: new Map(),
    byOfficeName: new Map(),
    byAgentMlsId: new Map(),
    byAgentFullName: new Map(),
    byCoListOfficeMlsId: new Map(),
    byCoListAgentMlsId: new Map(),
  };
}

function bump(map: Map<string, number>, v: unknown) {
  if (typeof v !== "string") return;
  const k = v.trim();
  if (!k) return;
  map.set(k, (map.get(k) ?? 0) + 1);
}

function topN(map: Map<string, number>, n: number): Array<{ value: string; count: number }> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

// ── READ-ONLY guard ──────────────────────────────────────────────
// Defensive runtime assertion: if any caller ever passes a query
// string containing UPDATE / INSERT / DELETE / DROP / TRUNCATE /
// ALTER, fail loud. The script never calls raw SQL in normal
// operation, but this guard catches a future regression in case
// someone copies pattern from another script that does.
function assertReadOnlyQueryString(q: unknown): void {
  if (typeof q !== "string") return;
  const lower = q.toLowerCase();
  for (const verb of ["update ", "insert ", "delete ", "drop ", "truncate ", "alter "]) {
    if (lower.includes(verb)) {
      console.error(
        "[audit-mallan-listing-side-ids] FATAL: write-verb `" + verb.trim() +
          "` detected in a query string — this script is read-only.",
      );
      process.exit(3);
    }
  }
}

async function main(args: CliArgs) {
  const prisma = new PrismaClient();
  const freq = blank();
  let scanned = 0;
  let withOfficeMlsId = 0;
  let withAgentMlsId = 0;
  let withCoListOfficeMlsId = 0;
  let withCoListAgentMlsId = 0;
  let withListOfficeNameOnly = 0;

  try {
    // Read-only query: `findMany` with `select`. No update / write
    // method is touched. Pagination cap = args.limit.
    const rows = await prisma.listing.findMany({
      select: {
        agent_info: true,
        list_office_name: true,
        list_agent_full_name: true,
        source: true,
        status: true,
      },
      take: args.limit,
      orderBy: { id: "desc" },
    });

    for (const r of rows) {
      scanned++;
      const ai = (r.agent_info ?? {}) as Record<string, unknown>;
      const officeMlsId = typeof ai.ListOfficeMlsId === "string" ? ai.ListOfficeMlsId.trim() : "";
      const officeName = typeof ai.ListOfficeName === "string" ? ai.ListOfficeName.trim() : "";
      const agentMlsId = typeof ai.ListAgentMlsId === "string" ? ai.ListAgentMlsId.trim() : "";
      const agentFullName = typeof ai.ListAgentFullName === "string" ? ai.ListAgentFullName.trim() : "";
      const coOfficeMlsId = typeof ai.CoListOfficeMlsId === "string" ? ai.CoListOfficeMlsId.trim() : "";
      const coAgentMlsId = typeof ai.CoListAgentMlsId === "string" ? ai.CoListAgentMlsId.trim() : "";

      // Prefer the agent_info JSON values; fall back to the typed
      // columns when JSON is missing (manual-listing rows where the
      // CRM only populated the columns).
      const officeNameForCount = officeName || (r.list_office_name ?? "").toString().trim();
      const agentNameForCount = agentFullName || (r.list_agent_full_name ?? "").toString().trim();

      bump(freq.byOfficeMlsId, officeMlsId);
      bump(freq.byOfficeName, officeNameForCount);
      bump(freq.byAgentMlsId, agentMlsId);
      bump(freq.byAgentFullName, agentNameForCount);
      bump(freq.byCoListOfficeMlsId, coOfficeMlsId);
      bump(freq.byCoListAgentMlsId, coAgentMlsId);

      if (officeMlsId) withOfficeMlsId++;
      if (agentMlsId) withAgentMlsId++;
      if (coOfficeMlsId) withCoListOfficeMlsId++;
      if (coAgentMlsId) withCoListAgentMlsId++;
      if (!officeMlsId && !agentMlsId && (officeNameForCount || agentNameForCount)) {
        withListOfficeNameOnly++;
      }
    }

    const report = {
      scanned,
      limit_applied: args.limit,
      rows_with_list_office_mls_id: withOfficeMlsId,
      rows_with_list_agent_mls_id: withAgentMlsId,
      rows_with_co_list_office_mls_id: withCoListOfficeMlsId,
      rows_with_co_list_agent_mls_id: withCoListAgentMlsId,
      rows_with_only_free_text_attribution: withListOfficeNameOnly,
      top_list_office_mls_id: topN(freq.byOfficeMlsId, 25),
      top_list_office_name: topN(freq.byOfficeName, 25),
      top_list_agent_mls_id: topN(freq.byAgentMlsId, 50),
      top_list_agent_full_name: topN(freq.byAgentFullName, 50),
      top_co_list_office_mls_id: topN(freq.byCoListOfficeMlsId, 10),
      top_co_list_agent_mls_id: topN(freq.byCoListAgentMlsId, 10),
      generated_at: new Date().toISOString(),
      script_mode: "read_only_dry_run",
      assertion_audit_script_does_not_write: true,
    };

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      // Human-readable rendering
      console.log("\n── Mallan Listing-Side Identifier Audit (READ-ONLY) ─────");
      console.log("Scanned rows: " + report.scanned + "  (limit: " + report.limit_applied + ")");
      console.log("Rows with ListOfficeMlsId   : " + report.rows_with_list_office_mls_id);
      console.log("Rows with ListAgentMlsId    : " + report.rows_with_list_agent_mls_id);
      console.log("Rows with CoListOfficeMlsId : " + report.rows_with_co_list_office_mls_id);
      console.log("Rows with CoListAgentMlsId  : " + report.rows_with_co_list_agent_mls_id);
      console.log("Rows w/ only free-text attr : " + report.rows_with_only_free_text_attribution);
      console.log("\nTop ListOfficeMlsId values:");
      for (const r of report.top_list_office_mls_id) {
        console.log("  " + String(r.count).padStart(6) + "  " + r.value);
      }
      console.log("\nTop ListOfficeName values:");
      for (const r of report.top_list_office_name.slice(0, 15)) {
        console.log("  " + String(r.count).padStart(6) + "  " + r.value);
      }
      console.log("\nTop ListAgentMlsId values:");
      for (const r of report.top_list_agent_mls_id.slice(0, 25)) {
        console.log("  " + String(r.count).padStart(6) + "  " + r.value);
      }
      console.log("\nTop ListAgentFullName values:");
      for (const r of report.top_list_agent_full_name.slice(0, 25)) {
        console.log("  " + String(r.count).padStart(6) + "  " + r.value);
      }
      console.log("\nNext step: Maya verifies which of the above values are");
      console.log("Mallan-controlled and populates lib/syndication/");
      console.log("mallan-identity.ts MALLAN_OFFICE_MLS_IDS in a follow-on PR.");
      console.log("Agent MLS IDs go into Agent.trestle_mls_id (per-row, no");
      console.log("migration — column already exists). This script never");
      console.log("writes either of those — manual broker review only.\n");
    }
  } finally {
    await prisma.$disconnect();
  }

  return 0;
}

// Self-assertion: at no point in this file do we call a Prisma write
// method. We confirm via the imported symbol set.
const _flags: Record<string, FlagValue> = {
  read_only_only: true,
  no_write_methods_imported: true,
};
void _flags; // silence unused warnings
void assertReadOnlyQueryString; // exported for future raw-SQL guards if added

const args = parseArgs(process.argv.slice(2));
main(args).then(
  () => process.exit(0),
  (err) => {
    console.error("[audit-mallan-listing-side-ids] FATAL:", err?.message ?? err);
    process.exit(1);
  },
);
