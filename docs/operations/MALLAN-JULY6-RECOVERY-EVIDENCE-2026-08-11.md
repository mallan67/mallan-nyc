# MALLAN JULY 6+ RECOVERY EVIDENCE — 2026-08-11

> **EVIDENCE / RECOVERY RECORD ONLY.** This file does not define product architecture. Product/system authority remains `MALLAN-PLATFORM-MASTER-PLAN.md`. This file records Claude's local forensic findings supplied by Maya on 2026-08-11, separates them from independently GitHub-verifiable evidence, and defines the recovery proof required before implementation proceeds.

## 1. Source

Maya supplied Claude's forensic report covering local/Desktop work, deleted branches, worktrees, bundles, loose files and open/draft PRs since approximately July 6, 2026.

The report explicitly corrected several of Claude's own earlier claims and therefore must be treated as a forensic evidence source, not unquestioned truth.

## 2. Evidence classification rule

Every finding below is classified as one of:

- `CLAUDE-LOCAL — UNVERIFIED BY CHATGPT` — derived from local Windows/Desktop/worktree/bundle inspection not independently accessible through the GitHub connector.
- `GITHUB VERIFIED` — independently checked by ChatGPT against current GitHub metadata.
- `PARTIALLY VERIFIED` — GitHub confirms part of the claim but local-only details remain unverified.
- `HISTORICAL CLAIM` — true only for the timestamp/context Claude reported until refreshed.

No local-only claim may be represented as durably recovered until the authorized checkout proves it and creates durable refs/commits/PR evidence as applicable.

---

# 3. Critical recovery claim — 54 commits in one bundle

**Claude claim:** cleanup work from 2026-07-24 deleted 11 branches whose ledger reportedly said `in_origin_main=no`, `squash_equiv=no`, `decision=REVIEW REQUIRED`. Claude reported **54 commits** across those branches surviving only in:

`mallan nyc web/mallan-nyc-cleanup-archive/bundle/mallan-nyc-ALL-REFS-2026-07-24.bundle`

Reported branches / unique commits:

- `feat/seller-001-phase1-internal-report-2026-07-03` — 17
- `fix/building-units-mlsstatus-2026-07-08` — 7
- `fix/cotality-remediation-w1-2026-07-05` — 7
- `feat/backend-search-1-canonical-contract-2026-07-09` — 4
- `fix/listing-media-pipeline` — 4
- `fix/search-media-display-r2-neon-safety-2026-07-10` — 4
- `fix/trestle-fields-metadata-parser` — 3
- `chore/cron-reduce-neon-compute` — 2
- `feat/r2-orphan-batch-ca` — 2
- `feat/r2-orphan-cleanup-2026-07-08` — 2
- `fix/feed-reconcile-stat` — 2

Claude also reported three other deleted branches as `squash_equiv=yes` and therefore already landed:

- `fix/db-coldstart-retry`
- `fix/fh-remove-diplomats-s...` [source text truncated]
- `start-findunique` [source text truncated]

**Status:** `CLAUDE-LOCAL — UNVERIFIED BY CHATGPT`.

**Risk if true:** critical single-copy loss risk. If the bundle is deleted before refs are restored, still-unreviewed work may become unrecoverable.

**Required recovery proof in authorized checkout:**

1. verify exact bundle path and `git bundle verify` result;
2. list all refs/commits in the bundle;
3. compare each claimed branch against current object database/current refs/main;
4. confirm exact unique commit count per branch;
5. restore under non-destructive recovery refs only;
6. verify restored refs against the cleanup ledger;
7. do **not** merge/cherry-pick recovered branches merely because they were recovered;
8. record each branch's disposition before implementation uses any of its work.

Recovery is preservation, not approval.

---

# 4. Draft / unmerged / stranded work

Claude reported approximately **200 commits** across unlanded branches/PRs and described the major bottleneck as work that exists but is not merged/proven.

## GitHub checks performed by ChatGPT on 2026-08-11

### PR #585

**GITHUB VERIFIED:** open, unmerged, mergeable, **draft**, 35 commits, 5 changed files. It is documentation/governance scope and its own body says `Draft. Not approved for merge.`

### PR #589

**GITHUB VERIFIED:** open, unmerged, **draft**, 4 commits, 35 changed files. Current GitHub metadata reports `mergeable=false`. The PR body explicitly states the code is not Production-proven and records:

`implemented != merged != deployed != production_proven`

Current combined status checked by ChatGPT at head `de35ad1e...` showed Vercel success and `release-truth` pending at the time of verification. Therefore Claude's source-text statement that it had simply been sitting “green-checked” must not be reused as current truth without refreshing checks.

### PR #592

**GITHUB VERIFIED:** open, unmerged, mergeable, **draft**, 10 commits, 7 changed files. The PR body describes live-preview/e2e proof but remains a draft and unmerged.

### PR #596

**GITHUB VERIFIED:** open, unmerged, `mergeable=false`, **draft**, 1 commit, 4 changed files. The PR itself says browser proof remained not proven and it was draft pending that proof/Maya approval.

### PR #599

**GITHUB VERIFIED:** open, unmerged, mergeable, **not draft**. The PR body explicitly says `HELD FOR MAYA — do not merge` and that checks becoming green do not grant merge authorization.

## Other Claude branch counts

Claude additionally reported six never-submitted branches and other draft/open branches, with totals such as 136 distinct files and 59 files touched by multiple unlanded branches.

**Status:** `CLAUDE-LOCAL — UNVERIFIED BY CHATGPT` until the authorized checkout/current refs prove the exact branch list and file-contention graph.

---

# 5. Claimed worktree / loose-file recovery corpus

Claude reported approximately **245 unique files** across locations including:

- `_OLD_TO_DELETE`
- `mallan-nyc-cleanup-archive`
- `_SENSITIVE_REVIEW`
- `branch-retirement`
- `mallan-evidence-2026-08-06`
- `RESO`
- `mallan-wip-archive`
- `mallan-nyc-untracked-stash`
- `mallan-nyc-pr10`
- Desktop root

Claude reported examples including:

- an ALL-REFS bundle;
- `crm-form-system/` untracked source files;
- 47 stash files;
- `scripts/neon-shed-raw-data.ts` as one unique file in `pr10`;
- evidence/ledger/handoff documents;
- test/build artifacts;
- sensitive/unreviewed files.

**Status:** `CLAUDE-LOCAL — UNVERIFIED BY CHATGPT`.

**Rule:** no blanket copy/merge/delete. Each item must be dispositioned as one of:

- `CURRENT_MAIN_VALID`
- `CURRENT_MAIN_REAUDIT`
- `REIMPLEMENT_FROM_CURRENT_MAIN`
- `PARTIAL_EXTRACT`
- `SUPERSEDED`
- `REVERTED`
- `REJECTED`
- `LOCAL_ONLY_RECOVERY`
- `HISTORICAL_EVIDENCE`
- `SENSITIVE_NOT_GIT`
- `SAFE_TO_ARCHIVE`
- `SAFE_TO_DELETE`

---

# 6. Claimed local disk / worktree bloat

Claude reported roughly **20 GB** of old worktrees/archives, including ten worktrees around 1.3 GB each, cleanup/archive folders, and `.git` reclaimable loose objects.

Claude also reported that most worktrees were content-redundant after filtered-hash/object-database comparison, with `pr10` carrying one unique file.

**Status:** `CLAUDE-LOCAL — UNVERIFIED BY CHATGPT`.

**Rule:** no deletion based on size or branch name. Delete only after the same content/object/recovery proof is reproduced in the authorized checkout and unique content is dispositioned.

---

# 7. Security findings

Claude reported:

- a plaintext Desktop file named `mallan-admin-temp-password.txt`;
- `_SENSITIVE_REVIEW/` containing 18 unique unreviewed sensitive files;
- XSS test HTML artifacts in `mallan-nyc-untracked-stash/`.

**Status:** `CLAUDE-LOCAL — UNVERIFIED BY CHATGPT`.

**If locally confirmed:**

- do not commit the credential;
- treat any exposed credential as requiring rotation/revocation according to the actual service/usage;
- disposition `_SENSITIVE_REVIEW` outside normal Git ingestion;
- preserve evidence necessary to understand what happened without adding secrets to Git.

---

# 8. Claude's self-reported errors — preserve as process evidence

Claude explicitly reported several errors during the forensic session:

1. creating worktrees outside the authorized repo across sessions;
2. committing/staging in the wrong repository after a failed `cd`, then recovering with `git reset --mixed` before push;
3. incorrectly claiming three mallan-fix files existed nowhere in Git because the comparison was against main only;
4. incorrectly claiming 100% raw-hash equivalence before accounting for Git filtering/CRLF normalization;
5. using relative paths after context changed.

These admissions are important because they justify the current hard startup guard, filtered-content/object-database verification, no `git add -A`, and independent ChatGPT verification.

---

# 9. Claude's proposed recovery actions — status

## S1 — Rescue 54 commits from bundle

**Priority if claim locally verifies:** immediate preservation before implementation.

Safe goal: create recovery refs only. No merge/cherry-pick/branch move is implied.

## S2 — Unblock drafts

**Correction by ChatGPT:** do not simply mark drafts ready because Claude called them green. Refresh each current PR, conflicts/checks/review state/dependencies and intended scope first. PR #589 currently reports `mergeable=false` and `release-truth` pending in the current verification, so the historical “green-check” shorthand is stale.

## S3 — Triage never-submitted branches

Verify each branch still exists and classify before PR/delete.

## S4 — Land in dependency order

Agree in principle, but actual ordering must come from the current master architecture + dependency/overlap audit, not merely branch age or local file counts.

## S5 — Recover unique files by class

Agree as evidence handling only. No automatic addition to product architecture.

## S6 — Delete old worktrees/archives after proof

Held until local recovery/disposition is complete.

## S7 — Secrets

If confirmed locally, credential rotation and sensitive-file disposition must happen without committing secrets.

## S8 — Prevent recurrence

Retain these controls:

- one authorized physical checkout;
- no parallel external worktrees;
- explicit-path staging only;
- no `git add -A` / `git add .` for Mallan work;
- branch/commit/draft PR is not completion;
- merge + deployed SHA + runtime proof required where applicable.

---

# 10. Correct execution order after this forensic report

The previously recorded product order remains valid, but one preservation layer must occur first if the local evidence verifies:

```text
RECOVERY-001 — preserve July 6+ unique local/bundle work
↓
DOC-RECONCILE-001 — prove the single master plan retained all valid requirements
↓
SEARCH-P0
↓
CMA
↓
BACKEND LISTINGS
↓
remaining continuous program
```

Recovery does not authorize merging historical branches.

The master-plan reconciliation must evaluate recovered work as evidence and absorb only still-valid requirements into the one master authority.

---

# 11. Definition of recovered

A local branch/file is not `RECOVERED` merely because Claude can still see it on disk.

For branch/commit work, recovery requires durable proof such as a verified Git ref/object reachable in the authorized repo and a recorded disposition.

For unique non-Git files, recovery requires a content hash/inventory, classification and explicit destination/disposition.

For sensitive files, recovery may mean secure inventory/disposition without Git ingestion.

---

# 12. Next exact action for Claude in authorized checkout

1. run the startup guard and prove the authorized root;
2. locate and verify the claimed ALL-REFS bundle;
3. reproduce the claimed branch/unique-commit counts without changing main;
4. create non-destructive recovery refs for genuinely unique commits;
5. verify every restored count against the cleanup ledger;
6. inventory the claimed unique loose files/sensitive set without modifying them;
7. update `MALLAN-CONTINUOUS-EXECUTION-STATE.md` with exact proof;
8. continue to `DOC-RECONCILE-001`;
9. then continue directly to Search P0.

Do not start a new overall audit or a new master plan.