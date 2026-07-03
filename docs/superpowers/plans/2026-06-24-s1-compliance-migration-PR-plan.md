# S1 `compliance` migration — concrete PR plan (PLAN ONLY)

> **PLAN ONLY — NO IMPLEMENTATION.** No code, no schema, no migration, no SQL writes, no strip,
> no reclaim, no downgrade, no env/Vercel change, no new Neon branch. Date 2026-06-24 · #415.
> Builds on `2026-06-24-s1-compliance-storage-front-probe.md`.

## Goal
Eliminate the redundant `listings.compliance` Trestle-copy storage (~202 MB) without breaking public
render, CRM, syndication, IDX compliance, or future approval workflows — by **removing the lone
render read, stopping the idx-sync writer, then stripping the redundant bytes**. The column is
**retained** (not dropped) for the tiny CRM/syndication-authored subset → **no schema change**.

## Shape of the change (3 gated steps, decomposed)
| Step | What | Inert? |
|---|---|---|
| **PR-1 (code-only)** | render repoint (`PublicRemarks`→`raw_data`) + writer stop (idx-sync writes `compliance: {}`) + tests | New Trestle rows carry empty compliance; render no longer reads the column. Existing bytes remain (table doesn't shrink yet) → safe. |
| **Strip (gated data op)** | batched `UPDATE compliance='{}'` on Trestle-sourced rows, EXCLUDING CRM/syndication-authored rows; dry-run first | Reclaims ~202 MB of dead-redundant copy |
| **Reclaim (gated)** | PITR-elapse + autovacuum → measure Neon bytes → `pg_repack` if needed | Actually shrinks disk |
**No `DROP COLUMN`, no schema/migration** — the column stays for CRM/syndication's small authored data.

---

## 1. Consumer proof (8-probe scan; DB-column readers vs domain/typed-object readers)

**Reads of the DB `listings.compliance` column (Prisma row):**
| Site | Read | Verdict |
|---|---|---|
| `app/listing/[...slug]/page.tsx:553,629` | `compliance.PublicRemarks` as fallback after `features.PublicRemarks` | **The only real DB-column render read.** Removable — `raw_data.PublicRemarks` is a proven superset (S1: in_compliance 109,588 ⊂ in_raw_data 109,595; `only_in_compliance=0`). |
| `lib/syndication/eligibility.ts:136` | `asRecord(listing.compliance)` → `syndication`/`mallan_control_verification`/`seller_advertising_authorization`/`media_rights` | **0 rows today** (HELD). Preserved by retaining the column for CRM-authored rows (§4). |
| `app/api/crm/sales/listings/route.ts:63-64` | `l.compliance.Permissions` | `Permissions` key on **0 rows** → `undefined` today. Preserved by column retention. |

**Readers that look like compliance but DO NOT read the DB column (proven by type):**
| Site | Why it's NOT the DB column |
|---|---|
| `lib/compliance/idx-display-gate.ts:26-61` (`isDisplayableInIDX`/`canDisplayAddress`/`getComingSoonDate`) | Param type is **`Listing` from `@/lib/types/listing`** (the camelCase **domain model**), not the Prisma `listings` row. Its keys (`idxOptOut`, `internetEntireListingDisplayYN`, `participantOnlyNetwork`, `comingSoonDate`) are **absent from the stored PascalCase JSON** — it reads a mapped object, not `dbListing.compliance`. Production DB render builds `PublicListingDTO` (manual), which uses the **typed gate columns** (`idx_display_yn`, `internet_*`, `participant_only`, `owner_opt_out`), not this gate. |
| `lib/compliance/reso-mapper.ts:304-306` | Same `Listing` domain type; camelCase `idxOptOut`/`vowOptOut`/`syndicationOptOut` absent from the stored column. |
| `lib/idx/display-adapter.ts:239-240`, `app/components/ListingSidePanel.tsx:164` | `compliance.comingSoonDate` (camelCase) — not a stored key → `undefined` today; comingSoon derived from status/ActivationDate. |
| All `_compliance:` sites (`app/api/listings/**`, `app/api/agents/**`, market/buildings) | `_compliance` (underscore) is a **DTO output attribution field** (`{source, attribution, disclaimer}`), unrelated to the DB column. |

**Verification tasks the PR must perform (prove, don't assume):**
- Confirm `idx-display-gate.ts` / `reso-mapper.ts` param types resolve to `@/lib/types/listing`, and grep their call sites to confirm none pass a Prisma `listings` row's `compliance`.
- Confirm the production detail render path (`dbListingToPublicDTO` / `page.tsx`) is the ONLY DB-column compliance reader besides syndication/CRM.
- Confirm no raw SQL reads `compliance` (S1: none found in `queryRaw*`).

**Public-render `PublicRemarks` fallback proof:** priority is `features.PublicRemarks → compliance.PublicRemarks → ''`. idx-sync writes `PublicRemarks` into `compliance` (mapper B18) and into `raw_data` (kept by `RAW_DATA_KEEP_FIELDS`); import-closed writes it into `features`. After repoint to `features.PublicRemarks || raw_data.PublicRemarks`, every row is covered (S1-proven). 

## 2. Render repoint
- `app/listing/[...slug]/page.tsx:629`: change `String(features.PublicRemarks || compliance.PublicRemarks || '')` → `String(features.PublicRemarks || rawData.PublicRemarks || '')` (rawData = `dbListing.raw_data`); **remove the `compliance` read at `:553`** (and any other `compliance.*` render use — only `PublicRemarks`).
- Mirror-check the search/card + `dbListingToPublicDTO` paths use `features`/`raw_data`/typed columns for remarks, not `compliance` (S1 shows cards don't read compliance; confirm).
- **Proof PublicRemarks survives strip:** S1 redundancy (`only_in_compliance=0`) + `RAW_DATA_KEEP_FIELDS` includes `PublicRemarks` → `raw_data.PublicRemarks` reliable post-strip.
- **Tests:** listing-detail renders remarks from `raw_data` when `compliance={}` (RED on main if render still reads compliance); renders from `features` when present; empty when neither.

## 3. Writer stop
- **Locate:** `lib/idx/trestle-mapper.ts:1090-1092` builds `const compliance = { ...pick(raw,B3), ...pick(raw,B4), ...pick(raw,B18) }`; written at `lib/idx/sync.ts:326,359,1179,1206`, `app/api/cron/feed-reconcile/route.ts:383`, `app/api/crm/listings/reset-sync/route.ts:141,172` (all via the same mapper output).
- **Change:** make `mapTrestleToPrisma` emit `compliance: {}` (stop copying the Trestle bulk). The **typed gate columns** (`idx_display_yn`, `internet_*_display_yn`, `participant_only`, `owner_opt_out`, `status`) are unchanged — they are the real gate source, derived from `raw.*` directly, NOT from `mapped.compliance`.
- **Verify no in-memory consumer of `mapped.compliance`:** the projection builder reads `features`/`media`/`address` (not compliance); RESO/gate logic reads `raw.*`/typed columns. Confirm nothing downstream of the mapper reads `mapped.compliance` before/after the DB write.
- **Rehydration proof:** after the change, the next incremental sync upserts `compliance: {}` (not a refill) → a stripped row stays empty. (This is the durability fix the S1 writer-blocker required.)
- **CRM writers untouched:** `app/api/crm/listings/[id]/route.ts:468` + `route.ts:225` still write `{ validation_result: … }` directly — so CRM-authored compliance persists independently of the mapper.

## 4. Retained-key strategy
The CRM/syndication/future subset is **tiny and authored separately** from the Trestle copy:
- `validation_result`/`warnings`/`rls_eligibility`/`validated_at`/`valid`/`stripped_fields` — **6–7 rows** (CRM validation).
- `syndication`/`mallan_control_verification`/`seller_advertising_authorization`/`media_rights` — **0 rows** today (HELD; future CRM/syndication approval).
- `Permissions` — **0 rows**.

**Decision: RETAIN the `compliance` column (no drop, no new typed columns now).** Rationale:
- The column is already nullable JSON; CRM/syndication continue writing their small subset directly.
- These keys are NOT the Trestle bulk — stripping the bulk leaves the column free for authored data.
- 0-count syndication keys → **no retention action needed now**; the column simply remains available when syndication is un-HELD.
- The strip (§5) **excludes** any row carrying a CRM/syndication key, so authored data is never wiped.
- (Future option, separate: if CRM compliance grows, normalize `validation_result`/approvals into typed columns — out of scope here.)

## 5. Strip strategy (gated data op — NOT in PR-1)
- **Dry-run first** (`scripts/__s1-compliance-strip-dryrun.mjs`, read-only): count + bytes of rows eligible = `compliance <> '{}'` AND **NOT** `compliance ?| array['validation_result','warnings','rls_eligibility','validated_at','valid','stripped_fields','syndication','mallan_control_verification','seller_advertising_authorization','media_rights','Permissions']`. Report MB reclaimable (expect ~202 MB) and excluded-row count (~7).
- **Strip only after** render repoint + writer stop + full test suite are merged and proven on production (new syncs writing `{}`, render serving remarks from `raw_data`).
- **Phasing:** terminal rows first (165 MB; not publicly rendered → lowest risk), verify, then live rows (37 MB) after confirming live detail pages render remarks from `raw_data`. Bounded batches (e.g. 5–10k/UPDATE) to keep transactions small.
- **Safety:** the Trestle copy is **100% redundant with `raw_data`** (S1), so the strip loses nothing not in `raw_data`; CRM/syndication rows are excluded. Pre-strip **Neon snapshot** regardless.
- **Stop/rollback conditions:** stop if any batch errors, if a post-batch render check fails to show remarks, or if excluded-row count drifts; rollback via Neon PITR/snapshot (and the data is recoverable from `raw_data` anyway).

## 6. Tests
- **Public listing detail renders remarks** from `raw_data`/`features` with `compliance={}` (RED→GREEN); empty-state safe.
- **Search/listing cards unaffected** — assert card remarks/fields derive from `features`/`raw_data`/typed columns, not `compliance`.
- **CRM sale/rental edit loaders unaffected** — `data-loader.js`/GET return path doesn't depend on Trestle-copy compliance (it reads address/features/agent_info/media); CRM `validation_result` round-trips.
- **Syndication eligibility preserved** — `eligibility.ts` still reads its approval keys; strip excludes rows carrying them; add a test that an approval-bearing row is NOT stripped (predicate guard).
- **IDX display gate unaffected** — `idx-display-gate.ts` reads the `Listing` domain type, not the DB column; add a guard test asserting production display gating uses typed columns (`computeGateColumns`/`idx_display_yn`), independent of `listings.compliance`.
- **No public DTO leak** — assert the public/portal DTO never serializes the raw `compliance` object (extends the existing `portal-dto.test.ts:142` `compliance` undefined assertion to the public DTO).
- **Sync no longer rewrites full compliance JSON** — mapper unit test: `mapTrestleToPrisma(...).compliance` equals `{}` (no B3/B4/B18 copy); update any existing mapper/compliance-gates test that asserted those keys.

## Proposed file list
| # | File | Change |
|---|---|---|
| 1 | `app/listing/[...slug]/page.tsx` | render repoint: `PublicRemarks` ← `features`/`raw_data`; drop `compliance` read |
| 2 | `lib/idx/trestle-mapper.ts` | `mapTrestleToPrisma` emits `compliance: {}` (stop Trestle bulk copy); typed gate columns unchanged |
| 3 | `lib/idx/__tests__/trestle-mapper-*.test.ts` | assert `compliance === {}`; update any key-presence assertions |
| 4 | `tests/runtime/listing-detail-remarks.test.ts` (NEW) | remarks render without compliance |
| 5 | `tests/runtime/compliance-column-consumers.test.ts` (NEW) | display-gate uses typed columns; no public DTO leak; syndication strip-exclusion guard |
| 6 | `scripts/__s1-compliance-strip-dryrun.mjs` (NEW, untracked) | read-only dry-run estimate |
| 7 | `docs/audits/corrections/s1-compliance-migration-trace.md` (NEW) | trace record (blast radius, RED→GREEN, gates) |
*(No `prisma/schema.prisma`, no migration dir — the column is retained.)*

## 7. Reclaim note
`UPDATE compliance='{}'` creates dead tuples; it does **not** shrink disk immediately. Neon billed
size drops only after the old pages age past the PITR window (7 d Launch) + autovacuum; hard
compaction via **`pg_repack`/online copy-swap**, **never `VACUUM FULL`** on production. Reclaim is a
**separate, gated** step after the strip; the Free go/no-go uses **measured Neon bytes**, not the
~202 MB estimate. (202 MB → DB ~933 MB — still over the ~477 MiB Free cap; biggest clean
contributor, not a standalone unlock.)

## 8. Approval gates (each separate, explicit)
1. **PR plan approval** (this doc).
2. **PR-1 code approval** (render repoint + writer stop + tests) — no schema/migration; the §G chain + tristle (touches a §D render/IDX-compliance surface — confirm no display-gate regression).
3. **Dry-run approval** (read-only estimate).
4. **Strip/write approval** (the gated `UPDATE` data op) — + pre-strip Neon snapshot; phased terminal→live.
5. **Reclaim approval** (`pg_repack`/PITR-measure) — never `VACUUM FULL`.

## Hard limits honored
Plan only. No code, schema, migration, SQL writes, strip, reclaim, downgrade, env/Vercel change, or new Neon branch.
