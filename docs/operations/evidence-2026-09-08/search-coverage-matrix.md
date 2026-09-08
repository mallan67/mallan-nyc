# Search coverage matrix v3 — provider fact × provider access path × Mallan consumer graph (2026-09-08)

Feed: ID Trestle-11371-20 "IDX Plus feed for Mallan Real Estate Inc", TransportVersion 1.0.0, DataDictionaryVersion 2.0 (read live 2026-09-08).. Provider facts from `data/cotality-contract/*` (entitled $metadata, light probe 2026-09-08T06:26:36.364Z) and the live censuses under `docs/operations/evidence-2026-09-08/` (suppressed fields: 591,597 rows all statuses; enum members: 63 fields; observed vocabulary: groupby, all statuses; navigation capability: 2026-09-08T08:04:17.508Z; navigation walks: Active + all statuses; transaction state: 591,599 rows). Mallan facts from the TypeScript program (mapper dataflow, reader census, selection authorities, the form contract parsed from its AST, the four CRM surfaces parsed from their HTML) and the test tree. Declared tables (primary semantics, served-domain hints, required consumers, tool scopes, behaviour register) are policy and are printed in §L.

Never collapsed: **provider availability** (POPULATED · DECLARED-EMPTY (RLS-defined) · NOT-ON-FEED (not RLS-defined) · SUPPRESSED — filter rejected, null on every walked row, proves nothing is delivered today, not that it never can be · REJECTED-RESOURCE · UNMEASURED), **provider access path** (§A.1), and **Mallan consumers** as independent columns. A field has one primary semantic and many consumers; the domains it serves are declared hints plus the domains of the consumers actually found. Sale and Rental search are classified from the workflow context of the reading code; forms and tools from the surface the control lives on. COMPLETE only when every required consumer for the primary semantic is mechanically PASS; reachable-only (~) and unproven behaviour stay UNVERIFIED.

## A. Provider graph — resources, navigations, access paths (live)

| Resource | Entitled | Entity set | Entitled fields | Catalogue fields | Catalogue-only | Declared navigations | Runtime pulls |
|---|---|---|---|---|---|---|---|
| Building | no | HTTP 403 | 1 | 354 | 353 | Media→Media (PROVIDER_REJECTED 403), Property→Property (PROVIDER_REJECTED 403) | **never** |
| CustomProperty | yes | HTTP 200 | 142 | 171 | 31 | Property→Property (SUPPORTED 200) | `lib/idx/fetch.ts` |
| Enumeration | no | HTTP 404 | 8 | — | — | — | **never** |
| Field | yes | HTTP 200 | 15 | 20 | 5 | — | **never** |
| HistoryTransactional | no | HTTP 400 | 29 | 38 | 9 | — | **never** |
| Lookup | yes | HTTP 200 | 15 | 19 | 4 | — | **never** |
| Media | yes | HTTP 200 | 56 | 86 | 31 | Property→Property (SUPPORTED 200) | `lib/idx/trestle-mapper.ts`, `lib/idx/fetch.ts`, `app/api/agents/[slug]/listings/route.ts` +8 |
| Member | yes | HTTP 200 | 91 | 120 | 29 | BuyerAgentProperties→Property (PROVIDER_REJECTED 400), CoBuyerAgentProperties→Property (PROVIDER_REJECTED 400), CoListAgentProperties→Property (SUPPORTED 200), ListAgentProperties→Property (SUPPORTED 200), Media→Media (SUPPORTED 200) | **never** |
| Model | yes | HTTP 200 | 8 | 12 | 4 | — | **never** |
| Office | yes | HTTP 200 | 80 | 112 | 32 | BuyerOfficeProperties→Property (PROVIDER_REJECTED 400), CoBuyerOfficeProperties→Property (PROVIDER_REJECTED 400), CoListOfficeProperties→Property (SUPPORTED 200), ListOfficeProperties→Property (SUPPORTED 200), Media→Media (SUPPORTED 200) | **never** |
| OpenHouse | yes | HTTP 200 | 47 | 76 | 29 | Property→Property (SUPPORTED 200) | `lib/open-houses/upcoming-open-houses.ts`, `app/api/listings/route.ts`, `app/api/open-houses/route.ts` +1 |
| Property | yes | HTTP 200 | 757 | 810 | 53 | Building→Building (SUPPORTED 200), BuyerAgent→Member (SUPPORTED 200), BuyerOffice→Office (SUPPORTED 200), CoBuyerAgent→Member (SUPPORTED 200), CoBuyerOffice→Office (SUPPORTED 200), CoListAgent→Member (SUPPORTED 200), CoListOffice→Office (SUPPORTED 200), CustomProperty→CustomProperty (SUPPORTED 200), ListAgent→Member (SUPPORTED 200), ListOffice→Office (SUPPORTED 200), Media→Media (SUPPORTED 200), OpenHouse→OpenHouse (SUPPORTED 200), Rooms→PropertyRooms (SUPPORTED 200), UnitTypes→PropertyUnitTypes (SUPPORTED 200) | **never** |
| PropertyGreenVerification | no | HTTP 404 | 39 | 70 | 31 | — | **never** |
| PropertyRooms | yes | HTTP 200 | 39 | 69 | 30 | Property→Property (SUPPORTED 200) | **never** |
| PropertyUnitTypes | yes | HTTP 200 | 52 | 82 | 30 | Property→Property (SUPPORTED 200) | **never** |
| TeamMembers | no | HTTP 400 | 29 | 55 | 26 | — | **never** |
| Teams | no | HTTP 400 | 48 | 74 | 26 | — | **never** |

### A.1 Property navigations × status — declared · HTTP · collection present · populated · linkage · exhaustive walks

| Navigation → target | Declared | $expand HTTP | Target entity set | Collection key present (A/P/CS/C) | Populated / sampled by status | Records | Key linkage (match/mismatch/scalar-null) | Exhaustive Active | Exhaustive all statuses | Runtime expands it |
|---|---|---|---|---|---|---|---|---|---|---|
| `Building` → Building | yes | 200 | HTTP 403 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 0/60 | 0 | — | 0 of 7,600 | 0 of 591,599 () | **never** |
| `BuyerAgent` → Member | yes | 200 | HTTP 200 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 36/60 | 36 | Closed MemberKey↔BuyerAgentKey: 0/0/36; Closed MemberMlsId↔BuyerAgentMlsId: 36/0/0 | 0 of 7,600 | 80,460 of 591,599 (Closed 80,450, Pending 10) | **never** |
| `BuyerOffice` → Office | yes | 200 | HTTP 200 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 37/60 | 37 | Closed OfficeKey↔BuyerOfficeKey: 0/0/37; Closed OfficeMlsId↔BuyerOfficeMlsId: 37/0/0 | 0 of 7,600 | 99,256 of 591,599 (Closed 99,246, Pending 10) | **never** |
| `CoBuyerAgent` → Member | yes | 200 | HTTP 200 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 0/60 | 0 | — | 0 of 7,600 | 2,813 of 591,599 (Closed 2,811, Pending 2) | **never** |
| `CoBuyerOffice` → Office | yes | 200 | HTTP 200 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 0/60 | 0 | — | 0 of 7,600 | 3,158 of 591,599 (Closed 3,156, Pending 2) | **never** |
| `CoListAgent` → Member | yes | 200 | HTTP 200 | 40/40/5/60 | Active 24/40 · Pending 27/40 · ComingSoon 3/5 · Closed 27/60 | 81 | Active MemberKey↔CoListAgentKey: 24/0/0; Active MemberMlsId↔CoListAgentMlsId: 24/0/0; Active MemberKey↔CoListAgent2Key: 0/8/16; Active MemberKey↔CoListAgent3Key: 0/2/22; Pending MemberKey↔CoListAgentKey: 27/0/0; Pending MemberMlsId↔CoListAgentMlsId: 27/0/0; Pending MemberKey↔CoListAgent2Key: 0/11/16; Pending MemberKey↔CoListAgent3Key: 0/2/25; ComingSoon MemberKey↔CoListAgentKey: 3/0/0; ComingSoon MemberMlsId↔CoListAgentMlsId: 3/0/0; ComingSoon MemberKey↔CoListAgent2Key: 0/2/1; ComingSoon MemberKey↔CoListAgent3Key: 0/2/1; Closed MemberKey↔CoListAgentKey: 27/0/0; Closed MemberMlsId↔CoListAgentMlsId: 27/0/0; Closed MemberKey↔CoListAgent2Key: 0/5/22; Closed MemberKey↔CoListAgent3Key: 0/3/24 | 3,344 of 7,600 | 160,329 of 591,599 (Closed 154,100, Pending 2,882, Active 3,344, ComingSoon 3) | **never** |
| `CoListOffice` → Office | yes | 200 | HTTP 200 | 40/40/5/60 | Active 25/40 · Pending 27/40 · ComingSoon 3/5 · Closed 28/60 | 83 | Active OfficeKey↔CoListOfficeKey: 25/0/0; Active OfficeMlsId↔CoListOfficeMlsId: 25/0/0; Active OfficeKey↔CoListOffice2Key: 9/0/16; Pending OfficeKey↔CoListOfficeKey: 27/0/0; Pending OfficeMlsId↔CoListOfficeMlsId: 27/0/0; Pending OfficeKey↔CoListOffice2Key: 11/0/16; ComingSoon OfficeKey↔CoListOfficeKey: 3/0/0; ComingSoon OfficeMlsId↔CoListOfficeMlsId: 3/0/0; ComingSoon OfficeKey↔CoListOffice2Key: 2/0/1; Closed OfficeKey↔CoListOfficeKey: 28/0/0; Closed OfficeMlsId↔CoListOfficeMlsId: 28/0/0; Closed OfficeKey↔CoListOffice2Key: 5/0/23 | 3,350 of 7,600 | 196,951 of 591,599 (Closed 190,689, Pending 2,909, Active 3,350, ComingSoon 3) | **never** |
| `CustomProperty` → CustomProperty | yes | 200 | HTTP 200 | 40/40/5/60 | Active 40/40 · Pending 40/40 · ComingSoon 5/5 · Closed 60/60 | 145 | Active ListingKey↔ListingKey: 40/0/0; Pending ListingKey↔ListingKey: 40/0/0; ComingSoon ListingKey↔ListingKey: 5/0/0; Closed ListingKey↔ListingKey: 60/0/0 | 7,600 of 7,600 | 591,599 of 591,599 (Closed 578,402, Pending 5,590, Active 7,602, ComingSoon 5) | `lib/idx/fetch.ts` |
| `ListAgent` → Member | yes | 200 | HTTP 200 | 40/40/5/60 | Active 39/40 · Pending 40/40 · ComingSoon 5/5 · Closed 57/60 | 141 | Active MemberKey↔ListAgentKey: 39/0/0; Active MemberMlsId↔ListAgentMlsId: 39/0/0; Pending MemberKey↔ListAgentKey: 40/0/0; Pending MemberMlsId↔ListAgentMlsId: 40/0/0; ComingSoon MemberKey↔ListAgentKey: 5/0/0; ComingSoon MemberMlsId↔ListAgentMlsId: 5/0/0; Closed MemberKey↔ListAgentKey: 57/0/0; Closed MemberMlsId↔ListAgentMlsId: 57/0/0 | 7,281 of 7,600 | 431,008 of 591,599 (Closed 418,333, Pending 5,387, Active 7,283, ComingSoon 5) | **never** |
| `ListOffice` → Office | yes | 200 | HTTP 200 | 40/40/5/60 | Active 40/40 · Pending 40/40 · ComingSoon 5/5 · Closed 57/60 | 142 | Active OfficeKey↔ListOfficeKey: 40/0/0; Active OfficeMlsId↔ListOfficeMlsId: 40/0/0; Pending OfficeKey↔ListOfficeKey: 40/0/0; Pending OfficeMlsId↔ListOfficeMlsId: 40/0/0; ComingSoon OfficeKey↔ListOfficeKey: 5/0/0; ComingSoon OfficeMlsId↔ListOfficeMlsId: 5/0/0; Closed OfficeKey↔ListOfficeKey: 57/0/0; Closed OfficeMlsId↔ListOfficeMlsId: 57/0/0 | 7,600 of 7,600 | 522,739 of 591,599 (Closed 509,542, Pending 5,590, Active 7,602, ComingSoon 5) | **never** |
| `Media` → Media | yes | 200 | HTTP 200 | 40/40/5/60 | Active 40/40 · Pending 39/40 · ComingSoon 5/5 · Closed 50/60 | 1584 | Active ResourceRecordKey↔ListingKey: 40/0/0; Pending ResourceRecordKey↔ListingKey: 39/0/0; ComingSoon ResourceRecordKey↔ListingKey: 5/0/0; Closed ResourceRecordKey↔ListingKey: 50/0/0 | — | walk pending | `lib/idx/trestle-mapper.ts`, `lib/idx/fetch.ts`, `lib/buildings/public-building-data.ts` +6 |
| `OpenHouse` → OpenHouse | yes | 200 | HTTP 200 | 40/40/5/60 | Active 7/40 · Pending 0/40 · ComingSoon 0/5 · Closed 0/60 | 13 | Active ListingKey↔ListingKey: 7/0/0 | — | walk pending | **never** |
| `Rooms` → PropertyRooms | yes | 200 | HTTP 200 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 0/60 | 0 | — | 2 of 7,600 | 13 of 591,599 (Closed 10, Active 2, Pending 1) | **never** |
| `UnitTypes` → PropertyUnitTypes | yes | 200 | HTTP 200 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 0/60 | 0 | — | 0 of 7,600 | 1 of 591,599 (Closed 1) | **never** |

Direct access by the linked key: Member `MemberKey eq '25281901'` → HTTP 200 count 1; Member `MemberMlsId eq '64104'` → HTTP 200 count 1; Office `OfficeKey eq '5663376'` → HTTP 200 count 1; Office `OfficeMlsId eq '7371'` → HTTP 200 count 1; CustomProperty `ListingKey eq '1190078353'` → HTTP 200 count 1; Media `ResourceRecordKey eq '1190078353'` → HTTP 200 count 12; OpenHouse `ListingKey eq '1190073995'` → HTTP 200 count 2.

Navigation empty although the Property scalar names a record: ListAgent/Active ListAgentKey=29750655 → not in the entitled roster; ListAgent/Active ListAgentMlsId=TM229 → not in the entitled roster; ListAgent/Closed ListAgentKey=28520193 → not in the entitled roster; ListAgent/Closed ListAgentMlsId=TM61 → not in the entitled roster; ListAgent/Closed ListAgentKey=25213762 → not in the entitled roster; ListAgent/Closed ListAgentMlsId=112974 → not in the entitled roster; ListAgent/Closed ListAgentKey=25288876 → not in the entitled roster; ListAgent/Closed ListAgentMlsId=87161 → not in the entitled roster; CoListAgent/Active CoListAgentKey=28520285 → not in the entitled roster; CoListAgent/Active CoListAgentMlsId=TM128 → not in the entitled roster; CoListAgent/Active CoListAgent2Key=25292395 → found (1); CoListAgent/Closed CoListAgentKey=25249649 → not in the entitled roster.

Second hop: Active ListAgent($expand=Media) → HTTP 400 (error:code:BadRequest[400]. TraceId: 2bb13ba4-4b87-4ac6-9de9-c26276c4f98d,message:Navigati); Active ListOffice($expand=Media) → HTTP 400 (error:code:BadRequest[400]. TraceId: acabe3bf-f57e-467c-850c-006ea80cba21,message:Navigati); Active Building($expand=Media) → HTTP 200; Active Building($expand=Property) → HTTP 200; Closed BuyerAgent($expand=Media) → HTTP 400 (error:code:BadRequest[400]. TraceId: 240af5c0-e311-4057-8553-c37b102bc49d,message:Navigati); Active Media($filter=MediaCategory eq Photo;$top=2) → HTTP 200; Active all 14 navigations key-only in one request → HTTP 200.

Key linkage rules: **Property.ListAgentKey ↔ Member.MemberKey** — exact on every populated sample; **Property.ListAgentMlsId ↔ Member.MemberMlsId** — exact; **Property.BuyerAgentMlsId ↔ Member.MemberMlsId (BuyerAgent navigation, Closed)** — exact; BuyerAgentKey scalar is suppressed (null) while the payload carries MemberKey; **Property.CoListAgentKey ↔ Member.MemberKey (CoListAgent navigation)** — exact for the first co-list agent only; CoListAgent2Key/CoListAgent3Key are NOT in the navigation payload and resolve by direct Member lookup; **Property.CoListOfficeKey / CoListOffice2Key ↔ Office.OfficeKey** — both present in the CoListOffice payload; **Media.ResourceRecordKey ↔ Property.ListingKey** — exact; Media.ResourceName also carries Building rows (62) keyed by BuildingKey, which Property does not expose; **OpenHouse/CustomProperty/PropertyRooms/PropertyUnitTypes.ListingKey ↔ Property.ListingKey** — exact; **Property.BuildingKey ↔ Building.BuildingKey** — unmeasurable: BuildingKey suppressed on Property, Building navigation always empty, Building entity set 403.

## B. Selection authorities — every provider field list the program sends

| Authority | File | Role | Resource | Fields | Kind |
|---|---|---|---|---|---|
| `AMENITY_FEATURE_FIELDS` | `app/api/buildings/search/route.ts` | buildings | Property | 6 | array |
| `CARD_SELECT_FIELDS` | `lib/idx/card-fields.ts` | cards | Property | 70 | cotalityFields |
| `MEDIA_LANE_PROPERTY_SELECT` | `lib/idx/media-sync.ts` | media | Property | 10 | cotalityFields |
| `MEDIA_SELECT_FIELDS` | `lib/media/listing-media-resolver.ts` | media | Media | 13 | cotalityFields |
| `OPEN_HOUSE_SELECT_FIELDS` | `lib/open-houses/upcoming-open-houses.ts` | open-houses | OpenHouse | 9 | cotalityFields |
| `OPEN_HOUSE_PROPERTY_SELECT_FIELDS` | `lib/open-houses/upcoming-open-houses.ts` | open-houses | Property | 25 | cotalityFields |
| `GHOST_LOOKUP_SELECT` | `app/api/cron/feed-reconcile/route.ts` | other | Property | 2 | cotalityFields |
| `SUGGEST_SELECT_FIELDS` | `app/api/listings/suggest/route.ts` | other | Property | 16 | cotalityFields |
| `VOW_ENRICHED_FIELDS` | `lib/compliance/dto.ts` | other | Property | 14 | array |
| `CANONICAL_LOCATION_SELECT_FIELDS` | `lib/listings/canonical-location.ts` | other | Property | 6 | cotalityFields |
| `SEARCH_SELECT_FIELDS` | `lib/search/engine/select.ts` | runtime-search | Property | 105 | cotalityFields |
| `$expand=CustomProperty@71` | `lib/idx/fetch.ts` | sync | CustomProperty | 3 | literal |
| `$expand=CustomProperty@122` | `lib/idx/fetch.ts` | sync | CustomProperty | 1 | literal |
| `$select@1272` | `lib/idx/sync.ts` | sync | Media | 7 | literal |
| `$select@1918` | `lib/idx/sync.ts` | sync | Media | 7 | literal |
| `$select@2685` | `lib/idx/sync.ts` | sync | Media | 7 | literal |
| `B1_ADDRESS` | `lib/idx/trestle-mapper.ts` | sync | Property | 21 | cotalityFields |
| `B2_CLASSIFICATION` | `lib/idx/trestle-mapper.ts` | sync | Property | 19 | cotalityFields |
| `B3_LISTING_AGREEMENT` | `lib/idx/trestle-mapper.ts` | sync | Property | 10 | cotalityFields |
| `B4_STATUS_DATES` | `lib/idx/trestle-mapper.ts` | sync | Property | 25 | cotalityFields |
| `B5_PRICING` | `lib/idx/trestle-mapper.ts` | sync | Property | 6 | cotalityFields |
| `B6_DISPLAY_FLAGS` | `lib/idx/trestle-mapper.ts` | sync | Property | 4 | cotalityFields |
| `B7_REMARKS` | `lib/idx/trestle-mapper.ts` | sync | Property | 8 | cotalityFields |
| `B8_LIST_AGENT` | `lib/idx/trestle-mapper.ts` | sync | Property | 18 | cotalityFields |
| `B9_COLIST_AGENT` | `lib/idx/trestle-mapper.ts` | sync | Property | 23 | cotalityFields |
| `B10_BUYER_AGENT` | `lib/idx/trestle-mapper.ts` | sync | Property | 18 | cotalityFields |
| `B11_COBUYER_AGENT` | `lib/idx/trestle-mapper.ts` | sync | Property | 12 | cotalityFields |
| `B12_UNIT_ROOMS` | `lib/idx/trestle-mapper.ts` | sync | Property | 23 | cotalityFields |
| `B13_BUILDING` | `lib/idx/trestle-mapper.ts` | sync | Property | 22 | cotalityFields |
| `B14_BUILDING_AMENITIES` | `lib/idx/trestle-mapper.ts` | sync | Property | 12 | cotalityFields |
| `B15_FINANCIAL_UNIT` | `lib/idx/trestle-mapper.ts` | sync | Property | 16 | cotalityFields |
| `B16_FINANCIAL_BUILDING` | `lib/idx/trestle-mapper.ts` | sync | Property | 8 | cotalityFields |
| `B17_EXPENSES` | `lib/idx/trestle-mapper.ts` | sync | Property | 15 | cotalityFields |
| `B18_CONCESSIONS` | `lib/idx/trestle-mapper.ts` | sync | Property | 4 | cotalityFields |
| `B19_LOT_LAND` | `lib/idx/trestle-mapper.ts` | sync | Property | 19 | cotalityFields |
| `B20_UNIT_FEATURES` | `lib/idx/trestle-mapper.ts` | sync | Property | 16 | cotalityFields |
| `B21_PARKING` | `lib/idx/trestle-mapper.ts` | sync | Property | 9 | cotalityFields |
| `B22_OUTDOOR_PETS` | `lib/idx/trestle-mapper.ts` | sync | Property | 1 | cotalityFields |
| `B23_SHOWINGS` | `lib/idx/trestle-mapper.ts` | sync | Property | 8 | cotalityFields |
| `B24_NEW_DEV` | `lib/idx/trestle-mapper.ts` | sync | Property | 5 | cotalityFields |
| `B25_GREEN` | `lib/idx/trestle-mapper.ts` | sync | Property | 7 | cotalityFields |
| `B26_MEDIA` | `lib/idx/trestle-mapper.ts` | sync | Property | 13 | cotalityFields |
| `B27_RENTAL` | `lib/idx/trestle-mapper.ts` | sync | Property | 17 | cotalityFields |
| `B29_OTHER` | `lib/idx/trestle-mapper.ts` | sync | Property | 12 | cotalityFields |
| `REQUIRED_COTALITY_FIELDS` | `lib/idx/trestle-mapper.ts` | sync | Property | 11 | array |
| `REQUIRED_HISTORICAL_FIELDS` | `lib/idx/trestle-mapper.ts` | sync | Property | 9 | array |

Property divergence — sync union 351 fields; runtime 107; **in runtime but never persisted:** `PetsAllowedYN`; **persisted but not in runtime:** `AboveGradeFinishedArea`, `AboveGradeFinishedAreaSource`, `AboveGradeFinishedAreaUnits`, `Appliances`, `AssociationFee2`, `AssociationFee2Frequency`, `AssociationFeeIncludes`, `AssociationName`, `AssociationYN`, `AttachedGarageYN`, `BackOnMarketDate`, `BackOnMarketTimestamp`, `Basement`, `BasementYN`, `BathroomsOneQuarter`, `BathroomsPartial`, `BathroomsThreeQuarter`, `BelowGradeFinishedArea`, `BelowGradeFinishedAreaSource`, `BelowGradeFinishedAreaUnits`, `BuilderModel`, `BuilderName`, `BuildingAreaSource`, `BuildingAreaTotal`, `BuildingAreaUnits`, `BuyerAgentDirectPhone`, `BuyerAgentEmail`, `BuyerAgentFirstName`, `BuyerAgentFullName`, `BuyerAgentKey`, `BuyerAgentLastName`, `BuyerAgentMlsId`, `BuyerAgentOfficePhone`, `BuyerAgentURL`, `BuyerOfficeEmail`, `BuyerOfficeKey`, `BuyerOfficeMlsId`, `BuyerOfficeName`, `BuyerOfficePhone`, `BuyerOfficeURL` +205.

## C. CRM surfaces — how the four HTML surfaces bind to the contract

Controls are named `sale<Key>` / `rental<Key>`; `<Key>` is resolved through `MALLAN_FORM_CONTRACT.aliasToCanonical` (parsed from the AST), then as a live Cotality Property/CustomProperty field, then as a Mallan-internal key. Unresolved controls are listed so nothing is assumed.

| Surface | File | Controls | Keyed (id or name) | data-rls-field | data-mallan-field | data-rls-ignore | Prefix-resolved | Cotality fields bound | Unresolved (first 12) | Viewer hydration targets missing |
|---|---|---|---|---|---|---|---|---|---|---|
| saleForm | `public/crm/SALE-FORM-REDESIGN.html` | 859 | 407 | 162 | 8 | 229 | 1 | 109 | `saleKitchenType`, `coListCompanySearch' + n + '`, `coListCompany' + n + '`, `coListAgentSearch' + n + '`, `coListAgentHidden' + n + '`, `salePublicUrlInput`, `saleRebnyListingUrlInput` | — |
| rentalForm | `public/crm/RENTAL-FORM-REDESIGN.html` | 763 | 444 | 249 | 12 | 183 | 0 | 123 |  | — |
| saleTools | `public/crm/SALE-FORM-WITH-TOOLS.html` | 835 | 372 | 157 | 8 | 207 | 0 | 92 |  | 45 of 211 |
| rentalTools | `public/crm/RENTAL-FORM-WITH-TOOLS.html` | 762 | 448 | 227 | 12 | 209 | 0 | 104 |  | 38 of 245 |

Form contract: 47 aliases, 149 persistence entries, 69 Mallan-internal keys. Tools-only controls (on the WITH-TOOLS page, absent from the entry form): sale 20 keys, rental 2 keys. The WITH-TOOLS pages are read-only viewers (`data-rls-viewer`) that re-project the canonical API payload into a private shape — they are not entry forms.

### C.1 Static defect register — survey findings re-verified mechanically

| Id | Surface | Claim | Verification | Detail | Citation |
|---|---|---|---|---|---|
| cma-contract_closed | CMA | lib/cma/engine.ts filters prisma.listing by `contract_closed`, a Deal column that model Listing does not declare (Prisma validation error at runtime; the `as Prisma.ListingWhereInput` cast hides it) | **CONFIRMED (static)** | engine references contract_closed: true; Listing model declares it: false | lib/cma/engine.ts:93-99; prisma/schema.prisma:165 (Deal), :437 (Listing) |
| comps-window-modification | CMA | lib/comps/fetch-comps.ts windows comps by `ModificationTimestamp gt`, so a listing closed years ago but touched recently is admitted as a closed comp | **CONFIRMED (static pattern)** |  | lib/comps/fetch-comps.ts:36-40,126,191; lib/search/canonical/comp-eligibility.ts:5-9 |
| comp-eligibility-unwired | CMA | lib/search/canonical/comp-eligibility.ts (CloseDate windowing) has no importer in lib/cma, lib/comps, lib/market-report, lib/seller-report or lib/pitch-packet | **CONFIRMED (import graph)** | importers: lib/search/canonical/index.ts | import graph |
| cma-own-provider-mapping | CMA | CMA, comps and every report keep their own provider query/mapping and never import lib/search/engine/** | **CONFIRMED (import graph)** | 35 CMA/report files, 0 import the engine | lib/cma/engine.ts:8; lib/comps/fetch-comps.ts:65-90; lib/market-report/generator.ts:167-248; app/api/crm/sales/prospects/[id]/{pitch-packet,pdf,comps,research}/route.ts; app/api/market/route.ts:196 |
| patch-bypasses-contract | Sale Form / Rental Form | PATCH app/api/crm/listings/[id]/route.ts never calls normalizePayload / buildPersistenceRecord (POST does) — create-save and edit-save persist through different rules | **NOT REPRODUCED** |  | app/api/crm/listings/route.ts:363,404; app/api/crm/listings/[id]/route.ts:17,387-396,415-428,519 |
| viewer-phantom-targets | Sale Tools / Rental Tools | the WITH-TOOLS viewers hydrate element ids that do not exist in their own HTML (silent no-ops) | **CONFIRMED (static)** | sale 45 of 211; rental 38 of 245: saleAddress, saleUnit, saleCity, saleState, saleNeighborhood, saleCrossStreet, saleSqFt, salePricePerSqFt, saleBathrooms, saleBathroomsFull, saleBedroomsTotal, saleRoomsTotal, salePropertySubType, saleYearBuilt, saleTotalUnits, saleStories, saleFloor, saleElevatorsTotal, saleLaundryFeatures, saleCoBrokeAgreement | public/crm/SALE-FORM-WITH-TOOLS.html:5007,5036-5190; public/crm/RENTAL-FORM-WITH-TOOLS.html:4447-4613 |
| no-round-trip-test | Sale Form / Rental Form | no test performs an actual create → save → reload → edit → save → reload of field values; the round-trip tests are regex/AST assertions over source | **NOT REPRODUCED** | tests/runtime/agent-onboarding-contract.test.ts, tests/runtime/crm-form-field-roundtrip.test.ts, tests/runtime/sale-form-openhouse-persist.test.ts, tests/runtime/sale-form-save-load-retention.test.ts, tests/runtime/sale-form-special-listing-conditions-multi.test.ts, tests/runtime/sales-333-e-46th.test.ts | tests/runtime/crm-form-field-roundtrip.test.ts; tests/runtime/sale-form-save-load-retention.test.ts; tests/runtime/crm-redesign-rental-hydration.test.ts |
| furnished-ungated | Rental Search | public/legacy paths apply the furnished filter without a rental gate (`?type=sale&furnished=true` narrows the sale universe) | **PATTERN PRESENT (gating not mechanically assessed)** |  | lib/search/public-listing-trestle.ts:332; lib/search/public-listing-db.ts:402-405; lib/search/types.ts:183 |
| sale-negative-membership | Sale Search | the public Trestle path builds the sale universe as `PropertyType ne 'ResidentialLease'` while the engine and the registry use positive membership `eq 'Residential'` | **CONFIRMED (static)** |  | lib/search/public-listing-trestle.ts:153-157; lib/search/engine/provider-query.ts:28-31,84; lib/search/canonical/field-registry.ts:131 |
| no-fee-phantom | Rental Search | AMENITY_FIELD_MAP 'no-fee' targets ListingTerms values that are not published members, on a field with 0 rows | **CONFIRMED (live vocabulary)** | ListingTerms=NoFee, ListingTerms=OwnerPays · ListingTerms populated 0 | lib/search/types.ts:149; live Lookup ListingTerms |
| engine-no-rental-criteria | Rental Search | the Search engine has no rental-specific criterion: rental fields are selected for hydration but never filterable (furnished/pets/lease terms refused as unsupported params) | **CONFIRMED (static)** |  | lib/search/engine/criteria.ts:96-100,153-156; lib/search/engine/select.ts:39-44 |
| market-mlsstatus-filter | Reports | app/api/market/route.ts filters `MlsStatus eq 'Active'` — a provider-suppressed field whose $filter the provider rejects; the failure is swallowed | **NOT REPRODUCED** |  | app/api/market/route.ts:200; contract Property.MlsStatus filterable:false |
| manage-listings-closed-rejected | Sale Tools / Rental Tools | Manage Listings posts status 'Closed' (display Sold/Leased → resoMap) to PATCH /status, whose canonical vocabulary has no 'Closed' — the request is rejected after the UI already announced success | **CONFIRMED (static)** | canonical statuses: Draft, ComingSoon, Active, ActiveUnderContract, Pending, Sold, Withdrawn, Expired, Hold, Cancelled, Rented, Rented | public/crm/js/manage/manage-listings.js:1105-1114; app/api/crm/listings/[id]/status/route.ts:99-104; lib/crm/status-mapping.ts |
| compliance-allowed-phantoms | Compliance | the CRM compliance console ALLOWED list names fields that are not on the live contract | **CONFIRMED (static + contract)** | 111 names, 8 not on the contract or Mallan-internal: OwnerOptOut, ParticipantOnly, ComingSoonTimestamp, MaintenanceFee, CommonCharges, Amenities, FloorNumber, SourceSystemModificationTimestamp | public/crm/js/compliance/compliance-gates-and-output.js:1539 |
| rental-rules-status-vocabulary | Rental Form | rental-field-rules.js branches on status values that the provider vocabulary does not publish (PermOffMarket, TempOffMarket, LeasedThruUs, Cancelled) | **CONFIRMED (static + vocabulary)** | used: PermOffMarket, TempOffMarket, Expired, Withdrawn, Cancelled, Leased, LeasedThruUs; not published: PermOffMarket, TempOffMarket, Cancelled, LeasedThruUs | public/crm/js/compliance/rental-field-rules.js:106-125; Lookup StandardStatus / MlsStatus |
| rent-vs-buy-synthetic-price | Rental Tools | the public rental detail page feeds RentVsBuyCalculator a synthetic purchase price (monthly rent × 250) and zeroed carrying costs although associationFee/taxAnnualAmount are on the same DTO | **CONFIRMED (static)** |  | app/listing/[...slug]/page.tsx:1866-1872 |
| crm-calculators-no-category-guard | Sale Tools / Rental Tools | public/crm/js/output/calculators.js applies sale arithmetic (mansion/transfer tax, mortgage) to any listing without checking listingCategory | **CONFIRMED (static)** |  | public/crm/js/output/calculators.js:54-115 |
| status-vocabularies-multiplied | Lifecycle | at least four independent status vocabularies exist on the tool path (mallan-status.ts, status-mapping.ts, status route STATUS_TRANSITIONS, manage-listings statusMap/resoMap) | **CONFIRMED (static)** | 4 vocabularies located | lib/listings/mallan-status.ts; lib/crm/status-mapping.ts; app/api/crm/listings/[id]/status/route.ts:27-39; public/crm/js/manage/manage-listings.js:45,714,1105 |

AMENITY_FIELD_MAP members not published by the live vocabulary (18): `elevator` → BuildingFeatures=Elevator; `roof-deck` → ExteriorFeatures=RoofDeck; `laundry-room` → LaundryFeatures=OnCommonFloor; `elevator` → InteriorFeatures=Elevators; `walk-in-closet` → InteriorFeatures=WalkInCloset; `high-ceilings` → InteriorFeatures=HighCeiling; `fireplace` → InteriorFeatures=WoodBurningFireplace; `fireplace` → InteriorFeatures=DecorativeFireplace; `natural-light` → InteriorFeatures=NaturalLight; `renovated` → InteriorFeatures=Renovated; `renovated` → InteriorFeatures=GutRenovated; `renovated` → InteriorFeatures=NewlyRenovated; `quiet` → InteriorFeatures=Quiet; `pet-friendly` → PetsAllowed=UnitYes; `park-views` → View=Park; `views` → View=Park; `no-fee` → ListingTerms=NoFee (field 0 rows); `no-fee` → ListingTerms=OwnerPays (field 0 rows).

## D. Domains — one field, one primary semantic, many domains served

| Domain | Kind | Primary (populated) | Served (populated) | Verdict primary | Verdict incl. served | C/U/D/P/M | Sale Search · Rental Search · Sale Form · Rental Form · Sale Tools · Rental Tools · CMA · Reports · Public · Member · Compliance (fields PASS) | Provider availability | Not persisted | Consumer files |
|---|---|---|---|---|---|---|---|---|---|---|
| Tours & video | semantic | 8 (6) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/5/1 | 4 · 4 · 4 · 4 · 0 · 0 · 0 · 0 · 0 · 0 · 0 | POPULATED: 6, NOT-ON-FEED (not RLS-defined): 2 | 1 | 8 |
| Media counts & timestamps | semantic | 8 (4) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/1/3 | 0 · 0 · 1 · 0 · 1 · 1 · 1 · 0 · 0 · 0 · 0 | NOT-ON-FEED (not RLS-defined): 4, POPULATED: 4 | 0 | 13 |
| Permissions & visibility | semantic | 9 (3) | 16 (12) | **DEFECT** | PARTIAL | 0/5/1/9/0 | 8 · 8 · 8 · 8 · 7 · 7 · 6 · 6 · 5 · 5 · 11 | NOT-ON-FEED (not RLS-defined): 3, SUPPRESSED: 7, POPULATED: 15 | 0 | 150 |
| Showing, access & private contacts | semantic | 25 (3) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/3/0 | 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 | SUPPRESSED: 19, NOT-ON-FEED (not RLS-defined): 3, POPULATED: 3 | 0 | 0 |
| Security & doorman | semantic | 1 (1) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/1/0 | 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 1 · 0 · 0 | POPULATED: 1 | 0 | 8 |
| Laundry | semantic | 1 (1) | 0 (0) | **UNVERIFIED** | NO-POPULATED-FIELDS | 0/1/0/0/0 | 1 · 1 · 1 · 1 · 1 · 1 · 0 · 0 · 1 · 0 · 0 | POPULATED: 1 | 0 | 10 |
| Parking | semantic | 12 (9) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/1/0/8/0 | 1 · 1 · 6 · 6 · 0 · 0 · 0 · 0 · 7 · 0 · 1 | POPULATED: 9, NOT-ON-FEED (not RLS-defined): 2, SUPPRESSED: 1 | 0 | 11 |
| Pools & spa | semantic | 5 (4) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/3/1 | 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 2 · 0 · 0 | POPULATED: 4, NOT-ON-FEED (not RLS-defined): 1 | 1 | 5 |
| Accessibility | semantic | 1 (1) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/1/0 | 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 1 · 0 · 0 | POPULATED: 1 | 0 | 5 |
| Pets | semantic | 6 (2) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/1/0/0/1 | 1 · 1 · 1 · 1 · 0 · 1 · 0 · 0 · 1 · 0 · 1 | NOT-ON-FEED (not RLS-defined): 4, POPULATED: 2 | 1 | 15 |
| Transportation & schools | semantic | 43 (0) | 0 (0) | **NO-POPULATED-FIELDS** | NO-POPULATED-FIELDS | 0/0/0/0/0 | 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 | SUPPRESSED: 36, NOT-ON-FEED (not RLS-defined): 7 | 0 | 0 |
| Compensation & concessions | semantic | 20 (0) | 0 (0) | **NO-POPULATED-FIELDS** | NO-POPULATED-FIELDS | 0/0/0/0/0 | 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 | SUPPRESSED: 20 | 0 | 0 |
| Farm, agricultural & manufactured-home | semantic | 45 (1) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/1/0 | 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 | NOT-ON-FEED (not RLS-defined): 23, SUPPRESSED: 21, POPULATED: 1 | 0 | 0 |
| Geography & map | semantic | 51 (25) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/11/0/8/6 | 13 · 13 · 17 · 17 · 13 · 11 · 7 · 8 · 18 · 9 · 14 | NOT-ON-FEED (not RLS-defined): 15, POPULATED: 25, SUPPRESSED: 11 | 6 | 109 |
| Amenities & building features | semantic | 50 (38) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/7/0/28/3 | 7 · 7 · 9 · 16 · 4 · 3 · 0 · 0 · 16 · 2 · 1 | POPULATED: 38, NOT-ON-FEED (not RLS-defined): 12 | 3 | 45 |
| Rental terms & fees | semantic | 25 (12) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/0/0/12/0 | 1 · 1 · 3 · 12 · 0 · 0 · 0 · 0 · 0 · 0 · 1 | POPULATED: 12, NOT-ON-FEED (not RLS-defined): 12, SUPPRESSED: 1 | 0 | 13 |
| Financial & carrying costs | semantic | 62 (30) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 3/0/0/23/4 | 2 · 2 · 6 · 2 · 1 · 1 · 0 · 1 · 9 · 1 · 4 | POPULATED: 30, NOT-ON-FEED (not RLS-defined): 32 | 4 | 21 |
| Lifecycle, status & dates | semantic | 34 (18) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/2/0/15/1 | 4 · 4 · 6 · 5 · 3 · 3 · 2 · 3 · 4 · 5 · 9 | POPULATED: 18, SUPPRESSED: 9, NOT-ON-FEED (not RLS-defined): 7 | 0 | 149 |
| Identity & sync keys | semantic | 34 (22) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 5/0/0/3/14 | 3 · 3 · 1 · 1 · 3 · 3 · 3 · 3 · 3 · 4 · 1 | POPULATED: 22, NOT-ON-FEED (not RLS-defined): 4, SUPPRESSED: 8 | 13 | 123 |
| Pricing | semantic | 7 (6) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/3/0/2/1 | 3 · 3 · 3 · 1 · 3 · 3 · 2 · 3 · 2 · 4 · 3 | POPULATED: 6, NOT-ON-FEED (not RLS-defined): 1 | 1 | 76 |
| Classification & building facts | semantic | 52 (25) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/3/0/18/4 | 5 · 5 · 15 · 15 · 4 · 3 · 1 · 2 · 13 · 2 · 10 | NOT-ON-FEED (not RLS-defined): 24, POPULATED: 25, SUPPRESSED: 3 | 4 | 81 |
| Size & rooms | semantic | 38 (17) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/4/0/11/2 | 5 · 5 · 11 · 10 · 5 · 5 · 4 · 4 · 4 · 4 · 9 | NOT-ON-FEED (not RLS-defined): 21, POPULATED: 17 | 2 | 54 |
| Remarks & disclosures | semantic | 14 (4) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 1/0/0/0/3 | 1 · 1 · 1 · 1 · 1 · 1 · 0 · 0 · 1 · 0 · 1 | SUPPRESSED: 4, NOT-ON-FEED (not RLS-defined): 6, POPULATED: 4 | 3 | 23 |
| Agent & office attribution | semantic | 206 (80) | 0 (0) | **PARTIAL** | NO-POPULATED-FIELDS | 0/2/0/16/62 | 8 · 8 · 0 · 0 · 6 · 6 · 2 · 1 · 2 · 13 · 3 | SUPPRESSED: 85, POPULATED: 80, NOT-ON-FEED (not RLS-defined): 41 | 40 | 29 |
| Agent search | business | 0 (0) | 195 (80) | — | **PARTIAL** | 0/2/0/16/62 | 8 · 8 · 0 · 0 · 6 · 6 · 2 · 1 · 2 · 13 · 3 | SUPPRESSED: 80, POPULATED: 80, NOT-ON-FEED (not RLS-defined): 35 | 40 | 29 |
| Alerts | business | 0 (0) | 31 (27) | — | **PARTIAL** | 2/11/0/14/0 | 17 · 17 · 16 · 15 · 15 · 15 · 11 · 12 · 16 · 15 · 18 | POPULATED: 27, SUPPRESSED: 4 | 0 | 185 |
| Brokerage identity | business | 0 (0) | 195 (80) | — | **PARTIAL** | 0/2/0/16/62 | 8 · 8 · 0 · 0 · 6 · 6 · 2 · 1 · 2 · 13 · 3 | SUPPRESSED: 80, POPULATED: 80, NOT-ON-FEED (not RLS-defined): 35 | 40 | 29 |
| Building search | business | 0 (0) | 17 (16) | — | **PARTIAL** | 0/9/0/7/0 | 9 · 9 · 6 · 9 · 4 · 4 · 0 · 0 · 16 · 0 · 2 | POPULATED: 16, NOT-ON-FEED (not RLS-defined): 1 | 0 | 38 |
| CMA | business | 0 (0) | 265 (141) | — | **DEFECT** | 3/35/1/40/62 | 50 · 50 · 36 · 38 · 42 · 41 · 25 · 24 · 47 · 38 · 36 | POPULATED: 141, NOT-ON-FEED (not RLS-defined): 36, SUPPRESSED: 88 | 40 | 204 |
| Compliance | business | 0 (0) | 308 (162) | — | **DEFECT** | 5/31/1/62/63 | 49 · 49 · 55 · 59 · 40 · 38 · 20 · 24 · 49 · 38 · 61 | POPULATED: 162, SUPPRESSED: 100, NOT-ON-FEED (not RLS-defined): 46 | 40 | 187 |
| DOM | business | 0 (0) | 16 (12) | — | **PARTIAL** | 0/3/0/9/0 | 5 · 5 · 6 · 6 · 4 · 4 · 3 · 3 · 5 · 5 · 8 | POPULATED: 12, SUPPRESSED: 4 | 0 | 148 |
| Listing workspace | business | 0 (0) | 153 (115) | — | **DEFECT** | 7/36/1/67/4 | 61 · 61 · 61 · 68 · 48 · 45 · 25 · 27 · 61 · 38 · 52 | POPULATED: 115, NOT-ON-FEED (not RLS-defined): 14, SUPPRESSED: 24 | 2 | 211 |
| Map | business | 0 (0) | 12 (10) | — | **PARTIAL** | 0/8/0/2/0 | 9 · 9 · 10 · 10 · 9 · 8 · 4 · 7 · 9 · 6 · 9 | POPULATED: 10, SUPPRESSED: 2 | 0 | 108 |
| Marketing | business | 0 (0) | 26 (20) | — | **DEFECT** | 3/4/1/11/1 | 17 · 17 · 9 · 8 · 14 · 14 · 8 · 8 · 7 · 9 · 7 | POPULATED: 20, SUPPRESSED: 2, NOT-ON-FEED (not RLS-defined): 4 | 0 | 185 |
| Media | business | 0 (0) | 19 (14) | — | **DEFECT** | 4/1/1/7/1 | 9 · 9 · 5 · 4 · 6 · 6 · 6 · 5 · 4 · 4 · 3 | SUPPRESSED: 3, POPULATED: 14, NOT-ON-FEED (not RLS-defined): 2 | 0 | 179 |
| Portal & private sharing | business | 0 (0) | 63 (47) | — | **DEFECT** | 3/23/1/14/6 | 36 · 36 · 22 · 21 · 32 · 31 · 22 · 22 · 24 · 44 · 27 | POPULATED: 47, SUPPRESSED: 15, NOT-ON-FEED (not RLS-defined): 1 | 1 | 204 |
| Public display | business | 0 (0) | 310 (168) | — | **DEFECT** | 7/35/1/60/65 | 54 · 54 · 54 · 54 · 44 · 41 · 24 · 25 · 85 · 36 · 47 | POPULATED: 168, NOT-ON-FEED (not RLS-defined): 54, SUPPRESSED: 88 | 43 | 204 |
| Rental Form | business | 0 (0) | 137 (101) | — | **PARTIAL** | 1/31/0/68/1 | 43 · 43 · 76 · 94 · 32 · 29 · 15 · 18 · 57 · 19 · 44 | POPULATED: 101, NOT-ON-FEED (not RLS-defined): 19, SUPPRESSED: 17 | 0 | 150 |
| Rental Search | business | 0 (0) | 119 (91) | — | **DEFECT** | 6/37/1/46/1 | 62 · 62 · 47 · 56 · 46 · 44 · 25 · 27 · 52 · 35 · 43 | POPULATED: 91, NOT-ON-FEED (not RLS-defined): 16, SUPPRESSED: 12 | 0 | 211 |
| Rental Tools | business | 0 (0) | 83 (62) | — | **DEFECT** | 5/26/1/29/1 | 45 · 45 · 33 · 42 · 43 · 44 · 25 · 25 · 31 · 30 · 30 | POPULATED: 62, SUPPRESSED: 7, NOT-ON-FEED (not RLS-defined): 14 | 0 | 209 |
| Reports | business | 0 (0) | 265 (141) | — | **DEFECT** | 4/33/1/41/62 | 50 · 50 · 37 · 38 · 41 · 39 · 21 · 28 · 47 · 36 · 38 | POPULATED: 141, NOT-ON-FEED (not RLS-defined): 36, SUPPRESSED: 88 | 40 | 204 |
| Sale Form | business | 0 (0) | 120 (97) | — | **PARTIAL** | 4/32/0/58/3 | 44 · 44 · 87 · 79 · 33 · 30 · 16 · 20 · 60 · 20 · 50 | POPULATED: 97, NOT-ON-FEED (not RLS-defined): 8, SUPPRESSED: 15 | 0 | 148 |
| Sale Search | business | 0 (0) | 99 (83) | — | **DEFECT** | 6/37/1/38/1 | 62 · 62 · 47 · 48 · 46 · 44 · 25 · 27 · 52 · 35 · 42 | POPULATED: 83, NOT-ON-FEED (not RLS-defined): 6, SUPPRESSED: 10 | 0 | 209 |
| Sale Tools | business | 0 (0) | 62 (53) | — | **DEFECT** | 5/25/1/21/1 | 44 · 44 · 34 · 33 · 45 · 43 · 25 · 27 · 32 · 30 · 30 | POPULATED: 53, SUPPRESSED: 5, NOT-ON-FEED (not RLS-defined): 4 | 0 | 202 |
| Saved Search | business | 0 (0) | 41 (35) | — | **PARTIAL** | 0/19/0/16/0 | 24 · 24 · 26 · 25 · 22 · 21 · 13 · 17 · 23 · 19 · 27 | POPULATED: 35, SUPPRESSED: 6 | 0 | 172 |
| Search results | business | 0 (0) | 130 (98) | — | **PARTIAL** | 8/37/0/46/7 | 56 · 56 · 52 · 60 · 40 · 38 · 23 · 25 · 56 · 39 · 45 | POPULATED: 98, NOT-ON-FEED (not RLS-defined): 14, SUPPRESSED: 18 | 1 | 210 |
| Sync | business | 0 (0) | 18 (14) | — | **DEFECT** | 3/9/1/0/1 | 13 · 13 · 9 · 7 · 13 · 13 · 13 · 13 · 10 · 10 · 10 | POPULATED: 14, SUPPRESSED: 4 | 0 | 190 |

## E. Field register — every entitled Property field, three dimensions, independent verdict columns

Legend: ✔ direct read/binding found · ~ reachable only through an import (counts as UNVERIFIED) · ✘ none · ? unverified · ‼ documented defect · · not applicable. Columns: Sel (S sync · R runtime · O other) · Map · Store · Reload · Sale Srch · Rent Srch · Sale Form · Rent Form · Sale Tools · Rent Tools · CMA · Rep · Saved · Alert · DTO · Card · Wksp · Mkt · Portal · Public · Compl · Tests D/N/I/W/C · Behaviour Pu/Me/Pr · Prod · Verdict · Consumers · Domains served. For a field the provider never delivers the verdict is Mallan readiness and a bound/read field is a DEAD PATH.

### Tours & video — primary verdict **PARTIAL** (8 fields, 6 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `VideosCount` | POPULATED · 485,075 · not RLS | — | SR | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ✘ | **PARTIAL** (searchPath, resultDto, resultCard, publicConsumer, saleTools, rentalTools) | 2 | Listing workspace, Marketing, Media, Rental Search, Rental Tools, Sale Search, Sale Tools, Search results |
| `VideosChangeTimestamp` | POPULATED · 329,062 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `VirtualTourURLUnbranded` | POPULATED · 26,372 · RLS | — | SR | ✔ | raw | · | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ✘ | **PARTIAL** (saleTools, rentalTools) | 7 | Listing workspace, Marketing, Media, Rental Form, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results |
| `VirtualTourURLBranded` | POPULATED · 13,879 · RLS | — | SR | ✔ | raw | · | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ✘ | **PARTIAL** (saleTools, rentalTools) | 7 | Listing workspace, Marketing, Media, Rental Form, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results |
| `VirtualTourURLUnbranded2` | POPULATED · 2,382 · not RLS | — | SR | ✔ | raw | · | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ✘ | **PARTIAL** (saleTools, rentalTools) | 5 | Listing workspace, Marketing, Media, Rental Form, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results |
| `VirtualTourURLUnbranded3` | POPULATED · 354 · not RLS | — | SR | ✔ | raw | · | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleTools, rentalTools) | 5 | Listing workspace, Marketing, Media, Rental Form, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results |
| `VirtualTourURLBranded2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | SR | ✔ | raw | · | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ~ | ✘ | ✔/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 4 | Listing workspace, Marketing, Media, Rental Search, Rental Tools, Sale Search, Sale Tools, Search results |
| `VirtualTourURLBranded3` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | SR | ✔ | raw | · | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ~ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 4 | Listing workspace, Marketing, Media, Rental Search, Rental Tools, Sale Search, Sale Tools, Search results |

### Media counts & timestamps — primary verdict **PARTIAL** (8 fields, 4 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `DocumentsCount` | POPULATED · 591,607 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `PhotosCount` | POPULATED · 591,607 · RLS | — | SR | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (searchPath, resultCard, publicConsumer) | 11 | CMA, Listing workspace, Marketing, Media, Rental Search, Rental Tools, Sale Search, Sale Tools, Search results |
| `PhotosChangeTimestamp` | POPULATED · 591,597 · RLS | — | SRO | ✘ | ✘ | · | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ~ | ✘ | ✘ | ~ | ~ | ✘ | ~ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **MISSING** | 13 | Listing workspace, Marketing, Media, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results, Sync |
| `DocumentsChangeTimestamp` | POPULATED · 366,181 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `DocumentsAvailable` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | DocumentsAvailable → Lookup (94 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✘ | ✘ | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 2 | Public display, Rental Form, Sale Form |
| `FloorPlansChangeTimestamp` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FloorPlansCount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TotalFloorPlansCount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Permissions & visibility — primary verdict **DEFECT** (9 fields, 3 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `InternetAutomatedValuationDisplayYN` | POPULATED · 591,607 · RLS | — | S | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 111 | CMA, Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results, Sync |
| `InternetConsumerCommentYN` | POPULATED · 591,607 · RLS | — | S | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 111 | CMA, Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results, Sync |
| `Permission` | POPULATED · 591,607 · RLS | ListingPermission → Lookup (18 published members; 3 RLS-listed) / obs 3 / handled 4 of 18 | SRO | ✔ | struct+raw | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✘ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ‼/‼/? | ? | **DEFECT** | 160 | CMA, Compliance, Listing workspace, Marketing, Media, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Sync |
| `AttributionContact` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `InternetAddressDisplayYN` | SUPPRESSED · 0 / 0 A · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ✔/?/? | ? | readiness UNVERIFIED (wired) · **DEAD PATH** | 137 | CMA, Compliance, Listing workspace, Marketing, Media, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results, Sync |
| `InternetEntireListingDisplayYN` | SUPPRESSED · 0 / 0 A · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ✔/?/? | i | readiness UNVERIFIED (wired) · **DEAD PATH** | 151 | CMA, Compliance, Listing workspace, Marketing, Media, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results, Sync |
| `SourceMlsUrl` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `SyndicateTo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | SyndicateTo → Lookup (28 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | raw+form | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 12 | Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Form, Rental Search, Sale Form, Sale Search |
| `SyndicationRemarks` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 4 | Compliance, Listing workspace |

### Showing, access & private contacts — primary verdict **PARTIAL** (25 fields, 3 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ShowingContactName` | POPULATED · 1,130 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (directTest) | 0 | — |
| `ShowingContactPhone` | POPULATED · 1,102 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (directTest) | 0 | — |
| `ShowingContactType` | POPULATED · 15 · not RLS | ShowingContactType → Lookup (15 published members; 1 RLS-listed) / obs 1 / handled 0 of 15 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (directTest) | 0 | — |
| `AccessCode` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `LockBoxLocation` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `LockBoxSerialNumber` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 4 | Listing workspace |
| `LockBoxType` | SUPPRESSED · 0 / 0 A · not RLS | LockBoxType → Lookup (11 published members; 0 RLS-listed) / obs ? / handled 0 of 11 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `OccupantName` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OccupantPhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OccupantType` | SUPPRESSED · 0 / 0 A · RLS | OccupantType → Lookup (7 published members; 3 RLS-listed) / obs ? / handled 0 of 7 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OpenHouseModificationTimestamp` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OwnerName` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 8 | Listing workspace |
| `OwnerName2` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OwnerPhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 5 | Listing workspace |
| `ShowingAdvanceNotice` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ShowingAttendedYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ShowingConsiderations` | SUPPRESSED · 0 / 0 A · not RLS | ShowingConsiderations → Lookup (14 published members; 0 RLS-listed) / obs ? / handled 0 of 14 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ShowingContactPhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `ShowingDays` | SUPPRESSED · 0 / 0 A · not RLS | ShowingDays → Lookup (7 published members; 7 RLS-listed) / obs ? / handled 0 of 7 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ShowingEndTime` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Compliance |
| `ShowingInstructions` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✔ | ✘ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | readiness COMPLETE (wired) · **DEAD PATH** | 18 | Compliance, Listing workspace, Portal & private sharing, Rental Form, Sale Form, Search results |
| `ShowingRequirements` | SUPPRESSED · 0 / 0 A · not RLS | ShowingRequirements → Lookup (40 published members; 0 RLS-listed) / obs ? / handled 0 of 40 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `ShowingServiceName` | SUPPRESSED · 0 / 0 A · not RLS | ShowingServiceName → Lookup (11 published members; 0 RLS-listed) / obs ? / handled 0 of 11 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ShowingStartTime` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Compliance |
| `StartShowingDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Security & doorman — primary verdict **PARTIAL** (1 fields, 1 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SecurityFeatures` | POPULATED · 1,890 / 140 A · not RLS | SecurityFeatures → Lookup (84 published members; 10 RLS-listed) / obs 10 / handled 1 of 84 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, directTest) | 9 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |

### Laundry — primary verdict **UNVERIFIED** (1 fields, 1 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `LaundryFeatures` | POPULATED · 393,328 / 7,599 A · RLS | LaundryFeatures → Lookup (50 published members; 38 RLS-listed) / obs 38 / handled 7 of 50 | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 14 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |

### Parking — primary verdict **PARTIAL** (12 fields, 9 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `GarageYN` | POPULATED · 547,220 · RLS | — | SR | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard) | 7 | Compliance, Listing workspace, Public display, Rental Form, Sale Form, Search results |
| `GarageSpaces` | POPULATED · 66,660 · not RLS | — | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ | ✔ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 6 | Compliance, Public display, Rental Form, Sale Form |
| `AttachedGarageYN` | POPULATED · 21,379 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 2 | Public display, Rental Form, Sale Form |
| `ParkingFeatures` | POPULATED · 10,376 / 768 A · RLS | ParkingFeatures → Lookup (204 published members; 54 RLS-listed) / obs 52 / handled 0 | SO | ✔ | struct+raw+form | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 11 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `ParkingTotal` | POPULATED · 237 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, directTest) | 5 | Listing workspace, Public display, Rental Form, Sale Form |
| `CarportYN` | POPULATED · 144 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 0 | — |
| `OpenParkingYN` | POPULATED · 126 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `OpenParkingSpaces` | POPULATED · 16 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ | ✔ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 4 | Compliance, Public display, Rental Form, Sale Form |
| `CarportSpaces` | POPULATED · 5 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 1 | Public display |
| `CoveredSpaces` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 2 | Public display |
| `OtherParking` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `RVParkingDimensions` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Pools & spa — primary verdict **PARTIAL** (5 fields, 4 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PoolFeatures` | POPULATED · 10,669 / 3,927 A · not RLS | PoolFeatures → Lookup (88 published members; 43 RLS-listed) / obs 41 / handled 3 of 88 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, directTest) | 6 | Building search, CMA, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `SpaFeatures` | POPULATED · 5,639 / 694 A · RLS | SpaFeatures → Lookup (24 published members; 1 RLS-listed) / obs 1 / handled 3 of 24 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, directTest) | 4 | Building search, CMA, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `SpaYN` | POPULATED · 2,208 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `PoolExpense` | POPULATED · 8 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `PoolPrivateYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |

### Accessibility — primary verdict **PARTIAL** (1 fields, 1 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `AccessibilityFeatures` | POPULATED · 4,802 / 81 A · RLS | AccessibilityFeatures → Lookup (76 published members; 25 RLS-listed) / obs 24 / handled 10 of 76 | SRO | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard) | 7 | Building search, CMA, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |

### Pets — primary verdict **PARTIAL** (6 fields, 2 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PetsComments` | POPULATED · 591,607 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `PetsAllowed` | POPULATED · 586,565 / 7,601 A · RLS | PetsAllowed → Lookup (31 published members; 14 RLS-listed) / obs 14 / handled 14 of 31 | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 20 | Building search, CMA, Compliance, Listing workspace, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Search results |
| `MaximumNumberOfPets` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MaximumPetWeight` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PetDeposit` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `PetsAllowedYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | R | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 6 | Compliance, Listing workspace, Public display, Rental Form, Rental Search, Rental Tools, Search results |

### Transportation & schools — primary verdict **NO-POPULATED-FIELDS** (43 fields, 0 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `DistanceToBusComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToBusNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToBusUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToElectricComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToElectricNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToElectricUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToFreewayComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToFreewayNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToFreewayUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToGasComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToGasNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToGasUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToPhoneServiceComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToPhoneServiceNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToPhoneServiceUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToPlaceofWorshipComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToPlaceofWorshipNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToPlaceofWorshipUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSchoolBusComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSchoolBusNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSchoolBusUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSchoolsComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSchoolsNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSchoolsUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSewerComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSewerNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToSewerUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToShoppingComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToShoppingNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToShoppingUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToStreetComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToStreetNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToStreetUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToWaterComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToWaterNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DistanceToWaterUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ElementarySchool` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ElementarySchoolDistrict` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `HighSchool` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `HighSchoolDistrict` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MiddleOrJuniorSchool` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MiddleOrJuniorSchoolDistrict` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `WalkScore` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 3 | Listing workspace |

### Compensation & concessions — primary verdict **NO-POPULATED-FIELDS** (20 fields, 0 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `BuyerBrokerageCompensation` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 5 | Listing workspace |
| `BuyerBrokerageCompensationType` | SUPPRESSED · 0 / 0 A · RLS | CompensationType → Lookup (5 published members; 2 RLS-listed) / obs ? / handled 0 of 5 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 3 | Listing workspace |
| `CompensationComments` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ConcessionInPrice` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ConcessionInPriceType` | SUPPRESSED · 0 / 0 A · not RLS | ConcessionInPriceType → Lookup (2 published members; 0 RLS-listed) / obs ? / handled 0 of 2 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Concessions` | SUPPRESSED · 0 / 0 A · RLS | Concessions → Lookup (3 published members; 3 RLS-listed) / obs ? / handled 3 of 3 | SO | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✔ | ✘ | ✔ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness COMPLETE (wired) · **DEAD PATH** | 8 | Compliance, Listing workspace, Portal & private sharing, Rental Form, Sale Form, Search results |
| `ConcessionsAmount` | SUPPRESSED · 0 / 0 A · RLS | — | SO | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✔ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness COMPLETE (wired) · **DEAD PATH** | 3 | Compliance, Portal & private sharing, Rental Form, Sale Form, Search results |
| `ConcessionsBuyerBrokerFee` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ConcessionsClosingCosts` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ConcessionsComments` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Compliance, Rental Form, Sale Form |
| `ConcessionsFinancingCosts` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ConcessionsOtherCosts` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ConcessionsPropertyImprovementCosts` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DualOrVariableRateCommissionYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `LeaseRenewalCompensation` | SUPPRESSED · 0 / 0 A · not RLS | LeaseRenewalCompensation → Lookup (5 published members; 5 RLS-listed) / obs ? / handled 0 of 5 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `SellerConsiderConcessionYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `SubAgencyCompensation` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 3 | Compliance, Portal & private sharing, Search results |
| `SubAgencyCompensationType` | SUPPRESSED · 0 / 0 A · not RLS | CompensationType → Lookup (5 published members; 0 RLS-listed) / obs ? / handled 0 of 5 | ✘ | ✘ | form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 3 | Compliance, Portal & private sharing, Search results |
| `TransactionBrokerCompensation` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 2 | Listing workspace |
| `TransactionBrokerCompensationType` | SUPPRESSED · 0 / 0 A · not RLS | CompensationType → Lookup (5 published members; 0 RLS-listed) / obs ? / handled 0 of 5 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Farm, agricultural & manufactured-home — primary verdict **PARTIAL** (45 fields, 1 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `Fencing` | POPULATED · 44 · not RLS | Fencing → Lookup (56 published members; 17 RLS-listed) / obs 17 / handled 0 of 56 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (directTest) | 0 | — |
| `BodyType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | BodyType → Lookup (7 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `CropsIncludedYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `CultivatedArea` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DOH1` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DOH2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DOH3` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FarmCreditServiceInclYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FarmLandAreaSource` | SUPPRESSED · 0 / 0 A · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs ? / handled 0 of 18 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FarmLandAreaUnits` | SUPPRESSED · 0 / 0 A · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs ? / handled 0 of 3 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FrontageType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FrontageType → Lookup (14 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `GrazingPermitsBlmYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `GrazingPermitsForestServiceYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `GrazingPermitsPrivateYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `HorseAmenities` | SUPPRESSED · 0 / 0 A · not RLS | HorseAmenities → Lookup (41 published members; 0 RLS-listed) / obs ? / handled 0 of 41 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `HorseYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `IrrigationSource` | SUPPRESSED · 0 / 0 A · not RLS | IrrigationSource → Lookup (21 published members; 0 RLS-listed) / obs ? / handled 0 of 21 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `IrrigationWaterRightsAcres` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `IrrigationWaterRightsYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `License1` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `License2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `License3` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Make` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 7 | Listing workspace, Rental Tools, Sale Tools |
| `MobileDimUnits` | SUPPRESSED · 0 / 0 A · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs ? / handled 0 of 4 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MobileHomeRemainsYN` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MobileLength` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MobileWidth` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Model` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Listing workspace |
| `ParkManagerName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ParkManagerPhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ParkName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PastureArea` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PowerProductionType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PowerProductionType → Lookup (2 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `PowerProductionYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `RangeArea` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `RoadFrontageType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | RoadFrontageType → Lookup (29 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `RoadResponsibility` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | RoadResponsibility → Lookup (5 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `RoadSurfaceType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | RoadSurfaceType → Lookup (16 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `SerialU` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `SerialX` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `SerialXX` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Skirt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Skirt → Lookup (25 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Topography` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `Vegetation` | SUPPRESSED · 0 / 0 A · not RLS | Vegetation → Lookup (19 published members; 0 RLS-listed) / obs ? / handled 0 of 19 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `WoodedArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Geography & map — primary verdict **PARTIAL** (51 fields, 25 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `City` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✘ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 68 | CMA, Compliance, Listing workspace, Map, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `CityRegion` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 198 | CMA, Compliance, Listing workspace, Map, Portal & private sharing, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `CountyOrParish` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ~ | ~ | ✘ | ~ | ✔ | ~ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto) | 8 | CMA, Compliance, Listing workspace, Map, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Saved Search |
| `PostalCode` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✘ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 93 | CMA, Compliance, Listing workspace, Map, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `StreetName` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 92 | CMA, Compliance, Listing workspace, Map, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results, Sync |
| `StreetNumber` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 92 | CMA, Compliance, Listing workspace, Map, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results, Sync |
| `SubdivisionName` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 313 | CMA, Compliance, Listing workspace, Map, Marketing, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `TaxBlock` | POPULATED · 591,607 · RLS | — | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 6 | Compliance, Listing workspace, Public display, Rental Form, Sale Form |
| `UnparsedAddress` | POPULATED · 591,607 · RLS | — | S | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✔ | ✘ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (resultCard, publicConsumer) | 67 | CMA, Compliance, Listing workspace, Map, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `StateOrProvince` | POPULATED · 591,604 · RLS | StateOrProvince → Lookup (100 published members; 7 RLS-listed) / obs 2 / handled 2 of 100 | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ~ | ✔ | ~ | ~ | ✘ | ~ | ✔ | ~ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (resultDto) | 19 | Compliance, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Sale Tools |
| `CountrySubdivision` | POPULATED · 591,582 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `PostalCity` | POPULATED · 591,064 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ~ | ~ | ✘ | ~ | ✔ | ~ | ✘ | ✔ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto) | 9 | Compliance, Listing workspace, Public display, Rental Form, Sale Form |
| `UnitNumber` | POPULATED · 582,428 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 84 | CMA, Compliance, Listing workspace, Map, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results, Sync |
| `StreetSuffix` | POPULATED · 580,305 · RLS | StreetSuffix → Lookup (298 published members; 31 RLS-listed) / obs 28 / handled 0 | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 49 | CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results |
| `StreetNumberNumeric` | POPULATED · 561,696 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `PostalCodePlus4` | POPULATED · 545,701 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `UniversalParcelId` | POPULATED · 545,161 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `CrossStreet` | POPULATED · 396,743 · RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard) | 12 | Listing workspace, Public display, Rental Form, Sale Form, Search results |
| `StreetAdditionalInfo` | POPULATED · 394,632 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `ParcelNumber` | POPULATED · 380,705 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `StreetDirPrefix` | POPULATED · 266,957 · RLS | StreetDirection → Lookup (10 published members; 4 RLS-listed) / obs 4 / handled 8 of 10 | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 49 | CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results |
| `TaxLot` | POPULATED · 266,897 · RLS | — | S | ✔ | struct+form | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 8 | Compliance, Listing workspace, Public display |
| `BuildingName` | POPULATED · 221,140 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 33 | CMA, Compliance, Listing workspace, Map, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `ZoningDescription` | POPULATED · 27,455 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, directTest) | 4 | Public display, Rental Form, Sale Form |
| `StreetDirSuffix` | POPULATED · 13,415 · RLS | StreetDirection → Lookup (10 published members; 5 RLS-listed) / obs 5 / handled 0 of 10 | SRO | ✔ | struct+form | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ~ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 35 | CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Search, Rental Tools, Sale Search, Sale Tools, Search results |
| `AdditionalParcelsDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `AdditionalParcelsYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `CarrierRoute` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ContinentRegion` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Country` | SUPPRESSED · 0 / 0 A · RLS | Country → Lookup (246 published members; 1 RLS-listed) / obs ? / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Compliance |
| `CountryRegion` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Directions` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 2 | Listing workspace |
| `Elevation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ElevationUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Latitude` | SUPPRESSED · 0 / 0 A · RLS | — | SR | ✔ | struct | · | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ✘ | readiness UNVERIFIED (wired) · **DEAD PATH** | 26 | CMA, Listing workspace, Map, Portal & private sharing, Public display, Rental Search, Reports, Sale Search, Saved Search, Search results |
| `Longitude` | SUPPRESSED · 0 / 0 A · RLS | — | SR | ✔ | struct | · | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ✘ | readiness UNVERIFIED (wired) · **DEAD PATH** | 26 | CMA, Listing workspace, Map, Portal & private sharing, Public display, Rental Search, Reports, Sale Search, Saved Search, Search results |
| `MapCoordinate` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `MapCoordinateSource` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MapURL` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MLSAreaMajor` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Listing workspace |
| `MLSAreaMinor` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Listing workspace |
| `ParcelSubcomponent` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PublicSurveyRange` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PublicSurveySection` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PublicSurveyTownship` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `StateRegion` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `StreetSuffixModifier` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxMapNumber` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `Township` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `X_GeocodeSource` | SUPPRESSED · 0 / 0 A · RLS | GeocodeSource → Lookup (10 published members; 4 RLS-listed) / obs ? / handled 0 of 10 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Zoning` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 6 | Listing workspace |

### Amenities & building features — primary verdict **PARTIAL** (50 fields, 38 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `Exposures` | POPULATED · 338,278 · not RLS | Exposures → Lookup (9 published members; 4 RLS-listed) / obs 4 / handled 0 of 9 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 22 | Listing workspace, Rental Form, Rental Tools, Sale Tools |
| `ArchitecturalStyle` | POPULATED · 248,763 · RLS | ArchitecturalStyle → Lookup (135 published members; 18 RLS-listed) / obs 17 / handled 1 of 135 | SR | ✔ | struct+form | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, directTest) | 3 | Rental Form, Search results |
| `ExteriorFeatures` | POPULATED · 238,927 / 6,417 A · RLS | ExteriorFeatures → Lookup (152 published members; 50 RLS-listed) / obs 46 / handled 0 | SRO | ✔ | struct+raw+form | ✘ | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 10 | Building search, CMA, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `CoolingYN` | POPULATED · 233,886 · RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard, publicConsumer) | 4 | Listing workspace, Rental Form, Search results |
| `Cooling` | POPULATED · 205,151 · RLS | Cooling → Lookup (41 published members; 19 RLS-listed) / obs 19 / handled 4 of 41 | S | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 14 | Building search, CMA, Compliance, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `Appliances` | POPULATED · 202,134 / 4,253 A · RLS | Appliances → Lookup (129 published members; 61 RLS-listed) / obs 56 / handled 8 of 129 | S | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 8 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `ViewYN` | POPULATED · 163,138 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 2 | Listing workspace, Sale Form |
| `PatioAndPorchFeatures` | POPULATED · 156,521 · RLS | PatioAndPorchFeatures → Lookup (53 published members; 27 RLS-listed) / obs 27 / handled 1 of 53 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard, directTest) | 7 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `InteriorFeatures` | POPULATED · 144,434 · RLS | InteriorOrRoomFeatures → Lookup (299 published members; 55 RLS-listed) / obs 53 · 8 filter-rejected / handled 0 | S | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 13 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `View` | POPULATED · 138,934 · RLS | View → Lookup (85 published members; 29 RLS-listed) / obs 27 / handled 15 of 85 | SR | ✔ | struct+form | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 92 | Building search, CMA, Compliance, Listing workspace, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results |
| `FireplaceYN` | POPULATED · 96,628 · RLS | — | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 2 | Compliance, Listing workspace |
| `Furnished` | POPULATED · 95,091 · RLS | Furnished → Lookup (5 published members; 5 RLS-listed) / obs 4 / handled 3 of 5 | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ✔ | ✔ | ✘ | ✔ | ~ | ✔ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 17 | Compliance, Listing workspace, Portal & private sharing, Rental Form, Rental Search, Rental Tools, Sale Search, Search results |
| `OtherEquipment` | POPULATED · 72,586 · RLS | OtherEquipment → Lookup (35 published members; 7 RLS-listed) / obs 4 / handled 0 of 35 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `BuildingFeatures` | POPULATED · 65,882 / 6,256 A · RLS | BuildingFeatures → Lookup (123 published members; 39 RLS-listed) / obs 39 / handled 36 of 123 | SRO | ✔ | struct+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **UNVERIFIED** | 23 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `BasementYN` | POPULATED · 65,252 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 0 | Rental Form, Sale Form |
| `Basement` | POPULATED · 59,659 · RLS | Basement → Lookup (43 published members; 20 RLS-listed) / obs 18 / handled 2 of 43 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✔ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 4 | Compliance, Listing workspace, Portal & private sharing |
| `HeatingYN` | POPULATED · 38,477 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 2 | Listing workspace, Rental Form |
| `FireplacesTotal` | POPULATED · 29,172 · RLS | — | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 3 | Compliance, Listing workspace |
| `Flooring` | POPULATED · 25,863 · RLS | Flooring → Lookup (62 published members; 23 RLS-listed) / obs 22 / handled 1 of 62 | S | ✔ | struct+raw+form | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch) | 8 | Listing workspace, Public display, Search results |
| `Heating` | POPULATED · 22,920 · RLS | Heating → Lookup (96 published members; 39 RLS-listed) / obs 29 / handled 5 of 96 | S | ✔ | struct+raw+form | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch) | 16 | Building search, CMA, Compliance, Listing workspace, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results |
| `FireplaceFeatures` | POPULATED · 18,576 · RLS | FireplaceFeatures → Lookup (79 published members; 32 RLS-listed) / obs 29 / handled 2 of 79 | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 1 | Compliance |
| `WindowFeatures` | POPULATED · 15,977 · RLS | WindowFeatures → Lookup (55 published members; 17 RLS-listed) / obs 16 / handled 0 of 55 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 1 | Public display |
| `CommunityFeatures` | POPULATED · 5,999 / 809 A · RLS | CommunityFeatures → Lookup (141 published members; 2 RLS-listed) / obs 2 / handled 22 of 141 | SO | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch) | 6 | Building search, CMA, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `LotFeatures` | POPULATED · 1,714 · not RLS | LotFeatures → Lookup (207 published members; 27 RLS-listed) / obs 20 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `OtherStructures` | POPULATED · 1,632 · not RLS | OtherStructures → Lookup (59 published members; 12 RLS-listed) / obs 11 / handled 0 of 59 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `DirectionFaces` | POPULATED · 1,382 · not RLS | DirectionFaces → Lookup (9 published members; 6 RLS-listed) / obs 5 / handled 0 of 9 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard, publicConsumer, directTest) | 2 | Search results |
| `FoundationArea` | POPULATED · 802 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `GreenEnergyEfficient` | POPULATED · 416 · not RLS | GreenEnergyEfficient → Lookup (25 published members; 8 RLS-listed) / obs 8 / handled 2 of 25 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, directTest) | 4 | Public display |
| `ElectricOnPropertyYN` | POPULATED · 118 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `WaterfrontYN` | POPULATED · 98 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 1 | Listing workspace |
| `ConstructionMaterials` | POPULATED · 45 · not RLS | ConstructionMaterials → Lookup (87 published members; 14 RLS-listed) / obs 9 / handled 0 of 87 | SR | ✔ | struct+form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard, directTest) | 3 | Public display, Search results |
| `DoorFeatures` | POPULATED · 32 · not RLS | DoorFeatures → Lookup (18 published members; 5 RLS-listed) / obs 5 / handled 0 of 18 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 1 | Public display |
| `FoundationDetails` | POPULATED · 13 · not RLS | FoundationDetails → Lookup (27 published members; 8 RLS-listed) / obs 5 / handled 1 of 27 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `SeniorCommunityYN` | POPULATED · 8 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `GreenBuildingVerificationType` | POPULATED · 5 · not RLS | GreenBuildingVerificationType → Lookup (29 published members; 2 RLS-listed) / obs 1 / handled 1 of 29 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, directTest) | 4 | Public display |
| `WaterfrontFeatures` | POPULATED · 5 · not RLS | WaterfrontFeatures → Lookup (77 published members; 1 RLS-listed) / obs 1 / handled 1 of 77 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, directTest) | 3 | Public display |
| `GreenEnergyGeneration` | POPULATED · 2 · not RLS | GreenEnergyGeneration → Lookup (8 published members; 1 RLS-listed) / obs 1 / handled 0 of 8 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `GreenIndoorAirQuality` | POPULATED · 1 · not RLS | GreenIndoorAirQuality → Lookup (8 published members; 1 RLS-listed) / obs 1 / handled 0 of 8 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `AssociationAmenities` | NOT-ON-FEED (not RLS-defined) · 0 / 0 A · not RLS | AssociationAmenities → Lookup (137 published members; 0 RLS-listed) / obs 0 / handled 0 | SRO | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 10 | Building search, CMA, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Search results |
| `CommonWalls` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | CommonWalls → Lookup (6 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `GreenLocation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | GreenLocation → Lookup (5 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `GreenSustainability` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | GreenSustainability → Lookup (9 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `GreenVerificationYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `GreenWaterConservation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | GreenWaterConservation → Lookup (12 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `Roof` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Roof → Lookup (51 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 6 | Listing workspace, Public display |
| `Sewer` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Sewer → Lookup (55 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Public display |
| `UnitsFurnished` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | UnitsFurnished → Lookup (7 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Utilities` | NOT-ON-FEED (not RLS-defined) · 0 / 0 A · not RLS | Utilities → Lookup (41 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 5 | Listing workspace, Public display |
| `UtilitiesExpense` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `WaterSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | WaterSource → Lookup (39 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Public display |

### Rental terms & fees — primary verdict **PARTIAL** (25 fields, 12 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `AvailabilityDate` | POPULATED · 373,040 · RLS | — | SR | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (rentalSearch, rentalTools) | 5 | Compliance, Rental Form, Rental Search, Rental Tools, Search results |
| `SecurityDeposit` | POPULATED · 161,522 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalSearch, resultDto, publicConsumer, rentalTools, complianceRule, directTest) | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `LandLeaseYN` | POPULATED · 70,069 · RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalSearch, publicConsumer, rentalTools, complianceRule, directTest) | 2 | Rental Form, Sale Form, Search results |
| `OwnerPays` | POPULATED · 7,915 · RLS | OwnerPays → Lookup (39 published members; 24 RLS-listed) / obs 23 / handled 3 of 39 | SR | ✔ | struct | · | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalTools, complianceRule) | 4 | Compliance, Listing workspace, Rental Form, Rental Search, Rental Tools, Sale Search, Search results |
| `MoveInCostsComments` | POPULATED · 381 · not RLS | — | S | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (rentalSearch, rentalTools, complianceRule) | 3 | Compliance, Listing workspace, Rental Form, Rental Search, Rental Tools, Search results |
| `MoveInCosts` | POPULATED · 375 · not RLS | MoveInCosts → Lookup (13 published members; 13 RLS-listed) / obs 13 / handled 2 of 13 | SR | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (rentalSearch, rentalTools, complianceRule) | 4 | Compliance, Listing workspace, Rental Form, Rental Search, Rental Tools, Search results |
| `LandLeaseExpirationDate` | POPULATED · 325 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalSearch, resultDto, publicConsumer, rentalTools, complianceRule, directTest) | 0 | Rental Form, Sale Form |
| `TenantPaysDescription` | POPULATED · 276 · not RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalSearch, rentalTools, complianceRule, directTest) | 3 | Compliance, Rental Form, Rental Search, Rental Tools, Search results |
| `TenantPays` | POPULATED · 261 · not RLS | TenantPays → Lookup (61 published members; 16 RLS-listed) / obs 12 / handled 4 of 61 | SR | ✔ | struct+form | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalSearch, rentalTools, complianceRule) | 4 | Compliance, Listing workspace, Rental Form, Rental Search, Rental Tools, Search results |
| `MoveInCostsAmount` | POPULATED · 108 · not RLS | — | S | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (rentalSearch, rentalTools, complianceRule) | 5 | Compliance, Listing workspace, Rental Form, Rental Search, Rental Tools, Search results |
| `OngoingFees` | POPULATED · 28 · not RLS | OngoingFees → Lookup (5 published members; 1 RLS-listed) / obs 1 / handled 1 of 5 | SR | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalSearch, rentalTools, complianceRule) | 4 | Compliance, Listing workspace, Rental Form, Rental Search, Rental Tools, Search results |
| `LandLeaseAmountFrequency` | POPULATED · 1 · not RLS | FeeFrequency → Lookup (16 published members; 2 RLS-listed) / obs 1 / handled 0 of 16 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (rentalSearch, resultDto, publicConsumer, rentalTools, complianceRule, directTest) | 0 | Rental Form, Sale Form |
| `AvailableLeaseType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ExistingLeaseType → Lookup (23 published members; 0 RLS-listed) / obs 0 / handled 0 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 2 | Rental Form, Search results |
| `ExistingLeaseType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ExistingLeaseType → Lookup (23 published members; 0 RLS-listed) / obs 0 / handled 0 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 2 | Search results |
| `LandLeaseAmount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | Rental Form, Sale Form |
| `LeaseAmount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | SR | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 3 | Compliance, Rental Form, Rental Search, Rental Tools, Search results |
| `LeaseAmountFrequency` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FeeFrequency → Lookup (16 published members; 0 RLS-listed) / obs 0 / handled 0 | SR | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 3 | Compliance, Rental Form, Rental Search, Rental Tools, Search results |
| `LeaseAssignableYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `LeaseConsideredYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `LeaseExpiration` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `LeaseRenewalOptionYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `LeaseTerm` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LeaseTerm → Lookup (26 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `LeaseTermOptions` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LeaseTerm → Lookup (26 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Compliance, Rental Form, Rental Search, Rental Tools |
| `RentIncludes` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | RentIncludes → Lookup (33 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Compliance, Listing workspace, Rental Form, Rental Search, Rental Tools |
| `TotalActualRent` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Financial & carrying costs — primary verdict **PARTIAL** (62 fields, 30 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `AssociationFee` | POPULATED · 243,779 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **COMPLETE** | 28 | Compliance, Listing workspace, Public display, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results |
| `SpecialListingConditions` | POPULATED · 114,397 · RLS | SpecialListingConditions → Lookup (34 published members; 8 RLS-listed) / obs 7 / handled 0 of 34 | S | ✔ | struct+form | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer) | 1 | Compliance, Sale Form |
| `TaxAnnualAmount` | POPULATED · 97,625 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **COMPLETE** | 22 | Compliance, Listing workspace, Public display, Rental Search, Sale Form, Sale Search, Search results |
| `AssociationFeeFrequency` | POPULATED · 81,884 · RLS | FeeFrequency → Lookup (16 published members; 4 RLS-listed) / obs 3 / handled 1 of 16 | SR | ✔ | struct+raw+form | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ~ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **COMPLETE** | 13 | Compliance, Public display, Sale Form, Search results |
| `AssociationYN` | POPULATED · 40,139 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, saleForm) | 2 | Public display |
| `WaterSewerExpense` | POPULATED · 10,392 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `AssociationFeeIncludes` | POPULATED · 4,552 · RLS | AssociationFeeIncludes → Lookup (63 published members; 14 RLS-listed) / obs 14 / handled 5 of 63 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, saleForm) | 4 | Listing workspace, Public display |
| `NetOperatingIncome` | POPULATED · 218 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `AssociationName` | POPULATED · 200 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto) | 7 | Listing workspace, Public display, Rental Form, Sale Form |
| `BuyerFinancing` | POPULATED · 184 · not RLS | BuyerFinancing → Lookup (42 published members; 8 RLS-listed) / obs 8 / handled 1 of 42 | O | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **MISSING** | 5 | Listing workspace, Portal & private sharing, Search results |
| `AssociationFee2Frequency` | POPULATED · 178 · not RLS | FeeFrequency → Lookup (16 published members; 5 RLS-listed) / obs 5 / handled 0 of 16 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 1 | Compliance |
| `AssociationFee2` | POPULATED · 60 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, saleForm) | 1 | Public display |
| `CapRate` | POPULATED · 44 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `Electric` | POPULATED · 10 · not RLS | Electric → Lookup (46 published members; 4 RLS-listed) / obs 3 / handled 0 of 46 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✘/✘/✘ | ?/?/? | ? | **MISSING** | 3 | Listing workspace, Public display |
| `MaintenanceExpense` | POPULATED · 10 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `CableTvExpense` | POPULATED · 8 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `ElectricExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `FuelExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `GardenerExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm) | 0 | — |
| `InsuranceExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `LicensesExpense` | POPULATED · 8 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `ManagerExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `NewTaxesExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `OperatingExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `OtherExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `PestControlExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `ProfessionalManagementExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, saleForm, directTest) | 1 | Public display |
| `SuppliesExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `TrashExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `WorkmansCompensationExpense` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, saleForm, directTest) | 0 | — |
| `AssociationFee3` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `AssociationFee3Frequency` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FeeFrequency → Lookup (16 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `AssociationName2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Public display |
| `AssociationName3` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `AssociationPhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 3 | Public display |
| `AssociationPhone2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Public display |
| `AssociationPhone3` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `CurrentFinancing` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | CurrentFinancing → Lookup (24 published members; 0 RLS-listed) / obs 0 / handled 0 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 2 | Search results |
| `DownPaymentAssistanceAmount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 4 | Search results |
| `DownPaymentAssistanceCount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 4 | Search results |
| `DownPaymentAssistanceYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FhaEligibility` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FhaEligibility → Lookup (5 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FinancialDataSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FinancialDataSource → Lookup (5 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Listing workspace |
| `FurnitureReplacementExpense` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `GrossIncome` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `GrossScheduledIncome` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `IncomeIncludes` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | IncomeIncludes → Lookup (7 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `ListingTerms` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ListingTerms → Lookup (67 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✘ | ✘ | · | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Rental Search, Sale Search |
| `OperatingExpenseIncludes` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | OperatingExpenseIncludes → Lookup (39 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `RentControlYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxAssessedValue` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxBookNumber` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxLegalDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxOtherAnnualAssessmentAmount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxParcelLetter` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxStatusCurrent` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | TaxStatusCurrent → Lookup (3 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxTract` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `TaxYear` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Search results |
| `VacancyAllowance` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `VacancyAllowanceRate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `WaterBodyName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `WaterHeater` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | WaterHeater → Lookup (25 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Lifecycle, status & dates — primary verdict **PARTIAL** (34 fields, 18 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ContractStatusChangeDate` | POPULATED · 591,607 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, reports, complianceRule) | 0 | Alerts, CMA, DOM, Permissions & visibility, Rental Search, Reports, Sale Search, Saved Search |
| `MajorChangeTimestamp` | POPULATED · 591,607 · RLS | — | S | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, reports, complianceRule) | 0 | — |
| `OriginalEntryTimestamp` | POPULATED · 591,607 · RLS | — | S | ✔ | raw+form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ | ✘ | ~ | ~ | ✘ | ~ | ✔ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, cma) | 2 | Compliance, Media |
| `StandardStatus` | POPULATED · 591,607 · RLS | StandardStatus → Lookup (11 published members; 9 RLS-listed) / obs 4 / handled 11 of 11 | SRO | ✔ | struct+raw | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 1108 | Alerts, CMA, Compliance, DOM, Listing workspace, Marketing, Media, Permissions & visibility, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Saved Search, Search results, Sync |
| `StatusChangeTimestamp` | POPULATED · 591,419 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, reports, complianceRule) | 2 | Alerts, CMA, DOM, Listing workspace, Permissions & visibility, Rental Search, Reports, Sale Search, Saved Search |
| `MajorChangeType` | POPULATED · 588,497 · RLS | ChangeType → Lookup (14 published members; 13 RLS-listed) / obs 8 / handled 9 of 14 | S | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, cma, reports, complianceRule) | 2 | Alerts, CMA, DOM, Listing workspace, Permissions & visibility, Rental Search, Reports, Sale Search, Saved Search |
| `ListingContractDate` | POPULATED · 581,836 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (reports) | 28 | Alerts, CMA, Compliance, DOM, Listing workspace, Permissions & visibility, Portal & private sharing, Public display, Rental Search, Reports, Sale Search, Saved Search, Search results |
| `OffMarketTimestamp` | POPULATED · 579,587 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, reports, complianceRule) | 0 | — |
| `OffMarketDate` | POPULATED · 578,868 · RLS | — | S | ✔ | raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, cma, reports) | 2 | Alerts, CMA, Compliance, DOM, Listing workspace, Permissions & visibility, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Saved Search |
| `CloseDate` | POPULATED · 578,417 · RLS | — | SRO | ✔ | raw+form | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 44 | Alerts, CMA, Compliance, DOM, Listing workspace, Permissions & visibility, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `OnMarketTimestamp` | POPULATED · 265,702 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, complianceRule) | 1 | Reports |
| `PurchaseContractDate` | POPULATED · 179,612 · RLS | — | SO | ✔ | raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ~ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, cma, reports) | 10 | Alerts, CMA, Compliance, DOM, Listing workspace, Permissions & visibility, Portal & private sharing, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Saved Search, Search results |
| `PendingTimestamp` | POPULATED · 143,221 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, cma, reports, complianceRule) | 2 | Alerts, CMA, DOM, Listing workspace, Permissions & visibility, Rental Search, Reports, Sale Search, Saved Search |
| `OnMarketDate` | POPULATED · 119,571 · RLS | — | SR | ✔ | raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch) | 21 | Alerts, CMA, Compliance, DOM, Listing workspace, Permissions & visibility, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `ActivationDate` | POPULATED · 46,105 · RLS | — | SRO | ✔ | raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (cma, reports) | 23 | Alerts, CMA, Compliance, DOM, Listing workspace, Permissions & visibility, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Saved Search, Search results |
| `BackOnMarketDate` | POPULATED · 4,354 · not RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, cma, reports, complianceRule) | 2 | Listing workspace |
| `BackOnMarketTimestamp` | POPULATED · 4,353 · not RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, reports, complianceRule) | 0 | — |
| `WithdrawnDate` | POPULATED · 22 · RLS | — | SO | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✔ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **MISSING** | 3 | Compliance, Portal & private sharing, Sale Form, Search results |
| `CancellationDate` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Compliance, Rental Form, Sale Form |
| `CompSaleYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Contingency` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ContingentDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `CumulativeDaysOnMarket` | SUPPRESSED · 0 / 0 A · RLS | — | SRO | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ~ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 16 | Alerts, CMA, DOM, Listing workspace, Permissions & visibility, Portal & private sharing, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Saved Search, Search results |
| `DaysOnMarket` | SUPPRESSED · 0 / 0 A · RLS | — | SRO | ✔ | raw | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ~ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | · | readiness PARTIAL (wired) · **DEAD PATH** | 29 | Alerts, CMA, DOM, Listing workspace, Permissions & visibility, Portal & private sharing, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Saved Search, Search results |
| `DaysOnMarketReplication` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DaysOnMarketReplicationDate` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DaysOnMarketReplicationIncreasingYN` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DelayedMarketingDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `DelayedMarketingYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `EstimatedCloseDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ExpirationDate` | SUPPRESSED · 0 / 0 A · RLS | — | SO | ✔ | raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✔ | ~ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 15 | Compliance, Listing workspace, Portal & private sharing, Rental Form, Sale Form, Search results, Sync |
| `MlsStatus` | SUPPRESSED · 0 / 0 A · RLS | MlsStatus → Lookup (26 published members; 9 RLS-listed) / obs ? / handled 12 of 26 | SRO | ✔ | raw | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ~ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | i | readiness UNVERIFIED (wired) · **DEAD PATH** | 53 | Alerts, CMA, Compliance, DOM, Listing workspace, Media, Permissions & visibility, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Saved Search, Search results |
| `PreviousStandardStatus` | SUPPRESSED · 0 / 0 A · not RLS | StandardStatus → Lookup (11 published members; 0 RLS-listed) / obs ? / handled 10 of 11 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | Alerts, CMA, DOM, Permissions & visibility, Rental Search, Reports, Sale Search, Saved Search |
| `SaleOrLeaseIndicator` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | SaleOrLeaseIndicator → Lookup (6 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Identity & sync keys — primary verdict **PARTIAL** (34 fields, 22 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `HumanModifiedYN` | POPULATED · 591,607 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `ListingAgreement` | POPULATED · 591,607 · RLS | ListingAgreement → Lookup (11 published members; 6 RLS-listed) / obs 5 / handled 5 of 11 | SR | ✔ | raw+form | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **COMPLETE** | 14 | Compliance, Listing workspace, Search results |
| `ListingId` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **COMPLETE** | 414 | Alerts, CMA, Listing workspace, Marketing, Media, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Search results, Sync |
| `ListingKey` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **COMPLETE** | 405 | Alerts, CMA, Listing workspace, Marketing, Media, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Search results, Sync |
| `ListingKeyNumeric` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ~ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **COMPLETE** | 3 | Media |
| `ModificationTimestamp` | POPULATED · 591,607 · not RLS | — | SRO | ✔ | struct+raw | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔ | ✘ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **COMPLETE** | 63 | CMA, Listing workspace, Media, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Search results, Sync |
| `OriginatingSystemKey` | POPULATED · 591,607 · RLS | — | S | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (directTest) | 3 | Listing workspace |
| `OriginatingSystemModificationTimestamp` | POPULATED · 591,607 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `OriginatingSystemName` | POPULATED · 591,607 · RLS | — | S | ✔ | struct+raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (directTest) | 2 | Listing workspace |
| `OriginatingSystemSubName` | POPULATED · 591,607 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `RecordSignature` | POPULATED · 591,607 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `SourceSystemID` | POPULATED · 591,607 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `OriginatingSystemListOfficeKey` | POPULATED · 589,675 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `OriginatingSystemListAgentMemberKey` | POPULATED · 587,646 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `ListingURL` | POPULATED · 582,804 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **MISSING** | 2 | Portal & private sharing, Rental Form, Sale Form, Search results |
| `OriginatingSystemID` | POPULATED · 546,550 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (directTest) | 0 | — |
| `CLIP` | POPULATED · 539,492 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `UniversalPropertyId` | POPULATED · 380,699 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `OriginatingSystemCoListAgentMemberKey` | POPULATED · 207,472 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `OriginatingSystemCoListAgent2MemberKey` | POPULATED · 50,998 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `OriginatingSystemCoListOfficeKey` | POPULATED · 21,227 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `OriginatingSystemCoListAgent3MemberKey` | POPULATED · 7,993 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `ListingService` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ListingService → Lookup (3 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ListingURLDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ListingURLDescription → Lookup (7 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OriginatingSystemBuyerAgentMemberKey` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OriginatingSystemBuyerOfficeKey` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OriginatingSystemBuyerTeamKey` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OriginatingSystemCoBuyerAgentMemberKey` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OriginatingSystemCoBuyerOfficeKey` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OriginatingSystemCoListOffice2Key` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `OriginatingSystemListTeamKey` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `SourceSystemKey` | SUPPRESSED · 0 / 0 A · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | readiness COMPLETE (wired) · **DEAD PATH** | 24 | Compliance, Listing workspace, Public display, Rental Search, Sale Search, Search results, Sync |
| `SourceSystemName` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✔ | struct | · | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Rental Search, Sale Search |
| `UniversalPropertySubId` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Pricing — primary verdict **PARTIAL** (7 fields, 6 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `CurrentPrice` | POPULATED · 591,607 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `ListPrice` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 196 | Alerts, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results, Sync |
| `ClosePrice` | POPULATED · 508,931 · RLS | — | SRO | ✔ | raw+form | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 41 | Alerts, CMA, Compliance, DOM, Listing workspace, Permissions & visibility, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results, Sync |
| `OriginalListPrice` | POPULATED · 375,691 · RLS | — | SRO | ✔ | raw | · | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ~ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 16 | Alerts, CMA, Compliance, Listing workspace, Portal & private sharing, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `PriceChangeTimestamp` | POPULATED · 361,678 · RLS | — | SR | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✘ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, cma, reports, saleTools) | 8 | Alerts, CMA, Listing workspace, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Saved Search, Search results |
| `PreviousListPrice` | POPULATED · 219,895 · RLS | — | SRO | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ~ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, reports, saleTools) | 8 | Alerts, CMA, Listing workspace, Portal & private sharing, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Saved Search, Search results |
| `ListPriceLow` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Classification & building facts — primary verdict **PARTIAL** (52 fields, 25 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `NumberOfUnitsTotal` | POPULATED · 591,607 · RLS | — | SR | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 12 | Compliance, Listing workspace, Public display, Rental Form, Sale Form |
| `PropertyType` | POPULATED · 591,607 · RLS | PropertyType → Lookup (13 published members; 3 RLS-listed) / obs 2 / handled 13 of 13 | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 178 | Alerts, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `PropertySubType` | POPULATED · 591,591 · RLS | PropertySubType → Lookup (76 published members; 10 RLS-listed) / obs 9 · 1 filter-rejected / handled 29 of 76 | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (resultCard) | 85 | Alerts, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Saved Search, Search results |
| `NewConstructionYN` | POPULATED · 576,590 · RLS | — | SR | ✔ | struct+form | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultCard) | 15 | Compliance, Listing workspace, Public display, Rental Form, Sale Form, Search results |
| `PropertySubTypeAdditional` | POPULATED · 553,713 · RLS | PropertySubTypeAdditional → Lookup (76 published members; 6 RLS-listed) / obs 6 · 1 filter-rejected / handled 0 of 76 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `StoriesTotal` | POPULATED · 533,803 · RLS | — | SR | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch) | 18 | Compliance, Listing workspace, Public display, Rental Form, Sale Form, Search results |
| `YearBuilt` | POPULATED · 485,638 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 29 | Alerts, CMA, Compliance, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Saved Search, Search results |
| `CommonInterest` | POPULATED · 435,273 · RLS | CommonInterest → Lookup (13 published members; 6 RLS-listed) / obs 5 / handled 13 of 13 | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **UNVERIFIED** | 52 | Alerts, CMA, Compliance, Listing workspace, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `EntryLevel` | POPULATED · 424,420 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 3 | Listing workspace, Rental Form, Sale Form |
| `StructureType` | POPULATED · 97,624 · RLS | StructureType → Lookup (23 published members; 11 RLS-listed) / obs 11 / handled 23 of 23 | SR | ✔ | struct+raw+form | ✘ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (resultCard) | 24 | Alerts, CMA, Compliance, Listing workspace, Public display, Rental Form, Rental Search, Reports, Sale Form, Sale Search, Saved Search, Search results |
| `BuildingAreaTotal` | POPULATED · 15,003 · RLS | — | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 7 | Compliance, Listing workspace, Public display, Rental Form, Sale Form |
| `BuildingAreaUnits` | POPULATED · 12,674 · RLS | AreaUnits → Lookup (3 published members; 2 RLS-listed) / obs 2 / handled 0 of 3 | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard) | 2 | Compliance, Public display, Rental Form, Sale Form |
| `NumberOfUnitsVacant` | POPULATED · 7,941 · RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, directTest) | 1 | Public display |
| `Levels` | POPULATED · 5,755 · RLS | Levels → Lookup (18 published members; 6 RLS-listed) / obs 6 / handled 0 of 18 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `Stories` | POPULATED · 1,612 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 5 | Listing workspace, Rental Form, Sale Form |
| `CurrentUse` | POPULATED · 786 · not RLS | CurrentOrPossibleUse → Lookup (66 published members; 10 RLS-listed) / obs 10 · 1 filter-rejected / handled 0 of 66 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 0 | Sale Form |
| `DevelopmentStatus` | POPULATED · 462 · not RLS | DevelopmentStatus → Lookup (19 published members; 7 RLS-listed) / obs 5 / handled 2 of 19 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, directTest) | 1 | Public display, Rental Form, Sale Form |
| `BuilderName` | POPULATED · 79 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 0 | — |
| `NumberOfBuildings` | POPULATED · 74 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `NumberOfSeparateGasMeters` | POPULATED · 10 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `NumberOfSeparateElectricMeters` | POPULATED · 9 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `NumberOfSeparateWaterMeters` | POPULATED · 8 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `NumberOfUnitsInCommunity` | POPULATED · 8 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **MISSING** | 8 | Public display |
| `LaborInformation` | POPULATED · 5 · not RLS | LaborInformation → Lookup (3 published members; 3 RLS-listed) / obs 3 / handled 0 of 3 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `PossibleUse` | POPULATED · 1 · not RLS | CurrentOrPossibleUse → Lookup (66 published members; 1 RLS-listed) / obs 1 · 1 filter-rejected / handled 0 of 66 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `AnchorsCoTenants` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BuilderModel` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✘/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `BuildingAreaSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Public display |
| `BuildingKey` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BuildingKeyNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 7 | Public display, Search results |
| `BusinessName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BusinessType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | BusinessType → Lookup (139 published members; 0 RLS-listed) / obs 0 / handled 0 | SR | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 2 | Rental Form, Sale Form, Search results |
| `EntryLocation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `HoursDaysOfOperation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | HoursDaysOfOperation → Lookup (9 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `HoursDaysOfOperationDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `LeasableArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `LeasableAreaUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `NumberOfFullTimeEmployees` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `NumberOfLots` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `NumberOfPads` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `NumberOfPartTimeEmployees` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `NumberOfUnitsLeased` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Public display |
| `NumberOfUnitsMoMo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Public display |
| `OwnershipType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | OwnershipType → Lookup (13 published members; 0 RLS-listed) / obs 0 / handled 0 | SR | ✔ | struct | · | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 10 | Public display, Rental Form, Search results |
| `PropertyAttachedYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 2 | Public display |
| `PropertyCondition` | SUPPRESSED · 0 / 0 A · RLS | PropertyCondition → Lookup (27 published members; 4 RLS-listed) / obs ? / handled 0 of 27 | S | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✘/✔/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 7 | Compliance, Listing workspace, Public display, Rental Form, Sale Form |
| `SeatingCapacity` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `YearBuiltDetails` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 4 | Public display |
| `YearBuiltEffective` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `YearBuiltSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | YearBuiltSource → Lookup (8 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 1 | Public display |
| `YearEstablished` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `YearsCurrentOwner` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Size & rooms — primary verdict **PARTIAL** (38 fields, 17 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `BedroomsTotal` | POPULATED · 587,737 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 95 | Alerts, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `RoomsTotal` | POPULATED · 587,737 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (resultCard, publicConsumer) | 11 | Compliance, Listing workspace, Rental Form, Rental Search, Sale Form, Sale Search, Search results |
| `BathroomsTotalInteger` | POPULATED · 587,684 · RLS | — | SR | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✔/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 20 | Alerts, CMA, Listing workspace, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search |
| `BathroomsFull` | POPULATED · 481,482 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 72 | Alerts, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results |
| `LivingAreaUnits` | POPULATED · 446,923 · RLS | AreaUnits → Lookup (3 published members; 1 RLS-listed) / obs 1 / handled 0 of 3 | S | ✔ | struct+raw+form | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✔/✘/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 1 | Compliance, Sale Form |
| `LivingArea` | POPULATED · 417,652 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✘/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 102 | Alerts, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Saved Search, Search results, Sync |
| `BathroomsHalf` | POPULATED · 409,765 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 46 | Compliance, Listing workspace, Portal & private sharing, Public display, Rental Form, Rental Search, Rental Tools, Reports, Sale Form, Sale Search, Sale Tools, Search results |
| `LotSizeDimensions` | POPULATED · 237,288 · RLS | — | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 1 | Compliance, Rental Form, Sale Form |
| `LotSizeArea` | POPULATED · 60,046 · RLS | — | SR | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ~ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch) | 5 | Compliance, Listing workspace, Rental Form, Sale Form, Search results |
| `LotSizeUnits` | POPULATED · 35,362 · RLS | LotSizeUnits → Lookup (4 published members; 3 RLS-listed) / obs 3 / handled 0 of 4 | S | ✔ | struct+form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer) | 1 | Compliance, Rental Form, Sale Form |
| `RoomType` | POPULATED · 8,296 · RLS | RoomType → Lookup (122 published members; 7 RLS-listed) / obs 7 · 1 filter-rejected / handled 0 of 122 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `LotSizeSource` | POPULATED · 341 · not RLS | LotSizeSource → Lookup (15 published members; 10 RLS-listed) / obs 10 / handled 0 of 15 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | Rental Form, Sale Form |
| `BathroomsOneQuarter` | POPULATED · 323 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 0 | — |
| `BathroomsThreeQuarter` | POPULATED · 258 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 1 | Compliance |
| `UnitTypeType` | POPULATED · 148 · not RLS | UnitTypeType → Lookup (22 published members; 2 RLS-listed) / obs 1 / handled 0 of 22 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `AboveGradeFinishedAreaUnits` | POPULATED · 76 · not RLS | AreaUnits → Lookup (3 published members; 1 RLS-listed) / obs 1 / handled 0 of 3 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 1 | Compliance |
| `BelowGradeFinishedAreaUnits` | POPULATED · 16 · not RLS | AreaUnits → Lookup (3 published members; 1 RLS-listed) / obs 1 / handled 0 of 3 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest) | 1 | Compliance |
| `AboveGradeFinishedArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `AboveGradeFinishedAreaSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `AboveGradeUnfinishedArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `AboveGradeUnfinishedAreaSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `AboveGradeUnfinishedAreaUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BathroomsPartial` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `BedroomsPossible` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BelowGradeFinishedArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `BelowGradeFinishedAreaSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `BelowGradeUnfinishedArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BelowGradeUnfinishedAreaSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BelowGradeUnfinishedAreaUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FrontageLength` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `FrontageLengthRemarks` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `FrontageLengthUnit` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FrontageLengthUnit → Lookup (3 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `LivingAreaSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | Sale Form |
| `LotDimensionsSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LotDimensionsSource → Lookup (14 published members; 0 RLS-listed) / obs 0 / handled 0 | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `LotSizeAcres` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `LotSizeSquareFeet` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MainLevelBathrooms` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `MainLevelBedrooms` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Remarks & disclosures — primary verdict **PARTIAL** (14 fields, 4 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PublicRemarks` | POPULATED · 579,433 · not RLS | — | SRO | ✔ | raw+form | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✘ | ~ | ~ | ✔ | ~ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **COMPLETE** | 37 | Compliance, Listing workspace, Marketing, Public display, Rental Form, Rental Search, Rental Tools, Sale Form, Sale Search, Sale Tools, Search results |
| `Inclusions` | POPULATED · 111,868 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `Exclusions` | POPULATED · 111,787 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `HomeWarrantyYN` | POPULATED · 6 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | — |
| `CopyrightNotice` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `Disclaimer` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✔ | struct | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 0 | — |
| `Disclosures` | SUPPRESSED · 0 / 0 A · not RLS | Disclosures → Lookup (119 published members; 0 RLS-listed) / obs ? / handled 0 of 119 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 20 | Listing workspace |
| `HabitableResidenceYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `Ownership` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 56 | Listing workspace, Marketing, Rental Search, Rental Tools, Sale Search, Sale Tools |
| `Possession` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Possession → Lookup (39 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PrivateOfficeRemarks` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `PrivateRemarks` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✔ | raw+form | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ✔ | ✘ | ✔ | ✘ | ✔ | ✔/✔/✔/✘/✔ | ?/?/? | ? | readiness PARTIAL (wired) · **DEAD PATH** | 18 | Compliance, Listing workspace, Portal & private sharing, Search results |
| `SignOnPropertyYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `SpecialLicenses` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | SpecialLicenses → Lookup (19 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |

### Agent & office attribution — primary verdict **PARTIAL** (206 fields, 80 populated)

| Field | Provider availability | Vocabulary (authority → published / observed / handled) | Sel | Map | Store | Reload | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Saved | Alert | DTO | Card | Wksp | Mkt | Portal | Public | Compl | Tests D/N/I/W/C | Beh Pu/Me/Pr | Prod | Verdict | Cons | Domains served |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ListAgentEmail` | POPULATED · 591,607 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 18 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Search, Reports, Sale Search, Search results |
| `ListAgentFullName` | POPULATED · 591,607 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ~ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ~ | ✘ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (complianceRule) | 25 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Search results |
| `ListOfficeKey` | POPULATED · 591,607 · RLS | — | S | ✔ | raw+form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, complianceRule, cma, reports) | 1 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Public display, Reports |
| `ListOfficeKeyNumeric` | POPULATED · 591,607 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListOfficeMlsId` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ~ | ✘ | ~ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (resultDto, complianceRule) | 18 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools |
| `ListOfficeName` | POPULATED · 591,607 · RLS | — | SRO | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ~ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (complianceRule) | 46 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools, Search results |
| `ListOfficePhone` | POPULATED · 591,538 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListOfficeAOR` | POPULATED · 591,537 · RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs 1 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentMlsId` | POPULATED · 591,197 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ~ | ✘ | ~ | ✔ | ✔ | ✔ | ~ | ✔ | ✔/✘/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (resultDto) | 15 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools |
| `ListAgentKey` | POPULATED · 587,315 · RLS | — | S | ✔ | raw+form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✔ | ✘ | ✔ | ✘ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (publicConsumer, complianceRule, cma, reports) | 5 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Reports, Search results |
| `ListAgentKeyNumeric` | POPULATED · 587,315 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentLastName` | POPULATED · 585,980 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentFirstName` | POPULATED · 585,957 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentAOR` | POPULATED · 585,917 · RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs 1 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentNickname` | POPULATED · 585,639 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListOfficeURL` | POPULATED · 585,251 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentDirectPhone` | POPULATED · 580,228 · RLS | — | SR | ✔ | struct+raw+form | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ~ | ✔ | ✔/✔/✔/✔/✔ | ?/?/? | ? | **UNVERIFIED** | 18 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Portal & private sharing, Public display, Rental Search, Reports, Sale Search, Search results |
| `ListAgentPreferredPhone` | POPULATED · 578,578 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentMiddleName` | POPULATED · 250,636 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentEmail` | POPULATED · 208,274 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **MISSING** | 2 | Agent search, Brokerage identity, CMA, Compliance, Portal & private sharing, Public display, Reports, Search results |
| `CoListAgentFullName` | POPULATED · 208,274 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **PARTIAL** (publicConsumer, complianceRule, cma, reports) | 2 | Agent search, Brokerage identity, CMA, Compliance, Portal & private sharing, Public display, Reports, Search results |
| `CoListAgentMlsId` | POPULATED · 208,023 · RLS | — | S | ✔ | struct | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ~ | ✘ | ~ | ✔ | ✔ | ✔ | ~ | ✘ | ✔/✘/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (resultDto, complianceRule) | 9 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools |
| `CoListAgentKey` | POPULATED · 207,401 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **MISSING** | 2 | Agent search, Brokerage identity, CMA, Compliance, Portal & private sharing, Public display, Reports, Search results |
| `CoListAgentKeyNumeric` | POPULATED · 207,401 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeKey` | POPULATED · 207,401 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeKeyNumeric` | POPULATED · 207,401 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeMlsId` | POPULATED · 207,401 · RLS | — | S | ✔ | struct | · | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ~ | ✘ | ~ | ✔ | ✔ | ✔ | ~ | ✘ | ✔/✘/✔/✔/✔ | ?/?/? | ? | **PARTIAL** (resultDto, complianceRule) | 8 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Marketing, Portal & private sharing, Public display, Rental Search, Rental Tools, Reports, Sale Search, Sale Tools |
| `CoListOfficeName` | POPULATED · 207,401 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, complianceRule, cma, reports, directTest) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentAOR` | POPULATED · 207,368 · RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs 1 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentLastName` | POPULATED · 207,360 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentFirstName` | POPULATED · 207,355 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficePhone` | POPULATED · 207,248 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeAOR` | POPULATED · 207,183 · RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 1 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentNickname` | POPULATED · 206,954 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentDirectPhone` | POPULATED · 206,739 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✘ | ✔/✔/✔/✘/✔ | ?/?/? | ? | **MISSING** | 2 | Agent search, Brokerage identity, CMA, Compliance, Portal & private sharing, Public display, Reports, Search results |
| `CoListAgentPreferredPhone` | POPULATED · 206,467 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeURL` | POPULATED · 199,749 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeMlsId` | POPULATED · 100,463 · RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, complianceRule, cma, reports) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentMlsId` | POPULATED · 100,112 · RLS | — | S | ✘ | form | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **MISSING** | 2 | Agent search, Brokerage identity, CMA, Compliance, Listing workspace, Public display, Reports |
| `CoListAgentMiddleName` | POPULATED · 84,950 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentURL` | POPULATED · 61,122 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListOfficeEmail` | POPULATED · 52,567 · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2MlsId` | POPULATED · 51,234 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2FullName` | POPULATED · 50,995 · not RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, complianceRule, cma, reports) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2Key` | POPULATED · 50,994 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOffice2Key` | POPULATED · 50,994 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOffice2MlsId` | POPULATED · 50,994 · not RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, complianceRule, cma, reports) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOffice2Name` | POPULATED · 50,994 · not RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, complianceRule, cma, reports) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2FirstName` | POPULATED · 50,931 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2LastName` | POPULATED · 50,931 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOffice2Phone` | POPULATED · 50,927 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2Email` | POPULATED · 50,916 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOffice2AOR` | POPULATED · 50,884 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 1 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2DirectPhone` | POPULATED · 50,831 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2AOR` | POPULATED · 50,821 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 1 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2PreferredPhone` | POPULATED · 50,779 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2StateLicense` | POPULATED · 50,697 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2Nickname` | POPULATED · 50,677 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOffice2URL` | POPULATED · 48,800 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2MobilePhone` | POPULATED · 48,785 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeEmail` | POPULATED · 21,683 · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2MiddleName` | POPULATED · 19,072 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3MlsId` | POPULATED · 7,994 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3FullName` | POPULATED · 7,993 · not RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, complianceRule, cma, reports) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3Key` | POPULATED · 7,993 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3Email` | POPULATED · 7,987 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3DirectPhone` | POPULATED · 7,962 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3FirstName` | POPULATED · 7,957 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3LastName` | POPULATED · 7,957 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3PreferredPhone` | POPULATED · 7,937 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3StateLicense` | POPULATED · 7,880 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3AOR` | POPULATED · 7,868 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 1 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3Nickname` | POPULATED · 7,828 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3MobilePhone` | POPULATED · 7,493 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOffice2Email` | POPULATED · 6,411 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2URL` | POPULATED · 3,861 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeMlsId` | POPULATED · 3,173 · not RLS | — | S | ✔ | raw | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✔/✘/✔/✘/✘ | ?/?/? | ? | **PARTIAL** (resultDto, publicConsumer, cma, reports) | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentMlsId` | POPULATED · 3,168 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3MiddleName` | POPULATED · 3,101 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3URL` | POPULATED · 716 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | **MISSING** | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentAOR` | SUPPRESSED · 0 / 0 A · RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs ? / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentDesignation` | SUPPRESSED · 0 / 0 A · not RLS | BuyerAgentDesignation → Lookup (27 published members; 0 RLS-listed) / obs ? / handled 0 of 27 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentDirectPhone` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 3 | Agent search, Brokerage identity, CMA, Compliance, Portal & private sharing, Public display, Rental Form, Reports, Sale Form, Search results |
| `BuyerAgentEmail` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ | ~ | ✘ | ✔ | ✘ | ✔ | ✔/✔/✘/✘/✔ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 3 | Agent search, Brokerage identity, CMA, Compliance, Portal & private sharing, Public display, Rental Form, Reports, Sale Form, Search results |
| `BuyerAgentFax` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentFirstName` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentFullName` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Rental Form, Reports, Sale Form |
| `BuyerAgentHomePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentKey` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentKeyNumeric` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentLastName` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentMiddleName` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentMobilePhone` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentNamePrefix` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentNameSuffix` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentNationalAssociationId` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentOfficePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentOfficePhoneExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentPager` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentPreferredPhone` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentPreferredPhoneExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentStateLicense` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Rental Form, Reports, Sale Form |
| `BuyerAgentTollFreePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentURL` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentVoiceMail` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerAgentVoiceMailExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeAOR` | SUPPRESSED · 0 / 0 A · RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs ? / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeEmail` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeFax` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeKey` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeKeyNumeric` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeName` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Rental Form, Reports, Sale Form |
| `BuyerOfficeNationalAssociationId` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficePhone` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | form | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Rental Form, Reports, Sale Form |
| `BuyerOfficePhoneExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerOfficeURL` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `BuyerTeamKey` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BuyerTeamKeyNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BuyerTeamMlsId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `BuyerTeamName` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `CoBuyerAgentAOR` | SUPPRESSED · 0 / 0 A · not RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs ? / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentDesignation` | SUPPRESSED · 0 / 0 A · not RLS | CoBuyerAgentDesignation → Lookup (27 published members; 0 RLS-listed) / obs ? / handled 0 of 27 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentDirectPhone` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentEmail` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentFax` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentFirstName` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentFullName` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentHomePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentKey` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentKeyNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentLastName` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentMiddleName` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentMobilePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentNamePrefix` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentNameSuffix` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentNationalAssociationId` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentOfficePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentOfficePhoneExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentPager` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentPreferredPhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentPreferredPhoneExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentStateLicense` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentTollFreePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentURL` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentVoiceMail` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerAgentVoiceMailExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeAOR` | SUPPRESSED · 0 / 0 A · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs ? / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeEmail` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeFax` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeKey` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeKeyNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeName` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeNationalAssociationId` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ | ✔ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) · **DEAD PATH** | 1 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficePhoneExt` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoBuyerOfficeURL` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2HomePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2NationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent2OfficePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3HomePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3NationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgent3OfficePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentDesignation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | CoListAgentDesignation → Lookup (27 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentFax` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentHomePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentMobilePhone` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentNamePrefix` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentNameSuffix` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentNationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentOfficePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentOfficePhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentPager` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentPreferredPhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentStateLicense` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentTollFreePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentURL` | SUPPRESSED · 0 / 0 A · RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentVoiceMail` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListAgentVoiceMailExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeFax` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficeNationalAssociationId` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `CoListOfficePhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `HeadBrokerMemberKey` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `HeadBrokerMemberMlsId` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ListAgentDesignation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ListAgentDesignation → Lookup (27 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentFax` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentHomePhone` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentMobilePhone` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentNamePrefix` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentNameSuffix` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentNationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentOfficePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentOfficePhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentPager` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentPreferredPhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentStateLicense` | SUPPRESSED · 0 / 0 A · RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentTollFreePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentVoiceMail` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAgentVoiceMailExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListAOR` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 0 / handled 0 | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ListOfficeFax` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListOfficeNationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListOfficePhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Agent search, Brokerage identity, CMA, Compliance, Public display, Reports |
| `ListTeamKey` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Rental Form, Sale Form |
| `ListTeamKeyNumeric` | SUPPRESSED · 0 / 0 A · not RLS | — | ✘ | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ListTeamMlsId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | — |
| `ListTeamName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | S | ✘ | ✘ | · | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘/✘/✘/✘/✘ | ?/?/? | ? | readiness MISSING (unwired) | 0 | Rental Form, Sale Form |

## F. Navigation subsections — target resource fields, access path, Mallan consumers

### Media — reached by `Property.Media`; entity set HTTP 200; runtime pulls: `lib/idx/trestle-mapper.ts`, `lib/idx/fetch.ts`, `app/api/agents/[slug]/listings/route.ts`, `lib/idx/write-suppression.ts` +7

| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |
|---|---|---|---|---|---|---|---|---|
| `MediaClassification` | POPULATED · 2,000,898 · not RLS | MediaClassification → Lookup (4 published members; 0 RLS-listed) / obs 2 | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts` | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:54` `lib/media/listing-media-resolver.ts:141` +1 | ✔/✔ | no |
| `MediaKey` | POPULATED · 2,000,898 · RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1272@lib/idx/sync.ts` +1 | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:54` `lib/idx/write-suppression.ts:302` +2 | ✔/✔ | no |
| `MediaKeyNumeric` | POPULATED · 2,000,898 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MediaModificationTimestamp` | POPULATED · 2,000,898 · RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts` | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:56` `lib/idx/media-sync.ts:328` +2 | ✔/✔ | no |
| `MediaStatus` | POPULATED · 2,000,898 · RLS | MediaStatus → Lookup (3 published members; 1 RLS-listed) / obs 1 | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1272@lib/idx/sync.ts` +2 | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:1065` | ✔/✔ | no |
| `MediaType` | POPULATED · 2,000,898 · RLS | MediaType → Lookup (22 published members; 7 RLS-listed) / obs 4 | ✘ | ✘ | ✘ | — | ✔/✘ | no |
| `ModificationTimestamp` | POPULATED · 2,000,898 · not RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts` | ✘ | ✘ | criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; saleTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; rentalTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; resultDto `lib/search/crm-idx-mapper.ts:294` `lib/search/crm-idx-mapper.ts:295`; listingWorkspace `public/crm/js/core/reso-field-map.js:73` `public/crm/js/dashboard/panels.js:9565` +3; reports `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/write-suppression.ts:654` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `Order` | POPULATED · 2,000,898 · RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1272@lib/idx/sync.ts` +2 | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:55` `lib/media/listing-media-resolver.ts:362` +3 | ✔/✔ | no |
| `OriginatingSystemMediaKey` | POPULATED · 2,000,898 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemName` | POPULATED · 2,000,898 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:2155` | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemResourceRecordKey` | POPULATED · 2,000,898 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RecordSignature` | POPULATED · 2,000,898 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `ResourceName` | POPULATED · 2,000,898 · RLS | ResourceName → Lookup (5 published members; 3 RLS-listed) / obs 2 | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `ResourceRecordKey` | POPULATED · 2,000,898 · RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1272@lib/idx/sync.ts` +2 | ✘ | ✘ | resultDto `lib/search/engine/hydrate.ts:69`; mediaLane `lib/media/listing-media-resolver.ts:54` `lib/idx/media-sync.ts:1084` +2 | ✔/✔ | no |
| `ResourceRecordKeyNumeric` | POPULATED · 2,000,898 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceSystemID` | POPULATED · 2,000,898 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `MediaCategory` | POPULATED · 2,000,897 · RLS | MediaCategory → Lookup (18 published members; 8 RLS-listed) / obs 2 | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1272@lib/idx/sync.ts` +2 | ✘ | ✘ | projection `lib/search/listing-search-projection.ts:382`; saleSearch `lib/search/listing-search-projection.ts:382`; rentalSearch `lib/search/listing-search-projection.ts:382`; resultDto `lib/search/crm-idx-mapper.ts:34`; publicConsumer `lib/buildings/upsert.ts:139` `lib/buildings/upsert.ts:140`; mediaLane `lib/media/listing-media-resolver.ts:54` `lib/media/listing-media-resolver.ts:140` +4 | ✔/✔ | no |
| `ResourceRecordID` | POPULATED · 2,000,888 · RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1918@lib/idx/sync.ts` | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:54` `lib/idx/media-sync.ts:1085` +2 | ✔/✘ | no |
| `InternetEntireListingDisplayYN` | POPULATED · 2,000,836 · not RLS | — | ✘ | ✔ | ✔ | criterion `app/api/listings/suggest/route.ts:90`; saleSearch `app/api/listings/suggest/route.ts:90`; rentalSearch `app/api/listings/suggest/route.ts:90`; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; resultDto `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:98`; listingWorkspace `lib/listings/mallan-form-contract.ts:117` `app/api/crm/listings/[id]/route.ts:150` +17; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` +9; mediaLane `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2942` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeMlsId` | POPULATED · 2,000,836 · not RLS | — | ✘ | ✘ | ✘ | criterion `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; rentalSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleTools `lib/syndication/eligibility.ts:142`; rentalTools `lib/syndication/eligibility.ts:142`; listingWorkspace `app/api/crm/listings/[id]/route.ts:425` `app/api/crm/listings/[id]/route.ts:441` +4; marketing `lib/syndication/eligibility.ts:142`; publicConsumer `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426` | ✔/✔ | yes — name-matched reads may be Property reads |
| `OriginatingSystemSubName` | POPULATED · 2,000,836 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `PropertyType` | POPULATED · 2,000,836 · not RLS | PropertyType → Lookup (13 published members; 0 RLS-listed) / obs 2 | ✘ | ✔ | ✔ | criterion `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; rentalSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; rentalTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; resultDto `lib/search/crm-idx-mapper.ts:30`; listingWorkspace `lib/crm/listing-form-mapping.ts:118` `lib/crm/listing-form-mapping.ts:119` +15; cma `lib/comps/fetch-comps.ts:76`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:57` `lib/buildings/public-building-data.ts:84` +12; complianceRule `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `StandardStatus` | POPULATED · 2,000,836 · not RLS | StandardStatus → Lookup (11 published members; 11 RLS-listed) / obs 9 | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; rentalSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; rentalTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; resultDto `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:175`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:257` +13; cma `lib/comps/fetch-comps.ts:75`; reports `app/api/market/route.ts:457`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:59` `lib/buildings/public-building-data.ts:84` +6; complianceRule `lib/compliance/gates.ts:119`; mediaLane `lib/idx/media-sync.ts:9` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeKey` | POPULATED · 2,000,750 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `app/api/crm/listings/[id]/route.ts:425` | ✔/✔ | yes — name-matched reads may be Property reads |
| `PropertySubType` | POPULATED · 2,000,293 · not RLS | PropertySubType → Lookup (76 published members; 0 RLS-listed) / obs 10 | ✘ | ✘ | ✔ | criterion `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; rentalSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; rentalTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; resultDto `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:275`; listingWorkspace `lib/crm/listing-form-mapping.ts:121` `lib/crm/listing-form-mapping.ts:292` +23; reports `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; publicConsumer `lib/buildings/public-building-data.ts:84` `lib/buildings/public-building-data.ts:979` +11; complianceRule `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListAgentKey` | POPULATED · 1,987,830 · not RLS | — | ✘ | ✘ | ✘ | resultDto `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75`; listingWorkspace `app/api/crm/listings/[id]/route.ts:423`; portalSharing `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | ✔/✔ | yes — name-matched reads may be Property reads |
| `SourceSystemMediaKey` | POPULATED · 1,840,948 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PropertySubTypeAdditional` | POPULATED · 1,821,445 · not RLS | PropertySubTypeAdditional → Lookup (76 published members; 0 RLS-listed) / obs 6 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `ListingPermission` | POPULATED · 1,699,794 · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs 4 | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `MediaObjectID` | POPULATED · 1,562,623 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OffMarketDate` | POPULATED · 1,362,225 · not RLS | — | ✘ | ✔ | ✔ | listingWorkspace `lib/listings/terminal-since.ts:76`; complianceRule `lib/compliance/rebny-ucba-rules.ts:352` | ✔/✔ | yes — name-matched reads may be Property reads |
| `OriginatingSystemID` | POPULATED · 1,318,099 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `MediaURL` | POPULATED · 589,848 · not RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1272@lib/idx/sync.ts` +2 | ✘ | ✘ | publicConsumer `lib/buildings/public-building-data.ts:69` `lib/buildings/public-building-data.ts:71` +4; mediaLane `lib/media/listing-media-resolver.ts:54` `lib/media/listing-media-resolver.ts:149` +7 | ✔/✔ | no |
| `ShortDescription` | POPULATED · 133,895 · not RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts` | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:55` `lib/media/listing-media-resolver.ts:142` | ✔/✘ | no |
| `PreferredPhotoYN` | POPULATED · 71,570 · RLS | — | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts`, `$select@1272@lib/idx/sync.ts` +2 | ✘ | ✘ | mediaLane `lib/media/listing-media-resolver.ts:55` `lib/media/listing-media-resolver.ts:367` +1 | ✔/✔ | no |
| `LongDescription` | POPULATED · 31,738 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ImageOf` | POPULATED · 1 · not RLS | ImageOf → Lookup (92 published members; 1 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ChangedByMemberID` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ChangedByMemberKey` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ChangedByMemberKeyNumeric` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ClassName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ClassName → Lookup (17 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `HumanModifiedYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | yes — name-matched reads may be Property reads |
| `ImageHeight` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ImageSizeDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ImageWidth` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ListAOR` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `MediaAlteration` | SUPPRESSED-UNMEASURED · n/a · not RLS | MediaAlteration → Lookup (10 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MediaHTML` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MediaStatusDescription` | SUPPRESSED-UNMEASURED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginalMediaUrl` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | no |
| `OriginatingSystemResourceRecordId` | SUPPRESSED-UNMEASURED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Permission` | SUPPRESSED-UNMEASURED · n/a · not RLS | Permission → Lookup (7 published members; 2 RLS-listed) / obs ? | `MEDIA_SELECT_FIELDS@lib/media/listing-media-resolver.ts` | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; rentalSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:275` +4; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:9` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `SourceSystemName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/canonical/field-registry.ts:117`; saleSearch `lib/search/canonical/field-registry.ts:117`; rentalSearch `lib/search/canonical/field-registry.ts:117` | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemResourceRecordKey` | SUPPRESSED-UNMEASURED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SyndicateTo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | SyndicateTo → Lookup (28 published members; 0 RLS-listed) / obs 0 | ✘ | ✔ | ✔ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:53` `public/crm/js/compliance/compliance-gates-and-output.js:56` +7; complianceRule `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `X_MediaStream` | SUPPRESSED-UNMEASURED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |

### OpenHouse — reached by `Property.OpenHouse`; entity set HTTP 200; runtime pulls: `lib/open-houses/upcoming-open-houses.ts`, `app/api/listings/route.ts`, `app/api/open-houses/route.ts`, `lib/search/canonical/field-registry.ts`

| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |
|---|---|---|---|---|---|---|---|---|
| `HumanModifiedYN` | POPULATED · 1,483 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | yes — name-matched reads may be Property reads |
| `InternetEntireListingDisplayYN` | POPULATED · 1,483 · not RLS | — | ✘ | ✔ | ✔ | criterion `app/api/listings/suggest/route.ts:90`; saleSearch `app/api/listings/suggest/route.ts:90`; rentalSearch `app/api/listings/suggest/route.ts:90`; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; resultDto `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:98`; listingWorkspace `lib/listings/mallan-form-contract.ts:117` `app/api/crm/listings/[id]/route.ts:150` +17; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` +9; mediaLane `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2942` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListAgentKey` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | resultDto `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75`; listingWorkspace `app/api/crm/listings/[id]/route.ts:423`; portalSharing `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingId` | POPULATED · 1,483 · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | criterion `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +6; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; rentalSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; resultDto `lib/search/crm-idx-mapper.ts:248` `lib/search/crm-idx-mapper.ts:287` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:462` `app/api/crm/sales/prospects/[id]/comps/route.ts:30` +17; cma `lib/comps/fetch-comps.ts:71`; reports `lib/market-report/generator.ts:168`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +34; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3701` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKey` | POPULATED · 1,483 · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | projection `lib/search/listing-search-projection.ts:465`; criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` +8; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; resultDto `lib/search/engine/hydrate.ts:74`; listingWorkspace `lib/listings/mallan-form-contract.ts:456` `public/crm/js/core/reso-field-map.js:67` +2; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +27; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3678` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKeyNumeric` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | mediaLane `lib/idx/media-sync.ts:8` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeKey` | POPULATED · 1,483 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `app/api/crm/listings/[id]/route.ts:425` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeMlsId` | POPULATED · 1,483 · not RLS | — | ✘ | ✘ | ✘ | criterion `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; rentalSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleTools `lib/syndication/eligibility.ts:142`; rentalTools `lib/syndication/eligibility.ts:142`; listingWorkspace `app/api/crm/listings/[id]/route.ts:425` `app/api/crm/listings/[id]/route.ts:441` +4; marketing `lib/syndication/eligibility.ts:142`; publicConsumer `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ModificationTimestamp` | POPULATED · 1,483 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; saleTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; rentalTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; resultDto `lib/search/crm-idx-mapper.ts:294` `lib/search/crm-idx-mapper.ts:295`; listingWorkspace `public/crm/js/core/reso-field-map.js:73` `public/crm/js/dashboard/panels.js:9565` +3; reports `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/write-suppression.ts:654` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `OpenHouseDate` | POPULATED · 1,483 · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:336`; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:336`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:336` +2 | ✔/✔ | no |
| `OpenHouseEndTime` | POPULATED · 1,483 · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:338`; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:338`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:338` +2 | ✔/✔ | no |
| `OpenHouseId` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OpenHouseKey` | POPULATED · 1,483 · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | saleTools `lib/open-houses/upcoming-open-houses.ts:49`; rentalTools `lib/open-houses/upcoming-open-houses.ts:49`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `app/api/open-houses/route.ts:251` +1 | ✔/✔ | no |
| `OpenHouseKeyNumeric` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OpenHouseStartTime` | POPULATED · 1,483 · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:337`; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:337`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:337` +2 | ✔/✔ | no |
| `OpenHouseStatus` | POPULATED · 1,483 · RLS | OpenHouseStatus → Lookup (3 published members; 3 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `OriginatingSystemKey` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:1912` +1 | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemListingKey` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemName` | POPULATED · 1,483 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:2155` | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemSubName` | POPULATED · 1,483 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `PropertySubType` | POPULATED · 1,483 · not RLS | PropertySubType → Lookup (76 published members; 0 RLS-listed) / obs 6 | ✘ | ✘ | ✔ | criterion `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; rentalSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; rentalTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; resultDto `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:275`; listingWorkspace `lib/crm/listing-form-mapping.ts:121` `lib/crm/listing-form-mapping.ts:292` +23; reports `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; publicConsumer `lib/buildings/public-building-data.ts:84` `lib/buildings/public-building-data.ts:979` +11; complianceRule `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `PropertyType` | POPULATED · 1,483 · not RLS | PropertyType → Lookup (13 published members; 0 RLS-listed) / obs 2 | ✘ | ✔ | ✔ | criterion `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; rentalSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; rentalTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; resultDto `lib/search/crm-idx-mapper.ts:30`; listingWorkspace `lib/crm/listing-form-mapping.ts:118` `lib/crm/listing-form-mapping.ts:119` +15; cma `lib/comps/fetch-comps.ts:76`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:57` `lib/buildings/public-building-data.ts:84` +12; complianceRule `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `RecordSignature` | POPULATED · 1,483 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemID` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemName` | POPULATED · 1,483 · RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/canonical/field-registry.ts:117`; saleSearch `lib/search/canonical/field-registry.ts:117`; rentalSearch `lib/search/canonical/field-registry.ts:117` | ✘/✘ | yes — name-matched reads may be Property reads |
| `StandardStatus` | POPULATED · 1,483 · not RLS | StandardStatus → Lookup (11 published members; 11 RLS-listed) / obs 6 | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; rentalSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; rentalTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; resultDto `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:175`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:257` +13; cma `lib/comps/fetch-comps.ts:75`; reports `app/api/market/route.ts:457`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:59` `lib/buildings/public-building-data.ts:84` +6; complianceRule `lib/compliance/gates.ts:119`; mediaLane `lib/idx/media-sync.ts:9` | ✔/✔ | yes — name-matched reads may be Property reads |
| `AppointmentRequiredYN` | POPULATED · 1,474 · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | saleTools `lib/open-houses/upcoming-open-houses.ts:50` `lib/open-houses/upcoming-open-houses.ts:340`; rentalTools `lib/open-houses/upcoming-open-houses.ts:50` `lib/open-houses/upcoming-open-houses.ts:340`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:50` `lib/open-houses/upcoming-open-houses.ts:340` +2 | ✔/✔ | no |
| `PropertySubTypeAdditional` | POPULATED · 1,430 · not RLS | PropertySubTypeAdditional → Lookup (76 published members; 0 RLS-listed) / obs 2 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `ShowingAgentKey` | POPULATED · 1,373 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ShowingAgentMlsID` | POPULATED · 1,373 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ShowingAgentFirstName` | POPULATED · 1,196 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ShowingAgentLastName` | POPULATED · 1,196 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OpenHouseType` | POPULATED · 613 · RLS | OpenHouseType → Lookup (9 published members; 2 RLS-listed) / obs 2 | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | saleTools `lib/open-houses/upcoming-open-houses.ts:50`; rentalTools `lib/open-houses/upcoming-open-houses.ts:50`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:50` | ✔/✔ | no |
| `ListingPermission` | POPULATED · 604 · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs 3 | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `OffMarketDate` | POPULATED · 100 · not RLS | — | ✘ | ✔ | ✔ | listingWorkspace `lib/listings/terminal-since.ts:76`; complianceRule `lib/compliance/rebny-ucba-rules.ts:352` | ✔/✔ | yes — name-matched reads may be Property reads |
| `OriginatingSystemID` | POPULATED · 14 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `ListAOR` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `LivestreamOpenHouseURL` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OpenHouseAttendedBy` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Attended → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OpenHouseRemarks` | SUPPRESSED · n/a · RLS | — | `OPEN_HOUSE_SELECT_FIELDS@lib/open-houses/upcoming-open-houses.ts` | ✘ | ✘ | saleTools `lib/open-houses/upcoming-open-houses.ts:50` `lib/open-houses/upcoming-open-houses.ts:341`; rentalTools `lib/open-houses/upcoming-open-houses.ts:50` `lib/open-houses/upcoming-open-houses.ts:341`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:50` `lib/open-houses/upcoming-open-houses.ts:341` +2 | ✔/✔ | no |
| `OriginalEntryTimestamp` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | complianceRule `lib/compliance/rebny-ucba-rules.ts:121`; mediaLane `lib/idx/write-suppression.ts:655` | ✔/✘ | yes — name-matched reads may be Property reads |
| `Permission` | SUPPRESSED · n/a · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; rentalSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:275` +4; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:9` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `Refreshments` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ShowingAgentKeyNumeric` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceSystemKey` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | projection `lib/search/listing-search-projection.ts:466`; saleSearch `lib/search/listing-search-projection.ts:466`; rentalSearch `lib/search/listing-search-projection.ts:466`; resultDto `lib/search/crm-idx-mapper.ts:248` `lib/search/crm-idx-mapper.ts:288` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:449` `public/crm/js/compliance/compliance-gates-and-output.js:1539` +6; publicConsumer `lib/buildings/public-building-data.ts:82` `app/api/listings/building/route.ts:71` +3; complianceRule `lib/compliance/rebny-ucba-rules.ts:120` | ✔/✔ | yes — name-matched reads may be Property reads |
| `SourceSystemListingKey` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SyndicateTo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | SyndicateTo → Lookup (28 published members; 0 RLS-listed) / obs 0 | ✘ | ✔ | ✔ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:53` `public/crm/js/compliance/compliance-gates-and-output.js:56` +7; complianceRule `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` +1 | ✔/✔ | yes — name-matched reads may be Property reads |

### CustomProperty — reached by `Property.CustomProperty`; entity set HTTP 200; runtime pulls: `lib/idx/fetch.ts`

| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |
|---|---|---|---|---|---|---|---|---|
| `CustomFields` | POPULATED · 591,649 · not RLS | — | `$expand=CustomProperty@71@lib/idx/fetch.ts` | ✘ | ✘ | resultDto `lib/search/crm-idx-mapper.ts:140` | ✔/✔ | no |
| `HumanModifiedYN` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | yes — name-matched reads may be Property reads |
| `InternetEntireListingDisplayYN` | POPULATED · 591,649 · not RLS | — | ✘ | ✔ | ✔ | criterion `app/api/listings/suggest/route.ts:90`; saleSearch `app/api/listings/suggest/route.ts:90`; rentalSearch `app/api/listings/suggest/route.ts:90`; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; resultDto `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:98`; listingWorkspace `lib/listings/mallan-form-contract.ts:117` `app/api/crm/listings/[id]/route.ts:150` +17; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` +9; mediaLane `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2942` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingId` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +6; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; rentalSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; resultDto `lib/search/crm-idx-mapper.ts:248` `lib/search/crm-idx-mapper.ts:287` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:462` `app/api/crm/sales/prospects/[id]/comps/route.ts:30` +17; cma `lib/comps/fetch-comps.ts:71`; reports `lib/market-report/generator.ts:168`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +34; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3701` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKey` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | projection `lib/search/listing-search-projection.ts:465`; criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` +8; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; resultDto `lib/search/engine/hydrate.ts:74`; listingWorkspace `lib/listings/mallan-form-contract.ts:456` `public/crm/js/core/reso-field-map.js:67` +2; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +27; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3678` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKeyNumeric` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | mediaLane `lib/idx/media-sync.ts:8` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeKey` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `app/api/crm/listings/[id]/route.ts:425` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeMlsId` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | criterion `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; rentalSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleTools `lib/syndication/eligibility.ts:142`; rentalTools `lib/syndication/eligibility.ts:142`; listingWorkspace `app/api/crm/listings/[id]/route.ts:425` `app/api/crm/listings/[id]/route.ts:441` +4; marketing `lib/syndication/eligibility.ts:142`; publicConsumer `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ModificationTimestamp` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; saleTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; rentalTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; resultDto `lib/search/crm-idx-mapper.ts:294` `lib/search/crm-idx-mapper.ts:295`; listingWorkspace `public/crm/js/core/reso-field-map.js:73` `public/crm/js/dashboard/panels.js:9565` +3; reports `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/write-suppression.ts:654` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `OriginatingSystemKey` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:1912` +1 | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemName` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:2155` | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemSubName` | POPULATED · 591,649 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `PropertyType` | POPULATED · 591,649 · not RLS | PropertyType → Lookup (13 published members; 0 RLS-listed) / obs 2 | ✘ | ✔ | ✔ | criterion `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; rentalSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; rentalTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; resultDto `lib/search/crm-idx-mapper.ts:30`; listingWorkspace `lib/crm/listing-form-mapping.ts:118` `lib/crm/listing-form-mapping.ts:119` +15; cma `lib/comps/fetch-comps.ts:76`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:57` `lib/buildings/public-building-data.ts:84` +12; complianceRule `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `StandardStatus` | POPULATED · 591,649 · not RLS | StandardStatus → Lookup (11 published members; 11 RLS-listed) / obs 4 | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; rentalSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; rentalTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; resultDto `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:175`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:257` +13; cma `lib/comps/fetch-comps.ts:75`; reports `app/api/market/route.ts:457`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:59` `lib/buildings/public-building-data.ts:84` +6; complianceRule `lib/compliance/gates.ts:119`; mediaLane `lib/idx/media-sync.ts:9` | ✔/✔ | yes — name-matched reads may be Property reads |
| `PropertySubType` | POPULATED · 591,633 · not RLS | n/a → Lookup (76 published members; 0 RLS-listed) / obs 10 | ✘ | ✘ | ✔ | criterion `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; rentalSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; rentalTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; resultDto `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:275`; listingWorkspace `lib/crm/listing-form-mapping.ts:121` `lib/crm/listing-form-mapping.ts:292` +23; reports `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; publicConsumer `lib/buildings/public-building-data.ts:84` `lib/buildings/public-building-data.ts:979` +11; complianceRule `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `AdditionalFeeYN` | POPULATED · 591,609 · not RLS | — | ✘ | ✘ | ✔ | resultDto `lib/idx/db-to-public-dto.ts:636`; listingWorkspace `lib/listings/mallan-form-contract.ts:49` `lib/crm/fee-disclosure.ts:65` +1 | ✔/✘ | no |
| `PropertySubTypeAdditional` | POPULATED · 553,713 · not RLS | n/a → Lookup (76 published members; 0 RLS-listed) / obs 6 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `AdditionalFeeDescription` | POPULATED · 317,956 · not RLS | — | ✘ | ✘ | ✔ | resultDto `lib/idx/public-dto.ts:353` `lib/idx/public-dto.ts:354` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:49` `lib/crm/fee-disclosure.ts:75` | ✔/✘ | no |
| `FractionalShare` | POPULATED · 192,124 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Restrictions` | POPULATED · 24,129 · RLS | Restrictions → Lookup (106 published members; 2 RLS-listed) / obs 2 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceFloorPlansCount` | POPULATED · 11,316 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BuildingSizeDimensions` | POPULATED · 9,394 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AdditionalFee` | POPULATED · 90 · not RLS | — | ✘ | ✘ | ✔ | resultDto `lib/idx/public-dto.ts:344` `lib/idx/public-dto.ts:345` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:49` `lib/crm/fee-disclosure.ts:67` +1 | ✔/✘ | no |
| `AdditionalFeeFrequency` | POPULATED · 34 · not RLS | FeeFrequency → Lookup (16 published members; 1 RLS-listed) / obs 1 | ✘ | ✘ | ✔ | listingWorkspace `lib/listings/mallan-form-contract.ts:49` | ✘/✘ | no |
| `AdditionalInfo1` | POPULATED · 29 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TaxAssessedValueLand` | POPULATED · 14 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PricePerAreaUnit` | POPULATED · 12 · not RLS | PricePerAreaUnit → Lookup (5 published members; 1 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ComplexName` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OtherExpenseDescription` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AboveGradeBedrooms` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AboveGradeFinishedAreaRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AboveGradeFinishedAreaRangeSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AboveGradeFinishedAreaRangeUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AboveGradeUnfinishedAreaRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AboveGradeUnfinishedAreaRangeSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AboveGradeUnfinishedAreaRangeUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AdditionalInfo2` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AdditionalInfo3` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ApplicationFee` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | no |
| `AssociationFeeTotal` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AssociationFeeTotalFrequency` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FeeFrequency → Lookup (16 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Attic` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Attic → Lookup (22 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `AvailabilityType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AvailabilityType → Lookup (12 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BelowGradeBedrooms` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BelowGradeFinishedAreaRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BelowGradeFinishedAreaRangeSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BelowGradeFinishedAreaRangeUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BelowGradeUnfinishedAreaRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BelowGradeUnfinishedAreaRangeSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BelowGradeUnfinishedAreaRangeUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BoatDockAccommodates` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BoatDockHeight` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BoatDockSlipDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BoatDockSlipFeatures` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | BoatDockSlipFeatures → Lookup (32 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BoatDockYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BoatSlipYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BonusAmount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BuildingAreaTotalRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BuildingAreaTotalRangeSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `BuildingAreaTotalRangeUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `CommunityDevelopmentDistrictYN` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ConsumerRemarks` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `DevelopmentName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GarageArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GarageAreaUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GarageDimensions` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GuestHouseAreaTotal` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GuestHouseAreaTotalSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GuestHouseAreaTotalUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GuestHouseDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GuestHouseYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GulfAccessType` | SUPPRESSED · n/a · not RLS | GulfAccessType → Lookup (8 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `GulfAccessYN` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LakeChainName` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LakeId` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LakeName` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LakeSize` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LandTenure` | SUPPRESSED · n/a · not RLS | LandTenure → Lookup (4 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Lang2_Type` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Lang3_Type` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LastMonthRentReqYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LeaseAmountPerArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LeaseAmountPerAreaUnit` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LeaseAmountPerAreaUnit → Lookup (5 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LeaseTermsDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ListAOR` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `LivingAreaRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LivingAreaRangeHigh` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LivingAreaRangeLow` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LivingAreaRangeSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LivingAreaRangeUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Location` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LotSizeAreaRangeHigh` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LotSizeAreaRangeLow` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LotSizeRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LotSizeRangeSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LotSizeSource → Lookup (15 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LotSizeRangeUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LotSizeUnits → Lookup (4 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Membership` | SUPPRESSED · n/a · not RLS | Membership → Lookup (1 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MembershipDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MembershipFee` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MembershipFeeFrequency` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | FeeFrequency → Lookup (16 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MembershipRequiredYN` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MineralRights` | SUPPRESSED · n/a · not RLS | MineralRights → Lookup (20 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MonthlyRate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `NumberOfBoatDocks` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `NumberOfBoatSlips` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OffersDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OffersReviewDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OffMarketDate` | SUPPRESSED · n/a · not RLS | — | ✘ | ✔ | ✔ | listingWorkspace `lib/listings/terminal-since.ts:76`; complianceRule `lib/compliance/rebny-ucba-rules.ts:352` | ✔/✔ | yes — name-matched reads may be Property reads |
| `OffSeasonRate` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Permission` | SUPPRESSED · n/a · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; rentalSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:275` +4; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:9` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `PotentialShortSale` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PotentialShortSale → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PricePerArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PrivateShowingInstructions` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ProjectName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PropertyAccess` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PropertyAccess → Lookup (10 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PublicRemarks_lang2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PublicRemarks_lang3` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RentSpreeURL` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RentSpreeYN` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RiverName` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SaleOrLeaseIncludes` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SeasonRate` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SecurityDepositDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SecurityDepositYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceSupplementPublicCount` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceSystemKey` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | projection `lib/search/listing-search-projection.ts:466`; saleSearch `lib/search/listing-search-projection.ts:466`; rentalSearch `lib/search/listing-search-projection.ts:466`; resultDto `lib/search/crm-idx-mapper.ts:248` `lib/search/crm-idx-mapper.ts:288` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:449` `public/crm/js/compliance/compliance-gates-and-output.js:1539` +6; publicConsumer `lib/buildings/public-building-data.ts:82` `app/api/listings/building/route.ts:71` +3; complianceRule `lib/compliance/rebny-ucba-rules.ts:120` | ✔/✔ | yes — name-matched reads may be Property reads |
| `StoriesPartial` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `StoriesPartialTotal` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `StormProtection` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | StormProtection → Lookup (25 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TaxAssessedValueImprovement` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TaxAuthority` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TaxRate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TaxYearRange` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ThirdPartyIntegrationType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | ThirdPartyIntegrationType → Lookup (4 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TitleCompanyAddress` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TitleCompanyName` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TitleCompanyPhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `TitleCompanyPreferred` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitLocation` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `WaterAccessDescription` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `WaterAccessYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `WeeklyRate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |

### PropertyRooms — reached by `Property.Rooms`; entity set HTTP 200; runtime pulls: **never**

| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |
|---|---|---|---|---|---|---|---|---|
| `HumanModifiedYN` | POPULATED · 86 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | yes — name-matched reads may be Property reads |
| `InputEntryOrder` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `InternetEntireListingDisplayYN` | POPULATED · 86 · not RLS | — | ✘ | ✔ | ✔ | criterion `app/api/listings/suggest/route.ts:90`; saleSearch `app/api/listings/suggest/route.ts:90`; rentalSearch `app/api/listings/suggest/route.ts:90`; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; resultDto `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:98`; listingWorkspace `lib/listings/mallan-form-contract.ts:117` `app/api/crm/listings/[id]/route.ts:150` +17; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` +9; mediaLane `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2942` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListAgentKey` | POPULATED · 86 · not RLS | — | ✘ | ✘ | ✘ | resultDto `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75`; listingWorkspace `app/api/crm/listings/[id]/route.ts:423`; portalSharing `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingId` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +6; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; rentalSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; resultDto `lib/search/crm-idx-mapper.ts:248` `lib/search/crm-idx-mapper.ts:287` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:462` `app/api/crm/sales/prospects/[id]/comps/route.ts:30` +17; cma `lib/comps/fetch-comps.ts:71`; reports `lib/market-report/generator.ts:168`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +34; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3701` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKey` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | projection `lib/search/listing-search-projection.ts:465`; criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` +8; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; resultDto `lib/search/engine/hydrate.ts:74`; listingWorkspace `lib/listings/mallan-form-contract.ts:456` `public/crm/js/core/reso-field-map.js:67` +2; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +27; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3678` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKeyNumeric` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | mediaLane `lib/idx/media-sync.ts:8` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingPermission` | POPULATED · 86 · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs 2 | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `ListOfficeKey` | POPULATED · 86 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `app/api/crm/listings/[id]/route.ts:425` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeMlsId` | POPULATED · 86 · not RLS | — | ✘ | ✘ | ✘ | criterion `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; rentalSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleTools `lib/syndication/eligibility.ts:142`; rentalTools `lib/syndication/eligibility.ts:142`; listingWorkspace `app/api/crm/listings/[id]/route.ts:425` `app/api/crm/listings/[id]/route.ts:441` +4; marketing `lib/syndication/eligibility.ts:142`; publicConsumer `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ModificationTimestamp` | POPULATED · 86 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; saleTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; rentalTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; resultDto `lib/search/crm-idx-mapper.ts:294` `lib/search/crm-idx-mapper.ts:295`; listingWorkspace `public/crm/js/core/reso-field-map.js:73` `public/crm/js/dashboard/panels.js:9565` +3; reports `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/write-suppression.ts:654` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `OriginatingSystemListingKey` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemName` | POPULATED · 86 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:2155` | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemSubName` | POPULATED · 86 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `PropertySubType` | POPULATED · 86 · not RLS | PropertySubType → Lookup (76 published members; 0 RLS-listed) / obs 3 | ✘ | ✘ | ✔ | criterion `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; rentalSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; rentalTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; resultDto `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:275`; listingWorkspace `lib/crm/listing-form-mapping.ts:121` `lib/crm/listing-form-mapping.ts:292` +23; reports `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; publicConsumer `lib/buildings/public-building-data.ts:84` `lib/buildings/public-building-data.ts:979` +11; complianceRule `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `PropertyType` | POPULATED · 86 · not RLS | PropertyType → Lookup (13 published members; 0 RLS-listed) / obs 2 | ✘ | ✔ | ✔ | criterion `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; rentalSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; rentalTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; resultDto `lib/search/crm-idx-mapper.ts:30`; listingWorkspace `lib/crm/listing-form-mapping.ts:118` `lib/crm/listing-form-mapping.ts:119` +15; cma `lib/comps/fetch-comps.ts:76`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:57` `lib/buildings/public-building-data.ts:84` +12; complianceRule `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `RoomKey` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomKeyNumeric` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceSystemID` | POPULATED · 86 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `StandardStatus` | POPULATED · 86 · not RLS | StandardStatus → Lookup (11 published members; 11 RLS-listed) / obs 5 | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; rentalSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; rentalTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; resultDto `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:175`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:257` +13; cma `lib/comps/fetch-comps.ts:75`; reports `app/api/market/route.ts:457`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:59` `lib/buildings/public-building-data.ts:84` +6; complianceRule `lib/compliance/gates.ts:119`; mediaLane `lib/idx/media-sync.ts:9` | ✔/✔ | yes — name-matched reads may be Property reads |
| `OffMarketDate` | POPULATED · 81 · not RLS | — | ✘ | ✔ | ✔ | listingWorkspace `lib/listings/terminal-since.ts:76`; complianceRule `lib/compliance/rebny-ucba-rules.ts:352` | ✔/✔ | yes — name-matched reads may be Property reads |
| `RoomType` | POPULATED · 74 · not RLS | RoomType → Lookup (122 published members; 6 RLS-listed) / obs 6 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `RoomArea` | POPULATED · 44 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomAreaSource` | POPULATED · 44 · not RLS | AreaSource → Lookup (18 published members; 1 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomAreaUnits` | POPULATED · 44 · not RLS | AreaUnits → Lookup (3 published members; 1 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `PropertySubTypeAdditional` | POPULATED · 21 · not RLS | PropertySubTypeAdditional → Lookup (76 published members; 0 RLS-listed) / obs 2 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `ListAOR` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `Permission` | SUPPRESSED · n/a · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; rentalSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:275` +4; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:9` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `RecordSignature` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `RoomDescription` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomDimensions` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomFeatures` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | InteriorOrRoomFeatures → Lookup (303 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomFlooring` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Flooring → Lookup (62 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomLength` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomLengthWidthSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomLengthWidthUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | LinearUnits → Lookup (4 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomLevel` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | RoomLevel → Lookup (15 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RoomWidth` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SyndicateTo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | SyndicateTo → Lookup (28 published members; 0 RLS-listed) / obs 0 | ✘ | ✔ | ✔ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:53` `public/crm/js/compliance/compliance-gates-and-output.js:56` +7; complianceRule `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` +1 | ✔/✔ | yes — name-matched reads may be Property reads |

### PropertyUnitTypes — reached by `Property.UnitTypes`; entity set HTTP 200; runtime pulls: **never**

| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |
|---|---|---|---|---|---|---|---|---|
| `HumanModifiedYN` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | yes — name-matched reads may be Property reads |
| `InputEntryOrder` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `InternetEntireListingDisplayYN` | POPULATED · 1 · not RLS | — | ✘ | ✔ | ✔ | criterion `app/api/listings/suggest/route.ts:90`; saleSearch `app/api/listings/suggest/route.ts:90`; rentalSearch `app/api/listings/suggest/route.ts:90`; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; resultDto `lib/search/crm-idx-mapper.ts:79` `lib/search/engine/hydrate.ts:98`; listingWorkspace `lib/listings/mallan-form-contract.ts:117` `app/api/crm/listings/[id]/route.ts:150` +17; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:190` `lib/compliance/rebny-ucba-rules.ts:102` +9; mediaLane `lib/idx/media-sync.ts:9` `lib/idx/media-sync.ts:2942` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListAgentKey` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | resultDto `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75`; listingWorkspace `app/api/crm/listings/[id]/route.ts:423`; portalSharing `lib/compliance/dto.ts:42` `lib/compliance/dto.ts:75` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingId` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +6; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; rentalSearch `lib/search/engine/criteria.ts:99` `lib/search/engine/criteria.ts:210` +7; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +5; resultDto `lib/search/crm-idx-mapper.ts:248` `lib/search/crm-idx-mapper.ts:287` +1; listingWorkspace `lib/listings/mallan-form-contract.ts:462` `app/api/crm/sales/prospects/[id]/comps/route.ts:30` +17; cma `lib/comps/fetch-comps.ts:71`; reports `lib/market-report/generator.ts:168`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +34; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3701` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKey` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | projection `lib/search/listing-search-projection.ts:465`; criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:146` +8; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +11; saleTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; rentalTools `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +2; resultDto `lib/search/engine/hydrate.ts:74`; listingWorkspace `lib/listings/mallan-form-contract.ts:456` `public/crm/js/core/reso-field-map.js:67` +2; publicConsumer `lib/open-houses/upcoming-open-houses.ts:49` `lib/open-houses/upcoming-open-houses.ts:56` +27; mediaLane `lib/idx/media-sync.ts:8` `lib/idx/media-sync.ts:3678` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingKeyNumeric` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | mediaLane `lib/idx/media-sync.ts:8` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListingPermission` | POPULATED · 1 · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `ListOfficeKey` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `app/api/crm/listings/[id]/route.ts:425` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ListOfficeMlsId` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | criterion `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; rentalSearch `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426`; saleTools `lib/syndication/eligibility.ts:142`; rentalTools `lib/syndication/eligibility.ts:142`; listingWorkspace `app/api/crm/listings/[id]/route.ts:425` `app/api/crm/listings/[id]/route.ts:441` +4; marketing `lib/syndication/eligibility.ts:142`; publicConsumer `app/api/listings/suggest/route.ts:96` `app/api/listings/suggest/route.ts:426` | ✔/✔ | yes — name-matched reads may be Property reads |
| `ModificationTimestamp` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; saleTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; rentalTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; resultDto `lib/search/crm-idx-mapper.ts:294` `lib/search/crm-idx-mapper.ts:295`; listingWorkspace `public/crm/js/core/reso-field-map.js:73` `public/crm/js/dashboard/panels.js:9565` +3; reports `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/write-suppression.ts:654` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `OffMarketDate` | POPULATED · 1 · not RLS | — | ✘ | ✔ | ✔ | listingWorkspace `lib/listings/terminal-since.ts:76`; complianceRule `lib/compliance/rebny-ucba-rules.ts:352` | ✔/✔ | yes — name-matched reads may be Property reads |
| `OriginatingSystemListingKey` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemName` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:2155` | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemSubName` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `PropertySubType` | POPULATED · 1 · not RLS | PropertySubType → Lookup (76 published members; 0 RLS-listed) / obs 1 | ✘ | ✘ | ✔ | criterion `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; rentalSearch `lib/search/canonical/live-truth.ts:112` `lib/search/canonical/live-truth.ts:113` +2; saleTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; rentalTools `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; resultDto `lib/search/crm-idx-mapper.ts:30` `lib/search/crm-idx-mapper.ts:275`; listingWorkspace `lib/crm/listing-form-mapping.ts:121` `lib/crm/listing-form-mapping.ts:292` +23; reports `lib/market-report/generator.ts:172` `lib/market-report/generator.ts:246`; publicConsumer `lib/buildings/public-building-data.ts:84` `lib/buildings/public-building-data.ts:979` +11; complianceRule `lib/compliance/rebny-ucba-rules.ts:34` `lib/compliance/rls-enforcement.ts:354` +2 | ✔/✔ | yes — name-matched reads may be Property reads |
| `PropertyType` | POPULATED · 1 · not RLS | PropertyType → Lookup (13 published members; 0 RLS-listed) / obs 1 | ✘ | ✔ | ✔ | criterion `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; rentalSearch `lib/search/canonical/live-truth.ts:111` `lib/search/canonical/field-registry.ts:131` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; rentalTools `lib/open-houses/upcoming-open-houses.ts:57` `lib/comps/fetch-comps.ts:76`; resultDto `lib/search/crm-idx-mapper.ts:30`; listingWorkspace `lib/crm/listing-form-mapping.ts:118` `lib/crm/listing-form-mapping.ts:119` +15; cma `lib/comps/fetch-comps.ts:76`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:57` `lib/buildings/public-building-data.ts:84` +12; complianceRule `lib/compliance/rebny-ucba-rules.ts:33` `lib/compliance/rls-enforcement.ts:319` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `RecordSignature` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemID` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `StandardStatus` | POPULATED · 1 · not RLS | StandardStatus → Lookup (11 published members; 11 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; rentalSearch `lib/search/canonical/live-truth.ts:109` `lib/search/engine/criteria.ts:97` +3; saleTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; rentalTools `lib/open-houses/upcoming-open-houses.ts:59` `lib/comps/fetch-comps.ts:75`; resultDto `lib/search/crm-idx-mapper.ts:78` `lib/search/crm-idx-mapper.ts:175`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:257` +13; cma `lib/comps/fetch-comps.ts:75`; reports `app/api/market/route.ts:457`; publicConsumer `lib/open-houses/upcoming-open-houses.ts:59` `lib/buildings/public-building-data.ts:84` +6; complianceRule `lib/compliance/gates.ts:119`; mediaLane `lib/idx/media-sync.ts:9` | ✔/✔ | yes — name-matched reads may be Property reads |
| `UnitTypeKey` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeKeyNumeric` | POPULATED · 1 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ListAOR` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AOR → Lookup (1127 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `Permission` | SUPPRESSED · n/a · not RLS | ListingPermission → Lookup (18 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; rentalSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:275` +4; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:9` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `PropertySubTypeAdditional` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PropertySubTypeAdditional → Lookup (76 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SyndicateTo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | SyndicateTo → Lookup (28 published members; 0 RLS-listed) / obs 0 | ✘ | ✔ | ✔ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:53` `public/crm/js/compliance/compliance-gates-and-output.js:56` +7; complianceRule `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `UnitTypeActualRent` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeActualRentRange` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeArea` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeAreaSource` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaSource → Lookup (18 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeAreaUnits` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | AreaUnits → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeBathsTotal` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeBedsTotal` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeDeposit` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeDescription` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeFireplaceYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeFurnished` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Furnished → Lookup (5 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeGarageAttachedYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeGarageSpaces` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeLeasedYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeLeaseExpires` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeMonthToMonthYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeNumFullBaths` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeNumHalfBaths` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeOccupantType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | UnitTypeOccupantType → Lookup (7 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypePetDeposit` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypePetDepositPerPetYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeProForma` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeTotalRent` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | UnitTypeType → Lookup (22 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `UnitTypeUnitNum` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `UnitTypeUnitsTotal` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |

### Member — reached by `Property.BuyerAgent`, `Property.CoBuyerAgent`, `Property.CoListAgent`, `Property.ListAgent`; entity set HTTP 200; runtime pulls: **never**

| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |
|---|---|---|---|---|---|---|---|---|
| `HumanModifiedYN` | POPULATED · 11,191 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | yes — name-matched reads may be Property reads |
| `MemberAOR` | POPULATED · 11,191 · RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberCountry` | POPULATED · 11,191 · RLS | Country → Lookup (246 published members; 2 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberFullName` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberKey` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `MemberKeyNumeric` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberLastName` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberMlsId` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `MemberStatus` | POPULATED · 11,191 · RLS | MemberStatus → Lookup (4 published members; 2 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ModificationTimestamp` | POPULATED · 11,191 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; saleTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; rentalTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; resultDto `lib/search/crm-idx-mapper.ts:294` `lib/search/crm-idx-mapper.ts:295`; listingWorkspace `public/crm/js/core/reso-field-map.js:73` `public/crm/js/dashboard/panels.js:9565` +3; reports `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/write-suppression.ts:654` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `OfficeKey` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeKeyNumeric` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMlsId` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeName` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemID` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemMemberKey` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemMemberMlsSecurityClass` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemName` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:2155` | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemOfficeKey` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemSubName` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `RecordSignature` | POPULATED · 11,191 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemMemberKey` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceSystemName` | POPULATED · 11,191 · RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/canonical/field-registry.ts:117`; saleSearch `lib/search/canonical/field-registry.ts:117`; rentalSearch `lib/search/canonical/field-registry.ts:117` | ✘/✘ | yes — name-matched reads may be Property reads |
| `MemberFirstName` | POPULATED · 11,190 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberEmail` | POPULATED · 11,186 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberDirectPhone` | POPULATED · 11,064 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPreferredPhone` | POPULATED · 11,064 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPostalCode` | POPULATED · 10,474 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberAddress1` | POPULATED · 10,472 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberCity` | POPULATED · 10,462 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberStateOrProvince` | POPULATED · 10,459 · RLS | StateOrProvince → Lookup (100 published members; 45 RLS-listed) / obs 16 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberMobilePhone` | POPULATED · 10,114 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberNickname` | POPULATED · 9,890 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberMiddleName` | POPULATED · 4,281 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberBio` | POPULATED · 1,042 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberLanguages` | POPULATED · 816 · RLS | Languages → Lookup (212 published members; 28 RLS-listed) / obs 28 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberUrl` | POPULATED · 773 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPostalCodePlus4` | POPULATED · 141 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPreferredPhoneExt` | POPULATED · 29 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `JobTitle` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `LastLoginTimestamp` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberAddress2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberAlternateId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `MemberAORkey` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberAORkeyNumeric` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberAORMlsId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `MemberAssociationComments` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberBillingPreference` | SUPPRESSED · n/a · not RLS | BillingPreference → Lookup (3 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberCarrierRoute` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberCityRegion` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberCommitteeCount` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberCountyOrParish` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberDesignation` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | MemberDesignation → Lookup (93 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberFax` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberHomePhone` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberIsAssistantTo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberLoginId` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberMailOptOutYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberMlsAccessYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberMlsSecurityClass` | SUPPRESSED · n/a · RLS | MemberMlsSecurityClass → Lookup (9 published members; 5 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberNamePrefix` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberNameSuffix` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberNationalAssociationEntryDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberNationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `MemberOfficePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberOfficePhoneExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberOtherPhoneType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | MemberOtherPhoneType → Lookup (14 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPager` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPhoneTTYTDD` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPreferredMail` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PreferredMail → Lookup (4 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPreferredMedia` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PreferredMedia → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPreferredPublication` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PreferredPublication → Lookup (5 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberPrimaryAorId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberStateLicense` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✔/✔ | no |
| `MemberStateLicenseExpirationDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberStateLicenseState` | SUPPRESSED · n/a · RLS | StateOrProvince → Lookup (100 published members; 1 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberStateLicenseType` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberStreetAdditionalInfo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberTollFreePhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberTransferDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | MemberType → Lookup (23 published members; 2 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberVoiceMail` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberVoiceMailExt` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MemberVotingPrecinct` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeNationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginalEntryTimestamp` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | complianceRule `lib/compliance/rebny-ucba-rules.ts:121`; mediaLane `lib/idx/write-suppression.ts:655` | ✔/✘ | yes — name-matched reads may be Property reads |
| `Permission` | SUPPRESSED · n/a · not RLS | ListingPermission → Lookup (18 published members; 1 RLS-listed) / obs ? | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; rentalSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:275` +4; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:9` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `SocialMediaType` | SUPPRESSED · n/a · not RLS | SocialMediaType → Lookup (17 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SourceSystemID` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SyndicateTo` | SUPPRESSED · n/a · not RLS | SyndicateTo → Lookup (28 published members; 0 RLS-listed) / obs ? | ✘ | ✔ | ✔ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:53` `public/crm/js/compliance/compliance-gates-and-output.js:56` +7; complianceRule `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `UniqueLicenseeIdentifier` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✔ | no |

### Office — reached by `Property.BuyerOffice`, `Property.CoBuyerOffice`, `Property.CoListOffice`, `Property.ListOffice`; entity set HTTP 200; runtime pulls: **never**

| Field | Provider availability | Vocabulary | Sel | Sale Form | Rent Form | Consumers by stage | Tests D/I | Same-named Property field? |
|---|---|---|---|---|---|---|---|---|
| `HumanModifiedYN` | POPULATED · 578 · not RLS | — | ✘ | ✘ | ✘ | — | ✔/✘ | yes — name-matched reads may be Property reads |
| `IDXOfficeParticipationYN` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `ModificationTimestamp` | POPULATED · 578 · not RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/engine/provider-query.ts:126` `lib/search/engine/universe.ts:150`; sorting `lib/search/engine/provider-query.ts:126`; saleSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; rentalSearch `lib/search/engine/provider-query.ts:126` `lib/search/engine/provider-query.ts:126` +1; saleTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; rentalTools `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234`; resultDto `lib/search/crm-idx-mapper.ts:294` `lib/search/crm-idx-mapper.ts:295`; listingWorkspace `public/crm/js/core/reso-field-map.js:73` `public/crm/js/dashboard/panels.js:9565` +3; reports `lib/market-report/generator.ts:174` `lib/market-report/generator.ts:234` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/write-suppression.ts:654` +5 | ✔/✔ | yes — name-matched reads may be Property reads |
| `OfficeKey` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeKeyNumeric` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMlsId` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeName` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeStatus` | POPULATED · 578 · RLS | OfficeStatus → Lookup (2 published members; 2 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemName` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:1547` `public/crm/js/compliance/compliance-gates-and-output.js:2155` | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemOfficeKey` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `RecordSignature` | POPULATED · 578 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemID` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemOfficeKey` | POPULATED · 578 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAOR` | POPULATED · 577 · RLS | AOR → Lookup (1127 published members; 1 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeCountry` | POPULATED · 577 · RLS | Country → Lookup (246 published members; 2 RLS-listed) / obs 1 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemID` | POPULATED · 577 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `OriginatingSystemSubName` | POPULATED · 577 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | yes — name-matched reads may be Property reads |
| `SourceSystemName` | POPULATED · 577 · RLS | — | ✘ | ✘ | ✘ | criterion `lib/search/canonical/field-registry.ts:117`; saleSearch `lib/search/canonical/field-registry.ts:117`; rentalSearch `lib/search/canonical/field-registry.ts:117` | ✘/✘ | yes — name-matched reads may be Property reads |
| `MainOfficeKey` | POPULATED · 576 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MainOfficeKeyNumeric` | POPULATED · 576 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `MainOfficeMlsId` | POPULATED · 576 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemMainOfficeKey` | POPULATED · 576 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAddress1` | POPULATED · 546 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeCity` | POPULATED · 546 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficePhone` | POPULATED · 546 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficePostalCode` | POPULATED · 546 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeStateOrProvince` | POPULATED · 546 · RLS | StateOrProvince → Lookup (100 published members; 43 RLS-listed) / obs 14 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeBrokerKey` | POPULATED · 530 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeBrokerKeyNumeric` | POPULATED · 530 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeBrokerMlsId` | POPULATED · 530 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemOfficeBrokerKey` | POPULATED · 530 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginatingSystemOfficeManagerKey` | POPULATED · 412 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeUrl` | POPULATED · 383 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeEmail` | POPULATED · 42 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficePostalCodePlus4` | POPULATED · 25 · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAlternateId` | POPULATED · 14 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficePhoneExt` | POPULATED · 7 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OriginalEntryTimestamp` | POPULATED · 1 · not RLS | — | ✘ | ✘ | ✘ | complianceRule `lib/compliance/rebny-ucba-rules.ts:121`; mediaLane `lib/idx/write-suppression.ts:655` | ✔/✘ | yes — name-matched reads may be Property reads |
| `BillingOfficeKey` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `FranchiseAffiliation` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `FranchiseNationalAssociationId` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `NumberOfBranches` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `NumberOfNonMemberSalespersons` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAddress2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAORkey` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAORkeyNumeric` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAORMlsId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeAssociationComments` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeBio` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeBranchType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | OfficeBranchType → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeBrokerNationalAssociationId` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeCityRegion` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeCorporateLicense` | SUPPRESSED · n/a · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeCountyOrParish` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeFax` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailAddress1` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailAddress2` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailCareOf` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailCity` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailCountry` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | Country → Lookup (246 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailCountyOrParish` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailPostalCode` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailPostalCodePlus4` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeMailStateOrProvince` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | StateOrProvince → Lookup (100 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeManagerKey` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeManagerKeyNumeric` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeManagerMlsId` | SUPPRESSED · n/a · RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeNationalAssociationId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeNationalAssociationIdInsertDate` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficePreferredMedia` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | PreferredMedia → Lookup (3 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficePrimaryAorId` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficePrimaryStateOrProvince` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | StateOrProvince → Lookup (100 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeStreetAdditionalInfo` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OfficeType` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | OfficeType → Lookup (12 published members; 0 RLS-listed) / obs 0 | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `OtherPhone` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `Permission` | SUPPRESSED · n/a · RLS | ListingPermission → Lookup (18 published members; 1 RLS-listed) / obs ? | ✘ | ✘ | ✘ | criterion `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; rentalSearch `lib/search/canonical/live-truth.ts:114` `app/api/listings/suggest/route.ts:89` +1; saleTools `lib/open-houses/upcoming-open-houses.ts:58`; rentalTools `lib/open-houses/upcoming-open-houses.ts:58`; listingWorkspace `lib/listings/mallan-form-contract.ts:24` `lib/crm/listing-form-mapping.ts:275` +4; publicConsumer `lib/open-houses/upcoming-open-houses.ts:58` `app/api/listings/building/route.ts:63` +1; complianceRule `lib/compliance/gates.ts:138` `lib/compliance/rls-enforcement.ts:388` +1; mediaLane `lib/media/listing-media-resolver.ts:55` `lib/idx/media-sync.ts:9` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `SocialMediaType` | SUPPRESSED · n/a · not RLS | SocialMediaType → Lookup (17 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SyndicateAgentOption` | SUPPRESSED · n/a · not RLS | SyndicateAgentOption → Lookup (2 published members; 0 RLS-listed) / obs ? | ✘ | ✘ | ✘ | — | ✘/✘ | no |
| `SyndicateTo` | SUPPRESSED · n/a · not RLS | SyndicateTo → Lookup (28 published members; 0 RLS-listed) / obs ? | ✘ | ✔ | ✔ | listingWorkspace `public/crm/js/compliance/compliance-gates-and-output.js:53` `public/crm/js/compliance/compliance-gates-and-output.js:56` +7; complianceRule `lib/compliance/rebny-ucba-rules.ts:106` `lib/compliance/rls-enforcement.ts:431` +1 | ✔/✔ | yes — name-matched reads may be Property reads |
| `VirtualOfficeWebsiteYN` | NOT-ON-FEED (not RLS-defined) · 0 · not RLS | — | ✘ | ✘ | ✘ | — | ✘/✘ | no |

## G. CustomProperty.CustomFields — 61 keys (591,641 rows, all statuses)

Raw payload persisted losslessly by the sync: **NO** (`expandCustomProperty: true` in lib/idx/sync.ts: false; `custom_fields` written by: `app/api/buildings/search/route.ts`, `app/api/crm/active-leases/route.ts`, `app/api/crm/active-leases/[id]/route.ts`). No key is reachable by any Search criterion. Classification is a semantic-map decision and stays UNVERIFIED; the hint column is name-based only. Keys that are also Mallan-internal form keys show their form surfaces and persistence.

| Key | Rows | Non-empty | By segment/status (top) | Type | Top values (Active) | Hint | Mallan form surfaces | Form persistence |
|---|---|---|---|---|---|---|---|---|
| `BuildingTaxLot` | 591,641 | 591,641 | Rental/Closed 374,791 · Sale/Closed 203,611 · Sale/Active 6,663 · Sale/Pending 5,241 | number | 7501=1287 · 7502=583 · 0001=506 · 7503=318 · 0016=277 | financial | rentalForm, saleTools, rentalTools | {"features":true,"raw":true} |
| `ListingKey` | 591,641 | 591,641 | Rental/Closed 374,791 · Sale/Closed 203,611 · Sale/Active 6,663 · Sale/Pending 5,241 | number | 1091330901=1 · 1091330953=1 · 1091331715=1 · 1091331731=1 · 1091331872=1 | unclassified | — | {"raw":true} |
| `ElevatorsTotal` | 528,711 | 528,711 | Rental/Closed 329,670 · Sale/Closed 185,802 · Sale/Active 6,663 · Sale/Pending 5,241 | number | 0=2426 · 1=2058 · 2=1258 · 3=597 · 4=509 | amenities | rentalForm, saleTools, rentalTools | {"features":true,"raw":true} |
| `MaxLeaseMonths` | 351,212 | 351,212 | Rental/Closed 349,917 · Rental/Active 939 · Rental/Pending 348 · Unknown/Active 5 | number | 12=517 · 24=328 · 14=23 · 15=13 · 27=13 | rental terms | rentalForm, rentalTools | — |
| `AttendanceType` | 344,943 | 344,943 | Rental/Closed 189,422 · Sale/Closed 142,291 · Sale/Active 6,663 · Sale/Pending 5,237 | text | None=2836 · DoormanFullTime=1342 · DoormanFullTime,ConciergeFullTime=876 · DoormanFullTime,ConciergeYes=613 · ConciergeFullTime,DoormanFullTime,LobbyA=261 | security/doorman | rentalForm, saleTools, rentalTools | {"features":true,"raw":true} |
| `SponsorUnitYN` | 319,336 | 319,336 | Rental/Closed 185,685 · Sale/Closed 120,813 · Sale/Active 6,569 · Sale/Pending 5,173 | number | 0=6035 · 1=1296 | classification | rentalForm, saleTools, rentalTools | {"features":true,"raw":true} |
| `CertificateOfOccupancyYN` | 229,778 | 229,778 | Rental/Closed 146,304 · Sale/Closed 73,808 · Sale/Active 5,090 · Sale/Pending 3,698 | number | 1=4206 · 0=1440 | boolean fact | — | — |
| `BonusYN` | 229,367 | 229,367 | Rental/Closed 229,335 · Rental/Pending 30 · Rental/Active 2 | number | 0=2 | boolean fact | — | — |
| `PercentOfCommonElements` | 221,763 | 221,763 | Sale/Closed 184,060 · Rental/Closed 25,981 · Sale/Active 6,154 · Sale/Pending 4,916 | number | 0.00=5516 · 1.00=247 · 2.00=127 · 100.00=88 · 50.00=77 | unclassified | saleForm, saleTools | {"features":true,"raw":true} |
| `MaximumFinancingPercent` | 220,130 | 220,130 | Sale/Closed 182,757 · Rental/Closed 25,729 · Sale/Active 6,108 · Sale/Pending 4,930 | number | 90.00=2417 · 80.00=1780 · 0.00=1110 · 75.00=511 · 50.00=183 | financial | — | {"features":true,"raw":true} |
| `ViewRemarks` | 209,961 | 209,961 | Rental/Closed 112,906 · Sale/Closed 89,240 · Sale/Active 4,137 · Sale/Pending 2,999 | text | C=709 · See remarks=537 ·  =440 · City=384 · T=215 | unit features | — | {"features":true,"raw":true} |
| `LandmarkStatusYN` | 209,104 | 209,104 | Rental/Closed 129,739 · Sale/Closed 69,849 · Sale/Active 5,022 · Sale/Pending 3,877 | number | 0=5336 · 1=65 | boolean fact | rentalForm, saleTools, rentalTools | — |
| `TaxDeductionPercent` | 184,832 | 184,832 | Sale/Closed 151,389 · Rental/Closed 25,655 · Sale/Active 4,121 · Sale/Pending 3,062 | number | 0.00=3271 · 50.00=189 · 55.00=76 · 45.00=58 · 40.00=57 | financial | saleTools | — |
| `UnitLine` | 181,538 | 181,538 | Rental/Closed 107,385 · Sale/Closed 68,860 · Sale/Active 2,741 · Sale/Pending 2,242 | text | A=403 · B=368 · C=301 · D=239 · E=210 | unclassified | — | — |
| `FurnishedListPrice` | 178,863 | 178,863 | Rental/Closed 149,450 · Sale/Closed 26,541 · Sale/Pending 1,508 · Sale/Active 1,244 | number | 499000.00=19 · 1995000.00=17 · 699000.00=17 · 1495000.00=15 · 799000.00=12 | rental terms | rentalForm, rentalTools | {"features":true,"raw":true} |
| `FlipTaxRemarks` | 169,693 | 169,693 | Sale/Closed 159,331 · Sale/Active 4,984 · Sale/Pending 3,801 · Rental/Closed 1,542 | text | 0.0=1705 · ASK EXCL BROKER=914 · Call Listing Agent=365 · NONE=214 · SELLER PAYS=76 | financial | saleForm | {"features":true,"raw":true} |
| `KitchenCondition` | 163,415 | 163,415 | Rental/Closed 102,099 · Sale/Closed 57,007 · Sale/Active 2,192 · Sale/Pending 1,851 | text | Excellent=1920 · Good=340 · Fair=66 · Poor=28 · New=11 | unclassified | — | — |
| `ClosetsTotal` | 157,857 | 157,857 | Rental/Closed 116,462 · Sale/Closed 39,969 · Sale/Active 735 · Sale/Pending 594 | number | 0=752 · 3=11 · 4=10 · 6=7 · 7=2 | unclassified | — | — |
| `FlipTax` | 148,356 | 148,356 | Sale/Closed 106,116 · Rental/Closed 30,238 · Sale/Active 6,364 · Sale/Pending 4,981 | number | 0.00=5454 · 2.00=497 · 1.00=166 · 3.00=164 · 1.50=71 | financial | rentalForm, saleTools, rentalTools | {"features":true,"raw":true} |
| `TaxAbatementYN` | 119,293 | 119,293 | Rental/Closed 61,512 · Sale/Closed 44,570 · Sale/Active 6,663 · Sale/Pending 5,234 | number | 0=7409 · 1=185 | financial | rentalForm, saleTools, rentalTools | {"features":true,"raw":true} |
| `BuyerAgentRLSParticipantYN` | 106,467 | 106,467 | Rental/Closed 61,819 · Sale/Closed 44,636 · Sale/Pending 9 · Unknown/Closed 2 | enum-like | — | boolean fact | saleForm, rentalForm | {"raw":true} |
| `BuildingRules` | 98,791 | 98,791 | Rental/Closed 48,712 · Sale/Closed 48,698 · Sale/Active 751 · Sale/Pending 543 | text | PiedATerreAllowed,BuildingWasherDryerAll=443 · PiedATerreAllowed=166 · PiedATerreAllowed,CorporateOwnerAllowed,=69 · BuildingWasherDryerAllowed=48 · PiedATerreAllowed,CorporateOwnerAllowed=20 | text | — | — |
| `RoofRightsYN` | 94,715 | 94,715 | Rental/Closed 61,988 · Sale/Closed 32,725 · Sale/Active 2 | number | 1=2 | amenities | — | — |
| `ManagingAgencyListingYN` | 89,230 | 89,230 | Rental/Closed 89,168 · Rental/Active 48 · Rental/Pending 8 · Unknown/Active 4 | number | 0=47 · 1=1 | boolean fact | — | — |
| `FurnishedMaxLeaseMonths` | 88,996 | 88,996 | Rental/Closed 88,687 · Sale/Closed 108 · Rental/Active 85 · Rental/Pending 50 | number | 12=50 · 0=47 · 24=23 · 1=6 · 36=2 | rental terms | rentalForm, rentalTools | {"features":true,"raw":true} |
| `FurnishedMinLeaseMonths` | 88,993 | 88,993 | Rental/Closed 88,684 · Sale/Closed 108 · Rental/Active 85 · Rental/Pending 50 | number | 12=61 · 0=48 · 6=7 · 1=6 · 24=2 | rental terms | rentalForm, rentalTools | {"features":true,"raw":true} |
| `FlipTaxType` | 86,088 | 86,088 | Sale/Closed 80,322 · Sale/Active 2,253 · Sale/Pending 2,117 · Rental/Closed 1,366 | enum-like | Percent=1694 · SeeRemarks=359 · Dollars=199 | financial | saleForm | {"features":true,"raw":true} |
| `MaximumFinancingAmount` | 85,539 | 85,539 | Sale/Closed 84,216 · Sale/Active 708 · Sale/Pending 586 · Unknown/Active 28 | number | 0.00=707 · 511200.00=1 | financial | rentalForm, saleTools, rentalTools | — |
| `MaximumFinancingRemarks` | 84,879 | 84,879 | Sale/Closed 47,890 · Rental/Closed 25,732 · Sale/Active 5,926 · Sale/Pending 4,726 | text | See Maximum Financing Percent=1716 · 0=816 · 90=566 · 80=425 · %=334 | financial | saleForm | {"features":true,"raw":true} |
| `BathroomCondition` | 76,458 | 76,458 | Rental/Closed 39,402 · Sale/Closed 33,698 · Sale/Active 1,776 · Sale/Pending 1,351 | text | Excellent=1510 · Good=316 · Fair=61 · New=21 · Poor=21 | unclassified | — | — |
| `TaxMonthlyAmount` | 68,967 | 68,967 | Sale/Closed 33,605 · Rental/Closed 25,856 · Sale/Active 5,104 · Sale/Pending 3,781 | number | 0.00=2119 · 12.00=8 · 832.00=8 · 14.00=7 · 1.00=7 | financial | — | {"features":true,"raw":true} |
| `TaxDeductionAmount` | 62,764 | 62,764 | Sale/Closed 61,441 · Sale/Active 708 · Sale/Pending 586 · Unknown/Active 28 | number | 0.00=587 · 85288.00=2 · 14880.00=1 · 66750.00=1 · 91504.00=1 | financial | — | — |
| `CapitalReservesYN` | 58,638 | 58,638 | Rental/Closed 25,844 · Sale/Closed 25,702 · Sale/Active 3,791 · Sale/Pending 2,692 | number | 0=4092 · 1=76 | boolean fact | rentalForm, saleTools, rentalTools | — |
| `CeilingHeightFeet` | 43,411 | 43,411 | Rental/Closed 22,719 · Sale/Closed 20,150 · Sale/Active 323 · Sale/Pending 190 | number | 10=110 · 9=95 · 11=39 · 0=18 · 14=18 | financial | — | — |
| `CeilingHeightUnits` | 42,037 | 42,037 | Rental/Closed 22,364 · Sale/Closed 19,552 · Sale/Active 59 · Sale/Pending 49 | enum-like | Feet=59 | unit features | — | — |
| `TaxDeductionRemarks` | 40,363 | 40,363 | Sale/Closed 39,306 · Sale/Active 585 · Sale/Pending 448 · Unknown/Active 24 | enum-like | ASK EXCL BROKER=585 | financial | — | — |
| `BuildingSmokeFreeYN` | 36,040 | 36,040 | Rental/Closed 21,367 · Sale/Closed 13,002 · Sale/Active 772 · Sale/Pending 429 | number | 0=597 · 1=554 | boolean fact | rentalForm, rentalTools | — |
| `GuarantorsAcceptedYN` | 33,775 | 33,775 | Rental/Closed 29,325 · Sale/Closed 3,391 · Sale/Active 517 · Sale/Pending 369 | number | 0=621 · 1=27 | rental terms | rentalForm, saleTools, rentalTools | — |
| `BonusRemarks` | 31,329 | 31,329 | Rental/Closed 31,329 | enum-like | — | text | — | — |
| `PrivateOutdoorSpaceSize` | 28,576 | 28,576 | Sale/Closed 14,128 · Rental/Closed 9,479 · Sale/Active 2,612 · Sale/Pending 1,946 | enum-like | GreaterThan60SqFt=1718 · LessThan60SqFt=1174 | amenities | — | — |
| `AlternateStreetName` | 11,996 | 11,996 | Sale/Closed 6,229 · Rental/Closed 5,767 | enum-like | — | unclassified | — | — |
| `AlternateStreetNumber` | 11,835 | 11,835 | Sale/Closed 6,160 · Rental/Closed 5,675 | enum-like | — | unclassified | — | — |
| `AlternateStreetSuffix` | 11,148 | 11,148 | Sale/Closed 5,837 · Rental/Closed 5,311 | enum-like | — | unclassified | — | — |
| `CommercialUnitsYN` | 11,083 | 11,083 | Rental/Closed 6,428 · Sale/Closed 3,597 · Sale/Active 517 · Sale/Pending 368 | number | 0=645 · 1=3 | boolean fact | rentalForm, saleTools, rentalTools | — |
| `CeilingHeightInches` | 7,621 | 7,621 | Sale/Closed 4,256 · Rental/Closed 2,907 · Sale/Active 283 · Sale/Pending 153 | number | 0=120 · 108=22 · 7=20 · 120=18 · 6=15 | unit features | — | — |
| `BuildingStaffType` | 3,652 | 3,652 | Sale/Closed 1,251 · Sale/Active 1,095 · Sale/Pending 706 · Rental/Closed 417 | enum-like | SuperLiveIn=1053 · ResidentManagerFullTime=123 · SuperOffsite=45 | security/doorman | — | — |
| `CoBuyerAgentRLSParticipantYN` | 3,285 | 3,285 | Sale/Closed 1,979 · Rental/Closed 1,304 · Sale/Pending 2 | enum-like | — | boolean fact | — | — |
| `TaxAbatementExpirationYear` | 2,913 | 2,913 | Sale/Closed 1,556 · Rental/Closed 1,035 · Sale/Active 185 · Sale/Pending 133 | number | 2039=34 · 2020=19 · 2033=17 · 2021=15 · 2023=12 | financial | — | {"features":true,"raw":true} |
| `AlternateStreetDirPrefix` | 2,850 | 2,850 | Rental/Closed 1,465 · Sale/Closed 1,385 | enum-like | — | unclassified | — | — |
| `TaxAbatementComments` | 2,816 | 2,816 | Sale/Closed 1,567 · Rental/Closed 929 · Sale/Active 185 · Sale/Pending 133 | text | 421A=84 · J51=22 · Ends 2039=15 · n/a=11 · Tax Abated Building=6 | financial | rentalForm, saleTools, rentalTools | {"features":true,"raw":true} |
| `BuildingParkingTotal` | 1,936 | 1,936 | Sale/Closed 1,118 · Rental/Closed 479 · Sale/Active 175 · Sale/Pending 140 | number | 0=60 · 25=21 · 1=20 · 60=16 · 200=13 | unclassified | — | — |
| `CapitalReservesTotal` | 662 | 662 | Sale/Closed 466 · Rental/Closed 104 · Sale/Active 48 · Sale/Pending 39 | number | 0.00=34 · 1.00=6 · 2.00=2 · 2000000.00=2 · 3.00=1 | unclassified | rentalForm, saleTools, rentalTools | — |
| `NumberOfProfessionalUnitsTotal` | 609 | 609 | Sale/Closed 362 · Rental/Closed 152 · Sale/Active 56 · Sale/Pending 31 | number | 0=33 · 1=11 · 435=5 · 2=4 · 7=3 | unclassified | — | — |
| `ComingSoonTimestamp` | 574 | 574 | Sale/Closed 390 · Sale/Pending 99 · Sale/Active 80 · Sale/ComingSoon 5 | text | 2026-07-10T00:00:00.000=4 · 2026-07-16T00:00:00.000=4 · 2026-08-26T00:00:00.000=3 · 2026-08-27T00:00:00.000=3 · 2026-06-08T00:00:00.000=2 | unclassified | — | — |
| `AlternateStreetDirSuffix` | 185 | 185 | Sale/Closed 99 · Rental/Closed 86 | enum-like | — | unclassified | — | — |
| `SpecialAssessmentExpirationDateTime` | 181 | 181 | Sale/Closed 101 · Rental/Closed 49 · Sale/Pending 17 · Sale/Active 13 | text | 2026-11-29T19:06:00.000=4 · 2017-12-31T19:06:00.000=2 · 2015-12-31T19:06:00.000=2 · 2016-12-31T19:06:00.000=1 · 2018-12-31T19:06:00.000=1 | financial | — | — |
| `ArchitectName` | 106 | 106 | Sale/Closed 51 · Sale/Pending 21 · Sale/Active 20 · Rental/Closed 12 | text | Selldorf Architects=15 · Charles W. Romeyn and Henry R. Wynne=1 · Kenneth M. Murchison=1 · Brent Buck=1 · David Chipperfield=1 | unclassified | — | — |
| `AreaOverFAR` | 24 | 24 | Sale/Closed 11 · Rental/Closed 6 · Sale/Active 4 · Sale/Pending 1 | number | 0.00=4 · 1150.00=1 | unclassified | — | — |
| `AreaUnderFAR` | 22 | 22 | Sale/Closed 11 · Sale/Active 5 · Rental/Closed 3 · Sale/Pending 2 | number | 0.00=4 · 1000.00=1 | unclassified | — | — |
| `CoExclusiveListingKey` | 1 | 1 | Sale/Closed 1 | enum-like | — | unclassified | — | — |
| `PrivateOutdoorSpaceRemarks` | 1 | 1 | Sale/Closed 1 | enum-like | — | amenities | — | — |

## H. Media model — resource, categories, Property carriers

MediaCategory — published members (18): Addendum, AerialView, AgentPhoto, BrandedVirtualTour, Disclosure, Document, FloorPlan, Map, OfficeLogo, OfficePhoto, Other, Photo, RentalDocuments, Restriction, Survey, Topography, UnbrandedVirtualTour, Video. Observed (2,000,982 rows): FloorPlan 583,809, Photo 1,417,173. Mallan names as literals: Other. Media.ResourceName observed: Property and Building (62 Building photo rows keyed by BuildingKey; Member/Office media: 0). Tours and videos exist only as Property carriers (six VirtualTourURL* + VideosCount/VideosChangeTimestamp) — §E Tours & video; flags must be derived from each retained provider fact, never from the absence of a MediaCategory.

| Media consumer surface | Property media fields PASS | Media resource fields with a consumer |
|---|---|---|
| Sale Search | VirtualTourURLBranded, VirtualTourURLBranded2, VirtualTourURLBranded3, VirtualTourURLUnbranded, VirtualTourURLUnbranded2, VirtualTourURLUnbranded3 | ModificationTimestamp, MediaCategory, InternetEntireListingDisplayYN, ListOfficeMlsId, PropertyType, StandardStatus, PropertySubType, Permission, SourceSystemName |
| Rental Search | VirtualTourURLBranded, VirtualTourURLBranded2, VirtualTourURLBranded3, VirtualTourURLUnbranded, VirtualTourURLUnbranded2, VirtualTourURLUnbranded3 | ModificationTimestamp, MediaCategory, InternetEntireListingDisplayYN, ListOfficeMlsId, PropertyType, StandardStatus, PropertySubType, Permission, SourceSystemName |
| Sale Form | DocumentsAvailable, PhotosChangeTimestamp, VirtualTourURLBranded, VirtualTourURLUnbranded, VirtualTourURLUnbranded2, VirtualTourURLUnbranded3 | InternetEntireListingDisplayYN, PropertyType, OffMarketDate, SyndicateTo |
| Rental Form | DocumentsAvailable, VirtualTourURLBranded, VirtualTourURLUnbranded, VirtualTourURLUnbranded2, VirtualTourURLUnbranded3 | InternetEntireListingDisplayYN, PropertyType, PropertySubType, OffMarketDate, SyndicateTo |
| Sale Tools | PhotosCount | ModificationTimestamp, InternetEntireListingDisplayYN, ListOfficeMlsId, PropertyType, StandardStatus, PropertySubType, Permission |
| Rental Tools | PhotosCount | ModificationTimestamp, InternetEntireListingDisplayYN, ListOfficeMlsId, PropertyType, StandardStatus, PropertySubType, Permission |
| CMA | PhotosCount | PropertyType, StandardStatus |
| Reports | — | ModificationTimestamp, StandardStatus, PropertySubType |
| Listing workspace | PhotosCount, VirtualTourURLBranded, VirtualTourURLUnbranded | ModificationTimestamp, OriginatingSystemName, InternetEntireListingDisplayYN, ListOfficeMlsId, PropertyType, StandardStatus, ListOfficeKey, PropertySubType, ListAgentKey, OffMarketDate, Permission, SyndicateTo |
| Marketing | — | ListOfficeMlsId |
| Public display | DocumentsAvailable | MediaCategory, InternetEntireListingDisplayYN, ListOfficeMlsId, PropertyType, StandardStatus, PropertySubType, MediaURL, Permission |
| Media lane | PhotosChangeTimestamp | MediaClassification, MediaKey, MediaModificationTimestamp, MediaStatus, ModificationTimestamp, Order, ResourceRecordKey, MediaCategory, ResourceRecordID, InternetEntireListingDisplayYN, StandardStatus, MediaURL, ShortDescription, PreferredPhotoYN, Permission |

## I. Suppressed-field census, behaviour register, production proofs

| Census | Resource | Scope | Rows walked | Suppressed fields | Fields with ≥1 value | Mallan code still binding or reading one |
|---|---|---|---|---|---|---|
| Active | Property | StandardStatus eq 'Active' | 7,600 | 221 | **0** | `BuildingKeyNumeric`, `BuyerAgentDirectPhone`, `BuyerAgentEmail`, `BuyerAgentFullName`, `BuyerAgentStateLicense`, `BuyerBrokerageCompensation`, `BuyerBrokerageCompensationType`, `BuyerOfficeName`, `BuyerOfficePhone`, `CancellationDate`, `CoBuyerAgentDirectPhone`, `CoBuyerAgentEmail`, `CoBuyerAgentFullName`, `CoBuyerAgentStateLicense`, `CoBuyerOfficeName`, `CoBuyerOfficePhone`, `Concessions`, `ConcessionsAmount`, `ConcessionsComments`, `CopyrightNotice`, `Country`, `CumulativeDaysOnMarket`, `DaysOnMarket`, `Disclosures`, `ExpirationDate`, `InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `Latitude`, `LockBoxLocation`, `LockBoxSerialNumber`, `LockBoxType`, `Longitude`, `MLSAreaMajor`, `MLSAreaMinor`, `MapCoordinate`, `MlsStatus`, `Model`, `OwnerName`, `OwnerPhone`, `PreviousStandardStatus` +13 |
| Active | Member | all (resource has no StandardStatus) | 11,191 | 15 | **0** | `Permission`, `SyndicateTo` |
| Active | Office | all (resource has no StandardStatus) | 578 | 12 | **0** | `Permission`, `SyndicateTo` |
| Active | OpenHouse | StandardStatus eq 'Active' | 1,408 | 5 | **0** | `OpenHouseRemarks`, `Permission`, `SourceSystemKey` |
| Active | CustomProperty | StandardStatus eq 'Active' | 7,637 | 28 | **0** | `OffMarketDate`, `Permission`, `SourceSystemKey` |
| Active | PropertyRooms | StandardStatus eq 'Active' | 2 | 2 | **0** | `Permission` |
| Active | PropertyUnitTypes | StandardStatus eq 'Active' | 0 | 3 | **0** | `Permission` |
| all statuses | Property | all | 591,597 | 221 | **0** | `BuildingKeyNumeric`, `BuyerAgentDirectPhone`, `BuyerAgentEmail`, `BuyerAgentFullName`, `BuyerAgentStateLicense`, `BuyerBrokerageCompensation`, `BuyerBrokerageCompensationType`, `BuyerOfficeName`, `BuyerOfficePhone`, `CancellationDate`, `CoBuyerAgentDirectPhone`, `CoBuyerAgentEmail`, `CoBuyerAgentFullName`, `CoBuyerAgentStateLicense`, `CoBuyerOfficeName`, `CoBuyerOfficePhone`, `Concessions`, `ConcessionsAmount`, `ConcessionsComments`, `CopyrightNotice`, `Country`, `CumulativeDaysOnMarket`, `DaysOnMarket`, `Disclosures`, `ExpirationDate`, `InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `Latitude`, `LockBoxLocation`, `LockBoxSerialNumber`, `LockBoxType`, `Longitude`, `MLSAreaMajor`, `MLSAreaMinor`, `MapCoordinate`, `MlsStatus`, `Model`, `OwnerName`, `OwnerPhone`, `PreviousStandardStatus` +13 |

| Field | Behaviour stage | Status | Citation (pattern re-verified) | Note |
|---|---|---|---|---|
| `Permission` | memberBehavior | **DEFECT** | docs/operations/STEP3-FORBIDDEN-AUTHORITY-LEDGER.md §13.3 — pattern present | authenticated backend Search excludes Permission=Private rows; latent (0 Private rows live) |
| `Permission` | publicBehavior | **DEFECT** | docs/operations/STEP3-FORBIDDEN-AUTHORITY-LEDGER.md §13.4 — pattern present | public displayability bypasses the Mallan owner-opt-out gate for rls_eligible=false rows; latent (0 opt-out rows) |
| `Permission` | privateSharingBehavior | **UNVERIFIED** | docs/operations/STEP3-FORBIDDEN-AUTHORITY-LEDGER.md §13.5 | listing-sends, campaigns and portals not traced against the visibility model |
| `InternetEntireListingDisplayYN` | publicBehavior | **PASS** | lib/compliance/__tests__/compliance-gates.test.ts (fail-open lock, 2026-05-01) — pattern present | test-proven fail-open (!== false); provider nulls the field on every row |
| `InternetAddressDisplayYN` | publicBehavior | **PASS** | lib/compliance/__tests__/compliance-gates.test.ts — pattern present | test-proven fail-open |

| Field | Production proof | Note |
|---|---|---|
| `Latitude` | FAIL | stored coordinates: address 0 / projection 0 of 26,510 rows |
| `Longitude` | FAIL | stored coordinates: address 0 / projection 0 of 26,510 rows |
| `VirtualTourURLUnbranded` | FAIL | raw carrier on 3,262 rows; projection has_virtual_tour true on 0 (branch not deployed, no backfill) |
| `VirtualTourURLBranded` | FAIL | raw carrier on 663 rows; projection flag true on 0 |
| `VirtualTourURLUnbranded2` | FAIL | absent from every stored raw_data (0) |
| `VideosCount` | FAIL | absent from every stored raw_data (0) |
| `DaysOnMarket` | N/A | never stored (provider-suppressed); Mallan DOM is computed |
| `MlsStatus` | INFO | 7 stored rows carry a value (non-provider rows) |
| `InternetEntireListingDisplayYN` | INFO | 7 stored rows carry a value (non-provider rows) |

## J. Transaction state — how in-contract / off-market / pending / closed manifest (Sale vs Rental)

Census of 591,599 Property rows (all statuses): combinations of StandardStatus, PurchaseContractDate, ContractStatusChangeDate, OffMarketDate, OffMarketTimestamp, PendingTimestamp, MajorChangeType, MajorChangeTimestamp, StatusChangeTimestamp (and the surrounding dates), measured separately for Sale (PropertyType Residential) and Rental (ResidentialLease); CustomFields walked for contract terminology (591,641 rows). Full tables: `docs/operations/evidence-2026-09-08/transaction-state/transaction-state-census.md`. No Mallan status label is derived here — this is the evidence the label mapping must be proven against.

### Rental — 376,079 rows · Closed 374,791 · Pending 349 · Active 939 · MlsStatus/PreviousStandardStatus delivered: 0/0

| Status | Rows | PurchaseContractDate | ContractStatusChangeDate | PendingTimestamp | OffMarketDate | OffMarketTimestamp | StatusChangeTimestamp | MajorChangeTimestamp | CloseDate | BackOnMarketDate | Withdrawn/Cancellation/Expiration/Contingent | MajorChangeType distribution |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Closed | 374,791 | 61,654 (16%) | 374,791 (100%) | 76,159 (20%) | 374,791 (100%) | 373,971 (100%) | 374,733 (100%) | 374,791 (100%) | 374,791 (100%) | 952 (0%) | 4/0/0/0 | PriceChange 220,710 · Closed 153,929 · null 151 · Pending 1 |
| Active | 939 | 7 (1%) | 939 (100%) | 17 (2%) | 0 | 0 | 936 (100%) | 939 (100%) | 0 | 49 (5%) | 0/0/0/0 | NewListing 732 · null 161 · BackOnMarket 44 · PriceChange 2 |
| Pending | 349 | 341 (98%) | 349 (100%) | 349 (100%) | 66 (19%) | 347 (99%) | 349 (100%) | 349 (100%) | 2 (1%) | 25 (7%) | 0/0/0/0 | Pending 334 · null 10 · PriceChange 3 · ActiveUnderContract 2 |

Active rows carrying contract-shaped dates: ContractStatusChangeDate 939, PurchaseContractDate 7, PendingTimestamp 17. Closed rows with none of PurchaseContractDate / ContractStatusChangeDate / PendingTimestamp: 0.

Top combination signatures: `Closed | ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=PriceChange` 218,494; `Closed | ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 79,590; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 59,924; `Closed | ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 12,574; `Closed | ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=PriceChange` 2,044; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+BackOnMarketDate | MCT=Closed` 949; `Active | ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp | MCT=NewListing` 729; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 246; `Closed | ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 245; `Pending | PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp | MCT=Pending` 243; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 231; `Active | ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp | MCT=null` 151

Pairwise (rows with both, day granularity — equal / A before B / A after B): PurchaseContractDate vs ContractStatusChangeDate: 39,500 / 21,874 / 628; PurchaseContractDate vs PendingTimestamp: 39,150 / 19,737 / 2,703; PurchaseContractDate vs OffMarketDate: 37,369 / 24,260 / 91; PurchaseContractDate vs CloseDate: 37,327 / 24,239 / 90; ContractStatusChangeDate vs PendingTimestamp: 33,536 / 15,860 / 27,129; ContractStatusChangeDate vs StatusChangeTimestamp: 78,621 / 57,283 / 240,114; OffMarketDate vs OffMarketTimestamp: 213,526 / 33,239 / 127,272; OffMarketDate vs CloseDate: 374,793 / 0 / 0; PendingTimestamp vs StatusChangeTimestamp: 38,715 / 35,431 / 2,379; MajorChangeTimestamp vs StatusChangeTimestamp: 186,354 / 36,633 / 153,031; MajorChangeTimestamp vs ModificationTimestamp: 2,698 / 373,381 / 0; OnMarketDate vs ListingContractDate: 47,537 / 4,318 / 11,281; CloseDate vs StatusChangeTimestamp: 83,300 / 56,033 / 235,402

### Sale — 215,520 rows · Closed 203,611 · Pending 5,241 · Active 6,663 · ComingSoon 5 · MlsStatus/PreviousStandardStatus delivered: 0/0

| Status | Rows | PurchaseContractDate | ContractStatusChangeDate | PendingTimestamp | OffMarketDate | OffMarketTimestamp | StatusChangeTimestamp | MajorChangeTimestamp | CloseDate | BackOnMarketDate | Withdrawn/Cancellation/Expiration/Contingent | MajorChangeType distribution |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Closed | 203,611 | 112,197 (55%) | 203,611 (100%) | 61,303 (30%) | 203,611 (100%) | 200,046 (98%) | 203,589 (100%) | 203,611 (100%) | 203,611 (100%) | 2,079 (1%) | 6/0/0/0 | PriceChange 135,382 · Closed 67,737 · null 492 |
| Active | 6,663 | 172 (3%) | 6,663 (100%) | 182 (3%) | 11 (0%) | 19 (0%) | 6,558 (98%) | 6,663 (100%) | 11 (0%) | 767 (12%) | 11/0/0/0 | NewListing 3,798 · null 2,171 · BackOnMarket 650 · Active 32 · PriceChange 12 |
| Pending | 5,241 | 5,241 (100%) | 5,241 (100%) | 5,211 (99%) | 391 (7%) | 5,205 (99%) | 5,241 (100%) | 5,241 (100%) | 3 (0%) | 480 (9%) | 1/0/0/0 | Pending 5,084 · null 117 · ActiveUnderContract 35 · PriceChange 5 |
| ComingSoon | 5 | 0 | 5 (100%) | 0 | 0 | 0 | 5 (100%) | 5 (100%) | 0 | 0 | 0/0/0/0 | ComingSoon 5 |

Active rows carrying contract-shaped dates: ContractStatusChangeDate 6,663, PurchaseContractDate 172, PendingTimestamp 182, OffMarketDate 11. Closed rows with none of PurchaseContractDate / ContractStatusChangeDate / PendingTimestamp: 0.

Top combination signatures: `Closed | ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=PriceChange` 85,383; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 47,618; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=PriceChange` 41,310; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 11,015; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=PriceChange` 6,201; `Pending | PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp | MCT=Pending` 4,254; `Active | ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp | MCT=NewListing` 3,754; `Closed | ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=PriceChange` 2,398; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 2,326; `Closed | ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate | MCT=Closed` 2,220; `Closed | PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+BackOnMarketDate | MCT=Closed` 2,024; `Active | ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp | MCT=null` 1,878

Pairwise (rows with both, day granularity — equal / A before B / A after B): PurchaseContractDate vs ContractStatusChangeDate: 9,500 / 106,237 / 1,873; PurchaseContractDate vs PendingTimestamp: 37,757 / 22,307 / 2,739; PurchaseContractDate vs OffMarketDate: 2,343 / 108,678 / 1,578; PurchaseContractDate vs CloseDate: 2,132 / 108,502 / 1,577; ContractStatusChangeDate vs PendingTimestamp: 6,240 / 5,877 / 54,579; ContractStatusChangeDate vs StatusChangeTimestamp: 43,932 / 61,801 / 109,660; OffMarketDate vs OffMarketTimestamp: 87,661 / 33,649 / 79,128; OffMarketDate vs CloseDate: 203,625 / 0 / 0; PendingTimestamp vs StatusChangeTimestamp: 7,812 / 58,105 / 779; MajorChangeTimestamp vs StatusChangeTimestamp: 111,889 / 30,077 / 73,427; MajorChangeTimestamp vs ModificationTimestamp: 7,472 / 208,047 / 1; OnMarketDate vs ListingContractDate: 36,780 / 3,193 / 16,454; CloseDate vs StatusChangeTimestamp: 32,879 / 63,300 / 107,424

CustomFields keys matching contract / in-contract terminology (7): `CertificateOfOccupancyYN` (key, 229,778 non-empty), `GuarantorsAcceptedYN` (key, 33,775 non-empty), `FlipTaxRemarks` (value, 1,182 non-empty), `MaximumFinancingRemarks` (value, 223 non-empty), `BonusRemarks` (value, 22 non-empty), `TaxAbatementComments` (value, 16 non-empty), `BuildingRules` (value, 3 non-empty) — none is an in-contract status key; the terms occur in remarks/rules text and Y/N facts.

## K. IDX Plus workbook cross-check (discovery aid, not authority)

1,223 rows (902 IDX Plus + 321 live-discovered). Classification: exact Cotality match 1223. Rows that exist in the entitled contract but never surface anywhere in Mallan (no mapper, no form, no consumer): **784** — `CustomProperty.AboveGradeBedrooms`, `CustomProperty.AboveGradeFinishedAreaRange`, `CustomProperty.AboveGradeFinishedAreaRangeSource`, `CustomProperty.AboveGradeFinishedAreaRangeUnits`, `CustomProperty.AboveGradeUnfinishedAreaRange`, `CustomProperty.AboveGradeUnfinishedAreaRangeSource`, `CustomProperty.AboveGradeUnfinishedAreaRangeUnits`, `CustomProperty.AssociationFeeTotal`, `CustomProperty.AssociationFeeTotalFrequency`, `CustomProperty.Attic`, `CustomProperty.AvailabilityType`, `CustomProperty.BelowGradeBedrooms`, `CustomProperty.BelowGradeFinishedAreaRange`, `CustomProperty.BelowGradeFinishedAreaRangeSource`, `CustomProperty.BelowGradeFinishedAreaRangeUnits`, `CustomProperty.BelowGradeUnfinishedAreaRange`, `CustomProperty.BelowGradeUnfinishedAreaRangeSource`, `CustomProperty.BelowGradeUnfinishedAreaRangeUnits`, `CustomProperty.BoatDockAccommodates`, `CustomProperty.BoatDockHeight`, `CustomProperty.BoatDockSlipDescription`, `CustomProperty.BoatDockSlipFeatures`, `CustomProperty.BoatDockYN`, `CustomProperty.BoatSlipYN`, `CustomProperty.BonusAmount`, `CustomProperty.BuildingAreaTotalRange`, `CustomProperty.BuildingAreaTotalRangeSource`, `CustomProperty.BuildingAreaTotalRangeUnits`, `CustomProperty.BuildingSizeDimensions`, `CustomProperty.ComplexName`, `CustomProperty.DevelopmentName`, `CustomProperty.FractionalShare`, `CustomProperty.GarageArea`, `CustomProperty.GarageAreaUnits`, `CustomProperty.GarageDimensions`, `CustomProperty.GuestHouseAreaTotal`, `CustomProperty.GuestHouseAreaTotalSource`, `CustomProperty.GuestHouseAreaTotalUnits`, `CustomProperty.GuestHouseDescription`, `CustomProperty.GuestHouseYN`, `CustomProperty.HumanModifiedYN`, `CustomProperty.Lang2_Type`, `CustomProperty.Lang3_Type`, `CustomProperty.LastMonthRentReqYN`, `CustomProperty.LeaseAmountPerArea`, `CustomProperty.LeaseAmountPerAreaUnit`, `CustomProperty.LeaseTermsDescription`, `CustomProperty.ListAOR`, `CustomProperty.LivingAreaRange`, `CustomProperty.LivingAreaRangeHigh`, `CustomProperty.LivingAreaRangeLow`, `CustomProperty.LivingAreaRangeSource`, `CustomProperty.LivingAreaRangeUnits`, `CustomProperty.Location`, `CustomProperty.LotSizeAreaRangeHigh`, `CustomProperty.LotSizeAreaRangeLow`, `CustomProperty.LotSizeRange`, `CustomProperty.LotSizeRangeSource`, `CustomProperty.LotSizeRangeUnits`, `CustomProperty.MembershipFeeFrequency` +724.

| Feed | Resource | Standard name | Classification | Availability | Population | Mapped | Persisted | Sale Srch | Rent Srch | Sale Form | Rent Form | Sale Tools | Rent Tools | CMA | Rep | Public | Compl |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IDX Plus | CustomProperty | `AboveGradeBedrooms` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AboveGradeFinishedAreaRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AboveGradeFinishedAreaRangeSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AboveGradeFinishedAreaRangeUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AboveGradeUnfinishedAreaRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AboveGradeUnfinishedAreaRangeSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AboveGradeUnfinishedAreaRangeUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AdditionalFee` | exact Cotality match | POPULATED | 90 | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | CustomProperty | `AdditionalFeeDescription` | exact Cotality match | POPULATED | 317,956 | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | CustomProperty | `AdditionalFeeFrequency` | exact Cotality match | POPULATED | 34 | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AdditionalFeeYN` | exact Cotality match | POPULATED | 591,609 | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | CustomProperty | `AssociationFeeTotal` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AssociationFeeTotalFrequency` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `Attic` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `AvailabilityType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BelowGradeBedrooms` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BelowGradeFinishedAreaRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BelowGradeFinishedAreaRangeSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BelowGradeFinishedAreaRangeUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BelowGradeUnfinishedAreaRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BelowGradeUnfinishedAreaRangeSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BelowGradeUnfinishedAreaRangeUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BoatDockAccommodates` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BoatDockHeight` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BoatDockSlipDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BoatDockSlipFeatures` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BoatDockYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BoatSlipYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BonusAmount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BuildingAreaTotalRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BuildingAreaTotalRangeSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BuildingAreaTotalRangeUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `BuildingSizeDimensions` | exact Cotality match | POPULATED | 9,394 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `ComplexName` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `CustomFields` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `DevelopmentName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `FractionalShare` | exact Cotality match | POPULATED | 192,124 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GarageArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GarageAreaUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GarageDimensions` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GuestHouseAreaTotal` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GuestHouseAreaTotalSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GuestHouseAreaTotalUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GuestHouseDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `GuestHouseYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `HumanModifiedYN` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `InternetEntireListingDisplayYN` | exact Cotality match | POPULATED | 591,649 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| IDX Plus | CustomProperty | `Lang2_Type` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `Lang3_Type` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LastMonthRentReqYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LeaseAmountPerArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LeaseAmountPerAreaUnit` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LeaseTermsDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `ListAOR` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `ListingId` | exact Cotality match | POPULATED | 591,649 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| IDX Plus | CustomProperty | `ListingKeyNumeric` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | CustomProperty | `ListOfficeKey` | exact Cotality match | POPULATED | 591,649 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `ListOfficeMlsId` | exact Cotality match | POPULATED | 591,649 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✘ |
| IDX Plus | CustomProperty | `LivingAreaRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LivingAreaRangeHigh` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LivingAreaRangeLow` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LivingAreaRangeSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LivingAreaRangeUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `Location` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LotSizeAreaRangeHigh` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LotSizeAreaRangeLow` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LotSizeRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LotSizeRangeSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `LotSizeRangeUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `MembershipFeeFrequency` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `MonthlyRate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `NumberOfBoatDocks` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `NumberOfBoatSlips` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `OffersDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `OffersReviewDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `OriginatingSystemKey` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `OriginatingSystemSubName` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `OtherExpenseDescription` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `PotentialShortSale` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `PricePerArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `PricePerAreaUnit` | exact Cotality match | POPULATED | 12 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `ProjectName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `PropertyAccess` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `PropertyType` | exact Cotality match | POPULATED | 591,649 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ |
| IDX Plus | CustomProperty | `PublicRemarks_lang2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `PublicRemarks_lang3` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `Restrictions` | exact Cotality match | POPULATED | 24,129 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `SaleOrLeaseIncludes` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `SecurityDepositDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `SecurityDepositYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `StandardStatus` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | CustomProperty | `StoriesPartial` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `StoriesPartialTotal` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `StormProtection` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TaxAssessedValueImprovement` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TaxAssessedValueLand` | exact Cotality match | POPULATED | 14 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TaxAuthority` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TaxRate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `ThirdPartyIntegrationType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TitleCompanyAddress` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TitleCompanyName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TitleCompanyPhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `TitleCompanyPreferred` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `WaterAccessDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `WaterAccessYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | CustomProperty | `WeeklyRate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ChangedByMemberID` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ChangedByMemberKey` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ChangedByMemberKeyNumeric` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ClassName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `HumanModifiedYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ImageHeight` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ImageOf` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ImageSizeDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ImageWidth` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `InternetEntireListingDisplayYN` | exact Cotality match | POPULATED | 2,000,836 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| IDX Plus | Media | `ListAgentKey` | exact Cotality match | POPULATED | 1,987,830 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ListAOR` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ListingPermission` | exact Cotality match | POPULATED | 1,699,794 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ListOfficeKey` | exact Cotality match | POPULATED | 2,000,750 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ListOfficeMlsId` | exact Cotality match | POPULATED | 2,000,836 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✘ |
| IDX Plus | Media | `LongDescription` | exact Cotality match | POPULATED | 31,738 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `MediaCategory` | exact Cotality match | POPULATED | 2,000,897 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ |
| IDX Plus | Media | `MediaClassification` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `MediaHTML` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `MediaKeyNumeric` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `MediaModificationTimestamp` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `MediaObjectID` | exact Cotality match | POPULATED | 1,562,623 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `MediaStatus` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `MediaType` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `MediaURL` | exact Cotality match | POPULATED | 589,848 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ | ✘ |
| IDX Plus | Media | `OffMarketDate` | exact Cotality match | POPULATED | 1,362,225 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ |
| IDX Plus | Media | `Order` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `OriginatingSystemID` | exact Cotality match | POPULATED | 1,318,099 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `OriginatingSystemMediaKey` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `OriginatingSystemResourceRecordKey` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `OriginatingSystemSubName` | exact Cotality match | POPULATED | 2,000,836 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `PreferredPhotoYN` | exact Cotality match | POPULATED | 71,570 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `PropertySubType` | exact Cotality match | POPULATED | 2,000,293 | ✘ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Media | `PropertySubTypeAdditional` | exact Cotality match | POPULATED | 1,821,445 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `PropertyType` | exact Cotality match | POPULATED | 2,000,836 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ |
| IDX Plus | Media | `RecordSignature` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ResourceName` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ResourceRecordID` | exact Cotality match | POPULATED | 2,000,888 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `ResourceRecordKey` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `ResourceRecordKeyNumeric` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `ShortDescription` | exact Cotality match | POPULATED | 133,895 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Media | `SourceSystemID` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `SourceSystemMediaKey` | exact Cotality match | POPULATED | 1,840,948 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `SourceSystemName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Media | `StandardStatus` | exact Cotality match | POPULATED | 2,000,836 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Media | `SyndicateTo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Member | `HumanModifiedYN` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberAddress1` | exact Cotality match | POPULATED | 10,472 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberAddress2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberAlternateId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberAOR` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberAORkey` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberAORkeyNumeric` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberAORMlsId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberBio` | exact Cotality match | POPULATED | 1,042 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberCarrierRoute` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberCity` | exact Cotality match | POPULATED | 10,462 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberCityRegion` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberCommitteeCount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberCountry` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberCountyOrParish` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberDesignation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberDirectPhone` | exact Cotality match | POPULATED | 11,064 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberEmail` | exact Cotality match | POPULATED | 11,186 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberFax` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberFirstName` | exact Cotality match | POPULATED | 11,190 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberFullName` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberIsAssistantTo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberKeyNumeric` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberLanguages` | exact Cotality match | POPULATED | 816 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberLastName` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberMailOptOutYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberMiddleName` | exact Cotality match | POPULATED | 4,281 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberMlsAccessYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberMlsId` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberMobilePhone` | exact Cotality match | POPULATED | 10,114 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberNamePrefix` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberNameSuffix` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberNationalAssociationEntryDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberNationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberNickname` | exact Cotality match | POPULATED | 9,890 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberOfficePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberOfficePhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberOtherPhoneType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPhoneTTYTDD` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPostalCode` | exact Cotality match | POPULATED | 10,474 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPostalCodePlus4` | exact Cotality match | POPULATED | 141 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPreferredMail` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPreferredMedia` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPreferredPhone` | exact Cotality match | POPULATED | 11,064 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPreferredPhoneExt` | exact Cotality match | POPULATED | 29 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPreferredPublication` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberPrimaryAorId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberStateLicenseExpirationDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberStateOrProvince` | exact Cotality match | POPULATED | 10,459 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberStatus` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberStreetAdditionalInfo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberTollFreePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberTransferDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberVoiceMail` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberVoiceMailExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `MemberVotingPrecinct` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OfficeKey` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OfficeKeyNumeric` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OfficeMlsId` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OfficeName` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OfficeNationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OriginalEntryTimestamp` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ |
| IDX Plus | Member | `OriginatingSystemID` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OriginatingSystemMemberKey` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OriginatingSystemMemberMlsSecurityClass` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OriginatingSystemOfficeKey` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `OriginatingSystemSubName` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `RecordSignature` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `SourceSystemMemberKey` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `SourceSystemName` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Member | `UniqueLicenseeIdentifier` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `BillingOfficeKey` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `FranchiseNationalAssociationId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `HumanModifiedYN` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `IDXOfficeParticipationYN` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `MainOfficeKey` | exact Cotality match | POPULATED | 576 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `MainOfficeKeyNumeric` | exact Cotality match | POPULATED | 576 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `MainOfficeMlsId` | exact Cotality match | POPULATED | 576 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `NumberOfBranches` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `NumberOfNonMemberSalespersons` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeAddress1` | exact Cotality match | POPULATED | 546 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeAddress2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeAlternateId` | exact Cotality match | POPULATED | 14 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeAOR` | exact Cotality match | POPULATED | 577 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeAORkey` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeAORkeyNumeric` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeAORMlsId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeBio` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeBranchType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeBrokerKey` | exact Cotality match | POPULATED | 530 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeBrokerKeyNumeric` | exact Cotality match | POPULATED | 530 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeBrokerMlsId` | exact Cotality match | POPULATED | 530 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeBrokerNationalAssociationId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeCity` | exact Cotality match | POPULATED | 546 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeCityRegion` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeCountry` | exact Cotality match | POPULATED | 577 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeCountyOrParish` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeEmail` | exact Cotality match | POPULATED | 42 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeFax` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeKeyNumeric` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailAddress1` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailAddress2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailCareOf` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailCity` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailCountry` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailCountyOrParish` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailPostalCode` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailPostalCodePlus4` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMailStateOrProvince` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeMlsId` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeName` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeNationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeNationalAssociationIdInsertDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficePhone` | exact Cotality match | POPULATED | 546 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficePhoneExt` | exact Cotality match | POPULATED | 7 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficePostalCode` | exact Cotality match | POPULATED | 546 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficePostalCodePlus4` | exact Cotality match | POPULATED | 25 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficePreferredMedia` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficePrimaryAorId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficePrimaryStateOrProvince` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeStateOrProvince` | exact Cotality match | POPULATED | 546 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeStatus` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeStreetAdditionalInfo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OfficeType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OriginalEntryTimestamp` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ |
| IDX Plus | Office | `OriginatingSystemID` | exact Cotality match | POPULATED | 577 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OriginatingSystemMainOfficeKey` | exact Cotality match | POPULATED | 576 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OriginatingSystemOfficeBrokerKey` | exact Cotality match | POPULATED | 530 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OriginatingSystemOfficeKey` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OriginatingSystemOfficeManagerKey` | exact Cotality match | POPULATED | 412 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OriginatingSystemSubName` | exact Cotality match | POPULATED | 577 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `OtherPhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `RecordSignature` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `SourceSystemID` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `SourceSystemName` | exact Cotality match | POPULATED | 577 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `SourceSystemOfficeKey` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Office | `VirtualOfficeWebsiteYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `AppointmentRequiredYN` | exact Cotality match | POPULATED | 1,474 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | OpenHouse | `HumanModifiedYN` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `InternetEntireListingDisplayYN` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| IDX Plus | OpenHouse | `ListAgentKey` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ListAOR` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ListingId` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| IDX Plus | OpenHouse | `ListingKey` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✘ | ✔ | ✘ |
| IDX Plus | OpenHouse | `ListingKeyNumeric` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | OpenHouse | `ListingPermission` | exact Cotality match | POPULATED | 604 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ListOfficeKey` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ListOfficeMlsId` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✘ |
| IDX Plus | OpenHouse | `OffMarketDate` | exact Cotality match | POPULATED | 100 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ |
| IDX Plus | OpenHouse | `OpenHouseAttendedBy` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `OpenHouseDate` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | OpenHouse | `OpenHouseEndTime` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | OpenHouse | `OpenHouseId` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `OpenHouseKeyNumeric` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `OpenHouseStartTime` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | OpenHouse | `OpenHouseStatus` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `OpenHouseType` | exact Cotality match | POPULATED | 613 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | OpenHouse | `OriginalEntryTimestamp` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ |
| IDX Plus | OpenHouse | `OriginatingSystemID` | exact Cotality match | POPULATED | 14 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `OriginatingSystemKey` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `OriginatingSystemListingKey` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `OriginatingSystemSubName` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `PropertySubType` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | OpenHouse | `PropertySubTypeAdditional` | exact Cotality match | POPULATED | 1,430 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `PropertyType` | exact Cotality match | POPULATED | 1,483 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ |
| IDX Plus | OpenHouse | `RecordSignature` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `Refreshments` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ShowingAgentFirstName` | exact Cotality match | POPULATED | 1,196 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ShowingAgentKey` | exact Cotality match | POPULATED | 1,373 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ShowingAgentKeyNumeric` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ShowingAgentLastName` | exact Cotality match | POPULATED | 1,196 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `ShowingAgentMlsID` | exact Cotality match | POPULATED | 1,373 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `SourceSystemID` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `SourceSystemName` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | OpenHouse | `StandardStatus` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | OpenHouse | `SyndicateTo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `AboveGradeFinishedArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AboveGradeFinishedAreaSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AboveGradeFinishedAreaUnits` | exact Cotality match | POPULATED | 76 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `AboveGradeUnfinishedArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AboveGradeUnfinishedAreaSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AboveGradeUnfinishedAreaUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AccessibilityFeatures` | exact Cotality match | POPULATED | 4,802 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ActivationDate` | exact Cotality match | POPULATED | 46,105 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `AdditionalParcelsDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AdditionalParcelsYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AnchorsCoTenants` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Appliances` | exact Cotality match | POPULATED | 202,134 | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ArchitecturalStyle` | exact Cotality match | POPULATED | 248,763 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `AssociationAmenities` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AssociationFee` | exact Cotality match | POPULATED | 243,779 | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `AssociationFee2` | exact Cotality match | POPULATED | 60 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AssociationFee2Frequency` | exact Cotality match | POPULATED | 178 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `AssociationFee3` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AssociationFee3Frequency` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AssociationFeeFrequency` | exact Cotality match | POPULATED | 81,884 | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `AssociationFeeIncludes` | exact Cotality match | POPULATED | 4,552 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AssociationName` | exact Cotality match | POPULATED | 200 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AssociationName2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AssociationName3` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AssociationPhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AssociationPhone2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AssociationPhone3` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AssociationYN` | exact Cotality match | POPULATED | 40,139 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AttachedGarageYN` | exact Cotality match | POPULATED | 21,379 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `AttributionContact` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `AvailabilityDate` | exact Cotality match | POPULATED | 373,040 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✔ |
| IDX Plus | Property | `AvailableLeaseType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BackOnMarketDate` | exact Cotality match | POPULATED | 4,354 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `BackOnMarketTimestamp` | exact Cotality match | POPULATED | 4,353 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Basement` | exact Cotality match | POPULATED | 59,659 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `BasementYN` | exact Cotality match | POPULATED | 65,252 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BathroomsFull` | exact Cotality match | POPULATED | 481,482 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `BathroomsHalf` | exact Cotality match | POPULATED | 409,765 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `BathroomsOneQuarter` | exact Cotality match | POPULATED | 323 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BathroomsPartial` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BathroomsThreeQuarter` | exact Cotality match | POPULATED | 258 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `BathroomsTotalInteger` | exact Cotality match | POPULATED | 587,684 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BedroomsPossible` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BedroomsTotal` | exact Cotality match | POPULATED | 587,737 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `BelowGradeFinishedArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BelowGradeFinishedAreaSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BelowGradeFinishedAreaUnits` | exact Cotality match | POPULATED | 16 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `BelowGradeUnfinishedArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BelowGradeUnfinishedAreaSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BelowGradeUnfinishedAreaUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BodyType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuilderModel` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuilderName` | exact Cotality match | POPULATED | 79 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuildingAreaSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `BuildingAreaTotal` | exact Cotality match | POPULATED | 15,003 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `BuildingAreaUnits` | exact Cotality match | POPULATED | 12,674 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `BuildingFeatures` | exact Cotality match | POPULATED | 65,882 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `BuildingName` | exact Cotality match | POPULATED | 221,140 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ? |
| IDX Plus | Property | `BusinessName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BusinessType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuyerAgentKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuyerAgentMlsId` | exact Cotality match | POPULATED | 100,112 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `BuyerFinancing` | exact Cotality match | POPULATED | 184 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuyerOfficeKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuyerOfficeMlsId` | exact Cotality match | POPULATED | 100,463 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `BuyerTeamKey` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CableTvExpense` | exact Cotality match | POPULATED | 8 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CapRate` | exact Cotality match | POPULATED | 44 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CarportSpaces` | exact Cotality match | POPULATED | 5 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `CarportYN` | exact Cotality match | POPULATED | 144 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CarrierRoute` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `City` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `CityRegion` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `CLIP` | exact Cotality match | POPULATED | 539,492 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CloseDate` | exact Cotality match | POPULATED | 578,417 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ |
| IDX Plus | Property | `ClosePrice` | exact Cotality match | POPULATED | 508,931 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `CoBuyerAgentKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoBuyerAgentMlsId` | exact Cotality match | POPULATED | 3,168 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `CoBuyerOfficeKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoBuyerOfficeMlsId` | exact Cotality match | POPULATED | 3,173 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `CoListAgent2AOR` | exact Cotality match | POPULATED | 50,821 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2DirectPhone` | exact Cotality match | POPULATED | 50,831 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2Email` | exact Cotality match | POPULATED | 50,916 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2FirstName` | exact Cotality match | POPULATED | 50,931 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2FullName` | exact Cotality match | POPULATED | 50,995 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2HomePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2Key` | exact Cotality match | POPULATED | 50,994 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2LastName` | exact Cotality match | POPULATED | 50,931 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2MiddleName` | exact Cotality match | POPULATED | 19,072 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2MlsId` | exact Cotality match | POPULATED | 51,234 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2MobilePhone` | exact Cotality match | POPULATED | 48,785 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2NationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2Nickname` | exact Cotality match | POPULATED | 50,677 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2OfficePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2PreferredPhone` | exact Cotality match | POPULATED | 50,779 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2StateLicense` | exact Cotality match | POPULATED | 50,697 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent2URL` | exact Cotality match | POPULATED | 3,861 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3AOR` | exact Cotality match | POPULATED | 7,868 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3DirectPhone` | exact Cotality match | POPULATED | 7,962 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3Email` | exact Cotality match | POPULATED | 7,987 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3FirstName` | exact Cotality match | POPULATED | 7,957 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3FullName` | exact Cotality match | POPULATED | 7,993 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3HomePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3Key` | exact Cotality match | POPULATED | 7,993 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3LastName` | exact Cotality match | POPULATED | 7,957 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3MiddleName` | exact Cotality match | POPULATED | 3,101 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3MlsId` | exact Cotality match | POPULATED | 7,994 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3MobilePhone` | exact Cotality match | POPULATED | 7,493 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3NationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3Nickname` | exact Cotality match | POPULATED | 7,828 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3OfficePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3PreferredPhone` | exact Cotality match | POPULATED | 7,937 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3StateLicense` | exact Cotality match | POPULATED | 7,880 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgent3URL` | exact Cotality match | POPULATED | 716 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentAOR` | exact Cotality match | POPULATED | 207,368 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentDesignation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentDirectPhone` | exact Cotality match | POPULATED | 206,739 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentEmail` | exact Cotality match | POPULATED | 208,274 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentFax` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentFirstName` | exact Cotality match | POPULATED | 207,355 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentFullName` | exact Cotality match | POPULATED | 208,274 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentKey` | exact Cotality match | POPULATED | 207,401 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentKeyNumeric` | exact Cotality match | POPULATED | 207,401 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentLastName` | exact Cotality match | POPULATED | 207,360 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentMiddleName` | exact Cotality match | POPULATED | 84,950 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentMlsId` | exact Cotality match | POPULATED | 208,023 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ✘ |
| IDX Plus | Property | `CoListAgentNamePrefix` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentNameSuffix` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentNationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentNickname` | exact Cotality match | POPULATED | 206,954 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentOfficePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentOfficePhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentPager` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentPreferredPhone` | exact Cotality match | POPULATED | 206,467 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentPreferredPhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentTollFreePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentVoiceMail` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListAgentVoiceMailExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOffice2AOR` | exact Cotality match | POPULATED | 50,884 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOffice2Email` | exact Cotality match | POPULATED | 6,411 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOffice2Key` | exact Cotality match | POPULATED | 50,994 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOffice2MlsId` | exact Cotality match | POPULATED | 50,994 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOffice2Name` | exact Cotality match | POPULATED | 50,994 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOffice2Phone` | exact Cotality match | POPULATED | 50,927 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOffice2URL` | exact Cotality match | POPULATED | 48,800 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficeAOR` | exact Cotality match | POPULATED | 207,183 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficeEmail` | exact Cotality match | POPULATED | 21,683 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficeFax` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficeKey` | exact Cotality match | POPULATED | 207,401 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficeKeyNumeric` | exact Cotality match | POPULATED | 207,401 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficeMlsId` | exact Cotality match | POPULATED | 207,401 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ✘ |
| IDX Plus | Property | `CoListOfficeName` | exact Cotality match | POPULATED | 207,401 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficePhone` | exact Cotality match | POPULATED | 207,248 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficePhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CoListOfficeURL` | exact Cotality match | POPULATED | 199,749 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CommonInterest` | exact Cotality match | POPULATED | 435,273 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `CommonWalls` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CommunityFeatures` | exact Cotality match | POPULATED | 5,999 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `CompSaleYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ConstructionMaterials` | exact Cotality match | POPULATED | 45 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ContinentRegion` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Contingency` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ContingentDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ContractStatusChangeDate` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Cooling` | exact Cotality match | POPULATED | 205,151 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ? |
| IDX Plus | Property | `CoolingYN` | exact Cotality match | POPULATED | 233,886 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CountrySubdivision` | exact Cotality match | POPULATED | 591,582 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CountyOrParish` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ✔ | ✔ |
| IDX Plus | Property | `CoveredSpaces` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `CrossStreet` | exact Cotality match | POPULATED | 396,743 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `CurrentFinancing` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CurrentPrice` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `CurrentUse` | exact Cotality match | POPULATED | 786 | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DelayedMarketingDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DelayedMarketingYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DevelopmentStatus` | exact Cotality match | POPULATED | 462 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `DirectionFaces` | exact Cotality match | POPULATED | 1,382 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Directions` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Disclaimer` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DocumentsAvailable` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `DocumentsChangeTimestamp` | exact Cotality match | POPULATED | 366,181 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DocumentsCount` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DOH1` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DOH2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DOH3` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `DoorFeatures` | exact Cotality match | POPULATED | 32 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `Electric` | exact Cotality match | POPULATED | 10 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ElectricExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ElectricOnPropertyYN` | exact Cotality match | POPULATED | 118 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ElementarySchool` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ElementarySchoolDistrict` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Elevation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ElevationUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `EntryLevel` | exact Cotality match | POPULATED | 424,420 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `EntryLocation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `EstimatedCloseDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Exclusions` | exact Cotality match | POPULATED | 111,787 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ExistingLeaseType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Exposures` | exact Cotality match | POPULATED | 338,278 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ExteriorFeatures` | exact Cotality match | POPULATED | 238,927 | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `Fencing` | exact Cotality match | POPULATED | 44 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FhaEligibility` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FinancialDataSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FireplaceFeatures` | exact Cotality match | POPULATED | 18,576 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `FireplacesTotal` | exact Cotality match | POPULATED | 29,172 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `FireplaceYN` | exact Cotality match | POPULATED | 96,628 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| IDX Plus | Property | `Flooring` | exact Cotality match | POPULATED | 25,863 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `FoundationArea` | exact Cotality match | POPULATED | 802 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FoundationDetails` | exact Cotality match | POPULATED | 13 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FrontageLength` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FrontageLengthRemarks` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FrontageLengthUnit` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FrontageType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `FuelExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Furnished` | exact Cotality match | POPULATED | 95,091 | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ? |
| IDX Plus | Property | `FurnitureReplacementExpense` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GarageSpaces` | exact Cotality match | POPULATED | 66,660 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ? |
| IDX Plus | Property | `GarageYN` | exact Cotality match | POPULATED | 547,220 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `GardenerExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GreenBuildingVerificationType` | exact Cotality match | POPULATED | 5 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `GreenEnergyEfficient` | exact Cotality match | POPULATED | 416 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `GreenEnergyGeneration` | exact Cotality match | POPULATED | 2 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GreenIndoorAirQuality` | exact Cotality match | POPULATED | 1 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GreenLocation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GreenSustainability` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GreenVerificationYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GreenWaterConservation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GrossIncome` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `GrossScheduledIncome` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `HabitableResidenceYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Heating` | exact Cotality match | POPULATED | 22,920 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ? |
| IDX Plus | Property | `HeatingYN` | exact Cotality match | POPULATED | 38,477 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `HighSchool` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `HighSchoolDistrict` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `HomeWarrantyYN` | exact Cotality match | POPULATED | 6 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `HoursDaysOfOperation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `HoursDaysOfOperationDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `HumanModifiedYN` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Inclusions` | exact Cotality match | POPULATED | 111,868 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `IncomeIncludes` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `InsuranceExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `InteriorFeatures` | exact Cotality match | POPULATED | 144,434 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `InternetAutomatedValuationDisplayYN` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ? | ✔ |
| IDX Plus | Property | `InternetConsumerCommentYN` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ? | ✔ |
| IDX Plus | Property | `LaborInformation` | exact Cotality match | POPULATED | 5 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LandLeaseAmount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LandLeaseAmountFrequency` | exact Cotality match | POPULATED | 1 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LandLeaseExpirationDate` | exact Cotality match | POPULATED | 325 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LandLeaseYN` | exact Cotality match | POPULATED | 70,069 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LaundryFeatures` | exact Cotality match | POPULATED | 393,328 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `LeasableArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LeasableAreaUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LeaseAmount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `LeaseAmountFrequency` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `LeaseAssignableYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LeaseConsideredYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LeaseRenewalOptionYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LeaseTerm` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LeaseTermOptions` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Levels` | exact Cotality match | POPULATED | 5,755 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `License1` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `License2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `License3` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LicensesExpense` | exact Cotality match | POPULATED | 8 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentAOR` | exact Cotality match | POPULATED | 585,917 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentDesignation` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentDirectPhone` | exact Cotality match | POPULATED | 580,228 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✔ |
| IDX Plus | Property | `ListAgentEmail` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✔ |
| IDX Plus | Property | `ListAgentFax` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentFirstName` | exact Cotality match | POPULATED | 585,957 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentFullName` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ~ | ~ | ✘ |
| IDX Plus | Property | `ListAgentKey` | exact Cotality match | POPULATED | 587,315 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentKeyNumeric` | exact Cotality match | POPULATED | 587,315 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentLastName` | exact Cotality match | POPULATED | 585,980 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentMiddleName` | exact Cotality match | POPULATED | 250,636 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentMlsId` | exact Cotality match | POPULATED | 591,197 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ~ | ✔ |
| IDX Plus | Property | `ListAgentNamePrefix` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentNameSuffix` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentNationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentNickname` | exact Cotality match | POPULATED | 585,639 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentOfficePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentOfficePhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentPager` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentPreferredPhone` | exact Cotality match | POPULATED | 578,578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentPreferredPhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentTollFreePhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentURL` | exact Cotality match | POPULATED | 61,122 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentVoiceMail` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAgentVoiceMailExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListAOR` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListingAgreement` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `ListingContractDate` | exact Cotality match | POPULATED | 581,836 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `ListingId` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| IDX Plus | Property | `ListingKeyNumeric` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `ListingService` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListingTerms` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `ListingURL` | exact Cotality match | POPULATED | 582,804 | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListingURLDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficeAOR` | exact Cotality match | POPULATED | 591,537 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficeEmail` | exact Cotality match | POPULATED | 52,567 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficeFax` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficeKey` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficeKeyNumeric` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficeMlsId` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✘ |
| IDX Plus | Property | `ListOfficeName` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| IDX Plus | Property | `ListOfficeNationalAssociationId` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficePhone` | exact Cotality match | POPULATED | 591,538 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficePhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListOfficeURL` | exact Cotality match | POPULATED | 585,251 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListPrice` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `ListPriceLow` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListTeamKey` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ListTeamName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LivingArea` | exact Cotality match | POPULATED | 417,652 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `LivingAreaSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LivingAreaUnits` | exact Cotality match | POPULATED | 446,923 | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `LotDimensionsSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LotFeatures` | exact Cotality match | POPULATED | 1,714 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LotSizeAcres` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LotSizeArea` | exact Cotality match | POPULATED | 60,046 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✔ |
| IDX Plus | Property | `LotSizeDimensions` | exact Cotality match | POPULATED | 237,288 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `LotSizeSource` | exact Cotality match | POPULATED | 341 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LotSizeSquareFeet` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `LotSizeUnits` | exact Cotality match | POPULATED | 35,362 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `MainLevelBathrooms` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `MainLevelBedrooms` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `MaintenanceExpense` | exact Cotality match | POPULATED | 10 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `MajorChangeType` | exact Cotality match | POPULATED | 588,497 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `Make` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ManagerExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `MaximumNumberOfPets` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `MaximumPetWeight` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `MiddleOrJuniorSchool` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `MiddleOrJuniorSchoolDistrict` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ModificationTimestamp` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| IDX Plus | Property | `MoveInCosts` | exact Cotality match | POPULATED | 375 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `NetOperatingIncome` | exact Cotality match | POPULATED | 218 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NewConstructionYN` | exact Cotality match | POPULATED | 576,590 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `NewTaxesExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfBuildings` | exact Cotality match | POPULATED | 74 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfFullTimeEmployees` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfLots` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfPads` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfPartTimeEmployees` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfSeparateElectricMeters` | exact Cotality match | POPULATED | 9 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfSeparateGasMeters` | exact Cotality match | POPULATED | 10 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfSeparateWaterMeters` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `NumberOfUnitsInCommunity` | exact Cotality match | POPULATED | 8 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `NumberOfUnitsLeased` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `NumberOfUnitsMoMo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `NumberOfUnitsTotal` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `NumberOfUnitsVacant` | exact Cotality match | POPULATED | 7,941 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `OffMarketDate` | exact Cotality match | POPULATED | 578,868 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ |
| IDX Plus | Property | `OffMarketTimestamp` | exact Cotality match | POPULATED | 579,587 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OngoingFees` | exact Cotality match | POPULATED | 28 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `OnMarketDate` | exact Cotality match | POPULATED | 119,571 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ~ | ✔ |
| IDX Plus | Property | `OnMarketTimestamp` | exact Cotality match | POPULATED | 265,702 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ |
| IDX Plus | Property | `OpenHouseModificationTimestamp` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OpenParkingSpaces` | exact Cotality match | POPULATED | 16 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ? |
| IDX Plus | Property | `OpenParkingYN` | exact Cotality match | POPULATED | 126 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OperatingExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OperatingExpenseIncludes` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginalEntryTimestamp` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ✔ |
| IDX Plus | Property | `OriginalListPrice` | exact Cotality match | POPULATED | 375,691 | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✔ |
| IDX Plus | Property | `OriginatingSystemBuyerTeamKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemCoListAgent2MemberKey` | exact Cotality match | POPULATED | 50,998 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemCoListAgent3MemberKey` | exact Cotality match | POPULATED | 7,993 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemCoListAgentMemberKey` | exact Cotality match | POPULATED | 207,472 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemCoListOffice2Key` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemCoListOfficeKey` | exact Cotality match | POPULATED | 21,227 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemID` | exact Cotality match | POPULATED | 546,550 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemKey` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemListAgentMemberKey` | exact Cotality match | POPULATED | 587,646 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemListOfficeKey` | exact Cotality match | POPULATED | 589,675 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemListTeamKey` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemModificationTimestamp` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OriginatingSystemSubName` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OtherEquipment` | exact Cotality match | POPULATED | 72,586 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OtherExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OtherParking` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OtherStructures` | exact Cotality match | POPULATED | 1,632 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OwnerPays` | exact Cotality match | POPULATED | 7,915 | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `Ownership` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `OwnershipType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ParcelNumber` | exact Cotality match | POPULATED | 380,705 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ParcelSubcomponent` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ParkingFeatures` | exact Cotality match | POPULATED | 10,376 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ParkingTotal` | exact Cotality match | POPULATED | 237 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ParkManagerName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ParkManagerPhone` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ParkName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PatioAndPorchFeatures` | exact Cotality match | POPULATED | 156,521 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `PendingTimestamp` | exact Cotality match | POPULATED | 143,221 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `Permission` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ‼ | ✔ |
| IDX Plus | Property | `PestControlExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PetDeposit` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PetsAllowed` | exact Cotality match | POPULATED | 586,565 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `PetsAllowedYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `PetsComments` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PhotosChangeTimestamp` | exact Cotality match | POPULATED | 591,597 | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| IDX Plus | Property | `PhotosCount` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PoolExpense` | exact Cotality match | POPULATED | 8 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PoolFeatures` | exact Cotality match | POPULATED | 10,669 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `PoolPrivateYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Possession` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PossibleUse` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PostalCity` | exact Cotality match | POPULATED | 591,064 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ~ | ✔ | ✔ |
| IDX Plus | Property | `PostalCode` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `PostalCodePlus4` | exact Cotality match | POPULATED | 545,701 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PowerProductionType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PowerProductionYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PreviousListPrice` | exact Cotality match | POPULATED | 219,895 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `PriceChangeTimestamp` | exact Cotality match | POPULATED | 361,678 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `ProfessionalManagementExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `PropertyAttachedYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `PropertySubType` | exact Cotality match | POPULATED | 591,591 | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `PropertySubTypeAdditional` | exact Cotality match | POPULATED | 553,713 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PropertyType` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `PublicRemarks` | exact Cotality match | POPULATED | 579,433 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `PublicSurveySection` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PublicSurveyTownship` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `PurchaseContractDate` | exact Cotality match | POPULATED | 179,612 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ |
| IDX Plus | Property | `RecordSignature` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `RentControlYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `RentIncludes` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `RoadFrontageType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `RoadResponsibility` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `RoadSurfaceType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Roof` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `RoomsTotal` | exact Cotality match | POPULATED | 587,737 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `RoomType` | exact Cotality match | POPULATED | 8,296 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SaleOrLeaseIndicator` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SeatingCapacity` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SecurityDeposit` | exact Cotality match | POPULATED | 161,522 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SecurityFeatures` | exact Cotality match | POPULATED | 1,890 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `SeniorCommunityYN` | exact Cotality match | POPULATED | 8 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SerialU` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SerialX` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SerialXX` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Sewer` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `ShowingContactName` | exact Cotality match | POPULATED | 1,130 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ShowingContactPhone` | exact Cotality match | POPULATED | 1,102 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ShowingContactPhoneExt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ShowingContactType` | exact Cotality match | POPULATED | 15 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SignOnPropertyYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Skirt` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SourceSystemID` | exact Cotality match | POPULATED | 591,607 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SpaFeatures` | exact Cotality match | POPULATED | 5,639 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `SpaYN` | exact Cotality match | POPULATED | 2,208 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SpecialLicenses` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SpecialListingConditions` | exact Cotality match | POPULATED | 114,397 | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `StandardStatus` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `StartShowingDate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `StateOrProvince` | exact Cotality match | POPULATED | 591,604 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `StateRegion` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `StatusChangeTimestamp` | exact Cotality match | POPULATED | 591,419 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Stories` | exact Cotality match | POPULATED | 1,612 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `StoriesTotal` | exact Cotality match | POPULATED | 533,803 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `StreetAdditionalInfo` | exact Cotality match | POPULATED | 394,632 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `StreetDirPrefix` | exact Cotality match | POPULATED | 266,957 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ? |
| IDX Plus | Property | `StreetDirSuffix` | exact Cotality match | POPULATED | 13,415 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ~ | ✔ | ? |
| IDX Plus | Property | `StreetName` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `StreetNumber` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `StreetNumberNumeric` | exact Cotality match | POPULATED | 561,696 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `StreetSuffix` | exact Cotality match | POPULATED | 580,305 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ |
| IDX Plus | Property | `StreetSuffixModifier` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `StructureType` | exact Cotality match | POPULATED | 97,624 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `SubdivisionName` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `SuppliesExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `SyndicateTo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `TaxAnnualAmount` | exact Cotality match | POPULATED | 97,625 | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `TaxAssessedValue` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxBlock` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `TaxBookNumber` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxLegalDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxLot` | exact Cotality match | POPULATED | 266,897 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `TaxMapNumber` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxOtherAnnualAssessmentAmount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxParcelLetter` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxStatusCurrent` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxTract` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TaxYear` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| IDX Plus | Property | `TenantPays` | exact Cotality match | POPULATED | 261 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `TenantPaysDescription` | exact Cotality match | POPULATED | 276 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `Topography` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TotalActualRent` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Township` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `TrashExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `UnitNumber` | exact Cotality match | POPULATED | 582,428 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | Property | `UnitsFurnished` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `UnitTypeType` | exact Cotality match | POPULATED | 148 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `UniversalParcelId` | exact Cotality match | POPULATED | 545,161 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `UniversalPropertyId` | exact Cotality match | POPULATED | 380,699 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `UnparsedAddress` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `Utilities` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `UtilitiesExpense` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `VacancyAllowance` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `VacancyAllowanceRate` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `VideosChangeTimestamp` | exact Cotality match | POPULATED | 329,062 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `VideosCount` | exact Cotality match | POPULATED | 485,075 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `View` | exact Cotality match | POPULATED | 138,934 | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `ViewYN` | exact Cotality match | POPULATED | 163,138 | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `VirtualTourURLBranded` | exact Cotality match | POPULATED | 13,879 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `VirtualTourURLBranded2` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `VirtualTourURLBranded3` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `VirtualTourURLUnbranded` | exact Cotality match | POPULATED | 26,372 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `VirtualTourURLUnbranded2` | exact Cotality match | POPULATED | 2,382 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `VirtualTourURLUnbranded3` | exact Cotality match | POPULATED | 354 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | Property | `WalkScore` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `WaterBodyName` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `WaterfrontFeatures` | exact Cotality match | POPULATED | 5 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `WaterfrontYN` | exact Cotality match | POPULATED | 98 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `WaterHeater` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `WaterSewerExpense` | exact Cotality match | POPULATED | 10,392 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `WaterSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `WindowFeatures` | exact Cotality match | POPULATED | 15,977 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `WithdrawnDate` | exact Cotality match | POPULATED | 22 | ✘ | ✔ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | Property | `WoodedArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `WorkmansCompensationExpense` | exact Cotality match | POPULATED | 8 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `YearBuilt` | exact Cotality match | POPULATED | 485,638 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| IDX Plus | Property | `YearBuiltDetails` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `YearBuiltEffective` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `YearBuiltSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | Property | `YearEstablished` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `YearsCurrentOwner` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `Zoning` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | Property | `ZoningDescription` | exact Cotality match | POPULATED | 27,455 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| IDX Plus | PropertyUnitTypes | `HumanModifiedYN` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `InputEntryOrder` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `InternetEntireListingDisplayYN` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| IDX Plus | PropertyUnitTypes | `ListAgentKey` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `ListAOR` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `ListingId` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| IDX Plus | PropertyUnitTypes | `ListingKey` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✘ | ✔ | ✘ |
| IDX Plus | PropertyUnitTypes | `ListingKeyNumeric` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ~ | ✘ |
| IDX Plus | PropertyUnitTypes | `ListingPermission` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `ListOfficeKey` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `ListOfficeMlsId` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✘ |
| IDX Plus | PropertyUnitTypes | `OffMarketDate` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ |
| IDX Plus | PropertyUnitTypes | `OriginatingSystemListingKey` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `OriginatingSystemSubName` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `PropertySubType` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| IDX Plus | PropertyUnitTypes | `PropertySubTypeAdditional` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `PropertyType` | exact Cotality match | POPULATED | 1 | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ |
| IDX Plus | PropertyUnitTypes | `RecordSignature` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `SourceSystemID` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `StandardStatus` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| IDX Plus | PropertyUnitTypes | `SyndicateTo` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| IDX Plus | PropertyUnitTypes | `UnitTypeActualRent` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeActualRentRange` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeArea` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeAreaSource` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeAreaUnits` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeBathsTotal` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeBedsTotal` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeDeposit` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeFireplaceYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeFurnished` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeGarageAttachedYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeGarageSpaces` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeKeyNumeric` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeLeasedYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeMonthToMonthYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeNumFullBaths` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeNumHalfBaths` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeOccupantType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypePetDeposit` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypePetDepositPerPetYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeProForma` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeTotalRent` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeType` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeUnitNum` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| IDX Plus | PropertyUnitTypes | `UnitTypeUnitsTotal` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `AccessCode` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuildingKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuildingKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| live-discovered | Property | `BuyerAgentAOR` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentDesignation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentDirectPhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `BuyerAgentEmail` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `BuyerAgentFax` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentFirstName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentFullName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `BuyerAgentHomePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentLastName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentMiddleName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentMobilePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentNamePrefix` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentNameSuffix` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentNationalAssociationId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentOfficePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentOfficePhoneExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentPager` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentPreferredPhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentPreferredPhoneExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentStateLicense` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `BuyerAgentTollFreePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentVoiceMail` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerAgentVoiceMailExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerBrokerageCompensation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerBrokerageCompensationType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerOfficeAOR` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerOfficeEmail` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerOfficeFax` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerOfficeKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerOfficeName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `BuyerOfficeNationalAssociationId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerOfficePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `BuyerOfficePhoneExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerOfficeURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerTeamKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `BuyerTeamName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CancellationDate` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CoBuyerAgentAOR` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentDesignation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentDirectPhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CoBuyerAgentEmail` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CoBuyerAgentFax` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentFirstName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentFullName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CoBuyerAgentHomePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentLastName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentMiddleName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentMobilePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentNamePrefix` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentNameSuffix` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentNationalAssociationId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentOfficePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentOfficePhoneExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentPager` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentPreferredPhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentPreferredPhoneExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentStateLicense` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CoBuyerAgentTollFreePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentVoiceMail` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerAgentVoiceMailExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerOfficeAOR` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerOfficeEmail` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerOfficeFax` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerOfficeKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerOfficeName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CoBuyerOfficeNationalAssociationId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerOfficePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CoBuyerOfficePhoneExt` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoBuyerOfficeURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoListAgentHomePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoListAgentMobilePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoListAgentStateLicense` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoListAgentURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CoListOfficeNationalAssociationId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CompensationComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ConcessionInPrice` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ConcessionInPriceType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `Concessions` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `ConcessionsAmount` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `ConcessionsBuyerBrokerFee` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ConcessionsClosingCosts` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ConcessionsComments` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `ConcessionsFinancingCosts` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ConcessionsOtherCosts` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ConcessionsPropertyImprovementCosts` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CopyrightNotice` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `Country` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `CountryRegion` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CropsIncludedYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CultivatedArea` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `CumulativeDaysOnMarket` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✘ |
| live-discovered | Property | `DaysOnMarket` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ~ | ✘ |
| live-discovered | Property | `DaysOnMarketReplication` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DaysOnMarketReplicationDate` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DaysOnMarketReplicationIncreasingYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `Disclosures` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToBusComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToBusNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToBusUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToElectricComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToElectricNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToElectricUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToFreewayComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToFreewayNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToFreewayUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToGasComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToGasNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToGasUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToPhoneServiceComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToPhoneServiceNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToPhoneServiceUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToPlaceofWorshipComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToPlaceofWorshipNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToPlaceofWorshipUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSchoolBusComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSchoolBusNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSchoolBusUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSchoolsComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSchoolsNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSchoolsUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSewerComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSewerNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToSewerUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToShoppingComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToShoppingNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToShoppingUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToStreetComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToStreetNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToStreetUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToWaterComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToWaterNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DistanceToWaterUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DualOrVariableRateCommissionYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ExpirationDate` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ |
| live-discovered | Property | `FarmCreditServiceInclYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `FarmLandAreaSource` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `FarmLandAreaUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `GrazingPermitsBlmYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `GrazingPermitsForestServiceYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `GrazingPermitsPrivateYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `HeadBrokerMemberKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `HeadBrokerMemberMlsId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `HorseAmenities` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `HorseYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `InternetAddressDisplayYN` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| live-discovered | Property | `InternetEntireListingDisplayYN` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| live-discovered | Property | `IrrigationSource` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `IrrigationWaterRightsAcres` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `IrrigationWaterRightsYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `Latitude` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✘ |
| live-discovered | Property | `LeaseExpiration` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `LeaseRenewalCompensation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ListAgentHomePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ListAgentMobilePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ListAgentStateLicense` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ListingKey` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| live-discovered | Property | `ListTeamKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `LockBoxLocation` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `LockBoxSerialNumber` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `LockBoxType` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `Longitude` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✘ |
| live-discovered | Property | `MajorChangeTimestamp` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MapCoordinate` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MapCoordinateSource` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MapURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MLSAreaMajor` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MLSAreaMinor` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MlsStatus` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| live-discovered | Property | `MobileDimUnits` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MobileHomeRemainsYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MobileLength` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MobileWidth` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `Model` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OccupantName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OccupantPhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OccupantType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OriginatingSystemBuyerAgentMemberKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OriginatingSystemBuyerOfficeKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OriginatingSystemCoBuyerAgentMemberKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OriginatingSystemCoBuyerOfficeKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OriginatingSystemName` | exact Cotality match | POPULATED | 591,607 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OwnerName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OwnerName2` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `OwnerPhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `PastureArea` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `PreviousStandardStatus` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `PrivateOfficeRemarks` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `PrivateRemarks` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `PropertyCondition` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ |
| live-discovered | Property | `PublicSurveyRange` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `RangeArea` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `RVParkingDimensions` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `SellerConsiderConcessionYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ShowingAdvanceNotice` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ShowingAttendedYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ShowingConsiderations` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ShowingDays` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ShowingEndTime` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `ShowingInstructions` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `ShowingRequirements` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ShowingServiceName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `ShowingStartTime` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `SourceSystemKey` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| live-discovered | Property | `SourceSystemName` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `SubAgencyCompensation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `SubAgencyCompensationType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Property | `SyndicationRemarks` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ? |
| live-discovered | Property | `TransactionBrokerCompensation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `TransactionBrokerCompensationType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `UniversalPropertySubId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `Vegetation` | exact Cotality match | SUPPRESSED | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `X_GeocodeSource` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `AdditionalInfo1` | exact Cotality match | POPULATED | 29 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `AdditionalInfo2` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `AdditionalInfo3` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `ApplicationFee` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `CommunityDevelopmentDistrictYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `ConsumerRemarks` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `GulfAccessType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `GulfAccessYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `LakeChainName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `LakeId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `LakeName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `LakeSize` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `LandTenure` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `ListingKey` | exact Cotality match | POPULATED | 591,649 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✘ | ✔ | ✘ |
| live-discovered | CustomProperty | `Membership` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `MembershipDescription` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `MembershipFee` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `MembershipRequiredYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `MineralRights` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `ModificationTimestamp` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✘ |
| live-discovered | CustomProperty | `OffMarketDate` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✔ |
| live-discovered | CustomProperty | `OffSeasonRate` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `OriginatingSystemName` | exact Cotality match | POPULATED | 591,649 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `Permission` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| live-discovered | CustomProperty | `PrivateShowingInstructions` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `PropertySubType` | exact Cotality match | POPULATED | 591,633 | ✘ | ✔ | ✔ | ✔ | ✘ | ✔ | ✔ | ✔ | ~ | ✔ | ✔ | ✔ |
| live-discovered | CustomProperty | `PropertySubTypeAdditional` | exact Cotality match | POPULATED | 553,713 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `RentSpreeURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `RentSpreeYN` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `RiverName` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `SeasonRate` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `SourceSupplementPublicCount` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `SourceSystemKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| live-discovered | CustomProperty | `TaxYearRange` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `UnitLocation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `JobTitle` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `LastLoginTimestamp` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberAssociationComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberBillingPreference` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberHomePhone` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberKey` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberLoginId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberMlsSecurityClass` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberPager` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberStateLicense` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberStateLicenseState` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberStateLicenseType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `ModificationTimestamp` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✘ |
| live-discovered | Member | `OriginatingSystemName` | exact Cotality match | POPULATED | 11,191 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `Permission` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| live-discovered | Member | `SocialMediaType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `SourceSystemID` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `SyndicateTo` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Office | `FranchiseAffiliation` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `ModificationTimestamp` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✘ |
| live-discovered | Office | `OfficeAssociationComments` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `OfficeCorporateLicense` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `OfficeKey` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `OfficeManagerKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `OfficeManagerKeyNumeric` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `OfficeManagerMlsId` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `OriginatingSystemName` | exact Cotality match | POPULATED | 578 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `Permission` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| live-discovered | Office | `SocialMediaType` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `SyndicateAgentOption` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `SyndicateTo` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ |
| live-discovered | Media | `MediaAlteration` | exact Cotality match | SUPPRESSED-UNMEASURED | n/a | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Media | `MediaKey` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ~ | ~ | ~ | ✘ |
| live-discovered | Media | `MediaStatusDescription` | exact Cotality match | SUPPRESSED-UNMEASURED | n/a | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Media | `ModificationTimestamp` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✘ |
| live-discovered | Media | `OriginatingSystemName` | exact Cotality match | POPULATED | 2,000,898 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Media | `OriginatingSystemResourceRecordId` | exact Cotality match | SUPPRESSED-UNMEASURED | n/a | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Media | `Permission` | exact Cotality match | SUPPRESSED-UNMEASURED | n/a | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| live-discovered | Media | `SourceSystemResourceRecordKey` | exact Cotality match | SUPPRESSED-UNMEASURED | n/a | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Media | `X_MediaStream` | exact Cotality match | SUPPRESSED-UNMEASURED | n/a | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | PropertyUnitTypes | `ModificationTimestamp` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✘ |
| live-discovered | PropertyUnitTypes | `OriginatingSystemName` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | PropertyUnitTypes | `Permission` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| live-discovered | PropertyUnitTypes | `UnitTypeDescription` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | PropertyUnitTypes | `UnitTypeKey` | exact Cotality match | POPULATED | 1 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | PropertyUnitTypes | `UnitTypeLeaseExpires` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | OpenHouse | `LivestreamOpenHouseURL` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | OpenHouse | `ModificationTimestamp` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ✔ | ~ | ✘ |
| live-discovered | OpenHouse | `OpenHouseKey` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| live-discovered | OpenHouse | `OpenHouseRemarks` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| live-discovered | OpenHouse | `OriginatingSystemName` | exact Cotality match | POPULATED | 1,483 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | OpenHouse | `Permission` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✔ | ✔ | ✘ | ✘ | ✔ | ✔ | ~ | ~ | ✔ | ✔ |
| live-discovered | OpenHouse | `SourceSystemKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ | ✔ | ✔ |
| live-discovered | OpenHouse | `SourceSystemListingKey` | exact Cotality match | SUPPRESSED | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DownPaymentAssistanceAmount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DownPaymentAssistanceCount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `DownPaymentAssistanceYN` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `FloorPlansChangeTimestamp` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `FloorPlansCount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `MoveInCostsAmount` | exact Cotality match | POPULATED | 108 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| live-discovered | Property | `MoveInCostsComments` | exact Cotality match | POPULATED | 381 | ✔ | ✔ | ✘ | ✘ | ✘ | ✔ | ✘ | ✘ | ✘ | ✘ | ~ | ✘ |
| live-discovered | Property | `SourceMlsUrl` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Property | `TotalFloorPlansCount` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | CustomProperty | `SourceFloorPlansCount` | exact Cotality match | POPULATED | 11,316 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Member | `MemberUrl` | exact Cotality match | POPULATED | 773 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Office | `OfficeUrl` | exact Cotality match | POPULATED | 383 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| live-discovered | Media | `OriginalMediaUrl` | exact Cotality match | NOT-ON-FEED (not RLS-defined) | 0 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |

## L. Declared policy tables (not provider truth)

Primary semantics: **Tours & video** [media] `^(VirtualTourURL|VideosCount|VideosChangeTimestamp)`; **Media counts & timestamps** [media] `^(PhotosCount|PhotosChangeTimestamp|FloorPlansCount|TotalFlo…`; **Permissions & visibility** [permissions] `^(Permission|Internet.*DisplayYN|InternetConsumerCommentYN|S…`; **Showing, access & private contacts** [reference] `^(Showing|LockBox|Occupant|StartShowingDate|AccessCode|Owner…`; **Security & doorman** [searchable] `^(SecurityFeatures)$`; **Laundry** [searchable] `^Laundry`; **Parking** [searchable] `^(Parking|Garage|Carport|OpenParking|OtherParking|RVParking|…`; **Pools & spa** [searchable] `^(Pool|Spa)`; **Accessibility** [searchable] `^Accessibility`; **Pets** [searchable] `^(Pets|PetDeposit|MaximumNumberOfPets|MaximumPetWeight)`; **Transportation & schools** [searchable] `^(DistanceTo|WalkScore|ElementarySchool|MiddleOrJuniorSchool…`; **Compensation & concessions** [reference] `^(BuyerBrokerageCompensation|SubAgencyCompensation|Transacti…`; **Farm, agricultural & manufactured-home** [reference] `^(BodyType|Make$|Model$|SerialU$|SerialX$|SerialXX$|Skirt$|P…`; **Geography & map** [searchable] `^(Street|UnitNumber$|UnparsedAddress|City|CityRegion|Subdivi…`; **Amenities & building features** [searchable] `^(BuildingFeatures|CommunityFeatures|AssociationAmenities|Ex…`; **Rental terms & fees** [rental] `^(Lease|AvailabilityDate|AvailableLeaseType|ExistingLeaseTyp…`; **Financial & carrying costs** [display] `^(Association|Tax|SpecialListingConditions|DownPaymentAssist…`; **Lifecycle, status & dates** [lifecycle] `^(StandardStatus|MlsStatus|PreviousStandardStatus|StatusChan…`; **Identity & sync keys** [identity] `^(ListingKey|ListingKeyNumeric|ListingId|SourceSystem|Origin…`; **Pricing** [pricing] `^(ListPrice|OriginalListPrice|PreviousListPrice|PriceChangeT…`; **Classification & building facts** [searchable] `^(PropertyType|PropertySubType|CommonInterest|OwnershipType|…`; **Size & rooms** [searchable] `^(Bedrooms|Bathrooms|LivingArea|RoomsTotal|RoomType|AboveGra…`; **Remarks & disclosures** [text] `^(PublicRemarks|PrivateRemarks|PrivateOfficeRemarks|Disclaim…`; **Agent & office attribution** [attribution] `^(ListAgent|CoListAgent|BuyerAgent|CoBuyerAgent|ListOffice|C…`

Required consumers per category: **reference**: rawSelection, mapper, persistence, directTest; **identity**: rawSelection, mapper, persistence, directTest; **searchable**: rawSelection, mapper, persistence, saleSearch, rentalSearch, resultDto, resultCard, publicConsumer, directTest; **display**: rawSelection, mapper, persistence, resultDto, publicConsumer, saleForm, directTest; **rental**: rawSelection, mapper, persistence, rentalSearch, resultDto, publicConsumer, rentalForm, rentalTools, complianceRule, directTest; **attribution**: rawSelection, mapper, persistence, resultDto, publicConsumer, complianceRule, cma, reports, directTest; **permissions**: rawSelection, mapper, persistence, complianceRule, publicConsumer, portalSharing, publicBehavior, memberBehavior, privateSharingBehavior, directTest; **lifecycle**: rawSelection, mapper, persistence, saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, reports, complianceRule, directTest; **pricing**: rawSelection, mapper, persistence, saleSearch, rentalSearch, resultDto, savedSearch, alerts, cma, reports, saleTools, directTest; **media**: rawSelection, mapper, persistence, searchPath, resultDto, resultCard, publicConsumer, listingWorkspace, saleTools, rentalTools, directTest; **text**: rawSelection, mapper, persistence, resultDto, publicConsumer, complianceRule, directTest

Tool scopes: `^lib\/(finance|commission|commission-tracker|seller-report|pitch-packe` → sale; `^app\/components\/(AffordabilityCalculator|MortgageModal|InvestorCalcu` → sale; `^lib\/(rental-signals)\/` → rental; `^app\/components\/(RentVsBuyCalculator|RentVsBuyStandalone|CommuteCalc` → both; `^lib\/(open-houses|showing-scheduler|document-vault|email|syndication|` → both; `^public\/crm\/js\/(output|campaigns)\/` → both; `^public\/crm\/js\/listing\/toolbar-functions\.js$|^public\/crm\/js\/ma` → both; `^app\/api\/crm\/(cma|reports|documents|open-houses|showings|campaigns|` → both

Served-domain hints: `^(StandardStatus|MlsStatus|PreviousStandardStatus|…` → DOM, Permissions & visibility, Sale Search, Rental Search, Saved Search, Alerts, CMA, Reports; `^Permission$|^Internet.*DisplayYN$|^InternetConsum…` → Public display, Portal & private sharing, Marketing, Compliance, Sale Search, Rental Search; `^(BuildingFeatures|ExteriorFeatures|InteriorFeatur…` → Sale Search, Rental Search, Building search, Public display, Reports, CMA, Sale Form, Rental Form; `^(ListAgent|ListOffice|CoListAgent|CoListOffice|Bu…` → Agent search, Brokerage identity, Compliance, Reports, Public display, CMA; `^(VirtualTourURL|VideosCount|PhotosCount|PhotosCha…` → Media, Sale Search, Rental Search, Search results, Listing workspace, Marketing, Sale Tools, Rental Tools; `^(ListPrice|OriginalListPrice|PreviousListPrice|Cl…` → Sale Search, Rental Search, Saved Search, Alerts, CMA, Reports, Sale Tools, Rental Tools; `^(CityRegion|SubdivisionName|PostalCode|City|Count…` → Sale Search, Rental Search, Saved Search, Reports, CMA, Public display, Map; `^(PropertyType|PropertySubType|CommonInterest|Stru…` → Sale Search, Rental Search, Saved Search, Alerts, CMA, Reports, Public display; `^(Lease|AvailabilityDate|SecurityDeposit|MoveInCos…` → Rental Search, Rental Form, Rental Tools, Compliance; `^PublicRemarks$…` → Sale Search, Rental Search, Public display, Compliance, Marketing; `^(ListingKey|ListingId|ModificationTimestamp|Photo…` → Sync, Media

Provider documentation read for this model: [Getting Started](https://trestle-documentation.corelogic.com/web-api/) — OAuth2 client credentials, tokens up to 8 hours; $top max 1,000; @odata.nextLink paging; ListingKey is the unique Property identifier, Media.ResourceRecordKey relates to Property.ListingKey; quotas per product/feed-type pair with a separate media-URL quota. · [WebAPI Reference](https://trestle-documentation.corelogic.com/web-api/reference/) — $filter eq/ne/gt/ge/lt/le/and/or/not/has/in; key-field-only queries up to 300,000 rows; $expand with nested $select/$filter/$orderby/$top; $apply=groupby() returns unique values (max 10,000); Replication=true for >1,000,000 rows; multi-select checked with `has 'A,B'`. · [Growing to Scale](https://trestle-documentation.corelogic.com/web-api/at-scale/) — ModificationTimestamp is when the record last changed in Trestle; PhotosChangeTimestamp lives on Property and describes the media; removals are found only by key reconciliation; recommended $expand=Rooms,Units,OpenHouse,CustomProperty,Media. · [Property resource](https://trestle-documentation.corelogic.com/metadata/resources/Property/) — InKeyIndex: ListingId, ListingKey, ModificationTimestamp, PhotosChangeTimestamp, PhotosCount, PostalCode, StandardStatus. ListingId is the human identifier and is not guaranteed unique across MLSs; ListingKey is. · [Media resource](https://trestle-documentation.corelogic.com/metadata/resources/Media/) — ResourceRecordKey = primary key of the related record in ResourceName (Property, Member, Office, …); MediaCategory covers Photo, Document, Video, UnbrandedVirtualTour, BrandedVirtualTour, FloorPlan, OfficeLogo…; Permission enum on Media; Order 1 = primary photo. · [Member / Office resources](https://trestle-documentation.corelogic.com/metadata/resources/Member/) — MemberKey/OfficeKey are system-unique keys; MemberMlsId/OfficeMlsId are the local ids; OfficeBrokerKey/OfficeManagerKey are foreign keys to Member; BuyerAgentKey/ListAgentKey on Property are foreign keys to Member. · [Enumerations P-S / M-O](https://trestle-documentation.corelogic.com/metadata/enumerations/P-S/) — StandardStatus has 11 members; Permission members incl. IDX, VOW, Private, Public, OfficeOnly, FirmOnly, AgentOnly, OfficeInactive, OfficeIDXOptOUT, PhotoOptedOut, History; MediaCategory incl. Video, UnbrandedVirtualTour, BrandedVirtualTour. · [REBNY RLS FAQ / technical solutions](https://www.rebny.com/rls-faqs/) — Feeds: IDX, VOW, Broker Exclusive, Back Office, CMA, Analytics; Trestle aggregates and normalizes RLS data; IDXEntireListingDisplayYN=No → VOW only; owner opt-out via UCBA Exhibit B; Broker A may opt the firm out of IDX. · [DataSystem (live)](https://api.cotality.com/trestle/odata/DataSystem) — ID Trestle-11371-20 "IDX Plus feed for Mallan Real Estate Inc", TransportVersion 1.0.0, DataDictionaryVersion 2.0 (read live 2026-09-08). · [IDX Plus workbook](data/rebny-idx-plus-3.15.26.xlsx (REBNY, 2026-03-15)) — One sheet, 902 rows: Date Feed · Resource · Standard Name · Standard Type. Mirrored (plus 321 live-discovered fields) in data/rebny-rls-property-fields.csv. Discovery aid only — never an authority.

