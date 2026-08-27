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
