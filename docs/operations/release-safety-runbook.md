# Release-Safety Runbook (P2 controls)

> **Proposed by draft PR #536** (strict roadmap Prompt 2) — unmerged; nothing in
> this document is live until that PR merges and each control earns its level.
> Origin: the PR #523 incident — production `/listing/*` 500s (Next.js E132) that
> no CI layer, no smoke, and no deploy check caught, plus a revert-merge that was
> assumed deployed but never was.
>
> **This PR authorizes no rollback, promotion, alias change, deployment
> deletion, or Vercel settings change.** Every Vercel operation below is a
> read-only GET; the only write anywhere is a local JSONL append.
>
> **Completion vocabulary (mandatory):** NOT-STARTED · CODE-PRESENT · CODE-TESTED ·
> WORKFLOW-WIRED · PREVIEW-PROVEN · CANARY-PROVEN · PRODUCTION-PROVEN · PARTIAL ·
> BLOCKED · NOT-APPLICABLE. Nothing here is "done" without its level.

## The controls

| # | Control | Where | Runs |
|---|---|---|---|
| 1 | Forbidden cache/Redis import guard — roots = EVERY `app/**/page.*` + `layout.*`; forbidden = `@upstash/redis`, `lib/redis`, `lib/cache/durable-cache` (+ `lib/middleware/rate-limiter`); fail-closed on parse errors, unresolved imports, and unauthorized computed imports (reviewed baseline: empty) | `tests/runtime/release-safety-source-guards.test.ts` + `scripts/release-safety/import-graph.js` | automatically in PR CI |
| 2 | Revalidate/no-store contract — roots = `revalidate`-declaring files incl. `app/sitemap.ts`; **exact SOURCE-CLASSIFIED allowlist only**: `IDXDisclaimer.tsx` (AST-proven inside `useEffect`) and `lib/idx/auth.ts` (AST-proven non-GET token POST). No blanket client-component or non-GET exemptions. | same files | automatically in PR CI |
| 3 | Five-probe listing smoke — discovery requires `success===true`; canonical URL consumed verbatim; ID-alias must provably end at the canonical URL; similar query built from the discovered listing's real price/postalCode/beds/type and its response must carry `listings[]` + recognized `_compliance.source`; open-houses is **HTTP/JSON-CONTRACT-PROVEN only** (backend Neon/Cotality health UNVERIFIED under its degrade-to-empty contract); output is factual evidence (observed_at, base_url, expected_sha, deployment_id, listing, per-probe results) — no proof-tier labels | `scripts/release-safety/listing-smoke.js` | **runbook post-deploy step — never hourly** (cost note below) |
| 4 | Deployment-SHA verifier — resolves the deployment **serving the production alias** (`GET /v13/deployments/mallan.nyc`), requires READY + exact SHA + alias in the deployment's own list; bounded polling; only MATCH exits 0 | `scripts/release-safety/verify-deployment-sha.js` | post-merge runbook step; invoked by the Release-Truth gate when enabled |
| 5 | Release-Truth hardening — `DEPLOY_PENDING/UNKNOWN ⇒ UNVERIFIED`; Preview evidence caps at `PREVIEW_PROVEN`; checks-green-without-alias-proof ⇒ `UNVERIFIED`; `PROD_PROVEN` requires production-alias proof **plus** passing smoke evidence; absent required checks are pending, never pass; single aggregator execution with preserved stderr; fail-closed `error` status on invalid output | `scripts/release-truth-check.js` + `scripts/validate-release-status.js` + `scripts/release-safety/release-truth-verdict.js` + `.github/workflows/release-truth.yml` | every push/PR (advisory); hard gate off by default |
| 6 | Hourly live-site honesty — validator runs ONCE; the run fails on nonzero exit, missing/invalid JSON, or `summary.fail > 0`; BLOCKED/UNVERIFIED results are reported as PASS-WITH-GAPS, never as fully clean; no listing probes added hourly | `.github/workflows/live-site-cron.yml` | hourly |
| 7 | Known-good record — mandatory expected SHA + exact verified deployment ID + passing smoke evidence bound to both; post-smoke alias-ownership reconfirmation; dedup by deployment+SHA; refuses incomplete records | `scripts/release-safety/record-known-good.js` → `docs/operations/known-good-deployments.jsonl` | post-verification runbook step |
| 8 | Wiring regression pins (incl. vercel.json cadences untouched — COTALITY-10 is a separate stage) | `tests/runtime/release-safety-workflow-wiring.test.ts` + pins inside the release-truth suite | automatically in PR CI |

## Post-deployment procedure (run after EVERY production release)

All commands use the existing dependency tree (`node scripts/...`) — no installs.
Requires `VERCEL_TOKEN` (read-only scope expected — verify the token's actual
scope before first use; its live scope is PRODUCTION-UNVERIFIED). Never echo
the token.

```bash
# 1. Prove mallan.nyc is served by a READY deployment built from the merge SHA.
node scripts/release-safety/verify-deployment-sha.js --expected-sha <merged-sha>
# exit 0 = MATCH · 2 = SHA_MISMATCH · 3 = NOT_READY · 4 = UNKNOWN/alias unproven
# Note the deployment id from the MATCH output — it binds the next two steps.

# 2. Prove the listing surfaces actually serve, binding the evidence to the
#    verified deployment:
node scripts/release-safety/listing-smoke.js --base-url https://mallan.nyc \
  --expected-sha <merged-sha> --deployment-id <dpl_from_step_1> > smoke.json
# exit 0 = all five probes pass · 1 = any probe failed
# Stable pin (optional): --listing-id <id> --listing-url </listing/...>

# 3. Record the fully-verified deployment (refuses anything incomplete,
#    reconfirms alias ownership, dedups):
node scripts/release-safety/record-known-good.js --expected-sha <merged-sha> \
  --deployment-id <dpl_from_step_1> --smoke-evidence smoke.json --verified-by "<name>"

# 4. (Optional) A PROD_PROVEN release-truth verdict now becomes reachable:
node scripts/release-truth-check.js --sha <merged-sha> \
  --deploy-proof <verifier-output.json> --smoke-evidence smoke.json
```

**If verification fails (step 1 or 2): stop the release process, preserve the
evidence (script output, run URLs, the failing probe report), notify Maya, and
obtain Maya's explicit written authorization before any manual rollback or
alias change.** The known-good record file identifies the recorded rollback
candidate for that decision — the record informs the decision; it does not
authorize the action.

## The known-good file is a LOCAL RECORD — not a durable rollback ledger

`docs/operations/known-good-deployments.jsonl` is **LOCAL-RECORD ·
NOT-DURABLE · NOT-WORKFLOW-WIRED** (each record carries these labels). It is a
working-copy note that shortens the next incident's target lookup. It is not
replicated, not tamper-evident, not wired into any workflow, and must not be
described as a dependable rollback mechanism. Making it durable (repo-committed
per release, or an external store) is a separate decision for Maya.

## Why the listing smoke is NOT in the hourly cron

Code-traced in the 2026-07-19 preflight: one full run ≈ 6+ HTTP requests,
~7–15 Neon queries, up to 1 Neon audit write (`trestle_access`), 2–6 Cotality
requests — negligible per release. Repeated probes increase Neon wake
frequency; actual active time and CU consumption require production
measurement. Per the Neon closure program, cadence/monitoring decisions stay
with Maya, with measured cost stated first — so the smoke ships as a
post-deploy step only, and any continuous-monitoring cadence (4×/day,
HEAD-style probes, etc.) is a separate decision.

## Enabling the production hard gate (Maya's switch — not enabled by P2)

Setting the repository variable `RELEASE_TRUTH_REQUIRE_DEPLOY_PROOF` to `true`
(Settings → Secrets and variables → Actions → Variables) makes the
Release-Truth workflow, on non-PR events only:
1. run the alias-aware production verifier against the target SHA — the
   workflow run FAILS if mallan.nyc is not served by a READY deployment built
   from that SHA with proven alias ownership; and
2. feed that proof to the aggregator, whose verdict stays honest: it still
   reads UNVERIFIED (status pending) until runtime smoke evidence is supplied
   via the runbook — `PROD_PROVEN` is never claimed without it.
Without the variable, everything is advisory. PR events are never
production-gated and cap at `PREVIEW_PROVEN`. Note: `main` currently has
**no branch protection**, so even a red check blocks nothing mechanically —
merge discipline remains procedural until branch protection is configured
(a separate, Maya-gated settings change).

## Proof-tier status at PR #536 review time

- Controls 1, 2, 5, 8: CODE-TESTED; WORKFLOW-WIRED on PRs via pr-check.
  PRODUCTION-PROVEN NOT-APPLICABLE (static guards).
- Control 3: CODE-TESTED (mocked). PRODUCTION-UNVERIFIED until first real
  post-release run.
- Control 4: CODE-TESTED (mocked). PRODUCTION-UNVERIFIED (never run against
  the real Vercel API; token scope unverified).
- Control 6: CODE-PRESENT + pinned; WORKFLOW-WIRED proof = the first
  post-merge cron run (a FAIL hour must show a red run).
- Control 7: CODE-TESTED (mocked). PRODUCTION-UNVERIFIED; output is
  LOCAL-RECORD / NOT-DURABLE / NOT-WORKFLOW-WIRED by design.
