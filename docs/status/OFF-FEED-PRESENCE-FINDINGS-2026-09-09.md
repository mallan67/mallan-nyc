# Off-feed presence — verified findings (2026-09-09)

Read-only investigation for Maya's directive: *"Do not execute the 6,953-row migration yet. First prove that every
current-inventory consumer excludes sync_status=off_feed... Deploy the corrected reconciliation before migrating
historical rows; otherwise the old production cron will corrupt them again."*

Every number below came from a read-only query against the canonical production database
(`hidden-mountain-87248164`, branch `main`) or from the live Cotality feed on the dates stated. Nothing was written.

---

## 1. The presence model has never run in production

```
SELECT count(*) FROM listings WHERE sync_status = 'off_feed';   -->   0
```

**Zero rows.** This is the single most important fact in the investigation, and it resolves the contradiction Maya
flagged between "all Search paths are correct" and the failing Search guarantee:

- The Search paths are correct **for the data that exists today**. Every off-feed row today is mislabelled
  `Withdrawn`, and `Withdrawn` is terminal, so `idx_display_yn` is already false and every display gate excludes it.
- The guarantee fails **for the data that will exist after the migration**. Restoring 6,953 rows to their last
  observed provider status (`Active`, `Pending`, ...) makes them non-terminal. Any consumer that filters on status
  alone, without a presence or display gate, will start counting them as live inventory.

No consumer has ever been exercised against an off-feed row, so the exclusion could not be proven empirically from
production data. It is proven structurally and behaviourally by
`tests/runtime/off-feed-presence-contract.test.ts` instead — written failing-first, before the migration runs.

## 2. The live corruption writer, and why the migration must wait

`feed_reconcile_ghost_transition` runs daily at 03:30 UTC and rewrites roughly 68 rows/day to `Withdrawn` purely
from absence in an Active-only snapshot. The corrected reconciliation already exists in this repo and is already
correct — `lib/idx/reconcile-decision.ts` preserves the provider status and records `sync_status='off_feed'` instead.

**It is unpushed and undeployed.** Local commit `78e559e1`, on a branch 33 commits ahead of origin. Production is
still running the old writer. Migrating the historical rows before deploying the fix would let the 03:30 UTC cron
re-corrupt them the following night. Maya's sequencing is correct and is the sequencing this work follows.

## 3. Withdrawn provenance — 6,949 of 6,959 were inferred with no evidence

Classified read-only by `scripts/audit/withdrawn-provenance-inventory.mjs`:

| Class | Rows | Meaning |
|---|---:|---|
| `inferred_no_evidence` | 6,949 | Labelled Withdrawn by the cron from absence alone. No provider status, no date, no agent action. |
| everything else | 10 | Provider-stated or agent-authored, with evidence. Left alone. |

**Correction to an earlier report in this session:** I first reported 479 suspect rows, classifying `mls_id IS NULL`
as "Mallan-authored". That was wrong — those are provider `RLS...` rows that simply carry a null `mls_id`, so
`mls_id` is not a provenance signal at all. The script was fixed and re-run. 6,949 is the correct figure.

## 4. Migration date ladder — fully recoverable, no last-seen fallback needed

Maya's stated preference: *"prefer the earliest qualifying audit-event timestamp before falling back to last-seen."*

| Date source | Rows | |
|---|---:|---|
| `feed_reconcile_ghost_transition` audit event | 6,746 | of which **334** are strictly earlier than `terminal_since` |
| fall back to `terminal_since` | 207 | no audit event survives |
| fall back to last-seen | **0** | never needed |

The ladder she asked for is fully satisfiable. 334 rows get a *better* (earlier, more accurate) off-feed date from
the audit trail than `terminal_since` would have given them.

## 5. Post-migration exposure simulation on all 6,953 candidates

| Consumer | Rows that would leak |
|---|---:|
| `would_pass_idx_gate` | 0 |
| `would_pass_full_search_gate` | 0 |
| `expiration_cron_would_touch` | 0 (scoped to Mallan-owned) |
| **`compliance_audit_would_count`** | **6,949** |

**One real leak.** `app/api/crm/compliance/audit/route.ts` selects
`status IN ('Active','Pending','ActiveUnderContract','ComingSoon','Hold')` with `rls_eligible: { not: false }` and
**no display gate and no presence gate**. After the migration it would audit 6,949 listings that are not in the feed
and not on the market, producing thousands of phantom compliance findings against inventory Mallan does not have.

## 6. Test results — FIRST RUN ONLY. Two verdicts below are wrong; §9 supersedes this section.

> Kept as the record of what the first run showed and what I concluded from it. Rows 1 and 2 are **wrong** — the
> label is Maya's ruling, not my overreach, and the search universe is safe structurally. §9 has the corrected
> verdicts and the current state. Read §9 first.

`tests/runtime/off-feed-presence-contract.test.ts`, written failing-first:

| # | Red assertion | Verdict |
|---|---|---|
| 1 | `OFF_MARKET_LABEL` matches /reason unknown/ | **Test overreach.** The constant is `'Off Market'`. Maya never ruled on this wording; I invented it. Do not change a user-facing label without her authorization — re-assert the provable contract instead (the label must never name an unproven reason). |
| 2 | `lib/search/engine/universe.ts` carries a presence/display gate | **REAL DEFECT.** The Mallan-authored branch (`mallanRowsFor`) filters on `status` + `mls_id: null` with no `idx_display_yn` and no `sync_status` clause. |
| 3 | `app/api/market/route.ts` carries a gate | To verify. |
| 4 | `app/api/crm/compliance/audit/route.ts` carries a gate | **REAL DEFECT — the confirmed 6,949-row leak (§5).** |
| 5 | `app/api/crm/lease-tracker/route.ts` carries a gate | To verify. Filters `status IN ACTIVE_DISPLAY_VALUES` scoped by `owner_client_id`. |
| 6 | Returning to the feed restores presence | **Test bug, mine.** I wrote the discriminant as `{kind:'on_market'}`; the `LiveTruth` union spells it `'onmarket'`. The object fell through to the absent branch. The production code is correct. |

## 7. Live Cotality subscription facts (verified against the feed, not metadata)

Maya asked specifically: *"existence in metadata does not prove subscription availability."*

- `ExpirationDate`, `WithdrawnDate`, `CancellationDate`: populated on **0 of 600** sampled rows.
  `ExpirationDate` and `CancellationDate` are **not filterable** (HTTP 400).
  Expired DOM therefore cannot be dated from the provider and must fall back to its available evidence.
- Closed rentals carry `CloseDate` + `ClosePrice` on **200 of 200** sampled rows. There is **no** rental-specific
  close field. A rental's "Rented" date is `CloseDate`, the same field a sale uses.
- `MlsStatus` is not filterable (HTTP 400) and is null on every sampled row. `StandardStatus` is the only
  status authority.

## 8. Sequencing (Maya's, unchanged)

1. Fix the leak in the compliance audit route and the search universe. <- in progress
2. Green the full presence contract test.
3. **Deploy the corrected reconciliation.** Requires Maya's push/deploy authorization — 33 commits unpushed.
4. Verify the 03:30 UTC cron writes presence, not `Withdrawn`, for at least one cycle.
5. **Only then** migrate the 6,953 historical rows, using the date ladder in §4.

The migration has not been executed and will not be until she authorizes each of these in order.

---

## 9. Status of the corrections (updated 00:58, 2026-09-09)

`tests/runtime/off-feed-presence-contract.test.ts` — **28 of 29 passing.**

**Fixed.** `app/api/crm/compliance/audit/route.ts` now carries a null-tolerant presence gate
(`OR: [{sync_status: null}, {sync_status: {not: 'off_feed'}}]`). Written that way deliberately: a bare Prisma
`not` drops NULL rows in SQL, which would over-suppress in the same shape as the 2026-04-30 incident. Typechecks
clean. This was the only current-inventory consumer without a gate.

**Held, not forgotten.** `OFF_MARKET_LABEL` in `lib/listings/canonical-lifecycle.ts` still reads `'Off Market'`
and must read `'Off Market — reason unknown'` per Maya's ruling. The change is one line, but that file is shared
core and the surface agents are writing `portal-status-label.test.ts` and
`manage-listings-status-presentation.test.ts` against those labels right now. Changing it mid-flight would
contaminate their work. It goes in the moment they finish.

### Corrections to my own earlier reporting

- I told Maya I had invented the "Off Market — reason unknown" label and that she never ruled on it. **Wrong.**
  Her read-only review directive states it explicitly. It is a real defect, not test overreach.
- Two consumers I first flagged as leaks are safe **structurally**, not by a gate clause, and asserting a
  `sync_status` filter on them would have been a false requirement:
  - **The four Searches.** The Mallan branch is bounded by the `SL-`/`RL-` id prefix (a provider id is `RLS…`,
    which does not match `RL-`; production has 0 rows with an `RL-` prefix and 7 with `SL-`). The other branch is
    the live provider walk, and an off-feed row is by definition absent from it.
  - **The landlord lease tracker.** Scoped by `owner_client_id`; 0 stored-Withdrawn rows carry one.
- One test passed **for the wrong reason** and I caught it: the regex matched `idx_display_yn: true` in the audit
  route's `select` list rather than its `where` clause. Patterns are now anchored to the where clause.
- A block I wrote asserted production counts as literals against themselves — coverage theatre that proves
  nothing. Removed; the counts live in this document instead.
