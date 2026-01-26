# Agent Listing Management & REBNY RLS Integration Plan

**Version:** 1.0
**Date:** January 2026
**Status:** Planning
**Compliance:** NY DOS, REBNY RLS, Fair Housing Act, RESO 2.0, TCPA

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Schema](#3-database-schema)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [API Routes](#5-api-routes)
6. [Trestle/Cotality Integration](#6-trestlecotality-integration)
7. [Compliance Workflow](#7-compliance-workflow)
8. [UI Components](#8-ui-components)
9. [Code Examples](#9-code-examples)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Implementation Phases](#11-implementation-phases)

---

## 1. Executive Summary

### Objective
Enable licensed agents to create and manage property listings through the mallan.nyc platform with full REBNY RLS compliance, supporting both private (internal-only) and public (RLS-syndicated) listing workflows.

### Key Features
- **Private Listings**: Agent-created listings visible only within the brokerage
- **Public Listings**: Full REBNY RLS syndication via Cotality/Trestle API
- **Compliance Validation**: AI-powered + rule-based validation for every submission
- **Audit Trail**: Complete logging of all agent actions for compliance review

### Compliance Framework
| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| NY DOS | License display, advertising rules | Agent license verification, disclaimers |
| REBNY RLS | Data standards, required fields | `rls-rules.json` validation |
| Fair Housing | Non-discriminatory language | AI + prohibited terms detection |
| RESO 2.0 | Data dictionary compliance | `reso-mapper.ts` transformation |
| TCPA/CTIA | Lead capture consent | Double opt-in, explicit checkboxes |

---

## 2. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MALLAN.NYC PLATFORM                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Agent UI   │───▶│  Next.js API │───▶│  Compliance Engine   │  │
│  │  (Protected) │    │   (Routes)   │    │  (lib/compliance/)   │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│         │                   │                      │                │
│         │                   │                      │                │
│         ▼                   ▼                      ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │    Clerk     │    │   Prisma     │    │   Claude AI          │  │
│  │    Auth      │    │   (Postgres) │    │   (Anthropic SDK)    │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│                             │                                       │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     EXTERNAL SERVICES         │
              ├───────────────────────────────┤
              │  ┌─────────────────────────┐  │
              │  │  Cotality/Trestle API   │  │
              │  │  (REBNY RLS Feed)       │  │
              │  │  api.cotality.com       │  │
              │  └─────────────────────────┘  │
              │                               │
              │  ┌─────────────────────────┐  │
              │  │  NYC Open Data APIs     │  │
              │  │  (ACRIS, DOB, etc.)     │  │
              │  └─────────────────────────┘  │
              └───────────────────────────────┘
```

### Data Flow: Listing Creation

```
Agent Form Submit
       │
       ▼
┌──────────────────┐     ┌──────────────────┐
│ Client Validation │────▶│ API Validation   │
│ (Zod schema)      │     │ (Server-side)    │
└──────────────────┘     └──────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Compliance Validation   │
                    │  1. Required fields      │
                    │  2. Conditional fields   │
                    │  3. Fair Housing check   │
                    │  4. NYC-specific rules   │
                    │  5. RESO format          │
                    └──────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
            ┌──────────────┐           ┌──────────────┐
            │   INVALID    │           │    VALID     │
            │ Return errors│           │ Save to DB   │
            └──────────────┘           └──────────────┘
                                              │
                                ┌─────────────┴─────────────┐
                                │                           │
                                ▼                           ▼
                        ┌──────────────┐           ┌──────────────┐
                        │   PRIVATE    │           │   PUBLIC     │
                        │ Internal only│           │ Submit to    │
                        │ No syndication│          │ Trestle API  │
                        └──────────────┘           └──────────────┘
```

---

## 3. Database Schema

### New Prisma Models

```prisma
// prisma/schema.prisma - ADDITIONS

model Listing {
  id                    BigInt    @id @default(autoincrement())
  listingKey            String    @unique @default(uuid()) // RESO ListingKey
  mlsId                 String?   @unique // Assigned by RLS after syndication

  // Status
  status                ListingStatus @default(DRAFT)
  mlsStatus             String?   // Active, Pending, Closed, etc.
  visibility            ListingVisibility @default(PRIVATE)

  // Property Identification
  propertyType          String    // Residential, ResidentialLease
  commonInterest        String?   // Condominium, StockCooperative, Condop

  // Address
  streetNumber          String
  streetName            String
  streetSuffix          String?
  unitNumber            String?
  city                  String
  stateOrProvince       String    @default("NY")
  postalCode            String
  countyOrParish        String    // Maps to NYC borough
  neighborhood          String?
  buildingTaxLot        String?   // Required for NYC
  latitude              Decimal?  @db.Decimal(10, 7)
  longitude             Decimal?  @db.Decimal(10, 7)

  // Pricing
  listPrice             Decimal   @db.Decimal(12, 2)
  originalListPrice     Decimal?  @db.Decimal(12, 2)
  closePrice            Decimal?  @db.Decimal(12, 2)

  // Property Details
  bedroomsTotal         Int
  bathroomsFull         Int?
  bathroomsHalf         Int?
  bathroomsTotal        Decimal?  @db.Decimal(3, 1)
  livingArea            Int?      // Square feet
  lotSizeArea           Decimal?  @db.Decimal(10, 2)
  yearBuilt             Int?
  storiesTotal          Int?

  // NYC-Specific
  maintenanceFee        Decimal?  @db.Decimal(10, 2)
  commonCharges         Decimal?  @db.Decimal(10, 2)
  realEstateTax         Decimal?  @db.Decimal(10, 2)
  taxAbatementYN        Boolean?
  taxAbatementEndDate   DateTime?
  flipTaxYN             Boolean?
  flipTaxAmount         Decimal?  @db.Decimal(10, 2)
  maxFinancing          Int?      // Percentage for co-ops
  boardApprovalRequired Boolean?
  newConstructionYN     Boolean?
  sponsorUnitYN         Boolean?
  subletAllowed         String?   // Yes, No, AfterXYears

  // Descriptions
  publicRemarks         String    @db.Text
  privateRemarks        String?   @db.Text

  // Commission
  buyerAgentCommission      Decimal?  @db.Decimal(5, 2)
  buyerAgentCommissionType  String?   // %, $

  // Dates
  listingContractDate   DateTime?
  onMarketDate          DateTime?
  expirationDate        DateTime?
  contractDate          DateTime?
  closeDate             DateTime?

  // Agent Relationship
  listAgentId           BigInt
  listAgent             Agent     @relation("ListAgent", fields: [listAgentId], references: [id])

  // Office (denormalized for RLS compliance)
  listOfficeMlsId       String    @default("MALLAN01")
  listOfficeName        String    @default("Mallan Real Estate Inc.")

  // Syndication
  syndicatedAt          DateTime?
  lastSyncAt            DateTime?
  rlsFeedId             String?   // ID from Trestle after submission

  // Compliance
  complianceCheckedAt   DateTime?
  complianceStatus      String?   // PASSED, WARNINGS, FAILED
  complianceNotes       String?   @db.Text

  // Audit
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  createdBy             BigInt
  updatedBy             BigInt?

  // Relations
  media                 ListingMedia[]
  openHouses            ListingOpenHouse[]
  auditLogs             ListingAuditLog[]

  @@map("listings")
  @@index([status, visibility])
  @@index([listAgentId])
  @@index([postalCode])
  @@index([neighborhood])
}

model ListingMedia {
  id            BigInt   @id @default(autoincrement())
  listingId     BigInt
  listing       Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  mediaType     String   // Photo, Video, VirtualTour, FloorPlan
  mediaURL      String
  mediaKey      String?  // S3/Cloudinary key
  order         Int      @default(0)
  caption       String?
  isPrimary     Boolean  @default(false)

  createdAt     DateTime @default(now())

  @@map("listing_media")
  @@index([listingId])
}

model ListingOpenHouse {
  id                  BigInt   @id @default(autoincrement())
  listingId           BigInt
  listing             Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  openHouseDate       DateTime
  openHouseStartTime  String   // HH:MM format
  openHouseEndTime    String
  openHouseType       String   // Public, BrokerOpen, ByAppointment
  openHouseRemarks    String?

  createdAt           DateTime @default(now())

  @@map("listing_open_houses")
  @@index([listingId])
  @@index([openHouseDate])
}

model ListingAuditLog {
  id          BigInt   @id @default(autoincrement())
  listingId   BigInt
  listing     Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  action      String   // CREATED, UPDATED, STATUS_CHANGE, SYNDICATED, COMPLIANCE_CHECK
  agentId     BigInt
  changes     Json?    // Previous vs new values
  ipAddress   String?
  userAgent   String?

  createdAt   DateTime @default(now())

  @@map("listing_audit_logs")
  @@index([listingId])
  @@index([agentId])
  @@index([createdAt])
}

enum ListingStatus {
  DRAFT
  PENDING_REVIEW
  ACTIVE
  PENDING
  CLOSED
  WITHDRAWN
  EXPIRED
  CANCELED
}

enum ListingVisibility {
  PRIVATE      // Internal only, not on public site
  COMING_SOON  // Teaser on site, no full details
  PUBLIC       // Fully visible, not syndicated
  SYNDICATED   // Submitted to RLS
}

// Update Agent model to include listing relation
model Agent {
  // ... existing fields ...

  listings    Listing[] @relation("ListAgent")
}
```

### Migration Command

```bash
npx prisma migrate dev --name add_listings_schema
```

---

## 4. Authentication & Authorization

### Clerk Integration

**Installation:**
```bash
npm install @clerk/nextjs
```

**Environment Variables:**
```env
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/agent/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/agent/onboarding
```

**Middleware Configuration:**
```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/agent(.*)',
  '/api/agent(.*)',
  '/admin(.*)',
  '/api/admin(.*)',
]);

const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  if (isProtectedRoute(req)) {
    if (!userId) {
      return auth.redirectToSignIn();
    }

    // Check agent role from Clerk metadata
    const role = sessionClaims?.metadata?.role as string;

    if (isAdminRoute(req) && role !== 'ADMIN' && role !== 'BROKER') {
      return new Response('Forbidden', { status: 403 });
    }
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| AGENT | Create/edit own listings, view own deals |
| SENIOR_AGENT | + View team listings, approve pending |
| BROKER | + View all listings, manage agents |
| ADMIN | + System configuration, compliance review |

---

## 5. API Routes

### Route Structure

```
app/api/
├── agent/
│   ├── listings/
│   │   ├── route.ts           # GET (list), POST (create)
│   │   ├── [id]/
│   │   │   ├── route.ts       # GET, PUT, DELETE
│   │   │   ├── submit/
│   │   │   │   └── route.ts   # POST (submit to RLS)
│   │   │   ├── withdraw/
│   │   │   │   └── route.ts   # POST (withdraw from RLS)
│   │   │   └── media/
│   │   │       └── route.ts   # POST (upload), DELETE
│   │   └── validate/
│   │       └── route.ts       # POST (pre-submit validation)
│   ├── profile/
│   │   └── route.ts           # GET, PUT agent profile
│   └── dashboard/
│       └── route.ts           # GET dashboard metrics
├── rls/
│   ├── feed/
│   │   └── route.ts           # GET incoming RLS feed
│   ├── submit/
│   │   └── route.ts           # POST to Trestle
│   └── status/
│       └── route.ts           # GET submission status
└── webhooks/
    └── trestle/
        └── route.ts           # POST Trestle webhooks
```

### API Specifications

#### POST `/api/agent/listings`

**Request:**
```typescript
interface CreateListingRequest {
  propertyType: 'Residential' | 'ResidentialLease';
  commonInterest?: 'Condominium' | 'StockCooperative' | 'Condop';
  visibility: 'PRIVATE' | 'COMING_SOON' | 'PUBLIC';

  // Address
  streetNumber: string;
  streetName: string;
  streetSuffix?: string;
  unitNumber?: string;
  city: string;
  postalCode: string;
  countyOrParish: string;
  neighborhood?: string;
  buildingTaxLot?: string;

  // Pricing
  listPrice: number;

  // Details
  bedroomsTotal: number;
  bathroomsFull?: number;
  bathroomsHalf?: number;
  livingArea?: number;
  yearBuilt?: number;

  // NYC-Specific (conditional)
  maintenanceFee?: number;
  commonCharges?: number;
  realEstateTax?: number;
  maxFinancing?: number;
  flipTaxYN?: boolean;
  flipTaxAmount?: number;

  // Descriptions
  publicRemarks: string;
  privateRemarks?: string;

  // Commission
  buyerAgentCommission?: number;
  buyerAgentCommissionType?: '%' | '$';

  // Dates
  listingContractDate?: string;
  expirationDate?: string;
}
```

**Response (Success):**
```typescript
interface CreateListingResponse {
  success: true;
  listing: {
    id: string;
    listingKey: string;
    status: ListingStatus;
    visibility: ListingVisibility;
    compliance: {
      status: 'PASSED' | 'WARNINGS';
      warnings?: string[];
      suggestions?: string[];
    };
  };
}
```

**Response (Validation Error):**
```typescript
interface ValidationErrorResponse {
  success: false;
  error: 'VALIDATION_FAILED';
  compliance: {
    status: 'FAILED';
    errors: Array<{
      field: string;
      message: string;
      rule: string;
    }>;
    warnings?: string[];
  };
}
```

#### POST `/api/agent/listings/[id]/submit`

Submit listing to REBNY RLS via Trestle API.

**Request:**
```typescript
interface SubmitToRLSRequest {
  confirmCompliance: boolean; // Agent must confirm
  confirmFairHousing: boolean;
}
```

**Response:**
```typescript
interface SubmitToRLSResponse {
  success: boolean;
  rlsFeedId?: string;
  mlsId?: string;
  syndicatedAt?: string;
  error?: {
    code: string;
    message: string;
    trestleResponse?: unknown;
  };
}
```

---

## 6. Trestle/Cotality Integration

### OAuth2 Authentication

```typescript
// lib/trestle/auth.ts

const TRESTLE_BASE_URL = 'https://api.cotality.com';
const TOKEN_ENDPOINT = `${TRESTLE_BASE_URL}/oauth/token`;

interface TrestleTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getTrestleAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300000) {
    return cachedToken.token;
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.TRESTLE_CLIENT_ID!,
      client_secret: process.env.TRESTLE_CLIENT_SECRET!,
      scope: 'api',
    }),
  });

  if (!response.ok) {
    throw new Error(`Trestle auth failed: ${response.status}`);
  }

  const data: TrestleTokenResponse = await response.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return cachedToken.token;
}
```

### Property Submission

```typescript
// lib/trestle/submit.ts

import { getTrestleAccessToken } from './auth';
import { mapListingToRESO } from '../compliance/reso-mapper';
import { validateListing } from '../compliance/rebny-validator';

const TRESTLE_BASE_URL = 'https://api.cotality.com';
const PROPERTY_ENDPOINT = `${TRESTLE_BASE_URL}/odata/Property`;

interface TrestleSubmitResult {
  success: boolean;
  listingKey?: string;
  mlsId?: string;
  errors?: Array<{ code: string; message: string; field?: string }>;
}

export async function submitListingToTrestle(
  listing: ListingData
): Promise<TrestleSubmitResult> {
  // Step 1: Validate against RLS rules
  const validation = await validateListing(listing);

  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors.map(e => ({
        code: 'VALIDATION_FAILED',
        message: e.message,
        field: e.field,
      })),
    };
  }

  // Step 2: Transform to RESO format
  const resoData = mapListingToRESO(listing);

  // Step 3: Get OAuth token
  const token = await getTrestleAccessToken();

  // Step 4: Submit to Trestle
  const response = await fetch(PROPERTY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(resoData),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[TRESTLE] Submit failed:', response.status, errorBody);

    return {
      success: false,
      errors: [{
        code: `HTTP_${response.status}`,
        message: `Trestle API error: ${response.statusText}`,
      }],
    };
  }

  const result = await response.json();

  return {
    success: true,
    listingKey: result.ListingKey,
    mlsId: result.ListingId,
  };
}
```

### Feed Ingestion (Incoming RLS Data)

```typescript
// lib/trestle/feed.ts

import { getTrestleAccessToken } from './auth';
import { mapRESOToListing } from '../compliance/reso-mapper';

const TRESTLE_BASE_URL = 'https://api.cotality.com';

interface FeedQueryOptions {
  modifiedSince?: Date;
  status?: string[];
  limit?: number;
  offset?: number;
}

export async function fetchRLSListings(options: FeedQueryOptions = {}) {
  const token = await getTrestleAccessToken();

  // Build OData query
  const filters: string[] = [];

  if (options.modifiedSince) {
    filters.push(`ModificationTimestamp gt ${options.modifiedSince.toISOString()}`);
  }

  if (options.status?.length) {
    const statusFilter = options.status.map(s => `MLSStatus eq '${s}'`).join(' or ');
    filters.push(`(${statusFilter})`);
  }

  const params = new URLSearchParams({
    $filter: filters.join(' and ') || undefined,
    $top: String(options.limit || 100),
    $skip: String(options.offset || 0),
    $orderby: 'ModificationTimestamp desc',
  } as Record<string, string>);

  const url = `${TRESTLE_BASE_URL}/odata/Property?${params}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Trestle feed fetch failed: ${response.status}`);
  }

  const data = await response.json();

  // Transform RESO to internal format
  return data.value.map(mapRESOToListing);
}
```

---

## 7. Compliance Workflow

### Validation Pipeline

```typescript
// lib/compliance/pipeline.ts

import { validateListing, ValidationResult } from './rebny-validator';
import { buildValidationPrompt } from './prompts';
import Anthropic from '@anthropic-ai/sdk';

interface ComplianceCheckResult extends ValidationResult {
  aiAnalysis?: {
    fairHousingScore: number;
    suggestions: string[];
    rewrittenRemarks?: string;
  };
}

export async function runCompliancePipeline(
  listing: ListingData,
  options: { useAI?: boolean } = {}
): Promise<ComplianceCheckResult> {
  // Step 1: Rule-based validation
  const ruleValidation = await validateListing(listing);

  // If major errors, return early
  if (ruleValidation.errors.length > 0) {
    return {
      ...ruleValidation,
      valid: false,
    };
  }

  // Step 2: AI-powered Fair Housing analysis (optional)
  let aiAnalysis: ComplianceCheckResult['aiAnalysis'];

  if (options.useAI && listing.publicRemarks) {
    const anthropic = new Anthropic();

    const prompt = buildValidationPrompt(listing);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    // Parse AI response
    const content = response.content[0];
    if (content.type === 'text') {
      try {
        aiAnalysis = JSON.parse(content.text);
      } catch {
        console.warn('[COMPLIANCE] AI response parsing failed');
      }
    }
  }

  return {
    ...ruleValidation,
    aiAnalysis,
  };
}
```

### Pre-Submission Checklist

Before RLS submission, verify:

1. **Required Fields** (per `rls-rules.json`)
   - All 25+ mandatory fields populated
   - Conditional fields based on property type

2. **Fair Housing Compliance**
   - No prohibited terms in `publicRemarks`
   - AI analysis score > 0.8

3. **NYC-Specific Rules**
   - `BuildingTaxLot` present for NYC properties
   - Borough/County mapping correct
   - Co-op: `MaxFinancing` set
   - New construction: `SponsorUnitYN` set

4. **Agent Verification**
   - Agent license active and valid
   - Agent authorized to list for office

5. **Media Requirements**
   - At least 1 primary photo
   - No watermarks/text overlays (RLS rule)

---

## 8. UI Components

### Agent Dashboard Structure

```
/agent
├── /dashboard          # Metrics, recent activity
├── /listings
│   ├── /              # List all my listings
│   ├── /new           # Create listing form
│   └── /[id]
│       ├── /          # View/edit listing
│       ├── /media     # Manage photos
│       └── /submit    # RLS submission flow
├── /deals             # My transactions
└── /profile           # Agent profile/settings
```

### Listing Form Fields (Grouped)

**Step 1: Property Basics**
- Property Type (Residential / ResidentialLease)
- Listing Type (Co-op / Condo / Condop / Townhouse)
- Visibility (Private / Coming Soon / Public)

**Step 2: Address**
- Street Number, Name, Suffix
- Unit Number
- City (default: New York)
- Postal Code (validates NYC ranges)
- Borough (dropdown, maps to County)
- Neighborhood (typeahead)
- Building Tax Lot (BBL format)

**Step 3: Property Details**
- List Price
- Bedrooms, Bathrooms (Full/Half)
- Square Footage
- Year Built
- Stories

**Step 4: NYC Financials**
- Maintenance Fee (Co-op)
- Common Charges (Condo)
- Real Estate Taxes
- Tax Abatement (Y/N + End Date)
- Flip Tax (Y/N + Amount)
- Max Financing % (Co-op)
- Board Approval Required

**Step 5: Description**
- Public Remarks (with Fair Housing helper)
- Private Remarks (internal)
- Features checklist

**Step 6: Commission**
- Buyer Agent Commission
- Commission Type (% or $)

**Step 7: Review & Submit**
- Compliance check results
- Confirmation checkboxes
- Submit / Save as Draft

---

## 9. Code Examples

### Create Listing API Route

```typescript
// app/api/agent/listings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { runCompliancePipeline } from '@/lib/compliance/pipeline';
import { createListingSchema } from '@/lib/schemas/listing';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get agent from Clerk metadata
    const agent = await prisma.agent.findFirst({
      where: { clerkUserId: userId },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // 3. Parse and validate request
    const body = await request.json();
    const parsed = createListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: 'VALIDATION_FAILED',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const listingData = parsed.data;

    // 4. Run compliance pipeline
    const compliance = await runCompliancePipeline(listingData, { useAI: true });

    if (!compliance.valid) {
      return NextResponse.json({
        success: false,
        error: 'COMPLIANCE_FAILED',
        compliance: {
          status: 'FAILED',
          errors: compliance.errors,
          warnings: compliance.warnings,
        },
      }, { status: 422 });
    }

    // 5. Create listing in database
    const listing = await prisma.listing.create({
      data: {
        ...listingData,
        listAgentId: agent.id,
        createdBy: agent.id,
        status: 'DRAFT',
        complianceStatus: compliance.warnings?.length ? 'WARNINGS' : 'PASSED',
        complianceCheckedAt: new Date(),
      },
    });

    // 6. Create audit log
    await prisma.listingAuditLog.create({
      data: {
        listingId: listing.id,
        agentId: agent.id,
        action: 'CREATED',
        changes: listingData,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      },
    });

    // 7. Return success
    return NextResponse.json({
      success: true,
      listing: {
        id: listing.id.toString(),
        listingKey: listing.listingKey,
        status: listing.status,
        visibility: listing.visibility,
        compliance: {
          status: listing.complianceStatus,
          warnings: compliance.warnings,
          suggestions: compliance.suggestions,
        },
      },
    });

  } catch (error) {
    console.error('[API] Create listing error:', error);
    return NextResponse.json({
      success: false,
      error: 'SERVER_ERROR',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { clerkUserId: userId },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const visibility = searchParams.get('visibility');

    const listings = await prisma.listing.findMany({
      where: {
        listAgentId: agent.id,
        ...(status && { status: status as ListingStatus }),
        ...(visibility && { visibility: visibility as ListingVisibility }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        media: { where: { isPrimary: true }, take: 1 },
      },
    });

    return NextResponse.json({ listings });

  } catch (error) {
    console.error('[API] Get listings error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
```

### Submit to RLS Route

```typescript
// app/api/agent/listings/[id]/submit/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { submitListingToTrestle } from '@/lib/trestle/submit';
import { runCompliancePipeline } from '@/lib/compliance/pipeline';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get agent and verify ownership
    const agent = await prisma.agent.findFirst({
      where: { clerkUserId: userId },
    });

    const listing = await prisma.listing.findFirst({
      where: {
        id: BigInt(params.id),
        listAgentId: agent?.id,
      },
      include: { media: true },
    });

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // 3. Verify agent has confirmed compliance
    const body = await request.json();
    if (!body.confirmCompliance || !body.confirmFairHousing) {
      return NextResponse.json({
        error: 'Must confirm compliance acknowledgment',
      }, { status: 400 });
    }

    // 4. Run final compliance check
    const compliance = await runCompliancePipeline(listing, { useAI: true });

    if (!compliance.valid) {
      return NextResponse.json({
        success: false,
        error: 'COMPLIANCE_FAILED',
        compliance,
      }, { status: 422 });
    }

    // 5. Submit to Trestle
    const result = await submitListingToTrestle(listing);

    if (!result.success) {
      // Log failed attempt
      await prisma.listingAuditLog.create({
        data: {
          listingId: listing.id,
          agentId: agent!.id,
          action: 'SYNDICATION_FAILED',
          changes: { errors: result.errors },
        },
      });

      return NextResponse.json({
        success: false,
        error: 'RLS_SUBMIT_FAILED',
        details: result.errors,
      }, { status: 502 });
    }

    // 6. Update listing with RLS data
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        visibility: 'SYNDICATED',
        mlsId: result.mlsId,
        rlsFeedId: result.listingKey,
        syndicatedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    // 7. Log success
    await prisma.listingAuditLog.create({
      data: {
        listingId: listing.id,
        agentId: agent!.id,
        action: 'SYNDICATED',
        changes: {
          mlsId: result.mlsId,
          rlsFeedId: result.listingKey,
        },
      },
    });

    return NextResponse.json({
      success: true,
      mlsId: result.mlsId,
      rlsFeedId: result.listingKey,
      syndicatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[API] Submit to RLS error:', error);
    return NextResponse.json({
      success: false,
      error: 'SERVER_ERROR',
    }, { status: 500 });
  }
}
```

### Listing Form Component (Partial)

```typescript
// app/agent/listings/new/page.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createListingSchema, CreateListingInput } from '@/lib/schemas/listing';

const NYC_BOROUGHS = [
  { value: 'New York', label: 'Manhattan' },
  { value: 'Kings', label: 'Brooklyn' },
  { value: 'Queens', label: 'Queens' },
  { value: 'Bronx', label: 'Bronx' },
  { value: 'Richmond', label: 'Staten Island' },
];

export default function NewListingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [complianceResult, setComplianceResult] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateListingInput>({
    resolver: zodResolver(createListingSchema),
    defaultValues: {
      propertyType: 'Residential',
      visibility: 'PRIVATE',
      city: 'New York',
      stateOrProvince: 'NY',
    },
  });

  const onSubmit = async (data: CreateListingInput) => {
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/agent/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        router.push(`/agent/listings/${result.listing.id}`);
      } else {
        setComplianceResult(result.compliance);
        // Show errors to user
      }
    } catch (error) {
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validate description for Fair Housing as user types
  const validateRemarks = async (remarks: string) => {
    if (remarks.length < 50) return;

    const response = await fetch('/api/agent/listings/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicRemarks: remarks }),
    });

    const result = await response.json();
    setComplianceResult(result);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-serif font-medium mb-6">
        Create New Listing
      </h1>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4, 5, 6, 7].map((s) => (
          <div
            key={s}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
              s === step
                ? 'bg-brand-gold text-white'
                : s < step
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Step 1: Property Basics */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Property Type *
              </label>
              <select
                {...form.register('propertyType')}
                className="w-full px-4 py-3 border rounded-lg"
              >
                <option value="Residential">For Sale</option>
                <option value="ResidentialLease">For Rent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Listing Type
              </label>
              <select
                {...form.register('commonInterest')}
                className="w-full px-4 py-3 border rounded-lg"
              >
                <option value="">Select...</option>
                <option value="Condominium">Condominium</option>
                <option value="StockCooperative">Co-op</option>
                <option value="Condop">Condop</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Visibility *
              </label>
              <div className="grid grid-cols-3 gap-4">
                {['PRIVATE', 'COMING_SOON', 'PUBLIC'].map((v) => (
                  <label
                    key={v}
                    className={`p-4 border rounded-lg cursor-pointer ${
                      form.watch('visibility') === v
                        ? 'border-brand-gold bg-brand-gold/5'
                        : 'border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      value={v}
                      {...form.register('visibility')}
                      className="sr-only"
                    />
                    <span className="font-medium">{v.replace('_', ' ')}</span>
                    <p className="text-xs text-gray-500 mt-1">
                      {v === 'PRIVATE' && 'Internal only, not on website'}
                      {v === 'COMING_SOON' && 'Teaser on site, no details'}
                      {v === 'PUBLIC' && 'Fully visible, not syndicated'}
                    </p>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Description with Fair Housing helper */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Public Description *
              </label>
              <textarea
                {...form.register('publicRemarks')}
                rows={8}
                className="w-full px-4 py-3 border rounded-lg"
                placeholder="Describe the property features. Avoid discriminatory language."
                onBlur={(e) => validateRemarks(e.target.value)}
              />
              {form.formState.errors.publicRemarks && (
                <p className="text-red-500 text-sm mt-1">
                  {form.formState.errors.publicRemarks.message}
                </p>
              )}
            </div>

            {/* Fair Housing compliance feedback */}
            {complianceResult?.warnings?.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-800 mb-2">
                  Fair Housing Review
                </h4>
                <ul className="list-disc pl-4 text-sm text-yellow-700">
                  {complianceResult.warnings.map((w: string, i: number) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {complianceResult?.aiAnalysis?.suggestions?.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">
                  Suggestions
                </h4>
                <ul className="list-disc pl-4 text-sm text-blue-700">
                  {complianceResult.aiAnalysis.suggestions.map(
                    (s: string, i: number) => (
                      <li key={i}>{s}</li>
                    )
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 border border-gray-300 rounded-lg"
            >
              Back
            </button>
          )}

          {step < 7 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-6 py-3 bg-brand-dark text-white rounded-lg ml-auto"
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-brand-gold text-white rounded-lg ml-auto disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Listing'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
```

---

## 10. Risks & Mitigations

### Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Fair Housing violation in listing description | Critical | Medium | AI + rule-based validation, manual review queue |
| Invalid data submitted to RLS | High | Medium | Multi-layer validation, Trestle error handling |
| Agent submits without authorization | High | Low | Clerk auth, license verification, audit logs |
| Stale RLS token causes failures | Medium | Medium | Token caching with expiry buffer, auto-refresh |
| Data sync issues between local and RLS | Medium | Medium | ModificationTimestamp tracking, reconciliation job |
| PII exposure in logs/errors | High | Low | Sanitize logs, mask sensitive fields |

### Fair Housing Compliance

**Detection Layers:**
1. **Rule-based**: 40+ prohibited terms from `rls-rules.json`
2. **AI analysis**: Claude evaluates full context, detects subtle bias
3. **Human review**: Flagged listings require broker approval

**Prohibited Term Categories:**
- Family status references
- Religious proximity indicators
- Source of income discrimination
- Ability/disability language
- Age-based restrictions

**Implementation:**
```typescript
// On every listing save/update
const fairHousingCheck = validateFairHousing(listing);
if (fairHousingCheck.violations.length > 0) {
  // Block submission, require fix
  throw new FairHousingViolationError(fairHousingCheck.violations);
}
if (fairHousingCheck.warnings.length > 0) {
  // Allow submission with warnings logged
  await logComplianceWarning(listing.id, fairHousingCheck.warnings);
}
```

### Audit Trail Requirements

**Logged Actions:**
- Listing created/updated/deleted
- Status changes
- Compliance check results
- RLS submissions (success/failure)
- Agent login/logout

**Retention:**
- Audit logs retained 7 years (NY DOS requirement)
- Compliance reports archived monthly

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Add Listing model to Prisma schema
- [ ] Run database migration
- [ ] Implement Clerk authentication
- [ ] Create protected route middleware
- [ ] Set up agent onboarding flow

### Phase 2: Listing CRUD (Week 3-4)
- [ ] Build listing creation form (all steps)
- [ ] Implement `/api/agent/listings` routes
- [ ] Add real-time compliance validation
- [ ] Create listing detail/edit pages
- [ ] Implement media upload (S3/Cloudinary)

### Phase 3: Compliance Integration (Week 5)
- [ ] Integrate AI validation with form
- [ ] Build compliance review dashboard
- [ ] Add Fair Housing helper UI
- [ ] Create audit log viewer for admins

### Phase 4: Trestle Integration (Week 6-7)
- [ ] Implement OAuth2 token management
- [ ] Build RLS submission pipeline
- [ ] Add webhook handler for status updates
- [ ] Create feed ingestion for incoming listings
- [ ] Build reconciliation job

### Phase 5: Polish & QA (Week 8)
- [ ] End-to-end testing
- [ ] Compliance audit
- [ ] Performance optimization
- [ ] Documentation completion
- [ ] Agent training materials

---

## Environment Variables

Add to `.env.local`:

```env
# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Trestle/Cotality API
TRESTLE_CLIENT_ID=your_client_id
TRESTLE_CLIENT_SECRET=your_client_secret
TRESTLE_BASE_URL=https://api.cotality.com

# Anthropic (existing)
ANTHROPIC_API_KEY=sk-ant-...

# Media Storage
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

---

## References

- **REBNY RLS Rules**: `lib/compliance/rls-rules.json` (source of truth)
- **RESO Data Dictionary 2.0**: https://ddwiki.reso.org/
- **Trestle API Docs**: https://developer.cotality.com/
- **NY DOS Advertising Rules**: https://dos.ny.gov/real-estate-advertising
- **Fair Housing Act**: https://www.hud.gov/program_offices/fair_housing_equal_opp

---

*Document maintained by engineering team. Last updated: January 2026.*
