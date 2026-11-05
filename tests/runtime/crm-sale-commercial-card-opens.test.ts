/// <reference types="jest" />
/**
 * Maya, 2026-11-04. Walking the Sale form in a REAL browser (not the simulated one the other tests use) found that the Commercial card can never be opened:
 * its header started WITHOUT the `collapsed` class while its body started hidden (an inline display:none). toggleFormSection flips the header's class and the
 * body's inline style together, so on every click the CSS rule `.section-collapse.collapsed + .section-body { display: none }` and the inline style agreed on
 * "hidden". The click still selected the Commercial type (which is how SL-0010 became Commercial), but the card holding Commercial Condo / Condop / Co-op and
 * the office, medical and retail choices stayed shut, so an agent could not set them: SL-0010 is saved as Commercial with its ownership and commercial
 * sub-type EMPTY.
 *
 * The other tests click the inputs directly, which works whether or not the card is open, so they could not see this. These ones go through the header, the
 * way a person does, and ask whether the choices are in view (no ancestor hidden, by inline style or by the stylesheet).
 */
import { bootAddForm, sleep, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);

const CARD = '#saleCommercialMasterSection';
const header = (f: BootedForm) => f.d.querySelector(`${CARD} .section-collapse`) as HTMLElement;
const body = (f: BootedForm) => f.d.querySelector(`${CARD} .section-body`) as HTMLElement;
const condoLabel = (f: BootedForm) => (f.d.querySelector('input[name="saleCommercialOwnership"][value="CommercialCondo"]') as HTMLElement).closest('label') as HTMLElement;

/** In view: no element from it up to <body> is display:none, whether by inline style or by a stylesheet rule. */
const hiddenNow = (f: BootedForm, e: Element) => {
  if ((e as HTMLElement).style.display === 'none' || e.classList.contains('hidden')) return true;
  // jsdom's selector engine throws on one unusual Tailwind selector in the page's stylesheet for some inner elements; for those the inline style and the `hidden` class above are what hides them
  try { return f.w.getComputedStyle(e).display === 'none'; } catch { return false; }
};
const inView = (f: BootedForm, el: Element) => {
  for (let e: Element | null = el; e && e !== f.d.body; e = e.parentElement) {
    if (hiddenNow(f, e)) return false;
  }
  return true;
};

describe('the Commercial card opens when its header is clicked', () => {
  it('starts closed, and the header says so (its state and its body agree)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    try {
      expect(inView(f, body(f))).toBe(false);
      expect(header(f).classList.contains('collapsed')).toBe(true);                    // a header that is not "collapsed" over a hidden body is what made every click a no-op
    } finally { f.close(); }
  });

  it('one click on the header puts the ownership and office choices in view, and selects the Commercial type', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    try {
      header(f).click();
      await sleep(100);
      expect(inView(f, body(f))).toBe(true);
      expect(inView(f, condoLabel(f))).toBe(true);
      expect((f.d.querySelector('input[name="salePropertyType"]:checked') as HTMLInputElement).value).toBe('Commercial');
    } finally { f.close(); }
  });

  it('a second click closes it and a third opens it again', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    try {
      header(f).click(); await sleep(50);
      expect(inView(f, body(f))).toBe(true);
      header(f).click(); await sleep(50);
      expect(inView(f, body(f))).toBe(false);
      header(f).click(); await sleep(50);
      expect(inView(f, body(f))).toBe(true);
    } finally { f.close(); }
  });

  it('every accordion card on the form agrees with its body: a header that starts open has an open body, one that starts closed has a hidden one', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400 });
    try {
      const cards = [...f.d.querySelectorAll('.section-collapse')] as HTMLElement[];
      expect(cards.length).toBeGreaterThan(0);
      for (const h of cards) {
        const b = h.nextElementSibling as HTMLElement;
        if (!b || !b.classList.contains('section-body')) continue;
        const bodyHidden = b.style.display === 'none';
        expect([h.id || h.textContent!.trim().replace(/\s+/g, ' ').slice(0, 30), h.classList.contains('collapsed')]).toEqual([h.id || h.textContent!.trim().replace(/\s+/g, ' ').slice(0, 30), bodyHidden]);
      }
    } finally { f.close(); }
  });
});
