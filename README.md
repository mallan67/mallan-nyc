# Mallan NYC — New York Brokerage Platform  
**Compliance-First · Fast · Scalable**

**Status:** Active Development  
**Jurisdiction:** New York State / NYC  
**Policies:** NY DOS Advertising · REBNY RLS Display Rules · Fair Housing · TCPA/CTIA · CAN-SPAM · NY SHIELD · WCAG 2.1 AA  

---

## What This Product Is

Mallan NYC is a **compliance-first New York brokerage platform** designed to support public listing search, lawful lead capture, and internal brokerage operations. The system prioritizes regulatory safety, performance (Core Web Vitals), accessibility (WCAG 2.1 AA), and a clean architecture that can scale without fragmentation.

---

## Executive Summary (3 Pillars)

### 1) Compliance by Design
- Required notices and SOPs  
- Lawful advertising and listing display rules  
- Fair housing safeguards  
- Consented lead capture  
- Immutable audit trails  

### 2) Superior Consumer Experience
- Fast, mobile-first UX  
- Accessible (WCAG 2.1 AA)  
- Deep inventory with map, commute, and school layers  
- Instant scheduling and transparent documentation  
- Multilingual support  
- Core Web Vitals performance targets  

### 3) Revenue & Operations Engine
- Automated lead routing and CRM intake  
- Consent-aware email/SMS nurturing  
- Listing syndication controls  
- Analytics and attribution  
- Offers, disclosures, e-sign, commissions, reporting  

---

## Immediate Cleanup & MVP Lock (Required)

This repository is being consolidated into **one coherent system**.  
**We are not restarting the project. We are removing ambiguity.**

---

### 1) Repository Cleanup (Clean Slate Without Restarting)

To eliminate breakage and accidental imports, the following actions are mandatory.

#### Delete or Quarantine
- Move `frontend/` → `archive/frontend-legacy/` (or delete if unused)  
- Delete all:
  - `backup_*` directories  
  - `*.bak` files  
- Remove any duplicate or legacy application roots  
- Ensure no legacy `pages/` router is active  

#### Keep Only These in the Active Build Path
