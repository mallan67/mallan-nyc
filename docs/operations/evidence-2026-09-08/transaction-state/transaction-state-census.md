# Transaction-state census — how in-contract / off-market / pending / closed manifest on this feed (2026-09-08)

Whole corpus: 591,599 Property rows in 592 pages, no sampling. Segment = PropertyType ending in Lease → Rental, else Sale. Combination signature = StandardStatus | date fields present | MajorChangeType. Suppressed fields (MlsStatus, PreviousStandardStatus, CancellationDate, ExpirationDate) are selected on purpose to prove they arrive null.

## Rental — 376,079 rows · PropertyType ResidentialLease 376,079 · MlsStatus non-null 0 · PreviousStandardStatus non-null 0

### Status × date-field presence

| Status | Rows | PurchaseContractDate | ContractStatusChangeDate | OffMarketDate | OffMarketTimestamp | PendingTimestamp | MajorChangeTimestamp | StatusChangeTimestamp | CloseDate | ListingContractDate | OnMarketDate | OnMarketTimestamp | ActivationDate | WithdrawnDate | CancellationDate | ExpirationDate | ContingentDate | BackOnMarketDate | BackOnMarketTimestamp | AvailabilityDate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Closed | 374,791 | 61,654 (16%) | 374,791 (100%) | 374,791 (100%) | 373,971 (100%) | 76,159 (20%) | 374,791 (100%) | 374,733 (100%) | 374,791 (100%) | 370,550 (99%) | 61,857 (17%) | 162,063 (43%) | 15,488 (4%) | 4 (0%) | 0 | 0 | 0 | 952 (0%) | 952 (0%) | 369,200 (99%) |
| Active | 939 | 7 (1%) | 939 (100%) | 0 | 0 | 17 (2%) | 939 (100%) | 936 (100%) | 0 | 939 (100%) | 938 (100%) | 939 (100%) | 936 (100%) | 0 | 0 | 0 | 0 | 49 (5%) | 49 (5%) | 939 (100%) |
| Pending | 349 | 341 (98%) | 349 (100%) | 66 (19%) | 347 (99%) | 349 (100%) | 349 (100%) | 349 (100%) | 2 (1%) | 349 (100%) | 341 (98%) | 348 (100%) | 312 (89%) | 0 | 0 | 0 | 0 | 25 (7%) | 25 (7%) | 349 (100%) |

Active rows carrying contract-shaped dates: ContractStatusChangeDate 939, PurchaseContractDate 7, PendingTimestamp 17. Closed rows with none of PurchaseContractDate / ContractStatusChangeDate / PendingTimestamp: 0.

### MajorChangeType by status

| Status | MajorChangeType distribution |
|---|---|
| Closed | PriceChange 220,710 · Closed 153,929 · null 151 · Pending 1 |
| Pending | Pending 334 · null 10 · PriceChange 3 · ActiveUnderContract 2 |
| Active | NewListing 732 · null 161 · BackOnMarket 44 · PriceChange 2 |

### Contingency by status

| Status | Contingency distribution |
|---|---|
| Closed | null 374,791 |
| Pending | null 349 |
| Active | null 939 |

### Combination signatures (top 60)

| Rows | Status \| dates present \| MajorChangeType |
|---|---|
| 218,494 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 79,590 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 59,924 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 12,574 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 2,044 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 949 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+BackOnMarketDate \| MCT=Closed |
| 729 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=NewListing |
| 246 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 245 | Closed \| ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 243 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=Pending |
| 231 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 151 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 118 | Closed \| ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 104 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 61 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=Pending |
| 57 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+CloseDate \| MCT=null |
| 52 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=null |
| 51 | Closed \| ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 46 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 34 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=null |
| 31 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=BackOnMarket |
| 20 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=Pending |
| 12 | Closed \| ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 11 | Active \| ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=BackOnMarket |
| 8 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 6 | Closed \| ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=null |
| 5 | Pending \| ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=Pending |
| 4 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 4 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=null |
| 3 | Active \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 3 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=Pending |
| 3 | Active \| PurchaseContractDate+ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=NewListing |
| 2 | Pending \| ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=ActiveUnderContract |
| 2 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+WithdrawnDate \| MCT=Closed |
| 2 | Active \| ContractStatusChangeDate+MajorChangeTimestamp \| MCT=PriceChange |
| 2 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Pending |
| 2 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=PriceChange |
| 2 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+BackOnMarketDate \| MCT=Closed |
| 2 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=null |
| 2 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+WithdrawnDate \| MCT=Closed |
| 2 | Active \| ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=null |
| 1 | Pending \| ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=PriceChange |
| 1 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 1 | Closed \| ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+CloseDate \| MCT=null |
| 1 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Pending |
| 1 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+BackOnMarketDate \| MCT=null |
| 1 | Active \| ContractStatusChangeDate+MajorChangeTimestamp \| MCT=null |
| 1 | Active \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=BackOnMarket |
| 1 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=BackOnMarket |

### Pairwise date relationships (day granularity, rows with both present)

| Pair | Both | Equal day | A before B | A after B | By status |
|---|---|---|---|---|---|
| PurchaseContractDate vs ContractStatusChangeDate | 62,002 | 39,500 | 21,874 | 628 | Closed: =39,161 <21,873 >620; Pending: =339 <1 >1; Active: =0 <0 >7 |
| PurchaseContractDate vs PendingTimestamp | 61,590 | 39,150 | 19,737 | 2,703 | Closed: =38,967 <19,591 >2,687; Pending: =179 <146 >16; Active: =4 <0 >0 |
| PurchaseContractDate vs OffMarketDate | 61,720 | 37,369 | 24,260 | 91 | Closed: =37,327 <24,237 >90; Pending: =42 <23 >1 |
| PurchaseContractDate vs CloseDate | 61,656 | 37,327 | 24,239 | 90 | Closed: =37,327 <24,237 >90; Pending: =0 <2 >0 |
| ContractStatusChangeDate vs PendingTimestamp | 76,525 | 33,536 | 15,860 | 27,129 | Closed: =33,351 <15,697 >27,111; Pending: =185 <146 >18; Active: =0 <17 >0 |
| ContractStatusChangeDate vs StatusChangeTimestamp | 376,018 | 78,621 | 57,283 | 240,114 | Closed: =77,830 <56,839 >240,064; Pending: =188 <152 >9; Active: =603 <292 >41 |
| OffMarketDate vs OffMarketTimestamp | 374,037 | 213,526 | 33,239 | 127,272 | Closed: =213,465 <33,236 >127,270; Pending: =61 <3 >2 |
| OffMarketDate vs CloseDate | 374,793 | 374,793 | 0 | 0 | Closed: =374,791 <0 >0; Pending: =2 <0 >0 |
| PendingTimestamp vs StatusChangeTimestamp | 76,525 | 38,715 | 35,431 | 2,379 | Closed: =38,381 <35,401 >2,377; Pending: =333 <14 >2; Active: =1 <16 >0 |
| MajorChangeTimestamp vs StatusChangeTimestamp | 376,018 | 186,354 | 36,633 | 153,031 | Closed: =185,231 <36,631 >152,871; Pending: =337 <2 >10; Active: =786 <0 >150 |
| MajorChangeTimestamp vs ModificationTimestamp | 376,079 | 2,698 | 373,381 | 0 | Closed: =2,317 <372,474 >0; Pending: =158 <191 >0; Active: =223 <716 >0 |
| OnMarketDate vs ListingContractDate | 63,136 | 47,537 | 4,318 | 11,281 | Closed: =46,555 <4,240 >11,062; Pending: =288 <8 >45; Active: =694 <70 >174 |
| CloseDate vs StatusChangeTimestamp | 374,735 | 83,300 | 56,033 | 235,402 | Closed: =83,300 <56,031 >235,402; Pending: =0 <2 >0 |

## Sale — 215,520 rows · PropertyType Residential 215,520 · MlsStatus non-null 0 · PreviousStandardStatus non-null 0

### Status × date-field presence

| Status | Rows | PurchaseContractDate | ContractStatusChangeDate | OffMarketDate | OffMarketTimestamp | PendingTimestamp | MajorChangeTimestamp | StatusChangeTimestamp | CloseDate | ListingContractDate | OnMarketDate | OnMarketTimestamp | ActivationDate | WithdrawnDate | CancellationDate | ExpirationDate | ContingentDate | BackOnMarketDate | BackOnMarketTimestamp | AvailabilityDate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Closed | 203,611 | 112,197 (55%) | 203,611 (100%) | 203,611 (100%) | 200,046 (98%) | 61,303 (30%) | 203,611 (100%) | 203,589 (100%) | 203,611 (100%) | 198,081 (97%) | 44,525 (22%) | 90,443 (44%) | 18,007 (9%) | 6 (0%) | 0 | 0 | 0 | 2,079 (1%) | 2,078 (1%) | 1,848 (1%) |
| Active | 6,663 | 172 (3%) | 6,663 (100%) | 11 (0%) | 19 (0%) | 182 (3%) | 6,663 (100%) | 6,558 (98%) | 11 (0%) | 6,663 (100%) | 6,663 (100%) | 6,663 (100%) | 6,507 (98%) | 11 (0%) | 0 | 0 | 0 | 767 (12%) | 767 (12%) | 505 (8%) |
| Pending | 5,241 | 5,241 (100%) | 5,241 (100%) | 391 (7%) | 5,205 (99%) | 5,211 (99%) | 5,241 (100%) | 5,241 (100%) | 3 (0%) | 5,241 (100%) | 5,234 (100%) | 5,238 (100%) | 4,842 (92%) | 1 (0%) | 0 | 0 | 0 | 480 (9%) | 480 (9%) | 198 (4%) |
| ComingSoon | 5 | 0 | 5 (100%) | 0 | 0 | 0 | 5 (100%) | 5 (100%) | 0 | 5 (100%) | 5 (100%) | 0 | 5 (100%) | 0 | 0 | 0 | 0 | 0 | 0 | 1 (20%) |

Active rows carrying contract-shaped dates: ContractStatusChangeDate 6,663, PurchaseContractDate 172, PendingTimestamp 182, OffMarketDate 11. Closed rows with none of PurchaseContractDate / ContractStatusChangeDate / PendingTimestamp: 0.

### MajorChangeType by status

| Status | MajorChangeType distribution |
|---|---|
| Closed | PriceChange 135,382 · Closed 67,737 · null 492 |
| Pending | Pending 5,084 · null 117 · ActiveUnderContract 35 · PriceChange 5 |
| Active | NewListing 3,798 · null 2,171 · BackOnMarket 650 · Active 32 · PriceChange 12 |
| ComingSoon | ComingSoon 5 |

### Contingency by status

| Status | Contingency distribution |
|---|---|
| Closed | null 203,611 |
| Pending | null 5,241 |
| Active | null 6,663 |
| ComingSoon | null 5 |

### Combination signatures (top 60)

| Rows | Status \| dates present \| MajorChangeType |
|---|---|
| 85,383 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 47,618 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 41,310 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 11,015 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 6,201 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 4,254 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=Pending |
| 3,754 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=NewListing |
| 2,398 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 2,326 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 2,220 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 2,024 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+BackOnMarketDate \| MCT=Closed |
| 1,878 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 1,408 | Closed \| ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 1,117 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 448 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=BackOnMarket |
| 439 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=Pending |
| 397 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=null |
| 360 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=Pending |
| 139 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=null |
| 101 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 83 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 72 | Active \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=BackOnMarket |
| 61 | Active \| ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=BackOnMarket |
| 58 | Active \| ContractStatusChangeDate+MajorChangeTimestamp \| MCT=null |
| 53 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+BackOnMarketDate \| MCT=null |
| 52 | Active \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=BackOnMarket |
| 40 | Active \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=null |
| 37 | Active \| PurchaseContractDate+ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=NewListing |
| 32 | Active \| ContractStatusChangeDate+MajorChangeTimestamp \| MCT=Active |
| 28 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=Pending |
| 23 | Pending \| PurchaseContractDate+ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=ActiveUnderContract |
| 22 | Active \| ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=null |
| 21 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+CloseDate \| MCT=null |
| 18 | Active \| PurchaseContractDate+ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 13 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=null |
| 11 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=null |
| 10 | Active \| ContractStatusChangeDate+MajorChangeTimestamp \| MCT=PriceChange |
| 8 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=null |
| 8 | Pending \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=ActiveUnderContract |
| 7 | Active \| ContractStatusChangeDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 7 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=PriceChange |
| 7 | Active \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+WithdrawnDate \| MCT=NewListing |
| 6 | Closed \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+WithdrawnDate \| MCT=Closed |
| 5 | Active \| ContractStatusChangeDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=BackOnMarket |
| 5 | Active \| PurchaseContractDate+ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp+BackOnMarketDate \| MCT=BackOnMarket |
| 5 | ComingSoon \| ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=ComingSoon |
| 4 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=ActiveUnderContract |
| 4 | Active \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=BackOnMarket |
| 3 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=PriceChange |
| 3 | Active \| ContractStatusChangeDate+OffMarketTimestamp+MajorChangeTimestamp \| MCT=null |
| 3 | Pending \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 3 | Active \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+WithdrawnDate \| MCT=null |
| 2 | Pending \| PurchaseContractDate+ContractStatusChangeDate+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=PriceChange |
| 2 | Active \| PurchaseContractDate+ContractStatusChangeDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=null |
| 2 | Pending \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Pending |
| 1 | Active \| PurchaseContractDate+ContractStatusChangeDate+OffMarketTimestamp+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp \| MCT=BackOnMarket |
| 1 | Closed \| ContractStatusChangeDate+OffMarketDate+PendingTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate \| MCT=Closed |
| 1 | Closed \| ContractStatusChangeDate+OffMarketDate+MajorChangeTimestamp+CloseDate \| MCT=null |
| 1 | Active \| PurchaseContractDate+ContractStatusChangeDate+MajorChangeTimestamp \| MCT=null |
| 1 | Active \| PurchaseContractDate+ContractStatusChangeDate+OffMarketDate+OffMarketTimestamp+MajorChangeTimestamp+StatusChangeTimestamp+CloseDate+WithdrawnDate \| MCT=BackOnMarket |

### Pairwise date relationships (day granularity, rows with both present)

| Pair | Both | Equal day | A before B | A after B | By status |
|---|---|---|---|---|---|
| PurchaseContractDate vs ContractStatusChangeDate | 117,610 | 9,500 | 106,237 | 1,873 | Closed: =4,328 <106,196 >1,673; Pending: =5,161 <41 >39; Active: =11 <0 >161 |
| PurchaseContractDate vs PendingTimestamp | 62,803 | 37,757 | 22,307 | 2,739 | Closed: =34,233 <20,786 >2,474; Pending: =3,431 <1,515 >265; Active: =93 <6 >0 |
| PurchaseContractDate vs OffMarketDate | 112,599 | 2,343 | 108,678 | 1,578 | Closed: =2,121 <108,500 >1,576; Pending: =211 <178 >2; Active: =11 <0 >0 |
| PurchaseContractDate vs CloseDate | 112,211 | 2,132 | 108,502 | 1,577 | Closed: =2,121 <108,500 >1,576; Active: =11 <0 >0; Pending: =0 <2 >1 |
| ContractStatusChangeDate vs PendingTimestamp | 66,696 | 6,240 | 5,877 | 54,579 | Closed: =2,773 <4,202 >54,328; Pending: =3,457 <1,503 >251; Active: =10 <172 >0 |
| ContractStatusChangeDate vs StatusChangeTimestamp | 215,393 | 43,932 | 61,801 | 109,660 | Closed: =36,469 <57,614 >109,506; Pending: =3,473 <1,631 >137; Active: =3,985 <2,556 >17; ComingSoon: =5 <0 >0 |
| OffMarketDate vs OffMarketTimestamp | 200,438 | 87,661 | 33,649 | 79,128 | Closed: =87,299 <33,643 >79,104; Pending: =362 <6 >23; Active: =0 <0 >1 |
| OffMarketDate vs CloseDate | 203,625 | 203,625 | 0 | 0 | Closed: =203,611 <0 >0; Active: =11 <0 >0; Pending: =3 <0 >0 |
| PendingTimestamp vs StatusChangeTimestamp | 66,696 | 7,812 | 58,105 | 779 | Closed: =2,810 <57,715 >778; Pending: =4,996 <214 >1; Active: =6 <176 >0 |
| MajorChangeTimestamp vs StatusChangeTimestamp | 215,393 | 111,889 | 30,077 | 73,427 | Closed: =102,294 <30,057 >71,238; Pending: =5,099 <20 >122; Active: =4,491 <0 >2,067; ComingSoon: =5 <0 >0 |
| MajorChangeTimestamp vs ModificationTimestamp | 215,520 | 7,472 | 208,047 | 1 | Closed: =4,877 <198,733 >1; Pending: =1,693 <3,548 >0; Active: =899 <5,764 >0; ComingSoon: =3 <2 >0 |
| OnMarketDate vs ListingContractDate | 56,427 | 36,780 | 3,193 | 16,454 | Closed: =28,647 <2,963 >12,915; Pending: =3,381 <139 >1,714; Active: =4,748 <91 >1,824; ComingSoon: =4 <0 >1 |
| CloseDate vs StatusChangeTimestamp | 203,603 | 32,879 | 63,300 | 107,424 | Closed: =32,875 <63,298 >107,416; Active: =4 <0 >7; Pending: =0 <2 >1 |

## CustomProperty.CustomFields — 591,641 rows walked, 591,641 with a parseable payload, 61 distinct keys

### Keys whose name or values match contract / in-contract terminology

Terminology pattern: `contract|offer|accepted|deposit|signed|pending|closing|escrow|attorney|board|approv|application|rented|in.?contract|sublet|lease.?sign|move.?in|possession|available|vacan|occup`.

| Key | Matched by | Non-empty rows | By segment/status | Values by segment/status (top) |
|---|---|---|---|---|
| `CertificateOfOccupancyYN` | key | 229,778 | Rental/Closed 146,304 · Sale/Closed 73,808 · Sale/Active 5,090 · Sale/Pending 3,698 · Rental/Active 555 · Rental/Pending 277 · Unknown/Active 36 · Sale/ComingSoon 5 · Unknown/Closed 4 · Unknown/Pending 1 | Rental/Closed: 0=119,248, 1=27,056<br>Sale/Closed: 0=47,544, 1=26,264<br>Sale/Pending: 1=2,712, 0=986<br>Sale/Active: 1=3,824, 0=1,266<br>Rental/Pending: 1=228, 0=49<br>Unknown/Closed: 0=3, 1=1<br>Unknown/Active: 0=33, 1=3<br>Rental/Active: 1=381, 0=174<br>Unknown/Pending: 0=1<br>Sale/ComingSoon: 1=5 |
| `GuarantorsAcceptedYN` | key | 33,775 | Rental/Closed 29,325 · Sale/Closed 3,391 · Sale/Active 517 · Sale/Pending 369 · Rental/Active 131 · Rental/Pending 41 · Sale/ComingSoon 1 | Sale/Closed: 0=3,226, 1=165<br>Rental/Closed: 0=29,325<br>Sale/Pending: 0=360, 1=9<br>Sale/Active: 0=490, 1=27<br>Rental/Pending: 0=41<br>Rental/Active: 0=131<br>Sale/ComingSoon: 0=1 |
| `FlipTaxRemarks` | value | 1,182 | Sale/Closed 1,133 · Sale/Active 19 · Sale/Pending 17 · Rental/Closed 13 | Sale/Closed: See Board Requirements=398, (other)=361, Yes, See Board Requirements=104, Case By Case, See Board Requirements=49, $500-application fee & move in=34, see board req.=33, 2% at closing by seller=19, Allowed; board pkg form;, 1%Orig.PP+2%Profit=18<br>Sale/Active: There is a transfer fee (paid by purchasers) of 1% of the contract price to be p=1, See board application for flip tax=1, Mandatory contribution to working capital fund equivalent to 2 months common cha=1, 1% of contract price or 15% of net profit whichever is higher=1, There is a transfer fee (flip tax) that starts at 5% and steps down to 1% depend=1, 1.5% of Purchase Price Paid at Closing=1, Buyers pay at closing=1, At closing, a Reserve Assessment Fee is payable by the Purchaser, in the amount =1<br>Rental/Closed: Mandatory contribution to working capital fund equivalent to 2 months common cha=6, Buyer pays a capital contribution of 1.5% at closing.=3, $500-application fee $20=1, BUT, 2 month capital contribution paid at closing=1, 2 months common charges paid at closing=1, See board requirements=1<br>Sale/Pending: MOVE-IN FEE=2, Flip tax is a tiered fax starting at 2% of the closing price based on years of o=2, See Board Requirements 2% of gross sales price=1, 1% of gross sales after 2 years of occupancy or 2% if less than 2 years occupanc=1, 15 % of net profit paid by seller or 1% of contract price whichever is higher pa=1, 1% after 2 yrs of occupancy or 2% if less than 2 yrs occupancy=1, 2 months common charges paid at closing=1, 3% flip tax payable by purchaser See Board Requirements=1 |
| `MaximumFinancingRemarks` | value | 223 | Sale/Closed 134 · Sale/Active 34 · Sale/Pending 30 · Rental/Closed 23 · Rental/Active 1 · Rental/Pending 1 | Sale/Closed: Contracts Noncontingent on Financing=59, Post Closing Liquidity Not Required=25, A deposit equal to ten percent (10%) of the purchase price will be due upon sign=21, 10% at contract=4, considered on a case by case basis by the board=2, Sponsor Unit - No Board Approval. Flexible financing=1, UNFCU has approved the building.=1, Must be approved by lender=1<br>Rental/Closed: Post Closing Liquidity Not Required=20, Limited Financing Available=1, This is condo. Maximum financing is contingent on bank approval.=1, Contracts Noncontingent on Financing=1<br>Sale/Pending: Contracts Noncontingent on Financing=9, 90 financing requires a pre approval from one of the preferred lenders=7, 15% due at contract signing, remainder due at closing.=5, 15% due at contract signing. =3, 15% down at contract signing.=2, Gifting: Permitted w/ Board Approval
Guarantors: Permitted w/ Board Approval=1, Financing permitted with a minimum 20% down in cash, up to 80% financing allowed=1, A deposit equal to ten percent (10%) of the purchase price will be due upon sign=1<br>Sale/Active: Contracts Noncontingent on Financing=12, 90 financing requires a pre approval from one of the preferred lenders=6, A deposit equal to ten percent (10%) of the purchase price will be due upon sign=2, 90% owner financing available=2, max financing is 80%, but subject to board approval=1, the maximum financing accepted in Trump Tower is 90%.=1, The minimum down payment is 20%. Guarantors NOT accepted. =1, 15% due at contract signing. =1<br>Rental/Active: Post Closing Liquidity Not Required=1<br>Rental/Pending: Post Closing Liquidity Not Required=1 |
| `BonusRemarks` | value | 22 | Rental/Closed 22 | Rental/Closed: $200 Amazon Gift card to brokers renting agent for all deals signed before the e=2, Free Month Offered=1, owner offers rental agent  $500 bonus for 6 months lease and $1000 for the lease=1, All application fees are covered=1, no Bonus offered=1, Application Fee=1, No application fees.=1, Half of the application fee paid by owner after ap=1 |
| `TaxAbatementComments` | value | 16 | Rental/Closed 7 · Sale/Closed 7 · Sale/Pending 1 · Sale/Active 1 | Rental/Closed:  20-year 421-A tax exemption. Occupancy is slated for early 2014.=6, see offering plan=1<br>Sale/Closed:  20-year 421-A tax exemption. Occupancy is slated for early 2014.=5, see offering plan=1, Consult Attorney=1<br>Sale/Pending:  20-year 421-A tax exemption. Occupancy is slated for early 2014.=1<br>Sale/Active:  20-year 421-A tax exemption. Occupancy is slated for early 2014.=1 |
| `BuildingRules` | value | 3 | Rental/Closed 3 | Rental/Closed: GuarantorsAccepted=3 |

### All keys — non-empty rows by segment/status

| Key | Rows | Non-empty | By segment/status |
|---|---|---|---|
| `BuildingTaxLot` | 591,641 | 591,641 | Rental/Closed 374,791 · Sale/Closed 203,611 · Sale/Active 6,663 · Sale/Pending 5,241 · Rental/Active 939 · Rental/Pending 349 · Unknown/Active 37 · Sale/ComingSoon 5 · Unknown/Closed 4 · Unknown/Pending 1 |
| `ListingKey` | 591,641 | 591,641 | Rental/Closed 374,791 · Sale/Closed 203,611 · Sale/Active 6,663 · Sale/Pending 5,241 · Rental/Active 939 · Rental/Pending 349 · Unknown/Active 37 · Sale/ComingSoon 5 · Unknown/Closed 4 · Unknown/Pending 1 |
| `ElevatorsTotal` | 528,711 | 528,711 | Rental/Closed 329,670 · Sale/Closed 185,802 · Sale/Active 6,663 · Sale/Pending 5,241 · Rental/Active 939 · Rental/Pending 349 · Unknown/Active 37 · Sale/ComingSoon 5 · Unknown/Closed 4 · Unknown/Pending 1 |
| `MaxLeaseMonths` | 351,212 | 351,212 | Rental/Closed 349,917 · Rental/Active 939 · Rental/Pending 348 · Unknown/Active 5 · Unknown/Closed 2 · Sale/Closed 1 |
| `AttendanceType` | 344,943 | 344,943 | Rental/Closed 189,422 · Sale/Closed 142,291 · Sale/Active 6,663 · Sale/Pending 5,237 · Rental/Active 939 · Rental/Pending 346 · Unknown/Active 37 · Sale/ComingSoon 5 · Unknown/Closed 2 · Unknown/Pending 1 |
| `SponsorUnitYN` | 319,336 | 319,336 | Rental/Closed 185,685 · Sale/Closed 120,813 · Sale/Active 6,569 · Sale/Pending 5,173 · Rental/Active 763 · Rental/Pending 298 · Unknown/Active 29 · Sale/ComingSoon 5 · Unknown/Pending 1 |
| `CertificateOfOccupancyYN` | 229,778 | 229,778 | Rental/Closed 146,304 · Sale/Closed 73,808 · Sale/Active 5,090 · Sale/Pending 3,698 · Rental/Active 555 · Rental/Pending 277 · Unknown/Active 36 · Sale/ComingSoon 5 · Unknown/Closed 4 · Unknown/Pending 1 |
| `BonusYN` | 229,367 | 229,367 | Rental/Closed 229,335 · Rental/Pending 30 · Rental/Active 2 |
| `PercentOfCommonElements` | 221,763 | 221,763 | Sale/Closed 184,060 · Rental/Closed 25,981 · Sale/Active 6,154 · Sale/Pending 4,916 · Rental/Active 383 · Rental/Pending 234 · Unknown/Active 30 · Sale/ComingSoon 4 · Unknown/Pending 1 |
| `MaximumFinancingPercent` | 220,130 | 220,130 | Sale/Closed 182,757 · Rental/Closed 25,729 · Sale/Active 6,108 · Sale/Pending 4,930 · Rental/Active 362 · Rental/Pending 210 · Unknown/Active 30 · Sale/ComingSoon 3 · Unknown/Pending 1 |
| `ViewRemarks` | 209,961 | 209,961 | Rental/Closed 112,906 · Sale/Closed 89,240 · Sale/Active 4,137 · Sale/Pending 2,999 · Rental/Active 463 · Rental/Pending 211 · Sale/ComingSoon 4 · Unknown/Active 1 |
| `LandmarkStatusYN` | 209,104 | 209,104 | Rental/Closed 129,739 · Sale/Closed 69,849 · Sale/Active 5,022 · Sale/Pending 3,877 · Rental/Active 380 · Rental/Pending 229 · Sale/ComingSoon 4 · Unknown/Closed 2 · Unknown/Active 2 |
| `TaxDeductionPercent` | 184,832 | 184,832 | Sale/Closed 151,389 · Rental/Closed 25,655 · Sale/Active 4,121 · Sale/Pending 3,062 · Rental/Active 362 · Rental/Pending 209 · Unknown/Active 30 · Sale/ComingSoon 3 · Unknown/Pending 1 |
| `UnitLine` | 181,538 | 181,538 | Rental/Closed 107,385 · Sale/Closed 68,860 · Sale/Active 2,741 · Sale/Pending 2,242 · Rental/Active 182 · Rental/Pending 111 · Unknown/Active 15 · Unknown/Pending 1 · Sale/ComingSoon 1 |
| `FurnishedListPrice` | 178,863 | 178,863 | Rental/Closed 149,450 · Sale/Closed 26,541 · Sale/Pending 1,508 · Sale/Active 1,244 · Rental/Active 83 · Rental/Pending 37 |
| `FlipTaxRemarks` | 169,693 | 169,693 | Sale/Closed 159,331 · Sale/Active 4,984 · Sale/Pending 3,801 · Rental/Closed 1,542 · Unknown/Active 29 · Sale/ComingSoon 3 · Rental/Pending 1 · Rental/Active 1 · Unknown/Pending 1 |
| `KitchenCondition` | 163,415 | 163,415 | Rental/Closed 102,099 · Sale/Closed 57,007 · Sale/Active 2,192 · Sale/Pending 1,851 · Rental/Active 173 · Rental/Pending 73 · Unknown/Active 17 · Sale/ComingSoon 2 · Unknown/Closed 1 |
| `ClosetsTotal` | 157,857 | 157,857 | Rental/Closed 116,462 · Sale/Closed 39,969 · Sale/Active 735 · Sale/Pending 594 · Rental/Active 52 · Unknown/Active 32 · Rental/Pending 10 · Unknown/Closed 2 · Unknown/Pending 1 |
| `FlipTax` | 148,356 | 148,356 | Sale/Closed 106,116 · Rental/Closed 30,238 · Sale/Active 6,364 · Sale/Pending 4,981 · Rental/Active 388 · Rental/Pending 235 · Unknown/Active 29 · Sale/ComingSoon 4 · Unknown/Pending 1 |
| `TaxAbatementYN` | 119,293 | 119,293 | Rental/Closed 61,512 · Sale/Closed 44,570 · Sale/Active 6,663 · Sale/Pending 5,234 · Rental/Active 932 · Rental/Pending 338 · Unknown/Active 36 · Sale/ComingSoon 5 · Unknown/Closed 2 · Unknown/Pending 1 |
| `BuyerAgentRLSParticipantYN` | 106,467 | 106,467 | Rental/Closed 61,819 · Sale/Closed 44,636 · Sale/Pending 9 · Unknown/Closed 2 · Rental/Pending 1 |
| `BuildingRules` | 98,791 | 98,791 | Rental/Closed 48,712 · Sale/Closed 48,698 · Sale/Active 751 · Sale/Pending 543 · Rental/Active 44 · Unknown/Active 28 · Rental/Pending 14 · Unknown/Pending 1 |
| `RoofRightsYN` | 94,715 | 94,715 | Rental/Closed 61,988 · Sale/Closed 32,725 · Sale/Active 2 |
| `ManagingAgencyListingYN` | 89,230 | 89,230 | Rental/Closed 89,168 · Rental/Active 48 · Rental/Pending 8 · Unknown/Active 4 · Unknown/Closed 2 |
| `FurnishedMaxLeaseMonths` | 88,996 | 88,996 | Rental/Closed 88,687 · Sale/Closed 108 · Rental/Active 85 · Rental/Pending 50 · Sale/Active 46 · Sale/Pending 20 |
| `FurnishedMinLeaseMonths` | 88,993 | 88,993 | Rental/Closed 88,684 · Sale/Closed 108 · Rental/Active 85 · Rental/Pending 50 · Sale/Active 46 · Sale/Pending 20 |
| `FlipTaxType` | 86,088 | 86,088 | Sale/Closed 80,322 · Sale/Active 2,253 · Sale/Pending 2,117 · Rental/Closed 1,366 · Unknown/Active 28 · Unknown/Pending 1 · Rental/Pending 1 |
| `MaximumFinancingAmount` | 85,539 | 85,539 | Sale/Closed 84,216 · Sale/Active 708 · Sale/Pending 586 · Unknown/Active 28 · Unknown/Pending 1 |
| `MaximumFinancingRemarks` | 84,879 | 84,879 | Sale/Closed 47,890 · Rental/Closed 25,732 · Sale/Active 5,926 · Sale/Pending 4,726 · Rental/Active 362 · Rental/Pending 210 · Unknown/Active 29 · Sale/ComingSoon 3 · Unknown/Pending 1 |
| `BathroomCondition` | 76,458 | 76,458 | Rental/Closed 39,402 · Sale/Closed 33,698 · Sale/Active 1,776 · Sale/Pending 1,351 · Rental/Active 153 · Rental/Pending 75 · Unknown/Active 2 · Sale/ComingSoon 1 |
| `TaxMonthlyAmount` | 68,967 | 68,967 | Sale/Closed 33,605 · Rental/Closed 25,856 · Sale/Active 5,104 · Sale/Pending 3,781 · Rental/Active 373 · Rental/Pending 215 · Unknown/Active 29 · Sale/ComingSoon 3 · Unknown/Pending 1 |
| `TaxDeductionAmount` | 62,764 | 62,764 | Sale/Closed 61,441 · Sale/Active 708 · Sale/Pending 586 · Unknown/Active 28 · Unknown/Pending 1 |
| `CapitalReservesYN` | 58,638 | 58,638 | Rental/Closed 25,844 · Sale/Closed 25,702 · Sale/Active 3,791 · Sale/Pending 2,692 · Rental/Active 376 · Rental/Pending 228 · Sale/ComingSoon 4 · Unknown/Active 1 |
| `CeilingHeightFeet` | 43,411 | 43,411 | Rental/Closed 22,719 · Sale/Closed 20,150 · Sale/Active 323 · Sale/Pending 190 · Rental/Active 13 · Unknown/Active 11 · Rental/Pending 5 |
| `CeilingHeightUnits` | 42,037 | 42,037 | Rental/Closed 22,364 · Sale/Closed 19,552 · Sale/Active 59 · Sale/Pending 49 · Unknown/Active 11 · Rental/Pending 2 |
| `TaxDeductionRemarks` | 40,363 | 40,363 | Sale/Closed 39,306 · Sale/Active 585 · Sale/Pending 448 · Unknown/Active 24 |
| `BuildingSmokeFreeYN` | 36,040 | 36,040 | Rental/Closed 21,367 · Sale/Closed 13,002 · Sale/Active 772 · Sale/Pending 429 · Rental/Active 378 · Rental/Pending 91 · Sale/ComingSoon 1 |
| `GuarantorsAcceptedYN` | 33,775 | 33,775 | Rental/Closed 29,325 · Sale/Closed 3,391 · Sale/Active 517 · Sale/Pending 369 · Rental/Active 131 · Rental/Pending 41 · Sale/ComingSoon 1 |
| `BonusRemarks` | 31,329 | 31,329 | Rental/Closed 31,329 |
| `PrivateOutdoorSpaceSize` | 28,576 | 28,576 | Sale/Closed 14,128 · Rental/Closed 9,479 · Sale/Active 2,612 · Sale/Pending 1,946 · Rental/Active 279 · Rental/Pending 127 · Sale/ComingSoon 5 |
| `AlternateStreetName` | 11,996 | 11,996 | Sale/Closed 6,229 · Rental/Closed 5,767 |
| `AlternateStreetNumber` | 11,835 | 11,835 | Sale/Closed 6,160 · Rental/Closed 5,675 |
| `AlternateStreetSuffix` | 11,148 | 11,148 | Sale/Closed 5,837 · Rental/Closed 5,311 |
| `CommercialUnitsYN` | 11,083 | 11,083 | Rental/Closed 6,428 · Sale/Closed 3,597 · Sale/Active 517 · Sale/Pending 368 · Rental/Active 131 · Rental/Pending 41 · Sale/ComingSoon 1 |
| `CeilingHeightInches` | 7,621 | 7,621 | Sale/Closed 4,256 · Rental/Closed 2,907 · Sale/Active 283 · Sale/Pending 153 · Rental/Active 13 · Unknown/Active 5 · Rental/Pending 4 |
| `BuildingStaffType` | 3,652 | 3,652 | Sale/Closed 1,251 · Sale/Active 1,095 · Sale/Pending 706 · Rental/Closed 417 · Rental/Active 126 · Rental/Pending 57 |
| `CoBuyerAgentRLSParticipantYN` | 3,285 | 3,285 | Sale/Closed 1,979 · Rental/Closed 1,304 · Sale/Pending 2 |
| `TaxAbatementExpirationYear` | 2,913 | 2,913 | Sale/Closed 1,556 · Rental/Closed 1,035 · Sale/Active 185 · Sale/Pending 133 · Rental/Pending 4 |
| `AlternateStreetDirPrefix` | 2,850 | 2,850 | Rental/Closed 1,465 · Sale/Closed 1,385 |
| `TaxAbatementComments` | 2,816 | 2,816 | Sale/Closed 1,567 · Rental/Closed 929 · Sale/Active 185 · Sale/Pending 133 · Rental/Pending 2 |
| `BuildingParkingTotal` | 1,936 | 1,936 | Sale/Closed 1,118 · Rental/Closed 479 · Sale/Active 175 · Sale/Pending 140 · Rental/Active 13 · Rental/Pending 11 |
| `CapitalReservesTotal` | 662 | 662 | Sale/Closed 466 · Rental/Closed 104 · Sale/Active 48 · Sale/Pending 39 · Rental/Pending 4 · Rental/Active 1 |
| `NumberOfProfessionalUnitsTotal` | 609 | 609 | Sale/Closed 362 · Rental/Closed 152 · Sale/Active 56 · Sale/Pending 31 · Rental/Pending 4 · Rental/Active 4 |
| `ComingSoonTimestamp` | 574 | 574 | Sale/Closed 390 · Sale/Pending 99 · Sale/Active 80 · Sale/ComingSoon 5 |
| `AlternateStreetDirSuffix` | 185 | 185 | Sale/Closed 99 · Rental/Closed 86 |
| `SpecialAssessmentExpirationDateTime` | 181 | 181 | Sale/Closed 101 · Rental/Closed 49 · Sale/Pending 17 · Sale/Active 13 · Rental/Pending 1 |
| `ArchitectName` | 106 | 106 | Sale/Closed 51 · Sale/Pending 21 · Sale/Active 20 · Rental/Closed 12 · Rental/Active 2 |
| `AreaOverFAR` | 24 | 24 | Sale/Closed 11 · Rental/Closed 6 · Sale/Active 4 · Sale/Pending 1 · Rental/Active 1 · Rental/Pending 1 |
| `AreaUnderFAR` | 22 | 22 | Sale/Closed 11 · Sale/Active 5 · Rental/Closed 3 · Sale/Pending 2 · Rental/Pending 1 |
| `CoExclusiveListingKey` | 1 | 1 | Sale/Closed 1 |
| `PrivateOutdoorSpaceRemarks` | 1 | 1 | Sale/Closed 1 |

