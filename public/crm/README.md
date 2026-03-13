# CRM Production Files — `public/crm/`

## This Is the Source of Truth

All CRM/search production files live here. Edit them directly — no external copy step needed.

Previously these files were split between `search-modular` (Desktop) and `mallan-nyc` (Git/Vercel).
As of March 2026, everything is consolidated here in one repo.

## URLs (Clean)

All CRM pages use clean URLs via Vercel rewrites. The underlying HTML filenames still work but should not be used in links.

| Clean URL | What | File |
|-----------|------|------|
| `mallan.nyc/login` | Login (all portals) | `login.html` |
| `mallan.nyc/crm/login` | Login (alias, kept for compat) | `login.html` |
| `mallan.nyc/crm` | CRM dashboard | `MALLAN-NYC-CRM-FINAL2.html` |
| `mallan.nyc/crm/dashboard` | CRM dashboard (alias) | `MALLAN-NYC-CRM-FINAL2.html` |
| `mallan.nyc/crm/search` | Agent search (IDX) | `index-built.html` |
| `mallan.nyc/crm/sale-listing` | Sale listing submission | `SALE-FORM-REDESIGN.html` |
| `mallan.nyc/crm/rental-listing` | Rental listing submission | `RENTAL-FORM-REDESIGN.html` |
| `mallan.nyc/crm/sale-view` | Sale listing viewer (read-only) | `SALE-FORM-WITH-TOOLS.html` |
| `mallan.nyc/crm/rental-view` | Rental listing viewer (read-only) | `RENTAL-FORM-WITH-TOOLS.html` |
| `mallan.nyc/crm/buyer-deal` | Buyer deal / commission request | `BUYER-DEAL-FORM.html` |
| `mallan.nyc/crm/tenant-deal` | Tenant deal / commission request | `TENANT-DEAL-FORM.html` |

## File Structure

```
public/crm/
  login.html                      # Login page (/login — also /crm/login)
  MALLAN-NYC-CRM-FINAL2.html      # CRM hub (/crm or /crm/dashboard)
  index-built.html                # IDX search (/crm/search) — BUILD ARTIFACT, not in git
  SALE-FORM-REDESIGN.html         # Sale submission (/crm/sale-listing)
  SALE-FORM-WITH-TOOLS.html       # Sale viewer (/crm/sale-view)
  RENTAL-FORM-REDESIGN.html       # Rental submission (/crm/rental-listing)
  RENTAL-FORM-WITH-TOOLS.html     # Rental viewer (/crm/rental-view)
  BUYER-DEAL-FORM.html            # Buyer deal form (/crm/buyer-deal)
  TENANT-DEAL-FORM.html           # Tenant deal form (/crm/tenant-deal)
  css/                            # 8 stylesheets
  js/                             # Runtime JS (9 subdirs)
  html/                           # Section partials + modals (build source)
  tests/                          # 29 test files
  scripts/                        # 7 utility scripts
  COMPLIANCE/                     # Compliance checklist
  CONTRACTS/                      # API contract
  docs/                           # Extraction plan
  build.js                        # Assembles index-built.html from modular source
  index.html                      # Source template for build.js
```

## Build System

`index-built.html` is a **build artifact** — it's assembled from `index.html` + `html/` partials + `css/` + `js/` by `build.js`.

**It is NOT tracked in git.** Vercel generates it at deploy time via:

```
node public/crm/build.js && npm run build
```

To rebuild locally:
```bash
npm run crm:build
```

To run tests:
```bash
npm run crm:test
```

## Middleware Protection

- `/crm/*` paths have `X-Robots-Tag: noindex, nofollow` header (set in `vercel.json`)
- Development files (`html/`, `tests/`, `scripts/`, `build.js`, `index.html`) return 404 via middleware
- HTML files have their own JS-based auth gates that redirect to `/login`
- API calls go to `/api/crm/*` and `/api/portal/*` which require session cookie or Bearer token

## Internal Link Convention

All internal links use clean URLs (`/login`, `/crm/dashboard`, `/crm/search`), not raw filenames. This is enforced by Vercel rewrites in `vercel.json`.

## Login & Portal Routing

Login is at `mallan.nyc/login` (shared by all portal types). After login, each role is routed to its own dashboard:

| Portal | Redirect |
|--------|----------|
| Broker / Agent | `/crm/dashboard` |
| Buyer | `/crm/dashboard#buyer` |
| Tenant | `/crm/dashboard#tenant` |
| Seller | `/crm/dashboard#seller` |
| Landlord | `/crm/dashboard#landlord` |
