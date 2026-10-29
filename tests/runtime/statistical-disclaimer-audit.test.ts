/// <reference types="jest" />
/**
 * scripts/audit-statistical-disclaimer.ts (the pr-check step `audit:stat-disclaimer`) finds a page or component that renders aggregate statistics and carries no REBNY disclaimer.
 *
 * It reads each component's SOURCE for the phrase "Based on information from the REBNY Listing Service". Two surfaces print the disclaimer that ARRIVES WITH THEIR DATA instead of typing it:
 * the listing page's market card and the market page print /api/market's `_compliance.disclaimer`, which carries the period the statistics cover (lib/compliance/rls-statistical-disclaimer.ts
 * builds it). The script failed both in CI on 2026-10-09 (they had typed "for the period currently available" before, which satisfied it, and said no period), so it now also accepts a
 * surface that prints a disclaimer that arrives with its data. The wording and the dates are held by rls-statistical-disclaimer.test.ts and market-statistical-disclaimer.test.ts.
 *
 * The script is a command, not a module, so its pattern is read out of its source and run here.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8');
const script = read('scripts/audit-statistical-disclaimer.ts');

/** The regular expression the script holds under `const <name> = /.../flags;` */
function pattern(name: string): RegExp {
  const line = script.split('\n').find((l) => l.startsWith(`const ${name} = `));
  if (!line) throw new Error(`the audit script has no ${name}`);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${line.slice(line.indexOf('= ') + 2).replace(/;\s*$/, '')}`)() as RegExp;
}

describe('scripts/audit-statistical-disclaimer.ts', () => {
  it('accepts a surface that prints the disclaimer that arrives with its data: the market card, the market page, and one built with the module', () => {
    const fromData = pattern('DISCLAIMER_FROM_DATA');
    expect(fromData.test(read('app/components/MarketSnapshot.tsx'))).toBe(true);
    expect(fromData.test(read('app/market/MarketReportContent.tsx'))).toBe(true);
    expect(fromData.test('const text = rlsStatisticalDisclaimer(start, end);')).toBe(true);
  });

  it('does not accept a surface that merely mentions a disclaimer', () => {
    const fromData = pattern('DISCLAIMER_FROM_DATA');
    for (const source of ['// the disclaimer goes here', 'const disclaimer = "";', 'export const x = 1;', 'props.disclaimerText', 'const compliance = { notice: "" };']) {
      expect({ source, accepted: fromData.test(source) }).toEqual({ source, accepted: false });
    }
  });

  it('counts such a surface as carrying a disclaimer in its decision', () => {
    expect(script).toMatch(/const usesDisclaimerComp = DISCLAIMER_VIA_COMPONENT\.test\(content\) \|\| DISCLAIMER_FROM_DATA\.test\(content\);/);
  });

  it('still finds a surface that renders statistics with no disclaimer of any kind', () => {
    const statsTokens = /\bmedianPrice\b/;
    const noDisclaimer = 'export default function Stats({ d }: { d: any }) { return <div>{d.medianPrice} {d.avgPrice}</div>; }';
    expect(statsTokens.test(noDisclaimer)).toBe(true);
    for (const name of ['DISCLAIMER_PERIOD', 'DISCLAIMER_GENERIC', 'DISCLAIMER_VIA_COMPONENT', 'DISCLAIMER_FROM_DATA']) expect({ name, accepted: pattern(name).test(noDisclaimer) }).toEqual({ name, accepted: false });
  });
});
