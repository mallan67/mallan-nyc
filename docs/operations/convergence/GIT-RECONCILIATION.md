# Git reconciliation — 2026-09-09 convergence

Required artifact A. No destructive cleanup was used: no `reset --hard`, no `clean`, no discarded
untracked file. Every byte that was dirty is recoverable from a commit named below.

---

## 1. Worktrees before

| Worktree | Branch | HEAD | Dirty paths | Untracked | Upstream |
|---|---|---|---:|---:|---|
| `Desktop/mallan-nyc` | `search/browser-integration-2026-09-05` | `3a985755` | 163 | 91 | 34 ahead of its remote |
| `Desktop/mallan-nyc-cotality-registry` | `fix/cotality-authority-kernel-2026-09-09` | `ca34adf5` | 11 | 6 | none |

`main` and `origin/main` were identical at `2a83952a`.

## 2. Preservation refs — created BEFORE any cleanup

| Ref | Commit | What it holds |
|---|---|---|
| `preserve/session-2026-09-09-search-cma-crm` | **`dc057054`** | The entire 163-path dirty tree of `mallan-nyc`, committed as-is |
| `fix/cotality-authority-kernel-2026-09-09` | **`212bc114`** | The 11-path registry tree, committed coherently as the Cotality authority work |

`dc057054` is deliberately **not** a curated change set. It is a snapshot, so that separating the work
could never lose it. It mixes Search executor and browser surfaces, the shared status presentation
authority and renderer migration, the four forms' server-sourced status selects, report truthfulness
fixes, validator work, the off-feed presence contract, the build-drift check, and the CRM listing
convergence — because that is how the tree actually was.

Two scratch files I had created were deleted rather than preserved: `.dashcheck.mjs` and `.patch1.py`.
Both were throwaway harnesses of mine, neither was project work.

## 3. Worktrees after

| Worktree | Branch | HEAD | Dirty | Baseline |
|---|---|---|---:|---|
| `Desktop/mallan-nyc` | `converge/crm-listing-workflow-2026-09-09` | `5e8fa3a1` | 0 | branched from committed `3a985755` |
| `Desktop/mallan-nyc-cotality-registry` | `fix/cotality-authority-kernel-2026-09-09` | `212bc114` | 0 | — |

Divergence from `origin/main` (`2a83952a`): the convergence branch carries the 34 previously-unpushed
commits of `search/browser-integration-2026-09-05` plus the 2 convergence commits below. Neither branch
has been pushed.

## 4. The convergence commits

| Commit | Subject |
|---|---|
| `da8e3046` | delete the duplicate My Listings implementation; one canonical listing manager |
| `5e8fa3a1` | an unresolved status must never erase a listing from inventory |

## 5. Files intentionally included, and the separation proof

`da8e3046` touches exactly four files, restored one by one from the preservation commit rather than by
carrying the dirty tree forward:

```
public/crm/dashboard.html                 +3      loads the canonical manager (one script tag)
public/crm/js/dashboard/app.js            +1/-1   /ops/listings -> mountManageListings()
public/crm/js/dashboard/panels.js         -457    the old implementation, physically removed
public/crm/js/manage/manage-listings.js           canonical manager + its mount
```

`5e8fa3a1` touches one file, `manage-listings.js`.

**No unrelated Search or CMA work leaked in.** Verified mechanically against the staged set before
committing: zero matches for `lib/search`, `lib/cma`, `lib/comps`, `FORM-REDESIGN`, `search-engine`,
`js/render/`, or `reports.js`. Those changes remain only in `dc057054`, awaiting their own branch.

## 6. What is deliberately NOT here yet

The Search, CMA, forms, renderer, report and validator work from this session is preserved in `dc057054`
and has **not** been given its own curated branch. It is recoverable but not yet reviewed or separated.
That is the next branch to cut, and it must not be folded into the CRM listing convergence.
