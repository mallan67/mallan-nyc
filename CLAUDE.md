# CLAUDE.md — Project Command Center · mallan.nyc

> Lean indexed command center (rebuilt 2026-05-20).
>
> **Compliance-first.** When a task touches anything in §D, READ `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` FIRST. The index has per-area canonical pointers, validators, and fail-closed instructions for REBNY, RLS, UCBA, IDX Plus, Trestle/Cotality, Fair Housing, NY DOS, FARE Act, TCPA, NY SHIELD, audit retention, CRM lead routing, seller/landlord intake, and Mallan exclusives/syndication.

> **Cross-agent constitution → `AGENTS.md`.** The shared source of truth for **Claude · Codex · ChatGPT** (invariants, non-negotiable holds, where truth lives, and the per-session handoff rule). Read it alongside this file; keep the two in sync — `AGENTS.md` is the concise cross-agent essentials, this file is the Claude-specific depth. **Live operational status → `docs/PROJECT-HEALTH-DASHBOARD.md`** — refresh its auto tier with `npm run health:probe` (read-only) before every handoff. Dated session narrative → `docs/operations/site-audit-handoff-YYYY-MM-DD.md`.

> ## 🛑 AGENT STOP — Neon/Vercel database facts (read before ANY db / Neon / Vercel / deploy action)
>
> - **Canonical production data = `hidden-mountain-87248164` / "neon-green-school" / `ep-cold-waterfall-adno3ao2` / branch `main` (`br-crimson-frog-adr7g9gt`).**
> - **`morning-bread-68708332` / "mallandb" / `ep-royal-dawn-ad6eh8t2` (`br-old-tree-admdlb9z`) is STALE / DO-NOT-SERVE.** Never treat it as production.
> - **`round-recipe-12208101` / "neon-green-door" is NOT connected to mallan-nyc.** Leave it alone.
> - **The only Vercel store bound to mallan-nyc is `store_K9l79ICRUTMsiRh2` → hidden-mountain** (Vercel store-API verified 2026-06-03). **No Vercel store binds `morning-bread`.**
> - **DO NOT run `rotate-db-keys`** — schedule disabled; it targets morning-bread/royal-dawn and would re-break production. Re-enable only after retarget to cold-waterfall + a fail-closed host guard.
> - **DO NOT prune `morning-bread` to "fix" the Vercel "Branch limit exceeded" check.** It is a STALE/FALSE Vercel-side status against hidden-mountain (which is 2/5000). Verify with: live Neon branch count + deployment `state=READY` + `/api/health` 200. Real fix = Vercel support.
> - **DO NOT create Neon branches from stale / test / wip / probe Git branches.** "Create Database Branch for Production" stays **OFF**; "Require Active Resource Before Deploy" stays **OFF** until Vercel resolves the false check.
> - Full evidence: `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`.

---

## A. Absolute hard rules

1. **NEON discipline** — READ `NEON.md` before any Prisma schema, migration, `prisma migrate deploy`, `prisma db push`, `vercel.json buildCommand`, `db-keepalive` cron, or new column / FK / index / table work. Failing to read it is how the 2026-04-19 silent-drift incident happened.
2. **Source-of-truth charter** — READ `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` before creating, renaming, moving, or editing any file in search, CRM, featured/exclusives, neighborhoods/locations, media, listings, or IDX. No parallel `*-v2`/`*-new`/`*-final` files. No editing generated files (`public/crm/index-built.html` is built via `npm run crm:build`).
3. **Memory file mirror policy** — every file created/updated under `memory/` must also be mirrored to `C:\Users\MayaAllan\Desktop\memory\` in the same session (byte-identical). Verify with `cmp` after write. The `memory/archive/` subdirectory itself is not mirrored, only its parent file movements.
4. **Compliance-first** — see §D.
5. **Fail-closed on rule conflict or missing canonical file** — see §E.
6. **Proof-first on completion claims** — see §F.
7. **Never start without explicit Maya approval:** PR 5B, external-inventory implementation, syndication exports / partner integrations, schema migrations, env-var changes, Neon settings, cron config, CRM frontend (`public/crm/**`), agents, skills, `.github/workflows/**`, manual cron triggers, reconciliation runs, admin merge bypass, force push to main.
8. **Never skip hooks** (`--no-verify`), never bypass signing (`--no-gpg-sign`), never amend a published commit.
9. **`scripts/__pr147-soak-verify.mjs` stays UNTRACKED.** Do not commit it.

---

## B. Current project status

- **Production:** mallan.nyc on Vercel (Next.js 16.1.6 + Turbopack, App Router)
- **Database:** Neon Postgres — **canonical production data home = `hidden-mountain-87248164` ("neon-green-school") · endpoint `ep-cold-waterfall-adno3ao2` · branch `main` (`br-crimson-frog-adr7g9gt`)** (repointed here 2026-06-02 in the cross-project DB rescue; PRs #321/#322). The legacy project `morning-bread-68708332` ("mallandb") · `ep-royal-dawn-ad6eh8t2` (`br-old-tree-admdlb9z`) is **stale / do-not-serve**. `cold-waterfall` and `royal-dawn` are endpoints in **two different Neon projects**, not two endpoints on one branch. Prisma reads the **bare** `DATABASE_URL` + `DATABASE_URL_UNPOOLED` (now → cold-waterfall) — **not** the integration's `database_*` vars. (`ASSISTANT_DATABASE_URL` is a separate bare Production var also repointed 2026-06-02 but **not** a Prisma read path / currently unused in code.) `rotate-db-keys` schedule is **disabled** until retargeted to cold-waterfall + a fail-closed host guard. Details: `NEON.md` §10/§11 + `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` (top correction).
- **Feed:** REBNY IDX Plus via Cotality/Trestle (`https://api.cotality.com/trestle`) — read-only display
- **Brokerage:** Mallan Real Estate Inc. · NY broker license **#10991205323** · 646-258-4460 · 400 East 90th Street, Suite 17C, NY 10128 · Principal broker: Maya Allan (REBNY agent license #10311201806)
- **Active state / current PR queue / exclusive-launch readiness:** see the most recent audit at `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md` (or run `gh pr list --state open` for the live queue)
- **Master refactor plan:** `memory/REFACTOR-2026-04-25.md`
- **Compliance baseline** (verify before any major work): `npm run ops:health` → drift=0 + §2.05=0; `npm run ucba:audit` → 46/46 PASS, 0 REGRESSIONS; `npm run idx:validate` → 0 critical; `npm run compliance-check` → 93/93 BLOCKER+STRICT

---

## C. Current holds (require explicit Maya approval before starting)

| Item | Status | Where the hold is recorded |
|---|---|---|
| **PR 5B** — `refactor/05-listing-search-projection` (public reader swap from `listings.idx_display_yn` → `listing_search_projection.idx_display_yn`) | HELD | `memory/REFACTOR-2026-04-25.md` master plan + recurring Maya direction |
| **External-inventory implementation** (OneKey / NY-State MLS / other non-REBNY feeds) | HELD | `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`; spec at `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` |
| **Syndication exports / partner integrations** | HELD | `MALLAN_OFFICE_MLS_IDS=[]` in `lib/syndication/mallan-identity.ts`; Layer 1.PRE empty-config-guard blocks all rows (PR #162 + #163); no `/api/exports/*` route exists |
| Schema migrations · env vars · Neon · cron config · CRM frontend (`public/crm/**`) · agents · skills · `.github/workflows/**` | HELD | Maya standing directive |
| Manual cron triggers · reconciliation runs · admin merge bypass · force-push to main | HELD | Maya standing directive |

---

## D. Compliance-first rule

If a task touches ANY of the following surfaces, READ `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` **first**, then read the canonical file the index points to for the specific area, then proceed:

- Public listings · listing-display rendering · FeaturedListings · search-result composition
- IDX · RLS · Trestle / Cotality Web API · OData queries · field mapping
- Syndication · Mallan exclusives · partner export
- CRM lead routing · inquiry · contact · open-house RSVP · sign-up · CMA · guides · search-alerts · favorites · saved-searches
- Seller / landlord intake forms (`SALE-FORM-REDESIGN.html`, `RENTAL-FORM-REDESIGN.html`)
- Advertising surfaces (any public text mentioning a listing, agent, or brokerage)
- Broker attribution · NY DOS §175.25 disclosures · IDX disclaimer
- Fair Housing language scanning · prohibited terms
- Portal access · agent PII masking · invite-token flow
- Audit-event creation · lead consent capture · retention windows
- Display gate writes (`idx_display_yn`, `internet_*_display_yn`, `participant_only`, `owner_opt_out`)
- Status transitions (`TERMINAL_STATUSES`, `normalizeStandardStatus`)
- Media / photo / floorplan / video (Trestle Media API rules — `ResourceRecordKey` not `ResourceRecordID`)

The compliance index has 18 numbered areas, each with: canonical file · backup / reference · validator / test · when to read · fail-closed instruction. No compliance rule lives directly in this CLAUDE.md — only the pointer.

---

## E. Fail-closed rule

If REBNY / RLS / IDX Plus / Trestle / Cotality / FARE Act / NY DOS / Fair Housing / TCPA / NY SHIELD requirements are unclear, conflicting, or absent from the canonical file:

- **STOP and report.**
- **Do NOT guess** from memory.
- **Do NOT extrapolate** from one MLS's behavior to another's, or from one field's null-handling to another's.

The 2026-04-30 incident — 7,594-row corruption — happened because `affirmPermission()` was assumed to be correct for `InternetEntireListingDisplayYN` (which is REBNY-pre-filtered, so null = displayable). The full incident is canonicalized at `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`. Read it once if you have not already.

---

## F. Proof-first rule

A change is not "fixed" without one of the following:

- A **failing test that the fix flips green** (the test must be in the same PR — see PR #112 + #113 + #148 pattern). Source-grep verification ALONE is not sufficient for any rendering or behavior claim.
- A **live URL probe** (production or immutable Vercel preview URL) with the actual rendered evidence captured.
- A **Vercel runtime log** (`mcp__claude_ai_Vercel__get_runtime_logs`).
- **Direct source-code Read** — for purely static claims only (e.g., "is the import present?" — NOT for "does the disclosure render?").

Example of why this matters: the 2026-05-20 launch-readiness audit found the FARE Act disclosure source-grep passing (`app/listing/[...slug]/page.tsx`, FARE disclosure block, contained the text) BUT the conditional was not rendering on production rentals — a real legal exposure ($1,800–$2,000 per violation under NYC LL 119/2024). See `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md` A4.

Guardrail docs: `docs/engineering/pr-verification-checklist.md` + `docs/engineering/vercel-preview-proof-rules.md` + `docs/operations/proof-first-guardrails.md`.

---

## G. Required validation checklist (run before every commit that touches compliance-shaped surfaces)

```bash
npm run type-check          # 0 TypeScript errors required
npm run rls:validate        # 10-section REBNY RLS validator
npm run compliance-check    # 93+ rules — BLOCKER+STRICT must be 0 failures
npm run ucba:audit          # 145-rule UCBA — REGRESSIONS must be 0
npm run idx:validate        # 32-section IDX Plus — 0 critical
npm run crm:test            # if public/crm/** touched (172/172 smoke)
npm run ops:health          # before major deploys (see NEON.md)
```

Exit codes must be 0. Any `REGRESSIONS: N` where N > 0 from `ucba:audit` is a hard stop — fix the regression, do not edit the checklist to silence it.

CI runs the same chain via `.github/workflows/pr-check.yml`. Don't merge with red checks; don't admin-bypass.

---

## H. Canonical file pointers

| Topic | Canonical file |
|---|---|
| **Compliance per-area canonical map** (read first for any §D surface) | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| REBNY skill (auto-loaded at session start) | `.claude/skills/rebny-compliance/SKILL.md` |
| Neon / Prisma / DB rules | `NEON.md` |
| Repo source-of-truth charter | `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` |
| Trestle field registry (all 12 resources, ~1,364 fields) | `data/RLS-FIELD-REGISTRY.md` |
| IDX Plus field CSV (902 fields, 7 resources) | `data/rebny-rls-property-fields.csv` |
| Picklist values (2,066 lookups) | `data/rebny-rls-property-lookup.csv` |
| UCBA 2026 rules (extracted from 56-page PDF) | `data/UCBA-2026-Requirements.md` |
| Syndication research (RLS feeds, vendors, costs, providers) | `data/RLS-Syndication-Research.md` |
| Trestle live OData $metadata | `artifacts/metadata.xml` |
| Master refactor plan (10-PR backend rebuild) | `memory/REFACTOR-2026-04-25.md` |
| Most recent comprehensive audit | `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md` |
| Post-reconciliation tightening audit (Phase A scope rationale) | `docs/idx/post-reconciliation-tightening-audit-2026-05-20.md` |
| Backend / CRM gap audit | `docs/backend-crm-current-gap-audit-2026-05-18.md` |
| CRM workflow proof audit | `docs/crm-workflow-proof-audit-2026-05-16.md` |
| Engineering proof rules | `docs/engineering/pr-verification-checklist.md` · `docs/engineering/vercel-preview-proof-rules.md` |
| Proof-first guardrails | `docs/operations/proof-first-guardrails.md` |
| Neon cost / branch policy | `docs/architecture/NEON-COST-CONTROL-POLICY.md` |
| Neon / Vercel ownership map | `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` |
| Mallan exclusives syndication plan (invariants I.1–I.8) | `docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md` |
| MASTER-PROJECT-TREE (file roles, phases, gates) | `MASTER-PROJECT-TREE-v3.3.md` |
| Master project document | `MALLAN-NYC-CRM-PROJECT.md` |

---

## I. Historical archive pointers

- `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` — canonical incident report (the 7,594-row corruption)
- `memory/AUDIT-2026-05-12.md` — pre-PR-#148 audit

---

## J. Codex findings — classify before acting

Codex is a **static code-path reviewer only.** Codex reads the repo; it does **not** query `api.cotality.com`, does not see the live IDX Plus feed, does not see production Neon/Vercel state, and does not receive REBNY/Trestle notices. Claude must not treat Codex as live field authority. Claude independently verifies field truth with live tools **before** making any field-truth claim.

**J.1 — Classify every Codex finding before action.** Exactly one of:

| Class | What it is |
|---|---|
| **A** | Static repo code-path issue (the code does X) |
| **B** | Live Cotality field-truth issue (the feed contains / lacks / moved a field) |
| **C** | REBNY / Trestle notice / compliance-rule issue |
| **D** | Runtime / Vercel / Neon / env issue |
| **E** | Generated artifact / validator-baseline issue |

**J.2 — Codex is strong evidence for Class A only.** Accept a Codex Class-A finding as actionable when it is one of: missing `select` list · missing DTO path · fallback bug (e.g. `||` swallowing a legitimate `0`) · draft-gate / status-logic bug · route-local `select` mismatch · generated-artifact / test mismatch.

**J.3 — Codex is NOT authority for Class B / C / D.** Do not act on, repeat, or write into a PR any Codex claim that: a field exists / is populated live on IDX Plus · a field moved to another resource · a REBNY/Trestle rule changed · production DB / env state is correct. For B/C/D, Codex output is a **hypothesis to verify**, never a conclusion.

**J.4 — B/C/D require independent proof.** One of: `npm run trestle:audit-server` · `npm run trestle:diff` · `npm run trestle:probe` / a live `$metadata` query · a refreshed `artifacts/metadata.xml` **plus** a live proof capture · a dated REBNY/Trestle notice (Class C) · a read-only runtime/Vercel/Neon proof as applicable (Class D). No PR CI check queries live Cotality — live verification is a manual step Claude performs.

**J.5 — Every Cotality field change must trace end-to-end** (each link confirmed, not assumed): live field exists → selected from Trestle → route-local select lists checked → mapped → `raw_data` preserved if needed → public DTO **DB path** checked → public DTO **Trestle-direct path** checked → rendered if public → form save/hydrate checked if CRM → legacy fallback zero-safe if numeric → tests added.

**J.6 — Every generated-artifact PR (Class E) must prove:** the generator actually ran · source files unchanged unless explicitly in scope · generated "unknown" count is zero or explicitly accepted · `npm run test:rls` passes before merge. Note: **`test:rls` is NOT in PR CI today** (`.github/workflows/pr-check.yml` does not run it) — it now runs the canonical form-binding + RLS-reporter Jest suites (the old CSV-derived resolver script is retired); run it by hand and state the result, or state plainly that it was not run.

**J.7 — Status / compliance gates use explicit status semantics:** normalize draft-like statuses before comparing · Draft / Incomplete / empty must not be blocked by publish-only gates · public / display-ready statuses stay **fail-closed** · do not reuse a narrow helper for a broader compliance gate unless the status sets are **proven** equivalent.

**J.8 — No "green checks" claim stands alone.** When reporting passing checks, state per check **what it proves and what it does not.** Example: "`rls:validate` green proves the static RLS binding rules pass; it does **not** prove any field is live on Cotality."

---

## Operational tips

- **For a quick "what's the project state right now"** → run `gh pr list --state open` plus `git log --oneline -10`, then list the contents of the audits directory (`docs/audits/`) and Read the most recent file there. The current latest is `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md`.
- **For a compliance question** → `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` first, then the canonical file it points to.
- **For "is there a test for X"** → check `tests/runtime/` and `lib/**/__tests__/` first; the test name usually matches the feature.
- **For Neon / Prisma / cron-DB work** → `NEON.md` is non-negotiable reading.
- **If the user says "ultrareview"** → that's a multi-agent cloud review of the current branch. It is user-triggered and billed; you cannot launch it.
