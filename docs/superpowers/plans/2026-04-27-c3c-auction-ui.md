# C3c — Auction Form Sub-Section + Listing Banner UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans for task-by-task execution. Steps use checkbox (`- [ ]`) syntax. Required before any commit: invoke the `rebny-compliance` skill — this PR touches CRM listing submission UI and public listing display, both compliance-sensitive surfaces.

**Goal:** Surface the auction-listing fields (already in schema as of PR #50, already validator-enforced as of PR #57) in two UI surfaces: (a) a collapsible "Auction" sub-section in `public/crm/SALE-FORM-REDESIGN.html` so listing agents can mark a sale as auction-style and capture `auction_type`, `auction_start_date`, `auction_end_date`, `auction_terms_url`; (b) a high-visibility banner on the public listing detail page (`app/listing/[id]/page.tsx`) when `auction_yn=true` indicating "This property is being sold at auction. Bidding ends [date]. View terms."

**Architecture:** Pure additive UI. Schema, validator, and write-path enforcement (UCBA Art. I codes AU-001..AU-005) are already shipped. The form sub-section piggybacks on the existing `data-rls-field="..."` convention used throughout `SALE-FORM-REDESIGN.html` so it submits naturally. The listing-page banner is a small new server component rendered above the price/details block. No new API routes; no schema changes; no new dependencies.

**Tech Stack:** Plain HTML + the existing form's vanilla JS submit handler (no framework on the form page); Next.js App Router server component for the public banner; Tailwind classes consistent with the existing design system.

---

## Pre-flight

- [ ] **Step 1: Worktree off origin/main**
  ```bash
  cd C:/Users/MayaAllan/Desktop/mallan-nyc
  git fetch origin main
  git worktree add ../mallan-nyc-c3c feat/c3c-auction-form-ui origin/main
  cd ../mallan-nyc-c3c
  npm ci
  ```

- [ ] **Step 2: Confirm baseline**
  ```bash
  npm run ops:health        # state=ok
  npm run ucba:audit        # 0 regressions
  npm run rls:validate
  npm run idx:validate
  ```
  Save the exit codes / pass counts as the baseline. Same or better is required at PR time.

- [ ] **Step 3: Confirm the schema + validator are already on main**
  ```bash
  grep -n "auction_yn" prisma/schema.prisma     # → 5 lines around 495
  grep -n 'AU-001"' lib/compliance/rls-enforcement.ts  # → line ~698
  ```
  If either is missing, STOP — schema (PR #50) and validator (PR #57) must be present before C3c can ship.

## File Structure

| File | Role |
|---|---|
| Modify: `public/crm/SALE-FORM-REDESIGN.html` | Add the Auction sub-section markup + the small JS that hides/shows it based on the auction toggle. |
| Create: `app/components/AuctionBanner.tsx` | Server component rendered above price block on `/listing/[id]` when `auction_yn=true`. |
| Modify: `app/listing/[id]/page.tsx` | Import + render `<AuctionBanner>` conditionally. |
| Modify: `lib/idx/public-dto.ts` | Surface `auction_yn`, `auction_type`, `auction_start_date`, `auction_end_date`, `auction_terms_url` on the public DTO so the page component can read them. (Schema is in DB; DTO is what the page sees.) |
| Create: `app/components/__tests__/AuctionBanner.test.tsx` | Unit test — renders nothing when not auction; renders banner with correct copy when auction. |
| Create: `tests/runtime/auction-form-flow.test.ts` | Runtime test — JSDOM mounts the form, ticks `Auction yes`, fills fields, submits via the form's existing JS path, asserts the request body contains the auction fields. |

---

## Task 1: Add auction fields to the public DTO

**Files:**
- Modify: `lib/idx/public-dto.ts`
- Test: `lib/idx/__tests__/public-dto-auction.test.ts` (create if it doesn't exist; use whatever `__tests__` folder pattern this DTO already uses — search the file's directory before deciding).

The page component can only see what `toPublicDTO()` returns. We need it to expose the auction fields. These are NOT a Trestle/REBNY permission gate — they're substantive listing facts that mallan-internal agents fill in. They're safe to expose publicly when set.

- [ ] **Step 1: Read the existing DTO surface**

  ```bash
  grep -n "auction" lib/idx/public-dto.ts          # likely no matches yet
  grep -n "PublicListingDTO" lib/idx/public-dto.ts # find the interface
  ```

  Note the exact field-naming convention used (camelCase vs snake_case).

- [ ] **Step 2: Write a failing test**

  Path: pick `lib/idx/__tests__/public-dto-auction.test.ts` if `__tests__` is already in use; otherwise put it next to existing DTO tests.

  ```typescript
  import { describe, it, expect } from "vitest";
  import { toPublicDTO } from "@/lib/idx/public-dto";

  describe("toPublicDTO — auction fields", () => {
    const baseListing = { /* minimal valid input — copy from an existing DTO test */ };

    it("exposes auction_yn=false as null/false on non-auction listings", () => {
      const dto = toPublicDTO({ ...baseListing, auction_yn: false } as any);
      expect(dto.auction).toBeFalsy();  // adjust assertion shape per chosen DTO surface
    });

    it("exposes auction details when auction_yn=true", () => {
      const dto = toPublicDTO({
        ...baseListing,
        auction_yn: true,
        auction_type: "Absolute",
        auction_end_date: new Date("2026-06-15T17:00:00Z"),
        auction_terms_url: "https://example.com/terms.pdf",
      } as any);
      expect(dto.auction).toBeTruthy();
      expect(dto.auction?.type).toBe("Absolute");
      expect(dto.auction?.endDate).toBe("2026-06-15T17:00:00.000Z");
      expect(dto.auction?.termsUrl).toBe("https://example.com/terms.pdf");
    });
  });
  ```

- [ ] **Step 3: Run test, confirm fail**
  ```bash
  npx vitest run lib/idx/__tests__/public-dto-auction.test.ts
  ```
  Expected: FAIL — `dto.auction` is undefined.

- [ ] **Step 4: Implement**

  Add to the `PublicListingDTO` type:
  ```typescript
  auction?: {
    type: "Absolute" | "WithReserve" | "Minimum";
    startDate: string | null;
    endDate: string;
    termsUrl: string | null;
  } | null;
  ```

  In `toPublicDTO()`, when source has `auction_yn === true`:
  ```typescript
  const auction = (source.auction_yn === true)
    ? {
        type: source.auction_type as "Absolute" | "WithReserve" | "Minimum",
        startDate: source.auction_start_date ? new Date(source.auction_start_date).toISOString() : null,
        endDate: source.auction_end_date ? new Date(source.auction_end_date).toISOString() : "",
        termsUrl: source.auction_terms_url ?? null,
      }
    : null;
  ```

  Add `auction` to the returned object.

- [ ] **Step 5: Run tests, confirm pass + type-check**
  ```bash
  npx vitest run lib/idx/__tests__/public-dto-auction.test.ts
  npm run type-check
  ```

- [ ] **Step 6: Invoke rebny-compliance skill, then commit**
  ```bash
  git add lib/idx/public-dto.ts lib/idx/__tests__/public-dto-auction.test.ts
  git commit -m "feat(public-dto): expose auction fields when auction_yn=true (C3c precursor)"
  ```

## Task 2: Build the AuctionBanner component

**Files:**
- Create: `app/components/AuctionBanner.tsx`
- Create: `app/components/__tests__/AuctionBanner.test.tsx`

UCBA Art. I treats auctions as the exception to the 24-hour price-change rule. The banner must:
1. Be unmissable (high visual weight, top of page near price)
2. State the bidding-end timestamp explicitly
3. Link to the auction terms doc when present
4. Render NOTHING on non-auction listings (no banner = no false signal)

- [ ] **Step 1: Write failing tests**

  ```tsx
  // app/components/__tests__/AuctionBanner.test.tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@testing-library/react";
  import AuctionBanner from "../AuctionBanner";

  describe("AuctionBanner", () => {
    it("renders nothing when listing is not an auction", () => {
      const { container } = render(<AuctionBanner auction={null} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders type, end date, and terms link when auction set", () => {
      render(
        <AuctionBanner
          auction={{
            type: "Absolute",
            startDate: null,
            endDate: "2026-06-15T17:00:00.000Z",
            termsUrl: "https://example.com/terms.pdf",
          }}
        />
      );
      expect(screen.getByText(/auction/i)).toBeInTheDocument();
      expect(screen.getByText(/Absolute/)).toBeInTheDocument();
      expect(screen.getByText(/Jun 15, 2026/)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /terms/i });
      expect(link).toHaveAttribute("href", "https://example.com/terms.pdf");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    });

    it("omits the terms link when termsUrl is null", () => {
      render(
        <AuctionBanner
          auction={{
            type: "WithReserve",
            startDate: null,
            endDate: "2026-06-15T17:00:00.000Z",
            termsUrl: null,
          }}
        />
      );
      expect(screen.queryByRole("link", { name: /terms/i })).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run tests, confirm fail**
  ```bash
  npx vitest run app/components/__tests__/AuctionBanner.test.tsx
  ```

- [ ] **Step 3: Implement**

  ```tsx
  // app/components/AuctionBanner.tsx
  // Server component. Renders an attention banner above the price block on
  // /listing/[id] when the listing is being sold via auction. UCBA Art. I
  // exception path — the auction end date is substantive, so we surface it
  // explicitly and link to the terms doc when provided.
  import type { PublicListingDTO } from "@/lib/idx/public-dto";

  type Auction = NonNullable<PublicListingDTO["auction"]>;

  function formatAuctionEnd(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    return `${dateStr} at ${timeStr}`;
  }

  export default function AuctionBanner({ auction }: { auction: Auction | null | undefined }) {
    if (!auction || !auction.endDate) return null;
    const endLabel = formatAuctionEnd(auction.endDate);
    const typeLabel =
      auction.type === "Absolute" ? "Absolute Auction" :
      auction.type === "WithReserve" ? "Auction (Reserve)" :
      auction.type === "Minimum" ? "Auction (Minimum Bid)" :
      "Auction";

    return (
      <div
        role="region"
        aria-label="Auction notice"
        className="mb-6 rounded-lg border-2 border-amber-500 bg-amber-50 px-5 py-4 text-amber-900"
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-bold uppercase tracking-wide">{typeLabel}</span>
          <span className="text-sm font-medium">
            Bidding ends <span className="font-semibold">{endLabel}</span>
          </span>
          {auction.termsUrl && (
            <a
              href={auction.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-sm font-semibold underline hover:text-amber-700"
            >
              View auction terms →
            </a>
          )}
        </div>
        <p className="mt-1 text-xs text-amber-800">
          This property is being sold at auction. The auction end date is binding;
          standard listing rules around price changes do not apply (UCBA Art. I).
        </p>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run tests, confirm pass**
  ```bash
  npx vitest run app/components/__tests__/AuctionBanner.test.tsx
  npm run type-check
  ```

- [ ] **Step 5: Invoke rebny-compliance, then commit**
  ```bash
  git add app/components/AuctionBanner.tsx app/components/__tests__/AuctionBanner.test.tsx
  git commit -m "feat(listing-ui): AuctionBanner component (UCBA Art. I exception path)"
  ```

## Task 3: Wire AuctionBanner into the listing page

**Files:**
- Modify: `app/listing/[id]/page.tsx`

- [ ] **Step 1: Locate the price block**

  Find the JSX where the price + key facts render (search for `PriceWithCalculator` or similar). The banner goes immediately above this so it's the first thing readers see on the detail block.

- [ ] **Step 2: Import + render**

  ```tsx
  import AuctionBanner from "@/app/components/AuctionBanner";
  // ...
  <AuctionBanner auction={listing.auction} />
  <PriceWithCalculator ... />
  ```

  If the page component already has a `listing` (or `dto`) variable holding the public DTO, use that. If the field is on a different shape (e.g. `dto.auction`), match the actual shape.

- [ ] **Step 3: Smoke-test against an auction listing**

  Pick (or create) an auction listing in the DB. Visit `/listing/[id]` locally:
  ```bash
  npm run dev
  # open http://localhost:3000/listing/<id-of-an-auction-listing>
  ```
  Expected: amber banner above price block. Try with a non-auction listing — banner absent.

  If you don't have an auction listing in dev, set `auction_yn=true`, `auction_type='Absolute'`, `auction_end_date=NOW()+30 days` on a sample listing in your local DB.

- [ ] **Step 4: Commit**
  ```bash
  git add app/listing/[id]/page.tsx
  git commit -m "feat(listing-page): render AuctionBanner above price when auction_yn=true"
  ```

## Task 4: Auction sub-section in SALE-FORM-REDESIGN.html

**Files:**
- Modify: `public/crm/SALE-FORM-REDESIGN.html`

The form already has a consistent pattern for collapsible sub-sections and `data-rls-field="..."` inputs that the existing submit handler picks up automatically. We follow that pattern.

- [ ] **Step 1: Locate the right insertion point**

  Open `public/crm/SALE-FORM-REDESIGN.html` and search for a section near the listing-status / price block — somewhere a listing agent would expect "auction settings" to live (often near `saleStatus` around line 567). Pick the line right after a current section closes (`</section>` or `</div>` matching the section container pattern).

- [ ] **Step 2: Insert the markup**

  Use the same visual style as adjacent sub-sections. Match indentation. The toggle controls visibility of the rest of the section. Each input carries `data-rls-field="..."` matching the schema column name.

  ```html
  <!-- ── Auction (UCBA Art. I exception path) ─────────────────────── -->
  <section class="form-section" id="saleAuctionSection">
    <header class="form-section-header" onclick="toggleSection('saleAuctionSection')">
      <h3 class="text-sm font-bold text-gray-700">Auction (optional)</h3>
      <span class="form-section-toggle">+</span>
    </header>
    <div class="form-section-body">
      <div class="form-row">
        <label class="text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            id="saleAuctionYn"
            data-rls-field="auction_yn"
            onchange="toggleAuctionFields()"
          />
          This listing is being sold at auction
        </label>
      </div>

      <div id="saleAuctionFields" style="display:none">
        <div class="form-row">
          <label class="text-xs font-semibold text-gray-700">Auction type *</label>
          <select id="saleAuctionType" class="field-input" data-rls-field="auction_type">
            <option value="">— select —</option>
            <option value="Absolute">Absolute (no reserve)</option>
            <option value="WithReserve">With Reserve</option>
            <option value="Minimum">Minimum Bid</option>
          </select>
        </div>
        <div class="form-row">
          <label class="text-xs font-semibold text-gray-700">Auction start date</label>
          <input type="datetime-local" id="saleAuctionStartDate" class="field-input"
                 data-rls-field="auction_start_date">
        </div>
        <div class="form-row">
          <label class="text-xs font-semibold text-gray-700">Auction end date * <span class="text-xs text-gray-500">(bidding-ends timestamp)</span></label>
          <input type="datetime-local" id="saleAuctionEndDate" class="field-input"
                 data-rls-field="auction_end_date">
        </div>
        <div class="form-row">
          <label class="text-xs font-semibold text-gray-700">Auction terms URL <span class="text-xs text-gray-500">(public terms doc — minimum bid, registration, inspection, buyer's premium)</span></label>
          <input type="url" id="saleAuctionTermsUrl" class="field-input"
                 placeholder="https://…"
                 data-rls-field="auction_terms_url">
        </div>
        <p class="text-xs text-gray-600">
          Required when auction is on: type and end date. Recommended: terms URL.
          UCBA Art. I — auction exception path.
        </p>
      </div>
    </div>
  </section>
  ```

  **Important:** before pasting verbatim, check what helper class names + JS function names the file actually uses for collapsible sections (it may be `toggleSection`, may be something else). Match those exactly. If the file uses a different markup pattern, adapt.

- [ ] **Step 3: Add the show/hide JS**

  Find the in-file `<script>` block where similar handlers live (search for `function toggleSection` or other on-change handlers). Append:

  ```javascript
  function toggleAuctionFields() {
    var on = document.getElementById('saleAuctionYn').checked;
    var fields = document.getElementById('saleAuctionFields');
    if (fields) fields.style.display = on ? '' : 'none';
    if (!on) {
      // Clear so we never submit stale auction data when the toggle is off.
      ['saleAuctionType','saleAuctionStartDate','saleAuctionEndDate','saleAuctionTermsUrl'].forEach(function(id){
        var el = document.getElementById(id); if (el) el.value = '';
      });
    }
  }
  ```

- [ ] **Step 4: Manual smoke**

  ```bash
  npm run dev
  # open http://localhost:3000/crm/SALE-FORM-REDESIGN.html (or wherever broker logs in to the form)
  ```
  - Toggle "This listing is being sold at auction" → fields appear
  - Toggle off → fields disappear AND clear
  - Submit a listing with auction toggled on but `auction_type` blank → server returns AU-001 blocker (validator already enforces this on `app/api/crm/sales/listings/route.ts`)
  - Submit valid auction data → 200, listing saved with auction fields, public listing page shows banner

- [ ] **Step 5: Commit**
  ```bash
  git add public/crm/SALE-FORM-REDESIGN.html
  git commit -m "feat(sale-form): add auction sub-section with toggle (C3c)"
  ```

## Task 5: Form-flow runtime test

**Files:**
- Create: `tests/runtime/auction-form-flow.test.ts`

Mirrors the existing `tests/runtime/auth-ethics-gate.test.ts` style.

- [ ] **Step 1: Write the test**

  ```typescript
  // tests/runtime/auction-form-flow.test.ts
  // Boots SALE-FORM-REDESIGN.html in JSDOM, ticks the auction toggle, fills
  // valid auction fields, then asserts the form would submit a payload that
  // INCLUDES the four auction fields. Schema + validator are already gated;
  // this proves the UI plumbing is correct.
  import { describe, it, expect } from "vitest";
  import { JSDOM } from "jsdom";
  import { readFileSync } from "node:fs";
  import { resolve } from "node:path";

  const FORM = resolve(__dirname, "..", "..", "public", "crm", "SALE-FORM-REDESIGN.html");

  describe("auction sub-section in SALE-FORM-REDESIGN.html", () => {
    it("toggle reveals/hides auction fields", () => {
      const html = readFileSync(FORM, "utf8");
      const dom = new JSDOM(html, { runScripts: "dangerously" });
      const doc = dom.window.document;

      const toggle = doc.getElementById("saleAuctionYn") as HTMLInputElement | null;
      const fields = doc.getElementById("saleAuctionFields") as HTMLElement | null;
      expect(toggle).not.toBeNull();
      expect(fields).not.toBeNull();

      // Initially hidden
      expect(fields!.style.display).toBe("none");

      toggle!.checked = true;
      toggle!.dispatchEvent(new dom.window.Event("change"));
      expect(fields!.style.display).not.toBe("none");

      toggle!.checked = false;
      toggle!.dispatchEvent(new dom.window.Event("change"));
      expect(fields!.style.display).toBe("none");

      dom.window.close();
    });

    it("auction fields all carry data-rls-field attributes the form's submit handler reads", () => {
      const html = readFileSync(FORM, "utf8");
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      const ids = ["saleAuctionYn","saleAuctionType","saleAuctionStartDate","saleAuctionEndDate","saleAuctionTermsUrl"];
      const expectedFields = ["auction_yn","auction_type","auction_start_date","auction_end_date","auction_terms_url"];
      ids.forEach((id, i) => {
        const el = doc.getElementById(id) as HTMLElement | null;
        expect(el, `element ${id} not found`).not.toBeNull();
        expect(el!.getAttribute("data-rls-field")).toBe(expectedFields[i]);
      });
      dom.window.close();
    });
  });
  ```

- [ ] **Step 2: Run, confirm pass**
  ```bash
  npx vitest run tests/runtime/auction-form-flow.test.ts
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add tests/runtime/auction-form-flow.test.ts
  git commit -m "test(c3c): runtime test asserts auction sub-section toggle + data-rls-field wiring"
  ```

## Task 6: Full audit + open PR

- [ ] **Step 1: All gates**
  ```bash
  npm run type-check
  npm run ucba:audit            # 0 regressions; AU-* validator rules already pass
  npm run rls:validate
  npm run idx:validate
  npm run crm:test              # if PR 11 has merged; otherwise skip with note
  npm run ops:health
  npm run ci
  ```

- [ ] **Step 2: Push + open PR**
  ```bash
  git push -u origin feat/c3c-auction-form-ui
  gh pr create --title "feat(c3c): auction form sub-section + listing banner UI" --body "$(cat <<'EOF'
  ## What

  Last piece of Workstream C3 (auction listings). Schema landed in PR #50, validator AU-001..AU-005 in PR #57. This PR adds:

  1. **Auction sub-section** in `SALE-FORM-REDESIGN.html` — toggle + 4 fields (`auction_type`, `auction_start_date`, `auction_end_date`, `auction_terms_url`). Submits via existing `data-rls-field` plumbing; backend validator enforces the rules.
  2. **AuctionBanner** server component on `/listing/[id]` — high-visibility amber banner with type, bidding-end timestamp, and terms link. Renders nothing on non-auction listings.
  3. **PublicListingDTO** — surfaces the auction object so the page can read it.

  ## UCBA reference

  Art. I — auction exception path. The auction end date is substantive (binding bid deadline), and the standard 24-hour price-change rule does not apply. Banner copy reflects that.

  ## Test coverage

  - `app/components/__tests__/AuctionBanner.test.tsx` — renders nothing on non-auction; renders type/date/link on auction; omits terms link when null.
  - `lib/idx/__tests__/public-dto-auction.test.ts` — DTO exposes auction details only when auction_yn=true.
  - `tests/runtime/auction-form-flow.test.ts` — JSDOM toggle + data-rls-field wiring.

  ## Production Verification Note

  **Post-deploy URL to hit:** Edit a sample listing in the form, toggle auction on, fill type+end date, submit. Confirm DB row has `auction_yn=true`. Then visit `https://mallan.nyc/listing/<id>` — amber banner above price.
  **Metric to observe:** No AU-001..AU-005 blocker errors in `/api/crm/sales/listings` POST/PUT logs for valid auction submissions. Any non-auction listing should NOT show the banner.
  **Rollback trigger:** Banner appears on non-auction listings, OR form fails to submit when auction is off, OR existing non-auction listings show the banner.
  **Success criteria within 30 minutes:** Test broker submits an auction listing through the form; banner renders on its public page; non-auction listings unchanged.

  EOF
  )"
  ```

- [ ] **Step 3: Wait for CI green, request review, merge**

- [ ] **Step 4: Update `memory/REFACTOR-2026-04-25.md`** Workstream C row C3c → `MERGED — <commit-sha> · <date>`.

## Definition of Done

- [ ] Auction sub-section visible + functional in `SALE-FORM-REDESIGN.html`
- [ ] AuctionBanner renders correctly on auction listings, absent on non-auction
- [ ] PublicListingDTO exposes the auction object
- [ ] All 3 new test files pass
- [ ] No UCBA regressions; AU-001..AU-005 still enforce on the write path
- [ ] PR merged + plan file updated
