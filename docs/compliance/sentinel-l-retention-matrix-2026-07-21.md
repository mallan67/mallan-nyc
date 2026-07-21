# Sentinel-L rule retention matrix (removal proof)

Removing the Sentinel-L static regex scanner (branch `chore/remove-sentinel-l`, off `main` `7b3dbe1d`). This matrix independently verifies that every one of the **18 implemented** detector rules (not the 191 catalog identifiers — 173 catalog codes have no detector) is either (a) already covered by an independent test that survives deletion, or (b) has a new focused replacement test added here, or (c) protects an accepted/deliberate behavior documented as such.

**Standards applied:** a test inside `sentinel-l-platform-scanner.test.ts` does NOT count (it is deleted). Behavioral/contract > source-contract > regex-only. Verified by direct reading, not the background agent (which mis-graded S-BE-005, S-SAVED-012, and S-BACKSEARCH-012).

| # | Rule | Intended failure | Retained test (file · case) | Type | Survives delete | Replacement |
|---|---|---|---|---|---|---|
| 1 | S-RENT-001 | Malformed `/crm/login.html;` redirect breaks rental form parse | `rental-form-p0-fixes.test.ts` · "no unterminated /crm/login.html redirect remains" | source-contract | ✅ | none |
| 2 | S-SALE-006 | Sale address parsing drops StreetDirPrefix | `sales-333-e-46th.test.ts` · "333 E 46th St" and "333 East 46th Street" both → `StreetDirPrefix='E'`, same canonical | behavioral | ✅ | none |
| 3 | S-RENT-005 | Rental edit reload prefers lossy raw_data over canonical | `crm-redesign-rental-hydration.test.ts` (hydration targets) — but address-atom canonical-first precedence not asserted | source-contract (partial) | ✅ | **ADD** source-contract: rental hydration reads canonical StreetDirPrefix/unit atoms |
| 4 | S-BE-006 | CRM success response omits URL/eligibility contract | `crm-listing-publish-contract.test.ts` · "201 success response includes the full URL + eligibility contract" (all 6 fields) | behavioral | ✅ | none |
| 5 | S-BE-005 | Status route swallows projection dual-write failure, returns success | — (route deliberately fails-open with AuditEvent + cron reconciliation; comment L260-265) | (deliberate design) | ✅ | **ADD** contract: projection failure → `projection_dual_write_failed` AuditEvent AND status change still succeeds (documents approved fail-open design) |
| 6 | S-DB-010 | Edit-mode POST (duplicate) instead of PATCH | `crm-form-field-roundtrip.test.ts` · "edit mode checks _saleEditDbId for PATCH vs POST" | source-contract | ✅ | none (static-HTML form; behavioral needs a jsdom harness) |
| 7 | S-DB-008 | Browser localStorage draft shadows DB listing in edit | `rental-form-p0-fixes.test.ts` · "edit-mode guard appears BEFORE the localStorage draft write" / "loadRentalDraft skips the browser draft when editing a DB listing" | source-contract | ✅ | none |
| 8 | S-AGENT-006 | Session agent overwrites listing-agent field | `crm-patch-typed-attribution-preserve.test.ts` · unrelated edit leaves typed agent columns untouched; agent_info never rewritten | behavioral | ✅ | none |
| 9 | S-MEDIA-004 | Existing server media re-uploaded (duplicate photos) | `media-display-p0.test.ts` · "is idempotent — skips items whose media_key already exists"; "controlled 409 for an ACTIVE duplicate" | behavioral | ✅ | none |
| 10 | S-MEDIA-005 | Floorplan/video treated as photo → hero | `lib/media/__tests__/floorplan-hero-contract.test.ts` (floor plans never classified/heroed as photo) + `media-display-p0.test.ts` "floor plan is never the hero" | behavioral | ✅ | none |
| 11 | S-PUBSEARCH-001 | Public search strips StreetDirPrefix | `sales-333-e-46th.test.ts` · both address forms normalize to `StreetDirPrefix='E'` and resolve same canonical | behavioral | ✅ | none |
| 12 | S-PUBSEARCH-008 | Public link emits non-canonical `/listing/{id}` | `agent-listing-identity-cotality-url.test.ts` · emitters no longer emit `/listing/${…}`; "DTO builders set url via buildCanonicalListingPath" | behavioral | ✅ | none |
| 13 | S-BACKSEARCH-009 | Backend `where:` filters on public display-gate columns | `crm-my-listings-filter.test.ts` (ownership/status filter, not display-gate) + `in-house-listing-gates.test.ts` (public gate keeps website-only) | behavioral | ✅ | none |
| 14 | S-BACKSEARCH-012 | Hidden agent ID `= mlsId \|\| ""` (name fills, ID empty) | `syndication-eligibility.test.ts` · "blocks when both ListOfficeMlsId and ListAgentMlsId are empty on a Trestle row" (the compliance-critical RLS gate). NOTE: the form-level submit-block the rule's proof describes is NOT implemented (0 `blockSubmit`/"Validate agent" in either form; the scanner's line-256 assertion was a hypothetical fixture, not real code) | behavioral (downstream gate) | ✅ | none — the compliance-critical protection (empty IDs cannot reach RLS) survives; the un-implemented form UX guard is not a real protection to preserve |
| 15 | S-BUILDING-005 | Building label lacks structured direction/postal atoms | `building-address-filter.test.ts` · dirPrefix→StreetDirPrefix, PostalCode in filter; `in-house-listing-gates.test.ts` (DIR_PREFIX_MAP, `StreetDirPrefix eq`) | behavioral | ✅ | none |
| 16 | S-SAVED-012 | Saved-search alert send lacks display-gate | `lib/search/__tests__/saved-search-alert-gate.test.ts` · `canEnableAlertForCriteria` supported/unsupported; display-gating inherited via `runProjectionListingSearch` (display-gated projection) | behavioral (criteria) | ✅ | none required (gate + projection inheritance); direct send-exclusion test optional |
| 17 | S-URL-001 | Canonical URL emits id-only for address-displayable listing | `sales-333-e-46th.test.ts` · "returns /address-slug/sl-XXXX", "never returns generic /listing/sl-XXXX"; `listing-public-address-mallan-exclusive.test.ts` | behavioral | ✅ | none |
| 18 | S-COMP-001 | Public URL/metadata from raw address atoms w/o display guard | `listing-public-address-mallan-exclusive.test.ts` · "SUPPRESSED address emits /listing/listing-{id} (no address leak)" | behavioral | ✅ | none |

## Summary
- **16/18** already covered by independent tests that survive deletion (behavioral or source-contract).
- **2 replacement tests added** in this PR (before deleting the scanner): **S-BE-005** (contract) and **S-RENT-005** (source-contract).
- **S-BACKSEARCH-012**: the compliance-critical protection (empty agent/office IDs cannot reach RLS) survives via `syndication-eligibility.test.ts`; the form-level submit-block the rule's proof describes was never implemented, so there is no real protection to preserve.
- **0 rules** protect obsolete behavior needing retirement documentation.
- No active protection is lost by the removal.

## Note on the scanner's trustworthiness (why removal is safe)
The scanner reported 0 actionable errors while S-BE-005's regex did NOT fire on the route it targets (a false negative), and its own comments document repeated false-positive tightenings — confirming it is not a reliable gate. The retained focused tests are stronger and specific.
