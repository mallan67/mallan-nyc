# Sentinel-L rule retention matrix (removal proof)

Removing the Sentinel-L static regex scanner (branch `chore/remove-sentinel-l`, off `main` `7b3dbe1d`). This matrix independently verifies (by direct reading — NOT the background agent, which mis-graded S-BE-005/S-SAVED-012/S-BACKSEARCH-012/S-AGENT-006/S-MEDIA-004) that every one of the **18 implemented** detector rules (not the 191 catalog identifiers — 173 have no detector) has adequate retained coverage.

**Classification** — each rule is classified as exactly one of:
- **exact-behavioral** — a test that executes the same failure path.
- **exact-source-contract** — a source-contract test asserting the specific guard/shape the rule protects (the established pattern for static HTML forms + route contracts).
- **partial/downstream** — the exact failure is not directly asserted, but the compliance-critical consequence is protected downstream.
- **deliberate-design** — the rule flags a pattern that is an accepted, documented design decision.
- **obsolete/nonexistent** — the behavior the rule's proof describes does not exist in the code.
- **missing** — no meaningful coverage (→ a focused replacement test is added in this PR).

**Standards:** a test inside `sentinel-l-platform-scanner.test.ts` does NOT count (it is deleted). "Covered" is claimed only when the retained test exercises the SAME failure.

| # | Rule | Intended failure | Classification | Retained/added test · case |
|---|---|---|---|---|
| 1 | S-RENT-001 | Malformed `/crm/login.html;` redirect breaks rental form parse | exact-source-contract | `rental-form-p0-fixes.test.ts` · "no unterminated /crm/login.html redirect remains" |
| 2 | S-SALE-006 | Sale address parsing drops StreetDirPrefix | exact-behavioral | `sales-333-e-46th.test.ts` · both address forms → `StreetDirPrefix='E'`, same canonical |
| 3 | S-RENT-005 | Rental edit reload prefers lossy raw_data over canonical | exact-source-contract | **ADDED** `rental-edit-canonical-address.test.ts` · hydration reads canonical `addr.StreetDirPrefix`; rejects `raw_data.StreetDirPrefix \|\| addr` |
| 4 | S-BE-006 | CRM success response omits URL/eligibility contract | exact-behavioral | `crm-listing-publish-contract.test.ts` · "201 success response includes the full URL + eligibility contract" (6 fields) |
| 5 | S-BE-005 | Status route swallows projection dual-write failure, returns success | deliberate-design | **ADDED** `status-route-projection-best-effort.test.ts` · documents the approved best-effort dual-write (AuditEvent + cron reconciliation; does not block the status change). Route comment L260-265. Scanner regex never fired here (false negative). |
| 6 | S-DB-010 | Edit-mode POST (duplicate) instead of PATCH | exact-source-contract | `crm-form-field-roundtrip.test.ts` · "edit mode checks _saleEditDbId for PATCH vs POST" (static-HTML form; behavioral would need a jsdom harness) |
| 7 | S-DB-008 | Browser localStorage draft shadows DB listing in edit | exact-source-contract | `rental-form-p0-fixes.test.ts` · "edit-mode guard appears BEFORE the localStorage draft write" / "loadRentalDraft skips the browser draft when editing a DB listing" |
| 8 | S-AGENT-006 | Session agent overwrites listing-agent field on edit hydration | exact-source-contract | **ADDED** `crm-listing-protections-migrated.test.ts` · "guards the listing-agent write behind an existing-value check" (SALE-FORM L4884/L9135). (Prior mapping `crm-patch-typed-attribution-preserve` is BACKEND PATCH — adjacent, not the exact frontend-hydration failure.) |
| 9 | S-MEDIA-004 | Existing server media re-uploaded as new (duplicate photos) | exact-source-contract | **ADDED** `crm-listing-protections-migrated.test.ts` · "upload payload is built from pendingMedia (new files), not existing server media". (Prior mapping `media-display-p0` is BACKEND dedup — downstream, not the form-payload failure.) |
| 10 | S-MEDIA-005 | Floorplan/video treated as photo → hero | exact-behavioral | `lib/media/__tests__/floorplan-hero-contract.test.ts` (floor plan never classified/heroed as photo) + `media-display-p0.test.ts` "floor plan is never the hero" |
| 11 | S-PUBSEARCH-001 | Public search strips StreetDirPrefix | exact-behavioral | `sales-333-e-46th.test.ts` · both forms normalize to `StreetDirPrefix='E'`, same canonical |
| 12 | S-PUBSEARCH-008 | Public link emits non-canonical `/listing/{id}` | exact-behavioral | `agent-listing-identity-cotality-url.test.ts` · emitters no longer emit `/listing/${…}`; url via `buildCanonicalListingPath` |
| 13 | S-BACKSEARCH-009 | Backend `where:` filters on public display-gate columns | exact-source-contract | **ADDED** `crm-listing-protections-migrated.test.ts` · "filters by broker ownership (agent_id), not by public display gates" (asserts no display-gate column as a `where:` key). (Prior mapping `crm-my-listings-filter` does not assert the display-gate exclusion.) |
| 14 | S-BACKSEARCH-012 | Hidden agent ID `= mlsId \|\| ""` (name fills, ID empty) | partial/downstream (+ obsolete form-block) | `syndication-eligibility.test.ts` · "blocks when both ListOfficeMlsId and ListAgentMlsId are empty on a Trestle row" (the compliance-critical RLS gate). The form-level submit-block the rule's proof describes is **obsolete/nonexistent** (0 `blockSubmit`/"Validate agent" in either form; the scanner's line-256 was a hypothetical fixture). |
| 15 | S-BUILDING-005 | Building label lacks structured direction/postal atoms | exact-source-contract | **ADDED** `crm-listing-protections-migrated.test.ts` · "building search response carries StreetDirPrefix + PostalCode". (Prior mapping `building-address-filter` tests the QUERY filter, not the response shape.) |
| 16 | S-SAVED-012 | Saved-search alert send lacks display-gate | exact-source-contract | **ADDED** `crm-listing-protections-migrated.test.ts` · "alert-send path uses runProjectionListingSearch (display-gated), not a raw query" (`app/api/cron/search-alerts/route.ts:110`). (Criteria-gate `saved-search-alert-gate.test.ts` is adjacent.) |
| 17 | S-URL-001 | Canonical URL emits id-only for address-displayable listing | exact-behavioral | `sales-333-e-46th.test.ts` · "never returns generic /listing/sl-XXXX"; `listing-public-address-mallan-exclusive.test.ts` |
| 18 | S-COMP-001 | Public URL/metadata from raw address atoms w/o display guard | exact-behavioral | `listing-public-address-mallan-exclusive.test.ts` · "SUPPRESSED address emits /listing/listing-{id} (no address leak)" |

## Classification tally (all 18)
- **exact-behavioral: 7** — S-SALE-006, S-BE-006, S-MEDIA-005, S-PUBSEARCH-001, S-PUBSEARCH-008, S-URL-001, S-COMP-001.
- **exact-source-contract: 9** — S-RENT-001, S-RENT-005*, S-DB-010, S-DB-008, S-AGENT-006*, S-MEDIA-004*, S-BACKSEARCH-009*, S-BUILDING-005*, S-SAVED-012*.
- **deliberate-design: 1** — S-BE-005* (documented best-effort dual-write).
- **partial/downstream (+ obsolete form-block): 1** — S-BACKSEARCH-012 (compliance-critical protection survives; the form UX guard never existed).
- **missing: 0.**

`*` = focused replacement test added in this PR (7 rules across 3 new files). Every replacement asserts the EXACT failure the rule guarded, and each was confirmed green before any Sentinel-L file was deleted. No weak coverage-count filler was added.

## Why removal is safe
The scanner reported 0 actionable errors while its S-BE-005 regex did not fire on the route it targets (a false negative), and its own comments document repeated false-positive tightenings — it is not a reliable gate. The retained focused tests are stronger and specific, and remain green after the scanner is gone.
