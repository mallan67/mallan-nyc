# Phase 3 Parallel-Safe Routing Strategy

**Version:** 1.0
**Date:** January 2026
**Status:** Active

---

## Overview

Phase 3 content (neighborhoods, boroughs, draft resources) is developed in **parallel** with production code but is **NOT routable** until Phase 4 approval. This prevents accidental public exposure of incomplete or unreviewed content.

---

## Core Principle

> **Phase 3 work must live OUTSIDE `app/`**

All Phase 3 templates, data, and compliance utilities live in:

```
src/
├── data/
│   └── geography/
│       ├── neighborhoods.json
│       ├── boroughs.json
│       └── types.ts
├── templates/
│   ├── neighborhood/
│   │   └── NeighborhoodTemplate.tsx
│   └── borough/
│       └── BoroughTemplate.tsx
└── compliance/
    └── prohibited-terms.json
```

**NOT in:**
- `app/neighborhoods/`
- `app/boroughs/`
- `app/resources/_drafts/`

---

## What Is Blocked

The CI guardrails (`scripts/ci/guardrails.mjs`) will **hard-fail** if any of the following exist:

| Violation | Example | CI Result |
|-----------|---------|-----------|
| Routable page in protected path | `app/neighborhoods/page.tsx` | ❌ BLOCKED |
| Route handler in protected path | `app/boroughs/[slug]/route.ts` | ❌ BLOCKED |
| Layout in protected path | `app/neighborhoods/layout.tsx` | ❌ BLOCKED |
| Sitemap includes protected route | `{ url: '/neighborhoods' }` | ❌ BLOCKED |
| Navigation links to protected route | `<Link href="/neighborhoods">` | ❌ BLOCKED |
| Fair Housing prohibited term in content | `"perfect for families"` | ❌ BLOCKED |

---

## Why This Matters

### 1. Compliance Safety
- Unreviewed content may contain Fair Housing violations
- NY DOS advertising rules require compliance review before publication
- REBNY RLS data standards must be verified

### 2. SEO Protection
- No sitemap exposure of incomplete pages
- No accidental indexing by search engines
- No broken links from navigation

### 3. Development Velocity
- Teams can work on Phase 3 content without blocking Phase 2 releases
- No merge conflicts between feature flags and production code
- Clean separation of concerns

---

## Promotion Workflow: Phase 3 → Phase 4

When Phase 3 content is ready for public release:

### Step 1: Content Review
- [ ] All neighborhood/borough descriptions reviewed
- [ ] Fair Housing compliance verified (no prohibited terms)
- [ ] NY advertising rules checked
- [ ] REBNY data standards verified

### Step 2: Feature Flag Setup
```env
# Add to .env.local and Vercel environment
NEXT_PUBLIC_FEATURE_NEIGHBORHOODS=true
NEXT_PUBLIC_FEATURE_BOROUGHS=true
```

### Step 3: Create Routes with Protection
Create `app/neighborhoods/layout.tsx`:
```typescript
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // noindex until approved
};

export default function Layout({ children }) {
  // Feature flag check
  if (process.env.NEXT_PUBLIC_FEATURE_NEIGHBORHOODS !== 'true') {
    notFound();
  }
  return <>{children}</>;
}
```

### Step 4: Preview Deployment
- Deploy to preview URL (not production)
- Test all pages and links
- Verify compliance checks pass

### Step 5: Approval
- Compliance officer sign-off
- Broker approval for content accuracy
- Engineering approval for code quality

### Step 6: Enable for Production
1. Remove `noindex` from metadata
2. Add routes to sitemap
3. Add navigation links
4. Update guardrails to allow new routes

---

## CI Guardrails

### Running Locally
```bash
node scripts/ci/guardrails.mjs
```

### Example Failure Output
```
[GUARDRAILS] Running Phase 3 parallel-safe checks...

[INFO] Loaded 45 prohibited terms from src/compliance/prohibited-terms.json

[FAIL] Guardrails violations:
  ❌ [PHASE 3 VIOLATION] Routable files found in protected path "app/neighborhoods/":
      - app/neighborhoods/page.tsx
      - app/neighborhoods/[slug]/page.tsx
      Phase 3 content must live in src/templates/, src/data/, or src/compliance/.
      Remove these files to unblock CI.

1 error(s) found. CI BLOCKED.

Phase 3 content must live in src/templates/, src/data/, or src/compliance/.
See docs/PHASE3_PARALLEL_SAFE.md for guidance.
```

### Example Success Output
```
[GUARDRAILS] Running Phase 3 parallel-safe checks...

[INFO] Loaded 45 prohibited terms from src/compliance/prohibited-terms.json

[PASS] ✅ Guardrails passed. Phase 3 parallel-safe requirements met.
```

---

## File Reference

### Data Files
| File | Purpose |
|------|---------|
| `src/data/geography/neighborhoods.json` | Neighborhood data (name, boundaries, attractions, etc.) |
| `src/data/geography/boroughs.json` | Borough data (county mapping, stats) |
| `src/data/geography/types.ts` | TypeScript types for geography data |

### Templates
| File | Purpose |
|------|---------|
| `src/templates/neighborhood/NeighborhoodTemplate.tsx` | Neighborhood page components |
| `src/templates/borough/BoroughTemplate.tsx` | Borough page components |

### Compliance
| File | Purpose |
|------|---------|
| `src/compliance/prohibited-terms.json` | Fair Housing prohibited terms list |

---

## FAQ

### Q: Why not just use feature flags in `app/`?
A: Feature flags can be misconfigured, forgotten, or bypassed. By keeping Phase 3 content outside `app/`, it's **impossible** to accidentally create routes.

### Q: Can I import templates into `app/` pages?
A: Yes, but only after Phase 4 approval. The templates are designed to be imported when you're ready to create the actual route.

### Q: What if I need to test the templates?
A: Create a Storybook story or a test file. You can also create a temporary protected page during development (with noindex and feature flag), but it must be removed before merging to main.

### Q: How do I add new prohibited terms?
A: Edit `src/compliance/prohibited-terms.json` and add terms to both the category and the `flatList` array.

---

## Compliance Requirements

All Phase 3 content must comply with:

- **NY DOS Advertising Rules** - License display, no false claims
- **Fair Housing Act** - No discriminatory language (see `prohibited-terms.json`)
- **REBNY RLS Standards** - Data accuracy, attribution
- **WCAG 2.1 AA** - Accessibility requirements

---

## Contact

For questions about Phase 3 development or promotion to Phase 4:
- Engineering: Review CI guardrails and route protection
- Compliance: Review content for Fair Housing and advertising rules
- Product: Approve for public release

---

*Document maintained by engineering team. Last updated: January 2026.*
