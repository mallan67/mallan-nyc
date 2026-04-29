# Backend Audit — 2026-04-29

> **Captured at user request.** Audit only — no code changes were made while compiling this.
>
> **User directive at audit close:** *"It needs to repopulate safely first; the rest of the work is around it."* — meaning: the unpushed search-spine commits (`ac385564` + `d54b4395`) and any data backfill they imply must land safely before the remaining master-plan / legacy-JSON-drop / deeper-search-migration work sits on top. Treat the spine as the foundation; everything else orbits.

---

## Headline state

- **Master refactor plan: 3 of 10 PRs merged.** Not "10/10" as `memory/NEXT-SESSION-2026-04-28.md:9-11` claims. Only PRs 1, 2, and 10 shipped; PRs 3–9 are still `NOT_STARTED`.
- **Workstream C (UCBA 2026): 4 of 4 complete.** All sub-PRs merged.
- **Search-spine work: committed locally but not pushed.** Two commits ahead of `origin/main` (`ac385564 Build compliant search spine` + `d54b4395 Link anonymous sessions to leads`).
- **Working tree is dirty.** Seven modified files + one untracked directory, separate from the search-spine commits.
- **One open PR** (#62, SMS password reset, deferred pending brainstorm).
- **Compliance gates green** except `test:runtime` (1 of 12 suites fails on a local `jsdom` install issue — environment, not regression).

---

## What actually shipped to production

### Master plan (`memory/REFACTOR-2026-04-25.md`)

| PR # | Description | Status |
|---|---|---|
| 1 (#41) | Compliance fail-closed cleanup | MERGED |
| 2 (#48) | Media metadata schema (additive) | MERGED |
| 3 | media-sync-service (R2-backed) | NOT_STARTED — R2 still not user-provisioned |
| 4 | media-batch-rewrite | NOT_STARTED |
| 5 | listing-search-projection | NOT_STARTED |
| 6 | search-core-public | NOT_STARTED |
| 7 | search-core-agent-portal | NOT_STARTED |
| 8 | collections-search-sends | NOT_STARTED |
| 9 | lease-lifecycle | NOT_STARTED |
| 10 (#75 + #76) | Neon shedding — `raw_data` slim writer + backfill ONLY | MERGED. **Did NOT drop the 5 other JSON columns** the PR description named (`address`, `features`, `media`, `compliance`, `agent_info` — see `memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`). |
| 11 (#72) | crm-test-runner restore | MERGED |
| 13 (#44) + 13b (#45) | npm audit triage + xlsx→exceljs | MERGED |
| 12 | Prisma 7 upgrade | NOT_STARTED — gated on PR 10 stability + 1 week |

Plus ship-now PRs: SN-A (#42, comp tool) and SN-B (#43, R2 setup runbook) merged.

### Workstream C — UCBA 2026 compliance gaps (`memory/FOLLOWUP-2026-05-01.md`)

| Sub-PR | Description | Status |
|---|---|---|
| C1a (#47) + C1b (#55) | Inquiry model + 8 lead-capture endpoints wired | MERGED |
| C2 (#49) | Offer model + UCBA Art. II transmission endpoint | MERGED |
| C3a (#50) + C3b (#57) + C3c (#74) | Auction listings (schema + validator + form/UI) | MERGED |
| C4a (#51) + C4b (#58) + C4c (#73) | Ethics training (schema + auth gate + admin panel) | MERGED |

Pre-merge backfill executed for C4b: 3 active agents got 30-day grace; `would_lock_out=0` verified.

### Post-merge hardening that landed on main after the master plan close (PRs #71–#93)

- **Neon-Vercel preview branching fix** (#80, #81): `lib/neon/branches.ts` + cron + runbook. Manual sweep from 14+ stale branches → 1.
- **CI hardening** (#77, #78, #79): auto-retry runner-flake + Trestle audit graceful skip on missing secrets.
- **Compliance fail-closed escalation** (#87–#93):
  - #87 — 4 active REBNY RLS distribution-gate violations closed
  - #92 — 3 more `=== false` fail-open patterns fixed
  - #91 — CRM listings PUT now fail-closed on distribution-gate writes
  - #89 — `checkDistributionGates` refactored fail-closed; 12 routes inherit
  - #93 — portal/listings fail-closed on null permission flags
- **Dead-code removal** (#88): 669 LOC of dead `lib/idx` files deleted.
- **Doc cleanup** (#84, #85, #90): NEON.md drift fix + 4 stale specs archived.

---

## What's local-only (NOT pushed)

`git status` at audit time: *"Your branch is ahead of 'origin/main' by 2 commits."*

### Commit `ac385564` — "Build compliant search spine"

30 files, +1,354 / −350 lines. Per `memory/SEARCH-SPINE-HANDOFF-2026-04-29.md`, this implements **9 slices** of unified search infrastructure:

- **New `lib/search/` package**: `core.ts`, `criteria-to-prisma.ts`, `listing-access-decision.ts`, `search-run-recorder.ts` + Jest tests (171/171 passing).
- **Saved-search execute + search-alerts cron** migrated off route-local builders to `runListingSearch()`.
- **Portal surfaces** (listings, favorites, react, comments, offers, showings, comparables) consolidated onto `isListingDisplayable()` + `SEARCH_DISPLAY_GATE`.
- **`/api/listings` DB-first path** uses shared gate constants. Trestle live fallback path is NOT migrated.
- **`app/listing/[id]/page.tsx`** RLS-backed DB detail now fail-closed on null gates.
- **`lib/cma/engine.ts`, `lib/buyer-intent/recommender.ts`, `lib/market-pulse/snapshot.ts`, `lib/listing-momentum/scorer.ts`, `lib/social-proof/cache.ts`** — all migrated onto `SEARCH_DISPLAY_GATE` + `canDisplayListingAddress()`.
- **New analytics endpoints**: `app/api/analytics/behavioral/route.ts` + `app/api/analytics/intent/route.ts` (writers for previously-mounted client trackers).
- **`PortalEvent` writers wired** in `lib/portal/events.ts` + react/comments/offers/showings routes.
- **`scripts/ci-compliance-check.js`** — line-level fail-open regression guards added (80 → 85 checks).

### Commit `d54b4395` — "Link anonymous sessions to leads"

13 files, +299 / −39 lines. Slice 10:

- **New `lib/behavioral/session-link.ts`** + **new `app/api/identity/capture/route.ts`** (the missing endpoint `SoftIdentityCapture` was calling).
- Anonymous behavioral session links to identified `Lead` at sign-up, sign-in, contact, login, soft-identity capture.
- Compliance check 85 → 87.

### Working tree (uncommitted, unrelated to spine)

```
modified:   package-lock.json
modified:   package.json
modified:   scripts/fix-wrong-matches.js
modified:   scripts/rebuild-past-deals.js
modified:   scripts/test-full-mapping.js
modified:   scripts/validate-deals.js
modified:   scripts/validate-field-mapping.js
untracked:  scripts/lib/
```

These are separate from the search-spine commits. Origin unclear from this audit; likely scratch from an unrelated past session. Leave alone unless and until verified.

---

## What's documented as still NOT_STARTED

### Master plan (cohesive backend rebuild)

- **PR 3** — media-sync-service (R2-backed). Blocked on user-side R2 provisioning (`memory/REFACTOR-2026-04-25.md:220`).
- **PR 4** — media-batch-rewrite (depends on PR 3 in prod ≥48h).
- **PR 5** — `listing_search_projection` schema. **None of the 6 projection tables in the original brief exist yet.**
- **PR 6, 7** — search-core-public + search-core-agent-portal. Master plan reserves these for a "separate redesign chat." The local search-spine work covers some of this scope but not the public/Trestle paths.
- **PR 8** — collections + search sends.
- **PR 9** — lease lifecycle (extends `ActiveLease`).

### Legacy JSON column drops (`memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`)

Five JSON columns still on `Listing` (`address`, `features`, `media`, `compliance`, `agent_info`). Together they account for ~115 MB of the 195 MB listings table. Plan exists; ~20 PRs over 2–6 weeks. Not started.

### Search-spine remaining (per handoff doc § "Remaining Fragmentation")

- Public `/api/listings` live Trestle fallback path — not migrated.
- CRM `/api/idx/search` direct Trestle path — not migrated.
- Portal surfaces beyond the 6 already migrated — not migrated.
- Deeper market/reporting surfaces — not migrated.
- Social OAuth callbacks (Google/Facebook/LinkedIn) — no anonymous-session linking yet.
- Stale FastAPI stub at `backend/app/main.py` + stale `docker-compose.yml` frontend service — not removed.

### Open PR

- **#62 — `feat/sms-password-reset`** (Twilio). Open since 2026-04-26. Deferred per `memory/NEXT-SESSION-2026-04-28.md:74-88` pending a brainstorming pass on TCPA + reset model.

---

## Pending operator credential actions (agent-blocked)

Per `memory/NEXT-SESSION-2026-04-28.md:43-70` — neither blocks daily operation, both degrade gracefully:

1. **Vercel Production env**: `NEON_API_KEY` + `NEON_PROJECT_ID` (enables `/api/cron/neon-branch-prune` to actually prune; currently logs `{ skipped: true }` daily at 04:00 UTC).
2. **GitHub Actions secrets**: `IDX_CLIENT_ID` + `IDX_CLIENT_SECRET` (enables `Trestle live audit` cron at 13:30 UTC daily; currently logs graceful-skip warning).

---

## Compliance / gate state at audit time

Latest run reported in `memory/SEARCH-SPINE-HANDOFF-2026-04-29.md` (after slice 10):

- `npm run type-check` → 0 errors
- `npm run test:compliance` → 194/194
- `npm run compliance-check` → 87/87
- `npx jest --config lib/search/jest.config.js` → 171/171
- `npm run test:runtime` → **11/12** — failure is environment, not regression: `crm:test` cannot load `jsdom` from `node_modules`. `jsdom` is in `package.json` + `package-lock.json`; local install is incomplete. A clean `npm ci` would likely fix it.
- `npm run ucba:audit` → 46 PASS / 0 FAIL / 0 regressions (last run: session-close 2026-04-28).
- `npm run ops:health` → HEALTHY at ~43% of 500 MB Neon free cap.
- DB size ~216 MB / 500 MB cap; slim writer steady state ~0.5–1 MB/day; runway ~6 months to 80% line, ~9 months to 100%.

---

## One-paragraph summary

The codebase is operational and compliance-gated. Three of ten master refactor PRs shipped (the next-session note overstates that as 10/10). All four UCBA 2026 compliance workstreams shipped. Significant search-OS spine work — a `lib/search/` package, gate consolidation across 14+ surfaces, new analytics endpoints, and portal-event writer wiring — is committed in two local commits but **not pushed** to `origin/main`, so production is still running on `main` HEAD `38d4374d`. Seven master-plan PRs (3–9), five legacy JSON column drops, and the search-spine remainder (Trestle live paths, deeper portal/reporting surfaces, social OAuth session linking) are all still `NOT_STARTED`. Two operator-side credential actions remain (Vercel + GitHub Actions secrets). One PR is open (#62 SMS reset, deferred). User directive at audit close: repopulate safely first; the rest of the work is around it.

---

## 2026-04-29 02:31 ET Update

The 90-minute revisit window discussed in-session has passed. Local time verified at **2026-04-29 02:31:22 -04:00**.

Current local `main` is clean and **5 commits ahead of `origin/main`**:

- `ac385564 Build compliant search spine`
- `d54b4395 Link anonymous sessions to leads`
- `3599d293 Remove vulnerable xlsx dependency`
- `fd5131d1 docs(memory): capture 2026-04-29 backend audit`
- `44acc025 Add buyer financial intent tracking`

The earlier audit text above is preserved as the historical diagnosis. The key correction is that the search-spine and anonymous-session work are no longer uncommitted; they are committed locally. The newest buyer slice adds schema-light financial/tool intent capture for buyer calculators and exposes it to the assigned agent or broker.

Latest validated buyer slice:

- `app/api/crm/clients/[id]/financial-intent/route.ts`
- `lib/buyer-intent/financial-intent.ts`
- `app/components/CalculatorLeadCapture.tsx`
- `app/components/AffordabilityCalculator.tsx`
- `app/components/RentVsBuyCalculator.tsx`
- `app/components/MortgageModal.tsx`
- `lib/buyer-intent/__tests__/financial-intent.test.ts`

Validation after buyer slice:

- `npm run type-check` passed
- `npm run lint` passed
- `npx jest --config lib/buyer-intent/jest.config.js` passed: 2/2
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next active implementation target remains the original search-spine continuation: incrementally migrate the DB-first public `/api/listings` where-building into shared search helpers while leaving the live Trestle fallback untouched.

That next target was then completed locally in the follow-up slice:

- Added `lib/search/public-listing-db.ts`.
- Added `lib/search/__tests__/public-listing-db.test.ts`.
- Updated `app/api/listings/route.ts` so the DB-first public path delegates where/order construction to `buildPublicListingDbSearch(searchParams)`.
- Left the live Trestle fallback, media/geocoding, open-house filtering, DTO mapping, and exclusive merge behavior untouched.

Validation after the public DB-first search extraction:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 175/175
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87
- `npm run lint` passed

Follow-up CRM IDX extraction completed next:

- Added `lib/search/crm-idx-filter.ts`.
- Added `lib/search/__tests__/crm-idx-filter.test.ts`.
- Updated `app/api/idx/search/route.ts` to call `buildCrmIdxODataFilter(params)`.
- Kept auth, Trestle fetch, distribution gates, media handling, CRM mapping, cache, and response shape unchanged.

Validation after the CRM IDX filter extraction:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 181/181
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Follow-up CRM IDX mapper extraction completed next:

- Added `lib/search/crm-idx-mapper.ts`.
- Added `lib/search/__tests__/crm-idx-mapper.test.ts`.
- Updated `app/api/idx/search/route.ts` to call `mapTrestleToCrmListing(record, index)`.
- Kept auth, Trestle fetch, distribution gates, cache, media backfill, and response shape unchanged.
- Preserved fail-closed address suppression, media proxying, status normalization, rental monthly totals, DPA fields, and CRM flat-field pass-through behavior.

Validation after the CRM IDX mapper extraction:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 186/186
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Follow-up buyer CRM visibility slice completed next:

- Updated `public/crm/js/dashboard/workspace.js`.
- Added Buyer Tool Signals to the CRM client Financial tab.
- The workspace now reads `/api/crm/clients/[id]/financial-intent` and displays buyer calculator/tool behavior to the assigned agent or broker.
- Signals shown include tools used, event count, highest budget tested, latest/highest monthly payment, cash needed, closing costs, stated budget/pre-approval context, stretch amount/percent, intent stage/strength, and recent tool activity.
- Existing saved scenarios and calculator flows remain unchanged.

Validation after the buyer CRM visibility slice:

- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Follow-up buyer external-listing intake slice completed next:

- Added `ExternalListing` to `prisma/schema.prisma`.
- Added migration `prisma/migrations/20260429030000_add_external_listings/migration.sql`.
- Added `lib/external-listings/normalize.ts` and focused tests.
- Added buyer portal API `app/api/portal/external-listings/route.ts`.
- Added CRM read API `app/api/crm/clients/[id]/external-listings/route.ts`.
- Updated `app/portal/buyer/page.tsx` so the existing listing-link/address form creates durable external-listing records and renders them separately as Outside Listings.
- Outside listings are explicitly separate from IDX/MLS `Listing` records.

Validation after the buyer external-listing slice:

- `npx prisma generate` passed
- `npm run type-check` passed
- `npm run lint` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Follow-up broker/agent external-listing completion completed next:

- Updated `app/api/crm/clients/[id]/external-listings/route.ts` with `POST`.
- Agents can add outside listings for assigned clients; brokers can add them for any client.
- Agent-created outside listings use the same URL normalization and validation as buyer portal submissions.
- Updated `public/crm/js/dashboard/workspace.js` with an Outside Listings card in the client Listings tab.
- The card lets agents/brokers add URL/address/notes/bucket and view existing outside listings labeled as not IDX inventory.

Validation after the broker/agent external-listing slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Save checkpoint after the sixteenth slice:

- Local implementation is committed through `ca9d0287 Let agents add external listings`.
- Search spine, public listing search extraction, CRM IDX extraction, buyer financial-intent tracking, CRM buyer tool signals, buyer external-listing intake, and broker/agent external-listing intake are all recorded.
- Repo memory and Desktop memory copies are synchronized.
- The remaining critical deployment step is applying migration `20260429030000_add_external_listings` to the target database before production code depends on the table.

Next implementation steps left:

1. External-listing bucket update API/UI for buyer portal and CRM.
2. CRM rollup of external-listing buckets beside IDX reactions.
3. External-listing comments/request-info threads.
4. External-listing showing/request workflow.
5. Buyer family/friend visibility rules for outside listings.
6. Broker/agent dashboard rollups across assigned buyer clients.
7. Seller portal signal capture for valuation, proceeds, closing costs, and readiness.
8. Seller CRM visibility panels.
9. Independent tenant, landlord, seller, and buyer portal hardening.
10. Manual production migration deploy and verification per `NEON.md`.

Follow-up external-listing bucket update slice completed next:

- Added buyer portal PATCH route `app/api/portal/external-listings/[id]/route.ts`.
- Added CRM PATCH route `app/api/crm/clients/[id]/external-listings/[externalId]/route.ts`.
- Added shared bucket validation via `normalizeExternalListingBucket()`.
- Updated `app/portal/buyer/page.tsx` with outside-listing bucket controls.
- Updated `public/crm/js/dashboard/workspace.js` with CRM outside-listing bucket controls.
- Buyer portal updates are scoped to the owning lead.
- Agent updates are scoped to assigned clients; brokers can update all clients.

Validation after the external-listing bucket slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Follow-up external-listing comments/request-info slice completed next:

- Added `ExternalListingComment` to `prisma/schema.prisma`.
- Added migration `prisma/migrations/20260429033000_add_external_listing_comments/migration.sql`.
- Added buyer portal comments API `app/api/portal/external-listings/[id]/comments/route.ts`.
- Added CRM comments API `app/api/crm/clients/[id]/external-listings/[externalId]/comments/route.ts`.
- Updated `lib/external-listings/normalize.ts` with comment/request-type normalization and serialization.
- Updated `app/portal/buyer/page.tsx` so buyers can add notes or request info on Outside Listings.
- Updated `public/crm/js/dashboard/workspace.js` so agents/brokers can view and reply to external-listing notes from the client Listings tab.
- External-listing comments remain separate from IDX `Comment` records.

Validation after the external-listing comments slice:

- `npx prisma generate` passed
- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run lint` passed
- `npm run crm:test` passed: 39/39
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87
- `npm run ops:health` passed: healthy, storage 44.8%, no sync errors

Deployment note:

- Production must apply both external-listing migrations before this workflow is deployed:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`

Follow-up external-listing tour/request workflow completed next:

- Updated `app/portal/buyer/page.tsx` with a `Request Tour` button on each Outside Listing.
- Reused the existing external-listing comment/request-info endpoint with `request_type = "showing_request"`.
- Buyers can submit a tour/investigation request without requiring an IDX `Listing` row.
- Updated buyer portal and CRM thread displays with `Tour` and `Info` badges.
- No additional migration was needed for this slice.

Validation after the external-listing tour/request slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Follow-up buyer family/friend visibility slice completed next:

- Added `family_visible` to `ExternalListing`.
- Added migration `prisma/migrations/20260429040000_add_external_listing_family_visibility/migration.sql`.
- Added `lib/external-listings/access.ts` for fail-closed portal access checks.
- Buyer-owned outside listings remain private by default.
- Buyer portal now lets the buyer share an outside listing with invited family/friends.
- Invited family/friends can only see outside listings where `family_visible = true`.
- Invited family/friends can comment, request info, and request a tour on shared outside listings.
- Family members cannot update the buyer's outside-listing bucket or sharing setting.
- CRM Outside Listings now show whether each outside listing is private or family-visible.
- CRM external-listing threads now identify commenters as buyer, family, agent, or broker.

Validation after the buyer family/friend visibility slice:

- `npx prisma generate` passed
- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 6/6
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87
- `npm run ops:health` passed: healthy, storage 44.8%, no sync errors

Deployment note:

- Production must apply all three external-listing migrations before this workflow is deployed:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`
  - `20260429040000_add_external_listing_family_visibility`

Follow-up CRM outside-listing rollup slice completed next:

- Added `lib/external-listings/rollup.ts`.
- Added `lib/external-listings/__tests__/rollup.test.ts`.
- `GET /api/crm/clients/[id]/external-listings` now returns `activity_summary`.
- CRM client Outside Listings now shows totals, needs-response count, tours requested, info requests, family discussion active, and a daily-priority queue.
- CRM client Outside Listings now has quick filters for all, needs response, liked, seen, discuss, pass, info, and tours.
- Existing outside-listing cards still show bucket controls, privacy/family-visible status, notes, and request badges.
- No new migration was added for this slice.

Validation after the CRM outside-listing rollup slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 7/7
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Final save checkpoint before membership/session switch:

- Saved at local time: **2026-04-29 04:12:34 -04:00**.
- Working tree was clean before this checkpoint section was added.
- Local `main` is ahead of `origin/main` by 15 commits.
- Latest implementation commit before this checkpoint: `0ef50dbc Add external listing tour requests`.
- Commits have not been pushed.
- Memory is stored in-repo and mirrored to `C:\Users\MayaAllan\Desktop\memory`.

Resume context for the next Codex session:

- Continue from local repo `C:\Users\MayaAllan\Desktop\mallan-nyc`.
- Read `memory/SEARCH-SPINE-HANDOFF-2026-04-29.md` first.
- Do not push/deploy until the target database has all three external-listing migrations applied:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`
  - `20260429040000_add_external_listing_family_visibility`
- The next implementation slice should start seller portal signal capture and seller CRM visibility.

User push gate:

- User instruction: **make sure everything is completed before pushing anything. Read through and do not miss any lines.**
- Do not push `main` or deploy this work until all selected local slices are finished and validated.
- All three external-listing migrations must be manually applied to the target database and verified before deployment:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`
  - `20260429040000_add_external_listing_family_visibility`
- Full validation must be rerun after the final local slice:
  - `npm run type-check`
  - `node --check public/crm/js/dashboard/workspace.js`
  - `npm run crm:test`
  - `npm run lint`
  - `npm run test:compliance`
  - `npm run compliance-check`
- `git status --short --branch` should be clean except for the expected ahead-of-origin count.
- The user must explicitly confirm it is time to push.

Seller portal signal capture slice completed after the CRM rollup slice:

- Added `lib/seller-signals/summary.ts`.
- Added `lib/seller-signals/__tests__/summary.test.ts`.
- Added `lib/seller-signals/jest.config.js`.
- Added `POST /api/portal/seller/signals`.
- Added `GET /api/crm/clients/[id]/seller-signals`.
- Seller portal now captures valuation, desired sale price, mortgage payoff, prep budget, closing costs, timeline, urgency, readiness, and notes.
- Seller portal saves those inputs as existing `PortalEvent` records in the seller workspace.
- Seller signal events are:
  - `seller_valuation_request`
  - `seller_proceeds_estimate`
  - `seller_closing_cost_estimate`
  - `seller_readiness_update`
- CRM seller clients now show a Seller Portal Signals panel with valuation, desired price, estimated net proceeds, closing costs, readiness, urgency, property context, attorney context, last signal, and recent seller activity.
- CRM access is scoped so brokers can read all seller leads and agents can read assigned seller leads only.
- No new database migration was added for this slice.

Validation after the seller portal signal capture slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/seller-signals/jest.config.js` passed: 2/2
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next recommended slice:

- Continue tenant/landlord workflow signals: saved rentals, outside rental links, lease-end and rent-vs-buy conversion signals, showing/document readiness, vacancy cost calculator, tenant renewal/re-listing signals, and owner document/showing workflow.
- Then implement broker lead distribution.
- Then implement per-agent system separation.
- Do not push/deploy until the required external-listing migrations are manually applied and verified and the user explicitly confirms pushing.

Tenant/landlord workflow signal slice completed after seller signal capture:

- Added `lib/rental-signals/summary.ts`.
- Added `lib/rental-signals/__tests__/summary.test.ts`.
- Added `lib/rental-signals/jest.config.js`.
- Added `POST /api/portal/tenant/signals`.
- Added `POST /api/portal/landlord/signals`.
- Added `GET /api/crm/clients/[id]/rental-signals`.
- Tenant portal Lease tab now captures outside rental links/addresses, rent-vs-buy context, lease intent, move timing, document readiness, and notes.
- Landlord portal Dashboard now captures expected vacancy days, carrying cost, estimated vacancy cost, relist timing, tenant renewal intent, document readiness, showing readiness, vacant-now flag, and owner notes.
- CRM Financial tab now shows Rental Portal Signals for tenant/renter and landlord clients.
- CRM access is scoped so brokers can read all rental workflow signals and agents can read assigned rental leads only.
- No new database migration was added for this slice.

Validation after the tenant/landlord workflow signal slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/rental-signals/jest.config.js` passed: 4/4
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next recommended slice:

- Broker lead distribution: self-registered buyers/sellers/tenants/landlords enter a broker queue, broker assigns an agent, and the assigned agent inherits portal activity, calculators, outside listings, rental signals, seller signals, notes, and lead history.
- Then implement per-agent system separation.
- Do not push/deploy until selected local work is complete, full validation passes, required migrations are manually applied/verified, and the user explicitly confirms pushing.

Broker lead distribution inheritance slice completed after tenant/landlord workflow signals:

- Added `lib/lead-distribution/assign.ts` as the shared assignment path.
- Updated `PATCH /api/crm/leads/[id]` to use the shared assignment path for broker queue assignment.
- Updated `PATCH /api/crm/clients/[id]` to use the shared assignment path for broker reassignment from the client address book.
- Updated lead scoring auto-assignment to use the same assignment path.
- Assignment now hands off unassigned related records to the assigned agent where applicable:
  - `ExternalListing`
  - `SavedSearch`
  - `ActiveLease`
- Assignment writes an activity log with previous agent, assigned agent, inherited counts, and optional broker note metadata.
- Assignment sends the assigned agent an in-app notification that points them to the lead portal history.
- `GET /api/crm/unassigned-leads` now returns inheritance preview counts for portal events, outside listings, saved searches, listing actions, and CRM activity logs.
- Broker home dashboard and broker lead distribution panel show the inherited activity preview before assignment.
- No new database migration was added for this slice.

Validation after the broker lead distribution inheritance slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/app.js` passed
- `node --check public/crm/js/dashboard/panels/home/home-screen.js` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next recommended slice:

- Per-agent system separation: audit and harden CRM routes/panels so each agent sees only their clients, searches, CRM, marketing, reports, pipeline, and activity, while broker keeps full oversight and reassignment.
- Then complete final integration/deploy prep.
- Do not push/deploy until selected local work is complete, full validation passes, required external-listing migrations are manually applied/verified, and the user explicitly confirms pushing.

Per-agent CRM access separation slice completed after broker lead distribution inheritance:

- Added `lib/crm/access.ts` for shared broker-vs-agent lead access checks.
- Agents now get consistent access checks before reading or writing client-scoped data through direct IDs.
- Hardened routes include:
  - `app/api/crm/clients/[id]/family/route.ts`
  - `app/api/crm/clients/[id]/parties/route.ts`
  - `app/api/crm/activity/route.ts`
  - `app/api/crm/events/route.ts`
  - `app/api/crm/conviction/[leadId]/route.ts`
  - `app/api/crm/financial-scenarios/route.ts`
  - `app/api/crm/inquiries/route.ts`
  - `app/api/crm/listing-engagement/route.ts`
  - `app/api/crm/listing-sends/route.ts`
  - `app/api/crm/listing-views/route.ts`
  - `app/api/crm/communications/route.ts`
  - `app/api/crm/email/route.ts`
  - `app/api/crm/saved-searches/route.ts`
  - `app/api/crm/saved-searches/[id]/route.ts`
  - `app/api/crm/showing-history/route.ts`
  - `app/api/crm/rentals/applications/route.ts`
  - `app/api/crm/rentals/leases/route.ts`
  - `app/api/crm/active-leases/route.ts`
  - `app/api/crm/active-leases/[id]/route.ts`
  - `app/api/crm/automation/adjust-tier/route.ts`
  - `app/api/crm/sales/promote/route.ts`
  - `app/api/crm/convert/route.ts`
  - `app/api/crm/tasks/route.ts`
- Closed direct-ID gaps for `lead_id`, `client_id`, `member_lead_id`, `tenant_lead_id`, `client_ids[]`, and conversion `agentId`.
- Non-broker inquiry feeds are now scoped to the agent's assigned leads or own listings.
- No new database migration was added for this slice.

Validation after the per-agent CRM access separation slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next recommended slice:

- Final integration/deploy prep: final route/data-boundary smoke review, clean status check, required external-listing migrations manually applied/verified, full validation rerun, and push/deploy only after the user explicitly confirms pushing.

Final integration / deploy preflight checkpoint saved at local time **2026-04-29 05:20:20 -04:00**:

- Local `main` remains unpushed and ahead of `origin/main`.
- No push or deploy was performed.
- Final-preflight cleanup completed:
  - IDX validator now recognizes `requirePortalRole` as route authentication.
  - IDX validator treats `/api/identity/capture` as an intentionally public, rate-limited lead-capture route.
  - `/api/idx/search` now explicitly documents that `checkboxFilters` are parsed by `buildCrmIdxODataFilter(params)` and OData-safe fields only are forwarded.
  - IDX validator result/history artifacts were refreshed.
- Final validation:
  - `npm run ops:health` passed / healthy. DB size was 224.26 MB of 500 MB cap, last sync was recent with 12 upserted and 0 errors, REBNY Section 2.05 violations were 0, and upgrade needed was no.
  - `npx prisma validate` passed with only the existing `driverAdapters` preview deprecation warning.
  - `npm run ucba:audit` passed: 46/46.
  - `npm run idx:validate` passed with WARN result and 0 critical. Terminal summary: 852 pass, 0 critical, 5 warnings, 29 info, 0 unverified. Persisted artifact: 851 pass, 0 critical, 5 warnings, 28 info.
  - `npm run type-check` passed.
  - `node --check public/crm/js/dashboard/workspace.js` passed.
  - `npm run crm:test` passed: 39/39.
  - `npm run lint` passed.
  - `npm run test:compliance` passed: 194/194.
  - `npm run compliance-check` passed: 87/87.
  - `npm run rls:validate` passed with 0 errors and 1 existing warning for rental `MlsStatus` missing `ComingSoon`.
- Remaining deploy gate:
  - Do not push/deploy until the external-listing migrations are manually applied and verified against the target DB.
  - Queued migrations:
    - `20260429030000_add_external_listings`
    - `20260429033000_add_external_listing_comments`
    - `20260429040000_add_external_listing_family_visibility`
  - Per `NEON.md`, run health, manually deploy migrations against the selected target DB, verify migration status, rerun validation, then push/deploy only after the user explicitly confirms.

External listing migrations applied / push-ready gate saved at local time **2026-04-29 05:26:30 -04:00**:

- Re-read `NEON.md` before database work.
- Confirmed `.env.local` has a Neon `DATABASE_URL` for database `neondb`; credentials were not printed.
- Pre-migration `npm run ops:health` passed / healthy. DB size was 224.26 MB of 500 MB cap, REBNY Section 2.05 violations were 0, and upgrade needed was no.
- `prisma migrate status` against the configured Neon DB showed exactly three pending migrations:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`
  - `20260429040000_add_external_listing_family_visibility`
- Re-read all three migration SQL files.
- Ran `prisma migrate deploy` against the configured Neon DB.
- All three external-listing migrations applied successfully.
- Post-migration `prisma migrate status` reported: database schema is up to date.
- Post-migration `npm run ops:health` passed / healthy. DB size was 224.44 MB of 500 MB cap, REBNY Section 2.05 violations were 0, and upgrade needed was no.
- Post-migration validation:
  - `npx prisma validate` passed with only the existing `driverAdapters` preview deprecation warning.
  - `npm run type-check` passed.
  - `node --check public/crm/js/dashboard/workspace.js` passed.
  - `npm run crm:test` passed: 39/39.
  - `npm run lint` passed.
  - `npm run test:compliance` passed: 194/194.
  - `npm run compliance-check` passed: 87/87.
  - `npm run idx:validate` passed with WARN result and 0 critical. Terminal summary: 852 pass, 0 critical, 5 warnings, 29 info, 0 unverified.
  - `npm run ucba:audit` passed: 46/46.
  - `npm run rls:validate` passed with 0 errors and 1 existing warning for rental `MlsStatus` missing `ComingSoon`.
- The DB migration gate that previously blocked push/deploy is now complete.
- No push has been performed yet. Next action is user-confirmed push/deploy only.

*Audit captured 2026-04-29 by Claude Opus 4.7 (1M context). Updated in-repo by Codex after local implementation checkpoints.*
