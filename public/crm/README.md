# CRM Mockups — `public/crm/`

## This Is the Source of Truth

All CRM/search mockup files live here. Edit them directly — no external copy step needed.

Previously these files were split between `search-modular` (Desktop) and `mallan-nyc` (Git/Vercel).
As of March 2026, everything is consolidated here in one repo.

## URLs

| URL | What |
|-----|------|
| `mallan.nyc/crm/login.html` | CRM login |
| `mallan.nyc/crm/MALLAN-NYC-CRM-FINAL2.html` | CRM dashboard (Broker Admin + Agent Admin + 4 Client Portals) |
| `mallan.nyc/crm/index-built.html` | Agent search (IDX — per-agent private) |
| `mallan.nyc/crm/SALE-FORM-REDESIGN.html` | Sale listing submission form |
| `mallan.nyc/crm/RENTAL-FORM-REDESIGN.html` | Rental listing submission form |
| `mallan.nyc/crm/SALE-FORM-WITH-TOOLS.html` | Sale listing viewer (read-only) |
| `mallan.nyc/crm/RENTAL-FORM-WITH-TOOLS.html` | Rental listing viewer (read-only) |
| `mallan.nyc/crm/BUYER-DEAL-FORM.html` | Buyer deal / commission request (internal) |
| `mallan.nyc/crm/TENANT-DEAL-FORM.html` | Tenant deal / commission request (internal) |

## File Structure

```
public/crm/
  login.html                      # Login page
  MALLAN-NYC-CRM-FINAL2.html      # CRM hub
  index-built.html                # IDX search (BUILD ARTIFACT — not in git)
  SALE-FORM-REDESIGN.html         # Sale submission
  SALE-FORM-WITH-TOOLS.html       # Sale viewer
  RENTAL-FORM-REDESIGN.html       # Rental submission
  RENTAL-FORM-WITH-TOOLS.html     # Rental viewer
  BUYER-DEAL-FORM.html            # Buyer deal form
  TENANT-DEAL-FORM.html           # Tenant deal form
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
- HTML files have their own JS-based auth gates that redirect to `login.html`
- API calls go to `/api/crm/*` and `/api/portal/*` which require session cookie or Bearer token

## Why No Code Changes Were Needed

- All HTML file references use **relative paths** (`login.html`, `MALLAN-NYC-CRM-FINAL2.html`, etc.)
- `api-client.js` defaults to empty `_baseUrl` (same-origin) — only sets `https://mallan.nyc` when NOT on mallan.nyc
- CSS/JS are either inline or loaded via relative paths (`js/core/api-client.js`)
- Login redirect defaults to `MALLAN-NYC-CRM-FINAL2.html` (relative)
