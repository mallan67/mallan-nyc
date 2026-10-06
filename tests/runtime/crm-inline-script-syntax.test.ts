/// <reference types="jest" />
/**
 * Every classic inline <script> in the standalone CRM forms must at least parse. One unterminated string
 * literal turns the whole block into a SyntaxError, which silently disables it (the Buyer and Tenant auth
 * gates were dead this way from 2026-04-09). Blocks are split exactly as an HTML parser splits them: the
 * FIRST </script> closes a block, even inside a string literal.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Script } from 'vm';

const FORMS = ['SALE-FORM-REDESIGN', 'RENTAL-FORM-REDESIGN', 'SALE-FORM-WITH-TOOLS', 'RENTAL-FORM-WITH-TOOLS', 'BUYER-DEAL-FORM', 'TENANT-DEAL-FORM'];

function inlineScripts(html: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    if (/type\s*=\s*["']?(application\/(ld\+)?json|text\/template|text\/x-)/i.test(m[1])) continue;
    out.push({ line: html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length, body: m[2] });
  }
  return out;
}

describe.each(FORMS)('%s inline scripts', (name) => {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${name}.html`), 'utf8');
  const scripts = inlineScripts(html);

  it('has inline scripts to check', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(scripts.map((s) => [s.line, s.body] as const))('block at line %i parses', (_line, body) => {
    expect(() => new Script(body)).not.toThrow();
  });
});
