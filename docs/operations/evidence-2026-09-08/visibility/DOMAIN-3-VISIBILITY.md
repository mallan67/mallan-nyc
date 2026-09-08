# Domain 3 — permissions and visibility: the provider fact, the Mallan decisions, the audience (2026-09-08)

Scope: who may see a listing — the provider's `Permission` fact, Mallan's own decisions (`owner_opt_out`,
`participant_only`), and the audience of every surface (public site, public alert subscribers and leads,
authenticated REBNY participants). Provider truth measured live on the whole corpus; the provider's own member
definitions read from its documentation.

## 1. Provider facts (live)

| Fact | Value | Source |
|---|---|---|
| `Property.Permission` | Multi-enum `ListingPermission`, 18 declared members, RLS field, populated on 591,607 / 591,607 rows | live contract snapshot 2026-09-08 |
| Members observed on the feed | `IDX` 591,597 · `OfficeInactive` 68,860 · `SyndicateOptOut` 9,436 — every row carries `IDX`; combinations: `IDX`, `IDX,OfficeInactive`, `IDX,SyndicateOptOut`, `IDX,SyndicateOptOut,OfficeInactive` | enum-member census, observed vocabulary (all statuses) |
| `Private` on the feed | 0 rows | census |
| On-market rows with an extra token | Active 0 · ComingSoon 0 · **Pending `IDX,SyndicateOptOut` 2** · Pending `IDX,OfficeInactive` 0 | live `$count` 2026-09-08 |
| Provider definitions | `IDX` "okay for IDX use" · `Private` "private and should have limited distribution" · `Public` "may be viewed by the public" · `AgentOnly` / `OfficeOnly` / `FirmOnly` "for … use only" · `VOW` "okay for VOW use" · **no definition** for `SyndicateOptOut`, `OfficeInactive`, `Officeidxoptout`, `PhotoOptedOut`, `History` | trestle-documentation.corelogic.com/metadata/enumerations/P-S |
| Stored corpus | Pending `IDX,OfficeInactive` 4 and `IDX,SyndicateOptOut` 2, all `idx_display_yn = true`; Withdrawn 3 | Neon read-only 2026-09-08 |

The STEP3 ledger's "4,000-row sample shows only IDX" understated the corpus: 78,296 rows carry an extra token, almost
all Closed. What matters for display is the on-market population above.

## 2. What was wrong (proven) and what changed

| # | Defect | Fix | Test |
|---|---|---|---|
| 1 | Public DB filter returned `true` for every website-only row (`rls_eligible = false`) before the owner-opt-out and participants-only gates — provenance bypassed Mallan's own decisions (ledger §13.4). | `filterDisplayableDbListings` applies `owner_opt_out` / `participant_only` before the provenance split; the public DB builder's website-only branch requires both false. | `lib/idx/__tests__/public-display-mallan-decisions.test.ts`, `public-listing-db.test.ts` |
| 2 | The backend Search engine's provider gate rejected every non-IDX token for every caller, so a `Private` row would be hidden from the authenticated agent search — the one audience it exists for — while the same engine also serves public alert subscribers (ledger §13.3). | `providerRowPassesGate(raw, audience)`: public blocks participants-only; member (authenticated REBNY participant) sees it; every other non-IDX token stays fail-closed for every audience. Audience threaded through `ExecuteOptions` → `HydrateOptions`; undeclared = public. Callers: `/api/idx/search` and CRM saved-search execution = member; the alert cron = member only for an agent-only alert, public for a lead-linked or subscriber alert. | `lib/search/__tests__/hydrate-audience-gate.test.ts`, `tests/runtime/search-audience-wiring.test.ts` |
| 3 | The upcoming-open-houses feed emitted an `addressKey` for address-suppressed listings (the route gates it). | Gated on `addressDisplayable`; the twin merge falls back to listingId. | `search-audience-wiring.test.ts` |
| 4 | Fair Housing: provider members such as `NearSchools` / `SeniorCommunityYN` exist in the contract vocabulary. | Verified: the public amenity rendering is whitelist-only (`APPROVED_AMENITIES`, no school / senior / family keys); nothing renders those members. No change needed; the CI guardrail no longer scans the provider vocabulary snapshot as advertising copy (Domain 2). | source read |

## 3. Decision for Maya — extra Permission tokens on on-market rows

The mapper's rule (owner ruling 2026-09-06/07) is "display is permitted only when **every** token is `IDX`; any other
token fails closed". The provider documents no meaning for `SyndicateOptOut` or `OfficeInactive`, so the rule was not
changed. Its measured effect today:

- 2 live Pending rows (`IDX,SyndicateOptOut`) — now that In Contract is public, they are hidden on the next re-emit;
- 4 stored Pending rows (`IDX,OfficeInactive`) currently `idx_display_yn = true` — hidden on their next re-emit.

If REBNY confirms that `SyndicateOptOut` concerns third-party syndication only and `OfficeInactive` the office's MLS
status (neither withdrawing IDX display permission while `IDX` is present), the rule becomes "IDX token present" and
those rows display. Ask rlssupport@rebny.com / 212-616-5270; until then the rows stay hidden (fail-closed).

## 4. Still open (later domains)

- `countSearch` (saved-search counts) counts the universe without the provider gate, so a count can exceed the
  hydrated page by the gate-excluded rows (already reported as `countMeaning: lower_bound` on execution).
- Private sharing / member distribution surfaces (listing-sends, campaigns, portals) are not yet traced against the
  audience model (ledger §13.5 row 3 — UNVERIFIED).
- The DOM accrual set contradiction (Domain 1) is unchanged.
