# Neon Console topology verification — 2026-06-02 (REPORT ONLY / READ-ONLY)

> **Status: READ-ONLY GUIDE. Nothing here changes data, schema, branches, endpoints,
> credentials, `DATABASE_URL`, or Vercel.** This is the click-path to resolve the one
> unresolved linchpin — *are `cold-waterfall` and `royal-dawn` the same Neon branch or
> different branches?* — and to size any royal-dawn-only writes BEFORE any cutover.
> Do **not** change `DATABASE_URL`, rotate keys, run migrations, or repoint production
> until topology is confirmed. Preview project `neon-green-school` / `hidden-mountain-87248164`
> must not be touched.

## Why this is the decisive step
Production `/api/agents/[slug]/listings` 500s because `prisma.agent.findFirst({ select:{ trestle_mls_id }})`
(route line 28) reads a column that is absent on the branch production currently serves → Prisma **P2022**.
The Cotality call is downstream and `.catch`-guarded — it cannot cause the 500. `/api/listings` returns 200,
so prod's branch HAS listings; it is **schema drift (missing column), not an empty branch.**

`NEON-VERCEL-OWNERSHIP-MAP.md:178` + diagram :327–329 claim cold-waterfall and royal-dawn are **two endpoints
on the same `main` branch.** Endpoints on one branch share storage → identical schema/data. That is physically
incompatible with the observed divergence (one has `trestle_mls_id` + 4 exclusives, one doesn't). One of the docs
or assumptions is therefore wrong. **The branch view below is what settles it.**

---

## 1. Exact click path to identify branch/endpoint topology

1. Open **console.neon.tech** → sign in.
2. **Select the PRODUCTION project:** `morning-bread-68708332`.
   - Confirm the project id in the URL / project **Settings → General**.
   - The breadcrumb must **NOT** read `neon-green-school` or `hidden-mountain-87248164` (that's preview).
3. Left sidebar → **Branches**.
   - This table lists every branch with: **Branch name**, **Branch ID** (`br-…`), a **Default** (a.k.a. primary)
     badge on exactly one branch, **Created**, **Data size**, and the **compute endpoint(s)** attached.
4. Click into **each branch** → the branch detail page shows its **Computes / compute endpoints**: each has an
   **Endpoint ID** (`ep-…`), the **host** (`ep-…-pooler.c-2.us-east-1.aws.neon.tech`), type (RW / RO replica),
   and state (idle/active).
5. (Corroboration) Left sidebar → **Operations** (or **Monitoring → Operations**). Filter to **2026-06-01,
   ~05:00–06:40 UTC**. Look for the rotation's **"Reset role password"** / **"Apply config"** operations and note
   **which branch / endpoint** they ran against — that is the branch the Jun-1 rotation targeted = what production
   serves now.

---

## 2. Values / screenshots to capture

From the **Branches** page (one screenshot of the full list) + each branch detail, record:

| Field | cold-waterfall side | royal-dawn side |
|---|---|---|
| Endpoint ID (`ep-…`) | `ep-cold-waterfall-adno3ao2` (expected) | `ep-royal-dawn-ad6eh8t2` (expected) |
| Host | | |
| **Branch ID (`br-…`) the endpoint is attached to** | | (transcript suspected `br-old-tree-admdlb9z`) |
| Branch name | | |
| Is this branch **Default/primary**? | | |
| Branch **created** date | | |
| Branch **data size** | | |

Also capture:
- The **Operations** entries for the Jun-1 ~05:00–06:35Z rotation (which branch/endpoint).
- BLOCK 0 result, BLOCK 3b generated-SQL + its output, and BLOCK 4 counts (Steps 4–5 below).

---

## 3. Same branch or different branches? (the one question that decides the fix)

A Neon **compute endpoint attaches to exactly one branch.** So:

- **If `ep-cold-waterfall-adno3ao2` and `ep-royal-dawn-ad6eh8t2` are listed under the SAME branch ID**
  → they share storage → identical schema/data → the "wrong branch" theory is **wrong**; the 500 must have a
  different cause (re-examine — do NOT cut over). The ownership map would be correct and something else changed.
- **If they are under DIFFERENT branch IDs** → they can and do diverge → the prior hypothesis holds: production is
  bound to the stale branch (royal-dawn's) that never received the `trestle_mls_id` `db push`. The ownership map
  is stale. Proceed to size orphan writes (Step 5).

> The **branch view is authoritative** for this — more than the SQL fingerprint, because the SQL Editor connects by
> *branch*, so if both endpoints share one branch the fingerprint can't tell them apart. Capture the branch-ID per
> endpoint explicitly.

---

## 4. Which BLOCK 0 query to run first

Left sidebar → **SQL Editor**. Top selectors:
- **Branch** = the branch `ep-royal-dawn-ad6eh8t2` is attached to (from Step 3). If they share a branch, you can
  only inspect that one shared branch.
- **Database** = `neondb` (the `mallandb` label may be a display name; `current_database()` in BLOCK 0 will echo
  the real name — pick the database that exists).
- **Role** = `neondb_owner` (read-only intent; BLOCK 0 only SELECTs).

Paste **BLOCK 0 only** from `docs/royal-dawn-console-query-pack-2026-06-02.sql` and run:

```sql
SELECT
  current_database() AS db, current_user AS usr, now() AS server_now, version() AS pg_version,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='agents' AND column_name='trestle_mls_id') AS has_trestle_mls_id_col,
  (SELECT count(*) FROM listings WHERE listing_id LIKE 'SL-%' OR listing_id LIKE 'RL-%') AS crm_exclusives;
SELECT current_setting('neon.branch_id', true) AS neon_branch_id_guc;  -- may be blank; that's fine
```

---

## 5. How to interpret BLOCK 0

| BLOCK 0 result | Meaning | Action |
|---|---|---|
| `has_trestle_mls_id_col = false` **and** `crm_exclusives = 0` | You're on the **stale** branch (royal-dawn) | Continue: run BLOCK 3b + BLOCK 4 to size orphan writes |
| `has_trestle_mls_id_col = true` **and** `crm_exclusives = 4` | You're on **cold-waterfall** OR it's one shared branch | **STOP & reassess** — the wrong-branch theory would be disproven |
| anything else / `neon_branch_id_guc` unexpected | ambiguous | **STOP** — capture it and report; do not proceed |

If royal-dawn is confirmed stale, run the orphan-set sizer (BLOCK 3b — paste the generated SQL it emits — and the
explicit BLOCK 4 counts) for rows **after `2026-06-01 06:30:00+00`**. Prioritize compliance/business tables:
`audit_events`, `leads`, `inquiries`, consent tables, seller/rental intake, `sessions`,
`documents`/`document_signatures`, `offers`.
- **All zero** → cutover is much easier (only re-derivable IDX/media sync diverged → self-heals).
- **Any rows > 0** → those live only on royal-dawn → **CUTOVER BLOCKED** until exported/replayed into cold-waterfall.

---

## 6. What NOT to click (read-only discipline)

- ❌ **Reset** / "Reset from parent" on any branch (destroys the branch's data — overwrites with parent).
- ❌ **Delete branch** / delete endpoint / suspend endpoint.
- ❌ **Set as default** / change which branch is primary.
- ❌ **Restore** / PITR restore (mutates state).
- ❌ **Reset password** / rotate any role (would itself trigger a credential change).
- ❌ Any `INSERT` / `UPDATE` / `DELETE` / `ALTER` / `DROP` / `CREATE` in the SQL Editor — **SELECT only**.
- ❌ Anything inside the **`neon-green-school` / `hidden-mountain-87248164`** preview project.
- ❌ Reconnect/modify the **Vercel ↔ Neon integration**; don't edit Vercel env. (Viewing the prod `DATABASE_URL`
  *host* read-only to confirm which endpoint it names is OK — but do not edit or re-save it.)

---

## 7. Stop conditions before any cutover

Hard-stop and report (do **not** change `DATABASE_URL`, rotate, migrate, or repoint) if **any** of these:

1. Branch topology is **ambiguous** or can't be determined.
2. BLOCK 0 on the suspected royal-dawn branch shows **column present + 4 exclusives** (same-storage signal).
3. The branch flagged **Default/primary** turns out to be the **cold-waterfall** branch, not royal-dawn (then the
   mispointing model needs rethinking — the rotation would have resolved the *right* primary).
4. **Any** compliance/business table has **rows after 2026-06-01 06:30Z** on royal-dawn (→ reconcile first).
5. Branch IDs / endpoint→branch attachment don't match what the host-guard patch and reconciliation plan assume.
6. You are not 100% certain which project you're in (`morning-bread` vs `green-school`).

Only after: topology confirmed (different branches, cold-waterfall canonical) **AND** orphan writes sized & a
reconciliation decided **AND** the rotation host-guard merged → proceed (with Maya approval) to the guarded re-point
+ redeploy, then verify `/api/health`, both agent-listings endpoints, `/api/listings?type=sale|rent`, and the
exclusives/featured surfaces return 200 + data.

---
*Report only. No data/schema/branch/credential/env change. Author: Claude (Opus 4.8), 2026-06-02.*
