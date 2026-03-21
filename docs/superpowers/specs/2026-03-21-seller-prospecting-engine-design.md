# Seller Prospecting Engine — Design Spec

> **Date:** 2026-03-21
> **Sub-Project:** SP-1 of 5
> **Status:** Approved — spec reviewed, critical issues resolved
> **Scope:** Pre-acquisition seller workflow — research, pitch, outreach, convert

---

## Problem

The CRM manages clients you already have. It does not help you GET clients. When approaching a potential seller, the broker needs: ownership research, pitch materials (CMA, pricing strategy, exposure plan, cost analysis), automated outreach scheduling, and trigger alerts for re-engagement. All of this is manual today.

## Solution

A **Seller Prospects** tab in the Sales CRM that automates the pre-acquisition workflow:

```
Enter address → Auto-research (ACRIS/DOF/DOB/PLUTO) → Build pitch packet → Outreach cadence → Trigger alerts → Convert to Active Seller
```

## Key Decision: Extend Existing Models

The codebase already has:
- `SellerLead` model (prisma/schema.prisma line 852) — address, BBL, owner info, readiness scoring, pipeline status, consent
- `ReadinessSignal` model (line 903) — individual scoring signals (ownership_duration, mortgage_age, equity, dob_permits)
- `OutreachEvent` model (line 924) — channel, direction, template_id, subject, body, outcome, TCPA consent_verified
- Scoring engine: `lib/seller-readiness/scorer.ts` — calls ACRIS, DOB, DOF, first-party signals
- Scoring cron: `app/api/cron/seller-scoring/route.ts` — batch rescoring
- Property research API: `GET /api/crm/property-research` — aggregates ACRIS + DOF + DOB + PLUTO

**We extend `SellerLead` + `OutreachEvent` + add `OutreachCadenceStep`. No new parallel model.**

---

## Architecture

### Where It Lives

New first tab in Sales CRM sidebar:

```
SALES CRM
├── Seller Prospects    ← NEW (uses SellerLead table)
├── Active Sellers
├── Active Buyers
├── ...
```

### New Files

| File | Purpose |
|------|---------|
| `public/crm/js/dashboard/panels/sales-crm/seller-prospects.js` | Prospect table + workspace |
| `public/crm/js/dashboard/panels/sales-crm/pitch-packet.js` | Pitch packet builder (4 pillars) |
| `public/crm/js/dashboard/panels/sales-crm/outreach-cadence.js` | Outreach timeline UI + automation |
| `app/api/crm/sales/prospects/route.ts` | CRUD for seller prospects (wraps SellerLead) |
| `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts` | Generate pitch packet data |
| `app/api/crm/sales/prospects/[id]/outreach/route.ts` | Outreach cadence CRUD |
| `app/api/crm/sales/prospects/[id]/pdf/route.ts` | PDF generation endpoint |
| `app/api/crm/sales/prospects/[id]/convert/route.ts` | Convert prospect to Active Seller |
| `app/api/crm/sales/prospects/import/route.ts` | CSV/Excel bulk contact import |
| `lib/email/templates/pitch-packet.ts` | Pitch packet email template |
| `lib/pdf/pitch-packet-renderer.ts` | Server-side PDF generation |

### Modified Files

| File | Change |
|------|--------|
| `public/crm/js/dashboard/panels/sales-crm/index.js` | Add "Seller Prospects" tab (tab 0) |
| `public/crm/js/dashboard/app.js` | Register `/sales/prospects` route + sidebar entry |
| `public/crm/dashboard.html` | Add script tags for new JS files |
| `app/api/crm/email/route.ts` | Add Twilio SMS delivery (replace logging) |
| `lib/email/templates.ts` | Export pitchPacketEmail template |
| `prisma/schema.prisma` | Extend SellerLead + new OutreachCadenceStep model |
| `package.json` | Add @react-pdf/renderer, twilio, xlsx |
| `vercel.json` | Register prospect-triggers cron |

### Reused (Already Built)

| Component | Location |
|-----------|----------|
| SellerLead model + scoring | `prisma/schema.prisma` lines 852-898 |
| ReadinessSignal model | `prisma/schema.prisma` lines 903-918 |
| OutreachEvent model | `prisma/schema.prisma` lines 924-946 |
| Scoring engine | `lib/seller-readiness/scorer.ts` |
| ACRIS signals | `lib/seller-readiness/signals/acris.ts` |
| DOF tax signals | `lib/seller-readiness/signals/dof-tax.ts` |
| DOB permits/violations | `lib/seller-readiness/signals/dob.ts` |
| First-party signals | `lib/seller-readiness/signals/first-party.ts` |
| Property research API | `GET /api/crm/property-research` |
| Seller scoring cron | `app/api/cron/seller-scoring/route.ts` |
| CMA engine | Existing CMA system |
| Net proceeds calculator | `panels/tools/net-proceeds.js` |
| Email system | `lib/email/sendgrid.ts` + `POST /api/crm/email` |
| Entity fields | `panels/shared/entity-fields.js` |
| Parties panel | `panels/shared/parties-panel.js` |
| Filter bar | `panels/shared/filter-bar.js` |
| Activity table | `panels/shared/activity-table.js` |
| Socrata/SODA client | `lib/soda.ts` |

---

## Data Model

### Extend: SellerLead (add these fields)

```prisma
model SellerLead {
  // ... existing fields (id, address, unit, borough, bbl, bin, owner_name/email/phone,
  //     readiness_score, score_grade, last_scored_at, status, assigned_agent_id,
  //     consent_given, consent_date, consent_method, notes, signals, outreach_events) ...

  // === NEW FIELDS (migration) ===

  // --- Property details (from PLUTO/manual) ---
  property_type         String?   @map("property_type")      // condo, coop, condop, townhouse, multi_family, commercial
  beds                  Int?
  baths                 Decimal?  @db.Decimal(3,1)
  sqft                  Int?
  year_built            Int?      @map("year_built")
  building_name         String?   @map("building_name")
  floors                Int?
  units_total           Int?      @map("units_total")
  lot_area              Int?      @map("lot_area")

  // --- Ownership enrichment (from ACRIS) ---
  entity_type           String?   @map("entity_type")        // individual, llc, trust, corp, inc
  entity_name           String?   @map("entity_name")
  ownership_years       Decimal?  @db.Decimal(4,1) @map("ownership_years")
  last_purchase_price   Decimal?  @db.Decimal(14,2) @map("last_purchase_price")
  last_purchase_date    DateTime? @map("last_purchase_date")
  mortgage_amount       Decimal?  @db.Decimal(14,2) @map("mortgage_amount")
  mortgage_date         DateTime? @map("mortgage_date")
  equity_ratio          Decimal?  @db.Decimal(3,2) @map("equity_ratio")  // 0.00-1.00 LTV ratio

  // --- Tax (from DOF) ---
  tax_class             String?   @map("tax_class")
  annual_tax            Decimal?  @db.Decimal(12,2) @map("annual_tax")
  market_value          Decimal?  @db.Decimal(14,2) @map("market_value")
  assessed_value        Decimal?  @db.Decimal(14,2) @map("assessed_value")

  // --- Building health (from DOB) ---
  open_violations       Int?      @default(0) @map("open_violations")
  recent_permits        Int?      @default(0) @map("recent_permits")
  building_risk         Decimal?  @db.Decimal(3,2) @map("building_risk")  // 0.00-1.00

  // --- Contact (secondary + professional) ---
  secondary_name        String?   @map("secondary_name")
  secondary_phone       String?   @map("secondary_phone")
  secondary_email       String?   @map("secondary_email")
  secondary_relationship String?  @map("secondary_relationship")
  management_company    String?   @map("management_company")
  attorney_name         String?   @map("attorney_name")
  attorney_email        String?   @map("attorney_email")
  attorney_phone        String?   @map("attorney_phone")
  authorized_signatories Json?    @map("authorized_signatories")  // [{ name, title, email, phone }]

  // --- Prospecting ---
  source                String?                               // expired_listing, door_knock, referral, acris_research, building_activity, neighbor_sold, imported, other
  source_detail         String?   @map("source_detail")       // e.g., "Imported from UN List"
  pitch_generated_at    DateTime? @map("pitch_generated_at")
  pitch_sent_at         DateTime? @map("pitch_sent_at")
  pitch_pdf_url         String?   @map("pitch_pdf_url")       // R2 URL

  // --- Conversion ---
  converted_to_lead_id  BigInt?   @map("converted_to_lead_id")
  converted_at          DateTime? @map("converted_at")

  // --- Outreach scheduling ---
  next_follow_up        DateTime? @map("next_follow_up")
  last_contacted_at     DateTime? @map("last_contacted_at")
  last_researched_at    DateTime? @map("last_researched_at")

  // --- TCPA alignment (add consent_captured_at to match Lead pattern) ---
  consent_captured_at   DateTime? @map("consent_captured_at")
  consent_opt_out_at    DateTime? @map("consent_opt_out_at")

  // --- New relation ---
  cadence_steps         OutreachCadenceStep[]
}
```

**Status values expanded:** `new | contacted | replied | meeting | pitched | signed | converted | declined | cold`

### New: OutreachCadenceStep

Tracks the automated outreach schedule per prospect. Different from OutreachEvent (which logs what happened). CadenceStep is what SHOULD happen.

```prisma
model OutreachCadenceStep {
  id              BigInt    @id @default(autoincrement())
  seller_lead_id  BigInt    @map("seller_lead_id")
  seller_lead     SellerLead @relation(fields: [seller_lead_id], references: [id], onDelete: Cascade)

  day_offset      Int       @map("day_offset")             // days from prospect creation
  type            String                                    // intro_cma, neighbor_sold, market_report, cost_analysis, follow_up, re_engage, custom
  channel         String    @default("email")               // email, sms, call, mail
  subject         String?
  content_preview String?   @db.Text @map("content_preview")

  status          String    @default("pending")             // pending, ready, sent, skipped
  scheduled_date  DateTime? @map("scheduled_date")
  sent_at         DateTime? @map("sent_at")
  opened_at       DateTime? @map("opened_at")
  replied_at      DateTime? @map("replied_at")

  content_type    String?   @map("content_type")            // pitch_packet, cma, market_report, cost_breakdown, custom
  content_data    Json?     @map("content_data")            // stored generated content

  created_at      DateTime  @default(now()) @map("created_at")
  updated_at      DateTime  @updatedAt @map("updated_at")

  @@index([seller_lead_id])
  @@index([scheduled_date])
  @@index([status])
  @@map("outreach_cadence_steps")
}
```

**Relationship:**
- `OutreachCadenceStep` = what SHOULD happen (schedule)
- `OutreachEvent` = what DID happen (audit trail)
- When agent sends a cadence step → CadenceStep.status = "sent" AND new OutreachEvent created

---

## UI Design

### Prospect Table (main view)

Top row: [Search by address/name] [Filter: status, source, score grade] [+ Add Prospect] [Import Contacts]

Table columns:
| Address | Owner | Status | Readiness (A-F) | Score | Last Contact | Next Follow-Up | Outreach Step | Actions |

- Status badge: Cold (gray), Warm (yellow), Hot (red), Meeting (blue), Pitched (purple), Converted (green)
- Readiness: letter grade A-F + score 0-100 bar
- Next Follow-Up: date + content type ready (e.g., "Day 7: Neighbor Sold")
- Actions: Quick send, Generate packet, Convert

Click row → Prospect Workspace

### Prospect Workspace (full page, back button to table)

5 tabs:

**Tab 1: Overview**
- Property details (auto from ACRIS/PLUTO)
- Ownership (entity type, name, signatories)
- Contact info (primary + secondary + management + attorney)
- Status selector
- Readiness score with signal breakdown (ownership duration, equity, building risk, etc.)
- All fields inline-editable (CRUD)

**Tab 2: Research**
- Full ACRIS data: deed history, mortgage records, equity estimate
- DOF: tax class, annual tax, market vs. assessed value
- DOB: recent permits, open violations, building risk
- PLUTO: building details
- Competition: active listings in same building/area (Trestle query)
- Building activity: recent closings in building (Trestle query)
- [Re-Run Research] button (rate-limited: max 1 per hour per prospect)
- REBNY RLS attribution on any Trestle-sourced data displayed

**Tab 3: Pitch Packet**

Four collapsible pillars:

**Pillar 1: Property Intel**
- CMA (auto from CMA engine)
- Recent sales in building (Trestle — with REBNY attribution)
- Active competition (Trestle — with REBNY attribution)
- Building activity summary

**Pillar 2: Pricing Strategy**
- 3 price points: conservative / recommended / aspirational
- Price per sqft vs. comps
- Competition positioning table
- Absorption rate
- Seasonal timing
- What-if scenarios (agent editable)
- Co-op/condo maintenance/flip tax impact

**Pillar 3: Exposure Plan (5 Layers)**
```
Layer 1: PRIVATE BUYER DATABASE — [dynamic count from Lead table] qualified buyers
Layer 2: LOCAL — StreetEasy + mallan.nyc + 570+ brokerage websites (30 IDX providers)
         30,400 LinkedIn followers
Layer 3: AGENT NETWORK — REBNY RLS (17,000+ agents, 570+ firms, 8 LMPs)
Layer 4: NATIONAL — Zillow, Realtor.com, Redfin, Homes.com, RentHop
Layer 5: INTERNATIONAL — ListHub → 100+ global portals, Trestle syndication
PLUS: Professional photography, floor plans, 3D tour, video/social,
      open houses, direct mail, signage, timeline (Day 1-14 rollout)
```

Note: Buyer database count is dynamically calculated: `SELECT COUNT(*) FROM leads WHERE 'buyer' = ANY(roles)`. Not hardcoded.

**Pillar 4: Financial Picture**
- Net proceeds calculator (existing tool surfaced here)
- Cost of sale breakdown (transfer tax, attorney, commission, mortgage payoff)
- Renovation ROI (optional)
- Bottom line: what they walk away with

**Actions:**
- [Generate PDF] → server-side @react-pdf/renderer → R2 storage
- [Email to Prospect] → PDF attachment via agent email channel
- [Download] → direct PDF download
- [Print] → browser print

PDF includes: REBNY RLS attribution disclaimer on all Trestle-sourced data.

**Tab 4: Outreach**
- Visual timeline of cadence steps (past + scheduled)
- Each step shows: day, type, channel, status, content preview
- Actions per step: [Send Now] [Edit] [Skip] [Reschedule]
- [+ Add Custom Step] button
- When sent: creates OutreachEvent audit trail record
- TCPA check: consent_captured_at OR consent_given must be set before email/SMS

**Tab 5: Notes & Activity**
- Timestamped notes (add new, view history)
- Activity log: all outreach events, status changes, research runs, pitch sends
- Reuses existing `activity-table.js` component

### Contact Import Modal

Triggered from "Import Contacts" button:

1. Upload CSV/XLSX file
2. Preview first 10 rows
3. Map columns: name (→ owner_name), email (→ owner_email), phone (→ owner_phone), address (optional), tags
4. Source label: "UN List", "Doctors List", "LinkedIn Export", etc. (→ source_detail)
5. Dedup: matches by address+unit (existing SellerLead unique constraint)
6. Confirm → creates SellerLead records (status: "new")
7. Summary: "Imported 2,847 contacts. 193 duplicates skipped."
8. Auto-research: queued (not synchronous) — processes 100/hour to respect SODA rate limits

---

## Outreach Cadence

### Default Seller Cadence (auto-created when prospect is added)

| Day | Type | Content | Channel |
|-----|------|---------|---------|
| 0 | research | Auto-research runs (ACRIS/DOF/DOB/PLUTO) | system |
| 1 | intro_cma | Intro letter + CMA | email |
| 7 | neighbor_sold | Recent sale in building/area | email |
| 14 | follow_up | Reminder: no response | call + email |
| 21 | market_report | Market report for area | email |
| 30 | cost_analysis | Cost-of-sale breakdown | email |
| 60 | re_engage | Fresh CMA (market moved) | email |
| 90 | re_engage | New angle or mark cold | email/call |

Each step:
- Auto-generates content from existing tools (CMA engine, market data, calculator)
- Shows as "Ready" on dashboard when scheduled_date arrives
- Agent reviews, customizes, clicks "Send"
- Can skip, reschedule, add custom steps
- Agent ALWAYS reviews before send — no automated sending without review

### Trigger Alerts

New cron: `prospect-triggers` (daily 9am) — registered in vercel.json

| Trigger | Detection | Alert |
|---------|-----------|-------|
| Unit in building listed | Trestle query by building name/address | "New competition for [prospect]'s building" |
| Unit in building sold | Trestle StatusChangeTimestamp | "Neighbor sold — re-engage [prospect]" |
| Price drop on competition | Trestle price change detection | "Market shifting for [prospect]'s area" |
| Hot prospect no follow-up 48h | DB: status=hot AND last_contacted_at < 48h ago | "Hot prospect needs follow-up NOW" |
| Cadence step due today | OutreachCadenceStep.scheduled_date = today | Dashboard count + content ready |

Alerts surface on: Home screen cards, prospect table urgency badge, email to agent (optional).

---

## Convert to Active Seller

Dedicated endpoint: `POST /api/crm/sales/prospects/:id/convert`

Does NOT modify the existing `/api/crm/convert` contract. Instead:

1. Creates new Lead record (or finds existing by email match)
2. Populates Lead with SellerLead data:
   - Contact → Lead.first_name, last_name, email, phone
   - Entity → Lead.entity_name, entity_type
   - Property → Lead.property_address, unit_number
   - Attorney → Lead.attorney_name, attorney_email, attorney_phone
   - Notes → carried over
3. Sets Lead fields: `roles = ["seller"]`, `pipeline_stage = "active_seller"`, `primary_portal_role = "seller"`
4. Calls existing convert logic internally (promote_to_listing action)
5. Updates SellerLead: `status = "converted"`, `converted_to_lead_id = lead.id`, `converted_at = now()`
6. Opens Seller Intake form pre-filled
7. Sends portal invite to seller

---

## SMS (Twilio)

In `app/api/crm/email/route.ts`, replace SMS logging block:

```typescript
import twilio from 'twilio';
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// On SMS send:
const consentOk = prospect.consent_captured_at || prospect.consent_given;
if (!consentOk) throw new Error('TCPA: no consent recorded');

await twilioClient.messages.create({
  body: content,
  from: process.env.TWILIO_PHONE_NUMBER,
  to: recipientPhone,
});
```

Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

---

## PDF Generation

### Library: @react-pdf/renderer

Chosen over Puppeteer for Vercel serverless compatibility. No headless browser needed. Renders React components to PDF buffer server-side. Works within Vercel function size limits (~2MB vs Puppeteer's ~50MB).

### Flow

1. `GET /api/crm/sales/prospects/:id/pdf` called
2. Server assembles pitch packet data (CMA, pricing, exposure, financials)
3. @react-pdf/renderer generates PDF from React components
4. PDF stored in R2 (existing media pipeline)
5. Returns PDF URL or buffer as response

### Compliance

PDF includes on every page with Trestle-sourced data:
- "Based on information from the REBNY Listing Service for the period [date] through [date]..."
- REBNY RLS attribution
- No agent PII in property descriptions

---

## Contact Import

### Endpoint: `POST /api/crm/sales/prospects/import`

```
Content-Type: multipart/form-data
Body:
  file: CSV or XLSX
  source: "UN List" | "Doctors List" | "LinkedIn Export" | custom
  default_status: "new" (default)
```

### Processing

1. Parse file (xlsx for Excel, csv-parser for CSV)
2. Auto-detect column mapping
3. Return preview (first 10 rows + detected mapping) — requires confirmation
4. On confirm: create SellerLead records, skip duplicates (by address+unit or email)
5. Auto-research queued: max 100 prospects/hour (SODA rate limit protection)
6. Return summary (created, skipped, errors)
7. All imports logged to AuditEvent

---

## API Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/crm/sales/prospects` | List prospects (filterable, paginated, by agent_id) |
| POST | `/api/crm/sales/prospects` | Create prospect (triggers queued auto-research) |
| GET | `/api/crm/sales/prospects/:id` | Get prospect with research data + cadence |
| PUT | `/api/crm/sales/prospects/:id` | Update prospect fields |
| DELETE | `/api/crm/sales/prospects/:id` | Delete prospect |
| POST | `/api/crm/sales/prospects/:id/research` | Re-run research (rate-limited 1/hr) |
| GET | `/api/crm/sales/prospects/:id/pitch-packet` | Generate pitch packet JSON |
| GET | `/api/crm/sales/prospects/:id/pdf` | Generate PDF |
| POST | `/api/crm/sales/prospects/:id/send-packet` | Email pitch packet (PDF attached) |
| GET | `/api/crm/sales/prospects/:id/outreach` | Get outreach cadence timeline |
| POST | `/api/crm/sales/prospects/:id/outreach` | Add custom outreach step |
| PUT | `/api/crm/sales/prospects/:id/outreach/:stepId` | Update step (send/skip/reschedule) |
| POST | `/api/crm/sales/prospects/:id/convert` | Convert to Active Seller (creates Lead) |
| POST | `/api/crm/sales/prospects/import` | Bulk contact import (CSV/XLSX) |

All endpoints filter by `assigned_agent_id` (agent sees own prospects). Broker sees all.

---

## Dependencies (new packages)

| Package | Purpose | Size |
|---------|---------|------|
| `@react-pdf/renderer` | Server-side PDF generation | ~2MB |
| `twilio` | SMS delivery | ~1MB |
| `xlsx` | Excel file parsing for contact import | ~2MB |

---

## Build Phases

| Phase | What | Deliverable |
|-------|------|-------------|
| 1 | **Schema migration** | SellerLead extended + OutreachCadenceStep model |
| 2 | **API routes** | Full CRUD + research + pitch-packet + outreach + convert + import |
| 3 | **Prospect table UI** | Table with filters, status badges, readiness scores |
| 4 | **Prospect workspace** | 5-tab workspace (overview, research, pitch, outreach, notes) |
| 5 | **Pitch packet builder** | 4 pillars with generate/edit, exposure plan, pricing strategy |
| 6 | **PDF + email delivery** | @react-pdf/renderer + email with attachment |
| 7 | **Outreach cadence** | Auto-created timeline, send/skip/reschedule, dashboard alerts |
| 8 | **Trigger alerts cron** | Daily scan for building activity, overdue follow-ups |
| 9 | **Contact import** | CSV/XLSX upload, mapping, dedup, queued research |
| 10 | **SMS** | Twilio integration |

Each phase is fully operational before moving to next.

---

## What This Does NOT Include

- Buyer Prospecting Engine (SP-2, separate spec)
- AI-generated outreach copy (future)
- Automated sending without agent review (intentional — compliance)
- LinkedIn API posting (use LinkedIn directly)
- ACRIS automated monitoring (one-time lookup + manual re-run)
