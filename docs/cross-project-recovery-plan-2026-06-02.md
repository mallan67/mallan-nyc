# Cross-project DB recovery plan — 2026-06-02 (PLAN ONLY — HELD pending Maya approval)

> **Status: PLAN ONLY. Nothing executed.** No `DATABASE_URL`/env/credential/migration/Neon/
> Vercel change; no `rotate-db-keys`; no Connect button. Each step below runs only after Maya
> approves it. The production env change (Step 4) is the exact surface that caused the incident —
> it must be precise + documented, not a manual copy-paste guess.

## Confirmed facts (measured this session)
- **Root cause:** production's `DATABASE_URL` points at **A = `morning-bread-68708332` / royal-dawn**
  (Free), which lacks `agents.trestle_mls_id` → Prisma **P2022** → agent routes 500. Direct DB read
  (BLOCK 0) confirms: `has_trestle_mls_id_col = false`, `crm_exclusives = 0`, branch `br-old-tree-admdlb9z`.
- **Canonical data lives on B = `hidden-mountain-87248164` / cold-waterfall** (Launch): 105,697 listings,
  4 exclusives, `trestle_mls_id` present, audit history to Jun-1 06:31Z.
- **Cutover instant:** 2026-06-01 06:35:23Z (rotation rewrote prod env; gh-secret timestamp + rotation log).
- **Orphan tail on A (rows after 2026-06-01 06:30Z):** **only** `audit_events` = **44,418** (latest
  2026-06-02 11:20:41) + `geocode_cache` = 26 (re-derivable). **Zero** new `leads / inquiries / sessions /
  deals / client_preferences / comments / family_members / agents`. → **no business/customer data is split.**
- **Cotality match verified (read-only):** `trestle_mls_id = 39361` → Cotality `Member` = **Maya Allan
  (Active)**; `Property ListAgentMlsId eq '39361'` = 1 active + 34 closed. The id is correct and live.
- A also holds ~20,774 **pre-cutover** `audit_events` from an earlier period (A total 65,192) that are not on
  B — a *separate* archival question (see §Follow-ups), NOT part of this fix.

---

## Recovery steps (execute only on explicit per-step approval)

### Step 0 — Pre-flight (read-only)
- Confirm, read-only, which `DATABASE_URL` host Vercel **Production** currently resolves to (expect
  `ep-royal-dawn-ad6eh8t2`). Look only; do not edit.
- Compare `audit_events` **column lists** on A vs B (A is older schema — columns may differ). Record the
  **shared** column set and B's surrogate PK + any NOT-NULL/FK columns. This drives Step 1's column map.
- Identify an idempotency key on `audit_events` (a `uuid`/natural event id if present) for safe re-runs.

### Step 1 — Preserve the audit_events tail (A → B)  [WRITE to B — compliance table; needs approval + §G gate]
- **Export from A (royal-dawn), read-only:**
  `\copy (SELECT <shared cols EXCEPT surrogate id> FROM audit_events
          WHERE created_at > timestamptz '2026-06-01 06:30:00+00') TO 'audit_tail.csv' CSV HEADER`
  → 44,418 rows.
- **Import into B (cold-waterfall):**
  `\copy audit_events (<same shared cols>) FROM 'audit_tail.csv' CSV HEADER`
  - **Omit the surrogate `id`** so B's sequence assigns fresh ids (A's tail ids overlap B's id range →
    importing ids verbatim would collide). All data columns incl. `created_at` are preserved.
  - If `audit_events` has an idempotency key, load via a staging table + `INSERT … ON CONFLICT DO NOTHING`
    so a re-run can't double-insert.
  - If `audit_events` has enforced FKs to rows absent on B, either map them or import with the FK
    deferred/validated-after; prefer preserving the actor reference as-is if it's a plain id/string.
- **Verify:** B `audit_events` count rises by exactly 44,418 (or 44,418 minus dedup); spot-check min/max
  `created_at` of the imported slice = 06:35Z…11:20Z.
- Mechanics reference: `docs/royal-dawn-reconciliation-plan-2026-06-02.md` (now cross-project).

### Step 2 — geocode_cache (26 rows): SKIP
- Re-derivable lookup cache; repopulates on demand after cutover. Not preserved. (Listings/media likewise
  re-sync from Cotality — not copied.)

### Step 3 — Compliance gate before touching production
- Run §G: `npm run type-check`, `rls:validate`, `compliance-check`, `ucba:audit`, `idx:validate`
  (+ `crm:test` if `public/crm/**`). All exit 0. Invoke the **rebny-compliance** skill. The redeploy is a
  production deployment → this gate is mandatory.

### Step 4 — Repoint production to cold-waterfall  [the incident-causing surface — precise + documented]
Set the **three** production env vars to **cold-waterfall** (hidden-mountain) values:
`DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), `ASSISTANT_DATABASE_URL` (pooled).
- **Target host:** `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech` (pooled) /
  `ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech` (direct), db `neondb`.
- **Source of values (do NOT hand-type a password):** pull a fresh `connection_uri` from the
  **hidden-mountain** Neon project (pooled + direct), OR reuse the exact values already in local
  `.env.local` (which point at cold-waterfall and are known-good this session).
- **Do NOT use `rotate-db-keys`** — it is hardwired to `PROJECT_ID = morning-bread` and would re-push
  royal-dawn. **Do NOT click "Connect"** on the integration blindly.
- Recommended mechanism: a **controlled, documented Vercel Production env update** (per NEON.md), changing
  only those 3 keys. (Note: the hidden-mountain integration manages lowercase `POSTGRES_*`; the app reads
  the uppercase `DATABASE_URL`, so the uppercase trio must be set explicitly to cold-waterfall.)
- Record old → new host in the change log before saving.

### Step 5 — Redeploy production
- Trigger a production redeploy so the new env takes effect (forceNew). No code change required.

### Step 6 — Verify (live, read-only)
- `/api/health` → 200
- `/api/agents/maya-allan/listings` → **200 + listings** (≈1 active IDX + exclusives, 34 closed)
- `/api/agents/julia-djaafar/listings` → 200 (name-fallback)
- `/api/listings?type=sale&limit=6` / `?type=rent&limit=6` → 200 with the **full** catalog (105k-backed), not 34
- Company exclusives + Featured sale/rental surfaces populated; `SL-0004` visible.
- Confirm new `audit_events` are again writing to cold-waterfall (history resumes on B).

### Step 7 — Lock it down (so it can't recur)
- **Disable `rotate-db-keys`** (remove the schedule / `workflow_dispatch`-only) — it targets the wrong
  project. If kept, apply the **host-guard patch** (`docs/rotate-db-keys-host-guard-patch-2026-06-02.md`)
  AND retarget `PROJECT_ID`/endpoint to hidden-mountain/cold-waterfall. Prefer letting the
  Vercel-Neon integration own hidden-mountain credentials.
- **Correct the docs** (HELD): `CLAUDE.md §B`, `NEON-VERCEL-OWNERSHIP-MAP.md`, `NEON.md §11` — they call
  morning-bread "production" and conflate cold-waterfall's project. Mark **hidden-mountain/cold-waterfall =
  production canonical**, **morning-bread/royal-dawn = stale / do-not-serve**.

---

## Rollback / stop conditions
- If Step 1 verify count is off, or `audit_events` schemas don't reconcile → STOP, do not repoint.
- If Step 0 shows production is NOT on royal-dawn → STOP, re-diagnose.
- If post-repoint (Step 6) any agent/listing endpoint still errors → revert the 3 env vars to the prior
  (royal-dawn) values + redeploy (instant rollback; cold-waterfall + the copied tail remain intact).
- Neon 7-day PITR covers both projects throughout — underlying safety net.
- No step proceeds without Maya's explicit approval for that step.

## Follow-ups (not blocking the fix)
- ~20,774 **pre-cutover** `audit_events` exist only on A (earlier-period history). Decide separately
  whether to archive them into B for a unified retention trail.
- Backfill `trestle_mls_id` for other agents (e.g., Julia) if/when they should match by id rather than name.
- After stabilization, reconcile the Free `morning-bread` project's role (decommission vs. keep as cold spare).

---
*Plan only. No data/schema/branch/credential/env change. Author: Claude (Opus 4.8), 2026-06-02.*
