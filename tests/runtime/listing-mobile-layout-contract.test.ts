/// <reference types="jest" />
/**
 * Listing detail — phone layout contract (360 / 390 / 412 px).
 *
 * Found 2026-11-02 on mallan.nyc with an emulated touch phone (the only kind of browser where
 * `@media (pointer: coarse)` in app/globals.css applies its 44×44px minimum to every button and link):
 *
 *  1. The sticky bar showed the price as "$3,295,…" (and "$3,29…" at 360px). The price `<p>` was `truncate`
 *     in a row shared with Save + Call + Inquire: it was given 60px at 360 and 90px at 390 for a 91px price.
 *     "$88,500,000" needs 103px, "$12,500/mo" 96px.
 *  2. At 360px the layout viewport grew to 370px on EVERY listing, photos or not: SocialShareBar's row of
 *     44px share icons (about seven of them) did not wrap.
 *
 * A price is a legal-advertising fact (NY DOS 19 NYCRR 175): it must never be cut off by CSS. These are
 * SOURCE contracts for the markup that fixes it; the layout itself is proved in a real touch browser at
 * 360/390/412/820 by tests/e2e/listing-detail-mobile.spec.ts. The 44px rule is deliberately untouched.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import SocialShareBar from '@/app/components/SocialShareBar';

const source = (file: string) => readFileSync(resolve(__dirname, '../../', file), 'utf8');

describe('SocialShareBar', () => {
  it('wraps its icons instead of overflowing a narrow phone', () => {
    const html = renderToStaticMarkup(createElement(SocialShareBar, { title: '152 E 85th Street | $3,295,000' }));
    expect(html).toMatch(/<div class="flex flex-wrap justify-center items-center gap-3">/);
  });

  it('still offers every share target and the copy-link button', () => {
    const html = renderToStaticMarkup(createElement(SocialShareBar, { title: 'x' }));
    expect(html).toContain('aria-label="Copy link to clipboard"');
    expect((html.match(/aria-label="Share on /g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

describe('listing sticky price bar (app/listing/[...slug]/page.tsx)', () => {
  const page = source('app/listing/[...slug]/page.tsx');
  const bar = page.slice(page.indexOf('Mobile CTA Bar (sticky'), page.indexOf('<MobileStickyCta'));

  it('found the bar', () => {
    expect(bar).toContain('formatPrice(listing.listPrice, isRental)');
    expect(bar.length).toBeGreaterThan(500);
  });

  it('never truncates the price: no ellipsis, no clipping', () => {
    const priceTag = bar.match(/<p className="[^"]*">\s*\{formatPrice\(listing\.listPrice, isRental\)\}/);
    expect(priceTag).not.toBeNull();
    expect(priceTag![0]).toContain('whitespace-nowrap');
    expect(priceTag![0]).not.toMatch(/\btruncate\b|text-ellipsis|overflow-hidden/);
  });

  it('the address is the part that gives way', () => {
    expect(bar).toMatch(/<p className="[^"]*\btruncate\b[^"]*">\{fullAddress\}<\/p>/);
  });

  it('keeps all three actions, tighter below 400px so the price fits at 360px, tighter again below 340px', () => {
    expect(bar).toContain('<DetailFavoriteButton');
    expect(bar).toContain('href="tel:646-258-4460"');
    expect(bar).toContain('href="#inquiry"');
    expect(bar).toMatch(/gap-1\.5 min-\[400px\]:gap-2 max-\[339px\]:gap-1 flex-shrink-0/);
    expect(bar).toContain('flex items-center justify-between gap-3 max-[339px]:gap-2');
    expect((bar.match(/px-4 min-\[400px\]:px-5 max-\[339px\]:px-3/g) ?? []).length).toBe(2); // Call and Inquire
  });
});

describe('DetailFavoriteButton', () => {
  const btn = source('app/components/DetailFavoriteButton.tsx');

  it('is icon-only below 400px but keeps its text for screen readers and its accessible name', () => {
    expect(btn).toMatch(/<span className="max-\[399px\]:sr-only">\{active \? 'Saved' : 'Save'\}<\/span>/);
    expect(btn).toContain("aria-label={active ? 'Remove from favorites' : 'Save to favorites'}");
    expect(btn).toContain('px-3 min-[400px]:px-4');
  });
});
