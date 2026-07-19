# Release-Safety Runbook (P2 controls)

> Shipped by `fix/release-safety-controls-p2-clean` (P2 of the strict roadmap).
> Origin: the PR #523 incident — production `/listing/*` 500s (Next.js E132) that
> no CI layer, no smoke, and no deploy check caught, plus a revert-merge that was
> assumed deployed but never was.
>
> **Completion vocabulary (mandatory):** NOT-STARTED · CODE-PRESENT · CODE-TESTED ·
> WORKFLOW-WIRED · PREVIEW-PROVEN · CANARY-PROVEN · PRODUCTION-PROVEN · PARTIAL ·
> BLOCKED · NOT-APPLICABLE. Nothing here is "done" without its level.

## The controls

| # | Control | Where | Runs |
|---|---|---|---|
| 1 | ISR Redis/cache import guard (transitive, TS compiler API) | `tests/runtime/release-safety-source-guards.test.ts` + `scripts/release-safety/import-graph.js` | automatically in PR CI (`pr-check` → root jest → runtime project) |
| 2 | ISR `cache:'no-store'` source contract | same test file | automatically in PR CI |
| 3 | Five-probe listing smoke | `scripts/release-safety/listing-smoke.js` | **post-deploy runbook step — never hourly** (see cost note) |
| 4 | Deployment-SHA verifier (bounded polling, read-only Vercel) | `scripts/release-safety/verify-deployment-sha.js` | post-merge runbook step; optional CI gate via flag |
| 5 | Release-Truth hardening (`PENDING/UNKNOWN ⇒ UNVERIFIED`; `--require-deploy-proof`) | `scripts/release-truth-check.js` + `scripts/release-safety/release-truth-verdict.js` + `.github/workflows/release-truth.yml` | on every push/PR (advisory); hard gate off by default |
| 6 | Hourly live-site failure propagation | `.github/workflows/live-site-cron.yml` | hourly (existing checks only — no listing probes added) |
| 7 | Known-good deployment ledger | `scripts/release-safety/record-known-good.js` → `docs/operations/known-good-deployments.jsonl` | post-verification runbook step |
| 8 | Wiring regression pins | `tests/runtime/release-safety-workflow-wiring.test.ts` | automatically in PR CI |

## Post-deployment procedure (run after EVERY production release)

All commands use the existing dependency tree (`node scripts/...`) — no installs.
Vercel calls are read-only GETs. Requires `VERCEL_TOKEN` (read-only scope expected —
verify the token's actual scope before first use; its live scope is
PRODUCTION-UNVERIFIED) and `VERCEL_PROJECT_ID`. Never echo the token.

```bash
# 1. Prove the deployment that is LIVE was built from the merge SHA
#    (bounded: 10 attempts x 30 s ≈ 5 min, then fail-closed nonzero exit).
node scripts/release-safety/verify-deployment-sha.js --expected-sha <merged-sha>
# exit 0 = MATCH · 2 = SHA_MISMATCH · 3 = NOT_READY · 4 = UNKNOWN/error

# 2. Prove the listing surfaces actually serve (the PR #523 gap).
node scripts/release-safety/listing-smoke.js --base-url https://mallan.nyc
# exit 0 = all five probes pass · 1 = any probe failed (JSON report on stdout)
# Optional stable pin: SMOKE_LISTING_ID=<id> or --listing-id <id>.

# 3. Record the verified deployment as the next rollback target.
node scripts/release-safety/record-known-good.js --expected-sha <merged-sha> --verified-by "<name>"
```

**If verification fails (step 1 or 2): stop the release process, preserve the
evidence (script output, run URLs, the failing probe report), notify Maya, and
obtain Maya's explicit written authorization before any manual rollback or
alias change.** The last entry in `docs/operations/known-good-deployments.jsonl`
identifies the recorded rollback candidate for that decision — the record
informs the decision; it does not authorize the action.

**This PR authorizes no rollback, promotion, alias change, deployment
deletion, or Vercel settings change.** None of these scripts can perform any
of those actions (read-only GET + a local ledger append only).

## Why the listing smoke is NOT in the hourly cron

Code-traced in the 2026-07-19 preflight: one full run ≈ 6+ HTTP requests,
~7–15 Neon queries, up to 1 Neon audit write (`trestle_access`), 2–6 Cotality
requests — negligible per release. Repeated probes increase Neon wake
frequency; actual active time and CU consumption require production
measurement. Per the Neon closure program, cadence/monitoring decisions stay
with Maya, with measured cost stated first — so the smoke ships as a
post-deploy step only, and any continuous-monitoring cadence (4×/day,
HEAD-style probes, etc.) is a separate decision.

## Enabling the hard deploy-proof gate (Maya's switch — not enabled by P2)

The Release-Truth workflow passes `--require-deploy-proof` (exit 0 only on
`PROD_PROVEN`) when the repository variable
`RELEASE_TRUTH_REQUIRE_DEPLOY_PROOF` is set to `true`
(Settings → Secrets and variables → Actions → Variables). Creating that
variable is the enable switch; P2 ships the wiring OFF. Note: `main` currently
has **no branch protection**, so even a red check blocks nothing mechanically —
merge discipline remains procedural until branch protection is configured
(a separate, Maya-gated settings change).

## Proof-tier status at P2 merge time

- Controls 1, 2, 5, 8: CODE-TESTED and WORKFLOW-WIRED (PR CI). PRODUCTION-PROVEN
  n/a (static guards).
- Control 3: CODE-TESTED (mocked). PRODUCTION-PROVEN only per-release when run.
- Control 4, 7: CODE-TESTED (mocked). PRODUCTION-UNVERIFIED until first real run
  against the Vercel API.
- Control 6: CODE-PRESENT + pinned; WORKFLOW-WIRED proof = the first cron run
  after merge (check the Actions tab: a FAIL hour must show a red run).
