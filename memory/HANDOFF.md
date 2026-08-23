# 🟢 RESTART POINTER → GitHub Issue #415 is the CANONICAL board

> **If resuming after a disconnect: READ THIS FILE, then `gh issue view 415 --comments`.**
> Do NOT restart from chat history. Do NOT guess. Do NOT argue A6 from memory — let the
> read-only Phase D precheck prove it.
>
> #415 = "NEON cleanup master execution board — legacy JSON removal, storage reclaim, and handoff memory"
>
> This local file is a pointer + quick-status echo; the authoritative record is #415 + the
> P2-MONEY tracker. Mirror policy §A.3: this file is mirrored byte-identical to
> `C:\Users\MayaAllan\Desktop\memory\HANDOFF.md`.

---

## Quick status echo — updated 2026-06-24 (Phase D STEP 4 COMPLETE — agent_info column DROPPED)

> ✅ **STATUS RECONCILIATION (2026-06-24) — READ FIRST.** Phase D `agent_info` is COMPLETE through **STEP 4: the production `listings.agent_info` column is DROPPED** (#441 `3d53343a`; see the STEP 4 line above + #415). **Every statement below that says Phase D/DROP is "NOT STARTED", "do NOT drop agent_info", "do NOT run migrations", `typed_gap_rows = 1` / "A6 not complete", or describes the pre-drop prechecks/gates/snapshot is SUPERSEDED and HISTORICAL.** The ONLY Phase-D items still open are **storage reclaim** and the **Launch→Free downgrade** — each a SEPARATE gate needing its own plan + explicit Maya approval.
>
> ⚠️ **LOCAL-BRANCH WARNING (2026-06-23).** The local `fix/phase-d-step3-remove-agent-info-schema-field-2026-06-22` branch **diverged** from the merged PR #429 head — it was reused locally for the #430–#434 CRM-sales work (now on `main`). It does NOT contain the merged Phase D STEP 3 commits. **Do NOT force-push it** (a force-push would overwrite the PR head). Use `gh pr checkout 429` only for historical inspection. **Safe path for new work = a fresh branch off `main`** (e.g. `git fetch && git checkout -b <name> origin/main`).

- **Latest completed:** **Phase D STEP 4 ✅ COMPLETE — `listings.agent_info` column DROPPED from production (#441, 2026-06-24)** · Phase D STEP 3 ✅ (#429) · Phase C ✅ (#420) · hygiene ✅ (#421) · Item A CRM blocker ✅ (#423) · A3 REDESIGN phantom-target hydration ✅ (#424). `main` HEAD `3d53343a` (Step 4 DROP migration #441).
- **Current lane: Lane 1B — A6 backfill EXECUTED + verified.** Read-only precheck found `typed_gap_rows = 1` (co-list MLS, 1 row) → A6 backfill **EXECUTED (Maya-approved, fill-only COALESCE, 1 row updated, updated_at preserved, host=cold-waterfall)** → re-precheck **`typed_gap_rows = 0`, all 8 per-field gaps = 0.** ✅ **A6 COTALITYLVED by production-SQL.** agent_info = 39 MB; DB = 1364 MB (286% of cap).
- **A6 runbook #425 MERGED** @ `369bfc3e` — seam-correct gap SQL (`NULLIF(btrim(COALESCE(Pascal, lower)),'')`, lockstep-noted) + A6 execution history + re-verify-only checklist.
- **Phase D code-prep (runtime) STEP 1: ✅ MERGED — PR #426** @ `2a37079a` (2026-06-22). Removed the 7 runtime `app/api` `agent_info: true` selects; made `agent_info` OPTIONAL in `DbListing`/`PortalListingInput`. (Codex #426: this is STEP 1/prerequisite, NOT alone drop-safe — implicit reads need step 3 schema-field removal.)
- **Phase D code-prep STEP 2: ✅ MERGED — PR #427** @ `55b53bd9` (2026-06-22). Removed `agent_info: true` from the 4 operator scripts (repair/set-exclusive: select-only; **audit**: MLS-ID reads → typed columns; retired backfill **HARD-DISABLED as a tombstone** — unconditional exit(2), no PrismaClient/process.argv/ALLOW_RETIRED/write path; Codex P1+P3 fixed: tracked-only guard via `git ls-files` + isScratch, stale cotality-url test → tombstone asserts). Full runtime suite 2296/2296.
- **Phase D STEP 3: ✅ MERGED + DEPLOYED — PR #429** (merge commit `a5040eb54b208995a1382e655c3247f33273c1a2`, squash of head `93af4017`, 2026-06-23). Removed `agent_info Json` from the Listing model in `prisma/schema.prisma` + regenerated client → Prisma stops selecting agent_info on EVERY read (incl. implicit no-select/include). Fixed the 2 direct reads (crm/[id], page.tsx → `{}`, typed-first re-seeded). **Option 1: added a NO-OP checkpoint migration** (`prisma/migrations/…_phase_d_step3_agent_info_schema_client_only_no_ddl/migration.sql` — comment-only, NO DDL) to satisfy the NEON.md §1 schema/migration-coupling BLOCKER WITHOUT dropping the column → compliance-check now 92/0 BLOCKER. **Codex #429 fix: removed `prisma db push --accept-data-loss` from `pr-check.yml`** (→ validate + generate + bare db push) + guard. **NO DDL, NO DROP, NO SQL run, NO prod migration applied — physical DB column still present (intentional drift).** type-check 0; full runtime 2308/2308; compliance-check 92/0; rls/ucba clean. **✅ MERGED 2026-06-23 + DEPLOYED** (Vercel `dpl_FVCHynY7…` state=READY, live on mallan.nyc / www.mallan.nyc, build ~156s). **Public smoke PASSED** [live probe]: `/api/health` 200; public listing page 200 with "Mallan Real Estate Inc." attribution rendered (exercises `resolveListingAgentInfo` with agent_info absent → no crash); public `/api/listings` 200 and correctly omits agent PII; `/crm/sale-view` 307 + `/api/crm/listings/[id]` 401 (auth gates, NOT 500); **zero error/fatal + zero agent_info runtime logs** post-deploy. **Physical `listings.agent_info` column STILL RETAINED (intentional schema↔DB drift).** Real DROP = Step 4 = pre-drop snapshot + explicit Maya approval — **NOT started.** **Codex P2 (2026-06-22) COTALITYLVED + both review threads resolved + Codex re-review "no major issues 👍":** sale viewer `SALE-FORM-WITH-TOOLS.html` (reachable `/crm/sale-view`, NOT orphaned) made typed-first + GET safety net pins typed cols; regression test added. ⚠️ **Auth-gated CRM render still needs Maya's logged-in confirmation** (typed attribution on `/crm/sale-view` + `/crm/rental-view`). See session log + #415.
- **STEP 4 ✅ COMPLETE (2026-06-24, Maya-approved):** `listings.agent_info` column **DROPPED from production** via the compliant Prisma migration path. PR **#441 MERGED as `3d53343a`** (DROP migration `20260623233000_drop_agent_info_column` + `@allow-destructive`/rollback annotation; CI green; Codex 👍). Applied with `prisma migrate deploy` (cold-waterfall, host-guarded) — applied the #429 no-op checkpoint (zero DDL) then the DROP; **only real DDL = `ALTER TABLE "listings" DROP COLUMN "agent_info";`**. Pre-apply gates re-confirmed: `real_gap_rows=0`, `unverifiable_gap_rows=0` (5 co-list typed-vs-JSON gaps live-confirmed STALE, not data loss). **Verified:** `information_schema` agent_info count = 0; `prisma migrate status` "up to date"; **production smoke PASSED** (`/api/health` 200; public listing detail 200 with "Mallan Real Estate Inc." rendered; `/api/listings` 200; `/crm/sale-view`+`/crm/rental-view` 307; `/api/crm/listings/[id]` 401 — no 500); **zero error/agent_info runtime logs**. **Pre-drop Neon rollback branch `br-wandering-moon-adl515bq` / `pre-agent-info-drop-2026-06-23` (endpoint `ep-cool-bird-adfi9kgl`) DELETED** after smoke (Console: 2/5000→1/5000, only `main` remains). Full proof on #415.
- **🛑 HARD STOP — NOT started; each requires a SEPARATE plan + explicit Maya approval:** (a) **storage reclaim** — the ~39 MB freed by the DROP still sits in the `listings` TOAST (DB ~1368 MB / TOAST 696 MB); reclaim via pg_repack or dump→fresh-branch, **never `VACUUM FULL` on Neon**; (b) **Neon Launch→Free downgrade** — only after a post-reclaim re-measure proves DB <500 MB with margin AND the other JSON fronts + archive drain are resolved AND the Vercel false-branch-limit ticket cleared.
- **Corrected canonical DROP sequence (each gated):** (1) remove explicit selects [#426] → (2) remove operator-script selects [follow-up] → (3) remove `agent_info` from `prisma/schema.prisma` + `prisma generate` + DEPLOY (makes ALL reads drop-safe) → (4) pre-drop Neon snapshot → (5) `ALTER TABLE listings DROP COLUMN agent_info` → (6) reclaim → re-measure → downgrade.
- **Follow-up (tracked, before DROP): operator-script selects** — `audit-mallan-listing-side-ids.ts`, `ops/repair-exclusive-agent-assignment.mjs`, `ops/set-exclusive-listing-agent.mjs`, retired `backfill-crm-…` still `select agent_info: true` + read for write-logic → focused typed-first review (not runtime). The 2 direct reads (`crm/[id]`, `page.tsx`) already absent-safe.
- **Precheck script:** `scripts/__phase-d-agent-info-precheck-2026-06-22.mjs` (untracked `__`; `--run` = host-guarded read-only txn). RAN 2026-06-22, read-only.
- **Precheck script:** `scripts/__phase-d-agent-info-precheck-2026-06-22.mjs` (untracked `__` operator script; default-inert/no-connect; `--run` = host-guarded read-only txn). Syntax-checked, NOT executed.
- **Phase D execution COMPLETE (Step 4 DROP done 2026-06-24, #441).** Remaining Maya-gated items: storage **reclaim** + **Launch→Free downgrade** (separate plans). Do NOT run reclaim/downgrade or production SQL writes without explicit approval.
- **Phase D plan (report-only, on disk):** `docs/superpowers/plans/2026-06-21-agent-info-phase-d-drop-reclaim.md`.
- **P2-MONEY tracker (reconciled):** `docs/superpowers/plans/2026-06-12-return-neon-to-free-tier-P2-MONEY.md` (see the 2026-06-22 Reconciliation block).

## agent_info phase ledger (proof = #415)
| Phase | What | Status | Proof |
|---|---|---|---|
| A1 (#412) | 6 nullable typed columns added | ✅ DONE | merge `7848940f`; prod columns proven |
| A (#413) | producers dual-write all 8 typed fields | ✅ DONE | merge `2f392835` |
| A6 (#416) | existing-row backfill | ✅ **DONE — executed + verified 2026-06-22** (1 row co-list MLS filled; re-precheck `typed_gap_rows=0`, all 8 gaps 0) | merge `a0203dd0`; prod execute proof |
| B (#417) | readers typed-first + JSON fallback | ✅ DONE | merge `fd0fdf15`; prod smoke PASS |
| C (#420) | producers STOP writing/refilling agent_info | ✅ DONE | merge `66120741`; deployed + smoke PASS; static guard in CI |
| D (#441) | DROP agent_info column | ✅ **DONE 2026-06-24** | `3d53343a`; `ALTER TABLE listings DROP COLUMN agent_info` via migrate deploy; col count=0; smoke PASS; rollback branch deleted; #415 proof |
| D-reclaim | reclaim freed bytes + Launch→Free downgrade | ⛔ NOT STARTED (separate gates) | each needs its own plan + explicit Maya approval |

**A6 status — ✅ COTALITYLVED / HISTORICAL (superseded by Step 4 DROP):** the pre-drop data-safety gate ultimately PASSED — the final read-only pre-DROP rerun (2026-06-24) showed `real_gap_rows = 0` and `unverifiable_gap_rows = 0` (the co-list typed-vs-JSON gaps were live-confirmed STALE — the live Cotality feed had dropped those co-list MLS values, so they were NOT data loss). The column was then DROPPED (#441, 2026-06-24). (The earlier 2026-06-22 `typed_gap_rows = 1` reading is historical.)

## P2-MONEY ($0 / Neon Free) status — NOT ready
- **B5 (six-front JSON migration) is STARTED:** front 1 of 6 = `agent_info`, complete through Phase C and write-frozen; Phase D drop/reclaim remains. The other five fronts — `features`, `media`, `compliance`, `raw_data`, `address` — are **NOT started.**
- **Integration-safety half DONE:** Step 1/C6 SETTLED (#402, 2026-06-15); Step 2 `NEON_PROJECT_ID` → hidden-mountain (2026-06-17); #405 archive NULL-fix MERGED flag-OFF (2026-06-18); ops-health monitoring already mirrors the widened predicate.
- **Storage:** DB last known ~**1.23 GB** ≈ 2.46× the **500 MB** Free cap (may be higher after backfill/update activity). `agent_info` ALONE ≈ ~**38–39 MB** logical (front 1 of 6) — **will NOT solve the cap.** The ~**648–663 MB** figure = ALL six JSON columns combined (raw_data 267 / compliance 201 / features 101 / agent_info 39 / address 34 / media 6). Archive drain (~390 MB, biggest lever, OFF) + other 5 JSON fronts + measured `<500 MB` proof + **Vercel false branch-limit ticket cleared** all remain before any downgrade. Do NOT present agent_info DROP as sufficient for downgrade.
- **Archive:** `ARCHIVE_T180_BACKLOG_ENABLED` = **OFF**; drain **not run**; do NOT enable without separate approval + measurement. Separate lever from agent_info Phase D.

## Phase D next gate — read-only prechecks (only after Maya approval)
Must prove (READ-ONLY; DROP/reclaim/downgrade are NOT in this step):
1. target DB = cold-waterfall / hidden-mountain
2. `typed_gap_rows = 0` across **ALL 8 typed fields** (not name-only; any per-field gap >0 BLOCKS the DROP → A6 repair) — hard data-safety gate
3. mismatch samples reviewed
4. current `agent_info` logical bytes
5. current table / TOAST / index size
6. total DB size
7. remaining `agent_info` reads safe or removable (10 §2A selects + 2 §2B direct reads) **PLUS a corrected CRM route/form inventory — NOT DB-only.** ⚠️ Reachable `public/crm/RENTAL-FORM-WITH-TOOLS.html` (opened by `public/crm/js/dashboard/panels/rentals-crm/index.js`) reads `agent_info` non-typed-first → was a **Phase D BLOCKER**, **cleared by #423** (rental viewer now typed-first). `SALE-FORM-WITH-TOOLS.html` is **REACHABLE** via `/crm/sale-view` (NOT orphaned — earlier claim corrected) and is now **FIXED typed-first** (Codex #429 P2, 2026-06-22; see session log). `public/crm/**` otherwise HELD.
8. Neon-safe reclaim method selected (NEON.md: never VACUUM FULL; confirm pg_repack + PITR retention-lag)

## 🧾 No Loose Ends Register (2026-06-22 · full table in #415)
| Item | Status | Next action |
|---|---|---|
| H1 `.gitignore` hygiene · H2 track README · H3 track Phase D plan doc | ✅ **MERGED** — #421 @ `362cc80b` (2026-06-22) | done |
| **A** CRM blocker: rentals "View Listing" non-typed-first | ✅ **COTALITYLVED — MERGED #423 @ `46bbaec4`** (2026-06-22). WITH-TOOLS viewer rendered keys typed-first (`listingAgentName`/`listingCompany` ← `list_agent_full_name`/`list_office_name`); route unchanged; test 7/7; all checks pass. The reachable rental viewer no longer reads `agent_info` non-typed-first → **Item A blocker cleared.** (#422 closed; Option B shipped.) | done |
| **A3** `RENTAL-FORM-REDESIGN.html` `_populateRentalFormFromApi()` phantom/missing-control hydration | ✅ **COTALITYLVED — MERGED #424 @ `9322e906`** (2026-06-22). 9 renamed to real save-read controls; 12 phantom setVals removed (proven save-safe); static guard (every setVal/setChecked/setRadio target maps to a real control) + regression 53/53; all checks pass. **manage-listings rental edit no longer blanks price/baths/size/flags on save.** | done (phantom-target safety) |
| **A3-followup (new)** proper checkbox-group/building-association/co-list **edit-hydration** (pre-check saved amenities, populate building from association) | ⏸️ DEFERRED (feature, separate from phantom-target fix) | later |
| **A2 (OPEN, later cleanup)** retire duplicate `*-WITH-TOOLS.html` forms | ⏸️ DEFERRED | only after A3 + no-ref proof |
| **A-followup (minor)** viewer agent id/phone/email/license never populated by the object (pre-existing, NOT an agent_info blocker) | ⏸️ DEFERRED (optional) | later |
| **A3 (new, BLOCKS A-via-REDESIGN)** `RENTAL-FORM-REDESIGN.html` `_populateRentalFormFromApi()` writes **23 hydration targets to non-existent controls** (price→`rentalListPrice`✗ real `rentalMonthlyRent`; baths; living area; rooms; year built; building; co-list; heating/cooling/appliances/laundry/pets; expiration; **idx/internet display flags**). Pre-existing; **also breaks the `manage-listings` rental-edit path**. Editing an existing rental loads blanks → save can overwrite/flip display gates. | 🔴 TRACKED BUG (data-integrity + compliance) | dedicated fix PR (23 targets + missing-control static test) |

**Item A options (Maya to choose):**
- **Option B (recommended, minimal):** make the WORKING `RENTAL-FORM-WITH-TOOLS.html` typed-first — patch its 4 `agent_info` reads (`(apiData.agent_info||{}).ListAgentFullName/.ListOfficeName`, ×2 each) to `apiData.list_agent_full_name || …`. Small, safe, keeps the functional viewer, clears the Item-A `agent_info` blocker without touching the 23-target REDESIGN bug.
- **Option A3-first:** fix REDESIGN `_populateRentalFormFromApi()` (23 targets) + add a static "every hydration id exists" guard, THEN repoint `_viewListing` to REDESIGN `?id=`. Larger; also fixes manage-listings; needed eventually regardless.
| **B** DB precheck not run · **B2** A6 unresolved | ⏸️ DEFERRED WITH GATE (Maya) | run read-only precheck; prove `typed_gap_rows=0` |
| **C** `validator-results.json` stray generated diff | ✅ FIXED (reverted to baseline) | baseline refresh = separate decision |
| **D** Codex `66c1cca` redundant PR/branch | ✅ REJECTED WITH PROOF | none — no open PR/branch; superseded by #420 |
| **E** Phase D functional CRM PR | ⏸️ DEFERRED WITH GATE | open after A approved, separate from hygiene |

**Locked sequence:** hygiene closure (#421) → CRM blocker PR → read-only DB precheck → Phase D code PR → snapshot → DROP/reclaim approval.

## Hard holds (from Maya, do NOT violate)
Phase D `agent_info` is COMPLETE (Step 4 DROP done 2026-06-24, #441) — the drop/migration holds are discharged. **Still DO NOT (each Maya-gated):** run storage **reclaim** · **downgrade Neon** (Launch→Free) · enable **archive drain** (`ARCHIVE_T180_BACKLOG_ENABLED`) · run production SQL writes · remove the resolver JSON fallback · start CRM feature work. Every remaining step is Maya-gated.

## Reporting rule (every future report MUST update #415 with)
last item completed · current active lane · exact proof · next item · blockers · and the
verification type of each claim (repo-verified / production-SQL-measured / Vercel-env-measured / still-unverified).

## Pointers
- Canonical board: **GitHub issue #415** · P2-MONEY tracker: `docs/superpowers/plans/2026-06-12-return-neon-to-free-tier-P2-MONEY.md`
- Phase D plan: `docs/superpowers/plans/2026-06-21-agent-info-phase-d-drop-reclaim.md`
- Dependency audit (#409): `docs/audits/legacy-json-dependency-audit-2026-06-18.md`
- agent_info spec/plan (#410/#411): `docs/superpowers/specs/2026-06-18-agent-info-normalization-design.md` · `docs/superpowers/plans/2026-06-18-agent-info-normalization.md`
- Neon rules: `NEON.md`

## This-session log (2026-06-22)
- Deleted superseded dated handoffs `HANDOFF-2026-05-28/05-29/06-02.md` (repo + mirror; recoverable via git).
- Authored/verified Phase D report-only plan @ `66120741`.
- **Reconciled #415 + P2-MONEY tracker + this file** to verified state (A1/C6/#405/ops-health done; B5 front-1 corrected; A6 caveat hardened; archive OFF).
- **Prepared Phase D read-only precheck** `scripts/__phase-d-agent-info-precheck-2026-06-22.mjs` (default-inert; `--run` host-guarded read-only). Syntax-checked only; later applied 2 cleanups (removed unused `execSync`; added catch→ROLLBACK→rethrow). Posted path to #415.
- **Cleanup audit (report-only).** Found + corrected a Phase D plan error: `RENTAL-FORM-WITH-TOOLS.html` is REACHABLE (via `rentals-crm/index.js`) and reads `agent_info` non-typed-first → added to Phase D manifest as a BLOCKER. Patched plan §2D/§2E/§5/§8 + #415. CRM forms NOT edited (`public/crm/**` HELD).
- **`.gitignore` block DRAFTED, NOT applied** (awaiting approval): scratch (`scripts/__*`, `__pw-*/`, `.playwright-mcp/`, `.superpowers/`), anchored ops/debug (`/ops-health-*.json`, `/branch-cleanup-*.txt`, `/pr*-*.jpeg`), `/backups/`. **Refined 2026-06-22: use `/ops/audit/` NOT `/ops/`** — `ops/agent-journals/README.md` is a real runbook (track it); `ops/audit/**` is generated audit scratch. NOT broad `*.png/*.jpg` — repo tracks 13 legit images.
- **CRM route/form `agent_info` sweep COMPLETE (report-only, plan §2F).** Provable blocker list: (1) `RENTAL-FORM-WITH-TOOLS.html` is REACHABLE via the rentals "View Listing" button (`rentals-crm/index.js:517 → :1365`), non-typed-first → hard blocker; (2) `index-built.html` generated (rebuild only); (3) `SALE-FORM-WITH-TOOLS.html` orphaned (0 refs) — retire. REDESIGN forms are typed-first/SAFE. Fix: repoint `_viewListing` → REDESIGN `?id=` (verify) / make WITH-TOOLS typed-first / retire. `public/crm/**` HELD.
- **❌ CORRECTION (2026-06-22, Codex #429 P2 + Maya-approved fix):** the "(3) `SALE-FORM-WITH-TOOLS.html` orphaned (0 refs) — retire" claim above is **WRONG.** The sale viewer is **REACHABLE + LIVE**: `vercel.json:68` rewrites `/crm/sale-view` → `SALE-FORM-WITH-TOOLS.html`; the dashboard "View" button opens it (`public/crm/js/dashboard/workspace.js:4833`); it is documented in `public/crm/README.md:23` and **stability-contract-pinned** in `docs/crm/SALES-FORM-STABILITY-CONTRACT.md:38`. It read agent/company **agent_info-first** (`SALE-FORM-WITH-TOOLS.html:4955-4956, 4990-4991`) → would blank attribution once #429 drops `agent_info` from the Prisma client. **FIXED** (Maya-approved, `public/crm/**` hold lifted for this change): both viewer blocks now typed-first (`apiData.list_agent_full_name`/`list_office_name` → agent_info JSON fallback → ''); the unused `listingAgent` key renamed to the **rendered** key `listingAgentName` (avoids the #423 no-op trap — renderer reads `d.listingAgentName` @ :5125, `d.listingCompany` @ :5184). **Server safety net:** `app/api/crm/listings/[id]/route.ts` GET now pins `list_agent_full_name`/`list_office_name` (no `agent_info` reintroduced/synthesized; no new PII). Regression test `tests/runtime/crm-sale-with-tools-typed-first.test.ts` (red→green). Validation: type-check 0; crm:test 39/39; rls 0-err; ucba 0-regress; compliance-check 92/0 BLOCKER+STRICT; full runtime **2308/2308**. (idx:validate's 1 critical = pre-existing Cron Schedule Completeness, cron under hold — unrelated.) Repo-wide drop-safety sweep: **zero other agent_info-first readers remain.**
- Nothing executed: no SQL, no DB connect, no DROP, no fallback removal, no migration, no reclaim, no downgrade, no `public/crm/**` edit, no `.gitignore` change.

## This-session log (2026-06-22 — Codex #429 P2 sale-viewer fix, Maya-approved)
- **Verified Codex #429 P2** (Class A): `/crm/sale-view` → `SALE-FORM-WITH-TOOLS.html` is reachable (`vercel.json:68`, dashboard View button `workspace.js:4833`, `README.md:23`, stability contract `SALES-FORM-STABILITY-CONTRACT.md:38`) and read agent/company **agent_info-first** (`:4955-4956, :4990-4991`) → would blank attribution once #429 drops `agent_info` from the Prisma client. **The earlier "orphaned (0 refs) — retire" claim was WRONG** (corrected in §next-gate + §sweep above).
- **Client fix** (`public/crm/SALE-FORM-WITH-TOOLS.html`, Maya approved hold-lift for this change): both viewer blocks typed-first — `apiData.list_agent_full_name`/`list_office_name` → `(apiData.agent_info||{}).ListAgentFullName`/`.ListOfficeName` → `''`. Renamed the no-op `listingAgent` key → the **rendered** key `listingAgentName` (#423 no-op trap avoided; renderer reads `d.listingAgentName` @:5125, `d.listingCompany` @:5184).
- **Server safety net** (`app/api/crm/listings/[id]/route.ts` GET): pins `sanitized.list_agent_full_name`/`list_office_name` so a future `findListing()` select-narrowing can't blank attribution. **Did NOT reintroduce or synthesize `agent_info`; added no new agent PII.**
- **Test (TDD, red→green):** `tests/runtime/crm-sale-with-tools-typed-first.test.ts` — both blocks typed-first (×2), no-op `listingAgent` key stays gone, GET adds no `agent_info`, `sanitizeForCRM` preserves typed cols.
- **Validation:** type-check 0 · crm:test 39/39 · rls:validate 0-err · ucba:audit 0-regress · compliance-check 92/0 BLOCKER+STRICT · full runtime **2308/2308**. Pre-existing/unrelated: idx:validate 1 critical = Cron Schedule Completeness ("unchanged", cron HELD); compliance-check 1 HIGH workflow-completeness (not BLOCKER+STRICT).
- **Existing guards confirmed still green:** no `agent_info:true` select, schema/client removal, no DROP migration (`phase-d-no-runtime-agent-info-select.test.ts`); no destructive `db push --accept-data-loss` (`no-destructive-db-push.test.ts`).
- **Two report-only agents (no edits):** compliance verdict (PII boundary PASS, gates untouched, §175.25 not implicated for auth-gated CRM viewer) + repo-wide drop-safety sweep (**zero other agent_info-first readers**; all DTO tiers/syndication/cron/ops/generated artifact typed-first or absent-safe).
- **Still NOT done (gated):** #429 NOT merged; no SQL/DROP/migration/reclaim/downgrade; physical `agent_info` DB column retained.
