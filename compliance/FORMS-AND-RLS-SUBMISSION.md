# Forms & RLS Submission

> **LMP:** legacy upstream intermediary (listing input to REBNY RLS) | **IDX Display:** Trestle IDX Plus WebAPI (read-only on mallan.nyc) | **Feed:** REBNY RLS via Trestle (Cotality)
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## 1. Form Types

| Form | File | Fields | Purpose |
|------|------|--------|---------|
| Sale Listing | `SALE-FORM-REDESIGN.html` | 719 | Sale listing data entry (CRM internal — RLS submission is via the legacy upstream intermediary (LMP)) |
| Rental Listing | `RENTAL-FORM-REDESIGN.html` | 525 | Rental listing data entry (CRM internal — RLS submission is via the legacy upstream intermediary (LMP)) |
| Buyer Deal | `BUYER-DEAL-FORM.html` | ~50 | Buyer transaction tracking |
| Tenant Deal | `TENANT-DEAL-FORM.html` | ~30 | Tenant transaction tracking |

---

## 2. CRM Listing Data Entry Workflow

> **NOTE:** mallan.nyc does NOT submit listings to the RLS. Actual RLS submission is via the legacy upstream intermediary (LMP). The workflow below describes CRM-internal data entry and validation.

```
Agent fills form → Auto-save (30s) → Validate (47+ fields) → Content scan
  → Fair Housing scan → Distribution gate check → Preview → Save to CRM
  → Agent enters listing in the legacy upstream intermediary (LMP) for actual RLS submission
```

### Pre-Submission Checklist (Automated)

| # | Check | Blocking? |
|---|-------|-----------|
| 1 | All mandatory fields populated | Yes |
| 2 | Conditional fields satisfied | Yes |
| 3 | Cross-field validation passed | Yes |
| 4 | Fair Housing scan passed | Yes (or override with acknowledgment) |
| 5 | Agent info scan passed (no agent info in description) | Yes |
| 6 | Off-Market language scan passed | Yes |
| 7 | Compensation language scan passed | Yes |
| 8 | Listing agreement type matches PropertyType | Yes |
| 9 | Display control flags set | Yes |
| 10 | Photos uploaded (minimum 1) | Recommended |
| 11 | Borough/County match validated | Yes |
| 12 | Street name in REBNY dictionary | Yes |

---

## 3. Mandatory Field Checklist (79 Fields)

### All Listings (I1-I44)

**Location & Building (I1-I16):**
- I1: Borough (CityRegion)
- I2: Building Classification (PropertyType, PropertySubType, StructureType)
- I3: Building Pet Policy (BuildingPetsAllowed)
- I4: Building Sublet Policy
- I5: Have Elevator (ElevatorsTotal)
- I6: Have Garage (GarageYN)
- I7: Have Lobby Attendant (AttendanceType)
- I8: Full Address (StreetNumber, StreetName, UnParsedAddress)
- I9: Neighborhood (SubdivisionName)
- I10: New Development & Construction (NewDevelopmentYN, NewConstructionYN)
- I11: Number of Total Units (NumberOfUnitsTotal)
- I12: Ownership Type (CommonInterest)
- I13: Tax Block and Lot (BuildingTaxLot, TaxBlock)
- I14: Total Floors (StoriesTotal)
- I15: Unit Number (conditional)
- I16: Year Built (YearBuilt)

**Listing Features (I17-I26):**
- I17: Board Approval Required (SpecialListingConditions)
- I18-I19: Bathrooms Full + Half (BathroomsFull, BathroomsHalf, BathroomsTotal)
- I20: Bedrooms (BedroomsTotal)
- I21: Total Rooms (RoomsTotal)
- I22: Unit Pet Policy (PetsAllowed)
- I23: Photo Sort Order
- I24: Private Outdoor Space
- I25: Property Condition
- I26: Washer/Dryer (BuildingLaundryFeatures)

**Agents & Firms (I27-I28):**
- I27: Exclusive Agent & Firm (ListAgentMlsId)
- I28: Buyer Agent (at close only — BuyerAgentMlsId)

**Gate Fields (I29-I31):**
- I29: IDX Display (`InternetEntireListingDisplayYN` — no separate IDX field on Trestle)
- I30: Participant Only (Permissions)
- I31: Syndication (`SyndicateTo` — UCBA: `SyndicateYN`)

**Status & Dates (I32-I39):**
- I32: Closing Price (ClosePrice — at close)
- I33: Concessions
- I34: Expiration Date (ExpirationDate — HIDDEN)
- I35: Listing Contract Date
- I36: Status & Date (MlsStatus)
- I37: Price (ListPrice)
- I38: Purchase Contract Date (at Pending)
- I39: Sold/Leased Date (CloseDate — at close)

**Showing & Open House (I40-I42):**
- I40: First Showing Date (ActivationDate for Coming Soon)
- I41: Open House Details
- I42: Showing Instructions (ShowingInstructions)

**Agreements (I43-I44):**
- I43: Co-Broke Agreement (CoBrokeAgreement)
- I44: Listing Type (ListingAgreement)

### Sale-Only (I45-I57)

**Condo/Co-op/Condop (I45-I52):**
- I45: Flip Tax
- I46: Living Area (Condo)
- I47: Maintenance/Common Charges
- I48: Maximum Financing (Co-op)
- I49: Number of Shares (Co-op)
- I50: Percent Common Elements (Condo)
- I51: Tax Abatement
- I52: Tax Monthly (Condo)

**Building/Townhouse (I53-I57):**
- I53: Building Area Total
- I54: Garage Details
- I55: Size/Dimensions
- I56: Tax Annual Amount
- I57: Total Legal Rooms

### Rental-Only (I58-I61)

- I58: Availability Date
- I59: Furnished Details
- I60: Lease Terms
- I61: Lease Type (stabilized/market-rate)

---

## 4. Form Tab Structure

### Sale Form (6 Tabs, 10 Sub-tabs)

| Tab | Name | Sub-tabs | Key Fields |
|-----|------|----------|------------|
| 1 | Listing Info | 4: Property Type, Address, Description, Distribution | PropertyType, Address, PublicRemarks, Gate fields |
| 2 | Unit Info | 3: Rooms, Features, Financial | Bedrooms, Baths, Amenities, Price |
| 3 | TH/Building | 3: Building Info, Building Features, Condo/Co-op | Ownership, Maintenance, Tax |
| 4 | Distribution | — | IDX/VOW gates, Syndication, Permissions |
| 5 | Preview | — | Full listing preview as it will appear |
| 6 | History | — | Status changes, DOM, audit trail |

### Rental Form (6 Tabs, 10 Sub-tabs)

Same structure as sale with rental-specific fields (Availability, Lease Terms, Furnished, Lease Type).

---

## 5. Content Scanning on Forms

### Scan Points

| When | Fields Scanned | Action |
|------|----------------|--------|
| On field blur | PublicRemarks, PrivateRemarks | Highlight violations |
| Before save | All text fields | Warning banner |
| Before submit | All text fields | Block submission |

### Scanner Rules

| Scanner | Patterns | Hard Block? |
|---------|----------|-------------|
| Fair Housing | 19+ discriminatory patterns | Soft (override with acknowledgment) |
| Agent Info | Phone, email, URL, names | Hard block |
| Off-Market | "off-market", "pocket listing" | Hard block |
| Compensation | "commission", "broker fee", "buyer pays" | Hard block |
| "Free Services" | "no fee", "free", "no cost" | Soft (context-dependent) |

---

## 6. Distribution Gates on Forms

### Tab 4 (Distribution) — Gate Controls

| Gate | Form Control | Default |
|------|-------------|---------|
| Owner Opt-Out | Checkbox + Exhibit B upload | Unchecked |
| Participant Only | Checkbox | Unchecked |
| IDX Display | Toggle | ON (True) |
| Internet Entire Listing | Toggle | ON (True) |
| Internet Address Display | Toggle | ON (True) |
| AVM Display | Toggle | ON (True) |
| Consumer Comments | Toggle | ON (True) |
| Syndication | Toggle | ON (True) |

### Cascade Logic

When Internet Entire Listing = OFF:
- Auto-set IDX, Address, AVM, Comments to OFF
- Disable those toggles (grayed out)
- Show cascade warning

When Owner Opt-Out = ON:
- ALL toggles forced OFF
- Show warning: "No public dissemination allowed"
- Require Exhibit B upload within 48hrs

---

## 7. Auto-Save System

- **Interval:** Every 30 seconds
- **Storage:** Local (localStorage) + server (API)
- **Versioning:** Each save creates a version for audit
- **Conflict resolution:** Server timestamp wins

---

## 8. Status State Machine (17 States)

```
Draft → Coming Soon → Active → Pending → Closed
                    ↘ TOM → Active
                    ↘ Withdrawn → Active (after 30d, DOM reset)
                    ↘ Cancelled → Active (after 30d, DOM reset)
```

### Status Rules

| Status | Can Change To | DOM | Public? |
|--------|--------------|-----|---------|
| Draft | Coming Soon, Active | No | No |
| Coming Soon | Active, TOM, Withdrawn | No | Yes (badge) |
| Active | Pending, TOM, Withdrawn, Cancelled, Closed | Yes | Yes |
| Pending | Active, Closed, Withdrawn, Cancelled | Yes | Yes |
| TOM | Active, Withdrawn, Cancelled | Paused | No |
| Withdrawn | Active (after 30d) | Paused→Reset | No |
| Cancelled | Active (after 30d) | Paused→Reset | No |
| Closed | (terminal) | Reset to 0 | Sold/Rented |

---

## 9. Listing ID Format

- **New format (Jan 2025+):** "RLS" + digits (e.g., RLS1234567)
- **System field:** `SourceSystemKey` (read-only, system-assigned)

---

## 10. Post-Submission Monitoring

| Metric | Threshold | Action |
|--------|-----------|--------|
| Rejection rate | >4% quarterly | Yellow alert to broker |
| Rejection rate | >5% quarterly | Red alert — $10,000 fine |
| 3 quarterly fines | In calendar year | 30-day suspension |
| Status change lag | >24hrs | Agent notification |
| Closing data lag | >24hrs | Agent + broker notification |
