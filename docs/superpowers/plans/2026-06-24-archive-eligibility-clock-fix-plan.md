# Archive eligibility CLOCK fix — plan + go/no-go (REPORT-ONLY)

> **REPORT-ONLY. No code, no schema, no migration, no SQL writes, no archive run, no flag change,
> no reclaim, no downgrade, no env change, no new Neon branch.** Read-only DB diagnostics
> (cold-waterfall, read-only txn, ROLLBACK) + source read. Date 2026-06-24 · #415.
> Companion to `2026-06-24-p2-archive-drain-plan.md` (which found the flag drains ≈0 MB) — this
> explains WHY and scopes the corrective fix.

## GO/NO-GO: 🟢 GO to BUILD the fix (flag-gated PR) · 🔴 NO-GO on any drain/enable until the read-prereqs clear
The defect is now **proven by live data**, not hypothesized: the archive eligibility clock
(`status_changed_at`) is **contaminated** — it tracks the ingestion/modification timeline, not the
terminal-transition timeline. A **stable clock** (`CloseDate`/`OffMarketDate` from `raw_data`)
exists on 96.6% of terminals and would make **82,676 rows / ~333 MB** eligible (vs **0** today).
The prior #404 fix is **structurally insufficient** (see ⚠️ below). Recommendation: build a
standalone, flag-gated correction that repoints eligibility to a stable, indexed
`terminal_since` clock; keep all draining behind the existing default-OFF flag + the read-prereqs.

## ⚠️ The #404 fix is structurally wrong (key finding)
#404 shipped `COALESCE(status_changed_at, modification_timestamp) < cutoff` behind
`ARCHIVE_T180_BACKLOG_ENABLED`. **Both operands are moving clocks:**
- `status_changed_at` ≈ `modification_timestamp` within 1 day for **91,980 / 92,788 (99.1%)** of
  terminals — it was seeded to the ingestion/modification moment (Phase-1 backfill `lib/idx/sync.ts:282-288`
  + create-time `new Date()` `:310`), not the sale date.
- `modification_timestamp` ← `raw.ModificationTimestamp`, bumped by Cotality on **every** re-emit.

So the COALESCE falls back from one recent clock to another recent clock → it never matures →
the flag drains ≈0 (the P2 finding). **The fix is not "broaden the predicate" — it's "change the
clock source."**

---

## The 10 scope answers

**1. Where terminal listings are re-stamped by sync. [code + DB-proven]**
- `modification_timestamp` — set from `raw.ModificationTimestamp` on **every** upsert
  (`lib/idx/trestle-mapper.ts:954,1204`; written `lib/idx/sync.ts:343,384,1179,1215`). Cotality bumps
  `ModificationTimestamp` on any change (incl. `PhotosChangeTimestamp`-driven media re-emits) → moves continuously. **This is the moving clock by definition.**
- `status_changed_at` — sync writes it **only on a real transition** (`existing.status !== mapped.status`, `sync.ts:269-281,347`) or seeds `new Date()` on create (`:310`); it is **NOT** re-bumped on a same-status re-emit. **BUT empirically it tracks the moving clock anyway:** `status_changed_at` is within 1 day of `modification_timestamp` for **91,980/92,788 (99.1%)** and within 1 day of `created_at` for 84,933. That's because the Phase-1 backfill seeded the legacy NULLs from `modification_timestamp`/`last_synced_from_trestle`, and create-on-first-sight seeds `now()`. So `status_changed_at` means "when we first ingested / last touched this row," not "when it became terminal."
- Other writers (small sets, legitimate transitions): `app/api/crm/listings/[id]/status/route.ts:236` (CRM transition), `app/api/cron/feed-reconcile/route.ts:385,489` (ghost→Withdrawn sets `status_changed_at: now`), `scripts/import-closed-from-trestle.ts` sets **neither** `status_changed_at` nor `terminal_since` (relies on backfill — only 1 NULL remains).
- **Net (DB-proven): both candidate clocks track the ingestion/modification timeline, not the sale timeline.**

**2. Correct stable terminal-age source. [DB-proven]** A sale/transition date that Trestle does NOT bump on re-emit:
- `raw_data.CloseDate` — **89,620** rows (Closed/Sold/Leased/Rented). In the keep set (`raw-data-keep-fields.ts:67`).
- `raw_data.OffMarketDate` — **89,620** (Withdrawn/Expired/Cancelled; also a CloseDate fallback). Kept (`:66`).
- `features.CloseDate` — **34** (the `import-closed-from-trestle.ts` rows store CloseDate in `features`, not `raw_data`).
- `raw_data.ExpirationDate` — **5**. Kept (`:69`).
- **`COALESCE(CloseDate→features.CloseDate→OffMarketDate→ExpirationDate)` covers 89,659/92,788 (96.6%)**; 3,129 have none.
- **Caveat (data quality):** at least one bogus future `CloseDate` exists (`max = year 2814`). The clock needs a **sanity window** (ignore dates `< 2000` or `> now()`); a future date is **fail-safe** (never matures → never archives).

**3. Is a new local `terminal_since` column needed?** The Listing model has **no typed close/terminal date column** (`close_date` exists only on `ListingsArchive`/`PastDeal`/offer models). Two designs:
- **(A) Query-time JSON COALESCE** — no schema change; filter the stable expression directly. Downside: JSON extraction over ~92K rows can't use a btree index → seq scan per cron run (tolerable at nightly + 500-cap, but not clean; a functional index would itself be a migration).
- **(B) Typed `terminal_since DateTime?` + `@@index` — RECOMMENDED.** Set once on the terminal transition; one-time backfill from the stable expression (§2) with the sanity window. Indexable, decouples eligibility from JSON, durable. Either path is migration-class once you want it indexed, so prefer the clean typed column.

**4. The rule (terminal_since semantics).**
- **Set** `terminal_since` when a listing transitions **into** a terminal status (non-terminal→terminal), using the stable date (`CloseDate`/`OffMarketDate`) when present, else the transition wall-clock.
- **Do NOT update** it on repeated sync of an already-terminal listing (idempotent — if terminal and already set, leave it).
- **Clear** it (→ NULL) if the listing returns to a non-terminal status (Withdrawn/Expired→Active reinstatement) so a re-listed property doesn't carry a stale terminal age.
- Writers to touch: `lib/idx/sync.ts` (transition block), `app/api/crm/listings/[id]/status/route.ts`, `feed-reconcile` (ghost→Withdrawn), `import-closed-from-trestle.ts` (set from `features.CloseDate`), and any cron that flips terminal status (`listing-expiration`, `dom-reset`).

**5. Dry-run estimate under the corrected clock. [DB-measured]**
- **Eligible (>180d by stable clock, not yet archived): 82,676** (vs **0** under the current predicate).
- **Strippable raw_data+compliance+media on those: ~333 MB.**
- 3,129 rows have no stable date → excluded (fail-safe) unless a fallback is chosen.
- Age distribution: **>2yr 76,321 · 1–2yr 5,888 · 180–365d 467 · <180d 6,949** (the <180d are correctly protected by the window). Oldest stable date 2012; bogus max 2814 (see §2 caveat).
- **Throughput:** at the existing 500/run nightly cap, 82,676 rows ≈ **166 nights (~5.5 months)**. A one-time bounded higher-cap drain (still gated) should be considered, or accept the slow nightly bleed.

**6. Do closed comps / CRM history / listing detail / search / agent pages / compliance need terminal JSON retained?**
- **Public search / Featured / listing detail / agent pages / open-houses / alerts:** all EXCLUDE terminal statuses (active-status gate — confirmed in the PR-5B parity report). **No public read of >180d terminal JSON.**
- **Closed comps / sold-price:** `lib/idx/db-to-public-dto.ts` + `scripts/comps/by-property.ts` read `raw_data.ClosePrice` — but for **recent** comps; the 180-day window (now correctly clocked) protects the 6,949 within-180d terminals. For >180d, the `listings_archive` summary (close_price/close_date/list_price/beds/baths/address/agent) + `features.ClosePrice/CloseDate` should suffice — **must verify comps/CMA readers fall back to the summary/features, not live `raw_data`, before draining.**
- **Agent past-deals / CRM history:** `PastDeal` is a **separate** model with its own `close_date` — not `listings.raw_data`. Verify the agent past-deals loader uses `PastDeal`/archive, not live terminal `raw_data`.
- **Compliance:** NY DOS 6-yr recordkeeping satisfied by the `listings_archive` summary; terminal rows already non-displayable.
- **Net:** the >180d strip is safe **once** the comps/CMA/agent-past-deals readers are confirmed off live terminal `raw_data` (the read-prereq) — the window now actually works.

**7. Exactly what the archive drain strips. [code]** Per `data-retention/route.ts` archive action: `raw_data → JsonNull`, `compliance → {}`, `media → []`, `sync_status='archived'`; the row is **kept** (FK integrity) and a **summary is upserted to `listings_archive`** first. **NOT stripped:** `features`, `agent_info`, `address` (they remain even on archived terminals — so the ~333 MB is the raw_data+compliance+media portion only; `features` would need a separate, separately-gated strip).

**8. Restore / rollback.** Strip is lossy beyond the summary → full `raw_data` recoverable only via **Neon PITR/snapshot** (Launch 7-day window) → take a **pre-drain snapshot**. The `terminal_since` column + backfill are additive/reversible. Drain rollback = disable the flag (stops further drain); already-stripped rows need PITR.

**9. How reclaim happens later (UPDATE-strip ≠ shrink).** The strip creates dead tuples; Neon billed *synthetic* size drops only after the old page versions **age past the PITR window + autovacuum**. Hard compaction (if needed) via **online copy-swap / `pg_repack`** — **never `VACUUM FULL`** on Neon (blocks all traffic). Per P2-MONEY §C. Sequence: fix clock → (gated) batched drain → wait PITR+autovacuum → **measure Neon billed bytes** → optional `pg_repack`.

**10. Go/no-go.**
- 🟢 **GO to build** a standalone, flag-gated correction PR — the defect is DB-proven and the fix is real (correctness + ~333 MB lever).
- 🔴 **NO-GO on any drain/flag-enable** until: comps/CMA/agent-past-deals read-prereq verified · pre-drain Neon snapshot · drain cap decision · reclaim plan.
- **Reality check (unchanged):** ~333 MB reclaim → DB ~800 MB, still over the ~477 MiB Neon Free cap (per P2-MONEY §5.4). This is the archive lever done **correctly**, not the whole Free path. $19 Launch stays the floor.

## Proposed correction (for a future PR — NOT built here, all gated)
1. **Schema (HELD — needs approval):** add `terminal_since DateTime?` + `@@index([terminal_since])` to `Listing`.
2. **One-time backfill (read-only-proven first):** `terminal_since = COALESCE(stable expression §2)` with the sanity window (`>2000-01-01 AND <= now()`), idempotent, bounded batches.
3. **Repoint eligibility:** replace the #404 `COALESCE(status_changed_at, modification_timestamp)` predicate with `terminal_since < cutoff` — **behind the existing default-OFF `ARCHIVE_T180_BACKLOG_ENABLED`** (merge stays inert; Maya's flag flip remains the drain gate). Keep the 500/run cap (or a deliberate bounded raise).
4. **Writer rule (§4):** set/clear `terminal_since` on transitions across the 5 writers.
5. **RED/GREEN tests:** old terminal (>180d stable date, recent `status_changed_at`/`modification_timestamp`) is SELECTED under the new clock but NOT under `main`'s clock; a within-180d terminal stays excluded; a future-dated (2814) row stays excluded (sanity window); flag-OFF preserves current behavior; batch cap preserved; reinstated listing clears `terminal_since`.
6. **Pre-drain:** verify comps/CMA/agent-past-deals readers off live terminal `raw_data`; Neon snapshot; reclaim plan (§9).

## Hard limits honored
Report only. No code, no schema, no migration, no SQL writes, no flag change, no archive run, no reclaim, no downgrade, no env change, no new Neon branch. Read-only DB diagnostics + source read only.
