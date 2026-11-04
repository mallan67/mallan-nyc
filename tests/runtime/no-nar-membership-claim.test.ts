/// <reference types="jest" />
/**
 * Mallan Real Estate Inc. works with REBNY (RLS participant). It has no membership of, or association
 * with, the National Association of Realtors (NAR) — owner statement, Maya Allan, 2026-11-03.
 *
 * Two places on the public site said otherwise, in text that search engines and AI systems read as fact:
 *   - public/llms.txt, "Memberships": "NAR (National Association of Realtors) — REALTOR designation"
 *   - app/layout.tsx, the organization JSON-LD printed on every page: memberOf -> "National Association of Realtors (NAR)"
 * (Captured on production 2026-11-04: the JSON-LD entry is in the HTML of every page checked.)
 *
 * What these tests prove: those two sources no longer assert an NAR membership or REALTOR designation, and
 * they still assert the REBNY membership. What they do not prove: what is on the live site (that is probed on
 * the preview and on production after release), or that other claims in llms.txt are true.
 * Other mentions of NAR on the site that are not membership claims are outside this test on purpose; they
 * are listed in the pull request for Maya to decide.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const NAR_CLAIM = /National Association of Realtors|\bNAR\b|REALTOR(®|\s+designation|\s+member)/i;

describe('public/llms.txt makes no NAR claim', () => {
  const txt = read('public/llms.txt');

  it('does not name NAR or a REALTOR designation anywhere', () => {
    expect(txt.match(NAR_CLAIM)).toBeNull();
  });

  it('still lists the REBNY membership', () => {
    const memberships = txt.split(/^## /m).find((s) => s.startsWith('Memberships')) ?? '';
    expect(memberships).toMatch(/REBNY \(Real Estate Board of New York\)/);
  });
});

describe('the organization JSON-LD in app/layout.tsx makes no NAR claim', () => {
  const src = read('app/layout.tsx');
  // The memberOf array is the only place the layout lists memberships. If its shape changes this test
  // fails loudly instead of passing on a missing block.
  const block = src.match(/memberOf:\s*\[([\s\S]*?)\n\s*\],/);

  it('has a memberOf list to check', () => {
    expect(block).not.toBeNull();
  });

  it('lists REBNY and not NAR', () => {
    const list = block?.[1] ?? '';
    expect(list).toContain('Real Estate Board of New York (REBNY)');
    expect(list.match(NAR_CLAIM)).toBeNull();
  });

  it('does not name the National Association of Realtors anywhere in the file', () => {
    expect(src).not.toMatch(/National Association of Realtors/i);
  });
});
