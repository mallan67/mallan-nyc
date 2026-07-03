# S1 compliance STRIP — dry-run + execution plan (PLAN ONLY)

> **PLAN ONLY — NO STRIP, NO SQL WRITES, NO RECLAIM, NO DOWNGRADE, NO env/Vercel change, no new
> Neon branch.** The dry-run below is READ-ONLY (SELECT, read-only txn, ROLLBACK). Date 2026-06-24 ·
> #415. Builds on the merged PR #445 (render/writer repoint) + the S1 probe/migration plan.

## 1. Pre-strip state & deploy precondition
- **#445 is on `main`** (squash `6c09d6ec`) and the **Vercel production deploy on that commit succeeded** (commit status: Vercel = success). So production now runs the mapper that emits `compliance: {}` on create **and** the writers that OMIT compliance on update (`complianceUpdatePatch()`).
- **Durability precondition (MUST hold before any strip):** the strip is only safe once the writer-stop is live, otherwise a sync between strip and deploy would re-bloat. Two checks at strip time:
  1. Confirm the production deployment is **READY** on `6c09d6ec` (Vercel dashboard / `get_deployment`).
  2. Allow **≥1 idx-sync cron cycle (10 min)** to pass post-deploy so no pre-deploy sync is mid-write, then **re-verify in DB**: rows with `modification_timestamp` after the deploy time should have `compliance = '{}'` (proves the live mapper writes empty). If any freshly-synced row still has a populated Trestle copy, STOP — the deploy isn't effective; do not strip.

## 2. Dry-run query (READ-ONLY) — and its measured result
Script: `scripts/__s1-compliance-strip-dryrun-2026-06-24.mjs` (host-guarded, read-only txn, ROLLBACK).
**Measured 2026-06-24:**
| Metric | Value |
|---|---|
| Strip-eligible rows / bytes | **110,023 / 202 MB** |
| — terminal | **92,768 / 165 MB** |
| — live/other | **17,255 / 37 MB** |
| Excluded (authored) rows / bytes | **7 / 3,266 bytes** (all `validation_result`; 0 syndication; 0 `Permissions`) |
| Already empty (`{}`/null) | 34 |
| **Whitelist vs authored-key disagreement** | **0** (`unknown_excluded = 0` — predicates provably equivalent) |
Re-run this dry-run immediately before each phase to confirm counts haven't drifted.

## 3. Strip predicate (exact)
Strip a row's `compliance` to `'{}'` **only when every top-level key is a redundant Trestle-copy key** (the B3∪B4∪B5∪B6∪B7 whitelist from `lib/idx/trestle-mapper.ts`). Expressed as "no key outside the whitelist":
```sql
compliance IS NOT NULL
AND compliance::text <> '{}'
AND NOT EXISTS (
  SELECT 1 FROM jsonb_object_keys(compliance) AS k
  WHERE k <> ALL (ARRAY[
    -- B3
    'ListingAgreement','ListingContractDate','ExpirationDate','OriginalEntryTimestamp','ListingService','MlsStatus','DuplicateListingIDs','ParticipantTypes','ExclusiveAgency','InternetEntireListingDisplayYN','InternetAddressDisplayYN','SyndicationRemarks','Permission',
    -- B4
    'StandardStatus','SourceSystemModificationTimestamp','ModificationTimestamp','StatusChangeTimestamp','ActivationDate','ActivationTimestamp','OnMarketDate','OffMarketDate','OffMarketTimestamp','BackOnMarketDate','BackOnMarketTimestamp','ContractStatusChangeDate','PurchaseContractDate','CloseDate','ClosePrice','CancelationDate','WithdrawnDate','DaysOnMarket','CumulativeDaysOnMarket','PendingTimestamp','ContingentDate','AvailabilityDate','ComingSoonDate','ComingSoonTimestamp','ActiveOpenHouseCount','OriginalListPrice','PreviousListPrice','ListPriceLow','ListPrice','LastChangeType','LastChangeTimestamp',
    -- B5
    'SpecialListingConditions','SaleType','Concessions','ConcessionsAmount','ConcessionsComments','AuctionType','LeaseAmount','LeaseAmountFrequency',
    -- B6
    'InternetAutomatedValuationDisplayYN','InternetConsumerCommentYN','SyndicateTo','ListingURL',
    -- B7
    'PublicRemarks','PrivateRemarks','ShowingInstructions','ListingTerms','Disclaimer','CopyrightNotice','PropertyCondition'
  ])
)
```
The write is `SET compliance = '{}'::jsonb`. (The whitelist is the single source of truth — keep it in sync with the mapper's B-constants if those ever change.)

## 4. Exclusion predicate (what is NEVER stripped)
Any row with **a key outside the whitelist** is excluded — which is exactly the authored set. Cross-checked (belt + suspenders) against the explicit authored-key list, with **identical results** (`unknown_excluded = 0`):
- CRM validation: `validation_result`, `warnings`, `rls_eligibility`, `validated_at`, `valid`, `stripped_fields` (today: 7 rows, all `validation_result`).
- Syndication approvals (future): `syndication`, `mallan_control_verification`, `seller_advertising_authorization`, `media_rights` (today: 0).
- CRM read key: `Permissions` (today: 0).
- **Any unknown/future authored key** → automatically excluded by the whitelist (this is why the whitelist approach is preferred over a fixed exclusion list).
- **Optional belt-and-suspenders:** additionally require `agent_id IS NULL` (Trestle-sourced) to be doubly sure CRM exclusives are never touched — though the whitelist already excludes them.

## 5. Phase plan
- **Phase 1 — terminal rows first** (`status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled')`): 92,768 rows / 165 MB. Lowest risk — terminal listings are excluded from all public render/search, so a render regression is impossible here.
- **Phase 2 — live/other rows** (17,255 / 37 MB): only after Phase 1 passes **and** the post-Phase-1 smoke (incl. live detail-page render proof) is green. Live rows are publicly rendered, so this phase carries the (already-mitigated) render risk.
- Re-run the dry-run before each phase.

## 6. Batch plan
- **Batched keyset UPDATE**, ~**5,000 rows/statement**, looped until 0 rows affected:
  ```sql
  UPDATE listings SET compliance = '{}'::jsonb
  WHERE id IN (
    SELECT id FROM listings
    WHERE <phase status filter> AND <strip predicate §3>
    ORDER BY id LIMIT 5000
  );
  ```
- **Safeguards:** `SET lock_timeout = '5s'; SET statement_timeout = '30s';` per batch; one batch per transaction (auto-commit) so locks are short; brief pause between batches.
- **Stop conditions (halt immediately):** any batch error/timeout · a batch affects more rows than the dry-run predicted · the excluded-row count changes from 7 (drift) · `unknown_excluded` > 0 on a re-run · any post-batch smoke failure (§8). On stop: do not proceed; investigate; rollback if needed (§9).
- **Throughput:** ~110K rows ÷ 5K ≈ 22 batches — minutes, not a marathon. (Could run larger batches, but 5K keeps lock/tuple churn small.)

## 7. Required pre-strip proof (PROOF-FIRST — live, not source-only)
Before Phase 1 (and re-confirm before Phase 2):
1. **Listing detail renders remarks from features/raw_data** — live URL probe on production: a terminal listing detail page AND a live listing detail page both render `publicRemarks` (sourced post-#445 from `features`/`raw_data`). (`only_in_compliance = 0` guarantees raw_data coverage.)
2. **Public DTO does not expose compliance** — probe `/api/listings` (and the detail DTO) on production; assert no `compliance` object in the payload (the S1 test already pins this).
3. **CRM `validation_result` preserved** — query the 7 excluded rows pre-strip; confirm they carry `validation_result` and are NOT in the strip-eligible set.
4. **Syndication eligibility preserved** — confirm `lib/syndication/eligibility.ts` reads the retained column; 0 approval rows today, and the predicate excludes any that appear.
5. **IDX display gate unaffected** — gate decisions come from typed columns (`idx_display_yn`, `internet_*`, `participant_only`, `owner_opt_out`, `status`), not `compliance`; confirm a sample listing's displayability is unchanged.

## 8. Required post-strip smoke (after each phase)
- **Listing detail 200** on a sample of just-stripped rows (Phase 2) / a terminal row (Phase 1) — and remarks still render.
- **Search / listing cards 200** — results render; remarks/fields intact (cards already use `features`).
- **CRM listing loader / auth unchanged** — GET a CRM listing; loader returns address/features/agent_info/media; auth behavior unchanged.
- **Syndication / display-gate checks** — `npm run idx:validate` + `rls:validate` clean; a sample displayability check unchanged.
- **Sample rows show compliance stripped only where safe** — spot-check: stripped rows have `compliance = '{}'`; the 7 `validation_result` rows STILL populated; no authored data lost.

## 9. Rollback / snapshot
- **Take a Neon snapshot / note a PITR timestamp immediately before each phase** (Launch plan = 7-day PITR window). Required.
- **Restore path:** if unexpected behavior appears, restore via Neon PITR to the pre-phase timestamp (or branch-from-timestamp to recover specific rows). **Additional safety net:** the stripped data is **100% redundant with `raw_data`** (S1: `only_in_compliance = 0`), so even absent a snapshot the Trestle-copy is reconstructable from `raw_data` / a re-sync — but the snapshot is the clean, fast rollback.
- The 7 authored rows are **excluded**, so authored compliance is never at risk.

## 10. Reclaim note
The strip is an `UPDATE … = '{}'` → it creates **dead tuples**; it does **NOT** shrink disk immediately. Neon billed (synthetic) size drops only after the old page versions age past the **PITR window + autovacuum**. Hard compaction (if needed) via **online copy-swap / `pg_repack`**, **never `VACUUM FULL`** on production. **Reclaim is a separate, gated step**; the Free go/no-go uses **measured Neon bytes** after reclaim, not the 202 MB estimate. (202 MB → DB ~933 MB, still over the ~477 MiB Free cap — biggest clean contributor, not a standalone unlock.)

## Approval gates (each separate, explicit)
1. **Dry-run review** (this report).
2. **Pre-strip proof (§7) + Neon snapshot (§9)** for Phase 1.
3. **Phase 1 strip execute** (terminal; SQL writes — HELD).
4. **Phase 1 smoke (§8)** review → **Phase 2 proof + snapshot**.
5. **Phase 2 strip execute** (live; SQL writes — HELD).
6. **Reclaim** (`pg_repack`/PITR-measure — HELD; never `VACUUM FULL`).

## Hard limits honored
Plan only. The dry-run was READ-ONLY (SELECT + ROLLBACK). No strip, no SQL writes, no reclaim, no downgrade, no env/Vercel change, no new Neon branch. S2/raw_data not started.
