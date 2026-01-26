# Phase 2 QA Checklist

Quality assurance checklist for mallan.nyc Phase 2 deployment.

---

## Browser / Device Matrix

### Desktop Browsers (Windows/macOS)
| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | [ ] Pass |
| Firefox | Latest | [ ] Pass |
| Safari | Latest (macOS) | [ ] Pass |
| Edge | Latest | [ ] Pass |

### Mobile Browsers
| Device | Browser | Status |
|--------|---------|--------|
| iPhone (iOS 16+) | Safari | [ ] Pass |
| iPhone (iOS 16+) | Chrome | [ ] Pass |
| Android (12+) | Chrome | [ ] Pass |
| Android (12+) | Samsung Internet | [ ] Pass |

### Tablet
| Device | Browser | Status |
|--------|---------|--------|
| iPad | Safari | [ ] Pass |
| Android Tablet | Chrome | [ ] Pass |

---

## Breakpoint Testing

Test all pages at these viewport widths:

| Breakpoint | Width | Description | Status |
|------------|-------|-------------|--------|
| Mobile S | 320px | Small phones | [ ] Pass |
| Mobile M | 375px | Standard phones | [ ] Pass |
| Mobile L | 425px | Large phones | [ ] Pass |
| Tablet | 768px | Tablets, portrait | [ ] Pass |
| Laptop | 1024px | Small laptops | [ ] Pass |
| Desktop | 1440px | Standard desktop | [ ] Pass |

---

## Page-Specific Tests

### Homepage (`/`)
- [ ] Hero image loads, no broken image
- [ ] Hero tagline displays correctly
- [ ] Search tabs (Buy/Rent/Sell) functional
- [ ] Search button triggers navigation
- [ ] Amenity pills clickable
- [ ] ValueProposition section renders
- [ ] "Browse Sales →" links to /buy
- [ ] "Browse Rentals →" links to /rent
- [ ] "Sell Your Property →" links to /sell
- [ ] "Contact Us" button links to /contact
- [ ] TrustMarkers section renders
- [ ] License number displays: #10991205323
- [ ] Equal Housing logo visible
- [ ] REBNY attribution present
- [ ] "Contact Us" button links to /contact
- [ ] "Call (646) 258-4460" is clickable tel: link
- [ ] Footer renders with all links

### Contact Page (`/contact`)
- [ ] Form renders with all fields
- [ ] Name field validation (required)
- [ ] Email field validation (required, format)
- [ ] Phone field optional
- [ ] Message field validation (required)
- [ ] Consent checkbox NOT pre-checked
- [ ] Consent checkbox required for submission
- [ ] Submit button shows "Sending..." during submission
- [ ] Success state displays "Thank You" heading
- [ ] Success state shows "What happens next" steps (3 items)
- [ ] Success state shows phone CTA for immediate contact
- [ ] "Send another message" resets form
- [ ] Error state displays on failure
- [ ] Sidebar contact info correct (phone, email, address, hours)
- [ ] License info in sidebar

### Buy/Rent/Sell Pages
- [ ] Pages load without error
- [ ] Header navigation works
- [ ] Footer renders correctly

---

## Compliance Verification

### NY State Advertising Requirements
- [ ] Broker license #10991205323 displayed on homepage
- [ ] License displayed in footer
- [ ] License displayed on contact page
- [ ] Company name matches license: "Mallan Real Estate Inc."

### Fair Housing (HUD)
- [ ] Equal Housing Opportunity logo present
- [ ] Fair Housing statement in TrustMarkers
- [ ] Link to /fair-housing policy
- [ ] No discriminatory language in any copy
- [ ] No targeting based on protected classes

### REBNY RLS
- [ ] REBNY member attribution present
- [ ] RLS data attribution in footer
- [ ] IDX compliance notice in footer
- [ ] Data update date displayed

### TCPA (Contact Form)
- [ ] Consent checkbox NOT pre-checked
- [ ] Clear consent language present
- [ ] "Not required as condition of purchase" language included
- [ ] No autoresponder sent
- [ ] No SMS capability

### WCAG 2.1 AA
- [ ] All images have alt text (or empty alt for decorative)
- [ ] Form fields have labels
- [ ] Error messages associated with fields (aria-describedby)
- [ ] Color contrast meets 4.5:1 for text
- [ ] Focus states visible on all interactive elements
- [ ] Skip link present and functional
- [ ] Keyboard navigation works throughout
- [ ] No content conveyed by color alone

---

## Analytics Verification

### CTA Tracking
Test that these CTAs fire analytics events (check browser Network tab for `/api/analytics/event`):

| CTA | Location | Label | Status |
|-----|----------|-------|--------|
| Search button | Hero | `hero_search` | [ ] Pass |
| Browse Sales → | ValueProp Buy | `cta_buy` | [ ] Pass |
| Browse Rentals → | ValueProp Rent | `cta_rent` | [ ] Pass |
| Sell Your Property → | ValueProp Sell | `cta_sell` | [ ] Pass |
| Contact Us | ValueProp primary | `cta_contact_primary` | [ ] Pass |
| Contact Us | TrustMarkers | `cta_contact_footer` | [ ] Pass |
| Call (646) 258-4460 | TrustMarkers | `cta_phone` | [ ] Pass |
| Send Message | Contact form | `contact_form` | [ ] Pass |
| Call (646) 258-4460 | Contact success | `cta_phone_success` | [ ] Pass |

### Consent Gating
- [ ] Analytics only fire after cookie consent accepted
- [ ] No tracking before consent given
- [ ] Consent banner displays on first visit

---

## Performance

### Core Web Vitals (Lighthouse)
| Metric | Target | Status |
|--------|--------|--------|
| LCP | < 2.5s | [ ] Pass |
| FID | < 100ms | [ ] Pass |
| CLS | < 0.1 | [ ] Pass |
| Performance Score | > 90 | [ ] Pass |
| Accessibility Score | > 90 | [ ] Pass |
| Best Practices | > 90 | [ ] Pass |
| SEO | > 90 | [ ] Pass |

### Page Load
- [ ] Homepage loads in < 3s on 3G
- [ ] No render-blocking resources
- [ ] Images optimized and lazy-loaded

---

## Security

- [ ] HTTPS enforced (redirect from HTTP)
- [ ] No mixed content warnings
- [ ] CSP headers present (check Vercel config)
- [ ] No sensitive data in client-side code
- [ ] API routes validate input
- [ ] No PII logged to console

---

## SEO

- [ ] Title tag present and correct
- [ ] Meta description present
- [ ] Open Graph tags present
- [ ] Canonical URL set
- [ ] robots.txt accessible
- [ ] sitemap.xml accessible
- [ ] Google verification file present (`/google02f488e9e5e76e5a.html`)
- [ ] JSON-LD structured data valid

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Compliance | | | |
| Stakeholder | | | |

---

## Notes

_Document any issues, exceptions, or observations here:_

