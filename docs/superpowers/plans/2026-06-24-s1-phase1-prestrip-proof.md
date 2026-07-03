# S1 Phase-1 pre-strip PROOF (READ-ONLY) — terminal compliance strip readiness

> **PROOF ONLY — NO STRIP, NO UPDATE, NO SQL WRITES, NO RECLAIM, NO DOWNGRADE, no env/Vercel change,
> no new Neon branch.** All DB checks were read-only (read-only txn + ROLLBACK, host-guarded to
> cold-waterfall); render/API checks were live production probes. Date 2026-06-24 · #415.

## Verdict: ✅ ALL PRE-STRIP PROOFS PASS — terminal Phase-1 is ready, pending (a) a pre-strip Neon snapshot and (b) explicit Maya approval.

| # | Proof | Result |
|---|---|---|
| 1 | #445 production deploy READY | ✅ Vercel prod deployment `dpl_5ciGFqsrVb1Qna3ShTjZGqqxynKC` = **READY** on commit **`6c09d6ec`** (the #445 merge) |
| 2 | ≥1 IDX sync after deploy | ✅ **2** `idx_sync_cron` runs after deploy; latest **23:30** |
| 3 | Fresh-sync durability (writer-stop live) | ✅ 1 row **created** post-deploy → **empty compliance**; **0** new rows carry a Trestle copy (`new_rows_with_trestle_copy=0`); 84 rows re-synced via UPDATE correctly **preserve** existing compliance (omit-on-update). **Writer-stop confirmed live — no re-bloat.** |
| 4 | Terminal-only dry-run | ✅ **92,768 rows / 165 MB** eligible · **5** authored excluded · `unknown_excluded = 0` |
| 5 | 7 `validation_result` rows preserved | ✅ SL-0001…SL-0007 all `would_be_stripped=false` + `has_validation_result=true` (5 terminal, 2 live) — excluded from the strip |
| 6 | Detail renders remarks from features/raw_data | ✅ live prod probe of a listing detail page renders the full description ("The Apex Duplex, occupying the 127th and 128th floors…") — no compliance read |
| 7 | `/api/listings` exposes no compliance | ✅ live prod probe — listing objects have no `compliance` key (only the `_compliance`/`_displayCompliance` *attribution* DTO fields) |
| 8 | CRM listing loader / auth unchanged | ✅ (code+tests) #445 touched no CRM auth; CRM GET still returns the full listing; the 7 SL- rows keep `validation_result` (excluded from strip). *Authed live re-check is Maya's to run if desired.* |
| 9 | Syndication eligibility preserved | ✅ (code+tests) `lib/syndication/eligibility.ts` reads the retained `compliance` column; 0 approval keys exist today; the SL- authored rows are excluded from the strip. (Syndication is HELD regardless.) |
| 10 | Display gate uses typed columns | ✅ production gating uses the typed columns (`idx_display_yn`/`internet_*`/`participant_only`/`owner_opt_out`/`status` via `computeGateColumns`); `idx-display-gate.ts` reads the `Listing` domain type, not the DB column. Live `/api/listings` returns correctly-gated active listings. |

Identity confirmed: `db=neondb`, `transaction_read_only=on`.

## 11. Neon snapshot / PITR rollback plan (REQUIRED before any Phase-1 write)
- **Primary rollback = a pre-strip Neon point-in-time copy.** Recommended: **Maya creates a pre-strip Neon branch/snapshot via the Neon Console** immediately before Phase-1 (the same proven procedure used for the agent_info DROP — `br-wandering-moon-…`). Claude stays blocked from `NEON_API_KEY`, so the snapshot is a Maya Console action (or explicit approval for me to use a provided path). **No branch is created in this proof step.**
- **Fallback = Neon PITR-to-timestamp** (Launch plan = 7-day window): restore the DB (or branch-from-timestamp) to the moment before the batch.
- **Extra safety net:** the stripped data is **100% redundant with `raw_data`** (S1: `only_in_compliance=0`) — even absent a snapshot, the Trestle-copy is reconstructable from `raw_data`/a re-sync. The 7 authored rows are **excluded**, so authored data is never at risk.
- **If you want me to create the pre-strip branch** (vs doing it in Console), say so — per the hard limit I will ask before any new Neon branch.

## 12. Exact Phase-1 execution command (DO NOT RUN — for approval)
Terminal-only, batched, idempotent loop (run via the host-guarded cold-waterfall wrapper, NOT now):
```sql
-- Per batch (repeat until 0 rows affected). Run each as its own auto-commit statement.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

UPDATE listings SET compliance = '{}'::jsonb
WHERE id IN (
  SELECT id FROM listings
  WHERE status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled')   -- Phase 1: terminal only
    AND compliance IS NOT NULL
    AND compliance::text <> '{}'
    AND NOT EXISTS (                       -- strip ONLY rows whose every key is a Trestle-copy key
      SELECT 1 FROM jsonb_object_keys(compliance) k
      WHERE k <> ALL (ARRAY[
        'ListingAgreement','ListingContractDate','ExpirationDate','OriginalEntryTimestamp','ListingService','MlsStatus','DuplicateListingIDs','ParticipantTypes','ExclusiveAgency','InternetEntireListingDisplayYN','InternetAddressDisplayYN','SyndicationRemarks','Permission',
        'StandardStatus','SourceSystemModificationTimestamp','ModificationTimestamp','StatusChangeTimestamp','ActivationDate','ActivationTimestamp','OnMarketDate','OffMarketDate','OffMarketTimestamp','BackOnMarketDate','BackOnMarketTimestamp','ContractStatusChangeDate','PurchaseContractDate','CloseDate','ClosePrice','CancelationDate','WithdrawnDate','DaysOnMarket','CumulativeDaysOnMarket','PendingTimestamp','ContingentDate','AvailabilityDate','ComingSoonDate','ComingSoonTimestamp','ActiveOpenHouseCount','OriginalListPrice','PreviousListPrice','ListPriceLow','ListPrice','LastChangeType','LastChangeTimestamp',
        'SpecialListingConditions','SaleType','Concessions','ConcessionsAmount','ConcessionsComments','AuctionType','LeaseAmount','LeaseAmountFrequency',
        'InternetAutomatedValuationDisplayYN','InternetConsumerCommentYN','SyndicateTo','ListingURL',
        'PublicRemarks','PrivateRemarks','ShowingInstructions','ListingTerms','Disclaimer','CopyrightNotice','PropertyCondition'
      ])
    )
  ORDER BY id
  LIMIT 5000
);
```
Expected: ~**92,768** terminal rows over ~**19 batches**; the 5 terminal SL- `validation_result` rows are excluded; live rows untouched (Phase 2). Re-run the terminal dry-run immediately before executing to confirm counts (92,768 / 165 MB / 5 excluded / unknown_excluded 0).

## Hard limits honored
Proof only. No UPDATE/strip/SQL writes, no reclaim, no downgrade, no env/Vercel change, no new Neon branch. S2/raw_data not started.

## STOP — awaiting explicit Maya approval for Phase-1 terminal strip execution (after the pre-strip Neon snapshot).
