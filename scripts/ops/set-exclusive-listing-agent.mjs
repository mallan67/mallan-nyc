// scripts/ops/set-exclusive-listing-agent.mjs
//
// OPS: set / change the ASSIGNED AGENT on a Mallan EXCLUSIVE listing, for ONE
// listing. No CRM UI exists for reassignment today (POST locks agent_id to the
// creator; PATCH preserves it) — this is the safe admin path.
//
// Writes (sourced from the selected Agent record — NO hardcoded person):
//   - agent_id              (FK → Agent)
//   - agent_info            (ListAgentFullName / ListOfficeName / ListAgentEmail /
//                            ListAgentDirectPhone overwritten to the new agent;
//                            other agent_info keys preserved)
//   - list_agent_full_name  (promoted column)
//   - list_office_name      (promoted column)
//
// Guard: ONLY operates on Mallan exclusives — listing_id prefix SL-/RL- OR
// rls_eligible === false. Third-party IDX/RLS rows are rejected (never restamp
// another brokerage's listing).
//
// Usage:
//   node scripts/ops/set-exclusive-listing-agent.mjs --listing=SL-0004 --agent=1
//   node scripts/ops/set-exclusive-listing-agent.mjs --listing=SL-0004 --agent-slug=maya-allan
//   node scripts/ops/set-exclusive-listing-agent.mjs --listing=SL-0004 --email=agent@mallan.nyc
//   node scripts/ops/set-exclusive-listing-agent.mjs --listing=SL-0004 --agent=1 --apply --verify
//
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const MALLAN_BROKERAGE_NAME = "Mallan Real Estate Inc.";

const args = process.argv.slice(2);
const arg = (n) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=").slice(1).join("=") : null; };
const LISTING = arg("listing");
const AGENT_ID = arg("agent");
const AGENT_SLUG = arg("agent-slug");
const EMAIL = arg("email");
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");

if (!LISTING) { console.error("ERROR: --listing=LISTING_ID is required."); process.exit(1); }
if (!AGENT_ID && !AGENT_SLUG && !EMAIL) { console.error("ERROR: one of --agent / --agent-slug / --email is required."); process.exit(1); }

try {
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
} catch (e) { console.error("Could not read .env.local:", e.message); process.exit(1); }

const prisma = new PrismaClient();
const isMallanExclusive = (l) => {
  const id = String(l.listing_id ?? "");
  return id.startsWith("SL-") || id.startsWith("RL-") || l.rls_eligible === false;
};

const clean = (v) => { const s = v == null ? "" : String(v).trim(); return s.length ? s : null; };

// Typed-FIRST resolution — mirrors lib/listings/agent-info-resolver.ts (typed column wins,
// agent_info JSON is fallback only). Phase C: the typed columns are the source of truth.
function resolveTypedFirst(l) {
  const j = (l.agent_info && typeof l.agent_info === "object") ? l.agent_info : {};
  return {
    agentMlsId: clean(l.list_agent_mls_id) ?? clean(j.ListAgentMlsId),
    officeMlsId: clean(l.list_office_mls_id) ?? clean(j.ListOfficeMlsId),
    coListOfficeMlsId: clean(l.co_list_office_mls_id) ?? clean(j.CoListOfficeMlsId),
    coListAgentMlsId: clean(l.co_list_agent_mls_id) ?? clean(j.CoListAgentMlsId),
  };
}

async function main() {
  console.log(`\n=== set-exclusive-listing-agent — ${APPLY ? "APPLY (writing)" : "DRY-RUN"} — listing=${LISTING} ===\n`);

  const listing = await prisma.listing.findUnique({
    where: { listing_id: LISTING },
    select: {
      listing_id: true, rls_eligible: true, agent_id: true,
      // Phase D step 2: agent_info select removed — resolveTypedFirst is typed-first + absent-safe.
      // Phase C: all 8 typed columns — the source of truth. The reassignment overwrites the
      // agent identity but PRESERVES the office / co-list MLS IDs (typed-first resolved).
      list_agent_full_name: true, list_office_name: true,
      list_agent_email: true, list_agent_direct_phone: true,
      list_office_mls_id: true, list_agent_mls_id: true,
      co_list_office_mls_id: true, co_list_agent_mls_id: true,
    },
  });
  if (!listing) { console.error(`ERROR: listing ${LISTING} not found.`); process.exit(2); }
  if (!isMallanExclusive(listing)) {
    console.error(`ERROR: ${LISTING} is NOT a Mallan exclusive (no SL-/RL- prefix and rls_eligible !== false). Refusing to restamp a third-party IDX/RLS listing.`);
    process.exit(2);
  }

  // Resolve the agent.
  const where = AGENT_ID ? { id: BigInt(AGENT_ID) } : AGENT_SLUG ? { public_slug: AGENT_SLUG } : { email: EMAIL };
  const agent = await prisma.agent.findUnique({
    where,
    select: { id: true, full_name: true, first_name: true, last_name: true, email: true, phone: true, public_slug: true, trestle_mls_id: true },
  });
  if (!agent) { console.error(`ERROR: agent not found (${JSON.stringify(where, (k, v) => (typeof v === "bigint" ? v.toString() : v))}).`); process.exit(2); }

  const fullName = (agent.full_name || "").trim() ||
    [agent.first_name, agent.last_name].map((p) => (p || "").trim()).filter(Boolean).join(" ").trim();

  // Phase C: resolve the existing typed identity (typed-first) so the reassignment can
  // PRESERVE the office / co-list MLS IDs (not derivable from the Agent) instead of nulling
  // them from a retired/empty agent_info. Mirrors lib/listings/repair-exclusive-plan.ts
  // (planExclusiveReassignment), the unit-tested canonical source.
  const resolved = resolveTypedFirst(listing);
  // Intentional reassignment: overwrite agent identity from the chosen Agent; the new agent's
  // MLS id wins when present, else preserve existing. Office / co-list MLS IDs are preserved.
  const typed = {
    list_agent_full_name: fullName,
    list_office_name: MALLAN_BROKERAGE_NAME,
    list_agent_email: clean(agent.email),
    list_agent_direct_phone: clean(agent.phone),
    list_agent_mls_id: clean(agent.trestle_mls_id) ?? resolved.agentMlsId,
    list_office_mls_id: resolved.officeMlsId,
    co_list_office_mls_id: resolved.coListOfficeMlsId,
    co_list_agent_mls_id: resolved.coListAgentMlsId,
  };

  console.log("Listing (before):");
  console.log(`  agent_id=${listing.agent_id?.toString() ?? "(null)"}  list_agent_full_name=${listing.list_agent_full_name ?? "(null)"}  list_office_name=${listing.list_office_name ?? "(null)"}`);
  console.log(`  typed MLS IDs (preserved): office=${resolved.officeMlsId ?? "(null)"} agent=${resolved.agentMlsId ?? "(null)"} coOffice=${resolved.coListOfficeMlsId ?? "(null)"} coAgent=${resolved.coListAgentMlsId ?? "(null)"}`);
  console.log("\nNew agent:");
  console.log(`  id=${agent.id.toString()}  name="${fullName}"  email=${agent.email}  phone=${agent.phone}  slug=${agent.public_slug}  trestle_mls_id=${agent.trestle_mls_id ?? "(null)"}`);
  console.log("\nListing (after):");
  console.log(`  agent_id=${agent.id.toString()}  list_agent_full_name="${typed.list_agent_full_name}"  list_office_name="${typed.list_office_name}"`);
  console.log(`  email="${typed.list_agent_email ?? "(null)"}" phone="${typed.list_agent_direct_phone ?? "(null)"}" agent_mls=${typed.list_agent_mls_id ?? "(null)"} office_mls=${typed.list_office_mls_id ?? "(null)"} (MLS preserved typed-first)`);

  if (!APPLY) { console.log("\nDRY-RUN only — no rows written. Re-run with --apply to write."); return; }

  await prisma.listing.update({
    where: { listing_id: LISTING },
    data: {
      agent_id: agent.id,
      // Phase C: agent_info JSON no longer persisted. Write only the typed columns;
      // office / co-list MLS IDs are preserved typed-first (never nulled on reassignment).
      ...typed,
    },
  });
  console.log(`\n✓ Applied. ${LISTING} assigned to ${fullName} (agent_id=${agent.id.toString()}).`);

  if (VERIFY) {
    // Phase C: agent_info JSON is no longer written — verify the TYPED columns
    // (the source of truth post-Phase-C), not the retired agent_info JSON.
    const r = await prisma.listing.findUnique({ where: { listing_id: LISTING }, select: { agent_id: true, list_agent_full_name: true, list_office_name: true } });
    const ok = r?.agent_id?.toString() === agent.id.toString() && r?.list_agent_full_name === fullName;
    console.log(`\nVERIFY: agent_id=${r?.agent_id?.toString()} list_agent_full_name="${r?.list_agent_full_name}" list_office_name="${r?.list_office_name}" → ${ok ? "✓ PASS" : "✗ FAIL"}`);
    if (!ok) process.exit(3);
  }
}

main()
  .catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
