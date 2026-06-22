// Backfill Cotality agent identity onto CRM-owned Mallan exclusive listings.
//
// HISTORICAL: this one-time script USED to fill blank Cotality identity fields on
// CRM-owned rows (listing_id prefix SL-/RL- OR agent_id != null) from the owning
// Agent record, writing listing.agent_info (JSON) + the promoted columns.
//
// ── RETIRED + HARD-DISABLED (agent_info Phase C → Phase D code-prep) ─────────────
// - Phase C (#420): no producer may write/refill agent_info JSON.
// - Phase D step 2 (#427): runtime/ops code no longer SELECTs agent_info at all.
//   With agent_info unselected, this script's old --apply path would compute the
//   typed write payload from an EMPTY agent_info and could NULL existing typed
//   attribution (list_agent_direct_phone / list_office_mls_id / co_list_* MLS IDs)
//   on CRM-owned listings (Codex #427). That is a data-loss foot-gun.
//
// It is therefore HARD-DISABLED: fail-closed UNCONDITIONALLY, with NO environment
// flag and NO reachable write path (no Prisma import, no --apply, no DB connection).
// Agent identity now lives in the typed columns (list_agent_*). For any attribution
// repair, use the typed-first tools instead:
//   - scripts/ops/repair-exclusive-agent-assignment.mjs  (blank-only fill, typed-first)
//   - scripts/ops/set-exclusive-listing-agent.mjs         (reassign, preserves MLS IDs)
//
// Do NOT revive this script. If a future need arises, write a NEW typed-columns-only
// tool with a dry-run default and explicit Maya approval — never refill agent_info.

console.error(
  "[RETIRED] backfill-crm-exclusive-cotality-identity.mjs is retired and HARD-DISABLED.\n" +
    "It is NOT Phase-D safe: its old write path could NULL existing typed attribution.\n" +
    "There is no --apply path and no environment flag that can re-enable it.\n" +
    "Do NOT use it for attribution repair. Use the typed-first tools instead:\n" +
    "  scripts/ops/repair-exclusive-agent-assignment.mjs  (blank-only fill)\n" +
    "  scripts/ops/set-exclusive-listing-agent.mjs         (reassign)\n" +
    "See docs/superpowers/plans/2026-06-21-agent-info-phase-c-stop-json-writes.md",
);
process.exit(2);
