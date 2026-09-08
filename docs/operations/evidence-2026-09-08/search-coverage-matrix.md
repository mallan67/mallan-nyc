# Search subsection coverage matrix — live Cotality contract → Mallan chain (2026-09-08)

Provider side: `data/cotality-contract/contract.compact.json` (light probe 2026-09-08T06:26:36.364Z, metadata_sha a60bcbbdccc9); Active-scoped populations from the amenity census; suppressed-field populations from the row-by-row suppressed census (Active corpus 7,600 Property rows; all-status walk 591,597 Property rows). Mallan side: the TypeScript program (mapper dataflow, reader census by file → stage). Nothing hand-typed, nothing sampled; regenerate with `node scripts/cotality/search-coverage-matrix.mjs`.

Verdicts — **COMPLETE**: mapped + stored + (search criterion or projection) + result DTO. **PARTIAL**: mapped + stored but not searchable or not displayed. **MISSING**: rows exist on the feed, no mapper binding. **PROVIDER-UNAVAILABLE**: resource rejected on this subscription, or declared but 0 rows (every provider-suppressed field is null on every row — see §F).

`$select` column — **S**: in the sync path's compile-checked mapper lists (what gets persisted); **R**: in the runtime `$select` (`lib/search/engine/select.ts`, `lib/idx/card-fields.ts`). A field that is R but not S is returned by live queries yet never stored.

## A. The 14 Property navigation subsections

| Subsection | Target (fields · access · live $expand) | Runtime pulls the resource | Property-side carriers (populated/COMPLETE/PARTIAL/MISSING) | Target fields populated / read anywhere | Verdict |
|---|---|---|---|---|---|
| `Building` | Building · 1 · rejected · SUPPORTED 200 | **never** | — | 0 / 0 | **PROVIDER-UNAVAILABLE** |
| `BuyerAgent` | Member · 91 · accessible · SUPPORTED 200 | **never** | 1 of 27 populated · 0 C · 0 P · 1 M | 39 / 2 | **MISSING** |
| `BuyerOffice` | Office · 80 · accessible · SUPPORTED 200 | **never** | 1 of 11 populated · 0 C · 0 P · 1 M | 38 / 2 | **MISSING** |
| `CoBuyerAgent` | Member · 91 · accessible · SUPPORTED 200 | **never** | 1 of 27 populated · 0 C · 0 P · 1 M | 39 / 2 | **MISSING** |
| `CoBuyerOffice` | Office · 80 · accessible · SUPPORTED 200 | **never** | 1 of 11 populated · 0 C · 0 P · 1 M | 38 / 2 | **MISSING** |
| `CoListAgent` | Member · 91 · accessible · SUPPORTED 200 | **never** | 40 of 62 populated · 0 C · 2 P · 38 M | 39 / 2 | **PARTIAL** |
| `CoListOffice` | Office · 80 · accessible · SUPPORTED 200 | **never** | 15 of 18 populated · 0 C · 2 P · 13 M | 38 / 2 | **PARTIAL** |
| `CustomProperty` | CustomProperty · 142 · accessible · SUPPORTED 200 | `lib/idx/fetch.ts` | — | 29 / 14 | **PARTIAL** |
| `ListAgent` | Member · 91 · accessible · SUPPORTED 200 | **never** | 13 of 28 populated · 3 C · 2 P · 8 M | 39 / 2 | **PARTIAL** |
| `ListOffice` | Office · 80 · accessible · SUPPORTED 200 | **never** | 8 of 11 populated · 2 C · 1 P · 5 M | 38 / 2 | **PARTIAL** |
| `Media` | Media · 56 · accessible · SUPPORTED 200 | `lib/idx/trestle-mapper.ts`, `lib/idx/fetch.ts`, `app/api/agents/[slug]/listings/route.ts`, `lib/idx/write-suppression.ts` +7 | — | 37 / 20 | **PARTIAL** |
| `OpenHouse` | OpenHouse · 47 · accessible · SUPPORTED 200 | `lib/open-houses/upcoming-open-houses.ts`, `app/api/listings/route.ts`, `app/api/open-houses/route.ts`, `lib/search/canonical/field-registry.ts` | — | 36 / 17 | **PARTIAL** |
| `Rooms` | PropertyRooms · 39 · accessible · SUPPORTED 200 | **never** | — | 26 / 11 | **MISSING** |
| `UnitTypes` | PropertyUnitTypes · 52 · accessible · SUPPORTED 200 | **never** | — | 22 / 11 | **MISSING** |

"Runtime pulls the resource" is a literal `odata/<Resource>` / `$expand=<Resource>` request in the program. "Read anywhere" counts target fields whose live name appears in a reader — for a resource the runtime never pulls, those reads are same-named Property fields (ListingKey, StandardStatus, …), not subsection data; the verdict logic treats a never-pulled resource as MISSING regardless.

## B. Search business domains (every one of the 757 live Property fields lands in exactly one)

| Domain | Fields | Populated | Suppressed | COMPLETE | PARTIAL | MISSING | PROVIDER-UNAVAILABLE | Populated but not in sync $select | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Accessibility | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | **PARTIAL** |
| Agent & office attribution (Property side) | 206 | 80 | 85 | 5 | 7 | 68 | 126 | 43 | **PARTIAL** |
| Amenities & building features | 50 | 38 | 0 | 7 | 28 | 3 | 12 | 3 | **PARTIAL** |
| Classification & building facts | 52 | 25 | 3 | 5 | 16 | 4 | 27 | 4 | **PARTIAL** |
| Compensation & concessions (UCBA §5(E)-restricted) | 20 | 0 | 20 | 0 | 0 | 0 | 20 | 0 | **PROVIDER-UNAVAILABLE** |
| Geography & map | 51 | 25 | 11 | 9 | 10 | 6 | 26 | 7 | **PARTIAL** |
| Identity, status & dates | 68 | 40 | 17 | 6 | 10 | 24 | 28 | 14 | **PARTIAL** |
| Laundry | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | **COMPLETE** |
| Parking | 12 | 9 | 1 | 1 | 8 | 0 | 3 | 0 | **PARTIAL** |
| Permissions & display gates | 9 | 3 | 3 | 3 | 0 | 0 | 6 | 0 | **COMPLETE** |
| Pets | 6 | 2 | 0 | 1 | 0 | 1 | 4 | 1 | **PARTIAL** |
| Pools & spa | 5 | 4 | 0 | 0 | 3 | 1 | 1 | 1 | **PARTIAL** |
| Pricing | 7 | 6 | 0 | 3 | 1 | 2 | 1 | 2 | **PARTIAL** |
| Remarks & disclosures | 14 | 4 | 4 | 1 | 0 | 3 | 10 | 3 | **PARTIAL** |
| Rental & financial | 87 | 42 | 1 | 2 | 35 | 5 | 45 | 5 | **PARTIAL** |
| RESO manufactured-home, farm & ranch fields (not used on this feed) | 45 | 1 | 21 | 0 | 1 | 0 | 44 | 0 | **PARTIAL** |
| Security & doorman | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | **PARTIAL** |
| Showing, access & private contacts | 25 | 3 | 19 | 0 | 3 | 0 | 22 | 0 | **PARTIAL** |
| Size & rooms | 38 | 17 | 0 | 5 | 10 | 2 | 21 | 2 | **PARTIAL** |
| Tours, video & media counts (Property carriers) | 16 | 10 | 0 | 4 | 2 | 4 | 6 | 1 | **PARTIAL** |
| Transportation & schools | 43 | 0 | 36 | 0 | 0 | 0 | 43 | 0 | **PROVIDER-UNAVAILABLE** |
| NYC vocabulary in CustomProperty.CustomFields (Active census) | 51 keys | 51 | — | 0 | 0 | 51 | 0 | 51 | **MISSING** — CustomProperty is never hydrated by Search; no key is reachable by any criterion |

## C. Field detail by domain (with the mechanical chain per domain)

### Accessibility — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.AccessibilityFeatures` · projection: — · criterion: — · DTO/card: `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts` · tests: 3 file(s)

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `AccessibilityFeatures` | Enums.Multi.AccessibilityFeatures · AccessibilityFeatures (multi) · lookup 76 (RLS 25) · filterable · 4,802 / 81 Active · RLS | `listings.features.AccessibilityFeatures (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:338` | `lib/buildings/public-building-data.ts:92` `lib/buildings/public-building-data.ts:187` `app/api/buildings/search/route.ts:357` +2 | 3 | **PARTIAL** — not searchable |

### Agent & office attribution (Property side) — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.co_list_agent_mls_id`, `listings.co_list_office_mls_id`, `listings.list_agent_direct_phone`, `listings.list_agent_email`, `listings.list_agent_full_name`, `listings.list_agent_mls_id`, `listings.list_office_mls_id`, `listings.list_office_name`, `listings.raw_data.CoListAgentFullName`, `listings.raw_data.CoListOfficeName` +8 · projection: — · criterion: `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts` · DTO/card: `app/listing/[...slug]/page.tsx`, `lib/search/crm-idx-mapper.ts`, `lib/search/engine/hydrate.ts` · workspace/report/CMA: `app/api/crm/listings/[id]/route.ts`, `app/api/open-houses/route.ts`, `lib/buildings/public-building-data.ts`, `lib/comps/fetch-comps.ts`, `lib/market-report/generator.ts` · tests: 57 file(s) · **populated but NOT in the sync $select (never persisted): `CoListAgent2AOR`, `CoListAgent2DirectPhone`, `CoListAgent2Email`, `CoListAgent2MiddleName`, `CoListAgent2MlsId`, `CoListAgent2MobilePhone`, `CoListAgent2Nickname`, `CoListAgent2PreferredPhone`, `CoListAgent2StateLicense`, `CoListAgent2URL`, `CoListAgent3AOR`, `CoListAgent3DirectPhone` +31** · populated but not in the runtime $select: `BuyerAgentMlsId`, `BuyerOfficeMlsId`, `CoBuyerAgentMlsId`, `CoBuyerOfficeMlsId`, `CoListAgent2AOR`, `CoListAgent2DirectPhone`, `CoListAgent2Email`, `CoListAgent2FirstName`, `CoListAgent2FullName`, `CoListAgent2Key`, `CoListAgent2LastName`, `CoListAgent2MiddleName` +62

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `ListAgentEmail` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.ListAgentEmail (RAW_DATA_KEEP_FIELDS)` `listings.list_agent_email (spread typedAgentColumnsFromJson)` | — | `app/api/listings/route.ts:374` `app/api/listings/route.ts:1352` | S+R | `lib/search/crm-idx-mapper.ts:296` | `app/api/crm/listings/[id]/route.ts:437` `app/api/crm/listings/[id]/route.ts:452` | 19 | **COMPLETE** |
| `ListAgentFullName` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.ListAgentFullName (RAW_DATA_KEEP_FIELDS)` `listings.list_agent_full_name (spread typedAgentColumnsFromJson)` | — | `lib/search/canonical/field-registry.ts:118` `app/api/listings/route.ts:373` `app/api/listings/route.ts:1351` | S+R | `lib/search/crm-idx-mapper.ts:295` `lib/search/engine/hydrate.ts:160` | `app/api/crm/listings/[id]/route.ts:436` `app/api/crm/listings/[id]/route.ts:450` `lib/comps/fetch-comps.ts:86` +1 | 37 | **COMPLETE** |
| `ListOfficeKey` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.ListOfficeKey (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | `app/api/crm/listings/[id]/route.ts:438` | 2 | **PARTIAL** — not searchable · not displayed |
| `ListOfficeKeyNumeric` | Edm.Int64 · filterable · 591,607 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListOfficeMlsId` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.ListOfficeMlsId (RAW_DATA_KEEP_FIELDS)` `listings.list_office_mls_id (spread typedAgentColumnsFromJson)` | — | `app/api/listings/route.ts:375` `app/api/listings/route.ts:1353` | S+R | `app/listing/[...slug]/page.tsx:471` | `app/api/crm/listings/[id]/route.ts:438` `app/api/crm/listings/[id]/route.ts:454` | 16 | **COMPLETE** |
| `ListOfficeName` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.ListOfficeName (RAW_DATA_KEEP_FIELDS)` `listings.list_office_name (spread typedAgentColumnsFromJson)` | — | `lib/search/canonical/field-registry.ts:119` `app/api/listings/route.ts:373` `app/api/listings/route.ts:1351` | S+R | `lib/search/crm-idx-mapper.ts:294` `lib/search/engine/hydrate.ts:160` | `lib/buildings/public-building-data.ts:84` `lib/buildings/public-building-data.ts:975` `lib/buildings/public-building-data.ts:1039` +8 | 47 | **COMPLETE** |
| `ListOfficePhone` | Edm.String · filterable · 591,538 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `ListOfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 591,537 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListAgentMlsId` | Edm.String · filterable · 591,197 · RLS | `listings.raw_data.ListAgentMlsId (RAW_DATA_KEEP_FIELDS)` `listings.list_agent_mls_id (spread typedAgentColumnsFromJson)` | — | `app/api/listings/route.ts:375` `app/api/listings/route.ts:1353` | S+R | — | `app/api/crm/listings/[id]/route.ts:436` `app/api/crm/listings/[id]/route.ts:455` | 26 | **PARTIAL** — not displayed |
| `ListAgentKey` | Edm.String · filterable · 587,315 · RLS | `listings.raw_data.ListAgentKey (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | `app/api/crm/listings/[id]/route.ts:436` | 2 | **PARTIAL** — not searchable · not displayed |
| `ListAgentKeyNumeric` | Edm.Int64 · filterable · 587,315 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListAgentLastName` | Edm.String · filterable · 585,980 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `ListAgentFirstName` | Edm.String · filterable · 585,957 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `ListAgentAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 585,917 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListAgentNickname` | Edm.String · filterable · 585,639 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListOfficeURL` | Edm.String · filterable · 585,251 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `ListAgentDirectPhone` | Edm.String · filterable · 580,228 · RLS | `listings.raw_data.ListAgentDirectPhone (RAW_DATA_KEEP_FIELDS)` `listings.list_agent_direct_phone (spread typedAgentColumnsFromJson)` | — | `app/api/listings/route.ts:374` `app/api/listings/route.ts:1352` | S+R | `lib/search/crm-idx-mapper.ts:297` | `app/api/crm/listings/[id]/route.ts:437` `app/api/crm/listings/[id]/route.ts:453` | 16 | **COMPLETE** |
| `ListAgentPreferredPhone` | Edm.String · filterable · 578,578 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListAgentMiddleName` | Edm.String · filterable · 250,636 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgentEmail` | Edm.String · filterable · 208,274 · RLS | — | — | — | S | — | — | 2 | **MISSING** |
| `CoListAgentFullName` | Edm.String · filterable · 208,274 · RLS | `listings.raw_data.CoListAgentFullName (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | — | 2 | **PARTIAL** — not searchable · not displayed |
| `CoListAgentMlsId` | Edm.String · filterable · 208,023 · RLS | `listings.co_list_agent_mls_id (spread typedAgentColumnsFromJson)` | — | `app/api/listings/route.ts:376` `app/api/listings/route.ts:1354` | S | — | `app/api/crm/listings/[id]/route.ts:457` | 7 | **PARTIAL** — not displayed |
| `CoListAgentKey` | Edm.String · filterable · 207,401 · RLS | — | — | — | S | — | — | 2 | **MISSING** |
| `CoListAgentKeyNumeric` | Edm.Int64 · filterable · 207,401 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOfficeKey` | Edm.String · filterable · 207,401 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListOfficeKeyNumeric` | Edm.Int64 · filterable · 207,401 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOfficeMlsId` | Edm.String · filterable · 207,401 · RLS | `listings.co_list_office_mls_id (spread typedAgentColumnsFromJson)` | — | `app/api/listings/route.ts:376` `app/api/listings/route.ts:1354` | S | — | `app/api/crm/listings/[id]/route.ts:456` | 4 | **PARTIAL** — not displayed |
| `CoListOfficeName` | Edm.String · filterable · 207,401 · RLS | `listings.raw_data.CoListOfficeName (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `CoListAgentAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 207,368 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgentLastName` | Edm.String · filterable · 207,360 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgentFirstName` | Edm.String · filterable · 207,355 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListOfficePhone` | Edm.String · filterable · 207,248 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListOfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 207,183 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgentNickname` | Edm.String · filterable · 206,954 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgentDirectPhone` | Edm.String · filterable · 206,739 · RLS | — | — | — | S | — | — | 2 | **MISSING** |
| `CoListAgentPreferredPhone` | Edm.String · filterable · 206,467 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOfficeURL` | Edm.String · filterable · 199,749 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `BuyerOfficeMlsId` | Edm.String · filterable · 100,463 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `BuyerAgentMlsId` | Edm.String · filterable · 100,112 · RLS | — | — | — | S | — | — | 6 | **MISSING** |
| `CoListAgentMiddleName` | Edm.String · filterable · 84,950 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListAgentURL` | Edm.String · filterable · 61,122 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `ListOfficeEmail` | Edm.String · filterable · 52,567 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent2MlsId` | Edm.String · filterable · 51,234 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2FullName` | Edm.String · filterable · 50,995 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent2Key` | Edm.String · filterable · 50,994 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListOffice2Key` | Edm.String · filterable · 50,994 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOffice2MlsId` | Edm.String · filterable · 50,994 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOffice2Name` | Edm.String · filterable · 50,994 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2FirstName` | Edm.String · filterable · 50,931 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent2LastName` | Edm.String · filterable · 50,931 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListOffice2Phone` | Edm.String · filterable · 50,927 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2Email` | Edm.String · filterable · 50,916 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOffice2AOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 50,884 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2DirectPhone` | Edm.String · filterable · 50,831 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2AOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 50,821 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2PreferredPhone` | Edm.String · filterable · 50,779 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2StateLicense` | Edm.String · filterable · 50,697 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2Nickname` | Edm.String · filterable · 50,677 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOffice2URL` | Edm.String · filterable · 48,800 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2MobilePhone` | Edm.String · filterable · 48,785 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOfficeEmail` | Edm.String · filterable · 21,683 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2MiddleName` | Edm.String · filterable · 19,072 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3MlsId` | Edm.String · filterable · 7,994 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3FullName` | Edm.String · filterable · 7,993 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent3Key` | Edm.String · filterable · 7,993 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent3Email` | Edm.String · filterable · 7,987 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3DirectPhone` | Edm.String · filterable · 7,962 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3FirstName` | Edm.String · filterable · 7,957 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent3LastName` | Edm.String · filterable · 7,957 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent3PreferredPhone` | Edm.String · filterable · 7,937 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3StateLicense` | Edm.String · filterable · 7,880 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3AOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 7,868 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3Nickname` | Edm.String · filterable · 7,828 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3MobilePhone` | Edm.String · filterable · 7,493 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListOffice2Email` | Edm.String · filterable · 6,411 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent2URL` | Edm.String · filterable · 3,861 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoBuyerOfficeMlsId` | Edm.String · filterable · 3,173 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoBuyerAgentMlsId` | Edm.String · filterable · 3,168 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `CoListAgent3MiddleName` | Edm.String · filterable · 3,101 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CoListAgent3URL` | Edm.String · filterable · 716 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `BuyerAgentAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentDesignation` | Enums.Multi.BuyerAgentDesignation · BuyerAgentDesignation (multi) · lookup 27 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentDirectPhone` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentEmail` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentFax` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentFirstName` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentFullName` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentHomePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentKey` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentKeyNumeric` | Edm.Int64 · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentLastName` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentMiddleName` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentMobilePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentNamePrefix` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentNameSuffix` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentNationalAssociationId` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentOfficePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentOfficePhoneExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentPager` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentPreferredPhone` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentPreferredPhoneExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentStateLicense` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentTollFreePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentURL` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentVoiceMail` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerAgentVoiceMailExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeEmail` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeFax` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeKey` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeKeyNumeric` | Edm.Int64 · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeName` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeNationalAssociationId` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficePhoneExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerOfficeURL` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerTeamKey` | Edm.String · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BuyerTeamKeyNumeric` | Edm.Int64 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerTeamMlsId` | Edm.String · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BuyerTeamName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentDesignation` | Enums.Multi.CoBuyerAgentDesignation · CoBuyerAgentDesignation (multi) · lookup 27 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentDirectPhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentEmail` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentFax` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentFirstName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentFullName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentHomePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentKey` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentKeyNumeric` | Edm.Int64 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentLastName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentMiddleName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentMobilePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentNamePrefix` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentNameSuffix` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentNationalAssociationId` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentOfficePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentOfficePhoneExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentPager` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentPreferredPhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentPreferredPhoneExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentStateLicense` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentTollFreePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentURL` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentVoiceMail` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerAgentVoiceMailExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeEmail` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeFax` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeKey` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeKeyNumeric` | Edm.Int64 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeNationalAssociationId` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficePhoneExt` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoBuyerOfficeURL` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoListAgent2HomePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgent2NationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgent2OfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgent3HomePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgent3NationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgent3OfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentDesignation` | Enums.Multi.CoListAgentDesignation · CoListAgentDesignation (multi) · lookup 27 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentFax` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentHomePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoListAgentMobilePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoListAgentNamePrefix` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentNameSuffix` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentOfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentPager` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentPreferredPhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentStateLicense` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoListAgentTollFreePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentURL` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoListAgentVoiceMail` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListAgentVoiceMailExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListOfficeFax` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CoListOfficeNationalAssociationId` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CoListOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `HeadBrokerMemberKey` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `HeadBrokerMemberMlsId` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ListAgentDesignation` | Enums.Multi.ListAgentDesignation · ListAgentDesignation (multi) · lookup 27 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentFax` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentHomePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ListAgentMobilePhone` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ListAgentNamePrefix` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentNameSuffix` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentOfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentPager` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentPreferredPhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentStateLicense` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ListAgentTollFreePhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentVoiceMail` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAgentVoiceMailExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListOfficeFax` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListOfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListTeamKey` | Edm.String · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListTeamKeyNumeric` | Edm.Int64 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ListTeamMlsId` | Edm.String · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListTeamName` | Edm.String · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Amenities & building features — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.Appliances`, `listings.features.ArchitecturalStyle`, `listings.features.Basement`, `listings.features.BasementYN`, `listings.features.BuildingFeatures`, `listings.features.CommunityFeatures`, `listings.features.ConstructionMaterials`, `listings.features.Cooling`, `listings.features.CoolingYN`, `listings.features.DirectionFaces` +32 · projection: `lib/search/listing-search-projection.ts`, `lib/search/types.ts` · amenity map keys: `bike-storage`, `central-air`, `dishwasher`, `doorman`, `elevator`, `fireplace`, `gym`, `high-ceilings`, `lounge`, `natural-light`, `outdoor-space`, `park-views` +14 · criterion: `lib/search/canonical/field-registry.ts`, `lib/search/canonical/live-truth.ts`, `lib/search/nyc-dictionary.ts` · DTO/card: `app/components/SearchChips.tsx`, `app/components/SearchFilterPanel.tsx`, `app/listing/[...slug]/page.tsx`, `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/listings/[id]/route.ts`, `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts` · tests: 27 file(s) · **populated but NOT in the sync $select (never persisted): `DoorFeatures`, `OtherEquipment`, `SeniorCommunityYN`** · populated but not in the runtime $select: `Appliances`, `Basement`, `BasementYN`, `CommunityFeatures`, `Cooling`, `DoorFeatures`, `ElectricOnPropertyYN`, `Exposures`, `FireplaceFeatures`, `FireplaceYN`, `FireplacesTotal`, `Flooring` +17

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `Exposures` | Enums.Multi.Exposures · Exposures (multi) · lookup 9 (RLS 4) · filterable · 338,278 · not RLS | `listings.features.Exposures (pick → features)` | — | — | S | — | — | 1 | **PARTIAL** — not searchable · not displayed |
| `ArchitecturalStyle` | Enums.Multi.ArchitecturalStyle · ArchitecturalStyle (multi) · lookup 135 (RLS 18) · filterable · 248,763 · RLS | `listings.features.ArchitecturalStyle (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:579` `lib/search/crm-idx-mapper.ts:335` | — | — | **PARTIAL** — not searchable |
| `ExteriorFeatures` | Enums.Multi.ExteriorFeatures · ExteriorFeatures (multi) · lookup 152 (RLS 50) · filterable · 238,927 / 6,417 Active · RLS | `listings.raw_data.ExteriorFeatures (RAW_DATA_KEEP_FIELDS)` `listings.features.ExteriorFeatures (pick → features)` | `lib/search/types.ts:121` `lib/search/types.ts:132` map: roof-deck: RoofDeck|BuildingRoofDeck map: outdoor-space: Balcony|BuildingBalcony|PrivateOutdoorSpaceOver60Sqft|PrivateOutdoorSpaceUnder60Sqft|PrivateYard|Garden | — | S+R | `lib/idx/db-to-public-dto.ts:583` `lib/search/crm-idx-mapper.ts:339` | `lib/buildings/public-building-data.ts:93` `lib/buildings/public-building-data.ts:188` `app/api/buildings/search/route.ts:356` +3 | 1 | **COMPLETE** |
| `CoolingYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 233,886 · RLS | `listings.features.CoolingYN (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:330` | — | 1 | **PARTIAL** — not searchable |
| `Cooling` | Enums.Multi.Cooling · Cooling (multi) · lookup 41 (RLS 19) · filterable · 205,151 · RLS | `listings.raw_data.Cooling (RAW_DATA_KEEP_FIELDS)` `listings.features.Cooling (pick → features)` | `lib/search/types.ts:129` map: central-air: CentralAir | — | S | `app/listing/[...slug]/page.tsx:1164` `lib/idx/db-to-public-dto.ts:594` | `lib/buildings/public-building-data.ts:96` `lib/buildings/public-building-data.ts:195` `app/api/crm/listings/[id]/route.ts:417` +1 | 6 | **COMPLETE** |
| `Appliances` | Enums.Multi.Appliances · Appliances (multi) · lookup 129 (RLS 61) · filterable · 202,134 / 4,253 Active · RLS | `listings.raw_data.Appliances (RAW_DATA_KEEP_FIELDS)` `listings.features.Appliances (pick → features)` | `lib/search/types.ts:130` `lib/search/types.ts:131` map: dishwasher: Dishwasher map: washer-dryer: Washer|Dryer|WasherDryer|WasherDryerAllowed|WasherDryerStacked | — | S | `lib/idx/db-to-public-dto.ts:584` | `lib/buildings/public-building-data.ts:98` `lib/buildings/public-building-data.ts:186` `app/api/crm/listings/[id]/route.ts:418` +1 | 3 | **COMPLETE** |
| `ViewYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 163,138 · RLS | `listings.features.ViewYN (pick → features)` | — | — | S | — | — | 4 | **PARTIAL** — not searchable · not displayed |
| `PatioAndPorchFeatures` | Enums.Multi.PatioAndPorchFeatures · PatioAndPorchFeatures (multi) · lookup 53 (RLS 27) · filterable · 156,521 · RLS | `listings.features.PatioAndPorchFeatures (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:344` | `lib/buildings/public-building-data.ts:93` `lib/buildings/public-building-data.ts:189` `lib/buildings/upsert.ts:232` | — | **PARTIAL** — not searchable |
| `InteriorFeatures` | Enums.Multi.InteriorOrRoomFeatures · InteriorOrRoomFeatures (multi) · lookup 299 (RLS 55) · filterable · 144,434 · RLS | `listings.raw_data.InteriorFeatures (RAW_DATA_KEEP_FIELDS)` `listings.features.InteriorFeatures (pick → features)` | `lib/search/types.ts:143` `lib/search/types.ts:144` `lib/search/types.ts:145` `lib/search/types.ts:146` `lib/search/types.ts:147` `lib/search/types.ts:148` map: elevator: Elevators|Elevator map: walk-in-closet: WalkInClosets|WalkInCloset map: high-ceilings: HighCeilings|HighCeiling map: fireplace: WoodBurningFireplace|DecorativeFireplace|Fireplace map: natural-light: NaturalLight map: renovated: Renovated|GutRenovated|NewlyRenovated map: quiet: Quiet | `lib/search/canonical/live-truth.ts:115` | S | `lib/idx/db-to-public-dto.ts:582` | `lib/buildings/public-building-data.ts:98` `lib/buildings/public-building-data.ts:185` `app/api/crm/listings/[id]/route.ts:418` +1 | 6 | **COMPLETE** |
| `View` | Enums.Multi.View · View (multi) · lookup 85 (RLS 29) · filterable · 138,934 · RLS | `listings.features.View (pick → features)` | `lib/search/types.ts:138` `lib/search/types.ts:139` `lib/search/types.ts:140` `lib/search/types.ts:141` map: park-views: Park|ParkGreenbelt map: river-views: River|Water map: skyline-views: City|CityLights|Skyline|Downtown map: views: Park|ParkGreenbelt|River|Water|City|CityLights|Skyline|Downtown | — | S+R | `lib/search/crm-idx-mapper.ts:333` | `lib/buildings/public-building-data.ts:106` `lib/buildings/public-building-data.ts:197` `app/api/crm/listings/[id]/route.ts:427` +1 | 10 | **COMPLETE** |
| `FireplaceYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 96,628 · RLS | `listings.features.FireplaceYN (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `Furnished` | Enums.Furnished · Furnished · lookup 5 (RLS 5) · filterable · 95,091 · RLS | `listings.raw_data.Furnished (RAW_DATA_KEEP_FIELDS)` `listings.features.Furnished (pick → features)` | `lib/search/listing-search-projection.ts:403` | `lib/search/nyc-dictionary.ts:349` `lib/search/canonical/field-registry.ts:189` | S+R | `app/components/SearchChips.tsx:220` `app/components/SearchFilterPanel.tsx:345` `lib/idx/db-to-public-dto.ts:605` | — | 6 | **COMPLETE** |
| `OtherEquipment` | Enums.Multi.OtherEquipment · OtherEquipment (multi) · lookup 35 (RLS 7) · filterable · 72,586 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `BuildingFeatures` | Enums.Multi.BuildingFeatures · BuildingFeatures (multi) · lookup 123 (RLS 39) · filterable · 65,882 / 6,256 Active · RLS | `listings.features.BuildingFeatures (pick → features)` | `lib/search/types.ts:114` `lib/search/types.ts:116` `lib/search/types.ts:117` `lib/search/types.ts:118` `lib/search/types.ts:119` `lib/search/types.ts:120` `lib/search/types.ts:122` `lib/search/types.ts:125` `lib/search/types.ts:126` `lib/search/types.ts:127` map: doorman: Concierge map: gym: FitnessCenter|HealthClub|YogaStudio map: pool: IndoorPool map: spa: SpaHotTub map: sauna: Sauna map: steam-room: SteamRoom map: playroom: CommonPlayroom map: elevator: Elevators|Elevator map: lounge: CommonLounge map: bike-storage: BikeStorage map: storage: Storage|ColdStorage | — | S+R | `lib/idx/db-to-public-dto.ts:581` `lib/search/crm-idx-mapper.ts:340` | `lib/buildings/public-building-data.ts:91` `lib/buildings/public-building-data.ts:179` `app/api/buildings/search/route.ts:356` +6 | 10 | **COMPLETE** |
| `BasementYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 65,252 · RLS | `listings.features.BasementYN (pick → features)` | — | — | S | — | — | 1 | **PARTIAL** — not searchable · not displayed |
| `Basement` | Enums.Multi.Basement · Basement (multi) · lookup 43 (RLS 20) · filterable · 59,659 · RLS | `listings.features.Basement (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `HeatingYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 38,477 · RLS | `listings.features.HeatingYN (pick → features)` | — | — | S | — | — | 1 | **PARTIAL** — not searchable · not displayed |
| `FireplacesTotal` | Edm.Int32 · filterable · 29,172 · RLS | `listings.features.FireplacesTotal (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `Flooring` | Enums.Multi.Flooring · Flooring (multi) · lookup 62 (RLS 23) · filterable · 25,863 · RLS | `listings.raw_data.Flooring (RAW_DATA_KEEP_FIELDS)` `listings.features.Flooring (pick → features)` | — | — | S | `lib/idx/db-to-public-dto.ts:595` | `lib/buildings/public-building-data.ts:98` `lib/buildings/public-building-data.ts:184` `app/api/crm/listings/[id]/route.ts:417` +1 | 3 | **PARTIAL** — not searchable |
| `Heating` | Enums.Multi.Heating · Heating (multi) · lookup 96 (RLS 39) · filterable · 22,920 · RLS | `listings.raw_data.Heating (RAW_DATA_KEEP_FIELDS)` `listings.features.Heating (pick → features)` | — | — | S | `app/listing/[...slug]/page.tsx:1163` `lib/idx/db-to-public-dto.ts:593` | `lib/buildings/public-building-data.ts:96` `lib/buildings/public-building-data.ts:194` `app/api/crm/listings/[id]/route.ts:417` +1 | 6 | **PARTIAL** — not searchable |
| `FireplaceFeatures` | Enums.Multi.FireplaceFeatures · FireplaceFeatures (multi) · lookup 79 (RLS 32) · filterable · 18,576 · RLS | `listings.features.FireplaceFeatures (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `WindowFeatures` | Enums.Multi.WindowFeatures · WindowFeatures (multi) · lookup 55 (RLS 17) · filterable · 15,977 · RLS | `listings.features.WindowFeatures (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:243` | 1 | **PARTIAL** — not searchable · not displayed |
| `CommunityFeatures` | Enums.Multi.CommunityFeatures · CommunityFeatures (multi) · lookup 141 (RLS 2) · filterable · 5,999 / 809 Active · RLS | `listings.features.CommunityFeatures (pick → features)` | — | — | S | `lib/idx/db-to-public-dto.ts:588` | `lib/buildings/public-building-data.ts:91` `lib/buildings/public-building-data.ts:181` `app/api/buildings/search/route.ts:356` +2 | 1 | **PARTIAL** — not searchable |
| `LotFeatures` | Enums.Multi.LotFeatures · LotFeatures (multi) · lookup 207 (RLS 27) · filterable · 1,714 · not RLS | `listings.features.LotFeatures (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OtherStructures` | Enums.Multi.OtherStructures · OtherStructures (multi) · lookup 59 (RLS 12) · filterable · 1,632 · not RLS | `listings.features.OtherStructures (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `DirectionFaces` | Enums.DirectionFaces · DirectionFaces · lookup 9 (RLS 6) · filterable · 1,382 · not RLS | `listings.features.DirectionFaces (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:332` | — | — | **PARTIAL** — not searchable |
| `FoundationArea` | Edm.Decimal · filterable · 802 · not RLS | `listings.features.FoundationArea (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `GreenEnergyEfficient` | Enums.Multi.GreenEnergyEfficient · GreenEnergyEfficient (multi) · lookup 25 (RLS 8) · filterable · 416 · not RLS | `listings.features.GreenEnergyEfficient (pick → features)` | — | — | S | — | `lib/buildings/public-building-data.ts:104` `lib/buildings/public-building-data.ts:205` `lib/buildings/upsert.ts:154` | — | **PARTIAL** — not searchable · not displayed |
| `ElectricOnPropertyYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 118 · not RLS | `listings.features.ElectricOnPropertyYN (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `WaterfrontYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 98 · not RLS | `listings.features.WaterfrontYN (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `ConstructionMaterials` | Enums.Multi.ConstructionMaterials · ConstructionMaterials (multi) · lookup 87 (RLS 14) · filterable · 45 · not RLS | `listings.features.ConstructionMaterials (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:350` | `lib/buildings/upsert.ts:212` | — | **PARTIAL** — not searchable |
| `DoorFeatures` | Enums.Multi.DoorFeatures · DoorFeatures (multi) · lookup 18 (RLS 5) · filterable · 32 · not RLS | — | — | — | — | — | `lib/buildings/upsert.ts:242` | — | **MISSING** |
| `FoundationDetails` | Enums.Multi.FoundationDetails · FoundationDetails (multi) · lookup 27 (RLS 8) · filterable · 13 · not RLS | `listings.features.FoundationDetails (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `SeniorCommunityYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 8 · not RLS | — | — | — | — | — | — | 1 | **MISSING** |
| `GreenBuildingVerificationType` | Enums.Multi.GreenBuildingVerificationType · GreenBuildingVerificationType (multi) · lookup 29 (RLS 2) · filterable · 5 · not RLS | `listings.features.GreenBuildingVerificationType (pick → features)` | — | — | S | — | `lib/buildings/public-building-data.ts:104` `lib/buildings/public-building-data.ts:204` `lib/buildings/upsert.ts:153` | — | **PARTIAL** — not searchable · not displayed |
| `WaterfrontFeatures` | Enums.Multi.WaterfrontFeatures · WaterfrontFeatures (multi) · lookup 77 (RLS 1) · filterable · 5 · not RLS | `listings.features.WaterfrontFeatures (pick → features)` | — | — | S | — | `lib/buildings/public-building-data.ts:106` `lib/buildings/public-building-data.ts:198` `lib/buildings/upsert.ts:257` | — | **PARTIAL** — not searchable · not displayed |
| `GreenEnergyGeneration` | Enums.Multi.GreenEnergyGeneration · GreenEnergyGeneration (multi) · lookup 8 (RLS 1) · filterable · 2 · not RLS | `listings.features.GreenEnergyGeneration (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `GreenIndoorAirQuality` | Enums.Multi.GreenIndoorAirQuality · GreenIndoorAirQuality (multi) · lookup 8 (RLS 1) · filterable · 1 · not RLS | `listings.features.GreenIndoorAirQuality (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `AssociationAmenities` | Enums.Multi.AssociationAmenities · AssociationAmenities (multi) · lookup 137 (RLS 0) · filterable · 0 / 0 Active · not RLS | `listings.features.AssociationAmenities (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:589` `lib/search/crm-idx-mapper.ts:345` | `lib/buildings/public-building-data.ts:91` `lib/buildings/public-building-data.ts:180` `app/api/buildings/search/route.ts:357` +2 | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `CommonWalls` | Enums.Multi.CommonWalls · CommonWalls (multi) · lookup 6 (RLS 0) · filterable · 0 · not RLS | `listings.features.CommonWalls (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `GreenLocation` | Enums.Multi.GreenLocation · GreenLocation (multi) · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GreenSustainability` | Enums.Multi.GreenSustainability · GreenSustainability (multi) · lookup 9 (RLS 0) · filterable · 0 · not RLS | `listings.features.GreenSustainability (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `GreenVerificationYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GreenWaterConservation` | Enums.Multi.GreenWaterConservation · GreenWaterConservation (multi) · lookup 12 (RLS 0) · filterable · 0 · not RLS | `listings.features.GreenWaterConservation (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `Roof` | Enums.Multi.Roof · Roof (multi) · lookup 51 (RLS 0) · filterable · 0 · not RLS | `listings.features.Roof (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:244` | 3 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `Sewer` | Enums.Multi.Sewer · Sewer (multi) · lookup 55 (RLS 0) · filterable · 0 · not RLS | `listings.features.Sewer (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:249` | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `UnitsFurnished` | Enums.UnitsFurnished · UnitsFurnished · lookup 7 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Utilities` | Enums.Multi.Utilities · Utilities (multi) · lookup 41 (RLS 0) · filterable · 0 / 0 Active · not RLS | — | — | — | — | — | `lib/buildings/upsert.ts:250` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UtilitiesExpense` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `WaterSource` | Enums.Multi.WaterSource · WaterSource (multi) · lookup 39 (RLS 0) · filterable · 0 · not RLS | `listings.features.WaterSource (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:248` | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |

### Classification & building facts — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.BuilderName`, `listings.features.BuildingAreaTotal`, `listings.features.BuildingAreaUnits`, `listings.features.CommonInterest`, `listings.features.CurrentUse`, `listings.features.DevelopmentStatus`, `listings.features.EntryLevel`, `listings.features.Levels`, `listings.features.NewConstructionYN`, `listings.features.NumberOfBuildings` +21 · projection: `lib/search/listing-search-projection.ts` · criterion: `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts`, `lib/search/canonical/live-truth.ts`, `lib/search/engine/criteria.ts`, `lib/search/engine/universe.ts`, `lib/search/public-listing-db.ts` · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts`, `lib/search/engine/hydrate.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/clients/[id]/route.ts`, `app/api/crm/compliance/audit/route.ts`, `app/api/crm/convert/route.ts`, `app/api/crm/lease-tracker/route.ts`, `app/api/crm/listing-sends/route.ts` +19 · tests: 65 file(s) · **populated but NOT in the sync $select (never persisted): `LaborInformation`, `NumberOfUnitsInCommunity`, `PossibleUse`, `PropertySubTypeAdditional`** · populated but not in the runtime $select: `BuilderName`, `BuildingAreaTotal`, `BuildingAreaUnits`, `CurrentUse`, `DevelopmentStatus`, `EntryLevel`, `LaborInformation`, `Levels`, `NumberOfBuildings`, `NumberOfSeparateElectricMeters`, `NumberOfSeparateGasMeters`, `NumberOfSeparateWaterMeters` +5

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `NumberOfUnitsTotal` | Edm.Int32 · filterable · 591,607 · RLS | `listings.raw_data.NumberOfUnitsTotal (RAW_DATA_KEEP_FIELDS)` `listings.features.NumberOfUnitsTotal (pick → features)` | — | — | S+R | — | `lib/buildings/public-building-data.ts:87` `lib/buildings/public-building-data.ts:167` `lib/buildings/upsert.ts:218` +3 | 3 | **PARTIAL** — not searchable · not displayed |
| `PropertyType` | Enums.PropertyType · PropertyType · lookup 13 (RLS 3) · filterable · 591,607 · RLS | `listings.raw_data.PropertyType (RAW_DATA_KEEP_FIELDS)` `listings.listing_type (mapper dataflow → listing_type)` `listings.property_type (mapper dataflow → property_type)` `listings.features.PropertyType (pick → features)` | — | `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` `lib/search/canonical/field-registry.ts:132` +8 | S+R | `lib/search/crm-idx-mapper.ts:30` `lib/search/engine/hydrate.ts:158` | `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:963` `lib/buildings/public-building-data.ts:974` +39 | 48 | **COMPLETE** |
| `PropertySubType` | Enums.PropertySubType · PropertySubType · lookup 76 (RLS 10) · filterable · 591,591 · RLS | `listings.raw_data.PropertySubType (RAW_DATA_KEEP_FIELDS)` `listings.property_sub_type (mapper dataflow → property_sub_type)` `listings.features.PropertySubType (pick → features)` | — | `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` `lib/search/canonical/field-registry.ts:170` +7 | S+R | `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:272` `lib/search/engine/hydrate.ts:158` | `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:974` `lib/buildings/public-building-data.ts:1038` +16 | 25 | **COMPLETE** |
| `NewConstructionYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 576,590 · RLS | `listings.features.NewConstructionYN (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:351` | `lib/buildings/public-building-data.ts:88` `lib/buildings/public-building-data.ts:171` `app/api/buildings/search/route.ts:790` +5 | 5 | **PARTIAL** — not searchable |
| `PropertySubTypeAdditional` | Enums.Multi.PropertySubTypeAdditional · PropertySubTypeAdditional (multi) · lookup 76 (RLS 6) · filterable · 553,713 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `StoriesTotal` | Edm.Int32 · filterable · 533,803 · RLS | `listings.raw_data.StoriesTotal (RAW_DATA_KEEP_FIELDS)` `listings.features.StoriesTotal (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:547` | `lib/buildings/public-building-data.ts:86` `lib/buildings/public-building-data.ts:165` `app/api/buildings/search/route.ts:766` +8 | 8 | **PARTIAL** — not searchable |
| `YearBuilt` | Edm.Int32 · filterable · 485,638 · RLS | `listings.raw_data.YearBuilt (RAW_DATA_KEEP_FIELDS)` `listings.features.YearBuilt (pick → features)` | `lib/search/listing-search-projection.ts:472` | `app/api/listings/route.ts:860` | S+R | `lib/idx/db-to-public-dto.ts:546` `lib/search/crm-idx-mapper.ts:58` | `lib/buildings/public-building-data.ts:86` `lib/buildings/public-building-data.ts:164` `app/api/buildings/search/route.ts:766` +8 | 16 | **COMPLETE** |
| `CommonInterest` | Enums.CommonInterest · CommonInterest · lookup 13 (RLS 6) · filterable · 435,273 · RLS | `listings.raw_data.CommonInterest (RAW_DATA_KEEP_FIELDS)` `listings.features.CommonInterest (pick → features)` | — | `lib/search/canonical/live-truth.ts:110` `lib/search/engine/criteria.ts:98` `lib/search/engine/criteria.ts:198` +2 | S+R | `lib/idx/db-to-public-dto.ts:536` `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:270` | `lib/buildings/public-building-data.ts:87` `lib/buildings/public-building-data.ts:168` `lib/buildings/public-building-data.ts:974` +13 | 26 | **COMPLETE** |
| `EntryLevel` | Edm.Int32 · filterable · 424,420 · RLS | `listings.features.EntryLevel (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `StructureType` | Enums.Multi.StructureType · StructureType (multi) · lookup 23 (RLS 11) · filterable · 97,624 · RLS | `listings.raw_data.StructureType (RAW_DATA_KEEP_FIELDS)` `listings.features.StructureType (pick → features)` | — | `lib/search/engine/criteria.ts:98` `lib/search/engine/criteria.ts:202` `lib/search/engine/criteria.ts:204` +1 | S+R | `lib/search/crm-idx-mapper.ts:336` | `lib/buildings/public-building-data.ts:88` `lib/buildings/public-building-data.ts:170` `app/api/buildings/search/route.ts:768` +4 | 9 | **COMPLETE** |
| `BuildingAreaTotal` | Edm.Decimal · filterable · 15,003 · RLS | `listings.features.BuildingAreaTotal (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:449` `app/api/buildings/search/route.ts:805` | 3 | **PARTIAL** — not searchable · not displayed |
| `BuildingAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 2) · filterable · 12,674 · RLS | `listings.features.BuildingAreaUnits (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:805` | 1 | **PARTIAL** — not searchable · not displayed |
| `NumberOfUnitsVacant` | Edm.Int32 · filterable · 7,941 · RLS | `listings.features.NumberOfUnitsVacant (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:221` | — | **PARTIAL** — not searchable · not displayed |
| `Levels` | Enums.Multi.Levels · Levels (multi) · lookup 18 (RLS 6) · filterable · 5,755 · RLS | `listings.features.Levels (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `Stories` | Edm.Int32 · filterable · 1,612 · not RLS | `listings.features.Stories (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `CurrentUse` | Enums.Multi.CurrentOrPossibleUse · CurrentOrPossibleUse (multi) · lookup 66 (RLS 10) · filterable · 786 · not RLS | `listings.features.CurrentUse (pick → features)` | — | — | S | — | — | 1 | **PARTIAL** — not searchable · not displayed |
| `DevelopmentStatus` | Enums.Multi.DevelopmentStatus · DevelopmentStatus (multi) · lookup 19 (RLS 7) · filterable · 462 · not RLS | `listings.features.DevelopmentStatus (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:211` | — | **PARTIAL** — not searchable · not displayed |
| `BuilderName` | Edm.String · filterable · 79 · not RLS | `listings.features.BuilderName (pick → features)` | — | — | S | — | — | 2 | **PARTIAL** — not searchable · not displayed |
| `NumberOfBuildings` | Edm.Int32 · filterable · 74 · not RLS | `listings.features.NumberOfBuildings (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `NumberOfSeparateGasMeters` | Edm.Int32 · filterable · 10 · not RLS | `listings.features.NumberOfSeparateGasMeters (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `NumberOfSeparateElectricMeters` | Edm.Int32 · filterable · 9 · not RLS | `listings.features.NumberOfSeparateElectricMeters (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `NumberOfSeparateWaterMeters` | Edm.Int32 · filterable · 8 · not RLS | `listings.features.NumberOfSeparateWaterMeters (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `NumberOfUnitsInCommunity` | Edm.Int32 · filterable · 8 · not RLS | — | — | — | — | — | `lib/buildings/public-building-data.ts:86` `lib/buildings/public-building-data.ts:166` `app/api/buildings/search/route.ts:443` +5 | 3 | **MISSING** |
| `LaborInformation` | Enums.Multi.LaborInformation · LaborInformation (multi) · lookup 3 (RLS 3) · filterable · 5 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `PossibleUse` | Enums.Multi.CurrentOrPossibleUse · CurrentOrPossibleUse (multi) · lookup 66 (RLS 1) · filterable · 1 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `AnchorsCoTenants` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BuilderModel` | Edm.String · filterable · 0 · not RLS | `listings.features.BuilderModel (pick → features)` | — | — | S | — | — | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `BuildingAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | `listings.features.BuildingAreaSource (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:805` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `BuildingKey` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuildingKeyNumeric` | Edm.Int64 · SUPPRESSED · 0 / 0 Active · not RLS | `listings.features.BuildingKeyNumeric (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:281` | `app/api/buildings/search/route.ts:442` `app/api/buildings/search/route.ts:805` `app/api/buildings/search/route.ts:861` +2 | 5 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `BusinessName` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BusinessType` | Enums.Multi.BusinessType · BusinessType (multi) · lookup 139 (RLS 0) · filterable · 0 · not RLS | `listings.features.BusinessType (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:337` | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `EntryLocation` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `HoursDaysOfOperation` | Enums.Multi.HoursDaysOfOperation · HoursDaysOfOperation (multi) · lookup 9 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `HoursDaysOfOperationDescription` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeasableArea` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeasableAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfFullTimeEmployees` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfLots` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfPads` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfPartTimeEmployees` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfUnitsLeased` | Edm.Int32 · filterable · 0 · not RLS | `listings.features.NumberOfUnitsLeased (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:220` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `NumberOfUnitsMoMo` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | `lib/buildings/upsert.ts:222` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OwnershipType` | Enums.OwnershipType · OwnershipType · lookup 13 (RLS 0) · filterable · 0 · not RLS | `listings.features.OwnershipType (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:270` | `lib/buildings/public-building-data.ts:87` `lib/buildings/public-building-data.ts:169` `lib/buildings/public-building-data.ts:974` +5 | 4 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `PropertyAttachedYN` | Edm.Boolean · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | `app/api/buildings/search/route.ts:448` `app/api/buildings/search/route.ts:807` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PropertyCondition` | Enums.Multi.PropertyCondition · PropertyCondition (multi) · lookup 27 (RLS 4) · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.PropertyCondition (RAW_DATA_KEEP_FIELDS)` `listings.features.PropertyCondition (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:447` `app/api/buildings/search/route.ts:807` `lib/buildings/upsert.ts:210` | 3 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `SeatingCapacity` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `YearBuiltDetails` | Edm.String · filterable · 0 · not RLS | `listings.features.YearBuiltDetails (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:789` `app/api/buildings/search/route.ts:806` `app/api/buildings/search/route.ts:906` +2 | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `YearBuiltEffective` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `YearBuiltSource` | Enums.YearBuiltSource · YearBuiltSource · lookup 8 (RLS 0) · filterable · 0 · not RLS | `listings.features.YearBuiltSource (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:789` `app/api/buildings/search/route.ts:806` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `YearEstablished` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `YearsCurrentOwner` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Compensation & concessions (UCBA §5(E)-restricted) — **PROVIDER-UNAVAILABLE**

Impact chain (populated fields only) — persistence: — · projection: — · criterion: — · DTO/card: — · workspace/report/CMA: — · tests: 0 file(s)

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `BuyerBrokerageCompensation` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `BuyerBrokerageCompensationType` | Enums.CompensationType · CompensationType · lookup 5 (RLS 2) · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CompensationComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ConcessionInPrice` | Edm.Decimal · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ConcessionInPriceType` | Enums.ConcessionInPriceType · ConcessionInPriceType · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `Concessions` | Enums.Concessions · Concessions · lookup 3 (RLS 3) · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.Concessions (RAW_DATA_KEEP_FIELDS)` `listings.features.Concessions (pick → features)` | — | — | S | — | — | 4 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `ConcessionsAmount` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.ConcessionsAmount (RAW_DATA_KEEP_FIELDS)` `listings.features.ConcessionsAmount (pick → features)` | — | — | S | — | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `ConcessionsBuyerBrokerFee` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ConcessionsClosingCosts` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ConcessionsComments` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | `listings.features.ConcessionsComments (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `ConcessionsFinancingCosts` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ConcessionsOtherCosts` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ConcessionsPropertyImprovementCosts` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DualOrVariableRateCommissionYN` | Edm.Boolean · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LeaseRenewalCompensation` | Enums.Multi.LeaseRenewalCompensation · LeaseRenewalCompensation (multi) · lookup 5 (RLS 5) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SellerConsiderConcessionYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SubAgencyCompensation` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SubAgencyCompensationType` | Enums.CompensationType · CompensationType · lookup 5 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `TransactionBrokerCompensation` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `TransactionBrokerCompensationType` | Enums.CompensationType · CompensationType · lookup 5 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |

### Geography & map — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.address.City`, `listings.address.CityRegion`, `listings.address.CountyOrParish`, `listings.address.CrossStreet`, `listings.address.PostalCity`, `listings.address.PostalCode`, `listings.address.StateOrProvince`, `listings.address.StreetDirPrefix`, `listings.address.StreetDirSuffix`, `listings.address.StreetName` +27 · projection: `lib/search/listing-search-projection.ts`, `lib/search/types.ts` · criterion: `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts`, `lib/search/engine/criteria.ts`, `lib/search/public-listing-db.ts` · DTO/card: `app/listing/[...slug]/page.tsx`, `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts`, `lib/search/engine/hydrate.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/clients/[id]/buyer-priorities/route.ts`, `app/api/crm/compliance/audit/route.ts`, `app/api/crm/listing-sends/route.ts`, `app/api/crm/listings/[id]/route.ts`, `app/api/crm/listings/reset-sync/route.ts` +18 · tests: 104 file(s) · **populated but NOT in the sync $select (never persisted): `CountrySubdivision`, `ParcelNumber`, `PostalCodePlus4`, `StreetAdditionalInfo`, `StreetNumberNumeric`, `UniversalParcelId`, `UnparsedAddress`** · populated but not in the runtime $select: `CountrySubdivision`, `ParcelNumber`, `PostalCodePlus4`, `StreetAdditionalInfo`, `StreetNumberNumeric`, `TaxBlock`, `TaxLot`, `UniversalParcelId`, `UnparsedAddress`, `ZoningDescription`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `City` | Edm.String · lookup 24515 (RLS 1) · filterable · 591,607 · RLS | `listings.raw_data.City (RAW_DATA_KEEP_FIELDS)` `listings.city (mapper dataflow → city)` `listings.address.City (pick → address)` | `lib/search/types.ts:140` `lib/search/types.ts:141` `lib/search/listing-search-projection.ts:257` `lib/search/listing-search-projection.ts:265` `lib/search/listing-search-projection.ts:466` | — | S+R | `lib/search/engine/hydrate.ts:132` `lib/search/engine/hydrate.ts:159` | `app/api/buildings/search/route.ts:771` `app/api/buildings/search/route.ts:889` `app/api/crm/listings/[id]/route.ts:276` +13 | 63 | **COMPLETE** |
| `CityRegion` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.CityRegion (RAW_DATA_KEEP_FIELDS)` `listings.borough (mapper dataflow → borough)` `listings.address.CityRegion (pick → address)` | — | `lib/search/engine/criteria.ts:98` `lib/search/engine/criteria.ts:189` `lib/search/canonical/field-registry.ts:125` +4 | S+R | `lib/search/engine/hydrate.ts:131` `lib/search/crm-idx-mapper.ts:276` `lib/search/engine/hydrate.ts:159` +1 | `app/api/buildings/search/route.ts:772` `app/api/buildings/search/route.ts:869` `app/api/buildings/search/route.ts:876` +18 | 20 | **COMPLETE** |
| `CountyOrParish` | Edm.String · lookup 4423 (RLS 5) · filterable · 591,607 · RLS | `listings.raw_data.CountyOrParish (RAW_DATA_KEEP_FIELDS)` `listings.address.CountyOrParish (pick → address)` `listings.features.CountyOrParish (pick → features)` | — | — | S+R | — | `app/api/buildings/search/route.ts:772` `app/api/crm/listings/[id]/route.ts:395` | 14 | **PARTIAL** — not searchable · not displayed |
| `PostalCode` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.PostalCode (RAW_DATA_KEEP_FIELDS)` `listings.postal_code (mapper dataflow → postal_code)` `listings.address.PostalCode (pick → address)` | `lib/search/listing-search-projection.ts:465` | `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:207` `lib/search/canonical/field-registry.ts:126` +4 | S+R | `lib/idx/db-to-public-dto.ts:380` `lib/search/engine/hydrate.ts:132` `lib/search/crm-idx-mapper.ts:277` +3 | `lib/open-houses/upcoming-open-houses.ts:181` `lib/buildings/public-building-data.ts:779` `app/api/buildings/search/route.ts:770` +23 | 64 | **COMPLETE** |
| `StreetName` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.StreetName (RAW_DATA_KEEP_FIELDS)` `listings.address.StreetName (pick → address)` | `lib/search/listing-search-projection.ts:257` | `lib/search/public-listing-db.ts:157` `lib/search/public-listing-db.ts:167` | S+R | `lib/idx/db-to-public-dto.ts:368` `app/listing/[...slug]/page.tsx:367` `app/listing/[...slug]/page.tsx:648` +1 | `lib/open-houses/upcoming-open-houses.ts:177` `lib/open-houses/upcoming-open-houses.ts:306` `lib/buildings/public-building-data.ts:780` +24 | 71 | **COMPLETE** |
| `StreetNumber` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.StreetNumber (RAW_DATA_KEEP_FIELDS)` `listings.address.StreetNumber (pick → address)` | `lib/search/listing-search-projection.ts:257` | `lib/search/public-listing-db.ts:145` | S+R | `app/listing/[...slug]/page.tsx:348` `lib/idx/db-to-public-dto.ts:365` `app/listing/[...slug]/page.tsx:366` +1 | `lib/open-houses/upcoming-open-houses.ts:175` `lib/open-houses/upcoming-open-houses.ts:306` `lib/buildings/public-building-data.ts:505` +23 | 70 | **COMPLETE** |
| `SubdivisionName` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.SubdivisionName (RAW_DATA_KEEP_FIELDS)` `listings.neighborhood (mapper dataflow → neighborhood)` `listings.address.SubdivisionName (pick → address)` | — | `lib/search/engine/criteria.ts:98` `lib/search/engine/criteria.ts:194` `lib/search/canonical/field-registry.ts:124` +5 | S+R | `lib/search/engine/hydrate.ts:131` `lib/search/crm-idx-mapper.ts:273` `lib/search/engine/hydrate.ts:159` | `app/api/buildings/search/route.ts:770` `app/api/buildings/search/route.ts:892` `app/api/buildings/search/route.ts:893` +15 | 8 | **COMPLETE** |
| `TaxBlock` | Edm.String · filterable · 591,607 · RLS | `listings.features.TaxBlock (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:791` `app/api/buildings/search/route.ts:917` `app/api/buildings/search/route.ts:609` +1 | 5 | **PARTIAL** — not searchable · not displayed |
| `UnparsedAddress` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.UnparsedAddress (RAW_DATA_KEEP_FIELDS)` | — | `lib/search/canonical/field-registry.ts:122` | — | — | `app/api/crm/clients/[id]/buyer-priorities/route.ts:23` `app/api/crm/listings/[id]/route.ts:391` `app/api/crm/listings/[id]/route.ts:410` +14 | 12 | **PARTIAL** — not displayed |
| `StateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 7) · filterable · 591,604 · RLS | `listings.raw_data.StateOrProvince (RAW_DATA_KEEP_FIELDS)` `listings.address.StateOrProvince (pick → address)` | `lib/search/listing-search-projection.ts:467` | — | S+R | — | `app/api/buildings/search/route.ts:771` `app/api/buildings/search/route.ts:890` `app/api/crm/listings/[id]/route.ts:390` +3 | 27 | **PARTIAL** — not displayed |
| `CountrySubdivision` | Edm.String · filterable · 591,582 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `PostalCity` | Edm.String · lookup 20098 (RLS 65) · filterable · 591,064 · RLS | `listings.raw_data.PostalCity (RAW_DATA_KEEP_FIELDS)` `listings.address.PostalCity (pick → address)` | — | — | S+R | — | `app/api/crm/listings/[id]/route.ts:395` `lib/buildings/upsert.ts:200` `lib/buildings/upsert.ts:419` | 4 | **PARTIAL** — not searchable · not displayed |
| `UnitNumber` | Edm.String · filterable · 582,428 · RLS | `listings.raw_data.UnitNumber (RAW_DATA_KEEP_FIELDS)` `listings.address.UnitNumber (pick → address)` | `lib/search/listing-search-projection.ts:257` | `lib/search/canonical/field-registry.ts:123` | S+R | `lib/idx/db-to-public-dto.ts:373` `app/listing/[...slug]/page.tsx:369` `lib/search/crm-idx-mapper.ts:247` | `lib/open-houses/upcoming-open-houses.ts:180` `lib/open-houses/upcoming-open-houses.ts:306` `lib/buildings/public-building-data.ts:83` +23 | 45 | **COMPLETE** |
| `StreetSuffix` | Enums.StreetSuffix · StreetSuffix · lookup 298 (RLS 31) · filterable · 580,305 · RLS | `listings.raw_data.StreetSuffix (RAW_DATA_KEEP_FIELDS)` `listings.address.StreetSuffix (pick → address)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:369` `lib/search/crm-idx-mapper.ts:49` | `lib/open-houses/upcoming-open-houses.ts:178` `app/api/buildings/search/route.ts:104` `app/api/buildings/search/route.ts:769` +11 | 27 | **PARTIAL** — not searchable |
| `StreetNumberNumeric` | Edm.Int32 · filterable · 561,696 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `PostalCodePlus4` | Edm.String · filterable · 545,701 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `UniversalParcelId` | Edm.String · filterable · 545,161 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CrossStreet` | Edm.String · filterable · 396,743 · RLS | `listings.address.CrossStreet (pick → address)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:304` | `app/api/buildings/search/route.ts:788` `app/api/buildings/search/route.ts:900` `app/api/buildings/search/route.ts:901` +4 | 1 | **PARTIAL** — not searchable |
| `StreetAdditionalInfo` | Edm.String · filterable · 394,632 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ParcelNumber` | Edm.String · filterable · 380,705 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `StreetDirPrefix` | Enums.StreetDirection · StreetDirection · lookup 10 (RLS 4) · filterable · 266,957 · RLS | `listings.raw_data.StreetDirPrefix (RAW_DATA_KEEP_FIELDS)` `listings.address.StreetDirPrefix (pick → address)` | `lib/search/listing-search-projection.ts:257` | — | S+R | `lib/idx/db-to-public-dto.ts:366` `app/listing/[...slug]/page.tsx:368` `lib/search/crm-idx-mapper.ts:47` | `lib/open-houses/upcoming-open-houses.ts:176` `app/api/buildings/search/route.ts:102` `app/api/buildings/search/route.ts:769` +11 | 27 | **COMPLETE** |
| `TaxLot` | Edm.String · filterable · 266,897 · RLS | `listings.features.TaxLot (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:791` `app/api/buildings/search/route.ts:918` `app/api/buildings/search/route.ts:610` +1 | 9 | **PARTIAL** — not searchable · not displayed |
| `BuildingName` | Edm.String · filterable · 221,140 · RLS | `listings.raw_data.BuildingName (RAW_DATA_KEEP_FIELDS)` `listings.features.BuildingName (pick → features)` | `lib/search/listing-search-projection.ts:257` | `lib/search/canonical/field-registry.ts:127` | S+R | `lib/idx/db-to-public-dto.ts:578` `lib/search/crm-idx-mapper.ts:280` | `lib/buildings/public-building-data.ts:86` `lib/buildings/public-building-data.ts:163` `app/api/buildings/search/route.ts:649` +15 | 12 | **COMPLETE** |
| `ZoningDescription` | Edm.String · filterable · 27,455 · RLS | `listings.features.ZoningDescription (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:793` `app/api/buildings/search/route.ts:923` `app/api/buildings/search/route.ts:615` +1 | — | **PARTIAL** — not searchable · not displayed |
| `StreetDirSuffix` | Enums.StreetDirection · StreetDirection · lookup 10 (RLS 5) · filterable · 13,415 · RLS | `listings.address.StreetDirSuffix (pick → address)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:370` `lib/search/crm-idx-mapper.ts:50` | `lib/open-houses/upcoming-open-houses.ts:179` `app/api/crm/listings/[id]/route.ts:389` `lib/comps/fetch-comps.ts:72` +5 | 4 | **PARTIAL** — not searchable |
| `AdditionalParcelsDescription` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AdditionalParcelsYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CarrierRoute` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ContinentRegion` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Country` | Enums.Country · Country · lookup 246 (RLS 1) · SUPPRESSED · 0 / 0 Active · RLS | `listings.address.Country (pick → address)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `CountryRegion` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `Directions` | Edm.String · filterable · 0 · not RLS | `listings.address.Directions (pick → address)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `Elevation` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ElevationUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Latitude` | Edm.Decimal · SUPPRESSED · 0 / 0 Active · RLS | `listings.address.Latitude (pick → address)` | `lib/search/listing-search-projection.ts:473` | — | S+R | `lib/idx/db-to-public-dto.ts:523` `lib/idx/db-to-public-dto.ts:524` `lib/search/crm-idx-mapper.ts:302` | `lib/buildings/upsert.ts:201` `lib/buildings/upsert.ts:420` | 8 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `Longitude` | Edm.Decimal · SUPPRESSED · 0 / 0 Active · RLS | `listings.address.Longitude (pick → address)` | `lib/search/listing-search-projection.ts:474` | — | S+R | `lib/idx/db-to-public-dto.ts:527` `lib/idx/db-to-public-dto.ts:528` `lib/search/crm-idx-mapper.ts:303` | `lib/buildings/upsert.ts:202` `lib/buildings/upsert.ts:421` | 8 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `MapCoordinate` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | `listings.address.MapCoordinate (pick → address)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `MapCoordinateSource` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MapURL` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MLSAreaMajor` | Edm.String · lookup 1 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | `listings.raw_data.MLSAreaMajor (RAW_DATA_KEEP_FIELDS)` | — | — | — | — | — | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MLSAreaMinor` | Edm.String · lookup 1 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ParcelSubcomponent` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PublicSurveyRange` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `PublicSurveySection` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PublicSurveyTownship` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `StateRegion` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `StreetSuffixModifier` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxMapNumber` | Edm.String · filterable · 0 · not RLS | `listings.features.TaxMapNumber (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `Township` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `X_GeocodeSource` | Enums.GeocodeSource · GeocodeSource · lookup 10 (RLS 4) · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `Zoning` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Identity, status & dates — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.ListingId`, `listings.features.ListingKey`, `listings.features.ListingKeyNumeric`, `listings.features.MajorChangeTimestamp`, `listings.features.MajorChangeType`, `listings.features.OriginatingSystemID`, `listings.features.OriginatingSystemKey`, `listings.features.OriginatingSystemName`, `listings.idx_display_yn`, `listings.internet_address_display_yn` +20 · projection: `lib/search/listing-search-projection.ts` · criterion: `app/api/idx/search/route.ts`, `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts`, `lib/search/canonical/live-truth.ts`, `lib/search/engine/criteria.ts`, `lib/search/engine/provider-query.ts` +2 · DTO/card: `app/listing/[...slug]/page.tsx`, `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts`, `lib/search/engine/hydrate.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/clients/[id]/actions/route.ts`, `app/api/crm/clients/[id]/buyer-priorities/route.ts`, `app/api/crm/clients/[id]/route.ts`, `app/api/crm/compliance/audit/route.ts`, `app/api/crm/convert/route.ts` +38 · tests: 113 file(s) · **populated but NOT in the sync $select (never persisted): `CLIP`, `HumanModifiedYN`, `OnMarketTimestamp`, `OriginatingSystemCoListAgent2MemberKey`, `OriginatingSystemCoListAgent3MemberKey`, `OriginatingSystemCoListAgentMemberKey`, `OriginatingSystemCoListOfficeKey`, `OriginatingSystemListAgentMemberKey`, `OriginatingSystemListOfficeKey`, `OriginatingSystemModificationTimestamp`, `OriginatingSystemSubName`, `RecordSignature` +2** · populated but not in the runtime $select: `BackOnMarketDate`, `BackOnMarketTimestamp`, `CLIP`, `ContractStatusChangeDate`, `HumanModifiedYN`, `ListingURL`, `MajorChangeTimestamp`, `MajorChangeType`, `OffMarketDate`, `OffMarketTimestamp`, `OnMarketTimestamp`, `OriginalEntryTimestamp` +18

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `ContractStatusChangeDate` | Edm.Date · filterable · 591,607 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `HumanModifiedYN` | Edm.Boolean · filterable · 591,607 · not RLS | — | — | — | — | — | — | 1 | **MISSING** |
| `ListingAgreement` | Enums.ListingAgreement · ListingAgreement · lookup 11 (RLS 6) · filterable · 591,607 · RLS | `listings.raw_data.ListingAgreement (RAW_DATA_KEEP_FIELDS)` | — | — | S+R | `lib/search/engine/hydrate.ts:141` `lib/search/crm-idx-mapper.ts:283` `lib/search/crm-idx-mapper.ts:328` | `app/api/crm/listings/[id]/route.ts:156` | 9 | **PARTIAL** — not searchable |
| `ListingId` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.ListingId (RAW_DATA_KEEP_FIELDS)` `listings.listing_id (mapper dataflow → listing_id)` `listings.features.ListingId (pick → features)` | — | `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` `lib/search/engine/provider-query.ts:126` +9 | S+R | `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:284` `lib/search/crm-idx-mapper.ts:354` +13 | `lib/open-houses/upcoming-open-houses.ts:261` `lib/open-houses/upcoming-open-houses.ts:268` `lib/open-houses/upcoming-open-houses.ts:303` +102 | 52 | **COMPLETE** |
| `ListingKey` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.ListingKey (RAW_DATA_KEEP_FIELDS)` `listings.listing_id (mapper dataflow → listing_id)` `listings.mls_id (mapper dataflow → mls_id)` `listings.features.ListingKey (pick → features)` | `lib/search/listing-search-projection.ts:457` | `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` `lib/search/engine/universe.ts:147` +13 | S+R | `lib/search/engine/hydrate.ts:70` `lib/search/engine/hydrate.ts:156` `lib/search/engine/hydrate.ts:158` +11 | `lib/open-houses/upcoming-open-houses.ts:303` `lib/buildings/public-building-data.ts:81` `lib/buildings/public-building-data.ts:959` +96 | 57 | **COMPLETE** |
| `ListingKeyNumeric` | Edm.Int64 · filterable · 591,607 · RLS | `listings.features.ListingKeyNumeric (pick → features)` | — | — | S+R | — | — | 3 | **PARTIAL** — not searchable · not displayed |
| `MajorChangeTimestamp` | Edm.DateTimeOffset · filterable · 591,607 · RLS | `listings.features.MajorChangeTimestamp (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 591,607 · not RLS | `listings.raw_data.ModificationTimestamp (RAW_DATA_KEEP_FIELDS)` `listings.modification_timestamp (mapper dataflow → modification_timestamp)` | — | `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150` `lib/search/public-listing-db.ts:328` +3 | S+R | `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292` | `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` `lib/cma/engine.ts:113` +7 | 51 | **COMPLETE** |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 591,607 · RLS | — | — | — | S | — | — | 1 | **MISSING** |
| `OriginatingSystemKey` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.OriginatingSystemKey (RAW_DATA_KEEP_FIELDS)` `listings.features.OriginatingSystemKey (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OriginatingSystemModificationTimestamp` | Edm.DateTimeOffset · filterable · 591,607 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 591,607 · RLS | `listings.raw_data.OriginatingSystemName (RAW_DATA_KEEP_FIELDS)` `listings.features.OriginatingSystemName (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 591,607 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 591,607 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 591,607 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `StandardStatus` | Enums.StandardStatus · StandardStatus · lookup 11 (RLS 9) · filterable · 591,607 · RLS | `listings.raw_data.StandardStatus (RAW_DATA_KEEP_FIELDS)` `listings.status (mapper dataflow → status)` `listings.idx_display_yn (mapper dataflow → idx_display_yn)` `listings.internet_entire_listing_display_yn (mapper dataflow → internet_entire_listing_display_yn)` `listings.internet_address_display_yn (mapper dataflow → internet_address_display_yn)` `listings.internet_automated_valuation_display_yn (mapper dataflow → internet_automated_valuation_display_yn)` `listings.internet_consumer_comment_yn (mapper dataflow → internet_consumer_comment_yn)` | — | `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` `lib/search/engine/criteria.ts:165` +14 | S+R | `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:173` `lib/search/engine/hydrate.ts:158` +4 | `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:933` `lib/buildings/public-building-data.ts:936` +81 | 61 | **COMPLETE** |
| `StatusChangeTimestamp` | Edm.DateTimeOffset · filterable · 591,419 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `OriginatingSystemListOfficeKey` | Edm.String · filterable · 589,675 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `MajorChangeType` | Enums.ChangeType · ChangeType · lookup 14 (RLS 13) · filterable · 588,497 · RLS | `listings.features.MajorChangeType (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OriginatingSystemListAgentMemberKey` | Edm.String · filterable · 587,646 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListingURL` | Edm.String · filterable · 582,804 · not RLS | — | — | — | S | — | — | 1 | **MISSING** |
| `ListingContractDate` | Edm.Date · filterable · 581,836 · RLS | `listings.raw_data.ListingContractDate (RAW_DATA_KEEP_FIELDS)` `listings.listing_contract_date (mapper dataflow → listing_contract_date)` | — | `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:149` `lib/search/canonical/field-registry.ts:151` +4 | S+R | `lib/search/crm-idx-mapper.ts:288` `lib/search/crm-idx-mapper.ts:289` `lib/search/crm-idx-mapper.ts:316` +1 | `app/api/crm/convert/route.ts:225` `app/api/crm/listings/route.ts:127` `app/api/crm/listings/route.ts:545` +1 | 11 | **COMPLETE** |
| `OffMarketTimestamp` | Edm.DateTimeOffset · filterable · 579,587 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `OffMarketDate` | Edm.Date · filterable · 578,868 · RLS | `listings.raw_data.OffMarketDate (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | — | 1 | **PARTIAL** — not searchable · not displayed |
| `CloseDate` | Edm.Date · filterable · 578,417 · RLS | `listings.raw_data.CloseDate (RAW_DATA_KEEP_FIELDS)` | — | `lib/search/canonical/field-registry.ts:145` | S+R | `lib/idx/db-to-public-dto.ts:573` `lib/search/crm-idx-mapper.ts:315` | `lib/buildings/public-building-data.ts:84` `lib/buildings/public-building-data.ts:1037` `lib/comps/fetch-comps.ts:82` +7 | 10 | **COMPLETE** |
| `OriginatingSystemID` | Edm.String · filterable · 546,550 · RLS | `listings.features.OriginatingSystemID (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `CLIP` | Edm.Int64 · filterable · 539,492 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `UniversalPropertyId` | Edm.String · filterable · 380,699 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `OnMarketTimestamp` | Edm.DateTimeOffset · filterable · 265,702 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `OriginatingSystemCoListAgentMemberKey` | Edm.String · filterable · 207,472 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `PurchaseContractDate` | Edm.Date · filterable · 179,612 · RLS | — | — | — | S | — | — | 1 | **MISSING** |
| `PendingTimestamp` | Edm.DateTimeOffset · filterable · 143,221 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `OnMarketDate` | Edm.Date · filterable · 119,571 · RLS | `listings.raw_data.OnMarketDate (RAW_DATA_KEEP_FIELDS)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:572` `lib/search/crm-idx-mapper.ts:225` | `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` | 6 | **PARTIAL** — not searchable |
| `OriginatingSystemCoListAgent2MemberKey` | Edm.String · filterable · 50,998 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `ActivationDate` | Edm.Date · filterable · 46,105 · RLS | `listings.raw_data.ActivationDate (RAW_DATA_KEEP_FIELDS)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:409` `lib/search/crm-idx-mapper.ts:225` | `app/api/crm/listings/[id]/route.ts:200` `app/api/crm/listings/[id]/status/route.ts:198` | 7 | **PARTIAL** — not searchable |
| `OriginatingSystemCoListOfficeKey` | Edm.String · filterable · 21,227 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `OriginatingSystemCoListAgent3MemberKey` | Edm.String · filterable · 7,993 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `BackOnMarketDate` | Edm.Date · filterable · 4,354 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `BackOnMarketTimestamp` | Edm.DateTimeOffset · filterable · 4,353 · not RLS | — | — | — | S | — | — | — | **MISSING** |
| `WithdrawnDate` | Edm.Date · filterable · 22 · RLS | — | — | — | S | — | — | 1 | **MISSING** |
| `CancellationDate` | Edm.Date · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CompSaleYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Contingency` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ContingentDate` | Edm.Date · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CumulativeDaysOnMarket` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.CumulativeDaysOnMarket (RAW_DATA_KEEP_FIELDS)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:609` `lib/search/crm-idx-mapper.ts:287` | `lib/market-report/generator.ts:170` `lib/market-report/generator.ts:217` | 4 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `DaysOnMarket` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.DaysOnMarket (RAW_DATA_KEEP_FIELDS)` | — | `lib/search/canonical/field-registry.ts:150` | S+R | `lib/idx/db-to-public-dto.ts:608` `lib/search/crm-idx-mapper.ts:286` | `lib/market-report/generator.ts:170` `lib/market-report/generator.ts:217` `lib/market-report/generator.ts:245` +1 | 4 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `DaysOnMarketReplication` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DaysOnMarketReplicationDate` | Edm.Date · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DaysOnMarketReplicationIncreasingYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DelayedMarketingDate` | Edm.Date · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `DelayedMarketingYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `EstimatedCloseDate` | Edm.Date · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ExpirationDate` | Edm.Date · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.ExpirationDate (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | `app/api/crm/listings/reset-sync/route.ts:146` `app/api/crm/listings/reset-sync/route.ts:155` | 5 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `ListingService` | Enums.ListingService · ListingService · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListingURLDescription` | Enums.ListingURLDescription · ListingURLDescription · lookup 7 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MlsStatus` | Enums.MlsStatus · MlsStatus · lookup 26 (RLS 9) · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.MlsStatus (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:459` | `lib/search/canonical/field-registry.ts:136` | S+R | `lib/search/crm-idx-mapper.ts:173` | `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:933` `lib/buildings/public-building-data.ts:936` +1 | 26 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `OriginatingSystemBuyerAgentMemberKey` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OriginatingSystemBuyerOfficeKey` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OriginatingSystemBuyerTeamKey` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OriginatingSystemCoBuyerAgentMemberKey` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OriginatingSystemCoBuyerOfficeKey` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OriginatingSystemCoListOffice2Key` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OriginatingSystemListTeamKey` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PreviousStandardStatus` | Enums.StandardStatus · StandardStatus · lookup 11 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | `listings.features.PreviousStandardStatus (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `SaleOrLeaseIndicator` | Enums.SaleOrLeaseIndicator · SaleOrLeaseIndicator · lookup 6 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SourceSystemKey` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.SourceSystemKey (RAW_DATA_KEEP_FIELDS)` `listings.features.SourceSystemKey (pick → features)` | `lib/search/listing-search-projection.ts:458` | — | S+R | `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:285` `lib/search/crm-idx-mapper.ts:354` | `lib/buildings/public-building-data.ts:81` | 9 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `SourceSystemName` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | `listings.features.SourceSystemName (pick → features)` | — | `lib/search/canonical/field-registry.ts:117` | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `UniversalPropertySubId` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |

### Laundry — **COMPLETE**

Impact chain (populated fields only) — persistence: `listings.features.LaundryFeatures`, `listings.raw_data.LaundryFeatures` · projection: `lib/search/types.ts` · amenity map keys: `laundry-room` · criterion: — · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/listings/[id]/route.ts`, `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts` · tests: 3 file(s)

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `LaundryFeatures` | Enums.Multi.LaundryFeatures · LaundryFeatures (multi) · lookup 50 (RLS 38) · filterable · 393,328 / 7,599 Active · RLS | `listings.raw_data.LaundryFeatures (RAW_DATA_KEEP_FIELDS)` `listings.features.LaundryFeatures (pick → features)` | `lib/search/types.ts:123` map: laundry-room: LaundryRoom|OnCommonFloor|CommonOnFloor|CommonArea | — | S+R | `lib/idx/db-to-public-dto.ts:585` `lib/search/crm-idx-mapper.ts:341` | `lib/buildings/public-building-data.ts:94` `lib/buildings/public-building-data.ts:192` `app/api/buildings/search/route.ts:430` +4 | 3 | **COMPLETE** |

### Parking — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.AttachedGarageYN`, `listings.features.CarportSpaces`, `listings.features.CarportYN`, `listings.features.GarageSpaces`, `listings.features.GarageYN`, `listings.features.OpenParkingSpaces`, `listings.features.OpenParkingYN`, `listings.features.ParkingFeatures`, `listings.features.ParkingTotal`, `listings.raw_data.ParkingFeatures` · projection: `lib/search/types.ts` · amenity map keys: `garage` · criterion: `lib/search/canonical/field-registry.ts` · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/listings/[id]/route.ts`, `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts` · tests: 7 file(s) · populated but not in the runtime $select: `AttachedGarageYN`, `CarportSpaces`, `CarportYN`, `GarageSpaces`, `OpenParkingSpaces`, `OpenParkingYN`, `ParkingFeatures`, `ParkingTotal`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `GarageYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 547,220 · RLS | `listings.features.GarageYN (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:331` | `app/api/buildings/search/route.ts:424` `app/api/buildings/search/route.ts:798` `lib/buildings/upsert.ts:267` | 6 | **PARTIAL** — not searchable |
| `GarageSpaces` | Edm.Decimal · filterable · 66,660 · not RLS | `listings.features.GarageSpaces (pick → features)` | — | — | S | — | `lib/buildings/public-building-data.ts:95` `lib/buildings/public-building-data.ts:173` `app/api/buildings/search/route.ts:426` +2 | 1 | **PARTIAL** — not searchable · not displayed |
| `AttachedGarageYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 21,379 · RLS | `listings.features.AttachedGarageYN (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:425` `app/api/buildings/search/route.ts:798` | 1 | **PARTIAL** — not searchable · not displayed |
| `ParkingFeatures` | Enums.Multi.ParkingFeatures · ParkingFeatures (multi) · lookup 204 (RLS 54) · filterable · 10,376 / 768 Active · RLS | `listings.raw_data.ParkingFeatures (RAW_DATA_KEEP_FIELDS)` `listings.features.ParkingFeatures (pick → features)` | `lib/search/types.ts:134` map: garage: Garage | `lib/search/canonical/field-registry.ts:183` | S | `lib/idx/db-to-public-dto.ts:590` | `lib/buildings/public-building-data.ts:95` `lib/buildings/public-building-data.ts:193` `app/api/buildings/search/route.ts:357` +4 | 2 | **COMPLETE** |
| `ParkingTotal` | Edm.Decimal · filterable · 237 · not RLS | `listings.features.ParkingTotal (pick → features)` | — | — | S | — | `lib/buildings/public-building-data.ts:95` `lib/buildings/public-building-data.ts:174` `lib/buildings/upsert.ts:264` | — | **PARTIAL** — not searchable · not displayed |
| `CarportYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 144 · not RLS | `listings.features.CarportYN (pick → features)` | — | — | S | — | — | 2 | **PARTIAL** — not searchable · not displayed |
| `OpenParkingYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 126 · not RLS | `listings.features.OpenParkingYN (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OpenParkingSpaces` | Edm.Decimal · filterable · 16 · not RLS | `listings.features.OpenParkingSpaces (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:427` `app/api/buildings/search/route.ts:799` `lib/buildings/upsert.ts:266` | 1 | **PARTIAL** — not searchable · not displayed |
| `CarportSpaces` | Edm.Decimal · filterable · 5 · not RLS | `listings.features.CarportSpaces (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:265` | 1 | **PARTIAL** — not searchable · not displayed |
| `CoveredSpaces` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | `app/api/buildings/search/route.ts:428` `app/api/buildings/search/route.ts:799` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OtherParking` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RVParkingDimensions` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |

### Permissions & display gates — **COMPLETE**

Impact chain (populated fields only) — persistence: `listings.idx_display_yn`, `listings.internet_address_display_yn`, `listings.internet_automated_valuation_display_yn`, `listings.internet_consumer_comment_yn`, `listings.internet_entire_listing_display_yn`, `listings.participant_only`, `listings.raw_data.InternetAutomatedValuationDisplayYN`, `listings.raw_data.InternetConsumerCommentYN`, `listings.raw_data.Permission` · projection: — · criterion: `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts`, `lib/search/canonical/live-truth.ts` · DTO/card: `app/listing/[...slug]/page.tsx`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `app/api/crm/compliance/audit/route.ts`, `app/api/crm/convert/route.ts`, `app/api/crm/listing-sends/route.ts`, `app/api/crm/listings/[id]/route.ts`, `app/api/crm/listings/[id]/status/route.ts`, `app/api/crm/listings/reset-sync/route.ts` +7 · tests: 28 file(s) · populated but not in the runtime $select: `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `InternetAutomatedValuationDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 591,607 · RLS | `listings.raw_data.InternetAutomatedValuationDisplayYN (RAW_DATA_KEEP_FIELDS)` `listings.idx_display_yn (mapper dataflow → idx_display_yn)` `listings.internet_entire_listing_display_yn (mapper dataflow → internet_entire_listing_display_yn)` `listings.internet_address_display_yn (mapper dataflow → internet_address_display_yn)` `listings.internet_automated_valuation_display_yn (mapper dataflow → internet_automated_valuation_display_yn)` `listings.internet_consumer_comment_yn (mapper dataflow → internet_consumer_comment_yn)` | — | `app/api/listings/route.ts:385` `app/api/listings/route.ts:1360` `app/api/listings/route.ts:386` +3 | S | `lib/search/crm-idx-mapper.ts:81` `app/listing/[...slug]/page.tsx:478` `app/listing/[...slug]/page.tsx:477` +1 | `lib/buildings/public-building-data.ts:493` `app/api/crm/compliance/audit/route.ts:43` `app/api/crm/convert/route.ts:228` +36 | 7 | **COMPLETE** |
| `InternetConsumerCommentYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 591,607 · RLS | `listings.raw_data.InternetConsumerCommentYN (RAW_DATA_KEEP_FIELDS)` `listings.idx_display_yn (mapper dataflow → idx_display_yn)` `listings.internet_entire_listing_display_yn (mapper dataflow → internet_entire_listing_display_yn)` `listings.internet_address_display_yn (mapper dataflow → internet_address_display_yn)` `listings.internet_automated_valuation_display_yn (mapper dataflow → internet_automated_valuation_display_yn)` `listings.internet_consumer_comment_yn (mapper dataflow → internet_consumer_comment_yn)` | — | `app/api/listings/route.ts:385` `app/api/listings/route.ts:1360` `app/api/listings/route.ts:386` +3 | S | `lib/search/crm-idx-mapper.ts:82` `app/listing/[...slug]/page.tsx:478` `app/listing/[...slug]/page.tsx:477` +1 | `lib/buildings/public-building-data.ts:493` `app/api/crm/compliance/audit/route.ts:43` `app/api/crm/convert/route.ts:228` +36 | 5 | **COMPLETE** |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 3) · filterable · 591,607 · RLS | `listings.raw_data.Permission (RAW_DATA_KEEP_FIELDS)` `listings.idx_display_yn (mapper dataflow → idx_display_yn)` `listings.internet_entire_listing_display_yn (mapper dataflow → internet_entire_listing_display_yn)` `listings.internet_address_display_yn (mapper dataflow → internet_address_display_yn)` `listings.internet_automated_valuation_display_yn (mapper dataflow → internet_automated_valuation_display_yn)` `listings.internet_consumer_comment_yn (mapper dataflow → internet_consumer_comment_yn)` `listings.participant_only (mapper dataflow → participant_only)` | — | `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198` `app/api/listings/route.ts:385` +7 | S+R | `app/listing/[...slug]/page.tsx:478` `app/listing/[...slug]/page.tsx:477` `app/listing/[...slug]/page.tsx:476` | `lib/buildings/public-building-data.ts:493` `app/api/crm/compliance/audit/route.ts:43` `app/api/crm/convert/route.ts:228` +48 | 25 | **COMPLETE** |
| `AttributionContact` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `InternetAddressDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.InternetAddressDisplayYN (RAW_DATA_KEEP_FIELDS)` `listings.idx_display_yn (mapper dataflow → idx_display_yn)` `listings.internet_entire_listing_display_yn (mapper dataflow → internet_entire_listing_display_yn)` `listings.internet_address_display_yn (mapper dataflow → internet_address_display_yn)` `listings.internet_automated_valuation_display_yn (mapper dataflow → internet_automated_valuation_display_yn)` `listings.internet_consumer_comment_yn (mapper dataflow → internet_consumer_comment_yn)` | — | `app/api/listings/route.ts:385` `app/api/listings/route.ts:1360` `app/api/listings/route.ts:386` +3 | S+R | `lib/search/crm-idx-mapper.ts:80` `app/listing/[...slug]/page.tsx:478` `app/listing/[...slug]/page.tsx:477` +1 | `app/api/crm/listings/[id]/route.ts:324` `lib/buildings/public-building-data.ts:493` `app/api/crm/compliance/audit/route.ts:43` +36 | 33 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `InternetEntireListingDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.InternetEntireListingDisplayYN (RAW_DATA_KEEP_FIELDS)` `listings.idx_display_yn (mapper dataflow → idx_display_yn)` `listings.internet_entire_listing_display_yn (mapper dataflow → internet_entire_listing_display_yn)` `listings.internet_address_display_yn (mapper dataflow → internet_address_display_yn)` `listings.internet_automated_valuation_display_yn (mapper dataflow → internet_automated_valuation_display_yn)` `listings.internet_consumer_comment_yn (mapper dataflow → internet_consumer_comment_yn)` | — | `app/api/listings/route.ts:385` `app/api/listings/route.ts:1360` `app/api/listings/route.ts:386` +3 | S+R | `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:87` `app/listing/[...slug]/page.tsx:478` +2 | `app/api/crm/listings/[id]/route.ts:323` `lib/buildings/public-building-data.ts:493` `app/api/crm/compliance/audit/route.ts:43` +36 | 33 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `SourceMlsUrl` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · filterable · 0 · not RLS | `listings.raw_data.SyndicateTo (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | — | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `SyndicationRemarks` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | S | — | `app/api/crm/listings/route.ts:377` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |

### Pets — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.PetsAllowed`, `listings.raw_data.PetsAllowed` · projection: `lib/search/listing-search-projection.ts`, `lib/search/types.ts` · amenity map keys: `pet-friendly` · criterion: `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts`, `lib/search/public-listing-db.ts` · DTO/card: `lib/idx/db-to-public-dto.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/listings/[id]/route.ts`, `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts` · tests: 16 file(s) · **populated but NOT in the sync $select (never persisted): `PetsComments`** · populated but not in the runtime $select: `PetsComments`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `PetsComments` | Edm.String · filterable · 591,607 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `PetsAllowed` | Enums.Multi.PetsAllowed · PetsAllowed (multi) · lookup 31 (RLS 14) · filterable · 586,565 / 7,601 Active · RLS | `listings.raw_data.PetsAllowed (RAW_DATA_KEEP_FIELDS)` `listings.features.PetsAllowed (pick → features)` | `lib/search/types.ts:136` `lib/search/listing-search-projection.ts:406` map: pet-friendly: UnitYes|CatsOk|DogsOk|NumberLimit|SizeLimit|BreedRestrictions | `lib/search/canonical/field-registry.ts:186` `lib/search/public-listing-db.ts:426` `app/api/listings/route.ts:827` | S+R | `lib/idx/db-to-public-dto.ts:596` `lib/idx/db-to-public-dto.ts:597` | `lib/buildings/public-building-data.ts:102` `lib/buildings/public-building-data.ts:196` `app/api/buildings/search/route.ts:432` +4 | 16 | **COMPLETE** |
| `MaximumNumberOfPets` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MaximumPetWeight` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PetDeposit` | Edm.Decimal · filterable · 0 · not RLS | `listings.features.PetDeposit (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `PetsAllowedYN` | Edm.Boolean · lookup 2 (RLS 1) · filterable · 0 · not RLS | — | — | — | R | `lib/search/crm-idx-mapper.ts:347` | `app/api/buildings/search/route.ts:436` `app/api/buildings/search/route.ts:800` | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Pools & spa — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.PoolFeatures`, `listings.features.SpaFeatures`, `listings.features.SpaYN` · projection: — · criterion: — · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts` · tests: 0 file(s) · **populated but NOT in the sync $select (never persisted): `PoolExpense`** · populated but not in the runtime $select: `PoolExpense`, `SpaFeatures`, `SpaYN`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `PoolFeatures` | Enums.Multi.PoolFeatures · PoolFeatures (multi) · lookup 88 (RLS 43) · filterable · 10,669 / 3,927 Active · not RLS | `listings.features.PoolFeatures (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:591` `lib/search/crm-idx-mapper.ts:343` | `lib/buildings/public-building-data.ts:94` `lib/buildings/public-building-data.ts:190` `lib/buildings/upsert.ts:233` | — | **PARTIAL** — not searchable |
| `SpaFeatures` | Enums.Multi.SpaFeatures · SpaFeatures (multi) · lookup 24 (RLS 1) · filterable · 5,639 / 694 Active · RLS | `listings.features.SpaFeatures (pick → features)` | — | — | S | `lib/idx/db-to-public-dto.ts:592` | `lib/buildings/public-building-data.ts:94` `lib/buildings/public-building-data.ts:191` `lib/buildings/upsert.ts:234` | — | **PARTIAL** — not searchable |
| `SpaYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 2,208 · not RLS | `listings.features.SpaYN (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `PoolExpense` | Edm.Decimal · filterable · 8 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `PoolPrivateYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | `listings.features.PoolPrivateYN (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |

### Pricing — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.list_price`, `listings.raw_data.ClosePrice`, `listings.raw_data.ListPrice`, `listings.raw_data.OriginalListPrice`, `listings.raw_data.PreviousListPrice` · projection: — · criterion: `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts`, `lib/search/engine/provider-query.ts`, `lib/search/engine/universe.ts`, `lib/search/public-listing-db.ts` · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts`, `lib/search/engine/hydrate.ts` · workspace/report/CMA: `app/api/crm/clients/[id]/route.ts`, `app/api/crm/convert/route.ts`, `app/api/crm/lease-tracker/route.ts`, `app/api/crm/listing-sends/route.ts`, `app/api/crm/listings/[id]/route.ts`, `app/api/crm/listings/[id]/status/route.ts` +19 · tests: 47 file(s) · **populated but NOT in the sync $select (never persisted): `CurrentPrice`, `PriceChangeTimestamp`** · populated but not in the runtime $select: `CurrentPrice`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `CurrentPrice` | Edm.Decimal · filterable · 591,607 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `ListPrice` | Edm.Decimal · filterable · 591,607 · RLS | `listings.raw_data.ListPrice (RAW_DATA_KEEP_FIELDS)` `listings.list_price (mapper dataflow → list_price)` | — | `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:148` `lib/search/canonical/field-registry.ts:139` +14 | S+R | `lib/search/crm-idx-mapper.ts:57` `lib/search/engine/hydrate.ts:158` | `lib/buildings/public-building-data.ts:81` `lib/buildings/public-building-data.ts:968` `lib/buildings/public-building-data.ts:1032` +36 | 43 | **COMPLETE** |
| `ClosePrice` | Edm.Decimal · filterable · 508,931 · RLS | `listings.raw_data.ClosePrice (RAW_DATA_KEEP_FIELDS)` | — | `lib/search/canonical/field-registry.ts:144` | S+R | `lib/idx/db-to-public-dto.ts:534` | `lib/buildings/public-building-data.ts:81` `lib/buildings/public-building-data.ts:1032` `app/api/crm/listings/[id]/status/route.ts:162` +12 | 6 | **COMPLETE** |
| `OriginalListPrice` | Edm.Decimal · filterable · 375,691 · RLS | `listings.raw_data.OriginalListPrice (RAW_DATA_KEEP_FIELDS)` | — | `lib/search/canonical/field-registry.ts:140` | S+R | `lib/search/engine/hydrate.ts:140` `lib/idx/db-to-public-dto.ts:532` `lib/search/crm-idx-mapper.ts:154` | `lib/market-report/generator.ts:168` | 7 | **COMPLETE** |
| `PriceChangeTimestamp` | Edm.DateTimeOffset · filterable · 361,678 · RLS | — | — | — | R | `lib/search/crm-idx-mapper.ts:352` | — | — | **MISSING** |
| `PreviousListPrice` | Edm.Decimal · filterable · 219,895 · RLS | `listings.raw_data.PreviousListPrice (RAW_DATA_KEEP_FIELDS)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:533` | — | 2 | **PARTIAL** — not searchable |
| `ListPriceLow` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Remarks & disclosures — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.raw_data.PublicRemarks` · projection: `lib/search/listing-search-projection.ts` · criterion: `app/api/listings/route.ts`, `lib/search/public-listing-db.ts` · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `app/api/crm/compliance/audit/route.ts`, `app/api/crm/listings/[id]/route.ts`, `app/api/crm/listings/route.ts`, `app/api/open-houses/route.ts` · tests: 23 file(s) · **populated but NOT in the sync $select (never persisted): `Exclusions`, `HomeWarrantyYN`, `Inclusions`** · populated but not in the runtime $select: `Exclusions`, `HomeWarrantyYN`, `Inclusions`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `PublicRemarks` | Edm.String · filterable · 579,433 · not RLS | `listings.raw_data.PublicRemarks (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:254` | `lib/search/public-listing-db.ts:455` `app/api/listings/route.ts:859` | S+R | `lib/idx/db-to-public-dto.ts:565` `lib/idx/db-to-public-dto.ts:566` `lib/search/crm-idx-mapper.ts:306` | `app/api/crm/listings/route.ts:374` `app/api/crm/listings/[id]/route.ts:419` `app/api/open-houses/route.ts:271` +2 | 23 | **COMPLETE** |
| `Inclusions` | Edm.String · filterable · 111,868 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `Exclusions` | Edm.String · filterable · 111,787 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `HomeWarrantyYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 6 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `CopyrightNotice` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | `listings.features.CopyrightNotice (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `Disclaimer` | Edm.String · filterable · 0 · not RLS | `listings.features.Disclaimer (pick → features)` | — | — | S | — | — | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `Disclosures` | Enums.Multi.Disclosures · Disclosures (multi) · lookup 119 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `HabitableResidenceYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Ownership` | Edm.String · filterable · 0 · not RLS | — | — | `lib/search/canonical/field-registry.ts:167` | — | — | — | 5 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Possession` | Enums.Multi.Possession · Possession (multi) · lookup 39 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PrivateOfficeRemarks` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `PrivateRemarks` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.PrivateRemarks (RAW_DATA_KEEP_FIELDS)` | — | — | S | — | `app/api/crm/listings/route.ts:376` `app/api/crm/listings/[id]/route.ts:419` | 6 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `SignOnPropertyYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SpecialLicenses` | Enums.Multi.SpecialLicenses · SpecialLicenses (multi) · lookup 19 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Rental & financial — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.AssociationFee`, `listings.features.AssociationFee2`, `listings.features.AssociationFee2Frequency`, `listings.features.AssociationFeeFrequency`, `listings.features.AssociationFeeIncludes`, `listings.features.AssociationName`, `listings.features.AssociationYN`, `listings.features.AvailabilityDate`, `listings.features.CapRate`, `listings.features.ElectricExpense` +35 · projection: `lib/search/types.ts` · criterion: `lib/search/canonical/field-registry.ts` · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/idx/public-dto.ts`, `lib/search/crm-idx-mapper.ts`, `lib/search/engine/hydrate.ts` · workspace/report/CMA: `app/api/buildings/search/route.ts`, `app/api/crm/listings/[id]/route.ts`, `app/api/crm/listings/[id]/status/route.ts`, `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts`, `lib/market-report/generator.ts` · tests: 30 file(s) · **populated but NOT in the sync $select (never persisted): `BuyerFinancing`, `CableTvExpense`, `Electric`, `LicensesExpense`, `OwnerPays`** · populated but not in the runtime $select: `AssociationFee2`, `AssociationFee2Frequency`, `AssociationFeeIncludes`, `AssociationName`, `AssociationYN`, `BuyerFinancing`, `CableTvExpense`, `CapRate`, `Electric`, `ElectricExpense`, `FuelExpense`, `GardenerExpense` +20

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `AvailabilityDate` | Edm.Date · filterable · 373,040 · RLS | `listings.raw_data.AvailabilityDate (RAW_DATA_KEEP_FIELDS)` `listings.features.AvailabilityDate (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:606` | — | 3 | **PARTIAL** — not searchable |
| `AssociationFee` | Edm.Decimal · filterable · 243,779 · RLS | `listings.raw_data.AssociationFee (RAW_DATA_KEEP_FIELDS)` `listings.features.AssociationFee (pick → features)` | — | `lib/search/canonical/field-registry.ts:161` | S+R | `lib/search/engine/hydrate.ts:136` `lib/idx/db-to-public-dto.ts:598` `lib/search/crm-idx-mapper.ts:69` | `lib/buildings/public-building-data.ts:108` `lib/buildings/public-building-data.ts:175` `app/api/buildings/search/route.ts:792` +7 | 9 | **COMPLETE** |
| `SecurityDeposit` | Edm.Decimal · filterable · 161,522 · RLS | `listings.features.SecurityDeposit (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `SpecialListingConditions` | Enums.Multi.SpecialListingConditions · SpecialListingConditions (multi) · lookup 34 (RLS 8) · filterable · 114,397 · RLS | `listings.features.SpecialListingConditions (pick → features)` | — | — | S | — | `app/api/crm/listings/[id]/route.ts:427` | 5 | **PARTIAL** — not searchable · not displayed |
| `TaxAnnualAmount` | Edm.Decimal · filterable · 97,625 · RLS | `listings.raw_data.TaxAnnualAmount (RAW_DATA_KEEP_FIELDS)` `listings.features.TaxAnnualAmount (pick → features)` | — | `lib/search/canonical/field-registry.ts:162` | S+R | `lib/search/engine/hydrate.ts:138` `lib/idx/db-to-public-dto.ts:600` `lib/search/crm-idx-mapper.ts:62` | `lib/buildings/public-building-data.ts:100` `lib/buildings/public-building-data.ts:172` `app/api/buildings/search/route.ts:791` +5 | 10 | **COMPLETE** |
| `AssociationFeeFrequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 4) · filterable · 81,884 · RLS | `listings.raw_data.AssociationFeeFrequency (RAW_DATA_KEEP_FIELDS)` `listings.features.AssociationFeeFrequency (pick → features)` | — | — | S+R | `lib/search/engine/hydrate.ts:137` `lib/idx/db-to-public-dto.ts:599` `lib/search/crm-idx-mapper.ts:70` | `lib/buildings/public-building-data.ts:108` `lib/buildings/public-building-data.ts:176` `app/api/buildings/search/route.ts:792` +4 | 8 | **PARTIAL** — not searchable |
| `LandLeaseYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 70,069 · RLS | `listings.features.LandLeaseYN (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:329` | — | — | **PARTIAL** — not searchable |
| `AssociationYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 40,139 · RLS | `listings.features.AssociationYN (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:444` `app/api/buildings/search/route.ts:808` | 1 | **PARTIAL** — not searchable · not displayed |
| `WaterSewerExpense` | Edm.Decimal · filterable · 10,392 · not RLS | `listings.features.WaterSewerExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OwnerPays` | Enums.Multi.OwnerPays · OwnerPays (multi) · lookup 39 (RLS 24) · filterable · 7,915 · RLS | — | `lib/search/types.ts:149` | — | R | `lib/search/crm-idx-mapper.ts:334` | — | 1 | **MISSING** |
| `AssociationFeeIncludes` | Enums.Multi.AssociationFeeIncludes · AssociationFeeIncludes (multi) · lookup 63 (RLS 14) · filterable · 4,552 · RLS | `listings.features.AssociationFeeIncludes (pick → features)` | — | — | S | — | `lib/buildings/public-building-data.ts:108` `lib/buildings/public-building-data.ts:199` `lib/buildings/upsert.ts:272` | 1 | **PARTIAL** — not searchable · not displayed |
| `MoveInCostsComments` | Edm.String · filterable · 381 · not RLS | `listings.raw_data.MoveInCostsComments (RAW_DATA_KEEP_FIELDS)` `listings.features.MoveInCostsComments (pick → features)` | — | — | S | `lib/idx/public-dto.ts:340` `lib/idx/public-dto.ts:341` | — | 7 | **PARTIAL** — not searchable |
| `MoveInCosts` | Enums.Multi.MoveInCosts · MoveInCosts (multi) · lookup 13 (RLS 13) · filterable · 375 · not RLS | `listings.raw_data.MoveInCosts (RAW_DATA_KEEP_FIELDS)` `listings.features.MoveInCosts (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:619` | `app/api/crm/listings/[id]/route.ts:424` | 4 | **PARTIAL** — not searchable |
| `LandLeaseExpirationDate` | Edm.Date · filterable · 325 · not RLS | `listings.features.LandLeaseExpirationDate (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `TenantPaysDescription` | Edm.String · filterable · 276 · not RLS | `listings.features.TenantPaysDescription (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:624` | — | — | **PARTIAL** — not searchable |
| `TenantPays` | Enums.Multi.TenantPays · TenantPays (multi) · lookup 61 (RLS 16) · filterable · 261 · not RLS | `listings.features.TenantPays (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:623` | `app/api/crm/listings/[id]/route.ts:424` | 1 | **PARTIAL** — not searchable |
| `NetOperatingIncome` | Edm.Decimal · filterable · 218 · not RLS | `listings.features.NetOperatingIncome (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `AssociationName` | Edm.String · filterable · 200 · not RLS | `listings.features.AssociationName (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:792` `app/api/buildings/search/route.ts:920` `lib/buildings/upsert.ts:277` +2 | 1 | **PARTIAL** — not searchable · not displayed |
| `BuyerFinancing` | Enums.Multi.BuyerFinancing · BuyerFinancing (multi) · lookup 42 (RLS 8) · filterable · 184 · not RLS | — | — | — | — | — | — | 1 | **MISSING** |
| `AssociationFee2Frequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 5) · filterable · 178 · not RLS | `listings.features.AssociationFee2Frequency (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `MoveInCostsAmount` | Edm.Decimal · filterable · 108 · not RLS | `listings.raw_data.MoveInCostsAmount (RAW_DATA_KEEP_FIELDS)` `listings.features.MoveInCostsAmount (pick → features)` | — | — | S | `lib/idx/public-dto.ts:331` `lib/idx/public-dto.ts:332` | `app/api/crm/listings/[id]/route.ts:234` `app/api/crm/listings/[id]/status/route.ts:178` | 8 | **PARTIAL** — not searchable |
| `AssociationFee2` | Edm.Decimal · filterable · 60 · not RLS | `listings.features.AssociationFee2 (pick → features)` | — | — | S | — | `app/api/buildings/search/route.ts:808` | 1 | **PARTIAL** — not searchable · not displayed |
| `CapRate` | Edm.Decimal · filterable · 44 · not RLS | `listings.features.CapRate (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OngoingFees` | Enums.Multi.OngoingFees · OngoingFees (multi) · lookup 5 (RLS 1) · filterable · 28 · not RLS | `listings.raw_data.OngoingFees (RAW_DATA_KEEP_FIELDS)` `listings.features.OngoingFees (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:622` | `app/api/crm/listings/[id]/route.ts:424` | 1 | **PARTIAL** — not searchable |
| `Electric` | Enums.Multi.Electric · Electric (multi) · lookup 46 (RLS 4) · filterable · 10 · not RLS | — | — | — | — | — | `lib/buildings/upsert.ts:247` | 1 | **MISSING** |
| `MaintenanceExpense` | Edm.Decimal · filterable · 10 · not RLS | `listings.features.MaintenanceExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `CableTvExpense` | Edm.Decimal · filterable · 8 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `ElectricExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.ElectricExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `FuelExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.FuelExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `GardenerExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.GardenerExpense (pick → features)` | — | — | S | — | — | 1 | **PARTIAL** — not searchable · not displayed |
| `InsuranceExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.InsuranceExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `LicensesExpense` | Edm.Decimal · filterable · 8 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `ManagerExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.ManagerExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `NewTaxesExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.NewTaxesExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OperatingExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.OperatingExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `OtherExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.OtherExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `PestControlExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.PestControlExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `ProfessionalManagementExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.ProfessionalManagementExpense (pick → features)` | — | — | S | — | `lib/buildings/upsert.ts:274` | — | **PARTIAL** — not searchable · not displayed |
| `SuppliesExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.SuppliesExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `TrashExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.TrashExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `WorkmansCompensationExpense` | Edm.Decimal · filterable · 8 · not RLS | `listings.features.WorkmansCompensationExpense (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `LandLeaseAmountFrequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 2) · filterable · 1 · not RLS | `listings.features.LandLeaseAmountFrequency (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `AssociationFee3` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AssociationFee3Frequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AssociationName2` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | `lib/buildings/upsert.ts:279` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AssociationName3` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AssociationPhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | `app/api/buildings/search/route.ts:445` `app/api/buildings/search/route.ts:808` `lib/buildings/upsert.ts:278` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AssociationPhone2` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | `lib/buildings/upsert.ts:280` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AssociationPhone3` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AvailableLeaseType` | Enums.Multi.ExistingLeaseType · ExistingLeaseType (multi) · lookup 23 (RLS 0) · filterable · 0 · not RLS | `listings.features.AvailableLeaseType (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:348` | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `CurrentFinancing` | Enums.Multi.CurrentFinancing · CurrentFinancing (multi) · lookup 24 (RLS 0) · filterable · 0 · not RLS | `listings.features.CurrentFinancing (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:346` | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `DownPaymentAssistanceAmount` | Edm.Decimal · filterable · 0 · not RLS | `listings.features.DownPaymentAssistanceAmount (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:123` `lib/search/crm-idx-mapper.ts:121` `lib/search/crm-idx-mapper.ts:122` | — | 5 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `DownPaymentAssistanceCount` | Edm.Int32 · filterable · 0 · not RLS | `listings.features.DownPaymentAssistanceCount (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:128` `lib/search/crm-idx-mapper.ts:126` `lib/search/crm-idx-mapper.ts:127` | — | 4 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `DownPaymentAssistanceYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ExistingLeaseType` | Enums.Multi.ExistingLeaseType · ExistingLeaseType (multi) · lookup 23 (RLS 0) · filterable · 0 · not RLS | `listings.features.ExistingLeaseType (pick → features)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:349` | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `FhaEligibility` | Enums.FhaEligibility · FhaEligibility · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FinancialDataSource` | Enums.Multi.FinancialDataSource · FinancialDataSource (multi) · lookup 5 (RLS 0) · filterable · 0 · not RLS | `listings.features.FinancialDataSource (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `FurnitureReplacementExpense` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GrossIncome` | Edm.Decimal · filterable · 0 · not RLS | `listings.features.GrossIncome (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `GrossScheduledIncome` | Edm.Decimal · filterable · 0 · not RLS | `listings.features.GrossScheduledIncome (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `IncomeIncludes` | Enums.Multi.IncomeIncludes · IncomeIncludes (multi) · lookup 7 (RLS 0) · filterable · 0 · not RLS | `listings.features.IncomeIncludes (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LandLeaseAmount` | Edm.Decimal · filterable · 0 · not RLS | `listings.features.LandLeaseAmount (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LeaseAmount` | Edm.Decimal · filterable · 0 · not RLS | `listings.raw_data.LeaseAmount (RAW_DATA_KEEP_FIELDS)` `listings.features.LeaseAmount (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:603` | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LeaseAmountFrequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 0) · filterable · 0 · not RLS | `listings.raw_data.LeaseAmountFrequency (RAW_DATA_KEEP_FIELDS)` `listings.features.LeaseAmountFrequency (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:604` | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LeaseAssignableYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeaseConsideredYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeaseExpiration` | Edm.Date · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LeaseRenewalOptionYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeaseTerm` | Enums.LeaseTerm · LeaseTerm · lookup 26 (RLS 0) · filterable · 0 · not RLS | `listings.features.LeaseTerm (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LeaseTermOptions` | Enums.Multi.LeaseTerm · LeaseTerm (multi) · lookup 26 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListingTerms` | Enums.Multi.ListingTerms · ListingTerms (multi) · lookup 67 (RLS 0) · filterable · 0 · not RLS | — | `lib/search/types.ts:149` map: no-fee: NoFee|OwnerPays | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OperatingExpenseIncludes` | Enums.Multi.OperatingExpenseIncludes · OperatingExpenseIncludes (multi) · lookup 39 (RLS 0) · filterable · 0 · not RLS | `listings.features.OperatingExpenseIncludes (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `RentControlYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RentIncludes` | Enums.Multi.RentIncludes · RentIncludes (multi) · lookup 33 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxAssessedValue` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxBookNumber` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxLegalDescription` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxOtherAnnualAssessmentAmount` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxParcelLetter` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxStatusCurrent` | Enums.Multi.TaxStatusCurrent · TaxStatusCurrent (multi) · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxTract` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxYear` | Edm.Int32 · filterable · 0 · not RLS | `listings.features.TaxYear (pick → features)` | — | — | S | `lib/idx/db-to-public-dto.ts:601` | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `TotalActualRent` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `VacancyAllowance` | Edm.Int32 · filterable · 0 · not RLS | `listings.features.VacancyAllowance (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `VacancyAllowanceRate` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `WaterBodyName` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `WaterHeater` | Enums.Multi.WaterHeater · WaterHeater (multi) · lookup 25 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### RESO manufactured-home, farm & ranch fields (not used on this feed) — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.Fencing` · projection: — · criterion: — · DTO/card: — · workspace/report/CMA: — · tests: 0 file(s) · populated but not in the runtime $select: `Fencing`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `Fencing` | Enums.Multi.Fencing · Fencing (multi) · lookup 56 (RLS 17) · filterable · 44 · not RLS | `listings.features.Fencing (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `BodyType` | Enums.Multi.BodyType · BodyType (multi) · lookup 7 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CropsIncludedYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `CultivatedArea` | Edm.Decimal · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DOH1` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `DOH2` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `DOH3` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FarmCreditServiceInclYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `FarmLandAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `FarmLandAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `FrontageType` | Enums.Multi.FrontageType · FrontageType (multi) · lookup 14 (RLS 0) · filterable · 0 · not RLS | `listings.features.FrontageType (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `GrazingPermitsBlmYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `GrazingPermitsForestServiceYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `GrazingPermitsPrivateYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `HorseAmenities` | Enums.Multi.HorseAmenities · HorseAmenities (multi) · lookup 41 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `HorseYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `IrrigationSource` | Enums.Multi.IrrigationSource · IrrigationSource (multi) · lookup 21 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `IrrigationWaterRightsAcres` | Edm.Decimal · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `IrrigationWaterRightsYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `License1` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `License2` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `License3` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Make` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | 3 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MobileDimUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MobileHomeRemainsYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MobileLength` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MobileWidth` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `Model` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ParkManagerName` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ParkManagerPhone` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ParkName` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PastureArea` | Edm.Decimal · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `PowerProductionType` | Enums.Multi.PowerProductionType · PowerProductionType (multi) · lookup 2 (RLS 0) · filterable · 0 · not RLS | `listings.features.PowerProductionType (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `PowerProductionYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RangeArea` | Edm.Decimal · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `RoadFrontageType` | Enums.Multi.RoadFrontageType · RoadFrontageType (multi) · lookup 29 (RLS 0) · filterable · 0 · not RLS | `listings.features.RoadFrontageType (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `RoadResponsibility` | Enums.Multi.RoadResponsibility · RoadResponsibility (multi) · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoadSurfaceType` | Enums.Multi.RoadSurfaceType · RoadSurfaceType (multi) · lookup 16 (RLS 0) · filterable · 0 · not RLS | `listings.features.RoadSurfaceType (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `SerialU` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SerialX` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SerialXX` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Skirt` | Enums.Multi.Skirt · Skirt (multi) · lookup 25 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Topography` | Edm.String · lookup 26 (RLS 0) · filterable · 0 · not RLS | `listings.features.Topography (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `Vegetation` | Enums.Multi.Vegetation · Vegetation (multi) · lookup 19 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | `listings.features.Vegetation (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `WoodedArea` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Security & doorman — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.SecurityFeatures` · projection: — · criterion: — · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `lib/buildings/public-building-data.ts`, `lib/buildings/upsert.ts` · tests: 0 file(s)

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `SecurityFeatures` | Enums.Multi.SecurityFeatures · SecurityFeatures (multi) · lookup 84 (RLS 10) · filterable · 1,890 / 140 Active · not RLS | `listings.features.SecurityFeatures (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:586` `lib/search/crm-idx-mapper.ts:342` | `lib/buildings/public-building-data.ts:92` `lib/buildings/public-building-data.ts:182` `lib/buildings/upsert.ts:227` | — | **PARTIAL** — not searchable |

### Showing, access & private contacts — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.features.ShowingContactName`, `listings.features.ShowingContactPhone`, `listings.features.ShowingContactType` · projection: — · criterion: — · DTO/card: — · workspace/report/CMA: — · tests: 0 file(s) · populated but not in the runtime $select: `ShowingContactName`, `ShowingContactPhone`, `ShowingContactType`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `ShowingContactName` | Edm.String · filterable · 1,130 · not RLS | `listings.features.ShowingContactName (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `ShowingContactPhone` | Edm.String · filterable · 1,102 · not RLS | `listings.features.ShowingContactPhone (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `ShowingContactType` | Enums.Multi.ShowingContactType · ShowingContactType (multi) · lookup 15 (RLS 1) · filterable · 15 · not RLS | `listings.features.ShowingContactType (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `AccessCode` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LockBoxLocation` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | `listings.features.LockBoxLocation (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `LockBoxSerialNumber` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LockBoxType` | Enums.Multi.LockBoxType · LockBoxType (multi) · lookup 11 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | `listings.features.LockBoxType (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `OccupantName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OccupantPhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OccupantType` | Enums.OccupantType · OccupantType · lookup 7 (RLS 3) · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OpenHouseModificationTimestamp` | Edm.DateTimeOffset · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OwnerName` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | 3 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OwnerName2` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OwnerPhone` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ShowingAdvanceNotice` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ShowingAttendedYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ShowingConsiderations` | Enums.Multi.ShowingConsiderations · ShowingConsiderations (multi) · lookup 14 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ShowingContactPhoneExt` | Edm.String · filterable · 0 · not RLS | `listings.features.ShowingContactPhoneExt (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `ShowingDays` | Enums.Multi.ShowingDays · ShowingDays (multi) · lookup 7 (RLS 7) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ShowingEndTime` | Edm.DateTimeOffset · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ShowingInstructions` | Edm.String · SUPPRESSED · 0 / 0 Active · RLS | `listings.raw_data.ShowingInstructions (RAW_DATA_KEEP_FIELDS)` `listings.features.ShowingInstructions (pick → features)` | — | — | S | — | `app/api/crm/listings/route.ts:375` `app/api/crm/listings/[id]/route.ts:420` | 6 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `ShowingRequirements` | Enums.Multi.ShowingRequirements · ShowingRequirements (multi) · lookup 40 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | `listings.features.ShowingRequirements (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: yes |
| `ShowingServiceName` | Enums.ShowingServiceName · ShowingServiceName · lookup 11 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ShowingStartTime` | Edm.DateTimeOffset · SUPPRESSED · 0 / 0 Active · RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `StartShowingDate` | Edm.Date · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Size & rooms — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.bathrooms_full`, `listings.bathrooms_half`, `listings.bedrooms_total`, `listings.features.AboveGradeFinishedAreaUnits`, `listings.features.BathroomsFull`, `listings.features.BathroomsHalf`, `listings.features.BathroomsOneQuarter`, `listings.features.BathroomsThreeQuarter`, `listings.features.BathroomsTotalInteger`, `listings.features.BedroomsTotal` +15 · projection: — · criterion: `app/api/listings/route.ts`, `lib/search/canonical/field-registry.ts`, `lib/search/engine/universe.ts`, `lib/search/public-listing-db.ts` · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts`, `lib/search/engine/hydrate.ts` · workspace/report/CMA: `app/api/crm/listing-sends/route.ts`, `app/api/crm/listings/[id]/route.ts`, `app/api/crm/listings/reset-sync/route.ts`, `app/api/crm/listings/route.ts`, `app/api/crm/sales/comps/route.ts`, `app/api/crm/sales/prospects/[id]/comps/route.ts` +9 · tests: 23 file(s) · **populated but NOT in the sync $select (never persisted): `RoomType`, `UnitTypeType`** · populated but not in the runtime $select: `AboveGradeFinishedAreaUnits`, `BathroomsOneQuarter`, `BathroomsThreeQuarter`, `BelowGradeFinishedAreaUnits`, `LivingAreaUnits`, `LotSizeDimensions`, `LotSizeSource`, `LotSizeUnits`, `RoomType`, `UnitTypeType`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `BedroomsTotal` | Edm.Int32 · filterable · 587,737 · RLS | `listings.raw_data.BedroomsTotal (RAW_DATA_KEEP_FIELDS)` `listings.bedrooms_total (mapper dataflow → bedrooms_total)` `listings.features.BedroomsTotal (pick → features)` | — | `lib/search/canonical/field-registry.ts:155` `lib/search/public-listing-db.ts:240` `lib/search/public-listing-db.ts:241` +5 | S+R | `lib/search/crm-idx-mapper.ts:253` `lib/search/engine/hydrate.ts:158` | `lib/buildings/public-building-data.ts:82` `lib/buildings/public-building-data.ts:969` `lib/buildings/public-building-data.ts:1033` +23 | 17 | **COMPLETE** |
| `RoomsTotal` | Edm.Int32 · filterable · 587,737 · RLS | `listings.raw_data.RoomsTotal (RAW_DATA_KEEP_FIELDS)` `listings.features.RoomsTotal (pick → features)` | — | `lib/search/canonical/field-registry.ts:157` | S+R | `lib/search/engine/hydrate.ts:139` `lib/search/crm-idx-mapper.ts:252` | — | 5 | **COMPLETE** |
| `BathroomsTotalInteger` | Edm.Int32 · filterable · 587,684 · RLS | `listings.features.BathroomsTotalInteger (pick → features)` | — | — | S+R | — | `lib/comps/fetch-comps.ts:78` `app/api/crm/sales/prospects/[id]/pdf/route.ts:175` `app/api/crm/sales/prospects/[id]/pdf/route.ts:183` +2 | 4 | **PARTIAL** — not searchable · not displayed |
| `BathroomsFull` | Edm.Int32 · filterable · 481,482 · RLS | `listings.raw_data.BathroomsFull (RAW_DATA_KEEP_FIELDS)` `listings.bathrooms_full (mapper dataflow → bathrooms_full)` `listings.features.BathroomsFull (pick → features)` | — | `lib/search/engine/universe.ts:88` `lib/search/public-listing-db.ts:248` `lib/search/public-listing-db.ts:250` +3 | S+R | `lib/search/crm-idx-mapper.ts:232` `lib/search/crm-idx-mapper.ts:233` `lib/search/engine/hydrate.ts:159` | `lib/buildings/public-building-data.ts:82` `lib/buildings/public-building-data.ts:970` `lib/buildings/public-building-data.ts:1034` +18 | 17 | **COMPLETE** |
| `LivingAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 1) · filterable · 446,923 · RLS | `listings.raw_data.LivingAreaUnits (RAW_DATA_KEEP_FIELDS)` `listings.features.LivingAreaUnits (pick → features)` | — | — | S | — | `app/api/crm/listings/[id]/route.ts:416` | 2 | **PARTIAL** — not searchable · not displayed |
| `LivingArea` | Edm.Decimal · filterable · 417,652 · RLS | `listings.raw_data.LivingArea (RAW_DATA_KEEP_FIELDS)` `listings.living_area (mapper dataflow → living_area)` `listings.features.LivingArea (pick → features)` | — | `lib/search/canonical/field-registry.ts:158` `lib/search/public-listing-db.ts:259` `lib/search/public-listing-db.ts:260` +4 | S+R | `lib/search/crm-idx-mapper.ts:267` `lib/search/engine/hydrate.ts:159` | `lib/buildings/public-building-data.ts:82` `lib/buildings/public-building-data.ts:972` `lib/buildings/public-building-data.ts:1035` +29 | 5 | **COMPLETE** |
| `BathroomsHalf` | Edm.Int32 · filterable · 409,765 · RLS | `listings.raw_data.BathroomsHalf (RAW_DATA_KEEP_FIELDS)` `listings.bathrooms_half (mapper dataflow → bathrooms_half)` `listings.features.BathroomsHalf (pick → features)` | — | `lib/search/engine/universe.ts:88` `lib/search/public-listing-db.ts:251` `app/api/listings/route.ts:353` +1 | S+R | `lib/search/crm-idx-mapper.ts:236` `lib/search/crm-idx-mapper.ts:237` `lib/search/engine/hydrate.ts:159` | `lib/buildings/public-building-data.ts:82` `lib/buildings/public-building-data.ts:971` `app/api/crm/listings/[id]/route.ts:262` +10 | 12 | **COMPLETE** |
| `LotSizeDimensions` | Edm.String · filterable · 237,288 · RLS | `listings.features.LotSizeDimensions (pick → features)` | — | — | S | — | — | 2 | **PARTIAL** — not searchable · not displayed |
| `LotSizeArea` | Edm.Decimal · filterable · 60,046 · RLS | `listings.features.LotSizeArea (pick → features)` | — | — | S+R | `lib/idx/db-to-public-dto.ts:545` | — | 2 | **PARTIAL** — not searchable |
| `LotSizeUnits` | Enums.LotSizeUnits · LotSizeUnits · lookup 4 (RLS 3) · filterable · 35,362 · RLS | `listings.features.LotSizeUnits (pick → features)` | — | — | S | — | — | 2 | **PARTIAL** — not searchable · not displayed |
| `RoomType` | Enums.Multi.RoomType · RoomType (multi) · lookup 122 (RLS 7) · filterable · 8,296 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `LotSizeSource` | Enums.LotSizeSource · LotSizeSource · lookup 15 (RLS 10) · filterable · 341 · not RLS | `listings.features.LotSizeSource (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `BathroomsOneQuarter` | Edm.Int32 · filterable · 323 · not RLS | `listings.features.BathroomsOneQuarter (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `BathroomsThreeQuarter` | Edm.Int32 · filterable · 258 · not RLS | `listings.features.BathroomsThreeQuarter (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `UnitTypeType` | Enums.Multi.UnitTypeType · UnitTypeType (multi) · lookup 22 (RLS 2) · filterable · 148 · not RLS | — | — | — | — | — | — | — | **MISSING** |
| `AboveGradeFinishedAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 1) · filterable · 76 · not RLS | `listings.features.AboveGradeFinishedAreaUnits (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `BelowGradeFinishedAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 1) · filterable · 16 · not RLS | `listings.features.BelowGradeFinishedAreaUnits (pick → features)` | — | — | S | — | — | — | **PARTIAL** — not searchable · not displayed |
| `AboveGradeFinishedArea` | Edm.Decimal · filterable · 0 · not RLS | `listings.features.AboveGradeFinishedArea (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `AboveGradeFinishedAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | `listings.features.AboveGradeFinishedAreaSource (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `AboveGradeUnfinishedArea` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeUnfinishedAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeUnfinishedAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BathroomsPartial` | Edm.Int32 · filterable · 0 · not RLS | `listings.features.BathroomsPartial (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `BedroomsPossible` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeFinishedArea` | Edm.Decimal · filterable · 0 · not RLS | `listings.features.BelowGradeFinishedArea (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `BelowGradeFinishedAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | `listings.features.BelowGradeFinishedAreaSource (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `BelowGradeUnfinishedArea` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeUnfinishedAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeUnfinishedAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FrontageLength` | Edm.String · filterable · 0 · not RLS | `listings.features.FrontageLength (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `FrontageLengthRemarks` | Edm.String · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FrontageLengthUnit` | Enums.FrontageLengthUnit · FrontageLengthUnit · lookup 3 (RLS 0) · filterable · 0 · not RLS | `listings.features.FrontageLengthUnit (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LivingAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | `listings.features.LivingAreaSource (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LotDimensionsSource` | Enums.LotDimensionsSource · LotDimensionsSource · lookup 14 (RLS 0) · filterable · 0 · not RLS | `listings.features.LotDimensionsSource (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |
| `LotSizeAcres` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LotSizeSquareFeet` | Edm.Decimal · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MainLevelBathrooms` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MainLevelBedrooms` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Tours, video & media counts (Property carriers) — **PARTIAL**

Impact chain (populated fields only) — persistence: `listings.raw_data.PhotosCount`, `listings.raw_data.VideosCount`, `listings.raw_data.VirtualTourURLBranded`, `listings.raw_data.VirtualTourURLUnbranded`, `listings.raw_data.VirtualTourURLUnbranded2`, `listings.raw_data.VirtualTourURLUnbranded3` · projection: `lib/search/listing-search-projection.ts` · criterion: — · DTO/card: `lib/idx/db-to-public-dto.ts`, `lib/search/crm-idx-mapper.ts` · workspace/report/CMA: `lib/comps/fetch-comps.ts` · tests: 33 file(s) · **populated but NOT in the sync $select (never persisted): `VideosChangeTimestamp`** · populated but not in the runtime $select: `DocumentsChangeTimestamp`, `DocumentsCount`, `VideosChangeTimestamp`

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `DocumentsCount` | Edm.Int32 · filterable · 591,607 · RLS | — | — | — | S | — | — | — | **MISSING** |
| `PhotosCount` | Edm.Int32 · filterable · 591,607 · RLS | `listings.raw_data.PhotosCount (RAW_DATA_KEEP_FIELDS)` | — | — | S+R | `lib/search/crm-idx-mapper.ts:105` | `lib/comps/fetch-comps.ts:88` | 7 | **PARTIAL** — not searchable |
| `PhotosChangeTimestamp` | Edm.DateTimeOffset · filterable · 591,597 · RLS | — | — | — | S+R | — | — | 22 | **MISSING** |
| `VideosCount` | Edm.Int32 · filterable · 485,075 · not RLS | `listings.raw_data.VideosCount (RAW_DATA_KEEP_FIELDS)` | — | — | S+R | — | — | 1 | **PARTIAL** — not searchable · not displayed |
| `DocumentsChangeTimestamp` | Edm.DateTimeOffset · filterable · 366,181 · RLS | — | — | — | S | — | — | 1 | **MISSING** |
| `VideosChangeTimestamp` | Edm.DateTimeOffset · filterable · 329,062 · RLS | — | — | — | — | — | — | — | **MISSING** |
| `VirtualTourURLUnbranded` | Edm.String · filterable · 26,372 · RLS | `listings.raw_data.VirtualTourURLUnbranded (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:397` | — | S+R | `lib/idx/db-to-public-dto.ts:614` `lib/search/crm-idx-mapper.ts:109` | — | 9 | **COMPLETE** |
| `VirtualTourURLBranded` | Edm.String · filterable · 13,879 · RLS | `listings.raw_data.VirtualTourURLBranded (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:398` | — | S+R | `lib/idx/db-to-public-dto.ts:615` `lib/search/crm-idx-mapper.ts:110` | — | 7 | **COMPLETE** |
| `VirtualTourURLUnbranded2` | Edm.String · filterable · 2,382 · not RLS | `listings.raw_data.VirtualTourURLUnbranded2 (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:397` | — | S+R | `lib/idx/db-to-public-dto.ts:614` `lib/search/crm-idx-mapper.ts:109` | — | 4 | **COMPLETE** |
| `VirtualTourURLUnbranded3` | Edm.String · filterable · 354 · not RLS | `listings.raw_data.VirtualTourURLUnbranded3 (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:397` | — | S+R | `lib/idx/db-to-public-dto.ts:614` `lib/search/crm-idx-mapper.ts:109` | — | 4 | **COMPLETE** |
| `DocumentsAvailable` | Enums.Multi.DocumentsAvailable · DocumentsAvailable (multi) · lookup 94 (RLS 0) · filterable · 0 · not RLS | — | — | — | S | — | `app/api/buildings/search/route.ts:431` `app/api/buildings/search/route.ts:800` | 2 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FloorPlansChangeTimestamp` | Edm.DateTimeOffset · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FloorPlansCount` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TotalFloorPlansCount` | Edm.Int32 · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `VirtualTourURLBranded2` | Edm.String · filterable · 0 · not RLS | `listings.raw_data.VirtualTourURLBranded2 (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:398` | — | R | `lib/search/crm-idx-mapper.ts:110` | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `VirtualTourURLBranded3` | Edm.String · filterable · 0 · not RLS | `listings.raw_data.VirtualTourURLBranded3 (RAW_DATA_KEEP_FIELDS)` | `lib/search/listing-search-projection.ts:398` | — | R | `lib/search/crm-idx-mapper.ts:110` | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### Transportation & schools — **PROVIDER-UNAVAILABLE**

Impact chain (populated fields only) — persistence: — · projection: — · criterion: — · DTO/card: — · workspace/report/CMA: — · tests: 0 file(s)

| Field | Live (type · lookup · filterable · populated all/Active · RLS) | Mapper → persistence | Projection / amenity map | Criterion | $select | DTO / card | Workspace · report · CMA | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `DistanceToBusComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToBusNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToBusUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToElectricComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToElectricNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToElectricUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToFreewayComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToFreewayNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToFreewayUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToGasComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToGasNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToGasUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToPhoneServiceComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToPhoneServiceNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToPhoneServiceUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToPlaceofWorshipComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToPlaceofWorshipNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToPlaceofWorshipUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSchoolBusComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSchoolBusNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSchoolBusUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSchoolsComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSchoolsNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSchoolsUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSewerComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSewerNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToSewerUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToShoppingComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToShoppingNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToShoppingUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToStreetComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToStreetNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToStreetUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToWaterComments` | Edm.String · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToWaterNumeric` | Edm.Int32 · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DistanceToWaterUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · SUPPRESSED · 0 / 0 Active · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ElementarySchool` | Edm.String · lookup 1 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ElementarySchoolDistrict` | Edm.String · lookup 1 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `HighSchool` | Edm.String · lookup 1 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `HighSchoolDistrict` | Edm.String · lookup 1 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MiddleOrJuniorSchool` | Edm.String · lookup 1 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MiddleOrJuniorSchoolDistrict` | Edm.String · lookup 1 (RLS 0) · filterable · 0 · not RLS | — | — | — | — | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `WalkScore` | Edm.Int32 · filterable · 0 · not RLS | `listings.features.WalkScore (pick → features)` | — | — | S | — | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: yes |

## D. CustomProperty.CustomFields keys on every Active listing (7,601) — none reachable by Search

| Key | Non-empty Active rows | Top values |
|---|---|---|
| `ElevatorsTotal` | 7,601 | 0=2426 · 1=2058 · 2=1258 · 3=597 |
| `BuildingTaxLot` | 7,601 | 7501=1287 · 7502=583 · 0001=506 · 7503=318 |
| `AttendanceType` | 7,601 | None=2836 · DoormanFullTime=1342 · DoormanFullTime,ConciergeFullTime=876 · DoormanFullTime,ConciergeYes=613 |
| `ListingKey` | 7,601 | 1091330901=1 · 1091330953=1 · 1091331715=1 · 1091331731=1 |
| `TaxAbatementYN` | 7,594 | 0=7409 · 1=185 |
| `SponsorUnitYN` | 7,331 | 0=6035 · 1=1296 |
| `FlipTax` | 6,751 | 0.00=5454 · 2.00=497 · 1.00=166 · 3.00=164 |
| `PercentOfCommonElements` | 6,536 | 0.00=5516 · 1.00=247 · 2.00=127 · 100.00=88 |
| `MaximumFinancingPercent` | 6,468 | 90.00=2417 · 80.00=1780 · 0.00=1110 · 75.00=511 |
| `MaximumFinancingRemarks` | 6,286 | See Maximum Financing Percent=1716 · 0=816 · 90=566 · 80=425 |
| `CertificateOfOccupancyYN` | 5,646 | 1=4206 · 0=1440 |
| `TaxMonthlyAmount` | 5,477 | 0.00=2119 · 12.00=8 · 832.00=8 · 14.00=7 |
| `LandmarkStatusYN` | 5,401 | 0=5336 · 1=65 |
| `FlipTaxRemarks` | 4,984 | 0.0=1705 · ASK EXCL BROKER=914 · Call Listing Agent=365 · NONE=214 |
| `ViewRemarks` | 4,601 | C=709 · See remarks=537 ·  =440 · City=384 |
| `TaxDeductionPercent` | 4,483 | 0.00=3271 · 50.00=189 · 55.00=76 · 45.00=58 |
| `CapitalReservesYN` | 4,168 | 0=4092 · 1=76 |
| `UnitLine` | 2,922 | A=403 · B=368 · C=301 · D=239 |
| `PrivateOutdoorSpaceSize` | 2,892 | GreaterThan60SqFt=1718 · LessThan60SqFt=1174 |
| `KitchenCondition` | 2,365 | Excellent=1920 · Good=340 · Fair=66 · Poor=28 |
| `FlipTaxType` | 2,252 | Percent=1694 · SeeRemarks=359 · Dollars=199 |
| `BathroomCondition` | 1,929 | Excellent=1510 · Good=316 · Fair=61 · New=21 |
| `FurnishedListPrice` | 1,325 | 499000.00=19 · 1995000.00=17 · 699000.00=17 · 1495000.00=15 |
| `BuildingStaffType` | 1,221 | SuperLiveIn=1053 · ResidentManagerFullTime=123 · SuperOffsite=45 |
| `BuildingSmokeFreeYN` | 1,151 | 0=597 · 1=554 |
| `MaxLeaseMonths` | 939 | 12=517 · 24=328 · 14=23 · 15=13 |
| `BuildingRules` | 795 | PiedATerreAllowed,BuildingWasherDryerAll=443 · PiedATerreAllowed=166 · PiedATerreAllowed,CorporateOwnerAllowed,=69 · BuildingWasherDryerAllowed=48 |
| `ClosetsTotal` | 787 | 0=752 · 3=11 · 4=10 · 6=7 |
| `TaxDeductionAmount` | 708 | 0.00=587 · 85288.00=2 · 14880.00=1 · 66750.00=1 |
| `MaximumFinancingAmount` | 708 | 0.00=707 · 511200.00=1 |
| `CommercialUnitsYN` | 648 | 0=645 · 1=3 |
| `GuarantorsAcceptedYN` | 648 | 0=621 · 1=27 |
| `TaxDeductionRemarks` | 585 | ASK EXCL BROKER=585 |
| `CeilingHeightFeet` | 336 | 10=110 · 9=95 · 11=39 · 0=18 |
| `CeilingHeightInches` | 296 | 0=120 · 108=22 · 7=20 · 120=18 |
| `BuildingParkingTotal` | 188 | 0=60 · 25=21 · 1=20 · 60=16 |
| `TaxAbatementComments` | 185 | 421A=84 · J51=22 · Ends 2039=15 · n/a=11 |
| `TaxAbatementExpirationYear` | 185 | 2039=34 · 2020=19 · 2033=17 · 2021=15 |
| `FurnishedMinLeaseMonths` | 131 | 12=61 · 0=48 · 6=7 · 1=6 |
| `FurnishedMaxLeaseMonths` | 131 | 12=50 · 0=47 · 24=23 · 1=6 |
| `ComingSoonTimestamp` | 80 | 2026-07-10T00:00:00.000=4 · 2026-07-16T00:00:00.000=4 · 2026-08-26T00:00:00.000=3 · 2026-08-27T00:00:00.000=3 |
| `NumberOfProfessionalUnitsTotal` | 60 | 0=33 · 1=11 · 435=5 · 2=4 |
| `CeilingHeightUnits` | 59 | Feet=59 |
| `CapitalReservesTotal` | 49 | 0.00=34 · 1.00=6 · 2.00=2 · 2000000.00=2 |
| `ManagingAgencyListingYN` | 48 | 0=47 · 1=1 |
| `ArchitectName` | 22 | Selldorf Architects=15 · Charles W. Romeyn and Henry R. Wynne=1 · Kenneth M. Murchison=1 · Brent Buck=1 |
| `SpecialAssessmentExpirationDateTime` | 13 | 2026-11-29T19:06:00.000=4 · 2017-12-31T19:06:00.000=2 · 2015-12-31T19:06:00.000=2 · 2016-12-31T19:06:00.000=1 |
| `AreaOverFAR` | 5 | 0.00=4 · 1150.00=1 |
| `AreaUnderFAR` | 5 | 0.00=4 · 1000.00=1 |
| `BonusYN` | 2 | 0=2 |
| `RoofRightsYN` | 2 | 1=2 |

## E. Navigation subsection field detail

### `Property.Building` → Building (1 fields, rejected) — **PROVIDER-UNAVAILABLE**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `BuildingKey` | Edm.String · unmeasured · n/a · RLS | — | — | **PROVIDER-UNAVAILABLE** — resource rejected (403) |

### `Property.BuyerAgent` → Member (91 fields, accessible) — **MISSING**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 11,191 · not RLS | — | 1 | **MISSING** |
| `MemberAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberFullName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberKey` | Edm.String · filterable · 11,191 · RLS | — | 1 | **MISSING** |
| `MemberKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberLastName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberMlsId` | Edm.String · filterable · 11,191 · RLS | — | 2 | **MISSING** |
| `MemberStatus` | Enums.MemberStatus · MemberStatus · lookup 4 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 11,191 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberMlsSecurityClass` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 11,191 · not RLS | — | — | **MISSING** |
| `SourceSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 11,191 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MemberFirstName` | Edm.String · filterable · 11,190 · RLS | — | — | **MISSING** |
| `MemberEmail` | Edm.String · filterable · 11,186 · RLS | — | — | **MISSING** |
| `MemberDirectPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPreferredPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPostalCode` | Edm.String · filterable · 10,474 · RLS | — | — | **MISSING** |
| `MemberAddress1` | Edm.String · filterable · 10,472 · RLS | — | — | **MISSING** |
| `MemberCity` | Edm.String · filterable · 10,462 · RLS | — | — | **MISSING** |
| `MemberStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 45) · filterable · 10,459 · RLS | — | — | **MISSING** |
| `MemberMobilePhone` | Edm.String · filterable · 10,114 · RLS | — | — | **MISSING** |
| `MemberNickname` | Edm.String · filterable · 9,890 · RLS | — | — | **MISSING** |
| `MemberMiddleName` | Edm.String · filterable · 4,281 · RLS | — | — | **MISSING** |
| `MemberBio` | Edm.String · filterable · 1,042 · RLS | — | — | **MISSING** |
| `MemberLanguages` | Enums.Multi.Languages · Languages (multi) · lookup 212 (RLS 28) · filterable · 816 · RLS | — | — | **MISSING** |
| `MemberUrl` | Edm.String · filterable · 773 · not RLS | — | — | **MISSING** |
| `MemberPostalCodePlus4` | Edm.String · filterable · 141 · RLS | — | — | **MISSING** |
| `MemberPreferredPhoneExt` | Edm.String · filterable · 29 · RLS | — | — | **MISSING** |
| `JobTitle` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LastLoginTimestamp` | Edm.DateTimeOffset · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAlternateId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORMlsId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberBillingPreference` | Enums.BillingPreference · BillingPreference · lookup 3 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberCarrierRoute` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCommitteeCount` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberDesignation` | Enums.Multi.MemberDesignation · MemberDesignation (multi) · lookup 93 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberHomePhone` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberIsAssistantTo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberLoginId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberMailOptOutYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsAccessYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsSecurityClass` | Enums.MemberMlsSecurityClass · MemberMlsSecurityClass · lookup 9 (RLS 5) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberNamePrefix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNameSuffix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationEntryDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOtherPhoneType` | Enums.MemberOtherPhoneType · MemberOtherPhoneType · lookup 14 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPager` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberPhoneTTYTDD` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMail` | Enums.PreferredMail · PreferredMail · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredPublication` | Enums.PreferredPublication · PreferredPublication · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseExpirationDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicenseState` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseType` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTollFreePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTransferDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberType` | Enums.MemberType · MemberType · lookup 23 (RLS 2) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMail` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMailExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVotingPrecinct` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SourceSystemID` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `UniqueLicenseeIdentifier` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.BuyerOffice` → Office (80 fields, accessible) — **MISSING**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 578 · not RLS | — | 1 | **MISSING** |
| `IDXOfficeParticipationYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 578 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeStatus` | Enums.OfficeStatus · OfficeStatus · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 578 · not RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `SourceSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `OfficeCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 577 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeKeyNumeric` | Edm.Int64 · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeMlsId` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OriginatingSystemMainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OfficeAddress1` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeCity` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePhone` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePostalCode` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 43) · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerKeyNumeric` | Edm.Int64 · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerMlsId` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeManagerKey` | Edm.String · filterable · 412 · RLS | — | — | **MISSING** |
| `OfficeUrl` | Edm.String · filterable · 383 · not RLS | — | — | **MISSING** |
| `OfficeEmail` | Edm.String · filterable · 42 · not RLS | — | — | **MISSING** |
| `OfficePostalCodePlus4` | Edm.String · filterable · 25 · RLS | — | — | **MISSING** |
| `OfficeAlternateId` | Edm.String · filterable · 14 · not RLS | — | — | **MISSING** |
| `OfficePhoneExt` | Edm.String · filterable · 7 · not RLS | — | — | **MISSING** |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 1 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PARTIAL** |
| `BillingOfficeKey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FranchiseAffiliation` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `FranchiseNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `NumberOfBranches` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfNonMemberSalespersons` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORMlsId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeBio` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBranchType` | Enums.OfficeBranchType · OfficeBranchType · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBrokerNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeCorporateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress1` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCareOf` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCity` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountry` | Enums.Country · Country · lookup 246 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCode` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCodePlus4` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeManagerKey` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerKeyNumeric` | Edm.Int64 · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerMlsId` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationIdInsertDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeType` | Enums.OfficeType · OfficeType · lookup 12 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OtherPhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateAgentOption` | Enums.SyndicateAgentOption · SyndicateAgentOption · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `VirtualOfficeWebsiteYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.CoBuyerAgent` → Member (91 fields, accessible) — **MISSING**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 11,191 · not RLS | — | 1 | **MISSING** |
| `MemberAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberFullName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberKey` | Edm.String · filterable · 11,191 · RLS | — | 1 | **MISSING** |
| `MemberKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberLastName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberMlsId` | Edm.String · filterable · 11,191 · RLS | — | 2 | **MISSING** |
| `MemberStatus` | Enums.MemberStatus · MemberStatus · lookup 4 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 11,191 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberMlsSecurityClass` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 11,191 · not RLS | — | — | **MISSING** |
| `SourceSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 11,191 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MemberFirstName` | Edm.String · filterable · 11,190 · RLS | — | — | **MISSING** |
| `MemberEmail` | Edm.String · filterable · 11,186 · RLS | — | — | **MISSING** |
| `MemberDirectPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPreferredPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPostalCode` | Edm.String · filterable · 10,474 · RLS | — | — | **MISSING** |
| `MemberAddress1` | Edm.String · filterable · 10,472 · RLS | — | — | **MISSING** |
| `MemberCity` | Edm.String · filterable · 10,462 · RLS | — | — | **MISSING** |
| `MemberStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 45) · filterable · 10,459 · RLS | — | — | **MISSING** |
| `MemberMobilePhone` | Edm.String · filterable · 10,114 · RLS | — | — | **MISSING** |
| `MemberNickname` | Edm.String · filterable · 9,890 · RLS | — | — | **MISSING** |
| `MemberMiddleName` | Edm.String · filterable · 4,281 · RLS | — | — | **MISSING** |
| `MemberBio` | Edm.String · filterable · 1,042 · RLS | — | — | **MISSING** |
| `MemberLanguages` | Enums.Multi.Languages · Languages (multi) · lookup 212 (RLS 28) · filterable · 816 · RLS | — | — | **MISSING** |
| `MemberUrl` | Edm.String · filterable · 773 · not RLS | — | — | **MISSING** |
| `MemberPostalCodePlus4` | Edm.String · filterable · 141 · RLS | — | — | **MISSING** |
| `MemberPreferredPhoneExt` | Edm.String · filterable · 29 · RLS | — | — | **MISSING** |
| `JobTitle` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LastLoginTimestamp` | Edm.DateTimeOffset · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAlternateId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORMlsId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberBillingPreference` | Enums.BillingPreference · BillingPreference · lookup 3 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberCarrierRoute` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCommitteeCount` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberDesignation` | Enums.Multi.MemberDesignation · MemberDesignation (multi) · lookup 93 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberHomePhone` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberIsAssistantTo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberLoginId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberMailOptOutYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsAccessYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsSecurityClass` | Enums.MemberMlsSecurityClass · MemberMlsSecurityClass · lookup 9 (RLS 5) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberNamePrefix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNameSuffix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationEntryDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOtherPhoneType` | Enums.MemberOtherPhoneType · MemberOtherPhoneType · lookup 14 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPager` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberPhoneTTYTDD` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMail` | Enums.PreferredMail · PreferredMail · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredPublication` | Enums.PreferredPublication · PreferredPublication · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseExpirationDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicenseState` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseType` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTollFreePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTransferDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberType` | Enums.MemberType · MemberType · lookup 23 (RLS 2) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMail` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMailExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVotingPrecinct` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SourceSystemID` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `UniqueLicenseeIdentifier` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.CoBuyerOffice` → Office (80 fields, accessible) — **MISSING**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 578 · not RLS | — | 1 | **MISSING** |
| `IDXOfficeParticipationYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 578 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeStatus` | Enums.OfficeStatus · OfficeStatus · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 578 · not RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `SourceSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `OfficeCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 577 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeKeyNumeric` | Edm.Int64 · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeMlsId` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OriginatingSystemMainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OfficeAddress1` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeCity` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePhone` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePostalCode` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 43) · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerKeyNumeric` | Edm.Int64 · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerMlsId` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeManagerKey` | Edm.String · filterable · 412 · RLS | — | — | **MISSING** |
| `OfficeUrl` | Edm.String · filterable · 383 · not RLS | — | — | **MISSING** |
| `OfficeEmail` | Edm.String · filterable · 42 · not RLS | — | — | **MISSING** |
| `OfficePostalCodePlus4` | Edm.String · filterable · 25 · RLS | — | — | **MISSING** |
| `OfficeAlternateId` | Edm.String · filterable · 14 · not RLS | — | — | **MISSING** |
| `OfficePhoneExt` | Edm.String · filterable · 7 · not RLS | — | — | **MISSING** |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 1 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PARTIAL** |
| `BillingOfficeKey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FranchiseAffiliation` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `FranchiseNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `NumberOfBranches` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfNonMemberSalespersons` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORMlsId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeBio` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBranchType` | Enums.OfficeBranchType · OfficeBranchType · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBrokerNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeCorporateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress1` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCareOf` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCity` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountry` | Enums.Country · Country · lookup 246 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCode` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCodePlus4` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeManagerKey` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerKeyNumeric` | Edm.Int64 · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerMlsId` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationIdInsertDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeType` | Enums.OfficeType · OfficeType · lookup 12 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OtherPhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateAgentOption` | Enums.SyndicateAgentOption · SyndicateAgentOption · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `VirtualOfficeWebsiteYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.CoListAgent` → Member (91 fields, accessible) — **PARTIAL**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 11,191 · not RLS | — | 1 | **MISSING** |
| `MemberAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberFullName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberKey` | Edm.String · filterable · 11,191 · RLS | — | 1 | **MISSING** |
| `MemberKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberLastName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberMlsId` | Edm.String · filterable · 11,191 · RLS | — | 2 | **MISSING** |
| `MemberStatus` | Enums.MemberStatus · MemberStatus · lookup 4 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 11,191 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberMlsSecurityClass` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 11,191 · not RLS | — | — | **MISSING** |
| `SourceSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 11,191 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MemberFirstName` | Edm.String · filterable · 11,190 · RLS | — | — | **MISSING** |
| `MemberEmail` | Edm.String · filterable · 11,186 · RLS | — | — | **MISSING** |
| `MemberDirectPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPreferredPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPostalCode` | Edm.String · filterable · 10,474 · RLS | — | — | **MISSING** |
| `MemberAddress1` | Edm.String · filterable · 10,472 · RLS | — | — | **MISSING** |
| `MemberCity` | Edm.String · filterable · 10,462 · RLS | — | — | **MISSING** |
| `MemberStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 45) · filterable · 10,459 · RLS | — | — | **MISSING** |
| `MemberMobilePhone` | Edm.String · filterable · 10,114 · RLS | — | — | **MISSING** |
| `MemberNickname` | Edm.String · filterable · 9,890 · RLS | — | — | **MISSING** |
| `MemberMiddleName` | Edm.String · filterable · 4,281 · RLS | — | — | **MISSING** |
| `MemberBio` | Edm.String · filterable · 1,042 · RLS | — | — | **MISSING** |
| `MemberLanguages` | Enums.Multi.Languages · Languages (multi) · lookup 212 (RLS 28) · filterable · 816 · RLS | — | — | **MISSING** |
| `MemberUrl` | Edm.String · filterable · 773 · not RLS | — | — | **MISSING** |
| `MemberPostalCodePlus4` | Edm.String · filterable · 141 · RLS | — | — | **MISSING** |
| `MemberPreferredPhoneExt` | Edm.String · filterable · 29 · RLS | — | — | **MISSING** |
| `JobTitle` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LastLoginTimestamp` | Edm.DateTimeOffset · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAlternateId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORMlsId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberBillingPreference` | Enums.BillingPreference · BillingPreference · lookup 3 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberCarrierRoute` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCommitteeCount` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberDesignation` | Enums.Multi.MemberDesignation · MemberDesignation (multi) · lookup 93 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberHomePhone` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberIsAssistantTo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberLoginId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberMailOptOutYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsAccessYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsSecurityClass` | Enums.MemberMlsSecurityClass · MemberMlsSecurityClass · lookup 9 (RLS 5) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberNamePrefix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNameSuffix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationEntryDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOtherPhoneType` | Enums.MemberOtherPhoneType · MemberOtherPhoneType · lookup 14 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPager` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberPhoneTTYTDD` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMail` | Enums.PreferredMail · PreferredMail · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredPublication` | Enums.PreferredPublication · PreferredPublication · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseExpirationDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicenseState` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseType` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTollFreePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTransferDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberType` | Enums.MemberType · MemberType · lookup 23 (RLS 2) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMail` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMailExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVotingPrecinct` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SourceSystemID` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `UniqueLicenseeIdentifier` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.CoListOffice` → Office (80 fields, accessible) — **PARTIAL**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 578 · not RLS | — | 1 | **MISSING** |
| `IDXOfficeParticipationYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 578 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeStatus` | Enums.OfficeStatus · OfficeStatus · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 578 · not RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `SourceSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `OfficeCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 577 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeKeyNumeric` | Edm.Int64 · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeMlsId` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OriginatingSystemMainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OfficeAddress1` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeCity` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePhone` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePostalCode` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 43) · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerKeyNumeric` | Edm.Int64 · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerMlsId` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeManagerKey` | Edm.String · filterable · 412 · RLS | — | — | **MISSING** |
| `OfficeUrl` | Edm.String · filterable · 383 · not RLS | — | — | **MISSING** |
| `OfficeEmail` | Edm.String · filterable · 42 · not RLS | — | — | **MISSING** |
| `OfficePostalCodePlus4` | Edm.String · filterable · 25 · RLS | — | — | **MISSING** |
| `OfficeAlternateId` | Edm.String · filterable · 14 · not RLS | — | — | **MISSING** |
| `OfficePhoneExt` | Edm.String · filterable · 7 · not RLS | — | — | **MISSING** |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 1 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PARTIAL** |
| `BillingOfficeKey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FranchiseAffiliation` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `FranchiseNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `NumberOfBranches` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfNonMemberSalespersons` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORMlsId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeBio` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBranchType` | Enums.OfficeBranchType · OfficeBranchType · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBrokerNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeCorporateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress1` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCareOf` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCity` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountry` | Enums.Country · Country · lookup 246 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCode` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCodePlus4` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeManagerKey` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerKeyNumeric` | Edm.Int64 · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerMlsId` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationIdInsertDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeType` | Enums.OfficeType · OfficeType · lookup 12 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OtherPhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateAgentOption` | Enums.SyndicateAgentOption · SyndicateAgentOption · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `VirtualOfficeWebsiteYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.CustomProperty` → CustomProperty (142 fields, accessible) — **PARTIAL**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `CustomFields` | Edm.String · filterable · 591,649 · not RLS | dto: `lib/search/crm-idx-mapper.ts:140` | 2 | **PARTIAL** |
| `HumanModifiedYN` | Edm.Boolean · filterable · 591,649 · not RLS | — | 1 | **MISSING** |
| `InternetEntireListingDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 591,649 · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2944`; dto: `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:87`; workspace: `app/api/crm/listings/[id]/route.ts:323`; other: `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` `lib/compliance/rebny-ucba-rules.ts:783` +10 | 33 | **PARTIAL** |
| `ListingId` | Edm.String · filterable · 591,649 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3703`; dto: `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:284` `lib/search/crm-idx-mapper.ts:354`; workspace: `lib/open-houses/upcoming-open-houses.ts:261` `lib/open-houses/upcoming-open-houses.ts:268` `lib/open-houses/upcoming-open-houses.ts:303` +23; criterion: `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` `lib/search/engine/provider-query.ts:126` +2; sync: `lib/idx/sync.ts:1237` `lib/idx/sync.ts:2650` `app/api/cron/feed-reconcile/route.ts:113` +13; other: `lib/listings/mallan-form-contract.ts:453` `lib/idx/orphan-chunk.ts:49` `lib/idx/orphan-chunk.ts:52` +17 | 52 | **PARTIAL** |
| `ListingKey` | Edm.String · filterable · 591,649 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3680` `lib/idx/media-sync.ts:3682` +1; dto: `lib/search/engine/hydrate.ts:70`; workspace: `lib/open-houses/upcoming-open-houses.ts:303` `lib/buildings/public-building-data.ts:81` `lib/buildings/public-building-data.ts:959` +11; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` `lib/search/engine/universe.ts:147` +6; sync: `lib/idx/sync.ts:1236` `lib/idx/sync.ts:2649` `lib/idx/sync.ts:683` +1; other: `lib/listings/mallan-form-contract.ts:447` `lib/idx/one-cycle-preflight.ts:235` `lib/idx/one-cycle-preflight.ts:246` +14 | 57 | **PARTIAL** |
| `ListingKeyNumeric` | Edm.Int64 · filterable · 591,649 · not RLS | media-lane: `lib/idx/media-sync.ts:8`; other: `lib/idx/cotality-public-dto.ts:89` | 3 | **PARTIAL** |
| `ListOfficeKey` | Edm.String · filterable · 591,649 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` | 2 | **PARTIAL** |
| `ListOfficeMlsId` | Edm.String · filterable · 591,649 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` `app/api/crm/listings/[id]/route.ts:454`; other: `app/api/listings/suggest/route.ts:95` `lib/syndication/eligibility.ts:142` `lib/listings/agent-info-typed-columns.ts:55` +1 | 16 | **PARTIAL** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 591,649 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OriginatingSystemKey` | Edm.String · filterable · 591,649 · not RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 591,649 · not RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 0) · filterable · 591,649 · not RLS | — | — | **MISSING** |
| `PropertyType` | Enums.PropertyType · PropertyType · lookup 13 (RLS 0) · filterable · 591,649 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:963` `lib/buildings/public-building-data.ts:974` +8; criterion: `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` `lib/search/canonical/field-registry.ts:132`; other: `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` `lib/compliance/rls-enforcement.ts:322` +12 | 48 | **PARTIAL** |
| `StandardStatus` | Enums.StandardStatus · StandardStatus · lookup 11 (RLS 11) · filterable · 591,649 · not RLS | media-lane: `lib/idx/media-sync.ts:9`; dto: `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:173`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:933` `lib/buildings/public-building-data.ts:936` +3; criterion: `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` `lib/search/engine/criteria.ts:165` +1; sync: `app/api/cron/prospect-triggers/route.ts:218` `app/api/cron/feed-reconcile/route.ts:445`; other: `lib/compliance/gates.ts:119` `lib/cotality/live-contract.ts:121` `lib/listings/mallan-form-contract.ts:24` +4 | 61 | **PARTIAL** |
| `PropertySubType` | Enums.PropertySubType · PropertySubType · lookup 76 (RLS 0) · filterable · 591,633 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:272`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:974` `lib/buildings/public-building-data.ts:1038` +10; criterion: `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` `lib/search/canonical/field-registry.ts:170` +1; other: `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` `lib/compliance/rebny-validator.ts:366` +10 | 25 | **PARTIAL** |
| `AdditionalFeeYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 591,609 · not RLS | dto: `lib/idx/db-to-public-dto.ts:625`; other: `lib/listings/mallan-form-contract.ts:49` `lib/crm/fee-disclosure.ts:65` `lib/crm/fee-disclosure.ts:66` | 1 | **PARTIAL** |
| `PropertySubTypeAdditional` | Enums.Multi.PropertySubTypeAdditional · PropertySubTypeAdditional (multi) · lookup 76 (RLS 0) · filterable · 553,713 · not RLS | — | — | **MISSING** |
| `AdditionalFeeDescription` | Edm.String · filterable · 317,956 · not RLS | dto: `lib/idx/public-dto.ts:342` `lib/idx/public-dto.ts:343` `lib/idx/db-to-public-dto.ts:627`; other: `lib/listings/mallan-form-contract.ts:49` `lib/crm/fee-disclosure.ts:75` | 3 | **PARTIAL** |
| `FractionalShare` | Edm.String · filterable · 192,124 · RLS | — | — | **MISSING** |
| `Restrictions` | Enums.Multi.Restrictions · Restrictions (multi) · lookup 106 (RLS 2) · filterable · 24,129 · RLS | — | — | **MISSING** |
| `SourceFloorPlansCount` | Edm.Int64 · filterable · 11,316 · not RLS | — | — | **MISSING** |
| `BuildingSizeDimensions` | Edm.String · filterable · 9,394 · RLS | — | — | **MISSING** |
| `AdditionalFee` | Edm.Decimal · filterable · 90 · not RLS | dto: `lib/idx/public-dto.ts:333` `lib/idx/public-dto.ts:334` `lib/idx/db-to-public-dto.ts:626`; other: `lib/listings/mallan-form-contract.ts:49` `lib/crm/fee-disclosure.ts:67` `lib/crm/fee-disclosure.ts:74` | 3 | **PARTIAL** |
| `AdditionalFeeFrequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 1) · filterable · 34 · not RLS | other: `lib/listings/mallan-form-contract.ts:49` | — | **PARTIAL** |
| `AdditionalInfo1` | Edm.String · filterable · 29 · RLS | — | — | **MISSING** |
| `TaxAssessedValueLand` | Edm.String · filterable · 14 · not RLS | — | — | **MISSING** |
| `PricePerAreaUnit` | Enums.PricePerAreaUnit · PricePerAreaUnit · lookup 5 (RLS 1) · filterable · 12 · not RLS | — | — | **MISSING** |
| `ComplexName` | Edm.String · filterable · 1 · not RLS | — | — | **MISSING** |
| `OtherExpenseDescription` | Edm.String · filterable · 1 · not RLS | — | — | **MISSING** |
| `AboveGradeBedrooms` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeFinishedAreaRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeFinishedAreaRangeSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeFinishedAreaRangeUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeUnfinishedAreaRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeUnfinishedAreaRangeSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AboveGradeUnfinishedAreaRangeUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AdditionalInfo2` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `AdditionalInfo3` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ApplicationFee` | Edm.Decimal · SUPPRESSED · n/a / 0 Active · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `AssociationFeeTotal` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AssociationFeeTotalFrequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Attic` | Enums.Multi.Attic · Attic (multi) · lookup 22 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `AvailabilityType` | Enums.Multi.AvailabilityType · AvailabilityType (multi) · lookup 12 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeBedrooms` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeFinishedAreaRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeFinishedAreaRangeSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeFinishedAreaRangeUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeUnfinishedAreaRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeUnfinishedAreaRangeSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BelowGradeUnfinishedAreaRangeUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BoatDockAccommodates` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BoatDockHeight` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BoatDockSlipDescription` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BoatDockSlipFeatures` | Enums.Multi.BoatDockSlipFeatures · BoatDockSlipFeatures (multi) · lookup 32 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BoatDockYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BoatSlipYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BonusAmount` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BuildingAreaTotalRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BuildingAreaTotalRangeSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `BuildingAreaTotalRangeUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `CommunityDevelopmentDistrictYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ConsumerRemarks` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `DevelopmentName` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GarageArea` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GarageAreaUnits` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GarageDimensions` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GuestHouseAreaTotal` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GuestHouseAreaTotalSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GuestHouseAreaTotalUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GuestHouseDescription` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GuestHouseYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `GulfAccessType` | Enums.Multi.GulfAccessType · GulfAccessType (multi) · lookup 8 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `GulfAccessYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LakeChainName` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LakeId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LakeName` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LakeSize` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LandTenure` | Enums.Multi.LandTenure · LandTenure (multi) · lookup 4 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `Lang2_Type` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Lang3_Type` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LastMonthRentReqYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeaseAmountPerArea` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeaseAmountPerAreaUnit` | Enums.LeaseAmountPerAreaUnit · LeaseAmountPerAreaUnit · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LeaseTermsDescription` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LivingAreaRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LivingAreaRangeHigh` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LivingAreaRangeLow` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LivingAreaRangeSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LivingAreaRangeUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Location` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LotSizeAreaRangeHigh` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LotSizeAreaRangeLow` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LotSizeRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LotSizeRangeSource` | Enums.LotSizeSource · LotSizeSource · lookup 15 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LotSizeRangeUnits` | Enums.LotSizeUnits · LotSizeUnits · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Membership` | Enums.Multi.Membership · Membership (multi) · lookup 1 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MembershipDescription` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MembershipFee` | Edm.Decimal · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MembershipFeeFrequency` | Enums.FeeFrequency · FeeFrequency · lookup 16 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MembershipRequiredYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MineralRights` | Enums.Multi.MineralRights · MineralRights (multi) · lookup 20 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MonthlyRate` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfBoatDocks` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfBoatSlips` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OffersDescription` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OffersReviewDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OffMarketDate` | Edm.Date · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:352` `lib/listings/terminal-since.ts:76` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OffSeasonRate` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `PotentialShortSale` | Enums.PotentialShortSale · PotentialShortSale · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PricePerArea` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PrivateShowingInstructions` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ProjectName` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PropertyAccess` | Enums.Multi.PropertyAccess · PropertyAccess (multi) · lookup 10 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PublicRemarks_lang2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `PublicRemarks_lang3` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RentSpreeURL` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `RentSpreeYN` | Edm.Boolean · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `RiverName` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SaleOrLeaseIncludes` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SeasonRate` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SecurityDepositDescription` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SecurityDepositYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SourceSupplementPublicCount` | Edm.Int32 · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SourceSystemKey` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | dto: `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:285` `lib/search/crm-idx-mapper.ts:354`; workspace: `lib/buildings/public-building-data.ts:81`; sync: `lib/idx/sync.ts:1236` `lib/idx/sync.ts:2649` `lib/idx/sync.ts:1179` +1; other: `lib/compliance/rebny-ucba-rules.ts:120` `lib/listings/mallan-form-contract.ts:440` `app/api/listings/similar/route.ts:463` +1 | 9 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `StoriesPartial` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `StoriesPartialTotal` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `StormProtection` | Enums.Multi.StormProtection · StormProtection (multi) · lookup 25 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxAssessedValueImprovement` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxAuthority` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxRate` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TaxYearRange` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `ThirdPartyIntegrationType` | Enums.Multi.ThirdPartyIntegrationType · ThirdPartyIntegrationType (multi) · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TitleCompanyAddress` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TitleCompanyName` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TitleCompanyPhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `TitleCompanyPreferred` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitLocation` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `WaterAccessDescription` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `WaterAccessYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `WeeklyRate` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.ListAgent` → Member (91 fields, accessible) — **PARTIAL**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 11,191 · not RLS | — | 1 | **MISSING** |
| `MemberAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberFullName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberKey` | Edm.String · filterable · 11,191 · RLS | — | 1 | **MISSING** |
| `MemberKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberLastName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `MemberMlsId` | Edm.String · filterable · 11,191 · RLS | — | 2 | **MISSING** |
| `MemberStatus` | Enums.MemberStatus · MemberStatus · lookup 4 (RLS 2) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 11,191 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemMemberMlsSecurityClass` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 11,191 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 11,191 · not RLS | — | — | **MISSING** |
| `SourceSystemMemberKey` | Edm.String · filterable · 11,191 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 11,191 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MemberFirstName` | Edm.String · filterable · 11,190 · RLS | — | — | **MISSING** |
| `MemberEmail` | Edm.String · filterable · 11,186 · RLS | — | — | **MISSING** |
| `MemberDirectPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPreferredPhone` | Edm.String · filterable · 11,064 · RLS | — | — | **MISSING** |
| `MemberPostalCode` | Edm.String · filterable · 10,474 · RLS | — | — | **MISSING** |
| `MemberAddress1` | Edm.String · filterable · 10,472 · RLS | — | — | **MISSING** |
| `MemberCity` | Edm.String · filterable · 10,462 · RLS | — | — | **MISSING** |
| `MemberStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 45) · filterable · 10,459 · RLS | — | — | **MISSING** |
| `MemberMobilePhone` | Edm.String · filterable · 10,114 · RLS | — | — | **MISSING** |
| `MemberNickname` | Edm.String · filterable · 9,890 · RLS | — | — | **MISSING** |
| `MemberMiddleName` | Edm.String · filterable · 4,281 · RLS | — | — | **MISSING** |
| `MemberBio` | Edm.String · filterable · 1,042 · RLS | — | — | **MISSING** |
| `MemberLanguages` | Enums.Multi.Languages · Languages (multi) · lookup 212 (RLS 28) · filterable · 816 · RLS | — | — | **MISSING** |
| `MemberUrl` | Edm.String · filterable · 773 · not RLS | — | — | **MISSING** |
| `MemberPostalCodePlus4` | Edm.String · filterable · 141 · RLS | — | — | **MISSING** |
| `MemberPreferredPhoneExt` | Edm.String · filterable · 29 · RLS | — | — | **MISSING** |
| `JobTitle` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `LastLoginTimestamp` | Edm.DateTimeOffset · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAlternateId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAORMlsId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberBillingPreference` | Enums.BillingPreference · BillingPreference · lookup 3 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberCarrierRoute` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCommitteeCount` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberDesignation` | Enums.Multi.MemberDesignation · MemberDesignation (multi) · lookup 93 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberHomePhone` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberIsAssistantTo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberLoginId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberMailOptOutYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsAccessYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberMlsSecurityClass` | Enums.MemberMlsSecurityClass · MemberMlsSecurityClass · lookup 9 (RLS 5) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberNamePrefix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNameSuffix` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationEntryDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOfficePhoneExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberOtherPhoneType` | Enums.MemberOtherPhoneType · MemberOtherPhoneType · lookup 14 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPager` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberPhoneTTYTDD` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMail` | Enums.PreferredMail · PreferredMail · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPreferredPublication` | Enums.PreferredPublication · PreferredPublication · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberPrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseExpirationDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberStateLicenseState` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStateLicenseType` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `MemberStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTollFreePhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberTransferDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberType` | Enums.MemberType · MemberType · lookup 23 (RLS 2) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMail` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVoiceMailExt` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MemberVotingPrecinct` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SourceSystemID` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `UniqueLicenseeIdentifier` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.ListOffice` → Office (80 fields, accessible) — **PARTIAL**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 578 · not RLS | — | 1 | **MISSING** |
| `IDXOfficeParticipationYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 578 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeKeyNumeric` | Edm.Int64 · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeMlsId` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeStatus` | Enums.OfficeStatus · OfficeStatus · lookup 2 (RLS 2) · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 578 · not RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `SourceSystemOfficeKey` | Edm.String · filterable · 578 · RLS | — | — | **MISSING** |
| `OfficeAOR` | Enums.AOR · AOR · lookup 1127 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `OfficeCountry` | Enums.Country · Country · lookup 246 (RLS 2) · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemID` | Edm.String · filterable · 577 · RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 1) · filterable · 577 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 577 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `MainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeKeyNumeric` | Edm.Int64 · filterable · 576 · RLS | — | — | **MISSING** |
| `MainOfficeMlsId` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OriginatingSystemMainOfficeKey` | Edm.String · filterable · 576 · RLS | — | — | **MISSING** |
| `OfficeAddress1` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeCity` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePhone` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficePostalCode` | Edm.String · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 43) · filterable · 546 · RLS | — | — | **MISSING** |
| `OfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerKeyNumeric` | Edm.Int64 · filterable · 530 · RLS | — | — | **MISSING** |
| `OfficeBrokerMlsId` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeBrokerKey` | Edm.String · filterable · 530 · RLS | — | — | **MISSING** |
| `OriginatingSystemOfficeManagerKey` | Edm.String · filterable · 412 · RLS | — | — | **MISSING** |
| `OfficeUrl` | Edm.String · filterable · 383 · not RLS | — | — | **MISSING** |
| `OfficeEmail` | Edm.String · filterable · 42 · not RLS | — | — | **MISSING** |
| `OfficePostalCodePlus4` | Edm.String · filterable · 25 · RLS | — | — | **MISSING** |
| `OfficeAlternateId` | Edm.String · filterable · 14 · not RLS | — | — | **MISSING** |
| `OfficePhoneExt` | Edm.String · filterable · 7 · not RLS | — | — | **MISSING** |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 1 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PARTIAL** |
| `BillingOfficeKey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `FranchiseAffiliation` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `FranchiseNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `NumberOfBranches` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `NumberOfNonMemberSalespersons` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORkeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAORMlsId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeAssociationComments` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeBio` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBranchType` | Enums.OfficeBranchType · OfficeBranchType · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeBrokerNationalAssociationId` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCityRegion` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeCorporateLicense` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeFax` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress1` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailAddress2` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCareOf` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCity` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountry` | Enums.Country · Country · lookup 246 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailCountyOrParish` | Edm.String · lookup 4423 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCode` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailPostalCodePlus4` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeMailStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeManagerKey` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerKeyNumeric` | Edm.Int64 · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeManagerMlsId` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OfficeNationalAssociationId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeNationalAssociationIdInsertDate` | Edm.Date · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePreferredMedia` | Enums.PreferredMedia · PreferredMedia · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryAorId` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficePrimaryStateOrProvince` | Enums.StateOrProvince · StateOrProvince · lookup 100 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeStreetAdditionalInfo` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OfficeType` | Enums.OfficeType · OfficeType · lookup 12 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OtherPhone` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 1) · SUPPRESSED · n/a / 0 Active · RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SocialMediaType` | Enums.SocialMediaType · SocialMediaType · lookup 17 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateAgentOption` | Enums.SyndicateAgentOption · SyndicateAgentOption · lookup 2 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `VirtualOfficeWebsiteYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.Media` → Media (56 fields, accessible) — **PARTIAL**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `MediaClassification` | Enums.MediaClassification · MediaClassification · lookup 4 (RLS 0) · filterable · 2,000,898 · not RLS | media-lane: `lib/media/listing-media-resolver.ts:124` `lib/idx/media-sync.ts:12` `lib/idx/media-sync.ts:1091` | 4 | **PARTIAL** |
| `MediaKey` | Edm.String · filterable · 2,000,898 · RLS | media-lane: `lib/media/media-sync-service.ts:209` `lib/idx/media-sync.ts:12` `lib/idx/media-sync.ts:1061`; dto: `lib/search/engine/hydrate.ts:44`; sync: `lib/idx/fetch.ts:32` `lib/idx/sync.ts:1341` `lib/idx/sync.ts:2752`; other: `lib/idx/write-suppression.ts:302` | 19 | **PARTIAL** |
| `MediaKeyNumeric` | Edm.Int64 · filterable · 2,000,898 · RLS | — | — | **MISSING** |
| `MediaModificationTimestamp` | Edm.DateTimeOffset · filterable · 2,000,898 · RLS | media-lane: `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:330` `lib/idx/media-sync.ts:430` +1 | 3 | **PARTIAL** |
| `MediaStatus` | Enums.MediaStatus · MediaStatus · lookup 3 (RLS 1) · filterable · 2,000,898 · RLS | media-lane: `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1067`; dto: `lib/search/engine/hydrate.ts:44`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:32` | 9 | **PARTIAL** |
| `MediaType` | Enums.MediaType · MediaType · lookup 22 (RLS 7) · filterable · 2,000,898 · RLS | dto: `lib/search/engine/hydrate.ts:44`; sync: `lib/idx/fetch.ts:32` | — | **PARTIAL** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 2,000,898 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `Order` | Edm.Int32 · filterable · 2,000,898 · RLS | media-lane: `lib/media/listing-media-resolver.ts:345` `lib/media/media-sync-service.ts:323` `lib/idx/media-sync.ts:13` +1; dto: `lib/search/engine/hydrate.ts:44`; sync: `lib/idx/fetch.ts:26` `lib/idx/fetch.ts:32` `lib/idx/fetch.ts:693` +4; other: `lib/idx/agent-card-media.ts:37` `lib/idx/write-suppression.ts:299` | 32 | **PARTIAL** |
| `OriginatingSystemMediaKey` | Edm.String · filterable · 2,000,898 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 2,000,898 · not RLS | — | — | **MISSING** |
| `OriginatingSystemResourceRecordKey` | Edm.String · filterable · 2,000,898 · RLS | — | — | **MISSING** |
| `RecordSignature` | Edm.Int32 · filterable · 2,000,898 · not RLS | — | — | **MISSING** |
| `ResourceName` | Enums.ResourceName · ResourceName · lookup 5 (RLS 3) · filterable · 2,000,898 · RLS | — | 1 | **MISSING** |
| `ResourceRecordKey` | Edm.String · filterable · 2,000,898 · RLS | media-lane: `lib/idx/media-sync.ts:12` `lib/idx/media-sync.ts:1086` `app/api/media/batch/route.ts:126` +1; dto: `lib/search/engine/hydrate.ts:44` `lib/search/engine/hydrate.ts:65`; sync: `lib/idx/fetch.ts:27` `lib/idx/sync.ts:1320` `lib/idx/sync.ts:1944` +1; other: `lib/idx/agent-card-media.ts:26` | 17 | **PARTIAL** |
| `ResourceRecordKeyNumeric` | Edm.Int64 · filterable · 2,000,898 · RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 2,000,898 · RLS | — | — | **MISSING** |
| `MediaCategory` | Enums.MediaCategory · MediaCategory · lookup 18 (RLS 8) · filterable · 2,000,897 · RLS | media-lane: `lib/media/listing-media-resolver.ts:123` `lib/media/media-sync-service.ts:319` `lib/idx/media-sync.ts:12` +2; dto: `lib/search/crm-idx-mapper.ts:34` `lib/search/engine/hydrate.ts:44`; workspace: `lib/buildings/upsert.ts:139` `lib/buildings/upsert.ts:140`; sync: `lib/idx/fetch.ts:26` `lib/idx/fetch.ts:32` `lib/idx/fetch.ts:675` +4; other: `lib/idx/write-suppression.ts:298` | 35 | **PARTIAL** |
| `ResourceRecordID` | Edm.String · filterable · 2,000,888 · RLS | media-lane: `lib/idx/media-sync.ts:12` `lib/idx/media-sync.ts:1087` `app/api/media/batch/route.ts:126` +1; dto: `lib/search/engine/hydrate.ts:44`; sync: `lib/idx/sync.ts:1945`; other: `lib/idx/agent-card-media.ts:26` | 9 | **PARTIAL** |
| `InternetEntireListingDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 2,000,836 · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2944`; dto: `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:87`; workspace: `app/api/crm/listings/[id]/route.ts:323`; other: `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` `lib/compliance/rebny-ucba-rules.ts:783` +10 | 33 | **PARTIAL** |
| `ListOfficeMlsId` | Edm.String · filterable · 2,000,836 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` `app/api/crm/listings/[id]/route.ts:454`; other: `app/api/listings/suggest/route.ts:95` `lib/syndication/eligibility.ts:142` `lib/listings/agent-info-typed-columns.ts:55` +1 | 16 | **PARTIAL** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 0) · filterable · 2,000,836 · not RLS | — | — | **MISSING** |
| `PropertyType` | Enums.PropertyType · PropertyType · lookup 13 (RLS 0) · filterable · 2,000,836 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:963` `lib/buildings/public-building-data.ts:974` +8; criterion: `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` `lib/search/canonical/field-registry.ts:132`; other: `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` `lib/compliance/rls-enforcement.ts:322` +12 | 48 | **PARTIAL** |
| `StandardStatus` | Enums.StandardStatus · StandardStatus · lookup 11 (RLS 11) · filterable · 2,000,836 · not RLS | media-lane: `lib/idx/media-sync.ts:9`; dto: `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:173`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:933` `lib/buildings/public-building-data.ts:936` +3; criterion: `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` `lib/search/engine/criteria.ts:165` +1; sync: `app/api/cron/prospect-triggers/route.ts:218` `app/api/cron/feed-reconcile/route.ts:445`; other: `lib/compliance/gates.ts:119` `lib/cotality/live-contract.ts:121` `lib/listings/mallan-form-contract.ts:24` +4 | 61 | **PARTIAL** |
| `ListOfficeKey` | Edm.String · filterable · 2,000,750 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` | 2 | **PARTIAL** |
| `PropertySubType` | Enums.PropertySubType · PropertySubType · lookup 76 (RLS 0) · filterable · 2,000,293 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:272`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:974` `lib/buildings/public-building-data.ts:1038` +10; criterion: `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` `lib/search/canonical/field-registry.ts:170` +1; other: `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` `lib/compliance/rebny-validator.ts:366` +10 | 25 | **PARTIAL** |
| `ListAgentKey` | Edm.String · filterable · 1,987,830 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:436`; other: `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | 2 | **PARTIAL** |
| `SourceSystemMediaKey` | Edm.String · filterable · 1,840,948 · RLS | — | — | **MISSING** |
| `PropertySubTypeAdditional` | Enums.Multi.PropertySubTypeAdditional · PropertySubTypeAdditional (multi) · lookup 76 (RLS 0) · filterable · 1,821,445 · not RLS | — | — | **MISSING** |
| `ListingPermission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · filterable · 1,699,794 · not RLS | — | 7 | **MISSING** |
| `MediaObjectID` | Edm.String · filterable · 1,562,623 · RLS | — | — | **MISSING** |
| `OffMarketDate` | Edm.Date · filterable · 1,362,225 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:352` `lib/listings/terminal-since.ts:76` | 1 | **PARTIAL** |
| `OriginatingSystemID` | Edm.String · filterable · 1,318,099 · RLS | — | — | **MISSING** |
| `MediaURL` | Edm.String · filterable · 589,848 · not RLS | media-lane: `lib/media/listing-media-resolver.ts:132` `lib/media/listing-media-resolver.ts:339` `lib/media/media-sync-service.ts:310` +4; dto: `lib/search/engine/hydrate.ts:44`; workspace: `lib/buildings/public-building-data.ts:68` `lib/buildings/public-building-data.ts:70` `lib/buildings/upsert.ts:141` +3; sync: `lib/idx/fetch.ts:26` `lib/idx/fetch.ts:32` `lib/idx/fetch.ts:677` +7; other: `lib/idx/agent-card-media.ts:27` `lib/idx/agent-card-media.ts:35` `lib/idx/write-suppression.ts:295` +2 | 38 | **PARTIAL** |
| `ShortDescription` | Edm.String · filterable · 133,895 · not RLS | media-lane: `lib/media/listing-media-resolver.ts:125`; sync: `lib/idx/fetch.ts:26` `lib/idx/fetch.ts:32` `lib/idx/fetch.ts:676` | 1 | **PARTIAL** |
| `PreferredPhotoYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 71,570 · RLS | media-lane: `lib/media/listing-media-resolver.ts:350` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1093`; dto: `lib/search/engine/hydrate.ts:44`; sync: `lib/idx/fetch.ts:26` `lib/idx/fetch.ts:32` `lib/idx/fetch.ts:689` +3; other: `lib/idx/agent-card-media.ts:32` | 17 | **PARTIAL** |
| `LongDescription` | Edm.String · filterable · 31,738 · RLS | — | — | **MISSING** |
| `ImageOf` | Enums.ImageOf · ImageOf · lookup 92 (RLS 1) · filterable · 1 · not RLS | — | — | **MISSING** |
| `ChangedByMemberID` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ChangedByMemberKey` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ChangedByMemberKeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ClassName` | Enums.ClassName · ClassName · lookup 17 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `HumanModifiedYN` | Edm.Boolean · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ImageHeight` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ImageSizeDescription` | Edm.String · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ImageWidth` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ListAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MediaAlteration` | Enums.Multi.MediaAlteration · MediaAlteration (multi) · lookup 10 (RLS 0) · SUPPRESSED · n/a · not RLS | — | — | **PROVIDER-UNAVAILABLE** — population unmeasured |
| `MediaHTML` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `MediaStatusDescription` | Edm.String · SUPPRESSED · n/a · not RLS | — | — | **PROVIDER-UNAVAILABLE** — population unmeasured |
| `OriginalMediaUrl` | Edm.String · filterable · 0 · not RLS | — | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OriginatingSystemResourceRecordId` | Edm.String · SUPPRESSED · n/a · not RLS | — | — | **PROVIDER-UNAVAILABLE** — population unmeasured |
| `Permission` | Enums.Multi.Permission · Permission (multi) · lookup 7 (RLS 2) · SUPPRESSED · n/a · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — population unmeasured |
| `SourceSystemName` | Edm.String · filterable · 0 · not RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SourceSystemResourceRecordKey` | Edm.String · SUPPRESSED · n/a · RLS | — | — | **PROVIDER-UNAVAILABLE** — population unmeasured |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `X_MediaStream` | Edm.String · SUPPRESSED · n/a · not RLS | — | — | **PROVIDER-UNAVAILABLE** — population unmeasured |

### `Property.OpenHouse` → OpenHouse (47 fields, accessible) — **PARTIAL**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 1,483 · not RLS | — | 1 | **MISSING** |
| `InternetEntireListingDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 1,483 · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2944`; dto: `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:87`; workspace: `app/api/crm/listings/[id]/route.ts:323`; other: `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` `lib/compliance/rebny-ucba-rules.ts:783` +10 | 33 | **PARTIAL** |
| `ListAgentKey` | Edm.String · filterable · 1,483 · RLS | workspace: `app/api/crm/listings/[id]/route.ts:436`; other: `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | 2 | **PARTIAL** |
| `ListingId` | Edm.String · filterable · 1,483 · RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3703`; dto: `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:284` `lib/search/crm-idx-mapper.ts:354`; workspace: `lib/open-houses/upcoming-open-houses.ts:261` `lib/open-houses/upcoming-open-houses.ts:268` `lib/open-houses/upcoming-open-houses.ts:303` +23; criterion: `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` `lib/search/engine/provider-query.ts:126` +2; sync: `lib/idx/sync.ts:1237` `lib/idx/sync.ts:2650` `app/api/cron/feed-reconcile/route.ts:113` +13; other: `lib/listings/mallan-form-contract.ts:453` `lib/idx/orphan-chunk.ts:49` `lib/idx/orphan-chunk.ts:52` +17 | 52 | **PARTIAL** |
| `ListingKey` | Edm.String · filterable · 1,483 · RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3680` `lib/idx/media-sync.ts:3682` +1; dto: `lib/search/engine/hydrate.ts:70`; workspace: `lib/open-houses/upcoming-open-houses.ts:303` `lib/buildings/public-building-data.ts:81` `lib/buildings/public-building-data.ts:959` +11; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` `lib/search/engine/universe.ts:147` +6; sync: `lib/idx/sync.ts:1236` `lib/idx/sync.ts:2649` `lib/idx/sync.ts:683` +1; other: `lib/listings/mallan-form-contract.ts:447` `lib/idx/one-cycle-preflight.ts:235` `lib/idx/one-cycle-preflight.ts:246` +14 | 57 | **PARTIAL** |
| `ListingKeyNumeric` | Edm.Int64 · filterable · 1,483 · RLS | media-lane: `lib/idx/media-sync.ts:8`; other: `lib/idx/cotality-public-dto.ts:89` | 3 | **PARTIAL** |
| `ListOfficeKey` | Edm.String · filterable · 1,483 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` | 2 | **PARTIAL** |
| `ListOfficeMlsId` | Edm.String · filterable · 1,483 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` `app/api/crm/listings/[id]/route.ts:454`; other: `app/api/listings/suggest/route.ts:95` `lib/syndication/eligibility.ts:142` `lib/listings/agent-info-typed-columns.ts:55` +1 | 16 | **PARTIAL** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 1,483 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OpenHouseDate` | Edm.Date · filterable · 1,483 · RLS | workspace: `lib/open-houses/upcoming-open-houses.ts:307` `app/api/open-houses/route.ts:251` `app/api/open-houses/route.ts:373` | 1 | **PARTIAL** |
| `OpenHouseEndTime` | Edm.DateTimeOffset · filterable · 1,483 · RLS | workspace: `lib/open-houses/upcoming-open-houses.ts:309` `app/api/open-houses/route.ts:253` `app/api/open-houses/route.ts:375` | 1 | **PARTIAL** |
| `OpenHouseId` | Edm.String · filterable · 1,483 · RLS | — | — | **MISSING** |
| `OpenHouseKey` | Edm.String · filterable · 1,483 · RLS | workspace: `app/api/open-houses/route.ts:247` `app/api/open-houses/route.ts:369` | 1 | **PARTIAL** |
| `OpenHouseKeyNumeric` | Edm.Int64 · filterable · 1,483 · RLS | — | — | **MISSING** |
| `OpenHouseStartTime` | Edm.DateTimeOffset · filterable · 1,483 · RLS | workspace: `lib/open-houses/upcoming-open-houses.ts:308` `app/api/open-houses/route.ts:252` `app/api/open-houses/route.ts:374` | 1 | **PARTIAL** |
| `OpenHouseStatus` | Enums.OpenHouseStatus · OpenHouseStatus · lookup 3 (RLS 3) · filterable · 1,483 · RLS | — | 1 | **MISSING** |
| `OriginatingSystemKey` | Edm.String · filterable · 1,483 · RLS | — | — | **MISSING** |
| `OriginatingSystemListingKey` | Edm.String · filterable · 1,483 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 1,483 · not RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 0) · filterable · 1,483 · not RLS | — | — | **MISSING** |
| `PropertySubType` | Enums.PropertySubType · PropertySubType · lookup 76 (RLS 0) · filterable · 1,483 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:272`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:974` `lib/buildings/public-building-data.ts:1038` +10; criterion: `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` `lib/search/canonical/field-registry.ts:170` +1; other: `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` `lib/compliance/rebny-validator.ts:366` +10 | 25 | **PARTIAL** |
| `PropertyType` | Enums.PropertyType · PropertyType · lookup 13 (RLS 0) · filterable · 1,483 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:963` `lib/buildings/public-building-data.ts:974` +8; criterion: `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` `lib/search/canonical/field-registry.ts:132`; other: `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` `lib/compliance/rls-enforcement.ts:322` +12 | 48 | **PARTIAL** |
| `RecordSignature` | Edm.Int32 · filterable · 1,483 · not RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 1,483 · RLS | — | — | **MISSING** |
| `SourceSystemName` | Edm.String · filterable · 1,483 · RLS | criterion: `lib/search/canonical/field-registry.ts:117` | — | **PARTIAL** |
| `StandardStatus` | Enums.StandardStatus · StandardStatus · lookup 11 (RLS 11) · filterable · 1,483 · not RLS | media-lane: `lib/idx/media-sync.ts:9`; dto: `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:173`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:933` `lib/buildings/public-building-data.ts:936` +3; criterion: `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` `lib/search/engine/criteria.ts:165` +1; sync: `app/api/cron/prospect-triggers/route.ts:218` `app/api/cron/feed-reconcile/route.ts:445`; other: `lib/compliance/gates.ts:119` `lib/cotality/live-contract.ts:121` `lib/listings/mallan-form-contract.ts:24` +4 | 61 | **PARTIAL** |
| `AppointmentRequiredYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 1,474 · RLS | workspace: `lib/open-houses/upcoming-open-houses.ts:311` `app/api/open-houses/route.ts:262` `app/api/open-houses/route.ts:384` | 2 | **PARTIAL** |
| `PropertySubTypeAdditional` | Enums.Multi.PropertySubTypeAdditional · PropertySubTypeAdditional (multi) · lookup 76 (RLS 0) · filterable · 1,430 · not RLS | — | — | **MISSING** |
| `ShowingAgentKey` | Edm.String · filterable · 1,373 · RLS | — | — | **MISSING** |
| `ShowingAgentMlsID` | Edm.String · filterable · 1,373 · RLS | — | — | **MISSING** |
| `ShowingAgentFirstName` | Edm.String · filterable · 1,196 · RLS | — | — | **MISSING** |
| `ShowingAgentLastName` | Edm.String · filterable · 1,196 · RLS | — | — | **MISSING** |
| `OpenHouseType` | Enums.OpenHouseType · OpenHouseType · lookup 9 (RLS 2) · filterable · 613 · RLS | — | 2 | **MISSING** |
| `ListingPermission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · filterable · 604 · not RLS | — | 7 | **MISSING** |
| `OffMarketDate` | Edm.Date · filterable · 100 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:352` `lib/listings/terminal-since.ts:76` | 1 | **PARTIAL** |
| `OriginatingSystemID` | Edm.String · filterable · 14 · RLS | — | — | **MISSING** |
| `ListAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `LivestreamOpenHouseURL` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OpenHouseAttendedBy` | Enums.Attended · Attended · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `OpenHouseRemarks` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | workspace: `lib/open-houses/upcoming-open-houses.ts:312` `app/api/open-houses/route.ts:263` `app/api/open-houses/route.ts:385` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `OriginalEntryTimestamp` | Edm.DateTimeOffset · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:121` `lib/idx/write-suppression.ts:655` | 1 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `Refreshments` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `ShowingAgentKeyNumeric` | Edm.Int64 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SourceSystemKey` | Edm.String · SUPPRESSED · n/a / 0 Active · RLS | dto: `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:285` `lib/search/crm-idx-mapper.ts:354`; workspace: `lib/buildings/public-building-data.ts:81`; sync: `lib/idx/sync.ts:1236` `lib/idx/sync.ts:2649` `lib/idx/sync.ts:1179` +1; other: `lib/compliance/rebny-ucba-rules.ts:120` `lib/listings/mallan-form-contract.ts:440` `app/api/listings/similar/route.ts:463` +1 | 9 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SourceSystemListingKey` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.Rooms` → PropertyRooms (39 fields, accessible) — **MISSING**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 86 · not RLS | — | 1 | **MISSING** |
| `InputEntryOrder` | Edm.Int32 · filterable · 86 · RLS | — | — | **MISSING** |
| `InternetEntireListingDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 86 · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2944`; dto: `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:87`; workspace: `app/api/crm/listings/[id]/route.ts:323`; other: `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` `lib/compliance/rebny-ucba-rules.ts:783` +10 | 33 | **PARTIAL** |
| `ListAgentKey` | Edm.String · filterable · 86 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:436`; other: `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | 2 | **PARTIAL** |
| `ListingId` | Edm.String · filterable · 86 · RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3703`; dto: `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:284` `lib/search/crm-idx-mapper.ts:354`; workspace: `lib/open-houses/upcoming-open-houses.ts:261` `lib/open-houses/upcoming-open-houses.ts:268` `lib/open-houses/upcoming-open-houses.ts:303` +23; criterion: `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` `lib/search/engine/provider-query.ts:126` +2; sync: `lib/idx/sync.ts:1237` `lib/idx/sync.ts:2650` `app/api/cron/feed-reconcile/route.ts:113` +13; other: `lib/listings/mallan-form-contract.ts:453` `lib/idx/orphan-chunk.ts:49` `lib/idx/orphan-chunk.ts:52` +17 | 52 | **PARTIAL** |
| `ListingKey` | Edm.String · filterable · 86 · RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3680` `lib/idx/media-sync.ts:3682` +1; dto: `lib/search/engine/hydrate.ts:70`; workspace: `lib/open-houses/upcoming-open-houses.ts:303` `lib/buildings/public-building-data.ts:81` `lib/buildings/public-building-data.ts:959` +11; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` `lib/search/engine/universe.ts:147` +6; sync: `lib/idx/sync.ts:1236` `lib/idx/sync.ts:2649` `lib/idx/sync.ts:683` +1; other: `lib/listings/mallan-form-contract.ts:447` `lib/idx/one-cycle-preflight.ts:235` `lib/idx/one-cycle-preflight.ts:246` +14 | 57 | **PARTIAL** |
| `ListingKeyNumeric` | Edm.Int64 · filterable · 86 · RLS | media-lane: `lib/idx/media-sync.ts:8`; other: `lib/idx/cotality-public-dto.ts:89` | 3 | **PARTIAL** |
| `ListingPermission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · filterable · 86 · not RLS | — | 7 | **MISSING** |
| `ListOfficeKey` | Edm.String · filterable · 86 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` | 2 | **PARTIAL** |
| `ListOfficeMlsId` | Edm.String · filterable · 86 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` `app/api/crm/listings/[id]/route.ts:454`; other: `app/api/listings/suggest/route.ts:95` `lib/syndication/eligibility.ts:142` `lib/listings/agent-info-typed-columns.ts:55` +1 | 16 | **PARTIAL** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 86 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OriginatingSystemListingKey` | Edm.String · filterable · 86 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 86 · not RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 0) · filterable · 86 · not RLS | — | — | **MISSING** |
| `PropertySubType` | Enums.PropertySubType · PropertySubType · lookup 76 (RLS 0) · filterable · 86 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:272`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:974` `lib/buildings/public-building-data.ts:1038` +10; criterion: `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` `lib/search/canonical/field-registry.ts:170` +1; other: `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` `lib/compliance/rebny-validator.ts:366` +10 | 25 | **PARTIAL** |
| `PropertyType` | Enums.PropertyType · PropertyType · lookup 13 (RLS 0) · filterable · 86 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:963` `lib/buildings/public-building-data.ts:974` +8; criterion: `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` `lib/search/canonical/field-registry.ts:132`; other: `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` `lib/compliance/rls-enforcement.ts:322` +12 | 48 | **PARTIAL** |
| `RoomKey` | Edm.String · filterable · 86 · RLS | — | — | **MISSING** |
| `RoomKeyNumeric` | Edm.Int64 · filterable · 86 · RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 86 · RLS | — | — | **MISSING** |
| `StandardStatus` | Enums.StandardStatus · StandardStatus · lookup 11 (RLS 11) · filterable · 86 · not RLS | media-lane: `lib/idx/media-sync.ts:9`; dto: `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:173`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:933` `lib/buildings/public-building-data.ts:936` +3; criterion: `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` `lib/search/engine/criteria.ts:165` +1; sync: `app/api/cron/prospect-triggers/route.ts:218` `app/api/cron/feed-reconcile/route.ts:445`; other: `lib/compliance/gates.ts:119` `lib/cotality/live-contract.ts:121` `lib/listings/mallan-form-contract.ts:24` +4 | 61 | **PARTIAL** |
| `OffMarketDate` | Edm.Date · filterable · 81 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:352` `lib/listings/terminal-since.ts:76` | 1 | **PARTIAL** |
| `RoomType` | Enums.RoomType · RoomType · lookup 122 (RLS 6) · filterable · 74 · not RLS | — | — | **MISSING** |
| `RoomArea` | Edm.Decimal · filterable · 44 · not RLS | — | — | **MISSING** |
| `RoomAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 1) · filterable · 44 · not RLS | — | — | **MISSING** |
| `RoomAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 1) · filterable · 44 · not RLS | — | — | **MISSING** |
| `PropertySubTypeAdditional` | Enums.Multi.PropertySubTypeAdditional · PropertySubTypeAdditional (multi) · lookup 76 (RLS 0) · filterable · 21 · not RLS | — | — | **MISSING** |
| `ListAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `RecordSignature` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomDescription` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `RoomDimensions` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomFeatures` | Enums.Multi.InteriorOrRoomFeatures · InteriorOrRoomFeatures (multi) · lookup 303 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomFlooring` | Enums.Multi.Flooring · Flooring (multi) · lookup 62 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomLength` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomLengthWidthSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomLengthWidthUnits` | Enums.LinearUnits · LinearUnits · lookup 4 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomLevel` | Enums.RoomLevel · RoomLevel · lookup 15 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `RoomWidth` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

### `Property.UnitTypes` → PropertyUnitTypes (52 fields, accessible) — **MISSING**

| Field | Live (type · lookup · filterable · populated · RLS) | Read by (stage: sites) | Tests | Verdict |
|---|---|---|---|---|
| `HumanModifiedYN` | Edm.Boolean · filterable · 1 · not RLS | — | 1 | **MISSING** |
| `InputEntryOrder` | Edm.Int32 · filterable · 1 · RLS | — | — | **MISSING** |
| `InternetEntireListingDisplayYN` | Edm.Boolean · lookup 2 (RLS 2) · filterable · 1 · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2944`; dto: `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:87`; workspace: `app/api/crm/listings/[id]/route.ts:323`; other: `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` `lib/compliance/rebny-ucba-rules.ts:783` +10 | 33 | **PARTIAL** |
| `ListAgentKey` | Edm.String · filterable · 1 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:436`; other: `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | 2 | **PARTIAL** |
| `ListingId` | Edm.String · filterable · 1 · RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3703`; dto: `lib/search/crm-idx-mapper.ts:245` `lib/search/crm-idx-mapper.ts:284` `lib/search/crm-idx-mapper.ts:354`; workspace: `lib/open-houses/upcoming-open-houses.ts:261` `lib/open-houses/upcoming-open-houses.ts:268` `lib/open-houses/upcoming-open-houses.ts:303` +23; criterion: `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` `lib/search/engine/provider-query.ts:126` +2; sync: `lib/idx/sync.ts:1237` `lib/idx/sync.ts:2650` `app/api/cron/feed-reconcile/route.ts:113` +13; other: `lib/listings/mallan-form-contract.ts:453` `lib/idx/orphan-chunk.ts:49` `lib/idx/orphan-chunk.ts:52` +17 | 52 | **PARTIAL** |
| `ListingKey` | Edm.String · filterable · 1 · RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3680` `lib/idx/media-sync.ts:3682` +1; dto: `lib/search/engine/hydrate.ts:70`; workspace: `lib/open-houses/upcoming-open-houses.ts:303` `lib/buildings/public-building-data.ts:81` `lib/buildings/public-building-data.ts:959` +11; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` `lib/search/engine/universe.ts:147` +6; sync: `lib/idx/sync.ts:1236` `lib/idx/sync.ts:2649` `lib/idx/sync.ts:683` +1; other: `lib/listings/mallan-form-contract.ts:447` `lib/idx/one-cycle-preflight.ts:235` `lib/idx/one-cycle-preflight.ts:246` +14 | 57 | **PARTIAL** |
| `ListingKeyNumeric` | Edm.Int64 · filterable · 1 · RLS | media-lane: `lib/idx/media-sync.ts:8`; other: `lib/idx/cotality-public-dto.ts:89` | 3 | **PARTIAL** |
| `ListingPermission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · filterable · 1 · not RLS | — | 7 | **MISSING** |
| `ListOfficeKey` | Edm.String · filterable · 1 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` | 2 | **PARTIAL** |
| `ListOfficeMlsId` | Edm.String · filterable · 1 · not RLS | workspace: `app/api/crm/listings/[id]/route.ts:438` `app/api/crm/listings/[id]/route.ts:454`; other: `app/api/listings/suggest/route.ts:95` `lib/syndication/eligibility.ts:142` `lib/listings/agent-info-typed-columns.ts:55` +1 | 16 | **PARTIAL** |
| `ModificationTimestamp` | Edm.DateTimeOffset · filterable · 1 · not RLS | media-lane: `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:326` +3; dto: `lib/search/crm-idx-mapper.ts:291` `lib/search/crm-idx-mapper.ts:292`; workspace: `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; criterion: `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sync: `lib/idx/fetch.ts:27` `lib/idx/fetch.ts:481` `lib/idx/sync.ts:682` +1; other: `lib/idx/write-suppression.ts:654` `lib/idx/one-cycle-preflight.ts:51` `lib/idx/one-cycle-preflight.ts:279` +1 | 51 | **PARTIAL** |
| `OffMarketDate` | Edm.Date · filterable · 1 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:352` `lib/listings/terminal-since.ts:76` | 1 | **PARTIAL** |
| `OriginatingSystemListingKey` | Edm.String · filterable · 1 · RLS | — | — | **MISSING** |
| `OriginatingSystemName` | Edm.String · filterable · 1 · not RLS | — | — | **MISSING** |
| `OriginatingSystemSubName` | Edm.String · lookup 880 (RLS 0) · filterable · 1 · not RLS | — | — | **MISSING** |
| `PropertySubType` | Enums.PropertySubType · PropertySubType · lookup 76 (RLS 0) · filterable · 1 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:272`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:974` `lib/buildings/public-building-data.ts:1038` +10; criterion: `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` `lib/search/canonical/field-registry.ts:170` +1; other: `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` `lib/compliance/rebny-validator.ts:366` +10 | 25 | **PARTIAL** |
| `PropertyType` | Enums.PropertyType · PropertyType · lookup 13 (RLS 0) · filterable · 1 · not RLS | dto: `lib/search/crm-idx-mapper.ts:30`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:963` `lib/buildings/public-building-data.ts:974` +8; criterion: `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` `lib/search/canonical/field-registry.ts:132`; other: `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` `lib/compliance/rls-enforcement.ts:322` +12 | 48 | **PARTIAL** |
| `RecordSignature` | Edm.Int32 · filterable · 1 · not RLS | — | — | **MISSING** |
| `SourceSystemID` | Edm.String · filterable · 1 · RLS | — | — | **MISSING** |
| `StandardStatus` | Enums.StandardStatus · StandardStatus · lookup 11 (RLS 11) · filterable · 1 · not RLS | media-lane: `lib/idx/media-sync.ts:9`; dto: `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:173`; workspace: `lib/buildings/public-building-data.ts:83` `lib/buildings/public-building-data.ts:933` `lib/buildings/public-building-data.ts:936` +3; criterion: `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` `lib/search/engine/criteria.ts:165` +1; sync: `app/api/cron/prospect-triggers/route.ts:218` `app/api/cron/feed-reconcile/route.ts:445`; other: `lib/compliance/gates.ts:119` `lib/cotality/live-contract.ts:121` `lib/listings/mallan-form-contract.ts:24` +4 | 61 | **PARTIAL** |
| `UnitTypeKey` | Edm.String · filterable · 1 · RLS | — | — | **MISSING** |
| `UnitTypeKeyNumeric` | Edm.Int64 · filterable · 1 · RLS | — | — | **MISSING** |
| `ListAOR` | Enums.AOR · AOR · lookup 1127 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `Permission` | Enums.Multi.ListingPermission · ListingPermission (multi) · lookup 18 (RLS 0) · SUPPRESSED · n/a / 0 Active · not RLS | media-lane: `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:13` `lib/idx/media-sync.ts:1073`; criterion: `lib/search/canonical/live-truth.ts:114` `lib/search/canonical/field-registry.ts:198`; other: `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` `lib/compliance/rls-enforcement.ts:407` +4 | 25 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `PropertySubTypeAdditional` | Enums.Multi.PropertySubTypeAdditional · PropertySubTypeAdditional (multi) · lookup 76 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `SyndicateTo` | Enums.Multi.SyndicateTo · SyndicateTo (multi) · lookup 28 (RLS 0) · filterable · 0 · not RLS | other: `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` `lib/compliance/rls-enforcement.ts:436` | 10 | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeActualRent` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeActualRentRange` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeArea` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeAreaSource` | Enums.AreaSource · AreaSource · lookup 18 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeAreaUnits` | Enums.AreaUnits · AreaUnits · lookup 3 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeBathsTotal` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeBedsTotal` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeDeposit` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeDescription` | Edm.String · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `UnitTypeFireplaceYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeFurnished` | Enums.Furnished · Furnished · lookup 5 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeGarageAttachedYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeGarageSpaces` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeLeasedYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeLeaseExpires` | Edm.DateTimeOffset · SUPPRESSED · n/a / 0 Active · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · suppressed (provider Level) — null on every row · wired for sync: no |
| `UnitTypeMonthToMonthYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeNumFullBaths` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeNumHalfBaths` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeOccupantType` | Enums.Multi.UnitTypeOccupantType · UnitTypeOccupantType (multi) · lookup 7 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypePetDeposit` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypePetDepositPerPetYN` | Edm.Boolean · lookup 2 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeProForma` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeTotalRent` | Edm.Decimal · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeType` | Enums.UnitTypeType · UnitTypeType · lookup 22 (RLS 0) · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeUnitNum` | Edm.String · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |
| `UnitTypeUnitsTotal` | Edm.Int32 · filterable · 0 · not RLS | — | — | **PROVIDER-UNAVAILABLE** — declared · 0 rows · wired for sync: no |

## F. Provider-suppressed fields — measured, not assumed

`filterable:false` means the provider rejects `$filter` on the field ("suppressed (provider Level)"). The row-by-row census selects every suppressed field on every row of the scoped corpus and counts non-null values.

| Census | Resource | Scope | Rows walked | Suppressed fields | Fields with ≥1 non-null value | Mallan code still binding or reading one of them |
|---|---|---|---|---|---|---|
| Active | Property | StandardStatus eq 'Active' | 7,600 | 221 | **0** | `BuildingKeyNumeric`, `Concessions`, `ConcessionsAmount`, `ConcessionsComments`, `CopyrightNotice`, `Country`, `CumulativeDaysOnMarket`, `DaysOnMarket`, `ExpirationDate`, `InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `Latitude`, `LockBoxLocation`, `LockBoxType`, `Longitude`, `MLSAreaMajor`, `MapCoordinate`, `MlsStatus`, `PreviousStandardStatus`, `PrivateRemarks`, `PropertyCondition`, `ShowingInstructions`, `ShowingRequirements`, `SourceSystemKey`, `SourceSystemName`, `SyndicationRemarks`, `Vegetation` |
| Active | Member | all (resource has no StandardStatus) | 11,191 | 15 | **0** | `Permission` |
| Active | Office | all (resource has no StandardStatus) | 578 | 12 | **0** | `Permission` |
| Active | OpenHouse | StandardStatus eq 'Active' | 1,408 | 5 | **0** | `OpenHouseRemarks`, `Permission`, `SourceSystemKey` |
| Active | CustomProperty | StandardStatus eq 'Active' | 7,637 | 28 | **0** | `Permission`, `SourceSystemKey` |
| Active | PropertyRooms | StandardStatus eq 'Active' | 2 | 2 | **0** | `Permission` |
| Active | PropertyUnitTypes | StandardStatus eq 'Active' | 0 | 3 | **0** | `Permission` |
| all statuses | Property | all | 591,597 | 221 | **0** | `BuildingKeyNumeric`, `Concessions`, `ConcessionsAmount`, `ConcessionsComments`, `CopyrightNotice`, `Country`, `CumulativeDaysOnMarket`, `DaysOnMarket`, `ExpirationDate`, `InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `Latitude`, `LockBoxLocation`, `LockBoxType`, `Longitude`, `MLSAreaMajor`, `MapCoordinate`, `MlsStatus`, `PreviousStandardStatus`, `PrivateRemarks`, `PropertyCondition`, `ShowingInstructions`, `ShowingRequirements`, `SourceSystemKey`, `SourceSystemName`, `SyndicationRemarks`, `Vegetation` |

