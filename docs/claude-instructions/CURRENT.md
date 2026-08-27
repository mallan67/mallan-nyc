# CURRENT — Claude Continuation Directive

**Active branch:** `fix/auth-identity-domain-and-listing-continuity`

**Instruction baseline before this update:** `c3890576ad399dc608ac13dd8b5357e2f4316237`.

Before any mutation, fetch/rebase/pull and verify local == remote. Never force-push over Maya's instruction commits.

## Purpose

Finish the frontend↔backend conformance/security/listing-workflow corrections on this isolated branch **before** returning to PR #618 authenticated Search.

This is implementation work. Do not stop with another audit, matrix, or request for Maya to decide a safe code-only correction already governed here.

# PHASE 0 — ABSOLUTE PROVIDER AUTHORITY: COTALITY ONLY

This is not terminology preference. It is the architecture.

Mallan has **one external provider/data contract only: Cotality**.

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE → MALLAN BUSINESS RULE → CRM / PORTALS / SEARCH / CMA / PUBLIC CONSUMERS`

There is no separate provider/data-authority layer for any legacy intermediary, standards label, prior vendor name, or old integration vocabulary.

The strings `RLS`, `RESO`, `RealPlus`, and old provider/intermediary naming may appear in Maya's instruction/history text only so this directive can order their removal. They must not survive as active provider authority, contract authority, source taxonomy, validation authority, workflow authority, current tooling identity, current data-registry identity, current documentation authority, or new code terminology.

## Phase 0 must be completed BEFORE more publication wiring

Build one bounded current-tree impact graph and correct the active architecture in one controlled tranche. Do not rename file-by-file in a loop.

Census at minimum:

- `package.json` scripts;
- CI/workflow commands and validation gates;
- `scripts/**` provider/field diagnostics;
- `data/**` field registries, generated contract artifacts, and research files used as current input;
- `lib/**` source-identity classes, filters, helpers, mappers, DTOs, and comments;
- `app/**` runtime readers/writers and UI strings;
- tests/mocks/fixtures that encode current provider semantics;
- current architecture/operations/closure docs;
- exported function/type/class names that encode obsolete provider authority;
- Saved Search/Search/CMA/publication/compliance code that uses provider field assumptions.

Expected semantic normalization where current behavior really means Cotality:

- Mallan-authored listing returned through Cotality → one canonical **Mallan Cotality return-copy** concept;
- third-party external inventory → one canonical **Cotality external** concept;
- provider field registry → **Cotality verified field registry**;
- provider contract validator/tool → **Cotality contract validator/tool**;
- provider source facts → **Cotality-sourced facts**.

Names are examples of semantics, not permission for blind search/replace. Preserve behavior only after tracing all readers/writers/tests.

## No fake cleanup

Do NOT merely rename old validators and leave their old assumptions inside.

For every provider-facing rule retained after normalization, prove it against the authorized Cotality contract:

- exact resource;
- exact field;
- type;
- exact values/enums/strings;
- null/empty/unknown behavior;
- operator/filter semantics where relevant;
- permission/availability;
- live behavior/population where the available Cotality tooling can prove it.

If a legacy tool encodes assumptions that cannot be verified against Cotality, retire it or classify it unsupported. Do not relabel an unverified assumption as Cotality.

## Legacy persisted identifiers are compatibility artifacts, not architecture

If an existing database column, environment variable, migration, historical audit record, or immutable Git history contains an old name, do **not** casually rename it when that would require schema/environment/production migration.

Instead:

- stop propagating the old name into new business logic;
- isolate it behind a Cotality-semantic adapter/helper;
- document it as a legacy persisted compatibility artifact only;
- do not expose it as provider authority in UI/API/current docs;
- do not add new fields or aliases that create parallel truth;
- migrate/rename only with explicit authorization where required.

Historical Git commits do not need rewriting. The **active Mallan system** does.

## Phase 0 closure test

Outside explicit removal instructions, immutable history/migrations, or documented legacy persisted compatibility identifiers that cannot safely change without authorization, current executable/provider architecture must prove:

- `Cotality` provider authority = YES;
- separate RLS authority = 0;
- separate RESO authority = 0;
- RealPlus concept/authority = 0;
- old intermediary/provider authority = 0;
- duplicate provider field registries = 0;
- duplicate provider source taxonomies = 0.

Run targeted behavioral tests after the normalization tranche. Do not call Phase 0 complete from grep counts alone.

# HARD BOUNDARIES

- No merge.
- No Production deploy.
- No Production Neon/R2 work.
- No destructive DB/media action.
- No Cotality write.
- No external distribution/syndication activation.
- No environment change.
- No Production backfill.
- No schema migration unless existing canonical storage is proven insufficient and Maya explicitly authorizes the exact migration.
- Do not contaminate PR #618 while this branch is being finished.

# COMPLETED CORRECTIONS THAT MUST BE PRESERVED

- Staff authorization requires the staff identity domain, not merely AGENT/BROKER role text.
- Client portal-role input is constrained; stale lead/BROKER strings cannot cross the staff guard.
- Impersonation and invite ownership boundaries are hardened.
- Mallan CRM create may not fabricate provider identity.
- Listing detail recursively serializes BigInts, so populated `owner_client_id` does not 500.
- Listing PATCH supports authorized `owner_client_id` set/change/repair and merges `Listing.compliance` rather than replacing sibling keys.
- Seller/Landlord listing resolution uses `Listing.owner_client_id`; legacy Lead active-listing strings are hints, never access authority.
- Dead fail-open `PUBLIC_LISTING_GATE` / `PORTAL_LISTING_GATE` were removed and a guard prevents a second visibility authority.
- Market statistics, sitemap, building data, and other public readers use the shared public visibility/return-copy decision.
- Cotality `Canceled` compatibility, return-copy suppression, truthful distribution state, and portal-role symmetry corrections must not regress.
- `lib/crm/publication-state.ts` contains the 11 Mallan publication states and 4 visibility modes transcribed from the source spec, with server-side role/step enforcement and fail-closed storage reading.
- `Listing.compliance.mallan_publication` is the current no-migration publication-state storage candidate and CRM PATCH preserves sibling namespaces.

# 1. `reset-sync` IS STILL NOT CLOSED — PRESERVE MALLAN HISTORY

The prior narrowing is better than table-wide truncation, but deleting Mallan-owned dependents attached to Cotality-sourced listings is still unsafe.

Mallan-owned history includes at least:

- `ClientListingAction`;
- `Showing`;
- `Comment`;
- `PriceHistory` where Mallan-owned events are present;
- `MarketingActivity`;
- `ProtectedPeriod`.

Cotality can rebuild provider listing facts. It cannot rebuild Mallan CRM/client history.

Reverify whether `/api/crm/listings/reset-sync` has any executable consumer.

Preferred correction if still unused: retire/remove the one-time reset endpoint.

If a required operational consumer is proven, convert it to non-destructive provider reconciliation/upsert:

- never delete Mallan-authored local rows;
- never delete Mallan-authored CRM/client history merely because Listing facts came from Cotality;
- preserve stable Listing identity where CRM history references it;
- reconcile Cotality-owned fields in place through the canonical mapper/writer;
- mark stale/unseen provider rows explicitly if necessary instead of truncating and rebuilding;
- never use unscoped `deleteMany({})` for listings or their Mallan-owned history.

Do not execute destructive proof against any DB. Prove by code + tests.

# 2. FINISH OWNER CONTINUITY — UI + FULL ROUNDTRIP

`Listing.owner_client_id` is the only canonical Seller/Landlord owner relation.

Use the existing authenticated CRM clients API, not a new client source:

- Sale selector: `/api/crm/clients?role=seller`;
- Rental selector: `/api/crm/clients?role=landlord`;
- preserve Agent scope vs Broker brokerage scope;
- multi-role Leads remain one identity.

For both Sale and Rental prove:

`create → save → GET/reload → edit → save → GET/reload`

with the same `owner_client_id`, plus later owner change/repair.

Mandatory negatives:

- unauthorized Agent cannot assign another Agent's client;
- Cotality-owned external row cannot acquire Mallan ownership through CRM edit;
- ownerless local Draft may remain Draft only if intentionally supported;
- ownerless Draft cannot progress through publication;
- assigning owner later removes only the owner blocker, not compliance/review blockers;
- Seller/Landlord portal resolves the same canonical Listing.

# 3. COTALITY MARKET STATUS IS NOT MALLAN PUBLICATION STATE

Live verified Cotality `Property.StandardStatus` currently remains exactly:

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

Do not invent provider values or substitute local wording into provider truth.

Mallan publication workflow is separate:

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

Visibility modes are separate:

- INTERNAL_ONLY
- PRIVATE_CLIENT
- PUBLIC_WEB
- DISTRIBUTION_ELIGIBLE

The supplied source is truncated mid distribution-channel section. Implement only the specified contract and label the missing distribution tail `SPEC_INCOMPLETE`; do not invent channels.

## Remaining storage conflict: local `Listing.status = Draft`

Do not call this closed while Mallan-local rows write `Draft` into a column otherwise used for Cotality market status.

Do not guess that Cotality `Incomplete` means Mallan Draft.

Trace every `Listing.status` writer and determine a truthful no-schema option if one exists.

If the non-null column forces a provider-like value that cannot be justified from Cotality for an unpublished local row, document that exact storage conflict. Finish all safe code-only corrections first. No schema migration without Maya's explicit authorization.

Legacy rows with local historical values must remain safely readable; no Production backfill is authorized.

# 4. PUBLICATION GETS ITS OWN SERVER TRANSITION BOUNDARY

Do not make market-status `/status` or generic listing PATCH the publication authority.

Use one explicit publication transition boundary, for example:

`PATCH /api/crm/listings/[id]/publication`

or an already-existing equivalent if one is discovered before creation.

Responsibilities:

### `/status`
Owns market status only.

### generic listing `PATCH`
Owns editable Mallan listing facts + canonical owner repair/change. It preserves the publication namespace and must not silently approve/publish.

### publication transition route
Owns:

- current Mallan publication record;
- actor-role resolution;
- transition through `applyPublicationTransition`;
- owner precondition;
- audience-specific compliance evaluation;
- visibility choice;
- `withPublication(...)` persistence;
- AuditEvent;
- public/search/cache invalidation only when visibility actually changes;
- workflow response DTO.

`lib/crm/publication-state.ts` remains the single transition authority.

Material edits to approved/published content may not continue relying on stale approval. Follow an exact source-spec re-review rule if present; if the source is silent, fail closed rather than inventing invisible PATCH-side approval behavior.

# 5. PUBLICATION STORAGE — ONE NAMESPACE, NO PARALLEL TRUTH

Use only:

`Listing.compliance.mallan_publication`

unless a proven storage failure requires an explicitly authorized schema change.

`custom_fields` is not publication authority.

Preservation proof must cover:

- Cotality incremental/full sync update;
- CRM create;
- CRM PATCH;
- market-status transition;
- compliance validation writes;
- return-copy reconciliation;
- portal reads;
- public DTO suppression;
- reset/reconciliation safety.

No writer may replace the whole compliance object and silently erase publication state.

# 6. ROLE AUTHORITY / STATE MACHINE

Preserve the source-spec role boundaries:

- Agent/Owner may submit only where specified;
- Agent/Broker may review/request revisions only where specified;
- Broker alone approves/rejects compliance and chooses publication scope;
- Owner never directly publishes or exports;
- no skipped steps;
- no public state before required compliance passes.

Do not duplicate role/transition tables in client HTML/JS or another server module.

# 7. `EXPORTED` CANNOT BE FABRICATED

`EXPORTED` may exist in the model, but current runtime has no proven authorized outbound exporter/delivery acknowledgement and Cotality writes/distribution activation remain held.

Therefore:

- `PUBLISHED_PUBLIC -> EXPORTED` cannot complete through bookkeeping alone;
- `DISTRIBUTION_ELIGIBLE` is not delivery evidence;
- approval/public visibility is not delivery evidence;
- return a truthful held/unavailable state until actual authorized delivery evidence exists;
- do not create a Cotality writer merely to make `EXPORTED` reachable.

# 8. `LAST PUBLISHED` MEANS THE LATEST REAL MALLAN PUBLIC TRANSITION

Preferred API:

- `lastPublishedAt(pub)` → latest transition into `PUBLISHED_PUBLIC`;
- `firstPublishedAt(pub)` only if a real consumer needs it.

Rules:

- never published → null / `Never Published`;
- published once → actual Mallan transition time;
- withdrawn/narrowed then republished → later publication time;
- history retains all prior publication events;
- no provider sync timestamp, provider modification timestamp, DB `updated_at`, or generic sync timestamp may substitute for Mallan publication time;
- fallback must choose the last matching publication event, not the first.

# 9. ONE VISIBILITY AUTHORITY

Keep the dead fail-open gates removed.

All public consumers derive from the canonical public listing visibility decision plus Mallan publication visibility once wired.

Do not let Map, Featured, market stats, sitemap, building data, Search, detail, email/share, or portal become separate publication authorities.

# 10. COTALITY `Delete` DOES NOT AUTHORIZE DESTRUCTIVE MALLAN RETENTION

`Delete` is a real Cotality market status. It does not itself authorize Mallan to delete/archive the DB row or strip media.

Keep separate:

- Cotality market status;
- public-display eligibility;
- Mallan retention/archive eligibility;
- destructive media cleanup.

No destructive data/media action is authorized.

`Hold` remains non-terminal unless live Cotality evidence changes the verified contract.

# 11. FAIR HOUSING / PUBLIC-AD COMPLIANCE BY AUDIENCE

Mallan-local listings are not exempt from legal/public-ad rules merely because no Cotality distribution occurs.

### INTERNAL_ONLY
Internal brokerage/privacy requirements. Cotality distribution requirements do not block a private draft.

### PRIVATE_CLIENT
Authenticated client/privacy/Fair Housing requirements.

### PUBLIC_WEB
Mallan public advertising + Fair Housing + address-display permission + applicable rental FARE + attribution/public-display requirements.

### DISTRIBUTION_ELIGIBLE
PUBLIC_WEB requirements plus all **live-verified Cotality distribution requirements**. No other provider/standards authority is permitted.

`validateListing(...)` cannot remain advisory at the publication boundary.

The `isCrmCreated` path must not accidentally skip Fair Housing/public-ad checks.

Negative behavioral tests must cover prohibited/discriminatory content introduced:

- on create;
- on edit after create;
- immediately before final public publication.

It must never reach PUBLIC_WEB/DISTRIBUTION_ELIGIBLE.

# 12. SELLER/LANDLORD USE THE SAME OWNER + PUBLICATION TRUTH

Use `Listing.owner_client_id` and the source-spec capability matrix.

Trace/implement only supported capabilities such as:

- view;
- comments;
- documents;
- correction requests;
- pricing feedback;
- marketing approval;
- showing coordination;
- publication request/approval where specified.

Do not give owner portal users direct regulated Listing-field mutation merely to simplify UX. Durable owner requests/approvals enter existing CRM/activity/audit history and are applied by authorized staff workflow.

# 13. BEHAVIORAL CLOSURE PROOF

For both Sale and Rental prove:

Agent selects Seller/Landlord
→ creates canonical Mallan local Listing
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
→ Seller/Landlord portal resolves the same Listing
→ later Cotality market-status changes preserve Mallan history
→ no silent data loss.

Mandatory negatives:

- lead cannot publish;
- unauthorized Agent cannot assign another Agent's client;
- Cotality-owned external row cannot be locally edited/owned;
- owner opt-out cannot become public;
- participant-only/private-only cannot become public;
- INTERNAL_ONLY cannot become public;
- PRIVATE_CLIENT cannot appear publicly;
- unapproved listing cannot appear publicly;
- Cotality sync cannot erase Mallan publication state;
- reset/reconciliation cannot destroy Mallan-authored Listing or CRM/client history;
- no actor can claim `EXPORTED` without actual authorized exporter completion evidence.

# 14. UPDATE THE EXISTING CLOSURE DOCUMENT ONLY AFTER ACTUAL CLOSURE

Do not create another master audit.

Amend only:

`docs/audits/frontend-backend-conformance-closure-2026-08-26.md`

Record:

- continuation SHAs by defect family;
- Phase 0 Cotality-only normalization proof;
- owner E2E proof;
- dedicated publication-boundary proof;
- visibility proof;
- compliance-by-audience proof;
- reset/reconciliation durability proof;
- exact Cotality market-status proof;
- active-tree legacy-authority census;
- truthful Last Published proof;
- exact remaining authorization hold, if any.

# 15. CI / PREVIEW

During development use grouped targeted tests.

At closure run the relevant grouped/broad boundary checks:

- relevant full test suite;
- type-check;
- Cotality contract/mapping gates;
- compliance/UCBA/publication/public-visibility gates;
- CRM build/tests;
- normal branch/PR CI/Preview process.

Local green tests are not independent CI evidence.

Do not merge or deploy without Maya authorization.

# 16. RETURN TO #618 ONLY AFTER THIS BRANCH IS GENUINELY CLOSED

Then return to authenticated Search from #618's **latest live head**, not an old SHA, and resume:

- non-checkbox criterion census;
- Basic↔Advanced state identity;
- Saved Search roundtrip;
- map/location/search-within-results;
- workbench;
- Compare;
- Reports;
- CMA;
- compliance;
- authenticated Preview proof.

The Search foundation must use the same Cotality-only provider authority established in Phase 0.

# DEFINITION OF DONE

Do not stop with another finding unless the next required action itself is explicitly prohibited.

Continue safe implementation until:

- active provider architecture is Cotality-only;
- obsolete provider/standards/vendor authority is removed from active code/tooling/current docs or explicitly quarantined as immutable/persisted compatibility history;
- Sale and Rental owner UI + API roundtrip are complete;
- reset-sync deletion model is retired or made non-destructive without losing Mallan history;
- publication has its own server transition boundary;
- publication workflow is separate from Cotality market status;
- local `Draft`/provider-status storage conflict is truthfully resolved or isolated as the exact schema hold;
- exact source-spec visibility modes are enforced;
- `EXPORTED` cannot be fabricated without delivery evidence;
- Fair Housing/public-ad compliance is a hard publication boundary;
- `Last Published` means the latest real Mallan public transition;
- dead fail-open gates stay gone;
- Cotality `Delete` is decoupled from destructive retention;
- Seller/Landlord uses canonical owner identity;
- behavioral tests + Preview/CI prove the workflows.

If one item genuinely requires an unauthorized schema/environment/production/destructive operation, finish every safe code-only correction first and document only that exact hold with proof.