// scripts/ops/repair-exclusive-agent-assignment.mjs
//
// One-off OPS repair: backfill the assigned-agent identity onto Mallan EXCLUSIVE
// listings that have an owning `agent_id` but an EMPTY agent display identity
// (agent_info.ListAgentFullName == "" / list_agent_full_name == NULL).
//
// Why this exists: some CRM-created exclusives (e.g. SL-0001..SL-0004) were
// seeded with an agent_info TEMPLATE whose keys are present but blank, and were
// never re-saved through the app's buildExclusiveAgentAssignment path. As a
// result the public listing-detail contact card has no agent NAME and the
// listing renders generic / "unassigned" even though agent_id is linked.
//
// What it does (parity with lib/listings/exclusive-agent-assignment.ts):
//   - selects Mallan exclusives (SL-/RL- prefix OR rls_eligible=false) that have
//     a non-null agent_id,
//   - loads the listing's OWN linked Agent row (never reassigns ownership),
//   - blank-only fills agent_info.{ListAgentFullName, ListOfficeName,
//     ListAgentEmail, ListAgentDirectPhone} from that Agent, and mirrors the two
//     promoted columns (list_agent_full_name, list_office_name).
//   - Manual / already-populated values are PRESERVED (blank-only — never
//     overwrites a name an agent typed).
//
// NO hardcoded person and NO hardcoded listing id: the agent identity comes from
// each listing's own agent_id. SL-0004 below is only a default DRY-RUN scope hint
// and can be overridden with --listing / --all.
//
// Usage:
//   node scripts/ops/repair-exclusive-agent-assignment.mjs                 # DRY-RUN, all candidates
//   node scripts/ops/repair-exclusive-agent-assignment.mjs --listing=SL-0004
//   node scripts/ops/repair-exclusive-agent-assignment.mjs --apply         # WRITE
//   node scripts/ops/repair-exclusive-agent-assignment.mjs --apply --verify # WRITE + re-read assert
//
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Canonical brokerage trade name (mirrors lib/syndication/mallan-identity).
const MALLAN_BROKERAGE_NAME = "Mallan Real Estate Inc.";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");
// Phase C: by default only repair rows whose RESOLVED (typed-first) name is BLANK.
// --force restamps even when a name is already present (still blank-only fill, manual wins).
const FORCE = args.includes("--force");
const listingFilter = (args.find((a) => a.startsWith("--listing=")) || "").split("=")[1] || null;

// Load DATABASE_URL from .env.local (script reads it; secret is not printed).
try {
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch (e) {
  console.error("Could not read .env.local:", e.message);
  process.exit(1);
}

const prisma = new PrismaClient();

const isBlank = (v) => v == null || (typeof v === "string" && v.trim() === "");

const clean = (v) => { const s = v == null ? "" : String(v).trim(); return s.length ? s : null; };

// Typed-FIRST resolution — mirrors lib/listings/agent-info-resolver.ts: prefer the typed
// column, fall back to the agent_info JSON (PascalCase, then the lowercase ensure shape).
// Phase C: the typed columns are the source of truth; agent_info JSON is fallback only.
function resolveTypedFirst(l) {
  const j = (l.agent_info && typeof l.agent_info === "object") ? l.agent_info : {};
  return {
    fullName: clean(l.list_agent_full_name) ?? clean(j.ListAgentFullName) ?? clean(j.name),
    officeName: clean(l.list_office_name) ?? clean(j.ListOfficeName) ?? clean(j.company),
    agentEmail: clean(l.list_agent_email) ?? clean(j.ListAgentEmail) ?? clean(j.email),
    agentDirectPhone: clean(l.list_agent_direct_phone) ?? clean(j.ListAgentDirectPhone) ?? clean(j.phone),
    officeMlsId: clean(l.list_office_mls_id) ?? clean(j.ListOfficeMlsId),
    agentMlsId: clean(l.list_agent_mls_id) ?? clean(j.ListAgentMlsId),
    coListOfficeMlsId: clean(l.co_list_office_mls_id) ?? clean(j.CoListOfficeMlsId),
    coListAgentMlsId: clean(l.co_list_agent_mls_id) ?? clean(j.CoListAgentMlsId),
  };
}

// Plan the typed-column repair for ONE row. Mirrors lib/listings/repair-exclusive-plan.ts
// (the unit-tested canonical source). Returns null to skip, else the typed write payload.
function planRow(l, agent, { force }) {
  const r = resolveTypedFirst(l);
  if (!force && !isBlank(r.fullName)) return null; // resolved name present → not a candidate
  const agentFullName = clean(agent.full_name) ??
    clean([agent.first_name, agent.last_name].map((p) => (p || "").trim()).filter(Boolean).join(" "));
  // Blank-only fill from the Agent row / default brokerage. Existing non-blank resolved
  // values are PRESERVED; MLS IDs (not on the Agent row) pass through. Never nulls a value.
  return {
    list_agent_full_name: r.fullName ?? agentFullName,
    list_office_name: r.officeName ?? MALLAN_BROKERAGE_NAME,
    list_agent_email: r.agentEmail ?? clean(agent.email),
    list_agent_direct_phone: r.agentDirectPhone ?? clean(agent.phone),
    list_office_mls_id: r.officeMlsId,
    list_agent_mls_id: r.agentMlsId,
    co_list_office_mls_id: r.coListOfficeMlsId,
    co_list_agent_mls_id: r.coListAgentMlsId,
  };
}

function isMallanExclusive(l) {
  const id = String(l.listing_id ?? "");
  return id.startsWith("SL-") || id.startsWith("RL-") || l.rls_eligible === false;
}

async function main() {
  console.log(`\n=== Exclusive agent-assignment repair — ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"} ===`);
  console.log(`    scope: ${listingFilter ? `listing_id=${listingFilter}` : "all Mallan exclusives with empty agent identity"}\n`);

  const where = listingFilter
    ? { listing_id: listingFilter }
    : { OR: [{ listing_id: { startsWith: "SL-" } }, { listing_id: { startsWith: "RL-" } }, { rls_eligible: false }] };

  const rows = await prisma.listing.findMany({
    where,
    select: {
      listing_id: true, agent_id: true, rls_eligible: true, status: true,
      // Phase D step 2: agent_info select removed — resolveTypedFirst is typed-first + absent-safe (agent_info → {}).
      // Phase C: all 8 typed columns — the source of truth for the typed-first repair.
      list_agent_full_name: true, list_office_name: true,
      list_agent_email: true, list_agent_direct_phone: true,
      list_office_mls_id: true, list_agent_mls_id: true,
      co_list_office_mls_id: true, co_list_agent_mls_id: true,
    },
    orderBy: { listing_id: "asc" },
  });

  const plan = [];
  for (const l of rows) {
    if (!isMallanExclusive(l)) continue;
    if (l.agent_id == null) {
      console.log(`SKIP  ${l.listing_id}: no agent_id (cannot resolve owner — not repairing).`);
      continue;
    }
    // Phase C: candidate gate is TYPED-FIRST — skip rows whose resolved name is already
    // present (unless --force). A row with good typed attribution but empty agent_info is
    // NOT a candidate (the old agent_info-only check wrongly repaired it).
    const before = resolveTypedFirst(l);
    if (!FORCE && !isBlank(before.fullName)) continue;

    const agent = await prisma.agent.findUnique({
      where: { id: l.agent_id },
      select: { id: true, full_name: true, first_name: true, last_name: true, email: true, phone: true },
    });
    if (!agent) {
      console.log(`SKIP  ${l.listing_id}: agent_id=${l.agent_id} has no Agent row.`);
      continue;
    }
    const typed = planRow(l, agent, { force: FORCE });
    if (!typed) continue;

    plan.push({
      listing_id: l.listing_id, status: l.status, agent_id: l.agent_id.toString(),
      before: { col: l.list_agent_full_name ?? "(null)", office_col: l.list_office_name ?? "(null)" },
      typed,
    });
  }

  if (plan.length === 0) {
    console.log("No listings need repair. (All Mallan exclusives already carry a resolved agent name.)");
    return;
  }

  console.log(`Candidates needing repair: ${plan.length}\n`);
  for (const p of plan) {
    console.log(`• ${p.listing_id} (status=${p.status}, agent_id=${p.agent_id})`);
    console.log(`    list_agent_full_name : ${p.before.col}  →  ${p.typed.list_agent_full_name ?? "(null)"}`);
    console.log(`    list_office_name     : ${p.before.office_col}  →  ${p.typed.list_office_name ?? "(null)"}`);
    console.log(`    email/phone          : ${p.typed.list_agent_email ?? "(null)"} / ${p.typed.list_agent_direct_phone ?? "(null)"}`);
    console.log(`    office/agent MLS IDs  : ${p.typed.list_office_mls_id ?? "(null)"} / ${p.typed.list_agent_mls_id ?? "(null)"} (preserved typed-first)`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN only — no rows written. Re-run with --apply to write.`);
    return;
  }

  console.log(`\nApplying ${plan.length} update(s)...`);
  for (const p of plan) {
    // Phase C: agent_info JSON no longer persisted. Write ONLY the typed columns, computed
    // typed-first (existing non-blank values preserved; blanks filled from the Agent row).
    await prisma.listing.update({
      where: { listing_id: p.listing_id },
      data: { ...p.typed },
    });
    console.log(`  ✓ ${p.listing_id} updated.`);
  }

  if (VERIFY) {
    console.log(`\nVerifying...`);
    let ok = true;
    for (const p of plan) {
      const r = await prisma.listing.findUnique({
        where: { listing_id: p.listing_id },
        select: { list_agent_full_name: true, list_office_name: true },
      });
      // Phase C: agent_info JSON is no longer written — verify the TYPED columns.
      const pass = !isBlank(r?.list_agent_full_name);
      ok = ok && pass;
      console.log(`  ${pass ? "✓" : "✗"} ${p.listing_id}: list_agent_full_name=${r?.list_agent_full_name ?? "(null)"}, list_office_name=${r?.list_office_name ?? "(null)"}`);
    }
    console.log(ok ? "\nVERIFY: all repaired rows now carry an agent name. ✓" : "\nVERIFY: FAILED — some rows still blank. ✗");
    if (!ok) process.exit(2);
  }
}

main()
  .catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
