# Cross-project DB binding — two-project comparison plan (REPORT ONLY) — 2026-06-02

> **Revised diagnosis: this is a CROSS-PROJECT production database binding problem,
> not a same-project endpoint switch.** `cold-waterfall` lives in `hidden-mountain-87248164`
> (Vercel-managed / "neon-green-school"); `royal-dawn` lives in `morning-bread-68708332`
> ("mallandb", Free). These are **separate Neon projects.**
>
> **Status: REPORT ONLY. Nothing executed.** No `DATABASE_URL`/env/credential/migration/
> Neon/Vercel change. Do **not** click "Connect"/copy green-school into production, and do
> **not** repoint `DATABASE_URL`, until user-write comparison (below) is complete.

## The two projects

| | **A — currently serving production** | **B — Vercel-managed, suspected canonical** |
|---|---|---|
| Neon project | `morning-bread-68708332` ("mallandb") | `hidden-mountain-87248164` ("neon-green-school") |
| Owner / plan | personal `mayad67@gmail.com` / **Free** (branches 10/10) | Vercel `maya` integration / **Launch** |
| Branch / id | `main` / `br-old-tree-admdlb9z` | `main` / `br-crimson-frog-adr7g9gt` |
| Compute | `ep-royal-dawn-ad6eh8t2` | `ep-cold-waterfall-adno3ao2` |
| Reachable by Claude | ❌ no creds (key 401) → **run query pack in Console** | ✅ `.env.local` → measured this session |

### Why this is the binding story (evidence)
- B (cold-waterfall) holds continuous app history with **last audit_events 2026-06-01T06:31:00.938Z**, then nothing.
  Production crons write audit_events → **production was bound to B until 06:31Z.**
- The Jun-1 **06:35:23Z** rotation (hardwired `PROJECT_ID=morning-bread`) wrote A/royal-dawn's connection string into
  prod env → production flipped to **A** → agent routes 500 (A lacks `agents.trestle_mls_id`).
- The May-15 rotation wrote the same A creds but its **redeploy failed** (missing `name`), so prod kept B until Jun-1,
  when the rotation succeeded end-to-end. Timing matches exactly.
- Docs are inverted: `CLAUDE.md §B`, `NEON-VERCEL-OWNERSHIP-MAP.md`, `NEON.md §11`, and the `NEON_PROJECT_ID` var all
  call **A=morning-bread "production"** and **B=hidden-mountain "preview."** Evidence says the live data is in **B.**
  (Doc correction is a separate HELD task.)

---

## 1. Side-by-side comparison (Column B measured this session; Column A pending Console)

| Metric | **A — morning-bread / royal-dawn** | **B — hidden-mountain / cold-waterfall** |
|---|---|---|
| agents count | _pending_ | **3** |
| `agents.trestle_mls_id` exists | _pending_ (expected **NO** → P2022) | **YES** |
| Maya `trestle_mls_id` | _pending_ (expected N/A) | **39361** |
| listings count | _pending_ | **105,697** |
| SL/RL exclusives | _pending_ (expected **0**) | **4** (incl. `SL-0004`) |
| listings latest `updated_at` | _pending_ | _(run pack: `max(updated_at)`)_; latest `created_at` **2026-06-01 04:40:43Z** |
| audit_events latest `created_at` | _pending_ (expected **> 06:31Z**, the tail) | **2026-06-01T06:31:00.938Z** |
| audit_events count | _pending_ | **26,841** |
| leads count / latest | _pending_ | **50** / 2026-03-18 |
| inquiries count / latest | _pending_ | **1** / 2026-04-26 |
| sessions count / latest | _pending_ | **4** / 2026-05-31 |
| consent table present? | _pending_ | **no dedicated consent table** in B's 76-table schema (consent likely columns on `leads`) |
| CRM intake/draft tables | _pending_ | `seller_leads` present; no `drafts` table |
| users / accounts | _pending_ | **none** — B uses `agents` (no `users`/`accounts` table) |
| listing_media count / latest | _pending_ | _(run pack)_ — table present |
| rows written after 2026-06-01 06:30Z | _pending_ (**the orphan tail — key number**) | expected **~0** (writes stopped 06:31Z) |
| public table count | _pending_ | **76** |

> Fill Column A by running `docs/two-project-comparison-query-pack-2026-06-02.sql` BLOCK 0→1→2 in the
> **morning-bread** Console. (I can also fully re-measure Column B read-only if you want every cell populated.)

## 2. Which DB has canonical LISTING / EXCLUSIVE data
**B (hidden-mountain / cold-waterfall).** It holds 105,697 listings, all 4 CRM exclusives (incl. `SL-0004`), the
`trestle_mls_id` schema, and `idx_display_yn` gates. A is expected to lack the column + exclusives (the 500 proves it).

## 3. Which DB has canonical USER / COMPLIANCE writes
**Split — this is the crux:**
- **Up to 2026-06-01 06:31Z:** all on **B** (26,841 audit_events, 50 leads, etc.).
- **From 2026-06-01 06:35Z → now (~the live window):** on **A** only, because production has been bound to A. Any
  lead / inquiry / audit_event / consent / form submitted since the cutover exists **only on A**. BLOCK 2 sizes it.

## 4. Orphan-write risk in each direction
- **Move prod B→ (i.e. back to B), without preserving A's tail:** ⛔ loses every user/compliance write since 06:35Z
  (TCPA/SHIELD/retention exposure). **Must size + replay A's tail first.**
- **Keep prod on A + migrate B into A:** must import 105k listings + full history + the `trestle_mls_id` schema into a
  **Free-tier, 10/10-branch, possibly size-capped** project. Heavier, fragile, and leaves prod on the weaker plan.
- **Re-derivable either way:** IDX `listings`/`listing_media` self-heal from Cotality on next sync — exclude from the
  must-preserve set; prioritize `audit_events`, `leads`, `inquiries`, consent, CRM intake, `documents/signatures`, `offers`.

## 5. Recommended canonical production DB
**B — hidden-mountain / cold-waterfall (Launch).** It is where production actually ran until Jun-1 and holds the
complete current dataset + schema; A is stale pre-migration data plus the accidental ~26h tail.
**Caveat (fail-closed):** this INVERTS every existing doc, so do not commit until (a) Column A confirms A is
stale-except-the-tail, and (b) the pre-06:35Z binding to B is confirmed via Console **Operations** history. Until then
this is the evidence-backed recommendation, not an executed decision.

## 6. Safest cutover / migration path (Option B), all HELD pending approval
1. **Acknowledge the live clock:** every hour prod stays on A, more orphan writes land on A. (Decide separately whether
   to leave prod degraded-but-capturing vs. a holding state — no change without approval.)
2. **Size A's orphan tail** — query pack BLOCK 2 on morning-bread.
3. **Export A's tail → replay into B** with PK/FK remap, preserving timestamps/consent (mechanics in
   `docs/royal-dawn-reconciliation-plan-2026-06-02.md`, now cross-project). Exclude re-derivable IDX listings/media.
4. **Verify B** = full history + A's tail folded in (counts + checksums); B still complete.
5. **Repoint production → B / `ep-cold-waterfall-adno3ao2`** via the **authorized path — NOT rotate-db-keys** (it targets
   morning-bread!). Likely mechanism: let the **hidden-mountain Vercel-Neon integration** own the production
   `DATABASE_URL` again (it injects into all envs), i.e. remove/override the rotation-injected A value so the
   integration's B value wins. Confirm first, read-only, which `DATABASE_URL` Vercel Production currently resolves.
6. **Redeploy + verify:** `/api/health`, both `/api/agents/*/listings`, `/api/listings?type=sale|rent`, exclusives +
   featured surfaces → 200 + data.
7. **Lock down:** retarget or disable `rotate-db-keys` (it must never again push morning-bread into prod) + add the host
   guard; correct `CLAUDE.md §B` / ownership map / `NEON.md §11`; mark morning-bread/royal-dawn **stale/do-not-serve**;
   mark hidden-mountain/cold-waterfall **production canonical**.

## 7. Stop conditions (hard-stop & report — no DATABASE_URL/env/cred/migration/Neon/Vercel change)
1. Column A not yet measured, or A's post-06:35Z orphan tail not sized **and preserved**.
2. B not confirmed to hold complete current history (verify latest timestamps + counts).
3. **Do not run `rotate-db-keys`** — it points at the wrong project and would re-break or rotate the stale DB.
4. A turns out to hold **unique pre-migration user data** never present on B (a second orphan set → reconcile).
5. Unclear which project prod wrote to before 06:35Z → confirm via Console **Operations** before deciding.
6. Any uncertainty about which project you're in, or which `DATABASE_URL` Vercel Production currently uses.
7. **Do not click "Connect" / copy green-school into production** until user-write comparison is complete and approved.

---
*Report only. No data/schema/branch/credential/env change. Author: Claude (Opus 4.8), 2026-06-02.*
