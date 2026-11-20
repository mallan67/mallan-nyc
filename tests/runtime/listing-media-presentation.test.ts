/// <reference types="jest" />
/**
 * Listing video, 3D tour and hero photo (Maya, 2026-11-20: "the pictures are very poor quality, also please make sure that media, video and 3D is
 * properly set"). Found by a read-only investigation of the live site and live Cotality, and checked in the code:
 *
 *  1. The listing-page hero was a raw <img> with object-cover in a box about 1351x901 CSS px, so a small or portrait photo was enlarged about 2x and
 *     cropped (live: a 768x433 source and a 543x1000 source shown at 1351x901). Cotality's own files run from 768x433 to 2500x1666 and Mallan copies
 *     them unchanged, so the source cannot be made sharper, but it must not be magnified and cropped beyond a limit. heroFit decides.
 *  2. A tour on a host the public Content-Security-Policy does not allow to be framed (streeteasy.com, drive.google.com: 5 of 19 public 3D tours in the
 *     first 1,000 listings) rendered a blank box. Such a tour now opens in a new tab, as the CRM already does.
 *  3. A YouTube link without https:// (2 of 178 public videos) became a relative iframe src and rendered blank.
 *  4. Only hosts the policy allows are ever framed; a non-http(s) address (javascript:, data:) is never framed or linked.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import TourFrame from '@/app/components/TourFrame';
import { hasVideo, hasVirtualTour } from '@/lib/idx/display-adapter';
import { HERO_MAX_COVER_SCALE, HERO_MAX_MAGNIFICATION, heroFit } from '@/lib/media/hero-fit';
import { PUBLIC_EMBED_HOSTS, presentTour } from '@/lib/media/tour-presentation';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** the file's code without its comments */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('presentTour: what the public page does with a video or tour address', () => {
  it.each([
    ['https://www.youtube.com/watch?v=RM4ef1CIo2k', 'https://www.youtube.com/embed/RM4ef1CIo2k'],
    ['https://youtube.com/shorts/FpkZHPV5p9k', 'https://www.youtube.com/embed/FpkZHPV5p9k'],
    ['https://youtu.be/abc123XYZ', 'https://www.youtube.com/embed/abc123XYZ'],
    ['https://www.youtube.com/embed/RM4ef1CIo2k', 'https://www.youtube.com/embed/RM4ef1CIo2k'],
    ['https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789'],
    ['https://player.vimeo.com/video/123456789', 'https://player.vimeo.com/video/123456789'],
    ['https://vimeo.com/123456789/abcdef1234', 'https://player.vimeo.com/video/123456789?h=abcdef1234'],
    ['https://my.matterport.com/show/?m=SxQL3iGyoDo', 'https://my.matterport.com/show/?m=SxQL3iGyoDo'],
  ])('%s is shown in place, from %s', (input, src) => {
    expect(presentTour(input)).toEqual({ kind: 'embed', src });
  });

  it('repairs an address that has no https:// (live: youtube.com/watch?v=..., 2 of 178 public videos) or has text before it (_https://youtu.be/...)', () => {
    expect(presentTour('youtube.com/watch?v=RM4ef1CIo2k')).toEqual({ kind: 'embed', src: 'https://www.youtube.com/embed/RM4ef1CIo2k' });
    expect(presentTour('www.youtube.com/watch?v=RM4ef1CIo2k')).toEqual({ kind: 'embed', src: 'https://www.youtube.com/embed/RM4ef1CIo2k' });
    expect(presentTour('_https://youtu.be/abc123XYZ')).toEqual({ kind: 'embed', src: 'https://www.youtube.com/embed/abc123XYZ' });
    expect(presentTour('Tour: https://my.matterport.com/show/?m=abc12345 (virtual)')).toEqual({ kind: 'embed', src: 'https://my.matterport.com/show/?m=abc12345' });
  });

  it('frames over https only, even when the address says http', () => {
    expect(presentTour('http://youtu.be/abc123XYZ')).toEqual({ kind: 'embed', src: 'https://www.youtube.com/embed/abc123XYZ' });
    expect(presentTour('http://my.matterport.com/show/?m=abc12345')).toEqual({ kind: 'embed', src: 'https://my.matterport.com/show/?m=abc12345' });
  });

  it.each([
    'https://streeteasy.com/building/the-dakota/2a',
    'https://drive.google.com/file/d/abc/view',
    'https://matterport.com/show/?m=abc',
    'https://listing3d.com/tour/abc',
    'https://kuula.co/share/abc',
    'https://www.youtube.com/@mallan',
    'https://www.youtube-nocookie.com/embed/RM4ef1CIo2k',
    'https://app.wistia.com/medias/abc',
  ])('%s cannot be framed by the public policy, so it opens in a new tab', (href) => {
    expect(presentTour(href)).toEqual({ kind: 'link', href });
  });

  it('a direct video file is played by the page itself only from a host the media-src policy allows (the site\'s own storage)', () => {
    expect(presentTour('https://images.mallan.nyc/tours/unit-4a.mp4')).toEqual({ kind: 'file', src: 'https://images.mallan.nyc/tours/unit-4a.mp4' });
    expect(presentTour('https://pub-abc123.r2.dev/tours/unit-4a.MOV')).toEqual({ kind: 'file', src: 'https://pub-abc123.r2.dev/tours/unit-4a.MOV' });
  });

  it.each([
    'https://cdn.example.com/tours/unit-4a.mp4',
    'http://images.mallan.nyc/tours/unit-4a.mp4',
    'https://r2.dev.evil.test/tours/unit-4a.webm',
  ])('a video file the media-src policy would block (%s) is offered as a link, never as a black box', (href) => {
    expect(presentTour(href)).toEqual({ kind: 'link', href });
  });

  it('the file hosts are the ones the public media-src policy names', () => {
    const csp = read('lib/middleware/security-headers.ts').split(/\r?\n/).find((l) => /media-src /.test(l)) ?? '';
    expect(csp).toContain("'self'");
    expect(csp).toContain('https://*.r2.dev');
    expect(csp).toContain('https://images.mallan.nyc');
  });

  it.each([null, undefined, '', '   ', 'not-a-url', 'javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://example.com/tour', 'vbscript:x'])('%j is not shown at all', (input) => {
    expect(presentTour(input)).toEqual({ kind: 'none' });
  });

  it.each([
    'https://Broker_Tour', // live RLS20056661 VirtualTourURLUnbranded: a placeholder, not a web address
    'https://localhost/tour',
    'http://intranet/tour',
    'Broker_Tour',
    `https://example.com/${'a'.repeat(3000)}`,
  ])('a value that is not a real web address (%s) is not offered as a link', (input) => {
    expect(presentTour(input)).toEqual({ kind: 'none' });
  });

  it('a YouTube playlist link is offered as a link: the embed address would drop the list and break the player', () => {
    expect(presentTour('https://www.youtube.com/embed/videoseries?list=PL1234567890abc')).toEqual({ kind: 'link', href: 'https://www.youtube.com/embed/videoseries?list=PL1234567890abc' });
  });

  it('only a host the public Content-Security-Policy frame-src allows is ever framed', () => {
    const csp = read('lib/middleware/security-headers.ts').split(/\r?\n/).find((l) => /frame-src https:\/\/translate\.google\.com/.test(l)) ?? '';
    expect(csp).not.toBe('');
    for (const host of PUBLIC_EMBED_HOSTS) expect(csp).toContain(`https://${host}`);
    const inputs = ['https://youtu.be/abc123XYZ', 'youtube.com/watch?v=RM4ef1CIo2k', 'https://vimeo.com/123456789', 'https://my.matterport.com/show/?m=abc12345', 'https://streeteasy.com/x', 'https://listing3d.com/x'];
    for (const input of inputs) {
      const out = presentTour(input);
      if (out.kind === 'embed') expect(PUBLIC_EMBED_HOSTS as readonly string[]).toContain(new URL(out.src).hostname);
    }
  });
});

describe('TourFrame: the markup for each kind', () => {
  const html = (tour: Parameters<typeof TourFrame>[0]['tour'], variant: 'video' | '3d' = '3d') => renderToStaticMarkup(createElement(TourFrame, { tour, variant }));

  it('an embedded tour is an iframe with the embed address and a title', () => {
    const out = html({ kind: 'embed', src: 'https://my.matterport.com/show/?m=abc12345' });
    expect(out).toMatch(/<iframe\b/);
    expect(out).toContain('src="https://my.matterport.com/show/?m=abc12345"');
    expect(out).toContain('title="3D Virtual Tour"');
  });

  it('a tour that cannot be framed is a link that opens a new tab, names the site, and has no iframe', () => {
    const out = html({ kind: 'link', href: 'https://streeteasy.com/building/the-dakota/2a' });
    expect(out).not.toMatch(/<iframe\b/);
    expect(out).toContain('href="https://streeteasy.com/building/the-dakota/2a"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('streeteasy.com');
    expect(out).toContain('Open the 3D tour in a new tab');
  });

  it('the same link for a video says video', () => {
    expect(html({ kind: 'link', href: 'https://app.wistia.com/medias/abc' }, 'video')).toContain('Open the video in a new tab');
  });

  it('a video file is a video element, and nothing is rendered for none', () => {
    expect(html({ kind: 'file', src: 'https://cdn.example.com/a.mp4' }, 'video')).toMatch(/<video\b[^>]*src="https:\/\/cdn\.example\.com\/a\.mp4"/);
    expect(html({ kind: 'none' })).toBe('');
  });
});

describe('heroFit: a photo is enlarged and cropped only while it stays sharp enough', () => {
  const SLOT = { w: 1351, h: 901 };

  it('a large photo fills the slot and is cropped (cover), as before', () => {
    expect(heroFit({ w: 1920, h: 1281 }, SLOT)).toEqual({ mode: 'cover' });
    expect(heroFit({ w: 2500, h: 1666 }, SLOT)).toEqual({ mode: 'cover' });
  });

  it('live RLS20127517: 768x433 in 1351x901 would be enlarged 2.08x and cropped, so it is shown whole at no more than the magnification limit', () => {
    expect(heroFit({ w: 768, h: 433 }, SLOT)).toEqual({ mode: 'contain', width: Math.round(768 * HERO_MAX_MAGNIFICATION), height: Math.round(433 * HERO_MAX_MAGNIFICATION) });
  });

  it('live RLS10956475: 543x1000 in 1351x901 would be enlarged 2.49x and cropped to a band, so it is shown whole at the height of the slot', () => {
    expect(heroFit({ w: 543, h: 1000 }, SLOT)).toEqual({ mode: 'contain', width: 489, height: 901 });
  });

  it('on a phone the same 768x433 photo already fits (the slot is smaller than the photo), so it still fills and crops', () => {
    expect(heroFit({ w: 768, h: 433 }, { w: 390, h: 293 })).toEqual({ mode: 'cover' });
  });

  it('the boundary: filling the slot needs HERO_MAX_COVER_SCALE or less to stay cover', () => {
    const w = 1000;
    const h = 667; // slot 1000x667 scaled so that the cover scale is exactly the limit
    const slot = { w: Math.round(w * HERO_MAX_COVER_SCALE), h: Math.round(h * HERO_MAX_COVER_SCALE) };
    expect(heroFit({ w, h }, slot).mode).toBe('cover');
    expect(heroFit({ w, h }, { w: slot.w + 40, h: slot.h + 27 }).mode).toBe('contain');
  });

  it('never magnifies beyond the limit and never exceeds the slot', () => {
    for (const natural of [{ w: 300, h: 200 }, { w: 768, h: 433 }, { w: 543, h: 1000 }, { w: 640, h: 960 }]) {
      const fit = heroFit(natural, SLOT);
      expect(fit.mode).toBe('contain');
      if (fit.mode === 'contain') {
        expect(fit.width / natural.w).toBeLessThanOrEqual(HERO_MAX_MAGNIFICATION + 0.01);
        expect(fit.width).toBeLessThanOrEqual(SLOT.w);
        expect(fit.height).toBeLessThanOrEqual(SLOT.h);
      }
    }
  });

  it.each([{ w: 0, h: 0 }, { w: NaN, h: 100 }, { w: 100, h: -1 }])('an unusable size %j falls back to cover', (natural) => {
    expect(heroFit(natural, SLOT)).toEqual({ mode: 'cover' });
    expect(heroFit({ w: 800, h: 600 }, { w: 0, h: 0 })).toEqual({ mode: 'cover' });
  });
});

describe('the gallery uses them', () => {
  const gallery = () => code('app/components/ListingMediaGallery.tsx');

  it('frames and links through presentTour and TourFrame, never through the raw address', () => {
    const src = gallery();
    expect(src).toMatch(/presentTour\(videoUrl\)/);
    expect(src).toMatch(/presentTour\(virtualTourUrl\)/);
    expect(src).toMatch(/<TourFrame\b/);
    expect(src).not.toMatch(/toEmbedUrl/);
    expect(src).not.toMatch(/<iframe\b/);
  });

  it('a tab is offered only for an address the page can show', () => {
    const src = gallery();
    expect(src).toMatch(/key: 'video', label: 'Video', available: video\.kind !== 'none'/);
    expect(src).toMatch(/key: '3d', label: '3D Tour', available: tour\.kind !== 'none'/);
  });

  it('the hero measures the photo and the slot and lets heroFit choose', () => {
    const src = gallery();
    expect(src).toMatch(/heroFit\(/);
    expect(src).toMatch(/ResizeObserver/);
    expect(src).toMatch(/naturalWidth/);
  });

  it('a photo shown whole sits on a plain neutral backdrop: no blurred copy of the listing photo is made (whether that is allowed is not in the Master or the State)', () => {
    const src = gallery();
    expect(src).not.toMatch(/(?<!backdrop-)blur-/); // the arrows and badges keep their own backdrop-blur-sm; no blur is applied to a photo
    expect(src).toMatch(/bg-stone-200/);
    // the bands beside a photo shown whole open the full-screen view too, behind the arrows and badges
    expect(src).toMatch(/aria-hidden="true"[^>]*onClick=\{\(\) => setFullscreen\(true\)\}|onClick=\{\(\) => setFullscreen\(true\)\}[^>]*aria-hidden="true"/);
  });
});

describe('search-card badges offer Video and 3D only when the page can show them', () => {
  it('a badge needs an address the page would offer', () => {
    expect(hasVideo({ videoUrl: 'https://youtu.be/abc123XYZ' })).toBe(true);
    expect(hasVideo({ videoUrl: 'youtube.com/watch?v=RM4ef1CIo2k' })).toBe(true);
    expect(hasVideo({ videoUrl: 'https://app.wistia.com/medias/abc' })).toBe(true);
    expect(hasVirtualTour({ virtualTourURL: 'https://my.matterport.com/show/?m=abc12345' })).toBe(true);
    expect(hasVirtualTour({ virtualTourURL: 'https://streeteasy.com/building/x' })).toBe(true);
  });

  it('no badge for an address the page drops (a placeholder, a non-web address, empty)', () => {
    for (const bad of ['https://Broker_Tour', '//host/tour', 'ftp://host/tour', 'Broker_Tour', '', '   ', undefined]) {
      expect(hasVideo({ videoUrl: bad })).toBe(false);
      expect(hasVirtualTour({ virtualTourURL: bad })).toBe(false);
    }
  });
});
