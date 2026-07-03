# agent_info Phase D — STEP 4 pre-flight verification + DROP/reclaim planning (REPORT-ONLY)

> **Status: REPORT-ONLY. NOTHING EXECUTED.** No SQL run, no DB write, no migration, no DROP, no reclaim, no Neon downgrade. All SQL below is **DO NOT RUN** — gated on explicit Maya approval of the *exact* statement.
> Date: 2026-06-23 · Author: Claude (Opus 4.8) · Board: GitHub #415 · Supersedes nothing (companion to `docs/superpowers/plans/2026-06-21-agent-info-phase-d-drop-reclaim.md`).
> Canonical target DB: project `hidden-mountain-87248164` ("neon-green-school") · endpoint `ep-cold-waterfall-adno3ao2` · branch `main` (`br-crimson-frog-adr7g9gt`). Any Step 4 SQL MUST be host-guarded to cold-waterfall.

Verification-type legend: **[repo]** source/test verified · **[live]** production probe (read-only HTTP / Vercel API) · **[last-known]** prior read-only precheck figure, needs fresh read-only re-measure · **[needs-DB]** requires a read-only production query gated on Maya · **[needs-auth]** requires Maya's logged-in broker session.

---

## The 10 questions

### 1. Is production definitely on commit `a5040eb`?
**YES — verified [live].** Vercel deployment `dpl_FVCHynY7DHiNyDp3dTgx8DbnMbD9`: `state=READY`, `target=production`, `githubCommitSha=a5040eb54b208995a1382e655c3247f33273c1a2`, aliases `mallan.nyc` / `www.mallan.nyc`. `origin/main` HEAD = `a5040eb5` (squash merge of PR #429). Re-confirm at execution time: `get_deployment` + `/api/health` 200 + current production alias points at this deployment.

### 2. Does public listing/detail still render attribution?
**YES — verified [live].** `/listing/217-w-57th-street-apt-127-128-...-rls20059088` → HTTP 200, "Mallan Real Estate Inc." rendered. This path runs `app/listing/[...slug]/page.tsx` → `resolveListingAgentInfo(dbListing)` (typed-first, "Mallan Real Estate Inc." fallback) with `agent_info` absent from the client → **no crash**. Public `/api/listings` → 200 and correctly omits agent PII (public DTO boundary intact). Runtime logs: **zero** `error`/`fatal`, **zero** `agent_info` mentions in the 20m post-deploy window.

### 3. Does the CRM sale/rental viewer render typed attribution under auth?
**NOT YET VERIFIED — [needs-auth].** Routes respond cleanly unauthenticated (`/crm/sale-view` 307 redirect, `/api/crm/listings/[id]` 401 — **not 500**, so no `agent_info` crash on load). Strong indirect proof: client reads typed-first in both viewer blocks; GET pins `list_agent_full_name`/`list_office_name`; regression test `tests/runtime/crm-sale-with-tools-typed-first.test.ts` green; full runtime 2308/2308; Codex re-review "no major issues 👍". **Remaining gap:** the live *authenticated render* on `/crm/sale-view` + `/crm/rental-view` — Maya must open a listing while logged in as broker and confirm agent/company display populated. **This is a hard pre-DROP gate** (the viewer is the last consumer that depended on the JSON).

### 4. Does production still have the physical `listings.agent_info` column?
**EXPECTED YES (intentional schema↔DB drift) — [repo] strong, [needs-DB] to confirm.** No DROP was ever performed: the Phase D STEP 3 checkpoint migration is comment-only / no-DDL, and the guard test `tests/runtime/phase-d-no-runtime-agent-info-select.test.ts` asserts **no DROP migration for agent_info exists**. The Prisma *client* no longer knows the field; the *physical column* remains.
**Confirm before DROP (DO NOT RUN without approval, read-only, host-guarded to cold-waterfall):**
```sql
-- read-only
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'listings' AND column_name = 'agent_info';
```

### 5. What is the current DB size?
**~1364 MB [last-known] (read-only precheck, 2026-06-22; per HANDOFF/#415).** Context: project is on the **Launch** plan (NEON.md §1) — storage cap **10 GB**, so ~13% of the Launch cap (no storage emergency). It is ~273% of the **Free** 500 MB cap, which is the P2-MONEY downgrade target. **Re-measure before Step 4 (DO NOT RUN without approval, read-only):**
```sql
-- read-only
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
```
**Caveat (do not overstate):** `agent_info` alone (~39 MB) will NOT get the DB under 500 MB. The other five JSON fronts (`raw_data` ~267 / `compliance` ~201 / `features` ~101 / `address` ~34 / `media` ~6 MB) + the archive drain (~390 MB, currently OFF) remain. Step 4 is necessary-not-sufficient for the downgrade.

### 6. What is the current `agent_info` logical size?
**~38–39 MB logical [last-known] (precheck, 2026-06-22).** **Re-measure before Step 4 (DO NOT RUN without approval, read-only):**
```sql
-- read-only
SELECT pg_size_pretty(sum(pg_column_size(agent_info))) AS agent_info_logical
FROM listings;
-- plus table/TOAST/index footprint to size the real reclaim:
SELECT pg_size_pretty(pg_total_relation_size('listings')) AS listings_total,
       pg_size_pretty(pg_relation_size('listings'))       AS listings_heap;
```

### 7. What exact snapshot is required before the DROP?
A **Neon point-in-time branch/snapshot of the production branch `br-crimson-frog-adr7g9gt`** (project `hidden-mountain-87248164` / cold-waterfall), taken **immediately before** the DROP, created via the Neon Console/API (NOT from a stale/wip git branch — NEON.md §10/§11). Rationale: this explicit snapshot is the **only** path to recover the JSON after the DROP. Launch PITR is **7 days** (NEON.md §2) but ages out — the explicit snapshot must be **retained until the downgrade is proven stable**. (Mirrors the 2026-06-02 cross-project rescue.) Snapshot creation is itself a gated action (separate approval).

### 8. What exact DROP SQL would be proposed?
**DO NOT RUN — proposal only, gated on explicit approval of this exact statement:**
```sql
-- DO NOT RUN — Step 4, host-guarded to cold-waterfall, AFTER snapshot
ALTER TABLE "listings" DROP COLUMN "agent_info";
```
Metadata-only, fast, brief `ACCESS EXCLUSIVE` lock. **It does NOT free the bytes** — old values persist in each heap tuple until the row is rewritten (see Q10). Must run only after: (a) Q3 authenticated CRM render confirmed, (b) Q4 column-exists confirmed, (c) Q6 `typed_gap_rows = 0` re-confirmed (the data-safety gate — any per-field gap > 0 BLOCKS the DROP), (d) snapshot taken, (e) host proven = cold-waterfall.

### 9. What rollback option exists?
- **Primary (only JSON-recovery path post-drop):** restore/repoint to the **pre-drop Neon snapshot** from Q7.
- **App-code rollback:** revert the Phase D code — valid **only while the column still exists**; after the DROP the re-added selects would error, so an app rollback must pair with a snapshot restore.
- **Neon PITR (7-day):** usable only before the window ages out.
- **Emergency-stop conditions (→ STOP, restore snapshot):** `typed_gap_rows` > 0; host ≠ cold-waterfall; reclaim lock exceeds window; post-reclaim size not below target; any reader 500 in post-deploy smoke.

### 10. What will be measured after DROP/reclaim?
- Re-run Q5/Q6 size queries: DB size, `listings` heap/TOAST/total, and confirm the column is gone (Q4 query returns 0 rows).
- **Reclaim is a separate step** — `DROP COLUMN` alone frees nothing. Options (pick by the Q6 numbers; NEON.md: **never `VACUUM FULL` on Neon**):
  - **A. `pg_repack`** — online rewrite, brief locks, full reclaim; *requires confirming `pg_repack` is available on Neon Launch.*
  - **C. `pg_dump` → restore into a fresh Neon branch → repoint `DATABASE_URL`** — guaranteed-minimal footprint; heaviest; the env-var repoint is a **HELD** area (mirrors 2026-06-02 rescue).
  - **D. passive (autovacuum + Neon retention aging)** — zero-touch, slow/uncertain; bytes persist until pages age out of PITR.
- Account for **PITR retention-lag** (reclaimed bytes still counted until the snapshot/retention window passes).
- Full post-deploy smoke (no reader 500s; public + authenticated CRM).
- **Downgrade decision is separate:** propose Launch→Free **only** if a post-reclaim re-measure proves DB < 500 MB **with margin**, AND the other 5 JSON fronts + archive drain are resolved, AND the Vercel false-branch-limit ticket is cleared.

---

## Bottom line
Phase D is **code-ready and deployed** (STEP 3 live; readers typed-first/absent-safe; resolver survives the drop). STEP 4 (snapshot → DROP → reclaim) is **NOT started** and remains fully gated. Before any DROP, the open items are: **Q3 authenticated CRM render confirmation [needs-auth]** and the **Q4/Q5/Q6 read-only production re-measures [needs-DB]** (incl. the `typed_gap_rows = 0` data-safety gate). No DROP until Maya explicitly approves the exact `ALTER TABLE … DROP COLUMN agent_info` operation.
