# PII & Distribution Compliance Checklist

> **Version:** 1.0.0
> **Date:** 2026-03-01
> **Applies to:** mallan-nyc repo (production)
> **Enforcement:** `public/crm/scripts/validate-production.sh` (CRM validation) + `npm run rls:validate` (mallan-nyc)

---

## 1. No Hardcoded PII

| Check | Rule | Enforcement |
|-------|------|-------------|
| Names | No real agent/broker/client names in HTML/JS source | grep fail: `Maya Allan` |
| Emails | No real email addresses | grep fail: `maya@`, `@mallan.nyc` (in source) |
| Phones | No real phone numbers | grep fail: `646-258`, `(646)` |
| Licenses | No license numbers | grep fail: `103112` |
| Avatars | No PII in avatar URLs | grep fail: `ui-avatars.com` |
| Passwords | No hardcoded passwords | grep fail: `broker2024`, `password:` with literal values |

**Source of identity:** Session cookie via `MallanAPI.init()`. All agent/broker fields populated from `/api/auth/me` response at runtime.

---

## 2. No PII in URLs

| Check | Rule |
|-------|------|
| No agent name in URL params | `?agentName=` PROHIBITED |
| No email in URL params | `?email=` PROHIBITED |
| No phone in URL params | `?phone=` PROHIBITED |
| No license in URL params | `?license=` PROHIBITED |
| Avatar images from session | No `ui-avatars.com/?name=Real+Name` |
| Viewer IDs only | Viewers accept `?listingId=` and `?role=` only |

---

## 3. Six Distribution Gates (Server-Side Enforcement)

All 6 gates are enforced at the API layer. UI may only DISPLAY gate status (read-only indicators). UI must NEVER override or bypass gate logic.

| Gate | Field | Server Rule | UI Display |
|------|-------|-------------|------------|
| 1. Owner Opt-Out | `OwnerOptOutYN` | If true, exclude from all public feeds | Gray "Owner Opt-Out" badge |
| 2. Participant Only | `ParticipantOnlyYN` | If true, exclude from IDX/VOW | Gray "Participant Only" badge |
| 3. IDX Display | `InternetEntireListingDisplayYN` | If false, exclude from IDX search *(no separate IDX field on Trestle)* | Hidden from search results |
| 4. Syndication | `SyndicateTo` | If disabled, exclude from syndication feeds *(UCBA: `SyndicateYN`)* | Orange "NOT SYNDICATED" badge |
| 5. Coming Soon | `ComingSoonDate` | If set + future, show badge, block showings | Blue "Coming Soon" badge |
| 6. Closed Status | `MlsStatus` = Closed/Expired | Remove/mark within 24 hours | Strike-through or hidden |

**REBNY penalty for gate violations:** $250 first offense, $500 subsequent, up to $10K + suspension.

---

## 4. REBNY RLS Field Coverage

| Requirement | Status |
|-------------|--------|
| Total RLS fields | 902 |
| Required fields | 41 |
| Conditional fields | 86 |
| RESO-to-RLS renames | 23 |
| Picklist values | 2,066 across 117 lookups |
| Field mapping source of truth | `data/rebny-rls-property-fields.csv` (mallan-nyc) |
| Validator | `npm run rls:validate` — 10 sections, 0 UNKNOWN required |

---

## 5. Viewer File Safety (WITH-TOOLS = Read-Only)

| Check | Rule |
|-------|------|
| No `<form>` tags with `action=` or `method="POST"` | Viewers are display-only |
| No `type="submit"` buttons | No submission capability |
| No `setInterval` for autosave | No background saves |
| `VIEWER_MODE = true` always | No form-mode code path |
| `data-rls-viewer="true"` on body | Validator can identify viewers |
| Agent info masked for buyer/tenant | API-layer + CSS defense-in-depth |

---

## 6. Fair Housing Compliance

| Requirement | Standard |
|-------------|----------|
| Federal Fair Housing Act | No discriminatory language or filtering by race, color, religion, sex, national origin, disability, familial status |
| NY State Human Rights Law | Adds: age, marital status, sexual orientation, military status |
| NYC Human Rights Law Title 8 | Adds: lawful occupation, citizenship, partnership status, gender identity |
| Scanner | Fair Housing word scanner (19 patterns) in submission forms |
| Penalty | $250 first offense, $500 + RLS termination second offense |

---

## 7. Additional Compliance

| Requirement | Rule |
|-------------|------|
| REBNY attribution | Required on all IDX/VOW displayed listings |
| Update timestamp | Required on displayed data |
| Statistical disclaimer | "Based on information from the REBNY Listing Service..." |
| Coming Soon badge | "Coming Soon. No Showings or Open House until [date]" |
| Closed listings | Remove/mark within 24 hours |
| Commission disclosure | Negotiability disclosure in listing/buyer agreements |
| No "Off-Market" language | REBNY prohibited term |
| No agent info in descriptions | Name, contact, URL prohibited in property descriptions |
| No compensation in descriptions | Broker fees prohibited in property descriptions/comments |

---

## Verification Commands

```bash
# CRM validation:
bash public/crm/scripts/validate-production.sh

# In mallan-nyc:
npm run rls:validate
```

Both must pass before any commit or deployment.
