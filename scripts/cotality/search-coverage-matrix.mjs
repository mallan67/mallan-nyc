#!/usr/bin/env node
// SEARCH COVERAGE MATRIX v3 — provider fact × provider access path × Mallan consumer graph.
//
//   PROVIDER FACT        per Resource.Field: declared (entitled $metadata) · published catalogue (Field →
//                        LookupName → Lookup = vocabulary authority) · selectable · filterable · population
//                        (all statuses / Active / by status) · availability class WITH evidence · observed
//                        vocabulary (diagnostic; raw combinations kept apart from members)
//   PROVIDER ACCESS PATH per navigation: declared · HTTP · collection present · populated by status · key
//                        linkage · direct entity-set access · second hop (navigation-capability.mjs on
//                        representative Active/Pending/ComingSoon/Closed rows; navigation-census.mjs walks).
//                        A null Property scalar NEVER implies the related record is unavailable.
//   MALLAN CONSUMERS     per field, MANY consumers, each an independent column: raw selection (per
//                        authority) · mapper · raw / structured persistence · reload proof · Sale Search ·
//                        Rental Search · Sale Form · Rental Form · Sale Tools · Rental Tools · CMA ·
//                        reporting · saved search · alerts · result DTO · cards · listing workspace ·
//                        marketing · portal/private sharing · public display · compliance · tests
//                        (direct/negative/integration/downstream/compliance/reload) · behaviour register ·
//                        runtime proof. COMPLETE only when every required consumer for the field's primary
//                        semantic is mechanically PASS; anything reachable-only or unproven stays UNVERIFIED.
//
//   One provider field → one primary semantic → many Mallan consumers → many business domains served.
//   Sale and Rental are never conflated: search criteria are classified by the workflow context of the
//   reading code, forms and tools by the surface they belong to.
//
//   node scripts/cotality/search-coverage-matrix.mjs [--out=docs/operations/evidence-2026-09-08/search-coverage-matrix]

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { ROOT } from './authority/lib.mjs';
import { analyzeMapper, createProgram, crmJsReaders, findReaders, importGraph, topLevelLists, transitiveImporters } from './authority/impact.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const outBase = path.resolve(ROOT, arg('out', 'docs/operations/evidence-2026-09-08/search-coverage-matrix'));
const EVIDENCE = path.join(ROOT, 'docs/operations/evidence-2026-09-08');
const loadJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
// A file listed by readdir can vanish before it is read (a running test suite writes and deletes probe files); skip it.
const safeRead = (p) => { try { return readFileSync(p, 'utf8'); } catch (e) { if (e && e.code === 'ENOENT') return ''; throw e; } };
const fmtN = (n) => (n == null ? 'n/a' : Number(n).toLocaleString('en-US'));
const uniq = (a) => [...new Set(a)];
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// ── Inputs ─────────────────────────────────────────────────────────────────
const compact = JSON.parse(readFileSync(path.join(ROOT, 'data/cotality-contract/contract.compact.json'), 'utf8'));
const lookups = JSON.parse(readFileSync(path.join(ROOT, 'data/cotality-contract/lookups.live.json'), 'utf8'));
const catalogue = loadJson(path.join(EVIDENCE, 'vocabulary/field-catalogue.json'));
const amenity = loadJson(path.join(EVIDENCE, 'amenities/amenity-census-active.json'));
const enumCensus = loadJson(path.join(EVIDENCE, 'vocabulary/enum-member-census-all.json'));
const observed = loadJson(path.join(EVIDENCE, 'vocabulary/observed-vocabulary-all.json'));
const supActive = loadJson(path.join(EVIDENCE, 'suppressed/suppressed-census-active.json'));
const supAll = loadJson(path.join(EVIDENCE, 'suppressed/suppressed-census-property-all.json'));
const navActive = loadJson(path.join(EVIDENCE, 'building/navigation-census-active.json'));
const navAll = loadJson(path.join(EVIDENCE, 'building/navigation-census-all.json'));
const navCap = loadJson(path.join(EVIDENCE, 'navigation/navigation-capability-matrix.json'));
const txn = loadJson(path.join(EVIDENCE, 'transaction-state/transaction-state-census.json'));
const mediaCensus = {};
for (const f of ['MediaCategory', 'MediaStatus', 'MediaType']) mediaCensus[f] = loadJson(path.join(EVIDENCE, `media/${f}.json`));
const production = loadJson(path.join(EVIDENCE, 'production-state-2026-09-08.json'));

const RES = compact.resources;
const P = RES.Property.fields;
const CP = RES.CustomProperty?.fields || {};
const allProperty = Object.keys(P).sort();
const ENTITLED = Object.keys(RES).filter((r) => RES[r].access?.state === 'accessible');
const SUBSECTION_RESOURCES = ['Media', 'OpenHouse', 'CustomProperty', 'PropertyRooms', 'PropertyUnitTypes', 'Member', 'Office'];

const catByRes = new Map();
for (const f of catalogue?.fields || []) { if (!catByRes.has(f.ResourceName)) catByRes.set(f.ResourceName, new Map()); catByRes.get(f.ResourceName).set(f.FieldName, f); }
const catalogueRow = (resource, field) => catByRes.get(resource === 'CustomProperty' ? 'Custom_Property' : resource)?.get(field) || null;

// ── Provider documentation facts (read 2026-09-08; cited, not inferred) ─────
const PROVIDER_DOCS = [
  ['Getting Started', 'https://trestle-documentation.corelogic.com/web-api/', 'OAuth2 client credentials, tokens up to 8 hours; $top max 1,000; @odata.nextLink paging; ListingKey is the unique Property identifier, Media.ResourceRecordKey relates to Property.ListingKey; quotas per product/feed-type pair with a separate media-URL quota.'],
  ['WebAPI Reference', 'https://trestle-documentation.corelogic.com/web-api/reference/', "$filter eq/ne/gt/ge/lt/le/and/or/not/has/in; key-field-only queries up to 300,000 rows; $expand with nested $select/$filter/$orderby/$top; $apply=groupby() returns unique values (max 10,000); Replication=true for >1,000,000 rows; multi-select checked with `has 'A,B'`."],
  ['Growing to Scale', 'https://trestle-documentation.corelogic.com/web-api/at-scale/', 'ModificationTimestamp is when the record last changed in Trestle; PhotosChangeTimestamp lives on Property and describes the media; removals are found only by key reconciliation; recommended $expand=Rooms,Units,OpenHouse,CustomProperty,Media.'],
  ['Property resource', 'https://trestle-documentation.corelogic.com/metadata/resources/Property/', 'InKeyIndex: ListingId, ListingKey, ModificationTimestamp, PhotosChangeTimestamp, PhotosCount, PostalCode, StandardStatus. ListingId is the human identifier and is not guaranteed unique across MLSs; ListingKey is.'],
  ['Media resource', 'https://trestle-documentation.corelogic.com/metadata/resources/Media/', 'ResourceRecordKey = primary key of the related record in ResourceName (Property, Member, Office, …); MediaCategory covers Photo, Document, Video, UnbrandedVirtualTour, BrandedVirtualTour, FloorPlan, OfficeLogo…; Permission enum on Media; Order 1 = primary photo.'],
  ['Member / Office resources', 'https://trestle-documentation.corelogic.com/metadata/resources/Member/', 'MemberKey/OfficeKey are system-unique keys; MemberMlsId/OfficeMlsId are the local ids; OfficeBrokerKey/OfficeManagerKey are foreign keys to Member; BuyerAgentKey/ListAgentKey on Property are foreign keys to Member.'],
  ['Enumerations P-S / M-O', 'https://trestle-documentation.corelogic.com/metadata/enumerations/P-S/', 'StandardStatus has 11 members; Permission members incl. IDX, VOW, Private, Public, OfficeOnly, FirmOnly, AgentOnly, OfficeInactive, OfficeIDXOptOUT, PhotoOptedOut, History; MediaCategory incl. Video, UnbrandedVirtualTour, BrandedVirtualTour.'],
  ['REBNY RLS FAQ / technical solutions', 'https://www.rebny.com/rls-faqs/', 'Feeds: IDX, VOW, Broker Exclusive, Back Office, CMA, Analytics; Trestle aggregates and normalizes RLS data; IDXEntireListingDisplayYN=No → VOW only; owner opt-out via UCBA Exhibit B; Broker A may opt the firm out of IDX.'],
  ['DataSystem (live)', 'https://api.cotality.com/trestle/odata/DataSystem', 'ID Trestle-11371-20 "IDX Plus feed for Mallan Real Estate Inc", TransportVersion 1.0.0, DataDictionaryVersion 2.0 (read live 2026-09-08).'],
  ['IDX Plus workbook', 'data/rebny-idx-plus-3.15.26.xlsx (REBNY, 2026-03-15)', 'One sheet, 902 rows: Date Feed · Resource · Standard Name · Standard Type. Mirrored (plus 321 live-discovered fields) in data/rebny-rls-property-fields.csv. Discovery aid only — never an authority.'],
];

// ── Primary semantics (declared policy; ONE per field) ──────────────────────
const PRIMARY = [
  ['Tours & video', 'media', /^(VirtualTourURL|VideosCount|VideosChangeTimestamp)/],
  ['Media counts & timestamps', 'media', /^(PhotosCount|PhotosChangeTimestamp|FloorPlansCount|TotalFloorPlansCount|FloorPlansChangeTimestamp|Documents)/],
  ['Permissions & visibility', 'permissions', /^(Permission|Internet.*DisplayYN|InternetConsumerCommentYN|SyndicateTo|SyndicationRemarks|SourceMlsUrl|AttributionContact)$/],
  ['Showing, access & private contacts', 'reference', /^(Showing|LockBox|Occupant|StartShowingDate|AccessCode|OwnerName|OwnerName2|OwnerPhone|OpenHouseModificationTimestamp)/],
  ['Security & doorman', 'searchable', /^(SecurityFeatures)$/],
  ['Laundry', 'searchable', /^Laundry/],
  ['Parking', 'searchable', /^(Parking|Garage|Carport|OpenParking|OtherParking|RVParking|CoveredSpaces|AttachedGarageYN)/],
  ['Pools & spa', 'searchable', /^(Pool|Spa)/],
  ['Accessibility', 'searchable', /^Accessibility/],
  ['Pets', 'searchable', /^(Pets|PetDeposit|MaximumNumberOfPets|MaximumPetWeight)/],
  ['Transportation & schools', 'searchable', /^(DistanceTo|WalkScore|ElementarySchool|MiddleOrJuniorSchool|HighSchool)/],
  ['Compensation & concessions', 'reference', /^(BuyerBrokerageCompensation|SubAgencyCompensation|TransactionBrokerCompensation|CompensationComments|DualOrVariableRateCommissionYN|ConcessionInPrice|Concessions|SellerConsiderConcessionYN|LeaseRenewalCompensation)/],
  ['Farm, agricultural & manufactured-home', 'reference', /^(BodyType|Make$|Model$|SerialU$|SerialX$|SerialXX$|Skirt$|ParkName|ParkManager|DOH[123]$|License[123]$|Mobile|GrazingPermits|HorseYN|HorseAmenities|IrrigationSource|IrrigationWater|FarmCreditServiceInclYN|FarmLand|CropsIncluded|CultivatedArea|PastureArea|RangeArea|WoodedArea|RoadResponsibility|PowerProduction|Vegetation|Topography|Fencing|FrontageType|RoadSurfaceType|RoadFrontageType)/],
  ['Geography & map', 'searchable', /^(Street|UnitNumber$|UnparsedAddress|City|CityRegion|SubdivisionName|PostalCity|PostalCode|StateOrProvince|Country|CountyOrParish|CountrySubdivision|MLSArea|Latitude|Longitude|MapCoordinate|MapURL|X_GeocodeSource|CrossStreet|Directions|BuildingName|TaxBlock|TaxLot|TaxMapNumber|Zoning|Elevation|Township|StateRegion|ContinentRegion|CountryRegion|CarrierRoute|PublicSurvey|ParcelNumber|ParcelSubcomponent|AdditionalParcels|UniversalParcelId)/],
  ['Amenities & building features', 'searchable', /^(BuildingFeatures|CommunityFeatures|AssociationAmenities|ExteriorFeatures|InteriorFeatures|Appliances|OtherEquipment|Cooling|Heating|Fireplace|WindowFeatures|DoorFeatures|Flooring|View|PatioAndPorchFeatures|Furnished|Utilities|Green|OtherStructures|CommonWalls|Basement|Roof|ConstructionMaterials|ArchitecturalStyle|DirectionFaces|ElectricOnPropertyYN|Sewer|WaterSource|Foundation|Exposures|WaterfrontFeatures|WaterfrontYN|LotFeatures|SeniorCommunityYN|UnitsFurnished)/],
  ['Rental terms & fees', 'rental', /^(Lease|AvailabilityDate|AvailableLeaseType|ExistingLeaseType|SecurityDeposit|MoveInCosts|OngoingFees|TenantPays|OwnerPays|RentIncludes|LandLease|TotalActualRent)/],
  ['Financial & carrying costs', 'display', /^(Association|Tax|SpecialListingConditions|DownPaymentAssistance|CurrentFinancing|FinancialDataSource|Gross|Net|Operating|Income|CapRate|.*Expense$|VacancyAllowance|ListingTerms|BuyerFinancing|Trust|Cap|Fee|Rent|Deposit|Insurance|Manager|Supplies|Pest|Trash|Water|Fuel|Gardener|Electric|Maintenance|Workmans|NewTaxes|OtherExpense|Professional|FhaEligibility)/],
  ['Lifecycle, status & dates', 'lifecycle', /^(StandardStatus|MlsStatus|PreviousStandardStatus|StatusChangeTimestamp|OriginalEntryTimestamp|ListingContractDate|OnMarket|OffMarket|ActivationDate|CloseDate|PurchaseContractDate|PendingTimestamp|WithdrawnDate|BackOnMarket|ExpirationDate|DaysOnMarket|CumulativeDaysOnMarket|DelayedMarketing|MajorChange|ContractStatusChangeDate|ContingentDate|CancellationDate|Contingency|EstimatedCloseDate|SaleOrLeaseIndicator|CompSaleYN)/],
  ['Identity & sync keys', 'identity', /^(ListingKey|ListingKeyNumeric|ListingId|SourceSystem|OriginatingSystem|ModificationTimestamp|HumanModifiedYN|RecordSignature|UniversalPropertyId|UniversalPropertySubId|CLIP$|X_|ListingURL|ListingService|ListingAgreement)/],
  ['Pricing', 'pricing', /^(ListPrice|OriginalListPrice|PreviousListPrice|PriceChangeTimestamp|ClosePrice|ListPriceLow|CurrentPrice)$/],
  ['Classification & building facts', 'searchable', /^(PropertyType|PropertySubType|CommonInterest|OwnershipType|StructureType|NewConstructionYN|DevelopmentStatus|YearBuilt|YearEstablished|YearsCurrentOwner|Stories|NumberOf|BuilderName|BuilderModel|PropertyCondition|PropertyAttachedYN|BuildingKey|BuildingKeyNumeric|BuildingAreaTotal|BuildingAreaSource|BuildingAreaUnits|Levels|EntryLevel|EntryLocation|BusinessName|BusinessType|CurrentUse|PossibleUse|AnchorsCoTenants|LeasableArea|SeatingCapacity|HoursDaysOfOperation|LaborInformation)/],
  ['Size & rooms', 'searchable', /^(Bedrooms|Bathrooms|LivingArea|RoomsTotal|RoomType|AboveGrade|BelowGrade|LotSize|LotDimensions|FrontageLength|MainLevel|Room|FoundationArea|UnitTypeType)/],
  ['Remarks & disclosures', 'text', /^(PublicRemarks|PrivateRemarks|PrivateOfficeRemarks|Disclaimer|CopyrightNotice|Disclosures|Exclusions|Inclusions|Ownership$|Possession|Restrictions|SpecialLicenses|SignOnPropertyYN|HomeWarrantyYN|Habitable)/],
  ['Agent & office attribution', 'attribution', /^(ListAgent|CoListAgent|BuyerAgent|CoBuyerAgent|ListOffice|CoListOffice|BuyerOffice|CoBuyerOffice|ListTeam|BuyerTeam|CoListTeam|CoBuyerTeam|ListAOR|BuyerAOR|CoList.*AOR|CoBuyer.*AOR|OfficeLogo|PhotoOptedOut|ListingCharacteristics|HeadBrokerMember)/],
];
function primaryOf(field) { for (const [name, category, re] of PRIMARY) if (re.test(field)) return { name, category }; return null; }
{ const left = allProperty.filter((f) => !primaryOf(f)); if (left.length) throw new Error(`Every live Property field needs ONE declared primary semantic; unclassified: ${left.join(', ')}`); }

const SERVES = [
  [/^(StandardStatus|MlsStatus|PreviousStandardStatus|StatusChangeTimestamp|CloseDate|ClosePrice|PurchaseContractDate|PendingTimestamp|OnMarketDate|OffMarketDate|ListingContractDate|DaysOnMarket|CumulativeDaysOnMarket|ActivationDate|MajorChangeType|ContractStatusChangeDate)$/, ['DOM', 'Permissions & visibility', 'Sale Search', 'Rental Search', 'Saved Search', 'Alerts', 'CMA', 'Reports']],
  [/^Permission$|^Internet.*DisplayYN$|^InternetConsumerCommentYN$|^SyndicateTo$/, ['Public display', 'Portal & private sharing', 'Marketing', 'Compliance', 'Sale Search', 'Rental Search']],
  [/^(BuildingFeatures|ExteriorFeatures|InteriorFeatures|Appliances|LaundryFeatures|SecurityFeatures|ParkingFeatures|PoolFeatures|SpaFeatures|AccessibilityFeatures|PetsAllowed|View|Cooling|Heating|CommunityFeatures|AssociationAmenities|PatioAndPorchFeatures)$/, ['Sale Search', 'Rental Search', 'Building search', 'Public display', 'Reports', 'CMA', 'Sale Form', 'Rental Form']],
  [/^(ListAgent|ListOffice|CoListAgent|CoListOffice|BuyerAgent|BuyerOffice|CoBuyerAgent|CoBuyerOffice)/, ['Agent search', 'Brokerage identity', 'Compliance', 'Reports', 'Public display', 'CMA']],
  [/^(VirtualTourURL|VideosCount|PhotosCount|PhotosChangeTimestamp)/, ['Media', 'Sale Search', 'Rental Search', 'Search results', 'Listing workspace', 'Marketing', 'Sale Tools', 'Rental Tools']],
  [/^(ListPrice|OriginalListPrice|PreviousListPrice|ClosePrice|PriceChangeTimestamp)$/, ['Sale Search', 'Rental Search', 'Saved Search', 'Alerts', 'CMA', 'Reports', 'Sale Tools', 'Rental Tools']],
  [/^(CityRegion|SubdivisionName|PostalCode|City|CountyOrParish|UnparsedAddress|StreetName|StreetNumber|UnitNumber|BuildingName|Latitude|Longitude)$/, ['Sale Search', 'Rental Search', 'Saved Search', 'Reports', 'CMA', 'Public display', 'Map']],
  [/^(PropertyType|PropertySubType|CommonInterest|StructureType|YearBuilt|BedroomsTotal|BathroomsTotalInteger|BathroomsFull|LivingArea)$/, ['Sale Search', 'Rental Search', 'Saved Search', 'Alerts', 'CMA', 'Reports', 'Public display']],
  [/^(Lease|AvailabilityDate|SecurityDeposit|MoveInCosts|OngoingFees|TenantPays|OwnerPays|RentIncludes|Furnished|PetsAllowed|PetDeposit)/, ['Rental Search', 'Rental Form', 'Rental Tools', 'Compliance']],
  [/^PublicRemarks$/, ['Sale Search', 'Rental Search', 'Public display', 'Compliance', 'Marketing']],
  [/^(ListingKey|ListingId|ModificationTimestamp|PhotosChangeTimestamp)$/, ['Sync', 'Media']],
];
const STAGE_DOMAIN = { projection: 'Search', criterion: 'Search', sorting: 'Search', resultDto: 'Search results', resultCard: 'Search results', listingWorkspace: 'Listing workspace', savedSearch: 'Saved Search', alerts: 'Alerts', cma: 'CMA', reports: 'Reports', marketing: 'Marketing', portalSharing: 'Portal & private sharing', publicConsumer: 'Public display', complianceRule: 'Compliance', mediaLane: 'Media', sync: 'Sync', saleTools: 'Sale Tools', rentalTools: 'Rental Tools', saleForm: 'Sale Form', rentalForm: 'Rental Form' };

// Required consumers per primary category (declared policy). `searchPath` = projection | criterion | amenity map.
const REQUIRED = {
  reference: ['rawSelection', 'mapper', 'persistence', 'directTest'],
  identity: ['rawSelection', 'mapper', 'persistence', 'directTest'],
  searchable: ['rawSelection', 'mapper', 'persistence', 'saleSearch', 'rentalSearch', 'resultDto', 'resultCard', 'publicConsumer', 'directTest'],
  display: ['rawSelection', 'mapper', 'persistence', 'resultDto', 'publicConsumer', 'saleForm', 'directTest'],
  rental: ['rawSelection', 'mapper', 'persistence', 'rentalSearch', 'resultDto', 'publicConsumer', 'rentalForm', 'rentalTools', 'complianceRule', 'directTest'],
  attribution: ['rawSelection', 'mapper', 'persistence', 'resultDto', 'publicConsumer', 'complianceRule', 'cma', 'reports', 'directTest'],
  permissions: ['rawSelection', 'mapper', 'persistence', 'complianceRule', 'publicConsumer', 'portalSharing', 'publicBehavior', 'memberBehavior', 'privateSharingBehavior', 'directTest'],
  lifecycle: ['rawSelection', 'mapper', 'persistence', 'saleSearch', 'rentalSearch', 'resultDto', 'savedSearch', 'alerts', 'cma', 'reports', 'complianceRule', 'directTest'],
  pricing: ['rawSelection', 'mapper', 'persistence', 'saleSearch', 'rentalSearch', 'resultDto', 'savedSearch', 'alerts', 'cma', 'reports', 'saleTools', 'directTest'],
  media: ['rawSelection', 'mapper', 'persistence', 'searchPath', 'resultDto', 'resultCard', 'publicConsumer', 'listingWorkspace', 'saleTools', 'rentalTools', 'directTest'],
  text: ['rawSelection', 'mapper', 'persistence', 'resultDto', 'publicConsumer', 'complianceRule', 'directTest'],
};
const BEHAVIOR_STAGES = ['publicBehavior', 'memberBehavior', 'privateSharingBehavior', 'reportBehavior'];

// Tool surfaces (declared policy): module → sale | rental | both.
// Tool surfaces are the agent TOOLS (pricing, net sheet, commission, financing, investment, comps, showing/open-house,
// documents, marketing/publication controls) — NOT the generic listing workspace (app/api/crm, dashboard JS), which is
// its own column. Scope is declared per module and printed in §L.
const TOOL_SCOPE = [
  [/^lib\/(finance|commission|commission-tracker|seller-report|pitch-packet|seller-signals|seller-readiness)\/|^lib\/commission\.ts$/, 'sale'],
  [/^app\/components\/(AffordabilityCalculator|MortgageModal|InvestorCalculator|SellerClosingCostCalculator|PriceWithCalculator|HomeValueWidget|SellerCTA)\.tsx$/, 'sale'],
  [/^lib\/(rental-signals)\//, 'rental'],
  [/^app\/components\/(RentVsBuyCalculator|RentVsBuyStandalone|CommuteCalculator|CalculatorLeadCapture)\.tsx$/, 'both'],
  [/^lib\/(open-houses|showing-scheduler|document-vault|email|syndication|listing-auditor|market-report|cma|comps)\//, 'both'],
  [/^public\/crm\/js\/(output|campaigns)\//, 'both'],
  [/^public\/crm\/js\/listing\/toolbar-functions\.js$|^public\/crm\/js\/manage\/open-houses\.js$/, 'both'],
  [/^app\/api\/crm\/(cma|reports|documents|open-houses|showings|campaigns|marketing|net-sheet|commission|pricing|listing-sends|share)/, 'both'],
];
const toolScopeOf = (file) => { for (const [re, s] of TOOL_SCOPE) if (re.test(file)) return s; return null; };

// Behaviour register: documented findings with a citation whose code pattern is re-verified at generation time.
const BEHAVIOR_REGISTER = [
  { field: 'Permission', stage: 'memberBehavior', status: 'DEFECT', cite: 'docs/operations/STEP3-FORBIDDEN-AUTHORITY-LEDGER.md §13.3', pattern: ['lib/search/engine/hydrate.ts', /idxPermitted !== false/], note: 'authenticated backend Search excludes Permission=Private rows; latent (0 Private rows live)' },
  { field: 'Permission', stage: 'publicBehavior', status: 'DEFECT', cite: 'docs/operations/STEP3-FORBIDDEN-AUTHORITY-LEDGER.md §13.4', pattern: ['lib/idx/db-to-public-dto.ts', /rls_eligible === false\) return 'website-only'/], note: 'public displayability bypasses the Mallan owner-opt-out gate for rls_eligible=false rows; latent (0 opt-out rows)' },
  { field: 'Permission', stage: 'privateSharingBehavior', status: 'UNVERIFIED', cite: 'docs/operations/STEP3-FORBIDDEN-AUTHORITY-LEDGER.md §13.5', note: 'listing-sends, campaigns and portals not traced against the visibility model' },
  { field: 'InternetEntireListingDisplayYN', stage: 'publicBehavior', status: 'PASS', cite: 'lib/compliance/__tests__/compliance-gates.test.ts (fail-open lock, 2026-05-01)', pattern: ['lib/compliance/__tests__/compliance-gates.test.ts', /InternetEntireListingDisplayYN/], note: 'test-proven fail-open (!== false); provider nulls the field on every row' },
  { field: 'InternetAddressDisplayYN', stage: 'publicBehavior', status: 'PASS', cite: 'lib/compliance/__tests__/compliance-gates.test.ts', pattern: ['lib/compliance/__tests__/compliance-gates.test.ts', /InternetAddressDisplayYN/], note: 'test-proven fail-open' },
];
for (const b of BEHAVIOR_REGISTER) {
  if (!b.pattern) continue;
  const [file, re] = b.pattern;
  const p = path.join(ROOT, file);
  b.citationVerified = existsSync(p) && re.test(readFileSync(p, 'utf8'));
  if (!b.citationVerified) b.status = 'CITATION-STALE';
}
const prodResults = Object.assign({}, ...(production?.queries || []).map((q) => q.result));
const PRODUCTION_PROOF = production ? {
  Latitude: { status: 'FAIL', note: `stored coordinates: address ${fmtN(prodResults.address_latitude_present)} / projection ${fmtN(prodResults.projection_latitude_present)} of ${fmtN(prodResults.listings_rows)} rows` },
  Longitude: { status: 'FAIL', note: `stored coordinates: address ${fmtN(prodResults.address_latitude_present)} / projection ${fmtN(prodResults.projection_latitude_present)} of ${fmtN(prodResults.listings_rows)} rows` },
  VirtualTourURLUnbranded: { status: 'FAIL', note: `raw carrier on ${fmtN(prodResults.raw_unbranded_present)} rows; projection has_virtual_tour true on ${fmtN(prodResults.projection_has_tour_true)} (branch not deployed, no backfill)` },
  VirtualTourURLBranded: { status: 'FAIL', note: `raw carrier on ${fmtN(prodResults.raw_branded_present)} rows; projection flag true on ${fmtN(prodResults.projection_has_tour_true)}` },
  VirtualTourURLUnbranded2: { status: 'FAIL', note: `absent from every stored raw_data (${fmtN(prodResults.raw_unbranded2_present)})` },
  VideosCount: { status: 'FAIL', note: `absent from every stored raw_data (${fmtN(prodResults.raw_videoscount_present)})` },
  DaysOnMarket: { status: 'N/A', note: 'never stored (provider-suppressed); Mallan DOM is computed' },
  MlsStatus: { status: 'INFO', note: `${fmtN(prodResults.raw_mlsstatus_present)} stored rows carry a value (non-provider rows)` },
  InternetEntireListingDisplayYN: { status: 'INFO', note: `${fmtN(prodResults.raw_ieldy_present)} stored rows carry a value (non-provider rows)` },
} : {};

// ── Program + readers ───────────────────────────────────────────────────────
const ctx = createProgram();
const { bindings, fetched } = analyzeMapper(ctx);
const CONTAINERS = ['features', 'address', 'agent_info', 'raw_data', 'media', 'compliance'];
const providerFieldsAll = new Set();
for (const r of ['Property', ...SUBSECTION_RESOURCES]) for (const f of Object.keys(RES[r]?.fields || {})) providerFieldsAll.add(f);
const typedColumns = new Set();
for (const arr of bindings.values()) for (const b of arr) { const m = /^listings\.([a-z_]+)$/.exec(b.node); if (m) typedColumns.add(m[1]); }
const jsonKeys = [];
for (const f of allProperty) for (const c of CONTAINERS) jsonKeys.push(`${c}.${f}`);
const memberFields = allProperty.filter((f) => P[f].enum && (lookups.Property?.[f]?.members?.length || 0) <= 150 && (P[f].populated > 0 || P[f].filterable === false));
const memberSet = uniq(memberFields.flatMap((f) => lookups.Property?.[f]?.members || []));
const readers = findReaders(ctx, { columns: [...typedColumns], jsonKeys, providerFields: [...providerFieldsAll], members: memberSet });
const crmJs = crmJsReaders(uniq([...allProperty, ...typedColumns]));
const importers = importGraph(ctx);
const transitiveCache = new Map();
const importersOf = (file) => { if (!transitiveCache.has(file)) transitiveCache.set(file, transitiveImporters(importers, file)); return transitiveCache.get(file); };
const TRANSITIVE_STAGES = ['savedSearch', 'alerts', 'cma', 'reports', 'marketing', 'portalSharing', 'publicConsumer', 'resultCard', 'listingWorkspace'];

// ── Mallan form contract (parsed from the TypeScript AST, never hand-typed) ──
const FORM_CONTRACT = { aliasToCanonical: {}, persistenceMap: {}, internalKeys: [] };
{
  const sf = ctx.files.get('lib/listings/mallan-form-contract.ts');
  if (!sf) throw new Error('lib/listings/mallan-form-contract.ts is not in the program');
  const unwrap = (e) => { let x = e; while (x && (ts.isAsExpression(x) || ts.isParenthesizedExpression(x) || ts.isSatisfiesExpression?.(x) || ts.isTypeAssertionExpression?.(x))) x = x.expression; return x; };
  const readObject = (obj, onEntry) => { for (const p of obj.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) onEntry(p.name.text, unwrap(p.initializer)); };
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const init = unwrap(n.initializer);
      if (n.name.text === 'MALLAN_FORM_CONTRACT' && init && ts.isObjectLiteralExpression(init)) {
        readObject(init, (k, v) => {
          if (k === 'aliasToCanonical' && ts.isObjectLiteralExpression(v)) readObject(v, (a, t) => { if (ts.isStringLiteralLike(t)) FORM_CONTRACT.aliasToCanonical[a] = t.text; });
          if (k === 'persistenceMap' && ts.isObjectLiteralExpression(v)) readObject(v, (c, t) => { if (ts.isObjectLiteralExpression(t)) { const e = {}; readObject(t, (pk, pv) => { e[pk] = ts.isStringLiteralLike(pv) ? pv.text : pv.getText(sf) === 'true'; }); FORM_CONTRACT.persistenceMap[c] = e; } });
        });
      }
      if (n.name.text === 'MALLAN_INTERNAL_KEYS' && init && ts.isArrayLiteralExpression(init)) FORM_CONTRACT.internalKeys = init.elements.filter(ts.isStringLiteralLike).map((e) => e.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!Object.keys(FORM_CONTRACT.aliasToCanonical).length || !Object.keys(FORM_CONTRACT.persistenceMap).length) throw new Error('MALLAN_FORM_CONTRACT could not be parsed from lib/listings/mallan-form-contract.ts');
}
const INTERNAL = new Set(FORM_CONTRACT.internalKeys);
function resolveFormKey(key) {
  for (const cand of [key, lowerFirst(key), key.charAt(0).toUpperCase() + key.slice(1)]) {
    if (FORM_CONTRACT.aliasToCanonical[cand]) return { canonical: FORM_CONTRACT.aliasToCanonical[cand], via: `alias ${cand}` };
    if (P[cand]) return { canonical: cand, via: 'Cotality Property field' };
    if (CP[cand]) return { canonical: cand, via: 'Cotality CustomProperty field' };
    if (INTERNAL.has(cand)) return { canonical: cand, via: 'Mallan-internal key' };
  }
  return null;
}
// ── CRM surfaces: the four HTML files, controls resolved through the contract ──
const SURFACES = {
  saleForm: 'public/crm/SALE-FORM-REDESIGN.html', rentalForm: 'public/crm/RENTAL-FORM-REDESIGN.html',
  saleTools: 'public/crm/SALE-FORM-WITH-TOOLS.html', rentalTools: 'public/crm/RENTAL-FORM-WITH-TOOLS.html',
};
// Binding authority inside the HTML (asserted by tests/runtime/rls-form-bindings-canonical.test.ts): the runtime
// serializer keys a control by `id || name`; `data-rls-field="<Canonical>"` binds it to a canonical field,
// `data-mallan-field` to a Mallan decision key, `data-rls-ignore="true"` marks Mallan-only UI. A control with none
// of those is resolved through the prefix rule as a last resort. WITH-TOOLS pages carry `data-rls-viewer="true"`.
const surfaceControls = {}; // surface -> Map<canonical, controls[]>
const surfaceStats = {};
for (const [surface, rel] of Object.entries(SURFACES)) {
  const p = path.join(ROOT, rel);
  const map = new Map();
  const stat = { file: rel, controls: 0, keyed: 0, rlsField: 0, mallanField: 0, ignored: 0, prefixResolved: 0, resolved: 0, unresolved: [], viewer: null };
  if (existsSync(p)) {
    const text = safeRead(p);
    const attr = (s, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(s); return m ? m[1] : null; };
    const ids = new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const seenKeys = new Set();
    for (const t of text.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const a = t[2];
      stat.controls += 1;
      const key = attr(a, 'id') || attr(a, 'name');
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      stat.keyed += 1;
      const rls = attr(a, 'data-rls-field');
      const mallan = attr(a, 'data-mallan-field');
      const ignore = attr(a, 'data-rls-ignore') === 'true';
      let canonical = null;
      let via = null;
      if (rls) { canonical = rls; via = 'data-rls-field'; stat.rlsField += 1; }
      else if (mallan) { canonical = mallan; via = 'data-mallan-field'; stat.mallanField += 1; }
      else if (ignore) { stat.ignored += 1; continue; }
      else { const m = /^(sale|rental|bldg)([A-Z_].*)$/.exec(key); if (m) { const r = resolveFormKey(m[2].replace(/^_/, '')); if (r) { canonical = r.canonical; via = r.via; stat.prefixResolved += 1; } } }
      if (!canonical) { stat.unresolved.push(key); continue; }
      stat.resolved += 1;
      if (!map.has(canonical)) map.set(canonical, []);
      map.get(canonical).push({ control: key, via, ignore, persistence: FORM_CONTRACT.persistenceMap[canonical] || null });
    }
    if (/data-rls-viewer="true"/.test(text)) {
      // hydration targets: getElementById(...) plus the viewer's own setters (viewerSetVal / setVal / setChecked / setRadio)
      const names = new Set([...text.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]));
      const targets = uniq([...text.matchAll(/(?:getElementById|viewerSetVal|viewerSetChecked|viewerSetRadio|setVal|setChecked|setRadio)\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
      stat.viewer = { targets: targets.length, missingTargets: targets.filter((x) => !ids.has(x) && !names.has(x)) };
    }
  }
  surfaceControls[surface] = map;
  surfaceStats[surface] = stat;
}
// tools-only controls: on the WITH-TOOLS page but not on the entry form
for (const [tools, form] of [['saleTools', 'saleForm'], ['rentalTools', 'rentalForm']]) {
  const only = new Map();
  for (const [canon, ctrls] of surfaceControls[tools]) { const formCtrls = new Set((surfaceControls[form].get(canon) || []).map((c) => c.control)); const extra = ctrls.filter((c) => !formCtrls.has(c.control)); if (extra.length) only.set(canon, extra); }
  surfaceControls[`${tools}Only`] = only;
}

// ── Stage classification (a file may serve several stages) ─────────────────
const STAGE_RULES = [
  ['projection', (f) => f === 'lib/search/listing-search-projection.ts' || f === 'lib/search/types.ts'],
  ['criterion', (f) => /^lib\/search\/engine\/(criteria|provider-query|universe|executor|contract)\.ts$/.test(f) || /^lib\/search\/(public-listing-db|public-listing-trestle|natural-language-parser|nyc-dictionary|suggest-classify)\.ts$/.test(f) || f.startsWith('app/api/idx/search/') || f === 'app/api/listings/route.ts' || f === 'app/api/listings/suggest/route.ts' || f.startsWith('lib/search/canonical/')],
  ['sorting', (f) => f === 'lib/search/canonical/sort.ts' || f === 'lib/search/engine/provider-query.ts' || f === 'lib/search/public-listing-db.ts'],
  ['select', (f) => f === 'lib/search/engine/select.ts' || f === 'lib/idx/card-fields.ts' || f === 'lib/idx/trestle-mapper.ts'],
  ['resultDto', (f) => /^lib\/search\/crm-idx-mapper\.ts$|^lib\/idx\/(db-to-public-dto|public-dto|display-adapter|public-listing-summary)\.ts$/.test(f) || f === 'lib/search/engine/hydrate.ts' || f === 'lib/compliance/dto.ts'],
  ['resultCard', (f) => /^app\/components\/(SearchListingCard|FeaturedListings|SimilarListings|RecentlyViewed|CompareProperties|OpenHousesList|ExclusivesVault|SearchMap|SearchChips|SearchFilterPanel|HeroSearch|SearchAutocomplete|CardPhotoNav)\.tsx$/.test(f) || /^app\/(search|results|buy|rent|favorites|compare)\//.test(f)],
  ['publicConsumer', (f) => f.startsWith('app/listing/') || f.startsWith('app/components/listing-detail/') || /^app\/components\/(ListingMediaGallery|ListingSidePanel|PriceHistory|SchoolInfo|NearestStations|BuildingUnits|BuildingViolations|OpenHouseBanner|ComingSoonBadge|FareActFeeBadge|AgencyDisclosure|IDXDisclaimer|ListingOpenHouseRSVP|MarketSnapshot)\.tsx$/.test(f) || /^app\/(building|buildings|neighborhoods|manhattan|brooklyn|queens|bronx|staten-island|open-houses|market)\//.test(f) || (f.startsWith('app/api/listings/') && f !== 'app/api/listings/route.ts') || (f.startsWith('app/api/idx/') && !f.startsWith('app/api/idx/search/')) || f.startsWith('app/api/buildings/') || f.startsWith('app/api/open-houses/') || f.startsWith('app/api/neighborhoods/') || f.startsWith('lib/buildings/') || f.startsWith('lib/open-houses/') || f.startsWith('lib/neighborhoods/') || f === 'app/sitemap.ts' || f.startsWith('app/api/agents/')],
  ['listingWorkspace', (f) => f.startsWith('app/api/crm/') || f.startsWith('lib/crm/') || f.startsWith('lib/listings/') || f.startsWith('app/admin/') || f.startsWith('lib/listing-auditor/') || f.startsWith('public/crm/')],
  ['savedSearch', (f) => f === 'lib/search/engine/saved-search.ts' || f === 'lib/search/saved-search-read.ts' || f.startsWith('app/saved-searches/') || f.startsWith('app/api/search-alerts/')],
  ['alerts', (f) => f === 'lib/search/alert-delivery-history.ts' || f.startsWith('app/api/search-alerts/') || /^app\/api\/cron\/.*(alert|digest)/.test(f) || f.startsWith('lib/notifications/') || /^lib\/email\/.*(alert|digest|saved)/.test(f)],
  ['cma', (f) => f.startsWith('lib/cma/') || f.startsWith('app/api/cma/') || f.startsWith('lib/comps/')],
  ['reports', (f) => /^lib\/(market-report|seller-report|pitch-packet|market-pulse|agent-performance|demand-index|listing-momentum|rental-signals|seller-signals|seller-readiness|pdf)\//.test(f) || f.startsWith('app/api/market/')],
  ['marketing', (f) => f.startsWith('lib/email/') || f.startsWith('lib/syndication/') || f.startsWith('lib/featured/') || f === 'lib/compliance/campaign-distribution-gate.ts' || f.startsWith('app/api/featured-config/') || f.startsWith('lib/social-proof/') || f.startsWith('public/crm/js/campaigns/')],
  ['portalSharing', (f) => f.startsWith('lib/portal/') || f.startsWith('app/portal/') || f.startsWith('app/api/portal/') || f === 'lib/search/listing-access-decision.ts' || f === 'lib/search/visibility-contract.ts' || f === 'lib/compliance/dto.ts' || f.startsWith('lib/document-vault/')],
  ['keepList', (f) => f === 'lib/compliance/raw-data-keep-fields.ts'],
  ['complianceRule', (f) => f.startsWith('lib/compliance/') && !f.includes('__tests__') && f !== 'lib/compliance/raw-data-keep-fields.ts' && f !== 'lib/compliance/dto.ts'],
  ['mediaLane', (f) => /^lib\/(idx\/media-sync|idx\/write-suppression|media\/|images\/)/.test(f) || f.startsWith('app/api/media/')],
  ['sync', (f) => f === 'lib/idx/sync.ts' || f === 'lib/idx/fetch.ts' || f.startsWith('app/api/cron/') || f === 'lib/idx/auth.ts'],
  ['scripts', (f) => f.startsWith('scripts/')],
];
const isTestFile = (f) => /(^|\/)__tests__\//.test(f) || /\.test\.(ts|tsx|js|mjs)$/.test(f) || f.startsWith('tests/');
function stagesOf(file) {
  if (isTestFile(file)) return ['tests'];
  const s = STAGE_RULES.filter(([, t]) => t(file)).map(([n]) => n);
  const scope = toolScopeOf(file);
  if (scope === 'sale' || scope === 'both') s.push('saleTools');
  if (scope === 'rental' || scope === 'both') s.push('rentalTools');
  return s.length ? s : ['other'];
}

// ── Workflow context of a read site (Sale vs Rental), from the enclosing code ──
const WORKFLOW_FILES = new Set(['lib/search/engine/criteria.ts', 'lib/search/engine/provider-query.ts', 'lib/search/engine/universe.ts', 'lib/search/engine/executor.ts', 'lib/search/engine/contract.ts', 'lib/search/public-listing-db.ts', 'lib/search/public-listing-trestle.ts', 'lib/search/natural-language-parser.ts', 'lib/search/listing-search-projection.ts', 'lib/search/types.ts', 'app/api/listings/route.ts', 'lib/search/canonical/sort.ts', 'lib/search/engine/saved-search.ts']);
function smallestNodeOnLine(sf, line, needle) {
  const start = sf.getPositionOfLineAndCharacter(line - 1, 0);
  const end = sf.getLineEndOfPosition(start);
  let best = null;
  const visit = (n) => {
    if (n.end < start || n.pos > end) return;
    const s = n.getStart(sf);
    if (s >= start && n.end <= end && n.getText(sf).includes(needle) && (!best || n.end - s < best.end - best.getStart(sf))) best = n;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return best;
}
function workflowContext(sf, node) {
  const hits = new Set();
  let n = node;
  let child = null;
  while (n && !ts.isSourceFile(n)) {
    let cond = null;
    let inverted = false;
    if (ts.isIfStatement(n)) { cond = n.expression.getText(sf); inverted = child === n.elseStatement; }
    else if (ts.isConditionalExpression(n)) { cond = n.condition.getText(sf); inverted = child === n.whenFalse; }
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === n.right) cond = n.left.getText(sf);
    else if (ts.isCaseClause(n)) cond = n.expression.getText(sf);
    else if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) cond = n.name.getText(sf);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) cond = n.name.text;
    else if (ts.isPropertyAssignment(n)) cond = n.name.getText(sf);
    if (cond) {
      const r = /rental|\brent\b|lease|isRental|is_rental|RentalCriteria|ResidentialLease/i.test(cond);
      const s = /\bsale\b|\bbuy\b|SaleCriteria|isSale|'Residential'/i.test(cond);
      if (r && !s) hits.add(inverted ? 'sale' : 'rental');
      else if (s && !r) hits.add(inverted ? 'rental' : 'sale');
    }
    child = n;
    n = n.parent;
  }
  if (hits.has('rental') && !hits.has('sale')) return 'rental';
  if (hits.has('sale') && !hits.has('rental')) return 'sale';
  return 'both';
}
const contextCache = new Map();
function contextOf(file, line, needle) {
  const key = `${file}:${line}:${needle}`;
  if (contextCache.has(key)) return contextCache.get(key);
  let ctxv = 'both';
  const sf = ctx.files.get(file);
  if (sf && WORKFLOW_FILES.has(file)) { const node = smallestNodeOnLine(sf, line, needle); if (node) ctxv = workflowContext(sf, node); }
  contextCache.set(key, ctxv);
  return ctxv;
}

// ── Selection authorities ───────────────────────────────────────────────────
const NAV_TARGET = Object.fromEntries(Object.entries(RES.Property.navigation).map(([n, v]) => [n, v.target]));
function inferResource(names) {
  let best = null;
  for (const r of ENTITLED) { const set = new Set(Object.keys(RES[r].fields)); const hit = names.filter((n) => set.has(n)).length / Math.max(1, names.length); if (hit >= 0.8 && (!best || hit > best.hit)) best = { resource: r, hit }; }
  return best?.resource || null;
}
function roleOf(file) {
  if (isTestFile(file)) return 'test';
  if (file === 'lib/compliance/raw-data-keep-fields.ts') return 'keep-list';
  if (/^lib\/idx\/(trestle-mapper|fetch|sync)\.ts$/.test(file)) return 'sync';
  if (file.startsWith('lib/search/engine/')) return 'runtime-search';
  if (file === 'lib/idx/card-fields.ts') return 'cards';
  if (file.startsWith('lib/buildings/') || file.startsWith('app/api/buildings/')) return 'buildings';
  if (file.startsWith('lib/open-houses/') || file.startsWith('app/api/open-houses/')) return 'open-houses';
  if (/^lib\/(idx\/media-sync|media\/)|^app\/api\/media\//.test(file)) return 'media';
  if (file.startsWith('app/api/agents/')) return 'agents';
  if (file.startsWith('scripts/')) return 'scripts';
  if (file.startsWith('lib/cotality/')) return 'contract';
  return 'other';
}
const authorities = [];
for (const [rel, sf] of ctx.files) {
  if (rel.startsWith('lib/cotality/generated/') || rel.includes('__type-tests__')) continue;
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      if (ts.isCallExpression(d.initializer) && ts.isIdentifier(d.initializer.expression) && d.initializer.expression.text === 'cotalityFields') {
        const resource = ts.isStringLiteralLike(d.initializer.arguments[0]) ? d.initializer.arguments[0].text : null;
        const arr = d.initializer.arguments[1];
        const names = arr && ts.isArrayLiteralExpression(arr) ? arr.elements.filter(ts.isStringLiteralLike).map((e) => e.text) : [];
        if (resource && names.length) authorities.push({ file: rel, name: d.name.text, resource, fields: names, kind: 'cotalityFields', role: roleOf(rel) });
      }
    }
  }
  for (const [name, items] of topLevelLists(sf)) {
    if (authorities.some((a) => a.file === rel && a.name === name)) continue;
    const names = items.map((i) => i.name);
    if (names.length < 3) continue;
    const resource = inferResource(names);
    if (resource) authorities.push({ file: rel, name, resource, fields: names, kind: 'array', role: roleOf(rel) });
  }
  const text = sf.getFullText();
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i];
    for (const m of ln.matchAll(/\$expand=([A-Z][A-Za-z]+)\(\$select=([A-Za-z0-9_,]+)/g)) {
      const resource = NAV_TARGET[m[1]] || (RES[m[1]] ? m[1] : null);
      const names = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      const key = `${i}:${m[1]}`;
      if (resource && names.length && !seen.has(key)) { seen.add(key); authorities.push({ file: rel, name: `$expand=${m[1]}@${i + 1}`, resource, fields: names, kind: 'literal', role: roleOf(rel) }); }
    }
    const stripped = ln.replace(/\$expand=[A-Z][A-Za-z]+\(\$select=[^)]*\)/g, '');
    for (const m of stripped.matchAll(/\$select['"`]?\s*[,:=]\s*['"`]([A-Za-z0-9_,\s]+)['"`]|\$select=([A-Za-z0-9_,]+)/g)) {
      const names = (m[1] || m[2] || '').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z][A-Za-z0-9_]*$/.test(s));
      if (names.length < 2) continue;
      const window = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
      const rm = /odata\/([A-Z][A-Za-z]+)|query\(['"]([A-Z][A-Za-z]+)['"]|resource:\s*['"]([A-Z][A-Za-z]+)['"]|\/(Property|Media|Member|Office|OpenHouse|CustomProperty|PropertyRooms|PropertyUnitTypes)\?/.exec(window);
      const resource = (rm && (rm[1] || rm[2] || rm[3] || rm[4])) || inferResource(names);
      const key = `${i}:$select`;
      if (resource && RES[resource] && !seen.has(key)) { seen.add(key); authorities.push({ file: rel, name: `$select@${i + 1}`, resource, fields: names, kind: 'literal', role: roleOf(rel) }); }
    }
  }
}
const authorityIndex = new Map();
for (const a of authorities) for (const f of a.fields) { const k = `${a.resource}.${f}`; if (!authorityIndex.has(k)) authorityIndex.set(k, []); authorityIndex.get(k).push(`${a.name}@${a.file}`); }
const authoritiesByRole = (resource, field, roles) => (authorityIndex.get(`${resource}.${field}`) || []).filter((l) => roles.includes(roleOf(l.split('@')[1])));

const typesSrc = readFileSync(path.join(ROOT, 'lib/search/types.ts'), 'utf8');
const amenityMapFields = new Map();
{
  const block = typesSrc.slice(typesSrc.indexOf('export const AMENITY_FIELD_MAP'));
  const re = /['"]([a-z-]+)['"]:\s*\{\s*field:\s*['"]([^'"]+)['"],\s*values:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block))) { const values = [...m[3].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]); for (const f of m[2].split(',').map((s) => s.trim())) { if (!amenityMapFields.has(f)) amenityMapFields.set(f, []); amenityMapFields.get(f).push({ key: m[1], values }); } }
}
// AMENITY_FIELD_MAP values that are not published members of the live vocabulary (phantom members) — mechanical.
const amenityPhantoms = [...amenityMapFields].flatMap(([f, arr]) => arr.flatMap((a) => a.values.filter((v) => !(lookups.Property?.[f]?.members || []).includes(v)).map((v) => ({ key: a.key, field: f, value: v, fieldDeclared: Boolean(P[f]), fieldPopulated: P[f]?.populated ?? null }))));

// Tests.
const testFiles = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const full = path.join(d, e);
    const st = statSync(full);
    if (st.isDirectory()) { if (e === 'node_modules' || e === '.next' || e === '.git') continue; walk(full); }
    else if (/\.test\.(ts|tsx|js|mjs)$/.test(e) || full.includes(`${path.sep}__tests__${path.sep}`)) testFiles.push(full);
  }
})(ROOT);
const testText = testFiles.map((f) => ({ file: path.relative(ROOT, f).replace(/\\/g, '/'), text: safeRead(f) }));
function testsFor(field, columns, canonicalKeys) {
  const re = new RegExp(`\\b${field}\\b`);
  const direct = testText.filter((t) => re.test(t.text)).map((t) => t.file);
  const negative = testText.filter((t) => { if (!re.test(t.text)) return false; const lines = t.text.split(/\r?\n/); return lines.some((ln, i) => re.test(ln) && lines.slice(Math.max(0, i - 3), i + 4).some((x) => /toBeUndefined|toBeNull|not\.toContain|not\.toHaveProperty|toBe\(false\)|toBe\(null\)|toEqual\(\[\]\)/.test(x))); }).map((t) => t.file);
  const integration = direct.filter((f) => f.startsWith('tests/runtime/') || f.startsWith('tests/e2e/'));
  const downstream = uniq(columns.flatMap((c) => { const cre = new RegExp(`\\b${c}\\b`); return testText.filter((t) => cre.test(t.text)).map((t) => t.file); })).filter((f) => !direct.includes(f));
  const compliance = direct.filter((f) => f.startsWith('lib/compliance/'));
  const keys = uniq([field, ...columns, ...canonicalKeys]);
  const reload = testText.filter((t) => keys.some((k) => new RegExp(`\\b${k}\\b`).test(t.text)) && /reload|hydrat|round.?trip|save.*(then|and).*(load|read|get)|persist(ed|ence).*(reload|read back)/i.test(t.text)).map((t) => t.file);
  return { direct, negative, integration, downstream, compliance, reload };
}

// ── Population & vocabulary (provider) ─────────────────────────────────────
function populationOf(resource, field) {
  const fact = RES[resource].fields[field];
  const amen = resource === 'Property' ? amenity?.fields?.[field] : null;
  const supA = supActive?.resources?.[resource]?.fields?.[field] || null;
  const supW = resource === 'Property' ? supAll?.resources?.Property?.fields?.[field] || null : null;
  const enumC = resource === 'Property' ? enumCensus?.fields?.[field] || null : null;
  const active = amen && typeof amen.nonNull === 'number' ? amen.nonNull : supA ? supA.nonNull : null;
  if (fact.filterable !== false) return { all: fact.populated, active, byStatus: null, basis: enumC ? 'probe `ne null` (all statuses); member counts from the enum-member census' : 'probe `ne null` (all statuses)' };
  if (supW) return { all: supW.nonNull, active, byStatus: supW.byStatus, basis: `row-by-row walk of ${fmtN(supAll.resources.Property.rows)} rows, all statuses (suppressed field)` };
  if (supA) return { all: null, active, byStatus: null, basis: `row-by-row walk of ${fmtN(supActive.resources[resource].rows)} rows, ${supActive.resources[resource].scope} (suppressed field)` };
  return { all: null, active: null, byStatus: null, basis: 'UNMEASURED' };
}
function availabilityOf(resource, field, pop) {
  const fact = RES[resource].fields[field];
  const access = RES[resource].access;
  const evidence = [];
  if (access.state !== 'accessible') return { class: 'REJECTED-RESOURCE', evidence: [`entity set ${access.state} (HTTP ${access.http}): ${String(access.error || '').slice(0, 120)}`] };
  const rows = pop.all ?? pop.active;
  if (fact.filterable === false) {
    evidence.push(`$filter → HTTP 400 "Results from 'RLS' has been suppressed (provider Level) as field ${field} cannot be used for filtering or grouping" (probe ${fact.probeHttp})`);
    evidence.push('$select → HTTP 200 (row-by-row census selected it on every row)');
    if (pop.all != null) evidence.push(`${pop.all === 0 ? 'null on all' : 'non-null on'} ${fmtN(pop.all === 0 ? supAll?.resources?.Property?.rows : pop.all)} walked rows (all statuses)`);
    else if (pop.active != null) evidence.push(`${pop.active === 0 ? 'null on all' : 'non-null on'} ${fmtN(pop.active === 0 ? supActive?.resources?.[resource]?.rows : pop.active)} walked rows`);
    evidence.push(fact.rlsField ? 'RLS defines the field (Field.SystemReferences includes RLS)' : 'RLS does not list the field (Field.SystemReferences)');
    if (observed?.resources?.[resource]?.fields?.[field]?.status === 'rejected') evidence.push('$apply=groupby → rejected (same suppression message)');
    return { class: rows === 0 ? 'SUPPRESSED' : rows == null ? 'SUPPRESSED-UNMEASURED' : 'SUPPRESSED-BUT-DELIVERED', evidence, note: 'suppression proves no values are delivered today; it does not prove the subscription can never deliver the field' };
  }
  evidence.push(`$filter \`${field} ne null\` → HTTP ${fact.probeHttp} count ${fmtN(fact.populated)}`);
  if (rows > 0) return { class: 'POPULATED', evidence };
  if (rows === 0) { evidence.push(fact.rlsField ? 'RLS defines the field (SystemReferences includes RLS) — declared, entitled, 0 rows today' : 'RLS does not list the field — declared in the model, not used on this feed'); return { class: fact.rlsField ? 'DECLARED-EMPTY (RLS-defined)' : 'NOT-ON-FEED (not RLS-defined)', evidence }; }
  return { class: 'UNMEASURED', evidence };
}
function vocabularyOf(resource, field) {
  const fact = RES[resource].fields[field];
  if (!fact.enum) return null;
  const cat = catalogueRow(resource, field);
  const lk = lookups[resource]?.[field] || null;
  const obs = observed?.resources?.[resource]?.fields?.[field] || null;
  const enumC = resource === 'Property' ? enumCensus?.fields?.[field] || null : null;
  const amen = resource === 'Property' ? amenity?.fields?.[field] || null : null;
  const counts = enumC?.counts || amen?.counts || null;
  const rejected = enumC?.rejectedMembers ? Object.keys(enumC.rejectedMembers) : [];
  const handled = {};
  if (resource === 'Property' && memberFields.includes(field) && lk) {
    for (const m of lk.members) {
      const sites = (readers.get(`member:${m}`) || []).filter((s) => !isTestFile(s.file) && !s.file.startsWith('scripts/'));
      const typed = sites.filter((s) => s.tier === 'typed');
      const cooccur = sites.filter((s) => s.tier !== 'typed' && (ctx.files.get(s.file)?.getFullText() || '').includes(field));
      if (typed.length || cooccur.length) handled[m] = { typed: typed.length, coOccurring: cooccur.length, sites: uniq([...typed, ...cooccur].map((s) => `${s.file}:${s.line}`)).slice(0, 6) };
    }
  }
  const observedMembers = obs?.observedMembers || (counts ? Object.keys(counts) : null);
  return {
    authority: `Field.LookupName=${cat?.LookupName ?? 'n/a'} → Lookup (${lk ? lk.members.length : 0} published members; ${lk ? lk.rls.length : 0} RLS-listed)`,
    entitledType: fact.type.replace('Cotality.DataStandard.RESO.DD.', ''), multi: fact.multi,
    declaredMembers: lk?.members || [], rlsListed: lk?.rls || [],
    observedMembers, observedNotDeclared: obs?.observedNotDeclared || [], declaredNotObserved: obs?.declaredNotObserved || (lk && observedMembers ? lk.members.filter((m) => !observedMembers.includes(m)) : null),
    rawCombinations: obs?.rawCombinations ? obs.rawCombinations.length : null, observedBasis: obs ? '$apply=groupby (diagnostic)' : counts ? 'per-member count census' : 'not measured',
    memberCounts: counts, filterRejectedMembers: rejected,
    mallanHandled: Object.keys(handled).length ? handled : null,
    declaredNotHandled: lk && memberFields.includes(field) ? lk.members.filter((m) => !handled[m]) : null,
  };
}

// ── Per-field assembly ──────────────────────────────────────────────────────
const NAV_BY_TARGET = {};
for (const [n, v] of Object.entries(RES.Property.navigation)) { if (!NAV_BY_TARGET[v.target]) NAV_BY_TARGET[v.target] = []; NAV_BY_TARGET[v.target].push(n); }
function accessPathOf(resource, field) {
  if (resource === 'Property') return { path: 'Property scalar', notes: [] };
  const navs = NAV_BY_TARGET[resource] || [];
  const notes = navs.map((n) => { const cap = navCap?.matrix?.[n]; if (!cap) return `${n}: not measured`; const s = cap.byStatus; return `${n}: ${['Active', 'Pending', 'ComingSoon', 'Closed'].map((st) => `${st} ${s[st]?.http ?? '—'} ${s[st]?.populated ?? 0}/${s[st]?.sampled ?? 0}`).join(' · ')}`; });
  const direct = navCap?.entitySets?.[resource];
  return { path: `Property.${navs.join('|')} → ${resource}; direct entity set HTTP ${direct?.http ?? 'n/a'}`, notes };
}
const stageFilesCache = {};
const stageFiles = (st) => { if (!stageFilesCache[st]) stageFilesCache[st] = [...ctx.files.keys()].filter((f) => !isTestFile(f) && stagesOf(f).includes(st)); return stageFilesCache[st]; };
const PROVIDER_AUTHORED = new Set(['MlsStatus', 'StandardStatus', 'Permission']);

function fieldRow(resource, field) {
  const fact = RES[resource].fields[field];
  const cat = catalogueRow(resource, field);
  const pop = populationOf(resource, field);
  const availability = availabilityOf(resource, field, pop);
  const rows = pop.all ?? pop.active;
  const prim = resource === 'Property' ? primaryOf(field) : { name: `${resource} subsection`, category: 'reference' };
  const binds = resource === 'Property' ? bindings.get(`Property.${field}`) || [] : [];
  const persist = uniq(binds.map((b) => b.node));
  const columns = persist.map((n) => n.replace(/^listings\./, '')).filter((c) => /^[a-z_]+$/.test(c));
  const nodes = [`provider:Property.${field}`, ...CONTAINERS.map((c) => `listings.${c}.${field}`), ...persist.filter((n) => /^listings\.[a-z_]+$/.test(n))];
  const consumers = [];
  for (const node of nodes) for (const s of readers.get(node) || []) { const needle = node.replace(/^provider:Property\.|^listings\.(?:[a-z_]+\.)?/, ''); for (const stage of stagesOf(s.file)) consumers.push({ stage, file: s.file, line: s.line, node, tier: s.tier, workflow: ['criterion', 'projection', 'sorting'].includes(stage) ? contextOf(s.file, s.line, needle) : null }); }
  for (const name of [field, ...columns]) for (const s of crmJs.get(name) || []) for (const stage of stagesOf(s.file)) consumers.push({ stage, file: s.file, line: s.line, node: name === field ? `provider:Property.${field}` : `listings.${name}`, tier: 'crm-js', workflow: null });
  const byStage = {};
  for (const c of consumers) { if (!byStage[c.stage]) byStage[c.stage] = new Set(); byStage[c.stage].add(`${c.file}:${c.line}`); }
  const sites = (st) => [...(byStage[st] || [])];
  const searchSites = (wf) => consumers.filter((c) => ['criterion', 'projection', 'sorting'].includes(c.stage) && (c.workflow === wf || c.workflow === 'both')).map((c) => `${c.file}:${c.line}`);
  const inAmenityMap = amenityMapFields.get(field) || [];
  // form / tools surfaces (canonical = the Cotality field itself, or a form key aliased to it)
  const surf = (name) => surfaceControls[name].get(field) || [];
  const canonicalKeys = uniq(Object.entries(FORM_CONTRACT.aliasToCanonical).filter(([, v]) => v === field).map(([k]) => k));
  const tests = testsFor(field, columns, canonicalKeys);
  const syncAuth = resource === 'Property' ? fetched.has(`Property.${field}`) : authoritiesByRole(resource, field, ['sync', 'media', 'open-houses']).length > 0;
  const runtimeAuth = authoritiesByRole(resource, field, ['runtime-search', 'cards']);
  const otherAuth = authoritiesByRole(resource, field, ['buildings', 'open-houses', 'media', 'agents', 'other']);
  const rawPersist = persist.filter((n) => n.startsWith('listings.raw_data.'));
  const structPersist = persist.filter((n) => !n.startsWith('listings.raw_data.'));
  const formPersist = FORM_CONTRACT.persistenceMap[field] || null;
  const editable = Boolean(formPersist) && !PROVIDER_AUTHORED.has(field);
  const S = (ok, extra = {}) => ({ status: ok ? 'PASS' : 'MISSING', ...extra });
  const stage = {
    rawSelection: S(syncAuth || runtimeAuth.length || otherAuth.length, { sync: syncAuth, runtime: runtimeAuth, other: otherAuth, all: authorityIndex.get(`${resource}.${field}`) || [] }),
    mapper: S(binds.length, { bindings: binds.map((b) => `${b.node} (${b.via})`) }),
    persistence: S(persist.length || formPersist, { structured: structPersist, raw: rawPersist, formContract: formPersist }),
    reload: editable ? S(tests.reload.length, { files: tests.reload, basis: 'test naming the key with reload/hydrate/round-trip language' }) : { status: 'N/A', note: PROVIDER_AUTHORED.has(field) ? 'provider decision — never form-edited' : 'not a Mallan-editable field (no persistenceMap entry)' },
    projection: S(sites('projection').length, { sites: sites('projection') }),
    criterion: S(sites('criterion').length, { sites: sites('criterion') }),
    amenityMap: S(inAmenityMap.length, { keys: inAmenityMap.map((a) => `${a.key}: ${a.values.join('|')}`) }),
    sorting: S(sites('sorting').length, { sites: sites('sorting') }),
    saleSearch: S(searchSites('sale').length || (inAmenityMap.length > 0), { sites: searchSites('sale') }),
    rentalSearch: S(searchSites('rental').length || (inAmenityMap.length > 0), { sites: searchSites('rental') }),
    saleForm: S(surf('saleForm').length, { controls: surf('saleForm').map((c) => c.control), persistence: surf('saleForm')[0]?.persistence || null }),
    rentalForm: S(surf('rentalForm').length, { controls: surf('rentalForm').map((c) => c.control), persistence: surf('rentalForm')[0]?.persistence || null }),
    saleTools: S(sites('saleTools').length || surf('saleToolsOnly').length, { sites: sites('saleTools'), controls: surf('saleToolsOnly').map((c) => c.control) }),
    rentalTools: S(sites('rentalTools').length || surf('rentalToolsOnly').length, { sites: sites('rentalTools'), controls: surf('rentalToolsOnly').map((c) => c.control) }),
    resultDto: S(sites('resultDto').length, { sites: sites('resultDto') }),
    resultCard: S(sites('resultCard').length, { sites: sites('resultCard') }),
    listingWorkspace: S(sites('listingWorkspace').length, { sites: sites('listingWorkspace') }),
    savedSearch: S(sites('savedSearch').length, { sites: sites('savedSearch') }),
    alerts: S(sites('alerts').length, { sites: sites('alerts') }),
    cma: S(sites('cma').length, { sites: sites('cma') }),
    reports: S(sites('reports').length, { sites: sites('reports') }),
    marketing: S(sites('marketing').length, { sites: sites('marketing') }),
    portalSharing: S(sites('portalSharing').length, { sites: sites('portalSharing') }),
    publicConsumer: S(sites('publicConsumer').length, { sites: sites('publicConsumer') }),
    complianceRule: S(sites('complianceRule').length, { sites: sites('complianceRule') }),
    mediaLane: S(sites('mediaLane').length, { sites: sites('mediaLane') }),
    sync: S(sites('sync').length, { sites: sites('sync') }),
    directTest: S(tests.direct.length, { files: tests.direct }),
    negativeTest: S(tests.negative.length, { files: tests.negative, basis: 'heuristic: field within 3 lines of a negative matcher' }),
    integrationTest: S(tests.integration.length, { files: tests.integration }),
    downstreamTest: S(tests.downstream.length, { files: tests.downstream }),
    complianceTest: S(tests.compliance.length, { files: tests.compliance }),
    previewProof: { status: 'UNVERIFIED', note: 'no preview proof recorded for this branch' },
    productionProof: PRODUCTION_PROOF[field] || { status: 'UNVERIFIED' },
  };
  stage.searchPath = { status: stage.projection.status === 'PASS' || stage.criterion.status === 'PASS' || stage.amenityMap.status === 'PASS' ? 'PASS' : 'MISSING' };
  const directFiles = uniq(consumers.filter((c) => !isTestFile(c.file) && c.tier !== 'crm-js').map((c) => c.file));
  for (const st of TRANSITIVE_STAGES) {
    if (stage[st].status === 'PASS') continue;
    let via = null;
    for (const cf of directFiles) { const imp = importersOf(cf); const hit = stageFiles(st).find((sf) => imp.has(sf)); if (hit) { via = `${hit} ← ${cf}`; break; } }
    if (via) stage[st] = { status: 'REACHABLE', sites: [], via };
  }
  for (const b of BEHAVIOR_STAGES) stage[b] = { status: 'UNVERIFIED' };
  for (const b of BEHAVIOR_REGISTER) if (b.field === field) stage[b.stage] = { status: b.status, cite: b.cite, note: b.note, citationVerified: b.citationVerified ?? null };
  // independent verdict columns (Maya's list)
  const st = (k) => stage[k].status;
  const okS = (k) => st(k) === 'PASS';
  const verdicts = {
    providerContract: `declared${cat ? ` · catalogue LookupName ${cat.LookupName ?? '—'}` : ' · not in catalogue'} · ${fact.rlsField ? 'RLS-defined' : 'not RLS-defined'}`,
    providerAccess: `${availability.class}${resource !== 'Property' ? ` · ${accessPathOf(resource, field).path}` : ''}`,
    mapping: st('mapper'), storage: st('persistence'), reload: st('reload'),
    saleSearch: st('saleSearch'), rentalSearch: st('rentalSearch'), saleForm: st('saleForm'), rentalForm: st('rentalForm'), saleTools: st('saleTools'), rentalTools: st('rentalTools'),
    cma: st('cma'), reporting: st('reports'),
    // Visibility behaviour (who may see) is a gate question — required only for the permissions category. For every
    // other field the visibility column is the consumer question: is it read on the member / public path.
    memberVisibility: prim.category === 'permissions' ? (okS('portalSharing') ? (st('memberBehavior') === 'PASS' ? 'PASS' : st('memberBehavior') === 'DEFECT' ? 'DEFECT' : 'UNVERIFIED (read, behaviour unproven)') : st('portalSharing')) : st('portalSharing'),
    publicVisibility: prim.category === 'permissions' ? (okS('publicConsumer') ? (st('publicBehavior') === 'PASS' ? 'PASS' : st('publicBehavior') === 'DEFECT' ? 'DEFECT' : 'UNVERIFIED (read, behaviour unproven)') : st('publicConsumer')) : st('publicConsumer'),
    compliance: okS('complianceRule') ? (okS('complianceTest') ? 'PASS' : 'UNVERIFIED (rule, no test)') : st('complianceRule'),
    runtimeProof: stage.productionProof.status === 'UNVERIFIED' ? 'UNVERIFIED' : `${stage.productionProof.status} (production)`,
  };
  const required = REQUIRED[prim.category] || REQUIRED.reference;
  const staticReq = required.filter((r) => !BEHAVIOR_STAGES.includes(r));
  const missingStatic = staticReq.filter((r) => stage[r].status === 'MISSING');
  const defects = required.filter((r) => ['DEFECT', 'CITATION-STALE'].includes(stage[r].status));
  const unverified = required.filter((r) => ['UNVERIFIED', 'REACHABLE'].includes(stage[r].status));
  let verdict;
  if (stage.rawSelection.status !== 'PASS' || stage.mapper.status !== 'PASS') verdict = 'MISSING';
  else if (missingStatic.length) verdict = 'PARTIAL';
  else if (defects.length) verdict = 'DEFECT';
  else if (unverified.length) verdict = 'UNVERIFIED';
  else verdict = 'COMPLETE';
  const deadPath = rows === 0 && (binds.length > 0 || consumers.some((c) => !isTestFile(c.file)));
  const domainsServed = uniq([
    ...SERVES.filter(([re]) => re.test(field)).flatMap(([, d]) => d),
    ...consumers.map((c) => STAGE_DOMAIN[c.stage]).filter(Boolean),
    ...(stage.saleForm.status === 'PASS' ? ['Sale Form'] : []), ...(stage.rentalForm.status === 'PASS' ? ['Rental Form'] : []),
    ...(stage.saleSearch.status === 'PASS' ? ['Sale Search'] : []), ...(stage.rentalSearch.status === 'PASS' ? ['Rental Search'] : []),
  ]).filter((d) => d !== prim.name && d !== 'Search').sort();
  return {
    resource, field,
    provider: {
      declared: true, entitledType: fact.type.replace('Cotality.DataStandard.RESO.DD.', ''), catalogue: cat ? { lookupName: cat.LookupName, type: cat.Type, length: cat.Length, systemReferences: cat.SystemReferenceCount, resoStandard: cat.RESOStandardYN } : null,
      rlsDefined: fact.rlsField, reso: fact.reso, selectable: fact.filterable === false ? 'accepted (census)' : fact.probeHttp === 200 ? 'accepted' : 'unmeasured', filterable: fact.filterable, probeHttp: fact.probeHttp,
      population: pop, rows, availability, vocabulary: vocabularyOf(resource, field), accessPath: accessPathOf(resource, field),
    },
    primary: prim, domainsServed,
    mallan: { stage, verdicts, required, missingStatic, defects, unverified, verdict, deadPath, editable, canonicalKeys, consumers: consumers.length, consumerSites: consumers, wiredForSync: syncAuth && binds.length > 0 },
  };
}

const propertyRows = allProperty.map((f) => fieldRow('Property', f));
const navFieldRows = {};
for (const r of SUBSECTION_RESOURCES) navFieldRows[r] = Object.keys(RES[r].fields).sort().map((f) => fieldRow(r, f));

// ── Provider graph ──────────────────────────────────────────────────────────
const runtimePulls = {};
{
  const files = [...ctx.files.keys()];
  for (const r of [...SUBSECTION_RESOURCES, 'Building']) { const re = new RegExp(`odata/${r}\\b|resource: ['"]${r}['"]|\\$expand=${r}\\b|expandParts\\.push\\("${r}|expand${r} === true|['"]${r}\\(\\$select`); runtimePulls[r] = files.filter((f) => !isTestFile(f) && re.test(ctx.files.get(f).getFullText())); }
  for (const n of Object.keys(RES.Property.navigation)) { const re = new RegExp(`\\$expand=[^'"\`]*\\b${n}\\b|expandParts\\.push\\(["'\`]${n}|["'\`]${n}\\(\\$select`); runtimePulls[`nav:${n}`] = files.filter((f) => !isTestFile(f) && re.test(ctx.files.get(f).getFullText())); }
}
const graph = {
  feed: PROVIDER_DOCS.find((d) => d[0] === 'DataSystem (live)')[2],
  resources: Object.fromEntries(Object.keys(RES).map((r) => [r, {
    entitled: RES[r].access?.state === 'accessible', access: RES[r].access, entitledFields: Object.keys(RES[r].fields || {}).length,
    catalogueFields: catByRes.get(r === 'CustomProperty' ? 'Custom_Property' : r)?.size ?? null,
    catalogueOnlyFields: catByRes.get(r === 'CustomProperty' ? 'Custom_Property' : r) ? [...catByRes.get(r === 'CustomProperty' ? 'Custom_Property' : r).keys()].filter((f) => !(RES[r].fields || {})[f]) : null,
    navigation: RES[r].navigation || {}, runtimePulls: runtimePulls[r] || [],
  }])),
  propertyNavigations: Object.fromEntries(Object.keys(RES.Property.navigation).sort().map((n) => {
    const v = RES.Property.navigation[n];
    const cap = navCap?.matrix?.[n] || null;
    return [n, {
      target: v.target, declared: true, expandHttp: v.http, expandVerdict: v.expand,
      targetEntitySet: navCap?.entitySets?.[v.target] || RES[v.target]?.access || null,
      byStatus: cap ? Object.fromEntries(Object.entries(cap.byStatus).map(([st, c]) => [st, { sampled: c.sampled, http: c.http, collectionKeyPresent: c.collectionKeyPresent, populated: c.populated, empty: c.empty, records: c.records, linkage: c.linkage, byPermission: c.byPermission, message: c.message }])) : null,
      exhaustive: { active: navActive?.navigations?.[n] ? { rows: navActive.rows, rowsWithPayload: navActive.navigations[n].rowsWithPayload, payloadRows: navActive.navigations[n].payloadRows } : null, all: navAll?.navigations?.[n] ? { rows: navAll.rows, rowsWithPayload: navAll.navigations[n].rowsWithPayload, byStatus: navAll.navigations[n].byStatus } : null },
      directByLinkedKey: (navCap?.directProbes || []).filter((d) => d.target === v.target),
      emptyFollowUps: (navCap?.emptyFollowUps || []).filter((e) => e.nav === n),
      runtimeExpands: runtimePulls[`nav:${n}`] || [],
    }];
  })),
  secondHop: navCap?.nested || [],
  keyLinkage: {
    'Property.ListAgentKey ↔ Member.MemberKey': 'exact on every populated sample', 'Property.ListAgentMlsId ↔ Member.MemberMlsId': 'exact',
    'Property.BuyerAgentMlsId ↔ Member.MemberMlsId (BuyerAgent navigation, Closed)': 'exact; BuyerAgentKey scalar is suppressed (null) while the payload carries MemberKey',
    'Property.CoListAgentKey ↔ Member.MemberKey (CoListAgent navigation)': 'exact for the first co-list agent only; CoListAgent2Key/CoListAgent3Key are NOT in the navigation payload and resolve by direct Member lookup',
    'Property.CoListOfficeKey / CoListOffice2Key ↔ Office.OfficeKey': 'both present in the CoListOffice payload',
    'Media.ResourceRecordKey ↔ Property.ListingKey': 'exact; Media.ResourceName also carries Building rows (62) keyed by BuildingKey, which Property does not expose',
    'OpenHouse/CustomProperty/PropertyRooms/PropertyUnitTypes.ListingKey ↔ Property.ListingKey': 'exact',
    'Property.BuildingKey ↔ Building.BuildingKey': 'unmeasurable: BuildingKey suppressed on Property, Building navigation always empty, Building entity set 403',
  },
  docs: PROVIDER_DOCS,
};

// ── CustomFields register ───────────────────────────────────────────────────
const inferType = (top) => { const vals = top.map((t) => t.replace(/=\d+$/, '')); if (vals.every((v) => /^(true|false|Y|N|Yes|No)$/i.test(v))) return 'boolean'; if (vals.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number'; if (vals.length <= 4) return 'enum-like'; return 'text'; };
const HINT = [[/Doorman|Attendance|Concierge|Staff|Security/i, 'security/doorman'], [/Elevator/i, 'amenities'], [/Tax|Abatement|Flip|Maintenance|Assessment|Fee|Rent|Financ|Deposit|Down/i, 'financial'], [/Sponsor|Ownership|Coop|Condo|NewDev|Development/i, 'classification'], [/Pet/i, 'pets'], [/Laundry|Washer/i, 'laundry'], [/Outdoor|Terrace|Balcony|Garden|Roof/i, 'amenities'], [/Exposure|View|Floor|Ceiling/i, 'unit features'], [/Lease|Furnish|Sublet|Guarantor/i, 'rental terms'], [/Remarks|Comment|Description|Rules/i, 'text'], [/YN$/i, 'boolean fact']];
const customSyncFlag = /expandCustomProperty:\s*true/.test(ctx.files.get('lib/idx/sync.ts')?.getFullText() || '');
const customFieldsPersisted = [...ctx.files.entries()].filter(([f, sf]) => !isTestFile(f) && /custom_fields\s*[:=]/.test(sf.getFullText())).map(([f]) => f);
const customKeyRows = txn?.customFields?.keys ? Object.entries(txn.customFields.keys) : amenity?.customFields?.keys ? Object.entries(amenity.customFields.keys) : [];
const customKeys = customKeyRows.map(([k, v]) => {
  const top = amenity?.customFields?.keys?.[k]?.topValues || [];
  const formSurfaces = Object.entries(SURFACES).filter(([s]) => surfaceControls[s].has(k)).map(([s]) => s);
  const internal = INTERNAL.has(k);
  return { key: k, rows: v.rows, nonEmpty: v.nonEmpty, byCell: v.byCell || null, top: top.slice(0, 5), inferredType: inferType(top.length ? top : ['x']), hint: (HINT.find(([re]) => re.test(k)) || [null, 'unclassified'])[1], classification: 'UNVERIFIED (semantic-map decision)', mallan: { internalKey: internal, formSurfaces, persistence: FORM_CONTRACT.persistenceMap[k] || null, rawPayloadPersisted: customSyncFlag && customFieldsPersisted.length > 0, reachableByCriterion: false } };
});

// ── Static defect register — survey findings re-verified mechanically at generation time ──────────
const srcText = (rel) => { const sf = ctx.files.get(rel); if (sf) return sf.getFullText(); const p = path.join(ROOT, rel); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const STATIC_DEFECTS = [
  { id: 'cma-contract_closed', surface: 'CMA', claim: 'lib/cma/engine.ts filters prisma.listing by `contract_closed`, a Deal column that model Listing does not declare (Prisma validation error at runtime; the `as Prisma.ListingWhereInput` cast hides it)', cite: 'lib/cma/engine.ts:93-99; prisma/schema.prisma:165 (Deal), :437 (Listing)', check: () => { const eng = srcText('lib/cma/engine.ts'); const schema = srcText('prisma/schema.prisma'); const i = schema.indexOf('model Listing {'); const block = i >= 0 ? schema.slice(i, schema.indexOf('\n}', i)) : ''; const inListing = /\bcontract_closed\b/.test(block); return { status: /contract_closed:\s*\{/.test(eng) && !inListing ? 'CONFIRMED (static)' : 'NOT REPRODUCED', detail: `engine references contract_closed: ${/contract_closed/.test(eng)}; Listing model declares it: ${inListing}` }; } },
  { id: 'comps-window-modification', surface: 'CMA', claim: 'lib/comps/fetch-comps.ts windows comps by `ModificationTimestamp gt`, so a listing closed years ago but touched recently is admitted as a closed comp', cite: 'lib/comps/fetch-comps.ts:36-40,126,191; lib/search/canonical/comp-eligibility.ts:5-9', check: () => ({ status: /ModificationTimestamp gt/.test(srcText('lib/comps/fetch-comps.ts')) ? 'CONFIRMED (static pattern)' : 'NOT REPRODUCED' }) },
  { id: 'comp-eligibility-unwired', surface: 'CMA', claim: 'lib/search/canonical/comp-eligibility.ts (CloseDate windowing) has no importer in lib/cma, lib/comps, lib/market-report, lib/seller-report or lib/pitch-packet', cite: 'import graph', check: () => { const imp = [...(importers.get('lib/search/canonical/comp-eligibility.ts') || [])]; const hit = imp.filter((f) => /^lib\/(cma|comps|market-report|seller-report|pitch-packet)\//.test(f)); return { status: hit.length ? 'NOT REPRODUCED' : 'CONFIRMED (import graph)', detail: `importers: ${imp.join(', ') || 'none'}` }; } },
  { id: 'cma-own-provider-mapping', surface: 'CMA', claim: 'CMA, comps and every report keep their own provider query/mapping and never import lib/search/engine/**', cite: 'lib/cma/engine.ts:8; lib/comps/fetch-comps.ts:65-90; lib/market-report/generator.ts:167-248; app/api/crm/sales/prospects/[id]/{pitch-packet,pdf,comps,research}/route.ts; app/api/market/route.ts:196', check: () => { const files = [...ctx.files.keys()].filter((f) => /^(lib\/(cma|comps|market-report|seller-report|pitch-packet|pdf)\/|app\/api\/(cma|market|crm\/cma|crm\/market-report|crm\/sales)\/)/.test(f)); const usesEngine = files.filter((f) => /from ['"](@\/)?lib\/search\/engine\//.test(srcText(f))); return { status: usesEngine.length ? 'NOT REPRODUCED' : 'CONFIRMED (import graph)', detail: `${files.length} CMA/report files, ${usesEngine.length} import the engine` }; } },
  { id: 'patch-bypasses-contract', surface: 'Sale Form / Rental Form', claim: 'PATCH app/api/crm/listings/[id]/route.ts never calls normalizePayload / buildPersistenceRecord (POST does) — create-save and edit-save persist through different rules', cite: 'app/api/crm/listings/route.ts:363,404; app/api/crm/listings/[id]/route.ts:17,387-396,415-428,519', check: () => { const patch = srcText('app/api/crm/listings/[id]/route.ts'); const post = srcText('app/api/crm/listings/route.ts'); return { status: /normalizePayload|buildPersistenceRecord/.test(post) && !/normalizePayload|buildPersistenceRecord/.test(patch) ? 'CONFIRMED (static)' : 'NOT REPRODUCED' }; } },
  { id: 'viewer-phantom-targets', surface: 'Sale Tools / Rental Tools', claim: 'the WITH-TOOLS viewers hydrate element ids that do not exist in their own HTML (silent no-ops)', cite: 'public/crm/SALE-FORM-WITH-TOOLS.html:5007,5036-5190; public/crm/RENTAL-FORM-WITH-TOOLS.html:4447-4613', check: () => { const s = surfaceStats.saleTools.viewer; const r = surfaceStats.rentalTools.viewer; const n = (s?.missingTargets.length || 0) + (r?.missingTargets.length || 0); return { status: n ? 'CONFIRMED (static)' : 'NOT REPRODUCED', detail: `sale ${s ? `${s.missingTargets.length} of ${s.targets}` : 'n/a'}; rental ${r ? `${r.missingTargets.length} of ${r.targets}` : 'n/a'}: ${[...(s?.missingTargets || []), ...(r?.missingTargets || [])].slice(0, 20).join(', ')}` }; } },
  { id: 'no-round-trip-test', surface: 'Sale Form / Rental Form', claim: 'no test performs an actual create → save → reload → edit → save → reload of field values; the round-trip tests are regex/AST assertions over source', cite: 'tests/runtime/crm-form-field-roundtrip.test.ts; tests/runtime/sale-form-save-load-retention.test.ts; tests/runtime/crm-redesign-rental-hydration.test.ts', check: () => { const rt = testText.filter((t) => /round.?trip|save.*reload|reload/i.test(t.text) && /(prisma\.listing\.(create|update)|request\(|fetch\(|POST|PATCH)/.test(t.text) && !/jest\.mock\(['"]@\/lib\/prisma|mockResolvedValue|jest\.fn\(/.test(t.text)); return { status: rt.length ? 'NOT REPRODUCED' : 'CONFIRMED (heuristic: no unmocked round-trip test found)', detail: rt.map((t) => t.file).join(', ') }; } },
  { id: 'furnished-ungated', surface: 'Rental Search', claim: "public/legacy paths apply the furnished filter without a rental gate (`?type=sale&furnished=true` narrows the sale universe)", cite: 'lib/search/public-listing-trestle.ts:332; lib/search/public-listing-db.ts:402-405; lib/search/types.ts:183', check: () => { const gated = (f) => { const s = srcText(f); const sites = (s.match(/params\.get\("furnished"\) === "true"/g) || []).length; const guarded = (s.match(/params\.get\("furnished"\) === "true" && params\.get\("type"\) === "rent"/g) || []).length; return { sites, guarded }; }; const t = gated('lib/search/public-listing-trestle.ts'); const d = gated('lib/search/public-listing-db.ts'); const ungated = (t.sites - t.guarded) + (d.sites - d.guarded); return { status: ungated > 0 ? 'CONFIRMED (static: ' + ungated + ' furnished site(s) without a type=rent guard)' : 'NOT REPRODUCED', detail: 'trestle ' + t.guarded + '/' + t.sites + ' guarded · db ' + d.guarded + '/' + d.sites + ' guarded' }; } },
  { id: 'sale-negative-membership', surface: 'Sale Search', claim: "the public Trestle path builds the sale universe as `PropertyType ne 'ResidentialLease'` while the engine and the registry use positive membership `eq 'Residential'`", cite: 'lib/search/public-listing-trestle.ts:153-157; lib/search/engine/provider-query.ts:28-31,84; lib/search/canonical/field-registry.ts:131', check: () => ({ status: /PropertyType ne 'ResidentialLease'/.test(srcText('lib/search/public-listing-trestle.ts')) && /PropertyType eq '\$\{PROPERTY_TYPE_FOR_WORKFLOW/.test(srcText('lib/search/engine/provider-query.ts')) ? 'CONFIRMED (static)' : 'NOT REPRODUCED' }) },
  { id: 'no-fee-phantom', surface: 'Rental Search', claim: "AMENITY_FIELD_MAP 'no-fee' targets ListingTerms values that are not published members, on a field with 0 rows", cite: 'lib/search/types.ts:149; live Lookup ListingTerms', check: () => { const ph = amenityPhantoms.filter((p) => p.key === 'no-fee'); return { status: ph.length ? 'CONFIRMED (live vocabulary)' : 'NOT REPRODUCED', detail: ph.map((p) => `${p.field}=${p.value}`).join(', ') + ` · ListingTerms populated ${fmtN(P.ListingTerms?.populated)}` }; } },
  { id: 'engine-no-rental-criteria', surface: 'Rental Search', claim: 'the Search engine has no rental-specific criterion: rental fields are selected for hydration but never filterable (furnished/pets/lease terms refused as unsupported params)', cite: 'lib/search/engine/criteria.ts:96-100,153-156; lib/search/engine/select.ts:39-44', check: () => { const c = srcText('lib/search/engine/criteria.ts'); return { status: !/furnished|Furnished|PetsAllowed|LeaseTerm|AvailabilityDate/.test(c) && /EXECUTED_PARAMS/.test(c) ? 'CONFIRMED (static)' : 'NOT REPRODUCED' }; } },
  { id: 'market-mlsstatus-filter', surface: 'Reports', claim: "app/api/market/route.ts filters `MlsStatus eq 'Active'` — a provider-suppressed field whose $filter the provider rejects; the failure is swallowed", cite: 'app/api/market/route.ts:200; contract Property.MlsStatus filterable:false', check: () => ({ status: /MlsStatus eq 'Active'/.test(srcText('app/api/market/route.ts')) && P.MlsStatus?.filterable === false ? 'CONFIRMED (static + contract)' : 'NOT REPRODUCED' }) },
  { id: 'manage-listings-closed-rejected', surface: 'Sale Tools / Rental Tools', claim: "Manage Listings posts status 'Closed' (display Sold/Leased → resoMap) to PATCH /status, whose canonical vocabulary has no 'Closed' — the request is rejected after the UI already announced success", cite: 'public/crm/js/manage/manage-listings.js:1105-1114; app/api/crm/listings/[id]/status/route.ts:99-104; lib/crm/status-mapping.ts', check: () => { const js = readFileSync(path.join(ROOT, 'public/crm/js/manage/manage-listings.js'), 'utf8'); const sm = srcText('lib/crm/status-mapping.ts'); const canon = /CANONICAL_STATUSES[^;]*?\[([^\]]*)\]/s.exec(sm); const members = canon ? [...canon[1].matchAll(/['"]([A-Za-z]+)['"]/g)].map((m) => m[1]) : []; return { status: /['"]Sold['"]:\s*['"]Closed['"]/.test(js) && members.length && !members.includes('Closed') ? 'CONFIRMED (static)' : 'NOT REPRODUCED', detail: `canonical statuses: ${members.join(', ')}` }; } },
  { id: 'compliance-allowed-phantoms', surface: 'Compliance', claim: 'the CRM compliance console ALLOWED list names fields that are not on the live contract', cite: 'public/crm/js/compliance/compliance-gates-and-output.js:1539', check: () => { const js = readFileSync(path.join(ROOT, 'public/crm/js/compliance/compliance-gates-and-output.js'), 'utf8'); const m = /var ALLOWED = \[([^\]]*)\]/s.exec(js); const names = m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : []; const cotalityLike = names.filter((n) => /^[A-Z][A-Za-z0-9]+$/.test(n)); const phantom = cotalityLike.filter((n) => !providerFieldsAll.has(n) && !INTERNAL.has(n)); return { status: phantom.length ? 'CONFIRMED (static + contract)' : 'NOT REPRODUCED', detail: `${names.length} names, ${phantom.length} not on the contract or Mallan-internal: ${phantom.join(', ')}` }; } },
  { id: 'rental-rules-status-vocabulary', surface: 'Rental Form', claim: 'rental-field-rules.js branches on status values that the provider vocabulary does not publish (PermOffMarket, TempOffMarket, LeasedThruUs, Cancelled)', cite: 'public/crm/js/compliance/rental-field-rules.js:106-125; Lookup StandardStatus / MlsStatus', check: () => { const js = readFileSync(path.join(ROOT, 'public/crm/js/compliance/rental-field-rules.js'), 'utf8'); const vocab = new Set([...(lookups.Property?.StandardStatus?.members || []), ...(lookups.Property?.MlsStatus?.members || [])]); const used = uniq([...js.matchAll(/['"](PermOffMarket|TempOffMarket|LeasedThruUs|Cancelled|Leased|Expired|Withdrawn)['"]/g)].map((m) => m[1])); const off = used.filter((u) => !vocab.has(u)); return { status: off.length ? 'CONFIRMED (static + vocabulary)' : 'NOT REPRODUCED', detail: `used: ${used.join(', ')}; not published: ${off.join(', ')}` }; } },
  { id: 'rent-vs-buy-synthetic-price', surface: 'Rental Tools', claim: 'the public rental detail page feeds RentVsBuyCalculator a synthetic purchase price (monthly rent × 250) and zeroed carrying costs although associationFee/taxAnnualAmount are on the same DTO', cite: 'app/listing/[...slug]/page.tsx:1866-1872', check: () => ({ status: /listPrice \* 250/.test(srcText('app/listing/[...slug]/page.tsx')) ? 'CONFIRMED (static)' : 'NOT REPRODUCED' }) },
  { id: 'crm-calculators-no-category-guard', surface: 'Sale Tools / Rental Tools', claim: 'public/crm/js/output/calculators.js applies sale arithmetic (mansion/transfer tax, mortgage) to any listing without checking listingCategory', cite: 'public/crm/js/output/calculators.js:54-115', check: () => { const js = readFileSync(path.join(ROOT, 'public/crm/js/output/calculators.js'), 'utf8'); return { status: /MANSION_TAX|getMansionTax/.test(js) && !/listingCategory|listing_type|listingType/.test(js) ? 'CONFIRMED (static)' : 'NOT REPRODUCED' }; } },
  { id: 'status-vocabularies-multiplied', surface: 'Lifecycle', claim: 'at least four independent status vocabularies exist on the tool path (mallan-status.ts, status-mapping.ts, status route STATUS_TRANSITIONS, manage-listings statusMap/resoMap)', cite: 'lib/listings/mallan-status.ts; lib/crm/status-mapping.ts; app/api/crm/listings/[id]/status/route.ts:27-39; public/crm/js/manage/manage-listings.js:45,714,1105', check: () => { const n = [/STATUS_TRANSITIONS/.test(srcText('app/api/crm/listings/[id]/status/route.ts')), /CANONICAL_STATUSES/.test(srcText('lib/crm/status-mapping.ts')), /MALLAN_/.test(srcText('lib/listings/mallan-status.ts')), /resoMap/.test(readFileSync(path.join(ROOT, 'public/crm/js/manage/manage-listings.js'), 'utf8'))].filter(Boolean).length; return { status: n >= 4 ? 'CONFIRMED (static)' : 'NOT REPRODUCED', detail: `${n} vocabularies located` }; } },
];
for (const d of STATIC_DEFECTS) { try { Object.assign(d, d.check()); } catch (e) { d.status = `CHECK ERROR: ${e.message}`; } delete d.check; }

// ── IDX Plus cross-check (discovery aid) ────────────────────────────────────
const idxRows = [];
{
  const p = path.join(ROOT, 'data/rebny-rls-property-fields.csv');
  if (existsSync(p)) {
    const RM = { 'Custom Property': 'CustomProperty', 'Open House': 'OpenHouse', 'Property UnitTypes': 'PropertyUnitTypes', Property: 'Property', Media: 'Media', Member: 'Member', Office: 'Office' };
    for (const ln of readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).slice(1)) {
      const c = ln.split(',');
      const name = c[1]; const resource = RM[c[5]] || c[5]; const feed = c[c.length - 1];
      const row = resource === 'Property' ? propertyRows.find((r) => r.field === name) : (navFieldRows[resource] || []).find((r) => r.field === name);
      const entitled = Boolean(RES[resource]?.fields?.[name]);
      const inCatalogue = Boolean(catalogueRow(resource, name));
      const v = row?.mallan.verdicts;
      idxRows.push({ feed, resource, name, standardType: c[6], classification: entitled ? 'exact Cotality match' : inCatalogue ? 'catalogue-only (not entitled)' : 'not found', availability: row?.provider.availability.class || 'n/a', population: row?.provider.rows ?? null,
        mapped: v ? v.mapping : '—', persisted: v ? v.storage : '—', saleSearch: v ? v.saleSearch : '—', rentalSearch: v ? v.rentalSearch : '—', saleForm: v ? v.saleForm : '—', rentalForm: v ? v.rentalForm : '—', saleTools: v ? v.saleTools : '—', rentalTools: v ? v.rentalTools : '—', cma: v ? v.cma : '—', reporting: v ? v.reporting : '—', publicVisibility: v ? v.publicVisibility : '—', compliance: v ? v.compliance : '—',
        neverSurfaces: row ? row.mallan.consumers === 0 && row.mallan.stage.mapper.status === 'MISSING' && row.mallan.stage.saleForm.status === 'MISSING' && row.mallan.stage.rentalForm.status === 'MISSING' : null });
    }
  }
}

// ── Domains (many-to-many) ─────────────────────────────────────────────────
function aggregate(rows) {
  const v = rows.map((r) => r.mallan.verdict);
  if (!rows.length) return 'NO-POPULATED-FIELDS';
  if (v.some((x) => x === 'DEFECT')) return 'DEFECT';
  if (v.every((x) => x === 'COMPLETE')) return 'COMPLETE';
  if (v.every((x) => x === 'COMPLETE' || x === 'UNVERIFIED')) return 'UNVERIFIED';
  if (v.every((x) => x === 'MISSING')) return 'MISSING';
  return 'PARTIAL';
}
const semanticDomains = uniq(PRIMARY.map((p) => p[0]));
const businessDomains = uniq([...Object.values(STAGE_DOMAIN), ...SERVES.flatMap(([, d]) => d)]).filter((d) => d !== 'Search').sort();
const domainViews = [];
for (const name of [...semanticDomains, ...businessDomains.filter((b) => !semanticDomains.includes(b))]) {
  const primaryRows = propertyRows.filter((r) => r.primary.name === name);
  const servedRows = propertyRows.filter((r) => r.domainsServed.includes(name));
  const pPop = primaryRows.filter((r) => r.provider.rows > 0);
  const sPop = servedRows.filter((r) => r.provider.rows > 0);
  const availability = {};
  for (const r of [...primaryRows, ...servedRows]) availability[r.provider.availability.class] = (availability[r.provider.availability.class] || 0) + 1;
  const all = [...pPop, ...sPop.filter((r) => !pPop.includes(r))];
  domainViews.push({
    name, kind: semanticDomains.includes(name) ? 'semantic' : 'business',
    primaryFields: primaryRows.length, primaryPopulated: pPop.length, servedFields: servedRows.length, servedPopulated: sPop.length,
    verdictPrimary: aggregate(pPop), verdictServed: aggregate(sPop),
    counts: Object.fromEntries(['COMPLETE', 'UNVERIFIED', 'DEFECT', 'PARTIAL', 'MISSING'].map((k) => [k, all.filter((r) => r.mallan.verdict === k).length])),
    availability,
    notInSyncSelect: uniq(all.filter((r) => !r.mallan.stage.rawSelection.sync).map((r) => r.field)),
    consumers: uniq(all.flatMap((r) => r.mallan.consumerSites.map((c) => c.file))).length,
    columns: Object.fromEntries(['saleSearch', 'rentalSearch', 'saleForm', 'rentalForm', 'saleTools', 'rentalTools', 'cma', 'reporting', 'publicVisibility', 'memberVisibility', 'compliance'].map((k) => [k, all.filter((r) => String(r.mallan.verdicts[k]).startsWith('PASS')).length])),
  });
}

// ── Render ─────────────────────────────────────────────────────────────────
const fmtSites = (arr, n = 3) => (arr.length ? arr.slice(0, n).map((s) => `\`${s}\``).join(' ') + (arr.length > n ? ` +${arr.length - n}` : '') : '—');
const fmtList = (arr, n = 6) => (arr.length ? arr.slice(0, n).map((s) => `\`${s}\``).join(', ') + (arr.length > n ? ` +${arr.length - n}` : '') : '—');
const S = (st) => ({ PASS: '✔', REACHABLE: '~', MISSING: '✘', UNVERIFIED: '?', DEFECT: '‼', 'CITATION-STALE': '‼?', 'N/A': '·', FAIL: '✘', INFO: 'i' }[st] || (String(st).startsWith('UNVERIFIED') ? '?' : st));
const liveCell = (r) => { const p = r.provider; return `${p.availability.class} · ${fmtN(p.population.all)}${p.population.active != null ? ` / ${fmtN(p.population.active)} A` : ''} · ${p.rlsDefined ? 'RLS' : 'not RLS'}`; };

const md = [];
md.push('# Search coverage matrix v3 — provider fact × provider access path × Mallan consumer graph (2026-09-08)');
md.push('');
md.push(`Feed: ${graph.feed}. Provider facts from \`data/cotality-contract/*\` (entitled $metadata, light probe ${compact.fingerprint.acquired_at}) and the live censuses under \`docs/operations/evidence-2026-09-08/\` (suppressed fields: ${supAll ? fmtN(supAll.resources.Property.rows) + ' rows all statuses' : 'Active only'}; enum members: ${enumCensus ? Object.keys(enumCensus.fields).length + ' fields' : 'not run'}; observed vocabulary: ${observed ? 'groupby, all statuses' : 'not run'}; navigation capability: ${navCap ? navCap.generated : 'not run'}; navigation walks: ${navActive ? 'Active' : '—'}${navAll ? ' + all statuses' : ' (all-status walk pending)'}; transaction state: ${txn ? fmtN(txn.property.rows) + ' rows' : 'not run'}). Mallan facts from the TypeScript program (mapper dataflow, reader census, selection authorities, the form contract parsed from its AST, the four CRM surfaces parsed from their HTML) and the test tree. Declared tables (primary semantics, served-domain hints, required consumers, tool scopes, behaviour register) are policy and are printed in §L.`);
md.push('');
md.push('Never collapsed: **provider availability** (POPULATED · DECLARED-EMPTY (RLS-defined) · NOT-ON-FEED (not RLS-defined) · SUPPRESSED — filter rejected, null on every walked row, proves nothing is delivered today, not that it never can be · REJECTED-RESOURCE · UNMEASURED), **provider access path** (§A.1), and **Mallan consumers** as independent columns. A field has one primary semantic and many consumers; the domains it serves are declared hints plus the domains of the consumers actually found. Sale and Rental search are classified from the workflow context of the reading code; forms and tools from the surface the control lives on. COMPLETE only when every required consumer for the primary semantic is mechanically PASS; reachable-only (~) and unproven behaviour stay UNVERIFIED.');
md.push('');

md.push('## A. Provider graph — resources, navigations, access paths (live)');
md.push('');
md.push('| Resource | Entitled | Entity set | Entitled fields | Catalogue fields | Catalogue-only | Declared navigations | Runtime pulls |');
md.push('|---|---|---|---|---|---|---|---|');
for (const [r, v] of Object.entries(graph.resources)) md.push(`| ${r} | ${v.entitled ? 'yes' : 'no'} | HTTP ${v.access?.http ?? 'n/a'} | ${v.entitledFields} | ${v.catalogueFields ?? '—'} | ${v.catalogueOnlyFields ? v.catalogueOnlyFields.length : '—'} | ${Object.entries(v.navigation).map(([n, x]) => `${n}→${x.target} (${x.expand}${x.http ? ` ${x.http}` : ''})`).join(', ') || '—'} | ${v.runtimePulls.length ? fmtList(v.runtimePulls, 3) : '**never**'} |`);
md.push('');
md.push('### A.1 Property navigations × status — declared · HTTP · collection present · populated · linkage · exhaustive walks');
md.push('');
md.push('| Navigation → target | Declared | $expand HTTP | Target entity set | Collection key present (A/P/CS/C) | Populated / sampled by status | Records | Key linkage (match/mismatch/scalar-null) | Exhaustive Active | Exhaustive all statuses | Runtime expands it |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [n, g] of Object.entries(graph.propertyNavigations)) {
  const bs = g.byStatus || {};
  const sts = Object.keys(bs);
  const pop = sts.map((st) => `${st} ${bs[st].populated}/${bs[st].sampled}`).join(' · ') || 'not measured';
  const link = uniq(sts.flatMap((st) => Object.entries(bs[st].linkage).map(([k, v]) => `${st} ${k}: ${v.match}/${v.mismatch}/${v.scalarNull}`))).join('; ') || '—';
  const rec = sts.map((st) => bs[st].records).reduce((a, b) => a + b, 0);
  md.push(`| \`${n}\` → ${g.target} | yes | ${uniq(sts.map((st) => bs[st].http)).join('/') || g.expandHttp} | HTTP ${g.targetEntitySet?.http ?? 'n/a'} | ${sts.map((st) => bs[st].collectionKeyPresent).join('/') || '—'} | ${pop} | ${rec} | ${link} | ${g.exhaustive.active ? `${fmtN(g.exhaustive.active.rowsWithPayload)} of ${fmtN(g.exhaustive.active.rows)}` : '—'} | ${g.exhaustive.all ? `${fmtN(g.exhaustive.all.rowsWithPayload)} of ${fmtN(g.exhaustive.all.rows)} (${Object.entries(g.exhaustive.all.byStatus).map(([s, c]) => `${s} ${fmtN(c)}`).join(', ')})` : 'walk pending'} | ${g.runtimeExpands.length ? fmtList(g.runtimeExpands, 3) : '**never**'} |`);
}
md.push('');
md.push('Direct access by the linked key: ' + ((navCap?.directProbes || []).map((d) => `${d.target} \`${d.filter}\` → HTTP ${d.http}${d.count != null ? ` count ${d.count}` : ''}`).join('; ') || 'not measured') + '.');
md.push('');
md.push('Navigation empty although the Property scalar names a record: ' + ((navCap?.emptyFollowUps || []).length ? uniq(navCap.emptyFollowUps.map((e) => `${e.nav}/${e.status} ${e.scalar} → ${e.count === 0 ? 'not in the entitled roster' : `found (${e.count})`}`)).slice(0, 12).join('; ') : 'none') + '.');
md.push('');
md.push('Second hop: ' + graph.secondHop.map((s) => `${s.label} → HTTP ${s.http}${s.http !== 200 ? ` (${(s.message || '').replace(/[{}"]/g, '').slice(0, 90)})` : ''}`).join('; ') + '.');
md.push('');
md.push('Key linkage rules: ' + Object.entries(graph.keyLinkage).map(([k, v]) => `**${k}** — ${v}`).join('; ') + '.');
md.push('');

md.push('## B. Selection authorities — every provider field list the program sends');
md.push('');
md.push('| Authority | File | Role | Resource | Fields | Kind |');
md.push('|---|---|---|---|---|---|');
for (const a of authorities.filter((x) => x.role !== 'test' && x.role !== 'keep-list').sort((x, y) => x.role.localeCompare(y.role) || x.file.localeCompare(y.file))) md.push(`| \`${a.name}\` | \`${a.file}\` | ${a.role} | ${a.resource} | ${a.fields.length} | ${a.kind} |`);
{
  const sync = new Set(allProperty.filter((f) => fetched.has(`Property.${f}`)));
  const runtime = new Set(allProperty.filter((f) => authoritiesByRole('Property', f, ['runtime-search', 'cards']).length));
  md.push('');
  md.push(`Property divergence — sync union ${sync.size} fields; runtime ${runtime.size}; **in runtime but never persisted:** ${fmtList([...runtime].filter((f) => !sync.has(f)), 40)}; **persisted but not in runtime:** ${fmtList([...sync].filter((f) => !runtime.has(f)), 40)}.`);
  md.push('');
}

md.push('## C. CRM surfaces — how the four HTML surfaces bind to the contract');
md.push('');
md.push('Controls are named `sale<Key>` / `rental<Key>`; `<Key>` is resolved through `MALLAN_FORM_CONTRACT.aliasToCanonical` (parsed from the AST), then as a live Cotality Property/CustomProperty field, then as a Mallan-internal key. Unresolved controls are listed so nothing is assumed.');
md.push('');
md.push('| Surface | File | Controls | Keyed (id or name) | data-rls-field | data-mallan-field | data-rls-ignore | Prefix-resolved | Cotality fields bound | Unresolved (first 12) | Viewer hydration targets missing |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [s, st] of Object.entries(surfaceStats)) md.push(`| ${s} | \`${st.file}\` | ${st.controls} | ${st.keyed} | ${st.rlsField} | ${st.mallanField} | ${st.ignored} | ${st.prefixResolved} | ${[...surfaceControls[s].keys()].filter((k) => P[k] || CP[k]).length} | ${st.unresolved.slice(0, 12).map((u) => `\`${u}\``).join(', ')}${st.unresolved.length > 12 ? ` +${st.unresolved.length - 12}` : ''} | ${st.viewer ? `${st.viewer.missingTargets.length} of ${st.viewer.targets}` : '—'} |`);
md.push('');
md.push(`Form contract: ${Object.keys(FORM_CONTRACT.aliasToCanonical).length} aliases, ${Object.keys(FORM_CONTRACT.persistenceMap).length} persistence entries, ${FORM_CONTRACT.internalKeys.length} Mallan-internal keys. Tools-only controls (on the WITH-TOOLS page, absent from the entry form): sale ${surfaceControls.saleToolsOnly.size} keys, rental ${surfaceControls.rentalToolsOnly.size} keys. The WITH-TOOLS pages are read-only viewers (\`data-rls-viewer\`) that re-project the canonical API payload into a private shape — they are not entry forms.`);
md.push('');
md.push('### C.1 Static defect register — survey findings re-verified mechanically');
md.push('');
md.push('| Id | Surface | Claim | Verification | Detail | Citation |');
md.push('|---|---|---|---|---|---|');
for (const d of STATIC_DEFECTS) md.push(`| ${d.id} | ${d.surface} | ${d.claim} | **${d.status}** | ${(d.detail || '').replace(/\|/g, '/')} | ${d.cite} |`);
md.push('');
md.push(`AMENITY_FIELD_MAP members not published by the live vocabulary (${amenityPhantoms.length}): ${amenityPhantoms.map((p) => `\`${p.key}\` → ${p.field}=${p.value}${p.fieldPopulated === 0 ? ' (field 0 rows)' : ''}`).join('; ') || 'none'}.`);
md.push('');

md.push('## D. Domains — one field, one primary semantic, many domains served');
md.push('');
md.push('| Domain | Kind | Primary (populated) | Served (populated) | Verdict primary | Verdict incl. served | C/U/D/P/M | Sale Search · Rental Search · Sale Form · Rental Form · Sale Tools · Rental Tools · CMA · Reports · Public · Member · Compliance (fields PASS) | Provider availability | Not persisted | Consumer files |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const d of domainViews) md.push(`| ${d.name} | ${d.kind} | ${d.primaryFields} (${d.primaryPopulated}) | ${d.servedFields} (${d.servedPopulated}) | ${d.kind === 'semantic' ? `**${d.verdictPrimary}**` : '—'} | ${d.kind === 'semantic' ? d.verdictServed : `**${d.verdictServed}**`} | ${Object.values(d.counts).join('/')} | ${Object.values(d.columns).join(' · ')} | ${Object.entries(d.availability).map(([k, v]) => `${k}: ${v}`).join(', ')} | ${d.notInSyncSelect.length} | ${d.consumers} |`);
md.push('');

md.push('## E. Field register — every entitled Property field, three dimensions, independent verdict columns');
md.push('');
md.push('Legend: ✔ direct read/binding found · ~ reachable only through an import (counts as UNVERIFIED) · ✘ none · ? unverified · ‼ documented defect · · not applicable. Columns: Sel (S sync · R runtime · O other) · Map · Store · Reload · Sale Srch · Rent Srch · Sale Form · Rent Form · Sale Tools · Rent Tools · CMA · Rep · Saved · Alert · DTO · Card · Wksp · Mkt · Portal · Public · Compl · Tests D/N/I/W/C · Behaviour Pu/Me/Pr · Prod · Verdict · Consumers · Domains served. For a field the provider never delivers the verdict is Mallan readiness and a bound/read field is a DEAD PATH.');
md.push('');
for (const name of semanticDomains) {
  const rows = propertyRows.filter((r) => r.primary.name === name).sort((a, b) => (b.provider.rows || 0) - (a.provider.rows || 0) || a.field.localeCompare(b.field));
  md.push(`### ${name} — primary verdict **${domainViews.find((d) => d.name === name).verdictPrimary}** (${rows.length} fields, ${rows.filter((r) => r.provider.rows > 0).length} populated)`);
  md.push('');
  md.push('| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const s = r.mallan.stage; const v = r.provider.vocabulary;
    const vocab = v ? `${v.authority.replace('Field.LookupName=', '')} / obs ${v.observedMembers ? v.observedMembers.length : '?'}${v.observedNotDeclared?.length ? ` (+${v.observedNotDeclared.length} undeclared)` : ''}${v.filterRejectedMembers?.length ? ` · ${v.filterRejectedMembers.length} filter-rejected` : ''} / handled ${v.mallanHandled ? Object.keys(v.mallanHandled).length : 0}${v.declaredNotHandled ? ` of ${v.declaredMembers.length}` : ''}` : '—';
    const sel = `${s.rawSelection.sync ? 'S' : ''}${s.rawSelection.runtime.length ? 'R' : ''}${s.rawSelection.other.length ? 'O' : ''}` || '✘';
    const persist = s.persistence.status === 'PASS' ? `${s.persistence.structured.length ? 'struct' : ''}${s.persistence.structured.length && s.persistence.raw.length ? '+' : ''}${s.persistence.raw.length ? 'raw' : ''}${s.persistence.formContract ? (s.persistence.structured.length || s.persistence.raw.length ? '+form' : 'form') : ''}` : '✘';
    md.push(`| \`${r.field}\` | ${liveCell(r)} | ${vocab} | ${sel} | ${S(s.mapper.status)} | ${persist} | ${S(s.reload.status)} | ${S(s.saleSearch.status)} | ${S(s.rentalSearch.status)} | ${S(s.saleForm.status)} | ${S(s.rentalForm.status)} | ${S(s.saleTools.status)} | ${S(s.rentalTools.status)} | ${S(s.cma.status)} | ${S(s.reports.status)} | ${S(s.savedSearch.status)} | ${S(s.alerts.status)} | ${S(s.resultDto.status)} | ${S(s.resultCard.status)} | ${S(s.listingWorkspace.status)} | ${S(s.marketing.status)} | ${S(s.portalSharing.status)} | ${S(s.publicConsumer.status)} | ${S(s.complianceRule.status)} | ${S(s.directTest.status)}/${S(s.negativeTest.status)}/${S(s.integrationTest.status)}/${S(s.downstreamTest.status)}/${S(s.complianceTest.status)} | ${S(s.publicBehavior.status)}/${S(s.memberBehavior.status)}/${S(s.privateSharingBehavior.status)} | ${S(s.productionProof.status)} | ${r.provider.rows === 0 ? `readiness ${r.mallan.verdict}${r.mallan.wiredForSync ? ' (wired)' : ' (unwired)'}${r.mallan.deadPath ? ' · **DEAD PATH**' : ''}` : `**${r.mallan.verdict}**${r.mallan.verdict === 'PARTIAL' ? ` (${r.mallan.missingStatic.join(', ')})` : ''}`} | ${r.mallan.consumers} | ${r.domainsServed.join(', ') || '—'} |`);
  }
  md.push('');
}

md.push('## F. Navigation subsections — target resource fields, access path, Mallan consumers');
md.push('');
for (const r of SUBSECTION_RESOURCES) {
  const rows = navFieldRows[r].sort((a, b) => (b.provider.rows || 0) - (a.provider.rows || 0) || a.field.localeCompare(b.field));
  const navs = NAV_BY_TARGET[r] || [];
  md.push(`### ${r} — reached by ${navs.map((n) => `\`Property.${n}\``).join(', ')}; entity set HTTP ${navCap?.entitySets?.[r]?.http ?? RES[r].access.http}; runtime pulls: ${runtimePulls[r].length ? fmtList(runtimePulls[r], 4) : '**never**'}`);
  md.push('');
  md.push('| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const x of rows) {
    const p = x.provider; const s = x.mallan.stage;
    const stages = Object.entries(s).filter(([k, v]) => v.sites && v.sites.length && !['sync'].includes(k)).map(([k, v]) => `${k} ${fmtSites(v.sites, 2)}`).join('; ') || '—';
    md.push(`| \`${x.field}\` | ${p.availability.class} · ${fmtN(p.population.all)} · ${p.rlsDefined ? 'RLS' : 'not RLS'} | ${p.vocabulary ? `${p.vocabulary.authority.replace('Field.LookupName=', '')} / obs ${p.vocabulary.observedMembers ? p.vocabulary.observedMembers.length : '?'}` : '—'} | ${s.rawSelection.status === 'PASS' ? fmtList(s.rawSelection.all, 2) : '✘'} | ${S(s.saleForm.status)} | ${S(s.rentalForm.status)} | ${stages} | ${S(s.directTest.status)}/${S(s.integrationTest.status)} | ${P[x.field] ? 'yes — name-matched reads may be Property reads' : 'no'} |`);
  }
  md.push('');
}

md.push(`## G. CustomProperty.CustomFields — ${customKeys.length} keys (${txn ? `${fmtN(txn.customFields.rows)} rows, all statuses` : `Active census ${fmtN(amenity?.customFields?.rows)}`})`);
md.push('');
md.push(`Raw payload persisted losslessly by the sync: **${customSyncFlag && customFieldsPersisted.length ? 'yes' : 'NO'}** (\`expandCustomProperty: true\` in lib/idx/sync.ts: ${customSyncFlag}; \`custom_fields\` written by: ${customFieldsPersisted.length ? fmtList(customFieldsPersisted) : 'nothing'}). No key is reachable by any Search criterion. Classification is a semantic-map decision and stays UNVERIFIED; the hint column is name-based only. Keys that are also Mallan-internal form keys show their form surfaces and persistence.`);
md.push('');
md.push('| Key | Rows | Non-empty | By segment/status (top) | Type | Top values (Active) | Hint | Mallan form surfaces | Form persistence |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const k of customKeys.sort((a, b) => b.nonEmpty - a.nonEmpty)) md.push(`| \`${k.key}\` | ${fmtN(k.rows)} | ${fmtN(k.nonEmpty)} | ${k.byCell ? Object.entries(k.byCell).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${c} ${fmtN(n)}`).join(' · ') : '—'} | ${k.inferredType} | ${k.top.join(' · ') || '—'} | ${k.hint} | ${k.mallan.formSurfaces.join(', ') || '—'} | ${k.mallan.persistence ? JSON.stringify(k.mallan.persistence) : '—'} |`);
md.push('');

md.push('## H. Media model — resource, categories, Property carriers');
md.push('');
const mc = mediaCensus.MediaCategory;
const mcDeclared = lookups.Media?.MediaCategory?.members || [];
const mcHandled = mcDeclared.filter((m) => (readers.get(`member:${m}`) || []).some((s) => !isTestFile(s.file) && !s.file.startsWith('scripts/')));
md.push(`MediaCategory — published members (${mcDeclared.length}): ${mcDeclared.join(', ')}. Observed (${mc ? fmtN(mc.non_null_total) + ' rows' : 'n/a'}): ${mc ? Object.entries(mc.counts).map(([k, v]) => `${k} ${fmtN(v)}`).join(', ') : 'n/a'}. Mallan names as literals: ${mcHandled.join(', ') || 'none'}. Media.ResourceName observed: Property and Building (62 Building photo rows keyed by BuildingKey; Member/Office media: 0). Tours and videos exist only as Property carriers (six VirtualTourURL* + VideosCount/VideosChangeTimestamp) — §E Tours & video; flags must be derived from each retained provider fact, never from the absence of a MediaCategory.`);
md.push('');
md.push('| Media consumer surface | Property media fields PASS | Media resource fields with a consumer |');
md.push('|---|---|---|');
{
  const mediaRows = propertyRows.filter((r) => r.primary.category === 'media');
  const mediaRes = navFieldRows.Media;
  for (const [label, k] of [['Sale Search', 'saleSearch'], ['Rental Search', 'rentalSearch'], ['Sale Form', 'saleForm'], ['Rental Form', 'rentalForm'], ['Sale Tools', 'saleTools'], ['Rental Tools', 'rentalTools'], ['CMA', 'cma'], ['Reports', 'reports'], ['Listing workspace', 'listingWorkspace'], ['Marketing', 'marketing'], ['Public display', 'publicConsumer'], ['Media lane', 'mediaLane']]) md.push(`| ${label} | ${mediaRows.filter((r) => r.mallan.stage[k].status === 'PASS').map((r) => r.field).join(', ') || '—'} | ${mediaRes.filter((r) => r.mallan.stage[k].status === 'PASS').map((r) => r.field).join(', ') || '—'} |`);
}
md.push('');

md.push('## I. Suppressed-field census, behaviour register, production proofs');
md.push('');
md.push('| Census | Resource | Scope | Rows walked | Suppressed fields | Fields with ≥1 value | Mallan code still binding or reading one |');
md.push('|---|---|---|---|---|---|---|');
for (const [label, src] of [['Active', supActive], ['all statuses', supAll]]) {
  if (!src) continue;
  for (const [r, v] of Object.entries(src.resources)) {
    if (v.error) continue;
    const populated = Object.entries(v.fields).filter(([, f]) => f.nonNull > 0).map(([k, f]) => `${k} (${f.nonNull})`);
    const pool = r === 'Property' ? propertyRows : navFieldRows[r] || [];
    const stillRead = Object.keys(v.fields).filter((f) => { const row = pool.find((x) => x.field === f); return row && (row.mallan.stage.mapper.status === 'PASS' || row.mallan.consumers > 0); });
    md.push(`| ${label} | ${r} | ${v.scope} | ${fmtN(v.rows)} | ${v.suppressed} | ${populated.length ? populated.join(', ') : '**0**'} | ${stillRead.length ? fmtList(stillRead, 40) : '—'} |`);
  }
}
md.push('');
md.push('| Field | Behaviour stage | Status | Citation (pattern re-verified) | Note |');
md.push('|---|---|---|---|---|');
for (const b of BEHAVIOR_REGISTER) md.push(`| \`${b.field}\` | ${b.stage} | **${b.status}** | ${b.cite}${b.citationVerified != null ? ` — pattern ${b.citationVerified ? 'present' : 'NOT FOUND'}` : ''} | ${b.note || ''} |`);
md.push('');
md.push('| Field | Production proof | Note |');
md.push('|---|---|---|');
for (const [f, p] of Object.entries(PRODUCTION_PROOF)) md.push(`| \`${f}\` | ${p.status} | ${p.note} |`);
md.push('');

md.push('## J. Transaction state — how in-contract / off-market / pending / closed manifest (Sale vs Rental)');
md.push('');
if (!txn) md.push('Transaction-state census not present — the lifecycle mapping is NOT declared complete. Run `node scripts/cotality/transaction-state-census.mjs`.');
else {
  md.push(`Census of ${fmtN(txn.property.rows)} Property rows (all statuses): combinations of StandardStatus, PurchaseContractDate, ContractStatusChangeDate, OffMarketDate, OffMarketTimestamp, PendingTimestamp, MajorChangeType, MajorChangeTimestamp, StatusChangeTimestamp (and the surrounding dates), measured separately for Sale (PropertyType Residential) and Rental (ResidentialLease); CustomFields walked for contract terminology (${fmtN(txn.customFields.rows)} rows). Full tables: \`docs/operations/evidence-2026-09-08/transaction-state/transaction-state-census.md\`. No Mallan status label is derived here — this is the evidence the label mapping must be proven against.`);
  md.push('');
  for (const [s, T] of Object.entries(txn.property.bySegment)) {
    md.push(`### ${s} — ${fmtN(T.rows)} rows · ${Object.entries(T.byStatus).map(([k, v]) => `${k} ${fmtN(v)}`).join(' · ')} · MlsStatus/PreviousStandardStatus delivered: ${fmtN(T.mlsStatusNonNull)}/${fmtN(T.previousStatusNonNull)}`);
    md.push('');
    md.push('| Status | Rows | PurchaseContractDate | ContractStatusChangeDate | PendingTimestamp | OffMarketDate | OffMarketTimestamp | StatusChangeTimestamp | MajorChangeTimestamp | CloseDate | BackOnMarketDate | Withdrawn/Cancellation/Expiration/Contingent | MajorChangeType distribution |');
    md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [st, n] of Object.entries(T.byStatus).sort((a, b) => b[1] - a[1])) {
      const pct = (f) => { const c = T.presence[st]?.[f] || 0; return c ? `${fmtN(c)} (${Math.round((100 * c) / n)}%)` : '0'; };
      md.push(`| ${st} | ${fmtN(n)} | ${['PurchaseContractDate', 'ContractStatusChangeDate', 'PendingTimestamp', 'OffMarketDate', 'OffMarketTimestamp', 'StatusChangeTimestamp', 'MajorChangeTimestamp', 'CloseDate', 'BackOnMarketDate'].map(pct).join(' | ')} | ${['WithdrawnDate', 'CancellationDate', 'ExpirationDate', 'ContingentDate'].map((f) => T.presence[st]?.[f] || 0).join('/')} | ${Object.entries(T.majorChangeByStatus[st] || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmtN(v)}`).join(' · ')} |`);
    }
    md.push('');
    md.push(`Active rows carrying contract-shaped dates: ${Object.entries(T.activeWithContractDates).map(([k, v]) => `${k} ${fmtN(v)}`).join(', ') || 'none'}. Closed rows with none of PurchaseContractDate / ContractStatusChangeDate / PendingTimestamp: ${fmtN(T.closedWithoutContractDates)}.`);
    md.push('');
    md.push('Top combination signatures: ' + Object.entries(T.combos).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([sig, n]) => `\`${sig}\` ${fmtN(n)}`).join('; '));
    md.push('');
    md.push('Pairwise (rows with both, day granularity — equal / A before B / A after B): ' + Object.entries(T.pairs).map(([k, v]) => `${k}: ${fmtN(v.equalDay)} / ${fmtN(v.aBeforeB)} / ${fmtN(v.aAfterB)}`).join('; '));
    md.push('');
  }
  const term = Object.entries(txn.customFields.termKeys || {}).sort((a, b) => b[1].nonEmpty - a[1].nonEmpty);
  md.push(`CustomFields keys matching contract / in-contract terminology (${term.length}): ${term.map(([k, v]) => `\`${k}\` (${v.matchedBy}, ${fmtN(v.nonEmpty)} non-empty)`).join(', ') || 'none'} — none is an in-contract status key; the terms occur in remarks/rules text and Y/N facts.`);
  md.push('');
}

md.push('## K. IDX Plus workbook cross-check (discovery aid, not authority)');
md.push('');
if (!idxRows.length) md.push('data/rebny-rls-property-fields.csv not found.');
else {
  const byClass = {}; for (const r of idxRows) byClass[r.classification] = (byClass[r.classification] || 0) + 1;
  const never = idxRows.filter((r) => r.neverSurfaces === true);
  md.push(`${fmtN(idxRows.length)} rows (${idxRows.filter((r) => r.feed === 'IDX Plus').length} IDX Plus + ${idxRows.filter((r) => r.feed !== 'IDX Plus').length} live-discovered). Classification: ${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join(' · ')}. Rows that exist in the entitled contract but never surface anywhere in Mallan (no mapper, no form, no consumer): **${never.length}**${never.length ? ' — ' + fmtList(never.map((r) => `${r.resource}.${r.name}`), 60) : ''}.`);
  md.push('');
  md.push('| Feed | Resource | Standard name | Classification | Availability | Population | Mapped | Persisted | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Public | Compl |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of idxRows) md.push(`| ${r.feed} | ${r.resource} | \`${r.name}\` | ${r.classification} | ${r.availability} | ${fmtN(r.population)} | ${S(r.mapped)} | ${S(r.persisted)} | ${S(r.saleSearch)} | ${S(r.rentalSearch)} | ${S(r.saleForm)} | ${S(r.rentalForm)} | ${S(r.saleTools)} | ${S(r.rentalTools)} | ${S(r.cma)} | ${S(r.reporting)} | ${S(r.publicVisibility)} | ${S(r.compliance)} |`);
  md.push('');
}

md.push('## L. Declared policy tables (not provider truth)');
md.push('');
md.push('Primary semantics: ' + PRIMARY.map(([n, c, re]) => `**${n}** [${c}] \`${re.source.slice(0, 60)}${re.source.length > 60 ? '…' : ''}\``).join('; '));
md.push('');
md.push('Required consumers per category: ' + Object.entries(REQUIRED).map(([k, v]) => `**${k}**: ${v.join(', ')}`).join('; '));
md.push('');
md.push('Tool scopes: ' + TOOL_SCOPE.map(([re, s]) => `\`${re.source.slice(0, 70)}\` → ${s}`).join('; '));
md.push('');
md.push('Served-domain hints: ' + SERVES.map(([re, d]) => `\`${re.source.slice(0, 50)}…\` → ${d.join(', ')}`).join('; '));
md.push('');
md.push('Provider documentation read for this model: ' + PROVIDER_DOCS.map(([t, u, s]) => `[${t}](${u}) — ${s}`).join(' · '));
md.push('');

mkdirSync(path.dirname(outBase), { recursive: true });
writeFileSync(`${outBase}.md`, md.join('\n') + '\n');
writeFileSync(`${outBase}.json`, JSON.stringify({
  generated: new Date().toISOString(), contract: compact.fingerprint,
  inputs: { catalogue: catalogue?.pulled || null, amenity: amenity?.finished || null, enumCensus: enumCensus?.finished || null, observed: observed?.finished || null, suppressedActive: supActive?.finished || null, suppressedAll: supAll?.finished || null, navActive: navActive?.finished || null, navAll: navAll?.finished || null, navCap: navCap?.generated || null, transactionState: txn?.finished || null, production: production?.source || null },
  graph, authorities, surfaces: { stats: surfaceStats, controls: Object.fromEntries(Object.entries(surfaceControls).map(([s, m]) => [s, Object.fromEntries(m)])) }, formContract: FORM_CONTRACT, staticDefects: STATIC_DEFECTS, amenityPhantoms,
  domains: domainViews, fields: propertyRows, subsections: navFieldRows, customFields: customKeys, idxPlus: idxRows, behaviour: BEHAVIOR_REGISTER, production: PRODUCTION_PROOF,
  policy: { primary: PRIMARY.map(([n, c, re]) => ({ name: n, category: c, pattern: re.source })), required: REQUIRED, toolScope: TOOL_SCOPE.map(([re, s]) => ({ pattern: re.source, scope: s })), serves: SERVES.map(([re, d]) => ({ pattern: re.source, domains: d })) },
}, null, 1) + '\n');
process.stdout.write(JSON.stringify({ wrote: [`${outBase}.md`, `${outBase}.json`], domains: domainViews.filter((d) => d.kind === 'semantic').map((d) => ({ name: d.name, populated: d.primaryPopulated, verdict: d.verdictPrimary, counts: d.counts, columns: d.columns })), surfaces: surfaceStats, navigations: Object.fromEntries(Object.entries(graph.propertyNavigations).map(([n, g]) => [n, { exhaustiveAll: g.exhaustive.all?.rowsWithPayload ?? null }])), idxPlus: idxRows.length, authorities: authorities.length }, null, 2) + '\n');
