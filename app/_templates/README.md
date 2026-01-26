# Non-Routed Templates Directory

This directory uses the underscore prefix (`_templates`) which Next.js App Router
excludes from routing. Files here are **never** served as web pages.

## Purpose

- Component scaffolds for future pages
- Work-in-progress templates
- Shared layout patterns
- Compliance-ready page structures

## Rules

1. **Never move files here to a routed path without compliance review**
2. **All templates must include noindex metadata when eventually routed**
3. **No links to these templates from public navigation**
4. **Fair Housing language review required before any template goes live**

## Phase 3 Templates

- `neighborhood-template.tsx` - Base neighborhood page structure
- `borough-template.tsx` - Base borough page structure
- `compliance-footer.tsx` - Required disclosures footer

## Moving to Production

Before moving any template to a routed path:

1. [ ] Fair Housing language review completed
2. [ ] Compliance disclosures present
3. [ ] noindex/nofollow metadata added
4. [ ] Feature flag gating implemented
5. [ ] NOT added to sitemap
6. [ ] NOT linked from navigation
