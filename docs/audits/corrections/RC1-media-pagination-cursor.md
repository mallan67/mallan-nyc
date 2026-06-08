# Correction Trace Record — `RC1` Cotality Media pagination / cursor correctness

> **Status: PRE-REGISTERED (PLANNED) — NOT STARTED. No code yet.** This record is the pre-registration
> "no dark work" contract for RC1, created at Maya's instruction. It locks scope BEFORE any
> implementation. **Do NOT write code, open a PR, or touch the write-path until Maya gives explicit GO
> to implement RC1.** RC1 is media-program correction #2 (follows RC2, which is SETTLED on `main`
> `1047b562`/#375 + docs `7c73fa36`/#376).

## 0. Header
- **ID / Ledger row:** RC1 (media root-cause program, correction #2; relates to ledger M2 + the
  deleted-at-source clearing deferred out of RC2)
- **Severity / Compliance tie:** P1 · media display freshness (REBNY media rules) — correctness of
  what gets written to `listings.media` on incremental sync
- **Owning phase:** media program · **Maya GO:** **NOT yet given** (pre-registration only)
- **Status:** PLANNED / pre-registered

## 1. Scope — what RC1 MUST handle (Maya, verbatim)
1. **Follow `@odata.nextLink` until the Media response is exhausted.**
2. **Assemble complete per-listing media row sets before any write.**
3. **Never overwrite a listing with a partial page result.**
4. **Clear deleted-at-source media only after a complete Media result proves no non-deleted rows exist.**
5. **Fix the media-sync cursor same-timestamp deadlock using a stable continuation strategy.**

## 1a. Scope — what RC1 MUST NOT do (Maya, verbatim)
6. **No production backfill yet.** (Backfill = HELD ledger M4; stays HELD. RC1 stops/repairs the
   write-path; it does not re-pull or restore already-empty rows.)
7. **No R2 cleanup.**
8. **No search canonicalization.**
- Plus the standing exclusions: no prisma schema/migrations · no env/deploy/cron · no `.github/**` ·
  no rotate-db-keys · no live production DB writes at fix time · no denorm · no dedup/PR-Foundation ·
  no CRM frontend.

## 2. Defect — the BEFORE (to be proven test-first at implementation; classified per §J)
- **Class A (static, provable from code):**
  - The incremental Media batch fetch caps with `$top` and **does not follow `@odata.nextLink`**, so a
    truncated page can (i) omit later listings entirely and (ii) split a listing's rows at the page
    boundary (ordered `ResourceRecordKey,Order`). Both are why deleted-at-source clearing was reverted
    out of RC2 — clearing/partial-write cannot be correct without complete pagination.
  - The batch loop writes any key present in the (possibly partial) page → **partial boundary-key
    overwrite** (pre-existing on `main`, predates RC2).
  - The incremental cursor compares on `ModificationTimestamp`; a run of records sharing one timestamp
    at the page boundary can **deadlock** the cursor (advance strategy to be read-audited at start).
- **Class D (runtime — needs a read-only probe Maya runs, NOT a fix-time write):**
  - Real-world cursor-freeze age / starvation extent; whether a status/price change actually bumps
    `ModificationTimestamp` (also Class B — confirm live before relying on it). These inform the
    continuation strategy; they are **read-only** and do not gate writing the unit-provable fix.
- **RED proofs (to capture at implementation, §F — behavioral, never grep):**
  - pagination: a multi-page Media response must be fully assembled before any write (partial page ⇒
    no write / no clear).
  - clearing: `[]` written for a listing only when a **complete** result returned zero non-deleted rows.
  - cursor: a same-timestamp boundary must advance without re-processing/stalling (stable continuation).

## 3. Compliance pre-read (§D) — to perform at implementation start
- Read `COMPLIANCE-CANONICAL-INDEX.md` §8 (Media / Trestle Media API rules: `ResourceRecordKey`,
  `MediaStatus ne 'Deleted'`, no `$expand`/`$select` change unless proven) + §IDX. The deleted-at-source
  clearing is the one new *destructive* operation RC1 introduces — it must be **fail-closed (§E):** clear
  only on a provably-complete result; on any incompleteness/uncertainty, **preserve** existing media.

## 4. Fix approach (high level — exact code targeting is the first approved-implementation step)
- Introduce a pagination helper that drains `@odata.nextLink` and groups all rows per
  `ResourceRecordKey` into a **complete** map before any DB write.
- Write/clear per listing only from that complete map: present ⇒ write assembled media; absent **and
  result complete** ⇒ clear `[]`; result incomplete ⇒ write nothing (preserve).
- Replace the cursor advance with a stable continuation (e.g. timestamp **+ tiebreak key** /
  keyset-style continuation) so a same-`ModificationTimestamp` run cannot deadlock or skip.
- Pure, unit-testable helpers (pagination assembly, clear-decision, cursor advance) so each requirement
  has a behavioral RED→GREEN proof with no fix-time DB write.

## 5. Pre-registered blast radius (the "no dark work" contract)
- **WILL touch (declared — to be confirmed by a read-only code-path audit at implementation start):**
  - `lib/idx/sync.ts` — the Media batch fetch + write loops (`syncListings` + `syncAgentHistory`) and
    the incremental cursor advance.
  - the media-sync cursor/service path (`lib/media/media-sync-service.ts` and/or the media-backfill
    route's shared logic) **if** the cursor lives there — confirm at audit; declare before editing.
  - `tests/runtime/**` — behavioral tests for pagination assembly, clear-on-complete, cursor advance.
  - this Trace Record.
- **Transitive reach / consumers:** `listings.media` write path only. The search projection dual-write
  remains the pre-existing behavior (PR-5B reader swap HELD) — not changed unless explicitly re-scoped.
- **MUST NOT touch:** see §1a (no backfill/R2/search-canon) + standing exclusions.

## 6. Gates required (to run at implementation, before merge)
- B0 full harness (type-check · lint · test:runtime · crm:test · scanner · ucba:audit · compliance-check
  · rls:validate · idx:validate · audit:display-compliance · build) diffed vs frozen baseline.
- B1 compliance chain green (ucba 0 regressions · rls 0 errors/0 unknown · compliance-check
  BLOCKER+STRICT 0 · idx ≤ the 1 known media-backfill critical).
- B2 §F proof: behavioral RED→GREEN for all three requirement clusters (pagination / clear / cursor).
- gate:micro (test-first) + gate:macro (idx/search domain → tristle + rebny-search-compliance-auditor;
  declared radius reconciled).
- tristle-rebny-compliance PASS (deleted-at-source clearing is destructive → fail-closed review).
- Optional: a read-only runtime/Trestle probe (Class B/D) for the cursor strategy — Maya-run.

## 7. Sign-offs — PENDING (pre-registration)
- gate:micro / gate:macro: pending · tristle: pending · security/search auditor (if search domain
  touched): pending · Maya GO-to-implement: **pending** · Maya merge: pending.

## 8. Trace-back / reproduce — PENDING (filled at implementation)

## 9. Permanent regression guard (planned)
- Tests: multi-page Media assembly before write · clear `[]` only on complete-zero-rows · cursor
  same-timestamp boundary advances without stall/skip.

## 10. Sequence / coupled follow-ups
- **After RC1 (in order, each its own approved correction):** coverage re-pull → denorm → detail tabs /
  image quality → search canonicalization. **Backfill (M4) stays HELD** until RC1 lands (no re-pull into
  a still-mis-writing pipeline).
- RC1 owns: the deleted-at-source clearing + boundary-key partial-write **deferred out of RC2**, and the
  media-sync cursor deadlock.

---
**No implementation performed. No code, no PR. Awaiting Maya's explicit GO to start RC1.**
