# R2 Orphan Cleanup Plan — destructive-action-safe
**Date:** 2026-07-08 · **Status:** PLAN + dry-run tooling only. **No deletion approved. Nothing deleted.**
**Roadmap:** step #5 (R2 lifecycle) of the Neon + R2 Infrastructure Closure Audit. Follows PR #1 (read-only monitor).

> **Hard rule:** this plan deletes **nothing**. It ships a dry-run inventory + a fully-gated cleanup
> script whose `--execute` path is **not to be run** until (1) a real inventory exists, (2) Maya reviews
> the candidate manifest, and (3) Maya explicitly approves. Every safety filter is unit-tested.

---

## 0. Why this is needed
The closure audit confirmed R2 objects are **never garbage-collected** (`deleteFromR2` has no production
callers; no bucket lifecycle rule). R2 grows monotonically. This plan builds the *safe* path to reclaim
true orphans — objects in the bucket that no live DB row references — without ever risking a referenced asset.

## 1. Prerequisite — produce the inventory FIRST (read-only)
Run in an environment that has **R2 list permission** + **DB access** (neither is available in the current
session, so this step is pending):

```bash
# Summary (PR #1 monitor):
npm run ops:storage-health -- --r2-orphans --out=docs/operations/r2-orphan-inventory-2026-07-08.md

# Detailed candidate inventory + reviewable manifest (this plan's script, dry-run):
npm run ops:r2-orphan-cleanup -- \
  --out=docs/operations/r2-orphan-inventory-2026-07-08.md \
  --manifest-out=r2-orphan-manifest.json \
  --older-than-days 30
```

Dry-run is the default — no `--execute`, so nothing is deleted.

## 2. Inventory must be listing-media-scoped only
Only these prefixes are ever considered (deterministic `buildMediaR2Key`):
`photos/` · `floorplans/` · `videos/` · `virtualtours/`.
Everything else in the shared bucket (broker-uploaded photos, `Document.file_url`, etc.) is **out of
scope** and is counted, **never** treated as an orphan candidate.

## 3. Required inventory fields (produced by the dry-run)
- total R2 objects scanned (all prefixes)
- in-scope vs out-of-scope counts
- total DB-referenced listing-media keys
- **orphan candidate count**
- **total orphan candidate bytes**
- **top 100 orphan candidate keys** with: object `LastModified`, object `Size`, `prefix`, and an
  `in-scope` flag
- explicit confirmation that **out-of-scope objects are NOT deletion candidates**
- R2-list-complete + DB-reference-loaded status flags

## 4. Safety filters (all enforced in `lib/ops/r2-orphan-plan.ts`, all unit-tested)
An object is a deletion candidate **only if every one holds**:
1. modified **more than `--older-than-days` (default 30)** ago — *unknown `LastModified` → never a candidate*
2. key is **under a listing-media prefix**
3. key is **not** referenced by `listing_media.r2_key`
4. key is **not** derivable from `listing_media.media_url_cached` (covers CRM variants)
5. key is **not** referenced by `listings.primary_photo_r2_key`
6. the **DB reference query succeeded** (failure → abort, delete nothing)
7. the **R2 list completed** (partial/interrupted → abort, delete nothing)
8. candidate count does **not** exceed the sanity threshold (5,000) without manual re-approval, and does
   not exceed `--max-delete`

Filters 3–5 are combined into a single DB reference set:
`listing_media.r2_key ∪ listings.primary_photo_r2_key ∪ keyFromUrl(listing_media.media_url_cached)`.

## 5. Cleanup script — `scripts/r2-orphan-cleanup.ts` (dry-run by default)
| Flag | Default | Role |
|---|---|---|
| `--dry-run` | **on** (implicit when `--execute` absent) | inventory + manifest only; deletes nothing |
| `--execute` | off | required to delete; still gated by everything below |
| `--prefix-scope` | `listing-media` | only value accepted; rejects anything else |
| `--older-than-days` | `30` | age safety window |
| `--max-delete N` | — | **required for `--execute`**; hard cap |
| `--manifest <path>` | — | **required for `--execute`**; only reviewed keys are deleted |
| `--confirm "DELETE LISTING MEDIA ORPHANS"` | — | **required for `--execute`**; exact phrase |
| `--out <path>` / `--manifest-out <path>` | stdout | where to write the inventory / manifest |

`deleteFromR2` is only reachable **after** the planner returns `willDelete=true`, which requires
`--execute` **and** the exact confirm phrase **and** a manifest **and** a passing `--max-delete` **and** a
complete R2 list **and** a loaded DB reference set **and** candidates ≤ sanity threshold. Any failure →
0 deletions.

## 6. Execution runbook (NOT to be run without Maya's approval)
1. **Dry-run** → produce `r2-orphan-inventory-*.md` + `r2-orphan-manifest.json`.
2. **Human review** — Maya inspects the manifest: spot-check keys resolve to genuinely dead listings;
   confirm counts/bytes are sane; confirm no in-use asset is present in the candidate list.
3. **Approval** — Maya explicitly authorizes; pick a conservative `--max-delete` (e.g. start at a few
   hundred).
4. **Execute** (only then):
   ```bash
   npm run ops:r2-orphan-cleanup -- --execute \
     --confirm "DELETE LISTING MEDIA ORPHANS" \
     --manifest r2-orphan-manifest.json \
     --max-delete 500 --older-than-days 30
   ```
   The script re-verifies every manifest key still qualifies (still orphan, still old, still in scope,
   still unreferenced) at execute time before deleting — so a row that became referenced between
   inventory and execution is skipped.
5. **Re-inventory** afterward to confirm counts dropped and nothing referenced was removed.

## 7. Abort conditions (any → delete nothing, non-zero exit under `--execute`)
Partial R2 list · DB reference query failure · missing/incorrect confirm phrase · missing manifest ·
missing `--max-delete` · candidates over `--max-delete` · candidates over the 5,000 sanity threshold ·
`--prefix-scope` other than `listing-media` · R2 not configured.

## 8. Current status
- Dry-run tooling + tests: **built and verified** (type-check + unit tests green).
- Live inventory: **pending** — requires R2 list permission + DB access (not available this session).
- Deletion: **NOT approved, NOT run.** `--execute` must not be used until §6 steps 1–3 are complete.

## 9. Files
- `scripts/r2-orphan-cleanup.ts` — CLI (dry-run default; gated execute)
- `lib/ops/r2-orphan-plan.ts` — pure, unit-tested decision logic (all safety filters)
- `lib/images/r2.ts` — adds read-only `listR2Objects()` (ListObjectsV2 metadata; `complete` flag)
- `tests/runtime/r2-orphan-cleanup.test.ts` — 8 required safety tests + sanity/max-delete + CLI source guard
- `package.json` — `ops:r2-orphan-cleanup`
