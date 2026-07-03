# Lane C — CI3 Audit: Orphaned Cron Route `/api/cron/media-backfill` (2026-06-10)

> **Report-only.** No code, cron, env, DB, or schedule changes were made. Produced for the
> 4-lane parallel audit; ledger row **CI3** (`docs/audits/settlement-ledger-2026-06.md:62`).
> This route is the **single known critical** in `npm run idx:validate`
> (`[10/35] Cron Schedule Completeness: /api/cron/media-backfill → NOT SCHEDULED`),
> confirmed live this session: `TOTAL: 1283✓ 1 critical 3 warning 37 info · RESULT: FAIL`.

---

## 1. What the route does (cited)

File: `app/api/cron/media-backfill/route.ts` (45 lines, GET handler, `maxDuration = 120`).

Two phases per invocation, both **writers to the legacy `listings.media` JSON column** —
NOT the canonical `listing_media` table that the RC1/RC2/RC3-settled media-sync path uses:

1. **`backfillEmptyMedia({ limit: 100 })`** — `lib/idx/sync.ts:668-830`
   - Raw SQL selects up to `limit` listings whose `media` is NULL / `[]` / `{}` /
     object-shaped / photo-less array, or whose Trestle `PhotosChangeTimestamp` >
     DB `modification_timestamp` (sync.ts:696-721).
   - Fetches `odata/Media` in batches of **15** (URL-length limit, sync.ts:743),
     filter includes `MediaStatus ne 'Deleted'` (sync.ts:765) — so it does exclude
     Trestle-side tombstoned photos.
   - Writes via `prisma.listing.updateMany({ data: { media } })` (sync.ts:813-816).
2. **`migrateMediaToR2({ limit: 50 })`** — `lib/idx/sync.ts:841-961`
   - Selects up to 50 listings whose `media` JSON still contains cotality/corelogic URLs,
     downloads each photo, uploads to R2, rewrites the `media` JSON with R2 URLs
     (`prisma.listing.updateMany`, sync.ts:948-951). No-op if R2 unconfigured.

**Gate/tombstone posture of the writes:**
- Partially gate-aware: eligibility query excludes `sync_status = 'gated:owner_opt_out'`
  and `'gated:participant_only'` (sync.ts:717-718). It does **not** check
  `idx_display_yn` / `internet_*_display_yn` — it will fetch and store media for
  non-displayable rows (storage waste, not a display violation — the display gate sits
  in the reader, and writes only touch the `media` field).
- It completely **bypasses the `listing_media` retry/cooldown/3-strike-tombstone
  machinery** (RC3, `lib/idx/media-sync.ts`) — it predates it and writes a different column.
- It has **no concurrency guard** (incident finding, PR #176 commit message) and no
  cursor — every run re-derives eligibility from scratch.

**Destructive potential:** moderate. Each run can rewrite the `media` JSON of up to
~150 rows. The 2026-04-24 bug history (sync.ts:783-791) shows this exact writer once
re-wrote thousands of rows with `[]` on every pass; the 2026-05-21 incident attributed
part of the `listings` table growth **173 MB → 871.51 MB in 23 days** to its churn.

**Effective timeout caveat:** the file exports `maxDuration = 120`, but `vercel.json`'s
`functions` block lists explicit 120s overrides only for `idx-sync` and `media-sync`
route files, with `app/api/**/*.ts` capped at 30 (vercel.json:31-41). If re-deployed and
invoked, the effective limit may be 30s — untested, since it is never invoked.

## 2. History

| Date | Commit / PR | Event |
|---|---|---|
| 2026-04-03 | `af0c1e57` | Route created and scheduled (every 8 min, later `*/15`) |
| 2026-04-05/06 | `f1d9a5cd`, `db071b97` | Hardening + R2 phase added |
| 2026-05-10 | `24af0f2d` | Briefly disabled — "masked the cursor freeze for ~24h" (incident doc timeline) |
| 2026-05-21 | `ef9fd55a` / **PR #176 (MERGED)** | **Schedule removed from `vercel.json` as P0 incident mitigation ("PR A")**, route file deliberately kept ("Reversible by re-adding the 1 line") |

Why orphaned: PR #176 was a surgical 1-line `vercel.json` removal during the
2026-05-21 P0 Neon/media incident (`docs/incidents/2026-05-21-chronic-media-sync-root-cause.md`).
Rationale in the commit: redundant with the newer `media-sync` (`listing_media` + R2)
path, no concurrency guard, legacy-JSON storage churn, ~50% of cron compute pressure.
The route file was intentionally left behind as a reversibility hatch, which is exactly
what idx:validate §10 now flags.

**Standing guard already in the repo:** `tests/runtime/idx-sync-cursor-modification-timestamp.test.ts:270-292`
**asserts `vercel.json` does NOT contain `/api/cron/media-backfill`**. Re-scheduling it
(option a) would break this test by design.

## 3. Auth posture today

**Good — fail-closed.** Route lines 14-19: requires `Authorization: Bearer <CRON_SECRET>`
compared with `crypto.timingSafeEqual` after a length pre-check; if `CRON_SECRET` is
unset, **every request 401s** (the `!cronSecret` clause fails closed). A second guard
returns 503 if Trestle credentials are absent (lines 21-23).

idx:validate `[11/35] Cron Secret Validation Pattern` **PASSes this route** (confirmed
live this session). **No one can invoke it unauthenticated today.** It is dormant attack
surface only in the sense that anyone holding `CRON_SECRET` (or a future accidental
re-schedule) re-activates a legacy mass writer.

## 4. Relationship to M4 (HELD backfill)

**This route is NOT the intended M4 executor.** Ledger row M4 = "~8,568 displayable
listings with no active `listing_media`" — a backfill **into the `listing_media` table**
plus denorm (`primary_photo_url`/`photo_count`) recompute. The approved preview path is
PR #364 (OPEN, docs-only): a read-only SQL pack mirroring `computeListingMediaSummary()`,
with the explicit rule that "no backfill executes until each write PR is separately
approved." This cron route writes the **legacy `listings.media` JSON column** — the
opposite direction from M4's convergence target, and the surface M1 ("3+ media writers;
projection unread") wants to retire.

**However**, scheduling it would still effectively start an unsupervised mass-write
program adjacent to HELD M4 (Phase 1 backfills photo-less listings — substantially the
same population as the M4 gap, into the wrong column) while RC1 catch-up is still
draining its boundary cluster. **Flag: option (a) is a de-facto HELD-program start and
must be treated as Maya-gated twice over (cron config + M4 hold).**

## 5. Option analysis

### (a) Schedule it — REJECT
- Re-introduces the exact writer PR #176 removed during a P0 incident; storage-churn and
  no-concurrency-guard findings are unremediated.
- Breaks the standing test (idx-sync-cursor test, lines 270-292) that asserts its absence.
- Writes the legacy JSON column against the M1/M4 convergence direction; competes with
  RC1 catch-up for Trestle quota and Neon compute.
- De-facto starts work adjacent to the HELD M4 program. `vercel.json` crons are
  Maya-gated regardless.

### (b) Remove it — RECOMMENDED
- Deletes only the HTTP trigger (`app/api/cron/media-backfill/` directory). The library
  functions `backfillEmptyMedia` / `migrateMediaToR2` stay in `lib/idx/sync.ts`
  untouched (M1, HELD, owns their eventual retirement) and remain invocable from any
  future approved operator route or script if a legacy-JSON repair is ever needed.
- idx:validate §10 goes green (directory-scan based; removed directory = no entry),
  restoring the CLAUDE.md §B baseline "idx:validate → 0 critical". §11 also stops
  scanning it.
- "Lose the M4 executor" risk is **not real** — §4: M4's executor is a separate,
  separately-approved `listing_media` write PR, not this route.
- Residual risk: losing the on-demand repair lever for `listings.media` JSON, which is
  still the public-reader fallback for the M4-gap rows. Mitigation: removal is a
  one-commit `git revert` away, and the real fix for those rows is M4 itself.
- Aligns with the validator's own remedy text ("Add to vercel.json **or delete**") and
  with CI3's framing of the route as cruft ("orphaned media-backfill route").

### (c) Protect / keep unscheduled as-is — REJECT
- §10 of `scripts/idx-validate.js` (lines 589-608) has **no allowlist or annotation
  mechanism** — it never reads route contents, so `IDX-VALIDATE-IGNORE` (which §9/§12
  honor) cannot acknowledge it. Staying as-is means idx:validate FAILs forever, CI
  exits non-zero, and the "0 critical" baseline is permanently red → alarm fatigue and
  a normalized-failure culture around the one validator that gates IDX work.
- Adding an allowlist to §10 just to keep a dormant legacy writer is validator-weakening
  to protect dead code — backwards.

### (d) Convert to operator-only route — VIABLE FALLBACK, NOT PREFERRED
- Moving it out of `app/api/cron/` (e.g. `app/api/admin/media-backfill`) with explicit
  operator auth would also silence §10 (directory-based) and keep a manual lever.
- But it preserves and re-blesses a **legacy-JSON writer** that M1's held refactor
  intends to eliminate, adds an auth-pattern change (security-agent review), and creates
  a file-move in the media/IDX surface (charter §A.2 applies). More moving parts than
  (b) for a lever nobody has needed in the 20 days since the pause, and whose underlying
  functions remain available in `lib/idx/sync.ts` anyway.

## 6. Recommendation + correction plan

**Recommend (b): remove the route.** Single contained correction, sized gate:micro.

Eventual PR contents:
1. Delete `app/api/cron/media-backfill/route.ts` (and the now-empty directory).
2. `lib/idx/sync.ts` — **no functional change**; optionally update the two stale
   "media-backfill cron" comments (sync.ts:666, 839) to note the trigger was removed
   2026-05-21 (PR #176) and deleted by this PR; functions retained pending M1.
3. `tests/runtime/idx-sync-cursor-modification-timestamp.test.ts` — existing
   absence-assertion (line 270) still passes; update its comment block (lines 271-288)
   which currently states "The route file ... remains in the repo."
4. Regenerate `artifacts/api-route-catalog.{md,json}` (route listed at md:215 /
   json:3026) via its generator — Class E artifact, prove the generator ran.
5. Verify: `npm run idx:validate` → 0 critical (this PR flips the known-red validator
   green — proof-first satisfied by the validator run itself), `npm run type-check`,
   full §G chain, `npm test` for the runtime test file.

Stale references to schedule for cleanup (some in HELD surfaces — see §7):
- `.claude/agents/repo-audit-bot.md:60` and `.github/workflows/repo-audit-bot.yml:13,416`
  — "Do not remove or disable the `media-backfill` cron." This is a *bot guardrail*
  (don't act unilaterally), already overtaken by Maya-approved PR #176; it should be
  updated or struck **with Maya approval** since agents + workflows are HELD.
- `scripts/audit-media-mediatype-corruption.ts:24,287,306` — assumes "next media-backfill
  cron run (every 8 minutes)" repopulates; stale since 2026-05-21, would become wrong-er.
- `scripts/ops-health.js:38-41`, `lib/media/photo-fallback.ts:36`,
  `app/api/crm/listings/reset-sync/route.ts:96`, `app/api/listings/route.ts:499` —
  comment-only mentions; harmless, fix opportunistically.

Gates needed:
- **gate:micro** — file deletion + test-comment + artifact regen; no behavior change to
  any live write path.
- **security-agent: not required** (no auth logic changes; net attack-surface reduction).
  Required only if option (d) were chosen instead.
- **tristle: not required** — no live media-write behavior changes (deleting a dormant
  trigger; `lib/idx/sync.ts` writers untouched). State this explicitly in the PR.
- **Class E proof** (J.6) for the api-route-catalog regen.

## 7. Maya-gated items

| Item | Why gated | Needed for (b)? |
|---|---|---|
| `vercel.json` crons | Cron config = HELD (§A.7/§C) | **No** — (b) does not touch `vercel.json`. (Option (a) would.) |
| `.claude/agents/repo-audit-bot.md` | Agents = HELD | Yes, for the stale "do not remove media-backfill cron" line — needs explicit approval or defer to a follow-up |
| `.github/workflows/repo-audit-bot.yml` | Workflows = HELD | Same as above — can be deferred; the bot directive is report-only guidance and the line becomes moot once the route is gone |
| M4 execution | HELD program (dry-run→execute) | Not started by (b); explicitly NOT this route's job (§4) |
| The removal PR itself | Touches the media/IDX surface; per standing practice all corrections in this audit cycle are Maya-approved before any code change | Yes — this report recommends, it does not act |

If Maya prefers zero HELD-surface contact in the first pass, the minimal PR is items
1-5 of §6 only (route + test comment + artifact regen), leaving the repo-audit-bot
references for a separately-approved docs/agents PR. The minimal PR alone turns
idx:validate green and settles the validator half of CI3 (the db-keepalive and VACUUM
halves of CI3 are out of Lane C scope).
