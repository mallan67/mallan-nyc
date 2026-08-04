# MALLAN BUSINESS & INTELLIGENCE OPERATING SYSTEM — MASTER PLAN

> **Repository start point for the complete Mallan platform plan.**

## Authority and scope

- Business owner and final decision authority: **Maya Allan**
- Repository: **`mallan67/mallan-nyc` only**
- Explicit exclusion: **Do not modify or treat `Mallan-Integrated` as part of this work.**
- This document governs the high-level business model and execution sequence once approved.
- Existing audits, issue records, PRs and technical plans are supporting evidence. They may not become competing overall plans.

## Critical current condition

Maya reports that public search has **zero usable function**. Search is the immediate P0 recovery program, but search is not the complete business architecture.

The exact next package is:

> **SRCH-001 — Reproduce and classify the complete live search failure.**

Do not rewrite search, add another search store, build predictive matching, add AI search, or merge old search work until the live failure, executing deployment, inventory population, search paths, filters, totals, pagination, media and state dependencies have been proved.

## High-level business operating system

Mallan is not a linear pipeline ending in intelligence. It is a business operating system with five value streams and permanent cross-cutting fabrics.

### Business value streams

1. Sense market and opportunity.
2. Acquire and develop relationships.
3. Advise and convert.
4. Execute and deliver.
5. Retain, expand and learn.

### Cross-cutting operating fabrics

- Data, identity, provenance and source authority.
- Intelligence, analytics, prediction and decisioning.
- Events, workflows, tasks, tools and approvals.
- Compliance, consent, security, audit and resilience.
- Measurement, outcomes and learning.

Intelligence must operate inside search, inventory, opportunity detection, relationship development, predictive behavior, brokerage management, marketing, valuation, listings, transactions, after-close service, business analysis and financial forecasting. It is not a final-stage feature.

## Business operating domains

1. Market, property and inventory intelligence.
2. Search, discovery and matching.
3. Growth, leads, relationships and opportunities.
4. Producing-professional workspace.
5. Brokerage leadership and supervisory control.
6. Client and professional-partner experience.
7. Marketing, content and outreach.
8. Valuation, pricing and financial advisory.
9. Representation, listings and landlord operations.
10. Transactions, closing and after-close.
11. Business performance, finance and strategy.

## Broker and agent operating model

The broker is also a producing agent. The system must model **one person with multiple roles**, not separate broker and agent identities.

Maya uses:

1. A **producing-professional workspace**, shared in core structure with authorized agents, for her own leads, clients, searches, valuations, listings, communications and transactions.
2. A **broker supervisory and owner control plane** for firm-wide lead distribution, assignments, licenses, supervision, approvals, sales, production, commissions, referrals, performance, finance, risk and technology.

Her personal production must roll into brokerage totals while remaining separately measurable.

### Lead distribution is first-class

The broker control plane must support manual, automatic and hybrid routing using geography, language, specialty, transaction type, price, source, capacity, availability, performance and license eligibility. It must also support conflict and duplicate checks, accept/decline/timeout, reassignment, return-to-pool, response SLAs, attribution, fairness review and immutable assignment history.

### People, licensing and performance are first-class

The platform must track license type and UID, sponsoring/representative broker relationship, office, license status and expiration, continuing education, agreements, commission plans, referral terms, onboarding, training, offboarding, access revocation, production, conversion, service levels, compliance, coaching and capacity.

## Valuation is a shared advisory engine

Valuation is not only for investors and is not merely a listing feature. One evidence engine must produce correctly labeled products for:

- sellers: pricing opinion, CMA and listing strategy;
- buyers: value, comparable-sale and offer analysis;
- landlords: rental value, concessions, renewal and hold/sell analysis;
- tenants: rent comparison and occupancy-cost analysis;
- investors: acquisition, cash flow, cap rate, financing, hold/sell/refinance and return analysis;
- bankers and lenders: collateral-market, comparable, rent, expense and scenario evidence packages;
- attorneys, estates and fiduciaries: dated market-evidence and scenario packages;
- brokers and agents: negotiation and client-advice support;
- brokerage leadership: portfolio, pricing-risk and opportunity analysis.

The system must never mislabel a brokerage market analysis as a formal appraisal.

## Development programs

### Program 0 — Search and operating truth

Restore usable, trustworthy search; verify deployment, Cotality/Neon population, query paths, filters, totals, pagination, media, distributed state and production behavior.

### Program 1 — Business and intelligence spine

Build canonical identity, provenance, signals, metrics, decision contracts, workflow, event/outbox, approvals, evaluations, outcomes, observability and cost controls.

### Program 2 — Brokerage growth engine

Complete leads, relationship memory, assignment/reassignment, producing workspace, broker command, roster, licenses, agreements, production, commissions, referrals, performance, capacity and revenue forecast.

### Program 3 — Client, marketing and outreach

Complete role-specific client journeys, portals, preference learning, segmentation, campaigns, content, communication eligibility, suppression, unsubscribe, response classification and attribution.

### Program 4 — Advisory and revenue delivery

Complete comps, valuation products, buyer/tenant advisory, seller/landlord pricing, investor underwriting, lender/professional evidence packages, representation, listings, landlord work, transactions, commission reconciliation, after-close and referrals.

### Program 5 — Advanced intelligence expansion

Advance existing intelligence into calibrated prediction, natural-language interfaces, voice, multimodal analysis and supervised durable agents. Advanced interfaces may not bypass deterministic tools, evidence, approval or compliance.

## Mandatory agent startup

Before changing code:

1. Confirm current `main`, production deployment, open PRs and relevant issue rows.
2. Confirm scope is `mallan67/mallan-nyc` only.
3. Read `AGENTS.md`, `docs/PROJECT-HEALTH-DASHBOARD.md`, `docs/PLATFORM-ISSUE-REGISTRY.md`, the latest dated handoff and applicable compliance/Neon documents.
4. Re-run current evidence. Do not inherit historical conclusions as current truth.
5. Identify the stakeholder, actor identity, operating role, authority, business capability, value stream, intelligence decision, workflow and measurable outcome affected.
6. State explicit scope and exclusions.
7. Reuse, migrate or retire existing implementations deliberately. Do not create another parallel system without a migration and retirement plan.
8. Preserve production unless the active work package explicitly authorizes a controlled change.
9. Update this file when the high-level model, roadmap, decision or active package changes.

## Current handoff

- Repository baseline used for this planning pass: `8b49b6839291c728b3dfd06a52027755434f6e62`.
- Active program: Program 0 — Search and operating truth.
- Active package: SRCH-001 — reproduce and classify the complete live search failure.
- Owner observation: public search has zero usable function.
- Canonical search modules exist on the referenced `main`; existence does not prove convergence or production usability.
- No application code, database, R2 object, environment, deployment or production configuration was changed by this documentation publication.

## Publication note

This repository version establishes the durable agent start point and the corrected business architecture. The longer working draft produced during the August 3–4 planning session remains under review and must be reconciled into this root document through evidence-backed, bounded documentation changes. Do not merge PR #585 as a competing authority.
