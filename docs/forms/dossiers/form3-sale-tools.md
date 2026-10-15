# FORM 3 DOSSIER: Sale Listing Viewer with Tools

`public/crm/SALE-FORM-WITH-TOOLS.html` (7,799 lines; served at `/crm/sale-view` on Vercel, `vercel.json:77`). Owner: form3-owner. Written 2026-10-15.

**Tested revision.** Repo `C:\Users\MayaAllan\Desktop\mallan-nyc`, HEAD `92877676` (read at 2026-10-15; it was `1b21cb41` when I started, others are adding docs commits) on branch `docs/owner-clarifications-2026-10-15` (remote https://github.com/mallan67/mallan-nyc.git, working tree clean). The brief names `71381e1c` on `tmp-audit-main`; `git diff 71381e1c HEAD -- public app lib prisma vercel.json` is empty (only MALLAN-PLATFORM-MASTER-PLAN.md changed, 24 added lines, section 0.15), so every finding applies to both. The repo was only read. App: http://localhost:3100 (dev server, not restarted). DB: throwaway Postgres 127.0.0.1:55432/t. Browser: real Chrome through Playwright; the page hard-codes `https://mallan.nyc`, so every such request was routed to localhost (0 requests reached production).

**Headline.** As shipped the page does not run (a JavaScript syntax error), and even after the syntax is repaired it shows 12 of the 72 fields it tries to fill, no photos, no video, no tour, no listing agent, the logged-in user as the listing agent, wrong closing-cost arithmetic above $3M, and its print, email and copy functions throw. Acceptance baseline: **3/91 passed, 88 failed as shipped; 26/91 passed, 65 failed after an in-memory syntax-and-race patch**.

## 0. Evidence and live-Cotality gate

All provider facts below come from the saved live results in `C:\Users\MayaAllan\AppData\Local\Temp\claude\C--Users-MayaAllan-mallan-ops\27fa35f1-5c66-4ecc-9cd4-d892fc9ad7ea\scratchpad\form3-owner\`. Direct Cotality requests by this role: 47 (budget 150), throttled to 1 per 1.1 s; counter in `cot-count.txt`. No secret was printed or stored.

| Saved file (all under form3-owner) | Live query (no credentials) | HTTP | Result |
|---|---|---|---|
| live-proof-q1-candidates.json | Property `$filter=PropertyType eq 'Residential' and StandardStatus eq 'Active' and PhotosCount gt 5 and VideosCount gt 0 and VirtualTourURLUnbranded ne null and VirtualTourURLBranded ne null&$top=5` | 200 | 5 rows; ListingKeys 1149408283, 1190166568, 1190433453, **1190156834**, 1193201950 |
| live-proof-property-RLS20113389.json | Property `$filter=ListingId eq 'RLS20113389'` (no $select) | 200 | 1 row, ListingKey **1190156834**, 758 fields, 139 non-null: **the REAL listing** (40 E 19th St PH, Flatiron, Brown Harris Stevens; 21 photos, 1 floor plan, YouTube video, 2 open houses) |
| live-proof-media-RLS20113389.json | Media `$filter=ResourceRecordKey eq '1190156834'&$orderby=Order` | 200 | 22 rows: 21 Photo (PHOTO/Jpeg) + 1 FloorPlan (DOCUMENT/Jpeg) |
| live-proof-metadata-all.json / live-proof-metadata-form3-fields.json | `/odata/$metadata` | 200 | 17 entity types, Property 758 fields; of the page's 108 distinct `data-rls-field` names 93 exist on Property and **15 do not** (ledger F3-001..F3-015, identical to the shared ledger) |
| live-proof-form3-field-population.json, live-proof-extra-field-population.json | Property, 200 newest Active non-rental rows, `$select` the page's 93 fields (and 61 more) | 200 | per-field populated counts used as "pop n/200" throughout |
| live-proof-lookups-form3.json | Lookup `$filter=LookupName eq ...` (4 requests, 70+ lookup names) | 200 | provider value lists used in Appendix B |
| live-proof-observed-tokens.json | Property 300 newest Active, list-valued fields | 200 | observed value tokens (InteriorFeatures, Appliances, View ...) |
| live-proof-openhouse.json | OpenHouse (3 newest) and `$filter=ListingKey eq '1190156834'` | 200 | **2** open houses for the REAL listing |
| live-proof-closed-fields.json | Property Closed non-rental, 100 rows | 200 | ClosePrice, CloseDate, PurchaseContractDate 100/100; MlsStatus 0/100 |
| live-proof-media-counts.json | Property `$count` over Active non-rental (9,210) | 200 | PhotosCount>0 9,101; VideosCount>0 **611**; FloorPlansCount>0 **0**; DocumentsCount>0 8,183; tour URL unbranded 1,099 / branded 200 / unbranded2 46 |
| live-proof-media-resource-counts.json | Media `$count` by MediaCategory | 200 | Photo 1,514,892; FloorPlan 590,898; any other category: 1 row |
| live-proof-tour-hosts.json | Property, 300 Active rows that have a tour URL | 200 | 263 unbranded-only, 37 both (36 identical), **0 branded-only**; hosts: youtube 231, matterport 56, vimeo 34, zillow 19, other 15 (some malformed) |
| live-proof-media-fetch-RLS20113389.json | GET of a Media `MediaURL` with no Authorization header, plus the app's /api/media/proxy | 200 | raw locator returned image/jpeg 281,933 bytes; proxy identical |

**The REAL listing in the throwaway DB.** Loaded with the repo's own `mapTrestleToPrisma` (lib/idx/trestle-mapper.ts) and `upsertListingMedia` (lib/idx/media-sync.ts), guarded to `127.0.0.1:55432/t` (script `ingest-real.ts`; runtime `select current_database(), inet_server_port()` must return t/55432). Row id 85, `listing_id RLS20113389`: 22 `listing_media` rows inserted, 0 write failures. `syncListings` has no way to select one ListingId, so the mapper plus the repo's media upsert were used. Comparison: ListPrice, BedroomsTotal, BathroomsFull/Half, agent and office match Cotality exactly (test T02-pdp). **Persistence gap:** of 139 non-null live fields 87 are persisted and 52 are not (Appendix C), including `ListOfficePhone`, `ListingURL`, `VideosCount`, `DocumentsCount`, `PriceChangeTimestamp`, `StatusChangeTimestamp`.

**The Mallan listings.** `SL-0028` (used for the probes) and `SL-9414` (the acceptance fixture, whose remarks carry an `<img onerror>` probe), both created through the real `POST /api/crm/listings` as broker (website-only, 3 BR condo, $3,250,000, Matterport tours). Stored: PublicRemarks in both `features` and `raw_data`; typed agent columns set.

## 1. Purpose, audiences, data-source rules

**Purpose.** A professional, read-only viewer for one sale listing with Mallan's tools around it: calculators, print, email, agent sheet, transit and commute, media. The Master Plan states it: "Professional Sale Tools and Rental Tools read the same canonical Listing/Search/Building/Calculator/Report data... they may not maintain separate listing values" (Master Plan, heading "Sale / Rental Tools are views, not duplicate forms"). It opens at `/crm/sale-view?id=<ListingId>` for either a Cotality-sourced listing (id `RLS...`, a third-party listing or Mallan's own returned copy) or a Mallan-created listing (`SL-...`).

**Who sees it (observed with the seeded sessions).**
- BROKER: API 200 for every row (Cotality and Mallan).
- AGENT: API 200 only for rows the capability model associates (own `SL-` row); **403 for a third-party Cotality row** (observed: `GET /api/crm/listings/RLS20113389` with audit-agent-token). OPEN DECISION for Maya: this blocks Print/Email/Calculators from Search for any third-party listing.
- Buyer, seller, tenant, landlord principals: the API refuses them (observed 403 for the buyer). They never get data from this page; their views belong to the portal (Master Plan 23.4). The page's buyer/tenant/seller/landlord masking code (5314-5383) is unreachable and should go.

**Role matrix (observed, `GET /api/crm/listings/:id`, seeded sessions).**

| Row | Broker (agent 1) | Agent (agent 2) | Buyer (lead 1) |
|---|---|---|---|
| SL-F3-A2 (Mallan, assigned to agent 2) | 200 | 200 | 403 |
| SL-0028 (Mallan, assigned to agent 1) | 200 | 403 | 403 |
| RLS20113389 (Cotality third-party row) | 200 | 403 | 403 |

Seller, landlord and tenant principals: no seeded session; NOT TESTED (the route uses `requireAgentOrBroker`, so any non-staff principal is refused the same way as the buyer). The media route (`/api/crm/listings/:id/media`) has the same gate (agent 403 on the Cotality row).

**Data-source rules this dossier applies.**
1. A Cotality value is shown exactly as returned, with the provider's own wording; null means absent (hide it), never 0 or a default. (Master Plan "ATTRIBUTION": use `Field.DisplayName`; do not invent Mallan labels for provider facts.)
2. Mallan-owned facts (commission, internal notes, distribution decisions, calculator scenarios) are never merged into provider facts and are marked **Mallan-only**.
3. One field contract for Forms 1 and 3: the repo already has it as `SALE_FIELD_MAP` in SALE-FORM-REDESIGN.html (rls name -> element id -> source bucket). Form 3 must consume that, not keep a second mapping (Master Plan 0.15).
4. Identity: `SL-` = Mallan-created, `RL-` rental, anything else keeps the Cotality id.
5. Outputs (print, email, sheet) are advertising: Master Plan 9.7, 10.2 and 21.10 apply (author = the Mallan agent, listing-broker credit, no source-agent PII, rights proven first).
6. Calculators follow the single deterministic engine of Master Plan section 8, with current law cited and assumptions explicit.
7. Same-origin API only; nothing reaches production from a local or preview page.

## 2. REGISTER

73 curated rows below (area A to G) plus an auto-generated control-level register (Appendix A: **817 form controls** in 406 rows, every one with line, label, `data-rls-field`, live validity, and best-case value). Tools are rows B-05, G-01..G-05 and sections 3 to 5. Columns: what it must show | live Cotality field (population in the 200 newest active sale rows | value for REAL RLS20113389) | what it shows today (**S** = as shipped, the JavaScript is dead and the form is an empty skeleton with placeholders; **D** = best case after only an in-memory syntax-and-race patch) | defect | exact fix. Line numbers are in the page.


### A. Boot, authentication, data load

| ID | Item | Lines | Must show | Live Cotality field | Shows today | Defect | Exact fix |
|---|---|---|---|---|---|---|---|
| A-01 | Script block integrity | 4900-4902, 5424, 5432 | The page JavaScript parses and runs | n/a (page defect) | S: PAGEERROR 'Invalid or unexpected token'; loadSaleListingData/updateSaleMortgageCalc undefined; the rest of the script (4903-7683, about 2,800 lines) printed as visible page text | A literal </script> inside a JS string (4902) ends the script block; two unterminated strings '/crm/login.html; (5424, 5432). Present since 7f8d9c53 (2026-04-08). RENTAL-FORM-WITH-TOOLS has the same two defects | 4902: end the string with <\/script>'. 5424 and 5432: '/crm/login.html'. Same in the rental file. Test T01a/T01b |
| A-02 | Boot order / fail-closed wipe | 6661-6705, 5035-5038, 4925-4967, 5024-5032 | A valid listing renders; 'not available' only on a real 404/403 | n/a | D: body replaced by 'Listing Not Available' for a valid listing (loadSaleListingData runs at 6680 before the API fetch fills VIEWER_LISTINGS); later API success throws "Cannot set properties of null (setting 'innerHTML')" | Deterministic race: DOMContentLoaded calls loadSaleListingData synchronously; the data arrives later | One async boot: await MallanAPI.init() -> auth/role -> await GET listing (+media, open houses) -> render once. showSaleFailClosed only for HTTP 404/403. Set body[data-viewer-state]=loading\|ready\|denied\|error. Test T01e |
| A-03 | MallanAPI.init is only called from initLoggedInAgent | 5398-5433, 4925-4967 | Identity resolved once, before role-dependent UI | n/a | D: role starts as buyer (4918-4920) and masking runs at 6697 before init resolves | applySaleRoleMasking destroys content (innerHTML at 5333) while role is still the default 'buyer'; the later upgrade (4933) only adds classes | Compute role from /api/auth/me only; apply masking after it; masking = show/hide classes (reversible), never innerHTML replacement; remove the ?role= URL hint (4918). Test T04b |
| A-04 | Hard-coded production API host | 130-136 | Same-origin API calls only | n/a | D: on localhost the page calls https://mallan.nyc/api/... with credentials (observed: GET /api/auth/me and GET /api/crm/listings/<id> re-routed by the harness; nothing reached production) | When location.origin lacks 'mallan.nyc' (localhost, Vercel preview) the page points MallanAPI at PRODUCTION. by reading CRM_CSP (connect-src has no mallan.nyc) the call is blocked on a Vercel preview; not run on Vercel | Delete the block; MallanAPI default base is '' (same origin). Test T01d |
| A-05 | Access states (403 / non-agent principal) | 5398-5433, 6661-6705 | Agent/broker: data. Anything else: an explicit 'no access' screen with no CRM controls | n/a (capability model lib/auth/listing-capabilities.ts) | D: AGENT opening a third-party Cotality row -> API 403 'Access denied'; BUYER (principalType lead) -> 403; both leave the blank skeleton ('[Enter Address]', 'DRAFT') with Print/Email/Calculators buttons live and the buyer's name in the header | No denied state; CRM chrome shown to a non-agent | Render #saleViewerDenied and hide chrome for 403/401 and for principalType != agent. OPEN DECISION for Maya: agents currently get 403 on any third-party row they are not associated with (mayViewHistory), so Print/Email/Calculators are unusable from Search for such rows. Test T04c/T04d |
| A-06 | Listing id parameter | 4914-4915, 6665-6672, 7553, 7592 | ?id= and ?listingId= behave identically everywhere | n/a | D: calculators read only ?listingId= (7553, 7592), the page's own placeholder text says ?id=SL-1001 (6669) | Calculator auto-populate finds no listing when opened via ?id= | Use VIEWER_LISTING_ID in the calculators. Test T11a |
| A-07 | API payload to page mapper | 4936-4959, 4978-4994 | Every displayed field comes from the API row (typed columns + address + features + raw_data) | all | D: only 19 d.* keys are set; only 12 of 72 viewerSet* targets receive a value | Hand-rolled mapper ignores features/raw_data; description read from features.PublicRemarks (lives in raw_data for Cotality rows); media from apiData.media (always [] for synced rows); agent_info removed from the API | Replace by the shared field contract (Form 1 SALE_FIELD_MAP, SALE-FORM-REDESIGN.html:9159-9300+, rls -> element id, src raw\|listing\|addr\|features\|agentInfo). One mapping for Forms 1 and 3 (Master 0.15 'no own mapping') |
| A-08 | 72 viewerSet* bindings | 5041-5178 | Each binding targets an element that exists | n/a | Static markup: 39 of 72 targets exist; browser runtime after the viewer conversion: 24 exist; only 12 receive data (saleStatus, saleZipCode, saleBorough, salePropertyType, salePrice, saleBedrooms, saleHalfBaths, saleDescription, saleListingAgentSearch, saleAddressDisplay, saleUnitDisplay, saleListingIdDisplay) | 48 targets are missing at runtime (e.g. saleAddress, saleUnit, saleNeighborhood, saleSqFt, saleBathroomsFull, saleYearBuilt; the real ids are saleStreetAddress, saleUnitNumber, saleNeighborhoodFromAddress, saleInteriorSqFt, saleFullBaths, saleBldgYearBuilt) | Delete loadSaleListingData's 72 calls; bind through the shared map. Appendix D lists all 72 |
| A-09 | Dead inline handlers | 565, 1439, 1590, 1602-1640 and others | No control calls an undefined function | n/a | D: 10 undefined handler functions: searchBuildingForListing, updateListingHeaderBar, handleSaleListingTypeChange (x7), handleSaleComingSoon, updateSaleStatusFields, useSaleExclusiveAgentContact, printOpenHouseSignIn, addSaleOpenHouse, saveSaleOpenHouse, cancelSaleOpenHouse (+addSaleCoListAgent, FAIR_HOUSING_VIOLATIONS undefined at 5548) | Form-mode leftovers in a viewer | Remove the controls (Add Open House, Add Co-List Agent, listing-type change handlers); remove REBNY_DESCRIPTION_VIOLATIONS/_performComplianceCheck/scanAllContent (5501-5598, 6253-6277), the CRM status machine and Draft/Future statuses (6170-6244), validation stubs (6150-6162) |
| A-10 | Content-Security-Policy for /crm | lib/middleware/security-headers.ts CRM_CSP | Approved video/tour hosts can be embedded; media loads | n/a | Observed header: no frame-src and no media-src (default-src 'self') | YouTube/Vimeo/Matterport iframes and R2 <video> are blocked on /crm pages (the public CSP has frame-src for youtube, vimeo, matterport) | Add frame-src https://www.youtube.com https://player.vimeo.com https://my.matterport.com (and any other approved tour host) and media-src 'self' https://*.r2.dev https://images.mallan.nyc to CRM_CSP, or show video/tour as safe external links. Maya decision (security file). Test T05g |
| A-11 | Role masking rules | 5314-5383 | BROKER/AGENT: everything their capability allows. Client roles never reach this page (API refuses them) | n/a | D: broker sees tabs 1,2,3,5 only; tabs 4,6,7 hidden (class viewer-hidden added while role was 'buyer'); agent card replaced by 'Mallan Real Estate Inc. Contact your agent' | Masking logic for buyer/tenant/seller/landlord is unreachable (API requireAgentOrBroker) and the broker is masked as a buyer | Keep only staff roles; client-facing views belong to the portal (Master 23.4). Test T04a/T04b |

### B. Header, sticky bar, tabs, buttons

| ID | Item | Lines | Must show | Live Cotality field | Shows today | Defect | Exact fix |
|---|---|---|---|---|---|---|---|
| B-01 | Header: logged-in agent | 152-154, 5408-5411 | 'Viewing as <session user>' (never presented as the listing agent) | n/a (session) | D: 'Audit Broker \| Mallan Real Estate Inc.' (correct as viewer identity) | Unlabelled; elsewhere the same value is shown as 'Listing Agent' (C-03) | Label 'Viewing as'. Test T03d |
| B-02 | Sticky bar: Address | 173, 5175, 4941 | Full street address: StreetNumber StreetDirPrefix StreetName StreetSuffix [StreetDirSuffix] #UnitNumber | StreetNumber, StreetDirPrefix (107/200), StreetName, StreetSuffix, UnitNumber (183/200) \| REAL '40 E 19TH Street #PH' (UnparsedAddress '40 E 19TH Street PH') | S: '[Enter Address]'. D: '40 19TH #PH' | Mapper uses only StreetNumber + StreetName (4941): drops the direction and the suffix | Compose from the address JSON parts. Test T02-saleAddressDisplay |
| B-03 | Sticky bar: Unit / ID / Updated | 174-176, 5176-5178 | Unit = UnitNumber; ID = ListingId (Cotality) or SL-/RL- (Mallan); Updated = ModificationTimestamp | UnitNumber, ListingId, ModificationTimestamp (200/200) \| 'PH', RLS20113389, 2026-10-15T21:08:43Z | D: unit and ID correct; Updated blank ('--') | d.lastUpdated never set (5178) | Set from listing.modification_timestamp (ET). Test T02-updated |
| B-04 | Sticky bar: status badge | 177, 5248-5267 | Cotality StandardStatus (Active, ActiveUnderContract, ComingSoon, Pending, Closed, Withdrawn, Expired, Hold, Canceled, Incomplete) | StandardStatus (200/200; lookup has 11 values) \| 'Active' | D: 'DRAFT' (static markup; updateSaleHeaderForViewer ran at boot with null data); colour table keys (UnderContract, Sold, SoldThruUs, OffMarket) are not Cotality values | Badge text/colours come from an old CRM vocabulary | Render StandardStatus verbatim with a colour map keyed by the 11 Cotality values. Test T02-status |
| B-05 | Buttons: Media / Building / Print / Email / Agent Sheet / Calculators / Back to CRM | 180-200 | Each opens a working panel; Back closes | n/a | D: Print, Email, Copy and Agent-sheet email throw/blank (see I-*); Media modal is an upload form; Back works | Print/Email call getListingPhotoUrls('sale') which exists only in the rental file | See sections 3, 5; define getListingPhotoUrls('sale') per the media contract |
| B-06 | Mobile tab bar | 208-216, 5455-5459 | Same tabs as the sidebar, roles applied | n/a | D: index-based hiding [3,5,6] assumes a fixed order; Commission 'disabled' | Brittle index masking | Hide by data-tab attribute |
| B-07 | Sidebar tabs 1-7 + 'Required' toggle + 'All fields OK' | 224-281, 6092-6100 | Navigation only | n/a | D: 'Required' toggle paints required fields red; static green 'All fields OK' | Validation UI in a read-only viewer | Delete the toggle and the validation summary (265-280) |
| B-08 | Tab 7 Commission availability | 257, 5438-5444, 3507-3767 | Mallan-owned; only for a Mallan listing that is Closed, only broker/agent | none (Mallan-only); StandardStatus 'Closed' | Tab opens only if saleStatus == 'Sold' or 'SoldThruUs' (5442) | Cotality value is 'Closed', so the gate can never open for a Closed listing; submit is a toast (6798) | Gate on Mallan listing + StandardStatus Closed; keep submit disabled in the viewer |

### C. Tab 1 Listing Info (markup 289-1657)

| ID | Item | Lines | Must show | Live Cotality field | Shows today | Defect | Exact fix |
|---|---|---|---|---|---|---|---|
| C-01 | Address block: street, unit, borough, zip, neighborhood (+IDX address search box) | 303-352 | Street, Unit, Borough, Zip, Neighborhood from the listing; search box removed | Street*/UnitNumber (183/200), CityRegion (200/200), PostalCode (200/200), SubdivisionName (200/200) \| '40 E 19TH Street', 'PH', Manhattan, 10003, Flatiron; DB address JSON holds all (City 'New York City', CountyOrParish, StateOrProvince) | D: borough and zip only; street, unit, neighborhood blank with placeholders ('e.g., 200 East 66th Street', 'Auto-populated') | Loader writes saleAddress, saleUnit, saleNeighborhood (not in DOM); the DOM ids are saleStreetAddress, saleUnitNumber, saleNeighborhoodFromAddress. data-rls-field on the street field says StreetName only | Bind saleStreetAddress = composed street, saleUnitNumber, saleNeighborhoodFromAddress = SubdivisionName; delete saleBuildingSearch (306) and results (312/314). Test T02-* |
| C-02 | Agent & Dates: Create Date, Last Updated | 357-377 | Mallan: created_at/updated_at. Cotality: OnMarketDate / ModificationTimestamp | OnMarketDate (200/200), ModificationTimestamp (200/200) \| 2026-09-08 / 2026-10-15T21:08:43Z | D: blank date pickers (mm/dd/yyyy) | d.createDate/d.lastUpdated never set | Bind or hide. Test T07b |
| C-03 | Listing Agent (display) | 361, 5418-5421 | The LISTING agent of the listing (ListAgentFullName); the viewer is shown separately | ListAgentFullName (200/200) \| 'Rachel A Glazer' | D: '1 \| Audit Broker' (the logged-in user) | Listing agent = the viewer | Show list_agent_full_name (typed column) and office; viewer only under 'Viewing as'. Test T03a/T03d |
| C-04 | Administrative Comments (Internal Use Only) | 385 | Mallan-only note, broker/agent only, Mallan listings only; never in outputs | none (Mallan-only) | D: empty textarea shown | Shown blank on every listing incl. third-party | Hide on Cotality rows; exclude from print/email |
| C-05 | Listing Type radios (7) and Direct Deal | 399-520 | ListingAgreement as Cotality gives it; Mallan-only types labelled as such | ListingAgreement (200/200; lookup 11 values) \| 'ExclusiveAgency' | D: nothing selected -> viewer CSS hides every unselected card -> block empty; Preview shows 'Exclusive Right to Sell' | Page values CoExclusive, InHouse, OwnerOptOut, ParticipantOnly are not Cotality ListingAgreement values (lookup: CoExclusiveAgency ...); loader feeds d.listingType which is never set | Map ListingAgreement -> radio (CoExclusiveAgency for CoExclusive); show the 3 Mallan-only values only for Mallan rows |
| C-06 | Agreements & Disclosures: CoBroke type, acknowledgements, Opt-Out upload | 520-555 | Mallan-only compliance records | none (Mallan-only) | D: empty selects, two unchecked acknowledgements, a file input | Form-mode controls | Delete the file input and acknowledgements; show recorded values only for Mallan rows |
| C-07 | Status select + DOM counters + RESO status | 565-618, 6371-6399 | Cotality StandardStatus; Days on Market from OnMarketDate (Master 0.15: DaysOnMarket is null in the feed) | StandardStatus (200/200); MlsStatus 0/200; DaysOnMarket 0/200; OnMarketDate 200/200 \| 'Active'; 2026-09-08 -> 37 days on 2026-10-15 | D: select shows Active; DOM 0, Cumulative 0, 'Status Changed --', 'RESO MlsStatus ComingSoon' | data-rls-field='MlsStatus' is null in 100% of live rows (Active and Closed samples); counters use now() as first-active date (6389-6397); RESO panel maps the old CRM select value (6198-6212) | Source = StandardStatus; DOM = floor(today(ET) - OnMarketDate); Status Changed = StatusChangeTimestamp (live '2026-09-08T15:37:42Z'; not persisted - A-appendix C) or Mallan status_changed_at; delete the RESO mapping panel. Test T02-dom |
| C-08 | Price | 634 | ListPrice | ListPrice (200/200) \| 9,995,000 (DB 9995000.00) | D: 9995000 (correct) | none functionally; plain number input, no currency format | Format $9,995,000 |
| C-09 | Maint/CC + Fee Frequency | 636-655 | AssociationFee with AssociationFeeFrequency, normalised to monthly where summed | AssociationFee (192/200), AssociationFeeFrequency (192/200) \| 11,488 / Monthly | D: frequency 'Monthly' (select default); amount blank | d.maintCC never set; select default masks absence | Bind both; show 'Monthly' only when Cotality says so. Test T02-saleMaintCC |
| C-10 | RE Taxes (Monthly) | 656-660, 6079-6087 | TaxAnnualAmount is ANNUAL: show 'RE Taxes (annual)' and monthly = annual/12; co-op: taxes are inside maintenance | TaxAnnualAmount (101/200 of 200 newest active) \| REAL null (co-op) | D: blank | Label says Monthly but the Cotality field and Form 1 hold the annual figure (SALE-FORM-REDESIGN.html:7328-7370); Preview/Print/Email print the raw annual value followed by '/mo' (6484-6485, 6934, 7060) | Label 'RE Taxes (annual)'; show /12 monthly beside it; print/email show both with units |
| C-11 | Total Monthly | 662-668 | Monthly maintenance (frequency-normalised) + monthly taxes (condo/townhouse); co-op = maintenance only | derived | D: blank | d.totalMonthly never set; 6079 adds annual tax to monthly maint | Compute with the rule in section 4.2 |
| C-12 | Original Price / Sold Price | 667-675 | OriginalListPrice; ClosePrice only when Closed | OriginalListPrice (171/200) \| 9,995,000; ClosePrice 0/200 active but 100/100 on Closed rows (live-proof-closed-fields.json) | D: both blank (saleOriginalPrice and saleSoldPrice are never loaded) | Not in loadSaleListingData at all | Bind; show Sold Price only for Closed |
| C-13 | Internet display: AVM radio | 677-690 | InternetAutomatedValuationDisplayYN | 200/200 true \| true | D: Yes checked (static default) | Static default, not data | Bind from internet_automated_valuation_display_yn |
| C-14 | Property Type radios + Ownership select + Building Status + Land Lease + commercial blocks | 700-930 | Show Cotality values verbatim: PropertyType, PropertySubType, CommonInterest, StructureType | PropertyType (200/200), PropertySubType, CommonInterest (200/200; lookup 12 values), StructureType (174/200) \| Residential, Duplex, StockCooperative, HighRise | D: salePropertyType gets 'Residential' (matches no radio) -> nothing selected; Preview shows 'Condo' for this CO-OP; saleCommonInterest blank | Old CRM vocabulary (Condo/Coop/Condop/SingleFamilyTownhouse ...); CommonInterest never fed; RentalBuilding is not a Cotality value; BasementYN options Yes/No vs Cotality true/false | Display PropertyType + PropertySubType + CommonInterest as Cotality returns them (provider labels, Master 'do not invent Mallan labels'); derive the Condo/Co-op rule set from CommonInterest, not from radios. Appendix B |
| C-15 | Important Dates | 932-990 | OnMarketDate, ListingContractDate, ActivationDate, OffMarketDate, PurchaseContractDate, CloseDate; ExpirationDate not present in the IDX feed | OnMarketDate 200/200; ListingContractDate; ActivationDate 198/200; ExpirationDate 0/200; OffMarketDate/CloseDate/PurchaseContractDate populated on Closed rows \| 2026-09-08 for all three | D: all date inputs blank | d.onMarketDate/expirationDate never set (loader writes saleOnMarketDate etc., which do not exist) | Bind via the shared map; hide ExpirationDate for Cotality rows; 'Send to RLS/Website' checkboxes are Mallan-only (hide) |
| C-16 | Co-op / Condop details; Condo details; Tax deduction; Flip tax | 990-1090 | Unit shares, % common elements, tax deduction, flip tax: Mallan-entered building data | PercentOfCommonElements, TaxDeductionPercent, FlipTax: NOT in live Cotality (ledger F3-011, F3-015, F3-007); LivingArea (171/200) \| REAL null (no square footage) | D: blank inputs rendered | Controls for fields Cotality does not have | Cotality rows: hide those controls; Mallan rows: show from raw_data keys. Test T07 |
| C-17 | Building Requirements + Purchasing Options (13 radios) | 1090-1180 | Co-op/condo board requirements as recorded | BuildingFeatures (164/200) is a list of building amenities (lookup 73 values), not board rules; GuarantorsAcceptedYN not in Cotality (F3-008) | D: unselected radios hidden by CSS -> mostly empty cards; saleBoardApproval carries data-rls-field BuildingFeatures | Radios have no data source for Cotality rows | Show only values that exist; hide the rest; Mallan-only for CRM-entered rows |
| C-18 | Commission Information | 1185-1205 | Mallan-owned, internal; never distributed | none (Mallan-only); BuyerBrokerageCompensation removed from the feed | D: empty controls | Internal commission fields visible on every listing; print adds 'Exclusive Commission' except Client/Fact presets (7066) | Mallan rows + broker/agent only; excluded from all client outputs |
| C-19 | Concessions | 1207-1230 | Concessions, ConcessionsAmount, ConcessionsComments | Concessions 0/200 \| null; lookup Yes/No/CallListingAgent | D: blank select | never loaded | Bind; hide when null |
| C-20 | Listing URL | 1246-1252 | ListingURL (the listing broker's own page) for Cotality rows; the mallan.nyc URL for Mallan rows | ListingURL (184/200) \| http://www.bhsusa.com/listing/23994836 (NOT persisted by the mapper) | D: blank; label says 'auto-generated... how the listing will appear on the website' | Wrong semantics for Cotality rows; ListingURL is dropped by RAW_DATA_KEEP_FIELDS | Add ListingURL to RAW_DATA_KEEP_FIELDS or read live; render as an external link (rel=noopener) |
| C-21 | Web Display Address / Web Headline | 1254-1285 | Mallan-only web settings | none (Mallan-only) | D: empty select/headline | Form controls in a viewer | Mallan rows only |
| C-22 | Internet Display Controls (3 checkboxes) | 1287-1330 | InternetEntireListingDisplayYN, InternetAddressDisplayYN, InternetConsumerCommentYN | InternetEntireListingDisplayYN 200/200, InternetAddressDisplayYN 0/200 (null = displayable under the IDX Plus pre-filter), InternetConsumerCommentYN 200/200 \| true, null, true | D: checked by static default | Defaults, not data; unchecked boxes read as 'not permitted' | Bind from the typed gate columns; show three-state (yes / not set / no) |
| C-23 | Listing Description | 1332-1370 | PublicRemarks verbatim; HTML <br> converted to line breaks; full length | PublicRemarks (200/200) \| 3,591 chars incl. literal <br> tags; DB raw_data.PublicRemarks holds it, features does not | D: empty (0 / 5,000 characters); Preview 'Enter a description to see it here.' | Reads features.PublicRemarks (4954); Cotality rows keep it only in raw_data; no <br> handling; Fair Housing acknowledgement checkbox + scanner shown | description = raw_data.PublicRemarks ?? features.PublicRemarks, <br> -> newline, tags stripped; delete the acknowledgement and scanner. Test T02-desc |
| C-24 | Contacts: Listing Agent card (agent id, office phone, email, license) | 1380-1430, 5124-5131 | Source agent contact for the Mallan agent's internal use: MLS id, office phone; email/direct phone internal only | ListAgentMlsId, ListOfficePhone (200/200), ListAgentEmail (200/200), ListAgentDirectPhone (199/200), ListAgentStateLicense \| 51036, (212) 906-9234, rglazer@bhsusa.com, (917) 860-7721, null | D: card replaced by the 'Mallan Real Estate Inc. Contact your agent' masked text for the broker (A-03); underlying spans never fed | d.listingAgentId/Phone/Email/License never set; ListOfficePhone is not persisted; license is not in the feed for this row | Bind from typed columns (list_agent_mls_id, list_agent_email, list_agent_direct_phone) + ListOfficePhone; show license only when ListAgentStateLicense exists; mark 'internal - not for client output'. Test T03b |
| C-25 | Co-Listing Agent(s) | 1432-1450 | CoListAgentFullName / CoListOfficeName | CoListAgentFullName 110/200, CoListOfficeName 110/200 \| 'Cathleen Foley-Glover', Brown Harris Stevens Residential Sales LLC | D: 'No co-listing agents added. Click Add...' + dead 'Add Co-List Agent' button (addSaleCoListAgent undefined) | Not bound; button dead | Render co-list rows from the record; remove the button |
| C-26 | Team Information | 1452-1465 | ListTeamName / ListTeamKey | ListTeamName 0/200, ListTeamKey 0/200 | D: blank inputs | Placeholder 'e.g., The Allan Team' shown | Hide when null |
| C-27 | Buyer's Agent Contact | 1480-1540 | BuyerAgent* exist on Closed rows only | BuyerAgentFullName etc. (Closed rows) | D: '--' spans; dropdowns | Form-mode dropdowns | Show BuyerAgentFullName/BuyerOfficeName on Closed rows only; remove dropdowns |
| C-28 | Showing Instructions / Broker To Broker Comments | 1542-1570 | ShowingInstructions / PrivateRemarks (IDX Plus feed returns them null; stripPrivateFields also never persists them) | ShowingInstructions 0/200, PrivateRemarks 0/200 | D: empty textareas (hidden for 'buyer') | Cannot be populated from this feed; shown empty | Hide for Cotality rows; Mallan rows broker/agent only |
| C-29 | Open Houses sub-tab | 1575-1655 | Live Cotality OpenHouse records for the listing (+ Mallan local public open houses) | OpenHouse resource (47 fields) \| REAL: 2 records (OpenHouseId 163116993 and 163031974): 2026-10-17 1:00-2:00 PM and 2:00-3:00 PM ET, Public, AppointmentRequiredYN true, showing agent Rachel Glazer (live-proof-openhouse.json) | D: 'No open houses scheduled yet. Click Add...' | Static empty state; add/save handlers undefined; no data source wired | Read OpenHouse by ListingKey (needs a read path: the existing /api/open-houses is scoped to Mallan's own office). Show date/time/type/appointment/showing agent; remove Add/Save. Test T06 |

### D. Tab 2 Unit Info (markup 1658-2444)

| ID | Item | Lines | Must show | Live Cotality field | Shows today | Defect | Exact fix |
|---|---|---|---|---|---|---|---|
| D-01 | Floors in the unit (4 radios) | 1670-1695 | Levels (One, Two, ...) | Levels 29/200; StoriesTotal is the BUILDING value \| REAL 'Two' (Duplex) | D: unselected; radio name saleNumFloors is wired to data-rls-field StoriesTotal | Wrong field: StoriesTotal (building stories) used for 'floors in the unit' | Bind Levels |
| D-02 | Room counts | 1696-1730 | RoomsTotal, BedroomsTotal, BathroomsFull, BathroomsHalf, BathroomsTotalInteger | all 200/200 \| 11, 5, 4, 1, 5 | D: bedrooms 5 and half baths 1 only; rooms, full baths, total baths blank | Loader writes saleBathroomsFull/saleRoomsTotal (not in DOM); saleFullBaths/saleTotalRooms never fed | Bind. Test T02-*. Staff Bedrooms/Bathrooms and Ceiling Height have no id/name and no Cotality field |
| D-03 | Square footage | 1731-1745 | LivingArea (+LivingAreaUnits); price per sq ft only when LivingArea exists | LivingArea 171/200 \| REAL null -> show '--' and no $/sq ft | D: blank; 'LivingAreaUnits' select shows SquareFeet by default | d.sqft is fed to saleSqFt (not in DOM); Approx Exterior SqFt has no Cotality field | Bind saleInteriorSqFt/saleLivingArea; never compute $/sq ft from 0/null |
| D-04 | Floor in Building / Line in Building | 1750-1765 | EntryLevel = floor; 'line' is derived from the unit number, not a field | EntryLevel 193/200 \| '10' (penthouse of a 9-story building: the feed value is what the listing broker entered); StoriesTotal 9 | D: blank; saleLineInBuilding carries data-rls-field UnitNumber | Line is not UnitNumber; EntryLevel can exceed StoriesTotal in the feed | Show EntryLevel as provided; derive Line only as a labelled parse of UnitNumber or hide |
| D-05 | Garage | 1768-1790 | GarageYN, GarageSpaces | GarageYN 200/200, GarageSpaces 122/200 \| false, 0 | D: unselected | radio name saleGarageSpaces bound to GarageSpaces as Yes/No | Show Yes/No from GarageYN and the count |
| D-06 | Unit Type (36 anonymous checkboxes: Alcove Studio, Floor Thru, Garden, Loft, Penthouse ... + lot/size/zoning) | 1790-1935 | Unit type facts | PropertyUnitTypes resource (52 fields) and Property.PropertySubType / UnitTypeType lookups; 34 of 36 controls have no id or name | D: unchecked boxes only | Cannot be bound: no id/name | Replace with read-only chips: PropertySubType (+UnitTypeType where present). Appendix A lists the controls |
| D-07 | Private Outdoor Space (11), Exposure (8), Views (14), Light (4), Unit Pet Policy (7) | 1938-2055 | ExteriorFeatures/PatioAndPorchFeatures, Exposures, View/ViewYN, (no Light), PetsAllowed | PatioAndPorchFeatures, ExteriorFeatures 'PrivateOutdoorSpaceUnder60Sqft', Exposures 131/200 (9 lookup values), View 177/200 ViewYN, PetsAllowed 200/200 \| REAL Terrace; PrivateOutdoorSpaceUnder60Sqft; (none); View 'City,Skyline' ViewYN true; PetsAllowed 'BuildingYes,No' | D: nothing selected/checked | Page pet values UnitYes/UnitCatsOK/... exist in NO Cotality PetsAllowed value (lookup: BuildingYes, CatsOk, DogsOk, No ...); 8 Exposure and 12 View boxes are anonymous | Chips from the Cotality list values (split on comma); labels from lookup values. Appendix B |
| D-08 | Additional Rooms (15), Kitchen Type (9), Kitchen Features (7), Dining (6), Bathroom Features (7) | 2057-2150 | RoomType / InteriorFeatures / Appliances | RoomType 1/200, InteriorFeatures 107/200, Appliances 124/200 \| REAL Appliances 'Dishwasher' | D: all anonymous, unchecked | No ids; vocabulary invented | Chips for InteriorFeatures/Appliances/RoomType values present |
| D-09 | Feature Details, Windows (20), Ceilings, Flooring (5), Storage, Washer/Dryer (11) | 2153-2260 | WindowFeatures, Flooring, LaundryFeatures, InteriorFeatures | WindowFeatures 16/200, Flooring 47/200, LaundryFeatures 200/200 \| REAL 'BuildingNone,WasherHookup,InUnit' | D: anonymous/unchecked; the radio saleWasherDryerAllowed is bound to LaundryFeatures as Yes/No | Yes/No cannot represent a multi-value field | Chips from LaundryFeatures (InUnit, WasherHookup ...) |
| D-10 | Cooling (27), Heating (45), Fresh Air, HVAC, Fireplace | 2255-2440 | Cooling/CoolingYN, Heating/HeatingYN, FireplaceYN/FireplaceFeatures | Cooling 143/200, Heating 24/200, FireplaceYN 164/200 \| REAL Cooling 'Other', CoolingYN false, FireplaceYN false | D: unchecked | Radio 'fireplace' is bound to InteriorFeatures; page Heating/Cooling values are a subset of Cotality's (cooling 25/40, heating 43/100) | Bind CoolingYN/HeatingYN/FireplaceYN; chips for values |

### E. Tab 3 TH / Building (markup 2445-3050)

| ID | Item | Lines | Must show | Live Cotality field | Shows today | Defect | Exact fix |
|---|---|---|---|---|---|---|---|
| E-01 | Townhouse / building essentials (stories, units, lot, zoning, land lease, garage, parking) | 2457-2805 | Stories, NumberOfUnitsTotal, LotSizeArea/Units/Dimensions, BuildingAreaTotal, ZoningDescription, LandLeaseYN, GarageYN, ParkingTotal | NumberOfUnitsTotal 200/200 (REAL 0 = unknown, not '0 units'), LotSizeArea 77/200, ZoningDescription 87/200 \| REAL 'M1-5M', LandLeaseYN false | D: all Selects at '\|Select', inputs blank | Never loaded; tab greyed for co-op/condo via shouldSkipTab3 (5679) | Bind; treat 0 units as unknown; the tab is relevant to townhouse/multi-family PropertySubTypes |
| E-02 | Documents Available | 2790-2805 | DocumentsAvailable list / DocumentsCount | DocumentsAvailable 0/200; DocumentsCount 200/200 \| REAL 1 (not persisted) | D: blank | DocumentsCount dropped by the mapper | Show DocumentsCount only if persisted/queried; never link documents without rights |
| E-03 | Setup Sheet (Description, Layout, Financing, Notes) | 2806-2880 | Mallan-only notes; Description = PublicRemarks | PublicRemarks | D: blank textareas | Form-mode | Mallan rows only |
| E-04 | Financials: income/expense grid + cap rate (27 inputs) | 2880-3050, 5740-5766 | Cotality has no income/expense data for sales; NOI/cap rate are Mallan analyses | none (CapRate 0/200) | D: empty grid; capRate computed only if the user types | Manual inputs in a viewer; cap rate = NOI/price shown with no source | Mallan-only tab; for Cotality rows hide (calculators tab 'Cash on Cash' is the sanctioned place) |

### F. Tabs 4-7

| ID | Item | Lines | Must show | Live Cotality field | Shows today | Defect | Exact fix |
|---|---|---|---|---|---|---|---|
| F-01 | Tab 4 Distribution (VOW opt-out, Syndicate, Send-To list of 8 sites) | 3051-3146, 5297-5311, 6045-6063 | Mallan's own distribution decisions for Mallan listings; for Cotality rows only the IDX display permissions | InternetEntireListingDisplayYN 200/200; SyndicateTo 0/200 \| true; null | D: tab hidden for broker (A-11). By code reading: convertSaleDistributionToDisplay (5297-5311) replaces the checkboxes once at boot, before data arrives (static defaults IDX/VOW/Listhub/NYMLS/Realtor checked), so later loads cannot update them (browser check: only 24 of the 72 loader targets survive) | Distribution list is a Mallan syndication model, not Cotality; shows defaults, not state | Mallan rows: render the stored decision; Cotality rows: show the 3 IDX permission fields only |
| F-02 | Tab 5 Preview: CRM Summary cards | 3178-3263, 6461-6656 | A summary of the listing's real values | all of the above | D: price '--', beds '--', description 'Enter a description', Photos '0 uploaded', Video 'None', Tour 'None', status 'Draft', type 'Condo' (updateSalePreview runs at 200ms before data) | Runs before data; reads ids that are never filled; 'Photos' hard-coded '0 uploaded' (6519) | Run after render; photos/video/tour from the media model (T05f) |
| F-03 | Tab 5 Preview: 'Public Page Preview' (mock mallan.nyc page) | 3265-3424 | Nothing: the real public page exists | n/a | D: browser-frame mock, 'Mallan Exclusive' badge, fake Request Information form and Contact Agent button, REBNY copyright, '$0' | Mock of a public page inside a CRM viewer; badge 'Mallan Exclusive' appears for ExclusiveRightToSell (6653) even on third-party rows | Delete the mock; if a public preview is wanted, link to the real public listing URL. Test T03f/T13b |
| F-04 | Tab 5 Transit & Commute | 3426-3460, 7377-7516 | Nearby subway/bus/ferry for the listing's real location; commute from the listing to a work address | Latitude/Longitude 0/200 (the feed returns null: lib/geo/geocode.ts header); WalkScore 0/200 | D: 'Union Sq' only for RLS20113389 (0.26 mi); for Chelsea 10011 '14th St-Union Sq 0.66 mi' | Hard-coded 24-station Upper East Side list (7390-7415) + zip centroid table with a default UES point (7418-7429); commute = distance x constant (7506-7516) | Use the existing server routes /api/transit/nearby (lat,lng) and /api/transit/commute with coordinates from lib/geo/geocode (geocode_cache, ZIP-centroid fallback). Label 'exact' vs 'approximate'. Test T12a/T12b |
| F-05 | Tab 6 Update History | 3477-3502 | Price/status history | OriginalListPrice, PreviousListPrice, PriceChangeTimestamp (181/200), StatusChangeTimestamp, MajorChangeType \| REAL 'NewListing' 2026-09-08; Mallan: price_history table | D: static 'No results found for this Listing.' | Hard-coded empty state; the 'Building Updates' radio does nothing | Render the real price/status events; remove the radios. Test T13a |
| F-06 | Tab 7 Commission Request (35 controls) | 3507-3767, 6710-6834 | Mallan-owned; Closed Mallan listings; broker/agent only; never to Cotality | none (Mallan-only) | D: hidden (A-11/B-08) | Submit is a no-op toast; seller/buyer name/email/phone fields are PII inputs in a viewer | Out of scope for a read-only viewer: move to the Deal forms (Master 0.15) or keep read-only display of saved data |

### G. Modals

| ID | Item | Lines | Must show | Live Cotality field | Shows today | Defect | Exact fix |
|---|---|---|---|---|---|---|---|
| G-01 | Building modal (121 controls; lookup box, 4 tabs + policies/personnel) | 3904-4683, 5820-5889 | Building facts for the listing's building | Property: BuildingName 96/200, YearBuilt 200/200, StoriesTotal 200/200, NumberOfUnitsTotal, StructureType 174/200, BuildingFeatures 164/200, TaxBlock/TaxLot 200/200; Building resource has 1 field; BuildingKey 0/200; Mallan table `buildings` (throwaway DB: 0 rows) | D: empty; lookup box searches buildingDatabase = [] ('No matches found') | Building facts never loaded; building table empty in this DB; 10 controls bind to Cotality fields that do not exist (AttendanceType, BuildingTaxLot, CapitalReservesTotal/YN, ElevatorsTotal, LandmarkStatusYN, MaximumFinancingAmount, SponsorUnitYN, TaxAbatementYN/Comments: ledger F3-001..004, 006, 009, 010, 012..014) | Populate from the listing's own Property fields first, then the matched Building row (/api/crm/buildings/:id); hide the 10 invalid controls on Cotality rows; delete the lookup/search |
| G-02 | Media & Documents modal | 3775-3899 | See section 3 | Media resource, VirtualTourURL* | D: upload form (photos, floor plan, doc inputs), 'REBNY Media Compliance' text, 0 / 100 uploaded | Upload UI in a viewer; video/tour inputs mapped to wrong fields (Video URL -> VirtualTourURLBranded; 'Branded Tour' -> VirtualTourURLUnbranded2); no Branded2/3 display | Replace with the read-only gallery/floor-plan/video/tour panel (section 3) |
| G-03 | Print modal | 4684-4750, 6840-7176 | Section 5 | n/a | D: opens; executeSalePrint throws ReferenceError getListingPhotoUrls | See section 5 | See section 5 |
| G-04 | Email modal | 4752-4793, 7182-7371 | Section 5 | n/a | D: subject 'Listing:  - $9,995,000' (no address); preview throws | See section 5 | See section 5 |
| G-05 | Calculators modal (6 tabs) | 7688-7799, 7534-7682 | Section 4 | ListPrice, AssociationFee(+Frequency), TaxAnnualAmount | D: empty until typed; opened via ?id= it never prefills (A-06) | See section 4 | See section 4 |

**Ledger cross-check.** The 15 field names the page binds that do not exist on Cotality Property (re-verified here from live `$metadata`, identical to FIELD-CORRECTION-LEDGER.md F3-001..F3-015): AttendanceType, BuildingTaxLot, CapitalReservesTotal, CapitalReservesYN, CommercialUnitsYN, ElevatorsTotal, FlipTax, GuarantorsAcceptedYN, LandmarkStatusYN, MaximumFinancingAmount, PercentOfCommonElements, SponsorUnitYN, TaxAbatementComments, TaxAbatementYN, TaxDeductionPercent. Disposition for this viewer: hide on Cotality rows; on Mallan rows show only from a Mallan key (Mallan-only). Also wrong, though they exist: `MlsStatus` (null in 100% of live rows, Active and Closed: use StandardStatus), `SyndicateTo` (0/200), `StoriesTotal` used as "floors in the unit", `InteriorFeatures` used for the fireplace radio, `UnitNumber` used for "line in building", `NewConstructionYN` used for both New Construction and New Development, `VirtualTourURLBranded` used for a "Video URL", `VirtualTourURLUnbranded2` used for "Branded tour".

## 3. MEDIA, VIDEO, VIRTUAL TOUR (REAL listing with photos + video + tour)

> Status of the shared contract: `dossiers/media-contract.md` did not exist when this section was written (checked 3 times). This section is built only on the repo's existing canonical readers (`GET /api/crm/listings/:id/media`, `pickFullSizeUrl`, `/api/media/proxy`, `listing_media`) and on live proof. If the shared contract differs, the contract wins and rows T05a-T05g change accordingly; nothing here invents a second design.

**3.1 What live Cotality gives (REAL = RLS20113389, ListingKey 1190156834).**
- Photos: Media rows `MediaCategory='Photo'` (MediaClassification PHOTO, MediaType Jpeg, MediaStatus Active, Order 1..21). `PreferredPhotoYN` is null here; the lowest Order is the hero. ShortDescription/LongDescription are null: do not invent captions.
- Floor plan: Media row `MediaCategory='FloorPlan'` (MediaClassification DOCUMENT, Jpeg, Order 1 which collides with photo 1: order within a category). 590,898 FloorPlan rows exist in Media, but **Property.FloorPlansCount is > 0 on 0 of 9,210 active listings** and `PhotosCount` (22) counts the floor plan too (21 photos + 1 floor plan). Count by MediaCategory, never by the Property counters.
- Video: **not in Media** (only 1 row in the whole resource has any other category). It arrives only as `VirtualTourURLUnbranded`/`VirtualTourURLBranded` (REAL: both = `https://youtu.be/1a141NJyQQE`, `VideosCount` 1). `VideosCount>0` on 611 active listings but a tour/video URL on 1,099; in a 300-row sample 177 rows with a URL have VideosCount 0/null: classify by URL host, not by the count.
- 3D tour: same two fields (plus Unbranded2: 46 active rows, Unbranded3: none seen). Hosts observed on 300 rows: youtu.be/youtube.com 231, my.matterport.com 56, vimeo 34, zillow.com/view-imx 19, 15 others (3dapartment, visithome.ai, drive.google.com, a mimecast-wrapped URL, `youtube.com/watch?...` with no scheme, `player.vimeo.com/...&amp`).
- Branded vs unbranded: 263 of 300 are unbranded-only, 37 have both, 36 of those are identical, 0 are branded-only.
- Media URL: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/<key>/<n>/<signed path>`. A GET with no Authorization header returned 200 image/jpeg (281,933 bytes); the app proxy `/api/media/proxy?url=...` returned the same for anonymous and broker sessions (cache 7 days). The locator is path-signed and rotates (repo comments in media-sync.ts and the /media route), so it must not be stored in emails or printouts; the durable copy is `listing_media.media_url_cached` (R2).

**3.2 How the viewer must show it.**
| Block | Source | Rule |
|---|---|---|
| Gallery (id `saleGallery`, count `saleGalleryCount`, images `.sale-gallery-img`) | `GET /api/crm/listings/:id/media` rows with `media_category='Photo'`, ordered by order | Count = number of Photo rows (REAL 21), not PhotosCount. Hero = lowest order (or PreferredPhotoYN). `src` = `heroUrl` from that endpoint (R2 copy first via `pickFullSizeUrl`); if it is a Trestle locator, wrap it as `/api/media/proxy?url=...`. alt = "Listing photo n of N". Caption only if Cotality provides one. Lazy-load thumbnails. |
| Floor plans (`saleFloorPlans`, `.sale-floorplan-img`) | same endpoint, `media_category='FloorPlan'` | Separate from the gallery; images shown, Pdf as a link. REAL: 1. |
| Video (`saleVideoBlock[data-host]`) | `raw_data.VirtualTourURLUnbranded`, else Branded | URL whose host is youtube/youtu.be/vimeo is a video. Normalise: HTML-decode, add https:// to a bare host, reject non-http(s) and javascript:. YouTube: `https://www.youtube.com/embed/<id>` (accept watch?v=, youtu.be/<id>?si=, shorts/<id>); Vimeo: `https://player.vimeo.com/video/<id>`. Identical Branded and Unbranded: show once. Embed only if CSP allows (A-10), otherwise a link with `rel="noopener noreferrer" target="_blank"` and the host name. |
| 3D tour (`saleTourBlock[data-host]`) | same fields (+ Unbranded2/3 on Mallan rows) | Host matterport -> embed; zillow view-imx and unknown hosts -> external link. Never both video and tour from the same URL. REAL: none. |
| Branded vs unbranded | VirtualTourURLBranded / Unbranded | CRM viewer: show Unbranded as the tour; show Branded only when different, labelled "Branded (listing broker)". Client-facing outputs: Unbranded only. (Proposed rule; confirm with the media contract.) |
| Empty states | | Text "No video" / "No 3D tour" / "No floor plan"; Preview counts equal the blocks. |
| Documents | DocumentsCount 8,183 active | The Media resource returns no document rows: do not link documents. |
| Rights | Master Plan 11.11, 21.9 | Provider media is shown to the agent under the provider's use contract; client delivery and republication need the grading in 11.11. Print/email may use at most 6 photos, only rows with Permission null or Public (the repo's upsert already drops others). |

**3.3 Mallan rows.** Photos from `listing_media` rows with `crm:` keys (`editable:true`) or the legacy JSON preview (`_preview`); tours from `raw_data.VirtualTourURLUnbranded/Branded`. The page's "Media and Documents" modal, upload inputs and the REBNY upload guidance (3775-3899) are DELETED from the viewer; uploading lives in Form 1.

**3.4 Defects today (REAL).** `d.photos` is built from `apiData.media` (4957), which is `[]` for every synced row (the mapper writes an empty array, observed `media` = `[]`) although 22 `listing_media` rows exist; Preview prints the constant `'0 uploaded'` (6519); video/tour counts read two inputs that are never filled (6520-6521); `getListingPhotoUrls` is defined only in RENTAL-FORM-WITH-TOOLS.html, so Print/Email/Copy throw ReferenceError (observed T08a/T09a/T09b); CRM_CSP blocks video/tour iframes (A-10); the Media modal maps "Video URL" to VirtualTourURLBranded and "Branded Tour" to VirtualTourURLUnbranded2 (3830, 3859). Tests: T05a to T05g.

## 4. CALCULATOR SPEC (every formula, rule, source, vectors)

Sources fetched 2026-10-15: **NYS Dept. of Taxation, Instructions for Form TP-584-NYC (TP-584-NYC-I, 8/25)** (the supplemental-tax table, additional base tax, payers, definition of residential real property, saved copy dl-tp584/out.txt), **NYS real estate transfer tax page** (tax.ny.gov/bus/transfer/rptidx.htm), **NYC Dept. of Finance RPTT page** (nyc.gov .../property-real-property-transfer-tax-rptt.page).

**4.1 Closing costs: statutory taxes** (rates apply to the ENTIRE price, not marginally). "Residential real property" = a 1-3 family house, an individual residential condominium unit, or a residential cooperative apartment (TP-584-NYC-I item 6). The tab must say it is not valid for commercial or vacant land.

| Line | Payer | Rule | Source |
|---|---|---|---|
| NYS transfer tax (base) | Seller | $2 per $500 of consideration **or fractional part**; only if consideration > $500: tax = 2 x ceil(price/500) | TP-584-NYC-I "base tax"; NYS page |
| NYC additional base tax | Seller | **+ $1.25 per $500 or fractional part when residential consideration >= $3,000,000** (non-residential >= $2,000,000): tax = 1.25 x ceil(price/500). Seller total at >= $3M is 3.25 per $500 = 0.65% | TP-584-NYC-I "Calculation of additional base tax" |
| NYC RPTT | Seller (filed with the deed; grantee liable if grantor fails) | Residential (1-3 family, condo unit, co-op apartment): **1% of price if <= $500,000; 1.425% if > $500,000**; applies when > $25,000 | NYC DOF RPTT page |
| State additional tax ("mansion tax") | Buyer | **1% of the entire price when residential consideration >= $1,000,000** | TP-584-NYC-I "additional tax"; NYS page |
| NYC supplemental tax | Buyer | Residential, entire price >= $2,000,000: **0.25%** ($2M-<$3M), **0.50%** ($3M-<$5M), **1.25%** ($5M-<$10M), **2.25%** ($10M-<$15M), **2.50%** ($15M-<$20M), **2.75%** ($20M-<$25M), **2.90%** (>= $25M) | TP-584-NYC-I "Supplemental tax rates" |
| Buyer total of the two | Buyer | 1.00% ($1M-<$2M); 1.25%; 1.50%; 2.25%; 3.25%; 3.50%; 3.75%; 3.90% (>= $25M) | sum of the two rows above |

**What the page does today (7610-7629) and the exact defects.**
- Mansion tiers present at 1M, 2M, 5M, 10M, 25M; **missing 3M (1.50%), 15M (3.50%), 20M (3.75%)**. Observed: $3,000,000 -> $37,500 (correct $45,000); $4,999,999 -> $62,500 (correct $74,999.99); $15,000,000 -> $487,500 (correct $525,000); $20,000,000 -> $650,000 (correct $750,000).
- Seller NYS tax is a flat 0.4% (7614): omits the NYC additional base tax at >= $3M (REAL $9,995,000: shows $39,980; correct $64,967.50) and ignores "fractional part" ($500,001: shows $2,000; correct $2,002).
- NYC RPTT rate rule is right (1% / 1.425%) but is applied to non-residential types too; add the residential-only guard.
- Attorney ($3,500 / $2,500) and title (0.4% of price, buyer) are Mallan assumptions, not law: must be editable inputs labelled "estimate" (acceptance T11g). Title insurance for a co-op share loan is typically not applicable: do not default it for a co-op.
- NOT CONFIRMED, therefore not specified as law: **mortgage recording tax** (the NYC DOF page I fetched gives no rates; a search result quotes NYC city-only 1.0% below / 1.125% at $500,000+ for 1-3 family and condo mortgages from NYC's 2024 MRT report, but I could not retrieve the PDF or the NYS table, so it stays out of the calculator until Maya confirms the source); the NYC RPTT payer is stated by the DOF page as "the party filing the return ... usually as part of closing costs" while the Admin Code section that imposes it on the grantor was not retrieved; the rounding rule for NYC RPTT and the percentage taxes (specified here as round to cents); exemptions (HDFC, REIT half rate, cooperative conversions) are not modelled.

| Price | Buyer state 'mansion' 1% + NYC supplemental | Rate | Seller NYS (base $2/$500 + NYC addl $1.25/$500 if >= $3M) | Seller NYC RPTT |
|---|---|---|---|---|
| 999,999 | $0.00 | 0.00% | $4,000.00 | $14,249.99 |
| 1,000,000 | $10,000.00 | 1.00% | $4,000.00 | $14,250.00 |
| 1,999,999 | $19,999.99 | 1.00% | $8,000.00 | $28,499.99 |
| 2,000,000 | $25,000.00 | 1.25% | $8,000.00 | $28,500.00 |
| 2,999,999 | $37,499.99 | 1.25% | $12,000.00 | $42,749.99 |
| 3,000,000 | $45,000.00 | 1.50% | $19,500.00 | $42,750.00 |
| 4,999,999 | $74,999.99 | 1.50% | $32,500.00 | $71,249.99 |
| 5,000,000 | $112,500.00 | 2.25% | $32,500.00 | $71,250.00 |
| 9,995,000 | $224,887.50 | 2.25% | $64,967.50 | $142,428.75 |
| 10,000,000 | $325,000.00 | 3.25% | $65,000.00 | $142,500.00 |
| 14,999,999 | $487,499.97 | 3.25% | $97,500.00 | $213,749.99 |
| 15,000,000 | $525,000.00 | 3.50% | $97,500.00 | $213,750.00 |
| 19,999,999 | $699,999.97 | 3.50% | $130,000.00 | $284,999.99 |
| 20,000,000 | $750,000.00 | 3.75% | $130,000.00 | $285,000.00 |
| 24,999,999 | $937,499.96 | 3.75% | $162,500.00 | $356,249.99 |
| 25,000,000 | $975,000.00 | 3.90% | $162,500.00 | $356,250.00 |
| 500,000 | $0.00 | 0.00% | $2,000.00 | $5,000.00 (1%) |
| 500,001 | $0.00 | 0.00% | $2,002.00 | $7,125.01 (1.425%) |

Pages today fail these rows: 3,000,000 (page $37,500), 4,999,999 (page $62,500), 15,000,000 (page $487,500), 20,000,000 (page $650,000); seller NYS at 500,001 and at every price >= $3M. Acceptance: T11e-*, T11f-*.

**4.2 Mortgage / monthly carrying cost.**
- P&I = L x r x (1+r)^n / ((1+r)^n - 1), r = rate/12/100, n = 12 x years; if rate = 0 then P&I = L / n; if L <= 0 then 0. L = price x (1 - down/100). Valid inputs: 0 <= down <= 100, rate >= 0, term from the select.
- **Zero is a valid input.** The page uses `parseFloat(x) || default` (7583-7585, 7638, 7655, 7668) so 0% down becomes 20%, 0% rate becomes 6.75%, 0% appreciation 3%. Use `isNaN` checks (T11c, T11d, T11i, T11k).
- Monthly maintenance = AssociationFee x factor(AssociationFeeFrequency): Monthly 1; Weekly 52/12; BiWeekly 26/12; SemiMonthly 2; BiMonthly 1/2; Quarterly 1/3; SemiAnnually 1/6; Annually 1/12; Daily 365/12; Seasonal and OneTime are not recurring monthly costs (exclude and say so). The page ignores the frequency (7595-7601).
- Monthly taxes = TaxAnnualAmount / 12 for condo/townhouse/house. **Co-op: maintenance already includes the building's real estate taxes** (Master Plan section 6 keeps "condo and co-op economics" distinct with their actual source meaning); do not add TaxAnnualAmount separately and show "taxes included in maintenance". (Rule stated from the Master Plan's principle and NYC co-op practice; not a statute.)
- Total monthly = P&I + taxes + maintenance. The page calculators read `reTaxes/maintCC` from `VIEWER_LISTINGS[?listingId]` and fall back to inputs that are blank (7554-7597).

Fee frequency vectors:

| Frequency | Amount | Monthly |
|---|---|---|
| Monthly | 11,488 | $11,488.00 |
| Quarterly | 3,000 | $1,000.00 |
| Annually | 12,000 | $1,000.00 |
| Weekly | 250 | $1,083.33 |
| SemiAnnually | 6,000 | $1,000.00 |
| BiWeekly | 500 | $1,083.33 |

| Case | Inputs | Expected |
|---|---|---|
| M1 | 1,000,000; 20%; 6.75%; 30y | loan $800,000; P&I $5,188.78 (page: $5,189 correct) |
| M2 | 500,000; 25%; 5%; 15y | loan $375,000; P&I $2,965.48 |
| M3 | 1,000,000; 0% down; 6.75%; 30y | loan $1,000,000; P&I $6,485.98 (page: loan $800,000) |
| M4 | 800,000 loan; 0% rate; 30y | P&I $2,222.22 (page: 6.75% default) |
| M5 | REAL 9,995,000; 20%; 6.75%; 30y; maintenance 11,488 monthly; no tax (co-op) | loan $7,996,000; P&I $51,861.90; total monthly $63,349.90 |

**4.3 Cash on cash.** NOI / total cash invested x 100, "--" when cash <= 0. Vector: 30,000 / 400,000 = 7.50% (page correct, T11j).

**4.4 ROI.** FV = price x (1 + a)^N; net income = (annual rent - annual expenses) x N; gain = (FV - price) + net income; total ROI = gain / price; annualised = ((price + gain)/price)^(1/N) - 1. Unleveraged (ignores down payment and loan): the label must say so. The result label must show N (the page hard-codes "5yr", markup line 7756). Vector: price 1,000,000; a 4%; rent 60,000; expenses 20,000; N 10 -> FV $1,480,244.28; net $400,000; total 88.0%; annualised 6.5% (page arithmetic correct apart from the label and zero-defaults). Zero appreciation -> FV = price (T11i).

**4.5 Rent vs Buy (model definition, not law; explicit assumptions per Master Plan section 8).** Inputs: price P, down d, rate, term T, monthly maintenance M, annual tax A (non-co-op), monthly rent R0, rent growth g, horizon N <= T, appreciation a, selling cost c (default 6%, shown). monthlyOwn = P&I + A/12 + M. Rent total = sum over years of 12 x R0 x (1+g)^k. Net cost of owning = down + buyer taxes (4.1) + 12 x N x monthlyOwn - equity(N), equity(N) = P(1+a)^N (1 - c) - loanBalance(12N). Savings (Buy) = rent total - net cost of owning. The page computes ownership as a typed monthly number x 12 x N (7652-7665): the price, down payment, P&I, closing taxes and equity are never used (T11l: changing the price must change the result). Vector: P 1,000,000, d 20%, 6.75%, 30y, M 1,500, A 12,000, R0 8,000, g 3%, N 7, a 3%, c 6% -> monthlyOwn $7,688.78; rent total $735,596.37; buyer taxes $10,000.00; net cost of owning $426,076.27; savings (buy) $309,520.10.

**4.6 Buy vs Sell.** The page compares "hold gain" (an increment: future - value - carry) to "sell net" (an absolute amount, default 94% of value) (7666-7682), so the recommendation is meaningless, and negatives print as "$-87,273". Definition: hold net change = V(1+a)^N(1-c) - V - 12 x m x N; sell-now net change = -c x V + V(1-c)((1+rho)^N - 1) with rho (return on proceeds) default 0%; recommend HOLD if hold > sell. Replace the "Estimated Sale Proceeds" input by the explicit selling-cost % (`saleBvSSellCost`, default 6) and `saleBvSReinvest`. Vector: V 1,000,000; a 0%; m 5,000; N 3; c 0 -> hold net change **-$180,000** (page with its 3% default shows "$-87,273"); with c 6%: hold -$240,000, sell -$60,000 -> SELL. Money format: `-$1,234` (sign before the symbol).

**4.7 Wiring and honesty.** Prefill from the listing: price = ListPrice, maintenance (frequency-normalised), tax. Scenario overrides never change listing facts (Master Plan section 8). The Master Plan wants ONE engine shared by every surface; today the formulas live inside this page (and the rental page). Where the shared engine lives is a decision for Maya; the formulas above are the spec for it.

## 5. REPORTS, EMAIL, PRINT: required content

Governing rules: Master Plan 10.2 (a client-facing report "identifies only the Mallan Agent/Broker who created the report, plus any source/listing-broker attribution specifically required"; "must never leak internal source-agent/owner PII"), 9.7 and 21.10 (rights, attribution, Fair Housing, address-display permission, PII strip), the repo's public disclaimer component (`app/components/IDXDisclaimer.tsx`), and the UCBA Art. III Sec. 2(C) "Listing Courtesy of" practice as the repo implements it (listing cards, building pages).

**5.1 Every output about a Cotality listing (print Client Sheet / Fact Sheet, email card, copied card, agent sheet).**
1. Address per display permission: if `InternetAddressDisplayYN` is explicitly false, omit the street address and unit (building/neighborhood only); null = displayable under the IDX Plus pre-filter (0/200 populated).
2. Facts with units: price; beds; baths (full + half); rooms; square feet only if present; floor; year built; **maintenance with its frequency**; **taxes labelled annual with /12 monthly**; maintenance and taxes are never printed as "/mo" when they are annual.
3. Description = PublicRemarks, sanitised (the REAL text has literal `<br>` tags; convert to line breaks, strip tags, escape the rest).
4. Photos: up to 6, absolute `https` URLs that work inside a `blob:` window (a relative `/api/media/proxy` URL does not), R2 or proxy URL, not a raw rotating locator; `alt`. Floor plan separate. Unbranded tour/video link only.
5. **"Listing Courtesy of {ListOfficeName}"** (typed column `list_office_name`; REAL "Brown Harris Stevens Residential Sales LLC"; Mallan rows "Mallan Real Estate Inc."). Font size not below the body size (the repo comments cite UCBA Art. III Sec. 2(C); not independently verified against the UCBA text).
6. **Data as-of = the listing's real refresh time** (`modification_timestamp`, REAL 2026-10-15T21:08:43Z) formatted in ET, never "now". Today's print, email footer and agent sheet print the render time (print 7135, agent sheet 4890; the email card shows no date at all), which misstates freshness (IDXDisclaimer.tsx documents UCBA Art. VIII Sec. 4).
7. Disclaimer text identical to the public full variant (IDXDisclaimer.tsx) and `Mallan Real Estate Inc. - Licensed Real Estate Broker, New York State`, `Equal Housing Opportunity`. Remove "Listing data provided by the REBNY Listing Service", the "(c) The Real Estate Board of New York, Inc." line and the "Data last updated ... " construct from the page (4889, 4891, 7136, 7246, 7295, 3415).
8. Prepared by: the **viewing Mallan agent** (name from the session, title `licenseTitle`, license, phone, email from `/api/auth/me`); never the listing agent. Brokerage name, license number, address and phone come from the governed profile (`companyName`, `companyLicense`, `companyAddress`, `companyPhone`), not typed strings (they are hard-coded at 4879-4882, 7002-7004, 7137, 7245, 7294, 7322; Master Plan section 9 ("A marketing output holds no independent copy of any of these inputs")).
9. Must NOT appear: source agent email, direct phone, preferred phone, license (ListAgentEmail, ListAgentDirectPhone ...); ShowingInstructions/PrivateRemarks; administrative comments; commission, co-broke or compensation (the Full CRM preset prints "Exclusive Commission", 7066); distribution gates; internal ids; anything under the Commission tab.
10. Escaping: every interpolated value HTML-escaped (**stored XSS today**: print popup and email preview build HTML by string concatenation; a Mallan or Cotality-sourced address or remarks containing `<img onerror>` executed script in the CRM origin in both the email preview and the print `blob:` window. Reproduced with field values set in the DOM, which is what a correct binder will do).

**5.2 Presets.** Full CRM Report = INTERNAL: may add provider contact (ListAgentMlsId, office phone) under a red "INTERNAL - not for client distribution" band; Client Sheet and Fact Sheet = client-safe per 5.1; Commission Report = Mallan listings only, broker/agent only, Mallan-only data.

**5.3 Email.** Subject `Listing: <address as permitted> - <price>`; To/CC validated; body = message + client-safe card; mailto body limited to a plain-text summary under about 1,500 characters (long mailto bodies are truncated by mail clients); Copy puts text/html and text/plain on the clipboard. Today: subject has no address (street input never filled), card footer shows the agent **id** ("1 | Licensed Real Estate Broker") because it reads the hidden id field (6913), and nothing records the share (Master Plan 9: delivery and tracking). No server send exists; keep it that way unless Maya approves.

**5.4 Agent Info Sheet.** Block 1 "Prepared by" = the Mallan agent (today: name correct, phone "--", license "--"). Block 2 "Current listing" = address/price/beds/baths/sf (today "--, Manhattan" and no price for REAL). Block 3 for third-party listings: "Listing Courtesy of {office}" and data as-of. Not the listing agent's contact. Fix the `</script>` string (A-01) and escape values.

**5.5 Acceptance for outputs.** T08a-T08d, T09a-T09c, T10.

## 6. ORDERED FIX LIST

| # | Fix | Why first | Rows / tests |
|---|---|---|---|
| 1 | Repair the 3 syntax defects (4902, 5424, 5432), and the rental twin | page does not run at all | A-01; T01a, T01b |
| 2 | Same-origin API only (delete 130-136); one async boot; server-validated role before masking; explicit denied/error states | production exposure on preview/local; deterministic wipe; broker masked as buyer | A-02..A-05, A-11; T01d, T01e, T04a-T04d |
| 3 | HTML-escape every value in print, email, copy and agent sheet; sanitise PublicRemarks | stored XSS in the CRM origin | 5.1 item 10; T09c |
| 4 | Bind every displayed field through the shared field contract (SALE_FIELD_MAP) incl. raw_data; compose the street address; DOM from OnMarketDate; Updated; status; description; agent/courtesy; hide the 15 non-Cotality controls | 12 of 72 fields work today | A-07, A-08, B-02..B-04, C-*, D-*, E-*; T02-*, T03a-T03f, T07, T07b |
| 5 | Media per section 3: gallery, floor plan, video, tour; define getListingPhotoUrls; CSP frame-src; persist or query the missing fields | no photos anywhere; print/email throw | G-02, A-10; T05a-T05g |
| 6 | Output content per section 5 (courtesy, as-of, no source PII, creator not id, governed brokerage identity, current disclaimer) | compliance and accuracy of client-facing material | 5.1-5.4; T08a-T10 |
| 7 | Calculators per section 4 (zeros, tiers, NYS additional base tax and fractional part, fee frequency, co-op taxes, labels, formats, wiring) | wrong tax numbers at and above $3M | G-05; T11a-T11l |
| 8 | Transit and commute from real coordinates (existing /api/transit/* + lib/geo/geocode), labelled exact/approximate | wrong stations (UES defaults) | F-04; T12a, T12b |
| 9 | Open houses from Cotality OpenHouse; history from price/status fields | static empty states hide 2 live open houses | C-29, F-05; T06, T13a |
| 10 | Delete form leftovers: validation toggle/summary, mock public preview, upload controls, dead handlers, CRM status machine, REBNY scanners, Required toggle | dead and misleading UI, large blocks of dead form code (5501-6400) | A-09, B-07, F-03, G-02; T13b |
| 11 | Persist the missing Cotality fields the viewer needs (RAW_DATA_KEEP_FIELDS) or query them live | 52 of 139 live fields not stored | Appendix C |
| 12 | Responsive: no horizontal scroll at 820 and 390 | scrollWidth 893 at 820, 625 at 390 (after syntax repair) | T14-* |

**Decisions needed from Maya (not guessed here):** (a) agent access to third-party rows (403 today); (b) CRM_CSP frame-src for video/tour hosts; (c) branded-tour policy for client outputs; (d) where the single calculator engine lives and whether mortgage recording tax is in scope (source not confirmed); (e) Building modal data source (listing's own Property fields plus the `buildings` table, which is empty in the throwaway DB) and whether the lookup box is dropped; (f) read path for open houses (existing /api/open-houses is scoped to Mallan's office); (g) whether the Commission tab stays in this viewer or moves to the Deal forms (Master 0.15).

**Dispositions (page parts).** KEEP: header/sticky bar frame, tab navigation, calculator modal shell, print and email modal shells, transit/commute shell. CONVERT (to canonical Cotality-backed path): field binding, description, agent/courtesy, media, open houses, history, transit data, building data, calculators' prefill. CORRECT: closing-cost and ROI/rent/sell arithmetic, outputs' content. DELETE: validation UI, mock public preview, media upload, building lookup/search, listing-type/status machinery, REBNY scanners, Draft/Future/Offer statuses, 8 distribution checkboxes for Cotality rows, form-only radios without data, the buyer/tenant/seller/landlord masking.

## 7. ACCEPTANCE SCRIPT

`C:\Users\MayaAllan\AppData\Local\Temp\claude\C--Users-MayaAllan-mallan-ops\27fa35f1-5c66-4ecc-9cd4-d892fc9ad7ea\scratchpad\dossiers\form3-acceptance.js` (Playwright, real Chrome, real localhost app; 91 assertions). Run: `node form3-acceptance.js` (as shipped), `DIAG_PATCH=1 node form3-acceptance.js` (in-memory syntax+race patch to see what hides behind the syntax errors), `SELFTEST=1 DIAG_PATCH=1 ...` (also swaps in the reference calculators to prove the test plumbing), `COTALITY_LIVE=1` to re-query Cotality for the expected values, env `REAL_ID`, `MALLAN_ID`, `PROOF_DIR`, `RESULTS`. It refuses a non-local `BASE`, re-routes the page's hard-coded production host to localhost and counts those requests, creates its Mallan fixture through the real create API, and exits with the number of failures. Absence checks are marked "NOT EVALUABLE" (fail) when the page JavaScript is dead, so a dead page cannot pass by having nothing to test.

**Baseline results (saved JSON in form3-owner):** as shipped 3/91 passed, 88 failed (acc-shipped.json); diagnostic patch 26/91 passed, 65 failed (acc-diag.json); self-test 38/91 passed, 53 failed (acc-self.json: the calculator vector tests pass or fail only because of the reference swap, proving the harness reads the real UI).

**DOM contract the fixed page must expose (test hooks).** `body[data-viewer-state]` = loading | ready | denied | error; `#saleViewerDenied`; `#saleSourceBadge` (text includes "Cotality" and the listing office, or "Mallan"); `#saleAsOf`; `#saleGallery`, `#saleGalleryCount`, `.sale-gallery-img`; `#saleFloorPlans .sale-floorplan-img`; `#saleVideoBlock[data-host]`; `#saleTourBlock[data-host]`; `#saleOpenHouseList .sale-oh-row`; `#saleTransitResults` and `#saleTransitSource`; `#saleListingAgentName`; calculator extras `#saleClosingAttorneyInput`, `#saleClosingTitleInput`, `#saleBvSSellCost`, `#saleBvSReinvest`. All existing ids (`saleAddressDisplay`, `salePrice`, `saleMaintCC`, `saleDescription`, `saleCourtesyAttribution`, calculator ids) are reused unchanged.

## 8. Could NOT verify

- The shared media contract (absent when written); Zillow 3D embeddability; whether Matterport/YouTube iframes render under a modified CSP (not tested: CSP unchanged).
- UCBA article text (Art. III Sec. 2(C) courtesy font rule, Art. VIII Sec. 4 as-of rule): quoted from repo comments only.
- Mortgage recording tax rates; NYC RPTT rounding; the Admin Code payer clause; any exemption.
- Behaviour on Vercel itself (route rewrite `/crm/sale-view`; local Next returns 404 for it, so tests load the .html path).
- Building modal content for a matched `buildings` row (table empty in the throwaway DB).
- A real Closed Cotality listing in the viewer (field proof is live; the page was run only on Active and Mallan rows).

---

## Appendix A. Control-level register (every control in the markup)

Generated from the rendered page (817 controls). 160 of them (20 cards) are anonymous checkboxes with no id and no name, so they cannot be bound as written. "Shows today" is the best-case value (after the in-memory syntax-and-race patch) for the REAL listing. For list-valued cards the match test compares page labels with the union of the live Lookup values and the tokens observed on 300 live rows (substring match, labels of 4+ characters); the Lookup resource returned no values for InteriorFeatures although the field is populated on 107/200 rows, so a "no match" on those cards means "cannot verify", not "wrong".

| Zone | Line | Control | Label | data-rls-field | Shows today (best case, REAL) | Disposition / live Cotality evidence |
|---|---|---|---|---|---|---|
| Shell | 159 | #saleUpdatingAgent |  |  | 1 | TOOL INPUT: keep |
| Shell | 160 | #saleUpdatingAgentName |  |  | Audit Broker | TOOL INPUT: keep |
| Shell | 161 | #saleUpdatingAgentPhone |  |  |  | TOOL INPUT: keep |
| Shell | 162 | #saleUpdatingAgentEmail |  |  | broker@example.test | TOOL INPUT: keep |
| Shell | 163 | #saleUpdatingAgentLicense |  |  |  | TOOL INPUT: keep |
| Shell | 164 | #saleUpdatingAgentCompanyKey |  |  | mallan | TOOL INPUT: keep |
| Shell | 165 | #saleUpdatingAgentCompanyName |  |  | Mallan Real Estate Inc. | TOOL INPUT: keep |
| Shell | 269 | #saleShowRequiredOnly |  |  |  | TOOL INPUT: keep |
| T1 Listing Info 1_1 | 306 | #saleBuildingSearch | Street Address * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 325 | #saleStreetAddress | Street Address * | StreetName |  | COT StreetName: bind (200/200 populated) |
| T1 Listing Info 1_1 | 329 | #saleUnitNumber | Unit / Apt | UnitNumber |  | COT UnitNumber: bind (183/200 populated) |
| T1 Listing Info 1_1 | 333 | #saleBorough | Borough * | CityRegion | Manhattan | COT CityRegion: bind (200/200 populated) |
| T1 Listing Info 1_1 | 346 | #saleZipCode | Zip Code | PostalCode | 10003 | COT PostalCode: bind (200/200 populated) |
| T1 Listing Info 1_1 | 350 | #saleNeighborhoodFromAddress | Neighborhood |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 361 | #saleUpdatingAgentDisplay | Listing Agent |  | 1 \| Audit Broker | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 367 | #saleCreateDate | Create Date |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 374 | #saleLastUpdatedDate | Last Updated |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 385 | #saleAdminComments | Administrative Comments |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 399 | name=saleListingType (6 options) | Exclusive Right to Sell (ExclusiveRightToSell) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 417 | name=saleListingType (1 options) | In-House (Company Private) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 512 | name=saleDirectDeal (2 options) | Yes |  | No | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 524 | #saleCoBrokeAgreementType | CoBroke Agreement Type * |  | -- Select CoBroke Agreement Type -- | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 533 | #saleCommNegotiabilityAck | * Commission Negotiability Disclosure: I confirm that the listing agre |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 542 | #saleBuyerRepAgreementAck | Buyer Representative Agreement: I confirm a written buyer representati |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 554 | #saleOptOutFormUpload | Owner Opt-Out Form (Exhibit B) * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 565 | #saleStatus | Status * | MlsStatus | Active | COT MlsStatus: bind (0/200 populated) |
| T1 Listing Info 1_1 | 634 | #salePrice | Price * | ListPrice | 9995000 | COT ListPrice: bind (200/200 populated) |
| T1 Listing Info 1_1 | 638 | #saleMaintCC | Maint/CC * | AssociationFee |  | COT AssociationFee: bind (192/200 populated) |
| T1 Listing Info 1_1 | 642 | #saleMaintCCFreq | Fee Frequency | AssociationFeeFrequency | Monthly | COT AssociationFeeFrequency: bind (192/200 populated) |
| T1 Listing Info 1_1 | 658 | #saleRETaxes | RE Taxes (Monthly) | TaxAnnualAmount |  | COT TaxAnnualAmount: bind (101/200 populated) |
| T1 Listing Info 1_1 | 664 | #saleTotalMonthly | Total Monthly |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 669 | #saleOriginalPrice | Original Price | OriginalListPrice |  | COT OriginalListPrice: bind (171/200 populated) |
| T1 Listing Info 1_1 | 673 | #saleSoldPrice | Sold Price * | ClosePrice |  | COT ClosePrice: bind (0/200 populated) |
| T1 Listing Info 1_1 | 687 | name=saleInternetAVMDisplayYN (2 options) | Y | InternetAutomatedValuationDisplayYN | Yes | COT InternetAutomatedValuationDisplayYN: bind (200/200 populated) |
| T1 Listing Info 1_1 | 713 | name=salePropertyType (16 options) | Condo | PropertyType |  | COT PropertyType: bind (200/200 populated) |
| T1 Listing Info 1_1 | 746 | name=saleOfficeRetailOwnership (6 options) | Condo |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 759 | name=saleBuildingStatus (4 options) | Resale |  | Resale | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 767 | name=saleLandLease (2 options) | No | LandLeaseAmount | No | COT LandLeaseAmount: bind (0/200 populated) |
| T1 Listing Info 1_1 | 776 | #saleCommonInterest | Ownership Structure * | CommonInterest | Select... | COT CommonInterest: bind (200/200 populated) |
| T1 Listing Info 1_1 | 803 | name=salePropertyType (1 options) | Select Commercial Listing |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 816 | name=saleCommSubtype (18 options) | Professional Office |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 858 | name=saleCommercialOwnership (5 options) | Commercial Condo |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 868 | name=saleTenantConfig (2 options) | Single Tenant |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 879 | name=saleBusinessType (21 options) | Medical | BusinessType |  | COT BusinessType: bind (0/200 populated) |
| T1 Listing Info 1_1 | 934 | #saleDateListed | Date Listed * | OnMarketDate |  | COT OnMarketDate: bind (200/200 populated) |
| T1 Listing Info 1_1 | 938 | #saleExclusiveStart | Exclusive Start * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 943 | #saleExclusiveExpires | Exclusive Expires (Hidden) | ExpirationDate |  | COT ExpirationDate: bind (0/200 populated) |
| T1 Listing Info 1_1 | 947 | #saleFirstCoBroke | First Co-Broke * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 955 | #saleAvailableOccupancy | Available for Occupancy |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 961 | #saleFirstShowingDate | Available for Showing | OnMarketDate |  | COT OnMarketDate: bind (200/200 populated) |
| T1 Listing Info 1_1 |  | (anonymous input:text) | Availability Comments |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T1 Listing Info 1_1 | 972 | #saleOffMarketDate | Off Market Date * | OffMarketDate |  | COT OffMarketDate: bind (0/200 populated) |
| T1 Listing Info 1_1 | 976 | #saleWithdrawnDate | Withdrawn Date | WithdrawnDate |  | COT WithdrawnDate: bind (0/200 populated) |
| T1 Listing Info 1_1 | 980 | #saleContractSignedDate | Contract Signed Date * | PurchaseContractDate |  | COT PurchaseContractDate: bind (2/200 populated) |
| T1 Listing Info 1_1 | 984 | #saleSoldDate | Sold Date * | CloseDate |  | COT CloseDate: bind (0/200 populated) |
| T1 Listing Info 1_1 | 995 | #saleUnitShares | Unit Shares * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 999 | #saleUnitSqFt | Unit Sq Ft | LivingArea |  | COT LivingArea: bind (171/200 populated) |
| T1 Listing Info 1_1 | 1010 | #salePercentCommon | % Common Elements | PercentOfCommonElements |  | NOT IN COTALITY (ledger F3-011): hide for Cotality rows; Mallan key for Mallan rows |
| T1 Listing Info 1_1 | 1014 | #saleLivingArea | Living Area (Sq Ft) * | LivingArea |  | COT LivingArea: bind (171/200 populated) |
| T1 Listing Info 1_1 | 1018 | #saleLivingAreaUnits | Living Area Units | LivingAreaUnits | Square Feet | COT LivingAreaUnits: bind (200/200 populated) |
| T1 Listing Info 1_1 | 1025 | #saleLivingAreaSource | Living Area Source | LivingAreaSource | Select | COT LivingAreaSource: bind (0/200 populated) |
| T1 Listing Info 1_1 | 1046 | #saleTaxDeduction | Tax Deduction % | TaxDeductionPercent |  | NOT IN COTALITY (ledger F3-015): hide for Cotality rows; Mallan key for Mallan rows |
| T1 Listing Info 1_1 | 1057 | #saleFlipTaxAmount | Flip Tax Amount * | FlipTax |  | NOT IN COTALITY (ledger F3-007): hide for Cotality rows; Mallan key for Mallan rows |
| T1 Listing Info 1_1 |  | (anonymous select) | Flip Tax Type |  | Select Type | ANONYMOUS control (no id, no name): cannot be bound |
| T1 Listing Info 1_1 |  | (anonymous select) | Paid By |  | Select... | ANONYMOUS control (no id, no name): cannot be bound |
| T1 Listing Info 1_1 |  | (anonymous textarea) | Flip Tax Amount * |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T1 Listing Info 1_1 | 1093 | name=saleBoardApproval (2 options) | Yes | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| T1 Listing Info 1_1 | 1098 | name=saleBoardInterview (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1103 | name=saleMeetAndGreet (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1108 | name=saleBoardApplication (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1115 | name=saleFirstRefusal (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1120 | name=saleFilmLocation (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1125 | name=saleLiveWorkAllowed (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1130 | name=saleCertOccupancy (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1143 | name=salePiedATerre (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1150 | name=saleParentsBuying (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1157 | name=saleCoPurchasing (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1164 | name=saleGuarantors (2 options) | Yes | GuarantorsAcceptedYN |  | NOT IN COTALITY (ledger F3-008): hide for Cotality rows; Mallan key for Mallan rows |
| T1 Listing Info 1_1 | 1171 | name=saleSubletting (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1185 | #saleCommissionType | Owner Pays (to Buyer's Agent) |  | % | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1189 | #saleExclusiveCommission | Owner Pays (to Buyer's Agent) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 | 1195 | name=saleCommissionType (2 options) | Owner Pays (to Buyer's Agent) |  | OwnerPays | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_1 |  | (anonymous textarea) | Owner Pays (to Buyer's Agent) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T1 Listing Info 1_1 | 1211 | #saleConcessions | Concessions (RLS/RESO/IDX: Concessions) | Concessions | Select | COT Concessions: bind (0/200 populated) |
| T1 Listing Info 1_1 | 1221 | #saleConcessionAmount | Concession Amount (RLS/RESO/IDX: ConcessionsAmount) | ConcessionsAmount |  | COT ConcessionsAmount: bind (0/200 populated) |
| T1 Listing Info 1_1 | 1226 | #saleConcessionComments | Concession Comments (RLS/RESO/IDX: ConcessionsComments) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_2 | 1250 | #saleListingUrl | Listing URL | ListingURL |  | COT ListingURL: bind (182/200 populated) |
| T1 Listing Info 1_2 | 1260 | #saleWebDisplayAddress | Web Display Address |  | -- Select Display Format -- | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_2 | 1277 | #saleWebHeadline | Web Headline |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_2 | 1291 | name=saleInternetEntireListingDisplayYN (1 options) | Display Entire Listing on Internet | InternetEntireListingDisplayYN |  | COT InternetEntireListingDisplayYN: bind (200/200 populated) |
| T1 Listing Info 1_2 | 1305 | name=saleInternetAddressDisplayYN (1 options) | Display Address on Internet | InternetAddressDisplayYN |  | COT InternetAddressDisplayYN: bind (0/200 populated) |
| T1 Listing Info 1_2 | 1319 | name=saleInternetConsumerCommentYN (1 options) | Allow Consumer Comments | InternetConsumerCommentYN |  | COT InternetConsumerCommentYN: bind (200/200 populated) |
| T1 Listing Info 1_2 | 1347 | #saleDescription | Listing Description * | PublicRemarks |  | COT PublicRemarks: bind (200/200 populated) |
| T1 Listing Info 1_2 | 1357 | #saleFairHousingAck | * I acknowledge that I have read and agree to the Fair Housing Complia |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_3 | 1455 | #saleListTeamName | Listing Team Name (RLS/RESO/IDX: ListTeamName) | ListTeamName |  | COT ListTeamName: bind (0/200 populated) |
| T1 Listing Info 1_3 | 1460 | #saleListTeamMlsId | Listing Team MLS ID (RLS/RESO/IDX: ListTeamMlsId) | ListTeamKey |  | COT ListTeamKey: bind (0/200 populated) |
| T1 Listing Info 1_3 | 1501 | #saleBuyerCompanySearch | REBNY Company |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_3 | 1502 | #saleBuyerCompany | REBNY Company |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_3 | 1511 | #saleBuyerAgentSearch | Agent/Broker Name |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_3 | 1512 | #saleBuyerAgent | Agent/Broker Name |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_3 | 1545 | #saleShowingInstructions | Showing Instructions | ShowingInstructions |  | COT ShowingInstructions: bind (0/200 populated) |
| T1 Listing Info 1_3 | 1557 | #saleBrokerComments | Broker To Broker Comments |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_4 | 1608 | #saleNewOHDate | Date * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_4 | 1614 | #saleNewOHStart | Start Time * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_4 | 1618 | #saleNewOHEnd | End Time * |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_4 | 1622 | #saleNewOHType | Type |  | Public | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T1 Listing Info 1_4 | 1632 | #saleNewOHNotes | Notes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T2 Unit Info 2_1 | 1677 | name=saleNumFloors (4 options) | Single Floor | StoriesTotal | Single | COT StoriesTotal: bind (200/200 populated) |
| T2 Unit Info 2_1 | 1698 | #saleTotalRooms | Total Rooms | RoomsTotal |  | COT RoomsTotal: bind (200/200 populated) |
| T2 Unit Info 2_1 | 1702 | #saleBedrooms | Bedrooms * | BedroomsTotal | 5 | COT BedroomsTotal: bind (200/200 populated) |
| T2 Unit Info 2_1 | 1706 | #saleFullBaths | Full Bathrooms * | BathroomsFull |  | COT BathroomsFull: bind (200/200 populated) |
| T2 Unit Info 2_1 | 1710 | #saleHalfBaths | Half Bathrooms * | BathroomsHalf | 1 | COT BathroomsHalf: bind (200/200 populated) |
| T2 Unit Info 2_1 | 1714 | #saleBathroomsTotal | Total Bathrooms * | BathroomsTotalInteger |  | COT BathroomsTotalInteger: bind (200/200 populated) |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Staff Bedrooms |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Staff Bathrooms |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 | 1733 | #saleInteriorSqFt | Approx Interior SqFt | LivingArea |  | COT LivingArea: bind (171/200 populated) |
| T2 Unit Info 2_1 | 1737 | #saleExteriorSqFt | Approx Exterior SqFt |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T2 Unit Info 2_1 |  | (anonymous input:text) | Ceiling Height |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 | 1753 | #saleOriginalRooms | Original Rooms |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T2 Unit Info 2_1 | 1757 | #saleFloorInBuilding | Floor in Building * | EntryLevel |  | COT EntryLevel: bind (193/200 populated) |
| T2 Unit Info 2_1 | 1762 | #saleLineInBuilding | Line in Building | UnitNumber |  | COT UnitNumber: bind (183/200 populated) |
| T2 Unit Info 2_1 | 1773 | name=saleGarageSpaces (2 options) | Yes | GarageSpaces | No | COT GarageSpaces: bind (122/200 populated) |
| T2 Unit Info 2_1 |  | (anonymous input:text) | Number of Garage Spaces |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 | 1790 | name=saleUnitType2 (2 options) | Residential |  | Residential | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Lot Size (SqFt) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Building Size (SqFt) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous select) | Zoning |  | Select Zoning | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | FAR (Floor Area Ratio) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Air Rights (SqFt) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Ceiling Height (ft) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Frontage (ft) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Cap Rate (%) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Net Operating Income (NOI) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Number of Units (Total) |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:number) | Number of Retail Units |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous select) | Lease Type |  | Select Type | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:text) | Minimum Lease Term |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:text) | Current Tenant |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 |  | (anonymous input:date) | Lease Expiration |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_1 | 1936 | name=saleCurrentUse (3 options) | Healthcare | CurrentUse |  | COT CurrentUse: bind (4/200 populated) |
| T2 Unit Info 2_1 | 1970 | name=saleLight (4 options) | Excellent |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T2 Unit Info 2_1 | 2005 | name=saleHasViews (2 options) | Yes | ViewYN | No | COT ViewYN: bind (177/200 populated) |
| T2 Unit Info 2_1 | 2032 | name=salePetsAllowed (7 options) | Yes (All Pets) | PetsAllowed |  | COT PetsAllowed: bind (200/200 populated) |
| T2 Unit Info 2_3 | 2231 | name=saleWasherDryerAllowed (2 options) | Yes | LaundryFeatures | No | COT LaundryFeatures: bind (200/200 populated) |
| T2 Unit Info 2_3 | 2261 | name=saleCoolingYN (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T2 Unit Info 2_3 | 2271 | name=saleCooling (25 options) | Central Air | Cooling |  | COT Cooling: bind (143/200 populated) |
| T2 Unit Info 2_3 | 2311 | name=saleHeatingYN (2 options) | Yes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T2 Unit Info 2_3 | 2321 | name=saleHeating (43 options) | Steam | Heating |  | COT Heating: bind (24/200 populated) |
| T2 Unit Info 2_3 | 2400 | name=fireplace (2 options) | Yes | InteriorFeatures | No | COT InteriorFeatures: bind (103/200 populated) |
| T2 Unit Info 2_3 |  | (anonymous input:number) | Decorative Fireplaces |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_3 |  | (anonymous input:number) | Gas Fireplaces |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_3 |  | (anonymous input:number) | Woodburning Fireplaces |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T2 Unit Info 2_3 |  | (anonymous textarea) | Exposed Brick |  |  | ANONYMOUS control (no id, no name): cannot be bound |
| T3 TH/Building 3_1 | 2465 | #saleTHStories | Stories (Property) * | Stories |  | COT Stories: bind (20/200 populated) |
| T3 TH/Building 3_1 | 2469 | #saleTHUnitsTotal | # Residential Units * | NumberOfUnitsTotal |  | COT NumberOfUnitsTotal: bind (200/200 populated) |
| T3 TH/Building 3_1 | 2473 | #saleTHProfUnits | # Professional Units |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2477 | #saleTHRetailUnits | # Retail Units |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2481 | #saleTHNumBuildings | # Buildings | NumberOfBuildings |  | COT NumberOfBuildings: bind (0/200 populated) |
| T3 TH/Building 3_1 | 2485 | #saleTHVacantUnits | # Vacant Units |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2489 | #saleTHCommercialYN | Commercial Units? | CommercialUnitsYN | Select | NOT IN COTALITY (ledger F3-005): hide for Cotality rows; Mallan key for Mallan rows |
| T3 TH/Building 3_1 | 2497 | #saleTHDevStatus | Development Status | DevelopmentStatus | Select | COT DevelopmentStatus: bind (1/200 populated) |
| T3 TH/Building 3_1 | 2522 | #saleTHLotSize | Lot Size * | LotSizeArea |  | COT LotSizeArea: bind (77/200 populated) |
| T3 TH/Building 3_1 | 2526 | #saleTHLotSizeUnits | Lot Size Units * | LotSizeUnits | Square Feet | COT LotSizeUnits: bind (77/200 populated) |
| T3 TH/Building 3_1 | 2534 | #saleTHLotDimensions | Lot Dimensions * | LotSizeDimensions |  | COT LotSizeDimensions: bind (77/200 populated) |
| T3 TH/Building 3_1 | 2538 | #saleTHLotSizeSource | Lot Size Source | LotSizeSource | Select | COT LotSizeSource: bind (0/200 populated) |
| T3 TH/Building 3_1 | 2556 | #saleTHLandmark | Landmark Status | LandmarkStatusYN | Select | NOT IN COTALITY (ledger F3-009): hide for Cotality rows; Mallan key for Mallan rows |
| T3 TH/Building 3_1 | 2564 | #saleTHLotFeatures | Lot Features | LotFeatures |  | COT LotFeatures: bind (1/200 populated) |
| T3 TH/Building 3_1 | 2597 | #saleTHBuildingArea | Building Area Total * | BuildingAreaTotal |  | COT BuildingAreaTotal: bind (39/200 populated) |
| T3 TH/Building 3_1 | 2601 | #saleTHBuildingAreaUnits | Building Area Units | BuildingAreaUnits | Square Feet | COT BuildingAreaUnits: bind (39/200 populated) |
| T3 TH/Building 3_1 | 2608 | #saleTHGrossSqFt | Gross Square Footage |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2612 | #saleTHNetSqFt | Net Square Footage |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2616 | #saleTHFoundationArea | Foundation Area | FoundationArea |  | COT FoundationArea: bind (1/200 populated) |
| T3 TH/Building 3_1 | 2620 | #saleTHFoundation | Foundation Details | FoundationDetails | Select | COT FoundationDetails: bind (0/200 populated) |
| T3 TH/Building 3_1 | 2638 | #saleTHBasementYN | Basement | BasementYN | Select | COT BasementYN: bind (155/200 populated) |
| T3 TH/Building 3_1 |  | (anonymous select) | Basement Type |  | Select | ANONYMOUS control (no id, no name): cannot be bound |
| T3 TH/Building 3_1 | 2658 | #saleTHLevels | Levels | Levels | Select | COT Levels: bind (29/200 populated) |
| T3 TH/Building 3_1 | 2676 | #saleTHZoning | Zoning Description | ZoningDescription |  | COT ZoningDescription: bind (87/200 populated) |
| T3 TH/Building 3_1 | 2680 | #saleTHOverFAR | Area Over FAR (sq ft) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2684 | #saleTHUnderFAR | Area Under FAR (sq ft) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2695 | #saleTHLandLeaseYN | Land Lease? | LandLeaseYN | Select | COT LandLeaseYN: bind (182/200 populated) |
| T3 TH/Building 3_1 | 2703 | #saleTHLandLeaseAmt | Land Lease Amount | LandLeaseAmount |  | COT LandLeaseAmount: bind (0/200 populated) |
| T3 TH/Building 3_1 | 2707 | #saleTHLandLeaseFreq | Frequency | LandLeaseAmountFrequency | Monthly | COT LandLeaseAmountFrequency: bind (0/200 populated) |
| T3 TH/Building 3_1 | 2724 | #saleTHLandLeaseExp | Expiration Date | LandLeaseExpirationDate |  | COT LandLeaseExpirationDate: bind (1/200 populated) |
| T3 TH/Building 3_1 | 2737 | #saleTHGarageYN | Garage? | GarageYN | Select | COT GarageYN: bind (200/200 populated) |
| T3 TH/Building 3_1 | 2745 | #saleTHGarageSpaces | Garage Spaces | GarageSpaces |  | COT GarageSpaces: bind (122/200 populated) |
| T3 TH/Building 3_1 | 2749 | #saleTHAttachedGarage | Attached? | AttachedGarageYN | Select | COT AttachedGarageYN: bind (58/200 populated) |
| T3 TH/Building 3_1 | 2757 | #saleTHOpenParkingYN | Open Parking? | OpenParkingYN | Select | COT OpenParkingYN: bind (1/200 populated) |
| T3 TH/Building 3_1 | 2765 | #saleTHOpenSpaces | Open Spaces |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_1 | 2769 | #saleTHParkingTotal | Total Parking | ParkingTotal |  | COT ParkingTotal: bind (0/200 populated) |
| T3 TH/Building 3_1 | 2779 | name=saleTHDocsAvailable (8 options) | Building Rules | DocumentsAvailable |  | COT DocumentsAvailable: bind (0/200 populated) |
| T3 TH/Building 3_2 | 2816 | #saleTHDescription |  | PublicRemarks |  | COT PublicRemarks: bind (200/200 populated) |
| T3 TH/Building 3_2 | 2833 | #saleTHLayout |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_2 | 2846 | #saleTHFinancing |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_2 | 2859 | #saleTHNotes |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2897 | #saleTHGrossIncomeM | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2898 | #saleTHGrossIncomeA | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2904 | #saleTHTaxM | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2905 | #saleTHTaxA | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2911 | #saleTHWaterM | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2912 | #saleTHWaterA | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2918 | #saleTHHeatM | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2919 | #saleTHHeatA | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2925 | #saleTHMaintM | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2926 | #saleTHMaintA | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2932 | #saleTHMgmtM | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2933 | #saleTHMgmtA | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2939 | #saleTHSuperM | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2940 | #saleTHSuperA | Gross Income |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2954 | #saleTHElectricM | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2955 | #saleTHElectricA | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2961 | #saleTHInsuranceM | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2962 | #saleTHInsuranceA | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2968 | #saleTHTrashM | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2969 | #saleTHTrashA | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2975 | #saleTHPestM | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2976 | #saleTHPestA | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2982 | #saleTHWorkCompM | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2983 | #saleTHWorkCompA | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2989 | #saleTHOtherM | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2990 | #saleTHOtherA | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 2995 | #saleTHOtherRemarks | Electric |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 3008 | #saleTHTotalExpM | Total Expenses |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 3009 | #saleTHTotalExpA | Total Expenses |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 3015 | #saleTHNetIncomeM | Total Expenses |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 3016 | #saleTHNetIncomeA | Total Expenses |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T3 TH/Building 3_3 | 3023 | #saleTHCapRate | Cap Rate (%) | CapRate |  | COT CapRate: bind (0/200 populated) |
| T5 Preview | 3439 | #saleCommuteAddress | Commute Calculator |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T6 History | 3483 | name=saleHistoryType (2 options) | Data Entry Listing/Unit Updates |  | listing | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| T7 Commission | 3535 | #commSaleRlsId | RLS / Listing ID |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3539 | #commSaleAddress | Full Property Address |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3543 | #commSaleBorough | Borough |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3547 | #commSaleListPrice | Listing Price |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3551 | #commSaleFinalPrice | Sale Price * |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3556 | #commSaleBedBath | Bedrooms / Bathrooms |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3560 | #commSaleSqFt | Approx. Sq Ft |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3571 | #commSaleSellerName | Seller Name * |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3575 | #commSaleSellerAttorney | Seller Attorney |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3579 | #commSaleBuyerName | Buyer Name * |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3583 | #commSaleBuyerEmail | Buyer Email * |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3587 | #commSaleBuyerPhone | Buyer Phone * |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3591 | #commSaleBuyerAttorney | Buyer Attorney |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3599 | #commSaleListingAgent | Listing Agent (Our Side) |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3603 | #commSaleCoListAgent | Co-Listing Agent |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3607 | #commSaleBuyerAgent | Buyer's Agent (Cooperating) |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3611 | #commSaleCoopBrokerage | Cooperating Brokerage |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3626 | #commSaleTotalPct | Total Commission % * |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3650 | #commSaleListingSidePct |  |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3658 | #commSaleCoopSidePct |  |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3673 | #commSaleAgentSplitPct | Agent Split % |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3704 | name=commSalePayMethod (2 options) | Check |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3717 | #commSaleClosingDate | Closing Date * |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| T7 Commission | 3722 | #commSaleNotes | Notes / Special Instructions |  |  | MALLAN-ONLY (commission): not a Cotality field; keep out of this viewer or read-only |
| Media modal | 3801 | #salePhotoInput | Video URL |  |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3830 | #saleVideoUrl | Video URL | VirtualTourURLBranded |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3835 | #saleVideoTourUrl | Video Tour URL | VirtualTourURLUnbranded |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3849 | #saleFloorplanInput | Video URL |  |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3859 | #saleMatterportUrl | Branded Tour URL (with broker branding) | VirtualTourURLUnbranded2 |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3864 | #saleVirtualTourUnbranded | Unbranded Tour URL (no watermark) | VirtualTourURLUnbranded |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3869 | #saleVirtualTourUnbranded2 | Unbranded Tour URL 2 | VirtualTourURLUnbranded2 |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3874 | #saleVirtualTourUnbranded3 | Unbranded Tour URL 3 | VirtualTourURLUnbranded3 |  | DELETE upload control; replace by read-only media panel (section 3) |
| Media modal | 3887 | #saleDocInput | Video URL |  |  | DELETE upload control; replace by read-only media panel (section 3) |
| Building modal | 3921 | #saleBldgAddressSearch | Quick Building Lookup |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_1 | 3970 | #saleBldgStreetAddress | Street Address * | StreetName |  | COT StreetName: bind (200/200 populated) |
| Building modal 1_1 | 3974 | #saleBldgName | Building Name | BuildingName |  | COT BuildingName: bind (99/200 populated) |
| Building modal 1_1 | 3978 | #saleBldgCity | City * | City | New York | COT City: bind (200/200 populated) |
| Building modal 1_1 | 3982 | #saleBldgState | State * | StateOrProvince | New York | COT StateOrProvince: bind (200/200 populated) |
| Building modal 1_1 | 3990 | #saleBldgZip | ZIP Code * | PostalCode |  | COT PostalCode: bind (200/200 populated) |
| Building modal 1_1 | 3994 | #saleBldgNeighborhood | Neighborhood * | SubdivisionName | Select Neighborhood | COT SubdivisionName: bind (200/200 populated) |
| Building modal 1_1 | 4051 | #saleBldgBorough | Borough * | CityRegion | Manhattan | COT CityRegion: bind (200/200 populated) |
| Building modal 1_1 | 4061 | #saleBldgCrossStreet1 | Cross Street 1 | CrossStreet |  | COT CrossStreet: bind (40/200 populated) |
| Building modal 1_1 | 4065 | #saleBldgCrossStreet2 | Cross Street 2 |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_1 | 4075 | #saleBldgSubwayLines | Nearest Subway Lines |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_1 | 4079 | #saleBldgSubwayStation | Nearest Subway Station |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_2 | 4096 | #saleBldgType | Building Type * | StructureType | Select Structure Type | COT StructureType: bind (174/200 populated) |
| Building modal 1_2 | 4118 | #saleBldgClass | Building Class |  | Select Class | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_2 | 4130 | #saleBldgYearBuilt | Year Built * | YearBuilt |  | COT YearBuilt: bind (200/200 populated) |
| Building modal 1_2 | 4134 | #saleBldgYearRenovated | Year Renovated |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_2 | 4138 | #saleBldgTotalFloors | Total Floors * | StoriesTotal |  | COT StoriesTotal: bind (200/200 populated) |
| Building modal 1_2 | 4142 | #saleBldgTotalUnits | Total Units * | NumberOfUnitsTotal |  | COT NumberOfUnitsTotal: bind (200/200 populated) |
| Building modal 1_2 | 4146 | #saleBldgResidentialUnits | Residential Units |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_2 | 4150 | #saleBldgCommercialUnits | Commercial Units |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_2 | 4154 | #saleBldgParkingSpaces | Total Parking Spaces | OpenParkingSpaces |  | COT OpenParkingSpaces: bind (0/200 populated) |
| Building modal 1_2 | 4163 | #saleBldgLandmark | Landmark Building | LandmarkStatusYN |  | NOT IN COTALITY (ledger F3-009): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_2 | 4166 | #saleBldgHistoric | Historic District | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_2 | 4169 | #saleBldgLEED | LEED Certified | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_2 | 4172 | #saleBldgNewConstruction | New Construction | NewConstructionYN |  | COT NewConstructionYN: bind (200/200 populated) |
| Building modal 1_2 | 4175 | #saleBldgNewDevelopment | New Development | NewConstructionYN |  | COT NewConstructionYN: bind (200/200 populated) |
| Building modal 1_2 | 4178 | #saleBldgConversion | Conversion | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_2 | 4181 | #saleBldgSponsorUnits | Has Sponsor Units | SponsorUnitYN |  | NOT IN COTALITY (ledger F3-012): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_3 | 4199 | name=saleAttendanceType (16 options) | Doorman (Full-Time) | AttendanceType |  | NOT IN COTALITY (ledger F3-001): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_3 | 4221 | #saleBldgElevator | Elevator | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4222 | #saleBldgLaundry | Laundry Room | LaundryFeatures |  | COT LaundryFeatures: bind (200/200 populated) |
| Building modal 1_3 | 4223 | #saleBldgGym | Gym/Fitness Center | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4224 | #saleBldgPool | Pool | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4225 | #saleBldgRoofDeck | Roof Deck | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4226 | #saleBldgCourtyard | Courtyard/Garden | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4227 | #saleBldgPlayroom | Children's Playroom | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4228 | #saleBldgLounge | Resident Lounge | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4229 | #saleBldgBusinessCenter | Business Center | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4230 | #saleBldgConferenceRoom | Conference Room | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4231 | #saleBldgBikeRoom | Bike Room | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4232 | #saleBldgStorage | Storage Available | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4233 | #saleBldgParking | Parking Garage | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4234 | #saleBldgValet | Valet Parking | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4235 | #saleBldgPackageRoom | Package Room | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4236 | #saleBldgColdStorage | Cold Storage | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4237 | #saleBldgLiveInSuper | Live-In Super | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4238 | #saleBldgOnSiteManager | On-Site Manager | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4239 | #saleBldgWheelchairAccess | Wheelchair Access | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4240 | #saleBldgSpa | Spa | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 1_3 | 4249 | #saleBldgFuelType | Fuel Type |  | Select | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_3 | 4258 | #saleBldgNumElevators | Number of Elevators | ElevatorsTotal |  | NOT IN COTALITY (ledger F3-006): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_3 | 4266 | name=saleBldgHeating (37 options) | Bldg Steam |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_3 | 4312 | name=saleBldgCooling (25 options) | Central Air |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_4 | 4354 | #saleBldgAssociationName | Association/Corp Name | AssociationName |  | COT AssociationName: bind (2/200 populated) |
| Building modal 1_4 | 4358 | #saleBldgTotalShares | Total Shares (Co-op) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_4 | 4362 | #saleBldgUnderlyingMortgage | Underlying Mortgage |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_4 | 4366 | #saleBldgCapitalReserves | Capital Reserves | CapitalReservesTotal |  | NOT IN COTALITY (ledger F3-003): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_4 | 4370 | #saleBldgCapitalReservesYN | Has Capital Reserves | CapitalReservesYN |  | NOT IN COTALITY (ledger F3-004): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_4 | 4382 | #saleBldgTaxBlock | Tax Block | TaxBlock |  | COT TaxBlock: bind (200/200 populated) |
| Building modal 1_4 | 4386 | #saleBldgTaxLot | Tax Lot | BuildingTaxLot |  | NOT IN COTALITY (ledger F3-002): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_4 | 4390 | #saleBldgAnnualTaxes | Annual RE Taxes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_4 | 4401 | #saleBldgTaxAbatementYN | Has Tax Abatement | TaxAbatementYN | Select | NOT IN COTALITY (ledger F3-014): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_4 | 4411 | #saleBldgTaxAbatementExpYear | Abatement Expiration Year |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 1_4 | 4415 | #saleBldgTaxAbatementComments | Abatement Comments | TaxAbatementComments |  | NOT IN COTALITY (ledger F3-013): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 1_4 | 4425 | name=saleBldgDocsAvailable (8 options) | Building Rules | DocumentsAvailable |  | COT DocumentsAvailable: bind (0/200 populated) |
| Building modal 1_5 | 4449 | #saleBldgDescription | Building Description | PublicRemarks |  | COT PublicRemarks: bind (200/200 populated) |
| Building modal 1_5 | 4454 | #saleBldgWebsite | Building Website |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_1 | 4481 | name=saleBuildingPetsAllowed (7 options) | Yes (All Pets) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_1 | 4492 | #saleBldgPetWeightLimit | Weight Limit (lbs) |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_1 | 4496 | #saleBldgPetNotes | Pet Policy Notes |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_1 | 4504 | #saleBldgWasherDryerAllowed | Washer/Dryer Allowed | LaundryFeatures |  | COT LaundryFeatures: bind (200/200 populated) |
| Building modal 2_1 | 4505 | #saleBldgPiedATerre | Pied-a-Terre Allowed |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_1 | 4506 | #saleBldgParentsAllowed | Parents Buying Allowed | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 2_1 | 4507 | #saleBldgCoBuyersAllowed | Co-Buyers Allowed | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 2_1 | 4508 | #saleBldgCorpOwnAllowed | Corp/LLC Purchase Allowed | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 2_1 | 4509 | #saleBldgGiftsAllowed | Gifts Allowed for Down Payment | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 2_2 | 4525 | #saleBldgSublettingAllowed | Subletting Allowed |  | Select | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_2 | 4535 | #saleBldgMaxSubletYears | Max Sublet Years |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_2 | 4539 | #saleBldgSubletFee | Sublet Fee |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_3 | 4557 | #saleBldgMaxFinancing | Max Financing Allowed | MaximumFinancingAmount |  | NOT IN COTALITY (ledger F3-010): hide for Cotality rows; Mallan key for Mallan rows |
| Building modal 2_3 | 4561 | #saleBldgMinDownPayment | Min Down Payment |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_3 | 4565 | #saleBldgDTIRatio | DTI Ratio Requirement |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_3 | 4569 | #saleBldgPostCloseLiquidity | Post-Close Liquidity |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 2_3 | 4577 | #saleBldgBoardApproval | Board Approval Required | BuildingFeatures |  | COT BuildingFeatures: bind (164/200 populated) |
| Building modal 2_3 | 4578 | #saleBldgBoardInterview | Board Interview Required |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4596 | #saleBldgMgmtCompany | Company Name |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4600 | #saleBldgMgmtPhone | Phone |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4604 | #saleBldgMgmtEmail | Email |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4608 | #saleBldgMgmtAddress | Address |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4619 | #saleBldgSuperName |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4620 | #saleBldgSuperPhone |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4621 | #saleBldgSuperEmail |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4627 | #saleBldgManagerName |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4628 | #saleBldgManagerPhone |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4629 | #saleBldgManagerEmail |  |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4640 | #saleBldgBoardPresident | Board President |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Building modal 3 | 4644 | #saleBldgBoardEmail | Board Contact Email |  |  | NO COTALITY MAPPING in markup: Mallan-only / old CRM form field; decide per row |
| Print modal | 4737 | #salePrintBranding | Include Mallan Branding Header/Footer |  | [x] | TOOL INPUT: keep |
| Print modal | 4738 | #salePrintLandscape | Landscape orientation |  |  | TOOL INPUT: keep |
| Email modal | 4761 | #saleEmailTo | To |  |  | TOOL INPUT: keep |
| Email modal | 4765 | #saleEmailCC | CC |  |  | TOOL INPUT: keep |
| Email modal | 4769 | #saleEmailSubject | Subject |  |  | TOOL INPUT: keep |
| Email modal | 4773 | #saleEmailMessage | Message |  |  | TOOL INPUT: keep |
| Calculator modal | 7706 | #saleCalcPrice | Purchase Price ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7707 | #saleCalcDown | Down Payment (%) |  | 20 | TOOL INPUT: keep |
| Calculator modal | 7708 | #saleCalcRate | Interest Rate (%) |  | 6.75 | TOOL INPUT: keep |
| Calculator modal | 7709 | #saleCalcTerm | Loan Term (years) |  | 30 years | TOOL INPUT: keep |
| Calculator modal | 7726 | #saleClosingPrice | Sale Price ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7740 | #saleCoCNOI | Annual Net Operating Income ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7741 | #saleCoCCash | Total Cash Invested ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7750 | #saleROIPrice | Purchase Price ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7751 | #saleROIAppreciation | Annual Appreciation (%) |  | 3 | TOOL INPUT: keep |
| Calculator modal | 7752 | #saleROIRent | Annual Rental Income ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7753 | #saleROIExpenses | Annual Expenses ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7754 | #saleROIYears | Hold Period (years) |  | 5 | TOOL INPUT: keep |
| Calculator modal | 7766 | #saleRvBRent | Monthly Rent ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7767 | #saleRvBRentInc | Annual Rent Increase (%) |  | 3 | TOOL INPUT: keep |
| Calculator modal | 7768 | #saleRvBPrice | Purchase Price ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7769 | #saleRvBOwn | Monthly Ownership Cost ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7770 | #saleRvBYears | Comparison Period (years) |  | 7 | TOOL INPUT: keep |
| Calculator modal | 7781 | #saleBvSValue | Current Value ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7782 | #saleBvSAppreciation | Annual Appreciation (%) |  | 3 | TOOL INPUT: keep |
| Calculator modal | 7783 | #saleBvSCarry | Monthly Carrying Cost ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7784 | #saleBvSProceeds | Estimated Sale Proceeds (net) ($) |  |  | TOOL INPUT: keep |
| Calculator modal | 7785 | #saleBvSYears | Hold Period (years) |  | 3 | TOOL INPUT: keep |
| T1 Listing Info 1_1 |  | CARD "Status & Pricing": 1 anonymous checkboxes | Also Available for Rent |  | (unchecked) | ANONYMOUS list: cannot be bound; replace by chips from the Cotality value list |
| T1 Listing Info 1_1 |  | CARD "Important Dates": 2 anonymous checkboxes | Send to RLS, Send to Website |  | (unchecked) | ANONYMOUS list: cannot be bound; replace by chips from the Cotality value list |
| T2 Unit Info 2_1 |  | CARD "Unit Type": 19 anonymous checkboxes | Alcove Studio, Floor Thru, Garden, Loft, Maisonette, Penthouse, ... | PropertySubType/UnitTypeType | (unchecked) | CHIPS from PropertySubType/UnitTypeType: 3/19 page labels exist as live Cotality lookup values; no match: Floor Thru, Garden, Maisonette, Private Floor, Drive-In Access, Loading Dock, Freight Elevator, Signage Rights, ... |
| T2 Unit Info 2_1 |  | CARD "Private Outdoor Space": 11 anonymous checkboxes | Balcony, Deck, Garden, Green House, Juliet Balcony, Patio, ... | PatioAndPorchFeatures/ExteriorFeatures | (unchecked) | CHIPS from PatioAndPorchFeatures/ExteriorFeatures: 9/11 page labels exist as live Cotality lookup values; no match: Private Roof Access, Roof Rights |
| T2 Unit Info 2_1 |  | CARD "Exposure": 8 anonymous checkboxes | North, South, East, West, Northeast, Northwest, ... | Exposures | (unchecked) | CHIPS from Exposures: 8/8 page labels exist as live Cotality lookup values; no match:  |
| T2 Unit Info 2_1 |  | CARD "Views": 12 anonymous checkboxes | Bridges, City, City Lights, Downtown, Garden, Panoramic, ... | View | (unchecked) | CHIPS from View: 10/12 page labels exist as live Cotality lookup values; no match: Rooftops/Sky, Streets |
| T2 Unit Info 2_2 |  | CARD "Additional Rooms": 15 anonymous checkboxes | Den/Office, Dressing Room, Exercise Room, Family Room, Foyer, Great Room, ... | RoomType | (unchecked) | CHIPS from RoomType: 12/15 page labels exist as live Cotality lookup values; no match: Dressing Room, Playroom, Safe Room |
| T2 Unit Info 2_2 |  | CARD "Kitchen Type": 9 anonymous checkboxes | Eat In, Galley, Open, Pass Through, Pullman, Second Kitchen, ... | InteriorFeatures/RoomType | (unchecked) | CHIPS from InteriorFeatures/RoomType: 4/9 page labels exist as live Cotality lookup values; no match: Galley, Pass Through, Pullman, Traditional, Windowed |
| T2 Unit Info 2_2 |  | CARD "Kitchen Features": 7 anonymous checkboxes | Center Island, Chef's, Dishwasher, Modern Kitchen, New Appliances, Pantry, ... | InteriorFeatures/Appliances | (unchecked) | CHIPS from InteriorFeatures/Appliances: 3/7 page labels exist as live Cotality lookup values; no match: Center Island, Chef's, Modern Kitchen, New Appliances |
| T2 Unit Info 2_2 |  | CARD "Dining": 6 anonymous checkboxes | Dining Alcove, Dining Area, Dining in Foyer, Dining in Living Room, Dining L, Formal Dining Room | RoomType/InteriorFeatures | (unchecked) | CHIPS from RoomType/InteriorFeatures: 4/6 page labels exist as live Cotality lookup values; no match: Dining Alcove, Dining L |
| T2 Unit Info 2_2 |  | CARD "Bathroom Features": 7 anonymous checkboxes | Bidet(s), Jacuzzi(s), Marble, En Suite(s), Sauna(s), Stall Shower(s), ... | InteriorFeatures/RoomType | (unchecked) | CHIPS from InteriorFeatures/RoomType: 2/7 page labels exist as live Cotality lookup values; no match: Bidet(s), Jacuzzi(s), Marble, En Suite(s), Stall Shower(s) |
| T2 Unit Info 2_3 |  | CARD "Feature Details": 3 anonymous checkboxes | Exposed Brick, Original Detail, Pre-War Charm | InteriorFeatures | (unchecked) | CHIPS from InteriorFeatures: 0/3 page labels exist as live Cotality lookup values; no match: Exposed Brick, Original Detail, Pre-War Charm |
| T2 Unit Info 2_3 |  | CARD "Windows": 20 anonymous checkboxes | Aluminum Frames, Bay Windows, Blinds, Display Windows, Double Pane, Drapes, ... | WindowFeatures | (unchecked) | CHIPS from WindowFeatures: 18/20 page labels exist as live Cotality lookup values; no match: Noise Reduction, Oversized |
| T2 Unit Info 2_3 |  | CARD "Ceilings": 2 anonymous checkboxes | Beamed Ceilings, High Ceilings | InteriorFeatures | (unchecked) | CHIPS from InteriorFeatures: 1/2 page labels exist as live Cotality lookup values; no match: Beamed Ceilings |
| T2 Unit Info 2_3 |  | CARD "Flooring": 5 anonymous checkboxes | Concrete, Hardwood, Herringbone, Marble, Parquet | Flooring | (unchecked) | CHIPS from Flooring: 4/5 page labels exist as live Cotality lookup values; no match: Herringbone |
| T2 Unit Info 2_3 |  | CARD "Storage": 5 anonymous checkboxes | Great Closet Space, Murphy Bed, Storage Loft, Storage Space, Walk In Closets | InteriorFeatures/RoomType | (unchecked) | CHIPS from InteriorFeatures/RoomType: 3/5 page labels exist as live Cotality lookup values; no match: Great Closet Space, Murphy Bed |
| T2 Unit Info 2_3 |  | CARD "Washer/Dryer": 9 anonymous checkboxes | Washer/Dryer Hookups, Washer/Dryer in Unit, Bosch, Gaggenau, LG, Maytag, ... | LaundryFeatures/Appliances | (unchecked) | CHIPS from LaundryFeatures/Appliances: 3/9 page labels exist as live Cotality lookup values; no match: Bosch, Gaggenau, LG, Maytag, Miele, Whirlpool |
| T2 Unit Info 2_3 |  | CARD "Fresh Air System": 3 anonymous checkboxes | VRF System, Purification & Humidification System, Vented from Outside | Cooling/Heating | (unchecked) | CHIPS from Cooling/Heating: 0/3 page labels exist as live Cotality lookup values; no match: VRF System, Purification & Humidification System, Vented from Outside |
| T2 Unit Info 2_3 |  | CARD "HVAC": 3 anonymous checkboxes | 4 Pipe Fan, Vertical Heat Pump, Split System | Cooling/Heating | (unchecked) | CHIPS from Cooling/Heating: 1/3 page labels exist as live Cotality lookup values; no match: 4 Pipe Fan, Split System |
| Print modal |  | CARD "": 13 anonymous checkboxes | Listing Type & Agent Info, Property Classification, Address & Location, Pricing & Financials, Room Layout & Dimensions, Interior Features & Condition, ... |  | (unchecked) | ANONYMOUS list: cannot be bound; replace by chips from the Cotality value list |

## Appendix B. Page vocabulary versus live Cotality values

| Control | Cotality field | Page values | Cotality values | Page values NOT in Cotality | Cotality values missing from page |
|---|---|---|---|---|---|
| select#saleStatus (data-rls-field says MlsStatus) | StandardStatus | 26 | 11 | Draft, Future, BackOnMarket, OfferOut, OfferThruUs, OfferAccepted, OAThruUs, ContractOut, COThruUs, ContractSigned, ContractSignedThruUs, BoardApproved, Sold, SoldThruUs, Cancelled, PermOffMarket, TempOffMarket | 2 |
| select#saleCommonInterest | CommonInterest | 8 | 12 | RentalBuilding | 5 |
| select#saleConcessions | Concessions | 3 | 3 | (none) | 0 |
| select#saleTHDevStatus | DevelopmentStatus | 12 | 19 | NeverBuilt, PartiallyBuilt | 9 |
| select#saleTHLotSizeUnits | LotSizeUnits | 2 | 4 | (none) | 2 |
| select#saleTHLotSizeSource | LotSizeSource | 12 | 15 | (none) | 3 |
| select#saleTHFoundation | FoundationDetails | 12 | 28 | (none) | 16 |
| select#saleTHBasementYN | BasementYN | 2 | 2 | Yes, No | 2 |
| select#saleTHLevels | Levels | 5 | 18 | (none) | 13 |
| select#saleBldgType | StructureType | 16 | 21 | Loft, WalkUp, Commercial | 8 |
| name=salePetsAllowed | PetsAllowed | 7 | 29 | UnitYes, UnitCatsOK, UnitDogsOK, UnitBreedRestrictions, UnitSizeLimit, UnitNumberLimit, UnitNo | 29 |
| name=saleCooling | Cooling | 25 | 40 | (none) | 15 |
| name=saleHeating | Heating | 43 | 100 | (none) | 57 |
| name=saleListingType | ListingAgreement | 7 | 11 | CoExclusive, InHouse, OwnerOptOut, ParticipantOnly | 8 |

## Appendix C. Live fields not persisted by the repo's mapper (REAL listing)

Real listing RLS20113389: 139 non-null live fields; 87 persisted by mapTrestleToPrisma + stripPrivateFields + slimRawData (columns, address, features or raw_data); 52 NOT persisted:

`HumanModifiedYN` `SourceSystemID` `StatusChangeTimestamp` `DocumentsCount` `OriginatingSystemListAgentMemberKey` `CoListAgentPreferredPhone` `OriginatingSystemListOfficeKey` `CountrySubdivision` `ListAgentKeyNumeric` `CoListAgentLastName` `OriginatingSystemCoListAgentMemberKey` `ListAgentFirstName` `OnMarketTimestamp` `CoListOfficeKeyNumeric` `PetsComments` `CoListAgentFirstName` `VideosCount` `StreetNumberNumeric` `CoListAgentKeyNumeric` `ListAgentPreferredPhone` `ListAgentMiddleName` `DocumentsChangeTimestamp` `ListingURL` `ListOfficeURL` `UniversalParcelId` `CoListAgentDirectPhone` `ContractStatusChangeDate` `RecordSignature` `PriceChangeTimestamp` `CoListOfficeKey` `ListAgentAOR` `PhotosChangeTimestamp` `ListOfficePhone` `OriginatingSystemCoListOfficeKey` `ListOfficeAOR` `StreetAdditionalInfo` `CoListAgentEmail` `OriginatingSystemSubName` `ListOfficeKeyNumeric` `CoListOfficeAOR` `ListAgentLastName` `OriginatingSystemModificationTimestamp` `CLIP` `CoListAgentKey` `CoListOfficeURL` `ListAgentNickname` `CoListAgentNickname` `OriginalEntryTimestamp` `VideosChangeTimestamp` `CoListOfficePhone` `CurrentPrice` `CoListAgentAOR`

Those the viewer needs and therefore must be added to RAW_DATA_KEEP_FIELDS (lib/compliance/raw-data-keep-fields.ts) or read live: `ListOfficePhone` `ListOfficeURL` `ListingURL` `PetsComments` `VideosCount` `DocumentsCount` `PriceChangeTimestamp` `StatusChangeTimestamp` `OnMarketTimestamp` `CoListAgentEmail` `CoListAgentDirectPhone` `CoListAgentPreferredPhone` `ListAgentPreferredPhone` `ListAgentAOR` `StreetAdditionalInfo` `OriginalEntryTimestamp` `CurrentPrice`.

## Appendix D. The 72 viewerSet* bindings and dead handlers

| # | Call | Target | Static markup | Fed by API mapper | Line |
|---|---|---|---|---|---|
| 1 | viewerSetVal | saleStatus | exists | yes (d.status) | 5041 |
| 2 | viewerSetRadio | saleListingType | exists | no (d.listingType) | 5042 |
| 3 | viewerSetVal | saleAddress | MISSING | yes (d.address) | 5045 |
| 4 | viewerSetVal | saleUnit | MISSING | yes (d.unit) | 5046 |
| 5 | viewerSetVal | saleCity | MISSING | yes (d.city) | 5047 |
| 6 | viewerSetVal | saleState | MISSING | yes (d.state) | 5048 |
| 7 | viewerSetVal | saleZipCode | exists | yes (d.zipCode) | 5049 |
| 8 | viewerSetVal | saleBorough | exists | yes (d.borough) | 5050 |
| 9 | viewerSetVal | saleNeighborhood | MISSING | yes (d.neighborhood) | 5051 |
| 10 | viewerSetVal | saleCrossStreet | MISSING | no (d.crossStreet) | 5052 |
| 11 | viewerSetRadio | salePropertyType | exists | yes (d.propertyType) | 5055 |
| 12 | viewerSetVal | salePrice | exists | yes (d.listPrice) | 5058 |
| 13 | viewerSetVal | saleMaintCC | exists | no (d.maintCC) | 5059 |
| 14 | viewerSetVal | saleRETaxes | exists | no (d.reTaxes) | 5060 |
| 15 | viewerSetVal | saleTotalMonthly | exists | no (d.totalMonthly) | 5061 |
| 16 | viewerSetVal | saleSqFt | MISSING | yes (d.sqft) | 5062 |
| 17 | viewerSetVal | salePricePerSqFt | MISSING | no (d.pricePerSqft) | 5063 |
| 18 | viewerSetVal | saleBedrooms | exists | yes (d.bedrooms) | 5066 |
| 19 | viewerSetVal | saleBathrooms | MISSING | no (d.bathrooms) | 5067 |
| 20 | viewerSetVal | saleHalfBaths | exists | yes (d.halfBaths) | 5068 |
| 21 | viewerSetVal | saleBathroomsFull | MISSING | no (d.bathroomsFull) | 5069 |
| 22 | viewerSetVal | saleBathroomsTotal | exists | no (d.bathroomsTotal) | 5070 |
| 23 | viewerSetVal | saleBedroomsTotal | MISSING | no (d.bedroomsTotal) | 5071 |
| 24 | viewerSetVal | saleRoomsTotal | MISSING | no (d.roomsTotal) | 5072 |
| 25 | viewerSetVal | salePropertySubType | MISSING | no (d.propertySubType) | 5075 |
| 26 | viewerSetVal | saleYearBuilt | MISSING | no (d.yearBuilt) | 5078 |
| 27 | viewerSetVal | saleTotalUnits | MISSING | no (d.totalUnits) | 5079 |
| 28 | viewerSetVal | saleStories | MISSING | no (d.stories) | 5080 |
| 29 | viewerSetVal | saleFloor | MISSING | no (d.floor) | 5081 |
| 30 | viewerSetVal | saleElevatorsTotal | MISSING | no (d.elevatorsTotal) | 5085 |
| 31 | viewerSetCheck | saleGarageYN | MISSING | no (d.garageYN) | 5086 |
| 32 | viewerSetCheck | saleNewConstructionYN | MISSING | no (d.newConstructionYN) | 5087 |
| 33 | viewerSetCheck | saleNewDevelopmentYN | MISSING | no (d.newDevelopmentYN) | 5088 |
| 34 | viewerSetVal | saleLaundryFeatures | MISSING | no (d.laundryFeatures) | 5089 |
| 35 | viewerSetVal | saleCommonInterest | exists | no (d.CommonInterest) | 5092 |
| 36 | viewerSetVal | saleDescription | exists | yes (d.description) | 5122 |
| 37 | viewerSetVal | saleListingAgentSearch | exists | yes (d.listingAgentName) | 5125 |
| 38 | viewerSetVal | saleListingAgentId | exists | no (d.listingAgentId) | 5126 |
| 39 | viewerSetVal | saleListingAgentPhone | exists | no (d.listingAgentPhone) | 5127 |
| 40 | viewerSetVal | saleListingAgentEmail | exists | no (d.listingAgentEmail) | 5128 |
| 41 | viewerSetVal | saleListingAgentLicense | exists | no (d.listingAgentLicense) | 5129 |
| 42 | viewerSetVal | saleCoBrokeAgreement | MISSING | no (d.coBrokeAgreement) | 5134 |
| 43 | viewerSetVal | saleConcessions | exists | no (d.concessions) | 5135 |
| 44 | viewerSetVal | saleListingAgreement | MISSING | no (d.listingAgreement) | 5136 |
| 45 | viewerSetVal | saleCreateDate | exists | no (d.createDate) | 5139 |
| 46 | viewerSetVal | saleLastUpdatedDate | exists | no (d.lastUpdated) | 5140 |
| 47 | viewerSetVal | saleOnMarketDate | MISSING | no (d.onMarketDate) | 5141 |
| 48 | viewerSetVal | saleExpirationDate | MISSING | no (d.expirationDate) | 5142 |
| 49 | viewerSetVal | saleStreetNumber | MISSING | no (d.streetNumber) | 5145 |
| 50 | viewerSetVal | saleStreetName | MISSING | no (d.streetName) | 5146 |
| 51 | viewerSetVal | saleCountyOrParish | MISSING | no (d.countyOrParish) | 5147 |
| 52 | viewerSetVal | salePostalCity | MISSING | no (d.postalCity) | 5148 |
| 53 | viewerSetVal | saleCityRegion | MISSING | no (d.cityRegion) | 5149 |
| 54 | viewerSetCheck | saleInternetEntireListingDisplayYN | exists | no (d.internetEntireListingDisplay) | 5152 |
| 55 | viewerSetCheck | saleInternetAddressDisplayYN | exists | no (d.internetAddressDisplayYN) | 5153 |
| 56 | viewerSetVal | saleListAgentMlsId | MISSING | no (d.listAgentMlsId) | 5156 |
| 57 | viewerSetCheck | saleVOWOptOutYN | exists | no (d.vowOptOut) | 5159 |
| 58 | viewerSetCheck | saleSyndicateYN | exists | no (d.syndicateYN) | 5160 |
| 59 | viewerSetCheck | saleDist_IDX | exists | no (d.distIDX) | 5161 |
| 60 | viewerSetCheck | saleDist_VOW | exists | no (d.internetDisplayYN !== false) | 5162 |
| 61 | viewerSetCheck | saleDist_Listhub | exists | no (d.distListhub) | 5163 |
| 62 | viewerSetCheck | saleDist_NYMLS | exists | no (d.distNYMLS) | 5164 |
| 63 | viewerSetCheck | saleDist_Realtor | exists | no (d.distRealtor) | 5165 |
| 64 | viewerSetCheck | saleDist_RPX | exists | no (d.distRPX) | 5166 |
| 65 | viewerSetCheck | saleDist_WWW | exists | no (d.distWWW) | 5167 |
| 66 | viewerSetCheck | saleDist_RLS | exists | no (d.distRLS) | 5168 |
| 67 | viewerSetVal | saleShowingInstructions | exists | no (d.showingInstructions) | 5171 |
| 68 | viewerSetVal | saleBrokerRemarks | MISSING | no (d.brokerRemarks) | 5172 |
| 69 | viewerSetVal | saleAddressDisplay | exists | yes (d.address) | 5175 |
| 70 | viewerSetVal | saleUnitDisplay | exists | yes (d.unit) | 5176 |
| 71 | viewerSetVal | saleListingIdDisplay | exists | yes (d.listingId) | 5177 |
| 72 | viewerSetVal | saleLastUpdated | exists | no (d.lastUpdated) | 5178 |

Inline handlers whose function is undefined at runtime (60 distinct handler functions in the markup): searchBuildingForListing (1 control), updateListingHeaderBar (2 controls), handleSaleListingTypeChange (7 controls), handleSaleComingSoon (1 control), updateSaleStatusFields (1 control), useSaleExclusiveAgentContact (1 control), printOpenHouseSignIn (1 control), addSaleOpenHouse (1 control), saveSaleOpenHouse (1 control), cancelSaleOpenHouse (1 control). FAIR_HOUSING_VIOLATIONS is referenced at line 5548 and defined nowhere.
