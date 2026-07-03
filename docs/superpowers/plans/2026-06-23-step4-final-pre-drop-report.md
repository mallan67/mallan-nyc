# Step 4 — FINAL read-only pre-DROP report (REPORT-ONLY; NOT DROP approval)

> **Status: REPORT-ONLY. NOTHING EXECUTED.** No SQL write, no DB write, no backfill, no producer/gate code change, no migration, no DROP, no reclaim, no snapshot, no Neon downgrade. This report does NOT authorize the DROP — it presents the evidence + the exact plan for Maya's explicit go/no-go on `ALTER TABLE "listings" DROP COLUMN "agent_info";`.
> Date: 2026-06-23 · Board #415 · Target DB (host-guarded): `ep-cold-waterfall-adno3ao2` / `neondb` (hidden-mountain / cold-waterfall).

## Gate 1 — Authenticated CRM render check: ✅ PASS (Maya, logged-in)
Sale viewer (`/crm/sale-view`) and rental viewer (`/crm/rental-view`): Listing Agent + Company/courtesy **populated**; `GET /api/crm/listings/<id>` **200**; `list_agent_full_name` + `list_office_name` **non-empty and matched the screen**; **no top-level `agent_info`** in payload; **no console errors**. → Removing `agent_info` from the Prisma client did not break the broker-facing viewers.

## Gate 2 — Final read-only DB report (refined stale-JSON logic)
Measured read-only (`__phase-d-agent-info-precheck-2026-06-22.mjs --run`, `__phase-d-colist-gap-rows-2026-06-23.mjs --run`, `__trestle-colist-probe-2026-06-23.mjs`); host-guarded cold-waterfall, `SET TRANSACTION READ ONLY`, ROLLBACK.

- **Canonical DB identity:** `ep-cold-waterfall-adno3ao2…aws.neon.tech` / `neondb` / PG 17.10 / `transaction_read_only=on`. ✅
- **Physical `listings.agent_info` column EXISTS:** ✅ (present in 109,685 / 109,928 rows).
- **Raw `typed_gap_rows` = 5** (all co-list MLS; primary 6 fields = 0 gaps).
- **Refined classification (each gap row live-probed against Cotality):**
  - **`real_gap_rows` = 0** ✅ (no gap where the value is still live in Cotality)
  - **`unverifiable_gap_rows` = 0** ✅ (all 5 listings returned by the live feed)
  - `stale_json_rows` = 5 (non-blocking documented exceptions — live co-list = null, typed = null = matches live; only frozen JSON is stale)
- **DB size:** 1368 MB (1,434,533,888 B) = 286.9% of the 500 MB Free cap (well under the Launch 10 GB cap).
- **`agent_info` logical size:** 39 MB (40,532,970 B), avg 369 B/row.
- **`listings`:** total 1041 MB / heap 307 MB / **TOAST 696 MB** / indexes 38 MB.

### Stale-JSON exception register (5 rows — non-blocking)
| DB id | listing_id | status (live) | frozen JSON co_office/agent | live co_office/agent | typed co_office/agent |
|---|---|---|---|---|---|
| 9153 | RLS20059620 | Active | 7222 / 69374 | null / null | null / null |
| 4263 | RLS20071852 | Pending | 10325 / 122771 | null / null | null / null |
| 10412 | RLS20077185 | Active | 16355 / 93643 | null / null | null / null |
| 33065 | RLS20080668 | Active | 16355 / 60901 | null / null | null / null |
| 310304 | RLS20092526 | Active | 7222 / 36166 | null / null | null / null |

### Data-safety verdict
`real_gap_rows = 0` AND `unverifiable_gap_rows = 0` → **the DROP would not lose any live/authoritative attribution.** The DROP is **data-safety ELIGIBLE (point-in-time)**. ⚠️ Point-in-time: a fresh read-only re-run must be done immediately before the actual DROP (the feed changes continuously).

---

## The proposed Step 4 operation (DO NOT RUN — presented for approval)

### A. Pre-DROP Neon snapshot plan (exact)
1. In the Neon Console/API, create a **point-in-time branch (snapshot)** of the production branch `main` (`br-crimson-frog-adr7g9gt`) in project `hidden-mountain-87248164` (cold-waterfall), at its current head LSN, **immediately before** the DROP. Suggested name: `pre-agent-info-drop-2026-06-DD`.
2. Created from the **production branch only** — never from a wip/test/preview git branch (NEON.md §11). Mark it **protected / non-prunable** so the nightly `neon-branch-prune` cron cannot delete it.
3. **Retain** until the DROP (and the later reclaim + downgrade) are proven stable. This snapshot is the ONLY guaranteed recovery of the `agent_info` JSON post-drop (Launch PITR is 7 days and ages out).
4. Snapshot creation is **separately approved** (per the standing hard stop) — it is not performed by this report.

### B. Exact DROP SQL (DO NOT RUN)
```sql
ALTER TABLE "listings" DROP COLUMN "agent_info";
```
- Host-guarded to cold-waterfall, inside a transaction, **after** the snapshot.
- **Metadata-only**: fast, brief `ACCESS EXCLUSIVE` lock on `listings`. It does **NOT** free the ~39 MB — those bytes persist in the heap/TOAST until a row rewrite (reclaim = a SEPARATE later step).
- **Application path:** `prisma/schema.prisma` already has the field removed; the existing checkpoint migration is a no-op (no DDL). Step 4 needs a REAL migration carrying this DROP (generating a migration now would emit exactly this `DROP COLUMN`, since the DB has the column and the schema does not), applied to prod per NEON.md — OR a single guarded SQL execution. The exact application mechanism is to be confirmed at approval time.

### C. Rollback / recovery plan
- **Primary:** restore/repoint to the **pre-drop snapshot** (B-step A) — the only path to recover the JSON after the DROP.
- **App code:** no code rollback needed — the client already doesn't reference `agent_info`; readers are typed-first / absent-safe. (Reverting code would NOT restore the column.)
- **PITR (7-day):** usable only before it ages out; the explicit snapshot is the durable safety net.
- **Emergency-stop conditions → restore snapshot:** any reader 500 in post-drop smoke; attribution renders blank in the CRM viewers; the fresh pre-DROP re-run shows `real_gap_rows > 0` or `unverifiable_gap_rows > 0`; host ≠ cold-waterfall.
- **Data note:** the DROP permanently removes the 5 stale co-list JSON values — already absent from the live feed, so no live-data loss (Decision Rule 2). All other attribution lives in the typed columns.

### D. Post-DROP measurement plan
1. Confirm the column is gone: `information_schema.columns` returns 0 for `agent_info` (read-only).
2. Re-measure: DB size + `listings` heap/TOAST/index (expect little immediate change — DROP frees no bytes).
3. Smoke: public listing pages 200 + "Mallan Real Estate Inc." renders; authenticated `/crm/sale-view` + `/crm/rental-view` still populated; Vercel runtime logs show zero `agent_info`/error.
4. **Reclaim (SEPARATE, gated):** pg_repack or dump→fresh-branch→repoint; **never `VACUUM FULL` on Neon**. agent_info ≈ 39 MB of the 696 MB TOAST.
5. **Downgrade (SEPARATE, gated):** propose Launch→Free only after a post-reclaim re-measure proves DB < 500 MB with margin AND the other JSON fronts + archive drain are resolved.

---

## HARD STOP — explicit approval required
This report is **not** DROP approval. Before any DROP: (1) Maya approves creating the snapshot, (2) Maya approves the exact `ALTER TABLE "listings" DROP COLUMN "agent_info";`, (3) a fresh read-only pre-DROP re-run confirms `real_gap_rows = 0` AND `unverifiable_gap_rows = 0` at execution time. No SQL write · no DB write · no migration · no DROP · no reclaim · no Neon downgrade · no snapshot until separately approved.
