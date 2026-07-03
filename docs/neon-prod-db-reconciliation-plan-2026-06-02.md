# Production DB Reconciliation Plan — 2026-06-02 (REPORT ONLY — HELD pending Maya approval)

> **Status: REPORT ONLY. Nothing in this document has been executed.** No SQL run, no
> migration applied, no Neon branch touched, no credential rotated, no `DATABASE_URL`
> changed, no Vercel setting modified. This is a drafted procedure for Maya to review and
> explicitly approve before any step is taken. Per `CLAUDE.md` §A.7 and
> `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md`, every action below is a HELD operation.

---

## 0. One-line summary

Production's `DATABASE_URL` is pointed at a **stale Neon branch (`ep-royal-dawn-ad6eh8t2`)** that
is missing the `agents.trestle_mls_id` column and contains 0 CRM exclusives, instead of the live
production branch (`ep-cold-waterfall-adno3ao2`). The fix is **re-pointing the connection string**
through the authorized path — **not** a schema migration. There is a real, unresolved
**write-window data-reconciliation** risk (leads/audit/consent possibly written to the wrong
branch) that must be sized before any cutover.

---

## 1. Confirmed facts (evidence)

| Fact | Evidence |
|---|---|
| Production failure is **Prisma P2022** ("column does not exist") on `prisma.agent.findFirst` | revert commit `926b94c8` message; the agents-route 500 diag (`54bc36eb`) captured `code: P2022` |
| Failing surface: `/api/agents/[slug]/listings` (public agent-profile listing feed) | `app/api/agents/[slug]/listings/route.ts:104` catch block |
| Root cause: prod `DATABASE_URL` → **OLD branch `ep-royal-dawn-ad6eh8t2`** (0 CRM exclusives, missing `trestle_mls_id`) instead of **current `ep-cold-waterfall-adno3ao2`** | revert commit `f84523c5` message (captured by the now-deleted DB-identity diagnostic) |
| Expected/active production endpoint is **`ep-cold-waterfall-adno3ao2`** on `morning-bread-68708332` `main` | `NEON-VERCEL-OWNERSHIP-MAP.md:178-179, 328`; `docs/neon-vercel-integration-repair-plan-2026-05-17.md:53-55`; `memory/BACKEND-AUDIT-2026-04-29.md:891` |
| Schema **expects** `agents.trestle_mls_id` | `prisma/schema.prisma:37` |
| `trestle_mls_id` has **no migration file** — added via `prisma db push` (Trap #2) | `git grep trestle_mls_id -- prisma/migrations/**` → no matches; NEON.md §3 Trap #2 |
| `trestle_mls_id` is consumed by syndication gate | `lib/syndication/mallan-identity.ts:150-168` |
| **Only** the `rotate-db-keys` workflow may write `DATABASE_URL`/`DATABASE_URL_UNPOOLED`/`ASSISTANT_DATABASE_URL` — **manual edits forbidden** | `NEON-VERCEL-OWNERSHIP-MAP.md:269` |
| The diagnostic endpoint used to capture this was **already removed** | commit `f84523c5` (current `origin/main` tip); filesystem confirms no `app/api/__dbcheck` or `app/api/diag-db-2026` remain |

### Credential-rotation timeline (likely trigger)

`rotation-history.log`:
- `2026-05-15 09:30:58Z` — **"Rotation failed during Vercel redeploy."**
- `2026-06-01 06:35:28Z` — "Rotation successful."

The rotate workflow (`NEON-VERCEL-OWNERSHIP-MAP.md:261`) resets the `neondb_owner` password, **pulls
new pooled + unpooled URIs**, writes them to GH secrets + Vercel Production env, and redeploys. A
rotation that pulled the connection string for the wrong compute endpoint, or a partial/failed
rotation, is the most probable cause of prod landing on `royal-dawn`. **This is the leading
hypothesis and must be confirmed in preflight — do not assume.**

---

## 2. Unresolved contradiction — FAIL-CLOSED before acting

`CLAUDE.md` §E requires stopping when the canonical file conflicts with observed behavior:

- **Ownership map** (`NEON-VERCEL-OWNERSHIP-MAP.md:178-179, 328-329`) states `royal-dawn` is a
  *"rotation-related secondary endpoint … attached to the same `main` branch"* as `cold-waterfall`.
  Two compute endpoints on the **same** branch share the **same** storage — they cannot differ in
  data or schema.
- **Live diagnostic** (`f84523c5`) shows `royal-dawn` with **0 CRM exclusives + missing
  `trestle_mls_id`**, while `cold-waterfall` has both. Different data ⇒ **different branches**, not
  two endpoints on one branch.

**Both cannot be true.** Preflight step P3 must resolve this against the Neon Console / API before
any cutover. If it cannot be resolved with certainty, **STOP** — do not cut over on an assumption.

---

## 3. What this is NOT

- ❌ **Not a schema migration.** The live branch (`cold-waterfall`) already has `trestle_mls_id`.
  Running `prisma migrate deploy` would not fix prod and could corrupt the wrong branch.
- ❌ **Not NEON.md Recovery Playbook B (schema drift).** That playbook assumes prod is on the right
  branch but the schema diverged. Here, prod is on the **wrong branch**.
- ❌ **Not a manual `DATABASE_URL` edit in the Vercel UI.** Forbidden by ownership map line 269.
- ❌ **Not a Neon preview-branch cleanup concern.** Preview lives on `hidden-mountain-87248164`
  ("green-school"); this is the **production** project `morning-bread-68708332`. Do not conflate.

---

## 4. Blast radius (what was/is affected)

**Reads (user-facing, while prod points at `royal-dawn`):**
- `/api/agents/[slug]/listings` → **500** (P2022) — agent profile pages broken.
- Any reader of `agents.trestle_mls_id` (syndication identity gate, `lib/syndication/mallan-identity.ts`).
- CRM exclusives absent from production (0 on the stale branch) → Mallan exclusive listings,
  badges, featured leads likely missing/incorrect on the live site. **Cross-check with the
  featured/exclusive work merged 2026-05-31→06-02** (#304–#320) — those fixes may have been
  validated against a branch that prod is not actually serving.

**Writes (the serious, compliance-touching risk):**
Any rows created **while prod was pointed at `royal-dawn`** live on that branch and will vanish from
the production view the instant we re-point to `cold-waterfall`, unless reconciled first:
- `leads` — lead capture (business-critical; FARE/TCPA consent context)
- `audit_events` — retention-mandated records
- saved searches / favorites / open-house RSVPs / CMA / guide requests
- CRM draft listings (`SL-`/`RL-` drafts in progress)

**Sizing the write window is mandatory preflight (P5).** Until it is known, treat the cutover as
**potentially data-lossy** and do not proceed.

---

## 5. Preflight checks (READ-ONLY — safe to run, still requires Maya's go-ahead)

> All steps are read-only / inventory. None mutate data, schema, env, or branches.
> Print **host bytes only** — never echo secret connection strings.

- **P1 — Confirm the current prod pointer.** In Vercel → Project → Settings → Environment Variables
  (Production), read the **host** of `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Confirm host ==
  `ep-royal-dawn-ad6eh8t2-*`. (Do not reveal the secret value.)
- **P2 — Correlate with rotation history.** Confirm whether the `royal-dawn` pointer first appeared
  at the `2026-05-15` failed rotation or the `2026-06-01` rotation. This bounds the write window.
- **P3 — Resolve the branch identity (see §2).** In Neon Console / API for `morning-bread-68708332`:
  list branches and the compute endpoints attached to each. Establish definitively whether
  `royal-dawn` and `cold-waterfall` are (a) two endpoints on one branch, or (b) two branches. The
  data difference says (b); confirm and record branch IDs + creation timestamps.
- **P4 — Schema + data inventory on BOTH branches** (read-only queries):
  ```sql
  -- column presence
  SELECT column_name FROM information_schema.columns
   WHERE table_name = 'agents' AND column_name = 'trestle_mls_id';
  -- gauges
  SELECT count(*) FROM agents;
  SELECT count(*) FROM listings;
  SELECT count(*) FROM listings WHERE listing_id LIKE 'SL-%' OR listing_id LIKE 'RL-%';
  SELECT count(*) FROM listings WHERE listing_id = 'SL-0004';
  ```
  Expectation: `cold-waterfall` has the column + exclusives; `royal-dawn` does not.
- **P5 — Size the write window** (read-only). On `royal-dawn`, find rows created since the window
  start (from P2) in `leads`, `audit_events`, saved searches, favorites, drafts, consent tables.
  Anything found here is data that must be reconciled into `cold-waterfall`. Record exact counts +
  max/min timestamps.
- **P6 — `npm run ops:health`** against production (per NEON.md §5) — confirm headroom; note which
  endpoint it reports.
- **P7 — Confirm PITR coverage.** Launch PITR = 7 days (NEON.md §2). If the write window (P2)
  predates the 7-day PITR horizon, PITR alone cannot recover the start of the window — an explicit
  branch **snapshot** of both branches is required before any change.

---

## 6. Backup / snapshot step (before any cutover)

1. **Neon branch snapshots of BOTH branches** (`cold-waterfall`'s branch and `royal-dawn`'s branch)
   on `morning-bread-68708332`, so neither dataset can be lost. Record snapshot IDs.
2. **Record current Vercel Production env host values** for `DATABASE_URL` + `DATABASE_URL_UNPOOLED`
   (host bytes only, into the approval ticket) so the pre-cutover state is reversible.
3. Confirm PITR timestamp coverage (P7) as a secondary safety net.

---

## 7. The fix (HELD — exact steps, NOT executed)

### 7a. Re-point production to the live branch — via the authorized writer

Because manual `DATABASE_URL` edits are forbidden (ownership map :269), the cutover must go through
the **`rotate-db-keys` workflow**, which is the sanctioned mechanism that pulls connection URIs and
writes them to GH secrets + Vercel env + redeploys. Two sub-cases, decided by P3:

- **If `royal-dawn` is a stale branch and `cold-waterfall` is the live `main` branch (expected):**
  the rotate workflow must pull the URI for the **`cold-waterfall` endpoint on `main`** and write it
  to `DATABASE_URL` + `DATABASE_URL_UNPOOLED`, then redeploy. If the workflow currently resolves the
  endpoint implicitly (and that implicit resolution is what put us on `royal-dawn`), the **workflow's
  endpoint selection must be corrected first** so the rotation can't re-land on the stale endpoint.
  → This is a `.github/workflows/**` change = **HELD** (CLAUDE.md §A.7).
- **If P3 proves something else** (e.g. `cold-waterfall` is itself stale): **STOP and re-plan.** Do
  not cut over.

> No `prisma migrate deploy` is part of this fix. A migration only enters scope if P4 shows the
> *target* (`cold-waterfall`) is *also* missing `trestle_mls_id` — which is not expected. If it
> were, note Trap #2: the column has no migration file, so a **baseline** (NEON.md §7B) would be
> required, applied manually against prod in the 3–5 AM ET window (NEON.md §4) — a separate held
> approval.

### 7b. Data reconciliation (only if P5 found window-writes)

If P5 found leads / audit_events / consent / drafts on `royal-dawn` that are absent on
`cold-waterfall`:
1. Export those specific rows from the `royal-dawn` snapshot (read-only).
2. Replay/insert them into `cold-waterfall` with a one-shot, idempotent, `--dry-run`-first script
   following the `scripts/phase1-run.js` playbook pattern (NEON.md §6) — pre-state capture, verify,
   execute.
3. **This replay is itself a HELD write operation** touching `leads`/`audit_events` (compliance
   tables) and requires its own Maya approval + a compliance pass (see §10).

---

## 8. Verification queries (post-cutover, before declaring done)

1. **Identity:** prod `DATABASE_URL` host == `ep-cold-waterfall-adno3ao2-*` (Vercel env read).
2. **Schema:** `agents.trestle_mls_id` column present (information_schema query above).
3. **Data gauges:** `agents` count > 0; `listings` count matches expected; CRM exclusive count > 0;
   `SL-0004` present.
4. **Endpoint:** `GET /api/agents/<known-slug>/listings` returns **200** (no P2022) with listings.
5. **Health:** `GET https://mallan.nyc/api/health` → **200** (NEON.md §9).
6. **Live render:** spot-check an agent profile page + a Mallan exclusive listing + the homepage
   Featured section render correctly (proof-first: live URL probe, not source-grep — CLAUDE.md §F).
7. **Reconciliation parity (if §7b ran):** counts on `cold-waterfall` for the window tables == the
   pre-cutover `cold-waterfall` count **plus** the replayed row count.

---

## 9. Rollback / STOP conditions

**Roll back immediately if, after cutover:**
- `/api/health` is non-200, or DB-dependent routes 500 on the new pointer, or
- verification gauges (§8.3) are wrong (e.g. exclusive count drops), or
- any write-path parity check (§8.7) fails.

**Rollback action:** re-point `DATABASE_URL` + `DATABASE_URL_UNPOOLED` back to the recorded
pre-cutover host **via the rotate workflow** and redeploy. (Branch snapshots from §6 are the deeper
safety net.)

**Do NOT proceed (hard stop) if any of these are unresolved:**
- §2 branch-identity contradiction not definitively resolved (P3).
- Write window (P5) not sized, or PITR/snapshot coverage (P6/P7 + §6) not confirmed.
- The reason prod landed on `royal-dawn` (P2) is not understood — fixing the symptom without the
  cause invites recurrence on the next rotation.

---

## 10. Compliance preservation (REBNY / IDX / Fair Housing / data law)

- Re-pointing to the live branch **restores** correct IDX/RLS display (exclusives, attribution,
  `trestle_mls_id`-driven syndication identity). It does not alter any IDX display-gate field
  (`idx_display_yn`, `internet_*_display_yn`, etc.) — those live in the data, untouched by an env
  re-point.
- **Before EXECUTION** of §7 (and especially §7b), run the mandatory gate:
  `npm run rls:validate`, `npm run compliance-check`, `npm run ucba:audit`, `npm run idx:validate`,
  and invoke the `rebny-compliance` skill — per `CLAUDE.md` §G. A report draft does not trigger the
  gate; an execution touching `leads`/`audit_events`/listing display does.
- The §7b lead/audit replay touches **TCPA consent** and **NY SHIELD / audit-retention** records —
  treat as the highest-sensitivity step; preserve original timestamps + consent state exactly; no
  fabricated values.

---

## 11. Approval checklist (for Maya)

- [ ] Approve running **read-only preflight** P1–P7.
- [ ] Confirm §2 branch identity is resolved (P3 result recorded).
- [ ] Confirm write window sized (P5) + snapshot/PITR coverage (§6, P7).
- [ ] Approve the authorized re-point path (§7a) — including any `rotate-db-keys` workflow endpoint
      correction (a `.github/workflows/**` change, separately HELD).
- [ ] If window-writes exist: approve the §7b reconciliation replay (separate held write op + compliance pass).
- [ ] Approve the maintenance window (3–5 AM ET if any schema/large write per NEON.md §4).

---

*Prepared 2026-06-02. Report only. Author: Claude (Opus 4.8). Pending Maya approval before any step.*

---

## 12. PREFLIGHT EXECUTION RESULTS — 2026-06-02 (read-only, no changes made)

> Ran P1–P7 read-only. No `DATABASE_URL`/env/Neon/Vercel/credential changes; no SQL writes;
> no migrations. Method: read-only Neon API attempt + direct SELECTs against the branch reachable
> from `.env.local` + live production HTTP probes. Scripts (untracked): `scripts/__preflight-*.mjs`.

### Endpoint / branch identity

| | cold-waterfall (`ep-cold-waterfall-adno3ao2`) | royal-dawn (`ep-royal-dawn-ad6eh8t2`) |
|---|---|---|
| Reachable from here | YES — `.env.local` `DATABASE_URL`/`_UNPOOLED`/`ASSISTANT_` all point here | NO — no local creds; Neon API key (`NEON_ADMIN_KEY`) returns **401** |
| Role (evidence) | **LIVE branch** — has column + exclusives + all writes through Jun-1 06:31Z | **What PROD currently serves** — prod `/api/agents/*/listings` = **500 (P2022)**, `/api/health` = 200 |
| Branch-ID / created_at | pending Neon Console (API key dead) | pending Neon Console (API key dead) |

- **P1 confirmed (behavioral):** prod `https://mallan.nyc/api/health` → **200**; prod
  `https://mallan.nyc/api/agents/maya-allan/listings` and `/julia-djaafar/listings` → **500**.
  Runtime up + DB query failing = prod on a branch missing `trestle_mls_id` ⇒ **royal-dawn**.
- **P2/P3 (Neon API):** `NEON_ADMIN_KEY` (and `NEON_ROTATION_ADMIN`) → **HTTP 401** on
  `console.neon.tech/api/v2/projects`. Cannot enumerate branches/endpoints or pull royal-dawn's URI
  from here. **§2 doc contradiction is now disproven by data** (royal-dawn lacks the column +
  exclusives that cold-waterfall has, and prod-on-royal-dawn 500s ⇒ they are *different branches*,
  not two endpoints on one branch). Authoritative branch IDs/created_at still need a Console read.

### Cutover moment (pinned by 3 independent signals on cold-waterfall)

All write activity to cold-waterfall **stops at ~2026-06-01 06:30–06:31Z**:
- `audit_events` latest `created_at` = **2026-06-01T06:31:00.938Z** (daily counts: …05-31=271, 06-01=110 partial, then nothing)
- media-sync last run = **2026-06-01T06:30:59Z**; idx-sync last run = **2026-06-01 ~06:20Z** (26h ago, then silent)
- `listings` latest `created_at` = 2026-06-01T04:40:43Z
- Matches `rotation-history.log` **"Mon Jun 1 06:35:28Z Rotation successful."**

⇒ **Cutover ≈ 2026-06-01 06:35Z.** Production has been on royal-dawn ~**26–30 h** as of this audit.

### Schema comparison (P4)

| Check | cold-waterfall (measured) | royal-dawn (from `f84523c5` diag + prod 500) |
|---|---|---|
| `agents.trestle_mls_id` column | **PRESENT ✅** | **ABSENT ❌** (P2022) |

### Row-count comparison (P5/P6) — cold-waterfall measured; royal-dawn pending Console

| Table | cold-waterfall | royal-dawn |
|---|---|---|
| agents | 3 (Maya `trestle_mls_id=39361`; Leda/Julia null) | (pending) |
| listings | 105,697 (latest 06-01 04:40Z) | (pending — likely *newer* IDX rows, see delta) |
| listings `SL-`/`RL-` exclusives | **4** (incl. `SL-0004`) | **0** (per diag) |
| listings `idx_display_yn=true` | 15,309 | (pending) |
| leads | 50 (latest **2026-03-18**) | (pending — any Jun 1–2 lead is royal-dawn-only) |
| audit_events | 26,841 (latest **06-01 06:31Z**) | (pending — **~26 h of prod audit rows live only here**) |
| inquiries | 1 (2026-04-26) | (pending) |
| sessions | 4 (2026-05-31) | (pending) |
| saved_searches / showings / deals / documents / external_listings / buildings | 0 | (pending) |
| (76 public tables total) | inventoried | (pending) |

### Data-delta summary

- **On cold-waterfall, missing from royal-dawn:** the 4 CRM exclusives (`SL-/RL-`, incl. `SL-0004`),
  the `agents.trestle_mls_id` column + Maya's `39361` value, and all CRM/exclusive edits made before
  06:31Z Jun 1. (This is *why* prod shows degraded agent/exclusive/featured surfaces and 500s.)
- **On royal-dawn, missing from cold-waterfall (the orphan risk):** everything production wrote
  2026-06-01 06:35Z → now. Because the Vercel crons run on prod, this includes ~26 h of **idx-sync**
  + **media-sync** (re-derivable from Trestle — read-only feed, next sync self-heals), PLUS
  **`audit_events`** and any **`leads`/`inquiries`/consent** (NOT re-derivable; compliance/business data).

### Cutover verdict: ⛔ **BLOCKED**

Production has run on royal-dawn for ~26 h, so compliance-sensitive rows (`audit_events` at minimum;
`leads`/consent very likely) almost certainly exist **only** on royal-dawn. Re-pointing
`DATABASE_URL` back to cold-waterfall **without first reconciling** would orphan them. **Hard-stop
condition (§9) is met.**

### Mitigating safety net (P7)

Launch PITR = **7 days** (NEON.md §2). The entire window (Jun 1 → Jun 2) is well inside PITR on both
branches, so nothing is at imminent risk of expiry — but PITR is a recovery tool, not a substitute
for sizing + reconciling the delta. Confirm PITR is enabled on the royal-dawn branch in Console.

### Exact next recommendation (still HELD — no execution)

1. **Maya (or refreshed `NEON_ADMIN_KEY`) runs the royal-dawn-side inventory** in the Neon Console
   SQL Editor against the **royal-dawn branch** — the read-only queries in §5 P4/P5, plus:
   `SELECT count(*), min(created_at), max(created_at) FROM audit_events WHERE created_at > '2026-06-01 06:30Z';`
   and the same for `leads`, `inquiries`, and any consent table. That quantifies the orphan set.
2. **Confirm the branch IDs + created_at** for both endpoints in Console (resolves §2 / closes P3).
3. Only after the orphan set is sized + a reconciliation (§7b) is drafted and approved, proceed to
   the authorized re-point (§7a) via the rotate workflow — **and fix the workflow's endpoint
   selection first** so the next rotation can't re-land on royal-dawn.
4. **Do not cut over before steps 1–3.**

### Side note (separate pre-existing issue, not the branch fault)

`npm run ops:health` returned **❌ CRITICAL** on cold-waterfall — driven by the media cursor
`last_photos_change` 639 h stale + an R2 retry backlog (52 rows ≥ 3-strike). Unrelated to the
branch mispointing; track separately.

