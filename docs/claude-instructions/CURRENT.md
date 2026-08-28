# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search branch / PR #618:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified B2 code checkpoint:** `37d32cf2cad562168628d159e8900ed2785c9985`

**Prior continuation-doc head:** `e7e7012becce7eacb6c7829344d010396a72c2e0`

**PR #618:** draft, open, unmerged. Do not Production-deploy.

**Durable instruction file:** `docs/claude-instructions/CURRENT.md`

Before ANY mutation:

1. fetch/pull/rebase as appropriate;
2. verify local branch == remote branch;
3. read THIS FILE completely from the active branch after switching worktrees;
4. identify the exact numbered section below you are executing;
5. do not skip ahead merely because another area looks easier.

This file is the execution sequence. Old chats/audits are evidence only. `docs/architecture/MALLAN-PLATFORM-MASTER-PLAN.md` remains the product/system authority and `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` is the execution-state authority where present/current.

# 0. CURRENT CROSS-LANE STATUS — DO NOT LOSE THIS

## A. Listing / Security / Publication — code ready, operationally held

Branch: `fix/auth-identity-domain-and-listing-continuity`

Draft PR: #625

Verified code checkpoint before Search continuation: `726f4f058175030daf22c2fd68b9678d2b123722`

A is **CODE + CI + BUILD READY, NOT PRODUCTION-CLOSED**.

Materially completed on A:

- canonical Seller/Landlord ownership through `Listing.owner_client_id`;
- Sale + Rental owner selectors;
- staff identity/role boundary hardening;
- destructive `reset-sync` retired;
- another broker's Cotality listing cannot become Mallan-authored merely because a Mallan agent represented the buyer/tenant side;
- Mallan publication state separated from market status;
- `Listing.status` corrected in code/schema to nullable/no default for truthful market status;
- Broker-only publication approval boundary;
- forged public publication state fails closed;
- `EXPORTED` requires actual delivery evidence;
- `Last Published` uses real Mallan publication history;
- owner portal listing authorization uses canonical ownership;
- route-level Sale/Rental persistence/integration workflows + negative cases;
- PR #625 independent GitHub CI green at the code checkpoint;
- Vercel Preview build for #625 READY.

Still operationally OPEN on A:

1. real DB migration application has NOT occurred;
2. `ops:health`, drift/preflight, exact migration apply and post-apply `migrate status` proof have NOT occurred with correct credentials;
3. authenticated browser Sale + Rental proof has NOT occurred;
4. desktop/tablet/mobile behavioral proof has NOT occurred;
5. Production deployment/proof is NOT authorized and has NOT occurred;
6. legacy stored `Draft` cleanup is plan-only and unexecuted.

Do not stop #618 while A waits for its controlled migration/browser opportunity.

Do not call A Production-closed.

When returning to A, regenerate Prisma from A's schema first because the Search/security worktrees share generated Prisma types through one `node_modules` junction.

# 1. ABSOLUTE PROVIDER AUTHORITY — COTALITY ONLY

Mallan has ONE external provider/data authority: **Cotality**.

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE → MALLAN BUSINESS RULE → CRM / SEARCH / CMA / MY LISTINGS / EBLAST / PORTALS / PUBLIC CONSUMERS`

Do not create or preserve a second provider/standards/intermediary architecture.

Legacy persisted identifiers may survive only as compatibility artifacts where changing them requires separately controlled schema/env work. Do not propagate those names into new architecture.

Every provider-facing Search capability must be proven against authorized live Cotality evidence where the question is about provider semantics/capability.

Repo code can prove what Mallan asks for. It cannot prove Cotality accepts or means it.

For every executable provider criterion prove where applicable:

- exact Cotality resource;
- exact field(s);
- type;
- exact enum/string semantics;
- null/empty/unknown behavior;
- operator/filter semantics;
- permission/availability;
- live behavior/population;
- semantic equivalence to the broker-facing criterion.

# 2. HARD SCOPE AND CHANGE CONTROL

PR #618 is authenticated CRM/backend Search only until the Search closure gate is met.

IN SCOPE NOW:

- `public/crm/**` authenticated agent Search UI;
- Sale Search;
- Rental Search;
- Saved Searches;
- authenticated result workbench;
- Map / Search Within Results / Search Within Map;
- selection/client actions;
- Compare;
- Reports/calculators tied to authenticated Search;
- CMA inputs/foundation;
- Building Search foundation;
- authenticated Search API/execution/mapping.

PROTECTED / OUT OF SCOPE FOR #618:

- public consumer Search UI/behavior;
- `app/search`;
- public `SearchFilterPanel`;
- `/api/listings` public consumer behavior;
- public Search contracts;
- unrelated Neon/R2 work;
- schema/migration/backfill/env changes without separate explicit authorization;
- Cotality writes;
- Production deploy.

# 3. B2 FOUNDATION — COMPLETED, MUST NOT REGRESS

Commit: `37d32cf2cad562168628d159e8900ed2785c9985`

Proven defect:

`lib/search/canonical/field-registry.ts` called itself the mapping authority but could not reliably join to the executor and the executor did not consume it. The old `searchParam` field was descriptive prose, duplicate entries existed, and mappings drifted.

Correction completed:

- stable `searchParams` machine join key;
- `mappingOwner` for modules that legitimately own specialized mapping behavior;
- `cotalityFields` for composites;
- duplicate status entries merged conservatively;
- missing entries added including explicit refusals;
- new/unproven capabilities remain `needs_probe`, not falsely verified;
- source census added;
- anti-drift test added.

Reported Search suite at B2 checkpoint: **48 suites / 1,457 tests pass**.

B2 means the mapping registry can now be reconciled mechanically with execution. It does NOT mean Search is finished and does NOT by itself prove provider semantics.

# 4. SEARCH STEP 1 — B1 CANONICAL CRITERIA CONTRACTS

**THIS IS THE NEXT REQUIRED ENGINEERING SECTION.**

The executor/public browser interface is still effectively `URLSearchParams`. That transport shape cannot remain the business model.

Create/finish one canonical business contract per workflow:

## 4.1 Sale

One `SaleCriteria` object.

## 4.2 Rental

One `RentalCriteria` object.

Rental must not be Sale criteria plus ad-hoc rental flags.

## 4.3 Building

One `BuildingCriteria` object with BUILDING result identity, not listing rows plus building filters.

## 4.4 CMA

One `ComparableCriteria` contract consuming the same verified Search fact vocabulary. Sale CMA and Rental CMA remain distinct analyses.

## 4.5 Basic and Advanced

Basic and Advanced are two views/editors of the SAME Sale/Rental criteria object.

Switching Basic ↔ Advanced must not:

- recollect from DOM into a different vocabulary;
- lose criteria;
- change null/empty semantics;
- reinterpret enums;
- silently disable filters not displayed at one depth.

## 4.6 Transport

Serialization to request/query parameters is derived FROM canonical criteria.

`URLSearchParams` is transport, not Search truth.

Saved Search must ultimately persist canonical criteria, not DOM ids/raw query strings as business authority.

### STEP 1 CLOSURE GATE

Do not move to Section 5 until:

- SaleCriteria exists and is used through the active Sale Search path;
- RentalCriteria exists and is used through the active Rental Search path;
- Basic↔Advanced preserves the same canonical object;
- server serialization derives from canonical criteria;
- existing visible criteria are accounted for explicitly;
- unsupported/unverified criteria fail explicitly rather than disappear;
- targeted direct + negative + roundtrip tests exist.

# 5. SEARCH STEP 2 — MAKE REGISTRY → EXECUTOR ACTUALLY AUTHORITATIVE

B2 made the registry joinable. Now runtime authority must be consolidated.

Target:

`CANONICAL CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY MAPPING → EXECUTOR`

Remove/reduce parallel mapping truth from:

- browser translation tables;
- `crm-idx-filter` mapping tables;
- hard-coded Search API mapping/select lists where the registry can own them;
- Saved Search aliases;
- Map criteria maps;
- report maps;
- CMA maps.

Specialized mapping modules may remain where semantics genuinely require them, but the registry must point to the owner instead of restating another independent mapping.

Every executable criterion must have one answer to:

> Which exact Mallan criterion maps to which exact Cotality field(s)/operator and who owns that mapping?

### STEP 2 CLOSURE GATE

- one mapping authority path for all executable criteria;
- no duplicate criterion→provider truth;
- registry/executor census clean;
- unverified provider capabilities remain blocked/needs_probe;
- negative test catches mapping drift.

# 6. SEARCH STEP 3 — RESULT UNIVERSE / COUNT / PAGINATION TRUTH

Close these as ONE impact graph before UI polish.

## 6.1 Count semantics

Preserve separately:

- original provider match count, if known;
- continuation/narrowed-phase counts;
- final Mallan-authoritative result count;
- whether each is exact, lower-bound or incomplete.

One variable cannot change semantic meaning across phases.

## 6.2 Empty provider page

Empty records while exhaustion is unproven = explicit anomaly/incomplete state.

Do not silently set phase exhausted.

## 6.3 Incomplete page budget

`PAGE_INCOMPLETE_BUDGET` cannot become authoritative merely because continuation is unavailable or retry/fill caps were hit.

Either complete the page or expose truthful incomplete state.

## 6.4 One final universe

Apply in a coherent order so all consumers describe the SAME universe:

`Cotality results → Mallan listing authority → return-copy suppression → eligibility → dedupe → corpus filters → sort → count → pagination`

Do not announce totals and then filter rows out after pagination.

### STEP 3 CLOSURE GATE

Prove:

- no duplicate/gap paging;
- exact vs incomplete count state truthful;
- empty-page anomaly handled;
- page-local filters cannot silently shrink authoritative totals;
- downstream consumers can distinguish complete universe from explicit subset/incomplete result.

# 7. SEARCH STEP 4 — COMPLETE SALE + RENTAL BROKER SEARCH

Once the engine is truthful, finish actual agent capability.

## 7.1 Sale Search

Prove every supported visible Sale criterion maps/executed correctly, including appropriate verified combinations of:

- price;
- bedrooms;
- bathrooms;
- property type/subtype;
- market status;
- borough/neighborhood/geography;
- address;
- amenities;
- open house;
- relevant advanced criteria;
- building criteria where the workflow calls for building facts.

## 7.2 Rental Search

Separate Rental contract, including verified rental concepts such as:

- rent;
- bedrooms/bathrooms;
- furnished where verified;
- pets where verified;
- availability where verified;
- rental property type;
- rental market status;
- fees only where the Cotality contract actually supports the broker-facing concept.

## 7.3 Sorting + pagination

Prove first/middle/last pages, next/previous, changed sort, changed criteria, zero results and large result universes.

### STEP 4 CLOSURE GATE

No visible supported Sale/Rental criterion may be ignored, silently stripped or interpreted differently between Basic/Advanced/server.

# 8. SEARCH STEP 5 — MAP + SAVED SEARCH + WORKBENCH

These are Search infrastructure, not optional extras.

## 8.1 Map

Grid and Map use the SAME canonical Search criteria and SAME canonical Listing identities.

Target:

`viewport/polygon → canonical geographic criteria → authoritative server Search → Mallan coordinate resolution → pins`

Do not present an arbitrary first-N sample as geographic completeness.

Search Within Map updates canonical criteria.

Map criteria survive Basic↔Advanced and Saved Search where supported.

Transportation/grid/location criteria execute truthfully or fail explicitly.

## 8.2 Saved Search

Required Sale + Rental roundtrip:

`canonical criteria → execute → save → reload session/browser → restore criteria → restore UI → execute again`

Restored criteria must be structurally equivalent except legitimate live-market changes.

Client pass/reject/interaction state is not Search criteria.

## 8.3 Workbench selection

Selections persist across pages by canonical Listing identity.

### STEP 5 CLOSURE GATE

Grid, Map, Saved Search and selection all demonstrably use the same criteria/universe/identity.

# 9. SEARCH STEP 6 — COMPARE + REPORTS + CMA

Do NOT create separate search engines.

## 9.1 Compare

Consume selected canonical listings from Search.

## 9.2 Reports/calculators

Consume authoritative Search/listing facts and preserve attribution/compliance.

## 9.3 Sale CMA

Use verified transaction truth such as `ClosePrice` and `CloseDate`. Never use ListPrice as sold truth.

## 9.4 Rental CMA

Do not invent achieved rent where Cotality cannot prove it.

### STEP 6 CLOSURE GATE

Compare/Reports/CMA operate on authoritative Search results/selections and do not reconstruct provider criteria independently.

# 10. SEARCH STEP 7 — AUTHENTICATED BROWSER E2E CLOSURE

For BOTH Sale and Rental, prove on desktop/tablet/mobile:

`login`
→ Search
→ set criteria
→ Basic↔Advanced with zero loss
→ execute
→ truthful result count/universe
→ sort
→ paginate
→ open detail
→ return to exact result state
→ Map
→ Search Within Results / Search Within Map
→ Saved Search
→ reload browser/session
→ restore Search
→ re-execute
→ selection across pages
→ client action
→ Compare
→ Report
→ CMA input where applicable
→ attribution/compliance
→ authenticated Preview proof.

Mandatory negative browser/integration proof:

- unsupported criterion fails explicitly;
- unknown Cotality enum cannot silently broaden;
- incomplete universe cannot be labeled authoritative;
- Map cannot imply completeness from a sample;
- Basic↔Advanced cannot lose criteria;
- Saved Search cannot lose criteria;
- valid zero-population value is distinct from unsupported;
- another broker's Cotality listing cannot become Mallan-authored via agent association;
- Mallan Cotality return-copy cannot compete with canonical Mallan listing.

### SEARCH COMPLETE ONLY WHEN SECTION 10 CLOSES

Do not call Search finished from unit tests, route tests, CI green or a READY Preview alone.

# 11. NEXT PRODUCT PHASE — MY LISTINGS

After Search closes, move immediately to My Listings. Do not start an unrelated audit.

My Listings becomes the authenticated operational center for agents.

## 11.1 Listing authority states

Clearly distinguish:

- Mallan-authored editable listing;
- same Mallan listing with suppressed Cotality return-copy;
- third-party Cotality inventory, read-only;
- historical/closed listing;
- Seller/Landlord via `Listing.owner_client_id`;
- assigned Agent/Broker vs authorship.

## 11.2 Workspace must contain

- canonical listing facts;
- Seller/Landlord;
- assigned agent;
- **Market Status** separately;
- **Publication State** separately;
- compliance blockers;
- media;
- documents;
- activity/timeline;
- comments;
- showings;
- permitted client activity;
- CMA/reports;
- marketing actions;
- visibility/publication scope;
- actual Last Published;
- role-specific allowed/restricted actions.

## 11.3 Form roundtrip

For BOTH Sale and Rental:

`My Listings → New Listing → owner → form → create → save → My Listings → reopen → edit → save → reload`

Every entered structured field must survive create→read→edit→read.

No silent data loss.

## 11.4 Full listing chain

`My Listings → Sale/Rental form → owner → create → media/docs/activity → review → Broker decision → publication → My Listings updates → owner portal same canonical listing → public consumer same canonical listing when permitted`

### MY LISTINGS CLOSURE GATE

Desktop/tablet/mobile actual browser proof for create/reload/edit, authority/read-only distinction, blockers, media/docs/activity, review/publication, and identity continuity.

# 12. NEXT PRODUCT PHASE — LISTING EBLAST FROM MY LISTINGS

Maya must be able to market Mallan listings by eblast without creating another contact/listing truth.

The foundation is:

`CANONICAL LISTING → MY LISTINGS → CRM PARTY/CLIENT/AGENT + SAVED SEARCH → AUDIENCE MATCH → COMPLIANT CAMPAIGN → DELIVERY → DURABLE CRM ACTIVITY`

Do NOT create a second contact database.

Do NOT create an independent listing-matching engine for eblast.

## 12.1 Eblast entry point

For an eligible Mallan-authored listing, My Listings exposes a Marketing/Eblast action.

The agent selects:

- canonical listing;
- audience/segment;
- content/template;
- preview/test send;
- send/schedule where authorized.

Third-party Cotality inventory remains subject to its read-only/display rights and cannot be silently converted into Mallan-authored marketing inventory.

## 12.2 Audience authority

Reuse canonical CRM and Saved Search data.

Potential audiences include only those permitted by the actual CRM/compliance model, such as:

- brokerage agents;
- clients whose canonical Buyer/Tenant criteria/Saved Searches match;
- approved CRM segments;
- explicitly selected permitted recipients.

No duplicate shadow contact database.

## 12.3 Matching authority

Eblast matching reuses Search truth.

Target:

`Listing canonical facts → canonical Search/matching vocabulary → Saved Searches/CRM preferences → matched audience`

Do not invent an `eblast-matcher` with a second field/enum map.

## 12.4 Listing content authority

Campaign listing content comes from the canonical Listing and existing media/publication/compliance decisions.

Use only fields permitted for the target audience, such as applicable:

- hero media;
- displayable address;
- price/rent;
- beds/baths;
- property type;
- verified key features;
- open house/showing info;
- agent/brokerage information;
- canonical Mallan URL;
- call to action.

No manual duplicate listing record to power email.

## 12.5 Compliance before send

Required chain:

`Listing → publication/market state → audience → content → compliance → recipient suppression/unsubscribe → send`

Fail closed when, as applicable:

- listing is not permitted for that audience;
- publication approval is absent;
- required attribution is absent;
- Fair Housing/public-ad content is prohibited;
- unsubscribe/suppression fails;
- recipient is opted out;
- listing became withdrawn/canceled/expired/ineligible before send;
- Agent attempts to bypass Broker-only approval/compliance authority.

## 12.6 Durable CRM activity

Sending email is not the record of truth.

Persist campaign/activity history including applicable:

- creator;
- canonical listing id;
- audience criteria/segment;
- recipients;
- send time;
- delivery/failure state;
- opens/clicks where available;
- unsubscribe;
- reply/inquiry;
- resulting client/agent activity.

Web/email inquiry activity must become durable CRM history.

## 12.7 Eblast E2E closure

Prove:

`My Listings → eligible listing → Eblast → audience → preview → compliance → test send → authorized send → delivery record → recipient click/inquiry → CRM activity`

Mandatory negatives:

- unpublished/ineligible Mallan listing cannot be publicly eblasted;
- third-party Cotality inventory cannot be misrepresented as Mallan-authored;
- opted-out recipient cannot receive;
- duplicate recipient resolves once per campaign as intended;
- failed send remains a failure record;
- listing becoming ineligible blocks pending send where the architecture supports scheduled delivery;
- Agent cannot bypass Broker/compliance gates;
- Mallan return-copy does not create duplicate listing campaigns.

### EBLAST COMPLETE ONLY WHEN SECTION 12.7 CLOSES

# 13. NEW AGENT READINESS GATE — AFTER SEARCH + MY LISTINGS + EBLAST

Run a real non-Broker Agent through the brokerage chain on desktop/tablet/mobile.

Required day-one flow:

1. login;
2. CRM dashboard;
3. find/create client;
4. Buyer/Tenant opportunity;
5. Sale Search;
6. Rental Search where applicable;
7. Basic↔Advanced;
8. Saved Search;
9. Map/workbench;
10. selection/client action;
11. Seller client;
12. Sale listing with owner;
13. save/reload/edit;
14. Landlord client;
15. Rental listing with owner;
16. save/reload/edit;
17. find both in My Listings;
18. see Publication State + Market Status separately;
19. submit review and fail correctly on Broker-only approval;
20. permitted media/docs/activity;
21. create permitted Listing Eblast from My Listings;
22. prove compliance/recipient suppression;
23. prove send/click/inquiry creates durable CRM activity;
24. tablet workflow;
25. mobile workflow;
26. logout/login and recover durable state.

The Agent must not require Maya to:

- repair owner links;
- recover lost fields;
- explain ignored Search criteria;
- recover broken Saved Searches;
- tell them whether a listing is editable;
- identify hidden publication blockers;
- manually reconcile Mallan/Cotality duplicates;
- recover vanished activity;
- manually copy listing/contact data into a separate eblast system.

# 14. WORKTREE / BASELINE HAZARDS — DO NOT MISDIAGNOSE

Known measured local hazards from the B2 session:

- stray `.cache/closure2/**/jest.config.js` scratch files can trip `jest-config-reachability`;
- untracked work from other lanes included `crm-my-listings-pagination`, `ensure-listing-reserved-namespace`, and `buyer-participation-mapper`;
- the buyer-participation untracked file imported symbols not present on branch and produced type errors;
- Search and security worktrees share generated Prisma types via one `node_modules` junction.

Before changing unrelated code due to a failing test:

1. establish clean tracked baseline;
2. compare failure with your changes stashed/removed;
3. prove causation;
4. do not absorb/delete another workstream's untracked files merely to make local tests green.

# 15. TESTING / ANTI-LOOP STANDARD

For every defect family:

`PROVEN DEFECT → ROOT CAUSE → COMPLETE READERS/WRITERS IMPACT GRAPH → CORRECTION → DIRECT TEST → NEGATIVE TEST → INTEGRATION → PERSISTENCE → BROWSER E2E → DOWNSTREAM → COMPLIANCE → PREVIEW → PRODUCTION`

A source assertion, unit test, route test, in-memory persistence test, CI pass or READY Preview each proves something useful. None alone closes the user workflow.

Run grouped targeted tests during development.

Run broad gates at closure boundaries.

Do not fall into endless `test fails → tiny patch → next test fails` loops without first establishing the impact graph.

# 16. MANDATORY PROGRESS REPORT FORMAT FOR CLAUDE

Every substantial progress update or handoff MUST begin with:

- **CURRENT SECTION:** e.g. `4 — Search B1 Canonical Criteria`;
- **STATUS:** `OPEN / IN PROGRESS / CLOSED BY EVIDENCE`;
- **HEAD SHA:** exact pushed tracked head;
- **WHAT CLOSED:** specific subsection(s) with evidence;
- **WHAT REMAINS IN THIS SECTION:** explicit items;
- **NEXT SECTION ALLOWED:** only if the current closure gate is actually satisfied;
- **HOLDS:** A migration/browser/Production holds or other controlled holds;
- **OUT-OF-SCOPE/BASELINE FINDINGS:** reported separately, not silently absorbed.

If Claude intentionally departs from this sequence, the update MUST say:

`SEQUENCE DEVIATION — <reason>`

and explain why continuing the required current section is impossible or unsafe.

Do not quietly jump from Search to My Listings, from My Listings to Eblast, or from Eblast to another product area.

# 17. DEFINITION OF DONE FOR THIS EXECUTION PROGRAM

Do not claim the program complete until:

- A's authorized Listing.status migration is applied/verified through the controlled process;
- final Sale/Rental browser persistence/publication proof exists;
- Search Sections 4–10 are closed with authenticated browser evidence;
- one canonical Search criteria/mapping/execution/result universe powers Saved Search/Map/workbench/Compare/Reports/CMA;
- My Listings Section 11 is closed end-to-end;
- Listing Eblast Section 12 is closed end-to-end using canonical Listing + CRM + Saved Search data;
- eblast compliance/suppression/durable activity are proven;
- a real non-Broker Agent passes Section 13 on desktop/tablet/mobile;
- Cotality remains the sole provider/data authority;
- no silent data loss remains in these workflows;
- Production completion is claimed only after separately authorized migration/deploy proof.

If an operational migration/deploy window is unavailable, continue the next safe authorized engineering section while preserving the exact hold. Do not stop the project and do not relabel partial proof as completion.