# S1 Phase-2 (live-row) pre-strip PROOF (READ-ONLY)

> **PROOF ONLY — NO STRIP, NO UPDATE, NO SQL WRITES, NO RECLAIM, NO DOWNGRADE, no new Neon branch.**
> DB checks read-only (read-only txn + ROLLBACK, cold-waterfall); render/API via live prod probes.
> Date 2026-06-25 · #415.

## Verdict: ✅ ALL PROOFS PASS — live-row Phase-2 is ready, pending (a) a snapshot decision (§9) and (b) explicit Maya approval.

| # | Proof | Result |
|---|---|---|
| 1 | Phase-1 still clean | ✅ terminal eligible remaining **0** · terminal `unknown_excluded` **0** · terminal authored **5** · all SL authored **7** |
| 2 | Live-only dry-run | ✅ **17,253 rows / 37 MB** eligible · live authored excluded **2** · `unknown_excluded` **0** |
| 3 | Writer-stop still live | ✅ 5 rows created post-deploy → **0** carry a Trestle copy (`new_rows_with_trestle_copy=0`); 238 rows re-synced via UPDATE preserve existing value (omit-on-update). No re-bloat. |
| 4 | Public live render | ✅ 3 sample live detail pages (217 W 57th, 432 Park, 157 W 57th) all **200** + render full remarks from `features`/`raw_data` (no `compliance.PublicRemarks` dependence) |
| 5 | API/search | ✅ `/api/listings` **200**, 3 Active+priced listings, **no `compliance` key leak** (only `_compliance`/`_displayCompliance` attribution) |
| 6 | CRM | ✅ live authored **SL-0004, SL-0007** both `would_be_stripped=false` (excluded) + `validation_result` preserved. CRM loader/auth code unchanged (#445); authed live re-check is Maya's if desired |
| 7 | Syndication | ✅ approval keys (`syndication`/`mallan_control_verification`/`seller_advertising_authorization`/`media_rights`) on **0** rows; `Permissions` on **0** rows — still zero, preserved by exclusion if any appear |
| 8 | Display gate | ✅ gating via typed columns (`idx_display_yn`/`internet_*`/`participant_only`/`owner_opt_out`/`status`); live `/api/listings` returns correctly-gated Active listings; detail pages render |

Identity: `db=neondb`, `transaction_read_only=on`.

## 9. Snapshot / rollback decision
- **Existing branch `pre-s1-compliance-terminal-strip-2026-06-24` (`br-mute-flower-adurq0o7`, LSN `4/403D0CF0`) is a VALID rollback** for Phase-2 — it predates BOTH phases (full pre-S1 state). Restoring it reverts everything to pre-S1 (Phase-1 would then need re-running). Plus the live `compliance` is **100% redundant with `raw_data`** (S1: `only_in_compliance=0`), so recovery is possible even without a snapshot.
- **RECOMMENDED: create a fresh pre-Phase-2 branch** (post-Phase-1 state: terminal stripped, live intact) so a Phase-2 problem rolls back ONLY Phase-2 and preserves the completed/verified Phase-1 work — finer-grained, cleaner. Suggested name: `pre-s1-compliance-live-strip-2026-06-25`.
- Per the hard limit, **no branch is created in this proof step.** At Phase-2 approval, tell me whether to (a) rely on the existing pre-S1 branch, or (b) create the fresh pre-Phase-2 branch (I'll create it from canonical `main` as in Phase-1, on your go).

## 10. Exact Phase-2 execution command (DO NOT RUN — for approval)
Live-only, **keyset pagination** (proven in the Phase-1 resume), idempotent loop:
```sql
-- Per batch (advance $last = max(returned id); loop until 0 rows). lock_timeout 5s, statement_timeout 60s.
UPDATE listings SET compliance = '{}'::jsonb
WHERE id IN (
  SELECT id FROM listings
  WHERE id > $last
    AND status NOT IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled')   -- Phase 2: LIVE/other only
    AND compliance IS NOT NULL AND compliance::text <> '{}'
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
  ORDER BY id LIMIT 5000
)
RETURNING id;
```
Expected: ~**17,253** live rows over ~**4 batches**; SL-0004 & SL-0007 (live authored) excluded; terminal rows untouched (already stripped). Pre/post checks: re-confirm 17,253 eligible / `unknown_excluded=0` before; after, live eligible remaining 0, 2 live authored preserved, all 7 SL authored preserved, terminal still 0.

**⚠️ Render note for Phase-2:** unlike Phase-1, live rows ARE publicly rendered. After Phase-2, re-run the live detail-page + `/api/listings` smoke to confirm remarks still render (they read `features`/`raw_data`, proven above, so expected green).

## Hard limits honored
Proof only. No UPDATE/strip/SQL writes, no reclaim, no downgrade, no new Neon branch, rollback branch not deleted. S2/raw_data not started.

## STOP — awaiting (a) snapshot decision (§9) + (b) explicit Maya approval for Phase-2 live strip.
