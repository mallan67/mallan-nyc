#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

type Severity = 'P0' | 'P1' | 'P2' | 'P3';
type SearchSystem = 'PUBLIC_SEARCH' | 'BACKEND_SEARCH';

type ErrorCatalogEntry = {
  code: string;
  category: string;
  layer: string;
  title: string;
  searchSystem?: SearchSystem;
};

export type SentinelLError = {
  code: string;
  category: string;
  severity: Severity;
  layer: string;
  file: string;
  line: number;
  actualFailure: string;
  'failing field/query/pattern': string;
  evidence: {
    detector: string;
    matchedSource: string;
  };
  impact: string;
  'required fix': string;
  'proof required': string;
  searchSystem?: SearchSystem;
};

type Rule = {
  code: string;
  severity: Severity;
  filePattern: RegExp;
  pattern: RegExp;
  failingPattern?: string;
  actualFailure: string;
  impact: string;
  requiredFix: string;
  proofRequired: string;
  lineHint?: RegExp;
  /** Negative evidence — if this regex matches within ±exclusionWindow
   *  lines of the primary pattern match, the rule is suppressed.
   *  Used to skip false positives where mitigation code lives next to the
   *  pattern (e.g. localStorage.setItem next to a DB-match removeItem). */
  excludeIfNear?: RegExp;
  /** Negative evidence — if this regex matches anywhere in the file, the
   *  rule is suppressed for that file. Used for whole-file guards like
   *  "this file is a TypeScript interface module, not runtime code." */
  excludeIfFilePresent?: RegExp;
  /** POSITIVE evidence — the rule only fires when this regex ALSO matches
   *  within ±requireNearWindow lines of the primary match. Used to require
   *  proof of a broken behavior (e.g. an edit/autosave context next to a
   *  localStorage write) rather than flagging the bare pattern. A finding
   *  is valid only if it has positive evidence of broken behavior. */
  requireNear?: RegExp;
  /** Window for requireNear (defaults to exclusionWindow, then ±20). */
  requireNearWindow?: number;
  /** Override default ±20-line exclusion window. */
  exclusionWindow?: number;
};

const HOT_PATHS = [
  'public/crm/SALE-FORM-REDESIGN.html',
  'public/crm/RENTAL-FORM-REDESIGN.html',
  'public/crm/SALE-FORM-WITH-TOOLS.html',
  'public/crm/RENTAL-FORM-WITH-TOOLS.html',
  'public/crm/js/dashboard/panels.js',
  'public/crm/js/manage/manage-listings.js',
  'public/crm/js/core/data-loader.js',
  'public/crm/js/core/api-client.js',
  'app/api/listings/route.ts',
  'app/api/listings/suggest/route.ts',
  'app/api/listings/[id]/route.ts',
  'app/api/buildings/search/route.ts',
  'app/api/crm/listings/route.ts',
  'app/api/crm/listings/[id]/route.ts',
  'app/api/crm/listings/[id]/status/route.ts',
  'app/api/crm/listings/[id]/media/upload/route.ts',
  'app/api/crm/listings/[id]/media-order/route.ts',
  'app/api/crm/agents/route.ts',
  'app/api/crm/companies/route.ts',
  'app/api/crm/contacts/route.ts',
  'app/api/crm/leads/route.ts',
  'app/api/crm/saved-searches/route.ts',
  'app/api/crm/saved-searches/[id]/route.ts',
  'app/api/email/**',
  'app/api/reports/**',
  'lib/email/**',
  'lib/reports/**',
  'lib/market-report/**',
  'lib/cma/**',
  'lib/search/**',
  'lib/idx/**',
  'lib/crm/**',
  'lib/media/**',
  'lib/compliance/**',
  'lib/address/**',
  'lib/listing-slug.ts',
  'lib/listing-canonical-url.ts',
  'app/listing/[...slug]/page.tsx',
  'app/listing/[id]/page.tsx',
  'app/sitemap.ts',
  'app/components/FeaturedListings.tsx',
  'app/components/SearchListingCard.tsx',
  'app/components/IDXImage.tsx',
] as const;

const SEARCH_SCOPE_MANDATE =
  'Public search and backend CRM search are separate systems. They may share registry fields and helpers, but they must not share visibility rules blindly. Public search is display-gated. Backend search is role-gated.';

const CATALOG: ErrorCatalogEntry[] = [
  ...range('S-REG', 1, 9, 'Registry / Cotality / IDX Plus', 'Registry / provider selection'),
  ...range('S-BE', 1, 10, 'Backend/API structure', 'Backend API routes'),
  ...range('S-DB', 1, 10, 'Database persistence / reload', 'Database persistence and reload'),
  ...range('S-SALE', 1, 14, 'Sales form', 'Sales form'),
  ...range('S-RENT', 1, 12, 'Rental form', 'Rental form'),
  ...range('S-CRM', 1, 11, 'CRM dashboard / My Listings', 'CRM dashboard / My Listings'),
  ...range('S-LEAD', 1, 10, 'Lead/contact pipeline', 'CRM lead/contact pipeline'),
  ...range('S-AGENT', 1, 9, 'Agent / office / company lookup', 'Agent / office / company lookup'),
  ...range('S-PUBSEARCH', 1, 13, 'Public listing search', 'Public search', 'PUBLIC_SEARCH'),
  ...range('S-BACKSEARCH', 1, 18, 'Agent/Broker Backend Search', 'Backend CRM search', 'BACKEND_SEARCH'),
  ...range('S-SUGGEST', 1, 8, 'Suggest/autocomplete', 'Suggest/autocomplete', 'PUBLIC_SEARCH'),
  ...range('S-BUILDING', 1, 8, 'Building/address search', 'Building/address search'),
  ...range('S-SAVED', 1, 12, 'Saved searches', 'Saved searches', 'BACKEND_SEARCH'),
  ...range('S-EMAIL', 1, 9, 'Listing emails / alerts', 'Listing alerts/emails'),
  ...range('S-REPORT', 1, 10, 'Reports / CMA / market reports', 'Reports / CMA / market reports'),
  ...range('S-MEDIA', 1, 9, 'Media / photos / floorplans / videos', 'Media/photo/floorplan/video handling'),
  ...range('S-URL', 1, 9, 'Canonical URLs / sitemap / metadata', 'Canonical URLs / sitemap / metadata'),
  ...range('S-COMP', 1, 10, 'Display gates / compliance / privacy', 'Status/display/compliance gates'),
];

const RULES: Rule[] = [
  {
    code: 'S-RENT-001',
    severity: 'P0',
    filePattern: /public\/crm\/RENTAL-FORM-REDESIGN\.html$/,
    pattern: /window\.location\.href\s*=\s*['"]\/crm\/login\.html;/,
    failingPattern: "Malformed redirect: window.location.href = '/crm/login.html;",
    actualFailure: 'Rental form contains an unterminated /crm/login.html redirect string, so the page can fail before any rental workflow code runs.',
    impact: 'Rental form JavaScript can fail to parse, blocking rental create/edit workflows before validation or persistence can run.',
    requiredFix: 'Fix the malformed redirect string and verify /crm/rental-listing loads without console syntax errors.',
    proofRequired: '/crm/rental-listing browser load with zero syntax errors plus crm:test rental form case.',
  },
  {
    code: 'S-SALE-006',
    severity: 'P0',
    filePattern: /public\/crm\/SALE-FORM-REDESIGN\.html$/,
    // Tightened (2026-05-28): the prior pattern matched the empty HTML
    // attribute `value=""` next to a `data-rls-field="StreetDirPrefix"`
    // hidden-input declaration (a default value, not address logic). Now
    // requires an actual JS clear/delete of the prefix atom, or a
    // splitAddress/parseAddress branch that drops a spelled-out direction.
    pattern: /delete\s+[\w.[\]'"]*(?:StreetDirPrefix|streetDirPrefix)\b|(?:StreetDirPrefix|streetDirPrefix)['"]?\s*[:=]\s*(?:''|""|null|undefined)|(?:splitAddress|parseAddress)[\s\S]{0,220}\b(?:East|West|North|South)\b[\s\S]{0,220}(?:drop|omit|ignore)/i,
    failingPattern: 'Sale address parsing/serialization can drop StreetDirPrefix.',
    actualFailure: 'Sale form address logic has a direction-adjacent branch that can clear, omit, or ignore StreetDirPrefix instead of preserving it as its own atom.',
    impact: 'Sale listings can lose the E/W/N/S direction atom, causing RealPlus URLs, search, dashboard matching, and edit reloads to target the wrong address.',
    requiredFix: 'Normalize and persist StreetDirPrefix as a first-class address atom in sale serialization, reload, and URL building.',
    proofRequired: '333 E 46th St and 333 East 46th Street sale roundtrip both produce /listing/333-e-46th-st-new-york-ny-10017.',
  },
  {
    code: 'S-RENT-005',
    severity: 'P1',
    filePattern: /public\/crm\/RENTAL-FORM-REDESIGN\.html$/,
    // Tightened (2026-05-28): the prior pattern fired on the SAFE
    // canonical-first precedence `addr.StreetDirPrefix || raw.StreetDirPrefix
    // || ''`. The real lossy shape is raw_data PREFERRED over canonical, or
    // a setVal that reads only raw_data for the direction/street atom.
    pattern: /(?:raw|raw_data|rawData)\.(?:StreetDirPrefix|streetDirPrefix|StreetName|streetName)\s*\|\|\s*(?:addr|address|canonical)\b|setVal\(\s*['"]rental(?:StreetDirPrefix|StreetName)['"]\s*,\s*(?:raw|raw_data|rawData)\.[\w]+\s*\)/,
    failingPattern: 'Rental reload prefers lossy raw_data address values over canonical.',
    actualFailure: 'Rental edit reload reads mixed raw_data and canonical address fields around StreetDirPrefix/StreetName, which can repopulate a saved rental with lossy address values.',
    impact: 'Rental edit reload can prefer lossy canonical values or mixed raw_data keys, then repopulate the form with a different address than was saved.',
    requiredFix: 'Use the same canonical address normalizer and value precedence as the sale form, preserving CRM raw keys only as compatibility aliases.',
    proofRequired: 'Rental edit roundtrip preserves StreetDirPrefix, UnitNumber, city, state, and postal code without creating a browser draft.',
  },
  {
    code: 'S-BE-006',
    severity: 'P0',
    filePattern: /app\/api\/crm\/listings\/(?:route|\[id\]\/status)\.ts$/,
    // Inspects SUCCESSFUL create/update/publish responses only: the object
    // must carry listing_id + publicUrl + realPlusUrl (the success contract
    // markers). 404, validation-error, and exception responses return
    // `{ error: ... }` and never reach this shape, so they are not matched.
    pattern: /return\s+NextResponse\.json\(\s*\{[\s\S]{0,300}listing_id[\s\S]{0,600}publicUrl[\s\S]{0,240}realPlusUrl(?![\s\S]{0,900}(?:featuredEligible|exclusiveEligible|eligibilityReason))/,
    failingPattern: 'Successful CRM listing response missing URL/eligibility contract.',
    actualFailure: 'CRM submit/publish can report success without returning the URL and eligibility contract the form/dashboard needs (featuredEligible, exclusiveEligible, eligibilityReason are omitted alongside publicUrl/realPlusUrl).',
    impact: 'CRM create/update/publish can report success without returning the public URL, RealPlus URL, listing_id/status, or featured/exclusive eligibility contract.',
    requiredFix: 'Return listing_id, status, publicUrl, realPlusUrl, featuredEligible, exclusiveEligible, and eligibilityReason from successful submit/publish paths.',
    proofRequired: 'Sale and rental submit tests assert the response contract and UI shows Copy/Open URL actions only after publish succeeds.',
  },
  {
    code: 'S-BE-005',
    severity: 'P0',
    filePattern: /app\/api\/crm\/listings\/\[id\]\/status\/route\.ts$/,
    pattern: /dualWriteProjectionForListingId[\s\S]{0,700}catch[\s\S]{0,380}swallow[\s\S]{0,1400}return\s+NextResponse\.json/,
    failingPattern: 'Status endpoint swallows projection dual-write failure before returning publish success.',
    actualFailure: 'Status endpoint catches and swallows listing_search_projection dual-write failure, then still returns success with publicUrl/realPlusUrl.',
    impact: 'Submit can report publish success while public search, Featured, exclusives, or alerts still cannot find the newly Active listing.',
    requiredFix: 'Treat projection update failure as a publish failure or return an explicit partial-success response that preserves Draft/visibility expectations.',
    proofRequired: 'Status endpoint regression where projection dual-write failure does not produce publish success and UI says "Saved as Draft, Publish failed: ...".',
  },
  {
    code: 'S-DB-010',
    severity: 'P0',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    pattern: /fetch\(['"]\/api\/crm\/listings['"][\s\S]{0,420}method:\s*['"]POST['"][\s\S]{0,1000}(?:edit|existing|listingId|currentListing)/i,
    failingPattern: 'Edit-mode listing save path contains POST to /api/crm/listings.',
    actualFailure: 'Form code contains POST /api/crm/listings near edit/current-listing state, which is the duplicate-listing failure class on edit.',
    impact: 'Existing listing edit can POST a duplicate row instead of PATCHing the saved listing.',
    requiredFix: 'Route all existing-listing saves through PATCH /api/crm/listings/{id}; reserve POST for unsaved new listings only.',
    proofRequired: 'Sale and rental edit-mode tests assert zero POST calls and one PATCH call.',
  },
  {
    code: 'S-DB-008',
    severity: 'P0',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html|public\/crm\/js\/dashboard\/panels\.js$/,
    // Tightened (2026-05-28): only flag localStorage WRITES (setItem) of
    // draft data, AND require absence of nearby mitigation evidence.
    // Prior pattern flagged:
    //   - The DB-match suppression block itself (panels.js, where the
    //     localStorage.getItem is followed by removeItem when match found)
    //   - Offline fallback paths that only run when MallanAPI is unreachable
    pattern: /localStorage\.setItem\(\s*['"](?:mallan_draft_sale|rentalListingDraft|saleListings|crmDraft|mallan_draft_rental)['"]/,
    // POSITIVE evidence: the write must sit in an edit/autosave context (an
    // edit-mode flag, a persisted DB id, or an autosave routine). A brand-new
    // unsaved-draft write (no DB id, no edit flag) is NOT a shadow/overwrite
    // risk and must not be flagged.
    requireNear: /_saleEditMode|_rentalEditMode|_saleEditDbId|_rentalEditDbId|editMode|editId|isEditing|existingId|currentListingId|autosave|autoSave|listingId/i,
    requireNearWindow: 15,
    // NEGATIVE evidence: skip when the DB-id edit guard is present, when it is
    // an offline fallback (server unreachable), or when a DB-match suppression
    // (removeItem on a real match) lives next to the write.
    excludeIfNear: /(?:_saleEditMode\s*&&\s*_saleEditDbId|_rentalEditMode\s*&&\s*_rentalEditDbId|typeof\s+MallanAPI\s*===\s*['"]undefined|!\s*MallanAPI|MallanAPI\.isReady\s*===\s*false|_dbHasMatch|_ldDbMatch|removeItem\s*\(\s*['"](?:mallan_draft_sale|rentalListingDraft|saleListings)|Offline\s*[—-]|offline fallback|fallback to localStorage)/i,
    exclusionWindow: 15,
    failingPattern: 'Browser localStorage draft write in an edit/autosave path without a DB-id guard.',
    actualFailure: 'Browser draft storage can shadow or overwrite a real DB listing during edit mode, causing phantom drafts or stale values.',
    impact: 'Browser drafts can override, duplicate, or visually shadow real database listings in edit mode and My Listings.',
    requiredFix: 'Limit localStorage fallback to unsaved new listings and suppress/delete matching browser drafts after DB save or Active publish.',
    proofRequired: 'No phantom draft after Active publish; dashboard count excludes stale browser drafts beside DB listings.',
  },
  {
    code: 'S-AGENT-006',
    severity: 'P0',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    // Tightened (2026-05-28): require the field to be the LEFT side of an
    // assignment (write), not a comment or read. The prior pattern matched
    // a comment that mentioned "session-populated" near a write 8 lines
    // later, even though the write was already guarded.
    pattern: /(?:ListAgentMlsId|saleListingAgent|rentalListingAgent)\s*=\s*(?:saleUpdatingAgent|rentalUpdatingAgent|currentUser|loggedInAgent|sessionAgent|u\.id|user\.id)/,
    // Skip when the empty-check guard from PR #261 lives nearby.
    excludeIfNear: /if\s*\(\s*existingAgent\s*&&\s*existingAgent\.value\s*\)\s*return|if\s*\(\s*!listingAgentEl\s*\|\|\s*!listingAgentEl\.value\s*\)/,
    exclusionWindow: 30,
    failingPattern: 'Logged-in agent fallback overwrites listing-agent field without guard.',
    actualFailure: 'Listing can appear to have an agent in the UI while missing stable agent/office IDs, breaking attribution and validation: a logged-in/session agent is written into the listing-agent field without an empty-check guard.',
    impact: 'Saved listing agent can be overwritten by the logged-in user during edit reload/autosave.',
    requiredFix: 'Preserve saved listing agent fields on edit and require an explicit visible Validate Agent action before submit.',
    proofRequired: 'Edit-mode test preserves ListAgentMlsId, ListAgentFullName, ListAgentEmail, ListAgentDirectPhone, ListOfficeName, ListOfficeMlsId, and ListOfficeKey.',
  },
  {
    code: 'S-MEDIA-004',
    severity: 'P0',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    // Tightened (2026-05-28): the prior pattern matched `removeServerMedia`
    // (a DELETE-button handler) because `serverMedia` lacked a word boundary,
    // and "upload" appeared elsewhere within 900 chars. Now requires the
    // existing-media collection as a standalone identifier feeding an actual
    // upload verb (FormData.append / a POST to media/upload).
    pattern: /\b(?:existingMedia|serverMedia)\b[\s\S]{0,400}(?:new\s+FormData|\.append\(|fetch\([^)]*media\/upload|method:\s*['"]POST['"][\s\S]{0,160}media\/upload)/,
    failingPattern: 'Existing/server media collection feeds a FormData/upload path.',
    actualFailure: 'Existing server media appears in a FormData/upload path, which can re-upload already-saved media as new pending media.',
    impact: 'Existing server media can be treated as new pending media and uploaded again, creating duplicate photos after edit/save.',
    requiredFix: 'Separate existing server media from new pending uploads and only upload files/blobs that do not already have a stable server key or canonical URL.',
    proofRequired: 'Media edit roundtrip test: existing photos are not re-uploaded; delete/reorder persists.',
  },
  {
    code: 'S-MEDIA-005',
    severity: 'P0',
    filePattern: /app\/api\/crm\/listings\/\[id\]\/media\/upload\/route\.ts|public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    pattern: /type:\s*['"]photo['"][\s\S]{0,900}(?:floor\s*plan|floorplan|video)|(?:floor\s*plan|floorplan|video)[\s\S]{0,900}type:\s*['"]photo['"]/i,
    failingPattern: 'Floorplan/video path can be persisted or treated as media type photo.',
    actualFailure: 'A floorplan/video-adjacent media path stores or treats media as type photo, allowing non-photo media to become preferred/hero image.',
    impact: 'Floorplans or videos can be stored as photos and become the hero/preferred image.',
    requiredFix: 'Persist media kind explicitly (photo/floorplan/video) and filter hero selection to photo media only.',
    proofRequired: 'Preferred photo first test plus floorplan/video cannot become hero photo.',
  },
  {
    code: 'S-PUBSEARCH-001',
    severity: 'P0',
    filePattern: /(?:app\/api\/listings|lib\/search|app\/components\/SearchListingCard|app\/listing)/,
    // Tightened (2026-05-28): the prior pattern matched any `replace`/`split`
    // near a stray single letter E/W/N/S and any quote/`filter` word, so it
    // fired on OData escaping (`replace(/'/g, "''")`), map-bounds destructuring
    // (`[south, west, north, east] = boundsParam.split(',')`), price/whitespace
    // normalization, title-casing, and regex escaping — 10 false positives,
    // zero real bugs. Now requires the StreetDirPrefix atom to be explicitly
    // cleared/deleted, or a `.replace()` whose REGEX literal strips a
    // spelled-out direction word to an empty string.
    pattern: /delete\s+[\w.[\]'"]*(?:StreetDirPrefix|streetDirPrefix)\b|(?:StreetDirPrefix|streetDirPrefix)\s*[:=]\s*(?:''|""|null|undefined)|\.replace\(\s*\/[^/\n]*\b(?:East|West|North|South)\b[^/\n]*\/[gimsuy]*\s*,\s*(?:''|""|' '|" ")\s*\)/,
    failingPattern: 'Public search/address normalization explicitly clears or strips the StreetDirPrefix direction atom.',
    actualFailure: 'Public search normalization clears or strips the StreetDirPrefix direction atom, the exact failure class that loses the E in 333 E 46th St.',
    impact: 'Public search can drop StreetDirPrefix, so 333 E 46th St may fail or match the wrong address.',
    requiredFix: 'Search by structured address atoms and keep StreetDirPrefix in normalization, matching, and canonical URL generation.',
    proofRequired: '/api/listings?type=sale&address=333%20E%2046th%20St returns the sale listing; 333 East 46th Street resolves to the same canonical URL.',
  },
  {
    code: 'S-PUBSEARCH-008',
    severity: 'P0',
    filePattern: /app\/api\/listings|lib\/search|app\/components\/SearchListingCard|app\/components\/FeaturedListings/,
    pattern: /\/listing\/\$\{?(?:id|listingId|ListingId|listing\.id|listing_id)\}?|href:\s*['"`]\/listing\/\$\{/,
    failingPattern: 'Public listing link can use ID-only or non-canonical /listing/${id}.',
    actualFailure: 'Public listing link construction can emit /listing/{id} or another non-canonical listing URL instead of the address-based canonical URL.',
    impact: 'Public search/card/featured output can link to an ID-only or non-canonical listing URL for address-displayable listings.',
    requiredFix: 'Use the canonical listing URL builder everywhere public listings are linked.',
    proofRequired: 'Search card, featured/exclusives, email/report, sitemap, and detail canonical URLs all match buildCanonicalListingPath().',
  },
  {
    code: 'S-BACKSEARCH-009',
    severity: 'P0',
    filePattern: /app\/api\/crm\/listings|public\/crm\/js\/dashboard|public\/crm\/js\/manage/,
    // Tightened (2026-05-28): only flag display-gate fields appearing AS A
    // KEY inside a Prisma `where:` clause OR a search-filter callback. The
    // prior pattern matched bare field-name appearances within 500 chars of
    // any "where" or "filter" word, producing false positives on:
    //   - input to computeGateColumns({ internetEntireListingDisplayYN: ... })
    //   - compliance violation counters like `if (l.OwnerOptOut) violations++`
    //   - comments mentioning display gates
    // Now requires `where: { ... fieldName:` shape, the actual filter
    // signature where misuse would hide CRM records from authorized brokers.
    // The tempered `(?!\bselect\b|\}...)` stops the scan at the end of the
    // where object or the start of a `select:` clause, so a display-gate
    // column that merely appears in `select: { ... }` (a returned column,
    // not a filter) is NOT matched. That was the route.ts:474 false positive.
    pattern: /where\s*:\s*\{(?:(?!\bselect\b|\}\s*[,)])[\s\S]){0,300}(?:internet_entire_listing_display_yn|internet_address_display_yn|InternetEntireListingDisplayYN|InternetAddressDisplayYN|owner_opt_out|OwnerOptOut|participant_only|ParticipantOnly|InHouseInternal)\s*:/,
    failingPattern: 'Backend/CRM search query filters on a public display-gate column.',
    actualFailure: 'Backend/CRM search is using public display gates as broker access gates, so authorized users may not find internal/draft/listing records.',
    impact: 'Backend/CRM search may reuse public display gates as access gates, hiding drafts/internal listings from authorized brokers.',
    requiredFix: 'Separate role-gated backend visibility from public display-gated search visibility.',
    proofRequired: 'Broker/admin can find office/internal drafts while public search still suppresses display-blocked listings.',
  },
  {
    code: 'S-BACKSEARCH-012',
    severity: 'P0',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html|app\/api\/crm\/agents\/route\.ts/,
    // Tightened (2026-05-28): require an actual assignment where the hidden
    // agent ID receives an explicit empty/null/undefined fallback (the real
    // bug shape). Prior pattern matched a bare `var _agentId, ...` declaration
    // because "ListAgentMlsId" appeared 1 line above and `''` appeared later.
    pattern: /(?:saleListingAgent|rentalListingAgent|ListAgentMlsId)\s*=\s*(?:agentInfo\.ListAgentMlsId|raw\.ListAgentMlsId)\s*\|\|\s*['"]\s*['"]/,
    failingPattern: 'Hidden agent ID assigned with empty-string fallback (visible selection can pass while hidden identity fails).',
    actualFailure: 'Listing can appear to have an agent in the UI while missing stable agent/office IDs, breaking attribution and validation: the hidden ID is assigned `agentInfo.ListAgentMlsId || ""`, so the visible name can fill while the stable ID stays empty.',
    impact: 'Agent can appear selected in the UI while the hidden stable ID remains empty, breaking submit validation and attribution.',
    requiredFix: 'Require visible Validate Agent action to populate and persist stable agent and office IDs before publish; remove silent empty-string fallback.',
    proofRequired: 'Agent validation persistence test blocks submit with missing hidden IDs and passes after explicit validation.',
  },
  {
    code: 'S-BUILDING-005',
    severity: 'P0',
    filePattern: /app\/api\/buildings\/search\/route\.ts/,
    pattern: /display(?:Address|Label)[\s\S]{0,700}(?![\s\S]{0,700}(?:StreetDirPrefix|streetDirPrefix|PostalCode|postalCode))/,
    failingPattern: 'Building result display label lacks nearby structured direction/postal atoms.',
    actualFailure: 'Building search result constructs a display address/label without nearby structured StreetDirPrefix and PostalCode evidence.',
    impact: 'Building search can return a display label without structured address atoms, causing selected buildings to save malformed CRM addresses.',
    requiredFix: 'Return structured StreetNumber, StreetDirPrefix, StreetName, StreetSuffix, UnitNumber, City, StateOrProvince, and PostalCode.',
    proofRequired: '333 E 46th St building search result includes direction, postal code, and preserves user-entered unit.',
  },
  {
    code: 'S-SAVED-012',
    severity: 'P1',
    filePattern: /app\/api\/crm\/saved-searches|lib\/email|app\/api\/email/,
    // Tightened (2026-05-28): the prior pattern fired on any savedSearch CRUD
    // route or `type SavedSearchCountStatus` declaration that merely mentioned
    // "listing"/"email" within 900 chars. Now requires an actual alert/email
    // SEND of saved-search listings, AND no public display-gate evidence
    // nearby. GET/DELETE-by-id and type declarations no longer match.
    pattern: /savedSearch[\s\S]{0,600}(?:sendEmail|sendAlert|sendListingAlert|mailer\.|deliverAlert|notifySavedSearch)[\s\S]{0,400}listing(?![\s\S]{0,900}(?:InternetEntireListingDisplayYN|isPubliclyDisplayable|display.?gate|displayable))/i,
    failingPattern: 'Saved-search alert SEND path lacks public display-gate evidence.',
    actualFailure: 'Saved-search alert path sends listing emails without nearby public display-gate evidence, risking display-blocked listings in alerts.',
    impact: 'Saved search alerts may include display-blocked listings or use different public filters than the original search.',
    requiredFix: 'Run saved-search alerts through the public display-gated listing query and canonical URL builder.',
    proofRequired: 'Saved-search alert test excludes internal/display-blocked listings and sends canonical URLs.',
  },
  {
    code: 'S-URL-001',
    severity: 'P0',
    filePattern: /lib\/listing-slug\.ts|lib\/listing-canonical-url\.ts|app\/sitemap\.ts|app\/listing/,
    // Tightened (2026-05-28): the prior `slug.*id` / bare `/listing/{id}`
    // pattern matched import lines (`extractListingIdFromSlug`) and prose
    // comments describing the canonical shape. This repo's canonical URL
    // INTENTIONALLY includes a listing-id suffix after the address slug, so
    // an id suffix is not itself a bug. Now flags only an id-ONLY URL emitted
    // as a real string/template value: `'/listing/' + id` or `/listing/${id}`
    // with no address segment. Quote/backtick delimiters keep comments and
    // imports (which lack `'/listing/' +` or a quoted `/listing/${id}`) out.
    pattern: /[`'"]\/listing\/\$\{\s*(?:id|listingId|listing_id|listing\.id|l\.id|row\.id)\s*\}[`'"\/]|['"]\/listing\/['"]\s*\+\s*(?:id|listingId|listing_id|listing\.id|l\.id)\b/,
    failingPattern: 'Canonical URL path emits an id-only /listing/{id} value with no address segment.',
    actualFailure: 'Canonical URL code emits an id-only /listing/{id} value (no address slug) for an address-displayable listing, instead of the address-based canonical URL.',
    impact: 'Address-displayable listings can use /listing/{id} or hybrid address-id URLs as canonical, blocking RealPlus address-based handoff.',
    requiredFix: 'Use address-based canonical URLs when InternetAddressDisplayYN=true; ID-only fallback only when the address is legally suppressed.',
    proofRequired: 'Canonical URL for 333 E 46th St is https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny-10017.',
  },
  {
    code: 'S-COMP-001',
    severity: 'P0',
    filePattern: /lib\/listing-slug\.ts|lib\/listing-canonical-url\.ts|app\/api\/listings|app\/listing/,
    // Tightened (2026-05-28): only flag a REAL public address leak — a
    // `/listing/` URL (or page metadata) built DIRECTLY from raw address
    // atoms, with no address-display gate guard nearby. The prior pattern
    // keyed off the bare token `InternetAddressDisplayYN`, so it flagged
    // TypeScript interfaces, prose comments, and already-guarded reads.
    // Now the positive evidence is the address-slug emission itself; the
    // excludeIfNear guards suppress when affirmPermission(...), an
    // `InternetAddressDisplayYN === false` short-circuit, isAddressDisplayable,
    // or the gated canonical builder lives within ±15 lines.
    pattern: /['"]\/listing\/['"]\s*\+\s*(?:addressSlug|addrSlug|slug)\b|`\/listing\/\$\{\s*(?:addressSlug|addrSlug|slug)\s*\}|(?:canonicalUrl|canonical|ogUrl|metaTitle|metaDescription)\s*[:=][\s\S]{0,80}\b(?:addressSlug|StreetName|UnparsedAddress|unparsedAddress)\b/,
    excludeIfNear: /affirmPermission\s*\(|InternetAddressDisplayYN\s*===\s*false|internetAddressDisplayYN\s*===\s*false|InternetAddressDisplayYN\s*!==\s*true|internetAddressDisplayYN\s*!==\s*true|isAddressDisplayable|mlsIdSlug\(|buildCanonicalListingPath\(|suppress/i,
    exclusionWindow: 15,
    failingPattern: 'Public /listing/ URL or metadata built from address atoms with no address-display guard nearby.',
    actualFailure: 'Suppressed-address listing can leak address atoms publicly because URL/metadata generation happens without checking address-display permission.',
    impact: 'Suppressed-address listings can leak address atoms in public URL or metadata.',
    requiredFix: 'Gate address-based URL/metadata generation on InternetAddressDisplayYN (or the gated canonical builder) and fall back to an id-only URL when the address is suppressed.',
    proofRequired: 'Suppressed-address fixture renders ID-only canonical URL and does not leak address in sitemap, metadata, cards, or emails.',
  },
];

export const SENTINEL_L_CONTRACT = {
  hotPaths: HOT_PATHS,
  searchScopeMandate: SEARCH_SCOPE_MANDATE,
  catalog: CATALOG,
  githubCommentPolicy:
    'Only post a short PR comment when actionable errors exist. Do not post long narrative reports.',
};

function range(
  prefix: string,
  start: number,
  end: number,
  category: string,
  layer: string,
  searchSystem?: SearchSystem,
): ErrorCatalogEntry[] {
  const entries: ErrorCatalogEntry[] = [];
  for (let i = start; i <= end; i += 1) {
    entries.push({
      code: `${prefix}-${String(i).padStart(3, '0')}`,
      category,
      layer,
      title: `${category} actionable detector ${String(i).padStart(3, '0')}`,
      ...(searchSystem ? { searchSystem } : {}),
    });
  }
  return entries;
}

function repoRelative(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function runGit(repoRoot: string, args: string[]): string[] {
  try {
    const out = execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function changedFiles(repoRoot: string): string[] {
  const changed = new Set<string>();
  for (const args of [
    ['diff', '--name-only', 'origin/main...HEAD'],
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--name-only', '--cached'],
  ]) {
    for (const file of runGit(repoRoot, args)) changed.add(file.replace(/\\/g, '/'));
  }
  return [...changed];
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const entry = statSync(root);
  if (entry.isFile()) return [root];
  const out: string[] = [];
  for (const child of readdirSync(root)) {
    const full = path.join(root, child);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (child === '__tests__' || child === '__mocks__') continue;
      out.push(...walkFiles(full));
    }
    else out.push(full);
  }
  return out;
}

function expandHotPath(repoRoot: string, hotPath: string): string[] {
  if (hotPath.endsWith('/**')) {
    const dir = path.join(repoRoot, hotPath.slice(0, -3));
    return walkFiles(dir).map((file) => repoRelative(repoRoot, file));
  }
  const full = path.join(repoRoot, hotPath);
  return existsSync(full) ? [hotPath] : [];
}

function scanFiles(repoRoot: string): string[] {
  const files = new Set<string>();
  for (const file of changedFiles(repoRoot)) {
    if (existsSync(path.join(repoRoot, file))) files.add(file);
  }
  for (const hotPath of HOT_PATHS) {
    for (const file of expandHotPath(repoRoot, hotPath)) files.add(file);
  }
  return [...files].filter((file) => !isTestOrFixture(file)).sort();
}

function lineNumber(source: string, match: RegExp | string): number {
  const regex = typeof match === 'string' ? new RegExp(escapeRegExp(match)) : match;
  regex.lastIndex = 0;
  const found = regex.exec(source);
  if (!found || found.index < 0) return 1;
  return source.slice(0, found.index).split(/\r?\n/).length;
}

function isTestOrFixture(file: string): boolean {
  return /(^|\/)(__tests__|fixtures?|test-data)(\/|$)/.test(file)
    || /\.(?:test|spec)\.[jt]sx?$/.test(file);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function catalogEntry(code: string): ErrorCatalogEntry {
  const entry = CATALOG.find((item) => item.code === code);
  if (!entry) throw new Error(`Missing Sentinel-L catalog entry for ${code}`);
  return entry;
}

function buildError(rule: Rule, file: string, source: string): SentinelLError {
  const entry = catalogEntry(rule.code);
  const match = source.match(rule.lineHint ?? rule.pattern);
  return {
    code: rule.code,
    category: entry.category,
    severity: rule.severity,
    layer: entry.layer,
    file,
    line: lineNumber(source, rule.lineHint ?? rule.pattern),
    actualFailure: rule.actualFailure,
    'failing field/query/pattern': rule.failingPattern ?? rule.pattern.source,
    evidence: {
      detector: rule.pattern.source,
      matchedSource: evidenceSnippet(source, match?.index ?? 0),
    },
    impact: rule.impact,
    'required fix': rule.requiredFix,
    'proof required': rule.proofRequired,
    ...(entry.searchSystem ? { searchSystem: entry.searchSystem } : {}),
  };
}

/**
 * Returns true if any match of `re` lies within `windowLines` lines of
 * `centerIndex`. Used to suppress detector findings when nearby negative
 * evidence (a guard, a fallback, a suppression block) proves the flagged
 * pattern is already mitigated. Window is symmetric (±windowLines).
 */
function hasNearbyMatch(
  source: string,
  centerIndex: number,
  re: RegExp,
  windowLines: number,
): boolean {
  const lineStarts = computeLineStarts(source);
  const centerLine = lineForIndex(lineStarts, centerIndex);
  const minLine = Math.max(0, centerLine - windowLines);
  const maxLine = Math.min(lineStarts.length - 1, centerLine + windowLines);
  const startIdx = lineStarts[minLine];
  const endIdx = maxLine + 1 < lineStarts.length
    ? lineStarts[maxLine + 1]
    : source.length;
  const window = source.slice(startIdx, endIdx);
  re.lastIndex = 0;
  return re.test(window);
}

function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineForIndex(lineStarts: number[], index: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function evidenceSnippet(source: string, index: number): string {
  const lines = source.split(/\r?\n/);
  const before = source.slice(0, Math.max(0, index));
  const lineIndex = before.split(/\r?\n/).length - 1;
  const start = Math.max(0, lineIndex - 1);
  const end = Math.min(lines.length, lineIndex + 2);
  return lines
    .slice(start, end)
    .map((line, offset) => `${start + offset + 1}: ${line.trim()}`)
    .join('\n');
}

/**
 * Evaluate every applicable rule against an in-memory (file, source) pair and
 * return the resulting findings. Pure: no disk access. Shared by runSentinelL
 * (over real files) and by the precision tests (over fixtures), so the live
 * scan and the negative/positive tests exercise the exact same match,
 * requireNear, excludeIfNear, and excludeIfFilePresent logic.
 */
export function evaluateSource(file: string, source: string): SentinelLError[] {
  const out: SentinelLError[] = [];
  for (const rule of RULES) {
    if (!rule.filePattern.test(file)) continue;
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(source);
    if (!match) continue;
    // Whole-file exclusion: skip the rule for this file if the file-level
    // negative-evidence regex matches anywhere.
    if (rule.excludeIfFilePresent) {
      rule.excludeIfFilePresent.lastIndex = 0;
      if (rule.excludeIfFilePresent.test(source)) continue;
    }
    // POSITIVE evidence: require corroborating proof within the window, or the
    // finding is not actionable and is dropped.
    if (rule.requireNear && !hasNearbyMatch(
      source,
      match.index,
      rule.requireNear,
      rule.requireNearWindow ?? rule.exclusionWindow ?? 20,
    )) continue;
    // NEGATIVE evidence: skip if a guard/mitigation appears within
    // ±exclusionWindow lines of the primary match.
    if (rule.excludeIfNear && hasNearbyMatch(
      source,
      match.index,
      rule.excludeIfNear,
      rule.exclusionWindow ?? 20,
    )) continue;
    out.push(buildError(rule, file, source));
  }
  return out;
}

export function runSentinelL(repoRoot = process.cwd()): {
  status: 'PASS' | 'FAIL';
  errors: SentinelLError[];
  scannedFiles: string[];
  jsonPath: string;
  markdownPath: string;
} {
  const scannedFiles = scanFiles(repoRoot);
  const errors: SentinelLError[] = [];

  for (const file of scannedFiles) {
    const full = path.join(repoRoot, file);
    if (!existsSync(full) || statSync(full).isDirectory()) continue;
    const source = readFileSync(full, 'utf8');
    errors.push(...evaluateSource(file, source));
  }

  const sortedErrors = dedupeErrors(errors).sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return a.code.localeCompare(b.code) || a.file.localeCompare(b.file) || a.line - b.line;
  });

  const status = sortedErrors.length ? 'FAIL' : 'PASS';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(repoRoot, 'ops', 'audit', 'sentinel-l');
  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${timestamp}-errors.json`);
  const markdownPath = path.join(outDir, `${timestamp}-errors.md`);

  const payload = {
    schema_version: 'sentinel-l-platform-actionable-errors-v1',
    status,
    actionable_errors: sortedErrors.length,
    generated_at: new Date().toISOString(),
    search_scope_mandate: SEARCH_SCOPE_MANDATE,
    scanned_files: scannedFiles,
    errors: sortedErrors,
  };

  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(status, sortedErrors, scannedFiles));

  return {
    status,
    errors: sortedErrors,
    scannedFiles,
    jsonPath,
    markdownPath,
  };
}

function severityRank(severity: Severity): number {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[severity];
}

function dedupeErrors(errors: SentinelLError[]): SentinelLError[] {
  const seen = new Set<string>();
  const out: SentinelLError[] = [];
  for (const error of errors) {
    const key = `${error.code}:${error.file}:${error.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(error);
  }
  return out;
}

function renderMarkdown(status: 'PASS' | 'FAIL', errors: SentinelLError[], scannedFiles: string[]): string {
  const lines: string[] = [];
  lines.push(`Status: ${status}`);
  if (!errors.length) {
    lines.push('NO ACTIONABLE ERRORS FOUND');
  } else {
    lines.push(`Actionable errors: ${errors.length}`);
    lines.push('');
    for (const error of errors) {
      lines.push(`${error.severity} ${error.code} ${error.file}:${error.line}`);
      if (error.searchSystem) lines.push(`Search system: ${error.searchSystem}`);
      lines.push(`Layer: ${error.layer}`);
      lines.push(`Category: ${error.category}`);
      lines.push(`Actual failure: ${error.actualFailure}`);
      lines.push(`Failing field/query/pattern: ${error['failing field/query/pattern']}`);
      lines.push('Evidence:');
      lines.push('```');
      lines.push(error.evidence.matchedSource);
      lines.push('```');
      lines.push(`Impact: ${error.impact}`);
      lines.push(`Fix: ${error['required fix']}`);
      lines.push(`Proof required: ${error['proof required']}`);
      lines.push('');
    }
  }
  lines.push(`Scanned files: ${scannedFiles.length}`);
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  const result = runSentinelL(process.cwd());
  if (result.status === 'PASS') {
    console.log('Status: PASS');
    console.log('NO ACTIONABLE ERRORS FOUND');
  } else {
    console.log('Status: FAIL');
    console.log(`Actionable errors: ${result.errors.length}`);
  }
  console.log(`JSON: ${repoRelative(process.cwd(), result.jsonPath)}`);
  console.log(`Markdown: ${repoRelative(process.cwd(), result.markdownPath)}`);
}
