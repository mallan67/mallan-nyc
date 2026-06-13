# P2-MONEY — Return Neon to Free Tier ($0 target)

> **Status: TRACKED PLAN — no execution authorized.** Maya's standing target is **Neon Free /
> $0**. The $19/mo Launch subscription is **NOT accepted as a floor** — the 2026-06-12 zero-billing
> audit proved it is a plan toggle, not a usage requirement, and therefore a defect to retire.
>
> **Evidence basis:** `docs/audits/zero-billing-neon-vercel-2026-06-12.md` — **UNTRACKED /
> operator-held** (lives in Maya's working tree, deliberately not committed alongside the other
> 2026-06-12 billing audits; a fresh clone will NOT have it — Codex #397 correctly flagged the dead
> reference). The load-bearing facts are therefore inlined here so this plan is self-verifying
> without the file: Launch (`launch_v3`) was switched on **2026-05-17** to mute a **FALSE** Vercel
> "branch limit exceeded" check; compute ~150 CU-h/mo (inside Free), branches 1/5000 (inside Free);
> the ONLY real Free blocker is **storage 1,139 MB > 500 MB cap**, of which ~663 MB is legacy JSON
> on terminal/dead listings. morning-bread = 90 MB / $0-marginal. round-recipe = separate Neon
> account, not mallan's. *(Open decision for Maya: commit the billing-audit docs so the evidence is
> durable for future operators, or keep them operator-held — see "Open decision" at end of plan.)*
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

### Step 2 — Clean up the stale `NEON_PROJECT_ID` variable (LOW / housekeeping — the production-break risk is ALREADY guarded)
**Correction (Codex #397, verified 2026-06-12 by direct Read):** the production-break path is
already closed, so this step is downgraded from a safety blocker to bookkeeping. The fail-closed
guard `scripts/ci/assert-canonical-neon-target.mjs` (landed in **#371**, present in this commit's
parent) runs at `rotate-db-keys.yml:191` **before the first Neon mutation** and explicitly lists
`morning-bread-68708332` as FORBIDDEN; the `--host` guard (`:330`) gates the secret/env writes. A
manual dispatch carrying the stale `NEON_PROJECT_ID = morning-bread-68708332` would therefore
**abort at the guard, not re-break production**. The earlier "would still re-break prod" framing was
wrong and is retracted.
**What actually remains (cosmetic correctness, not a safety blocker):** the repo variable
`NEON_PROJECT_ID` still names the stale project. It is misleading and would make a *legitimate*
future re-enable of rotate-db-keys point at the wrong project — which the guard would then refuse,
so the worst case is a hard abort, never data loss.
**Fix (HELD — repo-variable surface = Maya approval):** set `NEON_PROJECT_ID` to the canonical
`hidden-mountain-87248164`, or delete it. **No workflow-code change needed — the guard already
exists.** **Do NOT run rotate-db-keys** regardless (CLAUDE.md standing rule). This step no longer
gates Step 7 as a safety item.

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
ONLY after the **safety/proof gates** pass: Step 3 (cleared Vercel check), Step 6 (size-under-cap
proof), Step 5 (no-JSON-dependency proof). Step 2 is housekeeping, NOT a safety gate (the guard
already protects rotation) — recommended-but-not-blocking. Maya decides. No downgrade before this.

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
- Step 7 BLOCKED until **Step 3** (Vercel check cleared) + Steps 5, 6 pass. Step 2 is recommended
  housekeeping, not a Step-7 blocker.

## Open decision for Maya — durability of the evidence audits
The three 2026-06-12 billing audits (`zero-billing-neon-vercel`, `zero-billing-r2-cloudflare`,
`neon-storage-cost`) are currently **untracked / operator-held**, consistent with how the other
2026-06-12 audit + dry-run docs are kept. Because this is a *tracked* plan that gates real spend
decisions on those numbers, Codex #397 fairly noted the citation points at a file a fresh clone
won't have. Two clean options — **your call**:
- **(A) Commit the billing audits** (durable evidence for the next operator; they contain infra
  topology + project ids but **no secrets** — values were masked during the audit). Recommended if
  this plan will be executed by anyone but you.
- **(B) Keep them operator-held** (consistent with current audit-doc hygiene). The load-bearing
  facts are inlined in this plan's header, so the plan stands alone either way.
This plan does not assume either; it inlines the facts so it is self-verifying now.

*Plan authored read-only by Claude (Fable 5), 2026-06-12, at Maya's direction. Tracks the
zero-billing audit's $0 path. No execution authorized; every step Maya-gated. Amended same-day for
Codex #397 (evidence-doc untracked; rotate-db-keys guard already landed in #371).*
