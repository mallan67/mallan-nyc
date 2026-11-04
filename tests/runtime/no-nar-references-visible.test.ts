/// <reference types="jest" />
/**
 * No NAR reference where a visitor, an agent or a client reads it (Maya, 2026-11-04: "please remove nar references... i am only rebny member").
 *
 * Mallan Real Estate Inc. is a REBNY member and has no membership of, or association with, the National Association of Realtors. The organization JSON-LD and public/llms.txt are held by
 * their own change (#691); this holds the rest of what is read: the public sell and building pages (Realtor.com was labelled "Official NAR site / portal / site of the NAR", and the
 * commission sentence cited the NAR settlement), the Commission Negotiability Disclosure label of the rental and buyer forms (the Sale forms no longer have it, #686), the message an agent gets when a removed compensation field is sent, and
 * the note in the buyer closing-cost tool. Comments are internal and are not read, so they are not held here. Realtor.com stays: it is a portal a listing appears on, not a membership claim.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** what is read or run: the file without its comments (HTML, block and line comments; a // inside a URL is kept) */
const readable = (p: string) => read(p).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const NAR = /\bNAR\b|National Association of Realtors|REALTOR(®|&reg;)/i;

describe('the public pages name no NAR', () => {
  it.each(['app/sell/page.tsx', 'app/sell/townhouses/upper-west-side/page.tsx', 'app/buildings/[slug]/page.tsx'])('%s', (page) => {
    expect(readable(page)).not.toMatch(NAR);
  });

  it('Realtor.com stays as a portal the listing reaches, described by what it is', () => {
    expect(read('app/sell/page.tsx')).toContain('Realtor.com &mdash; nationwide home search');
    expect(read('app/sell/townhouses/upper-west-side/page.tsx')).toContain("{ name: 'Realtor.com', detail: 'Nationwide home search' }");
    expect(read('app/buildings/[slug]/page.tsx')).toContain("{ name: 'Realtor.com', detail: 'Nationwide home search' }");
  });

  it('the sell page says commissions are negotiable in the words REBNY\'s UCBA requires, with no NAR', () => {
    const text = read('app/sell/page.tsx').replace(/\s+/g, ' ');
    expect(text).toContain('Broker commissions are not set by law and are fully negotiable between brokers and their clients.');
    expect(text).toContain('Compensation is not fixed by any industry standard.');
  });
});

describe('the rental and buyer forms name no NAR, and say what the box is', () => {
  // The two Sale forms are not listed here on purpose: the Sale form no longer asks for this confirmation at all (#686 removes the block), so there is no label left to hold, and listing
  // them would make this test depend on which of #686 and this change reaches main first.
  it.each(['public/crm/RENTAL-FORM-REDESIGN.html', 'public/crm/RENTAL-FORM-WITH-TOOLS.html', 'public/crm/BUYER-DEAL-FORM.html'])('%s', (form) => {
    expect(readable(form)).not.toMatch(NAR);
    // UCBA Art. I Sec. 17 requires the statement in the agreement or its accompanying disclosure; it does not require a box in Mallan's CRM, so the label must not say the box is "required per" the UCBA.
    expect(read(form)).toContain("(UCBA Art. I, Sec. 17 requires this statement in the agreement or its accompanying disclosure. This box is Mallan's own confirmation that it is there.)");
    expect(read(form)).not.toContain('(Required per REBNY UCBA 2026');
  });
});

describe('the messages and notes an agent or a client reads name no NAR', () => {
  it('the message for a removed compensation field cites the UCBA, not NAR', () => {
    const src = readable('lib/compliance/rls-enforcement.ts');
    expect(src).not.toMatch(NAR);
    expect(src).toContain('was removed from the REBNY RLS (UCBA Art. IV Sec. 2: offers of compensation are not collected or displayed). Remove from payload.');
  });

  it('the buyer closing-cost note cites REBNY\'s UCBA, not NAR', () => {
    const src = readable('public/crm/js/dashboard/panels/tools/buyer-closing-costs.js');
    expect(src).not.toMatch(NAR);
    expect(src).toContain('fully negotiable and not set by law (REBNY UCBA 2026).');
  });
});
