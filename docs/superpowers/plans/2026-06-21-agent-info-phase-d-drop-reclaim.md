# agent_info Phase D — DROP legacy JSON column + storage reclaim (REPORT-ONLY plan)

> **STATUS: REPORT-ONLY. NOTHING IN THIS DOCUMENT HAS BEEN EXECUTED.**
> No migration run, no DROP, no VACUUM/rewrite/reclaim, no Neon downgrade. All SQL below is marked **DO NOT RUN** and is gated on explicit Maya approval.
>
> **Board:** GitHub issue #415 (Lane 1). **Predecessors merged:** Phase A (#412/#413), A6 backfill (#416), Phase B readers (#417), **Phase C stop-writes (#420, merged `66120741`, prod smoke PASS).**

**Goal:** drop `listings.agent_info` (the legacy ~JSON column that is now write-frozen) and reclaim the storage so prod DB fits under the Neon Free 500 MB cap, enabling the Launch→Free downgrade (P2-MONEY). Phase D is the only irreversible step in the whole normalization.

**Canonical target DB (CLAUDE.md / NEON.md):** project `hidden-mountain-87248164` ("neon-green-school") · endpoint `ep-cold-waterfall-adno3ao2` · branch `main` (`br-crimson-frog-adr7g9gt`). The legacy `morning-bread-68708332` / `ep-royal-dawn` is STALE / do-not-serve. Any Phase D SQL must be host-guarded to cold-waterfall.

---

## 1. No-write-freeze confirmation (verified @ `66120741`)

Repo-wide grep/AST proof (runtime + ops, excluding tests):

- **TS Prisma JSON writes** (`agent_info: … as Prisma.InputJsonValue`): **0**.
- **Property assignments** (`.agent_info =`): only `lib/compliance/dto.ts:295/297` — `result.agent_info = { company } | null`. These build the **portal-mask OUTPUT object** (the sanitized DTO returned to the client), NOT a DB write. Safe.
- **`.mjs` ops data writes** (`agent_info:` with a non-`true` value): **0**.
- All remaining `agent_info:` occurrences are: destructure-omits (`const { agent_info: _x, ...rest } = mapped`), TS interface fields (`agent_info: unknown`), the portal allow-list intermediate (`dto.ts:381`, masked downstream), and retired-script log strings.

**Per-path confirmation (no agent_info DB write):**
| Path | Status |
|---|---|
| IDX sync (`lib/idx/sync.ts`, both upserts) | ✅ create destructure-omits, update writes typed only |
| reset-sync (`app/api/crm/listings/reset-sync`) | ✅ destructure-omit + typed only |
| feed-reconcile (`app/api/cron/feed-reconcile`) | ✅ destructure-omit |
| ensure-listing (`app/api/idx/ensure-listing`) | ✅ typed only |
| CRM POST (`app/api/crm/listings`) | ✅ typed only |
| CRM PATCH (`app/api/crm/listings/[id]`) | ✅ typed only (effectiveAgentInfo in-memory) |
| ops: set-exclusive / repair / import-closed | ✅ typed-first, no agent_info write |
| C4 backfill | ✅ retired (fails fast) |

**Static guard already in repo:** `tests/runtime/agent-info-phase-c-stop-json-writes.test.ts` fails CI on any new producer `agent_info` write. **Write-freeze holds.**

---

## 2. Read-fallback safety — every remaining `agent_info` read classified

### 2A. BLOCKER reads — `agent_info: true` Prisma SELECTs (must be removed BEFORE the DROP)
Selecting a dropped column throws at runtime AND becomes a TS error once the Prisma field is removed. These must be deleted first:
| File:line | Kind |
|---|---|
| `app/api/agents/[slug]/listings/route.ts:228` | runtime route select |
| `app/api/crm/listings/route.ts:84` | runtime route select (CRM grid GET) |
| `app/api/cron/data-retention/route.ts:212` | archiver select |
| `app/api/listings/route.ts:360` + `:1236` | public listings selects ×2 |
| `app/api/open-houses/route.ts:294` | open-houses select |
| `app/api/portal/favorites/route.ts:53` | portal favorites select |
| `scripts/audit-mallan-listing-side-ids.ts:152` | audit script select |
| `scripts/ops/repair-exclusive-agent-assignment.mjs:120` | ops select |
| `scripts/ops/set-exclusive-listing-agent.mjs:73` | ops select |
| `scripts/backfill-crm-exclusive-cotality-identity.mjs:72` | retired (dead, but remove for cleanliness) |

### 2B. BLOCKER reads — direct Prisma-result `.agent_info` (TS error after schema field removal)
These read the raw `findUnique`/`findMany` result's `agent_info` (not via an interface that declares it independently):
| File:line | Note |
|---|---|
| `app/api/crm/listings/[id]/route.ts:332` | `existingAgentInfo = listing.agent_info ?? {}` — only used to merge non-typed keys (ListAgentKey/ListOfficeKey) that are no longer persisted; the seed is already typed-first via `resolveListingAgentInfo`. Remove. |
| `app/listing/[...slug]/page.tsx:511` | `dbListing.agent_info || {}` — JSON fallback into `buildAssignedAgentDisplay`; resolver typed-first is primary. Remove / pass `{}`. |

### 2C. SAFE typed-first fallback reads (absent-safe; become no-ops after drop)
These read `agent_info` through an interface that declares it optional/`unknown`, and the resolver/`typedAgentColumnsFromJson` tolerate `undefined` (`(agentInfo ?? {})` → all-null). After the column is gone they harmlessly resolve to null and **typed columns win**:
- `lib/listings/agent-info-resolver.ts:59` — the resolver's JSON fallback (CORE; already absent-safe — **needs no change**).
- `lib/idx/db-to-public-dto.ts:285`, `lib/compliance/dto.ts:284`+`:381`, `lib/syndication/eligibility.ts:135` — interface-typed (`unknown`) reads; runtime `undefined` → `{}` → typed-first.
- In-memory (NOT DB) reads — unaffected by the drop: `lib/idx/sync.ts:341/1177`, `reset-sync:175`, `crm/listings:429`, `assigned-agent.ts:77` (all read `mapped.agent_info` / form objects, which still exist in memory because the mapper/helpers still BUILD agent_info in memory).

### 2D. Test/fixture, retired, unreferenced
- All `tests/**` + `lib/**/__tests__/**` fixtures referencing `agent_info` — test only.
- Retired: `scripts/backfill-crm-exclusive-cotality-identity.mjs` (fails fast).
- **⚠️ CORRECTION 2026-06-22 — the WITH-TOOLS forms are NOT all "unreferenced / no runtime impact" (the earlier classification was WRONG):**
  - `public/crm/RENTAL-FORM-WITH-TOOLS.html` **IS reachable** — opened from the rentals CRM dashboard at `public/crm/js/dashboard/panels/rentals-crm/index.js` (`window.open('/crm/RENTAL-FORM-WITH-TOOLS.html?id=...')`, the rental-listing view path). It hydrates `(apiData.agent_info||{}).ListAgentFullName / .ListOfficeName` **NON-typed-first** → if `agent_info` is dropped before this is handled, the agent/company display on a **reachable** rental CRM form goes BLANK. **This is a Phase D BLOCKER / manifest item, NOT dead code.**
  - `public/crm/SALE-FORM-WITH-TOOLS.html` appears orphaned (no reference found in current search) but **must be inventoried before deletion**, not assumed dead.
  - Both are legacy duplicates of the canonical `*-REDESIGN.html` forms (source-of-truth charter forbids parallel duplicates). `public/crm/**` stays **HELD** — any form/dashboard edit is a separate Maya approval.

### 2E. Unsafe/blocker reads that would PREVENT Phase D
**One reachable CRM-form blocker — corrected 2026-06-22 (see §2D).** `RENTAL-FORM-WITH-TOOLS.html` (reachable via `rentals-crm/index.js`) reads `agent_info` non-typed-first and would lose agent/company display after the DROP. The §2A selects + §2B direct reads remain *mechanical removals* (code already resolves typed-first). **No DB reader depends on `agent_info` as a source of truth**, but the reachable rental WITH-TOOLS form depends on it for display. Phase D read-safety: **GREEN for DB readers, with ONE CRM-form blocker** that must be resolved (repoint / typed-first / retire) before the DROP.

### 2F. CRM route/form `agent_info` inventory — COMPLETE (2026-06-22, report-only)
Full sweep of `public/crm/**` html + js (reachability, agent_info vs typed-column reads):

| Form | Size | Reachable? | Opens from | Reads agent_info? | Typed-first? | Phase D impact |
|---|---|---|---|---|---|---|
| `SALE-FORM-REDESIGN.html` | 752 KB | ✅ served | sales-crm:1529, panels.js, manage-listings | yes (fallback) | ✅ **yes** (10 typed reads) | SAFE — typed-first |
| `RENTAL-FORM-REDESIGN.html` | 524 KB | ✅ served | rentals-crm:1364 (create), panels.js, manage-listings | yes (fallback) | ✅ **yes** (line 6944: `list_agent_full_name \|\| agentInfo… \|\| raw…`) | SAFE — typed-first |
| `RENTAL-FORM-WITH-TOOLS.html` | 574 KB | ✅ **REACHABLE** | **rentals-crm `_viewListing()` — "View Listing" button (index.js:517 → :1365), `?id=` view/edit of existing rental** | yes (4 sites) | ❌ **NO** (0 typed reads) | **BLOCKER** — agent/company blank after DROP |
| `SALE-FORM-WITH-TOOLS.html` | 559 KB | ⚠️ orphaned | (0 JS references) | yes (4 sites) | ❌ NO | Not live; legacy duplicate — inventory-then-retire |
| `BUYER-DEAL-FORM` / `TENANT-DEAL-FORM` / `dashboard` / `index` / `dev` / `login` `.html` | — | served (various) | — | **no** (0) | — | unaffected |
| `index-built.html` | 2.5 MB | generated artifact | `npm run crm:build` | yes (embedded) | reflects sources | **REBUILD, never hand-edit** after source fix |
| `js/core/data-loader.js` | — | core data layer | — | yes (passes listing through) | n/a (carrier) | verify it doesn't strip typed cols; not a display blocker itself |

**Exact Phase D CRM blocker list (provably complete as of `66120741`):**
1. **`RENTAL-FORM-WITH-TOOLS.html`** + its opener `public/crm/js/dashboard/panels/rentals-crm/index.js` (`_viewListing` at :1365, button at :517) — reachable, non-typed-first → **hard blocker before DROP.**
2. **`index-built.html`** — generated; will carry the WITH-TOOLS/agent_info refs until sources are fixed + `npm run crm:build` re-run. (Never hand-edit.)
3. **`SALE-FORM-WITH-TOOLS.html`** — orphaned (not a live blocker) but a legacy duplicate to retire in the same CRM cleanup.

**Recommended fix per blocker:**
- **Rental view path (#1):** **A (preferred) — repoint `_viewListing()` to `RENTAL-FORM-REDESIGN.html?id=…`** *if* REDESIGN supports `?id=` view/edit hydration (VERIFY first; REDESIGN is the canonical editor manage-listings already uses). Else **B — make `RENTAL-FORM-WITH-TOOLS.html` typed-first** (add `list_agent_full_name ||` before each `agent_info.ListAgentFullName`/`ListOfficeName`, 4 sites). **C — retire** only after proving REDESIGN covers the view/edit-by-id workflow.
- **`SALE-FORM-WITH-TOOLS.html` (#3):** **C — delete after proof** (0 references confirmed).
- **`index-built.html` (#2):** rebuild via `npm run crm:build` after the source forms are fixed.

**Tests needed (added with the eventual CRM PR):**
- Rentals "View Listing" path resolves agent/company from **typed columns** (REDESIGN-by-id, or typed-first WITH-TOOLS), with `agent_info` absent.
- Static guard: **no served CRM form reads `agent_info` non-typed-first** (grep guard, sibling to `agent-info-phase-c-stop-json-writes`).

**Files to touch LATER (HELD — `public/crm/**`, separate Maya approval — NOT now):** `rentals-crm/index.js` (repoint) **or** `RENTAL-FORM-WITH-TOOLS.html` (typed-first); `SALE-FORM-WITH-TOOLS.html` (delete); `index-built.html` (rebuild only); new tests.
**Files that must NOT be touched yet:** all `public/crm/**`; the REDESIGN forms (already typed-first — leave alone); `index-built.html` (generated — never hand-edit).

---

## 3. Production SQL prechecks — **DO NOT RUN** (read-only; run only after Maya approval, host-guarded to cold-waterfall)

> These are READ-ONLY. They MUST be run (and reviewed) before any DROP to (a) confirm no row has agent_info data without typed coverage, and (b) measure the real reclaim. **Not run as part of this report.**

```sql
-- [DO NOT RUN WITHOUT MAYA GO] Connect host-guarded to ep-cold-waterfall-adno3ao2 only.

-- P1. Row count
SELECT count(*) AS total_rows FROM listings;

-- P2. Rows with a non-null/non-empty agent_info JSON
SELECT count(*) AS agent_info_present
FROM listings
WHERE agent_info IS NOT NULL AND agent_info::text NOT IN ('{}','null');

-- P3. SAFETY: rows where agent_info has an agent name but the typed column is blank
--     (a >0 result is a DROP BLOCKER — would lose attribution). Expect 0 after A6 + Phase C.
SELECT count(*) AS typed_gap_rows
FROM listings
WHERE COALESCE(NULLIF(btrim(agent_info->>'ListAgentFullName'),''), NULLIF(btrim(agent_info->>'name'),'')) IS NOT NULL
  AND NULLIF(btrim(list_agent_full_name),'') IS NULL;

-- P4. MISMATCH sample: typed value differs from JSON-derived (audit, not necessarily a blocker)
SELECT listing_id,
       list_office_name, agent_info->>'ListOfficeName' AS json_office,
       list_agent_email, agent_info->>'ListAgentEmail' AS json_email
FROM listings
WHERE NULLIF(btrim(list_office_name),'') IS DISTINCT FROM NULLIF(btrim(agent_info->>'ListOfficeName'),'')
LIMIT 50;

-- P5. Logical byte size of the agent_info JSON across the table
SELECT pg_size_pretty(sum(pg_column_size(agent_info))) AS agent_info_logical_bytes,
       pg_size_pretty(avg(pg_column_size(agent_info))::bigint) AS avg_per_row
FROM listings;

-- P6. Table / TOAST / index sizes BEFORE drop
SELECT pg_size_pretty(pg_total_relation_size('listings'))      AS total_incl_toast_idx,
       pg_size_pretty(pg_relation_size('listings'))            AS heap_only,
       pg_size_pretty(pg_total_relation_size('listings') - pg_relation_size('listings')) AS toast_plus_idx;

-- P7. Current total DB size
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

-- P8. Confirm target DB identity (must be the cold-waterfall / hidden-mountain prod)
SELECT current_database(), inet_server_addr(), version();
-- Cross-check against ASSISTANT/DATABASE_URL host = ep-cold-waterfall-adno3ao2 before trusting any result.
```

**Decision rule:** P3 (`typed_gap_rows`) MUST be `0` before the DROP. P5–P7 size the reclaim and decide the strategy in §4.

---

## 4. Phase D strategy (to be finalized once §3 numbers exist)

### 4.1 Ordering — code-first, then migration, then reclaim (REVERSE of the add-column order)
A deployed app that references a dropped column crashes. So:
1. **Step A (code):** remove the §2A selects + §2B direct reads. Keep the column in the DB. Deploy. Soak (e.g. 24–48 h) — the app now never touches `agent_info`.
2. **Step B (migration):** remove the `agent_info` field from `prisma/schema.prisma`; generate the migration (`ALTER TABLE "listings" DROP COLUMN "agent_info";`). Per NEON.md, apply to prod (cold-waterfall) **after** Step A is live, then deploy the schema change. The DROP itself is metadata-only and fast (brief `ACCESS EXCLUSIVE` lock).
3. **Step C (reclaim):** see §4.2 — the actual byte reclaim.

### 4.2 Reclaim method — Neon-safe options (NEON.md: **never `VACUUM FULL` on Neon**)
`ALTER TABLE DROP COLUMN` does **not** free the bytes — the old values stay in each heap tuple until the row is rewritten. Options, to be chosen by the §3 numbers:
| Option | Mechanism | Lock | Pros | Cons |
|---|---|---|---|---|
| **A. `pg_repack`** | online table rewrite | brief locks only | no long outage; full reclaim | requires the `pg_repack` extension (confirm Neon support); operational care |
| **B. Full-table rewrite via no-op `ALTER COLUMN … TYPE`** | rewrites heap | `ACCESS EXCLUSIVE` for the whole rewrite (~109K rows) | simple, no extension | blocks reads+writes during rewrite — needs a maintenance window |
| **C. `pg_dump` table/DB → restore into a fresh Neon branch/project → repoint `DATABASE_URL`** | compact reload | window + cutover | guaranteed-minimal footprint; mirrors the 2026-06-02 cross-project rescue | heaviest; cutover + env-var change (HELD area) |
| **D. DROP + rely on autovacuum + Neon retention aging** | passive | none | zero-touch | slow/uncertain; bytes persist until pages age out of the PITR window |

**Neon-specific caveat (must verify before promising a downgrade):** Neon bills/free-caps on logical data size, and reclaimed pages may not leave the branch's storage until they age out of the **PITR retention window**. So even after a successful rewrite, the size may not drop below 500 MB until the retention window passes (and/or retention is temporarily reduced). The §3 P5–P7 numbers + a post-reclaim re-measure are required to confirm; Neon support/docs may be needed to confirm the retention-lag behavior.

### 4.3 Expected reduction
Prior session measurement (2026-06-12 audit) put the legacy JSON on `listings` at **~648 MB**, the dominant blocker to the <500 MB Free cap. Phase C froze it (no further growth) but did not shrink it. The §3 P5 measurement will confirm the *current* `agent_info` logical size; the §3 P6/P7 will confirm whether dropping+reclaiming it gets the DB under 500 MB **with margin**. **Do not promise the downgrade until P5–P7 (and a post-reclaim re-measure) prove it.**

---

## 5. Code changes required (Phase D PR — only after §3 prechecks pass)
1. Remove all §2A `agent_info: true` selects (10 sites).
2. Remove the §2B direct Prisma-result reads (`crm/[id]:332`, `page.tsx:511`).
3. **Resolver:** LEAVE the JSON fallback (`agent-info-resolver.ts:59`) — it is already absent-safe (no-op after drop). Recommended over removing it (lower risk; keeps the seam if a future feed re-introduces JSON). Optionally, drop the fallback line in a *separate* follow-up once soaked.
4. Optionally simplify the §2C interface reads (`dto.ts`, `db-to-public-dto.ts`, `eligibility.ts`) — not required (absent-safe), do for cleanliness.
5. Remove `agent_info` from `prisma/schema.prisma`; add the DROP-COLUMN migration.
6. **WITH-TOOLS forms (BLOCKER — corrected 2026-06-22). Add to manifest: `public/crm/RENTAL-FORM-WITH-TOOLS.html` + `public/crm/js/dashboard/panels/rentals-crm/index.js`.** Resolve the reachable rental path by ONE of: **(A)** repoint the dashboard view path to `RENTAL-FORM-REDESIGN.html` if behavior is equivalent + tested; **(B)** make `RENTAL-FORM-WITH-TOOLS.html` typed-first; **(C)** formally retire the WITH-TOOLS forms after proving no active workflow depends on them. Inventory `SALE-FORM-WITH-TOOLS.html` before deleting. `public/crm/**` is HELD — separate approval; do NOT edit forms yet. Plus clean the retired C4 script.
7. Update tests/static guards: the Phase C static guard, the resolver tests (add an explicit "absent agent_info → typed-only" test), and remove fixtures that depend on the column existing.
8. Update docs: `NEON.md`, `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` if it references the column, and #415.

---

## 6. Hard gates before ANY execution
- **Explicit Maya approval required before the DROP migration.**
- **Explicit Maya approval required before any storage rewrite/reclaim** (Option A/B/C).
- **No Neon downgrade** until §3 P5–P7 + a post-reclaim re-measure prove the DB is below the Free cap **with margin** (and the retention-lag is accounted for).
- **Snapshot/branch backup REQUIRED before the DROP** (see §7).
- No CRM feature work, no unrelated compliance fixes mixed into the Phase D PR.
- Host-guard every SQL/migration to cold-waterfall; verify with §3 P8 before trusting results.

---

## 7. Rollback plan
- **Before the DROP (Steps A/B reversible):** Step A (code) and Step B (schema) are normal PR reverts; the column still exists until the migration runs.
- **The DROP is the irreversible point.** Once `agent_info` is dropped, the JSON values are GONE (typed columns retain the attribution that mattered; non-typed keys like ListAgentKey/ListOfficeKey are lost — confirmed non-essential).
- **Backup path:** take a **Neon branch/snapshot of `br-crimson-frog-adr7g9gt` immediately before the DROP** (Neon point-in-time branch). Rollback = restore/repoint to that branch (mirrors the 2026-06-02 rescue runbook). This is the ONLY way to recover the JSON after the DROP.
- **App rollback:** revert the Phase D code PR (re-adds the selects); only valid while the column still exists — after the DROP, the re-added selects would error, so app rollback must pair with the snapshot restore.
- **Data rollback limit:** after DROP + reclaim + PITR retention aging, the pre-drop state is only recoverable from the explicit snapshot (not from normal PITR once it ages out). Keep the snapshot until the downgrade is proven stable.
- **Emergency stop conditions:** §3 P3 `typed_gap_rows` > 0; P8 shows a non-cold-waterfall host; reclaim lock exceeds the window; post-reclaim size not below cap; any reader 500 in post-deploy smoke → STOP, restore snapshot.

---

## 8. Recommendation

**Recommendation: do NOT execute Phase D yet — proceed to the gated PRECHECK step first, then decide.**

Phase D is *code-ready* (the write-freeze holds; reads are typed-first and absent-safe; the resolver survives the drop unchanged). The decision to actually DROP + reclaim + downgrade hinges entirely on the **§3 read-only production measurements**, which have NOT been run (report-only).

**Exact blockers before execution:**
1. **§3 prechecks not yet run** — need P3 (`typed_gap_rows = 0`, the data-safety gate) and P5–P7 (size, to confirm the reclaim actually clears the 500 MB cap with margin). *(Read-only; run with Maya's go.)*
2. **Reclaim method undecided** — depends on whether `pg_repack` is available on Neon and on the measured size; the Neon PITR-retention reclaim lag must be confirmed.
3. **§2A/§2B code removals + the reachable `RENTAL-FORM-WITH-TOOLS` hydration fix (§2D correction) + DROP migration + snapshot** — not done (this is plan-only).
4. **Maya approval gates (§6)** — not given.

**Suggested sequence (each gated):** run §3 prechecks (read-only) → review numbers + pick reclaim method → open the Step-A code PR (remove selects/reads) → soak → snapshot → Step-B DROP migration → Step-C reclaim → re-measure → only then propose Launch→Free downgrade.

**Phase D is NOT started. `agent_info` not dropped. JSON fallback intact (absent-safe). Neon not downgraded. No SQL run.**
