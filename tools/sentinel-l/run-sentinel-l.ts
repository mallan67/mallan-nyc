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

// v2 — actionable explanation schema. `system` is the broad real-product
// surface a finding belongs to; `FindingLayer` constrains the engineering
// locus; `Confidence` carries a reason so low-confidence findings say why.
type System =
  | 'SALES_FORM'
  | 'BUILDING_AUTOFILL'
  | 'MEDIA'
  | 'COTALITY_CONTRACT'
  | 'AGENT_PAGE'
  | 'LISTING_DETAIL'
  | 'PUBLIC_SEARCH'
  | 'BACKEND_SEARCH'
  | 'CRM_DASHBOARD'
  | 'CANONICAL_URL'
  | 'DISPLAY_GATE'
  | 'WORKFLOW';
type FindingLayer = 'frontend' | 'backend' | 'data' | 'compliance' | 'workflow';
type Confidence = { level: 'high' | 'medium' | 'low'; reason: string };

/** Optional context injected into evaluateSource so metadata-aware detectors
 *  (e.g. Cotality $select vs $metadata) stay pure and unit-testable: the live
 *  scan loads the field set from artifacts/metadata.xml; tests pass a fixture
 *  set. Without it, metadata-aware detectors stay silent (cannot prove a
 *  phantom → fail-closed quiet, no false positive). */
export type EvaluateContext = {
  cotalityFields?: Set<string>;
};

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
  // v2 actionable-explanation fields (16-field schema). Optional on the type so
  // legacy regex rules keep compiling; the v2 detectors populate all of them.
  system?: System;
  whyThisIsAnError?: string;
  expectedBehavior?: string;
  falsePositiveGuard?: string;
  confidence?: Confidence;
  relatedSurfaces?: string[];
  // WORKFLOW-system classification (classifyWorkflowFailure).
  cause?: 'pr' | 'external_infra' | 'indeterminate';
  recommendedAction?: 'rerun' | 'fix_pr' | 'separate_infra_pr' | 'ignore_stale_advisory' | 'human_review';
  freshness?: 'current' | 'stale';
  rerunPassed?: boolean;
  gating?: 'required' | 'advisory';
};

export type WorkflowFailureInput = {
  workflow: string;
  job: string;
  failingStep: string;
  rootCauseStep?: string;
  logs: string;
  prFiles: string[];
  rerunPassed: boolean;
  gating: 'required' | 'advisory';
  workflowFile?: string;
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
  // v2 actionable-explanation fields. When set, buildError emits them on the
  // finding so it satisfies the 16-field schema (system, layer enum, why,
  // expected, false-positive guard, confidence, related surfaces).
  system?: System;
  findingLayer?: FindingLayer;
  whyThisIsAnError?: string;
  expectedBehavior?: string;
  falsePositiveGuard?: string;
  confidence?: Confidence;
  relatedSurfaces?: string[];
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
  ...range('S-SALE', 1, 16, 'Sales form', 'Sales form'),
  ...range('S-RENT', 1, 12, 'Rental form', 'Rental form'),
  ...range('S-CRM', 1, 11, 'CRM dashboard / My Listings', 'CRM dashboard / My Listings'),
  ...range('S-LEAD', 1, 10, 'Lead/contact pipeline', 'CRM lead/contact pipeline'),
  ...range('S-AGENT', 1, 9, 'Agent / office / company lookup', 'Agent / office / company lookup'),
  ...range('S-PUBSEARCH', 1, 13, 'Public listing search', 'Public search', 'PUBLIC_SEARCH'),
  ...range('S-BACKSEARCH', 1, 18, 'Agent/Broker Backend Search', 'Backend CRM search', 'BACKEND_SEARCH'),
  ...range('S-SUGGEST', 1, 8, 'Suggest/autocomplete', 'Suggest/autocomplete', 'PUBLIC_SEARCH'),
  ...range('S-BUILDING', 1, 11, 'Building/address search', 'Building/address search'),
  ...range('S-SAVED', 1, 12, 'Saved searches', 'Saved searches', 'BACKEND_SEARCH'),
  ...range('S-EMAIL', 1, 9, 'Listing emails / alerts', 'Listing alerts/emails'),
  ...range('S-REPORT', 1, 10, 'Reports / CMA / market reports', 'Reports / CMA / market reports'),
  ...range('S-MEDIA', 1, 12, 'Media / photos / floorplans / videos', 'Media/photo/floorplan/video handling'),
  ...range('S-URL', 1, 11, 'Canonical URLs / sitemap / metadata', 'Canonical URLs / sitemap / metadata'),
  ...range('S-COMP', 1, 11, 'Display gates / compliance / privacy', 'Status/display/compliance gates'),
  ...range('S-WORKFLOW', 1, 3, 'Release-Truth / workflow reporting', 'CI / release-truth reporting'),
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
  // ── A. BUILDING_AUTOFILL ────────────────────────────────────────────────
  {
    code: 'S-BUILDING-009',
    severity: 'P1',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html|app\/api\/buildings\/.*route\.ts$/,
    pattern: /fetchBuildingsFromAPI[\s\S]{0,300}\.map\(\s*\(?(\w+)\)?\s*=>\s*\(?\{/,
    excludeIfNear: /\.\.\.\s*\w|Object\.assign\(/,
    exclusionWindow: 8,
    failingPattern: 'fetchBuildingsFromAPI maps API results into a hand-picked subset object (no spread/Object.assign of the raw row).',
    actualFailure: 'fetchBuildingsFromAPI rebuilds each building into a lossy subset, so the cache feeding both the main-address and Building-tab paths drops raw Cotality fields (tax_block, association_*, stories_total, structure_type, neighborhood). populateBuildingFromIDX then finds them missing and auto-populate silently leaves those fields blank.',
    impact: 'Building auto-populate fills only a handful of fields; the broker must retype the rest, and a missing neighborhood cascades into validation/display failures.',
    requiredFix: 'Preserve the full raw API object (spread `...b` / Object.assign) and only override display + camelCase alias fields, so populateBuildingFromIDX can pick the full snake_case Cotality shape.',
    proofRequired: 'tests/runtime/cotality-building-autopopulate.test.ts asserts tax_block/stories_total/structure_type/neighborhood survive fetchBuildingsFromAPI; selecting a building populates all Cotality-derivable fields.',
    system: 'BUILDING_AUTOFILL',
    findingLayer: 'data',
    whyThisIsAnError: 'Mallan CRM workflow + Cotality contract: populateBuildingFromIDX reads the full snake_case Cotality shape via pick(); dropping fields in the API normalizer before it runs means the broker cannot complete a listing from Cotality data (Maya: "the building has to auto populate").',
    expectedBehavior: 'fetchBuildingsFromAPI returns every API field for both the main-address and Building-tab caches; only display/alias fields are added on top.',
    falsePositiveGuard: 'Do not flag a normalizer that spreads the raw row (`...b`) or uses Object.assign({}, b, {...}); adding alias/display fields on top of the preserved object is safe.',
    confidence: { level: 'high', reason: 'This exact lossy-subset shape was the PR #278 regression that dropped Cotality fields before populateBuildingFromIDX.' },
    relatedSurfaces: ['BUILDING_AUTOFILL', 'SALES_FORM', '/api/buildings/search'],
  },
  {
    code: 'S-BUILDING-010',
    severity: 'P1',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    pattern: /(?:buildingDatabase|buildingCache|cachedBuildings)\b[\s\S]{0,120}\.filter\(/,
    requireNear: /searchBuilding|BuildingTab|buildingSearch|selectBuildingForModal|building.?modal/i,
    requireNearWindow: 12,
    excludeIfNear: /fetch\([^)]*\/api\/buildings\/search/,
    exclusionWindow: 12,
    failingPattern: 'Building-tab search filters the in-memory building cache with no /api/buildings/search fallback.',
    actualFailure: 'The Building-tab search only filters the in-memory buildingDatabase cache. When the building is not already cached (cache empty/stale), the search returns no matches and auto-populate never runs, so the broker cannot select the building.',
    impact: 'Buildings outside the warm cache are unsearchable from the Building tab; the broker sees "no match" for real buildings.',
    requiredFix: 'When the cache is empty/stale, call /api/buildings/search as an independent fallback (as the main-address path does) and show a no-match message only after the API returns nothing.',
    proofRequired: 'Building-tab search test: with an empty cache, querying a building calls /api/buildings/search and returns results; a cache miss no longer yields a false "no match".',
    system: 'BUILDING_AUTOFILL',
    findingLayer: 'frontend',
    whyThisIsAnError: 'Mallan CRM workflow: the Building tab and main-address path must both reach Cotality; a cache-only tab makes listing creation depend on whether a building was previously loaded — non-deterministic and broker-blocking.',
    expectedBehavior: 'Building-tab search uses the cache when warm and falls back to /api/buildings/search when empty/stale; both paths feed populateBuildingFromIDX.',
    falsePositiveGuard: 'Do not flag a Building-tab search that already calls /api/buildings/search (within the same handler) when the cache is empty.',
    confidence: { level: 'medium', reason: 'Cache-only filtering is the PR #277 Building-tab shape; medium because some cache filters are backed by a separate prefetch.' },
    relatedSurfaces: ['BUILDING_AUTOFILL', 'SALES_FORM', '/api/buildings/search'],
  },
  {
    code: 'S-BUILDING-011',
    severity: 'P1',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    pattern: /(?:saleUnitNumber|rentalUnitNumber)['"]\s*\)\s*\.value\s*=\s*(?:building|bldg|b|idx)\b/,
    requireNear: /populateBuildingFromIDX|building.?populate|selectBuilding|selectBuildingForModal/i,
    requireNearWindow: 12,
    excludeIfNear: /if\s*\(\s*!\s*\w*[Uu]nit\w*(?:El)?\.value\s*\)/,
    exclusionWindow: 6,
    failingPattern: 'Building populate assigns the building unit into the listing UnitNumber field with no preserve-user-unit guard.',
    actualFailure: 'Selecting a building overwrites the user-entered UnitNumber with the building record’s unit (often blank or a different unit), so the broker’s typed apartment number is lost the moment they pick the building.',
    impact: 'The unit number silently changes/clears on building select, producing a wrong listing address and RealPlus URL.',
    requiredFix: 'Preserve a user-entered UnitNumber on building populate (only set it when the field is empty), since the unit belongs to the listing, not the building.',
    proofRequired: 'Building-select test: a pre-typed unit (e.g. 2G) survives selecting the building; only an empty unit is filled from building data.',
    system: 'BUILDING_AUTOFILL',
    findingLayer: 'frontend',
    whyThisIsAnError: 'Data integrity + Mallan CRM workflow: UnitNumber is listing-scoped, not building-scoped; the building record cannot know the unit, so overwriting it corrupts the address that search, canonical URL, and dashboard matching depend on.',
    expectedBehavior: 'Building populate fills building-scoped fields and leaves a non-empty user UnitNumber untouched.',
    falsePositiveGuard: 'Do not flag an assignment guarded by an empty-check (e.g. `if (!unitEl.value) unitEl.value = ...`) that only fills a blank unit.',
    confidence: { level: 'medium', reason: 'Direct assignment to the unit field inside a building-populate context is the clobber shape; medium because some flows intentionally clear a stale unit on a new building.' },
    relatedSurfaces: ['BUILDING_AUTOFILL', 'SALES_FORM', 'CANONICAL_URL'],
  },
  // ── B. MEDIA_P0 ─────────────────────────────────────────────────────────
  {
    code: 'S-MEDIA-010',
    severity: 'P0',
    filePattern: /app\/api\/crm\/listings\/\[id\]\/media|lib\/media/,
    pattern: /prisma\.listing\.update\([\s\S]{0,200}data:\s*\{[\s\S]{0,160}\bmedia\s*:/,
    excludeIfNear: /listing_media|listingMedia/,
    exclusionWindow: 12,
    failingPattern: 'Media persisted to the listing.media JSON column with no listing_media row write nearby.',
    actualFailure: 'CRM media is written only to the listing.media JSON blob, never to listing_media rows. The shared resolver reads listing_media (the Cotality-shaped table), so the uploaded photos do not appear on the listing — or appear inconsistently between edit-load and public display.',
    impact: 'Photos uploaded in the CRM can vanish from the public listing/hero because the resolver never sees a listing_media row.',
    requiredFix: 'Write media to listing_media rows (media_key, type, classification, order) as the source of truth; keep listing.media JSON only as a mirror if needed.',
    proofRequired: 'tests/runtime/media-display-p0.test.ts: an upload creates listing_media rows and the resolver returns them; public listing shows the uploaded photo.',
    system: 'MEDIA',
    findingLayer: 'data',
    whyThisIsAnError: 'Cotality-shaped media contract + data integrity: listing_media rows (not the JSON blob) are what the resolver and public display read; writing JSON-only means saved media is invisible to the read path.',
    expectedBehavior: 'Media writes create/update listing_media rows; the resolver and hero selection read those rows.',
    falsePositiveGuard: 'Do not flag a media write that also creates/updates listing_media rows nearby (the JSON write may be a back-compat mirror).',
    confidence: { level: 'high', reason: 'JSON-only media persistence is the PR #276 class where listing_media rows are the resolver source of truth.' },
    relatedSurfaces: ['MEDIA', 'LISTING_DETAIL', 'CRM_DASHBOARD'],
  },
  {
    code: 'S-MEDIA-011',
    severity: 'P1',
    filePattern: /app\/api\/crm\/listings\/\[id\]\/media|lib\/media/,
    pattern: /(?:raw_data|rawData)\s*:\s*\{[\s\S]{0,80}media_order|media_order['"]?\s*:\s*order\b/,
    excludeIfNear: /listing_media/,
    exclusionWindow: 12,
    failingPattern: 'Reorder writes media_order into raw_data, a field the media resolver does not read.',
    actualFailure: 'Photo reorder writes raw_data.media_order, but the resolver orders by listing_media.order. The new order is saved to a field nothing reads, so the photo order silently reverts on reload and on the public listing.',
    impact: 'Reordering photos appears to work but does not persist — the order resets, including which photo is the hero.',
    requiredFix: 'Persist order on listing_media rows (listing_media.order), matching what the resolver reads.',
    proofRequired: 'Reorder test: after PATCH, listing_media rows carry the new order and the resolver returns photos in that order after reload.',
    system: 'MEDIA',
    findingLayer: 'data',
    whyThisIsAnError: 'Data integrity: write-path and read-path must agree on the ordering field; writing raw_data.media_order while reading listing_media.order is a silent no-op.',
    expectedBehavior: 'Reorder updates listing_media.order; the resolver returns that order.',
    falsePositiveGuard: 'Do not flag when the reorder also updates listing_media rows nearby (a raw_data mirror alongside the real row write is acceptable).',
    confidence: { level: 'high', reason: 'Write-to-unread-field is a deterministic ordering bug; the resolver source-of-truth is listing_media.order.' },
    relatedSurfaces: ['MEDIA', 'LISTING_DETAIL'],
  },
  {
    code: 'S-MEDIA-012',
    severity: 'P1',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html|app\/api\/crm\/listings\/\[id\]\/media/,
    pattern: /\b(?:media|photos|images)\s*\.\s*splice\(\s*\w*(?:index|idx|i)\b|delete\s+(?:media|photos)\[/i,
    requireNear: /remove|delete/i,
    requireNearWindow: 8,
    excludeIfNear: /media_key|mediaKey|ResourceRecordKey/,
    exclusionWindow: 8,
    failingPattern: 'Media delete mutates the array by positional index instead of a stable media_key.',
    actualFailure: 'Deleting a photo splices the media array by its UI index. If the array order differs from the server (or another delete shifted indices), the wrong photo is removed, or the delete does not reach the listing_media row keyed by media_key.',
    impact: 'The wrong photo can be deleted, or the deletion does not persist server-side; the hero/order can shift unexpectedly.',
    requiredFix: 'Delete by stable media_key (call DELETE .../media/{media_key} and filter the local array by media_key), never by array index.',
    proofRequired: 'Media delete test: removing a specific photo deletes the matching listing_media row by media_key and leaves the others (and the hero) intact.',
    system: 'MEDIA',
    findingLayer: 'frontend',
    whyThisIsAnError: 'Cotality-shaped media contract + data integrity: listing_media rows are keyed by media_key; index-based deletion is non-deterministic against the row set and can target the wrong photo.',
    expectedBehavior: 'Media deletion is keyed by media_key on both the client array and the server row.',
    falsePositiveGuard: 'Do not flag a delete that uses media_key / mediaKey / ResourceRecordKey to identify the photo.',
    confidence: { level: 'medium', reason: 'Index-based splice in a remove/delete context is the fragile-delete shape; medium because some local-only arrays are safe to splice.' },
    relatedSurfaces: ['MEDIA', 'CRM_DASHBOARD'],
  },
  // ── D. RELEASE_TRUTH / WORKFLOW (static) ────────────────────────────────
  {
    code: 'S-WORKFLOW-001',
    severity: 'P2',
    filePattern: /\.github\/workflows\/.*\.ya?ml$/,
    pattern: /gh\s+pr\s+comment/,
    excludeIfNear: /if:\s*\$\{\{\s*false\s*\}\}|if:\s*false\b/,
    exclusionWindow: 6,
    failingPattern: 'Workflow runs `gh pr comment` without an `if: ${{ false }}` disable guard nearby.',
    actualFailure: 'An advisory workflow posts a PR comment on every run, which emails the maintainer on each push/synchronize (mailbox spam). Advisory findings should surface via the red check + artifact + Step Summary, not PR comments.',
    impact: 'Maya gets an email on every PR update from an advisory check; the noise hides the signals that matter.',
    requiredFix: 'Gate the comment step with `if: ${{ false }}` (preserve the step for a one-line future re-enable) and surface findings via artifact + Step Summary only.',
    proofRequired: 'Workflow-structure test asserts the comment step is `if: ${{ false }}` and no enabled step runs `gh pr comment`.',
    system: 'WORKFLOW',
    findingLayer: 'workflow',
    whyThisIsAnError: 'Mallan reporting policy (PR #266): advisory Sentinel/Release-Truth comments spam the mailbox; findings must go to artifact + Step Summary, with PR comments disabled unless explicitly approved.',
    expectedBehavior: 'The PR-comment step stays disabled (`if: ${{ false }}`); the workflow uploads an artifact and writes a Step Summary.',
    falsePositiveGuard: 'Do not flag a `gh pr comment` step already gated by `if: ${{ false }}` (preserved-but-disabled).',
    confidence: { level: 'high', reason: 'An ungated gh pr comment in an advisory workflow is exactly the PR #266 mailbox-spam shape.' },
    relatedSurfaces: ['WORKFLOW', 'RELEASE_TRUTH'],
  },
  // ── F. CANONICAL_URL / DISPLAY_GATE ─────────────────────────────────────
  {
    code: 'S-URL-010',
    severity: 'P1',
    filePattern: /app\/components\/(?:FeaturedListings|SearchListingCard)|lib\/crm\/listing-urls|app\/sitemap|lib\/idx\/(?:db-to-public-dto|display-adapter)|app\/listing/,
    pattern: /`\/listing\/\$\{[^}]*\}-\$\{[^}]*\b(?:id|listingId|listing_id|listing\.id)\b[^}]*\}|\?key=\$\{\s*(?:id|listingId|listing_id|listing\.id)\s*\}/,
    failingPattern: 'Emits a hybrid /listing/{slug}-{id} or /listing/{slug}?key={id} URL instead of the canonical two-segment /listing/{address}/{id}.',
    actualFailure: 'A public surface links to the hybrid one-segment listing URL (slug-id or ?key=) instead of the canonical /listing/{address-slug}/{listing-id}. The same listing is then reachable at two URL shapes, splitting SEO and breaking the RealPlus address handoff.',
    impact: 'Duplicate URL shapes per listing dilute SEO and can 308-bounce or 404 depending on the emitter.',
    requiredFix: 'Route every public listing link through buildCanonicalListingPath() (or listing.url) — one canonical /listing/{address}/{id} per listing.',
    proofRequired: 'Emitter tests: search card, featured/exclusives, sitemap, and detail canonical all equal buildCanonicalListingPath(); no emitter returns a slug-id or ?key= URL.',
    system: 'CANONICAL_URL',
    findingLayer: 'frontend',
    whyThisIsAnError: 'Mallan SEO/listing invariant (PR #272): one listing, one canonical URL. Hybrid slug-id / ?key= URLs are the two-shape problem that fragmented SEO and broke address-based handoff.',
    expectedBehavior: 'All public emitters produce the canonical /listing/{address-slug}/{listing-id} via the shared builder.',
    falsePositiveGuard: 'Do not flag the canonical two-segment form /listing/${slug}/${id} (slash, not dash) or a call to buildCanonicalListingPath()/listing.url.',
    confidence: { level: 'high', reason: 'Slug-id dash and ?key= templates are exactly the hybrid shapes PR #272 removed.' },
    relatedSurfaces: ['CANONICAL_URL', 'PUBLIC_SEARCH', 'LISTING_DETAIL'],
  },
  {
    code: 'S-URL-011',
    severity: 'P1',
    filePattern: /app\/listing|lib\/idx\/fetch|lib\/listing-slug/,
    pattern: /listing_id\s*:\s*(?:extractListingId\w*\([^)]*\)|(?:listingIdFromSlug|idFromSlug|slug)\b)/,
    excludeIfNear: /toUpperCase|\.upper\(/,
    exclusionWindow: 6,
    failingPattern: 'listing_id DB lookup uses a slug-derived (lowercase) id without normalizing to uppercase.',
    actualFailure: 'The detail route looks up listing_id with a slug-derived, lowercase id (the canonical URL lowercases it), but stored ids are uppercase (SL-0004, RLS…). The case-sensitive findUnique misses, so every CRM exclusive and lowercased MLS-id slug 404s.',
    impact: 'Canonical lowercase listing URLs 404 because the case-sensitive unique lookup never matches the stored uppercase id.',
    requiredFix: 'Normalize the slug-derived id to uppercase before the listing_id lookup (toUpperCase), since all REBNY/CRM ids are uppercase.',
    proofRequired: 'Detail-route test: /listing/{address}/sl-0004 resolves (id uppercased to SL-0004); lowercased MLS-id slugs resolve.',
    system: 'CANONICAL_URL',
    findingLayer: 'backend',
    whyThisIsAnError: 'Data integrity + canonical-URL contract: the canonical URL intentionally lowercases the id, so the reader must uppercase it back for the unique-index lookup (PR #272 Codex regression).',
    expectedBehavior: 'The id segment is uppercased before findUnique on listing_id.',
    falsePositiveGuard: 'Do not flag a lookup that applies toUpperCase()/upper() to the slug-derived id before the query.',
    confidence: { level: 'high', reason: 'A case-sensitive listing_id lookup from a lowercased slug id is the exact PR #272 404 regression.' },
    relatedSurfaces: ['CANONICAL_URL', 'LISTING_DETAIL'],
  },
  {
    code: 'S-COMP-011',
    severity: 'P0',
    filePattern: /app\/api\/agents|app\/api\/listings|lib\/search|lib\/idx/,
    pattern: /idx_display_yn\s*:\s*true/,
    requireNear: /where\s*:|findMany|findFirst|prisma\.listing/,
    requireNearWindow: 10,
    excludeIfNear: /rls_eligible/,
    exclusionWindow: 10,
    failingPattern: 'A listing query gates on idx_display_yn=true with no rls_eligible=false bypass branch.',
    actualFailure: 'A query filters listings on idx_display_yn=true as a flat condition. A Mallan website-only exclusive (rls_eligible=false, idx_display_yn=false because it is InHouseWebOnly) is filtered out, so it never appears on the agent page / search even though it is Active and website-displayable.',
    impact: 'Mallan’s own website-only exclusives disappear from the agent page and public surfaces — the exact SL-0004 invisibility class.',
    requiredFix: 'Branch the display gate: rls_eligible=false rows bypass the IDX gate (require Active + price>0 + address) while rls_eligible!==false rows keep the full IDX gate.',
    proofRequired: 'Agent-page/search test: an rls_eligible=false Active exclusive is returned; an IDX-suppressed RLS row is still excluded.',
    system: 'DISPLAY_GATE',
    findingLayer: 'compliance',
    whyThisIsAnError: 'REBNY UCBA + Mallan exclusives: InHouseWebOnly listings (rls_eligible=false) are website-displayable but IDX-gated; applying idx_display_yn as a blanket filter hides Mallan’s own exclusives.',
    expectedBehavior: 'The query branches on rls_eligible so website-only exclusives display while RLS rows respect the IDX gate.',
    falsePositiveGuard: 'Do not flag a query whose where clause already branches on rls_eligible (e.g. OR: [{ rls_eligible: false }, { idx_display_yn: true }]).',
    confidence: { level: 'high', reason: 'idx_display_yn=true with no rls_eligible bypass is the documented website-only-exclusive hiding bug (PR #238/#274).' },
    relatedSurfaces: ['DISPLAY_GATE', 'AGENT_PAGE', 'PUBLIC_SEARCH'],
  },
  // ── E. SALES_FORM_SAVE_LOAD ─────────────────────────────────────────────
  {
    code: 'S-SALE-015',
    severity: 'P1',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    pattern: /(?:data\.)?(?:StandardStatus|status)\s*=\s*(?:CRM_TO_RESO_STATUS|RESO_STATUS|canonicalStatus|mapToReso\w*)\b/,
    excludeIfNear: /_crmWorkflowStatus|workflowStatus\s*:/,
    exclusionWindow: 10,
    failingPattern: 'Save maps the listing to the canonical RESO status without persisting the CRM workflow status (_crmWorkflowStatus).',
    actualFailure: 'On save the form collapses the CRM workflow status (BackOnMarket, OfferOut, ContractSigned, …) into the canonical RESO status and never persists _crmWorkflowStatus. On edit-reload the granular workflow status is gone — the broker sees the coarse RESO status instead of the workflow state they set.',
    impact: 'CRM workflow status silently resets to the canonical bucket on every edit; the broker loses the BackOnMarket/OfferOut/etc. state.',
    requiredFix: 'Map to the canonical status for the server AND persist the workflow status in raw_data._crmWorkflowStatus; restore it on edit-load.',
    proofRequired: 'Status round-trip test: a workflow status (e.g. OfferOut) saved then reloaded shows OfferOut, while the server status is the mapped canonical value.',
    system: 'SALES_FORM',
    findingLayer: 'frontend',
    whyThisIsAnError: 'Mallan CRM workflow (two-layer status model, PR #260/#262): the CRM workflow status and the canonical RESO status are distinct layers; collapsing to canonical without persisting the workflow layer loses broker-meaningful state.',
    expectedBehavior: 'Save writes the canonical status for the server and mirrors the workflow status to raw_data._crmWorkflowStatus; edit-load restores the workflow status.',
    falsePositiveGuard: 'Do not flag a save that also persists _crmWorkflowStatus (or a raw_data workflowStatus key) alongside the canonical status.',
    confidence: { level: 'medium', reason: 'Canonical-status write without a nearby _crmWorkflowStatus persist is the two-layer clobber shape; medium because some flows persist it elsewhere in the same handler.' },
    relatedSurfaces: ['SALES_FORM', 'CRM_DASHBOARD'],
  },
  {
    code: 'S-SALE-016',
    severity: 'P1',
    filePattern: /public\/crm\/(?:SALE|RENTAL)-FORM-REDESIGN\.html$/,
    pattern: /performAutoSave[\s\S]{0,200}(?:method:\s*['"]PATCH['"]|fetch\(|\.save\()/,
    excludeIfNear: /_saleAutoSaveReady|_rentalAutoSaveReady|_salePopulateInProgress|autoSaveReady|window\._sale/,
    exclusionWindow: 12,
    failingPattern: 'performAutoSave issues a save/PATCH with no populate-complete gate.',
    actualFailure: 'Autosave PATCHes the listing without checking a populate-complete flag. During edit-load it fires before _populateSaleFormFromApi finishes, reading form defaults and PATCHing them over the saved DB row (e.g. saved Condop overwritten by the default Condo).',
    impact: 'Edit-load autosave overwrites saved values with form defaults — silent data loss on every edit.',
    requiredFix: 'Gate autosave behind a populate-complete flag (e.g. _saleAutoSaveReady), enabled only after _populateSaleFormFromApi completes; cancel any pending autosave timer before submit.',
    proofRequired: 'Edit-load test: autosave does not fire (no PATCH) until populate completes; a saved value is not overwritten by a default on reload.',
    system: 'SALES_FORM',
    findingLayer: 'frontend',
    whyThisIsAnError: 'Data integrity + Mallan CRM workflow (PR #263): a save path that runs before the form is populated reads defaults, not the saved row, and silently corrupts the listing.',
    expectedBehavior: 'Autosave only runs after populate completes (guarded by a ready flag); new-listing autosave is enabled on DOMContentLoaded.',
    falsePositiveGuard: 'Do not flag a performAutoSave guarded by _saleAutoSaveReady / _salePopulateInProgress / an equivalent ready flag.',
    confidence: { level: 'medium', reason: 'An autosave save/PATCH with no nearby ready-flag guard is the PR #263 edit-load overwrite shape; medium because the guard can live in the caller.' },
    relatedSurfaces: ['SALES_FORM', 'CRM_DASHBOARD'],
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
    layer: rule.findingLayer ?? entry.layer,
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
    ...(rule.system ? { system: rule.system } : {}),
    ...(rule.whyThisIsAnError ? { whyThisIsAnError: rule.whyThisIsAnError } : {}),
    ...(rule.expectedBehavior ? { expectedBehavior: rule.expectedBehavior } : {}),
    ...(rule.falsePositiveGuard ? { falsePositiveGuard: rule.falsePositiveGuard } : {}),
    ...(rule.confidence ? { confidence: rule.confidence } : {}),
    ...(rule.relatedSurfaces ? { relatedSurfaces: rule.relatedSurfaces } : {}),
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

// ── v2 detector: Cotality $select vs live $metadata (COTALITY_CONTRACT) ──
// PR #277 class: /api/buildings/search listed OData $select fields that do not
// exist on the live Cotality Property resource, so Trestle 400'd the entire
// query and building auto-populate silently filled nothing. Metadata-aware, so
// it takes the field set via context; without it, it stays silent (cannot prove
// a phantom → no false positive).
function detectCotalitySelect(
  file: string,
  source: string,
  context: EvaluateContext,
): SentinelLError[] {
  if (!/app\/api\/buildings\/.*route\.ts$/.test(file)) return [];
  const fields = context.cotalityFields;
  if (!fields || fields.size === 0) return [];
  if (!/\$select/.test(source)) return [];

  const tokens = new Set<string>();
  let firstIndex = -1;
  const arrayRe = /select[\w]*\s*=\s*\[([^\]]*)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = arrayRe.exec(source))) {
    if (firstIndex < 0) firstIndex = m.index;
    for (const t of m[1].matchAll(/['"]([A-Z][A-Za-z0-9]+)['"]/g)) tokens.add(t[1]);
  }
  const inlineRe = /\$select=([A-Za-z][A-Za-z0-9_,]+)/g;
  while ((m = inlineRe.exec(source))) {
    if (firstIndex < 0) firstIndex = m.index;
    for (const t of m[1].split(',')) if (/^[A-Z][A-Za-z0-9]+$/.test(t)) tokens.add(t);
  }

  const phantom = [...tokens].filter((t) => !fields.has(t));
  if (phantom.length === 0) return [];

  const index = firstIndex < 0 ? 0 : firstIndex;
  const list = phantom.join(', ');
  return [{
    code: 'S-COTALITY-001',
    category: 'Cotality / IDX Plus contract',
    severity: 'P0',
    system: 'COTALITY_CONTRACT',
    layer: 'backend',
    file,
    line: lineForIndex(computeLineStarts(source), index) + 1,
    actualFailure:
      `The OData $select lists ${list}, which are absent from the live Cotality Property $metadata. `
      + 'Trestle returns HTTP 400 for the whole query, so the building lookup silently returns nothing and the '
      + 'sales-form building auto-populate fills no fields.',
    'failing field/query/pattern': `$select includes non-metadata field(s): ${list}`,
    evidence: {
      detector: 'cotality-select-vs-metadata',
      matchedSource: evidenceSnippet(source, index),
    },
    impact:
      'Building auto-populate is dead: a Trestle 400 on the entire query means the broker picks a building and nothing populates.',
    'required fix':
      `Remove ${list} from the $select; derive any needed values from metadata-present fields (e.g. BuildingFeatures); `
      + 'add a metadata-backed contract test that fails on any unknown $select field.',
    'proof required':
      'tests/runtime/cotality-building-autopopulate.test.ts asserts every $select field is in the Cotality metadata set; '
      + 'live GET /api/buildings/search?address=333+E+46th returns 200 with populated fields (not 400/empty).',
    whyThisIsAnError:
      'Cotality / IDX Plus contract: a field must exist on the resource in the live $metadata before it can be $select-ed; '
      + 'an unknown field invalidates the entire OData request (HTTP 400), not just that one column.',
    expectedBehavior:
      'Every $select token is validated against the Cotality Property $metadata; values like concierge/on-site-manager are '
      + 'derived from valid fields (e.g. BuildingFeatures), never from phantom booleans.',
    falsePositiveGuard:
      'Do not flag $select tokens that ARE present in the Cotality $metadata, nor a $select built from a metadata-validated allowlist constant.',
    confidence: {
      level: 'high',
      reason:
        'Field validity is checked deterministically against the live Cotality $metadata field set; this exact class shipped a Trestle 400 in PR #277.',
    },
    relatedSurfaces: ['BUILDING_AUTOFILL', 'SALES_FORM', '/api/buildings/search'],
  }];
}

// ── D. RELEASE_TRUTH / WORKFLOW classifier ──────────────────────────────
// Turns a CI workflow failure into an explained finding instead of a bare
// count. Distinguishes a transient external dependency (e.g. NYC Open Data
// ECONNRESET that a rerun cleared) from a real PR-caused regression, and
// FAILS CLOSED to `indeterminate` when it cannot prove either — never excusing
// a real failure as flaky.
const EXTERNAL_INFRA_SIGNATURE =
  /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|\bHTTP 503\b|\bHTTP 429\b|\b503\b|\b429\b/i;
const EXTERNAL_HOST =
  /data\.cityofnewyork\.us|nyc\.gov|socrata|registry\.npmjs\.org|api\.github\.com/i;

function deriveFailingSurface(job: string, failingStep: string): RegExp | null {
  const ctx = `${job} ${failingStep}`.toLowerCase();
  if (/geo|nta|neighborhood|rls-geo/.test(ctx)) return /public\/geo|data\/rls|geojson|geo-/i;
  return null;
}

export function classifyWorkflowFailure(input: WorkflowFailureInput): SentinelLError {
  const sig = EXTERNAL_INFRA_SIGNATURE.exec(input.logs);
  const hostHit = EXTERNAL_HOST.test(input.logs);
  const hasExternalSignature = Boolean(sig);
  const surface = deriveFailingSurface(input.job, input.failingStep);
  const prTouchesSurface = surface ? input.prFiles.some((f) => surface.test(f)) : null;

  let cause: 'pr' | 'external_infra' | 'indeterminate';
  if (hasExternalSignature && prTouchesSurface === false) cause = 'external_infra';
  else if (!hasExternalSignature && prTouchesSurface === true) cause = 'pr';
  else cause = 'indeterminate';

  const freshness: 'current' | 'stale' = input.rerunPassed ? 'stale' : 'current';
  const recommendedAction: SentinelLError['recommendedAction'] =
    cause === 'external_infra'
      ? (input.rerunPassed ? 'ignore_stale_advisory' : 'rerun')
      : cause === 'pr' ? 'fix_pr' : 'human_review';

  const confidence: Confidence =
    cause === 'external_infra'
      ? { level: 'high', reason: `Transient signature ${sig![0]} present${hostHit ? ' from an external host' : ''} and the PR did not touch the failing surface${input.rerunPassed ? '; a no-change rerun passed' : ''}.` }
      : cause === 'pr'
        ? { level: 'high', reason: 'Deterministic failure (no transient signature) and the PR changed files on the failing surface.' }
        : { level: 'low', reason: 'No recognized external signature and the failing surface could not be mapped to the PR diff; cannot classify (fail-closed).' };

  const stepRef = input.rootCauseStep && input.rootCauseStep !== input.failingStep
    ? `${input.failingStep} (root cause: ${input.rootCauseStep})`
    : input.failingStep;
  const lines = input.logs.split(/\r?\n/);
  const reasonLine = (sig
    ? lines.find((l) => EXTERNAL_INFRA_SIGNATURE.test(l)) ?? sig[0]
    : lines.find((l) => /fail|error|exit/i.test(l)) ?? lines[0] ?? '').trim();

  const actualFailure =
    cause === 'external_infra'
      ? `${input.workflow} / ${input.job} failed at "${stepRef}" because of an external/transient error: ${sig![0]}`
        + `${hostHit ? ' from an external host (NYC Open Data / third-party)' : ''}.`
        + ` ${input.rerunPassed ? 'A later rerun passed with no code change.' : 'No rerun has passed yet.'}`
        + ' The PR changed no files on the failing surface. External flaky failure, not a product regression.'
      : cause === 'pr'
        ? `${input.workflow} / ${input.job} failed deterministically at "${stepRef}" and the PR changed files on the failing surface. This is PR-caused — fix the PR before merge.`
        : `${input.workflow} / ${input.job} failed at "${stepRef}" with no recognized external signature and a failing surface that cannot be mapped to the PR diff. Cannot classify — treated as indeterminate (fail-closed); do not assume flaky.`;

  return {
    code: 'S-WORKFLOW-003',
    category: 'Release-Truth / workflow reporting',
    severity: cause === 'pr' ? 'P1' : 'P2',
    layer: 'workflow',
    file: input.workflowFile ?? `.github/workflows (${input.workflow})`,
    line: 1,
    actualFailure,
    'failing field/query/pattern':
      cause === 'external_infra' ? `external infra signature: ${sig![0]}`
      : cause === 'pr' ? 'deterministic failure on PR-touched surface'
      : 'unclassified workflow failure (no signature, unmapped surface)',
    evidence: { detector: 'classify-workflow-failure', matchedSource: reasonLine || stepRef },
    impact:
      cause === 'external_infra'
        ? 'A bare blocking-failure count would read this transient fetch failure as a product regression and block the merge for no real reason.'
        : cause === 'pr'
          ? 'A real regression on a changed surface; merging would ship the failure.'
          : 'Unknown — needs a human to read the failing-step log and PR diff before any verdict.',
    'required fix':
      cause === 'external_infra'
        ? 'Treat as external flaky: rerun (already passed → ignore the stale advisory). Optionally harden the upstream fetch (retry/cache/hard-fail) in a SEPARATE infrastructure PR.'
        : cause === 'pr'
          ? 'Fix the PR: the failing surface was changed and the failure is deterministic.'
          : 'Human review: collect the failing-step log + PR diff; do not auto-classify.',
    'proof required':
      cause === 'external_infra'
        ? 'A no-change rerun is green (confirms transience); the live external dependency is reachable.'
        : cause === 'pr'
          ? 'The PR fix flips the check green on re-run.'
          : 'A human confirms the root cause from the failing-step log.',
    whyThisIsAnError:
      'Release-Truth reporting contract: a bare blocking-failure count hides whether the merge is unsafe or a transient external failure already cleared by a rerun. Each failure must be explained (workflow/job/step, current/stale, rerun result, required/advisory, PR vs external) with the exact reason.',
    expectedBehavior:
      'Release-Truth reports each failure with workflow, job, failing step (and root-cause step), freshness, rerun result, required/advisory, cause (pr/external_infra/indeterminate), the verbatim reason, and a recommended action — never a bare count.',
    falsePositiveGuard:
      'Do not classify as external_infra unless a transient signature is present AND the PR did not touch the failing surface; absent either, fall back to indeterminate — never excuse a real regression as flaky.',
    confidence,
    relatedSurfaces: ['WORKFLOW', 'RELEASE_TRUTH', input.workflow],
    system: 'WORKFLOW',
    cause,
    recommendedAction,
    freshness,
    rerunPassed: input.rerunPassed,
    gating: input.gating,
  };
}

/**
 * Evaluate every applicable rule against an in-memory (file, source) pair and
 * return the resulting findings. Pure: no disk access. Shared by runSentinelL
 * (over real files) and by the precision tests (over fixtures), so the live
 * scan and the negative/positive tests exercise the exact same match,
 * requireNear, excludeIfNear, and excludeIfFilePresent logic.
 */
export function evaluateSource(
  file: string,
  source: string,
  context: EvaluateContext = {},
): SentinelLError[] {
  const out: SentinelLError[] = [];
  out.push(...detectCotalitySelect(file, source, context));
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
