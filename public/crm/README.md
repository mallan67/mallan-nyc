# CRM Mockups — `public/crm/`

## Overview

CRM mockup files served same-origin from Vercel at `mallan.nyc/crm/`.
Moved from GitHub Pages (`mallan67.github.io/search-modular/`) to eliminate CORS and Bearer token workarounds — cookies work natively on the same domain.

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
  index-built.html                # IDX search
  SALE-FORM-REDESIGN.html         # Sale submission
  SALE-FORM-WITH-TOOLS.html       # Sale viewer
  RENTAL-FORM-REDESIGN.html       # Rental submission
  RENTAL-FORM-WITH-TOOLS.html     # Rental viewer
  BUYER-DEAL-FORM.html            # Buyer deal form
  TENANT-DEAL-FORM.html           # Tenant deal form
  css/                            # 8 stylesheets
  js/                             # Runtime JS (9 subdirs, no _dead-code)
    compliance/
    core/                         # api-client.js lives here
    crm/
    init/
    listing/
    manage/
    output/
    render/
    search/
```

## Why No Code Changes Were Needed

- All HTML file references use **relative paths** (`login.html`, `MALLAN-NYC-CRM-FINAL2.html`, etc.)
- `api-client.js` defaults to empty `_baseUrl` (same-origin) — only sets `https://mallan.nyc` when NOT on mallan.nyc
- CSS/JS are either inline or loaded via relative paths (`js/core/api-client.js`)
- Login redirect defaults to `MALLAN-NYC-CRM-FINAL2.html` (relative)

## Middleware Protection

- `/crm/*` paths have `X-Robots-Tag: noindex, nofollow` header (set in `middleware.ts`)
- HTML files have their own JS-based auth gates that redirect to `login.html`
- API calls go to `/api/crm/*` and `/api/portal/*` which require session cookie or Bearer token

## Source

Copied from `Desktop/1/Old/search-modular/` (the canonical mockup repo).
Excluded: `*.backup-*.html`, `backups/`, `_dead-code/`, `.git/`, `node_modules/`, `docs/`, `html/`, `tests/`, `scripts/`.

## Do NOT Edit Here

These are copies. Edit the originals in `search-modular/` and re-copy.
