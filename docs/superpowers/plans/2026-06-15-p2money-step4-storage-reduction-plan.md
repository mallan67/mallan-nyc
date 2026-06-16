# P2-MONEY Step 4 — Storage-reduction plan (REVISED) — the path to Neon Free

> **STATUS: PLAN ONLY — NO EXECUTION AUTHORIZED.** No cleanup, no column drop, no archive run,
> no VACUUM, no migration, no Neon downgrade. Every step separately Maya-gated. This document
> records the **revised conclusion** after the 2026-06-15 Free-tier investigation corrected two
> assumptions in the first draft. Author: Claude (Fable 5), 2026-06-15.
>
> **Evidence:** `docs/audits/neon-storage-cost-audit-2026-06-12.md` (committed) · Neon docs
> ([plans](https://neon.com/docs/introduction/plans), [synthetic-size](https://github.com/neondatabase/neon/blob/main/docs/synthetic-size.md))
> · direct read of `app/api/cron/data-retention/route.ts`.

---

## REVISED CONCLUSION (the headline)

1. **Neon Free target = 512 MB (0.5 GB) per project.** Confirmed authoritative — not higher, not a
   helpful aggregate. Free PITR window is 6 hours (vs Launch 7 days).
2. **Current DB is ~1.1 GB of genuinely LIVE/logical data — not dead-tuple bloat.** Neon bills
   *synthetic/logical size*, not `pg_database_size`; that distinction raised the hope that bloat
   was inflating the number. It is not: audit §5 shows `listings` is only **11.6% dead (~30 MB)**;
   autovacuum keeps up. So logical ≈ `pg_database_size` − ~30 MB ≈ **~1,100 MB live.**
3. **The main storage blocker is REDUNDANT LEGACY JSON in `listings`.** Of the 894 MB `listings`
   table, **663 MB is TOAST'd legacy JSON** — `raw_data` 258 MB (a full copy of the raw Trestle
   payload; Trestle is the live source, so it is a re-fetchable cache), `compliance` 197 MB
   (derivable from gate fields), `media` 5.7 MB (superseded by the `listing_media` table),
   `features` 99 MB, `agent_info` 38 MB, `address` 34 MB. The *genuinely needed* data is
   ~450–500 MB — i.e. "Free shouldn't be a problem" is right in principle; the DB is carrying
   ~630 MB of dead-weight duplicate JSON.
4. **Archive-only is INSUFFICIENT.** Archiving terminal rows (even after fixing the eligibility
   bug — see §B and the separate correction scope) only strips `raw_data`+`compliance`+`media`
   **on the ~91.5K terminal rows** → ~461 MB → DB ~674 MB, **still over 512 MB.** It cannot touch
   the same JSON on the ~16K live/displayable rows, and it leaves `features`/`agent_info`/`address`
   even on terminal rows.
5. **Free is achievable ONLY through safe legacy-JSON elimination / normalization, + audit
   compaction, + ongoing archival discipline.** Each "size" below is the **post-rewrite target**
   reached by NULLing the column values (a row rewrite) + GC past the PITR window — **NOT** the
   output of `DROP COLUMN`, which is catalog-only and frees no bytes (see §C, Codex #404). Targets
   are projections from the 06-12 audit; the go/no-go uses the **measured** Neon billed size after
   the rewrite (Step 6), never these estimates:

   | Action — NULL the values (row rewrite), then DROP COLUMN as cleanup; each separately gated | post-rewrite DB size |
   |---|---|
   | Today | ~1,135 MB |
   | Strip `raw_data` + `compliance` + `media` (all rows) | ~674 MB |
   | + strip `features` (if proven unused at render) | ~575 MB |
   | + audit compaction (the 35 MB diagnostic burst) | ~540 MB |
   | + normalize `address`/`agent_info` into structured columns, then strip JSON | **~470–510 MB → under Free** |

6. **$19 Launch remains the low-maintenance floor** unless the JSON-drop path is COMPLETED AND
   PROVEN. Even when complete it lands **right at the 512 MB cap with thin margin** vs ~45 MB/mo
   organic growth, and Free **autosuspends** idle compute (cold starts for visitors). Free is a
   schema/data-model cleanup *project*, not a quick cleanup job.

## A. Hard dependencies (why this is not "just drop the columns")
- **PR 5B** (public reader swap off `listings.idx_display_yn`/JSON → projection) — HELD. Until the
  read path no longer touches the JSON, dropping it would break rendering.
- **Step 5** (prove no read path depends on each JSON column) — the gate that must pass per column
  before any drop. The read-only **dependency probe plan** (companion doc
  `2026-06-15-step4-readonly-probe-plan.md`) inventories those paths.
- Normalizing `address`/`agent_info` is a real data-model change (M1-class), not a delete.

## B. The archive eligibility bug (now scoped as a STANDALONE correction)
Root cause (code-proven, `data-retention/route.ts:162-168`): the T+180 archive filters
`status_changed_at < now-180d`, and **a NULL `status_changed_at` silently fails `{ lt: … }`** →
bulk-synced terminal rows are invisible forever (only 34 of ~91,536 ever archived). This is a
**latent storage leak worth fixing on its own merits**, independent of the $0 goal. Scoped
separately in `docs/audits/corrections/scope-archive-eligibility-bug-2026-06-15.md` (code + RED
test; preserves the batch cap + dry-run; NO cleanup execution in that PR). Archive remains a
*secondary* lever — it helps terminal rows but cannot reach Free alone (§5.4).

## C. Reclaim mechanism (Neon, no VACUUM FULL) — CORRECTED per Codex #404

**`DROP COLUMN` does NOT reclaim storage.** In Postgres it is a **catalog-only** change — it marks
the column dropped but leaves the existing values in the heap/TOAST pages untouched, so the bytes
(and the billed/logical size) stay until the rows are **physically rewritten**. This matches the
audit's §5/R4 note ("autovacuum reclaims for reuse but never shrinks the file; only a rewrite
does"). **Relying on `DROP COLUMN` alone would leave billed storage near current size — a downgrade
approved on the §5 waterfall would then breach the cap.** The waterfall sizes are *post-rewrite*
targets, not `DROP COLUMN` outputs.

**The bytes are reclaimed only by a ROW REWRITE that drops the JSON values, then GC past the PITR
window:**
1. **Batch `UPDATE listings SET raw_data = NULL, compliance = NULL, … ` (bounded batches).** This
   rewrites each row to a smaller live tuple; the old tuple becomes dead. (Same mechanism the
   data-retention archive already uses for terminal rows.)
2. **Garbage collection:** on Neon's log-structured storage the old page versions drop out of the
   billed synthetic size only after they **age past the PITR window** (6 h Free / 7 d Launch) +
   autovacuum. So reclaim **lags** the UPDATE by the retention window — plan for it.
3. **`DROP COLUMN` last, as catalog cleanup ONLY** — after the values are nulled and the schema no
   longer needs the column. It frees no additional bytes by itself.
4. **If a full table rewrite is ever needed** (e.g. to compact remaining bloat), use an **online
   copy-swap or `pg_repack`-style** path — **never `VACUUM FULL`** (it blocks all traffic on Neon).

**MEASURED-PROOF GATE (Step 6, mandatory):** the Free-tier go/no-go must read the **actual Neon
billed synthetic size from the console/API AFTER the row-rewrite + PITR-window elapse** — never a
projected `DROP COLUMN` size. No downgrade is approved on a projection.

## D. Recommended sequence (Maya's bottom line, adopted)
1. **Fix the archive bug** (standalone correction — closes the latent leak; does NOT reach Free).
2. **Document the Free path** (this doc).
3. **Run read-only dependency/savings probes** (companion probe plan — confirms per-column savings
   + which columns are safe to drop vs must be normalized).
4. **Do NOT approve JSON drops or the Neon downgrade yet.** Those wait on PR 5B + Step 5 proofs +
   explicit Maya approval. The first authoritative number to confirm is the **actual Neon billed
   synthetic size** (Neon console → project → Usage/Billing → Storage) vs the ~1,135 MB
   `pg_database_size` proxy.

---
*Plan only. No execution. Free is a schema-cleanup project gated on PR 5B + Step 5, not a quick
job. $19 Launch is the safe floor until that path is completed and proven.*
