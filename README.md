Mallan NYC — New York Brokerage Platform

Compliance-First · Fast · Scalable

Status: Active Development
Jurisdiction: New York State / NYC
Policies: NY DOS Advertising · REBNY RLS Display Rules · Fair Housing · TCPA/CTIA · CAN-SPAM · NY SHIELD · WCAG 2.1 AA

What This Product Is

Mallan NYC is a compliance-first New York brokerage platform designed to support public listing search, lawful lead capture, and internal brokerage operations. The system prioritizes regulatory safety, performance (Core Web Vitals), accessibility (WCAG 2.1 AA), and a clean architecture that can scale without fragmentation.

Executive Summary (3 Pillars)
1) Compliance by Design

Required notices and SOPs

Lawful advertising and listing display rules

Fair housing safeguards

Consented lead capture

Immutable audit trails

2) Superior Consumer Experience

Fast, mobile-first UX

Accessible (WCAG 2.1 AA)

Deep inventory with map, commute, and school layers

Instant scheduling and transparent documentation

Multilingual support

Core Web Vitals performance targets

3) Revenue & Operations Engine

Automated lead routing and CRM intake

Consent-aware email/SMS nurturing

Listing syndication controls

Analytics and attribution

Offers, disclosures, e-sign, commissions, reporting

Immediate Cleanup & MVP Lock (Required)

This repository is being consolidated into one coherent system.
We are not restarting the project. We are removing ambiguity.

1) Repository Cleanup (Clean Slate Without Restarting)

To eliminate breakage and accidental imports, the following actions are mandatory.

Delete or Quarantine

Move frontend/ → archive/frontend-legacy/ (or delete if unused)

Delete all:

backup_* directories

*.bak files

Remove any duplicate or legacy application roots

Ensure no legacy pages/ router is active

Keep Only These in the Active Build Path
app/**
lib/**
prisma/**
public/**
config files (next.config.*, tsconfig, etc.)


Rule:
Anything outside this structure must be archived or deleted.
No experimental or backup files are allowed in the active build path.

2) Single Product Definition (MVP Lock)

This repository previously mixed:

an NYC Address Lookup tool

a brokerage platform

That ambiguity is now resolved.

Chosen MVP (Authoritative)

The MVP is a Compliance-First New York Brokerage Platform consisting of:

Public Website

Home

Search

Listing page template

Agents

Compliance pages (Fair Housing, SOPs, Agency, Privacy, Accessibility)

Lead Capture

Explicit consent (TCPA / CAN-SPAM)

Immutable consent ledger

Basic CRM Intake

Lead record creation

Lead routing rules

Activity and audit logging

MLS / RLS

Stubbed only

Architecture-ready

No live dependency required for MVP

NYC Address Lookup Tool

The existing NYC lookup logic must not be the homepage.

It may exist as:

/tools/nyc-lookup (internal/admin tool), or

a lead-magnet landing page

It is not the core product.

README Governance (Single Source of Truth)

This README.md is the authoritative system definition.

It must always answer, in this order:

What the product is

User flows (public, agent, admin)

Pages map (routes)

API surface (/api/*)

Data model (core entities)

Integrations (Planned / Stubbed / Live)

Compliance requirements and enforcement points

Environment variables

Runbook (dev, test, deploy)

Last Work Completed (append-only)

Change Control Rule

Any meaningful work must update Last Work Completed

History is append-only

No rewriting or deleting prior entries

If code contradicts this README:

The README wins

The code is considered incorrect or incomplete

Non-Negotiables (System Flow)

Single system: Next.js App Router is the only frontend and MVP backend surface

One routing system: app/ only

One source of truth: this README

Performance first: server components by default; client components only where required

Compliance Requirements (Must-Ship)
Required Public Pages

Fair Housing Notice (NYS)

SOPs page (NYS) with public versioned changelog

Agency disclosure explanation + downloadable forms + e-sign placement

Broker of Record identity and license

Agent license numbers where required

Accessibility statement + accommodation contact

Privacy / Terms / Cookie policy

Do-Not-Call policy + opt-out language

Listing attribution + “as-is” disclaimer per RLS rules

Lead Contacting

TCPA: explicit SMS consent + stored artifacts

DNC suppression

CAN-SPAM compliance

10DLC registration for SMS

Security

NY SHIELD Act safeguards

RBAC, encryption, audit logging

Site Map
Public

Home

Search (sale/rental; residential/commercial)

Neighborhoods / Buildings

Listings

Agents

Sell / Lease with Us

New Development

Resources

About / Contact

Compliance (Always Public)

Fair Housing

SOPs

Agency

Privacy / Terms

Accessibility / Disability

Protected (Login Required)

Member Listings (Private Opportunities)

Client collaboration features

UX & Performance Requirements
Search & Listings

Typeahead (address, zip, neighborhood, agent)

Map-first UI with polygons, clusters, heat layers

Commute filters (isochrones)

Deep filters (beds, baths, price, fees, DOM, pets, amenities)

Rich listing pages with building intelligence

Sale listings:

Buyer-agent compensation shown only if entered

ROI + Cash-on-Cash calculator

Rentals:

Rent vs Buy calculator

Accessibility & Trust

WCAG 2.1 AA

Inline Fair Housing + SOP links

Multilingual support

Performance Targets

LCP < 2.5s

CLS < 0.1

Minimal JS

Image optimization

CDN caching

Public pages should use ISR / revalidation where appropriate.

Listings: Types, Visibility, Distribution
A) RLS Listings

Source: REBNY RLS feed

Public: Yes

RLS rules enforced

Cached via ISR where allowed

B) Mallan Exclusives (Non-RLS)

Manually entered

Public by default, optional gating

Clearly labeled as non-RLS

Cached via ISR when public

Label: Mallan Exclusives
Disclaimer: Exclusively represented by Mallan Real Estate Inc. and not listed on REBNY RLS or any MLS.

C) Private Opportunities (Gated)

Manually entered

Login required

Never distributed to RLS or MLS

No indexing, no sitemaps

Authenticated caching only

Public reference label: Member Listings / Client Access

Required Fields

listing_type: RLS | MALLAN_EXCLUSIVE | PRIVATE_OPPORTUNITY

visibility: PUBLIC | MEMBERS_ONLY | REQUEST_ONLY | INTERNAL

distribution: RLS | MALLAN_ONLY | MLS_OTHER | PORTALS

Hard Rules

Private Opportunities → MALLAN_ONLY + not public

RLS distribution → RLS display rules enforced

No commingling without labels and filters

Back-End & Operations

RLS ingestion (validator, CDC)

Optional MLS feeds

Postgres + PostGIS

Lead routing and CRM workflows

Disclosure templates + e-sign

Offer/deal desk

Commission tracking + 1099 totals

Compliance toolkit

Audit logs

Consent ledger

Integrations (Status)
Connector	Purpose	Status
REBNY RLS	Listings feed	Planned
Manual Listings	Agent entry	Planned
Private Member Listings	Gated inventory	Planned
NYC Socrata	Public data	Live
OpenAI	AI assistance	Live
Maps	Google / Mapbox	Planned
Calendar	Scheduling	Planned
E-sign	Documents	Planned
SMS	Twilio / Telnyx	Planned
Email	SendGrid / SES	Planned
Analytics	GA4 server-side	Planned
Accounting	Excel / free	Planned
Delivery & Stack (Agreed)
MVP

Next.js App Router

Tailwind + TypeScript

Route Handlers (app/api)

PostgreSQL

Vercel

Sentry

CI tests (unit + accessibility)

Scale

Redis / queues

S3 media

WAF/CDN

BI warehouse

Last Work Completed (Append-Only)
2026-01-23

Repository audited; README rewritten as system authority

MVP locked to single Next.js App Router architecture

Cleanup rules defined (no restart)

Listing taxonomy finalized (RLS / Mallan Exclusive / Private)

Performance strategy defined (ISR, server components)
