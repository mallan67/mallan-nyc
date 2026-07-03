# S1 storage-front probe — `listings.compliance` JSON (READ-ONLY report)

> **REPORT-ONLY. No writes, no strip, no migration, no normalization, no reclaim, no downgrade,
> no env/Vercel change, no new Neon branch.** Read-only DB probe (cold-waterfall, read-only txn,
> ROLLBACK) + 8-probe repo consumer scan. Date 2026-06-24 · #415. Methodology:
> `2026-06-15-step4-readonly-probe-plan.md` (Probes 1–2).

## Headline: 🟢 `compliance` is the cleanest strip candidate of the JSON columns — but it is NOT a no-op strip
202 MB, and **almost entirely a redundant copy of Trestle status/price/date metadata + `PublicRemarks`** that already lives in `raw_data`/typed columns. The one render-critical stored key (`PublicRemarks`) is **100% redundant with `raw_data` (only_in_compliance = 0)**. The genuinely-consumed-today stored content is tiny (a ~7-row CRM validation subset; syndication-approval keys on 0 rows). So a strip is achievable with a **small render re-point + an idx-sync writer change**, unlike `raw_data` (which is render-critical and non-redundant). **GO to plan a gated migration; NO-GO on any strip now.**

---

## 1. Size [DB-measured]
- **Total `compliance` ≈ 202 MB** · avg **1,926 B/row** · max **4,738 B**.
- Split: **terminal 165 MB** (92,801 rows, 92,767 populated) · **live/other 37 MB** (17,261 rows, all populated).
- Populated on essentially every row (only ~34 terminal empties).

## 2. Structure [DB-measured] — mostly a redundant Trestle copy
Top-level keys (rows populated; 110,021 total):
- **Trestle metadata copy (≈all rows):** `Permission`, `StandardStatus`, `ContractStatusChangeDate`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`, `ListPrice`, `ListingAgreement`, `ModificationTimestamp`, `OriginalEntryTimestamp` (110,021 each); `StatusChangeTimestamp` (109,769); `ListingContractDate` (109,539); `ListingURL` (108,262).
- **`PublicRemarks` (109,588)** — the only render-consumed key.
- **Status/price/date dups:** `OffMarketTimestamp` (95,455), `OffMarketDate` (90,245), `CloseDate` (89,656), `ClosePrice` (78,010), `OriginalListPrice` (56,874), `AvailabilityDate` (55,583), `PreviousListPrice`, `PurchaseContractDate`, `SpecialListingConditions`, `OnMarketDate`, `PendingTimestamp`, `ActivationDate`, `BackOnMarket*`, `WithdrawnDate`.
- **CRM-authored subset (tiny):** `validation_result`/`warnings`/`rls_eligibility`/`validated_at` (7), `valid` (6), `stripped_fields` (1).
- **Redundancy proof:** `PublicRemarks` in_compliance **109,588** vs in_raw_data **109,595**, **only_in_compliance = 0** → raw_data is a superset. The status/price/date keys are likewise covered by `RAW_DATA_KEEP_FIELDS` (`PublicRemarks`, `CloseDate`, `ClosePrice`, `OffMarketDate`, `ListPrice`, `Permission`, `OriginalListPrice`, `PreviousListPrice`, `ActivationDate`, `OnMarketDate`, …) + typed columns.

## 3. Consumer inventory (8-probe scan across `app lib scripts public/crm`)
**Prisma narrow `compliance: true` selects: 0** (matches the prior plan) — every read is a full-record fetch then property access (probe #8), so the narrow grep alone would have wrongly cleared this column.

| Consumer | Reads | Class | Real against the stored column? |
|---|---|---|---|
| `app/listing/[...slug]/page.tsx:553,545,621` | `compliance` obj → `PublicRemarks` fallback | **RENDER** | **YES** — but 100% redundant with `raw_data.PublicRemarks` |
| `lib/idx/display-adapter.ts:239-240`, `app/components/ListingSidePanel.tsx:164` | `compliance.comingSoonDate` | render | **No** — `comingSoonDate` (camelCase) is NOT a stored key → reads `undefined` today; comingSoon derived elsewhere |
| `lib/compliance/idx-display-gate.ts:26-61` | `compliance.idxOptOut/.internetEntireListingDisplayYN/.participantOnlyNetwork/.internetAddressDisplayYN/.comingSoonDate` | display-gate | **No** — camelCase keys ABSENT from the stored JSON (stored uses PascalCase Trestle names) → reads `undefined`; the gate relies on typed columns. **Verify the gate's input shape before strip.** |
| `lib/compliance/reso-mapper.ts:304-306` | `compliance.idxOptOut/.vowOptOut/.syndicationOptOut` | RESO | **No** — camelCase keys absent → inert against the column. **Verify.** |
| `lib/syndication/eligibility.ts:136` | `compliance.syndication/.mallan_control_verification/.seller_advertising_authorization/.media_rights` | **SYNDICATION** | **0 rows today** (HELD); future-relevant when syndication enabled + CRM sets approvals |
| `app/api/crm/sales/listings/route.ts:63-64` | `l.compliance.Permissions` | CRM | **No** — `Permissions` key on 0 rows → `undefined` today |
| Raw SQL (`queryRaw*`) | none reference `compliance` | — | grep across app/lib/scripts: no raw-SQL reader of `compliance` |

**Net:** the ONLY genuinely-consumed stored content today is `PublicRemarks` (render fallback, fully redundant) + the 7-row CRM validation subset. The display-gate / RESO / CRM-Permissions readers reference keys that are **not present** in the stored column (they consume typed columns / an adapter shape) — to confirm, not assume.

## 4. Writer / refill inventory (durability blocker)
| Writer | What it writes |
|---|---|
| `lib/idx/sync.ts:326,359,1179,1206` | `mapped.compliance` (the full Trestle copy) on **every** create + update → **REPOPULATES** a strip |
| `app/api/cron/feed-reconcile/route.ts:383`, `app/api/crm/listings/reset-sync/route.ts:141,172` | `mapped.compliance` on create/reset |
| `app/api/crm/listings/[id]/route.ts:468`, `app/api/crm/listings/route.ts:225` | `{ validation_result: … }` (small CRM shape) |
| `app/api/cron/data-retention/route.ts:277` | `compliance: {}` (the archive strip already empties it on terminal archive) |
| `app/api/idx/ensure-listing/route.ts:140` | `{}` on create |
**Durability:** any strip is transient until `lib/idx/sync.ts` (+ feed-reconcile/reset-sync) stop writing `mapped.compliance` (write `{}` or a reduced shape). This is the gating writer change.

## 5. Verdict — BLOCKED on a short, well-scoped migration (not a free drop)
A column is SAFE only when all critical readers are migrated AND no writer repopulates it. For `compliance` the blockers are **few and small**:
1. **Render PublicRemarks fallback** → re-point `app/listing/[...slug]/page.tsx` to `raw_data.PublicRemarks` (proven 100% redundant; `raw_data` is a superset). Low-effort, testable.
2. **idx-sync writer** → stop writing `mapped.compliance` (write `{}`/reduced) so the strip is durable. The mapper still needs its gate **typed columns** (unchanged); only the JSON copy stops.
3. **CRM `validation_result` (7 rows) + future syndication-approval keys** → these are a *different, tiny* data set from the Trestle-copy bulk. Preserve by either keeping a minimal CRM-authored `compliance` for CRM/website rows, or migrating CRM/syndication to a dedicated column/structured fields. Must be settled before a blanket strip.
4. **Verify** `idx-display-gate.ts` / `reso-mapper.ts` / CRM `Permissions` truly read an adapter/typed shape (their camelCase keys are absent from the stored column) — confirm, don't assume, before strip.

## 6. MB reclaimable + reclaim caveat
- **~202 MB** is redundant Trestle-copy bulk (minus a few KB of CRM keys).
- **Terminal 165 MB** already empties via the **archive strip** (`data-retention:277` sets `compliance: {}`) — but that path is gated on the archive **eligibility-clock fix** (P2 finding: the drain currently reaches ~0 rows). So terminal-compliance reclaim rides on that separate fix.
- **Live 37 MB** needs blockers 1+2 (render re-point + writer change).
- **Strip ≠ shrink:** `UPDATE … = '{}'` creates dead tuples; Neon billed size drops only after PITR-elapse + autovacuum, with `pg_repack` for hard compaction (never `VACUUM FULL`). Per P2-MONEY §C.
- **Free reality check:** 202 MB off ~1,135 MB → ~933 MB, still over the ~477 MiB Free cap. `compliance` is the biggest *clean* contributor to the path, not a standalone Free unlock. $19 Launch stays the floor.

## 7. Go/no-go
- 🟢 **GO to plan** a gated `compliance` migration PR (render re-point → writer change → CRM/syndication carve-out → strip → reclaim), each step separately approved. It's the **best-leverage, lowest-risk** JSON front because `PublicRemarks` is 100% redundant and the rest is Trestle-copy.
- 🔴 **NO-GO on any strip/normalization now** (hard limits; report only).
- **Suggested next:** S2 `raw_data` probe (the non-redundant, render-critical one — confirm the harder constraints) OR scope the `compliance` migration PR. Recommend scoping the compliance migration next since S1 shows it's the cleanest win.

## Hard limits honored
Report only. No writes, strip, migration, normalization, reclaim, downgrade, env/Vercel change, or new Neon branch. Read-only DB probe + repo scan only.
