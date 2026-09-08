# Navigation capability matrix — provider access paths, measured live (2026-09-08)

Representative rows per status (keyset ends, plus most recent CloseDate for Closed). Columns are recorded separately: **declared** (in $metadata), **HTTP** of the `$expand` request, **collection key present** in the row, **populated** rows (≥1 record) vs **empty** (HTTP 200 + `[]`), records, **key linkage** (payload key ↔ Property scalar, counted only where the scalar is non-null), and **direct entity-set access** by the linked key. HTTP 200 + empty is not "unavailable"; a null Property scalar is not "no related record".

## A. Navigation × status

| Navigation → target | Status | Sampled | HTTP | Collection key present | Populated / empty | Records (max per row) | Key linkage (match / mismatch / scalar null) | Populated by Permission |
|---|---|---|---|---|---|---|---|---|
| `Building` → Building | Active | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `Building` → Building | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `Building` → Building | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `Building` → Building | Closed | 60 | 200 | 60 | 0 / 60 | 0 (0) | — | IDX: 0/57; IDX,OfficeInactive: 0/3 |
| `BuyerAgent` → Member | Active | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `BuyerAgent` → Member | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `BuyerAgent` → Member | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `BuyerAgent` → Member | Closed | 60 | 200 | 60 | 36 / 24 | 36 (1) | MemberKey↔BuyerAgentKey: 0/0/36; MemberMlsId↔BuyerAgentMlsId: 36/0/0 | IDX: 35/57; IDX,OfficeInactive: 1/3 |
| `BuyerOffice` → Office | Active | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `BuyerOffice` → Office | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `BuyerOffice` → Office | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `BuyerOffice` → Office | Closed | 60 | 200 | 60 | 37 / 23 | 37 (1) | OfficeKey↔BuyerOfficeKey: 0/0/37; OfficeMlsId↔BuyerOfficeMlsId: 37/0/0 | IDX: 37/57; IDX,OfficeInactive: 0/3 |
| `CoBuyerAgent` → Member | Active | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `CoBuyerAgent` → Member | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `CoBuyerAgent` → Member | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `CoBuyerAgent` → Member | Closed | 60 | 200 | 60 | 0 / 60 | 0 (0) | — | IDX: 0/57; IDX,OfficeInactive: 0/3 |
| `CoBuyerOffice` → Office | Active | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `CoBuyerOffice` → Office | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `CoBuyerOffice` → Office | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `CoBuyerOffice` → Office | Closed | 60 | 200 | 60 | 0 / 60 | 0 (0) | — | IDX: 0/57; IDX,OfficeInactive: 0/3 |
| `CoListAgent` → Member | Active | 40 | 200 | 40 | 24 / 16 | 24 (1) | MemberKey↔CoListAgentKey: 24/0/0; MemberMlsId↔CoListAgentMlsId: 24/0/0; MemberKey↔CoListAgent2Key: 0/8/16; MemberKey↔CoListAgent3Key: 0/2/22 | IDX: 24/40 |
| `CoListAgent` → Member | Pending | 40 | 200 | 40 | 27 / 13 | 27 (1) | MemberKey↔CoListAgentKey: 27/0/0; MemberMlsId↔CoListAgentMlsId: 27/0/0; MemberKey↔CoListAgent2Key: 0/11/16; MemberKey↔CoListAgent3Key: 0/2/25 | IDX: 27/40 |
| `CoListAgent` → Member | ComingSoon | 5 | 200 | 5 | 3 / 2 | 3 (1) | MemberKey↔CoListAgentKey: 3/0/0; MemberMlsId↔CoListAgentMlsId: 3/0/0; MemberKey↔CoListAgent2Key: 0/2/1; MemberKey↔CoListAgent3Key: 0/2/1 | IDX: 3/5 |
| `CoListAgent` → Member | Closed | 60 | 200 | 60 | 27 / 33 | 27 (1) | MemberKey↔CoListAgentKey: 27/0/0; MemberMlsId↔CoListAgentMlsId: 27/0/0; MemberKey↔CoListAgent2Key: 0/5/22; MemberKey↔CoListAgent3Key: 0/3/24 | IDX: 27/57; IDX,OfficeInactive: 0/3 |
| `CoListOffice` → Office | Active | 40 | 200 | 40 | 25 / 15 | 25 (1) | OfficeKey↔CoListOfficeKey: 25/0/0; OfficeMlsId↔CoListOfficeMlsId: 25/0/0; OfficeKey↔CoListOffice2Key: 9/0/16 | IDX: 25/40 |
| `CoListOffice` → Office | Pending | 40 | 200 | 40 | 27 / 13 | 27 (1) | OfficeKey↔CoListOfficeKey: 27/0/0; OfficeMlsId↔CoListOfficeMlsId: 27/0/0; OfficeKey↔CoListOffice2Key: 11/0/16 | IDX: 27/40 |
| `CoListOffice` → Office | ComingSoon | 5 | 200 | 5 | 3 / 2 | 3 (1) | OfficeKey↔CoListOfficeKey: 3/0/0; OfficeMlsId↔CoListOfficeMlsId: 3/0/0; OfficeKey↔CoListOffice2Key: 2/0/1 | IDX: 3/5 |
| `CoListOffice` → Office | Closed | 60 | 200 | 60 | 28 / 32 | 28 (1) | OfficeKey↔CoListOfficeKey: 28/0/0; OfficeMlsId↔CoListOfficeMlsId: 28/0/0; OfficeKey↔CoListOffice2Key: 5/0/23 | IDX: 28/57; IDX,OfficeInactive: 0/3 |
| `CustomProperty` → CustomProperty | Active | 40 | 200 | 40 | 40 / 0 | 40 (1) | ListingKey↔ListingKey: 40/0/0 | IDX: 40/40 |
| `CustomProperty` → CustomProperty | Pending | 40 | 200 | 40 | 40 / 0 | 40 (1) | ListingKey↔ListingKey: 40/0/0 | IDX: 40/40 |
| `CustomProperty` → CustomProperty | ComingSoon | 5 | 200 | 5 | 5 / 0 | 5 (1) | ListingKey↔ListingKey: 5/0/0 | IDX: 5/5 |
| `CustomProperty` → CustomProperty | Closed | 60 | 200 | 60 | 60 / 0 | 60 (1) | ListingKey↔ListingKey: 60/0/0 | IDX: 57/57; IDX,OfficeInactive: 3/3 |
| `ListAgent` → Member | Active | 40 | 200 | 40 | 39 / 1 | 39 (1) | MemberKey↔ListAgentKey: 39/0/0; MemberMlsId↔ListAgentMlsId: 39/0/0 | IDX: 39/40 |
| `ListAgent` → Member | Pending | 40 | 200 | 40 | 40 / 0 | 40 (1) | MemberKey↔ListAgentKey: 40/0/0; MemberMlsId↔ListAgentMlsId: 40/0/0 | IDX: 40/40 |
| `ListAgent` → Member | ComingSoon | 5 | 200 | 5 | 5 / 0 | 5 (1) | MemberKey↔ListAgentKey: 5/0/0; MemberMlsId↔ListAgentMlsId: 5/0/0 | IDX: 5/5 |
| `ListAgent` → Member | Closed | 60 | 200 | 60 | 57 / 3 | 57 (1) | MemberKey↔ListAgentKey: 57/0/0; MemberMlsId↔ListAgentMlsId: 57/0/0 | IDX: 54/57; IDX,OfficeInactive: 3/3 |
| `ListOffice` → Office | Active | 40 | 200 | 40 | 40 / 0 | 40 (1) | OfficeKey↔ListOfficeKey: 40/0/0; OfficeMlsId↔ListOfficeMlsId: 40/0/0 | IDX: 40/40 |
| `ListOffice` → Office | Pending | 40 | 200 | 40 | 40 / 0 | 40 (1) | OfficeKey↔ListOfficeKey: 40/0/0; OfficeMlsId↔ListOfficeMlsId: 40/0/0 | IDX: 40/40 |
| `ListOffice` → Office | ComingSoon | 5 | 200 | 5 | 5 / 0 | 5 (1) | OfficeKey↔ListOfficeKey: 5/0/0; OfficeMlsId↔ListOfficeMlsId: 5/0/0 | IDX: 5/5 |
| `ListOffice` → Office | Closed | 60 | 200 | 60 | 57 / 3 | 57 (1) | OfficeKey↔ListOfficeKey: 57/0/0; OfficeMlsId↔ListOfficeMlsId: 57/0/0 | IDX: 57/57; IDX,OfficeInactive: 0/3 |
| `Media` → Media | Active | 40 | 200 | 40 | 40 / 0 | 847 (79) | ResourceRecordKey↔ListingKey: 40/0/0 | IDX: 40/40 |
| `Media` → Media | Pending | 40 | 200 | 40 | 39 / 1 | 508 (30) | ResourceRecordKey↔ListingKey: 39/0/0 | IDX: 39/40 |
| `Media` → Media | ComingSoon | 5 | 200 | 5 | 5 / 0 | 96 (23) | ResourceRecordKey↔ListingKey: 5/0/0 | IDX: 5/5 |
| `Media` → Media | Closed | 60 | 200 | 60 | 50 / 10 | 133 (28) | ResourceRecordKey↔ListingKey: 50/0/0 | IDX: 49/57; IDX,OfficeInactive: 1/3 |
| `OpenHouse` → OpenHouse | Active | 40 | 200 | 40 | 7 / 33 | 13 (4) | ListingKey↔ListingKey: 7/0/0 | IDX: 7/40 |
| `OpenHouse` → OpenHouse | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `OpenHouse` → OpenHouse | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `OpenHouse` → OpenHouse | Closed | 60 | 200 | 60 | 0 / 60 | 0 (0) | — | IDX: 0/57; IDX,OfficeInactive: 0/3 |
| `Rooms` → PropertyRooms | Active | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `Rooms` → PropertyRooms | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `Rooms` → PropertyRooms | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `Rooms` → PropertyRooms | Closed | 60 | 200 | 60 | 0 / 60 | 0 (0) | — | IDX: 0/57; IDX,OfficeInactive: 0/3 |
| `UnitTypes` → PropertyUnitTypes | Active | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `UnitTypes` → PropertyUnitTypes | Pending | 40 | 200 | 40 | 0 / 40 | 0 (0) | — | IDX: 0/40 |
| `UnitTypes` → PropertyUnitTypes | ComingSoon | 5 | 200 | 5 | 0 / 5 | 0 (0) | — | IDX: 0/5 |
| `UnitTypes` → PropertyUnitTypes | Closed | 60 | 200 | 60 | 0 / 60 | 0 (0) | — | IDX: 0/57; IDX,OfficeInactive: 0/3 |

## B. Target entity sets — direct access (entitlement of the resource itself)

| Target | Direct `$top=1` | Rows | Message |
|---|---|---|---|
| Building | HTTP 403 | — | {"error":{"code":"Forbidden[403]. TraceId: 8c4c6cd0-4a0d-45f5-87ad-684cfc18cb71","message":"Resource Cotality.DataStandard.RESO.DD.Building not available"}} |
| Member | HTTP 200 | 1 | — |
| Office | HTTP 200 | 1 | — |
| CustomProperty | HTTP 200 | 1 | — |
| Media | HTTP 200 | 1 | — |
| OpenHouse | HTTP 200 | 1 | — |
| PropertyRooms | HTTP 200 | 1 | — |
| PropertyUnitTypes | HTTP 200 | 1 | — |

## C. Direct access by the linked key (the path a consumer would take without $expand)

| Target | Via | Filter | HTTP | Count |
|---|---|---|---|---|
| Member | BuyerAgent payload MemberKey | `MemberKey eq '25281901'` | 200 | 1 |
| Member | BuyerAgent payload MemberMlsId | `MemberMlsId eq '64104'` | 200 | 1 |
| Office | BuyerOffice payload OfficeKey | `OfficeKey eq '5663376'` | 200 | 1 |
| Office | BuyerOffice payload OfficeMlsId | `OfficeMlsId eq '7371'` | 200 | 1 |
| CustomProperty | CustomProperty payload ListingKey | `ListingKey eq '1190078353'` | 200 | 1 |
| Media | Media payload ResourceRecordKey | `ResourceRecordKey eq '1190078353'` | 200 | 12 |
| OpenHouse | OpenHouse payload ListingKey | `ListingKey eq '1190073995'` | 200 | 2 |

## D. Navigation empty although the Property scalar names a record — direct lookup

| Navigation | Status | ListingKey | Permission | Scalar | Direct query | HTTP | Count | Sample |
|---|---|---|---|---|---|---|---|---|
| ListAgent | Active | 1091335133 | IDX | ListAgentKey=29750655 | `Member?$filter=MemberKey eq '29750655'` | 200 | 0 | — |
| ListAgent | Active | 1091335133 | IDX | ListAgentMlsId=TM229 | `Member?$filter=MemberMlsId eq 'TM229'` | 200 | 0 | — |
| ListAgent | Closed | 1189247198 | IDX | ListAgentKey=28520193 | `Member?$filter=MemberKey eq '28520193'` | 200 | 0 | — |
| ListAgent | Closed | 1189247198 | IDX | ListAgentMlsId=TM61 | `Member?$filter=MemberMlsId eq 'TM61'` | 200 | 0 | — |
| ListAgent | Closed | 1091329660 | IDX | ListAgentKey=25213762 | `Member?$filter=MemberKey eq '25213762'` | 200 | 0 | — |
| ListAgent | Closed | 1091329660 | IDX | ListAgentMlsId=112974 | `Member?$filter=MemberMlsId eq '112974'` | 200 | 0 | — |
| ListAgent | Closed | 1091329654 | IDX | ListAgentKey=25288876 | `Member?$filter=MemberKey eq '25288876'` | 200 | 0 | — |
| ListAgent | Closed | 1091329654 | IDX | ListAgentMlsId=87161 | `Member?$filter=MemberMlsId eq '87161'` | 200 | 0 | — |
| CoListAgent | Active | 1091330901 | IDX | CoListAgentKey=28520285 | `Member?$filter=MemberKey eq '28520285'` | 200 | 0 | — |
| CoListAgent | Active | 1091330901 | IDX | CoListAgentMlsId=TM128 | `Member?$filter=MemberMlsId eq 'TM128'` | 200 | 0 | — |
| CoListAgent | Active | 1091330901 | IDX | CoListAgent2Key=25292395 | `Member?$filter=MemberKey eq '25292395'` | 200 | 1 | {"MemberMlsId":"122095","OfficeKey":"5667509","MemberType":null,"MemberKey":"25292395","OfficeMlsId":"7565","MemberStatus":"Active"} |
| CoListAgent | Closed | 1092038614 | IDX | CoListAgentKey=25249649 | `Member?$filter=MemberKey eq '25249649'` | 200 | 0 | — |
| CoListAgent | Closed | 1092038614 | IDX | CoListAgentMlsId=65383 | `Member?$filter=MemberMlsId eq '65383'` | 200 | 0 | — |
| ListOffice | Closed | 1091986768 | IDX,OfficeInactive | ListOfficeKey=5671795 | `Office?$filter=OfficeKey eq '5671795'` | 200 | 0 | — |
| ListOffice | Closed | 1091986768 | IDX,OfficeInactive | ListOfficeMlsId=632 | `Office?$filter=OfficeMlsId eq '632'` | 200 | 0 | — |
| ListOffice | Closed | 1091986205 | IDX,OfficeInactive | ListOfficeKey=5671795 | `Office?$filter=OfficeKey eq '5671795'` | 200 | 0 | — |
| ListOffice | Closed | 1091986205 | IDX,OfficeInactive | ListOfficeMlsId=632 | `Office?$filter=OfficeMlsId eq '632'` | 200 | 0 | — |
| ListOffice | Closed | 1091329676 | IDX,OfficeInactive | ListOfficeKey=5671674 | `Office?$filter=OfficeKey eq '5671674'` | 200 | 0 | — |
| ListOffice | Closed | 1091329676 | IDX,OfficeInactive | ListOfficeMlsId=7489 | `Office?$filter=OfficeMlsId eq '7489'` | 200 | 0 | — |
| BuyerAgent | Closed | 1189247198 | IDX | BuyerAgentMlsId=TM61 | `Member?$filter=MemberMlsId eq 'TM61'` | 200 | 0 | — |
| BuyerAgent | Closed | 1091329660 | IDX | BuyerAgentMlsId=112974 | `Member?$filter=MemberMlsId eq '112974'` | 200 | 0 | — |
| BuyerOffice | Closed | 1091329676 | IDX,OfficeInactive | BuyerOfficeMlsId=7489 | `Office?$filter=OfficeMlsId eq '7489'` | 200 | 0 | — |

## E. Second-hop expands through a navigation

| Probe | ListingKey | HTTP | Payload / message |
|---|---|---|---|
| Active ListAgent($expand=Media) | 1091330901 | 400 | {"error":{"code":"BadRequest[400]. TraceId: 2bb13ba4-4b87-4ac6-9de9-c26276c4f98d","message":"Navigation property 'Media' not found on resource 'Member'."}} |
| Active ListOffice($expand=Media) | 1091330901 | 400 | {"error":{"code":"BadRequest[400]. TraceId: acabe3bf-f57e-467c-850c-006ea80cba21","message":"Navigation property 'Media' not found on resource 'Office'."}} |
| Active Building($expand=Media) | 1091330901 | 200 | `{"ListingKey":"1091330901","Building":[]}` |
| Active Building($expand=Property) | 1091330901 | 200 | `{"ListingKey":"1091330901","Building":[]}` |
| Closed BuyerAgent($expand=Media) | 1189739300 | 400 | {"error":{"code":"BadRequest[400]. TraceId: 240af5c0-e311-4057-8553-c37b102bc49d","message":"Navigation property 'Media' not found on resource 'Member'."}} |
| Active Media($filter=MediaCategory eq Photo;$top=2) | 1091330901 | 200 | `{"ListingKey":"1091330901","Media":[{"MediaKey":"2004485803513","MediaCategory":"Photo"},{"MediaKey":"2004485803509","MediaCategory":"Photo"}]}` |
| Active all 14 navigations key-only in one request | 1091330901 | 200 | `{"ListOfficeKey":"5667509","BuyerAgentKey":null,"BuyerOfficeKey":null,"CoBuyerAgentKey":null,"CoListOfficeKey":"5667509","ListAgentKey":"25243768","CoListAgentKey":"28520285","CoBuyerOfficeKey":null,"ListingKey":"1091330901","Building":[],"BuyerAgent":[],"BuyerOffice":[],"CoBuyerAgent":[],"CoBuyerOf` |

