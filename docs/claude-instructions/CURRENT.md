# CURRENT — Claude Continuation Directive

**Active branch:** `fix/auth-identity-domain-and-listing-continuity`

**Starting point for this continuation:** branch head at or after `0cb9b91619b671beb9e4aff8a37f55d039389f5e`.

Before doing anything, verify the current remote head and local worktree. Do not assume this SHA is still the tip.

## Purpose

Finish the frontend↔backend conformance/security/listing-workflow corrections on this isolated branch **before** returning to PR #618 authenticated Search.

The prior AUTH P0, invite scoping, Canceled compatibility, return-copy visibility corrections, RealPlus executable DTO removal, syndication-truth corrections, and portal-role symmetry work are valuable and must be preserved.

However this branch is **not closed yet**. The remaining work is implementation, not another audit.

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

## 1. Close canonical owner continuity end to end

`Listing.owner_client_id` remains the only canonical Seller/Landlord owner relation.

Current server behavior accepts and stores `owner_client_id`, and an ownerless Mallan-local draft is correctly blocked from `Active`/`ComingSoon` publication. But the Sale and Rental forms currently do not provide the canonical owner id, and listing PATCH does not support repairing/changing the owner later. This creates a workflow dead-end.

Implement one reusable authenticated CRM owner/client selection flow:

### Sale
- select an existing Seller-capable Lead;
- persist its id as `owner_client_id`;
- show the human-readable client name while keeping the canonical id as authority.

### Rental
- same architecture for a Landlord-capable Lead.

### Authorization
- Agent may assign only a Lead in their authorized scope;
- Broker uses existing brokerage scope;
- multi-role Lead remains one canonical identity;
- never create `seller_id`, `landlord_id`, owner JSON shadows, or free-text identity authority.

### Create / reload / edit
Prove:

`create → save → reload → edit → save → reload`

with the same `owner_client_id` for both Sale and Rental.

Authenticated listing GET must return enough internal data for the form to restore the selected owner. Listing PATCH must validate and persist an owner change with the same `assertLeadAccess` boundary used by create/convert.

Third-party Cotality listings must remain provider-owned and must not become Mallan-owned through this edit path.

If ownerless Draft is intentionally supported, it may remain a Draft only. Once an owner is later assigned, the same listing should be able to continue through the publication workflow if all other requirements pass.

## 2. Separate Cotality market status from Mallan publication/review state

Do not treat these as one state machine.

Live Cotality `Property.StandardStatus` currently has exactly:

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

Mallan business labels such as `Draft`, `Sold`, `Rented`, `Leased`, legacy `Cancelled`, review states, approval states, and publication states must be classified by meaning rather than all stored as provider market status.

Re-read the original frontend↔backend conformance specification that introduced the publication/review workflow. Use the exact state names, visibility modes, transition authorities, and role matrix from that source. Do not reconstruct the missing state list from memory.

The earlier work referenced publication/review concepts including examples such as:

- `REVIEW_IN_PROGRESS`
- `REVISION_REQUESTED`
- `COMPLIANCE_CHECK`
- `PUBLISHED_INTERNAL`

and visibility modes including:

- `INTERNAL_ONLY`
- `PRIVATE_CLIENT`
- `PUBLIC_WEB`
- `DISTRIBUTION_ELIGIBLE`

Treat those examples as pointers only; the original specification remains the authority for the exact contract.

## 3. Exhaust existing canonical storage before schema growth

`Listing.compliance` is existing Mallan-controlled structured JSON. Determine whether one namespaced publication object there can safely own the Mallan publication/review state.

Do not use `custom_fields` as default authority: it is documented as agent-defined data.

Before choosing `Listing.compliance`, prove the namespace is preserved by:

- Cotality sync;
- CRM create;
- CRM PATCH;
- status transitions;
- compliance validation updates;
- return-copy reconciliation;
- portal reads;
- public DTO sanitization.

It must support server validation, audit events, timestamps/actors, CRM and portal readers, publication-boundary enforcement, and the full create/reload/edit/reload cycle without becoming parallel truth.

Only if existing structured storage genuinely fails may a minimal schema proposal be returned. Do not perform that migration without explicit authorization.

## 4. One canonical Mallan publication state machine

Build one server-owned publication module that owns:

- exact valid publication states;
- exact valid transitions;
- permitted actor for each transition;
- required preconditions;
- resulting visibility mode;
- transition timestamps;
- audit event.

Do not duplicate transition lists in UI and API.

Agent edit authority does not automatically equal final publication approval. Apply the role matrix from the source specification exactly.

Seller/Landlord portal users must never directly publish regulated canonical Listing facts.

## 5. Market-status presentation must not falsify provider truth

If brokerage UI should display:

- Sale `Closed` as `Sold`
- Rental `Closed` as `Rented` / `Leased`

that is a presentation rule, not a different Cotality `StandardStatus` value.

Create/use one canonical presentation helper based on canonical market status + listing type.

Legacy stored `Sold`, `Rented`, `Leased`, `Cancelled`, and `Draft` values must remain safely readable where historical rows exist, but new writers must stop multiplying non-Cotality values inside the provider-status domain.

Do not backfill Production.

Do not guess that Cotality `Incomplete` is semantically equivalent to Mallan Draft.

## 6. Fix `Last Published`

Do not display provider synchronization time as Mallan publication time.

Current fallback logic using values such as `syncedAt` under a `Last Published` label is factually wrong.

Once Mallan publication state exists, store/read the actual Mallan publication transition time.

- unpublished → `Never Published`
- published → actual Mallan publication timestamp
- withdrawn later → preserve publication history while current state remains truthful

Never use Cotality sync timestamps as publication timestamps.

## 7. Finish removal of RealPlus from the current architecture

The previous work removed executable `realPlusUrl`, which is good.

Maya's current architecture rule is stronger: RealPlus must not appear as current production/system authority.

Perform a case-insensitive current-tree census:

- `RealPlus`
- `realplus`
- `realPlus`
- `REALPLUS`

Target current active architecture/code/docs count: zero where the term acts as current authority or workflow dependency.

Where historical reasoning must remain, either move it to clearly historical evidence or rewrite the current source explanation generically (for example, legacy upstream intermediary → REBNY distribution → Cotality return-copy). Git history already preserves the old provider name.

Do not replace it with a fabricated Cotality URL or provider concept.

## 8. Remove dead fail-open visibility authorities

The closure package identified `PUBLIC_LISTING_GATE` and `PORTAL_LISTING_GATE` as zero-consumer, deny-list/fail-open traps.

Reverify zero executable consumers at the current head.

If dead, delete them.

If a real consumer exists, move that consumer to the canonical visibility decision first, then remove the duplicate authority.

Add a guard test preventing reintroduction of a second public/portal visibility authority.

## 9. Do not couple Cotality `Delete` to destructive retention

`Delete` is a real Cotality market status. Whether it is publicly displayable, retained, archived, or media-stripped are different Mallan business decisions.

Do not add `Delete` to a shared terminal set if that silently makes it destructive/archive eligible.

Separate:

- provider market-status meaning;
- public-display eligibility;
- retention/archive eligibility;
- destructive media cleanup.

No destructive DB/media operation is authorized.

`Hold` remains non-terminal unless verified evidence changes that conclusion.

## 10. Prove local Mallan publication compliance by audience

Do not assume a CRM-created/local Mallan listing may be publicly displayed merely because it is not exported to Cotality.

Build compliance requirements around the publication visibility mode:

### INTERNAL_ONLY
Internal brokerage storage and privacy requirements only.

### PRIVATE_CLIENT
Authenticated client/privacy/Fair Housing requirements.

### PUBLIC_WEB
Mallan public advertising requirements, Fair Housing, address-display permissions, applicable rental FARE disclosure, attribution, and other public-display rules.

### DISTRIBUTION_ELIGIBLE
All applicable public requirements plus all **verified** Cotality/RLS distribution requirements.

Provider-only obligations should not incorrectly block internal drafts. Public-advertising obligations must not be skipped just because syndication is held.

A hard publication transition must fail if its required compliance class fails.

## 11. Seller/Landlord workflows use the same owner identity and publication truth

The owner is the same `Lead` linked by `Listing.owner_client_id`.

Trace and implement the exact source-spec capabilities for:

- view;
- comments;
- documents;
- correction requests;
- pricing feedback;
- marketing approval;
- showing coordination;
- publication request/approval where specified.

Do not make a portal user directly mutate regulated canonical Listing fields merely to simplify UX. Owner corrections/requests that require staff review should become durable CRM/audit activity and then be applied by the authorized Agent/Broker workflow.

## 12. Behavioral closure proof

For both Sale and Rental, prove the real workflow:

Agent selects existing Seller/Landlord
→ creates local listing
→ owner persists
→ saves Draft
→ reloads
→ owner remains
→ edits
→ saves
→ reloads
→ publication state remains
→ submits for review
→ unauthorized actor cannot approve
→ authorized actor reviews
→ compliance runs
→ visibility decision runs
→ public publication occurs only when allowed
→ actual Mallan publication timestamp is recorded
→ public detail/search/Featured behavior matches visibility
→ Seller/Landlord portal resolves the same canonical Listing
→ later market status changes preserve history
→ no silent data loss

Mandatory negatives include:

- lead cannot publish;
- unauthorized Agent cannot assign another Agent's client;
- third-party Cotality listing cannot be locally edited;
- owner-opt-out cannot become public;
- participant-only cannot become public;
- INTERNAL_ONLY cannot become public;
- PRIVATE_CLIENT cannot become public;
- unapproved listing cannot become public;
- provider sync cannot erase Mallan publication state.

## 13. Update the existing closure document only after actual closure

Do not create another audit.

Amend:

`docs/audits/frontend-backend-conformance-closure-2026-08-26.md`

only when these remaining items are truly closed.

Record:

- continuation starting SHA;
- ending SHA;
- commits by defect family;
- owner E2E proof;
- publication-state proof;
- visibility proof;
- Cotality status proof;
- RealPlus current-tree census;
- publication timestamp proof;
- compliance-boundary proof;
- any genuine remaining holds.

## 14. CI / Preview proof

Use grouped targeted tests during development. Then run the relevant full suite, type-check, compliance chain, CRM build/tests, and normal branch/PR CI process.

Do not call local green tests independent CI evidence.

Do not merge or deploy without Maya authorization.

## 15. Return to #618 only after this branch is genuinely closed

Only then return to authenticated Search and resume from #618's **latest live head**, not an old SHA.

The next Search action remains the full non-checkbox criterion census followed by Basic↔Advanced, Saved Search, Map, workbench, Compare, Reports, CMA, compliance, and authenticated Preview proof.

## Definition of done for this branch

Do not stop with a matrix or another audit. Continue implementation until:

- owner workflow has no dead-end;
- publication workflow is separate from Cotality market status;
- exact visibility modes are enforced;
- `Last Published` is truthful;
- RealPlus is absent from current authority/workflow semantics;
- dead fail-open visibility authorities are gone;
- local public publication compliance is proven;
- Seller/Landlord uses canonical owner identity;
- workflow tests and Preview/CI prove the behavior.

If one item genuinely requires an unauthorized schema/environment/production/destructive operation, finish every safe code-only correction first and document only that exact hold with proof.
