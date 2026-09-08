#!/usr/bin/env node
// SEARCH COVERAGE MATRIX — every Property navigation subsection and every Search business domain,
// every stage of the Mallan chain, one verdict per field and per domain. MECHANICAL: the provider side
// comes from the live-derived contract (data/cotality-contract/*) plus the exhaustive live censuses under
// docs/operations/evidence-2026-09-08/ (amenities, suppressed fields); the Mallan side from the TypeScript
// program (the authority's mapper dataflow + reader census); tests from the test tree. No agent edges.
//
//   node scripts/cotality/search-coverage-matrix.mjs [--out=docs/operations/evidence-2026-09-08/search-coverage-matrix]
//
// Stages (per provider field):
//   live        declared / access / filterable / populated (all statuses; Active where measured) / RLS / lookup
//   mapper      lib/idx/trestle-mapper.ts dataflow → typed column, features/address/agent_info JSON key, raw_data keep-list
//   persist     the storage node(s) those bindings write
//   projection  lib/search/listing-search-projection.ts + AMENITY_FIELD_MAP (lib/search/types.ts)
//   criterion   backend Search filters: lib/search/engine/{criteria,provider-query,universe}.ts,
//               lib/search/public-listing-db.ts, lib/search/public-listing-trestle.ts,
//               lib/search/natural-language-parser.ts, lib/search/engine/saved-search.ts
//   select      S = the sync path's $select (the mapper's compile-checked lists — what gets PERSISTED),
//               R = the runtime $select (engine/select.ts, idx/card-fields.ts — what a live query returns)
//   dto         lib/search/crm-idx-mapper.ts, lib/idx/db-to-public-dto.ts, lib/idx/public-dto.ts,
//               lib/idx/display-adapter.ts, app/components/**, app/listing/**
//   workspace   lib/cma, lib/comps, lib/seller-report, lib/market-report, lib/pitch-packet, lib/buildings, app/api/crm/**
//   tests       test files naming the field
// Population: `<Field> ne null` probe (all statuses) for filterable fields; for provider-SUPPRESSED fields
//   (filterable:false — the filter is rejected) the row-by-row census under evidence-2026-09-08/suppressed/
//   (Active corpus exhaustively; all-status walk where present). Nothing is sampled.
// Verdict per field: PROVIDER-UNAVAILABLE (resource rejected on this subscription, or declared but 0 rows —
//   including every suppressed field, which the provider nulls on every row), MISSING (rows exist, no mapper
//   binding), PARTIAL (bound + stored but not searchable or not displayed), COMPLETE (bound + stored +
//   (criterion or projection) + dto). Per domain: COMPLETE if every populated field is COMPLETE, MISSING if
//   none is bound, else PARTIAL; PROVIDER-UNAVAILABLE if nothing is populated.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './authority/lib.mjs';
import { analyzeMapper, createProgram, findReaders } from './authority/impact.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const outBase = path.resolve(ROOT, arg('out', 'docs/operations/evidence-2026-09-08/search-coverage-matrix'));
const EVIDENCE = path.join(ROOT, 'docs/operations/evidence-2026-09-08');
const loadJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

const compact = JSON.parse(readFileSync(path.join(ROOT, 'data/cotality-contract/contract.compact.json'), 'utf8'));
const lookups = JSON.parse(readFileSync(path.join(ROOT, 'data/cotality-contract/lookups.live.json'), 'utf8'));
const amenity = loadJson(path.join(EVIDENCE, 'amenities/amenity-census-active.json'));
const supActive = loadJson(path.join(EVIDENCE, 'suppressed/suppressed-census-active.json'));
const supAll = loadJson(path.join(EVIDENCE, 'suppressed/suppressed-census-property-all.json'));

// ── Domains (declared groupings over the LIVE field list; every Property field lands in exactly one) ──
const P = compact.resources.Property.fields;
const allProperty = Object.keys(P).sort();
const DOMAIN_RULES = [
  ['Tours, video & media counts (Property carriers)', /^(VirtualTourURL|VideosCount|VideosChangeTimestamp|PhotosCount|PhotosChangeTimestamp|FloorPlansCount|TotalFloorPlansCount|FloorPlansChangeTimestamp|Documents)/],
  ['Permissions & display gates', /^(Permission|Internet.*DisplayYN|InternetConsumerCommentYN|SyndicateTo|SyndicationRemarks|SourceMlsUrl|AttributionContact)$/],
  ['Showing, access & private contacts', /^(Showing|LockBox|Occupant|StartShowingDate|AccessCode|OwnerName|OwnerName2|OwnerPhone|OpenHouseModificationTimestamp)/],
  ['Security & doorman', /^(SecurityFeatures)$/],
  ['Laundry', /^Laundry/],
  ['Parking', /^(Parking|Garage|Carport|OpenParking|OtherParking|RVParking|CoveredSpaces|AttachedGarageYN)/],
  ['Pools & spa', /^(Pool|Spa)/],
  ['Accessibility', /^Accessibility/],
  ['Pets', /^(Pets|PetDeposit|MaximumNumberOfPets|MaximumPetWeight)/],
  ['Transportation & schools', /^(DistanceTo|WalkScore|ElementarySchool|MiddleOrJuniorSchool|HighSchool)/],
  ['Compensation & concessions (UCBA §5(E)-restricted)', /^(BuyerBrokerageCompensation|SubAgencyCompensation|TransactionBrokerCompensation|CompensationComments|DualOrVariableRateCommissionYN|ConcessionInPrice|Concessions|SellerConsiderConcessionYN|LeaseRenewalCompensation)/],
  ['RESO manufactured-home, farm & ranch fields (not used on this feed)', /^(BodyType|Make$|Model$|SerialU$|SerialX$|SerialXX$|Skirt$|ParkName|ParkManager|DOH[123]$|License[123]$|Mobile|GrazingPermits|HorseYN|HorseAmenities|IrrigationSource|IrrigationWater|FarmCreditServiceInclYN|FarmLand|CropsIncluded|CultivatedArea|PastureArea|RangeArea|WoodedArea|RoadResponsibility|PowerProduction|Vegetation|Topography|Fencing|FrontageType|RoadSurfaceType|RoadFrontageType)/],
  ['Geography & map', /^(Street|UnitNumber$|UnparsedAddress|City|CityRegion|SubdivisionName|PostalCity|PostalCode|StateOrProvince|Country|CountyOrParish|CountrySubdivision|MLSArea|Latitude|Longitude|MapCoordinate|MapURL|X_GeocodeSource|CrossStreet|Directions|BuildingName|TaxBlock|TaxLot|TaxMapNumber|Zoning|Elevation|Township|StateRegion|ContinentRegion|CountryRegion|CarrierRoute|PublicSurvey|ParcelNumber|ParcelSubcomponent|AdditionalParcels|UniversalParcelId)/],
  ['Amenities & building features', /^(BuildingFeatures|CommunityFeatures|AssociationAmenities|ExteriorFeatures|InteriorFeatures|Appliances|OtherEquipment|Cooling|Heating|Fireplace|WindowFeatures|DoorFeatures|Flooring|View|PatioAndPorchFeatures|Furnished|Utilities|Green|OtherStructures|CommonWalls|Basement|Roof|ConstructionMaterials|ArchitecturalStyle|DirectionFaces|ElectricOnPropertyYN|Sewer|WaterSource|Foundation|Exposures|WaterfrontFeatures|WaterfrontYN|LotFeatures|SeniorCommunityYN|UnitsFurnished)/],
  ['Rental & financial', /^(Association|Tax|Lease|MoveInCosts|OngoingFees|TenantPays|OwnerPays|AvailabilityDate|AvailableLeaseType|ExistingLeaseType|SecurityDeposit|SpecialListingConditions|DownPaymentAssistance|CurrentFinancing|FinancialDataSource|Gross|Net|Operating|Income|CapRate|.*Expense$|VacancyAllowance|LandLease|ListingTerms|BuyerFinancing|Trust|Cap|Fee|Rent|Deposit|Insurance|Manager|Supplies|Pest|Trash|Water|Fuel|Gardener|Electric|Maintenance|Workmans|NewTaxes|OtherExpense|Professional|TotalActualRent|FhaEligibility)/],
  ['Identity, status & dates', /^(ListingKey|ListingKeyNumeric|ListingId|SourceSystem|OriginatingSystem|StandardStatus|MlsStatus|ModificationTimestamp|StatusChangeTimestamp|OriginalEntryTimestamp|ListingContractDate|OnMarket|OffMarket|ActivationDate|CloseDate|PurchaseContractDate|PendingTimestamp|WithdrawnDate|BackOnMarket|ExpirationDate|DaysOnMarket|CumulativeDaysOnMarket|DelayedMarketing|PreviousStandardStatus|MajorChange|ContractStatusChangeDate|ContingentDate|CancellationDate|ListingService|ListingAgreement|ListingURL|X_|HumanModifiedYN|RecordSignature|UniversalPropertyId|UniversalPropertySubId|CLIP$|Contingency|EstimatedCloseDate|SaleOrLeaseIndicator|CompSaleYN)/],
  ['Pricing', /^(ListPrice|OriginalListPrice|PreviousListPrice|PriceChangeTimestamp|ClosePrice|ListPriceLow|CurrentPrice)$/],
  ['Classification & building facts', /^(PropertyType|PropertySubType|CommonInterest|OwnershipType|StructureType|NewConstructionYN|DevelopmentStatus|YearBuilt|YearEstablished|YearsCurrentOwner|Stories|NumberOf|BuilderName|BuilderModel|PropertyCondition|PropertyAttachedYN|BuildingKey|BuildingKeyNumeric|BuildingAreaTotal|BuildingAreaSource|BuildingAreaUnits|Levels|EntryLevel|EntryLocation|BusinessName|BusinessType|CurrentUse|PossibleUse|AnchorsCoTenants|LeasableArea|SeatingCapacity|HoursDaysOfOperation|LaborInformation)/],
  ['Size & rooms', /^(Bedrooms|Bathrooms|LivingArea|RoomsTotal|RoomType|AboveGrade|BelowGrade|LotSize|LotDimensions|FrontageLength|MainLevel|Room|FoundationArea|UnitTypeType)/],
  ['Remarks & disclosures', /^(PublicRemarks|PrivateRemarks|PrivateOfficeRemarks|Disclaimer|CopyrightNotice|Disclosures|Exclusions|Inclusions|Ownership$|Possession|Restrictions|SpecialLicenses|SignOnPropertyYN|HomeWarrantyYN|Habitable)/],
  ['Agent & office attribution (Property side)', /^(ListAgent|CoListAgent|BuyerAgent|CoBuyerAgent|ListOffice|CoListOffice|BuyerOffice|CoBuyerOffice|ListTeam|BuyerTeam|CoListTeam|CoBuyerTeam|ListAOR|BuyerAOR|CoList.*AOR|CoBuyer.*AOR|OfficeLogo|PhotoOptedOut|ListingCharacteristics|HeadBrokerMember)/],
];
const UNCLASSIFIED = 'UNCLASSIFIED';
function domainOf(field) {
  for (const [name, re] of DOMAIN_RULES) if (re.test(field)) return name;
  return UNCLASSIFIED;
}
{
  const leftovers = allProperty.filter((f) => domainOf(f) === UNCLASSIFIED);
  if (leftovers.length) throw new Error(`Every live Property field must land in a declared domain; unclassified: ${leftovers.join(', ')}`);
}

// Navigation subsections (14) with their target resource.
const NAV = compact.resources.Property.navigation;
const NAV_ROWS = Object.keys(NAV).sort().map((n) => ({ navigation: n, target: NAV[n].target, expand: NAV[n].expand, http: NAV[n].http, payload: NAV[n].payloadPresent }));

// ── Program + mechanical readers ──────────────────────────────────────────
const ctx = createProgram();
const { bindings, fetched } = analyzeMapper(ctx);
const CONTAINERS = ['features', 'address', 'agent_info', 'raw_data', 'media', 'compliance'];
const SUBSECTION_RESOURCES = ['Media', 'OpenHouse', 'CustomProperty', 'PropertyRooms', 'PropertyUnitTypes', 'Member', 'Office'];
const subsectionFields = new Set();
for (const r of SUBSECTION_RESOURCES) for (const f of Object.keys(compact.resources[r]?.fields || {})) subsectionFields.add(f);
const providerFields = new Set([...allProperty, ...subsectionFields]);
const typedColumns = new Set();
for (const arr of bindings.values()) for (const b of arr) { const m = /^listings\.([a-z_]+)$/.exec(b.node); if (m) typedColumns.add(m[1]); }
const jsonKeys = [];
for (const f of allProperty) for (const c of CONTAINERS) jsonKeys.push(`${c}.${f}`);
const readers = findReaders(ctx, { columns: [...typedColumns], jsonKeys, providerFields: [...providerFields], members: [] });

const STAGES = [
  ['projection', (f) => f === 'lib/search/listing-search-projection.ts' || f === 'lib/search/types.ts'],
  ['criterion', (f) => /^lib\/search\/engine\/(criteria|provider-query|universe|saved-search)\.ts$/.test(f) || /^lib\/search\/(public-listing-db|public-listing-trestle|natural-language-parser|nyc-dictionary)\.ts$/.test(f) || f.startsWith('app/api/idx/search/') || f === 'app/api/listings/route.ts' || f.startsWith('lib/search/canonical/')],
  ['select', (f) => f === 'lib/search/engine/select.ts' || f === 'lib/idx/card-fields.ts' || f === 'lib/idx/trestle-mapper.ts'],
  ['dto', (f) => /^lib\/search\/crm-idx-mapper\.ts$|^lib\/idx\/(db-to-public-dto|public-dto|display-adapter|public-listing-summary)\.ts$/.test(f) || f.startsWith('app/components/') || f.startsWith('app/listing/') || f === 'lib/search/engine/hydrate.ts'],
  ['workspace', (f) => /^lib\/(cma|comps|seller-report|market-report|pitch-packet|buildings|open-houses)\//.test(f) || f.startsWith('app/api/crm/') || f.startsWith('app/api/open-houses/') || f.startsWith('app/api/buildings/')],
  ['media-lane', (f) => /^lib\/(idx\/media-sync|media\/)/.test(f) || f.startsWith('app/api/media/')],
  ['sync', (f) => f === 'lib/idx/sync.ts' || f === 'lib/idx/fetch.ts' || f.startsWith('app/api/cron/')],
];
function stageOf(file) { for (const [s, t] of STAGES) if (t(file)) return s; return 'other'; }
const RUNTIME_SELECT = /^lib\/(search\/engine\/select|idx\/card-fields)\.ts:/;

// AMENITY_FIELD_MAP fields (projection/criterion use) — parsed, not hand-typed.
const typesSrc = readFileSync(path.join(ROOT, 'lib/search/types.ts'), 'utf8');
const amenityMapFields = new Map(); // field -> [{key, values}]
{
  const block = typesSrc.slice(typesSrc.indexOf('export const AMENITY_FIELD_MAP'));
  const re = /['"]([a-z-]+)['"]:\s*\{\s*field:\s*['"]([^'"]+)['"],\s*values:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block))) {
    const values = [...m[3].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    for (const f of m[2].split(',').map((s) => s.trim())) { if (!amenityMapFields.has(f)) amenityMapFields.set(f, []); amenityMapFields.get(f).push({ key: m[1], values }); }
  }
}

// Tests naming a field.
const testFiles = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const full = path.join(d, e);
    const st = statSync(full);
    if (st.isDirectory()) { if (e === 'node_modules' || e === '.next' || e === '.git') continue; walk(full); }
    else if (/\.test\.(ts|tsx|js|mjs)$/.test(e) || full.includes(`${path.sep}__tests__${path.sep}`)) testFiles.push(full);
  }
})(ROOT);
const testText = testFiles.map((f) => ({ file: path.relative(ROOT, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));
function testsNaming(field) {
  const re = new RegExp(`\\b${field}\\b`);
  return testText.filter((t) => re.test(t.text)).map((t) => t.file);
}

// ── Population (never sampled) ────────────────────────────────────────────
function activePopulated(resource, field) {
  if (resource === 'Property') { const a = amenity?.fields?.[field]; if (a && typeof a.nonNull === 'number') return a.nonNull; }
  const s = supActive?.resources?.[resource]?.fields?.[field];
  return s ? s.nonNull : null;
}
function population(resource, field) {
  const fact = compact.resources[resource].fields[field];
  const active = activePopulated(resource, field);
  if (fact.filterable !== false) return { all: fact.populated, active, basis: 'probe `ne null` (all statuses)' };
  const walked = resource === 'Property' ? supAll?.resources?.Property?.fields?.[field] : null;
  if (walked) return { all: walked.nonNull, active, basis: `row-by-row walk, all statuses (${supAll.resources.Property.rows.toLocaleString('en-US')} rows) — suppressed field` };
  if (active != null) return { all: null, active, basis: `row-by-row walk, ${supActive.resources[resource].scope} (${supActive.resources[resource].rows.toLocaleString('en-US')} rows) — suppressed field` };
  return { all: null, active: null, basis: 'UNMEASURED — suppressed field, no census' };
}

// ── Per-field assembly ────────────────────────────────────────────────────
function fieldRow(resource, field) {
  const fact = compact.resources[resource].fields[field];
  const access = compact.resources[resource].access;
  const lk = lookups[resource]?.[field] || null;
  const binds = resource === 'Property' ? (bindings.get(`Property.${field}`) || []) : [];
  const persist = [...new Set(binds.map((b) => b.node))];
  const sites = [];
  for (const node of [`provider:Property.${field}`, ...CONTAINERS.map((c) => `listings.${c}.${field}`), ...persist.filter((n) => /^listings\.[a-z_]+$/.test(n))]) for (const s of readers.get(node) || []) sites.push({ ...s, node });
  const byStage = {};
  for (const s of sites) { const st = stageOf(s.file); if (!byStage[st]) byStage[st] = new Set(); byStage[st].add(`${s.file}:${s.line}`); }
  const inAmenityMap = amenityMapFields.get(field) || [];
  const selectSync = resource === 'Property' && fetched.has(`Property.${field}`);
  const selectRuntime = [...(byStage.select || [])].some((s) => RUNTIME_SELECT.test(s));
  const tests = testsNaming(field);
  const pop = population(resource, field);
  const rows = pop.all ?? pop.active; // effective measured population (null only if unmeasured)
  const wired = selectSync && binds.length > 0;
  let verdict;
  let note = '';
  if (access.state !== 'accessible') { verdict = 'PROVIDER-UNAVAILABLE'; note = `resource ${access.state} (${access.http || access.error || ''})`; }
  else if (rows === 0) { verdict = 'PROVIDER-UNAVAILABLE'; note = `declared · 0 rows${fact.filterable === false ? ' · suppressed (provider Level) — null on every row' : ''} · wired for sync: ${wired ? 'yes' : 'no'}`; }
  else if (rows == null) { verdict = 'PROVIDER-UNAVAILABLE'; note = 'population unmeasured'; }
  else if (resource !== 'Property') verdict = sites.length ? 'PARTIAL' : 'MISSING';
  else if (!binds.length) verdict = 'MISSING';
  else {
    const searchable = Boolean(byStage.criterion) || Boolean(byStage.projection) || inAmenityMap.length > 0;
    const displayed = Boolean(byStage.dto);
    verdict = searchable && displayed ? 'COMPLETE' : 'PARTIAL';
    if (verdict === 'PARTIAL') note = [searchable ? null : 'not searchable', displayed ? null : 'not displayed'].filter(Boolean).join(' · ');
  }
  return {
    resource, field, type: fact.type.replace('Cotality.DataStandard.RESO.DD.', ''), enum: fact.enum, multi: fact.multi,
    lookup: lk ? { name: fact.enum, members: lk.members.length, rls: lk.rls.length } : null,
    access: access.state, filterable: fact.filterable, suppressed: fact.filterable === false,
    populated: rows, populatedAll: pop.all, populatedActive: pop.active, populationBasis: pop.basis, rlsField: fact.rlsField,
    mapper: binds.map((b) => `${b.node} (${b.via})`), persist,
    projection: [...(byStage.projection || [])], amenityMap: inAmenityMap.map((a) => `${a.key}: ${a.values.join('|')}`),
    criterion: [...(byStage.criterion || [])], select: { sync: selectSync, runtime: selectRuntime }, dto: [...(byStage.dto || [])], workspace: [...(byStage.workspace || [])],
    mediaLane: [...(byStage['media-lane'] || [])], sync: [...(byStage.sync || [])], other: [...(byStage.other || [])],
    tests, verdict, note,
  };
}

const domains = new Map();
for (const f of allProperty) { const d = domainOf(f); if (!domains.has(d)) domains.set(d, []); domains.get(d).push(fieldRow('Property', f)); }
const propertyRows = [...domains.values()].flat();

// Navigation subsections: target resource fields + Property-side carrier family + whether the runtime pulls the resource.
const runtimePulls = {};
{
  const files = [...ctx.files.keys()];
  for (const r of [...SUBSECTION_RESOURCES, 'Building']) {
    const re = new RegExp(`odata/${r}\\b|resource: ['"]${r}['"]|\\$expand=${r}\\b|expandParts\\.push\\("${r}|expand${r} === true`);
    runtimePulls[r] = files.filter((f) => re.test(ctx.files.get(f).getFullText()));
  }
}
const navRows = NAV_ROWS.map((n) => {
  const target = compact.resources[n.target];
  const targetFields = target ? Object.keys(target.fields).sort().map((f) => fieldRow(n.target, f)) : [];
  const carrierPrefix = { ListAgent: /^ListAgent/, CoListAgent: /^CoListAgent/, BuyerAgent: /^BuyerAgent/, CoBuyerAgent: /^CoBuyerAgent/, ListOffice: /^ListOffice/, CoListOffice: /^CoListOffice/, BuyerOffice: /^BuyerOffice/, CoBuyerOffice: /^CoBuyerOffice/ }[n.navigation] || null;
  const carriers = carrierPrefix ? allProperty.filter((f) => carrierPrefix.test(f)).map((f) => fieldRow('Property', f)) : [];
  const populatedTarget = targetFields.filter((r) => r.populated > 0);
  const read = targetFields.filter((r) => r.populated > 0 && (r.dto.length || r.workspace.length || r.mediaLane.length || r.sync.length || r.criterion.length || r.projection.length));
  const populatedCarriers = carriers.filter((c) => c.populated > 0);
  let verdict;
  if (!target || target.access.state !== 'accessible' || n.expand !== 'SUPPORTED') verdict = 'PROVIDER-UNAVAILABLE';
  else if (carriers.length && !populatedCarriers.length) verdict = 'PROVIDER-UNAVAILABLE';
  else if (carriers.length) verdict = populatedCarriers.every((c) => c.verdict === 'COMPLETE') ? 'COMPLETE' : populatedCarriers.some((c) => c.mapper.length) ? 'PARTIAL' : 'MISSING';
  else if (!runtimePulls[n.target]?.length) verdict = 'MISSING';
  else verdict = read.length === 0 ? 'MISSING' : read.length === populatedTarget.length ? 'COMPLETE' : 'PARTIAL';
  return { ...n, targetAccess: target?.access.state, targetFields: targetFields.length, targetPopulated: populatedTarget.length, targetRead: read.length, runtimePulls: runtimePulls[n.target] || [], carriers, verdict, fields: targetFields };
});
const navFieldRows = navRows.flatMap((n) => n.fields);

// CustomFields keys (NYC vocabulary inside CustomProperty.CustomFields) — from the Active census.
const customKeys = amenity?.customFields?.keys ? Object.entries(amenity.customFields.keys).map(([k, v]) => ({ key: k, nonEmpty: v.nonEmpty, top: v.topValues.slice(0, 4), verdict: 'MISSING' })) : [];

// ── Domain verdicts ───────────────────────────────────────────────────────
function domainVerdict(rows) {
  const populated = rows.filter((r) => r.verdict !== 'PROVIDER-UNAVAILABLE');
  if (!populated.length) return 'PROVIDER-UNAVAILABLE';
  if (populated.every((r) => r.verdict === 'COMPLETE')) return 'COMPLETE';
  if (populated.every((r) => r.verdict === 'MISSING')) return 'MISSING';
  return 'PARTIAL';
}
const uniq = (arr) => [...new Set(arr)];
const fileOf = (site) => site.replace(/:\d+$/, '');
function domainChain(rows) {
  const live = rows.filter((r) => r.verdict !== 'PROVIDER-UNAVAILABLE');
  return {
    persistence: uniq(live.flatMap((r) => r.persist)).sort(),
    projection: uniq(live.flatMap((r) => r.projection.map(fileOf))).sort(),
    amenityMap: uniq(live.flatMap((r) => r.amenityMap.map((a) => a.split(':')[0]))).sort(),
    criterion: uniq(live.flatMap((r) => r.criterion.map(fileOf))).sort(),
    dto: uniq(live.flatMap((r) => r.dto.map(fileOf))).sort(),
    workspace: uniq(live.flatMap((r) => r.workspace.map(fileOf))).sort(),
    tests: uniq(live.flatMap((r) => r.tests)).sort(),
    selectSyncMissing: live.filter((r) => !r.select.sync).map((r) => r.field),
    selectRuntimeMissing: live.filter((r) => !r.select.runtime).map((r) => r.field),
  };
}

// ── Render ────────────────────────────────────────────────────────────────
const fmtN = (n) => (n == null ? 'n/a' : n.toLocaleString('en-US'));
const fmtSites = (arr) => (arr.length ? arr.slice(0, 3).map((s) => `\`${s}\``).join(' ') + (arr.length > 3 ? ` +${arr.length - 3}` : '') : '—');
const fmtList = (arr, n = 6) => (arr.length ? arr.slice(0, n).map((s) => `\`${s}\``).join(', ') + (arr.length > n ? ` +${arr.length - n}` : '') : '—');
const selFlag = (s) => (s.sync && s.runtime ? 'S+R' : s.sync ? 'S' : s.runtime ? 'R' : '—');
const liveCell = (r, withActive) => `${r.type}${r.enum ? ` · ${r.enum}${r.multi ? ' (multi)' : ''}` : ''}${r.lookup ? ` · lookup ${r.lookup.members} (RLS ${r.lookup.rls})` : ''} · ${r.filterable === true ? 'filterable' : r.filterable === false ? 'SUPPRESSED' : 'unmeasured'} · ${fmtN(r.populatedAll)}${withActive && r.populatedActive != null ? ` / ${fmtN(r.populatedActive)} Active` : ''} · ${r.rlsField ? 'RLS' : 'not RLS'}`;

const md = [];
md.push('# Search subsection coverage matrix — live Cotality contract → Mallan chain (2026-09-08)');
md.push('');
md.push(`Provider side: \`data/cotality-contract/contract.compact.json\` (light probe ${compact.fingerprint.acquired_at}, metadata_sha ${compact.fingerprint.metadata_sha256.slice(0, 12)}); Active-scoped populations from the amenity census; suppressed-field populations from the row-by-row suppressed census (${supActive ? `Active corpus ${fmtN(supActive.resources.Property?.rows)} Property rows` : 'not run'}${supAll ? `; all-status walk ${fmtN(supAll.resources.Property?.rows)} Property rows` : ''}). Mallan side: the TypeScript program (mapper dataflow, reader census by file → stage). Nothing hand-typed, nothing sampled; regenerate with \`node scripts/cotality/search-coverage-matrix.mjs\`.`);
md.push('');
md.push('Verdicts — **COMPLETE**: mapped + stored + (search criterion or projection) + result DTO. **PARTIAL**: mapped + stored but not searchable or not displayed. **MISSING**: rows exist on the feed, no mapper binding. **PROVIDER-UNAVAILABLE**: resource rejected on this subscription, or declared but 0 rows (every provider-suppressed field is null on every row — see §F).');
md.push('');
md.push('`$select` column — **S**: in the sync path\'s compile-checked mapper lists (what gets persisted); **R**: in the runtime `$select` (`lib/search/engine/select.ts`, `lib/idx/card-fields.ts`). A field that is R but not S is returned by live queries yet never stored.');
md.push('');
md.push('## A. The 14 Property navigation subsections');
md.push('');
md.push('| Subsection | Target (fields · access · live $expand) | Runtime pulls the resource | Property-side carriers (populated/COMPLETE/PARTIAL/MISSING) | Target fields populated / read anywhere | Verdict |');
md.push('|---|---|---|---|---|---|');
for (const n of navRows) {
  const c = n.carriers;
  const cs = c.length ? `${c.filter((x) => x.populated > 0).length} of ${c.length} populated · ${c.filter((x) => x.verdict === 'COMPLETE').length} C · ${c.filter((x) => x.verdict === 'PARTIAL').length} P · ${c.filter((x) => x.verdict === 'MISSING').length} M` : '—';
  md.push(`| \`${n.navigation}\` | ${n.target} · ${n.targetFields} · ${n.targetAccess || 'n/a'} · ${n.expand}${n.http ? ` ${n.http}` : ''} | ${n.runtimePulls.length ? n.runtimePulls.slice(0, 4).map((f) => `\`${f}\``).join(', ') + (n.runtimePulls.length > 4 ? ` +${n.runtimePulls.length - 4}` : '') : '**never**'} | ${cs} | ${n.targetPopulated} / ${n.targetRead} | **${n.verdict}** |`);
}
md.push('');
md.push('"Runtime pulls the resource" is a literal `odata/<Resource>` / `$expand=<Resource>` request in the program. "Read anywhere" counts target fields whose live name appears in a reader — for a resource the runtime never pulls, those reads are same-named Property fields (ListingKey, StandardStatus, …), not subsection data; the verdict logic treats a never-pulled resource as MISSING regardless.');
md.push('');
md.push(`## B. Search business domains (every one of the ${allProperty.length} live Property fields lands in exactly one)`);
md.push('');
md.push('| Domain | Fields | Populated | Suppressed | COMPLETE | PARTIAL | MISSING | PROVIDER-UNAVAILABLE | Populated but not in sync $select | Verdict |');
md.push('|---|---|---|---|---|---|---|---|---|---|');
const domainSummary = [];
for (const [name, rows] of [...domains.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const v = domainVerdict(rows);
  const count = (k) => rows.filter((r) => r.verdict === k).length;
  const chain = domainChain(rows);
  domainSummary.push({ name, fields: rows.length, populated: rows.filter((r) => r.populated > 0).length, suppressed: rows.filter((r) => r.suppressed).length, complete: count('COMPLETE'), partial: count('PARTIAL'), missing: count('MISSING'), unavailable: count('PROVIDER-UNAVAILABLE'), notInSyncSelect: chain.selectSyncMissing.length, verdict: v });
  md.push(`| ${name} | ${rows.length} | ${rows.filter((r) => r.populated > 0).length} | ${rows.filter((r) => r.suppressed).length} | ${count('COMPLETE')} | ${count('PARTIAL')} | ${count('MISSING')} | ${count('PROVIDER-UNAVAILABLE')} | ${chain.selectSyncMissing.length} | **${v}** |`);
}
md.push(`| NYC vocabulary in CustomProperty.CustomFields (Active census) | ${customKeys.length} keys | ${customKeys.filter((k) => k.nonEmpty > 0).length} | — | 0 | 0 | ${customKeys.length} | 0 | ${customKeys.length} | **MISSING** — CustomProperty is never hydrated by Search; no key is reachable by any criterion |`);
md.push('');
md.push('## C. Field detail by domain (with the mechanical chain per domain)');
md.push('');
for (const [name, rows] of [...domains.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const chain = domainChain(rows);
  md.push(`### ${name} — **${domainVerdict(rows)}**`);
  md.push('');
  md.push(`Impact chain (populated fields only) — persistence: ${fmtList(chain.persistence, 10)} · projection: ${fmtList(chain.projection)}${chain.amenityMap.length ? ` · amenity map keys: ${fmtList(chain.amenityMap, 12)}` : ''} · criterion: ${fmtList(chain.criterion)} · DTO/card: ${fmtList(chain.dto)} · workspace/report/CMA: ${fmtList(chain.workspace)} · tests: ${chain.tests.length} file(s)${chain.selectSyncMissing.length ? ` · **populated but NOT in the sync $select (never persisted): ${fmtList(chain.selectSyncMissing, 12)}**` : ''}${chain.selectRuntimeMissing.length ? ` · populated but not in the runtime $select: ${fmtList(chain.selectRuntimeMissing, 12)}` : ''}`);
  md.push('');
  md.push('| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.sort((a, b) => (b.populated || 0) - (a.populated || 0) || a.field.localeCompare(b.field))) {
    md.push(`| \`${r.field}\` | ${liveCell(r, true)} | ${r.mapper.length ? r.mapper.map((m) => `\`${m}\``).join(' ') : '—'} | ${[...r.projection.map((s) => `\`${s}\``), ...r.amenityMap.map((a) => `map: ${a}`)].join(' ') || '—'} | ${fmtSites(r.criterion)} | ${selFlag(r.select)} | ${fmtSites(r.dto)} | ${fmtSites(r.workspace)} | ${r.tests.length ? r.tests.length : '—'} | **${r.verdict}**${r.note ? ` — ${r.note}` : ''} |`);
  }
  md.push('');
}
md.push(`## D. CustomProperty.CustomFields keys on every Active listing (${fmtN(amenity?.customFields?.rows)}) — none reachable by Search`);
md.push('');
md.push('| Key | Non-empty Active rows | Top values |');
md.push('|---|---|---|');
for (const k of customKeys) md.push(`| \`${k.key}\` | ${fmtN(k.nonEmpty)} | ${k.top.join(' · ')} |`);
md.push('');
md.push('## E. Navigation subsection field detail');
md.push('');
for (const n of navRows) {
  if (!n.fields.length) continue;
  md.push(`### \`Property.${n.navigation}\` → ${n.target} (${n.fields.length} fields, ${n.targetAccess}) — **${n.verdict}**`);
  md.push('');
  md.push('| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |');
  md.push('|---|---|---|---|---|');
  for (const r of n.fields.sort((a, b) => (b.populated || 0) - (a.populated || 0) || a.field.localeCompare(b.field))) {
    const reads = [['media-lane', r.mediaLane], ['dto', r.dto], ['workspace', r.workspace], ['criterion', r.criterion], ['sync', r.sync], ['other', r.other]].filter(([, a]) => a.length).map(([s, a]) => `${s}: ${fmtSites(a)}`).join('; ');
    md.push(`| \`${r.field}\` | ${liveCell(r, true)} | ${reads || '—'} | ${r.tests.length || '—'} | **${r.verdict}**${r.note ? ` — ${r.note}` : ''} |`);
  }
  md.push('');
}
md.push('## F. Provider-suppressed fields — measured, not assumed');
md.push('');
md.push('`filterable:false` means the provider rejects `$filter` on the field ("suppressed (provider Level)"). The row-by-row census selects every suppressed field on every row of the scoped corpus and counts non-null values.');
md.push('');
md.push('| Census | Resource | Scope | Rows walked | Suppressed fields | Fields with ≥1 non-null value | Mallan code still binding or reading one of them |');
md.push('|---|---|---|---|---|---|---|');
const suppressedSummary = [];
for (const [label, src] of [['Active', supActive], ['all statuses', supAll]]) {
  if (!src) continue;
  for (const [r, v] of Object.entries(src.resources)) {
    if (v.error) { md.push(`| ${label} | ${r} | — | — | — | — | ${v.error} |`); continue; }
    const populated = Object.entries(v.fields).filter(([, f]) => f.nonNull > 0).map(([k, f]) => `${k} (${f.nonNull})`);
    const pool = r === 'Property' ? propertyRows : navFieldRows.filter((x) => x.resource === r);
    const stillRead = Object.keys(v.fields).filter((f) => { const row = pool.find((x) => x.field === f); return row && (row.mapper.length || row.dto.length || row.criterion.length || row.projection.length || row.workspace.length); });
    suppressedSummary.push({ census: label, resource: r, scope: v.scope, rows: v.rows, suppressed: v.suppressed, populated, stillRead });
    md.push(`| ${label} | ${r} | ${v.scope} | ${fmtN(v.rows)} | ${v.suppressed} | ${populated.length ? populated.join(', ') : '**0**'} | ${stillRead.length ? fmtList(stillRead, 40) : '—'} |`);
  }
}
md.push('');

mkdirSync(path.dirname(outBase), { recursive: true });
writeFileSync(`${outBase}.md`, md.join('\n') + '\n');
writeFileSync(`${outBase}.json`, JSON.stringify({ generated: new Date().toISOString(), contract: compact.fingerprint, censuses: { amenity: amenity?.finished || null, suppressedActive: supActive?.finished || null, suppressedAll: supAll?.finished || null }, domains: Object.fromEntries([...domains.entries()]), navigation: navRows, customFields: customKeys, suppressed: suppressedSummary, summary: domainSummary }, null, 2) + '\n');
process.stdout.write(JSON.stringify({ wrote: [`${outBase}.md`, `${outBase}.json`], domains: domainSummary, navigation: navRows.map((n) => ({ navigation: n.navigation, target: n.target, expand: n.expand, pulls: n.runtimePulls.length, populated: n.targetPopulated, read: n.targetRead, verdict: n.verdict })) }, null, 2) + '\n');
