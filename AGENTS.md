# AGENTS.md — Cross-Agent Constitution (Claude · Codex · ChatGPT)

> **Cross-agent operating constitution for `mallan67/mallan-nyc`.**
> Read the current GitHub version from the branch/PR being worked on. Claude, Codex, and ChatGPT must
> not substitute chat memory, pasted snapshots, Desktop copies, or historical handoffs for current Git
> state. Product/system authority remains the repository's designated master authority; this file governs
> how agents verify and execute work.

This project is a **live Cotality/Trestle (REBNY IDX Plus) synchronization platform** — not "an IDX
website." It has downstream consumers: search, CRM, portal, media, compliance, archive, email, contact.

---

## 0. Required authority order for every agent

Every agent starts from the same chain:

1. `MALLAN-PLATFORM-MASTER-PLAN.md` — sole durable product/business/system authority.
2. `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` — current execution state and machine authorization envelope.
3. Current GitHub branch/PR/base SHA and required checks.
4. Live provider/runtime evidence required by the active packet.
5. This file plus specialized guidance such as `CLAUDE.md`, `NEON.md` and the Compliance Canonical Index.

A chat, Desktop checkout, side branch, audit, dashboard or handoff can provide evidence but cannot become the authority chain.


### 0.1 GitHub-only working state + provider authority (Maya directive 2026-09-18)

- **Repository work happens in GitHub.** Claude, ChatGPT and Codex read/write the current GitHub branch
  or PR directly. Do not use Maya's Desktop, local worktrees, Desktop mirrors, scratch repos, copied
  project folders, or a local clone as repository working state or authority. Do not create new local
  project/worktree folders. Machine-local evidence may be inspected only when Maya explicitly asks for
  local cleanup/recovery; repo mutations still happen through GitHub.
- **Git facts** (files, commits, branches, PRs, Actions) come from the current GitHub repository/PR, never
  from a stale checkout or old bot comment.
- **Vercel facts** (project, deployment, environment-variable scope, Marketplace binding, runtime behavior)
  come from the connected Vercel project plus Vercel's official documentation. Do not infer Vercel behavior
  from an old repo note.
- **Neon for mallan-nyc is the Vercel-managed resource path:** Vercel project `mallan-nyc` →
  Marketplace resource `neon-green-school` / `store_K9l79ICRUTMsiRh2` → Neon project
  `hidden-mountain-87248164`. Administrative/dashboard access starts through Vercel SSO
  (`vercel integration open neon neon-green-school`). Live Neon reads must be reconciled to this exact
  Vercel binding before being used as Mallan truth. Do not create an independent Neon resource to bypass it.
- **Cotality/Trestle facts** come from the authorized live Cotality/Trestle contract and official provider
  documentation. Repo metadata, CSVs, generated enums, and old audits are caches/evidence only.
- **Cotality/Trestle proof is live-provider proof.** Runtime OAuth lives in `lib/idx/auth.ts`:
  `TRESTLE_API_URL` (or legacy `IDX_ENDPOINT`) selects the base, token grant is `client_credentials`,
  scope is `api`, and token lifetime comes from provider `expires_in`. `.mcp.json` / `trestle-fields`
  is an **optional local developer helper only**, never provider authority; it must fail closed when live
  Cotality is unavailable. Do not invent quotas, TTLs, fields, enums, permissions, or mappings that are
  not proven by the live contract/provider docs.
- If a provider fact cannot be verified live, mark it **UNVERIFIED and stop**. Do not fill the gap from memory.
- **Provider mutations are Git-controlled.** Read-only provider evidence may use the authorized connector. Environment/resource/Neon control-plane mutations require the active Git packet plus Maya's explicit authorization; do not execute direct Neon CLI/API mutation paths.

---

## 1. Invariants (never violate)

1. **Canonical Neon production** — project `hidden-mountain-87248164` ("neon-green-school", **Vercel-managed
   org** `Vercel: maya` / `org-wild-king-99967357`) · default branch **`main` = `br-crimson-frog-adr7g9gt`**
   · endpoint **`ep-cold-waterfall-adno3ao2`**. **Stale / do-not-serve:** `morning-bread-68708332` /
   `ep-royal-dawn-ad6eh8t2` (personal org). Never target the stale one. Full rules: `NEON.md`.
2. **Live Cotality/Trestle cadence is intentional** — `/api/cron/idx-sync` **every 10 min**,
   `/api/cron/media-sync` **every 15 min**, `/api/cron/db-keepalive` **every 15 min** (source of truth =
   `vercel.json`). Some route-file **comments are stale** (say "4 hours" / "4 minutes"). **Fix the
   comments, never the schedule**, unless Maya explicitly asks.
3. **Proof-first** — a change is not "done" without a failing test that flips green, a live URL/runtime-log
   proof, or a direct source read (static claims only). Source-grep alone never proves rendering/behavior.
4. **Fail-closed** — if a REBNY/RLS/IDX/FARE/Fair-Housing rule is unclear or a canonical file is missing,
   STOP and report; do not guess or extrapolate across feeds/fields.
5. **Review the current HEAD** — a Codex/reviewer comment against an older commit is **not** a blocker if
   the current HEAD already addresses it. Always check the PR's current head SHA first.
6. **Compliance-first** — anything touching listings, IDX, syndication, CRM lead/contact, intake forms,
   display gates, media, or public text: read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` first.
7. **Cotality/Trestle is the sole provider authority — verify the whole contract live.**
   For any field, enum/string, resource, attribution requirement, permission, mapping, search/filter/OData
   semantic, pagination rule, media relationship, or API behavior, verify against the authorized live
   Cotality/Trestle API **and the provider's current documentation**. Do not promote repo snapshots or old
   agent prose into provider truth. `data/cotality-enums.live.json`, `artifacts/metadata.xml`, registries,
   and CSVs are useful mirrors/evidence only. `npm run cotality:pull` / `npm run cotality:verify` may
   refresh/check the enum mirror, but they do not replace live provider semantics. Do not embed dated enum
   lists in this constitution; re-read the provider when the answer matters.

## 2. Non-negotiable holds (require explicit Maya approval)

Gate 6 `--execute` / any archive-drain execute / 20K–80K batches · manual cron trigger · Vercel env
changes · Neon reclaim/downgrade · `VACUUM FULL` · `rotate-db-keys` · production migrations
(`prisma migrate deploy` / `db push`) · PR-5B · projection backfill · PageSpeed/media lane ·
notification dispatcher · open-house v2 · admin merge bypass · force-push to main. (Full list + why:
`CLAUDE.md` §C and the handoff snapshot.)

## 3. Where truth lives

| Rank | Topic | Authority |
|---|---|---|
| 1 | Product/business/system architecture | `MALLAN-PLATFORM-MASTER-PLAN.md` |
| 2 | Current execution + authorization envelope | `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` |
| 3 | Current repository reality | GitHub current base/head/PR/checks |
| 3 | Cotality/Trestle provider truth | Authorized live Cotality/Trestle API + current provider documentation |
| 3 | Vercel runtime/integration truth | Connected Vercel project + current official Vercel documentation |
| 3 | Neon runtime/control-plane truth | Live Neon evidence reconciled to the Vercel-bound resource |
| 4 | Cross-agent working discipline | `AGENTS.md` |
| 4 | Claude-specific discipline | `CLAUDE.md` |
| 4 | Neon/Prisma specialized rules | `NEON.md` |
| 4 | Compliance implementation map | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| Evidence | Issues, dashboards, dated handoffs, historical audits | Supporting evidence only |

Do not create parallel master plans, status authorities, alternate execution-state files, or subsystem-specific canonical truths.
Newly proven business requirements amend the one Master. Current mutable status updates the one Execution State.

## 4. Handoff rule (binds every agent, every session)

Before ending a session or handing off:
1. Run **`npm run health:probe`** (read-only) to refresh the dashboard's auto tier.
2. Update any **assessed-tier** rows you actually verified (with evidence). Leave the rest ⚪ UNVERIFIED.
3. Update the dated **handoff snapshot** with: date/time, main SHA, open PRs, latest prod deploy, last-24h
   runtime errors, unresolved blockers, what changed, exact stop point.
4. Never mark a status 🟢 without captured proof. Never rely on chat memory alone.

## 5. Evidence language rule (binds every agent, every report — Maya directive 2026-07-01)

- The words **"probably," "likely," "appears," "root cause"** are FORBIDDEN in any issue entry or
  status report, EXCEPT (a) prefixed **`Hypothesis H-###`** and entered in the Hypothesis Register
  of `docs/PLATFORM-ISSUE-REGISTRY.md` with **Observed · Evidence · Missing · Confidence · Next
  verification**, or (b) "root cause" backed by an Evidence Score ≥ 9 on the same line.
- Every registry item carries an **Evidence Score (0–10)** — one point per captured field
  (endpoint · source · request · response · stack trace/log · DB query · repro · user impact ·
  frequency/timestamps · environment) with the ✗ fields listed. 9–10 act · 6–8 act naming the
  gaps · ≤5 verify before touching production.
- A hypothesis mistaken for a diagnosis is a process failure; wording must make the difference
  impossible to miss across sessions and across agents.
- **Derived-summary invariant (Maya 2026-07-02):** changing any issue requires updating every
  derived summary in the same PR (Issue Row → Priority Table → P0/P1 Summary → Dashboard →
  Handoff). Any stale layer = the PR is incomplete.
- **Single-ID invariant (Maya 2026-07-02):** every issue has exactly one ID, defined in the
  Platform Issue Registry; all other documents reference the ID instead of duplicating the
  description.

## 6. Review policy (binds every merge decision — Maya directive 2026-07-03)

- **Codex is PREFERRED, not mandatory** — one strong reviewer, not the gatekeeper. The standard is
  evidence-based and multi-reviewer.
- **High-risk PRs** require EITHER a clean Codex review OR **two independent clean reviews plus a
  written exception note.**
- **High-risk** = migrations · env flags · cron · archive/shedding · billing/storage · public
  compliance surfaces · contact/lead writes · seller-report attribution.
- **Low-risk docs/read-only PRs** require: CI green · one independent review · no unrelated files ·
  and no unresolved Codex finding if Codex is available.
- **Any Codex finding** must be FIXED, proven PRE-EXISTING and split to its own issue, or
  documented as future-gated / out-of-scope — never silently ignored.

## 7. Current status — never copy it here

Do not freeze a dated project-status narrative into this constitution. For current state, read the current
GitHub `main` / PR HEAD, `docs/PROJECT-HEALTH-DASHBOARD.md`, `docs/PLATFORM-ISSUE-REGISTRY.md`, the
latest repo handoff snapshot, and live Vercel/Neon/Cotality evidence appropriate to the claim. Historical
status text is evidence only, not current truth.
