/// <reference types="jest" />
/**
 * The Buyer's, Seller's and Investor's guides (linked from the header and footer of every page)
 * said "Resource Not Found" to every visitor, with HTTP 200.
 *
 * Cause, measured 2026-11-03: app/components/ResourceContent.tsx fetched its text from
 * /api/resources/<slug>. That route was deleted on 2026-03-15 as an "orphan" (commit 0f0859cd; the
 * component built the URL from a template string, so a search for the route's path found no caller).
 * The production API answers 404 for all three guides. The fetch hook also starts in an "idle" state
 * with no data, which the component renders as "Resource Not Found" — so even the HTML the server
 * sends, which is all a crawler or an AI fetcher without JavaScript reads, said "Resource Not Found"
 * under an <h1>, a soft 404 on three pages in the main navigation.
 *
 * The text is in data/resources/*.json. The page now reads it on the server and hands it to the
 * component, so the guide is in the HTML.
 *
 * What these tests prove: the real component, rendered the way the server renders it, shows each guide
 * and none says "Resource Not Found"; a gated guide still shows only its preview before the email form;
 * the page function passes the right guide to the component and 404s an unknown slug; the guide copy
 * carries no "family" wording (owner instruction 2026-10-30; Master §21.12).
 * What they do not prove: how the page looks in a browser, or that email capture works (unchanged).
 */
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import ResourceContent, { type ResourceData } from '@/app/components/ResourceContent';
import SocialShareBar from '@/app/components/SocialShareBar';
import ResourcePage, { generateMetadata, generateStaticParams } from '@/app/resources/[slug]/page';
import buyers from '@/data/resources/buyers-guide.json';
import sellers from '@/data/resources/sellers-guide.json';
import investors from '@/data/resources/investors-guide.json';

const GUIDES: Record<string, ResourceData> = {
  'buyers-guide': buyers as ResourceData,
  'sellers-guide': sellers as ResourceData,
  'investors-guide': investors as ResourceData,
};
const GATED = ['buyers-guide', 'sellers-guide'];
const OPEN = ['investors-guide'];

const html = (slug: string) => renderToString(createElement(ResourceContent, { slug, data: GUIDES[slug] }));
// renderToString escapes text, so compare against the escaped form of a string.
const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const h1s = (markup: string) => [...markup.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

describe('every guide renders in the server HTML', () => {
  it.each(Object.keys(GUIDES))('%s is not "Resource Not Found"', (slug) => {
    const markup = html(slug);
    expect(markup).not.toContain('Resource Not Found');
    expect(h1s(markup)).not.toContain('Resource Not Found');
  });

  it.each(Object.keys(GUIDES))('%s has exactly one h1', (slug) => {
    expect(h1s(html(slug))).toHaveLength(1);
  });
});

describe('an open guide shows all of its text', () => {
  it.each(OPEN)('%s: title, every section title, the section text and the call to action', (slug) => {
    const data = GUIDES[slug];
    const markup = html(slug);
    expect(h1s(markup)).toEqual([escaped(data.title)]);
    for (const section of data.sections) {
      expect(markup).toContain(escaped(section.title));
    }
    // A sentence from the first and the last section, so a half-rendered guide fails.
    const firstWords = (s: string) => s.replace(/[#*\-]/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
    expect(markup).toContain(escaped(firstWords(data.sections[0].content.split('\n').find((l) => /^[A-Za-z]/.test(l)) ?? '')));
    expect(markup).toContain(escaped(data.cta.buttonText));
  });
});

describe('a gated guide still gates: hero, email form and the first section only', () => {
  it.each(GATED)('%s shows the preview and not the later sections', (slug) => {
    const data = GUIDES[slug];
    const markup = html(slug);
    const headings = [...markup.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    expect(headings).toContain(escaped(data.sections[0].title)); // the preview
    expect(markup).toContain('type="email"'); // the email form
    for (const later of data.sections.slice(1)) {
      // Not as a heading, and none of its text. (A static "What's Inside" bullet may repeat a title as a
      // phrase, so the headings and the body text are compared, not substrings of the whole page.)
      expect(headings).not.toContain(escaped(later.title));
      const sentence = later.content.split('\n').map((l) => l.replace(/^[#*\-\s]+/, '').trim()).find((l) => l.length > 25);
      expect(markup).not.toContain(escaped(sentence as string));
    }
    expect(markup).not.toContain('In This Guide'); // the table of contents belongs to the unlocked view
  });
});

describe('the page function', () => {
  const findElement = (node: ReactNode, type: unknown): { props: Record<string, unknown> } | null => {
    if (!isValidElement(node)) return null;
    const props = node.props as Record<string, unknown> & { children?: ReactNode };
    if (node.type === type) return { props };
    const kids = Array.isArray(props.children) ? props.children : [props.children];
    for (const kid of kids) {
      const found = findElement(kid, type);
      if (found) return found;
    }
    return null;
  };
  const findContent = (node: ReactNode) => {
    const found = findElement(node, ResourceContent);
    return found ? { slug: found.props.slug as string, data: found.props.data as ResourceData } : null;
  };

  it.each(Object.keys(GUIDES))('hands %s its own text', async (slug) => {
    const el = await ResourcePage({ params: Promise.resolve({ slug }) });
    const found = findContent(el);
    expect(found?.slug).toBe(slug);
    expect(found?.data.slug).toBe(slug);
    expect(found?.data.sections.length).toBeGreaterThan(0);
  });

  it.each([
    ['buyers-guide', 'Buyers Guide | Mallan Real Estate'],
    ['sellers-guide', 'Sellers Guide | Mallan Real Estate'],
    ['investors-guide', 'Investors Guide | Mallan Real Estate'],
  ])('the share bar for %s offers a title-cased title', async (slug, title) => {
    const el = await ResourcePage({ params: Promise.resolve({ slug }) });
    expect(findElement(el, SocialShareBar)?.props.title).toBe(title);
  });

  it('answers 404 for a slug that is not a guide, instead of a 200 "not found" page', async () => {
    await expect(ResourcePage({ params: Promise.resolve({ slug: 'not-a-guide' }) })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('prerenders exactly the three guides', () => {
    expect(generateStaticParams()).toEqual([{ slug: 'buyers-guide' }, { slug: 'sellers-guide' }, { slug: 'investors-guide' }]);
  });

  it('puts the brand once in the <title> (the layout template adds it) and keeps it in the share titles', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'investors-guide' }) });
    expect(meta.title).toBe("Investor's Guide");
    expect((meta.openGraph as { title?: string }).title).toMatch(/Mallan Real Estate Inc\.$/);
    expect(meta.alternates?.canonical).toBe('https://mallan.nyc/resources/investors-guide');
  });
});

describe('guide copy carries no familial-status wording', () => {
  // Owner instruction 2026-10-30: "remove all word of families and children". Property-type wording
  // "multi-family" became "multi-unit" in Mallan-authored copy (PR #669 does the same elsewhere).
  const words = /famil|child|kid\b|kids\b|school|daycare|young|senior|elderly|bachelor/i;
  it.each(Object.keys(GUIDES))('%s', (slug) => {
    const strings: string[] = [];
    (function walk(v: unknown) {
      if (typeof v === 'string') strings.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(GUIDES[slug]);
    expect(strings.filter((s) => words.test(s))).toEqual([]);
  });
});
