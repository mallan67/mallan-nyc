# CURRENT — Claude Continuation Directive

**Active branch:** `fix/auth-identity-domain-and-listing-continuity`

**Verified remote head before this directive update:** `a66286068ec309ed24cee26defcefccfe2e57766`.

Always re-read the current remote head and local worktree before mutation. This SHA is a checkpoint, not a permanent tip.

## Purpose

Finish the frontend↔backend conformance/security/listing-workflow corrections on this isolated branch **before** returning to PR #618 authenticated Search.

This is implementation work. Do not stop with another audit, matrix, or request for Maya to decide a safe code-only correction already governed below.

## Hard boundaries

- No merge.
- No Production deploy.
- No Production Neon/R2 work.
- No destructive DB/media action.
- No Cotality write.
- No syndication activation.
- No environment change.
- No schema migration unless existing canonical storage is proven insufficient and Maya explicitly authorizes the exact migration.
- Do not contaminate PR #618 while this branch is being finished.

## Decisions already made — do not stop to ask again

### A. `reset-sync` is a proven destructive authority defect

`app/api/crm/listings/reset-sync/route.ts` currently performs unfiltered deletion of listing dependents and then `prisma.listing.deleteMany({})` before rebuilding only from Cotality.

That would delete Mallan-authored SL-/RL- rows, canonical `owner_client_id`, Mallan publication state, portal continuity, comments/actions/showings/history, and any Mallan-only compliance state. This contradicts the canonical listing-authority model.

**Decision:** neutralize this destructive path before publication state is treated as durable.

Preferred correction: retire/remove the one-time reset endpoint if it has no current required consumer. If some current operational consumer still exists, replace the destructive reset with a source-scoped reconciliation that only operates on provider-owned representations and never deletes Mallan-authored canonical listings or their client history.

Do not execute the route against any database. Do not run a destructive proof. Prove safety with code/tests only.

Add a negative test that makes it impossible for this route or any replacement to issue an unscoped `listing.deleteMany({})` or to delete Mallan-authored rows as part of Cotality reconciliation.

### B. Fair Housing / public-ad compliance is a hard publication boundary

Current CRM PATCH computes `validateListing(merged)` but does not necessarily block an invalid edit. The RLS enforcement path is skipped for `isCrmCreated`, and the Fair Housing scan currently rides inside RLS enforcement. Therefore a Mallan-local row can bypass content scanning merely because it is not being exported to Cotality.

**Decision:** fix this. A listing does not become exempt from Fair Housing/public-advertising requirements because external syndication is held.

Separate compliance by audience:

- `INTERNAL_ONLY`: internal brokerage/privacy requirements; provider-only distribution requirements do not block an internal draft.
- `PRIVATE_CLIENT`: authenticated client/privacy/Fair Housing requirements.
- `PUBLIC_WEB`: Mallan public advertising + Fair Housing + address-display + applicable FARE + attribution/public-display requirements.
- `DISTRIBUTION_ELIGIBLE`: all applicable public requirements plus all **live-verified** Cotality/RLS distribution requirements.

A hard transition into any public/client-visible publication state must fail closed when that audience's required compliance fails.

Do not solve this by applying all 48 provider/RLS distribution fields to an internal-only draft. Do not solve it by skipping Fair Housing for Mallan-local rows.

## Completed corrections that must be preserved

- Staff authorization now requires the staff identity domain, not just AGENT/BROKER role text.
- Client portal-role input is constrained; stale lead/BROKER role strings are harmless at the staff guard.
- Impersonation and invite ownership boundaries are hardened.
- Mallan CRM create may not fabricate `mls_id` / provider identity.
- Executable/current-tree legacy intermediary naming has been driven to zero outside Maya's instruction record; Cotality is the provider authority.
- `GET /api/crm/listings/[id]` now recursively serializes BigInts so populated `owner_client_id` does not 500.
- Listing PATCH now supports authorized `owner_client_id` set/change/repair and preserves unrelated `Listing.compliance` keys rather than replacing the JSON object.
- Seller/Landlord listing resolution now uses canonical `Listing.owner_client_id`; legacy Lead active-listing strings may only be hints, never access authority.
- Canceled/Cancelled compatibility, return-copy suppression, syndication-truth, visibility corrections already landed must not regress.

## 1. Finish owner continuity — UI half and full roundtrip

`Listing.owner_client_id` is the only canonical Seller/Landlord owner relation.

The server half is now substantially repaired. The remaining defect is the Sale/Rental intake/edit workflow.

Implement one reusable authenticated CRM owner/client selector:

### Sale
- select an existing Seller-capable Lead;
- send its canonical id as `owner_client_id`;
- show human-readable client identity while the id remains authority.

### Rental
- same architecture for a Landlord-capable Lead.

### Authorization
- Agent may assign only a Lead in their authorized scope;
- Broker uses existing brokerage scope;
- multi-role Lead remains one identity;
- never create `seller_id`, `landlord_id`, owner JSON shadows, or free-text identity authority.

Prove for **both** Sale and Rental:

`create → save → GET/reload → edit → save → GET/reload`

with the same `owner_client_id`, and prove later owner change/repair through PATCH.

Also prove:
- different Agent cannot assign another Agent's client;
- third-party Cotality listing cannot acquire Mallan ownership;
- ownerless Draft may remain Draft if intentionally supported;
- ownerless Draft cannot publish;
- assigning the owner later removes only the owner blocker, not other compliance blockers;
- Seller/Landlord portal resolves the same canonical Listing.

## 2. Separate Cotality market status from Mallan publication/review state

Do not treat these as one state machine.

Live Cotality `Property.StandardStatus` remains exactly:

- Active
- ActiveUnderContract
- Canceled
- Closed
- ComingSoon
- Delete
- Expired
- Hold
- Incomplete
- Pending
- Withdrawn

Do not invent provider values.

Re-read the original frontend↔backend conformance specification and use the **exact** publication states, visibility modes, transition permissions, and role matrix from that source. The source is truncated in its distribution-channel section; implement only what is actually specified and mark the missing tail `SPEC_INCOMPLETE` rather than inventing channels.

Mallan workflow labels such as Draft/review/approval/publication and presentation labels such as Sold/Rented/Leased are not automatically Cotality StandardStatus values.

## 3. Use existing canonical storage before schema growth

`Listing.compliance` is the leading existing structured authority for one namespaced Mallan publication object because:

- Cotality update lanes preserve it by omitting the key;
- CRM PATCH now merges rather than wipes unrelated compliance keys.

Before adopting it permanently, finish the preservation proof across every writer/reader, including the destructive `reset-sync` defect above.

Do not use `custom_fields` as authoritative publication state; it is agent-defined data.

The one publication object must support:
- exact state + visibility mode;
- submitted/reviewed/approved/published timestamps;
- actor ids/roles;
- server validation;
- audit events;
- create/reload/edit/reload;
- CRM and allowed portal readers;
- public DTO suppression of internal review details;
- provider sync preservation.

If this works, **no schema migration**.

If it genuinely cannot work, finish every code-only correction first, then return only the exact missing persisted fact and minimal proposed schema change. Do not migrate without explicit Maya authorization.

## 4. One canonical Mallan publication state machine

Build one server-owned module from the original spec that owns:
- valid publication states;
- valid transitions;
- actor authority for each transition;
- preconditions;
- resulting visibility mode;
- transition timestamps;
- audit events.

Do not duplicate transition arrays between UI and API.

Agent edit authority does not automatically equal final publication approval. Apply the source-spec role matrix exactly.

Seller/Landlord portal users never directly publish regulated canonical Listing facts.

## 5. Market-status presentation must not falsify provider truth

Use one presentation helper where brokerage wording differs from provider truth, e.g. Sale `Closed` may display as `Sold`, Rental `Closed` may display as `Rented`/`Leased` when appropriate.

That is presentation only.

Legacy stored `Sold`, `Rented`, `Leased`, `Cancelled`, and `Draft` must remain readable safely, but new writers must stop multiplying non-Cotality values inside the provider market-status domain.

Do not backfill Production.
Do not guess that Cotality `Incomplete` means Mallan Draft.

## 6. Fix `Last Published`

Never label provider synchronization time as Mallan publication time.

Publication state must record the real Mallan publication transition timestamp.

- never published → `Never Published`
- published → actual Mallan publication timestamp
- later withdrawn → preserve history while showing truthful current state

No `syncedAt`, Trestle/Cotality ModificationTimestamp, or last-sync timestamp may masquerade as publication time.

## 7. Legacy intermediary name removal stays zero

Cotality API is the provider authority. Keep the current tracked-tree census at zero outside `docs/claude-instructions/`, where Maya's instruction text may necessarily name what it orders removed.

Do not reintroduce the old name in executable code, tests, active docs, data files, filenames, mocks, or current architecture prose.

Do not replace it with a fabricated Cotality URL/concept.

## 8. Remove dead fail-open visibility authorities

Reverify `PUBLIC_LISTING_GATE` and `PORTAL_LISTING_GATE` have zero executable consumers.

If dead, delete them now. If a hidden consumer exists, move it to the canonical visibility decision first, then remove the duplicate.

Add a guard test preventing a second public/portal visibility authority from returning.

## 9. Separate Cotality `Delete` from destructive retention

`Delete` is a real Cotality market status. It does **not** automatically mean Mallan should archive/delete the row or strip media.

Separate:
- provider status semantics;
- public-display eligibility;
- retention/archive eligibility;
- destructive media cleanup.

No destructive DB/media operation is authorized.
`Hold` remains non-terminal unless live provider evidence proves otherwise.

## 10. Local publication compliance must be enforced by audience

Implement the decision at the top of this file.

Critically:
- `validateListing` cannot remain merely advisory at a publication boundary;
- Fair Housing scanning cannot disappear because `isCrmCreated` skips the Cotality/RLS distribution gate;
- public-web publication must run every required public-advertising rule;
- distribution eligibility must add live-verified provider/RLS requirements on top of public-web requirements.

Write negative tests that inject discriminatory/publicly prohibited content on:
- create;
- edit after create;
- final publication/approval transition.

The content must be blocked before becoming PUBLIC_WEB or DISTRIBUTION_ELIGIBLE.

## 11. Seller/Landlord workflow uses the same owner + publication truth

Trace and implement only the capabilities supported by the original spec:
- view;
- comments;
- documents;
- correction requests;
- pricing feedback;
- marketing approval;
- showing coordination;
- publication request/approval where specified.

Do not give owners direct regulated Listing-field mutation merely to simplify UX. Durable requests/approvals should flow through existing CRM/activity/audit architecture for authorized Agent/Broker action.

## 12. Behavioral closure proof

For both Sale and Rental, prove the actual workflow:

Agent selects Seller/Landlord
→ creates canonical local Listing
→ owner persists
→ Draft saves/reloads
→ edit saves/reloads
→ publication state persists
→ submit/review
→ unauthorized actor cannot approve
→ authorized actor reviews
→ audience-specific compliance runs
→ visibility decision runs
→ public publication only when allowed
→ real publication timestamp recorded
→ public detail/search/Featured match visibility
→ Seller/Landlord portal resolves same Listing
→ later market-status changes preserve history
→ no silent data loss

Mandatory negatives:
- lead cannot publish;
- unauthorized Agent cannot assign another Agent's client;
- third-party Cotality row cannot be locally edited/owned;
- owner-opt-out cannot become public;
- participant-only cannot become public;
- INTERNAL_ONLY cannot become public;
- PRIVATE_CLIENT cannot appear publicly;
- unapproved listing cannot appear publicly;
- provider sync cannot erase Mallan publication state;
- reset/reconcile path cannot delete Mallan-authored canonical rows.

## 13. Update the existing closure document only after actual closure

Do not create another audit.

Amend only:
`docs/audits/frontend-backend-conformance-closure-2026-08-26.md`

Record the continuation from `a6628606...`, commits by family, owner E2E proof, publication/visibility proof, compliance proof, destructive-reset correction, Cotality status proof, zero-name census, publication timestamp proof, and any genuine remaining authorization hold.

## 14. CI / Preview proof

During development use grouped targeted tests.

At closure run:
- full relevant test suite;
- type-check;
- RLS/compliance/UCBA/IDX gates;
- CRM build/tests;
- normal branch/PR CI/Preview process.

Local green tests are not independent CI evidence.
Do not merge or deploy without Maya authorization.

## 15. Return to #618 only after this branch is genuinely closed

Then return to authenticated Search from #618's **latest live head**, not an old SHA, and resume the non-checkbox criterion census followed by Basic↔Advanced, Saved Search, Map, workbench, Compare, Reports, CMA, compliance, and authenticated Preview proof.

## Definition of done

Do not stop with another finding unless it requires a prohibited operation.

Continue safe implementation until:
- owner UI + API roundtrip is complete;
- `reset-sync` can no longer destroy Mallan canonical inventory/history;
- publication workflow is separate from Cotality market status;
- exact source-spec visibility modes are enforced;
- Fair Housing/public-ad compliance is a hard publication boundary;
- `Last Published` is truthful;
- legacy intermediary name stays absent from the active tree;
- dead fail-open gates are gone;
- Cotality `Delete` is decoupled from destructive retention;
- Seller/Landlord uses canonical owner identity;
- behavioral tests + Preview/CI prove the workflows.

If one item genuinely requires an unauthorized schema/environment/production/destructive operation, finish every safe code-only correction first and document only that exact hold with proof.
