# PII & Distribution Compliance Checklist

> **Version:** 1.0.0
> **Date:** 2026-03-01
> **Applies to:** mallan-nyc repo (production)
> **Enforcement:** `npm run rls:validate` + `npm run compliance-check` + `npm run crm:test` (when `public/crm/**` is touched). *(The former `public/crm/scripts/validate-production.sh` no longer exists anywhere in the repo; its checks live in the npm validators above.)*

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
| Field universe | the live Cotality contract (`lib/cotality/generated/contract.ts`, compiled from the feed) |
| Required / conditional fields | `REBNY_UCBA_RULES` (lib/compliance/rebny-ucba-rules.ts) |
| Picklist values | the live Cotality vocabularies (`data/cotality-contract/lookups.live.json`) |
| Field mapping source of truth | `lib/cotality/generated/contract.ts` (field existence / type) + `lib/listings/mallan-form-contract.ts` (form bindings) |
| Validator | `npm run rls:validate` — 10 sections, 0 UNKNOWN required |

---

## 5. Viewer File Safety (read-only listing views)

> **2026-09-10:** this section was headed "Viewer File Safety (WITH-TOOLS = Read-Only)". The `*-WITH-TOOLS.html` viewer files it was written for no longer exist in the repo. The rules below still bind any read-only listing view rendered for a client — apply them to the current read-only surfaces rather than to the retired filenames.

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
| Scanner | Fair Housing scanning is two-layer, and the pattern count is **not** a fixed number — do not quote one. Server-side write block: `FAIR_HOUSING_HARD_BLOCKS` in `lib/compliance/rls-enforcement.ts` (line 138) = `HARDCODED_FH_PATTERNS` (line 88) **plus** patterns compiled at load time from `data/compliance/prohibited-terms.json`, so it grows when that JSON grows. Client-side scanner in submission forms: `public/crm/js/compliance/fair-housing.js`. Read the source for the current set. *(Corrected 2026-09-10; this row previously read "Fair Housing word scanner (19 patterns)", a count that matched neither layer.)* |
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
npm run rls:validate        # 10-section REBNY RLS validator — 0 UNKNOWN required
npm run compliance-check    # 93+ rules — BLOCKER+STRICT must be 0 failures
npm run crm:test            # only if public/crm/** was touched (172/172 smoke)
```

All must exit 0 before any commit or deployment.

> **Corrected 2026-09-10.** This block previously ordered `bash public/crm/scripts/validate-production.sh` and said "Both must pass". That script does not exist in the repo, so the gate as written could not be run.
