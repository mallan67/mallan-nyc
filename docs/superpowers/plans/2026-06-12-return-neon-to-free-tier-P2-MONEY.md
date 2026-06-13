# P2-MONEY — Return Neon to Free Tier ($0 target)

> **Status: TRACKED PLAN — no execution authorized.** Maya's standing target is **Neon Free /
> $0**. The $19/mo Launch subscription is **NOT accepted as a floor** — the 2026-06-12 zero-billing
> audit proved it is a plan toggle, not a usage requirement, and therefore a defect to retire.
>
> **Evidence basis:** `docs/audits/zero-billing-neon-vercel-2026-06-12.md` (Opus, 2026-06-12,
> read-only). Key proofs: Launch (`launch_v3`) was switched on **2026-05-17** to mute a **FALSE**
> Vercel "branch limit exceeded" check; compute ~150 CU-h/mo (inside Free), branches 1/5000
> (inside Free); the ONLY real Free blocker is **storage 1,139 MB > 500 MB cap**, of which ~663 MB
> is legacy JSON on terminal/dead listings. morning-bread = 90 MB / $0-marginal. round-recipe =
> separate Neon account, not mallan's.
>
> **Hard rule (Maya directive 2026-06-12):** NO downgrade, deletes, migrations, or project
> deletion without explicit Maya approval. Every step below is gated.

---

## Why this is P2-MONEY, not "optimization"

The recurring infrastructure cost that is *eliminable* is exactly one line: the Neon Launch
subscription. R2 (~$1.70/mo for 123 GB of production photos) and the Vercel Pro seat are real and
largely irreducible; this plan does not touch them. The $19 is the only charge the audit traced to
a **plan selection rather than a need** — so returning to Free is a correctness fix on the bill.

---

## Required sequence (each step gated; do not reorder)

### Step 1 — C6 proof/settlement stays the CURRENT BLOCKER
Nothing in this plan's *execution* half (steps 4–7) begins until Correction 6 settles on the ghost
proof (per `docs/audits/corrections/P1C6-feed-reconcile-eligible-orphans.md` §9/§9b and the
2026-06-10 Phase-1 final-gate). Storage reduction is data cleanup; the writer loops must be closed
and runtime-verified first, or the cleanup is wrong again the next time a loop fires. Steps 2 and 3
are *preparation* and may proceed in parallel (they touch no listing data).

### Step 2 — Fix the stale `NEON_PROJECT_ID` foot-gun (rotate-db-keys can never target morning-bread)
**Defect:** GitHub Actions repo variable `NEON_PROJECT_ID = morning-bread-68708332` (stale). Only
consumed by `rotate-db-keys`, whose schedule is disabled — but a **manual dispatch** would still
re-break production (the 2026-06-02 cross-project incident class).
**Fix (HELD — `.github/workflows/**` + repo-variable surface = Maya approval):**
- Repoint or remove the `NEON_PROJECT_ID` repo variable so it can never resolve to morning-bread.
- Add a **fail-closed host/project guard** inside `rotate-db-keys` (refuse to run unless the target
  resolves to `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`) — the same guard NEON.md
  already requires before the schedule is ever re-enabled.
- Proof: a workflow-level assertion test or a dry-run dispatch that aborts on a wrong target.
**Do NOT run rotate-db-keys** under any circumstance (CLAUDE.md standing rule). This step makes
the foot-gun inert; it does not re-enable the schedule.

### Step 3 — Confirm the Vercel false branch-limit issue is cleared or escalated
The Launch upgrade exists ONLY to mute the false "branch limit exceeded" check (hidden-mountain is
1/5000). **Downgrading before this is resolved risks re-tripping the check.**
- Verify current status against `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`.
- If still false-positive: escalate to **Vercel support** (real fix is Vercel-side, per CLAUDE.md
  AGENT-STOP — do NOT prune morning-bread to "fix" it). Capture the ticket id + resolution.
- Gate: Step 7 (downgrade request) cannot proceed until this is CLEARED, not merely understood.

### Step 4 — (AFTER C6 settles) execute storage reduction to get prod < 500 MB
Each sub-item is separately Maya-gated and follows the post-C6 cleanup order already recorded in
`docs/superpowers/plans/2026-06-10-phase1-media-loop-closures-plan.md` (Amendment 2026-06-12).
Target: 1,139 MB → < 500 MB (need to shed ~640 MB+; the measured reclaimable is ~0.6 GB, so this
is **tight** — see Step 6 risk).
- **4a. Terminal/dead-listing archive.** ~91,536 terminal rows are archive-eligible; the existing
  T+180 retention path has moved only 34. Root-cause the throughput gap, then archive the cohort
  (the audit attributes ~390 MB of legacy JSON to these rows). **This is the single biggest lever.**
- **4b. Legacy `listings.media` (and sibling JSON) drop/slimming.** Once `listing_media` is the
  authoritative media layer (post-C6) and reads no longer depend on the JSON (Step 5), drop or slim
  `raw_data` / `compliance` / `features` / `agent_info` / `address` / `media` JSON columns. Measured
  663 MB total; the public site needs almost none of it once the table layer is canonical.
- **4c. Audit/log compaction — only if material.** The June-01/02 `idx_sync_listing_upsert_failure`
  burst = 46,010 rows / 35 MB, compactable in one stroke; cap the failure-diagnostic writer so it
  can't recur. Skip anything immaterial.
- **Reclaim mechanism note:** returning disk to Neon requires a table rewrite. **VACUUM FULL blocks
  all traffic on Neon** — use an online path (column drop + pg_repack-style, or a maintenance
  window) and NEVER VACUUM FULL on the live endpoint. Design the rewrite when Step 4 is approved.

### Step 5 — Prove the app works without legacy-JSON dependency
Before any JSON drop is irreversible: a RED→GREEN proof that every public + CRM read path resolves
from `listing_media` / structured columns, not the JSON blobs.
- Grep + behavioral test: no render/search/DTO path reads `listings.media`/`raw_data` for display.
- Live preview probe: listing detail, search cards, agent cards, sitemap, disclosures all render
  with the JSON columns slimmed (staging/preview branch, never prod-first).
- Gate: tristle + search-auditor (this touches §D display surfaces); §G chain.

### Step 6 — Prove production DB size is below the Neon Free limit
Re-run the storage probe (`scripts/__neon-cost-2026-06-12.mjs` pattern): `pg_database_size` **< 500
MB** with margin, AND project the 45 MB/mo organic growth so it stays under (else Free is a revolving
door — the archive cadence must keep pace, or this fails). If the measured reclaim can't clear 500 MB
with headroom, **report that honestly** and present Maya the real choice (deeper archival vs. stay on
$19) rather than downgrading into immediate cap-breach.

### Step 7 — Request Maya approval to downgrade Launch → Free
ONLY after Steps 2, 3, 5, 6 all pass. Present: cleared Vercel check (3), size-under-cap proof (6),
no-JSON-dependency proof (5), foot-gun closed (2). Maya decides. No downgrade before this.

### Step 8 — Document the tradeoff (autosuspend / cold starts)
Free tier autosuspends idle compute after ~5 min → **cold starts for visitors** (first hit after
idle is slow) and **possible cron timing hiccups** on cold wake. The current external 1-min `GET /`
monitor + db-keepalive */15 keep the endpoint warm — on Free, either accept autosuspend (true $0,
cold starts) or keep a warmer (partial compute, but Free's ~191 CU-h/mo headroom covers ~150 CU-h
today). State the chosen posture in the downgrade request. **$0 is incompatible with guaranteed
24/7 instant-warm** — that is the real, documented cost of Free.

---

## Resource decisions held for Maya (do NOT execute)
- **morning-bread (90 MB, stale):** `pg_dump` archival export → then delete. Removes the stale
  project + the foot-gun's target entirely. Approval required.
- **Downgrade Launch → Free:** Step 7. Approval required.
- No migrations, no project deletion, no env/branch changes without explicit approval.

## Open dependency map
- Steps 4–7 BLOCKED until **C6 settles** (ghost proof).
- Step 4b BLOCKED until **PR 5B** (public reader swap off `listings.idx_display_yn`) lands — it is
  part of the legacy-column retirement (HELD, master refactor plan).
- Step 7 BLOCKED until **Step 3** (Vercel check cleared).

*Plan authored read-only by Claude (Fable 5), 2026-06-12, at Maya's direction. Tracks the
zero-billing audit's $0 path. No execution authorized; every step Maya-gated.*
