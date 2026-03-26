# ~~IDX/VOW Tier Separation~~ — SUPERSEDED

> **SUPERSEDED 2026-03-26.** This plan was based on the incorrect assumption that ClosePrice,
> OriginalListPrice, and PreviousListPrice are VOW-restricted. They are NOT.
>
> **Evidence (verified 2026-03-26):**
> - REBNY IDX Plus CSV (902 fields): ClosePrice, OriginalListPrice, PreviousListPrice all listed as "IDX Plus field"
> - REBNY IDX/VOW Compliance Checklist (Dec 2021): NO field-level restriction on these fields
> - Trestle metadata: NO IDX/VOW annotations on any fields
> - NAR IDX Policy 7.58: sold data MUST be on IDX when publicly accessible (NYC has ACRIS)
>
> **What was actually wrong:** Only the documentation/comments — NOT the code. The `VOW_ENRICHED_FIELDS`
> comment in `lib/compliance/dto.ts` and the `IDX-VOW-DISPLAY-RULES.md` doc incorrectly claimed these
> fields were VOW-only. Both have been corrected. No code changes to public-dto.ts or any API routes needed.
>
> **DO NOT EXECUTE the tasks below.** They would have incorrectly stripped legitimate IDX Plus data.

~~**Goal:** Enforce strict IDX/VOW data tier separation so the public frontend (mallan.nyc) only displays IDX-safe data. VOW-enriched fields (ClosePrice, DaysOnMarket, OriginalListPrice) are stripped from all public responses. Sold prices sourced from ACRIS (NYC public records) instead of Trestle VOW.~~

**Architecture:** `toPublicDTO()` is the single enforcement point for all public API routes. VOW fields are removed there. A new `toVOWDTO()` extends PublicListingDTO with VOW fields for authenticated portal users. Building sale history retains ACRIS-sourced records (public records, no restrictions) but strips Trestle-sourced ClosePrice. Agent PII (direct phone) removed from open-house public endpoints.

**Tech Stack:** Next.js 16, TypeScript, Prisma, Jest, ACRIS/Socrata API (existing integration)

**Validation:** Each task ends with `npm run test:compliance` AND `npm run idx:validate:fails`. Task 7 adds new validator sections to catch future regressions.

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `lib/idx/public-dto.ts` | Single enforcement point — strips VOW fields from public responses | MODIFY |
| `lib/idx/vow-dto.ts` | New file — extends PublicListingDTO with VOW fields for authenticated users | CREATE |
| `lib/idx/card-fields.ts` | Trestle $select fields for search cards | MODIFY |
| `lib/compliance/dto.ts` | Compliance sanitization layer (already correct, used for reference) | NO CHANGE |
| `app/api/open-houses/route.ts` | Public open house endpoint — leaks agent direct phone | MODIFY |
| `app/api/agents/[slug]/past-deals/route.ts` | Public agent deals — leaks closePrice | MODIFY |
| `app/api/agents/[slug]/listings/route.ts` | Public agent listings — leaks closePrice on closed | MODIFY |
| `app/api/listings/building/route.ts` | Building sale history — keep ACRIS, strip Trestle ClosePrice | MODIFY |
| `app/components/PriceHistory.tsx` | Price timeline — gate VOW events behind auth prop | MODIFY |
| `app/components/BuildingUnits.tsx` | Building units — filter by source, label ACRIS | MODIFY |
| `app/listing/[id]/page.tsx` | Listing detail — strip VOW from public render | MODIFY |
| `lib/compliance/__tests__/vow-tier-separation.test.ts` | New test suite for IDX/VOW separation | CREATE |
| `scripts/idx-validate.js` | Add VOW leak detection sections (s36, s37) | MODIFY |

---

## Task 1: Strip VOW Fields from PublicListingDTO

**Files:**
- Modify: `lib/idx/public-dto.ts`
- Create: `lib/idx/vow-dto.ts`
- Test: `lib/compliance/__tests__/vow-tier-separation.test.ts`

This is the most critical change — blocks VOW leaks from 4+ routes at once.

- [ ] **Step 1: Write the failing test**

Create `lib/compliance/__tests__/vow-tier-separation.test.ts`:

```typescript
import { toPublicDTO } from '../../idx/public-dto';

// Minimal IDXListing fixture with VOW fields populated
const mockListing = {
  listingId: 'TEST-001',
  listingKey: 'key-001',
  mlsId: 'MLS-001',
  slug: 'test-listing',
  status: 'Closed',
  listingType: 'sale' as const,
  listPrice: 1000000,
  originalListPrice: 1100000,
  previousListPrice: 1050000,
  closePrice: 950000,
  closeDate: '2026-01-15',
  daysOnMarket: 45,
  cumulativeDaysOnMarket: 60,
  propertyType: 'Residential',
  propertySubType: 'Condo',
  bedroomsTotal: 2,
  bathroomsFull: 1,
  bathroomsHalf: 0,
  livingArea: 900,
  lotSizeArea: null,
  yearBuilt: 2005,
  listOfficeName: 'Test Office',
  publicRemarks: 'Nice place',
  address: {
    streetNumber: '123',
    streetName: 'Main St',
    unitNumber: '4A',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    county: 'New York',
    neighborhood: 'Chelsea',
  },
  latitude: 40.7,
  longitude: -74.0,
  media: [],
  internetAddressDisplayYN: true,
  internetEntireListingDisplayYN: true,
  listingContractDate: '2025-10-01',
  modificationTimestamp: '2026-01-15T12:00:00Z',
  onMarketDate: '2025-10-01',
  // ... other required fields with sensible defaults
  ownerOptOut: false,
  participantOnly: false,
  buildingName: null,
  totalUnits: 10,
  stories: 5,
  hasElevator: true,
  hasLobbyAttendant: false,
  petPolicy: 'Allowed',
  garageSpaces: 0,
  maintenanceFee: 800,
  commonCharges: null,
  taxMonthlyAmount: 500,
  flipTax: null,
  maxFinancing: '90%',
  numberOfShares: null,
  percentOfCommonElements: null,
  newConstruction: false,
  privateOutdoorSpace: false,
  washerDryer: 'None',
  propertyCondition: 'Excellent',
  boardApprovalRequired: true,
  ownershipType: 'Condo',
  furnished: null,
  leaseTerms: null,
  leaseType: null,
  availabilityDate: null,
  buildingAreaTotal: null,
  sizeDimensions: null,
  taxAnnualAmount: null,
  totalLegalRooms: null,
  fareActFees: null,
};

describe('IDX/VOW Tier Separation', () => {
  describe('toPublicDTO (IDX tier)', () => {
    it('must NOT include closePrice', () => {
      const dto = toPublicDTO(mockListing as any);
      expect(dto).not.toHaveProperty('closePrice');
    });

    it('must NOT include originalListPrice', () => {
      const dto = toPublicDTO(mockListing as any);
      expect(dto).not.toHaveProperty('originalListPrice');
    });

    it('must NOT include previousListPrice', () => {
      const dto = toPublicDTO(mockListing as any);
      expect(dto).not.toHaveProperty('previousListPrice');
    });

    it('must NOT include daysOnMarket', () => {
      const dto = toPublicDTO(mockListing as any);
      expect(dto).not.toHaveProperty('daysOnMarket');
      expect(dto).not.toHaveProperty('cumulativeDaysOnMarket');
    });

    it('must include listPrice (IDX-safe)', () => {
      const dto = toPublicDTO(mockListing as any);
      expect(dto.listPrice).toBe(1000000);
    });

    it('must include status (IDX-safe)', () => {
      const dto = toPublicDTO(mockListing as any);
      expect(dto.status).toBe('Closed');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/compliance/__tests__/vow-tier-separation.test.ts --no-cache`
Expected: FAIL — `toPublicDTO` currently includes closePrice, originalListPrice, previousListPrice

- [ ] **Step 3: Strip VOW fields from toPublicDTO**

In `lib/idx/public-dto.ts`, remove these lines from the `toPublicDTO` return object:

**Remove from the PublicListingDTO interface:**
```typescript
// DELETE these 4 lines from the interface:
//   originalListPrice: number;
//   previousListPrice?: number;
//   closePrice: number | null;
//   daysOnMarket?: number;
```

**Remove from the toPublicDTO function return:**
```typescript
// DELETE these 4 lines from the return object:
//   originalListPrice: listing.originalListPrice,
//   previousListPrice: listing.previousListPrice,
//   closePrice: listing.closePrice,
//   daysOnMarket: listing.daysOnMarket,
```

- [ ] **Step 4: Create VOW DTO for authenticated users**

Create `lib/idx/vow-dto.ts`:

```typescript
import { toPublicDTO, type PublicListingDTO } from './public-dto';
import type { IDXListing } from './types';

/** VOW tier — extends PublicListingDTO with fields restricted to authenticated portal users */
export interface VOWListingDTO extends PublicListingDTO {
  originalListPrice: number;
  previousListPrice?: number;
  closePrice: number | null;
  closeDate?: string;
  daysOnMarket?: number;
  cumulativeDaysOnMarket?: number;
}

/** Convert IDXListing to VOW-enriched DTO. Use ONLY behind requirePortalRole() auth. */
export function toVOWDTO(listing: IDXListing): VOWListingDTO {
  const publicDTO = toPublicDTO(listing);
  return {
    ...publicDTO,
    originalListPrice: listing.originalListPrice,
    previousListPrice: listing.previousListPrice ?? undefined,
    closePrice: listing.closePrice,
    closeDate: listing.closeDate ?? undefined,
    daysOnMarket: listing.daysOnMarket ?? undefined,
    cumulativeDaysOnMarket: listing.cumulativeDaysOnMarket ?? undefined,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/compliance/__tests__/vow-tier-separation.test.ts --no-cache`
Expected: PASS — all 6 tests green

- [ ] **Step 6: Run existing compliance tests to check for regressions**

Run: `npm run test:compliance`
Expected: Some existing tests in `portal-dto.test.ts` or `compliance-gates.test.ts` may reference `closePrice` on the public DTO — update those assertions to match the new behavior (closePrice no longer in PublicListingDTO).

- [ ] **Step 7: Commit**

```bash
git add lib/idx/public-dto.ts lib/idx/vow-dto.ts lib/compliance/__tests__/vow-tier-separation.test.ts
git commit -m "feat(compliance): strip VOW fields from PublicListingDTO, create VOW DTO

closePrice, originalListPrice, previousListPrice, daysOnMarket removed
from public IDX tier. New toVOWDTO() for authenticated portal users."
```

---

## Task 2: Fix Open Houses — Strip Agent Direct Phone

**Files:**
- Modify: `app/api/open-houses/route.ts`
- Test: `lib/compliance/__tests__/vow-tier-separation.test.ts` (append)

Agent direct phone is PII that must not appear in public IDX responses.

- [ ] **Step 1: Add failing test**

Append to `lib/compliance/__tests__/vow-tier-separation.test.ts`:

```typescript
describe('Open Houses Agent PII', () => {
  it('public open house response must not include agent direct phone', () => {
    // This test validates the contract — implementation tested via API
    const publicOpenHouse = {
      agentName: 'Jane Doe',
      agentPhone: '212-555-1234', // direct phone — should be stripped
      officeName: 'Test Brokerage',
      officePhone: '212-555-0000',
    };
    // Agent direct phone must be replaced with office phone
    const sanitized = {
      ...publicOpenHouse,
      agentPhone: undefined,
      contactPhone: publicOpenHouse.officePhone,
    };
    expect(sanitized).not.toHaveProperty('agentPhone');
    expect(sanitized.contactPhone).toBe('212-555-0000');
  });
});
```

- [ ] **Step 2: Fix open-houses route**

In `app/api/open-houses/route.ts`, find the two locations where `ListAgentDirectPhone` is mapped (approximately lines 121 and 207). Change both:

**Before:**
```typescript
agentName: (prop.ListAgentFullName as string) || '',
agentPhone: (prop.ListAgentDirectPhone as string) || (prop.ListAgentOfficePhone as string) || '',
```

**After:**
```typescript
officeName: (prop.ListOfficeName as string) || '',
officePhone: (prop.ListOfficePhone as string) || '',
```

Remove `agentName` and `agentPhone` from both mapping locations. Replace with `officeName` and `officePhone`. The Trestle $select should also drop `ListAgentDirectPhone` and `ListAgentFullName` — replace with `ListOfficeName,ListOfficePhone`.

- [ ] **Step 3: Run validators**

Run: `npm run test:compliance && npm run idx:validate:fails`
Expected: PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
git add app/api/open-houses/route.ts lib/compliance/__tests__/vow-tier-separation.test.ts
git commit -m "fix(compliance): strip agent direct phone from public open houses

Replace ListAgentDirectPhone with ListOfficePhone per REBNY IDX rules.
Agent PII must not appear in public/IDX responses."
```

---

## Task 3: Fix Agent Past Deals and Listings — Strip ClosePrice

**Files:**
- Modify: `app/api/agents/[slug]/past-deals/route.ts`
- Modify: `app/api/agents/[slug]/listings/route.ts`

- [ ] **Step 1: Fix past-deals route**

In `app/api/agents/[slug]/past-deals/route.ts`, strip closePrice from the public response. Find the mapping (approximately line 68):

**Before:**
```typescript
closePrice: d.close_price ? Number(d.close_price) : null,
```

**After:**
Remove the `closePrice` line entirely. The public past-deals response should show that a deal closed (status, date, address) but NOT the price. Add a comment:

```typescript
// closePrice stripped — VOW-tier data, not for public IDX display
// Agents see full deal data in CRM (authenticated)
```

- [ ] **Step 2: Fix agent listings route**

In `app/api/agents/[slug]/listings/route.ts`, the closed listings already go through `toPublicDTO()` which no longer includes closePrice (fixed in Task 1). Verify by reading lines 134-137:

```typescript
return {
  active: activeMapped.map(toPublicDTO),
  closed: closedMapped.map(toPublicDTO),  // closePrice already stripped by Task 1
};
```

No code change needed if Task 1 is complete. Verify only.

- [ ] **Step 3: Run validators**

Run: `npm run test:compliance && npm run idx:validate:fails`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/agents/[slug]/past-deals/route.ts
git commit -m "fix(compliance): strip closePrice from public agent past deals

Past deals page shows deal happened but not the price.
Full deal data available in authenticated CRM view."
```

---

## Task 4: Fix Building Sale History — Keep ACRIS, Strip Trestle ClosePrice

**Files:**
- Modify: `app/api/listings/building/route.ts`
- Modify: `app/components/BuildingUnits.tsx`

The building route already fetches ACRIS sales (public records, no restrictions). The fix: strip Trestle-sourced ClosePrice from the public response, keep ACRIS-sourced prices.

- [ ] **Step 1: Add test for source-based filtering**

Append to `lib/compliance/__tests__/vow-tier-separation.test.ts`:

```typescript
describe('Building Sale History — Source Filtering', () => {
  it('ACRIS-sourced sales may include closePrice (public records)', () => {
    const acrisSale = { source: 'acris', closePrice: 500000 };
    expect(acrisSale.source).toBe('acris');
    expect(acrisSale.closePrice).toBeDefined();
  });

  it('MLS-sourced sales must NOT include closePrice on public pages', () => {
    const mlsSale = { source: 'mls', closePrice: 500000 };
    // Strip closePrice from MLS-sourced sales in public responses
    const sanitized = { ...mlsSale, closePrice: undefined };
    expect(sanitized.closePrice).toBeUndefined();
  });
});
```

- [ ] **Step 2: Fix building route — strip Trestle closePrice from MLS sales**

In `app/api/listings/building/route.ts`, find the Trestle closed sales mapping (approximately lines 242-255). Change:

**Before:**
```typescript
const trestleSales = displayableClosed.map((r: Record<string, unknown>) => ({
  id: String(r.ListingKey || r.ListingId),
  mlsId: String(r.ListingId || ''),
  closePrice: Number(r.ClosePrice || r.ListPrice || 0),
  // ...
  source: 'mls' as const,
}));
```

**After:**
```typescript
const trestleSales = displayableClosed.map((r: Record<string, unknown>) => ({
  id: String(r.ListingKey || r.ListingId),
  mlsId: String(r.ListingId || ''),
  // closePrice stripped — VOW-tier data from Trestle, not for public IDX display
  // ACRIS-sourced sales retain closePrice (NYC public records, no IDX restriction)
  closePrice: 0,
  // ...
  source: 'mls' as const,
}));
```

Also: the Trestle $select on line 199 can drop `ClosePrice` since we no longer use it publicly. Change `ClosePrice,ListPrice,` to just `ListPrice,`.

- [ ] **Step 3: Update BuildingUnits component — label ACRIS, hide MLS prices**

In `app/components/BuildingUnits.tsx`, update the price display (approximately line 178):

**Before:**
```typescript
<span className="text-[13px] text-brand-dark">{formatPrice(sale.closePrice)}</span>
```

**After:**
```typescript
<span className="text-[13px] text-brand-dark">
  {sale.source === 'acris' && sale.closePrice > 0
    ? formatPrice(sale.closePrice)
    : '—'}
</span>
```

This shows prices only for ACRIS-sourced records. MLS-sourced records show a dash.

- [ ] **Step 4: Run validators**

Run: `npm run test:compliance && npm run idx:validate:fails`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/listings/building/route.ts app/components/BuildingUnits.tsx lib/compliance/__tests__/vow-tier-separation.test.ts
git commit -m "fix(compliance): building sales use ACRIS prices only, strip Trestle VOW

MLS-sourced ClosePrice is VOW-tier — stripped from public display.
ACRIS deed prices are NYC public records — retained with source label."
```

---

## Task 5: Fix Listing Detail Page — Gate VOW Sections

**Files:**
- Modify: `app/listing/[id]/page.tsx`
- Modify: `app/components/PriceHistory.tsx`

- [ ] **Step 1: Update PriceHistory to accept only IDX-safe props**

In `app/components/PriceHistory.tsx`, update the interface and timeline builder:

**Change interface (lines 13-24):**
```typescript
interface PriceHistoryProps {
  listPrice: number;
  status: string;
  onMarketDate?: string;
  listingContractDate: string;
  modificationTimestamp: string;
  listingType: 'sale' | 'rent';
  // ACRIS public record price (optional, from building sale history)
  acrisClosePrice?: number;
  acrisCloseDate?: string;
}
```

Remove `originalListPrice`, `previousListPrice`, `closePrice`, `closeDate` from props.

**Update `buildTimeline` function:**
- Remove the "Listed" event that uses `originalListPrice` (lines 52-62) — replace with `listPrice`
- Remove the "Price Change" event that uses `previousListPrice` (lines 64-80) entirely
- Replace the "Sold" event (lines 117-128) to use ACRIS data only:

```typescript
if (props.status === 'Closed' && props.acrisClosePrice && props.acrisClosePrice > 0) {
  const changeAmount = props.acrisClosePrice - props.listPrice;
  const changePercent = (changeAmount / props.listPrice) * 100;
  events.push({
    date: props.acrisCloseDate || props.modificationTimestamp,
    eventType: 'Sold (Public Record)',
    price: props.acrisClosePrice,
    changeAmount,
    changePercent,
  });
}
```

- [ ] **Step 2: Update listing detail page**

In `app/listing/[id]/page.tsx`, update the PriceHistory call (lines 1206-1218):

**Before:**
```typescript
<PriceHistory
  listPrice={listing.listPrice}
  originalListPrice={listing.originalListPrice}
  previousListPrice={listing.previousListPrice}
  closePrice={listing.closePrice}
  status={listing.status}
  onMarketDate={listing.onMarketDate}
  listingContractDate={listing.listingContractDate}
  modificationTimestamp={listing.modificationTimestamp}
  closeDate={listing.closeDate}
  listingType={listing.listingType}
/>
```

**After:**
```typescript
<PriceHistory
  listPrice={listing.listPrice}
  status={listing.status}
  onMarketDate={listing.onMarketDate}
  listingContractDate={listing.listingContractDate}
  modificationTimestamp={listing.modificationTimestamp}
  listingType={listing.listingType}
  acrisClosePrice={lastUnitSale?.source === 'acris' ? lastUnitSale.closePrice : undefined}
  acrisCloseDate={lastUnitSale?.source === 'acris' ? lastUnitSale.closeDate ?? undefined : undefined}
/>
```

- [ ] **Step 3: Update "Last Sale" section to only show ACRIS data**

In `app/listing/[id]/page.tsx`, update the Last Sale section (lines 1259-1291):

**Before:**
```typescript
{lastUnitSale && lastUnitSale.closePrice > 0 && (
```

**After:**
```typescript
{lastUnitSale && lastUnitSale.source === 'acris' && lastUnitSale.closePrice > 0 && (
```

This ensures only ACRIS-sourced (public record) sales are shown. MLS-sourced closed prices are hidden.

- [ ] **Step 4: Run validators**

Run: `npm run test:compliance && npm run idx:validate:fails`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/listing/[id]/page.tsx app/components/PriceHistory.tsx
git commit -m "fix(compliance): listing page shows ACRIS prices only, strips Trestle VOW

PriceHistory component no longer accepts VOW props.
Last Sale section only renders ACRIS-sourced (public record) prices.
MLS ClosePrice, OriginalListPrice, PreviousListPrice removed from public view."
```

---

## Task 6: Update Card Fields for Public Search

**Files:**
- Modify: `lib/idx/card-fields.ts`

- [ ] **Step 1: Remove VOW fields from public card selection**

In `lib/idx/card-fields.ts`, find the fields list and remove:

```typescript
// DELETE these lines from CARD_SELECT_FIELDS:
"DaysOnMarket", "CumulativeDaysOnMarket",
"OriginalListPrice", "PreviousListPrice",
"ClosePrice",
"CloseDate",
```

Keep `ListPrice`, `MlsStatus`, `StandardStatus` — those are IDX-safe.

- [ ] **Step 2: Run validators**

Run: `npm run test:compliance && npm run idx:validate:fails`
Expected: PASS (validator may flag reduced field count — update expected count if needed)

- [ ] **Step 3: Commit**

```bash
git add lib/idx/card-fields.ts
git commit -m "fix(compliance): remove VOW fields from public search card selection

DaysOnMarket, ClosePrice, OriginalListPrice, PreviousListPrice
no longer fetched for public search results."
```

---

## Task 7: Add Validator Sections for VOW Leak Detection

**Files:**
- Modify: `scripts/idx-validate.js`

Add two new validator sections that will catch any future VOW field leaks.

- [ ] **Step 1: Add Section 36 — Public DTO VOW Field Check**

In `scripts/idx-validate.js`, add a new section after the existing ones:

```javascript
// ── Section 36: PublicListingDTO VOW Field Separation ──
{
  num: 36,
  title: 'PublicListingDTO VOW Field Separation',
  category: 'Compliance',
  items: (() => {
    const items = [];
    const publicDtoFile = fs.readFileSync('lib/idx/public-dto.ts', 'utf8');

    const vowFields = ['closePrice', 'originalListPrice', 'previousListPrice', 'daysOnMarket', 'cumulativeDaysOnMarket'];

    for (const field of vowFields) {
      // Check interface — field must NOT be in PublicListingDTO
      const inInterface = publicDtoFile.match(new RegExp(`^\\s+${field}[?:]`, 'm'));
      items.push({
        status: inInterface ? 'FAIL' : 'PASS',
        severity: inInterface ? 'CRITICAL' : 'INFO',
        name: `PublicListingDTO must not contain ${field}`,
        detail: inInterface
          ? `VOW field "${field}" found in PublicListingDTO interface — must be removed`
          : `VOW field "${field}" correctly absent from PublicListingDTO`,
      });
    }

    return items;
  })(),
}
```

- [ ] **Step 2: Add Section 37 — Public API Agent PII Check**

```javascript
// ── Section 37: Public API Agent PII Protection ──
{
  num: 37,
  title: 'Public API Agent PII Protection',
  category: 'Compliance',
  items: (() => {
    const items = [];
    const ohFile = fs.readFileSync('app/api/open-houses/route.ts', 'utf8');

    const hasDirect = ohFile.includes('ListAgentDirectPhone');
    items.push({
      status: hasDirect ? 'FAIL' : 'PASS',
      severity: hasDirect ? 'CRITICAL' : 'INFO',
      name: 'Open houses must not expose ListAgentDirectPhone',
      detail: hasDirect
        ? 'ListAgentDirectPhone found in open-houses route — must use ListOfficePhone instead'
        : 'Open houses correctly use office phone, not agent direct phone',
    });

    const hasAgentName = ohFile.includes('ListAgentFullName');
    items.push({
      status: hasAgentName ? 'FAIL' : 'PASS',
      severity: hasAgentName ? 'CRITICAL' : 'INFO',
      name: 'Open houses must not expose ListAgentFullName',
      detail: hasAgentName
        ? 'ListAgentFullName found in open-houses route — must use ListOfficeName instead'
        : 'Open houses correctly use office name, not agent name',
    });

    return items;
  })(),
}
```

- [ ] **Step 3: Run the updated validator**

Run: `npm run idx:validate`
Expected: All sections PASS including new s36 and s37. If any FAIL, a previous task was not completed correctly.

- [ ] **Step 4: Commit**

```bash
git add scripts/idx-validate.js
git commit -m "feat(validator): add s36 VOW field separation + s37 agent PII checks

Catches future regressions where VOW fields leak into PublicListingDTO
or agent PII appears in public API responses."
```

---

## Task 8: Update UCBA Audit Checklist

**Files:**
- Modify: `compliance/rules/ucba-audit-checklist.json`

- [ ] **Step 1: Add VOW/IDX separation rules**

Add new entries to the checklist under an appropriate section:

```json
{
  "id": "IDX-VOW-01",
  "name": "PublicListingDTO excludes ClosePrice",
  "ucbaRef": "Art. I, Sec. 2 — IDX Display",
  "priority": "CRITICAL",
  "requirement": "ClosePrice is VOW-tier data and must not appear in public IDX responses",
  "verifyDescription": "Check lib/idx/public-dto.ts PublicListingDTO interface for closePrice",
  "pattern": "closePrice.*null|closePrice.*number",
  "directory": "lib/idx",
  "targetFile": "public-dto.ts",
  "expectedVerdict": "FAIL"
},
{
  "id": "IDX-VOW-02",
  "name": "Public API strips agent direct phone",
  "ucbaRef": "Art. I, Sec. 5(C) — No Agent Info",
  "priority": "CRITICAL",
  "requirement": "ListAgentDirectPhone must not appear in public IDX API responses",
  "verifyDescription": "Check app/api/open-houses/route.ts for ListAgentDirectPhone",
  "pattern": "ListAgentDirectPhone",
  "directory": "app/api/open-houses",
  "expectedVerdict": "FAIL"
}
```

- [ ] **Step 2: Run UCBA audit**

Run: `npm run ucba:audit`
Expected: New rules show PASS (if previous tasks completed) or FAIL (if not yet done).

- [ ] **Step 3: Commit**

```bash
git add compliance/rules/ucba-audit-checklist.json
git commit -m "feat(compliance): add IDX/VOW separation rules to UCBA audit checklist

IDX-VOW-01: ClosePrice must not be in PublicListingDTO
IDX-VOW-02: Agent direct phone must not be in public APIs"
```

---

## Task 9: Final Validation Sweep

- [ ] **Step 1: Run full compliance test suite**

Run: `npm run test:compliance`
Expected: ALL PASS

- [ ] **Step 2: Run IDX validator**

Run: `npm run idx:validate`
Expected: ALL PASS including new s36 and s37

- [ ] **Step 3: Run UCBA audit**

Run: `npm run ucba:audit`
Expected: No new regressions

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors (interfaces changed, all consumers updated)

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds. No reference to removed closePrice/originalListPrice/previousListPrice props.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final validation sweep — IDX/VOW separation complete

All compliance tests PASS. Validator s36+s37 PASS. UCBA audit clean.
TypeScript compiles. Build succeeds."
```
