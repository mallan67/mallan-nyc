# Site Audit Handoff — 2026-09-18

## Purpose

This handoff records the 2026-09-18 authority reconciliation after multiple agents repeated stale Neon/Vercel/Cotality assumptions from repo prose, Desktop copies, and historical audits.

**Operating rule from this point forward:** repository work is GitHub-only. Provider facts come from the live provider authority. Historical docs are evidence, not current state.

## Git state

- Base main: `bba9d8d6c92bb3bfe95b9f4b90da69534650c276`
- Active reconciliation branch: `fix/agent-authority-live-sources-2026-09-18`
- Branch HEAD at handoff creation: `c2d4be96c2f7f2f6ea27f12e9ad077dbad4582c0`
- No merge authorized.
- No Production deployment authorized by this documentation branch.

## Packet 1 — CLOSED

Database Authority Safety Packet 1 is fully closed.

- Packet commit: `12d12a3d1d19702ffc6ce9fa1adc84e24bb075f5`
- Merge/main SHA: `bba9d8d6c92bb3bfe95b9f4b90da69534650c276`
- PR #631 merged.
- Production deployment: `dpl_G88rfmsjAyXiP9QwnUJP3UG97EA1`, READY on exact merge SHA.
- Guardrails: success.
- Release Truth: success, including Production identity + listing smoke.
- Codex review: completed with no recorded threads/findings.
- No Production seed, destructive maintenance, manual cron, Neon mutation, Vercel env mutation, schema migration, or credential rotation occurred in Packet 1.

Do not reopen Packet 1 absent a new proven defect.

## Packet 2 — current stop point

Packet 2 is not closed.

### Packet 2A objective

Remove Development → Production database authority while preserving one canonical Vercel-managed Neon resource.

**Do not create a second Neon project/resource merely for Development.**

Current approved topology under investigation:

```
Vercel mallan-nyc
  -> Neon Marketplace resource neon-green-school / store_K9l79ICRUTMsiRh2
  -> Neon project hidden-mountain-87248164
       -> Production root: main / br-crimson-frog-adr7g9gt
       -> Development: one durable schema-only root branch, only after explicit mutation authorization
```

A normal parent-data child branch is forbidden for Development because it can clone Production rows/auth/session material.

### Packet 2A.1

Production `main` is currently `protected:false`. Protecting it is a separate controlled mutation after Development isolation closes and only after workflow compatibility is proven.

### Packet 2B

Vercel environment normalization/cleanup remains read-only until every variable has:

```
variable -> effective value class -> repo reader -> workflow writer -> integration owner
         -> required environments -> final action
```

Final action must be KEEP / RE-SCOPE / UPDATE / REMOVE / INTEGRATION-OWNED / BLOCKED.

Do not execute the first cleanup manifest; adversarial review found unsafe removal suggestions.

## Canonical Vercel / Neon binding — measured

### Vercel

- Team: `mallan`
- Team ID: `team_kZQh5NYLyrOKqffK0r9EXf4E`
- Project: `mallan-nyc`
- Project ID: `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`
- Active Neon Marketplace resource: `neon-green-school`
- Store ID: `store_K9l79ICRUTMsiRh2`

Correct managed-resource entry path:

```bash
vercel integration open neon neon-green-school
```

This produces Vercel SSO into Neon project `hidden-mountain-87248164`.

### Neon

Canonical Production:
- project `hidden-mountain-87248164`
- org `org-wild-king-99967357` / Vercel-managed
- branch `main` / `br-crimson-frog-adr7g9gt`
- endpoint identity `ep-cold-waterfall-adno3ao2`
- database `neondb`
- owner role `neondb_owner`

Stale / DO-NOT-SERVE:
- project `morning-bread-68708332`
- endpoint `ep-royal-dawn-ad6eh8t2`

Safety code must continue to recognize the stale identity as forbidden; do not remove it merely because it is stale.

## Proven corrections to earlier assumptions

### 1. Current Production project has never had Preview branches

Live branch enumeration with deleted branches included shows exactly one branch ever in `hidden-mountain-87248164`: `main`.

Therefore these prior explanations are superseded:
- "Preview branches are accumulating in hidden-mountain."
- "Preview branches were created and then the prune cron removed them."
- "steady-state Preview branch count is ~8" as a current claim.

Historical auto-created Preview branches exist in `morning-bread`, not current Production.

### 2. The prune cron is currently inert / fail-closed

Measured Vercel effective state:
- Production bare `NEON_API_KEY` = empty.
- Production bare `NEON_PROJECT_ID` = empty.

Current route behavior:
- authenticates cron request;
- detects missing control-plane env;
- writes an audit row with skipped/missing_env;
- returns HTTP 503;
- never calls `pruneBranches()`.

Therefore:
- an audit row is not proof pruning ran;
- old statements that the daily cron is currently maintaining Preview branches are false;
- Packet 1 `isPrunable()` fixes still protect the standalone/operator path and are not dead code.

### 3. Prisma schema was not Production schema authority

Earlier analysis treated the Prisma models as the Production database inventory. Live Production proved otherwise.

Measured Production contains:
- 82 public tables, not 76 Prisma models;
- `neon_auth` schema with 9 tables including auth/session/JWKS-related data;
- `repack` schema/functions;
- `financial_ledger` and `micro_commitments`.

Objects previously described as required Production objects but not present live:
- `agent_deals_v`
- `agent_deals_summary_v`
- `round(double precision, integer)`

Consequence: a fresh `prisma db push + apply_sql` reconstruction must not be called Production-equivalent. This is one reason schema-only Development branching is preferred.

### 4. Production-data cloning risk was understated

A parent-data branch can clone more than Prisma-modeled CRM/listing rows. The live `neon_auth` schema contains auth/session/JWKS-related material outside Prisma.

Development therefore must not be created as a normal parent-data child of Production.

### 5. `round-recipe-12208101` is not a current proven ownership fact

It is not visible in the currently accessible Neon orgs. That means its current state is **UNVERIFIED**, not proof that it is absent, disconnected, or owned elsewhere.

Historical dated audits may preserve what was measured at the time, but current agent docs must not state the old conclusion as live fact.

### 6. Vercel Marketplace team inventory was undercounted

Live Vercel CLI inventory showed five Marketplace resources team-wide:
- `neon-green-school` — Neon — available — connected to `mallan-nyc`
- `supabase-indigo-kite` — Supabase — available — connected to `mayaallan`
- `supabase-fuchsia-xylophone` — Supabase — suspended
- `supabase-purple-tree` — Supabase — suspended
- `supabase-amber-chair` — Supabase — suspended

The earlier "two resources team-wide" statement is superseded.

## Vercel database environment state

### Generic environments

Production bare Prisma URLs:
- `DATABASE_URL` -> canonical Production `ep-cold-waterfall-adno3ao2`
- `DATABASE_URL_UNPOOLED` -> same canonical Production identity

Development bare Prisma URLs:
- currently also -> canonical Production
- this is the primary Packet 2A defect

Generic Preview bare Prisma URLs:
- absent / fail-closed

Marketplace `database_*` family:
- generated/owned by the Vercel Neon integration
- currently connected across Production, Preview, Development
- do not manually copy, remap, or delete individual members as ordinary project vars
- Vercel Allowed Environments/resource connection should govern their environment exposure

`database_NEON_PROJECT_ID` identifies `hidden-mountain-87248164`.

Bare `NEON_PROJECT_ID` and Marketplace `database_NEON_PROJECT_ID` have different purposes and must not be conflated.

### Historical Preview branch overrides

Five manually created branch-scoped configurations were traced:

1. `search/browser-integration-2026-09-05`
   - bare DB override effectively empty / no useful DB authority.

2. `search/clean-foundation-2026-09-04`
   - bare DB override empty.

3. `feat/agent-permanent-delete-2026-09-01`
   - points at `ep-ancient-feather-arvoo9v4`
   - belongs to temporary QA project `lively-leaf-42641316`, not canonical Production.

4. `fix/neon-p0-event-driven-wake-2026-08-16`
   - points at `ep-rapid-sea-add131is`
   - endpoint not present in the currently accessible live Neon inventory.

5. `fix/cotality-neon-media-system-root-cause-2026-08-06`
   - carries a branch-scoped shadow `database_*` family
   - points at `ep-royal-thunder-adgxj9ow`
   - endpoint not present in the currently accessible live Neon inventory.

These are cleanup candidates after a final at-removal-time proof. They are not the desired Preview architecture.

## Vercel environment cleanup rule

The Vercel env surface contains broad lower-environment exposure including DB, cron, SMTP, Microsoft OAuth, Cotality/IDX, R2, AI, admin/debug, and control-plane credentials.

Do not delete by age/name alone.

Specific cautions:
- `CRON_SECRET` cannot be casually removed from Preview: some route patterns can fail open or change behavior when secret handling is inconsistent.
- Microsoft OAuth credentials have live readers.
- IDX/Cotality credentials have many live readers.
- SMTP Preview can send real mail if runtime gates treat Preview as production-like.
- `VERCEL_TOKEN` has been measured populated but invalid for direct API use; Vercel CLI authentication is separate.
- `NEON_API_KEY`, `NEON_PREVIEW_API_KEY`, `NEON_PROJECT_ID` have had empty-value states despite appearing in env listings.
- `ASSISTANT_DATABASE_URL` requires reader/writer/owner reconciliation before removal.

## Cotality/Trestle authority and verified access path

Provider truth is:
1. authorized live Cotality/Trestle API contract;
2. current provider documentation.

Repo mirrors are evidence/caches, not higher authority.

Verified repo access path:
- `.mcp.json` defines the `trestle-fields` live MCP.
- Required env:
  - `IDX_CLIENT_ID`
  - `IDX_CLIENT_SECRET`
  - `TRESTLE_API_URL`
- `lib/idx/auth.ts` performs the runtime token flow:
  - base = `TRESTLE_API_URL || IDX_ENDPOINT || https://api.cotality.com/trestle`
  - `client_credentials`
  - scope `api`
  - token lifetime from provider-returned `expires_in`

Do not claim a quota, TTL, field, enum/string, permission, attribution rule, mapping, OData behavior, media relationship, or resource semantic from old docs unless it is re-proven from the live provider.

`data/cotality-enums.live.json`, `artifacts/metadata.xml`, registry markdown, and CSVs are repo evidence/mirrors only.

## Governance corrections on this branch

Updated:
- `AGENTS.md`
- `CLAUDE.md`
- `NEON.md`
- `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md`
- `docs/architecture/NEON-COST-CONTROL-POLICY.md`

Historical/superseded banners added to:
- `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`
- `docs/audits/zero-billing-neon-vercel-2026-06-12.md`
- `docs/superpowers/plans/2026-06-12-return-neon-to-free-tier-P2-MONEY.md`

New enforcement test:
- `tests/runtime/agent-authority-live-source.test.ts`

The test prevents the canonical agent docs from reintroducing:
- Desktop working-state paths;
- stale `2/5000` current claims;
- stale "Preview branches accumulate here" prose;
- the old `NEON_PROJECT_ID`-names-morning-bread current claim;
- the old definitive `round-recipe` connectivity claim.

It also proves the repository's Cotality access path actually exists.

## GitHub-only rule

From Maya's 2026-09-18 directive forward:
- do not use Maya's Desktop as repo working state;
- do not create worktrees/project copies/random folders on her Desktop;
- do not mirror repo memory files to Desktop;
- use GitHub branch/PR state for repository work;
- use provider connectors/official docs for provider facts.

Known local folders created in earlier sessions are not repo authority. Do not touch or delete them during Git-only work. If Maya wants a one-time filesystem cleanup, obtain a separate explicit local-cleanup authorization and perform only that cleanup.

## Remaining work after this documentation PR

1. Let GitHub CI validate the governance/test branch.
2. Review remaining search hits:
   - historical evidence may stay with a superseded banner;
   - active guidance must be corrected.
3. Packet 2A infrastructure:
   - create one durable schema-only Development root branch inside the existing Vercel-managed Neon project;
   - prove zero Production data copied;
   - register its endpoint as the only approved non-production identity;
   - repoint only Development bare Prisma URLs;
   - prove Production unchanged and generic Preview fail-closed.
4. Packet 2A.1:
   - verify compatibility then separately protect Production `main`.
5. Packet 2B:
   - complete variable-by-variable Vercel env manifest;
   - remove/re-scope only after reader/writer/owner proof;
   - use Vercel resource Allowed Environments for integration-owned `database_*` rather than hand-editing members.
6. Packet 3+ remain locked until Packet 2 closes.

## Hard stop

No Neon branch was created by this governance work.
No Vercel env variable was changed.
No schema/migration was applied.
No cron was triggered.
No Production deployment was triggered.
No Production data was written.
