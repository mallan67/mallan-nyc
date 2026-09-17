# Live verification — the status dates under Mallan's Cotality subscription (2026-09-08, evening)

Owner question (Maya): "verify whether ExpirationDate is actually populated and writable under your specific
Cotality subscription; existence in metadata does not prove subscription availability."

Method: read-only live queries against `https://api.cotality.com/trestle` with Mallan's IDX Plus credentials
(`npm run cotality:query -- query …` and `… probeField …`), 2026-09-08. No write was attempted: the IDX Plus WebAPI
is read-only for Mallan — nothing Mallan does writes to Cotality. "Writable" therefore means only whether the field
name is a legitimate Cotality Property field under which Mallan may store its own exclusives' facts.

## 1. Selectability and filterability (probeField, live)

| Field | `$select` | `$filter` | Live count (filterable fields only) |
|---|---|---|---|
| ExpirationDate | accepted | **HTTP 400** "Invalid field 'ExpirationDate' - cannot be used for filtering, grouping or ordering" | unmeasurable |
| WithdrawnDate | accepted | accepted | 22 rows in the corpus |
| CancellationDate | accepted | **HTTP 400** (not filterable) | unmeasurable |
| BackOnMarketDate | accepted | accepted | 4,427 rows |
| CloseDate | accepted | accepted | 578,417 rows (contract) |
| OffMarketDate | accepted | accepted | 578,868 rows (contract) |

## 2. Population on delivered rows (query, `$top=200`, `ModificationTimestamp desc`, live)

| StandardStatus sample | rows | ExpirationDate | WithdrawnDate | CancellationDate | OffMarketDate | CloseDate |
|---|---|---|---|---|---|---|
| Active | 200 (164 Residential, 36 ResidentialLease) | 0 | 0 | 0 | 0 | 0 |
| Pending | 200 (177 / 23) | 0 | 0 | 0 | 15 | 0 |
| Closed | 200 (117 / 83) | 0 | 0 | 0 | 200 | 200 |

The entitled feed delivers StandardStatus Active / Pending / ComingSoon / Closed only (whole-corpus census,
2026-09-08 morning); Expired / Withdrawn / Canceled rows never arrive. Consistent with that, **ExpirationDate,
WithdrawnDate and CancellationDate are populated on none of the 600 sampled delivered rows** — they are field names
Mallan's subscription can select, not facts it receives.

## 3. What this means for the correction

- For a provider row the removal facts never come from Cotality; a provider row that leaves the feed is Off
  Market (a presence fact) and its market clock ends the day it left. `OffMarketDate` and `CloseDate` ARE delivered
  and are the verified ends of the market clock (Closed → CloseDate 200/200).
- For a Mallan-authored exclusive the agent enters the fact on the form. The ruling's associations (Expired →
  ExpirationDate, Withdrawn → WithdrawnDate, Canceled → CancellationDate, Back on Market → BackOnMarketDate,
  Contract Signed → PurchaseContractDate, Sold / Rented → CloseDate) are stored under the Cotality field names in
  Mallan storage (raw_data). That is the only sense in which they are "writable": they are Mallan facts kept in
  Cotality vocabulary; Cotality itself never receives them.
- Nothing may `$filter` or `$orderby` on ExpirationDate or CancellationDate (HTTP 400); Search and CMA never do.

Decision for the owner: keep ExpirationDate as the Expired fact on Mallan exclusives (a legitimate, selectable
Cotality Property field that REBNY's input references), or replace it with a Mallan-internal key. The code follows
the ruling as given (ExpirationDate).

## 4. Is there a different close-date field for a RENTAL? (asked 2026-09-09 — answered live, read-only)

**No — the field name is the same; only the LABEL differs.** Sampling 200 live `StandardStatus eq 'Closed' and
PropertyType eq 'ResidentialLease'` rows:

| Field on a closed rental | Populated |
|---|---|
| CloseDate | 200 / 200 (e.g. 2026-09-08) |
| ClosePrice | 200 / 200 (e.g. 5000) |
| PurchaseContractDate | 200 / 200 |
| OffMarketDate | 200 / 200 |
| ListingContractDate · ContractStatusChangeDate · AvailabilityDate | 200 / 200 |
| LeaseExpiration · LeaseTerm | 0 / 200 |

A search of every Cotality resource in the committed contract for a rental-specific close field (`*Leased*`,
`*Rented*`, `Lease*Date`) returns only `NumberOfUnitsLeased` (Int32, 0 populated), `UnitTypeLeasedYN` (Boolean, 0)
and `LandLeaseExpirationDate` — none of them a close date. So a closed rental closes on `CloseDate` at `ClosePrice`,
exactly like a sale; REBNY's form label is "Sold or Leased Date" and Mallan's is "Rented Date".

**The different name was in OUR form, and it was a real defect.** The rental page carried two disconnected pairs: a
status-gated `#rentalRentedDate` / `#rentalRentedPrice` marked required but `data-mallan-ignore` (so the agent's
"Rented Date" was never saved), and a separate always-visible `#rentalCloseDate` / `#rentalClosePrice` that held the
real bindings. The Rented controls are now THE bound pair (`CloseDate` / `ClosePrice`) on both rental pages and the
duplicate pair is deleted — one set, shown when the status is Rented, mirroring the sale form's Sold Date / Sold Price.

Note also: `PurchaseContractDate` is populated on 200/200 closed rentals (REBNY reuses the sale field for the lease
signing). It is still NOT collected on the rental UI, per the owner ruling — a rental's lease-signed date is the
Mallan workflow fact `_mallanLeaseSignedDate`, because no rental-SPECIFIC Cotality field is proven.
