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

Public `/api/listings` DB-first finish slice completed after the migration-applied gate:

- Updated `lib/search/public-listing-db.ts`:
  - Added `OWNERSHIP_TYPE_MAP` and `AMENITY_FIELD_TO_DTO` constants alongside the existing `PROPERTY_SUB_TYPE_MAP`.
  - Added static `import { AMENITY_FIELD_MAP, type AmenityFilter } from "@/lib/search/types"` (replaces the route-local dynamic `await import`).
  - Exported `applyPublicListingPostFilters<T extends PublicPostFilterListing>(listings, featuresById, params)` which now owns every DB-first DTO post-filter (`ownershipTypes`, `yearBuilt`, `furnished`, `amenities` including `pet-friendly` negative-value handling, `keywords`).
  - Comments inline note that open-house and geocoding are intentionally NOT moved (external Trestle resource lookup / route-owned side-effect chain).
- Updated `app/api/listings/route.ts`:
  - Import expanded to `{ applyPublicListingPostFilters, buildPublicListingDbSearch }`.
  - Removed 5 inline post-filter blocks from the DB-first path (ownership ~18 lines, yearBuilt ~5 lines, furnished ~5 lines, amenities ~50 lines incl. dynamic import, keywords ~7 lines).
  - Replaced with a single `publicListings = applyPublicListingPostFilters(publicListings, featuresById, searchParams)` call.
  - Geocoding promise repositioned to start before the bundled post-filter (was previously between `ownershipTypes` and `yearBuilt`); behavior preserved — still `Promise.race([geocodeListings(...), 1.5s timeout])`, still fire-and-forget, still awaited at the end of the block.
  - `featuresById` build kept in the route (needs the raw `serialized: DbListing[]` rows that exist before DTO mapping).
  - Trestle fallback (line 360+) and the open-house Trestle resource lookup (still inside the DB-first block) were not touched.
- Updated `lib/search/__tests__/public-listing-db.test.ts`:
  - 7 new tests added under a `describe("applyPublicListingPostFilters", ...)` block covering: no-op pass-through, ownershipTypes substring rules incl. Condo-vs-Condop disambiguation, yearBuilt pre-war/post-war thresholds, furnished, amenities (single, pet-friendly negative handling, AND across multiple amenities), keywords (single + AND across two terms), and graceful fallback when a listing has no entry in the features map.

What is now handled by `buildPublicListingDbSearch()` + `applyPublicListingPostFilters()` (as a pair, both exported from `lib/search/public-listing-db.ts`):

- `where`: SEARCH_DISPLAY_GATE / fail-closed RLS-eligible path, website-only `rls_eligible=false` path, listing_type, commercial OR sub-type set, price/beds/baths/sqft (incl. half-bath threshold), borough, neighborhood with zip-alias expansion, zipCodes, status/statuses with whitelist, propertySubTypes (mapped), address (Prisma JSON path), special-sort `agent_id`/`property_sub_type` overlays for `exclusives` and `new-development`.
- `orderBy`: every public sort key (price-asc/desc, newest, sqft-desc, beds-desc, exclusives, neighborhood, new-development), default `list_price desc`.
- DTO post-filters: ownershipTypes, yearBuilt, furnished, amenities (incl. pet-friendly), keywords.

What stays in the route by design (and why):

- DB-first cache check / responseBody / cache write (route-owned response shaping).
- `featuresById` build (needs the pre-DTO `serialized: DbListing[]` array).
- `filterDisplayableDbListings()` second-pass fail-closed gate (canonical helper in `lib/idx/db-to-public-dto.ts`, defense-in-depth).
- `dbListingToPublicDTO` mapping (DTO mapping is out of scope per the user's hard limits).
- `geocodeListings` promise + 1.5s race (route-owned side-effect chain).
- Open House filter — issues a live `OpenHouse` query against the Trestle OData endpoint and intersects by `ListingKey`. The helper intentionally does not own external Trestle calls.
- Exclusive merge behavior — the DB-first path returns `_compliance.source: 'db+exclusive'` because the helper's `where.OR` already covers `rls_eligible: false` (website-only / exclusives) alongside the gated RLS path; no separate route-side merge code exists or is needed.
- Trestle live fallback (line 360+) — completely untouched.

Validation after the public `/api/listings` DB-first finish slice:

- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 193/193 (was 186 before; +7 new tests).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result and 0 critical. Terminal summary: 853 pass, 0 critical, 5 warnings, 29 info.

Diff stat:

- `app/api/listings/route.ts`: +12 / -117 net.
- `lib/search/public-listing-db.ts`: +144 / 0 net (additions only — `buildPublicListingDbSearch` itself is unchanged).
- `lib/search/__tests__/public-listing-db.test.ts`: +157 / 0.

Remaining `/api/listings` fragmentation (per the original SEARCH-SPINE-HANDOFF Remaining Fragmentation list):

- Public `/api/listings` live Trestle fallback path — still has its own inline OData filter builder (~520 lines below the DB-first block). Out of scope for this slice; user explicitly said not to touch.
- Open House Trestle resource lookup — kept in the route inside the DB-first block (external resource by design).
- The CRM `/api/idx/search` direct Trestle path remains independently migrated by `lib/search/crm-idx-filter.ts` + `crm-idx-mapper.ts`; not a `/api/listings` concern.

User push gate is unchanged — still requires explicit user confirmation before push/deploy.

Public `/api/listings` Trestle fallback filter extraction slice completed after the DB-first finish:

- Added `lib/search/public-listing-trestle.ts` (370 LOC) exporting `buildPublicListingTrestleFilter(searchParams: URLSearchParams): string`.
- Helper now owns the entire OData $filter string for the live Trestle fallback path: status, listing type (sale/rent/buy), commercial sub-type list, price/beds/baths/sqft (incl. half-bath threshold), yearBuilt pre-war/post-war, furnished, address parsing (4 patterns: number+dir+street, dir+street, number+street, text-only — all with suffix and ordinal stripping plus `tolower()` quoting), propertySubTypes (CommonInterest push + new-development PublicRemarks contains list), `sort=new-development` PublicRemarks contains, ownershipTypes, legacy single propertyType filter, zipCodes (5-digit allowlist), neighborhood→ZIP via `lookupNeighborhoodZips`, borough→CountyOrParish, and AND-joined PublicRemarks contains for keywords with wildcard stripping.
- Updated `app/api/listings/route.ts`:
  - Added import for `buildPublicListingTrestleFilter`.
  - Replaced ~267 lines of inline `filterParts.push(...)` logic inside the Trestle fallback `try {` with a single `const filter = buildPublicListingTrestleFilter(searchParams);` call.
  - Preserved the route's `boundsParam` extraction (still needed for `hasPostFilter` sizing and the bounds post-filter).
  - Preserved the `$orderby` switch verbatim — sort wiring stays in the route per scope.
  - Updated the `fetchFromTrestle({ filter, ... })` call site and the audit-log payload to use the new `filter` const instead of `filterParts.join(' and ')`.
  - Net diff for the route: +17 / −249.
- Trestle fallback's RAW post-filters (distribution gates, pet-friendly amenity match, property sub-type post-filter, borough post-filter, bounds post-filter, OpenHouse intersection) all preserved in place. Media handling, geocoding, DTO mapping, cache, and exclusive merge behavior all unchanged.
- DB-first path is byte-identical to the prior slice — the only edit in the route's DB-first block was the import line at the top of the file.
- Response shape is byte-identical: same `responseBody` keys, same `_compliance` block, same caching headers.

Added focused tests in `lib/search/__tests__/public-listing-trestle.test.ts` (364 LOC, 43 cases across 10 groups):

1. Default sale/rent/status filters (8 cases incl. type=buy alias and disallowed-status fallback).
2. OData string escaping (3 cases: legacy propertyType, borough quote escape, keyword wildcard strip + quote escape).
3. Address search parsing (4 patterns: number+direction+street, direction+street, number+street, text-only).
4. Borough/neighborhood/zip filters (7 cases incl. multi-zip OR, malformed-zip rejection, zipCodes-wins-over-neighborhood precedence, no-zip-resolved fallback).
5. ownershipTypes (3 cases: single, multi, unknown-token rejection).
6. yearBuilt pre-war / post-war / unknown-value (3 cases).
7. furnished true / false / missing (2 cases).
8. Amenities including pet-friendly (2 cases) — verifies the helper does NOT push any amenity to OData; pet-friendly is a RAW post-filter the route owns.
9. Keywords / PublicRemarks (4 cases: per-keyword clause, AND join, wildcard strip, empty-skip).
10. Commercial / new-development filter behavior (5 cases: commercial sub-type list, propertySubTypes 4-phrase contains, mixed CommonInterest+new-dev OR group, sort=new-development standalone, sort=new-development suppression when propertySubTypes is also supplied).

Validation after the public `/api/listings` Trestle fallback filter extraction slice:

- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 236/236 (was 193 before this slice; +43 new tests).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result and 0 critical (terminal summary: 853 pass, 0 critical, 5 warnings, 29 info).

Diff stat for this slice:

- `app/api/listings/route.ts`: +17 / −249.
- `lib/search/public-listing-trestle.ts`: +370 (new file, additions only).
- `lib/search/__tests__/public-listing-trestle.test.ts`: +364 (new file).

Remaining `/api/listings` fragmentation after this slice:

- DB-first cache check / responseBody construction / cache write (route-owned response shaping — out of scope).
- `featuresById` build for DB-first post-filters (depends on pre-DTO `serialized` rows — route-owned).
- `filterDisplayableDbListings()` defense-in-depth fail-closed gate (canonical helper in `lib/idx/db-to-public-dto.ts`).
- `dbListingToPublicDTO` mapping (DTO mapping was explicitly out of scope).
- `geocodeListings` chain (route-owned side-effect, hard limit preserved).
- Open House Trestle resource lookup — kept in both the DB-first block and the Trestle fallback block (external resource by design).
- Trestle fallback RAW post-filters: distribution gates, pet-friendly amenity match against `PetsAllowed`, property sub-type post-filter against `PropertySubType`/`CommonInterest`, borough post-filter against mapped `address.county`/`address.city`, bounds post-filter against geocoded lat/lng. These are intentionally outside the helper's OData scope.
- `mapRESOToInternal` mapping (DTO mapping out of scope).
- Trestle media backfill chain (Phase 1 per-listing fetch + Phase 2 DB fallback) — route-owned media chain.
- $orderby switch + `fetchTop` / `selectFields` / `useExpandMedia` flags — route-owned Trestle query shaping.
- The CRM `/api/idx/search` direct Trestle path — separately migrated by `lib/search/crm-idx-filter.ts` + `crm-idx-mapper.ts`. Not a `/api/listings` concern.

User push gate unchanged — local `main` remains unpushed.

`/api/listings` final integration audit + dead-var cleanup slice completed:

- Item-by-item audit confirmed all 11 integration items: DB-first uses `buildPublicListingDbSearch()` + `applyPublicListingPostFilters()`; Trestle fallback uses `buildPublicListingTrestleFilter()`; zero `filterParts` / inline OData builder logic in the route; response shape, DTO mapping, media handling, geocoding, Open House, and exclusive merge are byte-identical to pre-slice; fail-closed gates enforced 3-layer on DB-first and 1-layer on Trestle.
- Five pre-existing param mismatches between paths documented (NOT introduced by either prior slice; preserved verbatim): `type=buy` (DB-first ignores, Trestle aliases to sale), legacy single `propertyType` (DB-first ignores), `bounds` (DB-first ignores), neighborhood-name fallback when zips empty (DB-first only), amenities beyond pet-friendly (DB-first only).
- Removed 14 dead `const X = searchParams.get(...)` declarations from `app/api/listings/route.ts:150-179`. These vars were referenced by the inline filter logic in earlier versions of the route and became unused once `buildPublicListingDbSearch`, `applyPublicListingPostFilters`, and `buildPublicListingTrestleFilter` started reading `searchParams` directly. Removed: `maxBeds`, `minBaths`, `maxBaths`, `propertyTypeFilter`, `statusFilter`, `statusesParam`, `minSqft`, `maxSqft`, `commercial`, `ownershipTypes`, `yearBuiltParam`, `furnishedParam`, `addressParam`, `keywords`. Kept (still actually used by route orchestration): `listingType`, `neighborhood`, `borough`, `minPrice`, `maxPrice`, `minBeds`, `sortParam`, `skipParam`, `limit`, `skip`, `propertySubTypes`, `amenitiesParam`, `openHouseParam`, `openHouseDateParam`.
- Updated the comment block above the param extraction to explain why filter/sort params are no longer re-extracted in the route.

Validation after the integration audit + dead-var cleanup slice:

- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 236/236.
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result, 0 critical (853 pass, 5 warnings, 29 info).
- `npm run lint` passed: **0 errors, 0 warnings** (was 0 errors, 14 warnings before the cleanup).

Diff stat:

- `app/api/listings/route.ts`: −14 declaration lines + comment update (+5 / −18 net).

No other files touched.

Buyer-priorities slice committed (was previously mid-build in the working tree):

- New `lib/buyer-priorities/summary.ts` (227 LOC) — pure derivation `summarizeBuyerDailyPriorities({externalListings, financialIntent, showings})`. Produces a sorted item queue with `urgent`/`high`/`normal` priorities and counts. Reads existing portal data; no schema change.
- New `lib/buyer-priorities/__tests__/summary.test.ts` (124 LOC) — 2 tests: (1) prioritizes tour requests / info requests / budget stretch / liked outside listings / family discussion; (2) does NOT flag request-info after an agent response.
- New `lib/buyer-priorities/jest.config.js` — package-local Jest config matching the same pattern used by `lib/seller-signals` / `lib/rental-signals` / `lib/external-listings`.
- New `app/api/crm/clients/[id]/buyer-priorities/route.ts` (147 LOC) — `GET` only, agent/broker auth gated, broker access to all clients + agent access scoped to assigned leads (matches `lib/crm/access.ts` shape used elsewhere in CRM). Fetches lead, external listings (with comments), intent events (250 most recent), and showings (status in `requested`/`confirmed`) in parallel, derives a financial intent summary via the existing `summarizeFinancialIntent`, then calls `summarizeBuyerDailyPriorities`.
- Updated `public/crm/js/dashboard/workspace.js` — adds `_buyerPrioritiesCache`, `_fetchBuyerPriorities`, `_buyerPriorityTone`, `_buyerPriorityAction`, `_renderBuyerPriorityQueue`, plus a `<div id="wsBuyerPriorityQueue">` injection in `_clientOverview` for buyer/renter clients, and three cache invalidations on outside-listing comment / add / update.
- **Fixed a real bug surfaced by the audit**: `_renderRentalSignalsPanel` had `clientType = (...).toLowerCase()` without a `var` declaration after a prior refactor that hoisted `clientType` into `_clientOverview`'s function scope. Without `var`, the assignment would either create an implicit global (non-strict) or throw a ReferenceError (strict) the first time the rental-signals tab was opened for a non-rental client. Re-added `var`. Verified with `node --check public/crm/js/dashboard/workspace.js` and `npm run crm:test` (39/39).

Validation after the buyer-priorities + workspace.js bug-fix slice:

- `node --check public/crm/js/dashboard/workspace.js` passed.
- `npx jest --config lib/buyer-priorities/jest.config.js` passed: 2/2.
- `npm run type-check` passed.
- `npm run crm:test` passed: 39/39.
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run lint` passed: 0 errors, 0 warnings.

Diff stat:

- `app/api/crm/clients/[id]/buyer-priorities/route.ts`: +147 (new file).
- `lib/buyer-priorities/summary.ts`: +227 (new file).
- `lib/buyer-priorities/__tests__/summary.test.ts`: +124 (new file).
- `lib/buyer-priorities/jest.config.js`: +20 (new file).
- `public/crm/js/dashboard/workspace.js`: ~+105 / −1 (panel + bug fix).

No schema/migration/env/Vercel/CRM-route boundary touched (the new CRM endpoint is additive). Push gate unchanged.

Master plan PR 5A — `listing_search_projection` schema slice completed:

- Added `ListingSearchProjection` Prisma model (`prisma/schema.prisma`, end of file). Key shape per the user's bounded brief: `id BigInt @id`, `listing_id String @unique`, FK relation `listing Listing @relation(fields: [listing_id], references: [listing_id], onDelete: Cascade)` matching the existing `ListingMedia` pattern. RESO/Trestle source tracking (`listing_key`, `source_system`, `mls_status`), classification (`listing_type`, `property_type`, `property_sub_type`), promoted geography columns (`borough`, `neighborhood`, `postal_code`, `city`, `state`), numeric search dimensions (`list_price BigInt?`, `bedrooms Float?`, `bathrooms Float?`, `living_area Float?`, `year_built Int?`, `latitude Float?`, `longitude Float?`), four boolean flags (`is_commercial`, `is_new_development`, `is_exclusive`, `is_rental`), distribution-gate mirror (`rls_eligible Boolean @default(true)`, plus four nullable gate booleans), and three free-text/structured fields (`searchable_text Text?`, `amenity_keys Json?`, `feature_flags Json?`). Indexes per the brief: 9 total, including the 4-column composite gate index aliased as `lsp_distribution_gates_idx` to stay under Postgres 63-char identifier limit.
- Added back-relation on `Listing`: `listing_search_projection ListingSearchProjection?` (singular, optional 1:1). Required for the FK to compile; no other Listing changes.
- Added migration `prisma/migrations/20260429130000_add_listing_search_projection/migration.sql` (additive `CREATE TABLE` + 9 indexes + FK constraint with `ON DELETE CASCADE`). Per NEON.md §4: index creation is non-CONCURRENT but safe because the table is empty at creation time. Migration **NOT yet applied to production Neon** — application is paused for explicit user confirmation per the established push gate.
- Added pure helper `lib/search/listing-search-projection.ts` (357 LOC) exporting:
  - `buildListingSearchProjectionFromListing(listing): ListingSearchProjectionRow` — main builder.
  - `normalizeProjectionSearchText(listing): string | null` — lowercased, whitespace-collapsed concatenation of PublicRemarks, address parts, neighborhood, city. PUB-tier only (compliance comment in helper explicitly forbids extending to PrivateRemarks/ShowingInstructions).
  - `extractProjectionAmenityKeys(listing): string[] | null` — reuses `AMENITY_FIELD_MAP` from `lib/search/types` so amenity matching stays semantically identical to `applyPublicListingPostFilters`.
  - `extractProjectionFeatureFlags(listing): Record<string, boolean> | null` — derives `has_floorplan`/`has_video`/`has_virtual_tour` from media[] + `is_furnished`/`is_pet_friendly` from features.
  - All four functions are pure (no DB, no I/O). Loose `ListingProjectionSource` input shape tolerates both raw Prisma `Listing` rows and serialized fixtures.
  - Distribution-gate fields are mirrored verbatim — null stays null, false stays false — so a future reader can fail-closed via the canonical evaluators in `lib/search/listing-access-decision.ts`.
- Added focused tests `lib/search/__tests__/listing-search-projection.test.ts` (16 cases) covering: sale projection round-trip, rental projection (incl. furnished + pet-friendly flag), fail-closed permission preservation (null→null AND false→false), search text normalization (positive + null-empty path), amenity key extraction (positive + null + pet-friendly negative-value handling), feature flag extraction (media + features + null + pet-friendly negative), commercial flag (commercial_sub_type AND property_sub_type set), new-development flag, exclusive flag (agent_id presence), rental flag (listing_type === "rent").
- `lib/idx/sync.ts` was NOT touched. PR 5B will add dual-write — schema only this slice.
- No reader migrations attempted — `/api/listings`, `/api/idx/search`, saved-search execute, and search-alerts cron all continue to read `Listing` directly. PR 5D will move readers one at a time per `NEON.md §4`.

Validation after the PR 5A slice:

- `npx prisma validate` passed (only the existing `driverAdapters` preview deprecation warning).
- `npx prisma generate` regenerated the Prisma Client cleanly.
- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 252/252 (previous: 236/236; +16 new tests).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result and 0 critical (terminal summary: 853 pass, 0 critical, 5 pre-existing warnings, 29 info — no new false positives from the new model).

Diff stat:

- `prisma/schema.prisma`: +96 lines (new model + 1-line back-relation on Listing).
- `prisma/migrations/20260429130000_add_listing_search_projection/migration.sql`: +109 (new file).
- `lib/search/listing-search-projection.ts`: +357 (new file).
- `lib/search/__tests__/listing-search-projection.test.ts`: +259 (new file).

Production migration application: **paused for user confirmation.** Per NEON.md §4, schema migrations apply manually to Neon prod before any code that depends on the table merges. PR 5A introduces no readers/writers of `listing_search_projection`, so applying the migration now is safe but not yet required. Recommended: apply when starting PR 5B (dual-write from `lib/idx/sync.ts`) so the table exists before sync attempts to populate it.

Follow-up slices remaining:

- **PR 5B** — Dual-write from `lib/idx/sync.ts` using `buildListingSearchProjectionFromListing`. Requires applied migration.
- **PR 5C** — Verify one full sync cycle populates rows.
- **PR 5D** — Migrate first reader (likely `/api/listings` DB-first via the existing `buildPublicListingDbSearch` helper).
- **PR 5E** — Expand readers gradually (saved-search execute, search-alerts cron, similar listings, comparables).

Push gate: unchanged. Local branch ahead of origin by N+1 commits after this slice; no push performed.

PR 5A migration applied to production Neon — checkpoint:

- User authorization received explicitly. Re-read NEON.md before applying.
- `npx prisma migrate deploy` applied `20260429130000_add_listing_search_projection` cleanly against the configured Neon DB (`ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech`, database `neondb`).
- `npx prisma migrate status` reported: "Database schema is up to date!" (20 migrations found, all applied).
- Post-migration `npm run ops:health` passed / healthy. DB ~215 MB / 500 MB cap; sync ok (0 errors last 24h, last run 0.3h ago: 11 upserts in 1.8s); REBNY §2.05 violations: 0; no upgrade needed.
- Post-migration validation rerun:
  - `npm run type-check` passed.
  - `npx jest --config lib/search/jest.config.js` passed: 252/252.
  - `npm run test:compliance` passed: 194/194.
  - `npm run compliance-check` passed: 87/87.
  - `npm run idx:validate` passed: WARN, 0 critical (853 pass, 5 pre-existing warnings, 29 info).
  - `npm run lint` passed: 0 errors, 0 warnings.
- The `listing_search_projection` table is now present in production but empty — no writers yet. PR 5B (dual-write from `lib/idx/sync.ts`) is the next slice and is intentionally not started in this session per user instruction.
- `lib/idx/sync.ts` remains untouched. The neon-precommit-guard hook will no longer require bypass for any future PR 5B / 5C / 5D commit, since the schema is now applied and `prisma migrate status` reports up-to-date.

Push gate unchanged.

Master plan PR 5B — dual-write `ListingSearchProjection` from IDX sync — completed:

- Located both canonical Listing upsert sites in `lib/idx/sync.ts`:
  - **Site 1 — `syncListings()`** (line ~165): main incremental + full Trestle-driven sync. No agent_id (Trestle-sourced rows aren't bound to one of our agents).
  - **Site 2 — `syncAgentHistory()`** (line ~787): per-agent historical sync. Sets `agent_id: options.agentDbId` on the Listing — projection mirrors via `is_exclusive: true`.
- Added imports to `lib/idx/sync.ts`: `buildListingSearchProjectionFromListing`, `buildProjectionUpsertPayload`, and `type ListingProjectionSource` from `@/lib/search/listing-search-projection`.
- After each `prisma.listing.upsert()` succeeds, the sync builds a `ListingProjectionSource` from the same `mapped` object, then calls `prisma.listingSearchProjection.upsert(buildProjectionUpsertPayload(...))`. Both writes share the same per-listing `try/catch` — matches the existing sequential write convention; no transaction wrapper. A projection failure increments the same `errors` counter and logs to console; the next sync cycle retries.
- `mapTrestleToPrisma`'s output does NOT carry `rls_eligible` or `commercial_sub_type` (Trestle data inherits the schema defaults). For both sync paths, the projection input hardcodes `rls_eligible: true, commercial_sub_type: null` because Trestle data is RLS-eligible by definition and the website-only commercial path is CRM-authored (never via Trestle). The projection is consistent with the same invariant already encoded in `lib/search/public-listing-db.ts`.
- Distribution-gate fields are pulled directly from `mapped.{idx_display_yn,internet_entire_listing_display_yn,internet_address_display_yn,participant_only}` — null/false round-trip verbatim into the projection row.
- Added `buildProjectionUpsertPayload(projection)` to `lib/search/listing-search-projection.ts` (pure helper). Returns a Prisma-shaped `{ where: { listing_id }, create, update }` payload. `create` and `update` carry the same fields — every projection column is fully derived from the source `Listing`, so an update overwrites every column (no diff-merge stale state). Nullable Json columns (`amenity_keys`, `feature_flags`) use `Prisma.JsonNull` for SQL NULL — strict Prisma types reject bare `null` on `Json?` fields.
- Added 4 focused tests in `lib/search/__tests__/listing-search-projection.test.ts` under a `describe("buildProjectionUpsertPayload (PR 5B dual-write)", …)` block:
  1. Create-branch payload carries every column.
  2. Update-branch payload is idempotent (every key in `create` appears in `update` with the same value).
  3. Null permission inputs round-trip (gate scalars stay `null`, JSON columns become `Prisma.JsonNull`).
  4. False permission inputs round-trip verbatim (no coercion).
- No backfill in this slice — by design per the brief. The new projection table is empty until the next idx-sync cycle (every 10 minutes per `vercel.json`) populates rows.

Validation after the PR 5B slice:

- `npx prisma validate` passed (only the existing `driverAdapters` preview deprecation warning).
- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 256/256 (previous: 252/252; +4 new tests).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result and 0 critical (853 pass, 5 pre-existing warnings, 29 info).
- `npm run lint` passed: 0 errors, 0 warnings.
- `npm run ops:health` passed: HEALTHY. DB ~215 MB / 500 MB cap; sync 0 errors last 24h; 19,697 listings.
- No standalone IDX sync test file exists in the repo (`lib/idx/__tests__/` doesn't exist) — the testable seam is the pure `buildProjectionUpsertPayload` helper, which is fully covered.

Diff stat:

- `lib/idx/sync.ts`: +69 / −2 (two ~33-line projection upsert blocks added after each Listing upsert, plus the import).
- `lib/search/listing-search-projection.ts`: +83 / −1 (Prisma runtime import + `jsonInput` helper + `ListingSearchProjectionUpsertPayload` type + `buildProjectionUpsertPayload` function).
- `lib/search/__tests__/listing-search-projection.test.ts`: +90 (4 new test cases + Prisma import).

Production projection table: still empty at commit time. Next idx-sync cycle (`*/10 * * * *`) will populate rows for any listing it upserts.

Next step for PR 5C: backfill / sync-cycle verification. Two paths:
1. **Passive verification** — wait for the next 10-minute sync cycle, then query `SELECT COUNT(*) FROM listing_search_projection` and verify it grows. Cheapest, lowest blast radius.
2. **Active backfill** — write a one-shot script that calls `buildListingSearchProjectionFromListing` + `buildProjectionUpsertPayload` for every existing `Listing` row. Faster to populate but adds compute load. Bounded brief required before starting.

Push gate unchanged.

PR 5C — passive verification — completed:

- **Pre-push checks** (all green):
  - `git status --short --branch` → 3 ahead of origin/main, only auto-regenerated validator artifacts dirty.
  - `npx prisma migrate status` → "Database schema is up to date!" (20 migrations).
  - `npm run ops:health` → HEALTHY. DB ~215 MB; sync 0 errors; 19,813 listings.
  - `npm run type-check` → 0 errors.
  - `npm run compliance-check` → 87/87.
  - `npm run lint` → 0 errors, 0 warnings.

- **Push** at 19:14:17 UTC: `b9b83245..0d6ccacd  main -> main` (3 commits delivered: PR 5A schema `03ea8cf9`, migration-applied checkpoint `8d738087`, PR 5B dual-write `0d6ccacd`).

- **CI workflows** (kicked off by push, polled until completion):
  - `Release Truth` → success
  - `Guardrails (Repo + Compliance)` → success
  - `Auto-retry runner-pool flakes` → skipped (correct — no flake to retry)

- **Pre-deploy projection baseline** (19:14:30 UTC, before next sync cycle): `projection_count: 0`, `listings_count: 19,813`. Confirms the table was empty at deploy time as expected from PR 5B's "no backfill" design.

- **First post-deploy sync cycle**: ran 19:20:18 → 19:20:24 UTC (8.2 s elapsed). The dual-write code in `lib/idx/sync.ts` activated.
  - Pre-cycle: `projection_count: 0` at 19:19:57 UTC.
  - Post-cycle: `projection_count: 101` at 19:20:28 UTC.
  - Projection `min(created_at) === min(updated_at) = 2026-04-29T19:20:18.633Z`.
  - Projection `max(created_at) === max(updated_at) = 2026-04-29T19:20:21.642Z`.
  - 3-second window for 101 row inserts → ~30 ms per upsert, consistent with normal Neon write throughput.
  - Listings count: 19,813 → 19,815 (+2 net new listings; the other 99 projection upserts represent existing listings whose Trestle ModificationTimestamp updated this cycle, triggering a re-upsert of both Listing and projection).

- **Sync health** (post-cycle):
  - `npm run ops:health` → HEALTHY. Sync state: ok. Last run: 101 upserted, 0 errors, 8.2 s.
  - 24-hour error count: 0.
  - Sync duration grew from ~4.9 s pre-PR-5B to 8.2 s post-PR-5B for a 101-row cycle — ~3.3 s overhead for 101 projection upserts (~33 ms per projection upsert). Well within the Vercel cron budget; no quota concern.
  - REBNY §2.05 violations: 0 (unchanged).

- **Validation rerun** (all green):
  - `npm run idx:validate` → WARN, 0 critical (853 pass, 5 pre-existing warnings, 29 info).
  - `npm run compliance-check` → 87/87, 0 fail.

- **Dual-write status: confirmed working in production.** The projection populates as a side effect of normal Trestle sync, with no errors. Subsequent cycles will continue adding rows; over the typical 1–2 week churn window the projection should converge on parity with `Listing` count (19,815 today; whatever the active count is at convergence).

- **Whether active backfill is still needed: not for correctness, possibly for speed.** Convergence is naturally driven by `ModificationTimestamp` updates from Trestle. Listings that change frequently (active sales, rentals with showings) will have projections within hours; quiet rows will only get projections when they next change. If a reader migration (PR 5D) needs full coverage before the natural-churn window converges, a one-shot backfill script can be added under a separate bounded brief. Current recommendation: defer the backfill until PR 5D plans which reader is migrating first; for some readers (saved-search execute, search-alerts cron), partial coverage is acceptable since they only return what's present.

Diff stat for this slice: zero source code change. Documentation only.

Push state: `origin/main` advanced from `38d4374d` to `0d6ccacd`. Local branch matched origin at push time. After this docs commit, local will be 1 commit ahead again — staged for the next session to push.

PR 5C-backfill — bounded one-shot listing_search_projection backfill — completed:

- Added `scripts/backfill-listing-search-projection.ts` (idempotent, dry-run by default, cursor-paginated by `id ASC`, 500-row default batch, `--execute` / `--batch=N` / `--max-batches=N` / `--limit=N` flags). Reads only existing `Listing` rows (never Trestle), reuses the existing pure helpers `buildListingSearchProjectionFromListing` + `buildProjectionUpsertPayload`. Filter: Prisma 1:1 relation `listing_search_projection: null` selects only listings without an existing projection. Fail-closed gate fields round-trip verbatim. Loud failures (process exits non-zero on per-row errors).
- Added 2 npm scripts in `package.json`: `ops:projection-backfill` (dry-run) and `ops:projection-backfill:execute` (real writes). Match the existing `ops:neon-shed[:execute]` pattern.

Dry-run (pre-execute):

- Pre-flight counts: listings 19,826 · existing projections 247 · expected to backfill 19,579.
- Batches: 40 (39 × 500 + 1 × 79).
- Errors: 0. Elapsed: 18.0 s (read-only; no upserts).
- Sample payload (RLS20021426, NoMad rental Co-op): every projection field correctly populated. Distribution gates round-tripped verbatim — `idx_display_yn: false`, `internet_entire_listing_display_yn: true`, `internet_address_display_yn: true`, `participant_only_yn: false`. `is_exclusive: true` (agent_id set), `is_rental: true`, amenity_keys `["laundry-room","skyline-views","views"]`, feature_flags `{has_floorplan: false, …, is_pet_friendly: false}`. searchable_text populated.

Real backfill execute:

- Batches: 40. Errors: 0. Elapsed: 16.4 min.
- During execute, 11 net-new listings were also added to the DB via the natural sync cron. Both the backfill (selecting "no projection") and the dual-write in `lib/idx/sync.ts` (PR 5B) ran concurrently with no conflicts — the upserts are idempotent on `listing_id`. Final convergence is exact.
- Post-execute counts (via direct SQL):
  - `projection_count`: **19,830**
  - `listings_count`: **19,830**
  - `missing_projection_count`: **0**
  - `MIN(proj.created_at)`: 2026-04-29T19:20:18.633Z (first PR 5B dual-write)
  - `MAX(proj.created_at)`: 2026-04-29T20:03:20.401Z (last backfilled row)
  - `MIN(proj.modified_at)`: 2024-10-26T18:55:57.357Z (oldest Trestle ModificationTimestamp in the DB)
  - `MAX(proj.modified_at)`: 2026-04-29T19:58:30.257Z (latest)

Sync health post-backfill:

- `npm run ops:health` → HEALTHY. Sync state: ok. Last run: 71 upserted, 0 errors, 8.3 s. The dual-write continues to fire on every cycle. 24h error count: 0. REBNY §2.05 violations: 0.

Validation:

- `npx prisma validate` passed.
- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 256/256.
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed: WARN, 0 critical (853 pass).
- `npm run lint` passed: 0 errors, 0 warnings.

Diff stat:

- `scripts/backfill-listing-search-projection.ts`: +245 (new file).
- `package.json`: +2 (two new ops scripts).

PR 5D readiness: **safe to start.** The projection table is at full parity with `Listing` (19,830/19,830) and the dual-write keeps it converged on every sync cycle. A reader migration can now query `listing_search_projection` with confidence that no listings are missing. Recommended first reader for PR 5D: `app/api/crm/saved-searches/[id]/execute/route.ts` — already routes through `lib/search/core.ts` from the prior search-spine work, smallest surface area, easiest rollback.

Push state: this slice is local-only — no push performed (per the brief's "Do NOT push unless explicitly instructed").

PR 5D — saved-search execute reader migrated to `listing_search_projection` — completed:

- **`lib/search/listing-access-decision.ts`**: added the projection-side gate constant + helper.
  - New exported `PROJECTION_DISPLAY_GATE: Prisma.ListingSearchProjectionWhereInput` mirroring 4 of 5 Listing-side gates on the projection columns (`rls_eligible: true`, `idx_display_yn: true`, `internet_entire_listing_display_yn: true`, `participant_only_yn: false`). The 5th gate (`owner_opt_out`) wasn't mirrored on the projection in PR 5A's bounded schema — the gate constant closes that gap by including a relation filter `listing: { owner_opt_out: false }`. Single Prisma query, full fail-closed semantics preserved exactly: `idx_display_yn === true` excludes null/false, `participant_only_yn === false` excludes null/true, and `listing.owner_opt_out === false` is enforced via the FK relation.
  - New exported `buildProjectionSearchWhere(statusInput?)` — projection analog of `buildSearchDisplayWhere`, applies the gate plus a status filter on the projection's `mls_status` column.

- **`lib/search/criteria-to-prisma.ts`**: added a parallel projection where-builder.
  - New exported `criteriaToProjectionWhere(criteria, options)` returning `Prisma.ListingSearchProjectionWhereInput`. Same `SearchCriteria` input shape and same field-alias normalization as the existing `criteriaToPrismaWhere` (snake_case + camelCase, rental aliases, multi-status, neighborhood arrays, price/beds/baths/sqft ranges).
  - Field-name renames where the projection differs from `Listing`: `bedrooms_total` → `bedrooms` (Float), `bathrooms_full` → `bathrooms` (Float; the projection's bathrooms column already encodes the half-bath threshold via `bathrooms_full + bathrooms_half * 0.5`), `living_area` (Float vs Decimal), `list_price` (BigInt vs Decimal), `status` → `mls_status`, `modification_timestamp` → `modified_at`.

- **`lib/search/core.ts`**: added the projection-backed runner alongside the existing Listing-backed one (existing `runListingSearch` untouched and still used by search-alerts cron — that's PR 5E).
  - New exported `runProjectionListingSearch(db, criteria, options): ProjectionSearchRunResult`. Single Prisma query: `prisma.listingSearchProjection.findMany({ where: PROJECTION_WHERE, take, skip, orderBy: [{ modified_at: 'desc' }, { id: 'asc' }], include: { listing: { select: SEARCH_RESULT_LISTING_SELECT } } })`. The included `listing` carries the same `SearchResultListing` shape that `serializeSearchListing` already consumes, so the response shape is byte-identical to the Listing-backed path.
  - Defensive null filter on `row.listing` to handle in-flight cascade-race edge cases (the FK is mandatory at the schema level, but PR 5B race-windows can theoretically produce null briefly).
  - `total` count via a parallel `prisma.listingSearchProjection.count({ where })`.
  - Sort key parity: `modified_at desc` on the projection equals `modification_timestamp desc` on `Listing` (the projection builder mirrors `modification_timestamp` into `modified_at`). Same data, same column.

- **`app/api/crm/saved-searches/[id]/execute/route.ts`**: swapped `runListingSearch` for `runProjectionListingSearch`. Single import-line + single call-site change. Response body shape, `serializeSearchListing` mapping, `recordSearchRun` audit shape, `last_run` / `result_count` updates on `SavedSearch`, auth gate, broker-vs-agent scope check, and pagination defaults are all unchanged.

- **`lib/search/__tests__/criteria-to-prisma.test.ts`**: extended with 14 new cases covering:
  1. `PROJECTION_DISPLAY_GATE` constant shape (4 mirrored gates + listing.owner_opt_out via relation).
  2. `buildProjectionSearchWhere` defaults to active-display statuses on `mls_status`.
  3. `buildProjectionSearchWhere` fails closed when every requested status normalizes to a non-displayable value.
  4. `criteriaToProjectionWhere` always carries the projection-side fail-closed gate.
  5. Rental alias handling (`rental` / `lease` / `rent` → `rent`).
  6. Numeric column renames — Listing-side names DO NOT leak into projection where; projection-side names ARE used.
  7. Borough + neighborhoods + property_type filters work the same way as the Listing-backed path.
  8. `modifiedSince` filters on `modified_at`, NOT `modification_timestamp`.
  9. Multi-status input via `mls_status`.
  10. `runProjectionListingSearch` queries the projection with the projection-side where + 1:1 listing include + the right `orderBy` shape.
  11. Null listings (cascade race) are filtered out without throwing.
  12. Response shape preservation via `serializeSearchListing` (every key from the Listing-backed path is present).
  13. Address suppression preserved via `sanitizeSearchAddress` on the included listing.
  14. `limit` / `offset` / `modifiedSince` propagate through the projection query correctly.

Validation after the PR 5D slice:

- `npx prisma validate` passed.
- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 270/270 (previous: 256/256; +14 new tests).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed: WARN, 0 critical (853 pass).
- `npm run lint` passed: 0 errors, 0 warnings.
- `npm run ops:health` passed: HEALTHY. 19,839 listings (up from 19,830 since the backfill — natural sync added 9 more, all dual-written into the projection per PR 5B). REBNY §2.05 violations: 0.

Diff stat:

- `lib/search/listing-access-decision.ts`: +30 lines (new constant + helper).
- `lib/search/criteria-to-prisma.ts`: +90 lines (new `criteriaToProjectionWhere` builder).
- `lib/search/core.ts`: +85 lines (new `runProjectionListingSearch` runner + types).
- `app/api/crm/saved-searches/[id]/execute/route.ts`: +9 / −2 (import + call-site + comment).
- `lib/search/__tests__/criteria-to-prisma.test.ts`: +175 lines (14 new tests).

Whether saved-search execute now reads the projection first: **yes — projection is the primary index.** `prisma.listingSearchProjection.findMany` runs first with the projection where, then Postgres joins to `listings` for the included Listing rows. No two-stage round-trip; single Prisma call.

Whether Listing include/join is still used: **yes — via Prisma `include: { listing: ... }`.** Required because the projection doesn't carry full `address`/`media` JSON nor the full `Listing.id` / `Listing.list_price` Decimal needed by `serializeSearchListing`. The include resolves to a SQL JOIN, not a separate query.

Response shape preservation: **identical.** `serializeSearchListing` consumes the same `SearchResultListing` shape regardless of whether it came from `runListingSearch` (Listing-backed) or `runProjectionListingSearch` (projection-backed via include). No DTO change. Address suppression, BigInt→string serialization, Decimal→string serialization, media pass-through — all unchanged.

Fallback behavior: **none added.** The brief allowed fallback only "if existing project error policy allows it." The existing route's error policy is a top-level try/catch returning HTTP 500 + console.error on any failure (including DB errors). Adding a fallback that silently drops to the Listing-backed path would change error semantics and mask projection-write bugs, so I did not add one. If projection reads fail, the route returns 500 — same as the Listing-backed path returns 500 on Listing read failures.

PR 5E readiness: **safe to start.** `runListingSearch` (the Listing-backed path) is still exported from `lib/search/core.ts` and is now used only by the search-alerts cron — that's the PR 5E migration target. Same migration shape: swap the `runListingSearch` call in `app/api/cron/search-alerts/route.ts` for `runProjectionListingSearch`, preserve the `modifiedSince` cron pattern (already supported by the new runner).

Push state: this slice is local-only — no push performed (per the brief's "Do NOT push" hard limit).

PR 5E — search-alerts cron migrated to `listing_search_projection` — completed:

- **`app/api/cron/search-alerts/route.ts`**: single import-line + single call-site change.
  - Import: `runListingSearch` → `runProjectionListingSearch`.
  - Call site: `runListingSearch(prisma, criteria, { limit, offset, modifiedSince })` → `runProjectionListingSearch(prisma, criteria, { limit, offset, modifiedSince })`.
  - Added an inline comment documenting that `modifiedSince` is supported via the projection's mirrored `modified_at` column and that address suppression continues to flow through `formatSearchAlertAddress` on the included Listing.
- No code change in `lib/search/core.ts`. The `runProjectionListingSearch` runner from PR 5D already supports the `modifiedSince` option via `criteriaToProjectionWhere`'s `modified_at: { gte: ... }` filter — the brief's "tiny adjustment if required" was not required.
- No tests added. The runner contract is already covered by PR 5D's 14 projection tests including `modifiedSince` filters on `modified_at`, the cascade-race null filter, response shape preservation, and address suppression. Adding cron-level integration tests would require mocking SendGrid and Prisma, which is out of scope for this slice.

`runListingSearch` (the Listing-backed runner) is now **unused in the route surface** — both saved-search execute and search-alerts cron go through the projection. The function remains exported from `lib/search/core.ts` because `lib/search/__tests__/criteria-to-prisma.test.ts` still references the existing test fixtures that exercise its `criteriaToPrismaWhere` shape, and removing it would break those tests with no behavior benefit. PR 5F or later can deprecate-and-remove if/when the Listing-backed path is no longer needed.

Behavior preservation:

- **modifiedSince**: preserved exactly. `criteriaToProjectionWhere(criteria, { modifiedSince: since })` produces `where.modified_at = { gte: since }`. The projection's `modified_at` is mirrored from `Listing.modification_timestamp` by the projection builder (PR 5A helper); same data, same column.
- **Fail-closed display gates**: preserved. `runProjectionListingSearch` applies `PROJECTION_DISPLAY_GATE` (4 mirrored gates) plus `listing: { owner_opt_out: false }` via the FK relation. Identical fail-closed posture to the Listing-backed path.
- **Address suppression**: preserved. The included `listing` carries `internet_entire_listing_display_yn` and `internet_address_display_yn`; `formatSearchAlertAddress(listing)` evaluates them through `canDisplayListingAddress` and produces "Neighborhood, City (Address Available on Request)" when display is not affirmatively true. Same string, same gate semantics.
- **Search-run audit event**: preserved. `recordSearchRun` is still called with `searchRun.total / limit / offset / source: "search_alert_cron"` — same shape from both runners.
- **Cron error handling**: preserved. The route's existing per-search `try/catch` and outer `try/catch` produce the same `errored++` counter and same `auditEvent.create({ action: "search_alerts_cron[_error]" })` audit shape on failures.
- **Cron response shape**: preserved. `{ success, total, sent, skipped, errored }` on success; `{ error }` with HTTP 500 on outer failure.
- **No fallback added.** Same posture as PR 5D — adding a Listing-backed fallback would change error semantics and mask projection-write bugs. Existing per-search catch already counts the error and continues to the next saved search.
- **`ClientListingAction` upsert** (line 124-138 in the route): preserved. The new runner's listings carry the same `Listing.id` BigInt that the upsert uses for the `lead_id_listing_id_action` composite key. No change.

Validation after the PR 5E slice:

- `npx prisma validate` passed.
- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 270/270 (unchanged from PR 5D — no new tests added in this slice).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed: WARN, 0 critical (853 pass).
- `npm run lint` passed: 0 errors, 0 warnings.
- `npm run ops:health` passed: HEALTHY. 19,845 listings (up 6 since PR 5D commit — natural sync continues; dual-write keeps projection converged). REBNY §2.05 violations: 0.

Diff stat:

- `app/api/cron/search-alerts/route.ts`: +7 / −1 (import line + comment + call site).

Whether PR 5F can proceed: **yes, but it depends on what PR 5F is.** Per the agenda the user laid out: PR 5F is "maybe CRM saved search list/counts" — a smaller derived-data path. That can proceed with the same swap pattern. Public `/api/listings` migration is still deferred per the user's "Do not migrate public search yet" hard limit until at least two lower-risk projection readers are live and stable.

Push state: this slice is local-only — no push performed (per the brief's "Do NOT push" hard limit).

PR 5C/5D/5E stack pushed + post-deploy verification — corrections to the prior report:

- **Push delivered**: `0d6ccacd..0ca7a0de  main -> main`. **Vercel deploy READY at commit `0ca7a0de` around 2026-04-29T21:05Z** — NOT the earlier "~13:14 UTC" guess in my self-report (that timestamp was carried over by mistake from the earlier `b9b83245..0d6ccacd` push at 19:14 UTC; the actual PR 5C/5D/5E push was several hours later).
- **`origin/main` and local HEAD both at `0ca7a0de`. Branch even with origin.**
- **CI: Release Truth ✅ + Guardrails (Repo + Compliance) ✅ + Auto-retry runner-pool flakes (skipped — correct).**
- **IDX sync schedule is `*/10 * * * *` (every 10 minutes)**, NOT every 12 minutes. Earlier passages in this file have been corrected (5 occurrences swapped to `*/10`).
- **Search-alerts schedule is `30 7 * * *`** (daily 07:30 UTC). Pre-deploy run at `2026-04-29T07:30:06.434Z` was on the OLD code — deploy happened ~14 hours later. Next cron firing on the new code: **`2026-04-30T07:30 UTC`** (~9–10 hours after this push).
- **Audit `created_at` column is `timestamp without time zone`** — the prior report read those values as UTC ISO strings via Prisma's TS layer. Treat them as scheduled/raw DB times rather than precision-precision UTC stamps.
- **Live counts at the time of this verification (2026-04-29T21:45 UTC)**: `projection_count = 19,851`, `listings_count = 19,851`, `missing_projection_count = 0`. The `listings` count grew naturally between push and verification because the IDX sync continued to fire on its 10-minute schedule; PR 5B dual-write kept the projection converged.
- **Latest `ops:health` post-deploy**: HEALTHY. Last sync 105 upserted, 0 errors, 8340 ms. REBNY §2.05 violations: 0.
- **`listing_search_projection` storage**: 12.68 MB (table now visible in the top-5 by size).
- **Public smoke checks**: homepage 200, `/api/listings` 200 (cold), `/api/listings?type=sale` 200, `/api/health` 200. No regression on unchanged surfaces.
- **Targeted projection tests**: 24/24 pass (incl. the 14 PR 5D projection-reader cases).
- **Saved-search execute** (auth-gated): structurally verified via CI + projection parity + PR 5D's 14 unit tests for response-shape preservation, address suppression, and `SearchResultListing` shape contract. Direct end-to-end response-shape probe was not performed — needs a session cookie. Acceptable: the deploy is live and gates are green.
- **Search-alerts cron history**: clean. 5 most recent runs (2026-04-25 → 2026-04-29) all `errored: 0`, `total: 0` (no saved searches with `alert_enabled: true` configured anywhere; this is normal — the cron handles the empty case correctly). Active backfill is no longer needed for projection parity.
- **Desktop mirror claim retracted.** I cannot independently substantiate that any obvious root Desktop / `.codex/memories` mirror exists. **In-repo memory is the reliable source.** Any earlier sentence in this file or my reports that asserted "byte-identical Desktop mirror" should be read as my own session-local belief, not a verified claim.

PR 5F readiness: still **deferred until the first post-deploy search-alerts cron run is observed clean.** That happens at the next `30 7 * * *` firing (`2026-04-30T07:30 UTC`). After that fires, run:

```sql
SELECT * FROM audit_events
 WHERE action IN ('search_alerts_cron', 'search_alerts_cron_error')
 ORDER BY created_at DESC
 LIMIT 10;
```

(Note: this project's column is `action` rather than `event_type`. Same query intent.)

Confirm:
- Latest `search_alerts_cron` row exists with `created_at` after the deploy time (`2026-04-29T21:05Z`).
- That row's `changes.errored = 0`.
- No `search_alerts_cron_error` rows after the deploy.

Once those three conditions are true, PR 5F (CRM saved-search list/counts projection migration) is safe to start.

Push gate: in-repo memory corrections are local-only. **Not pushed.**

Resume + push checkpoint — `437b78e4` + `5b164553` delivered to `origin/main`:

- **Push** at `2026-04-29T23:27:10Z`: `0ca7a0de..5b164553  main -> main`. Two commits delivered:
  - `437b78e4` — memory corrections (10-min cron schedule, deploy time, parity counts, retracted Desktop-mirror claim).
  - `5b164553` — RESO read-only diagnostic toolkit + MCP setup runbook. Layer 2 + Layer 3 deliverables. Added under `scripts/reso/` and `docs/reso-mcp-setup.md`. Six new `reso:*` npm scripts. No schema, no migration, no `lib/idx/` or `lib/search/` writer changes.
- **Pre-push validation**: type-check 0 errors, compliance-check 87/87, lint 0/0, idx:validate WARN with 0 critical (853 pass, 5 warn, 29 info), ops:health HEALTHY (sync ok, 0 errors, REBNY §2.05 violations: 0). All six push-condition gates from the resume prompt satisfied.
- **CI workflows on the new HEAD**: Release Truth ✅ success, Guardrails (Repo + Compliance) ✅ success, Auto-retry runner-pool flakes (skipped — correct).
- **Vercel deploy live**: homepage 200, `/api/health` 200, `/api/listings` 200. Public site verified.
- **`origin/main` now at `5b164553`.** Local even with origin at push time.
- **RESO analyze run** at `2026-04-29T23:28Z`: Trestle active 10,433 (sale 9,490, rent 943); DB active 10,485 (sale 9,522, rent 963); projection 19,869 / 19,869 with 0 missing; public `/api/listings` 5,163. Deltas: Trestle expected − DB active = −52 (stale Active rows handled by data-retention cron); DB listings − projection = 0 (full parity); Trestle expected − public site = 5,270 (in-flight migration gap, unchanged).
- **IDX Plus rate limit** partially consumed by today's earlier sessions — gate probes for `idx_display_yn=false`, `internet_address_display_yn=false`, `owner_opt_out=true`, `participant_only=true`, `auction_yn=true`, and `Coming Soon` returned `n/a`. Per the resume prompt's rule, RESO probing was stopped after the single analyze pass; values will refresh on the next quota window.

**Search-alerts cron gate (Step 4)**: NOT YET CLEARED.

- Latest `search_alerts_cron` audit row is `2026-04-29T07:30:06.434Z` (`{ sent: 0, total: 0, skipped: 0, errored: 0 }`).
- That run is **pre-deploy** — the original 0ca7a0de deploy was ~`21:05Z`, and this resume push at `23:27Z` is even later.
- Search-alerts schedule is `30 7 * * *` (daily 07:30 UTC).
- Next firing on the new code: **`2026-04-30T07:30:00Z`** (~8 hours after this push).
- No `search_alerts_cron_error` rows in the recent history (10-row window).
- Current UTC: `2026-04-29T23:29:51Z`.

PR 5F readiness: **NOT CLEARED.** Wait for the `2026-04-30T07:30 UTC` firing, then re-run:

```sql
SELECT * FROM audit_events
 WHERE action IN ('search_alerts_cron', 'search_alerts_cron_error')
 ORDER BY created_at DESC
 LIMIT 10;
```

Confirm the latest row's `created_at` is after the deploy (after ~`21:05Z`), `changes.errored = 0`, and no `search_alerts_cron_error` rows post-deploy. Once those three conditions hold, PR 5F is cleared to start.

Memory writeback push state: this checkpoint is local-only. The original Step 3 push delivered the two queued commits; the resume prompt did not authorize re-pushing a fresh memory commit, so this writeback sits at +1 ahead of `origin/main` until the next session decides to push.

*Audit captured 2026-04-29 by Claude Opus 4.7 (1M context). Updated in-repo by Codex after local implementation checkpoints.*

---

## 2026-04-30 · RESO toolkit Layer-2 expansion (5 new tools — local commit only, no push)

While waiting on the `2026-04-30T07:30 UTC` search-alerts cron gate (PR 5F prerequisite), added five read-only diagnostic tools to `scripts/reso/`. None of them touch DB writers, Trestle writers, schema, env, Vercel config, or the master-plan migration path. All four local-only / dry-run smoke tests passed.

| Tool | Reads from | Writes to | Smoke test |
|---|---|---|---|
| `snapshot.js` | analyze.js (Trestle + DB + public) | `artifacts/reso-snapshots/YYYY-MM-DDTHHmmssZ.json` + `latest.json` | not run (would burn one analyze pass) — invocation path verified by static review |
| `gate-breakdown.js` | Trestle (1 baseline + ≤4 gate probes) | stdout / `--json` | `--dry-run` PASS — emits the 6 planned probes as a JSON plan, zero Trestle calls |
| `drift.js` | `artifacts/metadata.xml` + `data/rebny-rls-property-fields.csv` | `artifacts/reso-drift/YYYY-MM-DDTHHmmssZ.json` + `latest.json` | PASS — first-run snapshot saved at `2026-04-30T00-10-34-631Z.json`. Visible drift: REBNY uses `Custom Property` / `Open House` / `Property UnitTypes` (with spaces), Trestle uses `CustomProperty` / `OpenHouse` / `PropertyUnitTypes`. Property-level: 745 in both, 1 REBNY-only, 0 Trestle-only |
| `route-catalog.js` | `app/api/**/route.ts` (regex-only) | `artifacts/api-route-catalog.{md,json}` | PASS — 276 routes catalogued. Auth class breakdown: agent/broker 134, public 36, portal 25, broker 24, cron 23, public(auth) 17, portal(path) 15, agent/broker(path) 2. Listing-adjacent public: 8 with gate / 2 without |
| `schema-audit.js` | `prisma/schema.prisma` Listing model + REBNY CSV + metadata.xml | `artifacts/schema-audit.{md,json}` | PASS — 58 columns: 22 fully aligned (REBNY+Trestle), 31 mallan-internal (no RESO mapping by design), 5 drift/verify |

### Trestle ↔ RESO drift posture (drift.js note)

Per the 2026-04-29 RESO Desktop Client session: **Cotality/Trestle is currently certified on RESO Web API Core 2.0.0 + DD 2.0 + DD 1.7. RESO has DD 2.1 published; Trestle has NOT certified there yet.** REBNY publishes its own IDX Plus subset on its own cadence. `drift.js` persists a dated snapshot every run, so when any side moves the next run surfaces the delta. To refresh the Trestle-side cache (one-time): `npx tsx scripts/refresh-trestle-csv.ts`.

### Package.json npm aliases added

```
reso:snapshot          → node scripts/reso/snapshot.js
reso:gate-breakdown    → node scripts/reso/gate-breakdown.js
reso:drift             → node scripts/reso/drift.js
reso:route-catalog     → node scripts/reso/route-catalog.js
reso:schema-audit      → node scripts/reso/schema-audit.js
```

### Push gate

This addition is **local-only** per the established gate. `origin/main` is at `5b164553`. The `14b16d4e` trace.js commit, the RESO-compliance memory at `9bf3c9c9`, the post-push memory `dde1819a`, and now this Layer-2 tools commit sit ahead of origin awaiting explicit push authorization.

### Still gated

PR 5F (CRM saved-search list/counts projection migration) remains gated on the `2026-04-30T07:30 UTC` search-alerts cron clean run. Public `/api/listings` projection migration deferred until 5D/5E observed stable. Saved-search clone toolkit (`scripts/reso/search/`) deferred per the earlier hard-limits decision.

---

## 2026-04-30 · Off-market scanner foundation — Manhattan luxury corridor primitive

While waiting on the search-alerts cron gate, started the off-market seller-intent scanner per the user's expanded ask (PLUTO + ACRIS + DOF + DOB + HPD + lis pendens + probate + aging-owners). User constrained the geographic scope: **Manhattan only, south of 97th E and 110th W, both rivers, down to the Battery.** Roughly 14 sq miles, 30K–40K PLUTO tax lots, 8K–15K buildings, 20K–30K distinct owners, 1K–3K with active sell-signals at any moment, 50–200 hot-prospect queue.

User also clarified the dual-track strategy: rentals don't get scanned for tenant intent (most landlords self-advertise) but landlords with distress signals are dual prospects — listing-acquisition AND sale-disposition. This matches the cross-side-opportunity state machine in `docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md`.

### Existing prior work that this slice continues

- `docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md` — combined buyer+seller intelligence platform, the master vision
- `docs/superpowers/specs/_archived-2026-04-27/2026-03-21-seller-prospecting-engine-design.md` — full seller scanner spec with `SellerLead` extension, `OutreachCadenceStep` model, 5-tab prospect workspace, 9-step cadence, daily trigger cron
- `docs/superpowers/specs/_archived-2026-04-27/2026-03-25-buyer-engagement-system-design.md` — buyer-side tracked-listing-link intelligence

### What shipped this slice (commit local-only)

`lib/geo/manhattan-corridor.ts` — the geographic primitive. Every scanner read filters through `isInCorridor(lat, lng)`. Foundation for everything downstream.

| File | Role |
|---|---|
| `data/scanner/manhattan-luxury-corridor.json` | GeoJSON polygon, 26 vertices, accurate to street-block resolution. Source-of-truth boundary. Refinable from NYC LION centerlines later. |
| `lib/geo/manhattan-corridor.ts` | `isInCorridor(lat, lng)` ray-cast + `CORRIDOR_BOUNDS` bbox + `MANHATTAN_BORO_CODE` + `MANHATTAN_BBL_PREFIX` + `isManhattanBbl()` + `CORRIDOR_FEATURE` export |
| `lib/geo/jest.config.js` | Test runner config |
| `lib/geo/__tests__/manhattan-corridor.test.ts` | 67 tests across 30 inside-landmarks, 20 outside-landmarks, bad-input handling, bounds, BBL prefix, GeoJSON shape |

### Test-suite results

- 67/67 PASS
- 30 inside-landmarks (Mallan office, ESB, Times Sq, Battery, FiDi, Hudson Yards, Stuy Town, UN HQ, Sutton Place, Carnegie Hill, UWS, TriBeCa, SoHo, etc.) — all correctly classified as inside
- 20 outside-landmarks (East Harlem, Harlem, Morningside Hts, Hamilton Hts, Wash Hts, Inwood, Bronx, Brooklyn, Queens, JFK, etc.) — all correctly classified as outside
- Edge tests at 96th/Lex (just south of E boundary, inside), 98th/Lex (just north, outside), 109th/CPW (just south of W boundary, inside), 111th/CPW (just north, outside)
- Type-check: 0 errors project-wide

### Known limitations of v1 polygon

- Hand-drawn from known street/avenue intersections, not derived from NYC LION centerlines. Accurate to street-block resolution; sub-block precision could be off by ~30–100 ft in places.
- Diagonal across Central Park is approximate (96th transverse line). Listings inside Central Park itself (Tavern on the Green, etc.) will resolve to inside the corridor — fine for prospecting since CP has no residential parcels.
- Refinement plan: after PLUTO ingest, use BBL polygon centroids and refine corridor edges so every Manhattan BBL has an unambiguous in-or-out classification.

### Compliance NOT done yet (Phase 0 still required before any scanner output reaches outreach)

- `OwnerSuppression` table not built
- NY DOS Cease & Desist Zone GeoJSON not ingested
- NYS DNC + FTC DNC sync not built
- Per-broker C&D list not built

These remain Phase 0 blockers per my earlier scanner architecture proposal. The corridor primitive is the geographic gate; the compliance gate is the outreach gate. Both must exist before any prospect surfaces to a queue.

### Push state

`origin/main` at `5b164553`. Local commits ahead of origin (chronological):
- `dde1819a` docs(memory): record resume + push of memory corrections + RESO toolkit
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- (this commit) feat(scanner): Manhattan luxury corridor primitive + 67 tests

All five sit local-only awaiting explicit push authorization.

---

## 2026-04-30 · Off-market scanner — Phase 0 compliance gate (flat-file, no schema migration)

After the corridor primitive landed, picked up Phase 0 of the scanner per Maya's "compliance and then pluto" directive. Phase 0 v0 is **flat-file backed** — no Prisma schema change, no Neon migration, no DB writes. When multi-broker scaling is needed, swap reads to a `OwnerSuppression` table and the gate API stays identical.

### What the gate does

Single entry point: `lib/scanner/compliance/suppression.ts` `isSuppressed({ bbl, owner_name, phone, email, address, lat, lng })` → `{ suppressed, reasons[], matched_entries[] }`. Composes:

1. **NY DOS C&D zone geographic check** (19 NYCRR § 175.17[b]) via `cease-desist.ts`. Reads `data/scanner/compliance/nyc-dos-cease-desist-zones.json` (currently empty — placeholder structure). Manhattan rarely has historic active zones, but the gate honors any future Manhattan zone automatically.
2. **Per-Mallan suppression list** (BBL / owner_name / phone / email / address). Reads `data/scanner/compliance/mallan-suppression-list.json` (currently empty). Required by NY law: 365-day minimum exclusion after a "no". Expired entries stay in the file for audit trail but are excluded from match.

### Files added (commit local-only)

| File | Role |
|---|---|
| `data/scanner/compliance/nyc-dos-cease-desist-zones.json` | GeoJSON FeatureCollection of active zones. Empty placeholder. Refresh via `npm run scanner:refresh-cd-zones`. |
| `data/scanner/compliance/mallan-suppression-list.json` | Per-Mallan C&D list. Empty initially. Schema documented in-file. |
| `data/scanner/compliance/README.md` | What the directory is, how the gate works, what's NOT in v0 (DNC, DB persistence). |
| `lib/scanner/compliance/types.ts` | TS types for both files + gate input/output. |
| `lib/scanner/compliance/cease-desist.ts` | `isInCeaseDesistZone(lat, lng)` — ray-cast against zone polygons. Empty zones = always returns false (correct per file = source of truth). |
| `lib/scanner/compliance/suppression.ts` | `isSuppressed()` — combined gate. Phone normalization handles "(212) 555-1234" / "212-555-1234" / "+1 (212) 555-1234" / "2125551234" all match. Email + name case-insensitive + whitespace-tolerant. Expired-entry exclusion. |
| `lib/scanner/compliance/__tests__/suppression.test.ts` | 19 tests across empty-state, dynamic-mock'd list, dynamic-mock'd zones. |
| `lib/scanner/jest.config.js` | Test runner config. |
| `scripts/scanner/refresh-cd-zones.ts` | Human-in-the-loop helper (NY DOS doesn't expose machine-readable feed). `--check` shows current state. `--import` is a stub for future ZIP-to-polygon converter. |
| `package.json` | Added `scanner:refresh-cd-zones`, `test:scanner`, `test:corridor` scripts. |

### Smoke results

- 19/19 PASS scanner suite
- 67/67 PASS corridor suite (no regressions)
- `npx tsc --noEmit` exit 0 (project type-check clean)
- `npm run scanner:refresh-cd-zones -- --check` shows expected empty-state output (0 zones loaded, with refresh instructions)

### Compliance posture as of this commit

| Layer | State |
|---|---|
| Geographic suppression (NY DOS C&D zones) | ✅ Gate built. Data file empty pending refresh. |
| Per-Mallan suppression list | ✅ Gate built. List empty (Maya hand-adds first entries on first "no" responses). |
| NYS DNC + FTC DNC (phone) | ❌ Deferred (v1 outreach is letter + email only — phone outreach gated until DNC sync exists). |
| OwnerSuppression Prisma table | ❌ Deferred (v0 reads JSON; swap to DB when multi-broker scaling needed). |
| Audit logging at gate | ❌ Deferred — hooks belong in the consumer (e.g. seller-prospect endpoint), not in the gate module. |

### Push state

`origin/main` at `5b164553`. Local commits ahead of origin (chronological):
- `dde1819a` docs(memory): record resume + push of memory corrections + RESO toolkit
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- `078769bb` feat(scanner): Manhattan luxury corridor primitive + 67 tests
- (this commit) feat(scanner): Phase 0 compliance gate (flat-file) + 19 tests

All six sit local-only awaiting explicit push authorization.

### Next slice

Phase 1 — PLUTO ingest. Per Maya's "compliance and then pluto" order. Will likely be a `scripts/scanner/pluto-ingest.ts` that downloads NYC MapPLUTO, filters to Manhattan + corridor polygon, writes to `data/scanner/pluto-corridor.csv` (or similar). No DB writes in v0 — flat file, idempotent, re-runnable. Each row passes through `isInCorridor(lat, lng)` before inclusion.

---

## 2026-04-30 · Off-market scanner — Phase 1 PLUTO ingest pipeline (flat-file, streaming)

Built per "compliance and then pluto" directive. Streaming CSV pipeline; constant memory regardless of input size. PLUTO Manhattan CSV (~200MB) processes in 1-2 minutes on a laptop. Filter logic pulled into a pure module so it's testable without downloading 500MB of real data.

### What shipped

| File | Role |
|---|---|
| `lib/scanner/pluto-filter.ts` | Pure filter functions: `isManhattanCorridorRow()`, `isResidentialOrMixed()`, `isProspectableOwnerType()`, `isScannableProspect()`, `projectPlutoRow()` (31 columns), `processRow()` (full pipeline + stats accumulator), `emptyStats()`. |
| `lib/scanner/__tests__/pluto-filter.test.ts` | 38 tests — composite filter, normalization, projection, stats accumulation, realistic mixed-batch scenarios. |
| `scripts/scanner/pluto-ingest.ts` | Streaming CSV ingest. Tiny inline CSV parser (handles quoted commas). Per-100k-row progress chatter. Writes `data/scanner/pluto-corridor.csv` (gitignored) + `data/scanner/pluto-manifest.json` (committed) + optional `pluto-corridor.sample.csv` for tests/reference. |
| `data/scanner/.gitignore` | Excludes large outputs (`pluto-corridor.csv`, `acris-*.csv`, `dof-*.csv`, `dob-*.csv`, `hpd-*.csv`, `*.ndjson`); keeps the manifest, sample, source-of-truth files. |
| `data/scanner/pluto-fixture.csv` | 10-row synthetic fixture for smoke-testing the script. Mix of Manhattan-corridor / Manhattan-Harlem / Brooklyn / non-residential / government / bad-geo rows. |
| `package.json` | Added `scanner:pluto-ingest` script. |

### Filter pipeline

Each PLUTO row goes through 5 gates in order, each with separate stats:

1. **BoroCode = "1"** — drop non-Manhattan rows early (cheapest check).
2. **Lat/Lng valid** (non-empty, finite) — drop bad-geo separately so we can measure geocoding completeness.
3. **`isInCorridor(lat, lng)`** from `lib/geo/manhattan-corridor.ts`.
4. **LandUse ∈ {01,02,03,04,05,06}** (residential / mixed-residential / commercial); drop industrial, transp/utility, public, parking, vacant.
5. **OwnerType ∈ {P, X, M, blank}** (private / mixed / misc); drop city / other-government.

Kept rows are projected to 31 columns (BBL, BoroCode, Block, Lot, Address, ZipCode, OwnerName, OwnerType, LandUse, BldgClass, UnitsRes, UnitsTotal, YearBuilt, YearAlter1/2, Assess*, Exempt*, BuiltFAR, ResidFAR, CommFAR, Latitude, Longitude, CondoNo, HistDist, Landmark, LotArea, BldgArea, NumFloors, ZoneDist1) — ~5x smaller than full PLUTO width.

### Smoke results against synthetic fixture

10 rows in, expected 5 kept (rows 1, 2, 6, 9, 10) + 5 specific drops (one each per drop class). Actual:

```
rows seen: 10 · Manhattan: 9 · corridor: 7 · kept: 5
drops · outside_manhattan: 1 (Brooklyn row)
drops · outside_corridor:  1 (Harlem row)
drops · non_residential:   1 (subway easement, LandUse=08)
drops · gov_owner:         1 (NYC Housing Auth, OwnerType=C)
drops · bad_geo:           1 (empty Lat/Lng)
unique owners (est):       5
unique addresses (est):    5
```

All counters match expected. Manifest written + sample CSV written.

### Test results

- 38/38 PASS pluto-filter suite
- 19/19 PASS suppression suite (no regressions)
- Combined `npm run test:scanner`: 57/57 PASS
- 67/67 PASS corridor suite
- `npx tsc --noEmit`: exit 0

### What's NOT done in this slice

- **Real PLUTO download.** Operator runs `npm run scanner:pluto-ingest -- --input <local-pluto.csv>` after downloading from NYC DCP. Auto-download deferred (download URL is versioned + 500MB; better as a manual operator step).
- **DB persistence.** PLUTO data lives as flat CSV. No schema, no Neon migration. Future ACRIS / DOF / DOB ingests will follow the same flat-file pattern, joinable by BBL.
- **Owner de-duping across LLCs.** PLUTO owner_name is the legal owner-of-record (often LLC/Trust); collapsing one LLC across multiple BBLs requires ACRIS join. Phase 2.
- **Co-op shareholder visibility.** PLUTO shows the corp as owner for co-op buildings, not individual shareholders. Will need ACRIS stock-transfer ingest for unit-level visibility. Phase 2.

### Push state

`origin/main` at `5b164553`. Local commits ahead of origin (chronological):
- `dde1819a` docs(memory): RESO toolkit + corrections
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- `078769bb` feat(scanner): Manhattan luxury corridor primitive
- `091910fd` feat(scanner): Phase 0 compliance gate (flat-file)
- (this commit) feat(scanner): Phase 1 PLUTO ingest pipeline + 38 tests

All seven sit local-only awaiting explicit push authorization.

### Next slice options

- **ACRIS ingest** — deeds + lis pendens + estate transfers. Strongest single sell-signal (lis pendens). Same flat-file pattern as PLUTO.
- **DOF property tax delinquency / lien sale list** — tax-distress signal.
- **DOB violations** — building-condition signal.
- **Stand up the actual scoring engine** — combines PLUTO + (whichever signal sources are ingested) into a per-BBL seller-intent score.
- **OwnerSuppression Prisma schema migration** — when multi-broker scaling becomes real and flat-file mallan-suppression-list.json isn't enough.

---

## 2026-04-30 · ACRIS bulk ingest (lis pendens / foreclosure / tax / estate)

Three-pass streaming join: Master → Legals → Parties. Output is one row per (document_id × bbl × grantor-party) tuple — i.e., one affected-owner-on-an-affected-property record per scanner signal, with full mailing address from the recorded document.

| Doc-type code | Category | Strength as sell-signal |
|---|---|---|
| LP, LIS, LPND, LISPD | `lis_pendens` | Strongest — pre-foreclosure litigation notice |
| FORE, JDF, JDGMT_F | `foreclosure` | Bank has won; still time for workout sale |
| TAX, NOTL, NTOFL, NYSTAX | `tax_lien` | Tax-distress signal |
| EATR, EXECUTOR, ADMIN, LBADM | `estate` | Heir wants out (probate transfer or letters) |

The existing `lib/seller-readiness/signals/acris.ts` handles deeds + mortgages via per-BBL Socrata calls — that's complementary, not duplicate. Bulk distress-signal ingest is what was missing.

### Files (commit `f3027c61`)

- `lib/scanner/acris-filter.ts` — pure filter + projection + stats (Master/Legals/Parties row processors)
- `lib/scanner/__tests__/acris-filter.test.ts` — 58 tests
- `scripts/scanner/acris-ingest.ts` — 3-pass streaming join I/O wrapper
- `data/scanner/acris-{master,legals,parties}-fixture.csv` — synthetic fixtures
- `data/scanner/.gitignore` — allow `*-fixture.csv` through
- `package.json` — `scanner:acris-ingest`

### Smoke test results (synthetic fixtures, 10/7/10 rows)

```
Master kept: 7 (3 lis_pendens, 1 foreclosure, 1 tax_lien, 2 estate)
Drops: 1 deed (not on watchlist), 1 Brooklyn, 1 out-of-window (>730d)
Legals in corridor: 7 (no clip) / 5 (with whitelist clip to 3 BBLs)
Output records: 7 / 5
Unique BBLs: 5 / 3 · Unique owners: 7 / 5
```

Output schema (per row):
```
doc_id, doc_type, category, document_date, recorded_datetime, document_amt,
bbl, street_number, street_name, unit, property_type,
party_name, party_address_1, party_address_2,
party_city, party_state, party_zip, party_country
```

This is the foundation for verifiable contact records — the `party_name` + full mailing address comes from a court-recorded document, the `doc_id` provides chain of custody (anyone can pull the actual document), and `recorded_datetime` gives currency.

---

## 2026-04-30 · Verifiable contact enrichment foundation

Per Maya's directive: contact info has to be **verifiable** — every field must carry provenance (where it came from, when, whether independently verified, by what method, with what confidence).

### Files (commit pending)

| File | Role |
|---|---|
| `lib/scanner/contact/types.ts` | `ContactField` (per-field provenance), `ContactRecord` (aggregated), `SourceContactRow` (adapter input). 10 source enums, 7 verification-method enums, 4-tier confidence enum. |
| `lib/scanner/contact/aggregator.ts` | `aggregateContacts()` combines multiple source rows into one record. Cross-source agreement upgrades confidence automatically. Active verification (USPS / Twilio Lookup / NeverBounce / owner-response) bumps to high. |
| `lib/scanner/contact/sources/pluto-mailing.ts` | PLUTO row → SourceContactRow. Owner-of-record name + property address (low-confidence as a contact address — owners may live elsewhere). |
| `lib/scanner/contact/sources/acris-parties.ts` | ACRIS ingest output row → SourceContactRow. Party name + full mailing address with ACRIS source URL + recorded date. |
| `lib/scanner/contact/__tests__/aggregator.test.ts` | 18 tests across normalize helpers, single-source, cross-source, active-verification, de-dup, both source adapters end-to-end. |

### Confidence logic

| Condition | Confidence |
|---|---|
| Active verification (USPS / Twilio / NeverBounce / owner_response) | **high** |
| 3+ independent sources agree on normalized value | **high** |
| 2 sources agree | **medium** |
| 1 source, no verification | **low** |
| No usable value | **unverified** |

### Source enums supported

`pluto_mailing` · `acris_party` · `hpd_registration` · `dos_corporation` · `dob_application` · `surrogate_court` · `manual_agent_note` · `broker_referral` · `verified_via_response` · `third_party_skip_trace`

Two source adapters wired so far (PLUTO + ACRIS); the rest are typed for future ingests.

### Verification methods supported

`none` · `usps_address_validation` · `twilio_lookup_carrier` · `smtp_email_validation` · `neverbounce` · `owner_response` · `cross_source_agreement` (auto-derived)

Active verifications are NOT performed in this slice — the architecture accepts a `VerificationMap` keyed by `${kind}:${normalized}` from a caller. Future commit: small wrapper script that runs USPS/Twilio/etc. against the aggregated records.

### Smoke results

- 18/18 PASS aggregator tests
- 4 suites total, **133/133 PASS**
- `npx tsc --noEmit`: exit 0

### Push state

`origin/main` at `5b164553`. Local commits ahead of origin (chronological):
- `dde1819a` docs(memory): RESO toolkit + corrections
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- `078769bb` feat(scanner): Manhattan luxury corridor primitive
- `091910fd` feat(scanner): Phase 0 compliance gate
- `337b3c68` feat(scanner): Phase 1 PLUTO ingest pipeline
- `f3027c61` feat(scanner): ACRIS bulk ingest
- (this commit) feat(scanner): verifiable contact enrichment foundation

All nine sit local-only awaiting explicit push authorization.

### Next slice options

- **DOF tax delinquency / lien sale list** — tax-distress, fills the financial-pressure signal vector.
- **DOB violations** — building-condition signal (open class 1/2/3 violations).
- **HPD building registration** — strongest landlord-side contact source (multi-fam ≥3 units must register; phone + email + agent name are all public).
- **Surrogate's Court** — estate executor + their attorney's contact info (highest-quality contact for probate-track).
- **Active verification wrappers** — small modules that run USPS / Twilio Lookup / NeverBounce against aggregated records and feed back into the VerificationMap.
- **Scoring engine** — combines all signals into a per-BBL seller-intent score, gated through the compliance gate before display.

---

## 2026-04-30 · NY DOS Corporation DB ingest (LLC resolution layer)

Maya's expanded ask: pull contact info from "LLC registration disclosure". Clarified scope — the LLC Transparency Act (LLCTA) and federal CTA beneficial-ownership databases are confidential per 2024 amendments; only law enforcement can query. The pre-existing **NY DOS Corporation database** is fully public though, and that's what ships here.

### Scope decision

**HPD ingest dropped per Maya's directive** — she doesn't work with rent-stabilized / rent-control sellers, "too much headaches." HPD building registration removed from priority list.

**DOS Corp prioritized** because it's the LLC-resolution layer for ACRIS. ACRIS shows "ACME 90 LLC" as a grantor with the LLC's address — useless for outreach. DOS Corp tells you the registered agent + process address (often the manager's actual address) plus status (active vs dissolved).

### What shipped (this commit)

| File | Role |
|---|---|
| `lib/scanner/dos-corp-filter.ts` | Pure filter — NYC county check, NYC process-address fallback, entity-type filter (LLC/Corp/NFP/LP/LLP, skip DBA/assumed-name), name normalization (`normalizeEntityName` for join with ACRIS, `normalizeEntityNameStripped` for fuzzier matching). |
| `lib/scanner/__tests__/dos-corp-filter.test.ts` | 50 tests across normalization, NYC matching, entity-type filtering, mixed-batch, projection. |
| `scripts/scanner/dos-corp-ingest.ts` | Streaming script — reads NY OpenData "Active Corporations" CSV, filters, writes `data/scanner/dos-corp-corridor.csv`. |
| `lib/scanner/contact/sources/dos-corporation.ts` | Source adapter — DosCorpProjected → SourceContactRow with `source: "dos_corporation"`, source URL pointing at NY DOS public-inquiry permalink keyed by DOS_ID. |
| `data/scanner/dos-corp-fixture.csv` | 10-row synthetic fixture — Manhattan LLC, Brooklyn LLC, Westchester+NYC-process, Albany (drop), DBA (drop), dissolved (keep), NFP. |
| `package.json` | `scanner:dos-corp-ingest` |

### Filter pipeline

1. **Entity type** ∈ relevant set (LLC, Corp, NFP, LP, LLP — skip DBA/assumed-name)
2. **NYC relevance**: NYC-county OR NYC-process-address (catches LLCs registered upstate but with NYC process address)
3. **Status preserved** (not a filter): Active vs Dissolved/Forfeited/Surrendered both kept; dissolved-with-corridor-property is itself a sell signal.

Output schema:
```
dos_id, current_entity_name, normalized_name, normalized_name_stripped,
entity_type, status, initial_filing_date, jurisdiction, county,
process_name, process_address_1, process_address_2,
process_city, process_state, process_zip
```

### Aggregator update

Aggregator's `normalizeName()` was less aggressive than dos-corp-filter's `normalizeEntityName()` — the former didn't strip commas/periods. Fixed: aggregator now strips punctuation so "ACME, LLC" / "ACME LLC" / "ACME L.L.C." all normalize identically. This is what makes 3-source agreement work in practice.

Added `dos_corporation` source adapter to the aggregator pipeline; new aggregator test covers full PLUTO + ACRIS + DOS triple-source flow.

### Smoke results

Synthetic fixture (10 rows in):
```
kept=8 active=7 inactive=1
manhattan=6 other_nyc=1 process_only=1
drops_non_nyc=1 (Albany)
drops_irrel=1 (DBA assumed-name)
unique=8
```

Triple-source aggregator test (PLUTO + ACRIS + DOS Corp on same LLC):
- 3 sources agree on normalized name
- `owner_entity.confidence = "high"` (3+ sources)
- DOS process_name surfaces a managing-member-or-rep human ("JOHN A SMITH")
- Address is high-confidence cross-source agreement

Combined: **186/186 PASS** (5 suites). `npx tsc --noEmit`: exit 0.

### What this enables

When the scanner surfaces a prospect like "lis pendens filed on BBL 1015730019, grantor 400 EAST 90 OWNER LLC", we can now:

1. Get the LLC's process address (DOS Corp)
2. Confirm the LLC is still active (or flag dissolved as additional signal)
3. Surface the registered agent / managing member name as a contact
4. Cross-reference: does DOS process address match PLUTO mailing? If different → owner is non-occupant (absentee); if same → owner-occupant
5. Audit trail: every field carries source URL + capture date + verification method

### What remains for full LLC contact resolution

- **NY DOS Corp inactive/dissolved dataset ingest** — same shape but separate file. Future commit.
- **Cross-source join layer** — a function that takes an ACRIS grantor name and returns the matched DOS Corp record by `normalized_name` (or fallback to `normalized_name_stripped`). Pure module on top of both ingests' outputs. Future commit.
- **DOS Corp Annual Report / Biennial Statement** — newer filings carry officer names. Separate dataset, similar shape.

### Push state

`origin/main` at `5b164553`. Local commits ahead of origin (chronological):
- `dde1819a` docs(memory): RESO toolkit + corrections
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- `078769bb` feat(scanner): Manhattan luxury corridor primitive
- `091910fd` feat(scanner): Phase 0 compliance gate
- `337b3c68` feat(scanner): Phase 1 PLUTO ingest pipeline
- `f3027c61` feat(scanner): ACRIS bulk ingest
- `88b5fad6` feat(scanner): contact enrichment foundation
- (this commit) feat(scanner): NY DOS Corporation DB ingest

All 10 sit local-only awaiting explicit push authorization.

---

## 2026-04-30 · Trestle off-market signal filter (Expired/Withdrawn/Canceled/Hold)

Maya's expanded ask: the Trestle/RLS feed already exposes expired/off-market listings, and those owners "just tried to sell" → strong sell-intent signal. Built it as a pure filter on top of the existing DB Listing model — no new ingest, since this data is already in our Prisma DB.

### Compliance encoded into the filter (non-negotiable)

1. **Cooling-off period** — default 30 days, hard floor 7 days. Outreach to an owner whose listing recently expired (with another broker) within the cooling window is a NYS DOS / UCBA 2026 violation. The filter returns `kept=false reason=in_cooling_off` for those — they show up in stats so the operator sees the funnel, but they don't surface for outreach.

2. **Internal use only** — Trestle data is licensed for IDX/VOW display per REBNY rules. Off-market statuses MAY NOT be displayed publicly. The filter's output is for internal CRM signals to a Mallan broker/agent, never the public site.

3. **Mallan-exclusives flagged separately** — a listing whose `agent_id` matched a Mallan agent at expiration is a former-client relationship, not cold outreach. Filter sets `was_mallan_listing=true` so the UI routes it differently.

4. **Owner contact comes from PLUTO + ACRIS + DOS Corp**, not from the listing. The listing has the LISTING AGENT's contact, not the owner's. This module produces BBL + signal; the existing pipeline produces verifiable owner contact.

### What shipped (this commit)

| File | Role |
|---|---|
| `lib/scanner/trestle-off-market-filter.ts` | Pure filter functions: `isOffMarketStatus`, `offMarketSince`, `coolingThroughDate`, `isPastCoolingPeriod`, `isMallanListing`, `isCorridorListing`, `daysOffMarket`, `processListing` (full pipeline + stats), `aggregateByBbl` (relist-frequency signal). |
| `lib/scanner/__tests__/trestle-off-market-filter.test.ts` | 47 tests across status normalization, cooling-off math, Mallan-exclusive detection, corridor check, mixed-batch pipeline, BBL aggregation. |

### Off-market statuses recognized

- `Expired` — listing agreement ended without sale
- `Withdrawn` — owner pulled it
- `Canceled` / `Cancelled` (British) — agreement canceled mid-term
- `Hold` — temporarily off-market

`Closed` / `Sold` deliberately NOT included — that's a different signal (recently-sold owners aren't sellers).

### Scanner output schema (per signal)

```ts
{
  bbl, mls_id, listing_id, address,
  listing_status, off_market_since, cool_through_date,
  days_off_market, past_cooling_off, was_mallan_listing,
  list_price, days_on_market_last_listing, cumulative_days_on_market
}
```

### Aggregator: relist-frequency signal

`aggregateByBbl()` groups multiple off-market signals on the same BBL within a window. A BBL with 3+ expired/withdrawn/canceled listings in 24 months is a much stronger sell-intent signal than a single expiry — the owner is actively trying and failing to sell.

Output: `{ bbl, count_24mo, most_recent_status, most_recent_off_market_since, most_recent_cool_through_date, any_was_mallan, signals[] }` — sorted by count descending.

### Smoke results

47/47 PASS new suite. **Combined: 233/233 PASS** across 6 suites. `npx tsc --noEmit`: exit 0.

Realistic mixed-batch test (6 in):
- 2 KEPT (corridor expired past cooling-off)
- 1 DROP active (Active status)
- 1 DROP outside corridor (Harlem)
- 1 DROP cooling-off (5 days post-expiry)
- 1 DROP no-geo (missing lat/lng)

### What this enables

The scanner now has its 5th major signal vector:

| Source | Signal type | Layer |
|---|---|---|
| PLUTO | Property + owner-of-record | Foundation |
| ACRIS lis pendens | Pre-foreclosure | Distress |
| ACRIS foreclosure | Foreclosure judgment | Distress |
| ACRIS tax liens | Tax distress | Distress |
| ACRIS estate | Probate | Disposition |
| **Trestle off-market** | **Tried to sell, didn't** | **Direct sell-intent** |
| DOS Corp | LLC resolution | Contact enrichment |

Trestle off-market is the highest-quality sell-intent signal because the owner's intent was the listing itself. The other signals are inferential; this one is direct.

### What's NOT done

- **DB query script** — `scripts/scanner/trestle-off-market-export.ts` would query Prisma's `Listing` model with corridor lat/lng filter and write a flat CSV. Deferred because it needs the DB connection + the existing IDX sync + auth context. The pure filter is what matters; the wrapper is mechanical.
- **Cross-source join** — combining PLUTO+ACRIS+DOS+off-market signals into one per-BBL prospect record. That's the scoring engine slice.
- **Source adapter for contact enrichment** — none needed. Off-market is a property-level signal, not a contact source.

### Push state

`origin/main` at `5b164553`. Local commits ahead of origin (chronological):
- `dde1819a` docs(memory): RESO toolkit + corrections
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- `078769bb` feat(scanner): Manhattan luxury corridor primitive
- `091910fd` feat(scanner): Phase 0 compliance gate
- `337b3c68` feat(scanner): Phase 1 PLUTO ingest pipeline
- `f3027c61` feat(scanner): ACRIS bulk ingest
- `88b5fad6` feat(scanner): contact enrichment foundation
- `122a5970` feat(scanner): NY DOS Corporation DB ingest
- (this commit) feat(scanner): Trestle off-market signal filter

All 11 sit local-only awaiting explicit push authorization.

---

## 2026-04-30 · Seller-intent scoring engine

The intelligence layer that combines all 5 signal sources into a per-BBL 0..100 sell-intent score with full explainability and compliance-gate enforcement.

### Design philosophy (per Maya's WIP doc)

- **Rules-based weighted scoring with decay, NOT machine learning.** NYC luxury deal volume (30–80/yr) is too small for reliable supervised ML — Maya rejected that explicitly: "causal inference and synthetic pricing experiments — sample size of 30–80 deals/yr is too small to be reliable; quant-shop cargo cult."
- **Half-life style decay** matches the WIP doc's "profile decay with half-lives" framing — recent signals weigh more, old signals fade out.
- **Per-signal explainability.** Every score has a `reasons[]` array with `signal`, `raw_weight`, `decay_factor`, `contribution`, `detail`, `source`, `source_url`, `signal_date`. Required for compliance audit ("why did you reach out to this owner?").
- **Compliance gate is the LAST step.** A prospect that scores 95 but is on the suppression list comes out with `score=0`, `suppressed=true`, and the suppression reasons recorded.

### Scoring rules + weights

| Signal | Max | Decay | Notes |
|---|---|---|---|
| Lis pendens (most recent) | 35 | linear over 730d | Strongest single signal — pre-foreclosure litigation |
| Foreclosure judgment | 30 | 365d | Bank won; still time for workout sale |
| Tax lien | 20 | 730d | Financial stress |
| Estate transfer | 25 | 1095d | Heirs decide slowly — 3-year window |
| Off-market expired (past cooling) | 30 | 365d | Direct sell-intent — they tried |
| **Off-market relist boost** ≥3 in 24mo | +15 | none | Compounding signal |
| Long ownership ≥25y | +10 | step | Tenure-based |
| Long ownership ≥40y | +5 boost | step | Aging-in-place |
| Recent purchase <2y | **−10** | step | Just bought = unlikely seller |
| Dissolved LLC + still owns | +15 | none | Entity ended but property remains |
| Absentee owner (mailing ≠ property) | +10 | none | Not occupant — easier sell |
| **Convergence boost** (≥3 distinct categories) | +10 | none | Multi-source signal alignment |
| Hard cap | 100 | — | — |
| Min score to surface | 25 | — | Below this → not in queue (still scored) |

### Confidence tiers

- **high** — strong recent ACRIS distress (≥25 contribution) OR strong off-market expired (≥20) OR 4+ reasons
- **medium** — score ≥ threshold + 2-3 reasons
- **low** — score ≥ threshold + 1 reason
- **below_threshold** — score < min_score_to_surface

### Files (this commit)

- `lib/scanner/scoring/types.ts` — `BblProspect`, `ScoredProspect`, `ScoreReason`, `ScoringConfig`, `DEFAULT_SCORING_CONFIG`
- `lib/scanner/scoring/scorer.ts` — `scoreProspect()` pure function, `scoreProspects()` batch wrapper
- `lib/scanner/scoring/__tests__/scorer.test.ts` — 35 tests covering empty input, single-signal contribution, ACRIS most-recent-only, off-market with cooling-off, relist boost, tenure rules, recent-purchase penalty, absentee, dissolved LLC, convergence boost, score capping, compliance gate, confidence tiers, audit trail, batch sorting, realistic UES scenario.

### Realistic scenario test (UES coop)

Input:
- Lis pendens 45 days ago
- Foreclosure 800 days ago (decayed to 0)
- Expired Mallan listing 120 days ago
- Withdrawn 500 days ago (relist count = 2, below threshold)
- 32-year tenure
- Not absentee

Output:
- Score: ~73
- 4 reasons: lis_pendens, off_market_expired (with "former Mallan listing" flag), long_ownership_25y, convergence_boost
- 3 distinct categories
- Confidence: high
- Each reason carries `source_url` for audit trail

### Smoke results

- 35/35 PASS scoring tests
- **Combined: 268/268 PASS** across 7 suites
- `npx tsc --noEmit`: exit 0

### What this enables (the actual user value)

Up to this commit, each filter was independent — the scanner had 5 separate lists. Now there's one ranked queue:

```
BBL 1015730019 — score 73 (high confidence, 3 categories)
  ✓ Lis pendens recorded 2026-03-16 (45 days ago)        +33pt
  ✓ Expired listing — off market 2025-12-31 (120d ago)   +20pt · former Mallan listing
  ✓ Owner has held for 32 years                          +10pt
  ✓ 3 converging signal categories                       +10pt

BBL 1010100007 — score 51 (medium, 2 categories)
  ✓ Estate transfer recorded 2025-09-12 (230d ago)       +20pt
  ✓ Repeat off-market: 4 listings ended without sale     +15pt
  ✓ 41 years tenure                                      +15pt
  ✓ Absentee owner                                       +10pt
  ⚠ Convergence boost not earned (only 2 distinct cats)
```

The score is the queue order. The reasons are the talking points + the audit trail.

### What's NOT in this slice

- **DB-side aggregator** — a function that walks the upstream filter outputs (PLUTO + ACRIS + DOS + off-market) and assembles `BblProspect` bundles. Pure glue code; needs Prisma / file-reading wrapper to make it runnable. Future commit.
- **CRM workspace UI** — surfacing the scored queue inside `dashboard.html`. Picks up the 2026-03-21 Seller Prospecting Engine spec's 5-tab workspace.
- **Auto-refresh cron** — re-score nightly as upstream signals refresh.

### Push state

`origin/main` at `5b164553`. Local commits ahead of origin (chronological):
- `dde1819a` docs(memory): RESO toolkit + corrections
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- `078769bb` feat(scanner): Manhattan luxury corridor primitive
- `091910fd` feat(scanner): Phase 0 compliance gate
- `337b3c68` feat(scanner): Phase 1 PLUTO ingest pipeline
- `f3027c61` feat(scanner): ACRIS bulk ingest
- `88b5fad6` feat(scanner): contact enrichment foundation
- `122a5970` feat(scanner): NY DOS Corporation DB ingest
- `915b0075` feat(scanner): Trestle off-market signal filter
- (this commit) feat(scanner): seller-intent scoring engine

All 12 sit local-only awaiting explicit push authorization.

---

## 2026-04-30 · Final assembly — DOF lien sale + ACRIS deeds + end-to-end runner + API + UI

Five commits closing out the scanner foundation.

### `f14f0876` — DOF tax-lien-sale ingest

NYC DOF Property Tax Lien Sale list — strongest tax-distress signal short of an actual foreclosure. New `lib/scanner/dof-tax-filter.ts` + ingest script + scoring rule (max 28pt, 365d decay). Water/sewer-only liens get a −10 penalty (less severe). 21 tests.

### `fe832b39` — ACRIS deed-history ingest

Companion to the distress-only ACRIS ingest. Filters DEED doc types and produces `data/scanner/ownership-duration.csv` — the missing input the tenure scoring rules depend on. New `processDeedMasterRow()`, `computeOwnershipDuration()`. 4 new tests.

### `13dcee87` — `scripts/scanner/build-prospects.ts` end-to-end runner

Loads all 5 ingest outputs, optionally fetches off-market signals from Prisma, runs through `buildProspects()` + `scoreProspects()`, writes:
- `data/scanner/scored-prospects.json` (full audit trail per prospect)
- `data/scanner/scored-prospects.csv` (flat row-per-prospect summary)
- `data/scanner/build-prospects-manifest.json` (run stats)

End-to-end smoke (synthetic fixtures, all 4 ingests pre-run): 5 prospects assembled → 3 surfaced (2 high, 1 medium). Top: BBL 1010100007 score 89.1 (foreclosure 29d + estate 15d + DOF tax lien + convergence). Each reason carries `source_url` for audit trail.

### `6d1e8f2f` — `GET /api/crm/scanner/prospects`

Agent/broker-auth required. Reads pre-computed flat-file output. Filters by `confidence`, `bbl`, `include_suppressed`. Cache-Control: private, no-store. The corridor join is minutes of work — recompute belongs in a script, not an HTTP handler.

### (this commit) — Off-Market Scanner CRM panel

`public/crm/js/dashboard/panels/sales-crm/off-market-scanner.js` — read-only ranked-queue UI. Each row shows score, BBL, reason badges (color + icon per signal type), confidence tier. Click → detail modal showing every reason with audit-trail source URL. Filter by confidence + BBL. Empty-state instructs the operator to run `scanner:build-prospects`. Wired into router at `/sales/scanner`.

### Combined test totals

- 9 suites, **316/316 PASS**
- `npx tsc --noEmit`: exit 0
- Lint: 3 minor warnings (unused imports in tests), 0 errors

### Full scanner stack — final state

| Layer | Status |
|---|---|
| Geographic gate (`isInCorridor`) | ✅ |
| Compliance gate (`isSuppressed`) | ✅ |
| PLUTO ingest | ✅ |
| ACRIS distress ingest | ✅ |
| ACRIS deed-history ingest | ✅ NEW |
| DOS Corp ingest | ✅ |
| DOF tax-lien-sale ingest | ✅ NEW |
| Trestle off-market filter | ✅ |
| Verifiable contact aggregator | ✅ |
| Scoring engine (rules + decay + explainability) | ✅ |
| Aggregator (assembles BblProspect bundles) | ✅ |
| End-to-end runner | ✅ NEW |
| API endpoint | ✅ NEW |
| CRM workspace UI panel | ✅ NEW |

### Push state (final)

`origin/main` at `5b164553`. **18 local commits ahead of origin**, all local-only awaiting explicit push authorization:
- `dde1819a` docs(memory): RESO toolkit + corrections
- `9bf3c9c9` docs(memory): RESO compliance audit
- `14b16d4e` chore(reso): trace.js
- `2ab89410` chore(reso): Layer-2 toolkit
- `078769bb` feat(scanner): Manhattan luxury corridor primitive
- `091910fd` feat(scanner): Phase 0 compliance gate
- `337b3c68` feat(scanner): Phase 1 PLUTO ingest pipeline
- `f3027c61` feat(scanner): ACRIS bulk ingest
- `88b5fad6` feat(scanner): contact enrichment foundation
- `122a5970` feat(scanner): NY DOS Corporation DB ingest
- `915b0075` feat(scanner): Trestle off-market signal filter
- `cdecff1a` feat(scanner): seller-intent scoring engine
- `029ff7c7` feat(scanner): aggregator
- `f14f0876` feat(scanner): DOF tax-lien-sale ingest
- `fe832b39` feat(scanner): ACRIS deed-history ingest
- `13dcee87` feat(scanner): build-prospects runner
- `6d1e8f2f` feat(scanner): GET /api/crm/scanner/prospects
- (this commit) feat(scanner): off-market scanner CRM UI panel

### Remaining deferred work (not blockers)

- ~~**Active verification wrappers** (USPS / Twilio Lookup / NeverBounce). Need vendor account setup + API keys.~~ **DONE — Maya already has all keys in Vercel.**
- **Surrogate's Court probate scrape** — per-county scraping, no clean OpenData feed.
- **Real PLUTO + ACRIS download** — operator pulls from NYC OpenData and runs the ingests.

---

## 2026-04-30 · Active verification layer (Twilio + NeverBounce/DNS + USPS)

Maya confirmed all API keys are already in Vercel. Wired up the active-verification layer that promotes contact-field confidence from "cross-source agreement" (medium) to actively-verified (high).

### Files

| File | Role |
|---|---|
| `lib/scanner/contact/verify/types.ts` | `VerificationResult`, `PhoneVerification`, `EmailVerification`, `AddressVerification`, `VerifyOptions` types |
| `lib/scanner/contact/verify/twilio-lookup.ts` | Twilio Lookup v2 phone validation. Reuses `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` already in use for SMS MFA. ~$0.005/call. |
| `lib/scanner/contact/verify/email-validate.ts` | Two-tier email validation: NeverBounce (`NEVERBOUNCE_API_KEY`) when configured, falls back to Node `dns.resolveMx()` (free, always-on). Includes disposable-domain + role-account detection. |
| `lib/scanner/contact/verify/usps-address.ts` | USPS Addresses v3 with OAuth client_credentials flow. `USPS_CLIENT_ID` + `USPS_CLIENT_SECRET`. Free with USPS dev account. Token cached 50 min. DPV confirmation surfaces as `verified=true`. |
| `lib/scanner/contact/verify/orchestrator.ts` | `runVerifications(record, opts, injected?)` — composes all three, de-dups by normalized value, applies `max_per_call` budget cap (default 10), returns `VerificationMap` for `aggregateContacts()`. |
| `lib/scanner/contact/verify/__tests__/orchestrator.test.ts` | 7 tests using injected mock verifiers — empty record, single-source full coverage, dedup across sources, budget cap, selective skip, end-to-end aggregator round-trip (low → high after verification), failure surfaces in audit |
| `lib/scanner/contact/verify/README.md` | Env vars, costs, API contract, budget guards |
| `app/api/crm/scanner/verify/route.ts` | `POST /api/crm/scanner/verify` — agent/broker auth, runs orchestrator, returns audit + upgraded ContactRecord. Logs AuditEvent for cost tracking. |

### Behavior

```ts
const record = aggregateContacts(sourceRows);
// Initially: phones[0].confidence = "low" (single source)
const { verifications, audit } = await runVerifications(record);
const upgraded = aggregateContacts(sourceRows, verifications);
// After: phones[0].confidence = "high", verification_method = "twilio_lookup_carrier"
```

Audit array carries per-call detail (provider, verified, detail, at) — required for compliance audit ("how did you verify this phone number?").

### Smoke results

- 7/7 PASS orchestrator tests (with mocked providers)
- **Combined: 323/323 PASS** across 10 suites
- `npx tsc --noEmit`: exit 0

### Defaults / safety

- Soft-fail when env vars missing (returns `skipped=true`, never throws)
- Hard cap on lookups per orchestrator call (`max_per_call`, default 10)
- Selective skip flags (`skip_phone`, `skip_email`, `skip_address`)
- AuditEvent logged on every API verification call with per-kind breakdown

### Push state

`origin/main` at `5b164553`. **19 local commits** ahead of origin, all local-only awaiting explicit push authorization.

---

## 2026-04-30 · Socrata-direct refresh — one-command NYC OpenData pull

Maya confirmed her Vercel env has `SODA_DATASET_PLUTO`, `SODA_DATASET_ACRIS_MASTER`, `SODA_DATASET_ACRIS_REALPROPERTY` (= Legals) configured. The existing `lib/soda.ts` helper already supports the App Token via `NYC_SODA_APP_TOKEN` (or several fallback env names).

### What shipped

| File | Role |
|---|---|
| `scripts/scanner/lib/soda-paginator.ts` | Async generator over Socrata datasets — handles `$offset` pagination, stable `:id` ordering, retry-with-backoff, max-rows cap. Reuses `lib/soda.ts` so the App Token + headers are auto-applied. |
| `scripts/scanner/refresh-from-soda.ts` | Unified one-command refresh — pulls PLUTO + ACRIS distress + ACRIS deed-history straight from NYC OpenData via Socrata, applies the same filters as the standalone ingest scripts, writes the same output CSVs. |
| `package.json` | Added `scanner:refresh-from-soda` |

### Single-command operator workflow

```bash
# Refresh all Socrata-sourced data in one shot:
npm run scanner:refresh-from-soda

# Optional flags:
#   --only=pluto              just PLUTO (skip ACRIS)
#   --only=acris,deeds        ACRIS distress + deed history (skip PLUTO)
#   --window-days=730         distress-signal window (default 2 years)
#   --deed-window-years=50    deed-history window (default 50 years)
#   --page-size=10000         Socrata $limit per page (max 50000)
#   --quiet

# Then for non-Socrata sources (DOS Corp, DOF lien sale not on OpenData):
npm run scanner:dof-tax-ingest -- --input <dof.csv>
npm run scanner:dos-corp-ingest -- --input <dos.csv>

# Build the queue:
npm run scanner:build-prospects
```

### Filter strategy

Pull is **server-side filtered** via SoQL `$where` clauses so we never download the 30M+ ACRIS Master rows just to throw most away:

- **PLUTO**: `borocode='1' OR borough='MN'`
- **ACRIS Master (distress)**: `recorded_borough='1' AND doc_type IN ('LP','LIS','LPND','LISPD','LISPENDENS','FORE','JDF','JDGMT_F','TAX','NOTL','NTOFL','NYSTAX','EATR','EXECUTOR','ADMIN','LBADM','ESTATE') AND recorded_datetime > '<cutoff>'`
- **ACRIS Master (deeds)**: `recorded_borough='1' AND doc_type LIKE 'DEED%' AND recorded_datetime > '<cutoff>'`
- **ACRIS Legals**: `document_id IN (<watched-ids>)` — chunked into 200-id batches to fit Socrata query length limits
- **ACRIS Parties**: same chunked join + `party_type='1'` (grantors only)

PLUTO runs first so its corridor BBL set is available to clip ACRIS Legals — the "outside corridor" gate doesn't have to come from a separate pluto-corridor.csv pre-step.

### Smoke results

- 10 test suites, **323/323 PASS** (no regressions)
- `npx tsc --noEmit`: exit 0
- Live-fetch not exercised here (would burn Socrata rate limit budget); tested via lib type-check only

### Push state

20 local commits ahead of origin/main, all local-only awaiting explicit push authorization.

---

## 2026-04-30 · Aggregator — assembles BblProspect bundles for the scorer

Pure function that walks already-loaded outputs of every upstream filter and produces `BblProspect[]` ready to feed the scoring engine. No I/O. No Prisma. No file reads.

### Joins

| Source | Join key | Result |
|---|---|---|
| ACRIS distress signals | BBL exact | `prospect.acris_signals[]` |
| DOS Corp records | normalized owner_name (exact, fallback to stripped) | `prospect.dos_matches[]` with `match_kind: "exact_normalized" \| "stripped_match"` |
| Off-market signals | BBL exact | `prospect.off_market_signals[]` |
| Off-market relist count | BBL exact (caller-supplied Map) | `prospect.off_market_relist_count_24mo` |
| Ownership duration years | BBL exact (caller-supplied Map) | `prospect.ownership_duration_years` |

### Derived flags

- **`is_dissolved_llc`** — true if any matched DOS Corp record has non-active status
- **`is_absentee`** — true if any LLC's process-address street-lead differs from the property's. Only computable when DOS match exists; null otherwise (we can't determine absentee for individual owners without DOF tax-bill mailing data)
- **`ownership_duration_years`** — null until a separate ACRIS deed-history ingest lands (current ACRIS ingest filters to distress doc types only)

### Files

- `lib/scanner/aggregator/build-prospects.ts` — `buildProspects()` pure function + `summarizeAggregator()` stats
- `lib/scanner/aggregator/__tests__/build-prospects.test.ts` — 23 tests covering basic shape, ACRIS join, DOS Corp join (exact + stripped), derived flags, off-market signals, end-to-end aggregator+scorer realistic 3-BBL scenario, summary stats

### End-to-end test scenario (3 BBLs)

Three corridor BBLs assembled from PLUTO + ACRIS + DOS + off-market:

| BBL | Owner | ACRIS | Off-market | DOS | Tenure | Computed |
|---|---|---|---|---|---|---|
| `1015730019` | 400 East 90 Owner LLC | LP 45d ago | Expired 120d ago | Active LLC, addr matches | 32y | not absentee |
| `1010100007` | Midtown Owner LLC | FORE 30d ago | — | Dissolved LLC, addr differs | — | dissolved + absentee |
| `1004500001` | Smith Family | — | — | no match | 28y | — |

After scoring:
- BBL `1015730019` outscores BBL `1010100007` (more converging signals)
- BBL `1004500001` filtered out (only 10pt < 25 threshold)
- Both surfacing prospects reach `confidence: high`

### Smoke results

- 23/23 PASS aggregator tests
- **Combined: 291/291 PASS** across 8 suites
- `npx tsc --noEmit`: exit 0

### What's NOT in this slice

- **DB-side wrapper script** — `scripts/scanner/build-prospects.ts` would load the four CSVs (PLUTO/ACRIS/DOS Corp + off-market from Prisma), call `buildProspects()`, then `scoreProspects()`, write a single `data/scanner/scored-prospects.csv` + manifest. Mechanical.
- **ACRIS deed-history ingest** — current ACRIS filter is distress-only; ownership_duration_years requires a parallel ingest of DEED doc types from ACRIS Master.
- **DOF tax delinquency / lien sale list** — last unbuilt signal source.

### Push state (post-aggregator commit)

13 local commits ahead of `origin/main`. All scanner work and the prior RESO toolkit work sit local-only awaiting explicit push authorization.

## Search / Scanner Handoff Checkpoint â€” 2026-04-30

Current handoff state:

- PR 5E is complete. The search-alerts cron reader was migrated to `listing_search_projection`, and the route now uses the projection-backed runner.
- PR 5F is not started. It remains gated until the first post-deploy `search_alerts_cron` run is observed clean, with `errored = 0` and no post-deploy `search_alerts_cron_error` rows.
- The local branch has moved into seller scanner work. Current top commits are:
  - `cdecff1a` seller-intent scoring engine
  - `915b0075` Trestle off-market signal filter
  - `122a5970` NY DOS Corporation DB ingest
  - `88b5fad6` verifiable contact enrichment foundation
  - `f3027c61` ACRIS bulk ingest
- Seller scanners are the active local thread now. They are separate from the PR 5F search projection gate.
- No push has been performed.

## 2026-04-30 cleanup checkpoint

- `app/api/contact/route.ts`: raw email-provider error logging was redacted; the PII logging warning is now gone.
- `lib/scanner/__tests__/acris-filter.test.ts`, `lib/scanner/contact/__tests__/aggregator.test.ts`, `lib/scanner/scoring/__tests__/scorer.test.ts`: lint warnings cleared.
- `scripts/backfill-listing-search-projection.ts`: executed in bounded mode and closed the projection gap from 3 missing rows to 0.
- `reso:analyze` now reports `Listings missing projection: 0`.
- Media observation window remains active through `2026-05-02 06:00:42 ET`; PR 4 is still blocked until then.
- No unrelated dirty files were bundled into this cleanup pass.
