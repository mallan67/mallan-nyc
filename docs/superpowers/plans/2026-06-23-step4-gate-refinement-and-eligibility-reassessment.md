# Step 4 — gate refinement + DROP eligibility reassessment (REPORT-ONLY)

> **Status: REPORT-ONLY. NOTHING EXECUTED / NO CODE CHANGED.** No SQL write, no DB write, no backfill, no producer change, no gate code change, no migration, no DROP, no reclaim, no snapshot, no downgrade. This document is a proposal + assessment for Maya's review.
> Date: 2026-06-23 · Board #415 · Supersedes the "typed_gap_rows=5 = data-loss BLOCKER" conclusion in `2026-06-23-agent-info-step4-preflight-verification-report.md` for the co-list fields, based on the live Cotality probe.
> Evidence: read-only DB precheck (`__phase-d-agent-info-precheck-2026-06-22.mjs --run`), read-only gap-row dump (`__phase-d-colist-gap-rows-2026-06-23.mjs --run`), read-only live probe (`__trestle-colist-probe-2026-06-23.mjs`).

---

## Part 1 — Gate refinement note (proposal; not implemented)

### The flaw in the current gate
The Step 4 data-safety gate computes `typed_gap_rows` as: **typed column blank AND frozen `agent_info` JSON has a value.** Its intent is "don't DROP the JSON while it holds attribution the typed columns lack." But the `agent_info` JSON was **frozen at Phase C** and is never updated again, while the typed columns are kept in sync with the **live Cotality feed** on every write. So once the live feed removes an (optional/volatile) field — e.g. a co-list agent — the typed column correctly goes null while the frozen JSON keeps the old value. The gate then reports a "gap" that is **not real data loss** — it is a **stale-JSON artifact** from comparing against the wrong reference.

Proven 2026-06-23: all 5 `typed_gap_rows` were co-list MLS, all 5 listings are live in Cotality, and **live co-list MLS = null for all 5** (typed matches live; only the frozen JSON is stale).

### Refined classification (3 buckets)
For any row where `typed` is blank AND frozen `JSON` has a value, probe the **live feed** for that listing and classify:

| Live feed value | Meaning | Gate verdict |
|---|---|---|
| **present** (matches/!=null) | typed is missing attribution the authoritative feed STILL has | 🟥 **REAL BLOCKER** — fix (typed write) before DROP |
| **blank/null** (listing in feed) | typed correctly mirrors live; frozen JSON is **stale** | 🟢 **NON-BLOCKING** stale-JSON exception (document) |
| **listing NOT returned by feed** | cannot confirm live truth (removed/withdrawn/expired) | 🟨 **FAIL-CLOSED** — treat as blocker / manual review until resolved |

Rule: **a typed-vs-JSON gap blocks the DROP only when the value is confirmed still live/current in Cotality.** Stale-JSON-only gaps are logged, not counted as data loss. Unverifiable rows fail closed (do not silently pass).

### Why this is safe (not a loosening of the 2026-04-30 ethos)
- It does **not** make a null-handling assumption from memory — it requires a **live-feed read** to reclassify each gap (independent proof per CLAUDE.md §J.4).
- It stays **fail-closed** for anything it cannot verify live.
- It only removes FALSE blockers (stale JSON the authoritative feed has already dropped); it still hard-blocks REAL loss (typed-blank while live-present).

### Implementation status
**Not implemented.** Proposed shape only: add a second pass to the precheck that, for the gap rows, runs the read-only live probe (as `__trestle-colist-probe-2026-06-23.mjs` did) and emits `real_gap_rows` (blocking) vs `stale_json_rows` (non-blocking) vs `unverifiable_rows` (fail-closed). **I will not modify the gate's pass/fail code without explicit Maya approval.**

### 5-row stale-JSON exception register (documented, non-blocking)
Frozen `agent_info` co-list values below are STALE (live Cotality = null on all; typed = null = matches live). DROP would not lose live attribution for these.

| DB id | listing_id | status (live) | frozen JSON co_office/agent | live co_office/agent | class |
|---|---|---|---|---|---|
| 9153 | RLS20059620 | Active | 7222 / 69374 | null / null | stale-JSON, non-blocking |
| 4263 | RLS20071852 | Pending | 10325 / 122771 | null / null | stale-JSON, non-blocking |
| 10412 | RLS20077185 | Active | 16355 / 93643 | null / null | stale-JSON, non-blocking |
| 33065 | RLS20080668 | Active | 16355 / 60901 | null / null | stale-JSON, non-blocking |
| 310304 | RLS20092526 | Active | 7222 / 36166 | null / null | stale-JSON, non-blocking |

---

## Part 2 — Step 4 DROP eligibility reassessment

### Data-safety verdict (refined)
- Primary 6 attribution fields: **0 gaps** (clean).
- Co-list MLS: 5 typed-vs-frozen-JSON gaps, **all reclassified NON-BLOCKING stale-JSON** by the live probe.
- **`real_gap_rows` (live-confirmed loss) = 0.** → the data-safety gate is **clear** under the refined logic, **for the current measurement**.

⚠️ Caveats: (1) this reflects a point-in-time measurement; a fresh read-only re-check is required immediately before DROP (the feed changes continuously). (2) The refined reclassification was performed manually for these 5; a pre-DROP re-run must re-probe any gap rows then-present and require `real_gap_rows = 0` with unverifiable rows = 0.

### Remaining required gates BEFORE any DROP (none done; all gated)
1. **Authenticated CRM render check** — `/crm/sale-view` + `/crm/rental-view` must visibly render agent/company typed-first while logged in as broker. **Needs Maya's session** (I cannot authenticate). OPEN.
2. **Final read-only pre-DROP report (refined logic)** — re-run the precheck; for every typed-vs-JSON gap then present, live-probe and require `real_gap_rows = 0` AND `unverifiable_rows = 0`. Re-confirm canonical host = cold-waterfall, agent_info column still present, and current sizes. NOT done.
3. **Pre-DROP Neon snapshot plan** — explicit point-in-time branch/snapshot of `br-crimson-frog-adr7g9gt` (hidden-mountain / cold-waterfall) taken immediately before the DROP, retained until the change is proven stable. Snapshot creation is **separately approved** (not in this doc). PLAN ONLY.
4. **Exact DROP SQL review** — `ALTER TABLE "listings" DROP COLUMN "agent_info";` (metadata-only, brief ACCESS EXCLUSIVE lock; does NOT free bytes — reclaim is a separate later step). DO NOT RUN.
5. **Maya's explicit approval** of that exact `ALTER TABLE … DROP COLUMN agent_info` statement.

### Out of scope of the DROP (separate, later, each gated)
- **Storage reclaim** (pg_repack / dump→fresh-branch; never VACUUM FULL on Neon) — DROP alone frees nothing; agent_info is ~39 MB of the 696 MB listings TOAST.
- **Launch→Free downgrade** — only after a post-reclaim re-measure proves <500 MB with margin AND the other JSON fronts + archive drain are resolved.

### Eligibility statement
On current evidence the co-list "blocker" is resolved (stale-JSON, non-blocking) and **`real_gap_rows = 0`**, so the DROP is **data-safety eligible pending**: (1) the authenticated CRM render check, (2) the final refined pre-DROP report, (3) the snapshot, (4) the exact-SQL review, and (5) Maya's explicit approval. **The DROP is NOT approved and must not be executed.**

---

## Hard stop
No SQL write · no DB write · no backfill · no producer code change · no gate code change · no migration · no DROP · no reclaim · no Neon downgrade · no snapshot unless separately approved. Report-only.
