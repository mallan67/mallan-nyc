# Vercel Preview Proof Rules

**Status:** OPEN · REPORT-ONLY · No workflows changed. No production code touched. Sister doc: `docs/engineering/pr-verification-checklist.md`.
**Date:** 2026-05-18
**Author:** Claude Code under Maya direction.
**Scope:** Codify the Vercel-preview-verification failure modes from 2026-05-17 as report-only rules.

---

## TL;DR — the 5 rules in this doc

| # | Rule | Why |
|---|---|---|
| **V1** | **Immutable Vercel URL rule** — every Playwright / curl / DOM probe of a preview deploy MUST use the immutable per-deploy URL (`https://<project>-<short-id>-<team>.vercel.app`), never the branch alias | Branch aliases can stall on a stale deploy when the Vercel-Neon integration check fails; we measured this twice today on PR #149 + the §F.8 audit |
| **V2** | **Branch alias stale detection** — before trusting any Playwright result against a branch alias, compare its `dpl=` chunk reference against the latest deployment's ID; mismatch = STALE, fall back to the immutable URL | Today the branch alias was pinned to `dpl_3VozPXSUYh…` (`dee36576`) through 4 subsequent `READY` deploys |
| **V3** | **Frontend visual proof requirements** — any PR touching `app/**/*.tsx`, `app/**/*.css`, `app/globals.css`, `lib/media/`, `app/components/IDXImage.tsx`, or `app/components/SearchListingCard.tsx` MUST include a Playwright proof against the immutable preview URL | PR #149 + PR #151 + PR #145 all benefited from this; the audit-only F1 hypothesis would have shipped a bad fix without it |
| **V4** | **Mobile layout DOM proof requirements** — any PR touching the search page, grid containers, or card components MUST include a 390 px viewport `.glass-card` width measurement AND a parent-chain dump (grid container → grid item → card) when the surface change involves CSS Grid / flex / inline / block | PR #151 first cut would not have surfaced as broken without DOM probe; Playwright cardW alone was insufficient |
| **V8** | **Integration-noise classification rule** — when the Vercel deployment is READY but the GitHub-side Vercel context is PENDING/FAILING, classify the cause before treating as PR-blocking | PR #149, PR #150, PR #151, PR #152, PR #153 all merged cleanly with the Vercel context PENDING; the failure was the documented stale Neon-branching integration check |

---

## V1 — Immutable Vercel URL rule

### What today proved

The Vercel-Neon integration's "Neon branching: Branch limit exceeded" check fires on every preview deploy of every PR even though the bound Neon project has 8 / 5000 branches (per `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`). A side-effect: the **preview branch alias auto-rotation appears to be gated on integration check success.** When the first preview's failing check is Skipped, the alias rotates to it; subsequent pushes each spawn a new failing check, and the alias rotation never advances.

On PR #149 we measured this directly:

| Preview deploy SHA | Immutable URL | Branch alias served |
|---|---|---|
| `dee36576` | `mallan-4y9m89v6m-mallan.vercel.app` | `dpl_3VozPXSUYh…` (pinned here from then on) |
| `3797ce8c` | `mallan-kezaurh88-mallan.vercel.app` | `dpl_3VozPXSUYh…` (still stale) |
| `aeea758c` | `mallan-ri2cojptq-mallan.vercel.app` | `dpl_3VozPXSUYh…` (still stale) |
| `915a734a` | `mallan-d7b1x7t1e-mallan.vercel.app` | `dpl_3VozPXSUYh…` (still stale) |
| `f3686521` | `mallan-db3hg2e11-mallan.vercel.app` | `dpl_3VozPXSUYh…` (still stale) |

Playwright against the branch alias kept reading the **first** preview's output for hours. The immutable per-deploy URL always served the correct deploy.

### Rule

**Every Playwright run, every curl probe, every DOM dump during preview verification MUST use the immutable Vercel deploy URL — never the branch alias.**

#### How to find the immutable URL

```bash
# Vercel MCP (preferred for AI sessions):
mcp__claude_ai_Vercel__list_deployments({ projectId, teamId })
# Pick the most recent deployment for your branch — its `url` field is the immutable URL
```

#### How to set it for Playwright

```bash
$env:PLAYWRIGHT_BASE_URL = "https://mallan-<short-id>-mallan.vercel.app"
npx playwright test tests/e2e/<spec>.spec.ts --project=chromium --reporter=list
```

Do NOT use:
```bash
$env:PLAYWRIGHT_BASE_URL = "https://mallan-nyc-git-<branch-name>-mallan.vercel.app"  # branch alias — can be stale
```

### Production aliases are fine

`mallan.nyc` + `www.mallan.nyc` are production aliases. They rotate correctly because production deploys don't go through the per-PR Vercel integration check gating. Production verification can use the production alias.

---

## V2 — Branch alias stale detection

### What today proved

We discovered the stale-alias issue only after multiple wrong Playwright runs. The detection is one curl probe.

### Detection probe (read-only, mandatory before trusting any branch-alias result)

```bash
#!/usr/bin/env bash
set -euo pipefail

alias_url="https://mallan-nyc-git-<branch-name>-mallan.vercel.app"
latest_immutable="https://mallan-<short-id>-mallan.vercel.app"

# Both probes are READ-ONLY (HTTP GET on a public page).
#
# IMPORTANT — pipeline-guard pattern with `set -euo pipefail`:
#
# Without the trailing `|| true`, `set -euo pipefail` + `curl -fsS`
# would cause this script to exit the moment curl returns non-2xx
# (HTTP error, vendor outage, wrong URL). With `pipefail`, the
# pipeline's exit code becomes curl's non-zero status; with `set -e`,
# the script aborts immediately — BEFORE the explicit empty-value
# guards below have a chance to run. Same silent-failure mode as
# the pre-PR-#156 script, just with a different proximate cause.
#
# `grep -oE` has the same problem on a different axis: it exits 1
# when no match is found. Even if curl succeeds with HTTP 200 but
# the response doesn't contain `dpl=`, grep's exit-1 propagates via
# pipefail and `set -e` kills the script.
#
# The `|| true` at the end of each assignment pipeline forces the
# pipeline to exit 0 regardless of curl/grep status. The variable
# lands as the empty string on failure, and the explicit empty-value
# guards below produce the diagnostic error message.

alias_dpl=$(curl -fsS "${alias_url}/search?tab=rent-residential&sort=price-desc" 2>/dev/null \
  | grep -oE 'dpl=dpl_[A-Za-z0-9]+' \
  | head -1 \
  || true)

latest_dpl=$(curl -fsS "${latest_immutable}/search?tab=rent-residential&sort=price-desc" 2>/dev/null \
  | grep -oE 'dpl=dpl_[A-Za-z0-9]+' \
  | head -1 \
  || true)

# Fail loudly if either probe returned no `dpl=` reference. An empty
# value means one of:
#   - curl returned non-2xx (auth wall, 404, vendor outage)
#   - the URL was wrong (typo in <branch-name> or <short-id>)
#   - the search HTML changed shape and no longer contains `dpl=`
#   - the chunk-loading mechanism changed and the marker is no longer
#     present in the SSR HTML
#
# Comparing two empty strings would silently pass the stale-alias
# check (because "" == "") even though both probes failed — that
# would defeat the purpose of running the detection probe at all.
# Fail loudly before reaching the comparison.

if [ -z "$alias_dpl" ]; then
  echo "ERROR: alias probe returned no dpl= reference from $alias_url" >&2
  echo "  Possible causes: curl failed, alias URL wrong, search HTML changed shape." >&2
  echo "  Verify the alias is the correct preview URL for the current branch and that" >&2
  echo "  /search renders successfully when opened in a browser." >&2
  exit 2
fi

if [ -z "$latest_dpl" ]; then
  echo "ERROR: immutable probe returned no dpl= reference from $latest_immutable" >&2
  echo "  Possible causes: curl failed, immutable URL wrong, search HTML changed shape." >&2
  echo "  Verify the immutable URL is the most recent READY deployment's URL." >&2
  exit 2
fi

# Both probes returned a non-empty `dpl=` value — comparison is meaningful.
if [ "$alias_dpl" != "$latest_dpl" ]; then
  echo "STALE: alias serves $alias_dpl but latest is $latest_dpl. Use immutable URL." >&2
  exit 1
fi

echo "OK: alias matches latest ($latest_dpl)."
```

### Why BOTH the `|| true` AND the empty-value guards matter

Two distinct silent-failure modes need to be guarded simultaneously:

1. **Pipeline-abort failure mode.** `set -euo pipefail` + `curl -fsS` (or `grep -oE` finding no match) would terminate the script before the empty-value guards run. The `|| true` at the end of each assignment pipeline forces the pipeline's exit code to 0, the script continues, and the variable receives the empty string. **Without `|| true`, the explicit empty-value guards below are unreachable.**

2. **Empty-comparison failure mode.** If `|| true` is added but the empty-value guards are NOT, the comparison `[ "$alias_dpl" != "$latest_dpl" ]` would silently return false when both are empty (i.e. both probes failed). The script would exit 0 reporting "OK: alias matches latest ()" — a false-positive that masks the actual outage. **Without the explicit empty checks, `|| true` makes failures invisible.**

Both guards are load-bearing. Removing either re-introduces a silent-failure path:
- Pre-PR-#156 script: no guards at all → empty comparison passed silently
- PR #156 script: empty-value guards added, but `set -euo pipefail` + `curl -fsS` killed the script before the guards could run
- This (post-PR-#157) script: pipeline guarded with `|| true` AND empty-value checks gate the comparison

The combination is the safe pattern.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Alias matches latest — alias is fresh, safe to use either URL |
| `1` | Stale — alias serves a different deploy than the latest; use the immutable URL |
| `2` | Probe failure — one or both URLs returned no `dpl=` reference; cannot determine staleness; investigate before proceeding |

### Rule

**If the branch alias's `dpl=` chunk reference does NOT match the latest deployment ID, treat the alias as stale and use the immutable URL.**

If the test suite must run against the branch alias for a specific reason (e.g. cookie-domain coverage), the PR body MUST document that the stale-alias detection probe was run + matched.

---

## V3 — Frontend visual proof requirements

### What today proved

PR #145, PR #149, PR #151 all touched frontend layout/visual surfaces. In every case, Playwright e2e proof against the immutable preview URL caught either:
- A wrong-conclusion fix (PR #149 first cut → still `matrix(1.05)` on PH)
- An insufficient fix (PR #151 first cut → cardW still 583)
- A missed assertion (PR #145 PR-FE.1 mobile cards)

Without Playwright proof, those would have shipped to production.

### Trigger surfaces (PR touching ANY of these requires Playwright proof)

```
app/**/*.tsx
app/**/*.css
app/globals.css
app/components/IDXImage.tsx
app/components/SearchListingCard.tsx
app/components/FeaturedListings.tsx
app/search/page.tsx
app/listing/[...slug]/page.tsx
lib/media/white-border-detector.ts
public/crm/css/**
public/crm/js/dashboard/**  (if touching dashboard UI)
```

### Required Playwright spec

`tests/e2e/search-card-after-proof.spec.ts` (or successor) — runs 4 tests:
1. Desktop 1440 — detector applies to 401 WEST cards, leaves 15 W 68TH unchanged
2. Adaptive crop reduces visible white band ≤ 5 px (401 WEST #6 + PH); 15 W 68TH stays clean
3. Mobile 390 — cards render and fill viewport (cardW ≤ 400)
4. FeaturedListings on `/` — renders images and is NOT opted in to detector

### Rule

Every PR touching the trigger surfaces above MUST include a Playwright proof block in the PR body showing all 4 tests passing against the immutable preview URL. Failure to include the proof block = the PR is treated as untested.

#### Proof block template

```
## Playwright proof (immutable URL: <url>)

| Test | Result |
|------|--------|
| 1. desktop 1440 transforms | <PASS / FAIL — details> |
| 2. adaptive crop ≤ 5 px residual | <PASS / FAIL — details> |
| 3. mobile 390 cardW ≤ 400 | <PASS / FAIL — measured cardW> |
| 4. FeaturedListings not opted in | <PASS / FAIL> |
```

---

## V4 — Mobile layout DOM proof requirements

### What today proved

The mobile-search-overflow audit's F1 hypothesis blamed the inline `<a>`. PR #151's first cut applied F1 + the preview still measured `cardW = 583`. **Only the parent-chain DOM dump revealed the real cause** (grid container 358 px but grid items 583 px → CSS Grid auto-column).

### Trigger surfaces (PR touching ANY of these requires DOM proof in addition to Playwright)

```
app/search/page.tsx                     (grid containers)
app/components/SearchListingCard.tsx    (card variants — Grid, List, Split)
app/components/IDXImage.tsx             (image wrapper width)
app/globals.css                         (.glass-card class)
any CSS Grid / flex template change
any breakpoint class change (md:grid-cols-N, lg:grid-cols-N, etc.)
```

### Required DOM dump

At the mobile viewport (390 × 844), dump for the first 6 `.glass-card` elements:
- Tag name + className + computed `display`
- `getBoundingClientRect().width`
- Same for the immediate parent
- Same for the grandparent (typically the grid container)

```javascript
// Run inside a Playwright page.evaluate() against the immutable preview URL
Array.from(document.querySelectorAll('.glass-card')).slice(0, 6).map((card, i) => ({
  i,
  tag: card.tagName,
  classes: card.className,
  display: getComputedStyle(card).display,
  width: card.getBoundingClientRect().width,
  parent: card.parentElement && {
    tag: card.parentElement.tagName,
    classes: card.parentElement.className,
    display: getComputedStyle(card.parentElement).display,
    width: card.parentElement.getBoundingClientRect().width,
  },
  grandparent: card.parentElement?.parentElement && {
    tag: card.parentElement.parentElement.tagName,
    classes: card.parentElement.parentElement.className,
    display: getComputedStyle(card.parentElement.parentElement).display,
    width: card.parentElement.parentElement.getBoundingClientRect().width,
  },
}));
```

### Rule

PRs touching the V4 trigger surfaces MUST include this DOM dump (sanitized of PII) in the PR body if Playwright assertion alone is insufficient to diagnose the root cause.

### Diagnostic ladder (apply in order, stop when root cause is proven)

1. Run Playwright e2e — does the assertion pass?
2. If FAIL → dump the failing element's `getBoundingClientRect().width`
3. If width is unexpected → dump the parent chain (V4 template above)
4. If parent chain shows container OK but item wrong → suspect CSS Grid template / flex constraint / inline-content overflow
5. If parent chain shows container wrong → suspect viewport / parent-of-parent / max-width

This ladder is what surfaced the PR #151 actual root cause after the audit's F1 hypothesis failed.

---

## V8 — Integration-noise classification rule

### What today proved

Every PR today (#149, #150, #151, #152, #153) shipped with the Vercel context PENDING/FAILING on GitHub. None were build failures. All were the known "Neon branching: Branch limit exceeded" integration check noise (`docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`).

The Vercel **deployment** state was READY in every case. The GitHub Vercel status context was PENDING because the integration check never resolved.

### Classification check (mandatory before treating Vercel context as merge-blocking)

```bash
# 1. Pull the deployment ID from the GitHub Vercel context targetUrl
gh pr view <pr-num> --json statusCheckRollup --jq '.statusCheckRollup[] | select(.name == "Vercel" or .name == "context") | .targetUrl'
# → https://vercel.com/mallan/mallan-nyc/<short-id>

# 2. Resolve the deployment ID
# Find the corresponding dpl_<id> via list_deployments

# 3. Check the actual deployment state
# Via Vercel MCP: get_deployment(dpl_<id>) → state: READY / BUILDING / ERROR

# 4. Classify
# READY + GitHub context PENDING/FAILING = known Neon-integration noise (NOT a blocker)
# BUILDING = wait
# ERROR = real build failure (blocker)
```

### Rule

Before treating a PENDING/FAILING GitHub Vercel context as PR-blocking:

1. **Confirm the underlying Vercel deployment state.** If READY, the failure is integration-side, not build-side.
2. **Classify the integration check.** The current known noise is `Neon branching: Branch limit exceeded` — documented in `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md` as a stale Vercel-side check.
3. **Document the classification in the PR body** (one line, e.g. "Vercel context PENDING — classified as known Neon-branching integration noise per F.8; deploy READY at <immutable URL>").
4. **Proceed with normal merge IF** the 3 CI checks (`pr-check`, `guardrails`, `claude-review`) are SUCCESS.

### Hard restriction

The classification ONLY applies to the documented known-noise integration check ("Neon branching: Branch limit exceeded" with no `conclusionText` exposed). Any NEW integration check failure must be triaged separately — do NOT assume noise.

---

## Hard holds (apply across all 5 rules above)

Per the standing rules from 2026-05-17:

- ❌ No env vars (Vercel or GH Actions) touched as part of any V1–V8 enforcement
- ❌ No `NEON_PROJECT_ID` change
- ❌ No Neon branches deleted, no integration changes
- ❌ No migrations / reconciliation / cron triggers
- ❌ No PR #148 / PR 5B / CRM / Sentinel work
- ❌ No `memory/SESSION-*` archival docs touched
- ❌ No `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md`
- ❌ No production-data mutation
- ❌ No admin bypass on merges

The rules above describe verification discipline. They do NOT authorize any operational change to the surfaces in the hold list.

---

## What this doc does NOT do

- ❌ No workflow files created or modified — rules are procedural, not enforced
- ❌ No CI gate wired up — proposed in §V3 / §V4 trigger-surface lists, but not deployed
- ❌ No Playwright spec changes — existing `tests/e2e/search-card-after-proof.spec.ts` is the current proof; this doc references it
- ❌ No CLAUDE.md change — sister doc `pr-verification-checklist.md` covers the CLAUDE.md dependency survey separately

---

## Enforcement roadmap (NOT EXECUTED — future proposal)

If Maya later approves enforcement tooling, the surfaces would be:

| Rule | Enforcement option | Status |
|------|-------------------|--------|
| V1 (immutable URL) | Linter in `tests/e2e/*` files: fail if `PLAYWRIGHT_BASE_URL` contains `-git-` (branch alias pattern) | Not deployed |
| V2 (stale detection) | CI step in `pr-check.yml`: run the dpl-mismatch curl probe; fail if mismatch | Not deployed |
| V3 (frontend visual proof) | `guardrails.yml` extension: on PRs touching trigger surfaces, check PR body for the proof-block template | Not deployed |
| V4 (mobile DOM proof) | Same as V3 — guardrails check for the DOM-dump section | Not deployed |
| V8 (integration noise) | `pr-check.yml` enhancement: on PR open, classify Vercel context state + post the classification as a comment | Not deployed |

Each is a separate small PR with its own validation cycle.

---

## Cross-references

- `docs/engineering/pr-verification-checklist.md` — sister doc; covers items 5, 6, 7, 9, 10 of Maya's original spec
- `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md` — the source of the integration-noise classification baseline
- `tests/e2e/search-card-after-proof.spec.ts` — the existing 4-test Playwright proof
- `docs/mobile-search-card-overflow-audit-2026-05-17.md` POST-PR-#151 section — concrete proof that V4's DOM-dump rule was needed

---

**End of report. No workflows changed. No production code touched. Rules are procedural until enforcement is approved separately.**
