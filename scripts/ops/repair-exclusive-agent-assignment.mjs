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

// Faithful copy of mergeBlankOnly from lib/listings/exclusive-agent-assignment.ts:
// write a key ONLY when base has no non-empty value (manual values win).
function fillBlankOnly(base, additions) {
  const out = { ...base };
  for (const [k, v] of Object.entries(additions)) {
    if (v == null || v === "") continue;
    if (isBlank(out[k])) out[k] = v;
  }
  return out;
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
      agent_info: true, list_agent_full_name: true, list_office_name: true,
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
    const existing = (l.agent_info && typeof l.agent_info === "object") ? l.agent_info : {};
    const nameAlready = !isBlank(existing.ListAgentFullName);
    const colAlready = !isBlank(l.list_agent_full_name);
    if (nameAlready && colAlready) continue; // already correct — leave it

    const agent = await prisma.agent.findUnique({
      where: { id: l.agent_id },
      select: { id: true, full_name: true, first_name: true, last_name: true, email: true, phone: true },
    });
    if (!agent) {
      console.log(`SKIP  ${l.listing_id}: agent_id=${l.agent_id} has no Agent row.`);
      continue;
    }
    const fullName = (agent.full_name || "").trim() ||
      [agent.first_name, agent.last_name].map((p) => (p || "").trim()).filter(Boolean).join(" ").trim();
    const desiredInfo = fillBlankOnly(existing, {
      ListAgentFullName: fullName,
      ListOfficeName: MALLAN_BROKERAGE_NAME,
      ListAgentEmail: (agent.email || "").trim(),
      ListAgentDirectPhone: (agent.phone || "").trim(),
    });
    const newCol = String(desiredInfo.ListAgentFullName ?? fullName);
    const newOffice = String(desiredInfo.ListOfficeName ?? MALLAN_BROKERAGE_NAME);

    plan.push({
      listing_id: l.listing_id, status: l.status, agent_id: l.agent_id.toString(),
      before: { name: existing.ListAgentFullName ?? "(missing)", col: l.list_agent_full_name ?? "(null)", office_col: l.list_office_name ?? "(null)" },
      after: { name: desiredInfo.ListAgentFullName, col: newCol, office_col: newOffice },
      desiredInfo, newCol, newOffice,
    });
  }

  if (plan.length === 0) {
    console.log("No listings need repair. (All Mallan exclusives already carry an agent name.)");
    return;
  }

  console.log(`Candidates needing repair: ${plan.length}\n`);
  for (const p of plan) {
    console.log(`• ${p.listing_id} (status=${p.status}, agent_id=${p.agent_id})`);
    console.log(`    agent_info.ListAgentFullName : "${p.before.name}"  →  "${p.after.name}"`);
    console.log(`    list_agent_full_name (col)   : ${p.before.col}  →  ${p.after.col}`);
    console.log(`    list_office_name (col)       : ${p.before.office_col}  →  ${p.after.office_col}`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN only — no rows written. Re-run with --apply to write.`);
    return;
  }

  console.log(`\nApplying ${plan.length} update(s)...`);
  for (const p of plan) {
    await prisma.listing.update({
      where: { listing_id: p.listing_id },
      data: {
        agent_info: p.desiredInfo,
        list_agent_full_name: p.newCol,
        list_office_name: p.newOffice,
      },
    });
    console.log(`  ✓ ${p.listing_id} updated.`);
  }

  if (VERIFY) {
    console.log(`\nVerifying...`);
    let ok = true;
    for (const p of plan) {
      const r = await prisma.listing.findUnique({
        where: { listing_id: p.listing_id },
        select: { agent_info: true, list_agent_full_name: true, list_office_name: true },
      });
      const nm = (r?.agent_info && typeof r.agent_info === "object") ? (r.agent_info.ListAgentFullName || "") : "";
      const pass = !isBlank(nm) && !isBlank(r?.list_agent_full_name);
      ok = ok && pass;
      console.log(`  ${pass ? "✓" : "✗"} ${p.listing_id}: agent_info.ListAgentFullName="${nm}", list_agent_full_name=${r?.list_agent_full_name ?? "(null)"}, list_office_name=${r?.list_office_name ?? "(null)"}`);
    }
    console.log(ok ? "\nVERIFY: all repaired rows now carry an agent name. ✓" : "\nVERIFY: FAILED — some rows still blank. ✗");
    if (!ok) process.exit(2);
  }
}

main()
  .catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
