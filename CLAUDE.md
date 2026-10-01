# CLAUDE.md — Claude Command Center · mallan.nyc

> Claude-specific operating instructions for `mallan67/mallan-nyc`.
>
> **Authority order is fixed:** `MALLAN-PLATFORM-MASTER-PLAN.md` → `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` (status and history only; it authorizes nothing) → fresh GitHub/provider/runtime evidence → specialized guidance. This file is subordinate to the Master, may not redefine it, and may not contradict the recorded state.
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
> - **Cotality is the live authority for fields, strings, permissions, attribution, mapping, search,
>   resources, media semantics, and API behavior.** Use the authorized live contract + current provider docs.
>   Repo CSV/XML/JSON mirrors are evidence only.
> - **Cotality proof must be live.** Runtime OAuth is `lib/idx/auth.ts` (`client_credentials`, scope
>   `api`, provider-returned `expires_in`). `.mcp.json` / `trestle-fields` is an optional local
>   developer helper, not provider authority, and must fail closed when live Cotality is unavailable.
>   Verify the authorized live provider contract before repeating any field/enum/permission/API claim.
> - **`rotate-db-keys` was DELETED on 2026-09-20 and must not be recreated.** Do not mutate env or Neon settings without Maya's explicit authorization, and reach Neon only through the Vercel-managed resource.
---

## A. Absolute hard rules

1. **NEON discipline** — READ `NEON.md` before any Prisma schema, migration, `prisma migrate deploy`, `prisma db push`, `vercel.json buildCommand`, cron configuration, or new column / FK / index / table work. Failing to read it is how the 2026-04-19 silent-drift incident happened.
2. **Source-of-truth charter** — READ `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` before creating, renaming, moving, or editing any file in search, CRM, featured/exclusives, neighborhoods/locations, media, listings, or IDX. No parallel `*-v2`/`*-new`/`*-final` files. No editing generated files (`public/crm/index-built.html` is built via `npm run crm:build`).
3. **GitHub-only working-state rule** — Claude, ChatGPT and Codex perform repository work against the current GitHub branch/PR only. Do not mutate the repo from a local clone, Maya's Desktop, worktrees, project copies, or scratch folders. If Maya explicitly requests machine-local cleanup/evidence recovery, local files remain evidence only; repository mutations still happen through GitHub.
4. **Compliance-first** — see §D.
5. **Fail-closed on rule conflict or missing canonical file** — see §E.
6. **Proof-first on completion claims** — see §F.
7. **Never start without explicit Maya approval:** PR 5B (`refactor/05-listing-search-projection`, the public reader swap from `listings.idx_display_yn` to `listing_search_projection.idx_display_yn` — see `memory/REFACTOR-2026-04-25.md`), syndication exports / partner integrations, schema migrations, env-var changes, Neon settings, cron config, CRM frontend (`public/crm/**`), agents, skills, `.github/workflows/**`, manual cron triggers, reconciliation runs, admin merge bypass, force push to main. Private supplemental sale inventory is explicitly reauthorized by Master §4.5 and is no longer on this list. Convergence-specific holds are recorded in the Execution State (§7, §9, §11). Provider mutations must be executed only through an authorized GitHub-controlled packet/workflow; direct Neon control-plane mutation is not an approved fallback.
8. **Never skip hooks** (`--no-verify`), never bypass signing (`--no-gpg-sign`), never amend a published commit.

---

## B. Current execution state

Do not keep mutable project status in this file.

Read:

1. `MALLAN-PLATFORM-MASTER-PLAN.md` for durable architecture/business rules.
2. `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` for the current stage, branch, pull request, holds and exact stop point.
3. Current GitHub/Vercel/Neon/Cotality evidence for any mutable fact needed by that packet.

A historical audit, old PR, old branch, Desktop checkout, local worktree or chat transcript is evidence only and cannot grant scope.

Changes reach `main` only through a pull request that passes the required `pr-check` and that Maya reviews and merges. The execution controller is retired and the protection is INTERIM (Master §27.15, §27.18): no Search, CMA, forms, CRM, listing or other product development merges until `main` is cleaned (Execution State §11). Agents never merge; only Maya does.


## C. Current holds (require explicit Maya approval before starting)

| Item | Status | Where the hold is recorded |
|---|---|---|
| **PR 5B** — `refactor/05-listing-search-projection` (public reader swap from `listings.idx_display_yn` → `listing_search_projection.idx_display_yn`) | HELD | `memory/REFACTOR-2026-04-25.md` + recurring Maya direction (rule A.7) |

Every other mutation boundary named in rule A.7 (schema/migration, env vars, Neon, cron, CRM frontend edits, agents/skills/workflow files, manual cron/reconciliation runs, admin merge bypass, force-push) is a standing Maya directive restated there, not a second hold list. Convergence-specific holds (what may merge during the interim cleanup, and the current stop point) are recorded only in `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` (§7, §9, §11) — read them there. A hold freezes the held work only and never authorizes a substitute path.

---

## D. Compliance-first rule

If a task touches ANY of the following surfaces, READ `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` **first**, then read the canonical file the index points to for the specific area, then proceed:

- Public listings · listing-display rendering · FeaturedListings · search-result composition
- IDX · RLS · Cotality Web API · OData queries · field mapping
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
- Media / photo / floorplan / video (Cotality Media resource rules — `ResourceRecordKey` not `ResourceRecordID`)

The compliance index has numbered areas, each with: canonical file · backup / reference · validator / test · when to read · fail-closed instruction. No compliance rule lives directly in this CLAUDE.md — only the pointer.

---

## E. Fail-closed rule

If REBNY / RLS / IDX Plus / Cotality / FARE Act / NY DOS / Fair Housing / TCPA / NY SHIELD requirements are unclear, conflicting, or absent from the canonical file:

- **STOP and report.**
- **Do NOT guess** from memory.
- **Do NOT extrapolate** from one MLS's behavior to another's, or from one field's null-handling to another's.

The 2026-04-30 incident — 7,594-row corruption — happened because `affirmPermission()` was assumed to be correct for `InternetEntireListingDisplayYN` (which is REBNY-pre-filtered, so null = displayable). The display-gate behavior it produced is implemented in `lib/compliance/gates.ts` (`GateOptions.idxPlusPreFiltered`); re-verify it against live Cotality before relying on it. The incident narrative is in Git history.

---

## F. Proof-first rule

A change is not "fixed" without one of the following:

- A **failing test that the fix flips green** (the test must be in the same PR — see PR #112 + #113 + #148 pattern). Source-grep verification ALONE is not sufficient for any rendering or behavior claim.
- A **live URL probe** (production or immutable Vercel preview URL) with the actual rendered evidence captured.
- A **Vercel runtime log** (`mcp__claude_ai_Vercel__get_runtime_logs`).
- **Direct source-code Read** — for purely static claims only (e.g., "is the import present?" — NOT for "does the disclosure render?").

Example of why this matters: the 2026-05-20 launch-readiness audit found the FARE Act disclosure source-grep passing (`app/listing/[...slug]/page.tsx`, FARE disclosure block, contained the text) BUT the conditional was not rendering on production rentals — a real legal exposure ($1,800–$2,000 per violation under NYC LL 119/2024). See `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md` A4.

Guardrail doc: `docs/operations/proof-first-guardrails.md`.

---

## G. Required validation checklist (run before every commit that touches compliance-shaped surfaces)

```bash
npm run type-check          # 0 TypeScript errors required
npm run compliance-check    # BLOCKER+STRICT must be 0 failures
npm run ucba:audit          # UCBA checklist — REGRESSIONS must be 0
npm run idx:validate        # IDX Plus validator — 0 critical
npm run crm:test            # if public/crm/** touched
npm run ops:health          # before major deploys (see NEON.md)
```

Exit codes must be 0. Any `REGRESSIONS: N` where N > 0 from `ucba:audit` is a hard stop — fix the regression, do not edit the checklist to silence it.

CI runs the same chain via `.github/workflows/pr-check.yml`. Don't merge with red checks; don't admin-bypass.

---

## H. Canonical file pointers

| Topic | Authority |
|---|---|
| Mallan product/business/system architecture | `MALLAN-PLATFORM-MASTER-PLAN.md` |
| Current execution state | `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` |
| Cross-agent discipline | `AGENTS.md` |
| Compliance implementation map | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| Neon / Prisma / DB rules | `NEON.md` |
| Repo source-of-truth charter | `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` |
| Cotality provider truth | Authorized live Cotality API + current provider documentation |
| Vercel truth | Connected Vercel project + current official documentation |
| Neon truth | Live Neon evidence reconciled to the Vercel-managed resource |

Repo snapshots, CSV/XML/JSON mirrors, historical audits, dashboards and handoffs are supporting evidence. They do not outrank the Master, Execution State, or current provider/runtime evidence.


## I. Historical material

Git history is the archive. Dated audits, handoffs, plans, session logs and `memory/` records are evidence only; none of them is current instruction, and none may be revived as an authority.

---

## J. Codex findings — classify before acting

Codex is a **static code-path reviewer only.** Codex reads the repo; it does **not** query `api.cotality.com`, does not see the live IDX Plus feed, does not see production Neon/Vercel state, and does not receive REBNY/Cotality notices. Claude must not treat Codex as live field authority. Claude independently verifies field truth with live tools **before** making any field-truth claim.

**J.1 — Classify every Codex finding before action.** Exactly one of:

| Class | What it is |
|---|---|
| **A** | Static repo code-path issue (the code does X) |
| **B** | Live Cotality field-truth issue (the feed contains / lacks / moved a field) |
| **C** | REBNY / Cotality notice / compliance-rule issue |
| **D** | Runtime / Vercel / Neon / env issue |
| **E** | Generated artifact / validator-baseline issue |

**J.2 — Codex is strong evidence for Class A only.** Accept a Codex Class-A finding as actionable when it is one of: missing `select` list · missing DTO path · fallback bug (e.g. `||` swallowing a legitimate `0`) · draft-gate / status-logic bug · route-local `select` mismatch · generated-artifact / test mismatch.

**J.3 — Codex is NOT authority for Class B / C / D.** Do not act on, repeat, or write into a PR any Codex claim that: a field exists / is populated live on IDX Plus · a field moved to another resource · a REBNY/Cotality rule changed · production DB / env state is correct. For B/C/D, Codex output is a **hypothesis to verify**, never a conclusion.

**J.4 — B/C/D require independent proof.** Class B requires the authorized live Cotality API plus the provider's current documentation for semantics/permissions/attribution; repo mirrors alone are insufficient. Useful live probes include `npm run cotality:verify` and a live `$metadata` query. Class C requires the governing REBNY/Cotality notice/rule. Class D requires live Vercel/Neon evidence from the bound resource. No PR CI check proves live provider truth.

**J.5 — Every Cotality field change must trace end-to-end** (each link confirmed, not assumed): live field exists → selected in the Cotality `$select` → route-local select lists checked → mapped → `raw_data` preserved if needed → public DTO **DB path** checked → public DTO **Cotality-direct path** checked → rendered if public → form save/hydrate checked if CRM → legacy fallback zero-safe if numeric → tests added.

**J.6 — Every generated-artifact PR (Class E) must prove:** the generator actually ran · source files unchanged unless explicitly in scope · generated "unknown" count is zero or explicitly accepted · the artifact's own live drift check passes before merge (for `data/cotality-enums.live.json`: `npm run cotality:verify` against live Cotality). If that check is not in PR CI, run it by hand and state the result, or state plainly that it was not run.

**J.7 — Status / compliance gates use explicit status semantics:** normalize draft-like statuses before comparing · Draft / Incomplete / empty must not be blocked by publish-only gates · public / display-ready statuses stay **fail-closed** · do not reuse a narrow helper for a broader compliance gate unless the status sets are **proven** equivalent.

**J.8 — No "green checks" claim stands alone.** When reporting passing checks, state per check **what it proves and what it does not.** Example: "`ucba:audit` green proves the UCBA checklist patterns pass; it does **not** prove any field is live on Cotality."

---

## Operational tips

- **For a quick "what's the project state right now"** → read `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`, then use the GitHub connector/API to read current `main`, open PRs, current PR HEADs and Actions. Do not consult a Desktop checkout or treat a dated handoff/audit as current state.
- **For a compliance question** → `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` first, then the canonical file it points to.
- **For "is there a test for X"** → check `tests/runtime/` and `lib/**/__tests__/` first; the test name usually matches the feature.
- **For Neon / Prisma / cron-DB work** → `NEON.md` is non-negotiable reading.
- **If the user says "ultrareview"** → that's a multi-agent cloud review of the current branch. It is user-triggered and billed; you cannot launch it.
