/// <reference types="jest" />
/**
 * js/forms/listing-published.js: the "Listing Published" panel of an Add / Edit listing form.
 *
 * The Sale form shows a panel with the listing's public address and its RealPlus address when a listing goes Active (the status route answers with both). The Rental form showed an alert and
 * nothing else. This is the panel as one piece both forms can use (the Rental form uses it; the Sale form keeps its own copy until it is moved over). These tests run it on a plain page with a
 * fake clipboard and a fake page change, so everything it does is seen.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
/* eslint-disable @typescript-eslint/no-explicit-any */

const SOURCE = readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-published.js'), 'utf8');

function boot(o: { clipboard?: 'works' | 'refuses' | 'none' | 'throws' } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="page">form</div></body>', { url: 'https://mallan.nyc/crm/RENTAL-FORM-REDESIGN.html', runScripts: 'outside-only' });
  const w: any = dom.window;
  w.eval(SOURCE);
  const copied: string[] = [];
  const mode = o.clipboard ?? 'works';
  if (mode !== 'none') {
    Object.defineProperty(w.navigator, 'clipboard', {
      configurable: true,
      value: mode === 'throws'
        ? { writeText: () => { throw new Error('denied'); } }
        : { writeText: (text: string) => { if (mode === 'refuses') return Promise.reject(new Error('denied')); copied.push(text); return Promise.resolve(); } },
    });
  }
  const toasts: [string, string | undefined][] = [];
  const went: string[] = [];
  const d: Document = w.document;
  const show = (extra: Record<string, unknown> = {}) => w.MallanListingPublished.show({
    prefix: 'rental', listingId: 'RL-12', publicUrl: 'https://www.mallan.nyc/listing/333-e-46th-st/rl-12', realPlusUrl: 'https://www.mallan.nyc/listing/333-e-46th-st/rl-12',
    toast: (message: string, type?: string) => toasts.push([message, type]), dashboardUrl: '/crm/dashboard#/ops/listings', navigate: (url: string) => went.push(url), ...extra,
  }) as HTMLElement;
  return {
    w, d, show, copied, toasts, went,
    panel: () => d.getElementById('rentalPublishUrlPanel') as HTMLElement | null,
    input: (name: 'PublicUrlInput' | 'RealPlusUrlInput') => d.getElementById('rental' + name) as HTMLInputElement,
    button: (label: RegExp) => [...d.querySelectorAll('#rentalPublishUrlPanel button')].find((b) => label.test(b.textContent ?? '')) as HTMLButtonElement,
    flush: () => new Promise<void>((r) => setTimeout(r, 20)),
  };
}

describe('the panel', () => {
  it('names the listing and says it is Active on mallan.nyc', () => {
    const p = boot();
    p.show();
    expect(p.panel()!.textContent).toContain('Listing Published');
    expect(p.panel()!.querySelector('strong')!.textContent).toBe('RL-12');
    expect(p.panel()!.textContent).toContain('is now Active on mallan.nyc');
  });

  it('covers the page, in front, and is shown', () => {
    const p = boot();
    const panel = p.show();
    expect(panel).toBe(p.panel());
    expect(panel.className).toContain('fixed inset-0');
    expect(panel.style.display).toBe('flex');
    expect(panel.parentElement).toBe(p.d.body);
  });

  it('holds the public address and the RealPlus address in read-only boxes', () => {
    const p = boot();
    p.show({ publicUrl: 'https://www.mallan.nyc/listing/a/b', realPlusUrl: 'https://realplus.example/x' });
    expect(p.input('PublicUrlInput').value).toBe('https://www.mallan.nyc/listing/a/b');
    expect(p.input('RealPlusUrlInput').value).toBe('https://realplus.example/x');
    expect(p.input('PublicUrlInput').readOnly).toBe(true);
    expect(p.input('RealPlusUrlInput').readOnly).toBe(true);
    expect(p.input('PublicUrlInput').type).toBe('text');
  });

  it('labels the two boxes', () => {
    const p = boot();
    p.show();
    const labels = [...p.panel()!.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels).toEqual(['Public URL', 'RealPlus URL']);
  });

  it('shows an address the server did not give as an empty box', () => {
    const p = boot();
    p.show({ publicUrl: null, realPlusUrl: undefined });
    expect(p.input('PublicUrlInput').value).toBe('');
    expect(p.input('RealPlusUrlInput').value).toBe('');
  });

  it('is built again, not added to, when it is shown again', () => {
    const p = boot();
    p.show({ listingId: 'RL-1' });
    p.show({ listingId: 'RL-2' });
    expect(p.d.querySelectorAll('#rentalPublishUrlPanel')).toHaveLength(1);
    expect(p.d.querySelectorAll('#rentalPublicUrlInput')).toHaveLength(1);
    expect(p.panel()!.querySelector('strong')!.textContent).toBe('RL-2');
  });

  it('uses the prefix it is given for every id', () => {
    const p = boot();
    p.show({ prefix: 'sale' });
    expect(p.d.getElementById('salePublishUrlPanel')).not.toBeNull();
    expect(p.d.getElementById('salePublicUrlInput')).not.toBeNull();
    expect(p.d.getElementById('saleRealPlusUrlInput')).not.toBeNull();
    expect(p.panel()).toBeNull();
  });

  it('puts the listing id, the addresses and the markup in them as text', () => {
    const p = boot();
    p.show({ listingId: '<img src=x onerror=window.__pwned=1>', publicUrl: '"><img src=x onerror=window.__pwned=1>', realPlusUrl: "' onfocus='window.__pwned=1" });
    expect(p.panel()!.querySelectorAll('img')).toHaveLength(0);
    expect(p.panel()!.querySelector('strong')!.textContent).toBe('<img src=x onerror=window.__pwned=1>');
    expect(p.input('PublicUrlInput').value).toBe('"><img src=x onerror=window.__pwned=1>');
    expect(p.input('RealPlusUrlInput').value).toBe("' onfocus='window.__pwned=1");
    expect((p.w as any).__pwned).toBeUndefined();
  });
});

describe('View Listing', () => {
  it('is a link to the public address that opens in a new tab and gives the page nothing', () => {
    const p = boot();
    p.show();
    const link = p.panel()!.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://www.mallan.nyc/listing/333-e-46th-st/rl-12');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toContain('View Listing');
  });

  it.each([
    ['an address on this site', '/listing/a/b', '/listing/a/b'],
    ['an address with blanks around it', '  https://www.mallan.nyc/listing/a/b  ', 'https://www.mallan.nyc/listing/a/b'],
    ['an http address', 'http://www.mallan.nyc/listing/a/b', 'http://www.mallan.nyc/listing/a/b'],
  ])('is made for %s', (_name, address, href) => {
    const p = boot();
    p.show({ publicUrl: address });
    expect((p.panel()!.querySelector('a') as HTMLAnchorElement).getAttribute('href')).toBe(href);
  });

  it.each([
    ['a script address', 'javascript:window.__pwned=1'],
    ['a data address', 'data:text/html,<script>1</script>'],
    ['a protocol-relative address', '//evil.example/x'],
    ['no address', ''],
    ['nothing', null],
    ['a number', 12],
    ['an object', { href: 'https://x.example' }],
  ])('is not made for %s', (_name, address) => {
    const p = boot();
    p.show({ publicUrl: address });
    expect(p.panel()!.querySelector('a')).toBeNull();
  });

  it('is not made from the RealPlus address when the public one is not an address', () => {
    const p = boot();
    p.show({ publicUrl: null, realPlusUrl: 'https://www.mallan.nyc/listing/a/b' });
    expect(p.panel()!.querySelector('a')).toBeNull();
  });
});

describe('Copy', () => {
  it('copies the public address and says so', async () => {
    const p = boot();
    p.show({ publicUrl: 'https://www.mallan.nyc/listing/a/b' });
    const copy = p.panel()!.querySelectorAll('button')[0] as HTMLButtonElement;
    expect(copy.textContent).toContain('Copy');
    copy.click();
    await p.flush();
    expect(p.copied).toEqual(['https://www.mallan.nyc/listing/a/b']);
    expect(p.toasts).toEqual([['Public URL copied', 'success']]);
  });

  it('copies the RealPlus address and says so', async () => {
    const p = boot();
    p.show({ realPlusUrl: 'https://realplus.example/x' });
    (p.panel()!.querySelectorAll('button')[1] as HTMLButtonElement).click();
    await p.flush();
    expect(p.copied).toEqual(['https://realplus.example/x']);
    expect(p.toasts).toEqual([['RealPlus URL copied', 'success']]);
  });

  it('copies what is in the box now', async () => {
    const p = boot();
    p.show();
    p.input('PublicUrlInput').value = 'https://www.mallan.nyc/listing/changed';
    (p.panel()!.querySelectorAll('button')[0] as HTMLButtonElement).click();
    await p.flush();
    expect(p.copied).toEqual(['https://www.mallan.nyc/listing/changed']);
  });

  it.each([['refuses', 'refuses'], ['throws', 'throws'], ['none', 'none']] as const)('where the clipboard %s, selects the address and says to press Ctrl+C (not that it was copied)', async (_name, mode) => {
    const p = boot({ clipboard: mode });
    p.show();
    const box = p.input('PublicUrlInput');
    (p.panel()!.querySelectorAll('button')[0] as HTMLButtonElement).click();
    await p.flush();
    expect(p.copied).toEqual([]);
    expect(p.toasts).toHaveLength(1);
    expect(p.toasts[0][1]).toBe('warning');
    expect(p.toasts[0][0]).toMatch(/press Ctrl\+C/);
    expect(p.d.activeElement).toBe(box);
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe(box.value.length);
  });
});

describe('the other buttons', () => {
  it('Close takes the panel away and goes nowhere', () => {
    const p = boot();
    p.show();
    p.button(/Close/).click();
    expect(p.panel()).toBeNull();
    expect(p.went).toEqual([]);
  });

  it('Go to Dashboard takes the panel away and goes to the listings of the dashboard', () => {
    const p = boot();
    p.show();
    p.button(/Go to Dashboard/).click();
    expect(p.panel()).toBeNull();
    expect(p.went).toEqual(['/crm/dashboard#/ops/listings']);
  });

  it('has no Go to Dashboard when it is not told where the dashboard is', () => {
    const p = boot();
    p.show({ dashboardUrl: undefined });
    expect(p.button(/Go to Dashboard/)).toBeUndefined();
    expect(p.button(/Close/)).toBeDefined();
  });

  it('goes by changing the page\'s location when it is not given a way to', () => {
    const p = boot();
    p.show({ navigate: undefined, dashboardUrl: '#stay' });
    p.button(/Go to Dashboard/).click();
    expect(p.w.location.hash).toBe('#stay');
  });
});

describe('toasts', () => {
  it('a panel shown with no toast function still copies', async () => {
    const p = boot();
    p.show({ toast: undefined });
    (p.panel()!.querySelectorAll('button')[0] as HTMLButtonElement).click();
    await p.flush();
    expect(p.copied).toHaveLength(1);
  });
});

describe('webAddress', () => {
  it.each([
    ['https://a.example/x', 'https://a.example/x'], [' /listing/a ', '/listing/a'], ['HTTP://A.EXAMPLE', 'HTTP://A.EXAMPLE'],
    ['//a.example', ''], ['javascript:1', ''], ['ftp://a.example', ''], ['', ''], ['   ', ''], [null, ''], [undefined, ''], [5, ''],
  ])('%j is %j', (value, expected) => {
    const p = boot();
    expect(p.w.MallanListingPublished.webAddress(value)).toBe(expected);
  });
});
