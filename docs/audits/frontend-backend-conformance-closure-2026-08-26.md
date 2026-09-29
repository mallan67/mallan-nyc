# Frontend↔Backend Conformance — Closure Package

**Date:** 2026-08-26
**Branch:** `fix/auth-identity-domain-and-listing-continuity`
**Base (starting SHA):** `45455682` — merge of PR #615, tip of `origin/main` at start
**Ending SHA:** `2b0bfe6b`
**Worktree:** isolated from PR #618. **#618 remains authenticated Search and was not touched.**

**Nine commits · 67 files · +3,056 / −200 · 12 new test suites · 176 new tests.**

Every commit was pushed individually and the remote head verified equal to local
after each push.

---

## What was and was not authorized

**Did not happen, by instruction:** no production deploy, no merge, no production
Neon/R2 work, no destructive DB action, no environment change, no schema
migration, no production backfill, no Cotality write, no change to the held
syndication program, no contamination of PR #618.

**Where a fix would have required any of those**, it is listed under *Open, not
decided* at the end rather than done quietly.

---

## Commits by family

| # | SHA | Family | Headline |
|---|---|---|---|
| 1 | `6525b283` | AUTH P0 | Staff authorization requires the staff identity domain, not a role string |
| 2 | `bb8e70a6` | AUTH P0 (follow-on) | Portal invites scoped to the agent's own client |
| 3 | `a2620927` | Owner continuity | Canonical owner captured at listing create; ownerless publication refused |
| 4 | `545d6917` | Provider-name removal | The forbidden provider name removed from the executable system |
| 5 | `448ca24e` | Market status | Status vocabulary bound to the live Cotality value |
| 6 | `5adec686` | Market status (2/2) | Every backend state reachable in the CRM; §2.05 given one owner |
| 7 | `72344f82` | Visibility / distribution | One visibility layer that always suppresses return-copies |
| 8 | `ab746c88` | Syndication claims | Stop claiming a distribution that does not happen |
| 9 | `2b0bfe6b` | Portal capability | Renters and landlords can see their own record |

---

## Tests by family

| Suite | Tests | Family |
|---|---:|---|
| `auth-identity-domain-boundary` | 36 | 1 |
| `impersonation-boundary` | 9 | 1 |
| `invite-ownership-boundary` | 10 | 1 |
| `owner-continuity` | 14 | 2 |
| `owner-publication-guard` | 8 | 2 |
| `no-legacy-intermediary-name` | 9 | 3 |
| `status-vocabulary-cotality-binding` | 37 | 4 |
| `crm-roster-status-conformance` | 6 | 4 |
| `retention-2-05-terminal-set-single-owner` | 4 | 4 |
| `return-copy-suppression-every-public-set` | 17 | 5 |
| `syndication-claims-must-be-true` | 10 | 6 |
| `portal-role-symmetry-self-scoped` | 16 | 7 |
| **Total** | **176** | |

Full suite at the ending SHA: **426 suites / 7,389 tests, 0 failures, 0 type errors.**

Gate chain at the ending SHA:
`rls:validate` 0 errors 0 unknown · `compliance-check` 95/95 BLOCKER+STRICT ·
`ucba:audit` 0 REGRESSIONS 0 CLAIM_OVERSTATED · `idx:validate` 0 critical ·
`crm:check-build` PASS · `crm:test` 39/39.

---

## Negative security proof

Every family was proved non-vacuous by re-injecting the defect and confirming the
tests go red. Not "the tests pass" — "the tests fail when the bug returns."

| Injection | Result |
|---|---|
| `requireRole` without the `userType !== "agent"` check | 8 / 36 identity tests fail |
| Guard removed but the route-level check kept | 9 / 9 still pass — layers proved independent |
| `listing-urls.ts` reverted to the third-party-named URL field | 3 / 9 census tests fail |
| Alias re-pointed `canceled → Cancelled` | 3 / 37 vocabulary tests fail |
| `Canceled` removed from the retention list | 1 / 37 fails |
| Suppression stripped from the canonical visibility layer | 3 / 17 fail |
| Suppression stripped from the main public search only | 1 / 17 fails |
| `status: "queued", exported: true` restored | 2 / 10 syndication tests fail |
| `publicListingVisibilityWhere` replaced with a bare `idx_display_yn: true` | `compliance-check` BLOCKER-fails — the scanner edit is not a silencer |

### The escalation chain that was closed

Five links, verified end to end: an unvalidated `portal_role` string → written to
`Session.role` → `requireRole` comparing only that string → impersonation minting
a **genuine** staff session → Broker MFA bypassed. Fixed at the trust boundary, so
stale rows already carrying a bad `portal_role` became harmless **without a
backfill**.

A second, distinct P0 surfaced during the same audit and was verified
independently before acting: `POST /api/auth/invite` loaded the target lead by raw
id with no `agent_id` filter, so any authenticated agent could repoint another
agent's client and send them a live portal-invite email. Stated precisely — the
acting agent never sees the raw token, so this is not credential theft; it is an
unauthorised mutation of another agent's client record plus unsolicited contact
with that client.

---

## Owner roundtrip proof

`Listing.owner_client_id` — the single existing column. **No second `seller_id`,
no `landlord_id`, no owner table, no JSON shadow owner.**

- Create accepts `owner_client_id`, parses it, and runs the existing
  `assertLeadAccess` before writing — so an agent cannot attach another agent's
  client as an owner.
- Owner resolution sits at POST function scope, **not** inside `if (rlsEligible)`.
  A test pins that ordering: nesting it there would have skipped owner capture for
  every Mallan exclusive, which is precisely the inventory that has an owner.
- An ownerless listing is a legitimate DRAFT. It is refused only at publication,
  with **409, not 403** — the caller has the authority; the record is not ready.
  That distinction is what tells the CRM to prompt for the owner rather than
  report a permissions problem.
- Scoped to `mls_id === null` so provider-sourced rows are unaffected.

The behavioural test sets `READONLY_MODE = "false"` deliberately: the fail-safe
default is ON, so without it every mutation would 403 before reaching the guard
and the suite would have passed for the wrong reason.

---

## Publication transition proof

- `Draft → Active | ComingSoon` on a Mallan-local listing now passes the owner
  gate, the FARE fee-disclosure gate for rentals, and the capability gate.
- `Pending → Sold | Rented` still requires BROKER and a `ClosePrice` (UCBA C12).
- The transition map carries both spellings of canceled as terminal.
- **The CRM can now display every state the backend produces.** `Draft`, `Sold`
  and `Rented` had no roster badge and no filter button, so a broker could see
  those listings only inside "All". The conformance test extracts both
  vocabularies — the transition machine and `STATUS_INITIAL` from the routes, the
  `statusDefs` keys from `panels.js` — and compares them as sets, guarding its own
  extraction so a regex that stopped matching fails loudly instead of passing.

---

## Cotality status contract proof

Two independent live captures, in agreement, neither asserted from memory:

- `data/cotality-enums.live.json` — pulled **2026-07-05** from
  `https://api.cotality.com/trestle/odata/$metadata`
- `data/cotality-contract/contract.json` — captured **2026-08-18T02:38:06.395Z**,
  `exactOnly`; `Property.StandardStatus` selectable + filterable
  `VERIFIED_SUPPORTED` with request, HTTP status, observedAt and digest;
  filterable count 591,132; the `Canceled` lookup row carries
  `standardValue "Canceled"`, `legacyODataValue "Canceled"`, `resoStandard true`

`StandardStatus` has exactly 11 members: Active, ActiveUnderContract, **Canceled**,
Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn.
**There is no double-L member.**

The test imports `STANDARD_STATUS_MEMBERS` from the existing drift-bound live-truth
projection rather than hardcoding the list, so when Cotality changes, the test
changes with it. It does **not** import that module into runtime code — the
canonical package is deliberately NOT WIRED, and `canonical-a1-contract` enforces
that by scanning for the path.

### What the split actually cost

`Cancelled` was not a Cotality value. Two comments asserted the opposite — the
provider's real value was filed as "Common typo / alternate spelling". The two
writers into `listings.status` disagreed: the Trestle sync stores
`raw.StandardStatus` **verbatim** (`Canceled`), the CRM path stored the invention
(`Cancelled`). One column, both spellings, decided by which writer created the row.

| Where | What it cost |
|---|---|
| `data-retention` cron T+30 / T+180 | Rows the PROVIDER marked canceled matched neither predicate |
| `data-retention` §2.05 24-hour step | A **seventh** copy of the list, inline, in the same file as the const it duplicated — so `idx_display_yn` was never flipped on those rows. This is display compliance, not archival. |
| `scripts/archive-backlog-predicate.js` | An **eighth** copy — ops-health reported a backlog smaller than the real one |
| `lib/syndication/eligibility.ts` | A provider-canceled row read as NON-terminal (latent; program held closed) |
| `lib/compliance/dom-tracker.ts` | A provider-canceled period never triggered the UCBA Art. I §11 DOM reset |
| CRM agent roster | Counted Cotality rows, missed every CRM-written one |

**Not claimed:** none of this was a public-display leak. All three public read
paths are allow-lists — `buildSearchDisplayWhere`, `buildProjectionSearchWhere`,
`filterDisplayableDbListings` — so an unknown or misspelled status fails closed.
`PUBLIC_LISTING_GATE`, the one deny-list-shaped gate that WOULD fail open on
`Hold`, has **zero consumers**: dead code and a trap for the next reader, not an
exposure.

Corroboration that the hazard was known: three files already carried BOTH
spellings defensively, and `scripts/backfill-terminal-since.ts` had identified it
exactly ("a stored 'Canceled' … would silently skip it") — the only place in the
repo that had it right.

**The no-backfill invariant.** Real rows carry both spellings and no backfill was
in scope, so the property implemented and tested is not "everything says Canceled"
— it is *a `Canceled` row and a `Cancelled` row reach the same decision at every
gate, forever*. Writes converge on the provider spelling; every reader keeps
accepting the legacy one permanently.

---

## the legacy upstream intermediary census

`buildListingUrls` returned a third-party-named URL field, implemented as
`isActive ? publicUrl : null` — Mallan's own canonical URL under a foreign
provider's name, carried through three CRM write DTOs and rendered in the sale
form as a labelled "legacy-intermediary listing URL" panel with its own copy button. Wrong twice:
forbidden name, and it described the wrong thing.

| Surface | Before | After |
|---|---:|---:|
| `lib/crm/listing-urls.ts` | field returned | removed |
| `app/api/crm/listings/route.ts` | 4 | 0 |
| `app/api/crm/listings/[id]/route.ts` | 2 | 0 |
| `app/api/crm/listings/[id]/status/route.ts` | 2 | 0 |
| `public/crm/SALE-FORM-REDESIGN.html` | 15 | 0 executable |
| `public/crm/index-built.html` (served) | — | **0** |

**Not renamed to a Cotality URL.** No verified Cotality URL is represented by that
value; swapping one provider fiction for another is the same defect in new
clothes. The one real behaviour — expose the URL only while the listing is live —
survives as `publicActiveUrl`.

**Deliberately retained:** comments in `mallan-source-identity.ts`,
`dedupe-crm-vs-idx.ts` and `syndication/mallan-identity.ts` describing the
EXTERNAL workflow (Mallan → the legacy upstream intermediary → REBNY RLS → return-copy). That prose is
why `trestleExcludeMallanReturnCopiesClause` exists; deleting it would remove the
reasoning behind real suppression logic. The rule enforced is that the legacy upstream intermediary may
not appear in an **executable** contract.

---

## Visibility / distribution

`SEARCH_DISPLAY_GATE` was exported as half a visibility decision — four gate
columns, no status allow-list, no return-copy suppression — and seven surfaces
spread it directly. Exactly one remembered to re-add the suppression by hand.
Four client-facing surfaces did not, and every Mallan listing that had
round-tripped through RLS was counted twice in each: **the CMA a broker hands a
seller**, neighborhood medians, buyer recommendations, portal comparables.

The main public search was worse in kind: `buildPublicListingDbSearch` took only
`buildSearchDisplayWhere().status`, and suppression was attempted afterwards by a
JS dedupe running **after** `skip`/`take` — the page-local failure the fragment's
own docstring warns about. Same-page twins collapsed; a pair split across two
pages did not, and `total` counted both.

`publicListingVisibilityWhere()` is now the one layer: gates **and** suppression,
and deliberately no status, because bundling one is what pushed callers back onto
the bare gate.

Separately: `lib/cma/engine.ts` matched `{ status: 'Closed' }` only. A Mallan-local
listing never reaches `Closed` — the CRM writes `Sold`/`Rented`. **A CMA was
silently omitting the brokerage's own closed sales**: the comps most relevant to
the seller and the ones the broker has first-hand knowledge of.

---

## Syndication claims

The CRM offered "Refresh Syndication" and toasted **"Syndication refresh queued"**,
because the route answered `{ status: "queued" }` under a comment naming a cron.
Verified: nothing reads the audit event it writes, **no cron path matches
syndication or export**, there is no `app/api/exports/**`, and
`MALLAN_OFFICE_MLS_IDS` is empty so invariant I.5 blocks every row at Layer 1.

Nothing was queued. The natural next step after reading "queued" is telling a
seller their listing has been re-published to the portals — a representation made
to a client on the strength of a status this system invented.

REQUESTED, EXPORTED and DELIVERED are three different facts. The route now
answers `{ status: "recorded", exported: false, reason: "SYNDICATION_NOT_CONFIGURED" }`,
**derived from the config guard** so it self-corrects when Maya enables the
program. Audit logging is unchanged — the event still fires, now with the
configured state recorded alongside it.

Second claim: `data-loader.js` hardcoded `syndication: true` while every sibling
permission was derived from the row, and there is no syndicate field in the DTO to
derive it from. `pagination.js` rendered a literal **"Syndication: Yes"** on every
listing. The hardcode is gone; absent now reads "Not configured" rather than a
bare "No" that would look like a per-listing switch.

**Syndication itself remains held. Nothing here enables it.**

---

## Open — NOT decided here

These are Maya's calls or need authorization this work did not have. None were
changed.

1. **An AGENT, not only a BROKER, can publish.** `Draft → Active` on a
   Mallan-local listing has no review state between the two. Whether a brokerage
   wants one is a product decision, not a defect.
2. **`Delete` is recognised but not terminal.** It is a live Cotality status
   ("the listing contract was never valid"). Promoting it would make it
   archive-eligible, and archival strips media — destructive, needs authorization.
3. **`Hold` deliberately stays non-terminal.** Cotality says it is expected back
   on market; marking it terminal would stamp `terminal_since` and tell
   feed-reconcile it departed.
4. **"Last Published" shows a provider-sync timestamp.** It reads
   `publishedAt || published_at || syncedAt`, so with no publication timestamp it
   labels the Cotality sync time as a publication. Fixing it needs a real
   publication timestamp to exist — a schema question.
5. **`PUBLIC_LISTING_GATE` / `PORTAL_LISTING_GATE` are dead code** with a
   fail-open (deny-list) shape and both canceled spellings. Zero consumers today.
   Left in place rather than deleted unasked; they are a trap for the next reader.
6. **`Leased` has no writer.** It survives only in read-side sets. Left as a
   defensive value.
7. **Existing rows still carry the legacy `Cancelled`.** Deliberately not
   backfilled — the invariant makes them harmless.
8. **PR 5B, external inventory, and syndication remain HELD** per CLAUDE.md §C.

## A process note

The the legacy upstream intermediary impact group was selected by **filename pattern**, and
`tests/runtime/sales-333-e-46th.test.ts` — which referenced the removed field —
never ran. It was caught one commit later and fixed in `448ca24e`. Every
subsequent family was verified against the **whole suite** rather than a pattern.
Recorded because the failure mode is easy to repeat: a filename is not an import
graph.

---

# AMENDMENT — 2026-08-27 · A2 schema correction, A3 owner capabilities, A4 end-to-end proof

**Amends this document rather than opening a new master audit, per
`docs/claude-instructions/CURRENT.md` A5.**

**Head at amendment:** `a415b1da` · local == remote, pushed after each commit.
**Since the `2b0bfe6b` closure:** 139 files, +10,482 / −1,127 (includes the three
directive commits and the A0/A1/A2 work that followed the original package).

**Three commits in this amendment:**

| SHA | What |
|---|---|
| `ce60e048` | `listings.status` nullable — market status stops meaning Active |
| `79b771ca` | Seller/Landlord capabilities resolve through `owner_client_id` |
| `a415b1da` | Sale + Rental workflows proven end to end through the real routes |

---

## A2 — the schema defect, corrected under authorization

Maya authorized the minimal `Listing.status` correction on 2026-08-27
(`c1ccd32e`). Scope taken, exactly: schema edit, one migration, all affected
readers/writers/types/tests, and behavioural proof. Nothing else.

`listings.status` holds the Cotality market fact (`Property.StandardStatus`). It
was `TEXT NOT NULL DEFAULT 'Active'`, so a Mallan-authored listing that had never
been on the market still had to store SOME market status — and Mallan wrote
`Draft`, a Mallan publication word that is not a StandardStatus member. The
default was the other half of the defect: every INSERT that omitted the column
silently claimed the listing was `Active`.

**NULL now means exactly one thing: this listing has no market status yet.**
Mallan publication state lives only in `Listing.compliance.mallan_publication`.

### What the nullable column exposed

Three fail-OPEN defaults were unreachable while the column was NOT NULL and
became reachable from every unpublished listing the moment it was not. All three
are corrected in `ce60e048`:

| Where | Was | Now |
|---|---|---|
| `normalizeStandardStatus` | absent input → `'Active'` | absent input → `''` — a member of no status set, so every allow-list gate downstream fails closed with no caller change |
| `computeGateColumns` | DENY-list on terminal statuses, so "no market status" was not terminal and would have published | requires a real market status before `idx_display_yn` |
| `UI.statusBadge` (+5 more CRM surfaces) | `status \|\| 'active'` — every listing an agent had just created was shown to them as a green **Active** badge | `status \|\| 'Draft'`, with a repo sweep pinning that no CRM surface reads an absent listing status as Active |

`app/api/idx/ensure-listing` used the normalizer's value for BOTH the stored
status and `idx_display_yn`, so a request omitting the status created a
**publicly displayable row asserting a market status the provider never sent**.
That is the same defect class as the mapper's `raw.StandardStatus ||
raw.MlsStatus || "Active"`, which is also gone.

### The no-backfill invariant, enforced rather than asserted

Rows created before this change still carry `Draft`, `Sold`, `Rented`, `Leased`
and `Cancelled`. A stored `Draft` and a NULL now reach the same decision at every
gate: public DTO, display gates, open houses, agent pages, the transition
machine, retention, the CRM roster bucket, and the status badge. The CRM roster
uses ONE predicate (`_hasNoMarketStatus`) for both the button count and the rows
behind it, so the count and the list cannot disagree.

A targeted cleanup plan is **prepared and NOT executed**:
`docs/operations/legacy-draft-status-cleanup-plan-2026-08-27.md` — eligibility
predicate, dry-run counts, the proof obligation that no Cotality-owned row
matches, before/after invariants, and an exact row-for-row rollback. It also says
plainly that the cleanup is **optional**: the code already makes both spellings
equivalent, so it buys vocabulary hygiene, not correctness.

### Three existing contract tests were amended, each with its reason in place

`h1-normalize-standard-status`, `compute-gate-columns` and
`c2-terminal-idx-display` all pinned the fail-open defaults above. Amending a
test that pins a defect is not silencing a regression: the replacement assertions
are strictly stricter, and the rationale is recorded at the assertion rather than
in a commit message nobody will read again.

---

## A3 — Seller/Landlord capabilities on the canonical relation

`Listing.owner_client_id` is the only Seller/Landlord relation.
`Lead.active_sale_listing_id` / `active_rental_listing_id` are plain nullable
String columns with no FK, no unique constraint and no index — a HINT about which
owned listing is current, never an authorization boundary.

Most owner-facing routes already gated on `canAccessOwnerListing`. **Three did
not**, and all three are fixed in `79b771ca`:

1. **`POST /api/portal/seller/signals`** and
2. **`POST /api/portal/landlord/signals`** — `payload.listing_id || lead.active_*_listing_id`.
   The first term is caller-supplied and was never checked. An owner could attach
   their pricing feedback, valuation request and readiness signals to **any**
   listing id — another owner's, or a Cotality-sourced row — and the value lands
   in `PortalEvent.listing_id`, which is Mallan's own activity/audit history and
   what the agent's CRM signal panels read. A false attribution there is a wrong
   record in the trail, not a display bug.
3. **`GET /api/portal/landlord/relist`** — read a listing's market status straight
   off the hint with no ownership clause, so a stale or foreign value returned
   **another listing's status** to this landlord.

All three now resolve through `owner_client_id` as the query's `WHERE`. An
explicitly named listing the caller does not own is refused
`403 LISTING_NOT_OWNED` and nothing is written; it is never silently downgraded
to the fallback, which would record a DIFFERENT listing than the caller asked for
and hide the refusal.

### Capability status against the A3 list

| Capability | State |
|---|---|
| view | ✅ dashboards resolve via `resolveOwnerListing` |
| comments | ✅ gated on `canAccessOwnerListing` |
| **documents** | ⛔ **501 `PORTAL_DOCUMENTS_PENDING_CLIENT_SCOPE`** — see below |
| correction requests | ✅ new `POST /api/portal/owner-requests` |
| pricing feedback | ✅ seller signals, now ownership-scoped |
| marketing approval | ✅ new owner-request kind; records the decision, changes nothing |
| showing coordination | ✅ owners record availability; staff schedules |
| publication request/approval | ✅ owner may SUBMIT and RESUBMIT; only BROKER approves and chooses scope |

**Documents is the one genuine gap, and it is not fixable in this scope.** The
route fails loud rather than guessing: `Deal`/`Document` have no client-scoped
FK, and scoping by `agent_id` + address string leaks across clients who share an
agent. It needs `Deal.client_id`, which the schema authorization explicitly
excludes. Recorded, not worked around.

### The invariant the new route implements

> "Owner portal users do not directly mutate regulated canonical listing facts
> merely for convenience. Durable owner requests/actions belong in Mallan
> CRM/audit history and authorized staff applies the canonical change."

`POST /api/portal/owner-requests` writes to `PortalEvent` and the audit log and
nothing else. A repo sweep pins that **no route under `app/api/portal/` writes to
the `listing` model at all.**

---

## A4 — the end-to-end behavioural proof

The directive forbids substituting source-string assertions here. Every step
calls the **actual exported route handler**, and the next step reads back through
another actual handler.

### What made that possible

`buildPrismaMock` answers each call from a fixed seed, so `findUnique` returns
the same constant no matter what a preceding `update` wrote. "Create, reload,
verify no silent data loss" would pass against it **with the persistence layer
deleted**. `tests/runtime/support/in-memory-prisma.ts` is a small in-memory
database instead: writes mutate rows, reads query them, and the only thing
between two steps is the store. It throws LOUDLY on any Prisma surface it does
not model, because a silent `[]` is exactly how a workflow test goes green while
proving nothing.

### The chain — 16 steps, run for Sale AND Rental (32 assertions)

create with canonical owner → **status NULL + publication DRAFT** → reload →
edit → reload with no loss elsewhere → submit → **agent refused broker approval**
→ broker approves → **discriminatory copy blocks PUBLIC publication with explicit
reasons** → copy fixed → broker chooses `PUBLIC_WEB` → market status NULL →
Active → Pending → reload → public consumer resolves the same identity under its
own gate.

### The nine mandatory negatives (20 assertions)

no owner · null market status · discriminatory content · agent vs broker
authority · another agent hijacking the owner relation · Cotality row read-only ·
return-copy not competing with the canonical local listing · a failed save that
cannot look like it persisted · provider sync unable to erase Mallan owner,
publication or history.

### What the E2E itself surfaced

- **`APPROVED` is an INTERNAL state.** The machine refuses a public audience
  there, because approving a listing is not publishing it — visibility is chosen
  at `PUBLISHED_PUBLIC`. The first draft of the test assumed otherwise and the
  route corrected it.
- **The CRM create route already refuses discriminatory copy with 422**, so the
  publish-time gate is the second line, not the only one.
- **The routes read canonical RESO field names** (`ListPrice`, `BedroomsTotal`,
  flat address fields). Column names and a nested `address` object store nothing
  — and a workflow asserting on values it never managed to save proves nothing.

### Injection-tested, so the suite is observing rather than describing

| Guard reverted | Result |
|---|---|
| `STATUS_INITIAL` back to `"Draft"` | 7 of 52 E2E assertions red |
| ownership `WHERE` dropped from `resolveOwnedListingId` | 5 of 25 owner assertions red |
| one CRM `status \|\| 'Active'` restored | CRM sweep red, naming the exact file |

---

## Gate results at `a415b1da`

| Gate | Result | What it proves — and what it does not |
|---|---|---|
| `npx jest` | **443 suites / 7,762 tests pass**, 6 suites / 32 tests skipped | The branch's own behaviour. NOT that anything is live on Cotality. |
| `npm run type-check` | **0 errors** | Every reader/writer compiles against the nullable column. Not a runtime claim. |
| `npm run rls:validate` | **0 errors, 1 warning, 0 unknown** | Static RLS binding rules pass. NOT that any field is live on Cotality. |
| `npm run compliance-check` | **95 passed / 0 failed** (BLOCKER+STRICT) | Includes `schema/migration coupling — schema change paired with migration`, which only became true once the pair was committed. |
| `npm run ucba:audit` | **0 REGRESSIONS, 0 CLAIM_OVERSTATED** | No UCBA rule regressed. |
| `npm run idx:validate` | **1,281 pass · 0 critical · 4 warning** | IDX Plus static sections. Not a live-feed claim. |
| `npm run crm:build` | rebuilt; `index-built.html` regenerated | The generated bundle matches its sources. |
| `npm run crm:test` | **39/39** | CRM smoke. Not a browser-rendering claim. |

---

## Operational holds — stated exactly, not relabelled

1. **The migration is NOT applied to Production.**
   `prisma/migrations/20260827090000_listings_status_nullable_market_status` is
   hand-authored (no shadow DB available) and contains exactly two catalog-only
   statements — `DROP NOT NULL` and `DROP DEFAULT`. No table scan, no heap
   rewrite, no row read or written. NEON.md restricts `listings` migrations to
   the **3–5 AM ET window**; this work ran ~09:00–14:00 ET.
   **The code in `ce60e048` assumes the migration is applied. Apply it manually
   in the window, confirm with `migrate status`, then merge.**

2. **`npm run ops:health` was NOT run, and `[neon-preflight: OK]` is deliberately
   NOT asserted.** This worktree has no `DATABASE_URL`, so drift check,
   `migrate deploy`, `migrate status` and live E2E cannot run from here. Writing
   the token without running the check would be a false claim.

3. **No authenticated Preview / browser proof.** A5 requires Sale and Rental on
   desktop + tablet + mobile breakpoints against an authenticated Preview. That
   needs a deploy, which is not authorized. **The A4 proof is BRANCH-LOCAL and is
   not labelled Preview or Production proof.**

4. **No independent CI evidence is available for this branch.**
   `.github/workflows/pr-check.yml` triggers on `pull_request` only, and this
   branch has no PR. Opening one (`gh pr create --draft`) would produce CI
   evidence without merging — every other PR in this repo is DRAFT — but opening
   a PR is outward-facing and is **left for Maya to authorize**.

5. **The legacy `Draft` cleanup is prepared and not executed.** No production row
   has been read or written by it.

---

## Amendments to the earlier "Open — NOT decided here" list

Three items on that list are now **closed**:

- **Item 1 — "An AGENT, not only a BROKER, can publish."** Closed. The
  publication state machine makes APPROVED, PUBLISHED_INTERNAL and
  PUBLISHED_PUBLIC **BROKER-only**, and the E2E proves an agent is refused with
  `403 ACTOR_NOT_PERMITTED` at both points. Maya's correction stands: this was a
  skipped step the spec marks a BLOCKER, not a product decision.
- **Item 4 — "Last Published shows a provider-sync timestamp."** Closed.
  `lastPublishedAt()` reads the publication history and returns the latest
  transition INTO a public state; the E2E asserts it is a real, parseable
  timestamp produced by the transition itself.
- **Item 5 — dead `PUBLIC_LISTING_GATE` / `PORTAL_LISTING_GATE`.** Closed
  earlier in `48848a52` (deleted).

Items 2, 3, 6, 7 and 8 stand unchanged.

---

## What A5 still requires

| A5 requirement | State |
|---|---|
| schema defect corrected in Prisma + migration | ✅ `ce60e048` |
| all Listing market-status readers/writers updated | ✅ type-check drove the full trace; 0 errors |
| owner selector E2E proven in Sale and Rental | ✅ `3460bcc0` + A4 chain |
| Seller/Landlord workflow proven | ✅ `79b771ca` + A4 |
| grouped tests green | ✅ |
| relevant full suite green | ✅ 443 suites / 7,762 tests |
| type-check green | ✅ 0 errors |
| compliance / publication / UCBA / public-visibility gates green | ✅ |
| CRM build green | ✅ |
| **authenticated Preview proof, desktop + tablet + mobile** | ⛔ **HELD — needs a deploy** |
| **independent CI evidence** | ⛔ **HELD — needs a PR** |
| closure document amended with actual evidence | ✅ this section |
