# CURRENT — Claude Continuation Directive

**Active branch:** `fix/auth-identity-domain-and-listing-continuity`

**Verified code checkpoint:** `facf117d5f46d0f6ddf00eb170f14c2117f4bae6`.

**Current remote branch includes instruction commits after that code checkpoint.** Before mutation, fetch/rebase/pull and verify local == remote. Never force-push over Maya's instruction commits.

## Purpose

Finish the frontend↔backend conformance/security/listing-workflow corrections on this isolated branch **before** returning to PR #618 authenticated Search.

This is implementation work. Do not stop with another audit, matrix, or request for Maya to decide a safe code-only correction already governed here.

## Hard boundaries

- No merge.
- No Production deploy.
- No Production Neon/R2 work.
- No destructive DB/media action.
- No Cotality write.
- No syndication activation.
- No environment change.
- No Production backfill.
- No schema migration unless existing canonical storage is proven insufficient and Maya explicitly authorizes the exact migration.
- Do not contaminate PR #618 while this branch is being finished.

# IMMEDIATE CORRECTIONS BEFORE THE NEXT WIRING COMMIT

These four points are now decided. Do not stop to ask.

## A. `reset-sync` is still NOT closed — preserve Mallan-owned history on provider rows

The `facf117d` narrowing is better than the previous table-wide truncation, but it still deletes Mallan-owned dependents attached to provider-sourced listings:

- `ClientListingAction`
- `Showing`
- `Comment`
- `PriceHistory`
- `MarketingActivity`
- `ProtectedPeriod`

Cotality can rebuild provider listing facts. It CANNOT rebuild Mallan CRM/client history.

Therefore source-scoping the deletion does not make those dependent deletes safe.

Current repository search shows no executable UI/API caller of `/api/crm/listings/reset-sync` beyond the route itself; references are tests/docs/audit material. Reverify locally at the current head.

**Preferred correction:** retire/remove this one-time reset endpoint entirely if there is still no executable consumer.

If a required operational consumer is proven, convert it to **non-destructive provider reconciliation/upsert**:

- do not delete Mallan-authored local rows;
- do not delete Mallan-authored activity/history attached to provider rows;
- preserve stable Listing row identity where CRM history references it;
- reconcile provider-owned fields in place through the canonical mapper/writer;
- mark stale/unseen provider rows explicitly if required rather than truncating and rebuilding;
- never use unscoped `deleteMany({})` for listings or their Mallan-owned history.

Do not execute a destructive proof against any DB. Prove by code + tests.

Add negative tests that fail if reset/reconciliation can destroy Mallan-owned history merely because the Listing facts came from Cotality.

## B. Publication gets its OWN server transition boundary

Do **not** implement the plan as "wire publication into the status/PATCH routes" if that means those routes become the publication authority.

There is currently no dedicated publication route under `app/api/crm/listings/[id]`.

Create/use one explicit publication transition boundary, for example the canonical route:

`PATCH /api/crm/listings/[id]/publication`

or an already-existing equivalent if one is discovered before creation.

The responsibilities must remain separate:

### `/status`
Owns **market status only**.
It must not become the normal writer of `compliance.mallan_publication`.

### generic listing `PATCH`
Owns editable Mallan listing facts + canonical owner repair/change.
It preserves the publication namespace.
It must not silently approve/publish a listing.

### publication transition route
Owns:
- reading the current Mallan publication record;
- actor-role resolution;
- exact state transition via `applyPublicationTransition`;
- owner precondition;
- audience-specific compliance evaluation;
- visibility choice;
- `withPublication(...)` persistence;
- AuditEvent;
- public/search/cache invalidation only when visibility actually changes;
- response DTO for workflow state.

Do not duplicate transition logic in the route. `lib/crm/publication-state.ts` remains the single transition authority.

If a material edit to an approved/published listing requires re-review, do not invent an invisible PATCH-side state machine. Re-read the exact source-spec rule. If the source is silent, fail closed: do not let changed public content continue relying on a stale approval. Prefer an explicit review/publication action or block a publication-affecting edit until the listing is pulled back through the canonical publication workflow.

## C. `EXPORTED` may exist in the model but is NOT currently a manually assertable runtime state

The source specification contains `EXPORTED`, but the distribution-channel section is truncated and Mallan currently has no proven active outbound exporter/delivery acknowledgement. Cotality writes and syndication activation are also explicitly held.

Therefore a Broker clicking a publication endpoint must NOT be able to manufacture:

`state = EXPORTED`

without an actual completed export/delivery fact.

For current runtime:
- `EXPORTED` remains a modeled state for the complete contract;
- transition into it is unavailable/held unless an actual authorized exporter returns verifiable completion evidence;
- `DISTRIBUTION_ELIGIBLE` is not proof of delivery;
- do not set `EXPORTED` merely because a listing is approved, public, or eligible;
- return a truthful held/unavailable error rather than a false success.

Do not create a Cotality writer to satisfy this state. That is outside authorization.

Tests must prove `PUBLISHED_PUBLIC -> EXPORTED` cannot be completed by publication-state bookkeeping alone while exporter capability is absent.

## D. `Last Published` must be the LAST public transition

`lib/crm/publication-state.ts` currently stores `published_public_at` each time `PUBLISHED_PUBLIC` is entered, which naturally behaves as the latest entry, but its fallback uses the first matching history entry and its comment says "first reached a public state." That conflicts with the UI label **Last Published**.

Make the semantics explicit.

Preferred API:
- `lastPublishedAt(pub)` → latest transition into `PUBLISHED_PUBLIC`;
- optionally `firstPublishedAt(pub)` only if a real consumer needs historical first-publication date.

For `Last Published`:
- never published → null / `Never Published`;
- published once → that actual Mallan transition time;
- withdrawn/narrowed and later republished → the later publication time;
- history keeps every prior publication event;
- never use provider sync time or DB update time as fallback.

A history fallback must choose the LAST matching event, not `.find(...)` first match.

# COMPLETED CORRECTIONS THAT MUST BE PRESERVED

- Staff authorization now requires the staff identity domain, not just AGENT/BROKER role text.
- Client portal-role input is constrained; stale lead/BROKER strings cannot cross the staff guard.
- Impersonation and invite ownership boundaries are hardened.
- Mallan CRM create may not fabricate `mls_id` / provider identity.
- Current tracked-tree legacy intermediary naming has been driven to zero outside Maya's instruction record; Cotality is the provider authority.
- Listing detail recursively serializes BigInts, so populated `owner_client_id` does not 500.
- Listing PATCH supports authorized `owner_client_id` set/change/repair and merges `Listing.compliance` rather than replacing sibling keys.
- Seller/Landlord listing resolution uses `Listing.owner_client_id`; legacy Lead active-listing strings are hints, never access authority.
- Dead fail-open `PUBLIC_LISTING_GATE` / `PORTAL_LISTING_GATE` were removed and a guard prevents a second visibility authority.
- Market statistics, sitemap, building data, and other public readers use the shared public visibility/return-copy decision.
- Canceled/Cancelled compatibility, return-copy suppression, syndication-truth, and portal-role symmetry corrections must not regress.
- `lib/crm/publication-state.ts` now contains the exact 11 Mallan publication states and 4 visibility modes transcribed from the source spec, with server-side role/step enforcement and fail-closed storage reading.
- `Listing.compliance.mallan_publication` is the current no-migration publication-state storage candidate and CRM PATCH now preserves sibling namespaces.

# 1. FINISH OWNER CONTINUITY — UI + FULL ROUNDTRIP

`Listing.owner_client_id` is the only canonical Seller/Landlord owner relation.

Use the existing authenticated CRM clients API rather than inventing another client source:

- Sale selector: `/api/crm/clients?role=seller` with search/pagination as needed.
- Rental selector: `/api/crm/clients?role=landlord`.
- `findClients()` already enforces Agent scope vs Broker brokerage scope and uses `roles: { has: role }`, so multi-role Leads remain one identity.

Implement one reusable owner/client selector mechanism for both forms where practical.

### Sale
- select existing Seller-capable Lead;
- send its id as `owner_client_id`;
- show human-readable identity, keep id as authority.

### Rental
Same architecture for Landlord-capable Lead.

### Prove both workflows

`create → save → GET/reload → edit → save → GET/reload`

with the same `owner_client_id`, plus later owner change/repair.

Mandatory negatives:
- unauthorized Agent cannot assign another Agent's client;
- provider-owned Cotality row cannot acquire Mallan ownership through CRM edit;
- ownerless local Draft may remain Draft only if intentionally supported;
- ownerless Draft cannot progress through publication;
- assigning owner later removes only the owner blocker, not compliance/review blockers;
- Seller/Landlord portal resolves the same canonical Listing.

# 2. KEEP COTALITY MARKET STATUS SEPARATE FROM MALLAN PUBLICATION STATE

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

Mallan publication workflow from the source spec is separately:

- DRAFT
- SUBMITTED
- REVIEW_IN_PROGRESS
- REVISION_REQUESTED
- COMPLIANCE_CHECK
- APPROVED
- PUBLISHED_INTERNAL
- PUBLISHED_PUBLIC
- EXPORTED
- REJECTED
- ARCHIVED

Visibility modes:

- INTERNAL_ONLY
- PRIVATE_CLIENT
- PUBLIC_WEB
- DISTRIBUTION_ELIGIBLE

The source is truncated mid distribution-channel section. Implement only the specified contract and label the missing distribution tail `SPEC_INCOMPLETE`; do not invent channels.

## Important unresolved storage semantic: local `Listing.status = Draft`

Do not falsely call this section closed while new Mallan-local rows still write `Draft` into the same column described as Cotality `StandardStatus` authority.

Do not guess that Cotality `Incomplete` is equivalent to Mallan Draft merely because the word looks convenient.

Trace every new writer of `Listing.status` and determine the truthful no-schema option, if one exists.

If a provider-exact market-status value for an unpublished Mallan-local row cannot be justified from the authorized Cotality contract and the non-null column forces a value, document this as the **specific remaining storage conflict**. Finish all other code-only corrections first. Do not perform a schema migration without explicit Maya authorization.

Legacy rows with `Draft`, `Sold`, `Rented`, `Leased`, `Cancelled` must remain safely readable; no Production backfill is authorized.

# 3. PUBLICATION STORAGE — ONE NAMESPACE, NO PARALLEL TRUTH

Use only:

`Listing.compliance.mallan_publication`

unless a proven storage failure requires an explicitly authorized schema change.

`custom_fields` is agent-defined and is not publication authority.

Preservation proof must include:
- Cotality incremental/full sync update;
- CRM create;
- CRM PATCH;
- market-status transition;
- compliance validation writes;
- return-copy reconciliation;
- portal reads;
- public DTO suppression;
- reset/reconciliation safety after the destructive route is retired/corrected.

No writer may replace the whole compliance object and silently erase the publication namespace.

# 4. PUBLICATION STATE MACHINE + ROLE AUTHORITY

`lib/crm/publication-state.ts` remains the only state-transition definition.

The source spec makes Broker approval/publishing mandatory. Preserve:
- Agent/Owner may submit only where specified;
- Agent/Broker may review/request revisions where specified;
- Broker alone approves/rejects compliance and chooses publication scope;
- Owner never publishes or exports;
- no skipped steps;
- no public state before passing the required compliance class.

Do not duplicate role/transition tables in HTML/JS or another server module.

# 5. MARKET-STATUS PRESENTATION WITHOUT FALSIFYING PROVIDER TRUTH

Where brokerage wording differs from provider status, use one presentation helper, e.g.:
- Sale `Closed` may display as `Sold`;
- Rental `Closed` may display as `Rented`/`Leased` where appropriate.

That is presentation only.

New provider-status writers must not write fake provider values to obtain UI wording.

# 6. TRUTHFUL PUBLICATION TIMESTAMPS

Implement the `Last Published` correction in Immediate Decision D.

Do not use:
- `last_synced_from_trestle`;
- Cotality `ModificationTimestamp`;
- DB `updated_at`;
- generic `syncedAt`.

Publication history is Mallan workflow evidence and must survive withdrawal/republication.

# 7. LEGACY INTERMEDIARY NAME REMAINS ABSENT

Cotality API is the provider authority.

Keep case-insensitive current-tree count zero outside `docs/claude-instructions/`, where Maya's directive may necessarily name what it orders removed.

Do not reintroduce the old name in code, data files, filenames, mocks, active docs, or tests.

# 8. ONE VISIBILITY AUTHORITY

The dead fail-open gates are removed. Preserve that closure.

All public consumers must derive from the canonical public listing visibility decision plus Mallan publication visibility when that state becomes wired.

Do not make Map, Featured, market stats, sitemap, building data, Search, detail, email/share, or portal their own publication authorities.

# 9. DECOUPLE COTALITY `Delete` FROM DESTRUCTIVE RETENTION

`Delete` is a real provider market status. It does not itself authorize Mallan to delete/archive the DB row or strip media.

Separate:
- provider market status;
- public-display eligibility;
- retention/archive eligibility;
- destructive media cleanup.

No destructive data/media action is authorized.

`Hold` remains non-terminal unless live verified evidence changes the contract.

# 10. FAIR HOUSING / PUBLIC-AD COMPLIANCE BY AUDIENCE

A Mallan-local listing is not exempt from Fair Housing/public-ad requirements merely because no Cotality export occurs.

Enforce:

### INTERNAL_ONLY
Internal brokerage/privacy requirements only. Provider distribution requirements do not block a private draft.

### PRIVATE_CLIENT
Authenticated client/privacy/Fair Housing requirements.

### PUBLIC_WEB
Mallan public advertising + Fair Housing + address-display permission + applicable rental FARE + attribution/public-display requirements.

### DISTRIBUTION_ELIGIBLE
PUBLIC_WEB requirements plus all **live-verified** Cotality/RLS distribution requirements.

`validateListing(...)` cannot remain advisory at the publication boundary.

The current `isCrmCreated` skip must not accidentally skip Fair Housing/public-ad checks.

Write negative behavioral tests for prohibited/discriminatory content introduced:
- on create;
- on edit after create;
- immediately before final public publication.

It must never reach PUBLIC_WEB/DISTRIBUTION_ELIGIBLE.

# 11. SELLER/LANDLORD WORKFLOW USES THE SAME OWNER + PUBLICATION TRUTH

Use `Listing.owner_client_id` and the source-spec capability matrix.

Trace/implement only supported capabilities:
- view;
- comments;
- documents;
- correction requests;
- pricing feedback;
- marketing approval;
- showing coordination;
- publication request/approval where specified.

Do not give owner portal users direct regulated Listing-field mutation merely to simplify UX. Durable owner requests/approvals should enter existing CRM/activity/audit history and be applied by the authorized staff workflow.

# 12. BEHAVIORAL CLOSURE PROOF

For both Sale and Rental prove:

Agent selects Seller/Landlord
→ creates canonical local Listing
→ owner persists
→ Draft saves/reloads
→ edit saves/reloads
→ publication state persists
→ submit/review
→ unauthorized actor cannot approve
→ Broker approves only after required compliance
→ Broker chooses publication scope
→ canonical visibility decision changes
→ public publication only when allowed
→ actual Mallan **last** publication time recorded
→ public detail/search/Featured/market/sitemap/building readers agree
→ Seller/Landlord portal resolves same Listing
→ later market-status changes preserve history
→ no silent data loss.

Mandatory negatives:
- lead cannot publish;
- unauthorized Agent cannot assign another Agent's client;
- provider-owned Cotality row cannot be locally edited/owned;
- owner-opt-out cannot become public;
- participant-only cannot become public;
- INTERNAL_ONLY cannot become public;
- PRIVATE_CLIENT cannot appear publicly;
- unapproved listing cannot appear publicly;
- provider sync cannot erase Mallan publication state;
- reset/reconciliation cannot destroy Mallan-authored Listing or CRM/client history;
- no actor can claim `EXPORTED` without actual authorized exporter completion evidence.

# 13. UPDATE THE EXISTING CLOSURE DOCUMENT ONLY AFTER ACTUAL CLOSURE

Do not create another master audit.

Amend only:

`docs/audits/frontend-backend-conformance-closure-2026-08-26.md`

Record:
- continuation code checkpoint `facf117d...` and subsequent SHAs;
- commits by defect family;
- owner E2E proof;
- dedicated publication-boundary proof;
- visibility proof;
- compliance-by-audience proof;
- reset/reconciliation durability proof;
- Cotality status proof;
- legacy-name zero census;
- truthful Last Published proof;
- exact remaining authorization hold, if any.

# 14. CI / PREVIEW

During development use grouped targeted tests.

At closure run:
- relevant full test suite;
- type-check;
- RLS/compliance/UCBA/IDX gates;
- CRM build/tests;
- normal branch/PR CI/Preview process.

Local green tests are not independent CI evidence.
Do not merge or deploy without Maya authorization.

# 15. RETURN TO #618 ONLY AFTER THIS BRANCH IS GENUINELY CLOSED

Then return to authenticated Search from #618's **latest live head**, not an old SHA, and resume the non-checkbox criterion census followed by Basic↔Advanced, Saved Search, Map, workbench, Compare, Reports, CMA, compliance, and authenticated Preview proof.

# Definition of done

Do not stop with another finding unless the next required action itself is explicitly prohibited.

Continue safe implementation until:
- Sale and Rental owner UI + API roundtrip are complete;
- reset-sync deletion model is retired or made non-destructive without losing Mallan history;
- publication has its own server transition boundary;
- publication workflow is separate from market status;
- local `Draft`/provider-status storage conflict is truthfully resolved or isolated as the exact schema hold;
- exact source-spec visibility modes are enforced;
- `EXPORTED` cannot be fabricated without delivery evidence;
- Fair Housing/public-ad compliance is a hard publication boundary;
- `Last Published` means the latest real Mallan public transition;
- legacy intermediary name stays absent from the active tree;
- dead fail-open gates stay gone;
- Cotality `Delete` is decoupled from destructive retention;
- Seller/Landlord uses canonical owner identity;
- behavioral tests + Preview/CI prove the workflows.

If one item genuinely requires an unauthorized schema/environment/production/destructive operation, finish every safe code-only correction first and document only that exact hold with proof.