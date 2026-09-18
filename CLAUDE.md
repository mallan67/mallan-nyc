# CLAUDE.md — Claude Command Center · mallan.nyc

> Claude-specific operating instructions for `mallan67/mallan-nyc`.
>
> **Authority order is fixed:** `MALLAN-PLATFORM-MASTER-PLAN.md` → `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` → fresh GitHub/provider/runtime evidence → specialized guidance. This file is subordinate to the Master and Execution State and may not redefine either.
>
> **Compliance-first.** When work touches a compliance-shaped surface, read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` and the specialized authority it points to before mutation.

> ## 🛑 AGENT STOP — provider + repository authority (read before ANY DB / Cotality / Vercel / deploy action)
>
> - **Work from GitHub, not Maya's Desktop.** The current GitHub branch/PR is repo truth. Do not create or
>   use Desktop worktrees, mirrors, scratch repos, or copied project folders.
> - **Canonical Production DB identity:** Vercel resource `neon-green-school` /
>   `store_K9l79ICRUTMsiRh2` → Neon project `hidden-mountain-87248164` → branch `main`
>   (`br-crimson-frog-adr7g9gt`) → endpoint `ep-cold-waterfall-adno3ao2`.
> - **Stale / DO-NOT-SERVE:** `morning-bread-68708332` / `ep-royal-dawn-ad6eh8t2`. Keep the refusal
>   guard; do not "clean" the stale identity out of safety code.
> - **Do not assert `round-recipe-12208101` ownership/connectivity from old docs.** It is not visible in
>   the currently accessible orgs; that means UNVERIFIED, not proof of absence.
> - **Neon administration for mallan-nyc starts from Vercel:** `vercel integration open neon neon-green-school`
>   (SSO into the bound resource). Vercel manages the Marketplace binding; Neon manages objects inside the
>   project. Reconcile any direct Neon read to the Vercel resource before using it as Mallan truth.
> - **Dynamic facts must be re-read live.** Branch counts, env values, Preview provisioning, prune status,
>   deployment state, and integration settings are not trustworthy merely because a repo doc says them.
> - **Cotality/Trestle is live authority for fields, strings, permissions, attribution, mapping, search,
>   resources, media semantics, and API behavior.** Use the authorized live contract + current provider docs.
>   Repo CSV/XML/JSON mirrors are evidence only.
> - **Cotality access path is already in the repo.** `.mcp.json` → `trestle-fields` MCP using
>   `IDX_CLIENT_ID`, `IDX_CLIENT_SECRET`, `TRESTLE_API_URL`; runtime OAuth is `lib/idx/auth.ts`
>   (`client_credentials`, scope `api`, provider-returned `expires_in`). Verify against those live
>   paths before repeating any field/enum/permission/API claim.
> - **Do not run `rotate-db-keys` or mutate env/Neon settings without Maya's explicit authorization.**
---

## A. Absolute hard rules

1. **NEON discipline** — READ `NEON.md` before any Prisma schema, migration, `prisma migrate deploy`, `prisma db push`, `vercel.json buildCommand`, `db-keepalive` cron, or new column / FK / index / table work. Failing to read it is how the 2026-04-19 silent-drift incident happened.
2. **Source-of-truth charter** — READ `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` before creating, renaming, moving, or editing any file in search, CRM, featured/exclusives, neighborhoods/locations, media, listings, or IDX. No parallel `*-v2`/`*-new`/`*-final` files. No editing generated files (`public/crm/index-built.html` is built via `npm run crm:build`).
3. **GitHub-only working-state rule** — repository work is performed against the current GitHub branch/PR. Do not mirror repo files to Maya's Desktop, create local worktrees/project copies, or use local folders as authority. If a machine-local cleanup is explicitly requested, treat it as a bounded cleanup only — never as repo state.
4. **Compliance-first** — see §D.
5. **Fail-closed on rule conflict or missing canonical file** — see §E.
6. **Proof-first on completion claims** — see §F.
7. **Never start without explicit Maya approval:** PR 5B, external-inventory implementation, syndication exports / partner integrations, schema migrations, env-var changes, Neon settings, cron config, CRM frontend (`public/crm/**`), agents, skills, `.github/workflows/**`, manual cron triggers, reconciliation runs, admin merge bypass, force push to main.
8. **Never skip hooks** (`--no-verify`), never bypass signing (`--no-gpg-sign`), never amend a published commit.
9. **`scripts/__pr147-soak-verify.mjs` stays UNTRACKED.** Do not commit it.

---

## B. Current execution state

Do not keep mutable project status in this file.

Read:

1. `MALLAN-PLATFORM-MASTER-PLAN.md` for durable architecture/business rules.
2. `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` for the active packet, branch, base SHA, authorization envelope, holds and exact stop point.
3. Current GitHub/Vercel/Neon/Cotality evidence for any mutable fact needed by that packet.

A historical audit, old PR, old branch, Desktop checkout, local worktree or chat transcript is evidence only and cannot grant scope.

The required GitHub `pr-check` runs `scripts/ci/mallan-execution-control.mjs` and evaluates implementation scope from the **PR base branch's** Execution State. A branch-local edit to the Execution State cannot self-authorize broader implementation.


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

| Topic | Authority |
|---|---|
| Mallan product/business/system architecture | `MALLAN-PLATFORM-MASTER-PLAN.md` |
| Current execution + machine authorization | `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` |
| Cross-agent discipline | `AGENTS.md` |
| Compliance implementation map | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| Neon / Prisma / DB rules | `NEON.md` |
| Repo source-of-truth charter | `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` |
| Cotality/Trestle provider truth | Authorized live API + current provider documentation |
| Vercel truth | Connected Vercel project + current official documentation |
| Neon truth | Live Neon evidence reconciled to the Vercel-managed resource |

Repo snapshots, CSV/XML/JSON mirrors, historical audits, dashboards and handoffs are supporting evidence. They do not outrank the Master, Execution State, or current provider/runtime evidence.


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

**J.4 — B/C/D require independent proof.** Class B requires the authorized live Cotality/Trestle API plus the provider's current documentation for semantics/permissions/attribution; repo mirrors alone are insufficient. Useful live probes include `npm run trestle:audit-server`, `npm run trestle:diff`, `npm run trestle:probe`, and a live `$metadata` query. Class C requires the governing REBNY/Trestle notice/rule. Class D requires live Vercel/Neon evidence from the bound resource. No PR CI check proves live provider truth.

**J.5 — Every Cotality field change must trace end-to-end** (each link confirmed, not assumed): live field exists → selected from Trestle → route-local select lists checked → mapped → `raw_data` preserved if needed → public DTO **DB path** checked → public DTO **Trestle-direct path** checked → rendered if public → form save/hydrate checked if CRM → legacy fallback zero-safe if numeric → tests added.

**J.6 — Every generated-artifact PR (Class E) must prove:** the generator actually ran · source files unchanged unless explicitly in scope · generated "unknown" count is zero or explicitly accepted · `npm run test:rls` passes before merge. Note: **`test:rls` is NOT in PR CI today** (`.github/workflows/pr-check.yml` does not run it) — run it by hand and state the result, or state plainly that it was not run.

**J.7 — Status / compliance gates use explicit status semantics:** normalize draft-like statuses before comparing · Draft / Incomplete / empty must not be blocked by publish-only gates · public / display-ready statuses stay **fail-closed** · do not reuse a narrow helper for a broader compliance gate unless the status sets are **proven** equivalent.

**J.8 — No "green checks" claim stands alone.** When reporting passing checks, state per check **what it proves and what it does not.** Example: "`rls:validate` green proves the static RLS binding rules pass; it does **not** prove any field is live on Cotality."

---

## Operational tips

- **For a quick "what's the project state right now"** → use the GitHub connector/API to read current `main`, open PRs, current PR HEADs, Actions, and the latest repo handoff/audit. Do not consult a Desktop checkout or assume the audit named in an older agent doc is still the latest.
- **For a compliance question** → `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` first, then the canonical file it points to.
- **For "is there a test for X"** → check `tests/runtime/` and `lib/**/__tests__/` first; the test name usually matches the feature.
- **For Neon / Prisma / cron-DB work** → `NEON.md` is non-negotiable reading.
- **If the user says "ultrareview"** → that's a multi-agent cloud review of the current branch. It is user-triggered and billed; you cannot launch it.
