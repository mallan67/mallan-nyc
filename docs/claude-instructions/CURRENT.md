# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search branch / PR #618:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified B2 code checkpoint:** `37d32cf2cad562168628d159e8900ed2785c9985`

**PR #618:** draft, open, unmerged. Do not Production-deploy.

**Durable instruction file:** `docs/claude-instructions/CURRENT.md`

Before ANY mutation:

1. fetch/pull/rebase as appropriate;
2. verify local branch == remote branch;
3. read THIS FILE completely from the active branch/worktree;
4. read `docs/architecture/MALLAN-PLATFORM-MASTER-PLAN.md` as the single product/system authority;
5. use `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` as execution-state authority where current;
6. identify the exact numbered section below you are executing;
7. do not skip ahead because another area looks easier.

Old chats, audits, handoffs and memory files are evidence only. They do not override the Master Plan, this current execution sequence, live Cotality truth, live Neon truth or current Git evidence.

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
3. authenticated browser Sale + Rental workflow proof has NOT occurred;
4. desktop/tablet/mobile behavioral proof has NOT occurred;
5. Production deployment/proof is NOT authorized and has NOT occurred;
6. legacy stored `Draft` cleanup is plan-only and unexecuted.

Do not stop #618 while A waits for its controlled migration/browser opportunity.

Do not call A Production-closed.

When returning to A, regenerate Prisma from A's schema first because the Search/security worktrees share generated Prisma types through one `node_modules` junction.

## B. Search — active

B2 mapping-registry foundation is complete at `37d32cf2…`.

Current work must stay in Section 4 until the Section 4 closure gate is actually satisfied.

Search is NOT complete.

## C. Planned sequence after Search

After Search closes:

1. My Listings — Section 11;
2. Listing Eblast — Section 12;
3. New Agent Readiness — Section 13;
4. controlled Neon/R2 verification-and-closure lane — Section 14, only when Maya explicitly resumes Neon work.

Section 14 is written now so the future Neon session does not repeat prior partial fixes, stale claims or non-Production proof.

# 1. ABSOLUTE PROVIDER AUTHORITY — COTALITY ONLY

Mallan has ONE external provider/data authority: **Cotality**.

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE → MALLAN BUSINESS RULE → CRM / SEARCH / CMA / MY LISTINGS / EBLAST / PORTALS / PUBLIC CONSUMERS`

Do not create or preserve a second provider/standards/intermediary architecture.

Do NOT create new architecture using RLS, RESO, RealPlus or Trestle as provider/system authorities.

Legacy persisted identifiers, variable names, script names or historical comments containing those terms may remain temporarily only as compatibility/debt when changing them would expand scope or require controlled migration. Their existence does not make them an authority.

When touching/replacing a legacy module during current work, do not propagate those legacy names into new canonical criteria/contracts. New canonical Search code should use Mallan business terminology and verified Cotality facts.

Example: an existing variable such as `resoStatuses` or an existing validation script such as `rls:validate` is compatibility debt, not permission to create `RESO`/`RLS` architecture. If B1 replaces the serializer that owns such a variable, rename/remove the legacy concept as part of the replacement where safe and prove no dependent contract is broken.

Every provider-facing Search capability must be proven against authorized live Cotality evidence where the question is provider semantics/capability.

Repo code proves what Mallan currently asks for. It does NOT prove Cotality accepts, populates or semantically means it.

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

The future Neon Section 14 is a durable plan only. Do not interrupt Search to execute it.

# 3. B2 FOUNDATION — COMPLETED, MUST NOT REGRESS

Commit: `37d32cf2cad562168628d159e8900ed2785c9985`

Proven defect:

`lib/search/canonical/field-registry.ts` called itself the mapping authority but could not reliably join to the executor and the executor did not consume it. The old `searchParam` field was descriptive prose, duplicate entries existed and mappings drifted.

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

B2 means the registry can now be reconciled mechanically with execution. It does NOT mean Search is finished and does NOT prove new provider semantics.

# 4. SEARCH STEP 1 — B1 CANONICAL CRITERIA CONTRACTS

**THIS IS THE CURRENT REQUIRED ENGINEERING SECTION.**

The executor/browser interface is still effectively `URLSearchParams`. Transport cannot remain the business model.

A defect found while establishing this complete impact graph may be corrected in Section 4 when it directly proves/breaks the current canonical-criteria chain. Do not let such corrections turn back into checkbox-by-checkbox patching; after the defect correction, continue the canonical contract work.

## 4.0 Current proven transport defect checkpoint

At commit `0d9a78c2665e74614a92f8b896a33ec6751c2a9d`, Claude proved a market-status transport defect:

- `criteria.statuses` was read and deduped;
- no `params.status` assignment occurred;
- the server treated absent status as its Active/ComingSoon/ActiveUnderContract default;
- therefore a broker choosing Closed/Pending/Withdrawn/Expired could silently receive active inventory;
- the existing two-boundary invariant test missed the exact read-but-emits-nothing gap;
- the assignment and a third structural invariant were added;
- commit scope was limited to the authenticated CRM serializer/built artifact and transport invariant test.

This is a valid Section 4 finding/correction. It does NOT close Section 4. Continue the canonical criteria work below.

## 4.1 Sale

Create one `SaleCriteria` business object.

## 4.2 Rental

Create one `RentalCriteria` business object.

Rental must not be Sale criteria plus ad-hoc rental flags.

## 4.3 Building

Create one `BuildingCriteria` contract with BUILDING result identity, not listing rows plus building filters.

## 4.4 CMA

Create one `ComparableCriteria` contract consuming the same verified Search fact vocabulary. Sale CMA and Rental CMA remain distinct analyses.

## 4.5 Basic and Advanced

Basic and Advanced edit/view the SAME Sale/Rental criteria object.

Switching Basic ↔ Advanced must not:

- recollect from DOM into a different vocabulary;
- lose criteria;
- change null/empty semantics;
- reinterpret enums;
- silently disable criteria not displayed at one depth.

The current known structural defect is that `toggleSearchMode()` changes display/count but transfers no state while multiple criterion families have separate Basic/Advanced elements. B1 must remove this as an authority split, not paper over it with ad-hoc copying.

## 4.6 Transport

Serialization to request/query parameters derives FROM canonical criteria.

`URLSearchParams` is transport, not Search truth.

Saved Search must persist/restore canonical criteria, not DOM ids/raw query strings as business authority.

### STEP 1 CLOSURE GATE

Do not move to Section 5 until:

- `SaleCriteria` exists and drives the active Sale Search path;
- `RentalCriteria` exists and drives the active Rental Search path;
- Building/CMA contract ownership has been examined and the required canonical contracts are established or explicitly sequenced without creating parallel truth;
- Basic↔Advanced preserves the same canonical object;
- server serialization derives from canonical criteria;
- every visible criterion is explicitly accounted for;
- unsupported/unverified criteria fail explicitly instead of disappearing;
- Saved Search persistence/restore ownership has been traced so B1 does not create a second persistence contract;
- targeted direct + negative + roundtrip tests exist.

# 5. SEARCH STEP 2 — MAKE REGISTRY → EXECUTOR ACTUALLY AUTHORITATIVE

B2 made the registry joinable. Runtime authority must now be consolidated.

Target:

`CANONICAL CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY MAPPING → EXECUTOR`

Remove/reduce parallel mapping truth from:

- browser translation tables;
- `crm-idx-filter` mapping tables;
- hard-coded Search API mapping/select lists where registry ownership is appropriate;
- Saved Search aliases;
- Map criteria maps;
- Report maps;
- CMA maps.

Specialized mapping modules may remain when semantics genuinely require them, but the registry points to the owner instead of restating another independent mapping.

Every executable criterion must have one answer to:

> Which exact Mallan criterion maps to which exact Cotality field(s)/operator and who owns that mapping?

### STEP 2 CLOSURE GATE

- one mapping-authority path for all executable criteria;
- no duplicate criterion→provider truth;
- registry/executor census clean;
- unverified capabilities remain blocked/`needs_probe`;
- negative test catches mapping drift.

# 6. SEARCH STEP 3 — RESULT UNIVERSE / COUNT / PAGINATION TRUTH

Close this as ONE impact graph before UI polish.

## 6.1 Count semantics

Preserve separately:

- original provider match count, if known;
- continuation/narrowed-phase counts;
- final Mallan-authoritative result count;
- whether each is exact, lower-bound or incomplete.

One variable cannot change meaning across phases.

## 6.2 Empty provider page

Empty rows while exhaustion is unproven = explicit anomaly/incomplete state.

Do not silently declare the phase exhausted.

## 6.3 Incomplete page budget

`PAGE_INCOMPLETE_BUDGET` cannot become authoritative because continuation is unavailable or retry/fill caps were hit.

Either complete the page or expose truthful incomplete state.

## 6.4 One final universe

All consumers must describe the SAME final universe:

`Cotality results → Mallan listing authority → return-copy suppression → eligibility → dedupe → corpus filters → sort → count → pagination`

Do not declare totals and then filter rows out after pagination.

### STEP 3 CLOSURE GATE

Prove:

- no duplicate/gap paging;
- exact vs incomplete count state truthful;
- empty-page anomaly handled;
- page-local filters cannot silently shrink authoritative totals;
- downstream consumers can distinguish a complete universe from an explicit subset/incomplete result.

# 7. SEARCH STEP 4 — COMPLETE SALE + RENTAL BROKER SEARCH

Once the engine is truthful, finish actual agent capability.

## 7.1 Sale Search

Prove each supported visible Sale criterion executes correctly, including appropriate verified combinations of:

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
- building facts where appropriate.

## 7.2 Rental Search

Use the separate Rental contract, including only verified rental concepts such as:

- rent;
- bedrooms/bathrooms;
- furnished where verified;
- pets where verified;
- availability where verified;
- rental property type;
- rental market status;
- fees only where the Cotality contract proves the broker-facing concept.

## 7.3 Sorting + pagination

Prove first/middle/last pages, next/previous, changed sort, changed criteria, zero results and large result universes.

### STEP 4 CLOSURE GATE

No supported visible Sale/Rental criterion may be ignored, silently stripped or interpreted differently between Basic/Advanced/server.

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

Do NOT create separate Search engines.

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
→ browser/session reload
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
- Mallan Cotality return-copy cannot compete with the canonical Mallan listing.

### SEARCH COMPLETE ONLY WHEN SECTION 10 CLOSES

Do not call Search finished from unit tests, route tests, CI green or a READY Preview alone.

# 11. NEXT PRODUCT PHASE — MY LISTINGS

After Search closes, move immediately to My Listings. Do not start another unrelated audit.

My Listings becomes the authenticated operational center for agents.

## 11.1 Listing authority states

Clearly distinguish:

- Mallan-authored editable listing;
- same Mallan listing with suppressed Cotality return-copy;
- third-party Cotality inventory, read-only;
- historical/closed listing;
- Seller/Landlord through `Listing.owner_client_id`;
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

Desktop/tablet/mobile browser proof for create/reload/edit, authority/read-only distinction, blockers, media/docs/activity, review/publication and identity continuity.

# 12. NEXT PRODUCT PHASE — LISTING EBLAST FROM MY LISTINGS

Maya must be able to market Mallan listings by eblast without creating another contact/listing truth.

Foundation:

`CANONICAL LISTING → MY LISTINGS → CRM PARTY/CLIENT/AGENT + SAVED SEARCH → AUDIENCE MATCH → COMPLIANT CAMPAIGN → DELIVERY → DURABLE CRM ACTIVITY`

Do NOT create a second contact database.

Do NOT create an independent listing-matching engine for Eblast.

## 12.1 Eblast entry point

For an eligible Mallan-authored listing, My Listings exposes Marketing/Eblast.

The agent selects:

- canonical listing;
- audience/segment;
- content/template;
- preview/test send;
- send/schedule where authorized.

Third-party Cotality inventory remains subject to its read-only/display rights and cannot silently become Mallan-authored marketing inventory.

## 12.2 Audience authority

Reuse canonical CRM and Saved Search data.

Permitted audiences may include, according to the actual CRM/compliance model:

- brokerage agents;
- clients whose canonical Buyer/Tenant criteria/Saved Searches match;
- approved CRM segments;
- explicitly selected permitted recipients.

No duplicate shadow contact database.

## 12.3 Matching authority

Eblast matching reuses Search truth:

`Listing canonical facts → canonical Search/matching vocabulary → Saved Searches/CRM preferences → matched audience`

Do not invent an `eblast-matcher` with a second field/enum map.

## 12.4 Listing content authority

Campaign content comes from canonical Listing + existing media/publication/compliance decisions.

Use only fields permitted for the target audience, such as applicable:

- hero media;
- displayable address;
- price/rent;
- beds/baths;
- property type;
- verified key features;
- open house/showing information;
- agent/brokerage information;
- canonical Mallan URL;
- call to action.

No manual duplicate listing record powers email.

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

Persist applicable campaign/activity history:

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

Web/email inquiry activity becomes durable CRM history.

## 12.7 Eblast E2E closure

Prove:

`My Listings → eligible listing → Eblast → audience → preview → compliance → test send → authorized send → delivery record → recipient click/inquiry → CRM activity`

Mandatory negatives:

- unpublished/ineligible Mallan listing cannot be publicly eblasted;
- third-party Cotality inventory cannot be misrepresented as Mallan-authored;
- opted-out recipient cannot receive;
- duplicate recipient resolves once per campaign as intended;
- failed send remains a failure record;
- listing becoming ineligible blocks pending send where scheduled-delivery architecture supports it;
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
- manually copy listing/contact data into a separate Eblast system.

# 14. FUTURE CONTROLLED NEON / R2 VERIFICATION-AND-CLOSURE LANE

**DO NOT EXECUTE THIS SECTION DURING ACTIVE #618 SEARCH WORK.**

Activate Section 14 only when Maya explicitly says to resume Neon/R2 work.

Purpose: independently verify whether prior Neon/R2 work actually fixed **CPU/wake time, churn/write amplification, shedding, storage growth, media handling and R2 behavior**. Do not inherit a prior claim of completion.

The historical record `memory/NEON-CPU-STORAGE-2026-08-02.md` explicitly said Production CPU/storage were unchanged until merge/deploy/post-deployment measurement, and listed open paths including listing-detail reads, `/api/listings` live reads, write amplification, physical-storage reclamation and media freshness/backlog. Treat that record and related audits as evidence/backlog, not current truth.

## 14.1 Required authorities before Neon work

Read completely before any DB/Prisma/Neon mutation:

- `NEON.md` — Mallan Neon/Prisma/migration authority;
- `docs/DEPLOYMENT.md`;
- Master Plan;
- current continuous-execution state;
- current Neon/R2 closure PR/branch live from GitHub — do not assume an old #620 head or Production SHA is still current.

Live Neon facts override stale documentation only after independently verified and then documented correctly.

Never guess which Neon project/branch/endpoint is Production.

## 14.2 Maya authorization for Claude-side official Neon agent tooling

Maya authorizes use/installation of **official Neon agent tooling in Claude's local development environment** for diagnosis and verification.

This authorization covers:

- current Neon CLI (`neon`; `neonctl` compatibility may exist);
- Neon Agent Skills (`neon skills`, `neon skills update` when already installed);
- official Neon Claude Code plugin/skills where appropriate;
- Neon MCP for project inspection/diagnostics when configured with the narrowest practical project-scoped access;
- read-only `neon inspect db` diagnostics;
- read-only Neon API/control-plane inspection;
- `neon diff` as additional schema-drift evidence.

This authorization does **NOT** authorize:

- Production SQL/data mutation;
- Production schema mutation;
- branch creation/deletion;
- snapshot creation/restore/finalize;
- project creation/deletion;
- endpoint/compute setting changes;
- credentials/env changes in Vercel/Production;
- R2 deletion/mutation;
- migration application outside the separately authorized migration procedure.

Official Neon tooling expands visibility. It does not expand mutation authority.

### Preferred setup policy

1. First check whether current Neon skills/plugin/MCP are already installed and usable.
2. Prefer `neon skills` / `neon skills update` for current Neon command/workflow knowledge.
3. If MCP is used, prefer project-scoped credentials/permissions and minimum access needed for inspection.
4. Do NOT run broad one-shot setup that creates projects/branches/env bindings without reviewing exactly what it will do.
5. Do NOT automatically use `neon checkout` to create DB branches from Git branches. Mallan's branch-creation restrictions remain controlling.
6. Do NOT use `neon env pull` against Production unless an explicit environment-change authorization exists.

## 14.3 Production identity gate — first proof, before diagnostics

Before trusting any Neon measurement, prove exact live target:

`repo NEON.md facts ↔ Neon project ↔ branch ↔ endpoint ↔ region ↔ plan ↔ Vercel-bound database`

Use read-only mechanisms such as:

- `neon status` for local pinned context;
- Neon MCP/API/project inspection;
- existing `npm run neon:verify` / `ops:health` where appropriate;
- Vercel binding evidence.

If any identity fact disagrees, STOP mutation and classify as `IDENTITY DRIFT` until resolved.

Do not modify NEON.md merely to make verification green.

## 14.4 Read-only Neon diagnostic baseline — use new tooling

Use `neon inspect db` (or MCP `inspect_database` equivalent) as the standard first-pass Postgres diagnostics instead of improvising raw catalog SQL.

Run applicable read-only checks against the proven target:

- `table-sizes`;
- `index-sizes`;
- `bloat`;
- `unused-indexes`;
- `seq-scans`;
- `long-running-queries`;
- `locks`;
- `outliers`;
- `calls`;
- `vacuum-stats`;
- `replication-slots`;
- `subscriptions`;
- `lfc-hit-rate`;
- `working-set`.

Do not create a missing extension merely because a diagnostic suggests `CREATE EXTENSION`. Extension creation is a DB mutation and requires separate authorization.

Record outputs in machine-readable form where useful so before/after evidence is comparable.

## 14.5 CPU / compute wake-time closure

First re-verify current compute configuration. Do not assume the historical fixed `0.25 CU` fact is still true.

Then measure and explain:

- compute active/wake seconds over comparable windows;
- compute-unit seconds/hours;
- real suspension intervals;
- endpoint start/last-active behavior;
- cron/scheduled wake sources;
- all routes/import paths that touch Prisma/Neon;
- listing-detail first-render Neon reads;
- `/api/listings` live reads;
- keepalive/preflight/heartbeat behavior;
- background sync/media/retention wake cadence;
- query outliers/calls that materially extend active time.

For the preflight/shedding path prove actual runtime behavior:

`no Cotality change → no unnecessary Prisma/Neon touch`

and separately:

`heartbeat/freshness bound reached OR preflight uncertain/error → full cycle runs fail-open`

Do not claim CPU fixed from code structure alone. Require Production before/after active-time evidence after authorized deployment.

## 14.6 Churn / write-amplification closure

Treat churn as a measurable write problem, not a vague label.

Build complete writer graph for at minimum:

- `listings`;
- `listing_media`;
- sync state;
- audit/event tables;
- cache/manifest persistence paths that can touch Neon;
- retention updates/deletes;
- any writer that moves `xmin`/`updated_at` without a material business/provider change.

Measure over comparable windows:

- UPDATE/INSERT/DELETE counts;
- updates per materially changed provider/listing fact;
- HOT vs non-HOT updates where available;
- dead tuples/autovacuum effects;
- index churn;
- WAL/write-amplification signals available through the platform/statistics;
- byte-identical/no-op writes that still reach Postgres;
- per-cycle audit/event writes;
- media writes per actual locator/content/policy change.

Use existing writer-suppression code as evidence, not proof that suppression works.

Required invariant:

`no material source/business change → no durable row rewrite unless a separately justified heartbeat/audit requirement exists`

## 14.7 Shedding closure

Do not invent a new "shedding" subsystem.

First establish from current repo code/docs what Mallan currently means by shedding. If no narrower canonical definition exists, treat it as **workload/write shedding before Neon**:

- no-change Cotality preflight avoids DB work;
- unchanged listings do not rewrite;
- unchanged media does not rewrite;
- low-value/redundant reads are served from the correct cache/static layer where safe;
- stale/failed cache paths fail safely without bypassing compliance/freshness;
- heartbeat guarantees freshness while no-change shedding is active;
- expensive background work does not keep Neon continuously awake when no real work exists.

Prove both sides:

- positive shedding: unnecessary work is skipped;
- negative safety: changed/uncertain/compliance-required work is NOT shed.

## 14.8 Storage closure — four separate numbers, never collapse them

Always report separately:

1. logical payload/data size;
2. physical table/index relation size + bloat/dead tuples;
3. retained Neon history/WAL/branch/snapshot effects;
4. Neon billed/synthetic storage.

A DELETE/UPDATE that removes logical payload may initially increase WAL/dead tuples and may not reduce billed storage.

Use `neon inspect db table-sizes`, `index-sizes`, `bloat`, `vacuum-stats` plus Neon consumption/control-plane metrics to measure these layers separately.

Do not claim storage savings from row counts alone.

Do not perform without separate authorization:

- `VACUUM FULL`;
- `pg_repack`;
- destructive index/table drops;
- large cleanup/backfill;
- retention/history setting changes;
- branch/snapshot deletion.

## 14.9 Media + R2 handling closure — holistic, not one screen

Neon Object Storage is NOT Mallan media authority. Mallan currently uses Cloudflare R2; do not migrate to Neon Object Storage merely because Neon offers object storage/functions.

Trace entire media chain:

`Cotality media relationship/raw evidence → Mallan canonical listing identity → listing_media/storage state → R2 policy/reachability → API/DTO readers → My Listings → Search/cards/detail/public/portal/Eblast consumers`

Verify at minimum:

- canonical media ownership/identity;
- return-copy reconciliation does not duplicate media authority;
- `media_url_original` freshness/backlog state;
- cached/original/R2 locator semantics;
- pending/excluded/reachable policy states;
- byte-identical locator/content/policy decisions do not rewrite rows;
- locator-only refresh is actually locator-only;
- changed locators/media do update;
- R2 keys referenced by live consumers are retained;
- orphan/retention logic cannot delete referenced assets;
- tombstoned DB media payload cleanup does not falsely imply R2 object cleanup;
- all readers use corrected canonical media composition, not screen-specific fixes;
- listing cards, detail, CRM/My Listings, portal, Search/report/Eblast consumers see consistent media.

R2 inventory/bytes/reference truth must come from Cloudflare/R2 evidence, not Neon Object Storage tooling.

No R2 deletion/destructive operation without explicit Maya authorization.

## 14.10 Schema/migration verification with Neon diff tooling

For schema-change lanes, use BOTH histories:

`Prisma migrate diff/status/history + Neon schema diff`

`neon diff` is additional independent evidence. It does not replace Prisma migration history.

Never use `prisma db push` to bypass migration history.

Never put migrations into Vercel build.

Snapshot tooling may be useful as an explicit migration safety mechanism, but snapshot create/restore/finalize is a control-plane mutation and requires separate Maya authorization before use.

## 14.11 Existing Neon/media evidence to re-check, not blindly trust

At Neon resumption inspect current versions/relevance of at least:

- `NEON.md`;
- `memory/NEON-CPU-STORAGE-2026-08-02.md`;
- `docs/operations/neon-cpu-storage-evidence-2026-08-02.md`;
- `docs/operations/neon-write-amplification-capture-2026-07-26.md`;
- `docs/operations/neon-listing-media-backlog-index-2026-07-28.md`;
- `docs/audits/listing-media-reader-ownership-2026-08-13.md`;
- `docs/operations/storage-health-monitor.md`;
- `scripts/storage-health-monitor.ts`;
- `lib/idx/write-suppression.ts`;
- `lib/idx/media-sync.ts`;
- current Neon/R2 PR/branch and its exact code.

Do not create a new master audit. Amend current execution/closure evidence.

## 14.12 Neon/R2 closure matrix — every row requires Production evidence

Before saying Neon/R2 is fixed, produce a compact matrix with at least:

| Area | Baseline | Root cause | Correction | Direct/negative proof | Preview | Production before/after | Verdict |
|---|---|---|---|---|---|---|---|
| Compute wake/CPU | measured | proven | implemented | yes | yes | required | OPEN/CLOSED |
| Churn/write amplification | measured | proven | implemented | yes | yes | required | OPEN/CLOSED |
| Shedding | measured | proven | implemented | yes | yes | required | OPEN/CLOSED |
| Logical storage | measured | proven | implemented | yes | yes | required | OPEN/CLOSED |
| Physical/bloat/history/billed storage | measured separately | proven | implemented | yes | yes | required | OPEN/CLOSED |
| Media DB writes | measured | proven | implemented | yes | yes | required | OPEN/CLOSED |
| Media/R2 identity/references | measured | proven | implemented | yes | yes | required | OPEN/CLOSED |
| R2 retention/orphans | measured | proven | implemented | yes | yes | required | OPEN/CLOSED |

A green test or successful deployment cannot fill the Production before/after column.

### SECTION 14 COMPLETE ONLY WHEN

- live Production identity is proven;
- Neon skills/diagnostic tooling is current enough for the work or an explicit limitation is recorded;
- CPU/wake reduction is proven in comparable Production windows;
- churn/write amplification is quantified and corrected at all major writers;
- shedding skips unnecessary work without violating freshness/compliance;
- logical, physical, retained-history and billed storage are separately measured and stable/improved as intended;
- media DB writes converge to change-only behavior;
- media/R2 reader/writer/reference graph is coherent across the platform;
- no referenced R2 asset is lost;
- open media freshness/backlog defects are resolved or explicitly bounded with evidence;
- all destructive/Production mutations were separately authorized;
- independent Production proof exists after the authorized deployment/operational window.

# 15. WORKTREE / BASELINE HAZARDS — DO NOT MISDIAGNOSE

Known measured local hazards from the B2/Section 4 sessions:

- stray `.cache/closure2/**/jest.config.js` scratch files can trip `jest-config-reachability`;
- untracked work from other lanes included `crm-my-listings-pagination`, `ensure-listing-reserved-namespace`, and `buyer-participation-mapper`;
- the buyer-participation untracked file imported symbols not present on branch and produced type errors;
- Search and security worktrees share generated Prisma types via one `node_modules` junction.

Before changing unrelated code due to a failing test:

1. establish clean tracked baseline;
2. compare failure with your changes stashed/removed;
3. prove causation;
4. do not absorb/delete another workstream's untracked files merely to make local tests green.

# 16. TESTING / ANTI-LOOP STANDARD

For every defect family:

`PROVEN DEFECT → ROOT CAUSE → COMPLETE READERS/WRITERS IMPACT GRAPH → CORRECTION → DIRECT TEST → NEGATIVE TEST → INTEGRATION → PERSISTENCE → BROWSER E2E → DOWNSTREAM → COMPLIANCE → PREVIEW → PRODUCTION`

For infrastructure additionally require:

`LIVE IDENTITY → BASELINE METRIC → WRITER/READER/WAKE GRAPH → CORRECTION → SAME METRIC AFTER → COST/STORAGE/WAKE VERDICT`

A source assertion, unit test, route test, in-memory persistence test, CI pass, READY Preview or read-only diagnostic each proves something useful. None alone closes the real user or Production workflow.

Run grouped targeted tests during development.

Run broad gates at closure boundaries.

Do not fall into endless `test fails → tiny patch → next test fails` loops without first establishing the complete impact graph.

# 17. MANDATORY PROGRESS REPORT FORMAT FOR CLAUDE

Every substantial progress update or handoff MUST begin with:

- **CURRENT SECTION:** e.g. `4 — Search B1 Canonical Criteria`;
- **STATUS:** `OPEN / IN PROGRESS / CLOSED BY EVIDENCE`;
- **HEAD SHA:** exact pushed tracked head;
- **WHAT CLOSED:** specific subsection(s) with evidence;
- **WHAT REMAINS IN THIS SECTION:** explicit items;
- **NEXT SECTION ALLOWED:** only if the current closure gate is actually satisfied;
- **HOLDS:** A migration/browser/Production holds or other controlled holds;
- **OUT-OF-SCOPE/BASELINE FINDINGS:** reported separately, not silently absorbed.

When Section 14 is active also report:

- **NEON TOOLING STATUS:** CLI/skills/plugin/MCP actually available;
- **LIVE PROJECT/BRANCH/ENDPOINT:** exact verified Production identity;
- **ACCESS MODE:** read-only diagnostic vs separately authorized mutation;
- **BASELINE WINDOW:** exact timestamps;
- **AFTER WINDOW:** exact comparable timestamps;
- **CPU/WAKE:** before vs after;
- **CHURN:** before vs after;
- **STORAGE:** logical / physical / history / billed separately;
- **MEDIA/R2:** DB writes + reference/inventory status separately.

If Claude intentionally departs from the numbered sequence, the update MUST say:

`SEQUENCE DEVIATION — <reason>`

and explain why continuing the required current section is impossible or unsafe.

Do not quietly jump from Search to My Listings, My Listings to Eblast, Eblast to another product area, or into Neon/R2 before Maya resumes that lane.

# 18. DEFINITION OF DONE FOR THIS EXECUTION PROGRAM

Do not claim the program complete until:

- A's authorized `Listing.status` migration is applied/verified through the controlled process;
- final Sale/Rental browser persistence/publication proof exists;
- Search Sections 4–10 are closed with authenticated browser evidence;
- one canonical Search criteria/mapping/execution/result universe powers Saved Search/Map/workbench/Compare/Reports/CMA;
- My Listings Section 11 is closed end-to-end;
- Listing Eblast Section 12 is closed end-to-end using canonical Listing + CRM + Saved Search data;
- Eblast compliance/suppression/durable activity are proven;
- a real non-Broker Agent passes Section 13 on desktop/tablet/mobile;
- when Maya resumes Neon/R2, Section 14 is independently closed with Production before/after proof for CPU/wake, churn, shedding, storage and media/R2 behavior;
- Cotality remains the sole external property/provider data authority;
- Neon remains the canonical Mallan Postgres infrastructure according to verified project identity, not an agent-created replacement;
- Cloudflare R2 remains media object-store authority unless a separately authorized architecture change says otherwise;
- no silent data loss remains in product workflows;
- no silent no-op write amplification remains in critical infrastructure writers;
- Production completion is claimed only after separately authorized migration/deploy/operational proof.

If an operational migration/deploy window is unavailable, continue the next safe authorized engineering section while preserving the exact hold. Do not stop the project and do not relabel partial proof as completion.