# OQ-1 Design — Delete `app/api/crm/listings/reset-sync` (DESIGN-ONLY, no code changes)

> **Date:** 2026-06-12 · **Status:** DESIGN — awaiting Maya approval; this doc recommends, it does not act.
> **Origin:** OQ-1 opened by the media deep review (`docs/audits/media-system-deep-review-code-2026-06-10.md`,
> writer W16 / conflict pair "reset-sync × everything") and carried through the P1C1 trace record
> (`docs/audits/corrections/P1C1-reset-sync-rc2-patch.md` §17: "remove/disable the reset-sync route
> entirely — Maya decision, separate"). Both the security and tristle gates on P1C1 flagged the
> **delete-first design** as the real hazard; the RC2 media patch only made the route consistent,
> not safe.
>
> **Why the route is hazardous AND broken today:**
> - STEP 1 unconditionally `deleteMany({})`s **ALL** listings plus dependents
>   (`ClientListingAction`, `Showing`, `Comment`, `PriceHistory`, `MarketingActivity`,
>   `ProtectedPeriod`) — including Mallan-CRM-authored listings and CRM activity history that
>   Trestle can never restore.
> - STEP 2 re-pulls capped at `maxTotal: 2000` (`route.ts:103`). Production now holds **107K+**
>   listings. A run today deletes ~107K rows and restores at most 2,000 — functionally broken,
>   not merely dangerous.
> - The file's own header (line 2/5) says "ONE-TIME USE … After use, this endpoint can be removed."
>   The one-time bootstrap purpose is long served.

---

## 1. Caller proof — no production caller exists

### 1.1 Exhaustive repo grep (performed 2026-06-12, whole repo, `reset-sync` / `resetSync` / `reset_sync`, case-insensitive)

| Surface | Result |
|---|---|
| `public/crm/**` (all CRM frontend JS/HTML) | **ZERO matches.** No button, fetch, or link calls the route. |
| `app/**` | Only the route file itself (`app/api/crm/listings/reset-sync/route.ts:1,96,179`). No other route, page, or component references it. No `fetch('/api/crm/listings/reset-sync')` anywhere in the repo. |
| `lib/**` | Comment-only mentions: `lib/idx/trestle-mapper.ts:741`, `lib/compliance/raw-data-keep-fields.ts:51`, `lib/search/listing-search-projection.ts:485`, `lib/compliance/__tests__/trestle-mapper-shed.test.ts:10`. None invoke it. |
| `scripts/**` | Comment-only mentions: `scripts/neon-storage-audit.ts:118,120,192`, `scripts/neon-shed-raw-data.ts:16`. None invoke it. |
| `.github/**` (all workflows) | **ZERO matches.** |
| `vercel.json` | **Not in `crons`** (22 cron entries verified, none is reset-sync); not in `rewrites`/`redirects`/`functions`. |
| Docs / memory / artifacts | Historical references only (audits, trace records, AUDITOR-LOG, `artifacts/api-route-catalog.{md,json}` row — see §4 Class E). |
| Tests | Two code-level dependents (see §4): `tests/runtime/reset-sync-media-stomp.test.ts` (imports `POST` from the route) and `lib/search/__tests__/h1-dual-write-tier1.test.ts:30` (hard-coded `WIRED_WRITERS` entry that `readFileSync`s the route file). |

Conclusion: the only executable callers are its own tests. There is no UI path, no cron, no
workflow, no script that invokes the endpoint. It is reachable only by a hand-crafted broker-auth
POST.

### 1.2 Historical-invocation proof — operator queries to run as final confirmation

**Layer A (strong, durable — run this first): the audit table.** Every *successful* run writes
`logAuditEvent("listings_reset_sync", "listing", "bulk", …)` (`route.ts:229`). Audit events are
retained **2 years** (REBNY RLS floor — `app/api/cron/data-retention/route.ts:63-72` purges only
rows older than 2yr). Operator query against canonical prod (hidden-mountain / cold-waterfall,
read-only):

```sql
SELECT COUNT(*), MAX(created_at)
FROM audit_events
WHERE action = 'listings_reset_sync';
```

- `COUNT = 0` ⇒ no successful run in the last 2 years (covers the route's entire post-bootstrap life).
- Honest caveat: a run that **failed between STEP 1 and STEP 3** (deleted everything, then Trestle
  fetch 502'd at `route.ts:202`) would not write the audit event. But such a run leaves
  unmissable damage — a near-empty listings table — and production currently holds 107K+ rows,
  so the damage signature is independently absent.

**Layer B (recent-window only — honest about retention): Vercel runtime logs.** Via
`mcp__claude_ai_Vercel__get_runtime_logs` (or dashboard → Observability → Logs), filter
`pathname = /api/crm/listings/reset-sync`, expect zero invocations. **Retention is short** —
runtime log queryability is on the order of 1 day (Pro) / up to ~30 days only with Observability
Plus — so this can confirm "not invoked recently," **never** "never invoked historically." Layer A
is the historical proof; Layer B is the recency cross-check. Record both results in the removal
PR body.

---

## 2. Removal shape — options and recommendation

### Option (a) — delete the route directory entirely + tombstone test — **RECOMMENDED**

- Delete `app/api/crm/listings/reset-sync/` (the route file and its now-empty directory).
  Next.js App Router then serves a plain 404 for the path — no code needed for that behavior.
- Add a tombstone test asserting the route source is absent (see §4), mirroring the repo's
  existing absence-assertion precedent:
  `tests/runtime/idx-sync-cursor-modification-timestamp.test.ts:270` pins the *absence* of the
  media-backfill cron entry in `vercel.json` with a full explanatory comment block.
- **This is the gate consensus and the CI3 precedent.** The Lane-C CI3 media-backfill audit
  (`docs/audits/lane-c-ci3-media-backfill-cron-audit-2026-06-10.md` §5-6) evaluated exactly this
  decision shape for an orphaned route and **recommended removal (option b there)** over keeping
  it dormant, over converting to operator-only, and over allowlisting — "removal is a one-commit
  `git revert` away." Same logic applies here, stronger: reset-sync is not merely dormant cruft,
  it is an armed mass-delete.

### Option (b) — keep the path, return `410 Gone` + audit log — REJECTED

- Pros: discoverable intent at the URL; an operator who hand-crafts the old POST learns why.
- Cons, decisive:
  - §1 proves **no caller exists** — there is nobody to discover the 410. The discoverability
    benefit is hypothetical; the docs/trace-record trail (this doc, P1C1, AUDITOR-LOG) already
    records intent durably.
  - A 410 stub is a *new* route handler on a §D CRM/listings surface: it keeps a file to maintain,
    keeps a row in the route catalog, keeps auth-shape questions alive (does the stub still call
    `requireBroker`? before or after the 410?), and invites the exact "re-bless legacy code"
    failure mode CI3 §5(d) rejected.
  - Charter ethos (`REPO-SOURCE-OF-TRUTH-CHARTER.md`): no parallel/vestigial files on canonical
    surfaces. Dead intent belongs in docs, not in `app/api/**`.
  - Recovery story is identical either way: `git revert` of the deletion commit restores the
    route byte-identically (and §3 shows we never want to).

**Recommendation: (a).** Delete; tombstone test; document the replacement path (§3).

---

## 3. Replacement operator path (runbook section)

### What legitimate need did reset-sync serve?

One-time 2025-era bootstrap: after fixing the broker's Trestle identity (MLS ID `39361` /
license `10311201806`), wipe the (then-small, Trestle-only) listings table and re-pull the
agent's full history searching **both** `ListAgentMlsId`/`BuyerAgentMlsId` and
`ListAgentStateLicense`/`BuyerAgentStateLicense`. The "clean slate" was tolerable only when the
DB contained nothing but a few hundred re-derivable Trestle rows. Today the table holds 107K+
rows including Mallan-CRM-authored exclusives and CRM dependents — clean-slate is never again a
valid operation.

### Runbook — "I need to re-sync agent listings after an identity change" (post-deletion)

Every need reset-sync covered now has a **non-destructive, upsert-only** path:

1. **Agent-history re-pull (the original use case):** `POST /api/idx/sync-historical`
   (broker-only, `app/api/idx/sync-historical/route.ts`) → `syncAgentHistory()`
   (`lib/idx/sync.ts:1071`). Same both-sides identity matching, same 2000-record budget, but
   **upserts only — deletes nothing**, and its UPDATE branch is RC2-guarded
   (`mediaUpdatePatch`, `sync.ts:1163`). Run per type (`sale`/`rent`) if needed.
2. **Missing-listing recovery:** the **feed-reconcile orphan import** (P1C6,
   `app/api/cron/feed-reconcile/route.ts`, cron `30 3 * * *`) now imports orphans across
   Active ∪ Pending ∪ ActiveUnderContract, populating `listing_media` + JSON together,
   gate-checked, failures counted not looped. Nothing needs a wipe to "recover" a missing row —
   the next 03:30Z pass imports it.
3. **Targeted closed/off-market import:** `scripts/import-closed-from-trestle.ts` — per-listing
   operator script, projection dual-write wired (H1 Tier-1).
4. **Ongoing Active-set freshness:** the `idx-sync` cron (`*/10`), keyset-cursor-correct since
   RC1/RC3.
5. **Projection drift after any of the above:** `ops:projection-backfill` heals.

**Never** re-introduce a delete-first re-sync. If a true clean-rebuild is ever genuinely required
(e.g., schema catastrophe), that is a Maya-approved, scripted, Neon-branch-snapshotted operation —
not an HTTP endpoint.

---

## 4. Test plan

| # | Change | RED/GREEN | Notes |
|---|---|---|---|
| 1 | **New tombstone test** (e.g., `tests/runtime/reset-sync-route-removed.test.ts`): asserts `fs.existsSync(app/api/crm/listings/reset-sync/route.ts) === false` (and the directory absent), with a comment block pointing at this doc + the §3 replacement path — mirroring the `idx-sync-cursor-modification-timestamp.test.ts:270` absence-assertion precedent. | **RED today** (route exists) → GREEN after deletion. | A live 404 probe on the immutable preview URL is the §F proof-first capture for the PR body (a missing App Router route 404s by construction, but capture it anyway). |
| 2 | **Retire `tests/runtime/reset-sync-media-stomp.test.ts`** (deleted in the same commit — it `import { POST } from '@/app/api/crm/listings/reset-sync/route'` at :117 and cannot compile post-deletion). | n/a | **The RC2 guard it pinned lives on:** the actual contract — `mediaUpdatePatch(x, false) === {}` — is behaviorally pinned in `tests/runtime/idx-sync-media-stomp.test.ts` (:34-51) plus structural locks on `lib/idx/sync.ts:332/:1163`, all untouched by this PR. P1C1's trace record remains as history. State this explicitly in the PR body so the test deletion is not mistaken for guard removal. |
| 3 | **Edit `lib/search/__tests__/h1-dual-write-tier1.test.ts`:** remove the `WIRED_WRITERS` entry at :30 (`crm/listings/reset-sync`) — it `readFileSync`s the route and would ENOENT — and update the header comment ("5 non-sync writers" → 4). | Test red without the edit; green with it. | The dual-write contract on the four surviving writers is unchanged. |
| 4 | **No edit needed:** `tests/runtime/listing-writer-projection-coverage.test.ts` walks `app/api/**` dynamically — deletion simply shrinks the discovered writer set; it self-passes. `tests/runtime/projection-dual-write-tier2.test.ts` and `lib/compliance/__tests__/trestle-mapper-shed.test.ts` mention reset-sync in comments only — optional comment touch-up, zero behavior. | n/a | Verify by running both. |
| 5 | **Class E — route-catalog regen (CLAUDE.md J.6):** the catalog EXISTS — generator `scripts/reso/route-catalog.js` → `npm run reso:route-catalog` → `artifacts/api-route-catalog.{md,json}` (route currently listed at md:137 / json:1763). Regenerate; PR diff must show only the reset-sync row removed (+ any count lines). Prove the generator ran (J.6). `test:rls` is **not in PR CI** — run `npm run test:rls` by hand and state the result in the PR, or state plainly it was not run. | n/a | Generated "unknown" count must be zero or explicitly accepted. |
| 6 | **Full §G chain:** `type-check`, `rls:validate`, `compliance-check`, `ucba:audit` (0 regressions), `idx:validate` (0 critical), plus targeted `npm test` on the touched/new test files. | n/a | Per-check honesty (J.8): these prove static/baseline health, not runtime behavior — the runtime claim is the 404 probe (item 1). |

Comment-only stale pointers (`lib/idx/trestle-mapper.ts:741`, `lib/search/listing-search-projection.ts:485`,
`lib/compliance/raw-data-keep-fields.ts:51`, `scripts/neon-*.ts`) — **leave them in this PR** to
keep the diff out of `lib/**` source entirely (see §5); clean up opportunistically in a later
docs/comments pass, as CI3 §6 did for its equivalents.

## 5. Interference check — cannot touch the C6 (feed-reconcile) cron

- **Different route, different file:** C6 lives at `app/api/cron/feed-reconcile/route.ts`,
  scheduled `30 3 * * *` in `vercel.json:11`. The deletion removes
  `app/api/crm/listings/reset-sync/` only; `vercel.json` is untouched (also keeps the PR clear
  of the HELD cron-config surface).
- **No shared-module edits, no dead-module cascade.** Every import of the reset-sync route is a
  multi-consumer shared module that stays fully alive (grep-verified consumer counts beyond the
  route, 2026-06-12):
  - `@/lib/prisma`, `@/lib/auth` (`requireBroker`/`isAuthError`/`logAuditEvent`) — dozens of routes.
  - `@/lib/idx/auth` `hasCredentials` — idx-sync, media-sync, **feed-reconcile**, sync-historical, idx/sync, idx/status, ….
  - `@/lib/idx/fetch` `fetchFromTrestle` — idx/search, listings routes, **feed-reconcile**, suggest, building, similar, ….
  - `@/lib/idx/sync` `mediaUpdatePatch` — consumed *inside* `lib/idx/sync.ts` itself (:332, :1163); the module is the idx-sync/sync-historical engine.
  - `@/lib/idx/trestle-mapper` (`mapTrestleToPrisma`/`checkDistributionGates`/`validateHistoricalFields`) — lib/idx/sync.ts, **feed-reconcile**, ensure-listing, ….
  - `@/lib/auth/readonly-guard` `assertWriteAllowed` — broad CRM/portal write routes.
  - `@/lib/search/listing-search-projection` `dualWriteProjectionForListingId` — crm/convert, **feed-reconcile** (×2 call-sites, Tier-2-pinned at ≥2), ensure-listing, import script.
- Therefore: zero `lib/**` source edits required or permitted by this PR; feed-reconcile's
  Tier-1/Tier-2 dual-write pins, its orphan-import behavior, and its cron schedule are all
  byte-identical before/after. The only test that names both surfaces
  (`h1-dual-write-tier1.test.ts`) loses one list entry; its feed-reconcile entry and
  `tests/runtime/feed-reconcile-c6.test.ts` are untouched.

## 6. Blast radius, gates forecast, size

**Diff (forecast):**
- DELETE `app/api/crm/listings/reset-sync/route.ts` (−253 lines, directory removed)
- DELETE `tests/runtime/reset-sync-media-stomp.test.ts` (−143)
- EDIT `lib/search/__tests__/h1-dual-write-tier1.test.ts` (−1 list entry, comment tweak)
- ADD `tests/runtime/reset-sync-route-removed.test.ts` (~+30)
- REGEN `artifacts/api-route-catalog.{md,json}` (−1 row each)
- ~6 files, net ≈ **−370 lines**. No `lib/**` source, no `vercel.json`, no `public/crm/**`,
  no schema, no env, no cron config — none of the §C HELD surfaces are touched (the route is
  backend `app/api/crm/**`, not the HELD CRM *frontend* `public/crm/**`; the PR itself still
  requires Maya approval per standing practice, which this doc is requesting).

**Gates:**
- **gate:micro** — single contained deletion; no behavior change to any live write path
  (the deleted writer was manual-only, caller-proven dead per §1).
- **Macro declaration:** WILL touch the 6 files above; MUST NOT touch `lib/idx/**`,
  `lib/search/**` source, `vercel.json`, `public/crm/**`, `.github/**`.
- **security-agent: cheap confirm** — net attack-surface reduction (removes a broker-auth
  mass-delete endpoint); zero auth-logic changes; expected PASS-trivial. (P1C1's security gate
  already called the delete-first design the residual hazard — this PR is its closure.)
- **tristle: N/A-with-rationale** — no live Trestle query is added/changed; no media-write
  semantics change (the removed writer was already RC2-guarded and is deleted, not modified);
  no Class B field-truth claims are made anywhere in the PR. State this explicitly in the PR body.
- **Class E proof** (J.6) for the catalog regen, per §4 item 5.
- **Proof-first (§F):** RED→GREEN tombstone test in the same PR + live 404 probe on the preview URL
  + the §1.2 Layer A/B operator-query results pasted into the PR body.
