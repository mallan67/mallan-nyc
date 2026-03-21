# Seller Prospecting Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Seller Prospects tab in the Sales CRM that automates the pre-acquisition workflow — from entering an address through auto-research, pitch packet generation, outreach cadence, to conversion to Active Seller.

**Architecture:** Extend the existing `SellerLead` model (not create a new one) with property/entity/prospecting fields. New `OutreachCadenceStep` model for scheduled outreach. New CRM panel files for the prospect table, workspace, pitch packet builder, and outreach timeline. API routes wrap existing ACRIS/DOF/DOB/PLUTO research and CMA engine. PDF via @react-pdf/renderer. Email via existing Nodemailer + M365 SMTP. SMS via Twilio.

**Tech Stack:** Next.js 16, Prisma (PostgreSQL on Neon), vanilla JS dashboard panels, @react-pdf/renderer, Twilio, xlsx parser, existing ACRIS/DOF/DOB/PLUTO via lib/soda.ts

**Spec:** `docs/superpowers/specs/2026-03-21-seller-prospecting-engine-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `prisma/migrations/[timestamp]_seller_prospect_fields/migration.sql` | Schema migration |
| `app/api/crm/sales/prospects/route.ts` | CRUD: list + create seller prospects |
| `app/api/crm/sales/prospects/[id]/route.ts` | CRUD: get + update + delete single prospect |
| `app/api/crm/sales/prospects/[id]/research/route.ts` | Trigger ACRIS/DOF/DOB/PLUTO research |
| `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts` | Generate pitch packet JSON |
| `app/api/crm/sales/prospects/[id]/pdf/route.ts` | Generate PDF from pitch packet |
| `app/api/crm/sales/prospects/[id]/send-packet/route.ts` | Email pitch packet with PDF attachment |
| `app/api/crm/sales/prospects/[id]/outreach/route.ts` | CRUD for outreach cadence steps |
| `app/api/crm/sales/prospects/[id]/convert/route.ts` | Convert prospect → Active Seller (Lead) |
| `app/api/crm/sales/prospects/import/route.ts` | CSV/XLSX bulk import |
| `app/api/cron/prospect-triggers/route.ts` | Daily cron: building activity alerts, overdue follow-ups |
| `lib/pdf/pitch-packet-renderer.tsx` | @react-pdf/renderer components for pitch packet PDF |
| `lib/email/templates/pitch-packet.ts` | Email template for pitch packet delivery |
| `public/crm/js/dashboard/panels/sales-crm/seller-prospects.js` | Prospect table + workspace UI |
| `public/crm/js/dashboard/panels/sales-crm/pitch-packet.js` | Pitch packet builder UI (4 pillars) |
| `public/crm/js/dashboard/panels/sales-crm/outreach-cadence.js` | Outreach timeline UI |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Extend SellerLead + add OutreachCadenceStep |
| `public/crm/js/dashboard/app.js` | Register `/sales/prospects` route + add sidebar entry |
| `public/crm/js/dashboard/panels/sales-crm/index.js` | Add "Seller Prospects" as first tab in TABS array |
| `public/crm/dashboard.html` | Add 3 new script tags |
| `app/api/crm/email/route.ts` | Add Twilio SMS delivery |
| `vercel.json` | Register prospect-triggers cron |
| `package.json` | Add @react-pdf/renderer, twilio, xlsx |

---

## Task 1: Schema Migration — Extend SellerLead + Add OutreachCadenceStep

**Files:**
- Modify: `prisma/schema.prisma` (SellerLead model at line 852, add OutreachCadenceStep after line 947)

- [ ] **Step 1: Add new fields to SellerLead model**

In `prisma/schema.prisma`, add these fields to the `SellerLead` model (after the existing `notes` field, before relations):

```prisma
  // --- Property details (from PLUTO/manual) ---
  property_type         String?   @map("property_type")
  beds                  Int?
  baths                 Decimal?  @db.Decimal(3,1)
  sqft                  Int?
  year_built            Int?      @map("year_built")
  building_name         String?   @map("building_name")
  floors                Int?
  units_total           Int?      @map("units_total")
  lot_area              Int?      @map("lot_area")

  // --- Ownership enrichment (from ACRIS) ---
  entity_type           String?   @map("entity_type")
  entity_name           String?   @map("entity_name")
  ownership_years       Decimal?  @db.Decimal(4,1) @map("ownership_years")
  last_purchase_price   Decimal?  @db.Decimal(14,2) @map("last_purchase_price")
  last_purchase_date    DateTime? @map("last_purchase_date")
  mortgage_amount       Decimal?  @db.Decimal(14,2) @map("mortgage_amount")
  mortgage_date         DateTime? @map("mortgage_date")
  equity_ratio          Decimal?  @db.Decimal(3,2) @map("equity_ratio")

  // --- Tax (from DOF) ---
  tax_class             String?   @map("tax_class")
  annual_tax            Decimal?  @db.Decimal(12,2) @map("annual_tax")
  market_value          Decimal?  @db.Decimal(14,2) @map("market_value")
  assessed_value        Decimal?  @db.Decimal(14,2) @map("assessed_value")

  // --- Building health (from DOB) ---
  open_violations       Int?      @default(0) @map("open_violations")
  recent_permits        Int?      @default(0) @map("recent_permits")
  building_risk         Decimal?  @db.Decimal(3,2) @map("building_risk")

  // --- Contact (secondary + professional) ---
  secondary_name        String?   @map("secondary_name")
  secondary_phone       String?   @map("secondary_phone")
  secondary_email       String?   @map("secondary_email")
  secondary_relationship String?  @map("secondary_relationship")
  management_company    String?   @map("management_company")
  attorney_name         String?   @map("attorney_name")
  attorney_email        String?   @map("attorney_email")
  attorney_phone        String?   @map("attorney_phone")
  authorized_signatories Json?    @map("authorized_signatories")

  // --- Prospecting ---
  source                String?
  source_detail         String?   @map("source_detail")
  pitch_generated_at    DateTime? @map("pitch_generated_at")
  pitch_sent_at         DateTime? @map("pitch_sent_at")
  pitch_pdf_url         String?   @map("pitch_pdf_url")

  // --- Conversion ---
  converted_to_lead_id  BigInt?   @map("converted_to_lead_id")
  converted_at          DateTime? @map("converted_at")

  // --- Outreach scheduling ---
  next_follow_up        DateTime? @map("next_follow_up")
  last_contacted_at     DateTime? @map("last_contacted_at")
  last_researched_at    DateTime? @map("last_researched_at")

  // --- TCPA (align with Lead pattern) ---
  consent_captured_at   DateTime? @map("consent_captured_at")
  consent_opt_out_at    DateTime? @map("consent_opt_out_at")
```

Add the relation to the existing relations section:

```prisma
  cadence_steps         OutreachCadenceStep[]
```

Add indexes:

```prisma
  @@index([next_follow_up])
  @@index([source])
```

- [ ] **Step 2: Add OutreachCadenceStep model**

Add after the `OutreachEvent` model (after line 947):

```prisma
model OutreachCadenceStep {
  id              BigInt    @id @default(autoincrement())
  seller_lead_id  BigInt    @map("seller_lead_id")
  seller_lead     SellerLead @relation(fields: [seller_lead_id], references: [id], onDelete: Cascade)

  day_offset      Int       @map("day_offset")
  type            String
  channel         String    @default("email")
  subject         String?
  content_preview String?   @db.Text @map("content_preview")

  status          String    @default("pending")
  scheduled_date  DateTime? @map("scheduled_date")
  sent_at         DateTime? @map("sent_at")
  opened_at       DateTime? @map("opened_at")
  replied_at      DateTime? @map("replied_at")

  content_type    String?   @map("content_type")
  content_data    Json?     @map("content_data")

  created_at      DateTime  @default(now()) @map("created_at")
  updated_at      DateTime  @updatedAt @map("updated_at")

  @@index([seller_lead_id])
  @@index([scheduled_date])
  @@index([status])
  @@map("outreach_cadence_steps")
}
```

- [ ] **Step 3: Add relation on Agent model**

Find the `Agent` model and add:
```prisma
  // Already has: seller_leads SellerLead[]
  // Verify it exists. If not, add it.
```

- [ ] **Step 4: Generate and apply migration**

Run: `npx prisma migrate dev --name seller_prospect_fields`
Expected: Migration created and applied successfully.

- [ ] **Step 5: Generate Prisma client**

Run: `npx prisma generate`
Expected: Prisma Client generated.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): extend SellerLead for prospecting + add OutreachCadenceStep model"
```

---

## Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new packages**

Run: `npm install @react-pdf/renderer twilio xlsx`

- [ ] **Step 2: Verify installation**

Run: `node -e "require('twilio'); require('xlsx'); console.log('OK')" && node -e "import('@react-pdf/renderer').then(() => console.log('react-pdf OK'))"`
Expected: OK, react-pdf OK

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @react-pdf/renderer, twilio, xlsx dependencies"
```

---

## Task 3: API Routes — CRUD + Research

**Files:**
- Create: `app/api/crm/sales/prospects/route.ts`
- Create: `app/api/crm/sales/prospects/[id]/route.ts`
- Create: `app/api/crm/sales/prospects/[id]/research/route.ts`

- [ ] **Step 1: Create list + create endpoint**

Create `app/api/crm/sales/prospects/route.ts`:

```typescript
// GET: list seller prospects (filtered by agent_id for non-broker)
// POST: create new prospect (triggers auto-research if BBL provided)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

const DEFAULT_CADENCE = [
  { day_offset: 1,  type: "intro_cma",      channel: "email", subject: "Your Home's Current Market Value" },
  { day_offset: 7,  type: "neighbor_sold",   channel: "email", subject: "Recent Sale in Your Building" },
  { day_offset: 14, type: "follow_up",       channel: "email", subject: "Following Up — Market Update" },
  { day_offset: 21, type: "market_report",   channel: "email", subject: "Market Report for Your Area" },
  { day_offset: 30, type: "cost_analysis",   channel: "email", subject: "What It Actually Costs to Sell" },
  { day_offset: 60, type: "re_engage",       channel: "email", subject: "Updated Home Valuation" },
  { day_offset: 90, type: "re_engage",       channel: "email", subject: "Market Update — New Activity" },
];

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const search = url.searchParams.get("search");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "50"));

  const where: Record<string, unknown> = {};

  // Agent sees own; broker sees all
  if (auth.role !== "BROKER") {
    where.assigned_agent_id = auth.userId;
  }

  if (status) where.status = status;
  if (source) where.source = source;
  if (search) {
    where.OR = [
      { address: { contains: search, mode: "insensitive" } },
      { owner_name: { contains: search, mode: "insensitive" } },
      { owner_email: { contains: search, mode: "insensitive" } },
    ];
  }

  // Exclude converted prospects by default
  if (!status) {
    where.status = { notIn: ["converted"] };
  }

  const [prospects, total] = await Promise.all([
    prisma.sellerLead.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        cadence_steps: {
          where: { status: "pending" },
          orderBy: { scheduled_date: "asc" },
          take: 1,
        },
      },
    }),
    prisma.sellerLead.count({ where }),
  ]);

  return NextResponse.json({
    prospects: prospects.map(p => ({
      ...p,
      id: String(p.id),
      assigned_agent_id: p.assigned_agent_id ? String(p.assigned_agent_id) : null,
      converted_to_lead_id: p.converted_to_lead_id ? String(p.converted_to_lead_id) : null,
      next_cadence_step: p.cadence_steps[0] || null,
    })),
    total,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const body = await req.json();
  const { address, unit, borough, bbl, owner_name, owner_email, owner_phone, source, source_detail, entity_type, entity_name } = body;

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  const prospect = await prisma.sellerLead.create({
    data: {
      address,
      unit: unit || "",
      borough,
      bbl,
      owner_name,
      owner_email,
      owner_phone,
      source: source || "manual",
      source_detail,
      entity_type,
      entity_name,
      status: "new",
      assigned_agent_id: auth.userId,
    },
  });

  // Create default outreach cadence
  const now = new Date();
  const cadenceSteps = DEFAULT_CADENCE.map(step => ({
    seller_lead_id: prospect.id,
    day_offset: step.day_offset,
    type: step.type,
    channel: step.channel,
    subject: step.subject,
    status: "pending",
    scheduled_date: new Date(now.getTime() + step.day_offset * 86400000),
  }));

  await prisma.outreachCadenceStep.createMany({ data: cadenceSteps });

  await logAuditEvent("seller_prospect_created", "SellerLead", String(prospect.id), auth, { address, source });

  return NextResponse.json({ prospect: { ...prospect, id: String(prospect.id) } }, { status: 201 });
}
```

- [ ] **Step 2: Create single prospect endpoint (get/update/delete)**

Create `app/api/crm/sales/prospects/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const prospect = await prisma.sellerLead.findUnique({
    where: { id: BigInt(id) },
    include: {
      signals: { orderBy: { collected_at: "desc" } },
      outreach_events: { orderBy: { created_at: "desc" }, take: 50 },
      cadence_steps: { orderBy: { day_offset: "asc" } },
    },
  });

  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Agent can only see own prospects
  if (auth.role !== "BROKER" && prospect.assigned_agent_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    prospect: {
      ...prospect,
      id: String(prospect.id),
      assigned_agent_id: prospect.assigned_agent_id ? String(prospect.assigned_agent_id) : null,
      signals: prospect.signals.map(s => ({ ...s, id: String(s.id), seller_lead_id: String(s.seller_lead_id) })),
      outreach_events: prospect.outreach_events.map(e => ({ ...e, id: String(e.id), seller_lead_id: String(e.seller_lead_id) })),
      cadence_steps: prospect.cadence_steps.map(c => ({ ...c, id: String(c.id), seller_lead_id: String(c.seller_lead_id) })),
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;
  const { id } = await params;

  const existing = await prisma.sellerLead.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth.role !== "BROKER" && existing.assigned_agent_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Explicit field allowlist — prevent overwriting protected fields
  const ALLOWED = [
    "address", "unit", "borough", "bbl", "bin", "owner_name", "owner_email", "owner_phone",
    "property_type", "beds", "baths", "sqft", "building_name", "management_company",
    "entity_type", "entity_name", "authorized_signatories",
    "secondary_name", "secondary_phone", "secondary_email", "secondary_relationship",
    "attorney_name", "attorney_email", "attorney_phone",
    "source", "source_detail", "status", "notes",
    "consent_captured_at", "consent_opt_out_at",
    "next_follow_up", "last_contacted_at",
  ];
  const filtered: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) filtered[key] = body[key];
  }

  const updated = await prisma.sellerLead.update({
    where: { id: BigInt(id) },
    data: filtered,
  });

  return NextResponse.json({ prospect: { ...updated, id: String(updated.id) } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;
  const { id } = await params;

  const existing = await prisma.sellerLead.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth.role !== "BROKER" && existing.assigned_agent_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.sellerLead.delete({ where: { id: BigInt(id) } });

  await logAuditEvent("seller_prospect_deleted", "SellerLead", id, auth);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create research endpoint**

Create `app/api/crm/sales/prospects/[id]/research/route.ts`:

```typescript
// POST: trigger ACRIS/DOF/DOB/PLUTO research for a prospect
// Reuses existing lib/seller-readiness scoring engine
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { scoreSellerLead } from "@/lib/seller-readiness/scorer";
import { soda } from "@/lib/soda";
import { collectAcrisSignals } from "@/lib/seller-readiness/signals/acris";
import { fetchDofTaxData } from "@/lib/seller-readiness/signals/dof-tax";

const PLUTO = process.env.SODA_DATASET_PLUTO ?? "64uk-42ks";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const prospect = await prisma.sellerLead.findUnique({ where: { id: BigInt(id) } });
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Rate limit: max 1 research per hour per prospect
  if (prospect.last_researched_at) {
    const hourAgo = new Date(Date.now() - 3600000);
    if (prospect.last_researched_at > hourAgo) {
      return NextResponse.json({ error: "Research already ran within the last hour" }, { status: 429 });
    }
  }

  // 1. PLUTO lookup for building data (if we have BBL or address)
  // Sanitize inputs to prevent SoQL injection
  const sanitize = (s: string) => s.replace(/'/g, "''").replace(/[;\-\-]/g, "");
  const bblValid = (b: string) => /^\d{10}$/.test(b);

  let plutoData: Record<string, string> | null = null;
  if (prospect.bbl && bblValid(prospect.bbl)) {
    try {
      const rows = await soda<Record<string, string>>({
        resource: PLUTO,
        where: `bbl='${prospect.bbl}'`,
        limit: 1,
      });
      plutoData = rows?.[0] ?? null;
    } catch { /* graceful */ }
  } else if (prospect.address && prospect.borough) {
    try {
      const safeAddr = sanitize(prospect.address.trim().toUpperCase());
      const safeBoro = /^[1-5]$/.test(prospect.borough) ? prospect.borough : "1";
      const rows = await soda<Record<string, string>>({
        resource: PLUTO,
        where: `address='${safeAddr}' AND borocode='${safeBoro}'`,
        limit: 1,
      });
      plutoData = rows?.[0] ?? null;
      // Store resolved BBL
      if (plutoData?.bbl) {
        await prisma.sellerLead.update({
          where: { id: prospect.id },
          data: { bbl: plutoData.bbl.split(".")[0].padStart(10, "0") },
        });
      }
    } catch { /* graceful */ }
  }

  // 2. Update property fields from PLUTO
  const plutoUpdate: Record<string, unknown> = { last_researched_at: new Date() };
  if (plutoData) {
    if (plutoData.ownername) plutoUpdate.owner_name = plutoData.ownername;
    if (plutoData.yearbuilt) plutoUpdate.year_built = parseInt(plutoData.yearbuilt) || null;
    if (plutoData.numfloors) plutoUpdate.floors = parseInt(plutoData.numfloors) || null;
    if (plutoData.unitstotal) plutoUpdate.units_total = parseInt(plutoData.unitstotal) || null;
    if (plutoData.bldgarea) plutoUpdate.sqft = parseInt(plutoData.bldgarea) || null;
    if (plutoData.lotarea) plutoUpdate.lot_area = parseInt(plutoData.lotarea) || null;
  }

  await prisma.sellerLead.update({
    where: { id: prospect.id },
    data: plutoUpdate,
  });

  // 3. Run full scoring (ACRIS + DOB + DOF + first-party)
  const scoreResult = await scoreSellerLead(prospect.id);

  // 4. Extract ACRIS ownership data and update enrichment fields
  const acrisSignals = prospect.bbl ? await collectAcrisSignals(prospect.bbl) : [];
  const ownershipSignal = acrisSignals.find(s => s.type === "ownership_duration");
  const mortgageSignal = acrisSignals.find(s => s.type === "mortgage_age");
  const equitySignal = acrisSignals.find(s => s.type === "equity_estimate");

  const enrichment: Record<string, unknown> = {};
  if (ownershipSignal?.metadata) {
    const m = ownershipSignal.metadata as Record<string, unknown>;
    if (m.years_owned) enrichment.ownership_years = m.years_owned;
    if (m.purchase_price) enrichment.last_purchase_price = m.purchase_price;
    if (m.purchase_date) enrichment.last_purchase_date = new Date(m.purchase_date as string);
  }
  if (mortgageSignal?.metadata) {
    const m = mortgageSignal.metadata as Record<string, unknown>;
    if (m.mortgage_amount) enrichment.mortgage_amount = m.mortgage_amount;
    if (m.mortgage_date) enrichment.mortgage_date = new Date(m.mortgage_date as string);
  }
  if (equitySignal) {
    enrichment.equity_ratio = equitySignal.normalized;
  }

  // DOF tax data
  if (prospect.bbl) {
    try {
      const taxData = await fetchDofTaxData(prospect.bbl);
      if (taxData) {
        enrichment.tax_class = taxData.tax_class;
        enrichment.annual_tax = taxData.annual_tax;
        enrichment.market_value = taxData.market_value;
        enrichment.assessed_value = taxData.assessed_value;
      }
    } catch { /* graceful */ }
  }

  if (Object.keys(enrichment).length > 0) {
    await prisma.sellerLead.update({
      where: { id: prospect.id },
      data: enrichment,
    });
  }

  await logAuditEvent("seller_prospect_researched", "SellerLead", String(prospect.id), auth, { score: scoreResult.score, grade: scoreResult.grade });

  // Return full updated prospect
  const updated = await prisma.sellerLead.findUnique({
    where: { id: prospect.id },
    include: { signals: { orderBy: { collected_at: "desc" } } },
  });

  return NextResponse.json({
    prospect: { ...updated, id: String(updated!.id) },
    score: scoreResult,
  });
}
```

- [ ] **Step 4: Verify routes compile**

Run: `npx next build --no-lint 2>&1 | head -50`
Expected: No TypeScript errors for the new route files.

- [ ] **Step 5: Commit**

```bash
git add app/api/crm/sales/prospects/
git commit -m "feat(api): add seller prospect CRUD + research endpoints"
```

---

## Task 4: API Routes — Pitch Packet + Outreach + Convert

**Files:**
- Create: `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts`
- Create: `app/api/crm/sales/prospects/[id]/outreach/route.ts`
- Create: `app/api/crm/sales/prospects/[id]/convert/route.ts`
- Create: `app/api/crm/sales/prospects/[id]/send-packet/route.ts`

- [ ] **Step 1: Create pitch packet data endpoint**

Create `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts` that:
- Fetches prospect with all research data
- Queries Trestle for recent sales in building (by building name or address pattern)
- Queries Trestle for active competition (same area, type, price range ±20%)
- Counts buyers in Lead table matching property criteria (dynamic, not hardcoded)
- Assembles 4-pillar JSON: property_intel, pricing_strategy, exposure_plan, financial_picture
- Includes REBNY RLS attribution text for any Trestle-sourced data
- Returns structured JSON (consumed by UI and PDF renderer)

Auth: `requireAgentOrBroker`, agent sees own only.

- [ ] **Step 2: Create outreach cadence CRUD**

Create `app/api/crm/sales/prospects/[id]/outreach/route.ts`:
- GET: list all cadence steps for prospect (ordered by day_offset)
- POST: add custom step (type: "custom", agent sets day_offset, channel, subject)
- PUT: update step (send, skip, reschedule) — when status changes to "sent", also creates OutreachEvent audit record
- TCPA guard: before any send, check consent_captured_at OR consent_given on the SellerLead

- [ ] **Step 3: Create convert endpoint**

Create `app/api/crm/sales/prospects/[id]/convert/route.ts`:
- POST: Creates Lead record from SellerLead data (or finds existing by email)
- Maps: owner_name → first_name/last_name, owner_email → email, owner_phone → phone
- Sets: `roles = ["seller"]`, `pipeline_stage = "active_seller"`, `primary_portal_role = "seller"`
- Carries over: entity_name, entity_type, property_address (from address), unit_number, attorney fields, notes
- Updates SellerLead: `status = "converted"`, `converted_to_lead_id`, `converted_at`
- Does NOT call `/api/crm/convert` — handles conversion directly to avoid contract changes
- Logs AuditEvent

- [ ] **Step 4: Create send-packet endpoint**

Create `app/api/crm/sales/prospects/[id]/send-packet/route.ts`:
- POST: generates PDF (calls pitch-packet endpoint internally), attaches to email
- Uses existing email system (lib/email/sendgrid.ts) with agent channel
- New template: pitchPacketEmail (see Task 6)
- Stores PDF URL on SellerLead.pitch_pdf_url
- Updates pitch_sent_at
- Creates OutreachEvent record
- TCPA guard on email send

- [ ] **Step 5: Commit**

```bash
git add app/api/crm/sales/prospects/
git commit -m "feat(api): add pitch-packet, outreach, convert, send-packet endpoints"
```

---

## Task 5: PDF Generation

**Files:**
- Create: `lib/pdf/pitch-packet-renderer.tsx`

- [ ] **Step 1: Create PDF renderer**

Create `lib/pdf/pitch-packet-renderer.tsx` using @react-pdf/renderer:
- Accepts pitch packet JSON (4 pillars)
- Renders branded PDF with Mallan Real Estate header
- Pillar 1: Property Intel — CMA table, recent sales, competition
- Pillar 2: Pricing Strategy — 3 price points, what-if table, absorption
- Pillar 3: Exposure Plan — 5 layers with bullet points and numbers
- Pillar 4: Financial Picture — net proceeds breakdown table
- Footer on every page: REBNY attribution disclaimer ("Based on information from the REBNY Listing Service...")
- Export: `renderPitchPacketPdf(data: PitchPacketData): Promise<Buffer>`

- [ ] **Step 2: Create PDF API endpoint**

Create `app/api/crm/sales/prospects/[id]/pdf/route.ts`:
- GET: calls pitch-packet endpoint for data, renders PDF, returns as `application/pdf`
- Optional query param `?store=true` to upload to R2 and store URL

- [ ] **Step 3: Verify PDF generates**

Test with a manual API call or write a quick script.

- [ ] **Step 4: Commit**

```bash
git add lib/pdf/ app/api/crm/sales/prospects/[id]/pdf/
git commit -m "feat(pdf): add @react-pdf/renderer pitch packet PDF generation"
```

---

## Task 6: Email Template + Twilio SMS

**Files:**
- Create: `lib/email/templates/pitch-packet.ts`
- Modify: `app/api/crm/email/route.ts`

- [ ] **Step 1: Create pitch packet email template**

Create `lib/email/templates/pitch-packet.ts`:
- Professional cover letter HTML (inline CSS, Outlook-compatible tables — match existing template patterns in lib/email/templates.ts)
- Subject: "Your Home's Market Value — Prepared by [Agent Name], Mallan Real Estate"
- Body: brief intro, key highlights (estimated value, buyer match count, exposure reach), CTA to schedule meeting
- Fair Housing disclaimer (required — match existing templates)
- Attachment support: the send-packet endpoint attaches the PDF

- [ ] **Step 2: Export template from main templates file**

Modify `lib/email/templates.ts` — add import and re-export of pitchPacketEmail.

- [ ] **Step 3: Add Twilio SMS delivery**

Modify `app/api/crm/email/route.ts`:
- Replace the `sms:logged` block (around line 63) with actual Twilio send
- Guard: check for TWILIO_ACCOUNT_SID env var (graceful fallback to logging if not configured)
- TCPA guard: verify consent before sending
- Keep audit event logging

- [ ] **Step 4: Commit**

```bash
git add lib/email/ app/api/crm/email/route.ts
git commit -m "feat(email): add pitch packet template + Twilio SMS delivery"
```

---

## Task 7: Contact Import

**Files:**
- Create: `app/api/crm/sales/prospects/import/route.ts`

- [ ] **Step 1: Create import endpoint**

Create `app/api/crm/sales/prospects/import/route.ts`:
- POST: multipart/form-data with file (CSV or XLSX) + source + source_detail
- Parse with xlsx library (handles both CSV and XLSX)
- Auto-detect columns: look for name/email/phone/address headers (case-insensitive)
- Preview mode: if `?preview=true`, return first 10 rows + detected column mapping without creating records
- Create mode: create SellerLead records, skip duplicates (address+unit unique constraint — catch and count)
- Set source="imported", source_detail from request body
- Rate-limited auto-research: DON'T trigger research synchronously — set last_researched_at = null so the scoring cron picks them up in batches
- Return: `{ created: N, skipped: N, errors: [...] }`
- Log AuditEvent with import summary

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/sales/prospects/import/
git commit -m "feat(api): add CSV/XLSX contact import for seller prospects"
```

---

## Task 8: Trigger Alerts Cron

**Files:**
- Create: `app/api/cron/prospect-triggers/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create cron endpoint**

Create `app/api/cron/prospect-triggers/route.ts`:
- Runs daily at 9am (vercel cron)
- Auth: verify cron secret header (match existing cron pattern from app/api/cron/seller-scoring/route.ts)
- Step 1: Find all cadence steps where scheduled_date <= today AND status = "pending" → update status to "ready"
- Step 2: Find prospects where status = "hot" AND last_contacted_at < 48 hours ago → create alert (AuditEvent with action "prospect_overdue_followup")
- Step 3: Update SellerLead.next_follow_up to the next pending cadence step's scheduled_date
- Step 4: **Trestle building activity detection** — for each active prospect (status not in converted/declined/cold):
  - Query Trestle for listings in same building (match by building name or address prefix) with StatusChangeTimestamp in last 24h
  - If new listing found: create AuditEvent "prospect_building_new_listing" with listing details
  - If recent sale (status=Closed, StatusChangeTimestamp last 24h): create AuditEvent "prospect_building_sold" with sale price
  - Batch Trestle queries by building (not per-prospect) to minimize API calls
  - Apply DTO sanitizer to strip agent PII from any stored listing data
- Returns summary JSON with counts: { cadence_ready, overdue_alerts, building_events }

- [ ] **Step 2: Register cron in vercel.json**

Add to the crons array in vercel.json:
```json
{ "path": "/api/cron/prospect-triggers", "schedule": "0 9 * * *" }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/prospect-triggers/ vercel.json
git commit -m "feat(cron): add daily prospect trigger alerts + cadence step readiness"
```

---

## Task 9: Frontend — Prospect Table + Route Registration

**Files:**
- Create: `public/crm/js/dashboard/panels/sales-crm/seller-prospects.js`
- Modify: `public/crm/js/dashboard/app.js`
- Modify: `public/crm/js/dashboard/panels/sales-crm/index.js`
- Modify: `public/crm/dashboard.html`

- [ ] **Step 1: Add route registration**

In `app.js` line 101-108, add BEFORE the existing sales routes:
```javascript
Router.register('/sales/prospects', function () { SellerProspects.render(); });
```

- [ ] **Step 2: Add sidebar entry**

In `app.js` line 400-408, add as FIRST item in the SALES CRM group:
```javascript
{ route: '/sales/prospects', icon: 'fa-crosshairs', label: 'Seller Prospects' },
```

- [ ] **Step 3: Add tab to Sales CRM subnav**

In `sales-crm/index.js` line 19-27 (TABS array), add as FIRST element:
```javascript
{ id: 'prospects', route: '/sales/prospects', label: 'Seller Prospects', icon: 'fa-crosshairs' },
```

- [ ] **Step 4: Add script tags to dashboard.html**

Add after the existing sales-crm/index.js script tag:
```html
<script src="/crm/js/dashboard/panels/sales-crm/seller-prospects.js"></script>
<script src="/crm/js/dashboard/panels/sales-crm/pitch-packet.js"></script>
<script src="/crm/js/dashboard/panels/sales-crm/outreach-cadence.js"></script>
```

- [ ] **Step 5: Create seller-prospects.js — prospect table**

Create `public/crm/js/dashboard/panels/sales-crm/seller-prospects.js`:

Pattern: follow SalesCRM.activeSellers() in index.js — same structure:
- IIFE module: `var SellerProspects = (function() { ... })();`
- State: `_s = { data: [], sort: { key: 'address', dir: 'asc' }, page: 1, search: '', filter: {} }`
- `render()`: shows subnav (from SalesCRM TABS) + KPI cards + filter bar + table
- KPI cards: Total Prospects, Hot, Follow-Up Due Today, Converted This Month
- Table columns: Address | Owner | Status (badge) | Score (A-F) | Grade Bar | Source | Last Contact | Next Follow-Up | Actions
- Status badges: new (gray), contacted (blue), replied (green), meeting (yellow), pitched (purple), signed (gold), converted (green), declined (red), cold (gray)
- Click row → `SellerProspects.openWorkspace(id)`
- Filter bar: search (address/name), status dropdown, source dropdown
- [+ Add Prospect] button → modal with: address, unit, borough, owner name, email, phone, source, entity type, entity name
- [Import Contacts] button → import modal
- Add Prospect modal calls `POST /api/crm/sales/prospects` → refreshes table
- Table fetches from `GET /api/crm/sales/prospects`

- [ ] **Step 6: Create workspace view**

In the same file, add `openWorkspace(id)`:
- Fetches `GET /api/crm/sales/prospects/{id}`
- Renders 5-tab workspace:
  - **Overview**: property details (all fields, inline-editable), ownership, contact, entity/signatories (reuse EntityFields component), status selector, readiness score with signal breakdown
  - **Research**: signals table (from ReadinessSignal), ACRIS/DOF/DOB details, [Re-Run Research] button (calls POST .../research), competition section (placeholder — wired in pitch packet)
  - **Pitch Packet**: delegates to `PitchPacket.render(prospect)` (Task 10)
  - **Outreach**: delegates to `OutreachCadence.render(prospect)` (Task 11)
  - **Notes & Activity**: timestamped notes (add/view), outreach events timeline (reuse ActivityTable)
- Back button: `Router.navigate('/sales/prospects')`
- All fields editable via PUT endpoint
- Delete button with confirmation

- [ ] **Step 7: Commit**

```bash
git add public/crm/js/dashboard/panels/sales-crm/seller-prospects.js public/crm/js/dashboard/app.js public/crm/js/dashboard/panels/sales-crm/index.js public/crm/dashboard.html
git commit -m "feat(crm): add Seller Prospects tab with table, workspace, and route registration"
```

---

## Task 10: Frontend — Pitch Packet Builder

**Files:**
- Create: `public/crm/js/dashboard/panels/sales-crm/pitch-packet.js`

- [ ] **Step 1: Create pitch-packet.js**

IIFE module: `var PitchPacket = (function() { ... })();`

`render(prospect)`:
- 4 collapsible sections (pillars), each with [Generate] button
- **Pillar 1: Property Intel**: fetches from pitch-packet API, displays CMA summary, recent sales table, active competition table
- **Pillar 2: Pricing Strategy**: 3 price points (editable), price/sqft comparison, absorption rate, seasonal timing, what-if scenarios (agent can edit)
- **Pillar 3: Exposure Plan**: 5 layers displayed as visual cards with numbers. Buyer database count fetched dynamically. LinkedIn followers count. Full syndication list.
- **Pillar 4: Financial Picture**: net proceeds calculator (reuses existing `NetProceeds` tool if available, or calls inline calculator), cost breakdown table
- **Action bar at bottom**:
  - [Generate PDF] → calls GET .../pdf → opens in new tab or downloads
  - [Email to Prospect] → calls POST .../send-packet → shows success toast
  - [Download] → direct PDF download
  - [Print] → window.print() on rendered HTML

All Trestle-sourced sections include: "Based on information from the REBNY Listing Service" disclaimer text.

- [ ] **Step 2: Commit**

```bash
git add public/crm/js/dashboard/panels/sales-crm/pitch-packet.js
git commit -m "feat(crm): add pitch packet builder UI — 4 pillars + PDF/email actions"
```

---

## Task 11: Frontend — Outreach Cadence

**Files:**
- Create: `public/crm/js/dashboard/panels/sales-crm/outreach-cadence.js`

- [ ] **Step 1: Create outreach-cadence.js**

IIFE module: `var OutreachCadence = (function() { ... })();`

`render(prospect)`:
- Visual timeline (vertical, each step is a card)
- Each card shows: Day N | Type icon | Subject | Channel badge | Status badge
- Status colors: pending (gray), ready (gold pulse), sent (green), skipped (strikethrough gray)
- Actions per card:
  - Ready: [Send Now] [Edit] [Skip] [Reschedule]
  - Pending: [Edit] [Skip] [Reschedule]
  - Sent: shows sent_at + opened_at (if available)
- [Send Now] → calls PUT .../outreach/{stepId} with status="sent" → creates OutreachEvent → shows toast
- [Skip] → calls PUT with status="skipped"
- [Reschedule] → date picker → updates scheduled_date
- [+ Add Custom Step] → modal: day offset, type="custom", channel, subject, content
- TCPA warning: if prospect has no consent_captured_at and no consent_given, show yellow banner: "No consent recorded — cannot send email/SMS. Record consent first."

- [ ] **Step 2: Commit**

```bash
git add public/crm/js/dashboard/panels/sales-crm/outreach-cadence.js
git commit -m "feat(crm): add outreach cadence timeline UI with send/skip/reschedule"
```

---

## Task 12: Contact Import Modal

**Files:**
- Modify: `public/crm/js/dashboard/panels/sales-crm/seller-prospects.js`

- [ ] **Step 1: Add import modal to seller-prospects.js**

Add `_importModal()` function:
- File upload input (accepts .csv, .xlsx)
- Source label input (text field: "UN List", "Doctors List", "LinkedIn Export", etc.)
- [Preview] button → calls POST .../import?preview=true with FormData → shows first 10 rows in table with detected column mapping
- Column mapping dropdowns: for each detected column, let agent map to: name, email, phone, address, skip
- [Import] button → calls POST .../import with FormData → shows summary (created/skipped/errors)
- Close modal → refresh prospect table

- [ ] **Step 2: Commit**

```bash
git add public/crm/js/dashboard/panels/sales-crm/seller-prospects.js
git commit -m "feat(crm): add CSV/XLSX contact import modal for seller prospects"
```

---

## Task 13: Final Integration + Smoke Test

- [ ] **Step 1: Verify sidebar shows "Seller Prospects" as first Sales CRM entry**

Open CRM → check sidebar.

- [ ] **Step 2: Verify table loads**

Navigate to Seller Prospects → empty table should render with filter bar and buttons.

- [ ] **Step 3: Add a prospect manually**

Click [+ Add Prospect] → enter address → verify SellerLead created in DB.

- [ ] **Step 4: Verify auto-research**

Click [Re-Run Research] on the prospect → verify ACRIS/DOF/DOB/PLUTO data populates.

- [ ] **Step 5: Verify pitch packet**

Open Pitch Packet tab → [Generate] → verify 4 pillars render with data.

- [ ] **Step 6: Verify PDF**

Click [Generate PDF] → verify PDF downloads with REBNY attribution.

- [ ] **Step 7: Verify outreach cadence**

Check Outreach tab → verify 7 default steps created with correct dates.

- [ ] **Step 8: Verify import**

Click [Import Contacts] → upload a test CSV → verify preview and import work.

- [ ] **Step 9: Verify convert**

Click [Convert to Active Seller] → verify Lead created, prospect marked converted.

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "feat(crm): seller prospecting engine — complete integration"
```
