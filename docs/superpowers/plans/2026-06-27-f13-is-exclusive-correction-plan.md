# F13 `is_exclusive` Correction Plan — 2026-06-27

**Status:** PLANNING ONLY · no code · no PR · no schema · no migration · no production writes · no Vercel/env · no Gate-5/archive/drain · no Neon extension · no PageSpeed/media · no authenticated CRM probes.
**Source audit:** `docs/audits/backend-search-deep-audit-2026-06-26.md` F13 + §12 (live-proven: 41 marked exclusive, 34 third-party, 7 real).
**Goal:** the smallest safe PR to correct the `is_exclusive` derivation **before** any PR-5B reader swap.

---

## 1. Current derivation map (where `is_exclusive` lives)

| Role | Location | Note |
|---|---|---|
| **Bad derivation (root)** | `lib/search/listing-search-projection.ts:324` → `const isExclusive = listing.agent_id !== null && listing.agent_id !== undefined;` | written at `:349` (`is_exclusive: isExclusive`) |
| **Upstream cause of false positives** | `lib/idx/sync.ts:1308` (comment: "agent_id is set so the projection marks the row is_exclusive: true") | IDX sync stamps `agent_id` on **third-party Trestle** rows → projection flips them exclusive |
| **Persisted column** | `prisma/schema.prisma:2583` `is_exclusive Boolean @default(false)` on `ListingSearchProjection`; migration `prisma/migrations/20260429130000_add_listing_search_projection/migration.sql` | column already exists — **no migration needed** |
| **Read back into DTO** | `lib/search/listing-search-projection.ts:420` (`is_exclusive: projection.is_exclusive`) | |
| **Type** | `lib/types/listing.ts:358` `isExclusive: boolean` (`ListingFlags`) | |
| **Contract doc (states the wrong rule)** | `lib/crm/listing-publish-contract.ts:10` ("projection sets is_exclusive = agent_id !== null") | comment to correct |
| **Tests that codify the bug** | `lib/search/__tests__/listing-search-projection.test.ts:280` (`agent_id:42 → true`), `:286` (`null → false`) | must be rewritten to the correct rule |
| **Other usages** | `tests/runtime/agent-listing-card-attribution.test.ts`, `tests/runtime/h1-dual-write-tier1.test.ts`, `public/crm/SALE-FORM-*.html` | verify; likely no change beyond test expectations |
| **Filter usage (live)** | **none found** — `is_exclusive` is **not** used as a WHERE filter in `lib/search/criteria-to-prisma.ts` / `core.ts`. The live exclusive separation uses `isMallanExclusiveListing` / SL-/RL- / `rls_eligible` (see below). | ⇒ the bad flag is **latent today**, harmful only once PR-5B reads the projection ⇒ confirms "PR-5B prerequisite, low live-risk now" |
| **Canonical CORRECT helper (reuse this)** | `lib/listings/exclusive-agent-assignment.ts:101` `isMallanExclusiveListing({listing_id, rls_eligible})` → `SL-`/`RL-` prefix **OR** `rls_eligible === false` | already used by the live agent/CRM paths; the projection just never adopted it |

**Live paths already do it right** (deliberately avoid `agent_id`): `app/api/agents/[slug]/listings/route.ts:262-265` ("Genuine Mallan exclusives are identified by the SL-/RL- listing_id prefix OR rls_eligible===false — both available without agent_id"); `dedupe-crm-vs-idx.ts` and `exclusive-agent-assignment.ts` use the same rule.

---

## 2. Correct business rule (source of truth)

**A listing is a Mallan exclusive iff `isMallanExclusiveListing(listing)` is true**, i.e.:
- `listing_id` starts with **`SL-`** or **`RL-`** (CRM-authored sale/rental exclusive), **OR**
- `rls_eligible === false` (Mallan website-only / off-RLS row Mallan itself authored).

**Explicitly NOT exclusive:**
- `agent_id != null` alone — a matched/assigned agent on a **third-party RLS** row does **not** make it a Mallan exclusive (this is the F13 bug).
- Any Trestle/IDX-sourced row that lacks the SL-/RL- prefix and is `rls_eligible !== false`.

This is the **already-canonical** rule (`exclusive-agent-assignment.ts`), so the fix is *adopt the existing helper in the projection builder* — not invent a new rule.

---

## 3. Compliance review (why false positives are a real risk)

Labeling a **third-party RLS listing as a "Mallan Exclusive"** is an advertising/attribution violation, not just a data nit:
- **REBNY RLS / UCBA:** RLS-sourced listings owned by other brokers must carry the **co-brokerage courtesy / IDX attribution** (UCBA Art. III §2(C)); presenting them as Mallan exclusives drops the required attribution and misrepresents the listing broker — exactly the failure the agent-page code comment (`:262`) was written to prevent.
- **NY DOS 19 NYCRR §175.25 advertising:** a result/card that implies Mallan is the listing/exclusive broker when it is not is a **misleading advertisement** (brokerage-name/attribution integrity).
- **IDX display integrity:** the exclusive flag, once it drives the projection reader (PR-5B) or an exclusive filter, would surface 34 third-party rows under a "Mallan exclusives" facet — a misrepresentation on a public advertising surface.
- **Why it's contained today:** the flag is currently **not** a live filter (§1), so no public surface renders these as exclusive yet. The risk **materializes the moment PR-5B (or any `is_exclusive` filter) goes live** — hence fix-first.

(Per CLAUDE.md §D, read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` before implementing.)

---

## 4. Data-correction strategy (recommended)

| Option | Verdict |
|---|---|
| **Migration** | **Not needed** — the `is_exclusive` column already exists; this is a value-derivation fix, not a shape change. |
| **Code (computed) fix** | **Required** — replace the `agent_id`-based derivation in `listing-search-projection.ts` with `isMallanExclusiveListing(...)`. Fixes every **future** dual-write immediately. |
| **Projection backfill / rebuild** | **Required for existing rows (separate gated step)** — the ~110k projection rows already carry the wrong flag (34 false positives + the 7 correct). Recompute via the existing projection rebuild/backfill path (`dualWriteProjectionForListingId` / `ops:projection-backfill`). **This is a production write → its own explicit approval**, like Gate 3/5; not part of the code PR. |
| **Ad-hoc DB UPDATE** | **Not recommended** — a manual `UPDATE listing_search_projection SET is_exclusive = …` would duplicate the rule in SQL and drift from the helper. Prefer the code-path backfill so the single source of truth (the helper) computes it. |
| **Test fixture update** | **Required** — the two projection tests assert the wrong rule and must be rewritten. |

**Safest path:** land the **code fix + tests** (no production mutation) → then, separately gated, run the **projection backfill** to correct the 34 live rows (read-only verify before/after). PR-5B stays HELD until both are done and verified.

---

## 5. Test plan (must prove)

In `lib/search/__tests__/listing-search-projection.test.ts` (rewrite the two bug-codifying cases) + a focused new case file if cleaner:
1. **Third-party RLS row with `agent_id` set, non-SL/RL id, `rls_eligible` true → `is_exclusive === false`** (the F13 regression; e.g. `listing_id:"RLS20012345", agent_id:42, rls_eligible:true`).
2. **SL-/RL- row → `is_exclusive === true`** (`listing_id:"SL-0004"`, with and without `agent_id`).
3. **Website-only row (`rls_eligible === false`, non-SL/RL id) → `is_exclusive === true`**.
4. **`agent_id` alone never implies exclusive** (assert a matrix: {SL-/RL- ✓} × {rls_eligible false ✓} × {agent_id present/absent → no effect}).
5. **Parity with the canonical helper** — assert the builder's result equals `isMallanExclusiveListing(...)` for a fixture set (prevents future drift).
6. **Live-exclusive separation unaffected** — `agent-listing-card-attribution.test.ts` / `h1-dual-write-tier1.test.ts` still pass (they use SL-/RL-/`rls_eligible`, not the projection flag).
7. **PR-5B held gate** — the existing PR-5B scope-guard test (the one asserting the public reader is NOT swapped) must remain green; add an assertion that PR-5B must not be enabled until `is_exclusive` parity passes.

CI chain that must stay green: `type-check`, the projection jest suite, `rls:validate`, `compliance-check`, `ucba:audit` (REGRESSIONS 0), `idx:validate` (the pre-existing Cron-Schedule critical is the only allowed baseline).

---

## 6. Runtime / live-proof plan (read-only, after implementation)

Host-guarded read-only probes on cold-waterfall (no writes; backfill itself is the separate gated step):
1. **Before backfill:** `count(*) FILTER (is_exclusive)` = 41; SL-/RL- count = 7; "marked-excl but not SL-/RL-" = 34 (the §12 baseline).
2. **After code fix + backfill:** marked exclusive should equal **real exclusives** = SL-/RL- count **+** `rls_eligible=false` count; "marked-excl but not (SL-/RL- or rls_eligible=false)" → **0** (false positives eliminated).
3. **Sample 5 of the 34 former false positives** → confirm `is_exclusive=false` and they are third-party (non-SL/RL, `rls_eligible≠false`).
4. **Sample the 7 real exclusives** → still `is_exclusive=true`.
5. **Public filter** (read-only GET) — once any `exclusive` facet reads the projection, confirm it returns only real exclusives (deferred until PR-5B; today verify the live `exclusive=mallan` path is unchanged).
6. **CRM/agent exclusive filter** — confirm exclusives-first/separation unchanged (needs authenticated probe → separate approval).
7. **No terminal/archived leakage** — re-confirm archived/terminal rows stay excluded (the §12 invariant) regardless of the flag change.

---

## 7. PR plan (smallest safe)

**PR title (suggested):** `fix(search): derive projection is_exclusive from isMallanExclusiveListing, not agent_id (F13)`

- **Files likely touched (code, ~1 + tests + 1 comment):**
  - `lib/search/listing-search-projection.ts` — import `isMallanExclusiveListing`; replace line 324 derivation with `const isExclusive = isMallanExclusiveListing({ listing_id: listing.listing_id, rls_eligible: listing.rls_eligible });` (both fields already in scope).
  - `lib/search/__tests__/listing-search-projection.test.ts` — rewrite the two cases (`:280/:286`) + add the §5 matrix/parity tests.
  - `lib/crm/listing-publish-contract.ts:10` — correct the stale comment to the real rule.
  - *(No schema, no migration, no route change, no frontend change.)*
- **Risk:** **Low** — single derivation swap onto an already-canonical, tested helper; the flag is not a live filter today, so no public behavior changes on merge.
- **Tests/gates:** the §5 suite + full CI chain; PR-5B scope-guard stays green.
- **Rollback:** revert the one-line derivation (pure code revert; no data dependency). The separate backfill (if run) is reversible by re-running the rebuild after a revert, or restoring the projection from the existing dual-write — but rollback of the PR itself is trivial.
- **Deployment considerations:** code-only; fixes new dual-writes immediately. **The 34 existing wrong rows are corrected only by the separately-gated projection backfill** — call it out in the PR so no one assumes merge alone fixes prod data. **No production mutation in this PR.**
- **Sequencing:** merge code fix → (separate approval) run projection backfill → live-proof §6 → only then consider PR-5B. **Do not enable any Neon extension; do not start PR-5B; not during the Gate-5 trial.**

---

*Planning only. No code, schema, migration, env, cron, or production change was made. The projection backfill (data correction of the 34 live rows) and any PR-5B work each require separate explicit approval.*
