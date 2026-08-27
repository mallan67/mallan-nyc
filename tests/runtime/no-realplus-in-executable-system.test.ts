/// <reference types="jest" />
/**
 * COTALITY IS THE ONLY PROVIDER AUTHORITY. REALPLUS IS NOT PART OF THIS
 * ARCHITECTURE.
 *
 * The drift was executable, not merely documentary. `buildListingUrls` returned
 * a `realPlusUrl` that was implemented as:
 *
 *     const realPlusUrl = isActive ? publicUrl : null;
 *
 * — Mallan's OWN canonical public URL, under a foreign provider's name. It
 * travelled through three CRM write DTOs and was rendered in the sale form as a
 * labelled "RealPlus URL" panel with its own copy button, so a broker was being
 * handed a Mallan URL and told it was a provider one.
 *
 * That is wrong twice: the name is forbidden by the Cotality-only rule, AND it
 * described the wrong thing.
 *
 * IT IS NOT RENAMED TO A COTALITY URL. No verified Cotality URL is represented
 * by that value. It is Mallan's public canonical URL, so it is called
 * publicUrl — and the one real behaviour the old field carried (expose the URL
 * only while the listing is live) survives as `publicActiveUrl`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY KEPT.
 *
 * Comments describing the EXTERNAL business workflow — Mallan enters a listing
 * into RealPlus, RealPlus submits it to REBNY RLS, and the listing returns to
 * Mallan as a provider return-copy — are accurate and load-bearing. They are
 * why `trestleExcludeMallanReturnCopiesClause` exists at all. Deleting them
 * would remove the explanation for real suppression logic.
 *
 * The rule is that RealPlus may not appear in an EXECUTABLE contract. It may
 * appear in prose describing a system outside this repo.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const REPO = resolve(__dirname, '../..');

/** Source with comment lines removed — prose is not an executable reference. */
function executableOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const PATTERN = /realplus|real_plus/i;

describe('no executable RealPlus reference survives', () => {
  it.each([
    ['lib', ['.ts', '.tsx']],
    ['app', ['.ts', '.tsx']],
  ])('%s has none', (dir, exts) => {
    const offenders = walk(join(REPO, dir), exts as string[])
      .filter((f) => PATTERN.test(executableOnly(readFileSync(f, 'utf8'))))
      .map((f) => f.replace(REPO, '').replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('the served CRM artifact has none at all', () => {
    // The built shell is what actually reaches a broker's browser.
    const built = readFileSync(join(REPO, 'public/crm/index-built.html'), 'utf8');
    expect(PATTERN.test(built)).toBe(false);
  });

  it('neither intake form renders a RealPlus panel', () => {
    for (const form of ['SALE-FORM-REDESIGN.html', 'RENTAL-FORM-REDESIGN.html']) {
      const src = readFileSync(join(REPO, 'public/crm', form), 'utf8');
      expect(executableOnly(src)).not.toMatch(/realPlusUrl/);
      expect(src).not.toMatch(/>RealPlus URL</);
      expect(src).not.toMatch(/saleRealPlusUrlInput/);
    }
  });
});

describe('the replacement is honest about what the value is', () => {
  const urls = readFileSync(join(REPO, 'lib/crm/listing-urls.ts'), 'utf8');

  it('buildListingUrls returns publicUrl and publicActiveUrl', () => {
    expect(executableOnly(urls)).toMatch(/publicUrl: string \| null;/);
    expect(executableOnly(urls)).toMatch(/publicActiveUrl: string \| null;/);
  });

  it('it is NOT renamed to a Cotality URL', () => {
    // There is no verified Cotality URL behind this value. Swapping one
    // provider fiction for another would be the same defect in new clothes.
    expect(executableOnly(urls)).not.toMatch(/cotalityUrl/i);
    expect(executableOnly(urls)).not.toMatch(/providerUrl/i);
  });

  it('the live-only behaviour the old field carried is preserved', () => {
    expect(executableOnly(urls)).toMatch(/const publicActiveUrl = isActive \? publicUrl : null;/);
  });
});

describe('external-workflow prose is deliberately retained', () => {
  it.each([
    'lib/listings/mallan-source-identity.ts',
    'lib/listings/dedupe-crm-vs-idx.ts',
  ])('%s still explains why a return-copy exists', (file) => {
    // These describe a system OUTSIDE this repo and are why the return-copy
    // suppression exists. Removing them would delete the reasoning behind real
    // executable logic — which is a different and worse kind of drift.
    const src = readFileSync(join(REPO, file), 'utf8');
    expect(src).toMatch(/RealPlus/);
    // ...but only in prose.
    expect(executableOnly(src)).not.toMatch(PATTERN);
  });
});
